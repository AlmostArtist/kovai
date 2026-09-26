'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, Send, X } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { AgentAvatar, faceTint } from '@/components/icons/agent-avatar'
import { useCompanions } from '@/store/companions'
import { useWorkspace } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { useIsMobile } from '@/hooks/use-viewport'
import { cn } from '@/lib/utils'
import type { Agent, AgentMemory, AgentPlacement } from '@/lib/db/types'

/**
 * The companions.
 *
 * Agents you have activated drift along the right edge of every screen, asleep:
 * dimmed, desaturated, breathing, keeping loose company with your pointer. Tap
 * one and it wakes and starts talking. Left alone, one will occasionally think
 * something about what you are doing and show it in a thought bubble.
 *
 * Everything here is built around one risk: a thing that talks to you while you
 * work is delightful for a day and intolerable by the second unless it has
 * judgement about when to speak. So an unprompted remark only happens in a gap —
 * you have been working, and you have just stopped for a moment — never
 * mid-keystroke. Each agent has a long cooldown, only one agent may speak at a
 * time, nothing is said while the tab is in the background, and one obvious
 * switch silences all of it.
 */

/** Shortest gap between two unprompted remarks from the same agent. */
const AGENT_COOLDOWN_MS = 5 * 60_000
/** Shortest gap between remarks from anyone, so the whole group cannot pile on. */
const RAIL_COOLDOWN_MS = 90_000
/** How still the user must be before an agent will interrupt. */
const QUIET_MS = 7_000
/** And how recently they must have been doing something at all. */
const PRESENT_MS = 3 * 60_000
/** How long a thought stays up before it fades. */
const BUBBLE_MS = 14_000

interface WorkContext {
  workspace?: string
  tabTitle?: string
  draft?: string
  userName?: string
}

/** What the user is doing, as much of it as an agent is told. */
function useWorkContext(): { context: WorkContext; changedAt: number } {
  const tabs = useWorkspace((s) => s.tabs)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const displayName = useSettings((s) => s.displayName)

  const tab = tabs.find((t) => t.id === activeTabId)
  const state = (tab?.state ?? {}) as Record<string, unknown>
  const draft = [state.draft, state.prompt, state.question, state.seed].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 2,
  )

  const context = useMemo<WorkContext>(
    () => ({
      workspace: tab?.kind,
      tabTitle: tab?.title,
      // Only an opening — enough to know the subject, not the whole draft.
      draft: draft?.slice(0, 280),
      userName: displayName || undefined,
    }),
    [tab?.kind, tab?.title, draft, displayName],
  )

  // Any change here is the user doing something, which is what the scheduler
  // watches: it waits for activity to stop rather than for a timer to expire.
  const changedAt = useRef(Date.now())
  const signature = `${context.workspace}|${context.tabTitle}|${context.draft}`
  const previous = useRef(signature)
  if (previous.current !== signature) {
    previous.current = signature
    changedAt.current = Date.now()
  }

  return { context, changedAt: changedAt.current }
}

export function CompanionRail() {
  const active = useCompanions((s) => s.active)
  const awakeId = useCompanions((s) => s.awakeId)
  const muted = useCompanions((s) => s.muted)
  const wake = useCompanions((s) => s.wake)
  const setMuted = useCompanions((s) => s.setMuted)

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => ((await (await fetch('/api/agents')).json()) as { agents: Agent[] }).agents,
    staleTime: 30_000,
  })

  const companions = useMemo(
    () => active.map((id) => agents?.find((a) => a.id === id)).filter((a): a is Agent => Boolean(a)),
    [active, agents],
  )

  const awake = companions.find((a) => a.id === awakeId) ?? null
  const { context, changedAt } = useWorkContext()
  const [thought, setThought] = useState<{ agentId: string; text: string } | null>(null)
  const pointer = usePointerY()
  const composer = useComposerBox()
  const mobile = useIsMobile()

  useIdleRemarks({
    companions,
    enabled: !muted && !awake,
    context,
    changedAt,
    onRemark: (agent, text) => setThought({ agentId: agent.id, text }),
  })

  // A thought does not linger. It is said, it is read, it goes.
  useEffect(() => {
    if (!thought) return
    const timer = setTimeout(() => setThought(null), BUBBLE_MS)
    return () => clearTimeout(timer)
  }, [thought])

  if (!companions.length) return null

  // On a phone the placements stop meaning anything: there is no pointer to
  // drift towards, the prompt bar is the width of the screen, and a face
  // hanging from the top lands on the header. So everyone parks in the corner —
  // the one placement designed to stay out of the way — and only the first two
  // come out, because a 390px screen has room for company, not a crowd.
  const out = mobile ? companions.slice(0, 2) : companions

  return (
    <>
      {/* Each agent is positioned by its own placement, so they are siblings of
          the overlay rather than children of a rail. */}
      {out.map((agent, index) => (
        <FloatingAgent
          key={agent.id}
          agent={agent}
          placement={mobile ? 'corner' : undefined}
          index={mobile ? index : placementIndex(companions, index)}
          count={mobile ? out.length : placementCount(companions, agent)}
          pointer={pointer}
          composer={composer}
          awake={agent.id === awakeId}
          thought={thought?.agentId === agent.id ? thought.text : null}
          onTap={() => wake(agent.id === awakeId ? null : agent.id)}
          onDismiss={() => setThought(null)}
        />
      ))}

      <div className="pointer-events-none fixed bottom-0 right-0 z-40 h-[56px] w-[64px]">
        <Tooltip content={muted ? 'Let agents speak up' : 'Keep agents quiet'} side="left">
          <button
            onClick={() => setMuted(!muted)}
            className={cn(
              'pointer-events-auto absolute bottom-5 right-[19px] flex h-[26px] w-[26px] items-center justify-center rounded-full transition-colors',
              muted ? 'text-ink-faint hover:text-ink-muted' : 'text-ink-muted hover:text-ink',
            )}
            aria-label={muted ? 'Let agents speak up' : 'Keep agents quiet'}
          >
            {muted ? <BellOff className="h-[12px] w-[12px]" /> : <Bell className="h-[12px] w-[12px]" />}
          </button>
        </Tooltip>
      </div>

      <AnimatePresence>
        {awake && <CompanionPanel key={awake.id} agent={awake} context={context} onClose={() => wake(null)} />}
      </AnimatePresence>
    </>
  )
}

/* ── Placement ────────────────────────────────────────────── */

/** Its position among the agents that share its placement, for spacing. */
function placementIndex(companions: Agent[], index: number): number {
  const placement = companions[index].placement ?? 'right'
  return companions.slice(0, index).filter((a) => (a.placement ?? 'right') === placement).length
}

function placementCount(companions: Agent[], agent: Agent): number {
  const placement = agent.placement ?? 'right'
  return companions.filter((a) => (a.placement ?? 'right') === placement).length
}

/** What each placement is called, and what it does. */
export const PLACEMENTS: { id: AgentPlacement; label: string; hint: string }[] = [
  { id: 'right', label: 'Right edge', hint: 'Drifts down the right, following you' },
  { id: 'left', label: 'Left edge', hint: 'The same, on the other side' },
  { id: 'composer', label: 'On the prompt bar', hint: 'Walks along it and jumps' },
  { id: 'hanging', label: 'Hanging from the top', hint: 'Swings gently on a thread' },
  { id: 'corner', label: 'Bottom corner', hint: 'Parked, out of the way' },
]

/**
 * Where the pointer is, vertically, as a motion value.
 *
 * One listener for every companion rather than one each, and a motion value
 * rather than state so moving the mouse never re-renders React.
 */
function usePointerY() {
  const y = useMotionValue(typeof window === 'undefined' ? 400 : window.innerHeight / 2)

  useEffect(() => {
    const onMove = (event: PointerEvent) => y.set(event.clientY)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [y])

  return y
}

/**
 * Where the composer is, for the agents that live on it.
 *
 * Polled rather than observed. The composer moves for half a dozen unrelated
 * reasons — switching tabs, collapsing the sidebar, the box growing as you type
 * — and wiring an observer to each of those is more code for the same answer
 * than reading its position twice a second.
 */
function useComposerBox() {
  const [box, setBox] = useState<{ left: number; right: number; top: number } | null>(null)

  useEffect(() => {
    const measure = () => {
      // Every open tab stays mounted, and an inactive one is hidden with
      // `visibility` rather than unmounted — so it still has an offsetParent
      // and still reports a box. Without checking visibility the agent parks
      // above whichever composer happens to be first in the document, which is
      // usually one on a tab you cannot see.
      const el = [...document.querySelectorAll<HTMLElement>('[data-composer]')].find(
        (node) =>
          getComputedStyle(node).visibility !== 'hidden' &&
          !node.closest('[inert]') &&
          node.offsetParent !== null,
      )
      if (!el) return setBox(null)
      const rect = el.getBoundingClientRect()
      setBox({ left: rect.left, right: rect.right, top: rect.top })
    }

    measure()
    const timer = setInterval(measure, 400)
    window.addEventListener('resize', measure)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', measure)
    }
  }, [])

  return box
}

/* ── Floating ─────────────────────────────────────────────── */

/**
 * One agent, wherever it lives.
 *
 * Every placement is the same three parts — a position, an idle movement, and
 * a direction for its thought bubble to open in. Only those three change.
 *
 * Reduced motion keeps the positions and drops all the movement: an agent that
 * is parked is still useful, and one that never stops moving is not something
 * everyone can share a screen with.
 */
function FloatingAgent({
  agent,
  placement: forced,
  index,
  count,
  pointer,
  composer,
  awake,
  thought,
  onTap,
  onDismiss,
}: {
  agent: Agent
  /** Overrides the agent's own choice, for screens where it cannot apply. */
  placement?: AgentPlacement
  index: number
  count: number
  pointer: MotionValue<number>
  composer: { left: number; right: number; top: number } | null
  awake: boolean
  thought: string | null
  onTap: () => void
  onDismiss: () => void
}) {
  const reduced = useReducedMotion()
  const placement = forced ?? agent.placement ?? 'right'
  const edge = placement === 'left' ? 'left' : 'right'
  const islandOpen = useUI((s) => s.islandOpen)

  /** Its resting place down the edge, spread between siblings. */
  const anchor = 0.3 + (index / Math.max(count, 1)) * 0.34

  // Each edge agent lags a little more than the one before it.
  const follow = useSpring(pointer, { stiffness: 46 - index * 7, damping: 26, mass: 1.1 })
  const top = useTransform(follow, (value) => {
    if (typeof window === 'undefined') return 0
    const height = window.innerHeight
    const target = (anchor * height + value) / 2 + index * 56 - (count - 1) * 28
    return Math.min(Math.max(target, 84), height - 140)
  })

  const face = (
    <Tooltip content={`${agent.name}${agent.role ? ` · ${agent.role}` : ''}`} side={edge === 'left' ? 'right' : 'left'}>
      <button
        onClick={onTap}
        className="pointer-events-auto relative flex h-[38px] w-[38px] items-center justify-center rounded-full transition-transform duration-200 hover:scale-110"
        aria-label={awake ? `Put ${agent.name} back to sleep` : `Wake ${agent.name}`}
      >
        {(awake || thought) && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: `color-mix(in srgb, ${faceTint(agent.avatar)} 26%, transparent)` }}
            animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.86, 1.18, 0.86] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <AgentAvatar
          avatar={agent.avatar}
          name={agent.name}
          asleep={!awake && !thought}
          className="relative h-[32px] w-[32px] text-[15px]"
        />
      </button>
    </Tooltip>
  )

  const bubble = (
    <AnimatePresence>
      {thought && (
        <ThoughtBubble
          agent={agent}
          text={thought}
          side={placement === 'left' ? 'right' : 'left'}
          below={placement === 'hanging'}
          onDismiss={onDismiss}
          onOpen={onTap}
        />
      )}
    </AnimatePresence>
  )

  // ── On the prompt bar: walking its length, with the odd jump.
  if (placement === 'composer') {
    if (!composer) return null
    const left = composer.left + 10
    const right = Math.max(left, composer.right - 52)

    return (
      <motion.div
        className="pointer-events-none fixed z-40"
        style={{ top: composer.top - 46 }}
        initial={false}
        animate={
          reduced
            ? { x: left }
            : { x: [left, right, left], y: [0, -13, 0, 0, -9, 0, 0] }
        }
        transition={{
          x: { duration: 22 + index * 4, repeat: Infinity, ease: 'easeInOut' },
          y: { duration: 5.5, repeat: Infinity, ease: 'easeOut' },
        }}
      >
        <div className="relative">
          {bubble}
          {face}
        </div>
      </motion.div>
    )
  }

  // ── Hanging from the top, on a thread.
  if (placement === 'hanging') {
    const x = 26 + index * 62

    return (
      <motion.div
        className="pointer-events-none fixed top-0 z-40 origin-top"
        style={{ right: x }}
        animate={reduced ? undefined : { rotate: [-6, 6, -6] }}
        transition={{ duration: 6.5 + index, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* The thread it hangs from, drawn rather than implied. */}
        <div className="mx-auto h-[54px] w-px bg-line-strong" />
        <div className="relative">
          {bubble}
          {face}
        </div>
      </motion.div>
    )
  }

  // ── Parked in a corner.
  if (placement === 'corner') {
    // A fixed offset from the bottom is fine beside a desktop composer and
    // lands squarely on top of a phone one, which is full width and taller.
    // Where the composer's position is known, park on its shoulder instead.
    const aboveComposer = composer ? { top: composer.top - 46 - index * 46 } : undefined

    return (
      <motion.div
        className={cn(
          'pointer-events-none fixed z-40',
          edge === 'left' ? 'left-4' : 'right-4',
          !aboveComposer && 'bottom-[76px]',
        )}
        style={aboveComposer ?? { marginBottom: index * 52 }}
        animate={reduced ? undefined : { y: [0, -5, 0] }}
        transition={{ duration: 4.5 + index, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="relative">
          {bubble}
          {face}
        </div>
      </motion.div>
    )
  }

  // ── Adrift on an edge, keeping loose company with the pointer.
  //
  // The control island lives on the same edge, so a right-side agent slides
  // clear of it while it is out rather than walking behind a panel.
  return (
    <motion.div
      className={cn('pointer-events-none fixed z-40', edge === 'left' ? 'left-[13px]' : 'right-[13px]')}
      style={reduced ? { top: `${anchor * 100}%` } : { top }}
      animate={{ x: edge === 'right' && islandOpen ? -232 : 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    >
      <motion.div
        animate={reduced ? undefined : { y: [0, -7, 0] }}
        transition={{ duration: 5.5 + index * 1.3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="relative">
          {bubble}
          {face}
        </div>
      </motion.div>
    </motion.div>
  )
}

/**
 * A thought, not a message.
 *
 * Two small circles trail from the bubble back to the agent, the way a thought
 * is drawn rather than the way speech is: what an agent says unprompted is an
 * aside about what it noticed, and a square-tailed speech bubble would give it
 * the weight of being addressed to you.
 */
function ThoughtBubble({
  agent,
  text,
  side,
  below,
  onDismiss,
  onOpen,
}: {
  agent: Agent
  text: string
  /** Which side of the agent it opens on. */
  side: 'left' | 'right'
  /** Hanging agents have no room above them, so theirs opens downward. */
  below?: boolean
  onDismiss: () => void
  onOpen: () => void
}) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      className={cn(
        'pointer-events-auto absolute w-[264px]',
        below ? 'top-[46px]' : 'bottom-[26px]',
        side === 'left' ? 'right-[30px]' : 'left-[30px]',
      )}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: below ? -8 : 8 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
    >
      <div className="group relative">
        <button
          onClick={onOpen}
          className="block w-full rounded-[18px] border border-line bg-elevated px-3.5 py-2.5 text-left shadow-float"
        >
          <span className="mb-0.5 block text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-faint">
            {agent.name}
          </span>
          <span className="block text-[12.5px] leading-[1.5] text-ink">{text}</span>
          <span className="mt-1 block text-[10.5px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
            Click to reply
          </span>
        </button>

        <button
          onClick={onDismiss}
          aria-label={`Dismiss ${agent.name}'s thought`}
          className="absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line bg-surface text-ink-faint opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X className="h-[9px] w-[9px]" />
        </button>
      </div>

      {/* The trail, largest nearest the bubble, pointing back at the agent. */}
      <span
        aria-hidden
        className={cn(
          'absolute h-[9px] w-[9px] rounded-full border border-line bg-elevated',
          below ? '-top-[9px]' : '-bottom-[9px]',
          side === 'left' ? 'right-[18px]' : 'left-[18px]',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'absolute h-[5px] w-[5px] rounded-full border border-line bg-elevated',
          below ? '-top-[17px]' : '-bottom-[17px]',
          side === 'left' ? 'right-[7px]' : 'left-[7px]',
        )}
      />
    </motion.div>
  )
}

/* ── Scheduling ───────────────────────────────────────────── */

function useIdleRemarks({
  companions,
  enabled,
  context,
  changedAt,
  onRemark,
}: {
  companions: Agent[]
  enabled: boolean
  context: WorkContext
  changedAt: number
  onRemark: (agent: Agent, text: string) => void
}) {
  const lastSpokeAt = useCompanions((s) => s.lastSpokeAt)
  const noteSpoke = useCompanions((s) => s.noteSpoke)
  const privacy = useSettings((s) => s.privacy)
  const speaking = useRef(false)

  // Everything the tick needs is read at fire time rather than captured. The
  // callback is in here too: it is written inline by the caller, so depending on
  // it would tear down and restart the interval on every render, and a timer
  // that restarts every render never reaches the end of its first period.
  const latest = useRef({ companions, context, changedAt, lastSpokeAt, privacy, onRemark })
  latest.current = { companions, context, changedAt, lastSpokeAt, privacy, onRemark }

  useEffect(() => {
    if (!enabled) return

    const tick = async () => {
      if (speaking.current || document.visibilityState !== 'visible') return

      const { companions, context, changedAt, lastSpokeAt, privacy, onRemark } = latest.current
      const since = Date.now() - changedAt
      // In the gap: they were here recently, and they are not mid-thought.
      if (since < QUIET_MS || since > PRESENT_MS) return

      const railQuiet = Math.max(0, ...Object.values(lastSpokeAt))
      if (Date.now() - railQuiet < RAIL_COOLDOWN_MS) return

      const ready = companions.filter((agent) => {
        // Private mode means private: an agent on a cloud model is not handed
        // what the user is writing just because it is a companion.
        if (privacy === 'PRIVATE' && agent.providerId !== 'local') return false
        return Date.now() - (lastSpokeAt[agent.id] ?? 0) > AGENT_COOLDOWN_MS
      })
      if (!ready.length) return

      const agent = ready[Math.floor(Math.random() * ready.length)]
      speaking.current = true
      try {
        const res = await fetch('/api/agents/companion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: agent.id, reason: 'idle', context }),
        })
        if (!res.ok) return
        const body = (await res.json()) as { reply?: string }
        if (body.reply?.trim()) {
          noteSpoke(agent.id)
          onRemark(agent, body.reply.trim())
        }
      } catch {
        // A companion that cannot reach its model simply stays quiet.
      } finally {
        speaking.current = false
      }
    }

    const timer = setInterval(() => void tick(), 10_000)
    return () => clearInterval(timer)
  }, [enabled, noteSpoke])
}

/* ── Panel ────────────────────────────────────────────────── */

function CompanionPanel({
  agent,
  context,
  onClose,
}: {
  agent: Agent
  context: WorkContext
  onClose: () => void
}) {
  const client = useQueryClient()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const privacy = useSettings((s) => s.privacy)
  const blocked = privacy === 'PRIVATE' && agent.providerId !== 'local'

  const { data: memories } = useQuery({
    queryKey: ['agent-memory', agent.id],
    queryFn: async () =>
      ((await (await fetch(`/api/agents/${agent.id}/memory?limit=60`)).json()) as {
        memories: AgentMemory[]
      }).memories,
  })

  const turns = useMemo(() => (memories ?? []).filter((m) => m.kind === 'message'), [memories])

  const say = useCallback(
    async (message: string | undefined, reason: 'greeting' | 'reply') => {
      if (pending || blocked) return
      setPending(true)
      try {
        const res = await fetch('/api/agents/companion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: agent.id, reason, message, context }),
        })
        if (res.ok) await client.invalidateQueries({ queryKey: ['agent-memory', agent.id] })
      } finally {
        setPending(false)
      }
    },
    [agent.id, blocked, client, context, pending],
  )

  // Waking an agent that has nothing to say yet is an empty panel, so it opens
  // by greeting. An agent mid-conversation picks up where it left off instead.
  const greeted = useRef(false)
  useEffect(() => {
    if (greeted.current || !memories || blocked) return
    greeted.current = true
    if (!turns.length) void say(undefined, 'greeting')
  }, [memories, turns.length, say, blocked])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns.length, pending])

  return (
    <motion.div
      initial={{ opacity: 0, x: 16, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 16, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="pb-safe fixed inset-x-2 bottom-2 z-40 flex max-h-[min(520px,70svh)] flex-col overflow-hidden rounded-[16px] border border-line bg-elevated shadow-float sm:inset-x-auto sm:bottom-6 sm:right-[68px] sm:w-[330px]"
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <AgentAvatar avatar={agent.avatar} name={agent.name} className="h-[26px] w-[26px] text-[14px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{agent.name}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {agent.role || agent.description || 'Awake'}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Back to sleep">
          <X className="h-[13px] w-[13px]" />
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
        {blocked ? (
          <p className="rounded-[10px] border border-line bg-subtle px-3 py-2.5 text-[12px] leading-relaxed text-ink-muted">
            Private mode is on, and {agent.name} runs on {agent.providerId}. It is not being sent
            anything about your work. Give it a local model, or switch off private mode.
          </p>
        ) : !turns.length && !pending ? (
          <p className="px-1 py-6 text-center text-[12px] text-ink-faint">Nothing said yet.</p>
        ) : (
          turns.map((turn) => (
            <div
              key={turn.id}
              className={cn(
                'max-w-[85%] rounded-[12px] px-2.5 py-1.5 text-[12.5px] leading-[1.5]',
                turn.role === 'user'
                  ? 'ml-auto bg-subtle text-ink'
                  : 'border border-line bg-surface text-ink',
              )}
            >
              {turn.content}
            </div>
          ))
        )}

        {pending && (
          <div className="flex items-center gap-1 px-1 py-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-[4px] w-[4px] rounded-full bg-ink-faint"
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
              />
            ))}
          </div>
        )}
      </div>

      {!blocked && (
        <form
          className="flex shrink-0 items-end gap-1.5 border-t border-line p-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            const message = draft.trim()
            if (!message) return
            setDraft('')
            void say(message, 'reply')
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            rows={1}
            placeholder={`Say something to ${agent.name}…`}
            className="max-h-[90px] min-h-[32px] flex-1 resize-none rounded-[9px] border border-line bg-surface px-2.5 py-[7px] text-[12.5px] text-ink outline-none transition-colors focus:border-line-strong placeholder:text-ink-faint"
          />
          <Button variant="primary" size="icon" type="submit" disabled={!draft.trim() || pending} aria-label="Send">
            <Send className="h-[12px] w-[12px]" />
          </Button>
        </form>
      )}
    </motion.div>
  )
}
