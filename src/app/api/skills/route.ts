import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { parseSkill } from '@/lib/skills/format'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok, readJson } from '@/lib/api'
import type { Skill } from '@/lib/db/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await store()
    return ok({ skills: await db.skills.list() })
  } catch (err) {
    return fail(err)
  }
}

interface Body {
  /** A whole SKILL.md — the usual way one arrives. */
  source?: string
  /** Or the fields directly, for the built-in editor. */
  id?: string
  name?: string
  description?: string
  instructions?: string
  enabled?: boolean
  resources?: Skill['resources']
  origin?: Skill['origin']
}

/** Imports or updates a skill. */
export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req)
    const db = await store()

    let fields: { name: string; description: string; instructions: string }

    if (body.source) {
      const parsed = parseSkill(body.source)
      if (!parsed.skill) {
        throw new ProviderError({
          code: 'BAD_REQUEST',
          message: 'That file is not a skill.',
          detail: parsed.problems.map((p) => p.message).join(' '),
          retryable: false,
        })
      }
      fields = parsed.skill
    } else if (body.name && body.description) {
      fields = {
        name: body.name,
        description: body.description,
        instructions: body.instructions ?? '',
      }
    } else {
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: 'A skill needs a name and a description.',
        retryable: false,
      })
    }

    // Importing the same skill twice replaces it rather than making a second
    // copy — a name is the identity, exactly as it is on the filesystem.
    const existing = (await db.skills.list()).find((s) => s.name === fields.name)
    const now = Date.now()

    const skill: Skill = {
      id: body.id ?? existing?.id ?? randomUUID(),
      ...fields,
      resources: body.resources ?? existing?.resources ?? [],
      enabled: body.enabled ?? existing?.enabled ?? true,
      origin: body.origin ?? existing?.origin ?? (body.source ? 'imported' : 'written'),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    return ok({ skill: await db.skills.upsert(skill), replaced: Boolean(existing) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
