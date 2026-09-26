import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { PromptEntry } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await store()
    return ok({ prompts: await db.prompts.list() })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<PromptEntry>>(req)
    const db = await store()
    const now = Date.now()
    const prompt: PromptEntry = {
      id: body.id ?? randomUUID(),
      title: body.title?.trim() || 'Untitled prompt',
      body: body.body ?? '',
      tags: body.tags ?? [],
      projectId: body.projectId,
      favorite: body.favorite ?? false,
      useCount: body.useCount ?? 0,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    }
    return ok({ prompt: await db.prompts.upsert(prompt) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
