import { store } from '@/lib/db'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    const workflow = await db.workflows.get(id)
    if (!workflow) return ok({ workflow: null }, { status: 404 })
    return ok({ workflow, runs: await db.workflows.runs(id) })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    await db.workflows.remove(id)
    return ok({ deleted: true })
  } catch (err) {
    return fail(err)
  }
}
