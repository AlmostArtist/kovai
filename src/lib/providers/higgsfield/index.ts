import 'server-only'

import { fetchWithTimeout } from '../http'
import {
  HIGGSFIELD_MODELS,
  imageFields,
  requiresImages,
  specFor,
  toAIModel,
  type HiggsfieldField,
  type HiggsfieldWorkflow,
} from './catalogue'
import { errorFromResponse, ProviderError } from '../types'
import type {
  AIModel,
  GenerationOutput,
  GenerationRequest,
  ImageProvider,
  JobStatus,
  ProviderStatus,
} from '../types'

export { HIGGSFIELD_DESCRIPTOR } from '../descriptors'
import { HIGGSFIELD_DESCRIPTOR } from '../descriptors'

/**
 * Higgsfield.
 *
 * One asynchronous lifecycle covers every model: POST the workflow's endpoint,
 * get a `request_id` back, poll `/requests/{id}/status` until it reaches a
 * terminal state. The per-model differences are entirely in the request body,
 * and those bodies live in ./workflows.generated.ts.
 *
 * Two rules this adapter is built around, both from hard experience:
 *
 *  1. The API ignores fields it does not recognise. A wrong or invented key is
 *     accepted, does nothing, and still bills the generation. So the body is
 *     assembled strictly from the workflow's declared fields — a value with no
 *     matching field is dropped here rather than sent and silently ignored.
 *  2. A submission is not idempotent and has no idempotency key, so an
 *     ambiguous POST is never retried automatically.
 */

/** The API's own vocabulary, so the mapping below reads against the docs. */
type HiggsfieldStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw' | 'canceled'

interface RequestResponse {
  status?: HiggsfieldStatus
  request_id?: string
  status_url?: string
  cancel_url?: string
  error?: string | null
  images?: { url: string }[]
  video?: { url: string }
  audio?: { url: string }
  audios?: { url: string }[]
}

export class HiggsfieldProvider implements ImageProvider {
  descriptor = HIGGSFIELD_DESCRIPTOR

  private get base() {
    return (process.env.HF_API_BASE || 'https://api.higgsfield.ai').replace(/\/$/, '')
  }
  private get keyId() {
    return process.env.HF_API_KEY_ID?.trim() || ''
  }
  private get secret() {
    return process.env.HF_API_KEY_SECRET?.trim() || ''
  }

  get configured() {
    return Boolean(this.keyId && this.secret)
  }

  /** `Authorization: Key {id}:{secret}`, exactly as documented. */
  private headers(): Record<string, string> {
    return {
      Authorization: `Key ${this.keyId}:${this.secret}`,
      'Content-Type': 'application/json',
    }
  }

  private missingEnv() {
    return HIGGSFIELD_DESCRIPTOR.requiredEnv.filter((k) => !process.env[k]?.trim())
  }

  /**
   * Connection state, without spending anything.
   *
   * There is no free endpoint that proves a key: every documented POST starts a
   * paid generation. So this reports what is actually knowable — whether the
   * credentials are present — and says plainly that they are proven on first
   * use. Billing a generation to render a green dot is not a trade worth making.
   */
  async status(): Promise<ProviderStatus> {
    const missing = this.missingEnv()
    if (missing.length) return { state: 'UNCONFIGURED', missing }
    return {
      state: 'READY',
      detail: 'Configured — credentials are proven on the first generation.',
    }
  }

  /**
   * Higgsfield publishes no catalogue endpoint, so the model list is the one
   * synced from its docs by `npm run sync:higgsfield` rather than a live fetch
   * that cannot succeed.
   */
  async listModels(): Promise<AIModel[]> {
    if (!this.configured) return []
    return HIGGSFIELD_MODELS.map(toAIModel)
  }

  async generate(req: GenerationRequest) {
    this.assertConfigured()

    const spec = specFor(req.model)
    if (!spec) {
      throw new ProviderError({
        code: 'MODEL_UNAVAILABLE',
        message: `Higgsfield has no workflow called "${req.model}".`,
        providerId: 'higgsfield',
        retryable: false,
      })
    }

    const body = buildBody(spec, req)

    const res = await fetchWithTimeout(
      `${this.base}${spec.endpoint}`,
      { method: 'POST', headers: this.headers(), body: JSON.stringify(body), timeoutMs: 60_000 },
      'higgsfield',
    )
    if (!res.ok) throw errorFromResponse(res, await res.text().catch(() => ''), 'higgsfield')

    const payload = (await res.json()) as RequestResponse
    if (!payload.request_id) {
      throw new ProviderError({
        code: 'PROVIDER_ERROR',
        message: 'Higgsfield accepted the request but returned no request to track.',
        providerId: 'higgsfield',
        detail: JSON.stringify(payload).slice(0, 400),
      })
    }

    return { externalId: payload.request_id, status: mapStatus(payload.status) }
  }

  async getStatus(externalId: string) {
    this.assertConfigured()
    const res = await fetchWithTimeout(
      `${this.base}/requests/${encodeURIComponent(externalId)}/status`,
      { headers: this.headers(), timeoutMs: 20_000 },
      'higgsfield',
    )
    if (!res.ok) throw errorFromResponse(res, await res.text().catch(() => ''), 'higgsfield')

    const payload = (await res.json()) as RequestResponse
    const status = mapStatus(payload.status)

    const outputs: GenerationOutput[] = [
      ...(payload.images ?? []).map((i) => ({ url: i.url, type: 'image' as const })),
      ...(payload.video ? [{ url: payload.video.url, type: 'video' as const }] : []),
    ]

    return {
      status,
      outputs,
      error: status === 'FAILED' ? failure(payload) : undefined,
    }
  }

  /**
   * Cancellation only works while every job is still queued; once generation
   * has started the API answers 400 and the work is billed either way. A 400 is
   * therefore not an error worth surfacing — it means "too late", which the job
   * manager already handles by marking the job cancelled locally.
   */
  async cancel(externalId: string): Promise<void> {
    if (!this.configured) return
    const res = await fetchWithTimeout(
      `${this.base}/requests/${encodeURIComponent(externalId)}/cancel`,
      { method: 'POST', headers: this.headers(), timeoutMs: 15_000 },
      'higgsfield',
    )
    if (!res.ok && res.status !== 400 && res.status !== 404) {
      throw errorFromResponse(res, await res.text().catch(() => ''), 'higgsfield')
    }
  }

  private assertConfigured() {
    const missing = this.missingEnv()
    if (missing.length) {
      throw new ProviderError({
        code: 'UNCONFIGURED',
        message: "Higgsfield isn't connected.",
        providerId: 'higgsfield',
        detail: `Missing ${missing.join(' and ')}. Add them in Settings → Providers.`,
        retryable: false,
      })
    }
  }
}

/**
 * Assembles the request body from the workflow's declared fields.
 *
 * Only declared fields are sent, and each value is coerced to the declared type
 * and clamped to the declared bounds. Anything the caller passes that the
 * workflow does not declare is dropped: sending it would not fail, which is
 * exactly the problem.
 */
function buildBody(spec: HiggsfieldWorkflow, req: GenerationRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const references = req.referenceImages ?? []

  if (requiresImages(spec) && !references.length) {
    throw new ProviderError({
      code: 'BAD_REQUEST',
      message: `${spec.familyName} — ${spec.workflow} needs at least one image to work from.`,
      providerId: 'higgsfield',
      retryable: false,
    })
  }

  // References fill the workflow's image fields in order: an array field takes
  // as many as it allows, then the single-URL fields take one each.
  const queue = [...references]
  for (const field of imageFields(spec)) {
    if (!queue.length) break
    if (field.type === 'array') {
      body[field.name] = queue.splice(0, field.maxItems ?? queue.length)
    } else {
      body[field.name] = queue.shift()
    }
  }

  for (const field of spec.fields) {
    if (field.media === 'image') continue

    if (field.name === 'prompt') {
      body.prompt = req.prompt
      continue
    }

    const raw = req.params[field.name]
    if (raw === undefined || raw === null || raw === '') continue

    const value = coerce(field, raw)
    if (value !== undefined) body[field.name] = value
  }

  if (!body.prompt && spec.fields.some((f) => f.name === 'prompt' && f.required)) {
    body.prompt = req.prompt
  }

  return body
}

/** Coerces one value to the field's declared type, enum and bounds. */
function coerce(field: HiggsfieldField, raw: unknown): unknown {
  if (field.enum?.length) {
    // Enums are matched by string form so a numeric duration typed as "10" in
    // a select still lands on the integer the API expects.
    const match = field.enum.find((option) => String(option) === String(raw))
    return match ?? undefined
  }

  switch (field.type) {
    case 'boolean':
      return Boolean(raw)
    case 'integer':
    case 'number': {
      const n = Number(raw)
      if (!Number.isFinite(n)) return undefined
      const clamped = Math.min(field.max ?? n, Math.max(field.min ?? n, n))
      return field.type === 'integer' ? Math.round(clamped) : clamped
    }
    case 'array':
      return Array.isArray(raw) ? raw : [raw]
    default:
      return String(raw)
  }
}

function failure(payload: RequestResponse): ProviderError {
  const nsfw = payload.status === 'nsfw'
  return new ProviderError({
    code: nsfw ? 'BAD_REQUEST' : 'PROVIDER_ERROR',
    message: nsfw
      ? 'Higgsfield’s moderation rejected this prompt or its result.'
      : 'Image generation failed.',
    providerId: 'higgsfield',
    // Failed and NSFW requests are not charged; saying so saves a support round-trip.
    detail: payload.error ?? 'The request finished in a failed state. It was not charged.',
  })
}

function mapStatus(raw: string | undefined): JobStatus {
  switch (raw) {
    case 'completed':
      return 'COMPLETED'
    case 'failed':
    case 'nsfw':
      return 'FAILED'
    case 'canceled':
      return 'CANCELLED'
    case 'in_progress':
      return 'RUNNING'
    default:
      return 'QUEUED'
  }
}

export const higgsfieldProvider = new HiggsfieldProvider()
