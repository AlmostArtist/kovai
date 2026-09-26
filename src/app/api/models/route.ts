import { listAllModels } from '@/lib/providers/registry'
import { fail, ok } from '@/lib/api'
import type { Capability } from '@/lib/providers/types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const capability = url.searchParams.get('capability') as Capability | null
    const privacy = url.searchParams.get('privacy')
    const runtimeUrl = url.searchParams.get('runtime') ?? undefined

    const { models, unavailable } = await listAllModels({
      capability: capability ?? undefined,
      // PRIVATE mode never even enumerates cloud text models, so they cannot be
      // selected by accident.
      includeCloudText: privacy !== 'PRIVATE',
      localRuntimeUrl: runtimeUrl,
    })

    return ok({ models, unavailable })
  } catch (err) {
    return fail(err)
  }
}
