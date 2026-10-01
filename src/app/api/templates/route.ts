import { TEMPLATES, toPublic } from '@/lib/templates'
import { fail, ok } from '@/lib/api'

export const dynamic = 'force-dynamic'

/**
 * The template catalogue, as the interface is allowed to see it.
 *
 * Sanitised deliberately rather than incidentally: `toPublic` drops the
 * provider, the model preference list, the parameters and the prompt builder.
 * Which model draws the picture is an implementation detail of the template,
 * and the one thing guaranteed to leak it is sending it to the browser.
 */
export async function GET() {
  try {
    return ok({ templates: TEMPLATES.map(toPublic) })
  } catch (err) {
    return fail(err)
  }
}
