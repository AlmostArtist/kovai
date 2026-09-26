import type { AIModel, Capability, ProviderId } from './types'

/**
 * The model router.
 *
 * A workspace says what it needs — "chat", "chat with an image", "an image" —
 * and the router resolves that to a concrete provider and model, honouring the
 * privacy mode. Capability checking happens here, once, rather than being
 * re-implemented in every workspace.
 */

export type PrivacyMode = 'PRIVATE' | 'ONLINE'

export type TaskKind = 'chat' | 'vision' | 'image' | 'video' | 'embeddings'

export interface RouteRequest {
  task: TaskKind
  privacy: PrivacyMode
  /** An explicit user choice always wins, as long as it can do the job. */
  preferred?: { providerId: ProviderId; modelId: string } | null
  /** Coarse intent from the "Auto / Fast / Reasoning …" selector. */
  intent?: 'auto' | 'fast' | 'reasoning' | 'vision' | 'coding' | 'creative'
  available: AIModel[]
}

export type RouteResult =
  | {
      ok: true
      providerId: ProviderId
      model: AIModel
      /** True when the router moved off the user's explicit choice. */
      substituted: boolean
      reason?: string
    }
  | { ok: false; code: RouteFailure; message: string; action?: RouteAction }

export type RouteFailure =
  | 'NO_LOCAL_MODEL'
  | 'NO_VISION_MODEL'
  | 'NO_IMAGE_PROVIDER'
  | 'NO_MODEL'
  | 'PRIVACY_BLOCKED'

export type RouteAction =
  | { kind: 'START_RUNTIME' }
  | { kind: 'CONNECT_PROVIDER'; providerId: ProviderId }
  | { kind: 'SWITCH_ONLINE' }

const TASK_CAPABILITY: Record<TaskKind, Capability> = {
  chat: 'CHAT',
  vision: 'VISION',
  image: 'IMAGE_GENERATION',
  video: 'VIDEO_GENERATION',
  embeddings: 'EMBEDDINGS',
}

/** Text-shaped work that PRIVATE mode keeps on the machine. */
const TEXT_TASKS = new Set<TaskKind>(['chat', 'vision', 'embeddings'])

export function routeModel(req: RouteRequest): RouteResult {
  const capability = TASK_CAPABILITY[req.task]
  const capable = req.available.filter((m) => m.capabilities.includes(capability))

  // PRIVATE mode is a hard boundary for anything that carries the user's
  // content as text or images into a model. It is never silently crossed.
  const privateTextTask = req.privacy === 'PRIVATE' && TEXT_TASKS.has(req.task)
  const pool = privateTextTask ? capable.filter((m) => m.providerId === 'local') : capable

  if (req.preferred) {
    const match = pool.find(
      (m) => m.providerId === req.preferred!.providerId && m.id === req.preferred!.modelId,
    )
    if (match) return { ok: true, providerId: match.providerId, model: match, substituted: false }

    // The chosen model exists but cannot do this job, or is blocked by privacy.
    const blockedByPrivacy =
      privateTextTask && req.preferred.providerId !== 'local'
    if (blockedByPrivacy) {
      const fallback = pickBest(pool, req.intent)
      if (fallback) {
        return {
          ok: true,
          providerId: fallback.providerId,
          model: fallback,
          substituted: true,
          reason: `Private mode — used ${fallback.name} on this machine instead of a cloud model.`,
        }
      }
      return {
        ok: false,
        code: 'PRIVACY_BLOCKED',
        message:
          req.task === 'vision'
            ? 'Private mode is on and no local vision model is installed.'
            : 'Private mode is on and no local model is installed.',
        action: { kind: 'START_RUNTIME' },
      }
    }
  }

  const best = pickBest(pool, req.intent)
  if (best) {
    return {
      ok: true,
      providerId: best.providerId,
      model: best,
      substituted: Boolean(req.preferred),
      reason: req.preferred ? `${req.preferred.modelId} can't handle this, used ${best.name}.` : undefined,
    }
  }

  return { ok: false, ...describeFailure(req.task, req.privacy) }
}

function describeFailure(
  task: TaskKind,
  privacy: PrivacyMode,
): { code: RouteFailure; message: string; action?: RouteAction } {
  if (task === 'image' || task === 'video') {
    return {
      code: 'NO_IMAGE_PROVIDER',
      message:
        task === 'video'
          ? 'No connected provider can generate video.'
          : 'No connected provider can generate images.',
      action: { kind: 'CONNECT_PROVIDER', providerId: task === 'video' ? 'kie' : 'higgsfield' },
    }
  }
  if (privacy === 'PRIVATE') {
    return {
      code: task === 'vision' ? 'NO_VISION_MODEL' : 'NO_LOCAL_MODEL',
      message:
        task === 'vision'
          ? 'No local vision model is available.'
          : 'No local model is available.',
      action: { kind: 'START_RUNTIME' },
    }
  }
  return {
    code: 'NO_MODEL',
    message: 'No model is available for this task.',
    action: { kind: 'CONNECT_PROVIDER', providerId: 'openrouter' },
  }
}

/**
 * Scoring is deliberately simple and legible: intent match first, then a small
 * preference for local (free, private) and for models the provider marked as
 * defaults. Nothing here is magic, and the chosen model is always shown.
 */
function pickBest(pool: AIModel[], intent: RouteRequest['intent']): AIModel | undefined {
  if (!pool.length) return undefined
  const wanted = intent && intent !== 'auto' ? intent : null

  return [...pool].sort((a, b) => score(b) - score(a))[0]

  function score(m: AIModel): number {
    let s = 0
    if (wanted && m.tags?.includes(wanted)) s += 100
    if (m.tags?.includes('default')) s += 20
    if (m.providerId === 'local') s += 10
    // Prefer larger context when everything else ties.
    s += Math.min((m.contextLength ?? 0) / 100_000, 5)
    return s
  }
}

/** Human-readable routing summary shown under the composer. */
export function describeRoute(result: RouteResult): string {
  if (!result.ok) return result.message
  return result.providerId === 'local'
    ? `Local · ${result.model.name}`
    : `${result.providerId === 'openrouter' ? 'OpenRouter' : result.providerId} · ${result.model.name}`
}
