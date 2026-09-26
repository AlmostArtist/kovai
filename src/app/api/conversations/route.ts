import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Conversation } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** How many conversations History asks for at a time. */
const PAGE = 200

/**
 * The conversation list.
 *
 * With `?summaries=1` each row also carries what History needs to show a
 * conversation without opening it: the opening line, the number of turns, and
 * which model answered. That means reading each conversation's messages, which
 * is one query per row — acceptable because this is a single user's own library
 * and the page is capped, and much simpler than a denormalised counter that can
 * drift from the messages it counts.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const projectId = url.searchParams.get('projectId') ?? undefined
    const db = await store()
    const conversations = await db.conversations.list(projectId)

    if (url.searchParams.get('summaries') !== '1') return ok({ conversations })

    const page = conversations.slice(0, PAGE)
    const summaries = await Promise.all(
      page.map(async (conversation) => {
        const messages = await db.conversations.messages(conversation.id)
        const opening = messages.find((m) => m.role === 'user')
        const answered = [...messages].reverse().find((m) => m.model)
        return {
          ...conversation,
          messageCount: messages.length,
          preview: opening?.content.slice(0, 220) ?? '',
          model: answered?.model,
          providerId: answered?.providerId,
        }
      }),
    )

    return ok({ conversations: summaries, total: conversations.length })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<Conversation>>(req)
    const db = await store()
    const now = Date.now()
    const conversation: Conversation = {
      id: body.id ?? randomUUID(),
      title: body.title?.trim() || 'New conversation',
      projectId: body.projectId,
      tabId: body.tabId,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    }
    return ok({ conversation: await db.conversations.upsert(conversation) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
