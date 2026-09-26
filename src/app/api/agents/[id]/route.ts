import { store } from '@/lib/db'
import { listRuns } from '@/lib/agents/runner'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    const agent = await db.agents.get(id)
    if (!agent) return ok({ agent: null }, { status: 404 })
    return ok({ agent, runs: await listRuns(id, 20) })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    await db.agents.remove(id)
    return ok({ deleted: true })
  } catch (err) {
    return fail(err)
  }
}
