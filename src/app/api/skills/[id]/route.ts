import { store } from '@/lib/db'
import { fail, ok, readJson } from '@/lib/api'
import type { Skill } from '@/lib/db/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    const skill = await db.skills.get(id)
    if (!skill) return ok({ skill: null }, { status: 404 })
    return ok({ skill })
  } catch (err) {
    return fail(err)
  }
}

/** Turning one on or off, without touching what it says. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const body = await readJson<Partial<Skill>>(req)
    const db = await store()
    const skill = await db.skills.get(id)
    if (!skill) return ok({ skill: null }, { status: 404 })

    return ok({
      skill: await db.skills.upsert({
        ...skill,
        enabled: body.enabled ?? skill.enabled,
        updatedAt: Date.now(),
      }),
    })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const db = await store()
    await db.skills.remove(id)
    return ok({ deleted: true })
  } catch (err) {
    return fail(err)
  }
}
