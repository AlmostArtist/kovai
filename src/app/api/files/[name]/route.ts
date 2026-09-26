import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

/** Serves uploaded files. Names are UUID.ext by construction, and enforced here. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params

    // Only names this server generated can be read — no traversal, no surprises.
    const match = /^[0-9a-f-]{36}\.([a-z0-9]{2,5})$/i.exec(name)
    const contentType = match ? TYPES[match[1].toLowerCase()] : undefined
    if (!contentType) return ok({ error: 'Not found' }, { status: 404 })

    const bytes = await readFile(join(process.cwd(), '.kovai', 'uploads', name))
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT')
      return ok({ error: 'Not found' }, { status: 404 })
    return fail(err)
  }
}
