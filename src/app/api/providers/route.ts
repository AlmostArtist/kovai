import { getProviderStates } from '@/lib/providers/registry'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * Connection state for every provider. Deliberately returns no secrets — not
 * even masked ones. The interface shows "Connected" or a setup state, and the
 * key itself never leaves the environment.
 */
export async function GET() {
  try {
    return ok({ providers: await getProviderStates() })
  } catch (err) {
    return fail(err)
  }
}
