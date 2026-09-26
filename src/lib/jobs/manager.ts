import 'server-only'

import { randomUUID } from 'node:crypto'
import { getImageProvider } from '../providers/registry'
import { ProviderError, toProviderError } from '../providers/types'
import { store } from '../db'
import type {
  GenerationJob,
  GenerationRequest,
  JobPhase,
  ProviderId,
  SerializedProviderError,
} from '../providers/types'

/**
 * Generation job manager.
 *
 * Cloud generation is asynchronous and can take minutes, so nothing about it is
 * tied to the request that started it. A job is created, polled in the
 * background with backoff, persisted at each transition, and its outputs are
 * filed into the asset library on completion. The user can close the tab,
 * navigate away or reload — the work continues and the Activity Center picks it
 * back up.
 */

interface ManagerState {
  jobs: Map<string, GenerationJob>
  timers: Map<string, NodeJS.Timeout>
  hydrated: boolean
}

// Survive Next.js dev hot-reloads, which would otherwise orphan running jobs.
const globalRef = globalThis as typeof globalThis & { __kovaiJobs?: ManagerState }
const state: ManagerState = (globalRef.__kovaiJobs ??= {
  jobs: new Map(),
  timers: new Map(),
  hydrated: false,
})

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

/** Poll cadence: responsive at first, then backing off to be a good citizen. */
function pollDelay(elapsedMs: number): number {
  if (elapsedMs < 15_000) return 1_500
  if (elapsedMs < 60_000) return 3_000
  if (elapsedMs < 5 * 60_000) return 5_000
  return 10_000
}

const MAX_JOB_AGE_MS = 30 * 60_000

export interface SerializedJob extends Omit<GenerationJob, 'error'> {
  error?: SerializedProviderError
}

export function serializeJob(job: GenerationJob): SerializedJob {
  // A job restored from the database carries its error as plain JSON rather
  // than a ProviderError, so this cannot assume `toJSON` exists — the whole
  // activity list used to 502 on one such job, hiding every other job with it.
  const error =
    job.error instanceof ProviderError ? job.error.toJSON() : (job.error as SerializedProviderError | undefined)
  return { ...job, error }
}

/** Restore unfinished jobs after a restart so nothing is silently dropped. */
async function hydrate() {
  if (state.hydrated) return
  state.hydrated = true
  try {
    const db = await store()
    const persisted = await db.generations.list(50)
    for (const job of persisted) {
      if (state.jobs.has(job.id)) continue
      state.jobs.set(job.id, job)
      if (!TERMINAL.has(job.status)) {
        // A job left running by a restart is resumed if it is still young,
        // otherwise marked failed rather than left spinning forever.
        if (Date.now() - job.createdAt > MAX_JOB_AGE_MS) {
          await transition(job, {
            status: 'FAILED',
            error: new ProviderError({
              code: 'TIMEOUT',
              message: 'Generation was interrupted.',
              providerId: job.providerId,
              detail: 'The job did not finish before KOVAI restarted.',
            }),
          })
        } else if (job.externalId) {
          schedule(job.id, 1_000)
        }
      }
    }
  } catch {
    /* an unreadable history must not block new work */
  }
}

export async function createJob(input: {
  providerId: ProviderId
  request: GenerationRequest
  kind: GenerationJob['kind']
  tabId?: string
  projectId?: string
}): Promise<GenerationJob> {
  await hydrate()

  const now = Date.now()
  const job: GenerationJob = {
    id: randomUUID(),
    providerId: input.providerId,
    model: input.request.model,
    kind: input.kind,
    status: 'QUEUED',
    phase: 'PREPARING',
    progress: 0,
    prompt: input.request.prompt,
    params: input.request.params,
    referenceImages: input.request.referenceImages,
    outputs: [],
    createdAt: now,
    updatedAt: now,
    tabId: input.tabId,
    projectId: input.projectId,
  }
  state.jobs.set(job.id, job)
  void persist(job)

  // Submission happens off the request path: the client gets a job id
  // immediately and watches it, so the interface never blocks on a provider.
  void submit(job, input.request)

  return job
}

async function submit(job: GenerationJob, request: GenerationRequest) {
  try {
    const provider = getImageProvider(job.providerId)
    const { externalId, status, costUsd } = await provider.generate(request)
    await transition(job, {
      externalId,
      status: status === 'COMPLETED' ? 'RUNNING' : status,
      phase: 'GENERATING',
      costUsd,
      progress: Math.max(job.progress, 5),
    })
    schedule(job.id, 1_500)
  } catch (err) {
    await transition(job, {
      status: 'FAILED',
      phase: 'DONE',
      error: toProviderError(err, job.providerId),
    })
  }
}

function schedule(jobId: string, delay: number) {
  clearTimeout(state.timers.get(jobId))
  const timer = setTimeout(() => void poll(jobId), delay)
  // Never hold the process open for a poll.
  timer.unref?.()
  state.timers.set(jobId, timer)
}

async function poll(jobId: string) {
  const job = state.jobs.get(jobId)
  if (!job || TERMINAL.has(job.status) || !job.externalId) return

  if (Date.now() - job.createdAt > MAX_JOB_AGE_MS) {
    await transition(job, {
      status: 'FAILED',
      phase: 'DONE',
      error: new ProviderError({
        code: 'TIMEOUT',
        message: 'Generation timed out.',
        providerId: job.providerId,
        detail: 'The provider did not finish within 30 minutes.',
      }),
    })
    return
  }

  try {
    const provider = getImageProvider(job.providerId)
    const result = await provider.getStatus(job.externalId)

    if (result.status === 'COMPLETED') {
      await transition(job, {
        status: 'COMPLETED',
        phase: 'DONE',
        progress: 100,
        outputs: result.outputs ?? [],
        completedAt: Date.now(),
      })
      await fileOutputs(state.jobs.get(jobId)!)
      return
    }

    if (result.status === 'FAILED') {
      await transition(job, {
        status: 'FAILED',
        phase: 'DONE',
        error:
          result.error ??
          new ProviderError({
            code: 'PROVIDER_ERROR',
            message: 'Generation failed.',
            providerId: job.providerId,
          }),
      })
      return
    }

    // Providers that report no progress still get honest, monotonic motion
    // derived from elapsed time — it is an estimate, and it never reaches 100.
    const elapsed = Date.now() - job.createdAt
    const estimated = Math.min(92, 8 + (elapsed / 45_000) * 84)
    const progress = Math.max(job.progress, result.progress ?? estimated)

    await transition(job, {
      status: 'RUNNING',
      phase: phaseFor(progress),
      progress,
    })
    schedule(jobId, pollDelay(elapsed))
  } catch (err) {
    const error = toProviderError(err, job.providerId)
    // Transient network trouble should not kill a job that may still succeed.
    if (error.retryable && Date.now() - job.createdAt < MAX_JOB_AGE_MS) {
      schedule(jobId, 6_000)
      return
    }
    await transition(job, { status: 'FAILED', phase: 'DONE', error })
  }
}

function phaseFor(progress: number): JobPhase {
  if (progress < 10) return 'PREPARING'
  if (progress < 90) return 'GENERATING'
  return 'FINALIZING'
}

async function transition(job: GenerationJob, patch: Partial<GenerationJob>) {
  const next: GenerationJob = { ...job, ...patch, updatedAt: Date.now() }
  state.jobs.set(job.id, next)
  if (TERMINAL.has(next.status)) {
    clearTimeout(state.timers.get(job.id))
    state.timers.delete(job.id)
  }
  await persist(next)
}

async function persist(job: GenerationJob) {
  try {
    const db = await store()
    await db.generations.upsert(job)
  } catch {
    /* persistence is best-effort; the in-memory job remains authoritative */
  }
}

/** Completed outputs become first-class assets, with full provenance. */
async function fileOutputs(job: GenerationJob) {
  if (!job.outputs.length) return
  try {
    const db = await store()
    for (const [index, output] of job.outputs.entries()) {
      await db.assets.upsert({
        id: `${job.id}-${index}`,
        name: titleFromPrompt(job.prompt, index, job.outputs.length),
        kind: output.type,
        url: output.url,
        origin: 'generated',
        providerId: job.providerId,
        model: job.model,
        projectId: job.projectId,
        favorite: false,
        width: output.width,
        height: output.height,
        mimeType: output.mimeType,
        generation: {
          jobId: job.id,
          prompt: job.prompt,
          negativePrompt: job.params.negativePrompt as string | undefined,
          params: job.params,
          seed: output.seed ?? (job.params.seed as number | undefined),
          durationMs: (job.completedAt ?? Date.now()) - job.createdAt,
          costUsd: job.costUsd,
        },
        createdAt: Date.now(),
      })
    }

    await db.usage.record({
      id: randomUUID(),
      providerId: job.providerId,
      model: job.model,
      kind: job.kind === 'video' ? 'video' : 'image',
      images: job.outputs.length,
      costUsd: job.costUsd,
      // We only claim a cost when the provider gave us one.
      costUnknown: job.costUsd === undefined,
      projectId: job.projectId,
      createdAt: Date.now(),
    })
  } catch {
    /* the job still succeeded even if filing it failed */
  }
}

function titleFromPrompt(prompt: string, index: number, total: number): string {
  const words = prompt.trim().split(/\s+/).slice(0, 6).join(' ')
  const base = words || 'Untitled generation'
  return total > 1 ? `${base} (${index + 1})` : base
}

export async function getJob(id: string): Promise<GenerationJob | null> {
  await hydrate()
  return state.jobs.get(id) ?? null
}

export async function listJobs(limit = 50): Promise<GenerationJob[]> {
  await hydrate()
  return [...state.jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}

export async function cancelJob(id: string): Promise<GenerationJob | null> {
  const job = state.jobs.get(id)
  if (!job) return null
  if (TERMINAL.has(job.status)) return job

  clearTimeout(state.timers.get(id))
  state.timers.delete(id)

  if (job.externalId) {
    try {
      await getImageProvider(job.providerId).cancel(job.externalId)
    } catch {
      /* the provider may not support cancellation; we still stop tracking it */
    }
  }
  await transition(job, { status: 'CANCELLED', phase: 'DONE', completedAt: Date.now() })
  return state.jobs.get(id) ?? null
}
