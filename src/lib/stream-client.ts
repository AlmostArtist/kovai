'use client'

import type { ChatMessageInput, ProviderId, SerializedProviderError } from './providers/types'

/**
 * Browser-side chat transport.
 *
 * Two paths, chosen by where the model lives:
 *
 *   local  → the browser streams straight from 127.0.0.1. The prompt, the
 *            images and the response never touch the Next.js server.
 *   cloud  → /api/chat, so the credential stays on the server.
 *
 * If the direct local call is blocked by the browser rather than by the runtime
 * being down — a page opened on the LAN URL calling loopback trips CORS and
 * Chrome's private-network rules — it retries through the server, which reaches
 * the same runtime on the same machine. Being strict about the transport is not
 * worth reporting a running runtime as missing.
 *
 * Both paths speak the same SSE event shape, so callers never branch on provider.
 */

export type StreamEvent =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number }
  | { type: 'error'; error: SerializedProviderError }

export interface StreamOptions {
  providerId: ProviderId
  model: string
  messages: ChatMessageInput[]
  privacy: 'PRIVATE' | 'ONLINE'
  localRuntimeUrl: string
  projectId?: string
  temperature?: number
  /** Ceiling on the reply, set by the effort control. */
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * Resolves an attachment to a data URL.
 *
 * An image attached in online mode is uploaded and referenced by a relative
 * link, which nothing downstream can fetch: the local runtime reads bytes
 * rather than following URLs, and a cloud provider cannot reach a path on a
 * machine that is not on the internet. Both get the bytes instead, resolved
 * here in the browser the link belongs to.
 */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not read the attached image (${res.status}).`)
  const blob = await res.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the attached image.'))
    reader.readAsDataURL(blob)
  })
}

async function inlineAttachments(messages: ChatMessageInput[]): Promise<ChatMessageInput[]> {
  return Promise.all(
    messages.map(async (message) =>
      message.attachments?.length
        ? {
            ...message,
            attachments: await Promise.all(
              message.attachments.map(async (attachment) => ({
                ...attachment,
                url: await toDataUrl(attachment.url),
              })),
            ),
          }
        : message,
    ),
  )
}

export async function* streamChat(options: StreamOptions): AsyncGenerator<StreamEvent> {
  const local = options.providerId === 'local'
  const hasImages = options.messages.some((m) => m.attachments?.length)

  let messages = options.messages
  if (hasImages) {
    try {
      messages = await inlineAttachments(messages)
    } catch (err) {
      yield {
        type: 'error',
        error: {
          code: 'BAD_REQUEST',
          message: 'That image could not be attached.',
          detail: (err as Error)?.message,
          retryable: true,
        },
      }
      return
    }
  }

  /** The same request, routed through our own server instead of direct. */
  const viaServer = () =>
    fetch(hasImages ? '/api/vision' : '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        providerId: options.providerId,
        model: options.model,
        messages,
        privacy: options.privacy,
        projectId: options.projectId,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      }),
    })

  let response: Response
  try {
    response = local
      ? await fetch(`${options.localRuntimeUrl}${hasImages ? '/vision' : '/chat'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: options.signal,
          body: JSON.stringify({
            model: options.model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
              images: m.attachments?.map((a) => a.url) ?? [],
            })),
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            stream: true,
          }),
        })
      : await fetch(hasImages ? '/api/vision' : '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: options.signal,
          body: JSON.stringify({
            providerId: options.providerId,
            model: options.model,
            messages,
            privacy: options.privacy,
            projectId: options.projectId,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
          }),
        })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return

    if (local) {
      // The browser refused the direct call. The runtime may well be running —
      // ask the server, which is on the same machine and not subject to the
      // page's origin rules.
      try {
        response = await viaServer()
      } catch (proxyError) {
        yield {
          type: 'error',
          error: {
            code: 'RUNTIME_OFFLINE',
            message: "KOVAI's local runtime isn't running.",
            detail:
              `The browser could not reach ${options.localRuntimeUrl} (${(err as Error)?.message}), ` +
              `and neither could the server (${(proxyError as Error)?.message}).`,
            retryable: true,
          },
        }
        return
      }
    } else {
      yield {
        type: 'error',
        error: {
          code: 'NETWORK',
          message: 'Could not reach the server.',
          detail: (err as Error)?.message,
          retryable: true,
        },
      }
      return
    }
  }

  if (!response.ok || !response.body) {
    yield { type: 'error', error: await errorFromResponse(response, local) }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let index: number
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        try {
          const event = JSON.parse(payload) as Record<string, unknown>
          yield normalise(event)
        } catch {
          /* a partial frame; the next read completes it */
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      yield {
        type: 'error',
        error: { code: 'NETWORK', message: 'The response was interrupted.', retryable: true },
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}

/** The local runtime uses snake_case; the server route uses camelCase. */
function normalise(event: Record<string, unknown>): StreamEvent {
  const type = event.type as string
  if (type === 'usage') {
    return {
      type: 'usage',
      inputTokens: (event.inputTokens ?? event.input_tokens) as number | undefined,
      outputTokens: (event.outputTokens ?? event.output_tokens) as number | undefined,
      costUsd: (event.costUsd ?? event.cost_usd) as number | undefined,
    }
  }
  if (type === 'error') {
    const error = event.error as SerializedProviderError | undefined
    return {
      type: 'error',
      error: error ?? {
        code: 'PROVIDER_ERROR',
        message: 'The model failed to respond.',
        detail: event.message as string | undefined,
        retryable: true,
      },
    }
  }
  if (type === 'reasoning') return { type: 'reasoning', text: String(event.text ?? '') }
  return { type: 'text', text: String(event.text ?? '') }
}

async function errorFromResponse(response: Response, local: boolean): Promise<SerializedProviderError> {
  const body = (await response.json().catch(() => null)) as { error?: SerializedProviderError } | null
  if (body?.error) return body.error
  return {
    code: response.status === 404 ? 'MODEL_UNAVAILABLE' : 'PROVIDER_ERROR',
    message: local
      ? 'The local runtime could not complete this request.'
      : 'The request could not be completed.',
    detail: `HTTP ${response.status}`,
    retryable: response.status >= 500,
  }
}
