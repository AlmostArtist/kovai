import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { assertLocalRequest, fail, ok } from '@/lib/api'
import { ProviderError } from '@/lib/providers/types'

export const dynamic = 'force-dynamic'

/**
 * Starts the local FastAPI runtime.
 *
 * A browser cannot start an operating-system process, and it should not be able
 * to. This works because the Next.js server is itself running on the user's
 * machine in the intended setup, and it is guarded three ways: the request must
 * originate from localhost, the environment must not have opted out, and the
 * command is fixed — nothing from the request is ever interpolated into it.
 *
 * In the Tauri desktop build the shell handles this natively instead; see
 * src-tauri/src/runtime.rs.
 *
 * The script's output is captured to .kovai/runtime.log. A detached process has
 * no terminal to look at, so discarding it would leave a failed start with no
 * explanation — the log is what the interface reads back to show progress and
 * to say what went wrong.
 */
export async function POST(req: Request) {
  try {
    assertLocalRequest(req)

    if (process.env.KOVAI_ALLOW_RUNTIME_SPAWN === '0') {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'Starting the runtime from the interface is disabled.',
        detail: 'Run scripts/start-local.sh manually, or unset KOVAI_ALLOW_RUNTIME_SPAWN.',
        retryable: false,
      })
    }

    const isWindows = process.platform === 'win32'
    const script = join(process.cwd(), 'scripts', isWindows ? 'start-local.bat' : 'start-local.sh')

    // Truncate first, so the log describes this attempt and not the last one.
    await mkdir(join(process.cwd(), '.kovai'), { recursive: true })
    const logPath = join(process.cwd(), '.kovai', 'runtime.log')
    await writeFile(logPath, `Starting the local runtime — ${new Date().toISOString()}\n`, 'utf8')

    const log = openSync(logPath, 'a')
    let child
    try {
      child = spawn(isWindows ? 'cmd.exe' : '/bin/bash', isWindows ? ['/c', script] : [script], {
        cwd: process.cwd(),
        detached: true,
        stdio: ['ignore', log, log],
        env: { ...process.env, KOVAI_RUNTIME_ONLY: '1' },
      })
      child.unref()
    } finally {
      // The child holds its own duplicate of the descriptor.
      closeSync(log)
    }

    if (child.pid) {
      await writeFile(join(process.cwd(), '.kovai', 'runtime.pid'), String(child.pid), 'utf8')
    }

    // First launch builds a virtual environment and installs dependencies,
    // which can take minutes. The client polls status and reads the log for
    // progress rather than us holding the request open.
    return ok({ started: true, pid: child.pid ?? null, log: '.kovai/runtime.log' })
  } catch (err) {
    return fail(err)
  }
}
