import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Task } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams
    const done = params.get('done')
    const db = await store()
    return ok({
      tasks: await db.tasks.list({
        projectId: params.get('projectId') ?? undefined,
        done: done === null ? undefined : done === 'true',
      }),
    })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<Task>>(req)
    const db = await store()
    const task: Task = {
      id: body.id ?? randomUUID(),
      title: body.title?.trim() || 'Untitled task',
      notes: body.notes,
      done: body.done ?? false,
      dueAt: body.dueAt,
      priority: body.priority ?? 'normal',
      projectId: body.projectId,
      createdAt: body.createdAt ?? Date.now(),
      // Recorded when it flips to done, so "completed today" is answerable.
      completedAt: body.done ? (body.completedAt ?? Date.now()) : undefined,
    }
    return ok({ task: await db.tasks.upsert(task) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
