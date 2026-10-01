'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '@/lib/utils'

/**
 * Workspace tabs.
 *
 * Tabs are the spine of the product: each one is an independent surface with
 * its own state, and switching between them never resets anything. State lives
 * here rather than in component state, and every open tab stays mounted, so a
 * generation started in one tab keeps running while you work in another.
 */

export type TabKind =
  | 'home'
  | 'chat'
  | 'create'
  | 'vision'
  | 'research'
  | 'projects'
  | 'project'
  | 'assets'
  | 'album'
  | 'history'
  | 'workflows'
  | 'workflow'
  | 'models'
  | 'skills'
  | 'prompts'
  | 'notes'
  | 'agents'
  | 'templates'
  | 'settings'

export interface Tab {
  id: string
  kind: TabKind
  title: string
  pinned: boolean
  createdAt: number
  /** Per-kind state, owned by that workspace's component. */
  state: Record<string, unknown>
}

interface WorkspaceState {
  tabs: Tab[]
  activeTabId: string
  /** Closed tabs, most recent first — restored with ⌘⇧T. */
  closed: Tab[]

  openTab(input: { kind: TabKind; title?: string; state?: Record<string, unknown>; activate?: boolean }): string
  /** Focus an existing tab of this kind instead of stacking duplicates. */
  openSingleton(kind: TabKind, title: string): string
  closeTab(id: string): void
  closeOthers(id: string): void
  setActive(id: string): void
  cycle(direction: 1 | -1): void
  renameTab(id: string, title: string): void
  togglePin(id: string): void
  duplicateTab(id: string): void
  reorder(fromId: string, toId: string): void
  restoreLast(): void
  patchState(id: string, patch: Record<string, unknown>): void
  getTab(id: string): Tab | undefined
}

export const TAB_TITLES: Record<TabKind, string> = {
  home: 'Home',
  chat: 'Chat',
  create: 'Create',
  vision: 'Vision',
  research: 'Research',
  projects: 'Projects',
  project: 'Project',
  assets: 'Assets',
  album: 'Album',
  history: 'History',
  workflows: 'Workflows',
  workflow: 'Workflow',
  models: 'Models',
  skills: 'Skills',
  prompts: 'Prompts',
  notes: 'Notes',
  agents: 'Agents',
  templates: 'Templates',
  settings: 'Settings',
}

/**
 * Sections that exist once.
 *
 * Settings, Models or Assets are places, not documents — a second copy of
 * Settings is never something anyone wanted, it is just a tab to close later.
 * Chat, Create, Vision and Research are documents, so those stack freely.
 */
const SINGLETON_KINDS = new Set<TabKind>([
  'home',
  'projects',
  'assets',
  'album',
  'history',
  'workflows',
  'models',
  'skills',
  'prompts',
  'notes',
  'agents',
  'templates',
  'settings',
])

/** Project and Workflow tabs are one-per-thing rather than one-in-total. */
const IDENTIFIED_KINDS: Partial<Record<TabKind, string>> = {
  project: 'projectId',
  workflow: 'workflowId',
}

function findReusable(tabs: Tab[], kind: TabKind, state: Record<string, unknown>): Tab | undefined {
  if (SINGLETON_KINDS.has(kind)) return tabs.find((t) => t.kind === kind)

  const key = IDENTIFIED_KINDS[kind]
  if (!key) return undefined
  const id = state[key]
  return id ? tabs.find((t) => t.kind === kind && t.state[key] === id) : undefined
}

const homeTab = (): Tab => ({
  id: uid(),
  kind: 'home',
  title: 'Home',
  pinned: true,
  createdAt: Date.now(),
  state: {},
})

const initial = homeTab()

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [initial],
      activeTabId: initial.id,
      closed: [],

      openTab({ kind, title, state = {}, activate = true }) {
        // Reuse rather than duplicate. Any state passed in is merged, so
        // "open Settings on the Providers tab" still lands in the right place.
        const existing = findReusable(get().tabs, kind, state)
        if (existing) {
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === existing.id ? { ...t, state: { ...t.state, ...state } } : t,
            ),
            activeTabId: activate ? existing.id : s.activeTabId,
          }))
          return existing.id
        }

        const tab: Tab = {
          id: uid(),
          kind,
          title: title ?? TAB_TITLES[kind],
          pinned: false,
          createdAt: Date.now(),
          state,
        }
        set((s) => ({
          tabs: [...s.tabs, tab],
          activeTabId: activate ? tab.id : s.activeTabId,
        }))
        return tab.id
      },

      /** Retained for call sites that read as "go to X"; openTab now does this too. */
      openSingleton(kind, title) {
        return get().openTab({ kind, title })
      },

      closeTab(id) {
        const { tabs, activeTabId, closed } = get()
        const tab = tabs.find((t) => t.id === id)
        if (!tab) return
        // The last tab is never removed; the workspace always has a surface.
        if (tabs.length === 1) return

        const index = tabs.findIndex((t) => t.id === id)
        const next = tabs.filter((t) => t.id !== id)
        set({
          tabs: next,
          closed: [tab, ...closed].slice(0, 10),
          activeTabId:
            activeTabId === id ? (next[Math.min(index, next.length - 1)]?.id ?? next[0].id) : activeTabId,
        })
      },

      closeOthers(id) {
        const { tabs } = get()
        const keep = tabs.filter((t) => t.id === id || t.pinned)
        set({ tabs: keep, activeTabId: id, closed: tabs.filter((t) => !keep.includes(t)).slice(0, 10) })
      },

      setActive(id) {
        if (get().tabs.some((t) => t.id === id)) set({ activeTabId: id })
      },

      cycle(direction) {
        const { tabs, activeTabId } = get()
        const index = tabs.findIndex((t) => t.id === activeTabId)
        const next = (index + direction + tabs.length) % tabs.length
        set({ activeTabId: tabs[next].id })
      },

      renameTab(id, title) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, title: title.trim() || t.title } : t)),
        }))
      },

      togglePin(id) {
        set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)) }))
      },

      duplicateTab(id) {
        const tab = get().tabs.find((t) => t.id === id)
        if (!tab || SINGLETON_KINDS.has(tab.kind)) return
        const copy: Tab = {
          ...tab,
          id: uid(),
          title: `${tab.title} copy`,
          pinned: false,
          createdAt: Date.now(),
          state: structuredClone(tab.state),
        }
        const index = get().tabs.findIndex((t) => t.id === id)
        set((s) => ({
          tabs: [...s.tabs.slice(0, index + 1), copy, ...s.tabs.slice(index + 1)],
          activeTabId: copy.id,
        }))
      },

      reorder(fromId, toId) {
        const tabs = [...get().tabs]
        const from = tabs.findIndex((t) => t.id === fromId)
        const to = tabs.findIndex((t) => t.id === toId)
        if (from === -1 || to === -1 || from === to) return
        const [moved] = tabs.splice(from, 1)
        tabs.splice(to, 0, moved)
        set({ tabs })
      },

      restoreLast() {
        const [restored, ...rest] = get().closed
        if (!restored) return
        set((s) => ({ tabs: [...s.tabs, restored], closed: rest, activeTabId: restored.id }))
      },

      patchState(id, patch) {
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, state: { ...t.state, ...patch } } : t)),
        }))
      },

      getTab(id) {
        return get().tabs.find((t) => t.id === id)
      },
    }),
    {
      name: 'kovai.workspace',
      version: 1,
      // Restored by the app shell after mount. Rehydrating during the first
      // render would make the client disagree with the server-rendered HTML.
      skipHydration: true,
      partialize: (s) => ({ tabs: s.tabs, activeTabId: s.activeTabId, closed: s.closed }),
      // A corrupt or empty restore must still yield a usable workspace.
      merge: (persisted, current) => {
        const next = { ...current, ...(persisted as Partial<WorkspaceState>) }
        if (!next.tabs?.length) {
          const tab = homeTab()
          next.tabs = [tab]
          next.activeTabId = tab.id
        } else if (!next.tabs.some((t) => t.id === next.activeTabId)) {
          next.activeTabId = next.tabs[0].id
        }
        return next
      },
    },
  ),
)

/** Typed access to one tab's state slice, with a default. */
export function useTabState<T extends Record<string, unknown>>(tabId: string, fallback: T): T {
  const state = useWorkspace((s) => s.tabs.find((t) => t.id === tabId)?.state)
  return { ...fallback, ...(state as T) }
}
