import { store } from '@/lib/db'
import { speak, type CompanionContext, type CompanionReason } from '@/lib/agents/companion'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok, readJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

interface Body {
  agentId?: string
  reason?: CompanionReason
  message?: string
  context?: CompanionContext
}

/** One turn of a companion conversation. */
export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req)
    if (!body.agentId) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'Which agent should speak?' })
    }

    const db = await store()
    const agent = await db.agents.get(body.agentId)
    if (!agent) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'That agent no longer exists.',
        retryable: false,
      })
    }

    const turn = await speak({
      agent,
      reason: body.reason ?? 'reply',
      message: body.message,
      context: body.context,
    })

    return ok(turn)
  } catch (err) {
    return fail(err)
  }
}
