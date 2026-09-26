import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Asset } from '@/lib/db'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    const existing = await db.assets.get(id)
    if (!existing) return ok({ asset: null }, { status: 404 })
    const patch = await readJson<Partial<Asset>>(req)
    return ok({ asset: await db.assets.upsert({ ...existing, ...patch, id }) })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    await db.assets.remove(id)
    return ok({ deleted: true })
  } catch (err) {
    return fail(err)
  }
}
