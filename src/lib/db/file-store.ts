import 'server-only'

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GenerationJob } from '../providers/types'
import type {
  Agent,
  AgentMemory,
  AgentRun,
  Asset,
  Conversation,
  KovaiStore,
  Note,
  Project,
  PromptEntry,
  Skill,
  Task,
  StoredMessage,
  StoredSettings,
  UsageRecord,
  Workflow,
  WorkflowRun,
} from './types'

/**
 * Zero-configuration persistence.
 *
 * KOVAI is usable the moment it is cloned — no database required. Everything is
 * held in one JSON document written atomically under .kovai/. Set DATABASE_URL
 * to switch to Postgres; the interface above is identical either way.
 */

interface Snapshot {
  version: 1
  projects: Project[]
  assets: Asset[]
  conversations: Conversation[]
  messages: StoredMessage[]
  prompts: PromptEntry[]
  notes: Note[]
  tasks: Task[]
  agents: Agent[]
  agentRuns: AgentRun[]
  skills: Skill[]
  agentMemories: AgentMemory[]
  workflows: Workflow[]
  workflowRuns: WorkflowRun[]
  generations: GenerationJob[]
  usage: UsageRecord[]
  settings: StoredSettings
}

const EMPTY: Snapshot = {
  version: 1,
  projects: [],
  assets: [],
  conversations: [],
  messages: [],
  prompts: [],
  notes: [],
  tasks: [],
  agents: [],
  agentRuns: [],
  skills: [],
  agentMemories: [],
  workflows: [],
  workflowRuns: [],
  generations: [],
  usage: [],
  settings: { onboarded: false, displayName: '' },
}

const DATA_PATH = join(process.cwd(), '.kovai', 'data.json')

let cache: Snapshot | null = null
/** Serialises writes so concurrent requests cannot interleave a read/modify/write. */
let queue: Promise<unknown> = Promise.resolve()

async function load(): Promise<Snapshot> {
  if (cache) return cache
  try {
    const raw = await readFile(DATA_PATH, 'utf8')
    cache = { ...EMPTY, ...(JSON.parse(raw) as Snapshot) }
  } catch {
    cache = structuredClone(EMPTY)
  }
  return cache
}

async function persist(snapshot: Snapshot) {
  await mkdir(dirname(DATA_PATH), { recursive: true })
  const tmp = `${DATA_PATH}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8')
  await rename(tmp, DATA_PATH)
}

function mutate<T>(fn: (snapshot: Snapshot) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const snapshot = await load()
    const result = await fn(snapshot)
    await persist(snapshot)
    return result
  })
  queue = next.catch(() => {})
  return next
}

function upsertInto<T extends { id: string }>(list: T[], item: T): T {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx === -1) list.unshift(item)
  else list[idx] = item
  return item
}

/**
 * Transcript order.
 *
 * Both halves of a turn can share a millisecond, and on a tie the order used to
 * fall out of however the rows happened to be stored — which showed the answer
 * above the question. New turns are written a millisecond apart, but every
 * conversation recorded before that still has ties, so the question wins one
 * explicitly here rather than only in new data.
 */
const RANK: Record<string, number> = { user: 0, assistant: 1, system: 2 }

function byTurn(a: StoredMessage, b: StoredMessage): number {
  return a.createdAt - b.createdAt || (RANK[a.role] ?? 0) - (RANK[b.role] ?? 0)
}

export const fileStore: KovaiStore = {
  projects: {
    async list() {
      return [...(await load()).projects].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
    },
    async get(id) {
      return (await load()).projects.find((p) => p.id === id) ?? null
    },
    upsert: (project) => mutate((s) => upsertInto(s.projects, project)),
    remove: (id) =>
      mutate((s) => {
        s.projects = s.projects.filter((p) => p.id !== id)
      }),
  },

  assets: {
    async list(filter) {
      let items = (await load()).assets
      if (filter?.projectId) items = items.filter((a) => a.projectId === filter.projectId)
      if (filter?.kind) items = items.filter((a) => a.kind === filter.kind)
      if (filter?.origin) items = items.filter((a) => a.origin === filter.origin)
      if (filter?.favorite) items = items.filter((a) => a.favorite)
      return [...items].sort((a, b) => b.createdAt - a.createdAt)
    },
    async get(id) {
      return (await load()).assets.find((a) => a.id === id) ?? null
    },
    upsert: (asset) => mutate((s) => upsertInto(s.assets, asset)),
    remove: (id) =>
      mutate((s) => {
        s.assets = s.assets.filter((a) => a.id !== id)
      }),
  },

  conversations: {
    async list(projectId) {
      const all = (await load()).conversations
      return (projectId ? all.filter((c) => c.projectId === projectId) : all).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      )
    },
    async get(id) {
      return (await load()).conversations.find((c) => c.id === id) ?? null
    },
    upsert: (c) => mutate((s) => upsertInto(s.conversations, c)),
    remove: (id) =>
      mutate((s) => {
        s.conversations = s.conversations.filter((c) => c.id !== id)
        s.messages = s.messages.filter((m) => m.conversationId !== id)
      }),
    async messages(conversationId) {
      return (await load()).messages.filter((m) => m.conversationId === conversationId).sort(byTurn)
    },
    addMessage: (m) =>
      mutate((s) => {
        upsertInto(s.messages, m)
        const conversation = s.conversations.find((c) => c.id === m.conversationId)
        if (conversation) conversation.updatedAt = Date.now()
        return m
      }),
  },

  skills: {
    async list() {
      return [...(await load()).skills].sort((a, b) => a.name.localeCompare(b.name))
    },
    async get(id) {
      return (await load()).skills.find((k) => k.id === id) ?? null
    },
    upsert: (skill) => mutate((s) => upsertInto(s.skills, skill)),
    remove: (id) =>
      mutate((s) => {
        s.skills = s.skills.filter((k) => k.id !== id)
      }),
  },

  agents: {
    async list() {
      return [...(await load()).agents].sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async get(id) {
      return (await load()).agents.find((a) => a.id === id) ?? null
    },
    upsert: (agent) => mutate((s) => upsertInto(s.agents, agent)),
    remove: (id) =>
      mutate((s) => {
        s.agents = s.agents.filter((a) => a.id !== id)
        s.agentRuns = s.agentRuns.filter((r) => r.agentId !== id)
        s.agentMemories = s.agentMemories.filter((m) => m.agentId !== id)
      }),
    async runs(agentId, limit = 50) {
      const all = (await load()).agentRuns
      return (agentId ? all.filter((r) => r.agentId === agentId) : all)
        .sort((a, b) => b.startedAt - a.startedAt)
        .slice(0, limit)
    },
    upsertRun: (run) =>
      mutate((s) => {
        upsertInto(s.agentRuns, run)
        if (s.agentRuns.length > 300) s.agentRuns.length = 300
        return run
      }),
    async memories(agentId, limit = 200) {
      return (await load()).agentMemories
        .filter((m) => m.agentId === agentId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-limit)
    },
    addMemory: (memory) =>
      mutate((s) => {
        upsertInto(s.agentMemories, memory)
        // A companion talks all day. Keeping the whole of it would grow the
        // snapshot without bound, and an agent that remembers last month's
        // small talk is not more useful than one that remembers last week's.
        const mine = s.agentMemories.filter((m) => m.agentId === memory.agentId)
        if (mine.length > 400) {
          const drop = new Set(
            mine
              .filter((m) => m.kind === 'message')
              .sort((a, b) => a.createdAt - b.createdAt)
              .slice(0, mine.length - 400)
              .map((m) => m.id),
          )
          s.agentMemories = s.agentMemories.filter((m) => !drop.has(m.id))
        }
        return memory
      }),
    removeMemory: (id) =>
      mutate((s) => {
        s.agentMemories = s.agentMemories.filter((m) => m.id !== id)
      }),
    clearMemory: (agentId) =>
      mutate((s) => {
        s.agentMemories = s.agentMemories.filter((m) => m.agentId !== agentId)
      }),
  },

  notes: {
    async list(projectId) {
      const all = (await load()).notes
      return (projectId ? all.filter((n) => n.projectId === projectId) : all).sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      )
    },
    upsert: (note) => mutate((s) => upsertInto(s.notes, note)),
    remove: (id) =>
      mutate((s) => {
        s.notes = s.notes.filter((n) => n.id !== id)
      }),
  },

  tasks: {
    async list(filter) {
      let items = (await load()).tasks
      if (filter?.projectId) items = items.filter((t) => t.projectId === filter.projectId)
      if (filter?.done !== undefined) items = items.filter((t) => t.done === filter.done)
      // Undone first, then soonest due, then newest.
      return [...items].sort(
        (a, b) =>
          Number(a.done) - Number(b.done) ||
          (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
          b.createdAt - a.createdAt,
      )
    },
    upsert: (task) => mutate((s) => upsertInto(s.tasks, task)),
    remove: (id) =>
      mutate((s) => {
        s.tasks = s.tasks.filter((t) => t.id !== id)
      }),
  },

  prompts: {
    async list() {
      return [...(await load()).prompts].sort(
        (a, b) => Number(b.favorite) - Number(a.favorite) || b.updatedAt - a.updatedAt,
      )
    },
    upsert: (p) => mutate((s) => upsertInto(s.prompts, p)),
    remove: (id) =>
      mutate((s) => {
        s.prompts = s.prompts.filter((p) => p.id !== id)
      }),
  },

  workflows: {
    async list() {
      return [...(await load()).workflows].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      )
    },
    async get(id) {
      return (await load()).workflows.find((w) => w.id === id) ?? null
    },
    upsert: (w) => mutate((s) => upsertInto(s.workflows, w)),
    remove: (id) =>
      mutate((s) => {
        s.workflows = s.workflows.filter((w) => w.id !== id)
      }),
    async runs(workflowId) {
      return (await load()).workflowRuns
        .filter((r) => r.workflowId === workflowId)
        .sort((a, b) => b.startedAt - a.startedAt)
    },
    upsertRun: (r) => mutate((s) => upsertInto(s.workflowRuns, r)),
  },

  generations: {
    async list(limit = 100) {
      return [...(await load()).generations].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
    },
    upsert: (job) =>
      mutate((s) => {
        upsertInto(s.generations, job)
        // Keep the on-disk history bounded; the asset library is the archive.
        if (s.generations.length > 500) s.generations.length = 500
        return job
      }),
  },

  usage: {
    record: (u) =>
      mutate((s) => {
        s.usage.unshift(u)
        if (s.usage.length > 5000) s.usage.length = 5000
      }),
    async since(timestamp) {
      return (await load()).usage.filter((u) => u.createdAt >= timestamp)
    },
  },

  settings: {
    async read() {
      return (await load()).settings
    },
    write: (patch) =>
      mutate((s) => {
        s.settings = { ...s.settings, ...patch }
        return s.settings
      }),
  },
}
