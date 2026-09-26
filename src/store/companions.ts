'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The companion rail.
 *
 * Which agents are on it, which one is awake, and when each last spoke. The
 * membership is a preference and persists; what an agent has said belongs to
 * that agent's memory on the server, not here.
 *
 * `muted` is the single switch that stops every agent speaking unprompted. It
 * exists because a companion that cannot be told to be quiet is a liability
 * rather than a feature, and the first time it interrupts real work is the
 * moment someone needs that switch to be obvious.
 */

interface CompanionState {
  /** Agent ids on the rail, in the order they sit. */
  active: string[]
  /** The one whose panel is open, if any. Everything else is asleep. */
  awakeId: string | null
  /** No unprompted remarks from anyone while this is on. */
  muted: boolean
  /** Agent id → when it last said something unprompted. */
  lastSpokeAt: Record<string, number>

  toggle(agentId: string): void
  activate(agentId: string): void
  deactivate(agentId: string): void
  wake(agentId: string | null): void
  setMuted(muted: boolean): void
  noteSpoke(agentId: string): void
}

export const useCompanions = create<CompanionState>()(
  persist(
    (set, get) => ({
      active: [],
      awakeId: null,
      muted: false,
      lastSpokeAt: {},

      toggle: (agentId) =>
        get().active.includes(agentId) ? get().deactivate(agentId) : get().activate(agentId),

      activate: (agentId) =>
        set((s) =>
          s.active.includes(agentId) ? s : { ...s, active: [...s.active, agentId] },
        ),

      deactivate: (agentId) =>
        set((s) => ({
          ...s,
          active: s.active.filter((id) => id !== agentId),
          awakeId: s.awakeId === agentId ? null : s.awakeId,
        })),

      wake: (awakeId) => set({ awakeId }),
      setMuted: (muted) => set({ muted }),
      noteSpoke: (agentId) =>
        set((s) => ({ ...s, lastSpokeAt: { ...s.lastSpokeAt, [agentId]: Date.now() } })),
    }),
    {
      name: 'kovai.companions',
      // The rail is restored explicitly after hydration, like every other
      // persisted store here, so the server and the first client render agree.
      skipHydration: true,
      partialize: (s) => ({ active: s.active, muted: s.muted, lastSpokeAt: s.lastSpokeAt }) as CompanionState,
    },
  ),
)
