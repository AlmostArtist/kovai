'use client'

import { useMemo } from 'react'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Boxes,
  Clock,
  Cloud,
  FolderOpen,
  GalleryVerticalEnd,
  Home,
  Images,
  Layers,
  Lock,
  MessageSquare,
  Moon,
  PanelRight,
  Play,
  Search,
  Settings,
  Sparkles,
  Sun,
  Telescope,
  Type,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { Kbd } from '@/components/ui'
import { useUI } from '@/store/ui'
import { useWorkspace, type TabKind } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { useLocalRuntime } from '@/hooks/use-local-runtime'
import { relativeTime, truncate } from '@/lib/utils'
import type { Asset, Project, PromptEntry, Workflow } from '@/lib/db/types'
import type { AIModel } from '@/lib/providers/types'
import { toast } from 'sonner'

/**
 * One overlay, two modes.
 *
 * ⌘K is the command surface — everything you can *do*. ⌘/ is search —
 * everything you have *made*. They share a frame and a keyboard model so the
 * distinction costs nothing to learn.
 */
export function CommandPalette() {
  const commandOpen = useUI((s) => s.commandOpen)
  const searchOpen = useUI((s) => s.searchOpen)
  const setCommandOpen = useUI((s) => s.setCommandOpen)
  const setSearchOpen = useUI((s) => s.setSearchOpen)
  const open = commandOpen || searchOpen
  const mode = searchOpen ? 'search' : 'command'

  const close = () => (searchOpen ? setSearchOpen(false) : setCommandOpen(false))

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] dark:bg-black/45"
            onClick={close}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[6vh] z-50 w-[calc(100vw-1.5rem)] max-w-[600px] -translate-x-1/2 sm:top-[14vh] sm:w-[calc(100vw-2rem)]"
          >
            <PaletteBody mode={mode} onClose={close} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function PaletteBody({ mode, onClose }: { mode: 'command' | 'search'; onClose: () => void }) {
  const openTab = useWorkspace((s) => s.openTab)
  const openSingleton = useWorkspace((s) => s.openSingleton)
  const tabs = useWorkspace((s) => s.tabs)
  const setActiveTab = useWorkspace((s) => s.setActive)
  const settings = useSettings()
  const { snapshot, start } = useLocalRuntime()
  const index = useSearchIndex(true)

  const run = (action: () => void) => {
    action()
    onClose()
  }

  const go = (kind: TabKind, title?: string) => run(() => openSingleton(kind, title ?? kind))

  return (
    <Command
      loop
      className="overflow-hidden rounded-[14px] border border-line bg-elevated shadow-float"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search className="h-[15px] w-[15px] shrink-0 text-ink-faint" />
        <Command.Input
          autoFocus
          placeholder={mode === 'search' ? 'Search projects, assets, prompts, models…' : 'Type a command…'}
          className="h-[46px] flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
        />
        <Kbd>esc</Kbd>
      </div>

      <Command.List className="max-h-[368px] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-8 text-center text-[13px] text-ink-faint">
          Nothing matched.
        </Command.Empty>

        {mode === 'command' && (
          <>
            <Group heading="Create">
              <Item icon={MessageSquare} label="New chat" onSelect={() => run(() => openTab({ kind: 'chat' }))} />
              <Item icon={Sparkles} label="Generate image" onSelect={() => run(() => openTab({ kind: 'create' }))} />
              <Item icon={Layers} label="Analyse an image" onSelect={() => run(() => openTab({ kind: 'vision' }))} />
              <Item icon={Telescope} label="Start research" onSelect={() => run(() => openTab({ kind: 'research' }))} />
              <Item icon={FolderOpen} label="New project" onSelect={() => run(() => openTab({ kind: 'projects' }))} />
              <Item icon={WorkflowIcon} label="Run a workflow" onSelect={() => go('workflows', 'Workflows')} />
            </Group>

            <Group heading="Go to">
              <Item icon={Home} label="Home" onSelect={() => go('home', 'Home')} />
              <Item icon={FolderOpen} label="Projects" onSelect={() => go('projects', 'Projects')} />
              <Item icon={Images} label="Assets" onSelect={() => go('assets', 'Assets')} />
              <Item icon={GalleryVerticalEnd} label="Album" onSelect={() => go('album', 'Album')} />
              <Item icon={Clock} label="History" onSelect={() => go('history', 'History')} />
              <Item icon={Boxes} label="Models" onSelect={() => go('models', 'Models')} />
              <Item icon={Type} label="Prompts" onSelect={() => go('prompts', 'Prompts')} />
              <Item icon={Settings} label="Settings" onSelect={() => go('settings', 'Settings')} />
            </Group>

            <Group heading="Workspace">
              {tabs.slice(0, 6).map((tab) => (
                <Item
                  key={tab.id}
                  icon={PanelRight}
                  label={tab.title}
                  hint="Open tab"
                  onSelect={() => run(() => setActiveTab(tab.id))}
                />
              ))}
            </Group>

            <Group heading="Actions">
              <Item
                icon={settings.privacy === 'PRIVATE' ? Cloud : Lock}
                label={settings.privacy === 'PRIVATE' ? 'Switch to online mode' : 'Switch to private mode'}
                hint={settings.privacy === 'PRIVATE' ? 'Enable cloud models' : 'Keep chat on this machine'}
                onSelect={() =>
                  run(() => settings.set('privacy', settings.privacy === 'PRIVATE' ? 'ONLINE' : 'PRIVATE'))
                }
              />
              {!snapshot?.online && (
                <Item
                  icon={Play}
                  label="Start local runtime"
                  onSelect={() =>
                    run(() => {
                      const pending = toast.loading('Starting the local runtime…')
                      start()
                        .then(() => toast.success('Local runtime ready', { id: pending }))
                        .catch((err: Error) =>
                          toast.error('Could not start the runtime', { id: pending, description: err.message }),
                        )
                    })
                  }
                />
              )}
              <Item
                icon={settings.theme === 'dark' ? Sun : Moon}
                label={settings.theme === 'dark' ? 'Light appearance' : 'Dark appearance'}
                onSelect={() => run(() => settings.set('theme', settings.theme === 'dark' ? 'light' : 'dark'))}
              />
            </Group>
          </>
        )}

        {mode === 'search' && (
          <>
            {index.projects.length > 0 && (
              <Group heading="Projects">
                {index.projects.map((project) => (
                  <Item
                    key={project.id}
                    icon={FolderOpen}
                    label={project.name}
                    hint={relativeTime(project.updatedAt)}
                    onSelect={() =>
                      run(() =>
                        openTab({ kind: 'project', title: project.name, state: { projectId: project.id } }),
                      )
                    }
                  />
                ))}
              </Group>
            )}

            {index.assets.length > 0 && (
              <Group heading="Assets">
                {index.assets.map((asset) => (
                  <Item
                    key={asset.id}
                    icon={Images}
                    label={asset.name}
                    hint={asset.model ?? asset.origin}
                    onSelect={() => run(() => openSingleton('assets', 'Assets'))}
                  />
                ))}
              </Group>
            )}

            {index.prompts.length > 0 && (
              <Group heading="Prompts">
                {index.prompts.map((prompt) => (
                  <Item
                    key={prompt.id}
                    icon={Type}
                    label={prompt.title}
                    hint={truncate(prompt.body, 40)}
                    onSelect={() => run(() => openSingleton('prompts', 'Prompts'))}
                  />
                ))}
              </Group>
            )}

            {index.workflows.length > 0 && (
              <Group heading="Workflows">
                {index.workflows.map((workflow) => (
                  <Item
                    key={workflow.id}
                    icon={WorkflowIcon}
                    label={workflow.name}
                    hint={`${workflow.nodes.length} steps`}
                    onSelect={() =>
                      run(() =>
                        openTab({ kind: 'workflow', title: workflow.name, state: { workflowId: workflow.id } }),
                      )
                    }
                  />
                ))}
              </Group>
            )}

            {index.models.length > 0 && (
              <Group heading="Models">
                {index.models.slice(0, 8).map((model) => (
                  <Item
                    key={`${model.providerId}:${model.id}`}
                    icon={Boxes}
                    label={model.name}
                    hint={model.providerId === 'local' ? 'Local' : model.providerId}
                    onSelect={() => run(() => openSingleton('models', 'Models'))}
                  />
                ))}
              </Group>
            )}
          </>
        )}
      </Command.List>
    </Command>
  )
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-ink-faint"
    >
      {children}
    </Command.Group>
  )
}

function Item({
  icon: Icon,
  label,
  hint,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  hint?: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      value={`${label} ${hint ?? ''}`}
      onSelect={onSelect}
      className="flex cursor-default items-center gap-2.5 rounded-[8px] px-2.5 py-[8px] text-[13.5px] text-ink transition-colors data-[selected=true]:bg-subtle"
    >
      <Icon className="h-[14px] w-[14px] shrink-0 text-ink-faint" />
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 truncate text-[11.5px] text-ink-faint">{hint}</span>}
    </Command.Item>
  )
}

/** Everything searchable, fetched once while the overlay is open. */
function useSearchIndex(enabled: boolean) {
  const privacy = useSettings((s) => s.privacy)

  const projects = useQuery({
    queryKey: ['projects'],
    enabled,
    queryFn: async () =>
      ((await (await fetch('/api/projects')).json()) as { projects: Project[] }).projects,
  })
  const assets = useQuery({
    queryKey: ['assets', 'all'],
    enabled,
    queryFn: async () => ((await (await fetch('/api/assets')).json()) as { assets: Asset[] }).assets,
  })
  const prompts = useQuery({
    queryKey: ['prompts'],
    enabled,
    queryFn: async () => ((await (await fetch('/api/prompts')).json()) as { prompts: PromptEntry[] }).prompts,
  })
  const workflows = useQuery({
    queryKey: ['workflows'],
    enabled,
    queryFn: async () =>
      ((await (await fetch('/api/workflows')).json()) as { workflows: Workflow[] }).workflows,
  })
  const models = useQuery({
    queryKey: ['models', 'all', privacy],
    enabled,
    queryFn: async () =>
      ((await (await fetch(`/api/models?privacy=${privacy}`)).json()) as { models: AIModel[] }).models,
  })

  return useMemo(
    () => ({
      projects: projects.data ?? [],
      assets: (assets.data ?? []).slice(0, 10),
      prompts: prompts.data ?? [],
      workflows: workflows.data ?? [],
      models: models.data ?? [],
    }),
    [projects.data, assets.data, prompts.data, workflows.data, models.data],
  )
}
