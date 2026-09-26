import { assertImageProviderReady, isImageProvider } from '@/lib/providers/registry'
import { createJob } from '@/lib/jobs/manager'
import { serializeJob } from '@/lib/jobs/manager'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok, readJson } from '@/lib/api'
import type { ProviderId } from '@/lib/providers/types'

export const dynamic = 'force-dynamic'

interface Body {
  providerId: ProviderId
  model: string
  prompt: string
  params?: Record<string, unknown>
  referenceImages?: string[]
  kind?: 'image' | 'video' | 'upscale'
  tabId?: string
  projectId?: string
}

/**
 * Starts a generation and returns immediately with a job to watch. The request
 * never waits for the provider, so the interface stays responsive and the user
 * can open another tab while the work continues.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req)

    if (!isImageProvider(body.providerId)) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'That provider cannot generate images.',
        detail: `"${body.providerId}" is not registered as a generation provider.`,
        retryable: false,
      })
    }
    assertImageProviderReady(body.providerId)

    if (!body.model) throw new ProviderError({ code: 'BAD_REQUEST', message: 'Choose a model first.' })
    if (!body.prompt?.trim())
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'Write a prompt first.' })

    const job = await createJob({
      providerId: body.providerId,
      kind: body.kind ?? 'image',
      tabId: body.tabId,
      projectId: body.projectId,
      request: {
        model: body.model,
        prompt: body.prompt.trim(),
        params: body.params ?? {},
        referenceImages: body.referenceImages,
      },
    })

    return ok({ job: serializeJob(job) }, { status: 202 })
  } catch (err) {
    return fail(err)
  }
}
