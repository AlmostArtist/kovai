/**
 * The SKILL.md format.
 *
 * Deliberately the same file Claude's Agent Skills use: YAML frontmatter with
 * a `name` and a `description`, then a Markdown body of instructions. A skill
 * written for Claude imports here unchanged, and one written here works there.
 *
 * The frontmatter is parsed by hand rather than with a YAML library. A skill's
 * frontmatter is two or three scalar fields — pulling in a parser that handles
 * anchors, tags and flow mappings to read `name:` would be a dependency
 * carrying far more than the job needs.
 */

export interface ParsedSkill {
  name: string
  description: string
  instructions: string
  /** Anything else in the frontmatter, kept rather than discarded. */
  extra: Record<string, string>
}

export interface SkillProblem {
  field: 'name' | 'description' | 'frontmatter'
  message: string
}

/** Claude's limits, so a skill that is valid there is valid here. */
const MAX_NAME = 64
const MAX_DESCRIPTION = 1024
const NAME_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function parseSkill(
  source: string,
): { skill: ParsedSkill; problems: SkillProblem[] } | { skill: null; problems: SkillProblem[] } {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source.trimStart())
  if (!match) {
    return {
      skill: null,
      problems: [
        {
          field: 'frontmatter',
          message:
            'A skill starts with a --- block holding its name and description. Nothing was found before the body.',
        },
      ],
    }
  }

  const [, frontmatter, body] = match
  const fields: Record<string, string> = {}
  for (const line of frontmatter.split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (!pair) continue
    fields[pair[1].toLowerCase()] = unquote(pair[2].trim())
  }

  const problems: SkillProblem[] = []
  const name = fields.name ?? ''
  const description = fields.description ?? ''

  if (!name) problems.push({ field: 'name', message: 'The frontmatter needs a name.' })
  else if (name.length > MAX_NAME)
    problems.push({ field: 'name', message: `A name is at most ${MAX_NAME} characters.` })
  else if (!NAME_SHAPE.test(name))
    problems.push({
      field: 'name',
      message: 'A name is lowercase letters, numbers and hyphens — like “writing-commit-messages”.',
    })

  if (!description)
    problems.push({
      field: 'description',
      message: 'The frontmatter needs a description. It is the only thing selection has to go on.',
    })
  else if (description.length > MAX_DESCRIPTION)
    problems.push({
      field: 'description',
      message: `A description is at most ${MAX_DESCRIPTION} characters.`,
    })

  if (problems.some((p) => p.field !== 'frontmatter' && !fields[p.field])) {
    return { skill: null, problems }
  }

  const { name: _n, description: _d, ...extra } = fields
  return {
    skill: { name, description, instructions: body.trim(), extra },
    problems,
  }
}

/** Renders a skill back out as the file it came from. */
export function toSkillFile(skill: {
  name: string
  description: string
  instructions: string
}): string {
  return `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skill.instructions}\n`
}

function unquote(value: string): string {
  const quoted = /^(['"])([\s\S]*)\1$/.exec(value)
  return quoted ? quoted[2] : value
}
