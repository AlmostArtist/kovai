import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { StoredMessage } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    const conversation = await db.conversations.get(id)
    if (!conversation) return ok({ conversation: null }, { status: 404 })
    return ok({ conversation, messages: await db.conversations.messages(id) })
  } catch (err) {
    return fail(err)
  }
}

/** Append a message. Called once a turn completes, not per streamed token. */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await readJson<Partial<StoredMessage>>(req)
    const db = await store()
    const message: StoredMessage = {
      id: body.id ?? randomUUID(),
      conversationId: id,
      role: body.role ?? 'user',
      content: body.content ?? '',
      reasoning: body.reasoning,
      attachments: body.attachments,
      providerId: body.providerId,
      model: body.model,
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      costUsd: body.costUsd,
      error: body.error,
      createdAt: body.createdAt ?? Date.now(),
    }
    return ok({ message: await db.conversations.addMessage(message) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    await db.conversations.remove(id)
    return ok({ deleted: true })
  } catch (err) {
    return fail(err)
  }
}
