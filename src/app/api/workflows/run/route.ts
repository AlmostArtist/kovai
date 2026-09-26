import { store } from '@/lib/db'
import { runWorkflow } from '@/lib/workflows/engine'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok, readJson } from '@/lib/api'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const { workflowId, input } = await readJson<{ workflowId: string; input?: Record<string, unknown> }>(req)
    const db = await store()
    const workflow = await db.workflows.get(workflowId)
    if (!workflow)
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'That workflow no longer exists.' })
    if (!workflow.nodes.length)
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'Add a step before running this workflow.' })

    const run = await runWorkflow(workflow, input ?? {})
    return ok({ run })
  } catch (err) {
    return fail(err)
  }
}
