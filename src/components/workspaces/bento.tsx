'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowUpRight,
  Bell,
  Boxes,
  Check,
  CircleAlert,
  Cpu,
  FolderOpen,
  Newspaper,
  Plus,
  RefreshCw,
  StickyNote,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { useWorkspace } from '@/store/workspace'
import { useJobs } from '@/store/jobs'
import { useLocalRuntime } from '@/hooks/use-local-runtime'
import { cn, relativeTime, truncate, uid } from '@/lib/utils'
import type { Note, Project, Task } from '@/lib/db/types'
import type { NewsItem } from '@/lib/news'
import type { Market } from '@/lib/markets'

/**
 * The dashboard tiles.
 *
 * A bento grid earns its keep only if each tile answers a question worth asking
 * on arrival: what happened, what do I owe, what did I write down, what is
 * running. Tiles are live and writable — a to-do you cannot tick is decoration.
 */

export function BentoCard({
  title,
  icon: Icon,
  action,
  className,
  children,
  accent,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
  accent?: 'cloud' | 'local' | 'accent' | 'warn'
}) {
  const tint = {
    cloud: 'text-cloud',
    local: 'text-local',
    accent: 'text-accent',
    warn: 'text-warn',
  }[accent ?? 'accent']

  return (
    <section
      className={cn(
        // Capped so a long list scrolls inside its tile instead of stretching
        // the whole grid row and pushing everything else below the fold.
        'flex max-h-[430px] min-h-0 flex-col overflow-hidden rounded-[18px] border border-line/70 bg-surface/70 backdrop-blur-xl',
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3.5">
        <Icon className={cn('h-[13px] w-[13px] shrink-0', tint)} />
        <h2 className="min-w-0 truncate text-[12.5px] font-medium text-ink">{title}</h2>
        {action && <div className="ml-auto shrink-0 whitespace-nowrap">{action}</div>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2.5">{children}</div>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-5 text-center text-[12px] text-ink-faint">{text}</p>
}

/* ── news ─────────────────────────────────────────────────── */

export function NewsTile({ className }: { className?: string }) {
  const client = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['news'],
    queryFn: async () =>
      (await (await fetch('/api/news?limit=14')).json()) as {
        items: NewsItem[]
        failed: string[]
        cachedAt: number
      },
    staleTime: 10 * 60_000,
  })

  /** Bypasses both caches — the query's and the server's 15-minute window. */
  const refresh = async () => {
    setRefreshing(true)
    try {
      const fresh = await (await fetch('/api/news?limit=14&refresh=1')).json()
      client.setQueryData(['news'], fresh)
    } catch {
      toast.error('Could not refresh the feed')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <BentoCard
      title="Today"
      icon={Newspaper}
      accent="cloud"
      className={className}
      action={
        <div className="flex items-center gap-1.5">
          {data?.cachedAt && (
            <span className="text-[11px] text-ink-faint">{relativeTime(data.cachedAt)}</span>
          )}
          <button
            onClick={() => void refresh()}
            disabled={refreshing}
            title="Fetch the latest"
            aria-label="Refresh the feed"
            className="rounded-[6px] p-1 text-ink-faint transition-colors hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={cn('h-[12px] w-[12px]', refreshing && 'animate-spin')} />
          </button>
        </div>
      }
    >
      {isLoading ? (
        <div className="space-y-2 px-2 py-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[30px] rounded-[8px] shimmer" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <Empty text="No headlines could be loaded." />
      ) : (
        <>
          {data.items.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex gap-2.5 rounded-[11px] px-2 py-[7px] transition-colors hover:bg-subtle"
            >
              <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-cloud/60" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] leading-[1.45] text-ink">{item.title}</span>
                <span className="mt-0.5 block truncate text-[10.5px] text-ink-faint">
                  {item.source} · {relativeTime(item.publishedAt)}
                </span>
              </span>
              <ArrowUpRight className="mt-1 h-[12px] w-[12px] shrink-0 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          ))}
          {data.failed.length > 0 && (
            <p className="px-2 pt-1.5 text-[10.5px] text-ink-faint">
              Could not reach {data.failed.join(', ')}.
            </p>
          )}
        </>
      )}
    </BentoCard>
  )
}

/* ── tasks & reminders ────────────────────────────────────── */

export function TasksTile({ className }: { className?: string }) {
  const client = useQueryClient()
  const [draft, setDraft] = useState('')

  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => ((await (await fetch('/api/tasks')).json()) as { tasks: Task[] }).tasks,
  })

  const save = useMutation({
    mutationFn: async (task: Partial<Task>) => {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      })
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const open = (tasks ?? []).filter((t) => !t.done)
  const due = open.filter((t) => t.dueAt && t.dueAt <= Date.now())

  const add = () => {
    const title = draft.trim()
    if (!title) return
    // "tomorrow 4pm" style parsing is a rabbit hole; a due date is set from the
    // task itself once it exists, where a date picker can be honest about it.
    save.mutate({ id: uid(), title, done: false, priority: 'normal', createdAt: Date.now() })
    setDraft('')
  }

  return (
    <BentoCard
      title="To do"
      icon={Check}
      accent="local"
      className={className}
      action={
        due.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-[6px] bg-warn/15 px-1.5 py-[1px] text-[10.5px] font-medium text-warn">
            <Bell className="h-[9px] w-[9px]" />
            {due.length} due
          </span>
        ) : (
          <span className="text-[11px] text-ink-faint">{open.length} open</span>
        )
      }
    >
      <div className="px-2 pb-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a task…"
          className="h-[30px] w-full rounded-[9px] border border-line bg-subtle px-2.5 text-[12.5px] outline-none transition-colors placeholder:text-ink-faint focus:border-line-strong"
        />
      </div>

      {!(tasks ?? []).length ? (
        <Empty text="Nothing on the list." />
      ) : (
        (tasks ?? []).slice(0, 12).map((task) => {
          const overdue = task.dueAt && task.dueAt <= Date.now() && !task.done
          return (
            <div key={task.id} className="group flex min-w-0 items-start gap-2 rounded-[11px] px-2 py-[6px] hover:bg-subtle">
              <button
                onClick={() =>
                  save.mutate({ ...task, done: !task.done, completedAt: task.done ? undefined : Date.now() })
                }
                className={cn(
                  'mt-[2px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                  task.done ? 'border-local bg-local text-white' : 'border-line-strong hover:border-ink',
                )}
                aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
              >
                {task.done && <Check className="h-[9px] w-[9px]" />}
              </button>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-[12.5px] leading-[1.45] [overflow-wrap:anywhere]',
                    task.done ? 'text-ink-faint line-through' : 'text-ink',
                  )}
                >
                  {task.title}
                </span>
                {task.dueAt && (
                  <span
                    className={cn(
                      'mt-0.5 inline-flex items-center gap-1 text-[10.5px]',
                      overdue ? 'text-warn' : 'text-ink-faint',
                    )}
                  >
                    {overdue && <CircleAlert className="h-[9px] w-[9px]" />}
                    {relativeTime(task.dueAt)}
                  </span>
                )}
              </span>

              <button
                onClick={() => remove.mutate(task.id)}
                className="mt-[2px] shrink-0 text-ink-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                aria-label="Delete task"
              >
                <Trash2 className="h-[12px] w-[12px]" />
              </button>
            </div>
          )
        })
      )}
    </BentoCard>
  )
}

/* ── notes ────────────────────────────────────────────────── */

export function NotesTile({ className }: { className?: string }) {
  const client = useQueryClient()
  const openTab = useWorkspace((s) => s.openTab)

  const { data: notes } = useQuery({
    queryKey: ['notes'],
    queryFn: async () => ((await (await fetch('/api/notes')).json()) as { notes: Note[] }).notes,
  })

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New note', body: '' }),
      })
      return ((await res.json()) as { note: Note }).note
    },
    onSuccess: (note) => {
      void client.invalidateQueries({ queryKey: ['notes'] })
      openTab({ kind: 'notes', title: 'Notes', state: { selectedId: note.id } })
    },
  })

  const TINTS: Record<string, string> = {
    amber: 'bg-warn/12 text-warn',
    green: 'bg-local/12 text-local',
    blue: 'bg-cloud/12 text-cloud',
    violet: 'bg-accent/12 text-accent',
    rose: 'bg-danger/12 text-danger',
    neutral: 'bg-subtle text-ink-muted',
  }

  return (
    <BentoCard
      title="Notes"
      icon={StickyNote}
      accent="warn"
      className={className}
      action={
        <button
          onClick={() => create.mutate()}
          className="rounded-[6px] p-1 text-ink-faint transition-colors hover:text-ink"
          aria-label="New note"
        >
          <Plus className="h-[13px] w-[13px]" />
        </button>
      }
    >
      {!(notes ?? []).length ? (
        <Empty text="Nothing written down yet." />
      ) : (
        (notes ?? []).slice(0, 8).map((note) => (
          <button
            key={note.id}
            onClick={() => openTab({ kind: 'notes', title: 'Notes', state: { selectedId: note.id } })}
            className="flex w-full items-start gap-2.5 rounded-[11px] px-2 py-[7px] text-left transition-colors hover:bg-subtle"
          >
            <span
              className={cn(
                'mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px]',
                TINTS[note.color ?? 'neutral'],
              )}
            >
              <StickyNote className="h-[11px] w-[11px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-ink">{note.title}</span>
              <span className="block truncate text-[10.5px] text-ink-faint">
                {note.body ? truncate(note.body, 44) : relativeTime(note.updatedAt)}
              </span>
            </span>
          </button>
        ))
      )}
    </BentoCard>
  )
}

/* ── work in progress ─────────────────────────────────────── */

export function WorkTile({ className }: { className?: string }) {
  const openTab = useWorkspace((s) => s.openTab)
  const jobs = useJobs((s) => s.jobs)

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => ((await (await fetch('/api/projects')).json()) as { projects: Project[] }).projects,
  })

  const generations = useMemo(
    () =>
      Object.values(jobs)
        .filter((j) => j.status === 'COMPLETED' && j.outputs.length)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 4),
    [jobs],
  )

  return (
    <BentoCard title="Your work" icon={FolderOpen} className={className}>
      {generations.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 px-2 pb-2">
          {generations.map((job) => (
            <button
              key={job.id}
              onClick={() => openTab({ kind: 'assets', title: 'Assets' })}
              title={job.prompt}
              className="aspect-square overflow-hidden rounded-[9px] border border-line"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={job.outputs[0].url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {!(projects ?? []).length && !generations.length ? (
        <Empty text="Projects and generations collect here." />
      ) : (
        (projects ?? []).slice(0, 4).map((project) => (
          <button
            key={project.id}
            onClick={() => openTab({ kind: 'project', title: project.name, state: { projectId: project.id } })}
            className="flex w-full items-center gap-2.5 rounded-[11px] px-2 py-[7px] text-left transition-colors hover:bg-subtle"
          >
            <FolderOpen className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{project.name}</span>
            <span className="shrink-0 text-[10.5px] text-ink-faint">{relativeTime(project.updatedAt)}</span>
          </button>
        ))
      )}
    </BentoCard>
  )
}

/* ── local intelligence ───────────────────────────────────── */

export function IntelligenceTile({ className }: { className?: string }) {
  const openTab = useWorkspace((s) => s.openTab)
  const { snapshot } = useLocalRuntime()
  const models = snapshot?.models ?? []

  return (
    <BentoCard
      title="Your intelligence"
      icon={Boxes}
      className={className}
      action={
        <button
          onClick={() => openTab({ kind: 'models', title: 'Models' })}
          className="text-[11px] text-ink-faint transition-colors hover:text-ink"
        >
          Manage
        </button>
      }
    >
      {!snapshot?.online ? (
        <button
          onClick={() => openTab({ kind: 'models', title: 'Models' })}
          className="flex w-full items-center gap-2.5 rounded-[11px] px-2 py-[7px] text-left hover:bg-subtle"
        >
          <Cpu className="h-[13px] w-[13px] text-ink-faint" />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] text-ink">Local runtime is off</span>
            <span className="block text-[10.5px] text-ink-faint">Start it to run models here</span>
          </span>
        </button>
      ) : models.length === 0 ? (
        <Empty text="Drop a .gguf into models/ to run it here." />
      ) : (
        models.slice(0, 4).map((model) => (
          <div key={model.id} className="flex min-w-0 items-center gap-2.5 rounded-[11px] px-2 py-[7px]">
            <span
              className={cn(
                'h-[7px] w-[7px] shrink-0 rounded-full',
                snapshot.loadedModel && model.name.startsWith(snapshot.loadedModel)
                  ? 'bg-local'
                  : 'bg-ink-faint/40',
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{truncate(model.name, 30)}</span>
            <span className="hidden shrink-0 text-[10.5px] text-ink-faint sm:inline">
              {model.capabilities.includes('VISION') ? 'Vision' : 'Chat'}
            </span>
          </div>
        ))
      )}
    </BentoCard>
  )
}


/* ── markets ──────────────────────────────────────────────── */

/**
 * A sparkline: shape first, precision second.
 *
 * Deliberately axis-free. At this size a grid and tick labels are noise — the
 * tile states the current price and the change in words, and the line only has
 * to answer "which way and how sharply".
 */
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <div className="h-[36px]" />

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  // Inset the plot so a peak's stroke is not sliced by the viewBox edge.
  const TOP = 3
  const BOTTOM = 33
  const path = points
    .map((value, i) => {
      const x = (i / (points.length - 1)) * 100
      const y = BOTTOM - ((value - min) / span) * (BOTTOM - TOP)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  const stroke = up ? 'var(--color-local)' : 'var(--color-danger)'
  const id = `spark-${up ? 'up' : 'down'}`

  return (
    <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-[36px] w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L 100 36 L 0 36 Z`} fill={`url(#${id})`} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function MarketsTile({ className }: { className?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['markets'],
    queryFn: async () =>
      (await (await fetch('/api/markets?days=30')).json()) as { markets: Market[]; cachedAt: number },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })

  return (
    <BentoCard
      title="Markets"
      icon={TrendingUp}
      accent="warn"
      className={className}
      action={
        data?.cachedAt ? <span className="text-[11px] text-ink-faint">{relativeTime(data.cachedAt)}</span> : null
      }
    >
      {isLoading ? (
        <div className="space-y-2 px-2 py-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[62px] rounded-[10px] shimmer" />
          ))}
        </div>
      ) : (
        (data?.markets ?? []).map((market) => {
          const up = (market.changePct ?? 0) >= 0
          return (
            <div key={market.id} className="rounded-[12px] px-2 pb-1 pt-2">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-[12.5px] font-medium text-ink">{market.label}</span>
                <span className="shrink-0 text-[10.5px] text-ink-faint">{market.symbol}</span>
                {market.changePct !== null && (
                  <span className={cn('ml-auto shrink-0 text-[11.5px] tabular-nums', up ? 'text-local' : 'text-danger')}>
                    {up ? '+' : ''}
                    {market.changePct.toFixed(2)}%
                  </span>
                )}
              </div>

              <div className="mt-0.5 font-mono text-[15px] tabular-nums tracking-tight text-ink">
                {market.price === null
                  ? '—'
                  : market.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </div>

              <Sparkline points={market.series.map((p) => p.value)} up={up} />

              {/*
                The gold trend and the gold price come from different feeds, so
                the tile says which — a chart whose source is implied is a chart
                that can quietly mislead.
              */}
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-faint" title={market.seriesSource ?? market.priceSource}>
                {market.error ?? `30d · ${market.seriesSource ?? market.priceSource}`}
              </p>
            </div>
          )
        })
      )}
    </BentoCard>
  )
}
