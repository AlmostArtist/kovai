'use client'

import { Menu, Plus, Search } from 'lucide-react'
import { KovaiMark } from './kovai-mark'
import { ActivityIndicator } from './activity-center'
import { useUI } from '@/store/ui'
import { useWorkspace } from '@/store/workspace'

/**
 * The phone header.
 *
 * On a desktop the tab strip is the header: it names where you are and gets
 * you somewhere else. On a phone that strip has to scroll horizontally, so it
 * can no longer be relied on to show the current tab — scroll it and the thing
 * you are looking at goes off-screen.
 *
 * So the phone gets a fixed line above it that always says where you are, with
 * the two controls a touch screen has nowhere else to put: the drawer, which
 * replaces the sidebar, and search, which replaces ⌘/.
 *
 * Deliberately 52px, matching the desktop header it stands in for, and each
 * target is 40px square — the smallest a finger reliably hits.
 */
export function MobileBar() {
  const setNavOpen = useUI((s) => s.setNavOpen)
  const setSearchOpen = useUI((s) => s.setSearchOpen)
  const tabs = useWorkspace((s) => s.tabs)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const openTab = useWorkspace((s) => s.openTab)

  const active = tabs.find((t) => t.id === activeTabId)

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-1 border-b border-line bg-surface px-1.5 md:hidden">
      <button
        onClick={() => setNavOpen(true)}
        aria-label="Open navigation"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-muted active:bg-subtle"
      >
        <Menu className="h-[19px] w-[19px]" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
        <KovaiMark className="h-[16px] w-[16px] shrink-0" />
        <span className="truncate text-[14px] font-medium text-ink">
          {active?.title ?? 'KOVAI'}
        </span>
      </div>

      <ActivityIndicator />

      <button
        onClick={() => setSearchOpen(true)}
        aria-label="Search"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-muted active:bg-subtle"
      >
        <Search className="h-[17px] w-[17px]" />
      </button>
      <button
        onClick={() => openTab({ kind: 'chat' })}
        aria-label="New chat"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-muted active:bg-subtle"
      >
        <Plus className="h-[18px] w-[18px]" />
      </button>
    </header>
  )
}
