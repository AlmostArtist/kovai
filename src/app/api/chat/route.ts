import { randomUUID } from 'node:crypto'
import { getChatProvider } from '@/lib/providers/registry'
import { sseStream } from '@/lib/providers/http'
import { ProviderError } from '@/lib/providers/types'
import { store } from '@/lib/db'
import { fail, readJson } from '@/lib/api'
import type { ChatMessageInput, ProviderId } from '@/lib/providers/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface Body {
  providerId: ProviderId
  model: string
  messages: ChatMessageInput[]
  temperature?: number
  maxTokens?: number
  privacy?: 'PRIVATE' | 'ONLINE'
  projectId?: string
}

/**
 * Streaming chat.
 *
 * Local models are normally streamed straight from the browser to the runtime,
 * so a prompt never reaches this process. That direct call can be blocked by
 * the browser rather than by us — a page opened on the LAN URL calling loopback
 * trips CORS and Chrome's private-network rules — and when it is, the interface
 * could only report that the runtime "isn't running", which was both wrong and
 * unactionable.
 *
 * So this route also proxies local requests as a fallback. The runtime is on
 * this same machine, so the data still never leaves the device; it simply takes
 * one extra hop through the server process instead of going direct.
 */
export async function POST(req: Request) {
  let body: Body
  try {
    body = await readJson<Body>(req)
  } catch (err) {
    return fail(err)
  }

  if (body.privacy === 'PRIVATE' && body.providerId !== 'local') {
    return fail(
      new ProviderError({
        code: 'BAD_REQUEST',
        message: 'Private mode blocks cloud models.',
        detail: `Refused to send this conversation to "${body.providerId}" while private mode is on.`,
        retryable: false,
      }),
    )
  }

  if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
    return fail(
      new ProviderError({ code: 'BAD_REQUEST', message: 'A model and at least one message are required.' }),
    )
  }

  const provider = getChatProvider(body.providerId)

  return sseStream(async (emit) => {
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    let costUsd: number | undefined
    let produced = false

    for await (const chunk of provider.streamChat({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      signal: req.signal,
    })) {
      if (chunk.type === 'error') {
        emit({ type: 'error', error: chunk.error.toJSON() })
        return
      }
      if (chunk.type === 'usage') {
        inputTokens = chunk.inputTokens
        outputTokens = chunk.outputTokens
        costUsd = chunk.costUsd
        emit(chunk)
        continue
      }
      produced = true
      emit(chunk)
    }

    // Local turns are reported by the client once the stream completes, so
    // recording them here as well would double-count them.
    if (produced && body.providerId !== 'local') {
      try {
        const db = await store()
        await db.usage.record({
          id: randomUUID(),
          providerId: body.providerId,
          model: body.model,
          kind: body.messages.some((m) => m.attachments?.length) ? 'vision' : 'chat',
          inputTokens,
          outputTokens,
          costUsd,
          costUnknown: costUsd === undefined,
          projectId: body.projectId,
          createdAt: Date.now(),
        })
      } catch {
        /* usage accounting must never break a response */
      }
    }
  })
}
