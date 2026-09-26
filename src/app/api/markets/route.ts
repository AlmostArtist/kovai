import { fetchMarkets } from '@/lib/markets'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days') ?? 30) || 30, 1), 365)
    const { markets, cachedAt } = await fetchMarkets(days)
    return ok({ markets, cachedAt, days })
  } catch (err) {
    return fail(err)
  }
}
