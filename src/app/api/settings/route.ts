import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { StoredSettings } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await store()
    return ok({ settings: await db.settings.read() })
  } catch (err) {
    return fail(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const patch = await readJson<Partial<StoredSettings>>(req)
    // Credentials are environment configuration, not user settings — reject any
    // attempt to smuggle one into the persisted document.
    for (const key of Object.keys(patch)) {
      if (/key|secret|token|password/i.test(key)) delete patch[key]
    }
    const db = await store()
    return ok({ settings: await db.settings.write(patch) })
  } catch (err) {
    return fail(err)
  }
}
