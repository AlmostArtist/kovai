import { store } from '@/lib/db'
import { cancelRun, getRun, listRuns, startRun } from '@/lib/agents/runner'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok, readJson } from '@/lib/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Starts a run and returns immediately; the work continues in the background. */
export async function POST(req: Request) {
  try {
    const { agentId, input } = await readJson<{ agentId: string; input: string }>(req)
    const db = await store()
    const agent = await db.agents.get(agentId)
    if (!agent) throw new ProviderError({ code: 'BAD_REQUEST', message: 'That agent no longer exists.' })
    if (!input?.trim()) throw new ProviderError({ code: 'BAD_REQUEST', message: 'Give the agent something to do.' })

    return ok({ run: await startRun(agent, input.trim()) }, { status: 202 })
  } catch (err) {
    return fail(err)
  }
}

/** One run by id, or the recent list. */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams
    const id = params.get('id')
    if (id) {
      const run = getRun(id)
      if (run) return ok({ run })
      const [stored] = await listRuns(undefined, 50).then((runs) => runs.filter((r) => r.id === id))
      return ok({ run: stored ?? null }, { status: stored ? 200 : 404 })
    }
    return ok({ runs: await listRuns(params.get('agentId') ?? undefined, 30) })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) throw new ProviderError({ code: 'BAD_REQUEST', message: 'Which run should be cancelled?' })
    return ok({ run: await cancelRun(id) })
  } catch (err) {
    return fail(err)
  }
}
