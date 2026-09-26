import { fetchWithTimeout, parseSSE } from '../http'
import {
  ProviderError,
  toProviderError,
  type AIModel,
  type Capability,
  type ChatChunk,
  type ChatProvider,
  type ChatRequest,
  type ProviderDescriptor,
  type ProviderStatus,
} from '../types'

export { LOCAL_DESCRIPTOR } from '../descriptors'
import { LOCAL_DESCRIPTOR } from '../descriptors'

export const LOCAL_RUNTIME_URL =
  process.env.NEXT_PUBLIC_LOCAL_RUNTIME_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8756'

export interface SystemInfo {
  platform: string
  arch: string
  chip: string
  cpuCount: number
  cpuPercent: number
  ramTotalBytes: number
  ramAvailableBytes: number
  gpu: string | null
  vramTotalBytes: number | null
  vramFreeBytes: number | null
  backends: { ollama: boolean; llamacpp: boolean }
  loadedModels: string[]
  uptimeSeconds: number
  /** Where GGUF files are read from, and how many are there. */
  modelsDir: string | null
  ggufCount: number
  /** The llama.cpp binary that will run them, if one was found. */
  llamaServer: string | null
}

interface RawModel {
  id: string
  name: string
  family?: string
  size?: number
  capabilities?: string[]
  context_length?: number
  quantization?: string
  source?: string
  loaded?: boolean
  /** False for a GGUF file that is on disk but not yet imported into a backend. */
  registered?: boolean
  /** The model KOVAI reaches for when the user has not chosen one. */
  default?: boolean
  file?: string
}

/**
 * Talks to the KOVAI local runtime (FastAPI) which in turn fronts Ollama and
 * llama.cpp. Runs unchanged in the browser and on the server: in PRIVATE mode
 * the browser calls it directly so prompts never touch the Next.js process.
 */
export class LocalProvider implements ChatProvider {
  descriptor = LOCAL_DESCRIPTOR
  constructor(private baseUrl: string = LOCAL_RUNTIME_URL) {}

  async status(): Promise<ProviderStatus> {
    const started = performance.now()
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/health`, { timeoutMs: 2500 }, 'local')
      if (!res.ok) return { state: 'OFFLINE', detail: `Runtime responded ${res.status}.` }
      const body = (await res.json()) as { status?: string; version?: string }
      if (body.status !== 'ok') return { state: 'OFFLINE', detail: 'The runtime is still starting up.' }
      return {
        state: 'READY',
        detail: body.version ? `Runtime ${body.version}` : undefined,
        latencyMs: Math.round(performance.now() - started),
      }
    } catch {
      return { state: 'OFFLINE', detail: 'The local runtime is not running.' }
    }
  }

  async system(): Promise<SystemInfo> {
    const res = await fetchWithTimeout(`${this.baseUrl}/system`, { timeoutMs: 4000 }, 'local')
    if (!res.ok) throw this.offline()
    const raw = (await res.json()) as Record<string, never>
    return {
      platform: raw.platform ?? 'unknown',
      arch: raw.arch ?? 'unknown',
      chip: raw.chip ?? 'unknown',
      cpuCount: raw.cpu_count ?? 0,
      cpuPercent: raw.cpu_percent ?? 0,
      ramTotalBytes: raw.ram_total ?? 0,
      ramAvailableBytes: raw.ram_available ?? 0,
      gpu: raw.gpu ?? null,
      vramTotalBytes: raw.vram_total ?? null,
      vramFreeBytes: raw.vram_free ?? null,
      backends: raw.backends ?? { ollama: false, llamacpp: false },
      loadedModels: raw.loaded_models ?? [],
      uptimeSeconds: raw.uptime ?? 0,
      modelsDir: raw.models_dir ?? null,
      ggufCount: raw.gguf_count ?? 0,
      llamaServer: raw.llama_server ?? null,
    }
  }

  /**
   * The installed model list is always read from the machine. We never present
   * a hard-coded catalogue as though it were installed.
   */
  async listModels(): Promise<AIModel[]> {
    let res: Response
    try {
      res = await fetchWithTimeout(`${this.baseUrl}/models`, { timeoutMs: 8000 }, 'local')
    } catch {
      throw this.offline()
    }
    if (!res.ok) throw this.offline()

    const body = (await res.json()) as { models?: RawModel[] }
    return (body.models ?? [])
      // A GGUF sitting on disk cannot be run until it is imported, so it is not
      // offered as a choice. The Models page lists it with an install action.
      .filter((m) => m.registered !== false)
      .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      providerId: 'local' as const,
      capabilities: normaliseCapabilities(m.capabilities, m.id),
      contextLength: m.context_length,
      description: [m.family, m.quantization, m.source].filter(Boolean).join(' · ') || undefined,
      sizeBytes: m.size,
      family: m.family,
      tags: deriveTags(m),
    }))
  }

  async *streamChat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const hasImages = req.messages.some((m) => m.attachments?.length)
    const endpoint = hasImages ? '/vision' : '/chat'

    let res: Response
    try {
      res = await fetchWithTimeout(
        `${this.baseUrl}${endpoint}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: req.model,
            messages: req.messages.map((m) => ({
              role: m.role,
              content: m.content,
              images: m.attachments?.map((a) => a.url) ?? [],
            })),
            temperature: req.temperature,
            max_tokens: req.maxTokens,
            stream: true,
          }),
          signal: req.signal,
          // Local generation on CPU can be slow; give it room.
          timeoutMs: 15 * 60_000,
        },
        'local',
      )
    } catch (err) {
      const mapped = toProviderError(err, 'local')
      yield { type: 'error', error: mapped.code === 'NETWORK' ? this.offline() : mapped }
      return
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      yield {
        type: 'error',
        error: new ProviderError({
          code: res.status === 404 ? 'MODEL_UNAVAILABLE' : 'PROVIDER_ERROR',
          message:
            res.status === 404
              ? 'That model is not installed in the local runtime.'
              : 'The local runtime could not complete this request.',
          providerId: 'local',
          detail: text.slice(0, 500),
        }),
      }
      return
    }

    for await (const payload of parseSSE(res.body)) {
      if (payload === '[DONE]') return
      let event: { type?: string; text?: string; input_tokens?: number; output_tokens?: number; message?: string }
      try {
        event = JSON.parse(payload)
      } catch {
        continue
      }
      if (event.type === 'reasoning' && event.text) yield { type: 'reasoning', text: event.text }
      else if (event.type === 'text' && event.text) yield { type: 'text', text: event.text }
      else if (event.type === 'usage')
        yield {
          type: 'usage',
          inputTokens: event.input_tokens,
          outputTokens: event.output_tokens,
          // Local inference has no marginal cost. That is the point of it.
          costUsd: 0,
        }
      else if (event.type === 'error')
        yield {
          type: 'error',
          error: new ProviderError({
            code: 'PROVIDER_ERROR',
            message: 'The local model failed to respond.',
            providerId: 'local',
            detail: event.message,
          }),
        }
    }
  }

  async embed(model: string, input: string[]): Promise<number[][]> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input }),
        timeoutMs: 120_000,
      },
      'local',
    )
    if (!res.ok) throw this.offline()
    const body = (await res.json()) as { embeddings: number[][] }
    return body.embeddings
  }

  async cancel(requestId: string): Promise<void> {
    await fetchWithTimeout(
      `${this.baseUrl}/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
        timeoutMs: 3000,
      },
      'local',
    ).catch(() => {})
  }

  private offline() {
    return new ProviderError({
      code: 'RUNTIME_OFFLINE',
      message: "KOVAI's local runtime isn't running.",
      providerId: 'local',
      detail: `No response from ${this.baseUrl}. Start it from Models → Local Runtime, or run scripts/start-local.sh.`,
      retryable: true,
    })
  }
}

/** Vision/embedding support is reported by the runtime; the name is a fallback. */
function normaliseCapabilities(raw: string[] | undefined, id: string): Capability[] {
  if (raw?.length) {
    const mapped = raw
      .map((c) => c.toUpperCase())
      .filter((c): c is Capability =>
        ['CHAT', 'VISION', 'EMBEDDINGS', 'REASONING', 'TOOLS'].includes(c),
      )
    if (mapped.length) return mapped
  }
  const lower = id.toLowerCase()
  if (/embed|bge|nomic|minilm|gte/.test(lower)) return ['EMBEDDINGS']
  if (/vl|vision|llava|moondream|pixtral|bakllava/.test(lower)) return ['CHAT', 'VISION']
  return ['CHAT']
}

function deriveTags(m: RawModel): AIModel['tags'] {
  const tags: NonNullable<AIModel['tags']> = []
  // The runtime names its preferred model; the router scores that tag highest.
  if (m.default) tags.push('default')
  const id = m.id.toLowerCase()
  // Capability first: a GGUF paired with a projector can see, whatever its name
  // suggests. Without this the router's vision boost lands on a cloud model
  // while a perfectly capable local one sits unused.
  if (m.capabilities?.some((c) => c.toUpperCase() === 'VISION')) tags.push('vision')
  else if (/vl|vision|llava|moondream|pixtral/.test(id)) tags.push('vision')
  if (/coder|code|deepseek/.test(id)) tags.push('coding')
  if (/r1|reason|qwq|think/.test(id)) tags.push('reasoning')
  if (m.size && m.size < 5e9) tags.push('fast')
  return tags
}

export const localProvider = new LocalProvider()
