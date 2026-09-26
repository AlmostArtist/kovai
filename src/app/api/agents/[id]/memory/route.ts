import { store } from '@/lib/db'
import { remember } from '@/lib/agents/companion'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok, readJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Everything this agent remembers, oldest first. */
export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const limit = Number(new URL(req.url).searchParams.get('limit') ?? 200)
    const db = await store()
    return ok({ memories: await db.agents.memories(id, Math.min(Math.max(limit, 1), 500)) })
  } catch (err) {
    return fail(err)
  }
}

/** Adds a standing note — something the agent should keep past this session. */
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await readJson<{ content?: string }>(req)
    if (!body.content?.trim()) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'Write something to remember.' })
    }
    return ok(
      { memory: await remember(id, { kind: 'note', content: body.content.trim() }) },
      { status: 201 },
    )
  } catch (err) {
    return fail(err)
  }
}

/** One memory with `?memoryId=`, otherwise everything this agent knows. */
export async function DELETE(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const memoryId = new URL(req.url).searchParams.get('memoryId')
    const db = await store()
    if (memoryId) {
      await db.agents.removeMemory(memoryId)
      return ok({ deleted: memoryId })
    }
    await db.agents.clearMemory(id)
    return ok({ cleared: true })
  } catch (err) {
    return fail(err)
  }
}
