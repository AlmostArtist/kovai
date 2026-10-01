import { findTemplate } from '@/lib/templates'
import { createJob, serializeJob } from '@/lib/jobs/manager'
import { assertImageProviderReady, getImageProvider } from '@/lib/providers/registry'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok, readJson } from '@/lib/api'

export const dynamic = 'force-dynamic'

interface Body {
  templateId: string
  styleId: string
  /** The subject photograph, as a URL this server or the provider can read. */
  imageUrl: string
  tabId?: string
  projectId?: string
}

/**
 * Starts a template run.
 *
 * The browser sends three things — which template, which look, which photo —
 * and gets back an ordinary generation job to watch. Everything between those
 * two facts is decided here: the provider, the model, the parameters and the
 * prompt. None of it is accepted from the request, so a crafted call cannot
 * redirect a template at a different model or replace its prompt.
 *
 * Only the first leg runs on a server. Lifting the subject off the flat
 * background and setting them on the chosen scene happens in the browser, on a
 * canvas, because the result has to stay editable — the point of the template
 * is that you can still move the layer afterwards, and a flattened PNG from a
 * server cannot be moved.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req)

    const template = findTemplate(body.templateId)
    if (!template) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'That template does not exist.',
        detail: `No template with id "${body.templateId}".`,
        retryable: false,
      })
    }

    const style = template.styles.find((s) => s.id === body.styleId)
    if (!style) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'Choose a style first.',
        detail: `"${body.styleId}" is not one of this template's styles.`,
        retryable: false,
      })
    }

    if (!body.imageUrl?.trim()) {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'Upload a photo first.',
        retryable: false,
      })
    }

    assertImageProviderReady(template.providerId)
    const model = await resolveModel(template.providerId, template.models)

    const job = await createJob({
      providerId: template.providerId,
      kind: 'image',
      tabId: body.tabId,
      projectId: body.projectId,
      request: {
        model,
        prompt: template.buildPrompt({ style }),
        params: template.params,
        referenceImages: [body.imageUrl.trim()],
      },
    })

    return ok({ job: serializeJob(job) }, { status: 202 })
  } catch (err) {
    return fail(err)
  }
}

/**
 * Picks the best model the account actually has.
 *
 * The template names its preferences newest first. Listing is a catalogue
 * read, not a generation, so it costs nothing and means a newer release is
 * used the day it appears rather than the day someone remembers to edit a
 * constant. If the listing cannot be reached the first preference is used and
 * the provider gets to be the one that complains about it.
 */
async function resolveModel(providerId: 'kie', preferences: string[]): Promise<string> {
  try {
    const available = new Set((await getImageProvider(providerId).listModels()).map((m) => m.id))
    const match = preferences.find((id) => available.has(id))
    if (match) return match
  } catch {
    /* fall through to the preferred id */
  }
  return preferences[0]
}
