import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Project } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    const project = await db.projects.get(id)
    if (!project) return ok({ project: null }, { status: 404 })
    const [assets, conversations] = await Promise.all([
      db.assets.list({ projectId: id }),
      db.conversations.list(id),
    ])
    return ok({ project, assets, conversations })
  } catch (err) {
    return fail(err)
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    const existing = await db.projects.get(id)
    if (!existing) return ok({ project: null }, { status: 404 })
    const patch = await readJson<Partial<Project>>(req)
    const project = await db.projects.upsert({ ...existing, ...patch, id, updatedAt: Date.now() })
    return ok({ project })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    await db.projects.remove(id)
    return ok({ deleted: true })
  } catch (err) {
    return fail(err)
  }
}
