import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * File intake.
 *
 * Uploads are validated by declared type *and* by their magic bytes, stored
 * under a generated name with an extension we chose, and served back with a
 * fixed Content-Type. Nothing supplied by the client is used as a path, and
 * nothing is ever executed.
 *
 * In private mode the interface does not call this at all — images are held as
 * data URLs in the browser and handed straight to the local runtime.
 */

const MAX_BYTES = 32 * 1024 * 1024

const ALLOWED: Record<string, { ext: string; magic?: number[][] }> = {
  'image/png': { ext: 'png', magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/jpeg': { ext: 'jpg', magic: [[0xff, 0xd8, 0xff]] },
  'image/webp': { ext: 'webp', magic: [[0x52, 0x49, 0x46, 0x46]] },
  'image/gif': { ext: 'gif', magic: [[0x47, 0x49, 0x46, 0x38]] },
  'image/avif': { ext: 'avif' },
  'video/mp4': { ext: 'mp4' },
  'video/webm': { ext: 'webm' },

  // Fonts, for the ones people bring themselves. Checked by signature like
  // everything else: a font file is served back to the browser and handed to
  // the text engine, so "it said it was a font" is not good enough.
  'font/woff2': { ext: 'woff2', magic: [[0x77, 0x4f, 0x46, 0x32]] },
  'font/woff': { ext: 'woff', magic: [[0x77, 0x4f, 0x46, 0x46]] },
  'application/font-woff': { ext: 'woff', magic: [[0x77, 0x4f, 0x46, 0x46]] },
  'font/ttf': { ext: 'ttf', magic: [[0x00, 0x01, 0x00, 0x00], [0x74, 0x72, 0x75, 0x65]] },
  'font/otf': { ext: 'otf', magic: [[0x4f, 0x54, 0x54, 0x4f]] },
  'application/x-font-ttf': { ext: 'ttf', magic: [[0x00, 0x01, 0x00, 0x00]] },
}

export async function POST(req: Request) {
  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'No file was received.' })
    }

    const spec = ALLOWED[file.type]
    if (!spec) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'That file type is not supported.',
        detail: `Received "${file.type || 'unknown'}". Supported: ${Object.keys(ALLOWED).join(', ')}.`,
        retryable: false,
      })
    }
    if (file.size > MAX_BYTES) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: `Files must be under ${MAX_BYTES / 1024 / 1024} MB.`,
        detail: `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
        retryable: false,
      })
    }

    const bytes = Buffer.from(await file.arrayBuffer())

    // A declared MIME type is a claim, not evidence.
    if (spec.magic && !spec.magic.some((sig) => sig.every((b, i) => bytes[i] === b))) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'That file does not match its declared type.',
        detail: 'The contents are not a valid image for the given MIME type.',
        retryable: false,
      })
    }

    const name = `${randomUUID()}.${spec.ext}`
    const dir = join(process.cwd(), '.kovai', 'uploads')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, name), bytes)

    return ok({
      url: `/api/files/${name}`,
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    })
  } catch (err) {
    return fail(err)
  }
}
