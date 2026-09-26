import 'server-only'

/**
 * Live market data, from sources that need no API key.
 *
 * Bitcoin comes from CoinGecko, which publishes both a spot price and a price
 * series. Gold is awkward: the free spot feed has no history, so the current
 * price and the trend line come from different places — and the interface says
 * so rather than implying one number produced the whole chart.
 */

export interface MarketPoint {
  at: number
  value: number
}

export interface Market {
  id: 'gold' | 'bitcoin'
  label: string
  symbol: string
  price: number | null
  currency: string
  changePct: number | null
  series: MarketPoint[]
  /** Named in the interface whenever it is not the same source as `price`. */
  seriesSource?: string
  priceSource: string
  error?: string
}

const CACHE_MS = 5 * 60_000
const globalRef = globalThis as typeof globalThis & { __kovaiMarkets?: { at: number; data: Market[] } }

export async function fetchMarkets(days = 30): Promise<{ markets: Market[]; cachedAt: number }> {
  const cached = globalRef.__kovaiMarkets
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { markets: cached.data, cachedAt: cached.at }
  }

  const [bitcoin, gold] = await Promise.all([fetchBitcoin(days), fetchGold(days)])
  const markets = [gold, bitcoin]
  globalRef.__kovaiMarkets = { at: Date.now(), data: markets }
  return { markets, cachedAt: Date.now() }
}

async function get(url: string, timeoutMs = 12_000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'KOVAI/0.1 (+workspace market widget)', Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`${new URL(url).hostname} responded ${res.status}`)
  return res.json()
}

function toSeries(raw: unknown): MarketPoint[] {
  const prices = (raw as { prices?: [number, number][] })?.prices ?? []
  return prices
    .filter((p) => Array.isArray(p) && Number.isFinite(p[1]))
    .map(([at, value]) => ({ at, value }))
}

function changeOver(series: MarketPoint[]): number | null {
  if (series.length < 2) return null
  const first = series[0].value
  const last = series[series.length - 1].value
  return first === 0 ? null : ((last - first) / first) * 100
}

async function fetchBitcoin(days: number): Promise<Market> {
  const base: Market = {
    id: 'bitcoin',
    label: 'Bitcoin',
    symbol: 'BTC',
    price: null,
    currency: 'USD',
    changePct: null,
    series: [],
    priceSource: 'coingecko.com',
  }

  try {
    const [chart, spot] = await Promise.all([
      get(
        `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`,
      ),
      get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true'),
    ])

    const series = toSeries(chart)
    const simple = (spot as { bitcoin?: { usd?: number; usd_24h_change?: number } }).bitcoin
    return {
      ...base,
      series,
      price: simple?.usd ?? series.at(-1)?.value ?? null,
      // The 24h move is what people mean by "up today", not the window change.
      changePct: simple?.usd_24h_change ?? changeOver(series),
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : 'Unavailable.' }
  }
}

async function fetchGold(days: number): Promise<Market> {
  const base: Market = {
    id: 'gold',
    label: 'Gold',
    symbol: 'XAU',
    price: null,
    currency: 'USD',
    changePct: null,
    series: [],
    priceSource: 'gold-api.com',
  }

  // The spot feed and the history come from different places, so they are
  // fetched — and reported — separately.
  const spot = await get('https://api.gold-api.com/price/XAU')
    .then((raw) => (raw as { price?: number }).price ?? null)
    .catch(() => null)

  let series: MarketPoint[] = []
  let seriesSource: string | undefined
  try {
    // PAX Gold is redeemable for one troy ounce, so its price tracks spot
    // closely and is the only keyless gold series available. Labelled as the
    // proxy it is rather than passed off as spot XAU.
    series = toSeries(
      await get(
        `https://api.coingecko.com/api/v3/coins/pax-gold/market_chart?vs_currency=usd&days=${days}&interval=daily`,
      ),
    )
    seriesSource = 'PAX Gold (1 oz-backed token), coingecko.com'
  } catch {
    series = []
  }

  return {
    ...base,
    price: spot,
    series,
    seriesSource,
    changePct: changeOver(series),
    error: spot === null && !series.length ? 'No gold source could be reached.' : undefined,
  }
}
