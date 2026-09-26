import 'server-only'

/**
 * The daily feed.
 *
 * Plain RSS/Atom over HTTP: no API key, no account, nothing to configure before
 * it works. Feeds are fetched server-side so the browser never makes cross-origin
 * requests to publishers, and results are cached — a dashboard that refetches a
 * dozen feeds on every render is a good way to get rate-limited.
 */

export interface NewsItem {
  id: string
  title: string
  url: string
  source: string
  publishedAt: number
  summary?: string
}

/** Overridable with KOVAI_NEWS_FEEDS (comma-separated) or per-request. */
const DEFAULT_FEEDS = [
  'https://hnrss.org/frontpage',
  'https://techcrunch.com/feed/',
  'https://www.theverge.com/rss/index.xml',
]

const CACHE_MS = 15 * 60_000

interface Cache {
  at: number
  key: string
  items: NewsItem[]
}

const globalRef = globalThis as typeof globalThis & { __kovaiNews?: Cache }

export function configuredFeeds(): string[] {
  const fromEnv = process.env.KOVAI_NEWS_FEEDS?.trim()
  if (!fromEnv) return DEFAULT_FEEDS
  return fromEnv
    .split(',')
    .map((f) => f.trim())
    .filter((f) => /^https?:\/\//.test(f))
}

export async function fetchNews(
  feeds = configuredFeeds(),
  limit = 24,
  /** Skips the cache. Only ever set by an explicit request from the user. */
  force = false,
): Promise<{
  items: NewsItem[]
  failed: string[]
  cachedAt: number
}> {
  const key = feeds.join('|')
  const cached = globalRef.__kovaiNews
  if (!force && cached && cached.key === key && Date.now() - cached.at < CACHE_MS) {
    return { items: cached.items.slice(0, limit), failed: [], cachedAt: cached.at }
  }

  const failed: string[] = []
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const res = await fetch(feed, {
          headers: { 'User-Agent': 'KOVAI/0.1 (+workspace feed reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
          signal: AbortSignal.timeout(12_000),
          cache: 'no-store',
        })
        if (!res.ok) {
          failed.push(hostOf(feed))
          return []
        }
        return parseFeed(await res.text(), hostOf(feed))
      } catch {
        // One dead feed must not empty the whole dashboard.
        failed.push(hostOf(feed))
        return []
      }
    }),
  )

  const items = results
    .flat()
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 60)

  globalRef.__kovaiNews = { at: Date.now(), key, items }
  return { items: items.slice(0, limit), failed, cachedAt: Date.now() }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * A deliberately small RSS/Atom reader.
 *
 * Feeds are XML but wildly inconsistent, and a full parser is a dependency plus
 * an attack surface for something that only needs four fields. This takes the
 * four and ignores everything else.
 */
function parseFeed(xml: string, source: string): NewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)].map((m) => m[0])

  return blocks
    .map((block): NewsItem | null => {
      const title = decode(pick(block, 'title'))
      const link =
        pick(block, 'link') ||
        /<link[^>]*href=["']([^"']+)["']/.exec(block)?.[1] ||
        pick(block, 'guid')
      if (!title || !link) return null

      const dateText = pick(block, 'pubDate') || pick(block, 'updated') || pick(block, 'published')
      const published = dateText ? Date.parse(dateText) : NaN

      const summary = decode(pick(block, 'description') || pick(block, 'summary'))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      return {
        id: `${source}:${link}`,
        title: title.slice(0, 200),
        url: link.trim(),
        source,
        publishedAt: Number.isFinite(published) ? published : Date.now(),
        summary: summary ? summary.slice(0, 220) : undefined,
      }
    })
    .filter((item): item is NewsItem => Boolean(item))
    .slice(0, 20)
}

function pick(block: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(block)
  return match?.[1]?.trim() ?? ''
}

function decode(text: string): string {
  return (
    text
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      // Publishers emit numeric entities constantly — curly quotes, dashes,
      // ellipses — and a headline reading "Eight Sleep&#8217;s" is broken text.
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec: string) => safeChar(Number(dec)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Ampersand last, so a double-escaped entity is not re-decoded into markup.
      .replace(/&amp;/g, '&')
      .trim()
  )
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
}
