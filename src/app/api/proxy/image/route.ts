import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ProviderError } from '@/lib/providers/types'
import { fail } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Reads a remote image back through this server.
 *
 * It exists for one reason: a template composite is assembled on a canvas, and
 * a canvas that has drawn a cross-origin image cannot be read back. Provider
 * outputs live on their own CDNs, so without a same-origin copy there is no
 * cutout and no composite.
 *
 * A URL fetcher that takes its URL from the caller is a server-side request
 * forgery primitive unless it is written as though it were one, so:
 *
 *   - https only. http exists on the public internet mostly as a redirect.
 *   - The hostname is resolved and every address it resolves to is checked
 *     against the private ranges before anything is opened. Checking the name
 *     is useless — `evil.com` can resolve to 169.254.169.254 — and checking
 *     after connecting is too late.
 *   - Redirects are followed by hand, one hop at a time, each re-validated.
 *     `redirect: 'follow'` would let a public URL hand off to a private one.
 *   - Only image content types come back, and only up to a size cap, so this
 *     cannot be used to pull arbitrary documents out of a private network or
 *     to exhaust memory.
 *   - Nothing from the caller reaches the upstream request. No headers, no
 *     cookies, no credentials — this is not an open relay for authenticated
 *     requests.
 */

const MAX_BYTES = 40 * 1024 * 1024
const MAX_REDIRECTS = 3

export async function GET(req: Request) {
  try {
    const target = new URL(req.url).searchParams.get('url')
    if (!target) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'No image was requested.' })
    }

    let current = await validated(target)
    let hops = 0

    for (;;) {
      const res = await fetch(current, {
        redirect: 'manual',
        headers: { accept: 'image/*' },
        signal: AbortSignal.timeout(20_000),
        cache: 'no-store',
      })

      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location')
        if (!next || ++hops > MAX_REDIRECTS) {
          throw new ProviderError({
            code: 'BAD_REQUEST',
            message: 'That image redirected too many times.',
            retryable: false,
          })
        }
        // Re-validated from scratch, because the whole point of the check is
        // that the destination may not be the one that was vouched for.
        current = await validated(new URL(next, current).toString())
        continue
      }

      if (!res.ok) {
        throw new ProviderError({
          code: 'PROVIDER_ERROR',
          message: 'That image could not be fetched.',
          detail: `The host answered ${res.status}.`,
          retryable: res.status >= 500,
        })
      }

      const type = res.headers.get('content-type') ?? ''
      if (!type.startsWith('image/')) {
        throw new ProviderError({
          code: 'BAD_REQUEST',
          message: 'That address is not an image.',
          detail: `It returned "${type || 'no content type'}".`,
          retryable: false,
        })
      }

      const declared = Number(res.headers.get('content-length') ?? '0')
      if (declared > MAX_BYTES) {
        throw new ProviderError({
          code: 'BAD_REQUEST',
          message: 'That image is too large to work with.',
          retryable: false,
        })
      }

      const bytes = new Uint8Array(await res.arrayBuffer())
      // Checked again against what actually arrived: content-length is a
      // claim, and a chunked response does not make one at all.
      if (bytes.byteLength > MAX_BYTES) {
        throw new ProviderError({
          code: 'BAD_REQUEST',
          message: 'That image is too large to work with.',
          retryable: false,
        })
      }

      return new Response(bytes, {
        headers: {
          'content-type': type,
          'content-length': String(bytes.byteLength),
          'cache-control': 'private, max-age=3600',
          'content-disposition': 'inline',
          // The copy exists to be read pixel by pixel; nothing else.
          'x-content-type-options': 'nosniff',
        },
      })
    }
  } catch (err) {
    return fail(err)
  }
}

/** Parses, checks the scheme, and refuses anything that resolves inward. */
async function validated(raw: string): Promise<string> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ProviderError({ code: 'BAD_REQUEST', message: 'That is not a valid address.' })
  }

  if (url.protocol !== 'https:') {
    throw new ProviderError({
      code: 'BAD_REQUEST',
      message: 'Only https image addresses can be loaded.',
      retryable: false,
    })
  }

  for (const address of await resolveAll(url.hostname)) {
    if (isPrivate(address)) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'That address is not reachable.',
        detail: 'It points inside a private network.',
        retryable: false,
      })
    }
  }

  return url.toString()
}

async function resolveAll(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname]
  try {
    const records = await lookup(hostname, { all: true })
    if (!records.length) throw new Error('empty')
    return records.map((r) => r.address)
  } catch {
    throw new ProviderError({
      code: 'BAD_REQUEST',
      message: 'That host could not be found.',
      retryable: false,
    })
  }
}

/**
 * Loopback, link-local, and the RFC 1918 and unique-local ranges.
 *
 * 169.254.169.254 is the one that matters most: it is where cloud providers
 * serve instance credentials to anything on the box that asks.
 */
function isPrivate(address: string): boolean {
  if (isIP(address) === 6) {
    const v6 = address.toLowerCase()
    if (v6 === '::1' || v6 === '::') return true
    if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true
    // ::ffff:10.0.0.1 and friends are v4 wearing a v6 hat.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    return mapped ? isPrivate(mapped[1]) : false
  }

  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true

  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}
