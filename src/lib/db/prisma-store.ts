import 'server-only'

import { ProviderError } from '../providers/types'
import type { GenerationJob, ProviderId, SerializedProviderError } from '../providers/types'
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
 * Postgres-backed store. Loaded only when DATABASE_URL is set, so the Prisma
 * client is never required for the default file-backed setup.
 */

type AnyRow = Record<string, unknown>

const ms = (d: unknown) => (d instanceof Date ? d.getTime() : Number(d ?? 0))
const at = (n: number | undefined) => (n ? new Date(n) : undefined)

export async function createPrismaStore(): Promise<KovaiStore> {
  const { PrismaClient } = (await import('@prisma/client')) as { PrismaClient: new () => AnyRow }
  const prisma = new PrismaClient() as never as PrismaAPI

  return {
    projects: {
      async list() {
        const rows = await prisma.project.findMany({ orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] })
        return rows.map(toProject)
      },
      async get(id) {
        const row = await prisma.project.findUnique({ where: { id } })
        return row ? toProject(row) : null
      },
      async upsert(project) {
        const data = {
          name: project.name,
          description: project.description ?? null,
          color: project.color ?? null,
          pinned: project.pinned,
          context: project.context,
        }
        const row = await prisma.project.upsert({
          where: { id: project.id },
          create: { id: project.id, ...data },
          update: data,
        })
        return toProject(row)
      },
      async remove(id) {
        await prisma.project.delete({ where: { id } }).catch(() => {})
      },
    },

    assets: {
      async list(filter) {
        const rows = await prisma.asset.findMany({
          where: {
            projectId: filter?.projectId,
            kind: filter?.kind,
            origin: filter?.origin,
            favorite: filter?.favorite,
          },
          orderBy: { createdAt: 'desc' },
          take: 500,
        })
        return rows.map(toAsset)
      },
      async get(id) {
        const row = await prisma.asset.findUnique({ where: { id } })
        return row ? toAsset(row) : null
      },
      async upsert(asset) {
        const data = {
          name: asset.name,
          description: asset.description ?? null,
          kind: asset.kind,
          url: asset.url,
          thumbnailUrl: asset.thumbnailUrl ?? null,
          origin: asset.origin,
          providerId: asset.providerId ?? null,
          model: asset.model ?? null,
          favorite: asset.favorite,
          width: asset.width ?? null,
          height: asset.height ?? null,
          sizeBytes: asset.sizeBytes ?? null,
          mimeType: asset.mimeType ?? null,
          generation: asset.generation ?? null,
          projectId: asset.projectId ?? null,
        }
        const row = await prisma.asset.upsert({
          where: { id: asset.id },
          create: { id: asset.id, ...data },
          update: data,
        })
        return toAsset(row)
      },
      async remove(id) {
        await prisma.asset.delete({ where: { id } }).catch(() => {})
      },
    },

    conversations: {
      async list(projectId) {
        const rows = await prisma.conversation.findMany({
          where: projectId ? { projectId } : undefined,
          orderBy: { updatedAt: 'desc' },
        })
        return rows.map(toConversation)
      },
      async get(id) {
        const row = await prisma.conversation.findUnique({ where: { id } })
        return row ? toConversation(row) : null
      },
      async upsert(c) {
        const data = { title: c.title, projectId: c.projectId ?? null }
        const row = await prisma.conversation.upsert({
          where: { id: c.id },
          create: { id: c.id, ...data },
          update: data,
        })
        return toConversation(row)
      },
      async remove(id) {
        await prisma.conversation.delete({ where: { id } }).catch(() => {})
      },
      async messages(conversationId) {
        const rows = await prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: 'asc' },
        })
        return rows.map(toMessage).sort(byTurn)
      },
      async addMessage(m) {
        const row = await prisma.message.upsert({
          where: { id: m.id },
          create: {
            id: m.id,
            conversationId: m.conversationId,
            role: m.role,
            content: m.content,
            reasoning: m.reasoning ?? null,
            attachments: m.attachments ?? [],
            providerId: m.providerId ?? null,
            model: m.model ?? null,
            inputTokens: m.inputTokens ?? null,
            outputTokens: m.outputTokens ?? null,
            costUsd: m.costUsd ?? null,
            error: m.error ?? null,
          },
          update: { content: m.content, reasoning: m.reasoning ?? null, error: m.error ?? null },
        })
        return toMessage(row)
      },
    },

    skills: {
      async list() {
        return (await prisma.skill.findMany({ orderBy: { name: 'asc' } })).map(toSkill)
      },
      async get(id) {
        const row = await prisma.skill.findUnique({ where: { id } })
        return row ? toSkill(row) : null
      },
      async upsert(skill) {
        const data = {
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          resources: skill.resources,
          enabled: skill.enabled,
          origin: skill.origin,
        }
        const row = await prisma.skill.upsert({
          where: { id: skill.id },
          create: { id: skill.id, ...data },
          update: data,
        })
        return toSkill(row)
      },
      async remove(id) {
        await prisma.skill.delete({ where: { id } }).catch(() => {})
      },
    },

    agents: {
      async list() {
        return (await prisma.agent.findMany({ orderBy: { updatedAt: 'desc' } })).map(toAgent)
      },
      async get(id) {
        const row = await prisma.agent.findUnique({ where: { id } })
        return row ? toAgent(row) : null
      },
      async upsert(agent) {
        const data = {
          name: agent.name,
          avatar: agent.avatar ?? null,
          description: agent.description ?? null,
          role: agent.role ?? null,
          character: agent.character ?? null,
          companion: agent.companion ?? false,
          placement: agent.placement ?? 'right',
          instructions: agent.instructions,
          providerId: agent.providerId,
          modelId: agent.modelId,
          temperature: agent.temperature ?? null,
          maxTokens: agent.maxTokens ?? null,
          maxSteps: agent.maxSteps,
          toolIds: agent.toolIds,
          projectId: agent.projectId ?? null,
        }
        const row = await prisma.agent.upsert({
          where: { id: agent.id },
          create: { id: agent.id, ...data },
          update: data,
        })
        return toAgent(row)
      },
      async remove(id) {
        await prisma.agent.delete({ where: { id } }).catch(() => {})
      },
      async runs(agentId, limit = 50) {
        const rows = await prisma.agentRun.findMany({
          where: agentId ? { agentId } : undefined,
          orderBy: { startedAt: 'desc' },
          take: limit,
        })
        return rows.map(toAgentRun)
      },
      async memories(agentId, limit = 200) {
        const rows = await prisma.agentMemory.findMany({
          where: { agentId },
          orderBy: { createdAt: 'desc' },
          take: limit,
        })
        return rows.map(toAgentMemory).reverse()
      },
      async addMemory(memory) {
        const row = await prisma.agentMemory.create({
          data: {
            id: memory.id,
            agentId: memory.agentId,
            kind: memory.kind,
            role: memory.role ?? null,
            content: memory.content,
            context: memory.context ?? null,
          },
        })
        return toAgentMemory(row)
      },
      async removeMemory(id) {
        await prisma.agentMemory.delete({ where: { id } }).catch(() => {})
      },
      async clearMemory(agentId) {
        await prisma.agentMemory.deleteMany({ where: { agentId } }).catch(() => {})
      },
      async upsertRun(run) {
        const data = {
          agentId: run.agentId,
          agentName: run.agentName,
          input: run.input,
          status: run.status,
          steps: run.steps,
          output: run.output ?? null,
          error: run.error ?? null,
          inputTokens: run.inputTokens ?? null,
          outputTokens: run.outputTokens ?? null,
          costUsd: run.costUsd ?? null,
          endedAt: at(run.endedAt) ?? null,
        }
        const row = await prisma.agentRun.upsert({
          where: { id: run.id },
          create: { id: run.id, ...data },
          update: data,
        })
        return toAgentRun(row)
      },
    },

    notes: {
      async list(projectId) {
        const rows = await prisma.note.findMany({
          where: projectId ? { projectId } : undefined,
          orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
        })
        return rows.map(toNote)
      },
      async upsert(note) {
        const data = {
          title: note.title,
          body: note.body,
          color: note.color ?? null,
          pinned: note.pinned,
          projectId: note.projectId ?? null,
        }
        const row = await prisma.note.upsert({
          where: { id: note.id },
          create: { id: note.id, ...data },
          update: data,
        })
        return toNote(row)
      },
      async remove(id) {
        await prisma.note.delete({ where: { id } }).catch(() => {})
      },
    },

    tasks: {
      async list(filter) {
        const rows = await prisma.task.findMany({
          where: { projectId: filter?.projectId, done: filter?.done },
          orderBy: [{ done: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        })
        return rows.map(toTask)
      },
      async upsert(task) {
        const data = {
          title: task.title,
          notes: task.notes ?? null,
          done: task.done,
          dueAt: at(task.dueAt) ?? null,
          priority: task.priority,
          projectId: task.projectId ?? null,
          completedAt: at(task.completedAt) ?? null,
        }
        const row = await prisma.task.upsert({
          where: { id: task.id },
          create: { id: task.id, ...data },
          update: data,
        })
        return toTask(row)
      },
      async remove(id) {
        await prisma.task.delete({ where: { id } }).catch(() => {})
      },
    },

    prompts: {
      async list() {
        const rows = await prisma.prompt.findMany({
          orderBy: [{ favorite: 'desc' }, { updatedAt: 'desc' }],
        })
        return rows.map(toPrompt)
      },
      async upsert(p) {
        const data = {
          title: p.title,
          body: p.body,
          tags: p.tags,
          favorite: p.favorite,
          useCount: p.useCount,
          projectId: p.projectId ?? null,
        }
        const row = await prisma.prompt.upsert({
          where: { id: p.id },
          create: { id: p.id, ...data },
          update: data,
        })
        return toPrompt(row)
      },
      async remove(id) {
        await prisma.prompt.delete({ where: { id } }).catch(() => {})
      },
    },

    workflows: {
      async list() {
        const rows = await prisma.workflow.findMany({
          orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
        })
        return rows.map(toWorkflow)
      },
      async get(id) {
        const row = await prisma.workflow.findUnique({ where: { id } })
        return row ? toWorkflow(row) : null
      },
      async upsert(w) {
        const data = {
          name: w.name,
          description: w.description ?? null,
          pinned: w.pinned,
          nodes: w.nodes,
          edges: w.edges,
          projectId: w.projectId ?? null,
        }
        const row = await prisma.workflow.upsert({
          where: { id: w.id },
          create: { id: w.id, ...data },
          update: data,
        })
        return toWorkflow(row)
      },
      async remove(id) {
        await prisma.workflow.delete({ where: { id } }).catch(() => {})
      },
      async runs(workflowId) {
        const rows = await prisma.workflowRun.findMany({
          where: { workflowId },
          orderBy: { startedAt: 'desc' },
          take: 50,
        })
        return rows.map(toRun)
      },
      async upsertRun(r) {
        const data = {
          status: r.status,
          steps: r.steps,
          error: r.error ?? null,
          endedAt: at(r.endedAt) ?? null,
        }
        const row = await prisma.workflowRun.upsert({
          where: { id: r.id },
          create: { id: r.id, workflowId: r.workflowId, ...data },
          update: data,
        })
        return toRun(row)
      },
    },

    generations: {
      async list(limit = 100) {
        const rows = await prisma.generation.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
        return rows.map(toGeneration)
      },
      async upsert(job) {
        const data = {
          providerId: job.providerId,
          externalId: job.externalId ?? null,
          model: job.model,
          kind: job.kind,
          status: job.status,
          phase: job.phase,
          progress: Math.round(job.progress),
          prompt: job.prompt,
          params: job.params,
          referenceImages: job.referenceImages ?? [],
          outputs: job.outputs,
          error: job.error ? job.error.toJSON() : null,
          costUsd: job.costUsd ?? null,
          tabId: job.tabId ?? null,
          projectId: job.projectId ?? null,
          completedAt: at(job.completedAt) ?? null,
        }
        const row = await prisma.generation.upsert({
          where: { id: job.id },
          create: { id: job.id, ...data },
          update: data,
        })
        return { ...job, createdAt: ms(row.createdAt), updatedAt: ms(row.updatedAt) }
      },
    },

    usage: {
      async record(u) {
        await prisma.usageRecord.create({
          data: {
            id: u.id,
            providerId: u.providerId,
            model: u.model,
            kind: u.kind,
            inputTokens: u.inputTokens ?? null,
            outputTokens: u.outputTokens ?? null,
            images: u.images ?? null,
            costUsd: u.costUsd ?? null,
            costUnknown: u.costUnknown,
            projectId: u.projectId ?? null,
          },
        })
      },
      async since(timestamp) {
        const rows = await prisma.usageRecord.findMany({
          where: { createdAt: { gte: new Date(timestamp) } },
          orderBy: { createdAt: 'desc' },
        })
        return rows.map(
          (r): UsageRecord => ({
            id: String(r.id),
            providerId: String(r.providerId) as ProviderId,
            model: String(r.model),
            kind: r.kind as UsageRecord['kind'],
            inputTokens: (r.inputTokens as number) ?? undefined,
            outputTokens: (r.outputTokens as number) ?? undefined,
            images: (r.images as number) ?? undefined,
            costUsd: (r.costUsd as number) ?? undefined,
            costUnknown: Boolean(r.costUnknown),
            projectId: (r.projectId as string) ?? undefined,
            createdAt: ms(r.createdAt),
          }),
        )
      },
    },

    settings: {
      async read() {
        const rows = await prisma.setting.findMany()
        const out: StoredSettings = { onboarded: false, displayName: '' }
        for (const row of rows) out[String(row.key)] = row.value
        return out
      },
      async write(patch) {
        for (const [key, value] of Object.entries(patch)) {
          await prisma.setting.upsert({
            where: { key },
            create: { key, value: value as never },
            update: { value: value as never },
          })
        }
        const rows = await prisma.setting.findMany()
        const out: StoredSettings = { onboarded: false, displayName: '' }
        for (const row of rows) out[String(row.key)] = row.value
        return out
      },
    },
  }
}

/* ── row → domain ─────────────────────────────────────────── */

function toProject(r: AnyRow): Project {
  return {
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string) ?? undefined,
    color: (r.color as string) ?? undefined,
    context: (r.context as Project['context']) ?? {},
    pinned: Boolean(r.pinned),
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
  }
}

function toAsset(r: AnyRow): Asset {
  return {
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string) ?? undefined,
    kind: r.kind as Asset['kind'],
    url: String(r.url),
    thumbnailUrl: (r.thumbnailUrl as string) ?? undefined,
    origin: r.origin as Asset['origin'],
    providerId: (r.providerId as ProviderId) ?? undefined,
    model: (r.model as string) ?? undefined,
    projectId: (r.projectId as string) ?? undefined,
    favorite: Boolean(r.favorite),
    width: (r.width as number) ?? undefined,
    height: (r.height as number) ?? undefined,
    sizeBytes: (r.sizeBytes as number) ?? undefined,
    mimeType: (r.mimeType as string) ?? undefined,
    generation: (r.generation as Asset['generation']) ?? undefined,
    createdAt: ms(r.createdAt),
  }
}

function toConversation(r: AnyRow): Conversation {
  return {
    id: String(r.id),
    title: String(r.title),
    projectId: (r.projectId as string) ?? undefined,
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
  }
}

function toMessage(r: AnyRow): StoredMessage {
  return {
    id: String(r.id),
    conversationId: String(r.conversationId),
    role: r.role as StoredMessage['role'],
    content: String(r.content),
    reasoning: (r.reasoning as string) ?? undefined,
    attachments: (r.attachments as StoredMessage['attachments']) ?? undefined,
    providerId: (r.providerId as ProviderId) ?? undefined,
    model: (r.model as string) ?? undefined,
    inputTokens: (r.inputTokens as number) ?? undefined,
    outputTokens: (r.outputTokens as number) ?? undefined,
    costUsd: (r.costUsd as number) ?? undefined,
    error: (r.error as StoredMessage['error']) ?? undefined,
    createdAt: ms(r.createdAt),
  }
}

function toAgent(r: AnyRow): Agent {
  return {
    id: String(r.id),
    name: String(r.name),
    avatar: (r.avatar as string) ?? undefined,
    description: (r.description as string) ?? undefined,
    role: (r.role as string) ?? undefined,
    character: (r.character as string) ?? undefined,
    companion: Boolean(r.companion),
    placement: (r.placement as Agent['placement']) ?? 'right',
    instructions: String(r.instructions ?? ''),
    providerId: String(r.providerId),
    modelId: String(r.modelId),
    temperature: (r.temperature as number) ?? undefined,
    maxTokens: (r.maxTokens as number) ?? undefined,
    maxSteps: Number(r.maxSteps ?? 6),
    toolIds: (r.toolIds as string[]) ?? [],
    projectId: (r.projectId as string) ?? undefined,
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
  }
}

function toSkill(r: AnyRow): Skill {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description ?? ''),
    instructions: String(r.instructions ?? ''),
    resources: (r.resources as Skill['resources']) ?? [],
    enabled: Boolean(r.enabled),
    origin: (r.origin as Skill['origin']) ?? 'imported',
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
  }
}

function toAgentMemory(r: AnyRow): AgentMemory {
  return {
    id: String(r.id),
    agentId: String(r.agentId),
    kind: (r.kind as AgentMemory['kind']) ?? 'message',
    role: (r.role as AgentMemory['role']) ?? undefined,
    content: String(r.content ?? ''),
    context: (r.context as string) ?? undefined,
    createdAt: ms(r.createdAt),
  }
}

function toAgentRun(r: AnyRow): AgentRun {
  return {
    id: String(r.id),
    agentId: String(r.agentId),
    agentName: String(r.agentName),
    input: String(r.input),
    status: r.status as AgentRun['status'],
    steps: (r.steps as AgentRun['steps']) ?? [],
    output: (r.output as string) ?? undefined,
    error: (r.error as string) ?? undefined,
    inputTokens: (r.inputTokens as number) ?? undefined,
    outputTokens: (r.outputTokens as number) ?? undefined,
    costUsd: (r.costUsd as number) ?? undefined,
    startedAt: ms(r.startedAt),
    endedAt: r.endedAt ? ms(r.endedAt) : undefined,
  }
}

function toNote(r: AnyRow): Note {
  return {
    id: String(r.id),
    title: String(r.title),
    body: String(r.body),
    color: (r.color as Note['color']) ?? undefined,
    pinned: Boolean(r.pinned),
    projectId: (r.projectId as string) ?? undefined,
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
  }
}

function toTask(r: AnyRow): Task {
  return {
    id: String(r.id),
    title: String(r.title),
    notes: (r.notes as string) ?? undefined,
    done: Boolean(r.done),
    dueAt: r.dueAt ? ms(r.dueAt) : undefined,
    priority: (r.priority as Task['priority']) ?? 'normal',
    projectId: (r.projectId as string) ?? undefined,
    createdAt: ms(r.createdAt),
    completedAt: r.completedAt ? ms(r.completedAt) : undefined,
  }
}

function toPrompt(r: AnyRow): PromptEntry {
  return {
    id: String(r.id),
    title: String(r.title),
    body: String(r.body),
    tags: (r.tags as string[]) ?? [],
    projectId: (r.projectId as string) ?? undefined,
    favorite: Boolean(r.favorite),
    useCount: Number(r.useCount ?? 0),
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
  }
}

function toWorkflow(r: AnyRow): Workflow {
  return {
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string) ?? undefined,
    projectId: (r.projectId as string) ?? undefined,
    nodes: (r.nodes as Workflow['nodes']) ?? [],
    edges: (r.edges as Workflow['edges']) ?? [],
    pinned: Boolean(r.pinned),
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
  }
}

function toRun(r: AnyRow): WorkflowRun {
  return {
    id: String(r.id),
    workflowId: String(r.workflowId),
    status: r.status as WorkflowRun['status'],
    steps: (r.steps as WorkflowRun['steps']) ?? [],
    startedAt: ms(r.startedAt),
    endedAt: r.endedAt ? ms(r.endedAt) : undefined,
    error: (r.error as string) ?? undefined,
  }
}

function toGeneration(r: AnyRow): GenerationJob {
  return {
    id: String(r.id),
    providerId: r.providerId as ProviderId,
    externalId: (r.externalId as string) ?? undefined,
    model: String(r.model),
    kind: r.kind as GenerationJob['kind'],
    status: r.status as GenerationJob['status'],
    phase: r.phase as GenerationJob['phase'],
    progress: Number(r.progress ?? 0),
    prompt: String(r.prompt),
    params: (r.params as Record<string, unknown>) ?? {},
    referenceImages: (r.referenceImages as string[]) ?? undefined,
    outputs: (r.outputs as GenerationJob['outputs']) ?? [],
    costUsd: (r.costUsd as number) ?? undefined,
    tabId: (r.tabId as string) ?? undefined,
    projectId: (r.projectId as string) ?? undefined,
    createdAt: ms(r.createdAt),
    updatedAt: ms(r.updatedAt),
    completedAt: r.completedAt ? ms(r.completedAt) : undefined,
    // Restored as a real ProviderError, so a failed job still explains itself
    // after a restart instead of showing "failed" with no reason.
    error: r.error ? new ProviderError(r.error as SerializedProviderError) : undefined,
  }
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

/** Minimal structural type for the generated client — avoids a build-time dependency. */
interface Delegate {
  findMany(args?: AnyRow): Promise<AnyRow[]>
  findUnique(args: AnyRow): Promise<AnyRow | null>
  upsert(args: AnyRow): Promise<AnyRow>
  create(args: AnyRow): Promise<AnyRow>
  delete(args: AnyRow): Promise<AnyRow>
  deleteMany(args?: AnyRow): Promise<{ count: number }>
}

interface PrismaAPI {
  project: Delegate
  asset: Delegate
  conversation: Delegate
  message: Delegate
  prompt: Delegate
  note: Delegate
  task: Delegate
  agent: Delegate
  agentRun: Delegate
  skill: Delegate
  agentMemory: Delegate
  workflow: Delegate
  workflowRun: Delegate
  generation: Delegate
  usageRecord: Delegate
  setting: Delegate
}
