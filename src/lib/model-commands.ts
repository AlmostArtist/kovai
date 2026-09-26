import type { Skill } from './db/types'
import type { AIModel } from './providers/types'

/**
 * Everything typeable at the start of a message.
 *
 * `/` is skills and `//` is models. Two prefixes rather than one list, because
 * the two are different kinds of decision: there are a handful of skills and
 * naming one is deliberate, while there are hundreds of models and the right
 * one is usually already selected. Giving models the longer prefix keeps the
 * short one for the thing you actually reach for.
 *
 * Both lists are derived from live state rather than written by hand, so a
 * model a provider adds or a skill you import becomes typeable with no code
 * change, and one that disappears stops being offered.
 */

/** Models answer to `//`, skills to `/`. */
export const MODEL_PREFIX = '//'
export const SKILL_PREFIX = '/'

export interface ModelCommand {
  kind: 'model'
  /** Including the leading slash. */
  command: string
  model: AIModel
  /** Image and video models generate; chat models answer. */
  generates: boolean
}

export interface SkillCommand {
  kind: 'skill'
  command: string
  skill: Skill
}

export type Command = ModelCommand | SkillCommand

/**
 * `Nano Banana` and `SOUL V2` become `nanobanana` and `soulv2`.
 *
 * The name is the source, not the id: half the catalogue's ids end in a
 * workflow word rather than a model name — `soul-2/generate`,
 * `wan-3/text-to-video` — and slugging those would give a dozen models the same
 * unusable `/generate`. A leading vendor prefix is dropped so OpenRouter's
 * "Google: Gemini 2.5 Flash" is reachable as `/gemini25flash`.
 */
function slug(model: AIModel): string {
  const withoutVendor = model.name.replace(/^[^:]{1,24}:\s*/, '')
  const tail = model.id.includes('/') ? model.id.slice(model.id.lastIndexOf('/') + 1) : model.id
  const source = withoutVendor.trim() || tail

  return source
    .toLowerCase()
    .replace(/\.gguf$/, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
}

const GENERATIVE = new Set(['IMAGE_GENERATION', 'IMAGE_EDITING', 'VIDEO_GENERATION'])

export function buildModelCommands(models: AIModel[]): ModelCommand[] {
  const used = new Map<string, number>()

  return models
    .map((model) => {
      const base = slug(model)
      if (!base) return null

      // Two providers can offer the same name; the second gets a suffix rather
      // than silently shadowing the first.
      const seen = used.get(base) ?? 0
      used.set(base, seen + 1)
      const command = seen === 0 ? base : `${base}${seen + 1}`

      return {
        kind: 'model' as const,
        command: `${MODEL_PREFIX}${command}`,
        model,
        generates: model.capabilities.some((c) => GENERATIVE.has(c)),
      }
    })
    .filter((entry): entry is ModelCommand => Boolean(entry))
}

/**
 * Skills, as slash commands.
 *
 * A skill's name is already lowercase and hyphenated, so it is typeable as it
 * stands — `/writing-image-prompts`.
 */
export function buildSkillCommands(skills: Skill[]): SkillCommand[] {
  return skills
    .filter((skill) => skill.enabled)
    .map((skill) => ({ kind: 'skill' as const, command: `${SKILL_PREFIX}${skill.name}`, skill }))
}

/**
 * Both lists. Names cannot collide across them any more — the prefix is part of
 * the command — so a skill and a model may share a word without either losing.
 */
export function buildCommands(models: AIModel[], skills: Skill[]): Command[] {
  return [...buildSkillCommands(skills), ...buildModelCommands(models)]
}

/** Parses `//soul a red bicycle` or `/writing-image-prompts a cyclist`. */
export function parseCommand(
  draft: string,
  commands: Command[],
): { command: Command; rest: string } | null {
  const match = /^(\/{1,2}[a-z0-9-]+)(?:\s+([\s\S]*))?$/i.exec(draft.trim())
  if (!match) return null
  const found = commands.find((c) => c.command === match[1].toLowerCase())
  return found ? { command: found, rest: (match[2] ?? '').trim() } : null
}

/**
 * What to offer while a command is still being typed.
 *
 * The prefix decides which list is searched, so typing a second slash swaps the
 * menu from skills to models under your hands rather than filtering a mixed
 * list down to nothing.
 */
export function matchCommands(draft: string, commands: Command[]): Command[] {
  const match = /^(\/{1,2})([a-z0-9-]*)$/i.exec(draft.trim())
  if (!match) return []

  const [, prefix, term] = match
  const wanted = prefix === MODEL_PREFIX ? 'model' : 'skill'

  return commands
    .filter((c) => c.kind === wanted && c.command.slice(prefix.length).startsWith(term.toLowerCase()))
    .slice(0, 8)
}
