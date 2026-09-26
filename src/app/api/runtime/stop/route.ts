import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { assertLocalRequest, fail, ok } from '@/lib/api'
import { LOCAL_RUNTIME_URL } from '@/lib/providers/local'

export const dynamic = 'force-dynamic'

/** Stops a runtime that KOVAI started. Runtimes started elsewhere are left alone. */
export async function POST(req: Request) {
  try {
    assertLocalRequest(req)

    // Release the resident model first. Killing the runtime on its own would
    // leave a llama-server holding several gigabytes with nothing to reclaim it
    // until the next start adopts it.
    await fetch(`${LOCAL_RUNTIME_URL}/models/unload`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {})

    const pidFile = join(process.cwd(), '.kovai', 'runtime.pid')

    let pid: number | null = null
    try {
      pid = Number((await readFile(pidFile, 'utf8')).trim())
    } catch {
      return ok({ stopped: false, reason: 'KOVAI did not start this runtime.' })
    }

    if (!pid || Number.isNaN(pid)) return ok({ stopped: false, reason: 'No runtime process recorded.' })

    try {
      // Negative pid targets the detached process group, so uvicorn stops too.
      process.kill(-pid, 'SIGTERM')
    } catch {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        return ok({ stopped: false, reason: 'The runtime process is no longer running.' })
      }
    }

    await rm(pidFile, { force: true })
    return ok({ stopped: true })
  } catch (err) {
    return fail(err)
  }
}
