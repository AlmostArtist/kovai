import 'server-only'

import { randomUUID } from 'node:crypto'
import { getChatProvider } from '../providers/registry'
import { store } from '../db'
import type { Agent, AgentMemory } from '../db/types'
import { ProviderError } from '../providers/types'
import type { ChatMessageInput, ProviderId } from '../providers/types'

/**
 * The companion voice.
 *
 * An agent on the rail is the same configuration as an agent that runs tasks —
 * same model, same standing instructions — speaking in short turns about what
 * is happening on screen rather than executing a job. The difference is entirely
 * in the prompt and the ceiling: a remark, not a report.
 *
 * Two things keep this from being a gimmick. It is answered by the agent's own
 * model, so it is never a canned line from a list. And every exchange is kept,
 * so the agent that asks about your prompt this afternoon is the one that
 * remembers what you were making this morning.
 */

/**
 * Token ceiling for one bubble.
 *
 * Far higher than a two-sentence reply needs, because a reasoning model spends
 * this budget thinking before it writes anything: at 160 the whole allowance
 * went on deliberation and the bubble came back empty. The length of what is
 * actually said is controlled by stopping early, below, not by starving the
 * model of room to answer.
 */
const MAX_TOKENS = 512

/** Enough said. A bubble is two sentences, not a paragraph. */
function enough(text: string): boolean {
  if (text.length > 300) return true
  const sentences = text.match(/[.!?](\s|$)/g)?.length ?? 0
  return sentences >= 2 && text.trim().length > 40
}

/** How much of its own past an agent is reminded of before it speaks. */
const RECALLED_TURNS = 14

export type CompanionReason =
  /** Woken by a tap — it should greet and offer something. */
  | 'greeting'
  /** It noticed the work and chose to say something unprompted. */
  | 'idle'
  /** The user said something to it. */
  | 'reply'

export interface CompanionContext {
  /** Which workspace is open: chat, create, vision… */
  workspace?: string
  /** The tab's title, which is usually the subject of the work. */
  tabTitle?: string
  /** What the user is part-way through writing, if anything. */
  draft?: string
  /** The name KOVAI calls the user. */
  userName?: string
}

export interface CompanionTurn {
  reply: string
  memories: AgentMemory[]
}

export async function speak(input: {
  agent: Agent
  reason: CompanionReason
  message?: string
  context?: CompanionContext
}): Promise<CompanionTurn> {
  const { agent, reason, context } = input
  const db = await store()

  const history = await db.agents.memories(agent.id, RECALLED_TURNS)
  const notes = history.filter((m) => m.kind === 'note')
  const turns = history.filter((m) => m.kind === 'message')

  const messages: ChatMessageInput[] = [
    { role: 'system', content: systemPrompt(agent, notes, context) },
    ...turns.map((m) => ({
      role: m.role === 'agent' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
    { role: 'user', content: turnPrompt(reason, input.message, context) },
  ]

  // Stopping the stream once the thought is complete is what keeps a bubble a
  // bubble, and stops a local model narrating for another thirty seconds after
  // it has already made its point.
  const controller = new AbortController()
  let text = ''
  let deliberated = false
  try {
    for await (const chunk of getChatProvider(agent.providerId as ProviderId).streamChat({
      model: agent.modelId,
      messages,
      temperature: agent.temperature ?? 0.8,
      maxTokens: MAX_TOKENS,
      signal: controller.signal,
    })) {
      if (chunk.type === 'text') {
        text += chunk.text
        if (enough(text)) break
      } else if (chunk.type === 'reasoning') {
        deliberated = true
      } else if (chunk.type === 'error') {
        throw chunk.error
      }
    }
  } finally {
    controller.abort()
  }

  if (!text.trim() && deliberated) {
    throw new ProviderError({
      code: 'PROVIDER_ERROR',
      message: `${agent.name} thought about it but never got to an answer.`,
      providerId: agent.providerId as ProviderId,
      detail:
        'The model spent its whole reply budget reasoning. A model that thinks less, or a shorter character description, will fix it.',
    })
  }

  const reply = tidy(text)
  const saved: AgentMemory[] = []

  // The user's side is only worth keeping when they actually said something;
  // an unprompted remark has no question behind it to remember.
  if (input.message?.trim()) {
    saved.push(
      await remember(agent.id, {
        kind: 'message',
        role: 'user',
        content: input.message.trim(),
        context: describe(context),
      }),
    )
  }
  if (reply) {
    saved.push(
      await remember(agent.id, {
        kind: 'message',
        role: 'agent',
        content: reply,
        context: reason === 'idle' ? describe(context) : undefined,
      }),
    )
  }

  return { reply, memories: saved }
}

/** Files something the agent should keep beyond this conversation. */
export async function remember(
  agentId: string,
  memory: Omit<AgentMemory, 'id' | 'agentId' | 'createdAt'>,
): Promise<AgentMemory> {
  const db = await store()
  return db.agents.addMemory({
    id: randomUUID(),
    agentId,
    createdAt: Date.now(),
    ...memory,
  })
}

function systemPrompt(agent: Agent, notes: AgentMemory[], context?: CompanionContext): string {
  const lines = [
    `You are ${agent.name}${agent.role ? `, the ${agent.role}` : ''}, sitting alongside ${
      context?.userName?.trim() || 'the person'
    } inside KOVAI, a creative workspace.`,
  ]

  if (agent.character?.trim()) lines.push(`Your character: ${agent.character.trim()}`)
  if (agent.instructions.trim()) lines.push(agent.instructions.trim())

  lines.push(
    `Reply in one or two sentences, forty words at most. Plain text: no lists, no markdown, no stage directions.`,
    `You are a colleague, not an assistant waiting for orders. Have an opinion. Never read their own screen back to them, and never ask how you can help.`,
  )

  if (notes.length) {
    lines.push(
      `What you remember about them:\n${notes.map((n) => `- ${n.content}`).join('\n')}`,
    )
  }

  return lines.join('\n\n')
}

function turnPrompt(
  reason: CompanionReason,
  message: string | undefined,
  context?: CompanionContext,
): string {
  const scene = describe(context)
  const where = scene ? `\n\nRight now: ${scene}` : ''

  switch (reason) {
    case 'greeting':
      return `They just tapped you awake. Say hello in your own voice and, if the scene below gives you something to go on, offer one specific thought about it.${where}`
    case 'idle':
      return `They have been working for a while and you have been watching. Say one unprompted thing — an observation, a question, a nudge, or a joke if that is who you are. Do not ask how you can help.${where}`
    default:
      return `They said to you: "${message ?? ''}"${where}`
  }
}

/** The scene, in one line, as the agent is told it. */
function describe(context?: CompanionContext): string {
  if (!context) return ''
  const parts: string[] = []
  if (context.workspace) parts.push(`they are in the ${context.workspace} workspace`)
  if (context.tabTitle) parts.push(`working on “${context.tabTitle}”`)
  if (context.draft?.trim()) parts.push(`part-way through writing: “${context.draft.trim()}”`)
  return parts.join(', ')
}

/**
 * Trims a bubble down to what fits in one.
 *
 * Small models like to open with a stage direction or wrap the line in quotes,
 * and a long answer is a paragraph floating over the interface rather than a
 * remark. Both are cut here rather than only asked against in the prompt.
 */
function tidy(text: string): string {
  let reply = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[*_]{1,2}[^*_\n]{0,80}[*_]{1,2}\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (reply.startsWith('"') && reply.endsWith('"')) reply = reply.slice(1, -1).trim()

  if (reply.length > 320) {
    const cut = reply.slice(0, 320)
    const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
    reply = stop > 120 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`
  }

  return reply
}
