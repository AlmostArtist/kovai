'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Boxes,
  Clock,
  Command as CommandIcon,
  Copy,
  FolderOpen,
  GalleryVerticalEnd,
  Home,
  Images,
  Layers,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Settings,
  Sparkles,
  StickyNote,
  Telescope,
  Type,
  Wand2,
  Workflow as WorkflowIcon,
  X,
} from 'lucide-react'
import { Button, Kbd, Popover, PopoverContent, PopoverTrigger, Tooltip } from '@/components/ui'
import { ActivityIndicator } from './activity-center'
import { useWorkspace, type Tab, type TabKind } from '@/store/workspace'
import { useUI } from '@/store/ui'
import { useJobs } from '@/store/jobs'
import { cn, modKey } from '@/lib/utils'
import { LottieIcon } from '@/components/icons/lottie-icon'
import { NAV_ICONS } from '@/components/icons/nav-icons'

const ICONS: Record<TabKind, React.ComponentType<{ className?: string }>> = {
  home: Home,
  chat: MessageSquare,
  create: Sparkles,
  vision: Layers,
  research: Telescope,
  projects: FolderOpen,
  project: FolderOpen,
  assets: Images,
  album: GalleryVerticalEnd,
  history: Clock,
  workflows: WorkflowIcon,
  workflow: WorkflowIcon,
  models: Boxes,
  skills: Sparkles,
  prompts: Type,
  notes: StickyNote,
  agents: Bot,
  templates: Wand2,
  settings: Settings,
}

export interface TabTheme {
  color: string
  soft: string
  border: string
  label: string
}

export const TAB_THEMES: Record<TabKind, TabTheme> = {
  home: {
    color: 'var(--color-accent)',
    soft: 'var(--color-accent-soft)',
    border: 'var(--color-accent)',
    label: 'Home',
  },
  chat: {
    color: 'var(--color-badge-chat)',
    soft: 'var(--color-badge-chat-soft)',
    border: 'var(--color-badge-chat)',
    label: 'Chat',
  },
  create: {
    color: 'var(--color-badge-create)',
    soft: 'var(--color-badge-create-soft)',
    border: 'var(--color-badge-create)',
    label: 'Create',
  },
  vision: {
    color: 'var(--color-badge-vision)',
    soft: 'var(--color-badge-vision-soft)',
    border: 'var(--color-badge-vision)',
    label: 'Vision',
  },
  research: {
    color: 'var(--color-badge-research)',
    soft: 'var(--color-badge-research-soft)',
    border: 'var(--color-badge-research)',
    label: 'Research',
  },
  workflows: {
    color: 'var(--color-badge-workflow)',
    soft: 'var(--color-badge-workflow-soft)',
    border: 'var(--color-badge-workflow)',
    label: 'Workflows',
  },
  workflow: {
    color: 'var(--color-badge-workflow)',
    soft: 'var(--color-badge-workflow-soft)',
    border: 'var(--color-badge-workflow)',
    label: 'Workflow',
  },
  models: {
    color: 'var(--color-badge-model)',
    soft: 'var(--color-badge-model-soft)',
    border: 'var(--color-badge-model)',
    label: 'Models',
  },
  prompts: {
    color: 'var(--color-badge-prompt)',
    soft: 'var(--color-badge-prompt-soft)',
    border: 'var(--color-badge-prompt)',
    label: 'Prompts',
  },
  assets: {
    color: 'var(--color-badge-asset)',
    soft: 'var(--color-badge-asset-soft)',
    border: 'var(--color-badge-asset)',
    label: 'Assets',
  },
  album: {
    color: 'var(--color-accent)',
    soft: 'var(--color-accent-soft)',
    border: 'var(--color-accent)',
    label: 'Album',
  },
  history: {
    color: 'var(--color-cloud)',
    soft: 'var(--color-cloud-soft)',
    border: 'var(--color-cloud)',
    label: 'History',
  },
  skills: {
    color: 'var(--color-accent)',
    soft: 'var(--color-accent-soft)',
    border: 'var(--color-accent)',
    label: 'Skills',
  },
  projects: {
    color: 'var(--color-local)',
    soft: 'var(--color-local-soft)',
    border: 'var(--color-local)',
    label: 'Projects',
  },
  project: {
    color: 'var(--color-local)',
    soft: 'var(--color-local-soft)',
    border: 'var(--color-local)',
    label: 'Project',
  },
  notes: {
    color: 'var(--color-warn)',
    soft: 'color-mix(in srgb, var(--color-warn) 14%, transparent)',
    border: 'var(--color-warn)',
    label: 'Notes',
  },
  agents: {
    color: 'var(--color-local)',
    soft: 'color-mix(in srgb, var(--color-local) 14%, transparent)',
    border: 'var(--color-local)',
    label: 'Agents',
  },
  templates: {
    color: 'var(--color-accent)',
    soft: 'var(--color-accent-soft)',
    border: 'var(--color-accent)',
    label: 'Templates',
  },
  settings: {
    color: '#8b5cf6',
    soft: 'rgba(139, 92, 246, 0.14)',
    border: '#8b5cf6',
    label: 'Settings',
  },
}

const NEW_TAB_OPTIONS: { kind: TabKind; label: string; tag: string }[] = [
  { kind: 'home', label: 'Home', tag: 'Workspace' },
  { kind: 'chat', label: 'Chat', tag: 'LLM' },
  { kind: 'create', label: 'Create image', tag: '/image' },
  { kind: 'vision', label: 'Vision', tag: '/vision' },
  { kind: 'research', label: 'Research', tag: '/research' },
  { kind: 'workflows', label: 'Workflow', tag: '/workflow' },
  { kind: 'models', label: 'Models', tag: 'Local/API' },
  { kind: 'skills', label: 'Skills', tag: 'SKILL.md' },
  { kind: 'assets', label: 'Assets', tag: 'Vault' },
  { kind: 'album', label: 'Album', tag: 'Generated' },
  { kind: 'history', label: 'History', tag: 'Chats' },
  { kind: 'projects', label: 'Projects', tag: 'Files' },
  { kind: 'prompts', label: 'Prompts', tag: 'Templates' },
  { kind: 'settings', label: 'Settings', tag: 'Config' },
]

/**
 * Browser-style workspace tabs.
 *
 * Reordering is direct manipulation; renaming is a double-click. The tab strip
 * is the one place that shows everything in flight at once, so it stays quiet:
 * no counters, no badges, until something is actually running.
 */
export function TopTabs() {
  const tabs = useWorkspace((s) => s.tabs)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const setActive = useWorkspace((s) => s.setActive)
  const openTab = useWorkspace((s) => s.openTab)
  const reorder = useWorkspace((s) => s.reorder)
  const setCommandOpen = useUI((s) => s.setCommandOpen)
  const [dragId, setDragId] = useState<string | null>(null)

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-line bg-surface px-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        {tabs.map((tab) => (
          <TabChip
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            dragging={dragId === tab.id}
            onSelect={() => setActive(tab.id)}
            onDragStart={() => setDragId(tab.id)}
            onDragEnd={() => setDragId(null)}
            onDropOn={() => {
              if (dragId && dragId !== tab.id) reorder(dragId, tab.id)
              setDragId(null)
            }}
          />
        ))}

        <Popover>
          <PopoverTrigger asChild>
            <button
              className="ml-0.5 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[8px] text-ink-faint transition-colors duration-150 hover:bg-subtle hover:text-ink md:h-[31px] md:w-[31px]"
              aria-label="New tab"
              onDoubleClick={() => openTab({ kind: 'home' })}
            >
              <Plus className="h-[15px] w-[15px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[210px] p-1.5">
            <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
              New workspace
            </div>
            <div className="space-y-0.5">
              {NEW_TAB_OPTIONS.map((option) => {
                const Icon = ICONS[option.kind]
                const theme = TAB_THEMES[option.kind] ?? TAB_THEMES.home
                return (
                  <button
                    key={option.kind}
                    onClick={() => openTab({ kind: option.kind })}
                    className="flex w-full items-center justify-between rounded-[8px] px-2 py-[6px] text-left text-[12.5px] text-ink transition-colors hover:bg-subtle group"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-[5px]"
                        style={{ backgroundColor: theme.soft, color: theme.color }}
                      >
                        <Icon className="h-[12px] w-[12px]" />
                      </span>
                      <span className="font-medium">{option.label}</span>
                    </div>
                    <span
                      className="rounded-[4px] border px-1.5 py-0.2 text-[10px] font-medium"
                      style={{
                        borderColor: theme.color,
                        color: theme.color,
                        backgroundColor: theme.soft,
                      }}
                    >
                      {option.tag}
                    </span>
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* The activity chip and the palette both have a home in the phone
          header, and the keycap advertises a shortcut a phone cannot press. */}
      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        <ActivityIndicator />

        <Tooltip content="Command palette" shortcut={`${modKey()} K`}>
          <button
            onClick={() => setCommandOpen(true)}
            className="flex h-[30px] items-center gap-1.5 rounded-[8px] border border-line bg-subtle pl-2 pr-1.5 text-ink-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            <CommandIcon className="h-[13px] w-[13px]" />
            <Kbd>K</Kbd>
          </button>
        </Tooltip>
      </div>
    </header>
  )
}

function TabChip({
  tab,
  active,
  dragging,
  onSelect,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  tab: Tab
  active: boolean
  dragging: boolean
  onSelect: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDropOn: () => void
}) {
  const Icon = ICONS[tab.kind]
  const closeTab = useWorkspace((s) => s.closeTab)
  const renameTab = useWorkspace((s) => s.renameTab)
  const togglePin = useWorkspace((s) => s.togglePin)
  const duplicateTab = useWorkspace((s) => s.duplicateTab)
  const closeOthers = useWorkspace((s) => s.closeOthers)
  const tabCount = useWorkspace((s) => s.tabs.length)
  const running = useJobs((s) => Object.values(s.jobs).some((j) => j.tabId === tab.id && ['QUEUED', 'RUNNING'].includes(j.status)))

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tab.title)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    renameTab(tab.id, draft)
    setEditing(false)
  }

  const theme = TAB_THEMES[tab.kind] ?? TAB_THEMES.home

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <div
          draggable={!editing}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropOn}
          onClick={onSelect}
          onDoubleClick={() => {
            setDraft(tab.title)
            setEditing(true)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenuOpen(true)
          }}
          className={cn(
            'group flex h-[38px] max-w-[62vw] shrink-0 cursor-default items-center gap-1.5 rounded-[9px] border px-2.5 transition-all duration-150 md:h-[31px] md:max-w-[210px] [@media(pointer:coarse)]:h-[38px]',
            active
              ? 'shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
              : 'border-transparent text-ink-muted hover:border-line hover:bg-subtle',
            dragging && 'opacity-40',
          )}
          style={
            active
              ? {
                  backgroundColor: theme.soft,
                  borderColor: theme.color,
                  color: theme.color,
                }
              : undefined
          }
        >
          {running ? (
            <span
              className="h-[6px] w-[6px] shrink-0 rounded-full breathe"
              style={{ backgroundColor: theme.color }}
            />
          ) : (
            <span
              className="flex shrink-0 items-center justify-center transition-transform duration-200 group-hover:scale-110"
              style={{ color: theme.color }}
            >
              {NAV_ICONS[tab.kind] ? (
                <LottieIcon
                  name={NAV_ICONS[tab.kind]!}
                  active={active}
                  paint={false}
                  className="icon-glow h-[20px] w-[20px]"
                  fallback={Icon}
                />
              ) : (
                <Icon className="h-[13.5px] w-[13.5px]" />
              )}
            </span>
          )}

          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') setEditing(false)
                e.stopPropagation()
              }}
              className="w-[110px] bg-transparent text-[12.5px] outline-none font-medium"
              style={{ color: active ? theme.color : undefined }}
            />
          ) : (
            <span
              className="truncate text-[12.5px] font-medium"
              style={{ color: active ? theme.color : undefined }}
            >
              {tab.title}
            </span>
          )}

          {tab.pinned && !active && <Pin className="h-[10px] w-[10px] shrink-0 text-ink-faint" />}

          {tabCount > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className={cn(
                // 16px is a comfortable cursor target and an impossible finger
                // one — and it sits inside the tab, so a near miss opens the
                // thing you were trying to close. On touch it gets 26px and is
                // always visible, since there is no hover to reveal it.
                'ml-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] transition-all duration-150 hover:bg-black/10 md:h-[16px] md:w-[16px] md:rounded-[4px] dark:hover:bg-white/10',
                // A tablet is wide enough for the desktop layout and still
                // driven by a finger, so the target follows the pointer rather
                // than the width.
                '[@media(pointer:coarse)]:h-[26px] [@media(pointer:coarse)]:w-[26px] [@media(pointer:coarse)]:rounded-[6px]',
                active
                  ? 'opacity-90 hover:opacity-100'
                  : 'text-ink-faint opacity-100 group-hover:opacity-100 hover:text-ink md:opacity-0 [@media(pointer:coarse)]:opacity-100',
              )}
              style={active ? { color: theme.color } : undefined}
              aria-label={`Close ${tab.title}`}
            >
              <X className="h-[10px] w-[10px]" />
            </button>
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[180px]">
        <MenuItem
          icon={Type}
          label="Rename"
          onClick={() => {
            setMenuOpen(false)
            setDraft(tab.title)
            setEditing(true)
          }}
        />
        {!['home', 'projects', 'assets', 'album', 'history', 'workflows', 'models', 'prompts', 'settings'].includes(
          tab.kind,
        ) && (
          <MenuItem icon={Copy} label="Duplicate" onClick={() => duplicateTab(tab.id)} />
        )}
        <MenuItem
          icon={tab.pinned ? PinOff : Pin}
          label={tab.pinned ? 'Unpin' : 'Pin'}
          onClick={() => togglePin(tab.id)}
        />
        <div className="my-1 h-px bg-line" />
        <MenuItem icon={X} label="Close" shortcut={`${modKey()} W`} onClick={() => closeTab(tab.id)} />
        <MenuItem icon={X} label="Close others" onClick={() => closeOthers(tab.id)} />
      </PopoverContent>
    </Popover>
  )
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[7px] px-2 py-[6px] text-left text-[12.5px] text-ink transition-colors hover:bg-subtle"
    >
      <Icon className="h-[13px] w-[13px] text-ink-faint" />
      <span className="flex-1">{label}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  )
}
