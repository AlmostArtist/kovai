'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  BarChart3,
  Bell,
  BellOff,
  Cpu,
  Command as CommandIcon,
  Images,
  MemoryStick,
  Moon,
  Plus,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react'
import { AgentAvatar } from '@/components/icons/agent-avatar'
import { useLocalRuntime } from '@/hooks/use-local-runtime'
import { activeJobs, useJobs } from '@/store/jobs'
import { useCompanions } from '@/store/companions'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { useWorkspace } from '@/store/workspace'
import { useIsTouch } from '@/hooks/use-viewport'
import { cn, formatBytes, modKey } from '@/lib/utils'
import type { Agent } from '@/lib/db/types'

/**
 * The control island.
 *
 * A black capsule fused to the right edge of the window. At rest it is a narrow
 * column of gauges — what this machine is doing right now, readable without
 * clicking anything. Push the pointer to the edge and it swells into a control
 * surface: the same gauges with their names, the agents you have out, and the
 * switches that are otherwise buried.
 *
 * Two decisions shape everything here.
 *
 * It opens on proximity rather than on a hit target, because a strip of DOM
 * pinned to the right edge would swallow the scrollbar and every click that
 * lands near it. A window-level pointer listener costs nothing and blocks
 * nothing, so the edge stays the application's.
 *
 * And it only shows numbers it actually has. When the local runtime is down
 * there is no CPU figure to report, so the gauges go grey and say so rather
 * than animating a plausible-looking zero — an instrument that invents a
 * reading is worse than no instrument.
 */

/**
 * The island arrives in three steps rather than one.
 *
 * A panel that sits open on the edge permanently eats a column of whatever is
 * underneath it, and one that appears only on a precise hover is a panel most
 * people never find. So it comes out in proportion to how close you are: a
 * sliver of colour at rest, the gauges as you approach, the whole control
 * surface once you are actually at the edge.
 */
/** Within this of the right edge, the island is fully out. */
const EDGE_PROXIMITY = 30
/** Within this, it shows its gauges. */
const PEEK_PROXIMITY = 168
/** How far past the island's own bounds the pointer may stray before it retreats. */
const LEAVE_SLACK = 56
/** Grace period on the way out, so a wobble on the way to a button is forgiven. */
const CLOSE_DELAY = 260
/** Below this the window is too narrow to give an edge away. */
const MIN_WIDTH = 860

type Stage = 'rest' | 'peek' | 'open'

const WIDTHS: Record<Stage, number> = { rest: 13, peek: 60, open: 236 }
const RANK: Record<Stage, number> = { rest: 0, peek: 1, open: 2 }

/**
 * Gauge colours.
 *
 * Load is the one reading where the value carries a judgement — 90% of memory
 * is a different fact from 20% — so the ring says which it is. Progress has no
 * such meaning and wears the accent instead.
 */
const CALM = '#3ddc84'
const WARM = '#e8ef4f'
const HOT = '#ff6a3d'
const IDLE = 'rgba(255,255,255,0.16)'

function loadTone(value: number | null): string {
  if (value === null) return IDLE
  if (value < 60) return CALM
  if (value < 85) return WARM
  return HOT
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

interface Reading {
  id: string
  label: string
  icon: typeof Cpu
  /** null when there is nothing to report. */
  value: number | null
  detail: string
  tone: string
  onOpen(): void
}

export function DynamicIsland() {
  const reduced = useReducedMotion()
  const shellRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)
  // The pointer listener is installed once and must not be rebuilt on every
  // stage change, so what it needs to read lives in refs rather than state.
  const stageRef = useRef<Stage>('rest')
  const targetRef = useRef<Stage>('rest')

  const [stage, setStage] = useState<Stage>('rest')
  const [pinned, setPinned] = useState(false)
  const [roomy, setRoomy] = useState(true)

  const setIslandOpen = useUI((s) => s.setIslandOpen)
  const setActivityOpen = useUI((s) => s.setActivityOpen)
  const setUsageOpen = useUI((s) => s.setUsageOpen)
  const setCommandOpen = useUI((s) => s.setCommandOpen)

  const openTab = useWorkspace((s) => s.openTab)
  const theme = useSettings((s) => s.theme)
  const privacy = useSettings((s) => s.privacy)
  const setSetting = useSettings((s) => s.set)

  const muted = useCompanions((s) => s.muted)
  const setMuted = useCompanions((s) => s.setMuted)
  const activeIds = useCompanions((s) => s.active)
  const awakeId = useCompanions((s) => s.awakeId)
  const wake = useCompanions((s) => s.wake)
  const toggleCompanion = useCompanions((s) => s.toggle)

  const touch = useIsTouch()
  const { snapshot } = useLocalRuntime({ poll: true })
  const jobs = useJobs((s) => s.jobs)

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => ((await (await fetch('/api/agents')).json()) as { agents: Agent[] }).agents,
    staleTime: 30_000,
  })

  const shown: Stage = pinned ? 'open' : stage
  stageRef.current = shown
  const expanded = shown === 'open'

  // The companion rail reads this to step aside.
  useEffect(() => {
    setIslandOpen(expanded)
  }, [expanded, setIslandOpen])

  /* ── Proximity ────────────────────────────────────────────── */

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  useEffect(() => {
    const measure = () => setRoomy(window.innerWidth >= MIN_WIDTH)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (!roomy) return
    let frame = 0

    const decide = (x: number, y: number) => {
      const distance = window.innerWidth - x
      const box = shellRef.current?.getBoundingClientRect()
      const overIsland =
        !!box &&
        x >= box.left - LEAVE_SLACK &&
        y >= box.top - LEAVE_SLACK &&
        y <= box.bottom + LEAVE_SLACK

      const target: Stage =
        distance <= EDGE_PROXIMITY || overIsland
          ? 'open'
          : distance <= PEEK_PROXIMITY
            ? 'peek'
            : 'rest'
      targetRef.current = target

      // Coming out is immediate; going back in waits. Asymmetry is the whole
      // trick — the island has to feel eager to appear and reluctant to leave,
      // or crossing the edge on the way to something else makes it flicker.
      if (RANK[target] >= RANK[stageRef.current]) {
        cancelClose()
        stageRef.current = target
        setStage(target)
        return
      }
      if (closeTimer.current === null) {
        closeTimer.current = window.setTimeout(() => {
          closeTimer.current = null
          stageRef.current = targetRef.current
          setStage(targetRef.current)
        }, CLOSE_DELAY)
      }
    }

    const onMove = (event: PointerEvent) => {
      if (frame) return
      const { clientX, clientY } = event
      frame = requestAnimationFrame(() => {
        frame = 0
        decide(clientX, clientY)
      })
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      if (frame) cancelAnimationFrame(frame)
      cancelClose()
    }
  }, [roomy, cancelClose])

  // Pinned open with the keyboard, for anyone not driving this with a mouse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setPinned((was) => !was)
        return
      }
      if (event.key === 'Escape' && pinned) setPinned(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pinned])

  /* ── Readings ─────────────────────────────────────────────── */

  const running = useMemo(() => activeJobs(jobs), [jobs])
  const system = snapshot?.system ?? null
  const online = snapshot?.online ?? false

  const readings = useMemo<Reading[]>(() => {
    const cpu = system ? clampPercent(system.cpuPercent) : null
    const memory =
      system && system.ramTotalBytes > 0
        ? clampPercent(100 * (1 - system.ramAvailableBytes / system.ramTotalBytes))
        : null

    const rows: Reading[] = [
      {
        id: 'cpu',
        label: 'Processor',
        icon: Cpu,
        value: cpu,
        detail: system?.chip ?? (online ? 'Reading…' : 'Runtime offline'),
        tone: loadTone(cpu),
        onOpen: () => openTab({ kind: 'models', title: 'Models' }),
      },
      {
        id: 'memory',
        label: 'Memory',
        icon: MemoryStick,
        value: memory,
        detail: system
          ? `${formatBytes(system.ramTotalBytes - system.ramAvailableBytes)} of ${formatBytes(system.ramTotalBytes)}`
          : online
            ? 'Reading…'
            : 'Runtime offline',
        tone: loadTone(memory),
        onOpen: () => openTab({ kind: 'models', title: 'Models' }),
      },
    ]

    // The third gauge belongs to whatever is most worth watching: a generation
    // in flight beats a static hardware figure every time.
    if (running.length > 0) {
      const progress = clampPercent(
        running.reduce((sum, job) => sum + job.progress, 0) / running.length,
      )
      rows.push({
        id: 'jobs',
        label: running.length > 1 ? `${running.length} generating` : 'Generating',
        icon: Sparkles,
        value: progress,
        detail: running[0]?.prompt?.slice(0, 40) || 'In progress',
        tone: 'var(--color-accent)',
        onOpen: () => setActivityOpen(true),
      })
    } else {
      const vram =
        system?.vramTotalBytes && system.vramFreeBytes !== null && system.vramFreeBytes !== undefined
          ? clampPercent(100 * (1 - system.vramFreeBytes / system.vramTotalBytes))
          : null
      rows.push({
        id: 'graphics',
        label: vram === null ? 'Graphics' : 'Graphics',
        icon: Zap,
        value: vram,
        detail: system?.gpu ?? (online ? 'No GPU reported' : 'Runtime offline'),
        tone: loadTone(vram),
        onOpen: () => openTab({ kind: 'models', title: 'Models' }),
      })
    }

    return rows
  }, [system, online, running, openTab, setActivityOpen])

  const companions = useMemo(
    () => activeIds.map((id) => agents?.find((a) => a.id === id)).filter((a): a is Agent => !!a),
    [activeIds, agents],
  )

  // A proximity affordance needs a pointer to be near. On a touch screen there
  // is nothing to be near with, so the island simply is not there — its
  // contents all live somewhere reachable by tapping.
  if (!roomy || touch) return null

  const dark = theme === 'dark'
  const privateMode = privacy === 'PRIVATE'

  return (
    <div className="pointer-events-none fixed right-0 top-1/2 z-[45] -translate-y-1/2">
      <motion.div
        ref={shellRef}
        layout
        onPointerEnter={cancelClose}
        initial={false}
        animate={{ width: WIDTHS[shown] }}
        transition={
          reduced
            ? { duration: 0 }
            : { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }
        }
        className={cn(
          'island-shell pointer-events-auto relative text-white',
          'shadow-[-16px_0_44px_-18px_rgba(0,0,0,0.55)]',
          shown === 'rest' ? 'rounded-l-[7px] py-2.5' : 'rounded-l-[26px] py-3',
        )}
        role="region"
        aria-label="Control island"
      >
        {/* The capsule melts into the window edge rather than stopping at it. */}
        <span aria-hidden className="island-fillet island-fillet-top" />
        <span aria-hidden className="island-fillet island-fillet-bottom" />

        <AnimatePresence initial={false} mode="popLayout">
          {expanded ? (
            <motion.div
              key="open"
              initial={reduced ? false : { opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduced ? undefined : { opacity: 0, x: 14 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="flex w-[236px] flex-col gap-2.5 overflow-hidden px-3"
            >
              <Clock pinned={pinned} />

              <div className="flex flex-col gap-1">
                {readings.map((reading) => (
                  <ReadingRow key={reading.id} reading={reading} />
                ))}
              </div>

              <Rule />

              <Companions
                companions={companions}
                roster={agents ?? []}
                muted={muted}
                awakeId={awakeId}
                onWake={(id) => wake(awakeId === id ? null : id)}
                onToggle={(id) => toggleCompanion(id)}
                onMute={() => setMuted(!muted)}
                onManage={() => openTab({ kind: 'agents', title: 'Agents' })}
              />

              <Rule />

              <div className="grid grid-cols-4 gap-1.5">
                <Orb
                  label={dark ? 'Light theme' : 'Dark theme'}
                  icon={dark ? Sun : Moon}
                  onClick={() => setSetting('theme', dark ? 'light' : 'dark')}
                />
                <Orb
                  label={privateMode ? 'Private mode on' : 'Private mode off'}
                  icon={Shield}
                  lit={privateMode}
                  onClick={() => setSetting('privacy', privateMode ? 'ONLINE' : 'PRIVATE')}
                />
                <Orb label="Activity" icon={Activity} onClick={() => setActivityOpen(true)} />
                <Orb label="Usage" icon={BarChart3} onClick={() => setUsageOpen(true)} />
                <Orb label="Command palette" icon={CommandIcon} onClick={() => setCommandOpen(true)} />
                <Orb
                  label="Album"
                  icon={Images}
                  onClick={() => openTab({ kind: 'album', title: 'Album' })}
                />
                <Orb
                  label={muted ? 'Agents silenced' : 'Agents may speak'}
                  icon={muted ? BellOff : Bell}
                  lit={!muted}
                  onClick={() => setMuted(!muted)}
                />
                <Orb
                  label="Settings"
                  icon={Settings}
                  onClick={() => openTab({ kind: 'settings', title: 'Settings' })}
                />
              </div>
            </motion.div>
          ) : shown === 'peek' ? (
            <motion.div
              key="peek"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex w-[60px] flex-col items-center gap-3 overflow-hidden"
            >
              {readings.map((reading) => (
                <div key={reading.id} className="flex flex-col items-center gap-1">
                  <Gauge value={reading.value} tone={reading.tone} size={34}>
                    <reading.icon className="h-[13px] w-[13px]" strokeWidth={2} />
                  </Gauge>
                  <span className="text-[10px] font-medium tabular-nums text-white/60">
                    {reading.value === null ? '—' : `${reading.value}%`}
                  </span>
                </div>
              ))}

              <button
                onClick={() => openTab({ kind: 'settings', title: 'Settings' })}
                aria-label="Settings"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
              >
                <Settings className="h-[14px] w-[14px]" strokeWidth={2} />
              </button>
            </motion.div>
          ) : (
            /*
              At rest it is barely there: one dot per gauge, in that gauge's
              colour. Enough to notice a reading going hot out of the corner of
              your eye, narrow enough that it is not sitting on top of anything.
            */
            <motion.div
              key="rest"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex w-[13px] flex-col items-center gap-[5px] overflow-hidden"
              aria-hidden
            >
              {readings.map((reading) => (
                <span
                  key={reading.id}
                  className="h-[5px] w-[5px] rounded-full"
                  style={{ background: reading.tone }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/* ── Pieces ─────────────────────────────────────────────────── */

/** A ring that fills clockwise from twelve o'clock. */
function Gauge({
  value,
  tone,
  size,
  children,
}: {
  value: number | null
  tone: string
  size: number
  children?: React.ReactNode
}) {
  const stroke = size >= 32 ? 2.6 : 2.2
  const radius = (size - stroke) / 2 - 1
  const circumference = 2 * Math.PI * radius
  const filled = value === null ? 0 : (value / 100) * circumference

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.13)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: circumference - filled }}
          transition={{ type: 'spring', stiffness: 160, damping: 26 }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-white/85">{children}</span>
    </span>
  )
}

function ReadingRow({ reading }: { reading: Reading }) {
  return (
    <button
      onClick={reading.onOpen}
      title={reading.detail}
      className="flex w-full items-center gap-2.5 rounded-[11px] px-1.5 py-1.5 text-left transition-colors hover:bg-white/[0.07]"
    >
      <Gauge value={reading.value} tone={reading.tone} size={30}>
        <reading.icon className="h-[12px] w-[12px]" strokeWidth={2} />
      </Gauge>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-medium leading-tight text-white/90">
          {reading.label}
        </span>
        <span className="block truncate text-[10.5px] leading-tight text-white/40">
          {reading.detail}
        </span>
      </span>
      <span className="shrink-0 text-[12px] font-medium tabular-nums text-white/70">
        {reading.value === null ? '—' : `${reading.value}%`}
      </span>
    </button>
  )
}

/**
 * The agents you have out, and the ones you could.
 *
 * Putting the whole roster behind the plus rather than behind a trip to the
 * Agents workspace is the point of having this here at all: deciding who is
 * keeping you company is a small, frequent decision, and it should not cost a
 * tab. Tapping a face already out wakes it; tapping one on the list puts it out
 * or calls it back in.
 */
function Companions({
  companions,
  roster,
  muted,
  awakeId,
  onWake,
  onToggle,
  onMute,
  onManage,
}: {
  companions: Agent[]
  roster: Agent[]
  muted: boolean
  awakeId: string | null
  onWake(id: string): void
  onToggle(id: string): void
  onMute(): void
  onManage(): void
}) {
  const [picking, setPicking] = useState(false)
  const out = new Set(companions.map((a) => a.id))

  return (
    <div className="px-1.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-white/35">
          Companions
        </span>
        <button
          onClick={onMute}
          title={muted ? 'Let agents speak unprompted' : 'Stop agents speaking unprompted'}
          className="text-[10px] text-white/40 transition-colors hover:text-white/80"
        >
          {muted ? 'Silenced' : 'Listening'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {companions.slice(0, 5).map((agent) => (
          <button
            key={agent.id}
            onClick={() => onWake(agent.id)}
            title={`${agent.name}${agent.id === awakeId ? ' — awake' : ''}`}
            className={cn(
              'flex h-[30px] w-[30px] items-center justify-center rounded-full transition-transform hover:scale-110',
              agent.id === awakeId ? 'bg-white/25 ring-1 ring-white/40' : 'bg-white/10',
            )}
          >
            <AgentAvatar
              avatar={agent.avatar}
              name={agent.name}
              asleep={agent.id !== awakeId}
              className="h-[20px] w-[20px]"
            />
          </button>
        ))}

        <button
          onClick={() => setPicking((was) => !was)}
          aria-label={picking ? 'Close the agent list' : 'Choose agents'}
          aria-expanded={picking}
          className={cn(
            'flex h-[30px] w-[30px] items-center justify-center rounded-full border transition-colors',
            picking
              ? 'border-white/40 text-white'
              : 'border-white/15 text-white/45 hover:border-white/35 hover:text-white/85',
          )}
        >
          <Plus className={cn('h-3.5 w-3.5 transition-transform', picking && 'rotate-45')} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {picking && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2 max-h-[132px] space-y-0.5 overflow-y-auto no-scrollbar">
              {roster.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-white/35">No agents yet.</p>
              ) : (
                roster.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => onToggle(agent.id)}
                    className="flex w-full items-center gap-2 rounded-[8px] px-1 py-1 text-left transition-colors hover:bg-white/[0.08]"
                  >
                    <AgentAvatar
                      avatar={agent.avatar}
                      name={agent.name}
                      asleep={!out.has(agent.id)}
                      className="h-[18px] w-[18px] shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/80">
                      {agent.name}
                    </span>
                    <span
                      className={cn(
                        'h-[6px] w-[6px] shrink-0 rounded-full',
                        out.has(agent.id) ? 'bg-[#3ddc84]' : 'bg-white/20',
                      )}
                    />
                  </button>
                ))
              )}
            </div>
            <button
              onClick={onManage}
              className="mt-1 w-full rounded-[8px] py-1 text-[10.5px] text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            >
              Open the Agents workspace
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A circular action, the island's only button shape. */
function Orb({
  label,
  icon: Icon,
  lit,
  onClick,
}: {
  label: string
  icon: typeof Cpu
  lit?: boolean
  onClick(): void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-[38px] items-center justify-center rounded-[12px] transition-colors',
        lit ? 'text-white' : 'bg-white/[0.07] text-white/55 hover:bg-white/15 hover:text-white',
      )}
      style={
        lit ? { background: 'color-mix(in srgb, var(--color-accent) 34%, transparent)' } : undefined
      }
    >
      <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
    </button>
  )
}

function Rule() {
  return <span aria-hidden className="mx-1.5 block h-px bg-white/10" />
}

/**
 * The time, as the reference wears it.
 *
 * Ticks on the minute rather than on an interval that drifts, so it is never
 * showing a minute that has already passed.
 */
function Clock({ pinned }: { pinned: boolean }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: number
    const tick = () => {
      setNow(new Date())
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    }
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50)
    return () => window.clearTimeout(timer)
  }, [])

  const date = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div className="flex items-baseline justify-between px-1.5">
      <span className="text-[11.5px] font-medium tabular-nums text-white/75">
        {date} {time}
      </span>
      <span className="text-[9.5px] tabular-nums text-white/30">{pinned ? 'esc' : `${modKey()}J`}</span>
    </div>
  )
}
