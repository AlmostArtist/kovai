import { configuredFeeds, fetchNews } from '@/lib/news'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * The dashboard feed. Cached server-side; a failed source is named rather than
 * silently dropped, so an empty column is never a mystery.
 */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams
    const limit = Math.min(Number(params.get('limit') ?? 12) || 12, 40)
    const custom = params.get('feeds')?.split(',').filter((f) => /^https?:\/\//.test(f))
    // Pressing refresh should actually refetch, not hand back the same cache.
    const force = params.get('refresh') === '1'

    const { items, failed, cachedAt } = await fetchNews(
      custom?.length ? custom : configuredFeeds(),
      limit,
      force,
    )
    return ok({ items, failed, cachedAt, sources: (custom?.length ? custom : configuredFeeds()).length })
  } catch (err) {
    return fail(err)
  }
}
