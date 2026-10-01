import 'server-only'

import { readFile } from 'node:fs/promises'
import { fetchWithTimeout } from '../http'
import { errorFromResponse, ProviderError } from '../types'
import { DEFAULT_IMAGE_PARAMS, DEFAULT_VIDEO_PARAMS, KIE_FALLBACK_MODELS, type KieModelConfig } from './catalogue'
import type {
  AIModel,
  Capability,
  GenerationOutput,
  GenerationRequest,
  ImageProvider,
  JobStatus,
  ProviderDescriptor,
  ProviderStatus,
} from '../types'

export { KIE_DESCRIPTOR } from '../descriptors'
import { KIE_DESCRIPTOR } from '../descriptors'

const ENDPOINTS = {
  createTask: '/api/v1/jobs/createTask',
  recordInfo: (taskId: string) => `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
  models: '/api/v1/models',
  credits: '/api/v1/chat/credit',
  uploadBase64: '/api/file-base64-upload',
}

/** Where KIE puts our uploads. Theirs are deleted after three days. */
const UPLOAD_PATH = 'images/kovai'

/**
 * The file API lives on a different host from the rest of KIE.
 *
 * Their documentation gives this endpoint as `api.kie.ai/api/file-base64-upload`,
 * which answers 404; the working host is the one below, confirmed against the
 * live service. Overridable, so a correction on their side needs a variable
 * rather than a release.
 */
const UPLOAD_BASE = (process.env.KIE_UPLOAD_BASE || 'https://kieai.redpandaai.co').replace(/\/$/, '')

interface KieEnvelope<T> {
  code?: number
  msg?: string
  message?: string
  data?: T
}

interface KieRecord {
  taskId?: string
  state?: string
  status?: string
  progress?: number | string
  failMsg?: string
  failCode?: string | number
  costTime?: number
  resultJson?: string
  response?: { resultUrls?: string[]; result_urls?: string[]; resultUrl?: string }
}

export class KieProvider implements ImageProvider {
  descriptor = KIE_DESCRIPTOR
  private catalogue: { at: number; models: AIModel[] } | null = null

  private get base() {
    return (process.env.KIE_API_BASE || 'https://api.kie.ai').replace(/\/$/, '')
  }
  private get key() {
    return process.env.KIE_API_KEY?.trim() || ''
  }
  get configured() {
    return this.key.length > 0
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }
  }

  async status(): Promise<ProviderStatus> {
    if (!this.configured) return { state: 'UNCONFIGURED', missing: ['KIE_API_KEY'] }
    const started = Date.now()
    try {
      const res = await fetchWithTimeout(
        `${this.base}${ENDPOINTS.credits}`,
        { headers: this.headers(), timeoutMs: 8000 },
        'kie',
      )
      if (res.status === 401 || res.status === 403)
        return { state: 'ERROR', detail: 'The API key was rejected.' }
      if (!res.ok && res.status !== 404)
        return { state: 'ERROR', detail: `KIE responded ${res.status}.` }
      let detail: string | undefined
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as KieEnvelope<number | { credit?: number }>
        const credit = typeof body.data === 'number' ? body.data : body.data?.credit
        if (typeof credit === 'number') detail = `${credit.toLocaleString()} credits`
      }
      return { state: 'READY', latencyMs: Date.now() - started, detail }
    } catch (err) {
      return { state: 'ERROR', detail: err instanceof Error ? err.message : 'Unreachable.' }
    }
  }

  /**
   * Models come from, in order: a live catalogue call, a user-supplied JSON
   * file (KIE_MODELS_FILE), then the bundled configuration. Nothing about the
   * available models is assumed by the interface.
   */
  async listModels(): Promise<AIModel[]> {
    if (!this.configured) return []
    if (this.catalogue && Date.now() - this.catalogue.at < 30 * 60_000) return this.catalogue.models

    const remote = await this.fetchRemoteCatalogue()
    if (remote?.length) {
      this.catalogue = { at: Date.now(), models: remote }
      return remote
    }

    const fromFile = await this.readConfiguredCatalogue()
    const models = fromFile?.length ? fromFile : KIE_FALLBACK_MODELS
    this.catalogue = { at: Date.now(), models }
    return models
  }

  private async fetchRemoteCatalogue(): Promise<AIModel[] | null> {
    try {
      const res = await fetchWithTimeout(
        `${this.base}${ENDPOINTS.models}`,
        { headers: this.headers(), timeoutMs: 10_000 },
        'kie',
      )
      if (!res.ok) return null
      // Three shapes seen in the wild: a bare array, `{data: [...]}`, and
      // what the live API actually sends — `{data: {total, models: [...]}}`.
      // Only the last one is real, and missing it is indistinguishable from
      // the catalogue being unreachable, which is how this failed quietly.
      const body = (await res.json()) as
        | KieModelConfig[]
        | KieEnvelope<KieModelConfig[] | { models?: KieModelConfig[] }>
      const data = Array.isArray(body) ? body : body.data
      const raw = Array.isArray(data) ? data : (data?.models ?? [])
      if (!Array.isArray(raw) || !raw.length) return null
      return raw.map(toModel).filter((m): m is AIModel => Boolean(m))
    } catch {
      return null
    }
  }

  private async readConfiguredCatalogue(): Promise<AIModel[] | null> {
    const path = process.env.KIE_MODELS_FILE
    if (!path) return null
    try {
      const raw = JSON.parse(await readFile(path, 'utf8')) as KieModelConfig[]
      return raw.map(toModel).filter((m): m is AIModel => Boolean(m))
    } catch {
      return null
    }
  }

  /**
   * Gives KIE a copy of anything it cannot fetch for itself.
   *
   * A reference image is passed to the provider as a URL, and the provider
   * fetches it from its own servers. Anything served from this machine —
   * `/api/files/...`, `localhost`, a LAN address — is reachable from here and
   * from nowhere else, so KIE answers "Image fetch failed. Check access
   * settings or use our File Upload API instead." It is right, and this is
   * that File Upload API.
   *
   * Public https URLs are passed through untouched; there is nothing to gain
   * by copying a CDN image into another CDN.
   */
  private async hostReferences(urls: string[]): Promise<string[]> {
    return Promise.all(urls.map((url) => this.hostOne(url)))
  }

  private async hostOne(url: string): Promise<string> {
    if (isPubliclyFetchable(url)) return url

    const base64 = url.startsWith('data:') ? url : await this.readLocal(url)

    const res = await fetchWithTimeout(
      `${UPLOAD_BASE}${ENDPOINTS.uploadBase64}`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ base64Data: base64, uploadPath: UPLOAD_PATH }),
        timeoutMs: 60_000,
      },
      'kie',
    )
    if (!res.ok) throw errorFromResponse(res, await res.text().catch(() => ''), 'kie')

    const body = (await res.json()) as KieEnvelope<{ downloadUrl?: string }>
    const hosted = body.data?.downloadUrl
    if (!hosted) {
      throw new ProviderError({
        code: 'PROVIDER_ERROR',
        message: 'KIE could not take the reference image.',
        providerId: 'kie',
        detail: body.msg ?? body.message ?? JSON.stringify(body).slice(0, 300),
      })
    }
    return hosted
  }

  /** Reads an image this server is hosting and returns it as a data URL. */
  private async readLocal(url: string): Promise<string> {
    const absolute = url.startsWith('/') ? `${selfOrigin()}${url}` : url
    const res = await fetchWithTimeout(absolute, { timeoutMs: 20_000 }, 'kie').catch(() => null)
    if (!res?.ok) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'That reference image could not be read.',
        providerId: 'kie',
        detail: `Nothing was served at ${absolute}.`,
        retryable: false,
      })
    }
    const type = res.headers.get('content-type') ?? 'image/png'
    const bytes = Buffer.from(await res.arrayBuffer())
    return `data:${type};base64,${bytes.toString('base64')}`
  }

  async generate(req: GenerationRequest) {
    this.assertConfigured()

    // KIE takes a flat, model-specific `input` object. We pass through only the
    // parameters the selected model actually declared, which is what keeps this
    // adapter generic across the whole catalogue.
    const input: Record<string, unknown> = { prompt: req.prompt }
    for (const [key, value] of Object.entries(req.params)) {
      if (value === undefined || value === null || value === '') continue
      input[INPUT_KEYS[key] ?? key] = value
    }
    if (req.referenceImages?.length) {
      input.image_urls = await this.hostReferences(req.referenceImages)
    }

    const res = await fetchWithTimeout(
      `${this.base}${ENDPOINTS.createTask}`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ model: req.model, input }),
        timeoutMs: 60_000,
      },
      'kie',
    )
    if (!res.ok) throw errorFromResponse(res, await res.text().catch(() => ''), 'kie')

    const body = (await res.json()) as KieEnvelope<{ taskId?: string }>
    if (body.code && body.code !== 200) {
      throw new ProviderError({
        code: body.code === 402 ? 'RATE_LIMIT' : 'PROVIDER_ERROR',
        message: body.code === 402 ? 'Not enough KIE credits.' : 'KIE rejected the request.',
        providerId: 'kie',
        detail: body.msg ?? body.message,
      })
    }
    const externalId = body.data?.taskId
    if (!externalId) {
      throw new ProviderError({
        code: 'PROVIDER_ERROR',
        message: 'KIE accepted the request but returned no task to track.',
        providerId: 'kie',
        detail: JSON.stringify(body).slice(0, 400),
      })
    }
    return { externalId, status: 'QUEUED' as JobStatus }
  }

  async getStatus(externalId: string) {
    this.assertConfigured()
    const res = await fetchWithTimeout(
      `${this.base}${ENDPOINTS.recordInfo(externalId)}`,
      { headers: this.headers(), timeoutMs: 20_000 },
      'kie',
    )
    if (!res.ok) throw errorFromResponse(res, await res.text().catch(() => ''), 'kie')

    const body = (await res.json()) as KieEnvelope<KieRecord>
    const record = body.data ?? {}
    const status = mapStatus(record.state ?? record.status)

    const urls = new Set<string>()
    for (const u of record.response?.resultUrls ?? record.response?.result_urls ?? []) urls.add(u)
    if (record.response?.resultUrl) urls.add(record.response.resultUrl)
    if (record.resultJson) {
      try {
        const parsed = JSON.parse(record.resultJson) as { resultUrls?: string[] }
        for (const u of parsed.resultUrls ?? []) urls.add(u)
      } catch {
        /* the field is not always JSON */
      }
    }

    const outputs: GenerationOutput[] = [...urls].map((url) => ({
      url,
      type: /\.(mp4|webm|mov)(\?|$)/i.test(url) ? ('video' as const) : ('image' as const),
    }))

    const progress = Number(record.progress)

    return {
      status,
      progress: Number.isFinite(progress) ? Math.round(progress <= 1 ? progress * 100 : progress) : undefined,
      outputs,
      error:
        status === 'FAILED'
          ? new ProviderError({
              code: 'PROVIDER_ERROR',
              message: 'Generation failed.',
              providerId: 'kie',
              detail: record.failMsg ?? `KIE reported failure code ${record.failCode ?? 'unknown'}.`,
            })
          : undefined,
    }
  }

  async cancel(): Promise<void> {
    // KIE has no public cancel endpoint. The job manager stops polling and marks
    // the job cancelled locally; we do not pretend the remote task was stopped.
  }

  private assertConfigured() {
    if (!this.configured) {
      throw new ProviderError({
        code: 'UNCONFIGURED',
        message: "KIE isn't connected.",
        providerId: 'kie',
        detail: 'Missing KIE_API_KEY. Add it in Settings → Providers.',
        retryable: false,
      })
    }
  }
}

/** Camel-cased UI keys → the names KIE expects. */
const INPUT_KEYS: Record<string, string> = {
  aspectRatio: 'aspect_ratio',
  negativePrompt: 'negative_prompt',
  outputFormat: 'output_format',
  imageSize: 'image_size',
  count: 'num_images',
}

/**
 * Turns one catalogue entry into a model.
 *
 * KIE calls the identifier `model`; a hand-written file is likelier to say
 * `id`. Taking whichever is present is the whole difference between the live
 * catalogue loading and being silently discarded — which is what was
 * happening, leaving the app offering models the API had never heard of.
 */
function toModel(raw: KieModelConfig): AIModel | null {
  const id = raw?.model ?? raw?.id ?? raw?.slug
  if (!id) return null

  const known = KIE_FALLBACK_MODELS.find((m) => m.id === id)
  const capabilities = (raw.capabilities
    ?.map((c) => c.toUpperCase())
    .filter((c): c is Capability =>
      ['IMAGE_GENERATION', 'IMAGE_EDITING', 'VIDEO_GENERATION', 'UPSCALE'].includes(c),
    ) ??
    known?.capabilities ??
    fromTaskTypes(raw.taskType)) as Capability[]

  const video = capabilities.includes('VIDEO_GENERATION')

  return {
    id,
    name: raw.name ?? known?.name ?? prettyName(id),
    providerId: 'kie',
    capabilities,
    // KIE's titles are written for search engines — "Affordable Kling 2.1
    // Master API — Premium Text-to-Video Generation" — so the title is used as
    // the description, where that reads as a blurb, and the name is built from
    // the id, where it reads as a name.
    description: raw.description ?? known?.description ?? raw.title ?? undefined,
    params: raw.params ?? known?.params ?? (video ? DEFAULT_VIDEO_PARAMS : DEFAULT_IMAGE_PARAMS),
    tags: known?.tags,
  }
}

/** KIE's own classification is the best capability signal on offer. */
function fromTaskTypes(taskTypes: string[] | undefined): Capability[] {
  const all = (taskTypes ?? []).map((t) => t.toLowerCase())
  const capabilities: Capability[] = []
  if (all.some((t) => t.includes('to video'))) capabilities.push('VIDEO_GENERATION')
  if (all.some((t) => t === 'image to image')) capabilities.push('IMAGE_EDITING')
  if (all.some((t) => t === 'text to image')) capabilities.push('IMAGE_GENERATION')
  // An editor is still something that hands back an image, and the Create
  // workspace lists by IMAGE_GENERATION — without this, every edit model
  // vanishes from the picker.
  if (!capabilities.length || (capabilities.includes('IMAGE_EDITING') && capabilities.length === 1)) {
    capabilities.push('IMAGE_GENERATION')
  }
  return capabilities
}

/**
 * "seedream/5-pro-image-to-image" → "Seedream 5 Pro Image To Image".
 *
 * The family prefix is kept rather than dropped: without it half the
 * catalogue is called "5 Pro Image To Image" and the picker is useless.
 */
function prettyName(id: string): string {
  return id
    .split(/[/\-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function mapStatus(raw: string | undefined): JobStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'success':
    case 'completed':
      return 'COMPLETED'
    case 'fail':
    case 'failed':
    case 'error':
      return 'FAILED'
    case 'generating':
    case 'processing':
    case 'running':
      return 'RUNNING'
    default:
      return 'QUEUED'
  }
}

export const kieProvider = new KieProvider()

/** Can KIE's servers fetch this themselves? */
function isPubliclyFetchable(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith('/')) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false

  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host === '::1') return false
  // Dotted-quad private ranges, plus the loopback block.
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  if (/^169\.254\./.test(host)) return false
  return true
}

/** This server's own address, for reading back what it is hosting. */
function selfOrigin(): string {
  const configured = process.env.KOVAI_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')
  return `http://127.0.0.1:${process.env.PORT || '3000'}`
}
