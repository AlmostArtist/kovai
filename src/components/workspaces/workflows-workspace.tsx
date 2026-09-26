'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Check,
  Crosshair,
  CircleDot,
  Play,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  EmptyState,
  Input,
  Select,
  Textarea,
  Tooltip,
} from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { ModelSelector } from './model-selector'
import { useWorkspace, type Tab } from '@/store/workspace'
import { cn, relativeTime, uid } from '@/lib/utils'
import type { Workflow, WorkflowNode, WorkflowRun } from '@/lib/db/types'

const NODE_TYPES: { type: WorkflowNode['type']; label: string; hint: string }[] = [
  { type: 'INPUT', label: 'Input', hint: 'A value the run starts with' },
  { type: 'VISION', label: 'Vision', hint: 'Read an image' },
  { type: 'CHAT', label: 'Chat', hint: 'Generate or transform text' },
  { type: 'IMAGE', label: 'Image', hint: 'Generate an image' },
  { type: 'VIDEO', label: 'Video', hint: 'Generate video' },
  { type: 'HTTP', label: 'HTTP', hint: 'Call an external service' },
  { type: 'CONDITION', label: 'Condition', hint: 'Continue only if true' },
  { type: 'TRANSFORM', label: 'Transform', hint: 'Reshape a value' },
  { type: 'SAVE', label: 'Save', hint: 'File the result as an asset' },
  { type: 'EXPORT', label: 'Export', hint: 'Return the result' },
]

function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: async () =>
      ((await (await fetch('/api/workflows')).json()) as { workflows: Workflow[] }).workflows,
  })
}

export function WorkflowsWorkspace(_props: { tab: Tab }) {
  const { data: workflows, isLoading } = useWorkflows()
  const openTab = useWorkspace((s) => s.openTab)
  const client = useQueryClient()

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Untitled workflow',
          // A starting shape that shows the idea: read an image, write a prompt
          // from it, generate, keep the result.
          nodes: [
            { id: uid(), type: 'INPUT', label: 'Input image', position: { x: 40, y: 60 }, config: {} },
          ],
          edges: [],
        }),
      })
      return ((await res.json()) as { workflow: Workflow }).workflow
    },
    onSuccess: (workflow) => {
      void client.invalidateQueries({ queryKey: ['workflows'] })
      openTab({ kind: 'workflow', title: workflow.name, state: { workflowId: workflow.id } })
    },
  })

  return (
    <WorkspaceScroll>
      <WorkspaceHeader
        title="Workflows"
        subtitle="Chain vision, text and generation into something repeatable."
        actions={
          <Button variant="primary" size="sm" onClick={() => create.mutate()}>
            <Plus className="h-3.5 w-3.5" />
            New workflow
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[62px] rounded-[11px] shimmer" />
          ))}
        </div>
      ) : !workflows?.length ? (
        <EmptyState
          icon={WorkflowIcon}
          title="No workflows yet."
          line="Build a sequence once, then run it whenever you need it."
          action={
            <Button variant="primary" size="md" onClick={() => create.mutate()}>
              Create workflow
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {workflows.map((workflow) => (
            <button
              key={workflow.id}
              onClick={() =>
                openTab({ kind: 'workflow', title: workflow.name, state: { workflowId: workflow.id } })
              }
              className="flex w-full items-center gap-3 rounded-[11px] border border-line bg-surface px-4 py-3.5 text-left transition-colors duration-150 hover:border-line-strong"
            >
              <WorkflowIcon className="h-[15px] w-[15px] shrink-0 text-ink-faint" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-ink">{workflow.name}</p>
                <p className="mt-0.5 truncate text-[12px] text-ink-faint">
                  {workflow.nodes.map((n) => n.label).join(' → ') || 'No steps yet'}
                </p>
              </div>
              <span className="shrink-0 text-[11.5px] text-ink-faint">
                {relativeTime(workflow.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </WorkspaceScroll>
  )
}

/**
 * The node editor.
 *
 * Deliberately monochrome: the structure of the work should be what stands out,
 * not a palette of coloured boxes. Nodes are dragged to position and wired by
 * clicking a node's output then another node's input.
 */
/** A node card's footprint, which framing has to allow for. */
const NODE_WIDTH = 208
const NODE_HEIGHT = 72

export function WorkflowEditor({ tab }: { tab: Tab }) {
  const workflowId = tab.state.workflowId as string | undefined
  const client = useQueryClient()
  const renameTab = useWorkspace((s) => s.renameTab)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const { data } = useQuery({
    queryKey: ['workflow', workflowId],
    enabled: Boolean(workflowId),
    queryFn: async () =>
      (await (await fetch(`/api/workflows/${workflowId}`)).json()) as {
        workflow: Workflow | null
        runs: WorkflowRun[]
      },
  })

  const workflow = data?.workflow

  const save = useMutation({
    mutationFn: async (next: Workflow) => {
      await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['workflow', workflowId] })
      void client.invalidateQueries({ queryKey: ['workflows'] })
    },
  })

  const execute = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/workflows/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId }),
      })
      const body = (await res.json()) as { run?: WorkflowRun; error?: { message: string } }
      if (!res.ok || !body.run) throw new Error(body.error?.message ?? 'The workflow could not run.')
      return body.run
    },
    onSuccess: (result) => {
      setRun(result)
      if (result.status === 'COMPLETED') toast.success('Workflow completed')
      else toast.error('Workflow failed', { description: result.error })
    },
    onError: (err: Error) => toast.error('Workflow failed', { description: err.message }),
  })

  const update = useCallback(
    (patch: Partial<Workflow>) => {
      if (!workflow) return
      const next = { ...workflow, ...patch, updatedAt: Date.now() }
      client.setQueryData(['workflow', workflowId], { ...data, workflow: next })
      save.mutate(next)
    },
    [workflow, client, workflowId, data, save],
  )

  const addNode = (type: WorkflowNode['type']) => {
    if (!workflow) return
    const preset = NODE_TYPES.find((n) => n.type === type)!
    const node: WorkflowNode = {
      id: uid(),
      type,
      label: preset.label,
      position: { x: 40 + (workflow.nodes.length % 3) * 236, y: 60 + Math.floor(workflow.nodes.length / 3) * 150 },
      config: {},
    }
    update({ nodes: [...workflow.nodes, node] })
    setSelectedId(node.id)
  }

  /**
   * Scrolls the canvas to the graph.
   *
   * Node positions are saved wherever they were last dragged, and the canvas
   * opens at 0,0 regardless — so a workflow whose steps sit 700px down opened
   * on empty grid, which reads as a workflow that lost its steps. This frames
   * whatever is actually there.
   */
  const frame = useCallback(
    (smooth = true) => {
      const el = canvasRef.current
      const nodes = workflow?.nodes ?? []
      if (!el || !nodes.length) return

      // The graph's bounding box, allowing for the size of a card.
      const left = Math.min(...nodes.map((n) => n.position.x))
      const top = Math.min(...nodes.map((n) => n.position.y))
      const right = Math.max(...nodes.map((n) => n.position.x)) + NODE_WIDTH
      const bottom = Math.max(...nodes.map((n) => n.position.y)) + NODE_HEIGHT

      // Centred when the whole graph fits, otherwise pinned to its top-left
      // corner — which is where you would start reading it anyway.
      const x = right - left <= el.clientWidth ? (left + right - el.clientWidth) / 2 : left - 56
      const y = bottom - top <= el.clientHeight ? (top + bottom - el.clientHeight) / 2 : top - 56

      el.scrollTo({
        left: Math.max(0, x),
        top: Math.max(0, y),
        behavior: smooth ? 'smooth' : 'auto',
      })
    },
    [workflow?.nodes],
  )

  // Once, when the graph first arrives — not on every edit, or dragging a node
  // near the edge would yank the canvas out from under the pointer.
  const framed = useRef<string | null>(null)
  useEffect(() => {
    if (!workflowId || !workflow?.nodes.length || framed.current === workflowId) return
    framed.current = workflowId
    frame(false)
  }, [workflowId, workflow?.nodes.length, frame])

  const selected = workflow?.nodes.find((n) => n.id === selectedId) ?? null
  const stepStatus = useMemo(
    () => new Map((run?.steps ?? []).map((s) => [s.nodeId, s.status])),
    [run],
  )

  if (!workflow) {
    return (
      <WorkspaceScroll>
        <EmptyState icon={WorkflowIcon} title="This workflow no longer exists." />
      </WorkspaceScroll>
    )
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
          <input
            value={workflow.name}
            onChange={(e) => update({ name: e.target.value })}
            onBlur={() => renameTab(tab.id, workflow.name)}
            className="min-w-0 flex-1 bg-transparent text-[13.5px] font-medium text-ink outline-none"
          />
          {linkFrom && (
            <span className="text-[11.5px] text-accent">Choose the next step…</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={!workflow.nodes.length}
            onClick={() => frame()}
            title="Scroll to the steps"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Fit
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={execute.isPending || !workflow.nodes.length}
            onClick={() => execute.mutate()}
          >
            <Play className="h-3.5 w-3.5" />
            {execute.isPending ? 'Running…' : 'Run'}
          </Button>
        </div>

        <div
          ref={canvasRef}
          className="relative min-h-0 flex-1 overflow-auto bg-canvas"
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--color-line-strong) 70%, transparent) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
          onMouseMove={(e) => {
            if (!drag.current || !canvasRef.current) return
            const rect = canvasRef.current.getBoundingClientRect()
            const x = e.clientX - rect.left + canvasRef.current.scrollLeft - drag.current.dx
            const y = e.clientY - rect.top + canvasRef.current.scrollTop - drag.current.dy
            const id = drag.current.id
            client.setQueryData(['workflow', workflowId], {
              ...data,
              workflow: {
                ...workflow,
                nodes: workflow.nodes.map((n) =>
                  n.id === id ? { ...n, position: { x: Math.max(0, x), y: Math.max(0, y) } } : n,
                ),
              },
            })
          }}
          onMouseUp={() => {
            if (drag.current) {
              drag.current = null
              save.mutate(workflow)
            }
          }}
          onClick={() => setLinkFrom(null)}
        >
          <Edges workflow={workflow} onRemove={(id) => update({ edges: workflow.edges.filter((e) => e.id !== id) })} />

          {workflow.nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              status={stepStatus.get(node.id)}
              linking={linkFrom === node.id}
              onSelect={() => setSelectedId(node.id)}
              onStartLink={() => setLinkFrom(node.id)}
              onFinishLink={() => {
                if (!linkFrom || linkFrom === node.id) return
                const exists = workflow.edges.some((e) => e.from === linkFrom && e.to === node.id)
                if (!exists)
                  update({ edges: [...workflow.edges, { id: uid(), from: linkFrom, to: node.id }] })
                setLinkFrom(null)
              }}
              onDragStart={(dx, dy) => (drag.current = { id: node.id, dx, dy })}
            />
          ))}

          {!workflow.nodes.length && (
            <div className="absolute inset-0 flex items-center justify-center">
              <EmptyState
                icon={WorkflowIcon}
                title="Add the first step."
                line="Start with an Input, then chain the work you want repeated."
              />
            </div>
          )}
        </div>
      </div>

      <aside className="flex w-[300px] shrink-0 flex-col border-l border-line bg-surface">
        <div className="shrink-0 border-b border-line p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
            Add step
          </p>
          <div className="grid grid-cols-2 gap-1">
            {NODE_TYPES.map((entry) => (
              <Tooltip key={entry.type} content={entry.hint}>
                <button
                  onClick={() => addNode(entry.type)}
                  className="rounded-[7px] border border-line bg-subtle px-2 py-[6px] text-[12px] text-ink-muted transition-colors hover:text-ink"
                >
                  {entry.label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {selected ? (
            <NodeInspector
              node={selected}
              onChange={(next) =>
                update({ nodes: workflow.nodes.map((n) => (n.id === next.id ? next : n)) })
              }
              onDelete={() => {
                update({
                  nodes: workflow.nodes.filter((n) => n.id !== selected.id),
                  edges: workflow.edges.filter((e) => e.from !== selected.id && e.to !== selected.id),
                })
                setSelectedId(null)
              }}
            />
          ) : run ? (
            <RunSummary run={run} nodes={workflow.nodes} />
          ) : (
            <p className="text-[12.5px] leading-relaxed text-ink-faint">
              Select a step to configure it. Reference an earlier step&rsquo;s output with{' '}
              <code className="font-mono text-[11.5px]">{'{{stepId}}'}</code>.
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

function Edges({ workflow, onRemove }: { workflow: Workflow; onRemove: (id: string) => void }) {
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]))
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ minHeight: 1200, minWidth: 1600 }}>
      {workflow.edges.map((edge) => {
        const from = byId.get(edge.from)
        const to = byId.get(edge.to)
        if (!from || !to) return null
        const x1 = from.position.x + 208
        const y1 = from.position.y + 34
        const x2 = to.position.x
        const y2 = to.position.y + 34
        const mid = (x1 + x2) / 2
        return (
          <g key={edge.id} className="pointer-events-auto">
            <path
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="var(--color-line-strong)"
              strokeWidth="1.5"
            />
            <circle
              cx={mid}
              cy={(y1 + y2) / 2}
              r="7"
              fill="var(--color-surface)"
              stroke="var(--color-line)"
              className="cursor-pointer"
              onClick={() => onRemove(edge.id)}
            />
            <text
              x={mid}
              y={(y1 + y2) / 2 + 3}
              textAnchor="middle"
              fontSize="9"
              fill="var(--color-ink-faint)"
              className="cursor-pointer select-none"
              onClick={() => onRemove(edge.id)}
            >
              ×
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function NodeCard({
  node,
  selected,
  status,
  linking,
  onSelect,
  onStartLink,
  onFinishLink,
  onDragStart,
}: {
  node: WorkflowNode
  selected: boolean
  status?: string
  linking: boolean
  onSelect: () => void
  onStartLink: () => void
  onFinishLink: () => void
  onDragStart: (dx: number, dy: number) => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'absolute w-[208px] cursor-default select-none rounded-[11px] border bg-surface shadow-panel transition-shadow',
        selected ? 'border-ink' : 'border-line',
        linking && 'ring-2 ring-accent',
      )}
      style={{ left: node.position.x, top: node.position.y }}
      onClick={(e) => {
        e.stopPropagation()
        onFinishLink()
        onSelect()
      }}
      onMouseDown={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        onDragStart(e.clientX - rect.left, e.clientY - rect.top)
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <StepGlyph status={status} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-ink">{node.label}</p>
          <p className="text-[10.5px] uppercase tracking-[0.06em] text-ink-faint">{node.type}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onStartLink()
          }}
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-line text-ink-faint transition-colors hover:border-ink hover:text-ink"
          title="Connect to another step"
        >
          <ArrowRight className="h-[10px] w-[10px]" />
        </button>
      </div>
    </motion.div>
  )
}

function StepGlyph({ status }: { status?: string }) {
  if (status === 'COMPLETED') return <Check className="h-[13px] w-[13px] shrink-0 text-local" />
  if (status === 'FAILED') return <X className="h-[13px] w-[13px] shrink-0 text-danger" />
  if (status === 'RUNNING')
    return <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent breathe" />
  return <CircleDot className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
}

function NodeInspector({
  node,
  onChange,
  onDelete,
}: {
  node: WorkflowNode
  onChange: (node: WorkflowNode) => void
  onDelete: () => void
}) {
  const config = node.config as Record<string, string | undefined>
  const set = (key: string, value: unknown) => onChange({ ...node, config: { ...node.config, [key]: value } })

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[12px] font-medium text-ink">Label</label>
        <Input value={node.label} onChange={(e) => onChange({ ...node, label: e.target.value })} />
        <p className="mt-1.5 font-mono text-[10.5px] text-ink-faint">id: {node.id.slice(0, 8)}</p>
      </div>

      {(node.type === 'CHAT' || node.type === 'VISION') && (
        <>
          <ModelField
            capability={node.type === 'VISION' ? 'VISION' : 'CHAT'}
            providerId={config.providerId}
            modelId={config.model}
            onChange={(choice) => {
              set('providerId', choice?.providerId)
              set('model', choice?.modelId)
            }}
          />
          <Labeled label="Prompt">
            <Textarea
              rows={4}
              value={config.prompt ?? ''}
              onChange={(e) => set('prompt', e.target.value)}
              placeholder="Write a cinematic image prompt from {{stepId}}"
            />
          </Labeled>
          {node.type === 'VISION' && (
            <Labeled label="Images from">
              <Input
                value={config.images ?? ''}
                onChange={(e) => set('images', e.target.value)}
                placeholder="stepId"
              />
            </Labeled>
          )}
        </>
      )}

      {(node.type === 'IMAGE' || node.type === 'VIDEO') && (
        <>
          <ModelField
            capability={node.type === 'VIDEO' ? 'VIDEO_GENERATION' : 'IMAGE_GENERATION'}
            providerId={config.providerId}
            modelId={config.model}
            onChange={(choice) => {
              set('providerId', choice?.providerId)
              set('model', choice?.modelId)
            }}
          />
          <Labeled label="Prompt">
            <Textarea
              rows={4}
              value={config.prompt ?? ''}
              onChange={(e) => set('prompt', e.target.value)}
              placeholder="{{stepId}}"
            />
          </Labeled>
          <Labeled label="References from">
            <Input
              value={config.references ?? ''}
              onChange={(e) => set('references', e.target.value)}
              placeholder="stepId"
            />
          </Labeled>
        </>
      )}

      {node.type === 'INPUT' && (
        <Labeled label="Value">
          <Textarea rows={3} value={config.value ?? ''} onChange={(e) => set('value', e.target.value)} />
        </Labeled>
      )}

      {node.type === 'HTTP' && (
        <>
          <Labeled label="Method">
            <Select value={config.method ?? 'GET'} onChange={(e) => set('method', e.target.value)}>
              {['GET', 'POST', 'PUT', 'DELETE'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="URL">
            <Input value={config.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
          </Labeled>
          <Labeled label="Body">
            <Textarea rows={3} value={config.body ?? ''} onChange={(e) => set('body', e.target.value)} />
          </Labeled>
        </>
      )}

      {node.type === 'CONDITION' && (
        <>
          <Labeled label="Left">
            <Input value={config.left ?? ''} onChange={(e) => set('left', e.target.value)} placeholder="{{stepId}}" />
          </Labeled>
          <Labeled label="Operator">
            <Select value={config.operator ?? 'equals'} onChange={(e) => set('operator', e.target.value)}>
              <option value="equals">equals</option>
              <option value="not_equals">does not equal</option>
              <option value="contains">contains</option>
              <option value="not_empty">is not empty</option>
            </Select>
          </Labeled>
          <Labeled label="Right">
            <Input value={config.right ?? ''} onChange={(e) => set('right', e.target.value)} />
          </Labeled>
        </>
      )}

      {node.type === 'TRANSFORM' && (
        <Labeled label="Template">
          <Textarea
            rows={4}
            value={config.template ?? ''}
            onChange={(e) => set('template', e.target.value)}
            placeholder="Shot list:\n{{stepId}}"
          />
        </Labeled>
      )}

      {node.type === 'SAVE' && (
        <>
          <Labeled label="Source">
            <Input value={config.source ?? ''} onChange={(e) => set('source', e.target.value)} placeholder="stepId" />
          </Labeled>
          <Labeled label="Name">
            <Input value={config.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Labeled>
        </>
      )}

      {node.type === 'EXPORT' && (
        <Labeled label="Source">
          <Input value={config.source ?? ''} onChange={(e) => set('source', e.target.value)} placeholder="stepId" />
        </Labeled>
      )}

      <div className="border-t border-line pt-3">
        <Button variant="danger" size="sm" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete step
        </Button>
      </div>
    </div>
  )
}

function ModelField({
  capability,
  providerId,
  modelId,
  onChange,
}: {
  capability: 'CHAT' | 'VISION' | 'IMAGE_GENERATION' | 'VIDEO_GENERATION'
  providerId?: string
  modelId?: string
  onChange: (choice: { providerId: import('@/lib/providers/types').ProviderId; modelId: string } | null) => void
}) {
  return (
    <Labeled label="Model">
      <ModelSelector
        capability={capability}
        value={
          providerId && modelId
            ? { providerId: providerId as import('@/lib/providers/types').ProviderId, modelId }
            : null
        }
        onChange={onChange}
        className="w-full justify-start"
      />
    </Labeled>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-ink">{label}</label>
      {children}
    </div>
  )
}

function RunSummary({ run, nodes }: { run: WorkflowRun; nodes: WorkflowNode[] }) {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return (
    <div>
      <p className="mb-3 text-[12.5px] font-medium text-ink">
        Run {run.status === 'COMPLETED' ? 'completed' : run.status.toLowerCase()}
      </p>
      <div className="space-y-1.5">
        {run.steps.map((step) => (
          <div key={step.nodeId} className="flex items-start gap-2">
            <StepGlyph status={step.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] text-ink">
                {byId.get(step.nodeId)?.label ?? 'Step'}
              </p>
              {step.error && (
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-danger">{step.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
