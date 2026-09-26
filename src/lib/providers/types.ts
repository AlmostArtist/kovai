/**
 * The contract every intelligence source in KOVAI implements.
 *
 * Nothing in the UI layer may import a concrete provider. Components ask the
 * registry or the router for a provider, then speak this interface. Adding a
 * new provider means adding a folder under /providers and one registry entry.
 */

export type Capability =
  | 'CHAT'
  | 'VISION'
  | 'IMAGE_GENERATION'
  | 'IMAGE_EDITING'
  | 'VIDEO_GENERATION'
  | 'EMBEDDINGS'
  | 'TOOLS'
  | 'REASONING'
  | 'UPSCALE'

export type ProviderId = 'local' | 'openrouter' | 'higgsfield' | 'kie'

/** LOCAL never leaves the machine. CLOUD always crosses the network. */
export type ProviderKind = 'LOCAL' | 'CLOUD'

export interface ProviderDescriptor {
  id: ProviderId
  name: string
  kind: ProviderKind
  /** Superset of what any of this provider's models can do. */
  capabilities: Capability[]
  /** Short line shown in Settings → Providers. */
  summary: string
  docsUrl?: string
  /** Names of the env vars this provider needs, for the setup state. */
  requiredEnv: string[]
}

export type ProviderStatus =
  | { state: 'READY'; detail?: string; latencyMs?: number }
  | { state: 'UNCONFIGURED'; missing: string[] }
  | { state: 'OFFLINE'; detail: string }
  | { state: 'ERROR'; detail: string }

/**
 * Capability-driven parameter description. The Create workspace renders its
 * controls from this — it has no per-provider knowledge at all, so a model that
 * has no seed simply never shows a seed field.
 */
export type ParamSpec =
  | { key: string; label: string; type: 'enum'; options: { value: string; label: string }[]; default?: string; advanced?: boolean; help?: string }
  | { key: string; label: string; type: 'number'; min?: number; max?: number; step?: number; default?: number; advanced?: boolean; help?: string }
  | { key: string; label: string; type: 'text'; placeholder?: string; multiline?: boolean; default?: string; advanced?: boolean; help?: string }
  | { key: string; label: string; type: 'boolean'; default?: boolean; advanced?: boolean; help?: string }
  | { key: string; label: string; type: 'images'; max: number; advanced?: boolean; help?: string }

export interface ModelPricing {
  /** USD per million input tokens. Undefined means the provider did not say. */
  inputPerMTok?: number
  outputPerMTok?: number
  /** USD per generated image/video, when the provider publishes it. */
  perRequest?: number
}

export interface AIModel {
  id: string
  name: string
  providerId: ProviderId
  capabilities: Capability[]
  contextLength?: number
  description?: string
  /** Only present when the provider actually publishes pricing. Never invented. */
  pricing?: ModelPricing
  /** Generation controls this specific model supports. */
  params?: ParamSpec[]
  /** Local models only. */
  sizeBytes?: number
  family?: string
  /** Coarse routing hints surfaced in the "Auto / Fast / Reasoning …" selector. */
  tags?: ModelTag[]
}

export type ModelTag = 'fast' | 'reasoning' | 'vision' | 'coding' | 'creative' | 'default'

/* ── Chat ─────────────────────────────────────────────────── */

export interface ChatAttachment {
  /** data: URL or https URL. Local mode only ever produces data URLs. */
  url: string
  mimeType: string
  name?: string
}

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant'
  content: string
  attachments?: ChatAttachment[]
}

export interface ChatRequest {
  model: string
  messages: ChatMessageInput[]
  temperature?: number
  maxTokens?: number
  /** Abort propagates all the way to the provider connection. */
  signal?: AbortSignal
}

export type ChatChunk =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number }
  | { type: 'error'; error: ProviderError }

export interface ChatProvider {
  descriptor: ProviderDescriptor
  status(): Promise<ProviderStatus>
  listModels(): Promise<AIModel[]>
  streamChat(req: ChatRequest): AsyncIterable<ChatChunk>
}

/* ── Image / video generation ─────────────────────────────── */

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type JobPhase = 'PREPARING' | 'GENERATING' | 'FINALIZING' | 'DONE'

export interface GenerationRequest {
  model: string
  prompt: string
  /** Everything else is capability-driven and validated against ParamSpec. */
  params: Record<string, unknown>
  referenceImages?: string[]
}

export interface GenerationOutput {
  url: string
  type: 'image' | 'video'
  width?: number
  height?: number
  mimeType?: string
  seed?: number
}

export interface GenerationJob {
  id: string
  providerId: ProviderId
  /** Provider-side identifier used for polling. */
  externalId?: string
  model: string
  kind: 'image' | 'video' | 'upscale'
  status: JobStatus
  phase: JobPhase
  /** 0–100. Providers that do not report progress get phase-derived estimates. */
  progress: number
  prompt: string
  params: Record<string, unknown>
  referenceImages?: string[]
  outputs: GenerationOutput[]
  error?: ProviderError
  costUsd?: number
  createdAt: number
  updatedAt: number
  completedAt?: number
  /** Workspace tab that started it, so the Activity Center can jump back. */
  tabId?: string
  projectId?: string
}

export interface ImageProvider {
  descriptor: ProviderDescriptor
  /** Synchronous credential check, so a setup state can be shown immediately. */
  readonly configured: boolean
  status(): Promise<ProviderStatus>
  listModels(): Promise<AIModel[]>
  generate(req: GenerationRequest): Promise<{ externalId: string; status: JobStatus; costUsd?: number }>
  getStatus(externalId: string): Promise<{
    status: JobStatus
    progress?: number
    outputs?: GenerationOutput[]
    error?: ProviderError
  }>
  cancel(externalId: string): Promise<void>
}

/* ── Embeddings / vision helpers ──────────────────────────── */

export interface EmbeddingProvider {
  descriptor: ProviderDescriptor
  embed(model: string, input: string[]): Promise<number[][]>
}

/* ── Errors ───────────────────────────────────────────────── */

export type ProviderErrorCode =
  | 'UNCONFIGURED'
  | 'RUNTIME_OFFLINE'
  | 'MODEL_UNAVAILABLE'
  | 'RATE_LIMIT'
  | 'INVALID_KEY'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'CANCELLED'
  | 'PROVIDER_ERROR'
  | 'BAD_REQUEST'

/**
 * Raw provider errors never reach the interface. They are translated here, once,
 * into a message a person can act on plus an optional technical detail behind a
 * disclosure.
 */
export class ProviderError extends Error {
  code: ProviderErrorCode
  providerId?: ProviderId
  detail?: string
  retryable: boolean

  constructor(init: {
    code: ProviderErrorCode
    message: string
    providerId?: ProviderId
    detail?: string
    retryable?: boolean
  }) {
    super(init.message)
    this.name = 'ProviderError'
    this.code = init.code
    this.providerId = init.providerId
    this.detail = init.detail
    this.retryable = init.retryable ?? RETRYABLE.has(init.code)
  }

  toJSON(): SerializedProviderError {
    return {
      code: this.code,
      message: this.message,
      providerId: this.providerId,
      detail: this.detail,
      retryable: this.retryable,
    }
  }
}

const RETRYABLE = new Set<ProviderErrorCode>(['RATE_LIMIT', 'TIMEOUT', 'NETWORK', 'PROVIDER_ERROR'])

/** The wire shape of an error: what the interface receives and renders. */
export interface SerializedProviderError {
  code: ProviderErrorCode
  message: string
  providerId?: ProviderId
  detail?: string
  retryable: boolean
}

/** A concrete provider + model selection, as remembered per tab and in settings. */
export interface ModelChoice {
  providerId: ProviderId
  modelId: string
}

/** Map any thrown value onto an error the interface knows how to present. */
export function toProviderError(err: unknown, providerId?: ProviderId): ProviderError {
  if (err instanceof ProviderError) return err
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new ProviderError({ code: 'CANCELLED', message: 'Request cancelled.', providerId })
  }
  const detail = err instanceof Error ? err.message : String(err)
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(detail)) {
    return new ProviderError({
      code: 'NETWORK',
      message: 'Could not reach the provider.',
      providerId,
      detail,
    })
  }
  return new ProviderError({
    code: 'PROVIDER_ERROR',
    message: 'The provider returned an error.',
    providerId,
    detail,
  })
}

/** Uniform HTTP status → error mapping, used by every cloud adapter. */
export function errorFromResponse(
  res: Response,
  body: string,
  providerId: ProviderId,
): ProviderError {
  const detail = body.slice(0, 600)
  switch (res.status) {
    case 401:
    case 403:
      return new ProviderError({
        code: 'INVALID_KEY',
        message: 'The API credentials were rejected.',
        providerId,
        detail,
      })
    case 404:
      return new ProviderError({
        code: 'MODEL_UNAVAILABLE',
        message: 'That model is not available.',
        providerId,
        detail,
      })
    case 408:
    case 504:
      return new ProviderError({ code: 'TIMEOUT', message: 'The provider timed out.', providerId, detail })
    case 429:
      return new ProviderError({
        code: 'RATE_LIMIT',
        message: 'Rate limit reached. Try again shortly.',
        providerId,
        detail,
      })
    case 400:
    case 422:
      return new ProviderError({
        code: 'BAD_REQUEST',
        message: 'The request was rejected by the provider.',
        providerId,
        detail,
      })
    default:
      return new ProviderError({
        code: 'PROVIDER_ERROR',
        message: 'The provider returned an error.',
        providerId,
        detail,
      })
  }
}
