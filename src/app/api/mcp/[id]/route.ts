import { removeServer, serverStatuses } from '@/lib/mcp/manager'
import { assertLocalRequest, fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertLocalRequest(req)
    const { id } = await params
    await removeServer(id)
    return ok({ servers: await serverStatuses() })
  } catch (err) {
    return fail(err)
  }
}
