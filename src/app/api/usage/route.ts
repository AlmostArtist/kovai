import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { ProviderId } from '@/lib/providers/types'

export const dynamic = 'force-dynamic'

/**
 * Usage is reported, never estimated. When a provider does not publish a price
 * for a call, the record carries costUnknown and the interface says so rather
 * than inventing a number.
 */
export async function GET(req: Request) {
  try {
    const days = Number(new URL(req.url).searchParams.get('days') ?? '1')
    const since = Date.now() - Math.max(1, days) * 24 * 60 * 60_000
    const db = await store()
    const records = await db.usage.since(since)

    const byProvider = new Map<
      ProviderId,
      { providerId: ProviderId; calls: number; images: number; tokens: number; costUsd: number; costUnknown: number }
    >()
    const byKind = new Map<string, number>()

    for (const r of records) {
      const entry = byProvider.get(r.providerId) ?? {
        providerId: r.providerId,
        calls: 0,
        images: 0,
        tokens: 0,
        costUsd: 0,
        costUnknown: 0,
      }
      entry.calls += 1
      entry.images += r.images ?? 0
      entry.tokens += (r.inputTokens ?? 0) + (r.outputTokens ?? 0)
      if (typeof r.costUsd === 'number') entry.costUsd += r.costUsd
      else entry.costUnknown += 1
      byProvider.set(r.providerId, entry)
      byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1)
    }

    return ok({
      since,
      totals: {
        calls: records.length,
        images: records.reduce((n, r) => n + (r.images ?? 0), 0),
        tokens: records.reduce((n, r) => n + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0),
        costUsd: records.reduce((n, r) => n + (r.costUsd ?? 0), 0),
        costUnknownCount: records.filter((r) => r.costUnknown).length,
      },
      byProvider: [...byProvider.values()].sort((a, b) => b.calls - a.calls),
      byKind: Object.fromEntries(byKind),
    })
  } catch (err) {
    return fail(err)
  }
}

/**
 * Records a turn that never passed through this server.
 *
 * Local inference is streamed straight from the browser to the runtime, so the
 * only way the ledger can account for it is if the client says so afterwards.
 * Counts and model name only — no prompt, no response, nothing about content.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<{
      providerId: ProviderId
      model: string
      kind: 'chat' | 'vision' | 'embeddings'
      inputTokens?: number
      outputTokens?: number
      projectId?: string
    }>(req)

    // This route exists for the local path; cloud usage is recorded server-side
    // where the real cost is known, and is not accepted from a client.
    if (body.providerId !== 'local') return ok({ recorded: false })

    const db = await store()
    await db.usage.record({
      id: randomUUID(),
      providerId: 'local',
      model: body.model || 'unknown',
      kind: body.kind ?? 'chat',
      inputTokens: body.inputTokens,
      outputTokens: body.outputTokens,
      // Local inference has no marginal cost, and that is a fact, not an estimate.
      costUsd: 0,
      costUnknown: false,
      projectId: body.projectId,
      createdAt: Date.now(),
    })
    return ok({ recorded: true })
  } catch (err) {
    return fail(err)
  }
}
