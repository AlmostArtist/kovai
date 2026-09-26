import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Workflow } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await store()
    return ok({ workflows: await db.workflows.list() })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<Workflow>>(req)
    const db = await store()
    const now = Date.now()
    const workflow: Workflow = {
      id: body.id ?? randomUUID(),
      name: body.name?.trim() || 'Untitled workflow',
      description: body.description,
      projectId: body.projectId,
      nodes: body.nodes ?? [],
      edges: body.edges ?? [],
      pinned: body.pinned ?? false,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    }
    return ok({ workflow: await db.workflows.upsert(workflow) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
