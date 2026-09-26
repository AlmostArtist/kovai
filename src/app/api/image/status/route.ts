import { getJob, listJobs, serializeJob } from '@/lib/jobs/manager'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

/** One job by id, or the whole activity list when no id is given. */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (id) {
      const job = await getJob(id)
      if (!job) return ok({ job: null }, { status: 404 })
      return ok({ job: serializeJob(job) })
    }
    const jobs = await listJobs(50)
    return ok({ jobs: jobs.map(serializeJob) })
  } catch (err) {
    return fail(err)
  }
}
