import { cancelJob, serializeJob } from '@/lib/jobs/manager'
import { fail, ok, readJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { id } = await readJson<{ id: string }>(req)
    const job = await cancelJob(id)
    return ok({ job: job ? serializeJob(job) : null })
  } catch (err) {
    return fail(err)
  }
}
