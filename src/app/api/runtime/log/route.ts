import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertLocalRequest, fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * The tail of the local runtime's startup log.
 *
 * A detached process has no terminal, so this is the only window into what a
 * slow or failed start is actually doing — creating a virtual environment,
 * installing dependencies, or stopping on an error worth showing the user.
 */
export async function GET(req: Request) {
  try {
    assertLocalRequest(req)

    let raw: string
    try {
      raw = await readFile(join(process.cwd(), '.kovai', 'runtime.log'), 'utf8')
    } catch {
      return ok({ lines: [], status: null })
    }

    const lines = stripAnsi(raw)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    return ok({
      lines: lines.slice(-40),
      // A fatal line wins; otherwise the latest line that says something.
      status:
        lines.find((line) => line.startsWith('[kovai] FAILED:'))?.replace('[kovai] FAILED: ', '') ??
        lines.filter((line) => !line.startsWith('INFO:')).at(-1) ??
        lines.at(-1) ??
        null,
      // The script announces a fatal stop with a sentinel, so this does not
      // have to guess from words like "error" that appear in ordinary output.
      failed: lines.some((line) => line.startsWith('[kovai] FAILED:')) || raw.includes('Traceback (most recent call last)'),
    })
  } catch (err) {
    return fail(err)
  }
}

/** The script prints dim colour codes; they are noise in a web interface. */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001B\[[0-9;]*m/g, '')
}
