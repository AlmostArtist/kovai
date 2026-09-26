import { LocalProvider, LOCAL_RUNTIME_URL } from '@/lib/providers/local'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Server-side view of the local runtime. The browser also probes the runtime
 * directly; this route exists so desktop/Tauri and server-side routing can
 * answer the same question.
 */
export async function GET(req: Request) {
  try {
    const base = new URL(req.url).searchParams.get('url') ?? LOCAL_RUNTIME_URL
    const provider = new LocalProvider(base)
    const status = await provider.status()
    if (status.state !== 'READY') return ok({ status, system: null, models: [] })

    const [system, models] = await Promise.all([
      provider.system().catch(() => null),
      provider.listModels().catch(() => []),
    ])
    return ok({ status, system, models })
  } catch (err) {
    return fail(err)
  }
}
