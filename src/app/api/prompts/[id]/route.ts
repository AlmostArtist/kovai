import { store } from '@/lib/db'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = await store()
    await db.prompts.remove(id)
    return ok({ deleted: true })
  } catch (err) {
    return fail(err)
  }
}
