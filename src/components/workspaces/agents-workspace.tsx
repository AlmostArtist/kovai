'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  Check,
  CircleSlash,
  Loader2,
  Play,
  Plus,
  Trash2,
  TriangleAlert,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button, Dialog, DialogContent, EmptyState, Input, Textarea } from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { ModelSelector } from './model-selector'
import { AgentAvatar, AGENT_FACES, faceValue } from '@/components/icons/agent-avatar'
import { AgentMemoryPanel } from './agent-memory'
import { useCompanions } from '@/store/companions'
import { PLACEMENTS } from '@/components/shell/companion-rail'
import { cn, relativeTime, truncate, uid } from '@/lib/utils'
import { useModels } from '@/hooks/use-models'
import { useSettings } from '@/store/settings'
import type { Agent, AgentRun } from '@/lib/db/types'
import type { McpTool } from '@/lib/mcp/types'
import type { ModelChoice } from '@/lib/providers/types'
import type { Tab } from '@/store/workspace'

/**
 * A fresh agent starts with a face, a model and a step ceiling — the dialog is
 * where it gets a name and a character.
 *
 * The model matters here. An agent must name one: "Auto" is a routing decision
 * made per message, and an agent that re-picks its brain every turn is not a
 * colleague. Handing it a real model up front is the difference between a New
 * Agent dialog you can save and one whose button is simply dead.
 */
function blankAgent(model: ModelChoice | null): Partial<Agent> {
  return {
    avatar: faceValue(AGENT_FACES[Math.floor(Math.random() * AGENT_FACES.length)]),
    maxSteps: 6,
    toolIds: [],
    instructions: '',
    name: '',
    companion: true,
    placement: 'right',
    providerId: model?.providerId,
    modelId: model?.modelId,
  }
}

/** Why the Save button is not available yet, in the order worth fixing. */
function blocker(draft: Partial<Agent>): string | null {
  if (!draft.name?.trim()) return 'Give it a name.'
  if (!draft.modelId) return 'Choose a model — an agent cannot run on Auto.'
  return null
}

/**
 * Agents.
 *
 * An agent is a saved configuration — a model, standing instructions, the tools
 * it may reach for, and hard limits — plus a history of what it did. Runs happen
 * in the background, so starting one does not hold the interface hostage.
 */
export function AgentsWorkspace({ tab }: { tab: Tab }) {
  const client = useQueryClient()
  const { data: chatModels } = useModels('CHAT')
  const preferredModel = useSettings((s) => s.chatModel)
  const railIds = useCompanions((s) => s.active)
  const toggleRail = useCompanions((s) => s.toggle)
  const activateRail = useCompanions((s) => s.activate)
  const [editing, setEditing] = useState<Partial<Agent> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>((tab.state.agentId as string) ?? null)

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => ((await (await fetch('/api/agents')).json()) as { agents: Agent[] }).agents,
  })

  const { data: mcp } = useQuery({
    queryKey: ['mcp'],
    queryFn: async () => (await (await fetch('/api/mcp')).json()) as { tools: McpTool[] },
    staleTime: 60_000,
  })

  const save = useMutation({
    mutationFn: async (agent: Partial<Agent>) => {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agent),
      })
      const body = (await res.json()) as { agent?: Agent; error?: { message: string } }
      if (!res.ok || !body.agent) throw new Error(body.error?.message ?? 'Could not save the agent.')
      return body.agent
    },
    onSuccess: (agent) => {
      void client.invalidateQueries({ queryKey: ['agents'] })
      setEditing(null)
      // Ticking "sits on the rail" and then finding nothing on the rail reads
      // as a broken setting, so saving puts it there.
      if (agent.companion) activateRail(agent.id)
      toast.success(agent.companion ? `${agent.name} is on the rail.` : 'Agent saved')
    },
    onError: (err: Error) => toast.error('Could not save', { description: err.message }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['agents'] })
      setSelectedId(null)
    },
  })

  const selected = (agents ?? []).find((a) => a.id === selectedId)

  // Whatever the workspace is already using for chat, or the first model that
  // is actually reachable. Local models come first in the catalogue, so this
  // lands on the local runtime when one is running.
  const defaultModel = useMemo<ModelChoice | null>(() => {
    const models = chatModels?.models ?? []
    if (preferredModel && models.some((m) => m.providerId === preferredModel.providerId && m.id === preferredModel.modelId)) {
      return preferredModel
    }
    const first = models[0]
    return first ? { providerId: first.providerId, modelId: first.id } : null
  }, [chatModels?.models, preferredModel])

  return (
    <WorkspaceScroll>
      <WorkspaceHeader
        title="Agents"
        subtitle="A face, a role, a voice and a model. Activate one and it joins the rail on the right, where it watches what you are doing and says so."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setEditing(blankAgent(defaultModel))}
          >
            <Plus className="h-3.5 w-3.5" />
            New agent
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[132px] rounded-[14px] shimmer" />
          ))}
        </div>
      ) : !(agents ?? []).length ? (
        <EmptyState
          icon={Bot}
          title="No agents yet."
          line="An agent is a model you have briefed once, so you do not have to brief it again."
          action={
            <Button
              variant="primary"
              size="md"
              onClick={() => setEditing(blankAgent(defaultModel))}
            >
              Create an agent
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-3">
          {(agents ?? []).map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              active={agent.id === selectedId}
              onRail={railIds.includes(agent.id)}
              onToggleRail={() => toggleRail(agent.id)}
              onOpen={() => setSelectedId(agent.id === selectedId ? null : agent.id)}
              onEdit={() => setEditing(agent)}
              onDelete={() => remove.mutate(agent.id)}
            />
          ))}
        </div>
      )}

      {selected && (
        <>
          <RunPanel agent={selected} />
          <AgentMemoryPanel agentId={selected.id} agentName={selected.name} />
        </>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <AgentDialog
            draft={editing}
            tools={mcp?.tools ?? []}
            onChange={setEditing}
            onSave={() => save.mutate(editing)}
            saving={save.isPending}
          />
        )}
      </Dialog>
    </WorkspaceScroll>
  )
}

function AgentCard({
  agent,
  active,
  onRail,
  onToggleRail,
  onOpen,
  onEdit,
  onDelete,
}: {
  agent: Agent
  active: boolean
  /** Sitting on the companion rail, where it can speak up. */
  onRail: boolean
  onToggleRail: () => void
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'group rounded-[14px] border bg-surface p-4 transition-colors',
        active ? 'border-local' : 'border-line hover:border-line-strong',
      )}
    >
      <button onClick={onOpen} className="flex w-full items-start gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-line bg-subtle text-[17px]">
          <AgentAvatar avatar={agent.avatar} name={agent.name} className="h-8 w-8 rounded-[10px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 truncate text-[14px] font-medium tracking-[-0.01em] text-ink">
              {agent.name}
            </span>
            {agent.role && (
              <span className="shrink-0 truncate text-[11.5px] text-ink-faint">{agent.role}</span>
            )}
          </span>
          <span className="mt-0.5 block line-clamp-2 min-h-[32px] text-[12.5px] leading-relaxed text-ink-muted">
            {agent.character || agent.description || truncate(agent.instructions || 'No instructions yet.', 70)}
          </span>
        </span>
      </button>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5 text-[11px] text-ink-faint">
        <button
          onClick={onToggleRail}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] transition-colors',
            onRail
              ? 'border-local text-local'
              : 'border-line hover:border-line-strong hover:text-ink-muted',
          )}
        >
          <span className={cn('h-[5px] w-[5px] rounded-full', onRail ? 'bg-local' : 'bg-line-strong')} />
          {onRail ? 'On the rail' : 'Activate'}
        </button>
        <span className="inline-flex items-center gap-1">
          <Wrench className="h-[11px] w-[11px]" />
          {agent.toolIds.length}
        </span>
        <button
          onClick={onEdit}
          className="ml-auto opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
          aria-label="Delete agent"
        >
          <Trash2 className="h-[12px] w-[12px]" />
        </button>
      </div>
    </div>
  )
}

function AgentDialog({
  draft,
  tools,
  onChange,
  onSave,
  saving,
}: {
  draft: Partial<Agent>
  tools: McpTool[]
  onChange: (next: Partial<Agent>) => void
  onSave: () => void
  saving: boolean
}) {
  const model: ModelChoice | null =
    draft.providerId && draft.modelId
      ? { providerId: draft.providerId as ModelChoice['providerId'], modelId: draft.modelId }
      : null

  const byServer = useMemo(() => {
    const map = new Map<string, McpTool[]>()
    for (const tool of tools) map.set(tool.serverName, [...(map.get(tool.serverName) ?? []), tool])
    return [...map.entries()]
  }, [tools])

  const toggleTool = (id: string) => {
    const current = draft.toolIds ?? []
    onChange({
      ...draft,
      toolIds: current.includes(id) ? current.filter((t) => t !== id) : [...current, id],
    })
  }

  const reason = blocker(draft)

  return (
    <DialogContent
      title={draft.id ? 'Edit agent' : 'New agent'}
      description="A face, a name, a voice, and the model behind it."
      width="lg"
    >
      <div className="max-h-[62vh] min-h-0 space-y-4 overflow-y-auto px-5 pb-5">
        <div className="flex gap-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">Face</label>
            {/* Twelve faces, not a colour swatch: an agent you can pick out of
                a row at a glance has a character before it has said anything. */}
            <div className="grid w-[184px] grid-cols-4 gap-1">
              {AGENT_FACES.map((face) => {
                const value = faceValue(face)
                return (
                  <button
                    key={face}
                    onClick={() => onChange({ ...draft, avatar: value })}
                    className={cn(
                      'flex h-[42px] w-[42px] items-center justify-center rounded-[10px] border transition-colors',
                      draft.avatar === value ? 'border-ink bg-subtle' : 'border-line hover:bg-subtle',
                    )}
                    aria-label={face}
                    aria-pressed={draft.avatar === value}
                  >
                    <AgentAvatar avatar={value} className="h-[32px] w-[32px]" />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-ink">Name</label>
              <Input
                autoFocus
                value={draft.name ?? ''}
                onChange={(e) => onChange({ ...draft, name: e.target.value })}
                placeholder="Ada"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-ink">
                Role
                <span className="text-[11px] font-normal text-ink-faint">what it is for</span>
              </label>
              <Input
                value={draft.role ?? ''}
                onChange={(e) => onChange({ ...draft, role: e.target.value })}
                placeholder="Art director"
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-ink">
                Character
                <span className="text-[11px] font-normal text-ink-faint">how it talks</span>
              </label>
              <Textarea
                rows={2}
                value={draft.character ?? ''}
                onChange={(e) => onChange({ ...draft, character: e.target.value })}
                placeholder="Dry, direct, allergic to filler. Asks one sharp question instead of offering three options."
              />
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border border-line bg-subtle px-3 py-2.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={draft.companion ?? false}
              onChange={(e) => onChange({ ...draft, companion: e.target.checked })}
              className="mt-[2px] h-[14px] w-[14px] accent-[var(--color-local)]"
            />
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ink">Comes out as a companion</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-muted">
                Lives on screen while you work, watching what you are doing and speaking up in its
                own voice.
              </span>
            </span>
          </label>

          {/*
            Placement is the agent's own, not a global preference. Where it sits
            changes what it is: one parked over the composer is in your eyeline
            while you write, one hanging from the top is out of the way of
            everything, and those suit different agents.
          */}
          {draft.companion && (
            <div className="mt-3 border-t border-line pt-2.5">
              <p className="mb-1.5 text-[11.5px] font-medium text-ink">Where it lives</p>
              <div className="grid grid-cols-2 gap-1">
                {PLACEMENTS.map((place) => {
                  const chosen = (draft.placement ?? 'right') === place.id
                  return (
                    <button
                      key={place.id}
                      onClick={() => onChange({ ...draft, placement: place.id })}
                      className={cn(
                        'rounded-[8px] border px-2.5 py-1.5 text-left transition-colors',
                        chosen
                          ? 'border-local bg-surface'
                          : 'border-line hover:border-line-strong hover:bg-surface',
                      )}
                      aria-pressed={chosen}
                    >
                      <span className="block text-[12px] font-medium text-ink">{place.label}</span>
                      <span className="mt-0.5 block text-[10.5px] leading-[1.4] text-ink-faint">
                        {place.hint}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-ink">Instructions</label>
          <Textarea
            rows={5}
            value={draft.instructions ?? ''}
            onChange={(e) => onChange({ ...draft, instructions: e.target.value })}
            placeholder="How it should behave, what it should prioritise, and what it should never do."
          />
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            This is the system prompt. Character is the voice on top of it.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">Model</label>
            <ModelSelector
              capability="CHAT"
              value={model}
              onChange={(choice) =>
                onChange({ ...draft, providerId: choice?.providerId, modelId: choice?.modelId })
              }
              className="w-full justify-start"
            />
          </div>
          <div>
            <label className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-ink">
              Step limit
              <span className="text-[11px] font-normal text-ink-faint">tool rounds before it stops</span>
            </label>
            <Input
              type="number"
              min={1}
              max={25}
              value={draft.maxSteps ?? 6}
              onChange={(e) => onChange({ ...draft, maxSteps: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">Temperature</label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              placeholder="model default"
              value={draft.temperature ?? ''}
              onChange={(e) =>
                onChange({ ...draft, temperature: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">Max tokens per reply</label>
            <Input
              type="number"
              min={64}
              placeholder="model default"
              value={draft.maxTokens ?? ''}
              onChange={(e) =>
                onChange({ ...draft, maxTokens: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 flex items-baseline justify-between text-[12px] font-medium text-ink">
            Tools
            <span className="text-[11px] font-normal text-ink-faint">
              {(draft.toolIds ?? []).length} of {tools.length} selected
            </span>
          </label>

          {tools.length === 0 ? (
            <p className="rounded-[10px] border border-line bg-subtle px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              No MCP servers are connected. Add one in Settings → Providers and its tools appear here.
            </p>
          ) : (
            <div className="max-h-[180px] space-y-2.5 overflow-y-auto rounded-[10px] border border-line p-2.5">
              {byServer.map(([server, serverTools]) => (
                <div key={server}>
                  <p className="mb-1 px-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                    {server}
                  </p>
                  {serverTools.map((tool) => {
                    const on = (draft.toolIds ?? []).includes(tool.id)
                    return (
                      <button
                        key={tool.id}
                        onClick={() => toggleTool(tool.id)}
                        className="flex w-full items-start gap-2 rounded-[8px] px-1.5 py-[5px] text-left transition-colors hover:bg-subtle"
                      >
                        <span
                          className={cn(
                            'mt-[2px] flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[4px] border',
                            on ? 'border-local bg-local text-white' : 'border-line-strong',
                          )}
                        >
                          {on && <Check className="h-[9px] w-[9px]" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-ink">{tool.name}</span>
                          {tool.description && (
                            <span className="block truncate text-[11px] text-ink-faint">
                              {tool.description}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/*
        Pinned rather than at the end of the scroll: this dialog is tall enough
        that Save used to sit below the fold, which reads as a broken button
        rather than a hidden one. The reason it is disabled is stated next to
        it for the same reason.
      */}
      <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-3">
        <p className="min-w-0 flex-1 truncate text-[12px] text-ink-faint">
          {reason ?? `${(draft.toolIds ?? []).length} tool${(draft.toolIds ?? []).length === 1 ? '' : 's'} allow-listed`}
        </p>
        <Button variant="primary" size="md" disabled={Boolean(reason) || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save agent'}
        </Button>
      </div>
    </DialogContent>
  )
}

function RunPanel({ agent }: { agent: Agent }) {
  const client = useQueryClient()
  const [input, setInput] = useState('')

  const { data: runs } = useQuery({
    queryKey: ['agent-runs', agent.id],
    queryFn: async () =>
      ((await (await fetch(`/api/agents/run?agentId=${agent.id}`)).json()) as { runs: AgentRun[] }).runs,
    // Poll while anything is moving, so a background run reports itself.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((r) => r.status === 'RUNNING' || r.status === 'QUEUED') ? 2000 : false,
  })

  const start = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: agent.id, input }),
      })
      const body = (await res.json()) as { run?: AgentRun; error?: { message: string } }
      if (!res.ok || !body.run) throw new Error(body.error?.message ?? 'Could not start the run.')
      return body.run
    },
    onSuccess: () => {
      setInput('')
      void client.invalidateQueries({ queryKey: ['agent-runs', agent.id] })
    },
    onError: (err: Error) => toast.error('Could not start', { description: err.message }),
  })

  return (
    <div className="mt-6 rounded-[14px] border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <AgentAvatar avatar={agent.avatar} name={agent.name} className="h-[24px] w-[24px] text-[15px]" />
        <p className="text-[13.5px] font-medium text-ink">{agent.name}</p>
        <span className="text-[11.5px] text-ink-faint">runs in the background</span>
      </div>

      <div className="flex items-start gap-2 p-3">
        <Textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && input.trim()) start.mutate()
          }}
          placeholder="What should it do?"
          className="flex-1"
        />
        <Button
          variant="primary"
          size="md"
          disabled={!input.trim() || start.isPending}
          onClick={() => start.mutate()}
        >
          <Play className="h-3.5 w-3.5" />
          Run
        </Button>
      </div>

      <div className="max-h-[420px] overflow-y-auto border-t border-line">
        {!(runs ?? []).length ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">No runs yet.</p>
        ) : (
          (runs ?? []).map((run) => <RunRow key={run.id} run={run} />)
        )}
      </div>
    </div>
  )
}

function RunRow({ run }: { run: AgentRun }) {
  const [open, setOpen] = useState(run.status === 'RUNNING')
  const client = useQueryClient()

  const cancel = async () => {
    await fetch(`/api/agents/run?id=${run.id}`, { method: 'DELETE' })
    void client.invalidateQueries({ queryKey: ['agent-runs', run.agentId] })
  }

  return (
    <div className="border-b border-line px-4 py-3 last:border-0">
      {/*
        Two controls side by side, not one inside the other. Cancel used to be
        nested in the expand button, which is invalid HTML — a button cannot
        contain a button — and React refuses to hydrate it. `stopPropagation`
        made it behave in the browser, which is exactly why it survived.
      */}
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          aria-expanded={open}
        >
          <RunGlyph status={run.status} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] text-ink">{truncate(run.input, 76)}</span>
            <span className="mt-0.5 block text-[11px] text-ink-faint">
              {run.steps.length} steps · {relativeTime(run.startedAt)}
              {run.status === 'RUNNING' && ' · running'}
            </span>
          </span>
        </button>

        {run.status === 'RUNNING' && (
          <button
            onClick={() => void cancel()}
            className="shrink-0 text-[11px] text-ink-faint transition-colors hover:text-danger"
          >
            Cancel
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2.5 space-y-1.5 border-l border-line pl-3.5">
          {run.steps.map((step, index) => (
            <div key={index} className="flex items-start gap-2 text-[12px]">
              <span
                className={cn(
                  'mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full',
                  step.kind === 'tool'
                    ? 'bg-accent'
                    : step.kind === 'error'
                      ? 'bg-danger'
                      : step.kind === 'answer'
                        ? 'bg-local'
                        : 'bg-line-strong',
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="text-ink">{step.label}</span>
                {step.detail && (
                  <span className="ml-1.5 font-mono text-[11px] text-ink-faint">
                    {truncate(step.detail, 70)}
                  </span>
                )}
              </span>
            </div>
          ))}

          {run.output && (
            <div className="mt-2 rounded-[10px] border border-line bg-subtle px-3 py-2.5 text-[12.5px] leading-relaxed text-ink">
              {run.output}
            </div>
          )}
          {run.error && (
            <p className="mt-2 rounded-[10px] bg-danger-soft px-3 py-2 text-[12px] text-danger">{run.error}</p>
          )}
        </div>
      )}
    </div>
  )
}

function RunGlyph({ status }: { status: AgentRun['status'] }) {
  const cn_ = 'h-[13px] w-[13px] shrink-0 mt-[2px]'
  if (status === 'COMPLETED') return <Check className={cn(cn_, 'text-local')} />
  if (status === 'FAILED') return <TriangleAlert className={cn(cn_, 'text-danger')} />
  if (status === 'CANCELLED') return <CircleSlash className={cn(cn_, 'text-ink-faint')} />
  return <Loader2 className={cn(cn_, 'animate-spin text-accent')} />
}
