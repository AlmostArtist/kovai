import { randomUUID } from 'node:crypto'
import { store } from '@/lib/db'
import { ProviderError } from '@/lib/providers/types'
import { fail, ok, readJson } from '@/lib/api'
import type { Agent } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await store()
    return ok({ agents: await db.agents.list() })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson<Partial<Agent>>(req)
    if (!body.name?.trim()) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'Give the agent a name.' })
    }
    if (!body.providerId || !body.modelId) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'Choose a model for the agent.' })
    }

    const db = await store()
    const now = Date.now()
    const agent: Agent = {
      id: body.id ?? randomUUID(),
      name: body.name.trim(),
      avatar: body.avatar,
      description: body.description,
      role: body.role?.trim() || undefined,
      character: body.character?.trim() || undefined,
      companion: body.companion ?? false,
      placement: body.placement ?? 'right',
      instructions: body.instructions ?? '',
      providerId: body.providerId,
      modelId: body.modelId,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      // A ceiling is always present; an unbounded agent is not a feature.
      maxSteps: Math.min(Math.max(body.maxSteps ?? 6, 1), 25),
      toolIds: body.toolIds ?? [],
      projectId: body.projectId,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    }
    return ok({ agent: await db.agents.upsert(agent) }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
