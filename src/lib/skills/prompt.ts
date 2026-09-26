import type { Skill } from '@/lib/db/types'

/**
 * How skills reach the model.
 *
 * Two levels, the same two Claude's Agent Skills use.
 *
 * Level 1 — every enabled skill's name and description go into the system
 * prompt. That is about a line each, so a shelf of fifty costs almost nothing
 * and a skill that is never relevant never costs more than its line.
 *
 * Level 2 — the model asks for one by name, and only then does its body load.
 * Asking is a text fence rather than a tool call, because the whole point of
 * this workspace is that a local GGUF is a first-class model here and most of
 * them have no native tool calling at all.
 *
 * What is deliberately *not* here is Claude's level 3: bundled scripts run
 * through bash. That needs a sandbox to run them in, which this does not have.
 * Bundled reference files are kept and can be asked for the same way the body
 * is, but nothing is executed.
 */

export const SKILL_FENCE = /```skill\s*\n?([a-z0-9-]+)\s*\n?```/

/** The always-loaded index: one line per skill. */
export function skillIndex(skills: Skill[]): string {
  const enabled = skills.filter((s) => s.enabled)
  if (!enabled.length) return ''

  const lines = enabled.map((s) => `- ${s.name}: ${s.description}`).join('\n')

  return `## Skills available to you

These are procedures you have been given for particular kinds of work. You have their names and what each one is for, but not yet their contents.

${lines}

If one of them fits what is being asked, reply with ONLY this and nothing else:

\`\`\`skill
<name>
\`\`\`

Its instructions will come straight back to you and you then answer normally, following them. Ask for a skill only when it genuinely applies — never more than one, and never for a question you can already answer well.`
}

/** The skill the model asked for, if it asked for one and nothing else. */
export function requestedSkill(text: string, skills: Skill[]): Skill | null {
  const trimmed = text.trim()
  const match = SKILL_FENCE.exec(trimmed)
  if (!match) return null

  // Only when the fence is the whole reply. A skill named in passing inside a
  // real answer is the model talking about skills, not asking for one.
  if (trimmed.replace(SKILL_FENCE, '').trim().length > 0) return null

  return skills.find((s) => s.enabled && s.name === match[1]) ?? null
}

/** The body, as it is handed back to the model. */
export function skillBody(skill: Skill): string {
  const resources = skill.resources.length
    ? `\n\nBundled reference files you may ask for by name the same way: ${skill.resources
        .map((r) => r.path)
        .join(', ')}`
    : ''

  return `SKILL: ${skill.name}

${skill.instructions}${resources}

Follow this for the answer you are about to give. Do not mention that you loaded a skill; just do the work it describes.`
}
