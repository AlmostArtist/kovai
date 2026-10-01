'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  Boxes,
  Clock,
  GalleryVerticalEnd,
  FolderOpen,
  Home,
  Images,
  Layers,
  MessageSquare,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  StickyNote,
  Telescope,
  Wand2,
  Type,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { Button, Kbd, SectionLabel, StatusDot, Tooltip } from '@/components/ui'
import { RuntimeStatus } from './runtime-status'
import { PrivacyToggle } from './privacy-toggle'
import { UsageButton } from './usage-panel'
import { useWorkspace, type TabKind } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { useIsMobile, useIsNarrow } from '@/hooks/use-viewport'
import { useUI } from '@/store/ui'
import { cn, modKey, relativeTime } from '@/lib/utils'
import { KovaiMark } from './kovai-mark'
import { LottieIcon } from '@/components/icons/lottie-icon'
import { NAV_ICONS } from '@/components/icons/nav-icons'

const NAV: { kind: TabKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { kind: 'home', label: 'Home', icon: Home },
  { kind: 'chat', label: 'Chat', icon: MessageSquare },
  { kind: 'create', label: 'Create', icon: Sparkles },
  { kind: 'templates', label: 'Templates', icon: Wand2 },
  { kind: 'vision', label: 'Vision', icon: Layers },
  { kind: 'research', label: 'Research', icon: Telescope },
]

const LIBRARY: { kind: TabKind; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { kind: 'projects', label: 'Projects', icon: FolderOpen },
  { kind: 'assets', label: 'Assets', icon: Images },
  { kind: 'album', label: 'Album', icon: GalleryVerticalEnd },
  { kind: 'history', label: 'History', icon: Clock },
  { kind: 'workflows', label: 'Workflows', icon: WorkflowIcon },
  { kind: 'models', label: 'Models', icon: Boxes },
  { kind: 'skills', label: 'Skills', icon: Sparkles },
  { kind: 'prompts', label: 'Prompts', icon: Type },
  { kind: 'notes', label: 'Notes', icon: StickyNote },
  { kind: 'agents', label: 'Agents', icon: Bot },
]

/**
 * The navigation.
 *
 * A column on a desktop and a drawer on a phone — the same component either
 * way, because the contents are identical and only their container changes.
 * On a phone it is never the icon-only form: a drawer that costs a tap to open
 * has no reason to then hide its own labels.
 */
export function Sidebar() {
  const preference = useSettings((s) => s.sidebarCollapsed)
  const narrow = useIsNarrow()
  const mobile = useIsMobile()
  const navOpen = useUI((s) => s.navOpen)
  const setNavOpen = useUI((s) => s.setNavOpen)
  const collapsed = mobile ? false : preference || narrow
  const setSetting = useSettings((s) => s.set)
  const displayName = useSettings((s) => s.displayName)
  const openSingleton = useWorkspace((s) => s.openSingleton)
  const openTab = useWorkspace((s) => s.openTab)
  const setSearchOpen = useUI((s) => s.setSearchOpen)
  const tabs = useWorkspace((s) => s.tabs)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const setActive = useWorkspace((s) => s.setActive)

  const activeKind = tabs.find((t) => t.id === activeTabId)?.kind

  // "Recent" is the live set of open work, newest first — not a separate history
  // the user has to reconcile with what is actually on screen.
  const recent = useMemo(
    () =>
      [...tabs]
        .filter((t) => t.kind !== 'home')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6),
    [tabs],
  )
  const pinned = useMemo(() => tabs.filter((t) => t.pinned && t.kind !== 'home'), [tabs])

  // Any navigation closes the drawer. Without this, tapping a destination on a
  // phone leaves you looking at the menu you just used instead of the thing you
  // asked for.
  const go = (run: () => void) => {
    run()
    if (mobile) setNavOpen(false)
  }

  // Identical in both containers, so it is built once. The only thing that
  // differs is what wraps it: a column that can collapse to icons, or a
  // drawer that slides over the workspace.
  const body = (
    <>
        {/* Identity */}
        <div className={cn('flex h-[52px] shrink-0 items-center gap-2', collapsed ? 'justify-center px-2' : 'px-4')}>
          <KovaiMark className="h-[18px] w-[18px]" />
          {!collapsed && (
            <span className="text-[14.5px] font-semibold tracking-[-0.02em] text-ink">KOVAI</span>
          )}
          {!collapsed && (
            <Tooltip content="Collapse sidebar" shortcut={`${modKey()} B`}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                onClick={() => setSetting('sidebarCollapsed', true)}
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="h-[14px] w-[14px]" />
              </Button>
            </Tooltip>
          )}
        </div>

        {/* Search */}
        <div className={cn('shrink-0', collapsed ? 'px-2 pb-2' : 'px-3 pb-3')}>
          {collapsed ? (
            <Tooltip content="Search" side="right" shortcut={`${modKey()} /`}>
              <Button variant="ghost" size="icon" className="w-full" onClick={() => go(() => setSearchOpen(true))}>
                <Search className="h-[15px] w-[15px]" />
              </Button>
            </Tooltip>
          ) : (
            <button
              onClick={() => go(() => setSearchOpen(true))}
              className="group flex h-[34px] w-full items-center gap-2 rounded-[9px] border border-line bg-subtle px-2.5 text-left transition-colors duration-150 hover:border-line-strong"
            >
              <Search className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
              <span className="flex-1 text-[13px] text-ink-faint">Search</span>
              <Kbd>{modKey()} /</Kbd>
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 no-scrollbar">
          <div className="space-y-[1px]">
            {NAV.map((item) => (
              <NavItem
                key={item.kind}
                {...item}
                collapsed={collapsed}
                active={activeKind === item.kind}
                onClick={() => go(() => openSingleton(item.kind, item.label))}
              />
            ))}
          </div>

          <div className="my-3 h-px bg-line" />

          <div className="space-y-[1px]">
            {LIBRARY.map((item) => (
              <NavItem
                key={item.kind}
                {...item}
                collapsed={collapsed}
                active={activeKind === item.kind}
                onClick={() => go(() => openSingleton(item.kind, item.label))}
              />
            ))}
          </div>

          {!collapsed && pinned.length > 0 && (
            <>
              <SectionLabel className="mb-1.5 mt-5">Pinned</SectionLabel>
              <div className="space-y-[1px]">
                {pinned.map((tab) => (
                  <WorkspaceLink
                    key={tab.id}
                    title={tab.title}
                    active={tab.id === activeTabId}
                    onClick={() => go(() => setActive(tab.id))}
                  />
                ))}
              </div>
            </>
          )}

          {!collapsed && recent.length > 0 && (
            <>
              <SectionLabel className="mb-1.5 mt-5">Recent</SectionLabel>
              <div className="space-y-[1px] pb-3">
                {recent.map((tab) => (
                  <WorkspaceLink
                    key={tab.id}
                    title={tab.title}
                    meta={relativeTime(tab.createdAt)}
                    active={tab.id === activeTabId}
                    onClick={() => go(() => setActive(tab.id))}
                  />
                ))}
              </div>
            </>
          )}
        </nav>

        {/* Status rail */}
        <div className={cn('shrink-0 border-t border-line', collapsed ? 'p-2' : 'p-3')}>
          <div className={cn('space-y-2', collapsed && 'space-y-1.5')}>
            <PrivacyToggle collapsed={collapsed} />
            <RuntimeStatus collapsed={collapsed} />
            <UsageButton collapsed={collapsed} />
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <button
              onClick={() => go(() => openTab({ kind: 'settings', title: 'Settings' }))}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[9px] p-1.5 text-left transition-colors duration-150 hover:bg-subtle',
                collapsed && 'justify-center',
              )}
            >
              <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-ink text-[11px] font-semibold text-canvas">
                {(displayName || 'K').slice(0, 1).toUpperCase()}
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-ink">
                      {displayName || 'Your workspace'}
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">Local-first</p>
                  </div>
                  <Settings className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
                </>
              )}
            </button>
          </div>
        </div>
    </>
  )

  if (mobile) {
    return (
      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setNavOpen(false)}
              aria-hidden
            />
            <motion.aside
              key="drawer"
              className="pb-safe fixed inset-y-0 left-0 z-50 flex w-[272px] max-w-[84vw] flex-col border-r border-line bg-surface shadow-float md:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 460, damping: 42 }}
              /* A swipe back towards the edge closes it, as it does everywhere
                 else on a phone. */
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.4, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60 || info.velocity.x < -450) setNavOpen(false)
              }}
              aria-label="Navigation"
            >
              {body}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    )
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 56 : 248 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative z-20 hidden h-full shrink-0 flex-col border-r border-line bg-surface md:flex"
    >
      {body}

      {collapsed && !narrow && (
        <Tooltip content="Expand sidebar" side="right" shortcut={`${modKey()} B`}>
          <button
            onClick={() => setSetting('sidebarCollapsed', false)}
            className="absolute -right-[9px] top-[60px] z-30 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line bg-surface text-ink-faint shadow-sm transition-colors hover:text-ink"
            aria-label="Expand sidebar"
          >
            <PanelLeft className="h-[10px] w-[10px]" />
          </button>
        </Tooltip>
      )}
    </motion.aside>
  )
}

function NavItem({
  kind,
  label,
  icon: Icon,
  collapsed,
  active,
  onClick,
}: {
  kind: TabKind
  label: string
  icon: React.ComponentType<{ className?: string }>
  collapsed: boolean
  active: boolean
  onClick: () => void
}) {
  const animation = NAV_ICONS[kind]
  const content = (
    <button
      onClick={onClick}
      className={cn(
        'group flex h-[36px] w-full items-center gap-2.5 rounded-[8px] px-2 text-left transition-colors duration-150',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-subtle text-ink'
          : 'text-ink-muted hover:bg-subtle hover:text-ink',
      )}
    >
      {animation ? (
        <LottieIcon
          name={animation}
          active={active}
          // Drawn in their own colours rather than mapped onto the theme: the
          // illustrations are what tell the destinations apart, and washing
          // twelve of them in one hue throws that away. Attention is carried by
          // opacity instead — the current section is full strength, the rest
          // recede until hovered.
          paint={false}
          className={cn(
            'icon-glow h-[26px] w-[26px] transition-opacity duration-150',
            active ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
          )}
          fallback={Icon}
        />
      ) : (
        <Icon
          className={cn(
            'h-[15px] w-[15px] shrink-0 transition-colors',
            active ? 'text-ink' : 'text-ink-faint group-hover:text-ink-muted',
          )}
        />
      )}
      {!collapsed && <span className="truncate text-[13px] font-medium">{label}</span>}
    </button>
  )

  return collapsed ? (
    <Tooltip content={label} side="right">
      {content}
    </Tooltip>
  ) : (
    content
  )
}

function WorkspaceLink({
  title,
  meta,
  active,
  onClick,
}: {
  title: string
  meta?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-[28px] w-full items-center gap-2 rounded-[7px] px-2 text-left transition-colors duration-150',
        active ? 'bg-subtle' : 'hover:bg-subtle',
      )}
    >
      <StatusDot state={active ? 'busy' : 'offline'} className={active ? '' : 'opacity-40'} />
      <span
        className={cn(
          'flex-1 truncate text-[12.5px]',
          active ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {title}
      </span>
      {meta && <span className="shrink-0 text-[10.5px] text-ink-faint">{meta}</span>}
    </button>
  )
}
