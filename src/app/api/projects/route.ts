import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Project } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await store()
    return ok({ projects: await db.projects.list() })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<Project>>(req)
    const db = await store()
    const now = Date.now()
    const project: Project = {
      id: body.id ?? randomUUID(),
      name: body.name?.trim() || 'Untitled project',
      description: body.description,
      color: body.color,
      context: body.context ?? {},
      pinned: body.pinned ?? false,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    }
    return ok({ project: await db.projects.upsert(project) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
