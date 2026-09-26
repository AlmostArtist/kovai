import type { GenerationJob, ProviderId } from '../providers/types'

export interface Project {
  id: string
  name: string
  description?: string
  color?: string
  /** Persistent creative direction the AI can be given, when enabled. */
  context: {
    brand?: string
    direction?: string
    instructions?: string
    presets?: { id: string; name: string; prompt: string }[]
  }
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export interface Asset {
  id: string
  name: string
  description?: string
  kind: 'image' | 'video' | 'document'
  url: string
  thumbnailUrl?: string
  origin: 'generated' | 'upload' | 'reference'
  providerId?: ProviderId
  model?: string
  projectId?: string
  favorite: boolean
  width?: number
  height?: number
  sizeBytes?: number
  mimeType?: string
  /** Everything needed to reproduce a generated asset. */
  generation?: {
    jobId: string
    prompt: string
    negativePrompt?: string
    params: Record<string, unknown>
    seed?: number
    durationMs?: number
    costUsd?: number
  }
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  projectId?: string
  tabId?: string
  createdAt: number
  updatedAt: number
}

export interface StoredMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string
  attachments?: { url: string; mimeType: string; name?: string }[]
  providerId?: ProviderId
  model?: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  error?: { code: string; message: string; detail?: string }
  createdAt: number
}

export interface PromptEntry {
  id: string
  title: string
  body: string
  tags: string[]
  projectId?: string
  favorite: boolean
  useCount: number
  createdAt: number
  updatedAt: number
}

export interface WorkflowNode {
  id: string
  type:
    | 'INPUT'
    | 'CHAT'
    | 'VISION'
    | 'IMAGE'
    | 'VIDEO'
    | 'HTTP'
    | 'CONDITION'
    | 'TRANSFORM'
    | 'SAVE'
    | 'EXPORT'
  label: string
  position: { x: number; y: number }
  config: Record<string, unknown>
}

export interface WorkflowEdge {
  id: string
  from: string
  to: string
}

export interface Workflow {
  id: string
  name: string
  description?: string
  projectId?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export interface WorkflowRun {
  id: string
  workflowId: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  steps: {
    nodeId: string
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED'
    output?: unknown
    error?: string
    startedAt?: number
    endedAt?: number
  }[]
  startedAt: number
  endedAt?: number
  error?: string
}

/** A note. Free text, optionally pinned, optionally tied to a project. */
export interface Note {
  id: string
  title: string
  body: string
  color?: 'neutral' | 'amber' | 'green' | 'blue' | 'violet' | 'rose'
  pinned: boolean
  projectId?: string
  createdAt: number
  updatedAt: number
}

/**
 * A task, which doubles as a reminder when it carries a due date.
 *
 * Reminders are not a separate type: a reminder is a task you want surfaced at
 * a particular moment, and keeping them as one thing means a due item can be
 * ticked off rather than merely dismissed.
 */
export interface Task {
  id: string
  title: string
  notes?: string
  done: boolean
  /** Epoch ms. Present means it is also a reminder. */
  dueAt?: number
  priority: 'low' | 'normal' | 'high'
  projectId?: string
  createdAt: number
  completedAt?: number
}

/**
 * A configured agent.
 *
 * An agent is a model plus standing instructions, a set of tools it is allowed
 * to reach for, and hard limits on how far it may go on its own. The limits are
 * not optional: an agent that can loop without a ceiling is a way to spend money
 * and time you did not agree to.
 */
export interface Agent {
  id: string
  name: string
  /**
   * `lottie:<file>` for one of the animated agent faces, a single emoji, or an
   * image URL. The list falls back to an initial.
   */
  avatar?: string
  description?: string
  /** What it is for — "Art director", "Researcher". Shown, and told to it. */
  role?: string
  /**
   * How it talks. Voice rather than job: terse, warm, sceptical, funny. This is
   * what makes two agents on the same model feel like different colleagues.
   */
  character?: string
  /** Docked as a companion, where it can speak unprompted. */
  companion?: boolean
  /** Where on screen it lives while it is out. */
  placement?: AgentPlacement
  instructions: string
  providerId: string
  modelId: string
  temperature?: number
  /** Ceiling on tokens per model call. */
  maxTokens?: number
  /** Ceiling on tool-call rounds before the run stops itself. */
  maxSteps: number
  /** Namespaced MCP tool ids this agent may call. Empty means no tools. */
  toolIds: string[]
  projectId?: string
  createdAt: number
  updatedAt: number
}

/**
 * Where a companion lives.
 *
 * Not decoration: an agent parked over the composer is reading what you type
 * and is in your eyeline while you write, and one hanging from the top is out
 * of the way of everything. Which one you want depends on the agent, so it is
 * the agent's own setting rather than a global one.
 */
export type AgentPlacement = 'right' | 'left' | 'composer' | 'hanging' | 'corner'

export type AgentRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface AgentStep {
  kind: 'thinking' | 'tool' | 'answer' | 'error'
  /** Tool name for a tool step, otherwise a short label. */
  label: string
  detail?: string
  at: number
}

export interface AgentRun {
  id: string
  agentId: string
  agentName: string
  input: string
  status: AgentRunStatus
  steps: AgentStep[]
  output?: string
  error?: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  startedAt: number
  endedAt?: number
}

/**
 * What an agent keeps.
 *
 * Both halves of every companion exchange are kept, so an agent can pick up a
 * conversation from last week, plus any standing notes it was asked to
 * remember. This is the agent's own record — separate from chat History, which
 * belongs to the workspace rather than to any one agent.
 */
export interface AgentMemory {
  id: string
  agentId: string
  /** A turn of conversation, or something it was told to remember. */
  kind: 'message' | 'note'
  role?: 'user' | 'agent'
  content: string
  /** What the user was doing when this was said. */
  context?: string
  createdAt: number
}

/**
 * A K Skill.
 *
 * Modelled on Claude's Agent Skills, and deliberately the same file: a
 * SKILL.md whose YAML frontmatter carries a `name` and a `description`, and
 * whose body is the instructions. A skill written for Claude imports here
 * unchanged.
 *
 * The point of the format is progressive disclosure. Only the name and
 * description sit in the system prompt, so a shelf of fifty skills costs almost
 * nothing until one is actually needed; the body is loaded only for the turn
 * that needs it.
 */
export interface Skill {
  id: string
  /** Lowercase, numbers and hyphens, from the frontmatter. */
  name: string
  /** What it does and when to use it. This is what selection matches against. */
  description: string
  /** The SKILL.md body, frontmatter stripped. */
  instructions: string
  /** Extra files bundled alongside it, read only when referenced. */
  resources: { path: string; content: string }[]
  enabled: boolean
  /** Where it came from, for the list. */
  origin: 'imported' | 'written'
  createdAt: number
  updatedAt: number
}

export interface UsageRecord {
  id: string
  providerId: ProviderId
  model: string
  kind: 'chat' | 'vision' | 'image' | 'video' | 'embeddings'
  inputTokens?: number
  outputTokens?: number
  images?: number
  /** Only set when the provider actually reported a cost. */
  costUsd?: number
  /** True when the provider gave us no pricing information. */
  costUnknown: boolean
  projectId?: string
  createdAt: number
}

export interface StoredSettings {
  onboarded: boolean
  displayName: string
  [key: string]: unknown
}

export interface KovaiStore {
  projects: {
    list(): Promise<Project[]>
    get(id: string): Promise<Project | null>
    upsert(project: Project): Promise<Project>
    remove(id: string): Promise<void>
  }
  assets: {
    list(filter?: { projectId?: string; kind?: Asset['kind']; origin?: Asset['origin']; favorite?: boolean }): Promise<Asset[]>
    get(id: string): Promise<Asset | null>
    upsert(asset: Asset): Promise<Asset>
    remove(id: string): Promise<void>
  }
  conversations: {
    list(projectId?: string): Promise<Conversation[]>
    get(id: string): Promise<Conversation | null>
    upsert(c: Conversation): Promise<Conversation>
    remove(id: string): Promise<void>
    messages(conversationId: string): Promise<StoredMessage[]>
    addMessage(m: StoredMessage): Promise<StoredMessage>
  }
  skills: {
    list(): Promise<Skill[]>
    get(id: string): Promise<Skill | null>
    upsert(skill: Skill): Promise<Skill>
    remove(id: string): Promise<void>
  }
  agents: {
    list(): Promise<Agent[]>
    get(id: string): Promise<Agent | null>
    upsert(agent: Agent): Promise<Agent>
    remove(id: string): Promise<void>
    runs(agentId?: string, limit?: number): Promise<AgentRun[]>
    upsertRun(run: AgentRun): Promise<AgentRun>
    memories(agentId: string, limit?: number): Promise<AgentMemory[]>
    addMemory(memory: AgentMemory): Promise<AgentMemory>
    removeMemory(id: string): Promise<void>
    clearMemory(agentId: string): Promise<void>
  }
  notes: {
    list(projectId?: string): Promise<Note[]>
    upsert(note: Note): Promise<Note>
    remove(id: string): Promise<void>
  }
  tasks: {
    list(filter?: { projectId?: string; done?: boolean }): Promise<Task[]>
    upsert(task: Task): Promise<Task>
    remove(id: string): Promise<void>
  }
  prompts: {
    list(): Promise<PromptEntry[]>
    upsert(p: PromptEntry): Promise<PromptEntry>
    remove(id: string): Promise<void>
  }
  workflows: {
    list(): Promise<Workflow[]>
    get(id: string): Promise<Workflow | null>
    upsert(w: Workflow): Promise<Workflow>
    remove(id: string): Promise<void>
    runs(workflowId: string): Promise<WorkflowRun[]>
    upsertRun(r: WorkflowRun): Promise<WorkflowRun>
  }
  generations: {
    list(limit?: number): Promise<GenerationJob[]>
    upsert(job: GenerationJob): Promise<GenerationJob>
  }
  usage: {
    record(u: UsageRecord): Promise<void>
    since(timestamp: number): Promise<UsageRecord[]>
  }
  settings: {
    read(): Promise<StoredSettings>
    write(patch: Partial<StoredSettings>): Promise<StoredSettings>
  }
}
