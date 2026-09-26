import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Note } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const projectId = new URL(req.url).searchParams.get('projectId') ?? undefined
    const db = await store()
    return ok({ notes: await db.notes.list(projectId) })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<Note>>(req)
    const db = await store()
    const now = Date.now()
    const note: Note = {
      id: body.id ?? randomUUID(),
      title: body.title?.trim() || 'Untitled note',
      body: body.body ?? '',
      color: body.color,
      pinned: body.pinned ?? false,
      projectId: body.projectId,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    }
    return ok({ note: await db.notes.upsert(note) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
