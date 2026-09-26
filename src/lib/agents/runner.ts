import 'server-only'

import { randomUUID } from 'node:crypto'
import { getChatProvider } from '../providers/registry'
import { callTool, listTools } from '../mcp/manager'
import { store } from '../db'
import type { Agent, AgentRun, AgentStep } from '../db/types'
import type { ChatMessageInput, ProviderId } from '../providers/types'
import type { McpTool } from '../mcp/types'

/**
 * Agent execution.
 *
 * Runs are asynchronous and survive the request that started them: an agent
 * that takes four tool calls should not be tied to a fetch that times out. The
 * loop is bounded by the agent's own maxSteps, because an agent that can call
 * tools without a ceiling is a way to spend money and time nobody agreed to.
 *
 * Tool calling uses a text protocol rather than the provider's native tool API.
 * Native tool calling is not available across every backend — a local GGUF
 * served by llama.cpp generally has none — and an agent that only works on
 * hosted models would defeat the point of a local-first workspace.
 */

interface RunState {
  runs: Map<string, AgentRun>
  cancelled: Set<string>
}

const globalRef = globalThis as typeof globalThis & { __kovaiAgentRuns?: RunState }
const state = (globalRef.__kovaiAgentRuns ??= { runs: new Map(), cancelled: new Set() })

const TERMINAL = new Set<AgentRun['status']>(['COMPLETED', 'FAILED', 'CANCELLED'])

export async function startRun(agent: Agent, input: string): Promise<AgentRun> {
  const run: AgentRun = {
    id: randomUUID(),
    agentId: agent.id,
    agentName: agent.name,
    input,
    status: 'QUEUED',
    steps: [],
    startedAt: Date.now(),
  }
  state.runs.set(run.id, run)
  await persist(run)

  // Deliberately not awaited: the caller gets a run id immediately.
  void execute(agent, run).catch(async (err) => {
    await finish(run, {
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'The run failed.',
    })
  })

  return run
}

export function getRun(id: string): AgentRun | null {
  return state.runs.get(id) ?? null
}

export async function listRuns(agentId?: string, limit = 30): Promise<AgentRun[]> {
  const live = [...state.runs.values()]
  const db = await store()
  const stored = await db.agents.runs(agentId, limit)

  // The in-memory copy is authoritative for anything still moving.
  const merged = new Map(stored.map((r) => [r.id, r]))
  for (const run of live) {
    if (!agentId || run.agentId === agentId) merged.set(run.id, run)
  }
  return [...merged.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit)
}

export async function cancelRun(id: string): Promise<AgentRun | null> {
  const run = state.runs.get(id)
  if (!run || TERMINAL.has(run.status)) return run ?? null
  state.cancelled.add(id)
  await finish(run, { status: 'CANCELLED' })
  return state.runs.get(id) ?? null
}

async function execute(agent: Agent, run: AgentRun) {
  await update(run, { status: 'RUNNING' })

  const tools = agent.toolIds.length
    ? (await listTools()).filter((tool) => agent.toolIds.includes(tool.id))
    : []

  const messages: ChatMessageInput[] = [
    { role: 'system', content: systemPrompt(agent, tools) },
    { role: 'user', content: run.input },
  ]

  let inputTokens = 0
  let outputTokens = 0
  let costUsd: number | undefined

  for (let step = 0; step < Math.max(1, agent.maxSteps); step++) {
    if (state.cancelled.has(run.id)) return

    await addStep(run, { kind: 'thinking', label: `Step ${step + 1}`, at: Date.now() })

    let text = ''
    let thinking = ''
    for await (const chunk of getChatProvider(agent.providerId as ProviderId).streamChat({
      model: agent.modelId,
      messages,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
    })) {
      if (state.cancelled.has(run.id)) return
      if (chunk.type === 'text') {
        text += chunk.text
        // Shown as it is written. A local model can take a minute on one step,
        // and a run that sits on "Step 1" for that long looks stuck even when
        // it is working perfectly. Memory only — the answer is persisted once
        // the step ends, rather than on every token.
        live(run, text)
      } else if (chunk.type === 'reasoning') {
        // A reasoning model can deliberate for half a minute before writing a
        // word. Showing the tail of that thinking is the difference between a
        // run that looks stuck and one you can watch work.
        thinking += chunk.text
        liveStep(run, thinking)
      } else if (chunk.type === 'usage') {
        inputTokens += chunk.inputTokens ?? 0
        outputTokens += chunk.outputTokens ?? 0
        if (chunk.costUsd !== undefined) costUsd = (costUsd ?? 0) + chunk.costUsd
      } else if (chunk.type === 'error') {
        await addStep(run, { kind: 'error', label: 'Model error', detail: chunk.error.message, at: Date.now() })
        await finish(run, { status: 'FAILED', error: chunk.error.message, inputTokens, outputTokens, costUsd })
        return
      }
    }

    const call = parseToolCall(text)
    if (!call) {
      await addStep(run, { kind: 'answer', label: 'Answered', at: Date.now() })
      await finish(run, {
        status: 'COMPLETED',
        output: stripProtocol(text).trim(),
        inputTokens,
        outputTokens,
        costUsd,
      })
      return
    }

    const allowed = tools.some((t) => t.id === call.tool)
    if (!allowed) {
      // Refuse rather than call it: the allow-list is the agent's boundary.
      messages.push({ role: 'assistant', content: text })
      messages.push({
        role: 'user',
        content: `TOOL RESULT (${call.tool}): refused — that tool is not in your allowed list. Use only the tools listed, or answer directly.`,
      })
      await addStep(run, {
        kind: 'error',
        label: `Blocked ${call.tool}`,
        detail: 'Not in this agent’s allowed tools.',
        at: Date.now(),
      })
      continue
    }

    const tool = tools.find((t) => t.id === call.tool)!
    await addStep(run, {
      kind: 'tool',
      label: tool.name,
      detail: JSON.stringify(call.args).slice(0, 200),
      at: Date.now(),
    })

    const result = await callTool(call.tool, call.args)
    messages.push({ role: 'assistant', content: text })
    messages.push({
      role: 'user',
      content: `TOOL RESULT (${tool.name}): ${result.content.slice(0, 6000)}`,
    })

    if (result.isError) {
      await addStep(run, {
        kind: 'error',
        label: `${tool.name} failed`,
        detail: result.content.slice(0, 200),
        at: Date.now(),
      })
    }
  }

  // Out of steps. Say so plainly rather than presenting a partial run as done.
  await finish(run, {
    status: 'FAILED',
    error: `Stopped after ${agent.maxSteps} steps without reaching an answer.`,
    inputTokens,
    outputTokens,
    costUsd,
  })
}

function systemPrompt(agent: Agent, tools: McpTool[]): string {
  const base = agent.instructions.trim() || 'You are a helpful agent.'
  if (!tools.length) {
    return `${base}\n\nYou have no tools. Answer from what you know, and say plainly when you do not know something.`
  }

  const catalogue = tools
    .map((tool) => `- ${tool.id}: ${tool.description ?? tool.name}\n  arguments: ${JSON.stringify(tool.inputSchema)}`)
    .join('\n')

  return `${base}

You can call tools. To call one, reply with ONLY this fence and nothing else:

\`\`\`tool
{"tool": "<tool id>", "args": { }}
\`\`\`

The result comes back as a message beginning "TOOL RESULT". Then either call another tool or give your final answer.
When you are ready to answer, reply normally with no tool fence.

Available tools:
${catalogue}

Call a tool only when it is genuinely needed. Never invent a tool id, and never claim you ran a tool you did not.`
}

function parseToolCall(text: string): { tool: string; args: Record<string, unknown> } | null {
  const fence = /```tool\s*([\s\S]*?)```/.exec(text)
  const source = fence?.[1]?.trim()
  if (!source) return null
  try {
    const parsed = JSON.parse(source) as { tool?: string; args?: Record<string, unknown> }
    if (!parsed.tool) return null
    return { tool: parsed.tool, args: parsed.args ?? {} }
  } catch {
    return null
  }
}

function stripProtocol(text: string): string {
  return text.replace(/```tool[\s\S]*?```/g, '').trim()
}

/** Shows the tail of the model's deliberation against the step in progress. */
function liveStep(run: AgentRun, thinking: string) {
  const now = Date.now()
  if (now - (lastLive.get(`${run.id}:step`) ?? 0) < 400) return
  lastLive.set(`${run.id}:step`, now)

  const current = state.runs.get(run.id)
  if (!current || TERMINAL.has(current.status) || !current.steps.length) return
  const steps = [...current.steps]
  const last = steps[steps.length - 1]
  if (last.kind !== 'thinking') return
  steps[steps.length - 1] = { ...last, detail: thinking.slice(-160).trimStart() }
  state.runs.set(run.id, { ...current, steps })
}

/**
 * Updates the in-memory run only, for anything that changes per token.
 *
 * Throttled, because the interface polls a few times a second and rewriting the
 * whole answer on every token would mean scanning it for a tool fence thousands
 * of times over one long reply.
 */
const lastLive = new Map<string, number>()

function live(run: AgentRun, text: string) {
  const now = Date.now()
  if (now - (lastLive.get(run.id) ?? 0) < 250) return
  lastLive.set(run.id, now)

  const current = state.runs.get(run.id)
  if (!current || TERMINAL.has(current.status)) return
  state.runs.set(run.id, { ...current, output: stripProtocol(text) })
}

async function addStep(run: AgentRun, step: AgentStep) {
  // Read from the map rather than the caller's copy: the stream writes partial
  // output there between steps, and spreading the stale object would drop it.
  const next = { ...(state.runs.get(run.id) ?? run), steps: [...run.steps, step] }
  state.runs.set(run.id, next)
  run.steps = next.steps
  await persist(next)
}

async function update(run: AgentRun, patch: Partial<AgentRun>) {
  const next = { ...state.runs.get(run.id)!, ...patch }
  state.runs.set(run.id, next)
  Object.assign(run, patch)
  await persist(next)
}

async function finish(run: AgentRun, patch: Partial<AgentRun>) {
  await update(run, { ...patch, endedAt: Date.now() })
  state.cancelled.delete(run.id)
  lastLive.delete(run.id)
  lastLive.delete(`${run.id}:step`)
}

async function persist(run: AgentRun) {
  try {
    const db = await store()
    await db.agents.upsertRun(run)
  } catch {
    /* a run that cannot be written is still a run in progress */
  }
}
