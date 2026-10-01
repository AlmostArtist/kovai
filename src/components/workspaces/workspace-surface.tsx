'use client'

import { HomeWorkspace } from './home-workspace'
import { ChatWorkspace } from './chat-workspace'
import { CreateWorkspace } from './create-workspace'
import { VisionWorkspace } from './vision-workspace'
import { ResearchWorkspace } from './research-workspace'
import { ProjectsWorkspace, ProjectWorkspace } from './projects-workspace'
import { AssetsWorkspace } from './assets-workspace'
import { AlbumWorkspace } from './album-workspace'
import { HistoryWorkspace } from './history-workspace'
import { WorkflowsWorkspace, WorkflowEditor } from './workflows-workspace'
import { ModelsWorkspace } from './models-workspace'
import { SkillsWorkspace } from './skills-workspace'
import { PromptsWorkspace } from './prompts-workspace'
import { SettingsWorkspace } from './settings-workspace'
import { NotesWorkspace } from './notes-workspace'
import { TemplatesWorkspace } from './templates-workspace'
import { AgentsWorkspace } from './agents-workspace'
import type { Tab } from '@/store/workspace'

/**
 * Maps a tab to its surface. Every surface receives only its own tab, and reads
 * and writes state through that tab — which is what keeps tabs independent.
 */
export function WorkspaceSurface({ tab }: { tab: Tab }) {
  switch (tab.kind) {
    case 'home':
      return <HomeWorkspace tab={tab} />
    case 'chat':
      return <ChatWorkspace tab={tab} />
    case 'create':
      return <CreateWorkspace tab={tab} />
    case 'vision':
      return <VisionWorkspace tab={tab} />
    case 'research':
      return <ResearchWorkspace tab={tab} />
    case 'projects':
      return <ProjectsWorkspace tab={tab} />
    case 'project':
      return <ProjectWorkspace tab={tab} />
    case 'assets':
      return <AssetsWorkspace tab={tab} />
    case 'album':
      return <AlbumWorkspace tab={tab} />
    case 'history':
      return <HistoryWorkspace tab={tab} />
    case 'workflows':
      return <WorkflowsWorkspace tab={tab} />
    case 'workflow':
      return <WorkflowEditor tab={tab} />
    case 'models':
      return <ModelsWorkspace tab={tab} />
    case 'skills':
      return <SkillsWorkspace tab={tab} />
    case 'prompts':
      return <PromptsWorkspace tab={tab} />
    case 'notes':
      return <NotesWorkspace tab={tab} />
    case 'templates':
      return <TemplatesWorkspace tab={tab} />
    case 'agents':
      return <AgentsWorkspace tab={tab} />
    case 'settings':
      return <SettingsWorkspace tab={tab} />
  }
}

/** Shared page frame: a max-width column with generous breathing room. */
export function WorkspaceScroll({
  children,
  className,
  width = 'wide',
}: {
  children: React.ReactNode
  className?: string
  width?: 'narrow' | 'wide' | 'full'
}) {
  const widths = { narrow: 'max-w-[760px]', wide: 'max-w-[1400px]', full: 'max-w-none' }
  return (
    <div className="h-full overflow-y-auto">
      <div className={`mx-auto px-8 py-8 ${widths[width]} ${className ?? ''}`}>{children}</div>
    </div>
  )
}

export function WorkspaceHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`mb-7 flex items-end justify-between gap-6 ${className ?? ''}`}>
      <div className="min-w-0">
        <h1 className="text-[21px] font-medium tracking-[-0.022em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
