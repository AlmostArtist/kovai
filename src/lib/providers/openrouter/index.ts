import 'server-only'

import { errorFromResponse, ProviderError } from '../types'
import { fetchWithTimeout, parseSSE } from '../http'
import type {
  AIModel,
  Capability,
  ChatChunk,
  ChatProvider,
  ChatRequest,
  ModelTag,
  ProviderDescriptor,
  ProviderStatus,
} from '../types'

export { OPENROUTER_DESCRIPTOR } from '../descriptors'
import { OPENROUTER_DESCRIPTOR } from '../descriptors'

const BASE = 'https://openrouter.ai/api/v1'

interface RawORModel {
  id: string
  name: string
  description?: string
  context_length?: number
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; modality?: string }
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
}

/**
 * The online intelligence provider. This module is server-only: the API key is
 * read from the environment here and never crosses to the browser.
 */
export class OpenRouterProvider implements ChatProvider {
  descriptor = OPENROUTER_DESCRIPTOR
  private catalogue: { at: number; models: AIModel[] } | null = null

  private get key() {
    return process.env.OPENROUTER_API_KEY?.trim() || ''
  }

  get configured() {
    return this.key.length > 0
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      // OpenRouter uses these for attribution on its dashboard.
      'HTTP-Referer': process.env.OPENROUTER_APP_URL || 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'KOVAI',
    }
  }

  async status(): Promise<ProviderStatus> {
    if (!this.configured) return { state: 'UNCONFIGURED', missing: ['OPENROUTER_API_KEY'] }
    const started = Date.now()
    try {
      const res = await fetchWithTimeout(
        `${BASE}/key`,
        { headers: this.headers(), timeoutMs: 8000 },
        'openrouter',
      )
      if (res.status === 401) return { state: 'ERROR', detail: 'The API key was rejected.' }
      if (!res.ok) return { state: 'ERROR', detail: `OpenRouter responded ${res.status}.` }
      const body = (await res.json()) as { data?: { limit_remaining?: number | null; usage?: number } }
      const remaining = body.data?.limit_remaining
      return {
        state: 'READY',
        latencyMs: Date.now() - started,
        detail:
          typeof remaining === 'number'
            ? `$${remaining.toFixed(2)} credit remaining`
            : undefined,
      }
    } catch (err) {
      return { state: 'ERROR', detail: err instanceof Error ? err.message : 'Unreachable.' }
    }
  }

  /**
   * The catalogue is fetched live — model names are never pinned in source, so
   * newly released models appear without a code change. Cached for 10 minutes.
   */
  async listModels(): Promise<AIModel[]> {
    if (!this.configured) return []
    if (this.catalogue && Date.now() - this.catalogue.at < 10 * 60_000) return this.catalogue.models

    const res = await fetchWithTimeout(
      `${BASE}/models`,
      { headers: this.headers(), timeoutMs: 15_000 },
      'openrouter',
    )
    if (!res.ok) throw errorFromResponse(res, await res.text().catch(() => ''), 'openrouter')

    const body = (await res.json()) as { data?: RawORModel[] }
    const models = (body.data ?? []).map(toModel).sort((a, b) => a.name.localeCompare(b.name))
    this.catalogue = { at: Date.now(), models }
    return models
  }

  async *streamChat(req: ChatRequest): AsyncIterable<ChatChunk> {
    if (!this.configured) {
      yield {
        type: 'error',
        error: new ProviderError({
          code: 'UNCONFIGURED',
          message: 'OpenRouter is not connected.',
          providerId: 'openrouter',
          detail: 'Add OPENROUTER_API_KEY in Settings → Providers.',
          retryable: false,
        }),
      }
      return
    }

    const res = await fetchWithTimeout(
      `${BASE}/chat/completions`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: req.model,
          messages: req.messages.map(toORMessage),
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          stream: true,
          usage: { include: true },
        }),
        signal: req.signal,
        timeoutMs: 10 * 60_000,
      },
      'openrouter',
    )

    if (!res.ok || !res.body) {
      yield {
        type: 'error',
        error: errorFromResponse(res, await res.text().catch(() => ''), 'openrouter'),
      }
      return
    }

    for await (const payload of parseSSE(res.body)) {
      if (payload === '[DONE]') return
      let event: {
        choices?: { delta?: { content?: string; reasoning?: string } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
        error?: { message?: string; code?: number }
      }
      try {
        event = JSON.parse(payload)
      } catch {
        continue
      }

      if (event.error) {
        yield {
          type: 'error',
          error: new ProviderError({
            code: event.error.code === 429 ? 'RATE_LIMIT' : 'PROVIDER_ERROR',
            message: 'The model stopped mid-response.',
            providerId: 'openrouter',
            detail: event.error.message,
          }),
        }
        return
      }

      const delta = event.choices?.[0]?.delta
      if (delta?.reasoning) yield { type: 'reasoning', text: delta.reasoning }
      if (delta?.content) yield { type: 'text', text: delta.content }

      if (event.usage) {
        yield {
          type: 'usage',
          inputTokens: event.usage.prompt_tokens,
          outputTokens: event.usage.completion_tokens,
          // OpenRouter reports real cost; we never estimate one ourselves.
          costUsd: event.usage.cost,
        }
      }
    }
  }
}

function toORMessage(m: ChatRequest['messages'][number]) {
  if (!m.attachments?.length) return { role: m.role, content: m.content }
  return {
    role: m.role,
    content: [
      { type: 'text', text: m.content },
      ...m.attachments.map((a) => ({ type: 'image_url', image_url: { url: a.url } })),
    ],
  }
}

function toModel(raw: RawORModel): AIModel {
  const inputs = raw.architecture?.input_modalities ?? []
  const capabilities: Capability[] = ['CHAT']
  if (inputs.includes('image')) capabilities.push('VISION')
  if (raw.supported_parameters?.includes('tools')) capabilities.push('TOOLS')
  if (raw.supported_parameters?.includes('reasoning')) capabilities.push('REASONING')

  const tags: ModelTag[] = []
  const id = raw.id.toLowerCase()
  if (capabilities.includes('VISION')) tags.push('vision')
  if (capabilities.includes('REASONING') || /think|reason|o[134]|r1/.test(id)) tags.push('reasoning')
  if (/mini|flash|haiku|small|lite|8b|turbo/.test(id)) tags.push('fast')
  if (/cod(e|er)|deepseek/.test(id)) tags.push('coding')
  if (/opus|sonnet|claude|creative|command/.test(id)) tags.push('creative')

  const prompt = Number(raw.pricing?.prompt)
  const completion = Number(raw.pricing?.completion)

  return {
    id: raw.id,
    name: raw.name,
    providerId: 'openrouter',
    capabilities,
    contextLength: raw.context_length,
    description: raw.description?.slice(0, 220),
    // Prices come back per token; present per million for legibility.
    pricing:
      Number.isFinite(prompt) || Number.isFinite(completion)
        ? {
            inputPerMTok: Number.isFinite(prompt) ? prompt * 1e6 : undefined,
            outputPerMTok: Number.isFinite(completion) ? completion * 1e6 : undefined,
          }
        : undefined,
    tags,
  }
}

export const openRouterProvider = new OpenRouterProvider()
