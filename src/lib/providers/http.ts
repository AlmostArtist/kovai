import { ProviderError, type ProviderId } from './types'

/** fetch with a hard timeout, mapped onto ProviderError. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  providerId?: ProviderId,
): Promise<Response> {
  const { timeoutMs = 30_000, signal, ...rest } = init
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)
  const onAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    return await fetch(url, { ...rest, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted && signal?.aborted) {
      throw new ProviderError({ code: 'CANCELLED', message: 'Request cancelled.', providerId })
    }
    if (controller.signal.aborted) {
      throw new ProviderError({
        code: 'TIMEOUT',
        message: 'The request took too long.',
        providerId,
        detail: `No response within ${Math.round(timeoutMs / 1000)}s: ${url}`,
      })
    }
    throw new ProviderError({
      code: 'NETWORK',
      message: 'Could not reach the provider.',
      providerId,
      detail: err instanceof Error ? err.message : String(err),
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Parse a `text/event-stream` body into successive `data:` payloads.
 * Shared by every streaming adapter — OpenRouter and the local runtime both
 * speak SSE, so neither needs its own parser.
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '')
        buffer = buffer.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload) yield payload
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}

/** Server-Sent Events writer used by our own streaming API routes. */
export function sseStream(
  producer: (emit: (event: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      const emit = (event: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          closed = true
        }
      }
      try {
        await producer(emit)
      } catch (err) {
        emit({
          type: 'error',
          error:
            err instanceof ProviderError
              ? err.toJSON()
              : { code: 'PROVIDER_ERROR', message: 'Something went wrong.', retryable: true },
        })
      } finally {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          } catch {
            /* client already gone */
          }
          controller.close()
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
