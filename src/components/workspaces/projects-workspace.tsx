'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Images, MessageSquare, Plus, Settings2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Segmented,
  Switch,
  Textarea,
} from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { AssetCard, useAssets } from './assets-workspace'
import { ProjectFolder } from './project-folder'
import { useWorkspace, type Tab } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { relativeTime, uid } from '@/lib/utils'
import type { Asset, Conversation, Project } from '@/lib/db/types'

function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => ((await (await fetch('/api/projects')).json()) as { projects: Project[] }).projects,
  })
}

/**
 * Projects are creative workspaces: a name, a body of work, and a persistent
 * context the AI can be given. Nothing is shared with a model unless project
 * context is switched on.
 */
/** What a project holds, for the folder that stands for it. */
function inside(projectId: string, assets: Asset[], conversations: Conversation[]) {
  const mine = assets.filter((a) => a.projectId === projectId)
  const chats = conversations.filter((c) => c.projectId === projectId).length

  const kinds: ('image' | 'video' | 'document' | 'chat')[] = []
  if (mine.some((a) => a.kind === 'image')) kinds.push('image')
  if (mine.some((a) => a.kind === 'video')) kinds.push('video')
  if (mine.some((a) => a.kind === 'document')) kinds.push('document')
  if (chats) kinds.push('chat')

  return {
    files: mine.length,
    chats,
    kinds,
    previews: mine.filter((a) => a.kind !== 'document').slice(0, 3),
  }
}

/** "15 files · 3 chats", or the honest "Empty". */
function countLabel(contents: ReturnType<typeof inside>): string {
  const parts: string[] = []
  if (contents.files) parts.push(`${contents.files} file${contents.files === 1 ? '' : 's'}`)
  if (contents.chats) parts.push(`${contents.chats} chat${contents.chats === 1 ? '' : 's'}`)
  return parts.join(' · ') || 'Empty'
}

export function ProjectsWorkspace(_props: { tab: Tab }) {
  const { data: projects, isLoading } = useProjects()
  const openTab = useWorkspace((s) => s.openTab)
  const client = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const preview = useUI((s) => s.preview)

  const { data: assets } = useAssets()
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () =>
      ((await (await fetch('/api/conversations')).json()) as { conversations: Conversation[] })
        .conversations,
    staleTime: 30_000,
  })

  const recent = useMemo(
    () =>
      [...(assets ?? [])]
        .filter((a) => a.kind !== 'document')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8),
    [assets],
  )

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      })
      return ((await res.json()) as { project: Project }).project
    },
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ['projects'] })
      setCreating(false)
      setName('')
      setDescription('')
      openTab({ kind: 'project', title: project.name, state: { projectId: project.id } })
    },
    onError: () => toast.error('That project could not be created.'),
  })

  return (
    <WorkspaceScroll>
      <WorkspaceHeader
        title="Projects"
        subtitle="Chats, images, references and workflows, kept together."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" />
            New project
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[112px] rounded-[12px] shimmer" />
          ))}
        </div>
      ) : !projects?.length ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet."
          line="Your next idea starts here."
          action={
            <Button variant="primary" size="md" onClick={() => setCreating(true)}>
              Create project
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(188px,1fr))] gap-1">
            {projects.map((project) => {
              const contents = inside(project.id, assets ?? [], conversations ?? [])
              return (
                <ProjectFolder
                  key={project.id}
                  name={project.name}
                  count={countLabel(contents)}
                  previews={contents.previews}
                  kinds={contents.kinds}
                  accent={project.color}
                  onOpen={() =>
                    openTab({ kind: 'project', title: project.name, state: { projectId: project.id } })
                  }
                />
              )
            })}
          </div>

          {/*
            The reference has a table under the folders, and it is right to: a
            folder tells you a project exists, and this tells you what landed in
            one recently. Across all of them, because "what did I make today" is
            not a question about one project.
          */}
          {recent.length > 0 && (
            <section className="mt-9">
              <h2 className="mb-2.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                Recent files
              </h2>

              <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
                <div className="grid grid-cols-[minmax(0,1fr)_160px_120px] gap-3 border-b border-line px-4 py-2.5 text-[11.5px] text-ink-faint">
                  <span>Name</span>
                  <span>Project</span>
                  <span className="text-right">Added</span>
                </div>

                {recent.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => preview(asset.id)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_160px_120px] items-center gap-3 border-b border-line px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-subtle"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="h-[26px] w-[26px] shrink-0 overflow-hidden rounded-[6px] border border-line bg-subtle">
                        {asset.kind === 'video' ? (
                          <video src={asset.url} className="h-full w-full object-cover" muted playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={asset.thumbnailUrl ?? asset.url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </span>
                      <span className="truncate text-[13px] text-ink">{asset.name}</span>
                    </span>

                    <span className="truncate text-[12px] text-ink-muted">
                      {projects.find((p) => p.id === asset.projectId)?.name ?? 'Unfiled'}
                    </span>

                    <span className="text-right text-[11.5px] text-ink-faint">
                      {relativeTime(asset.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New project" description="Give it a name. Everything else can come later.">
          <div className="space-y-3 px-5 pb-5">
            <Input
              autoFocus
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && create.mutate()}
            />
            <Textarea
              rows={3}
              placeholder="What is this project for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="md" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                Create project
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceScroll>
  )
}

type Section = 'overview' | 'chats' | 'assets' | 'context'

/** A single project, with its work and its creative direction in one place. */
export function ProjectWorkspace({ tab }: { tab: Tab }) {
  const projectId = tab.state.projectId as string | undefined
  const [section, setSection] = useState<Section>('overview')
  const openTab = useWorkspace((s) => s.openTab)
  const settings = useSettings()
  const preview = useUI((s) => s.preview)
  const client = useQueryClient()

  const { data } = useQuery({
    queryKey: ['project', projectId],
    enabled: Boolean(projectId),
    queryFn: async () =>
      (await (await fetch(`/api/projects/${projectId}`)).json()) as {
        project: Project | null
        assets: Asset[]
        conversations: Conversation[]
      },
  })

  const save = useMutation({
    mutationFn: async (patch: Partial<Project>) => {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['project', projectId] })
      void client.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Project updated')
    },
  })

  const project = data?.project
  const isActive = settings.activeProjectId === projectId

  if (!project) {
    return (
      <WorkspaceScroll>
        <EmptyState icon={FolderOpen} title="This project no longer exists." />
      </WorkspaceScroll>
    )
  }

  return (
    <WorkspaceScroll>
      <WorkspaceHeader
        title={project.name}
        subtitle={project.description}
        actions={
          <>
            <Button
              variant={isActive ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => settings.set('activeProjectId', isActive ? null : projectId!)}
            >
              {isActive ? 'Active project' : 'Set as active'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openTab({ kind: 'chat', title: `${project.name} — chat` })}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              New chat
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openTab({ kind: 'create', title: `${project.name} — image` })}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Create
            </Button>
          </>
        }
      />

      <Segmented
        className="mb-6"
        value={section}
        onChange={setSection}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'chats', label: `Chats ${data?.conversations.length ?? 0}` },
          { value: 'assets', label: `Assets ${data?.assets.length ?? 0}` },
          { value: 'context', label: 'Context' },
        ]}
      />

      {section === 'overview' && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Assets" value={String(data?.assets.length ?? 0)} />
          <Stat label="Conversations" value={String(data?.conversations.length ?? 0)} />
          <Stat label="Created" value={relativeTime(project.createdAt)} />
        </div>
      )}

      {section === 'assets' &&
        (data?.assets.length ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3">
            {data.assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onOpen={() => preview(asset.id)} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Images}
            title="No assets in this project."
            line="Set it as the active project, then anything you generate lands here."
          />
        ))}

      {section === 'chats' &&
        (data?.conversations.length ? (
          <div className="space-y-1">
            {data.conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="flex items-center gap-2.5 rounded-[9px] border border-line bg-surface px-3 py-2.5"
              >
                <MessageSquare className="h-[14px] w-[14px] text-ink-faint" />
                <span className="flex-1 truncate text-[13px] text-ink">{conversation.title}</span>
                <span className="text-[11.5px] text-ink-faint">
                  {relativeTime(conversation.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={MessageSquare} title="No conversations saved here yet." />
        ))}

      {section === 'context' && <ContextEditor project={project} onSave={(patch) => save.mutate(patch)} />}
    </WorkspaceScroll>
  )
}

function ContextEditor({
  project,
  onSave,
}: {
  project: Project
  onSave: (patch: Partial<Project>) => void
}) {
  const [brand, setBrand] = useState(project.context.brand ?? '')
  const [direction, setDirection] = useState(project.context.direction ?? '')
  const [instructions, setInstructions] = useState(project.context.instructions ?? '')
  const useProjectContext = useSettings((s) => s.useProjectContext)
  const set = useSettings((s) => s.set)

  return (
    <div className="max-w-[640px] space-y-5">
      <div className="flex items-start justify-between gap-4 rounded-[11px] border border-line bg-surface p-4">
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-ink">Use project context</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            When on, the direction below is included with requests made while this project is active. It is
            never sent otherwise.
          </p>
        </div>
        <Switch checked={useProjectContext} onCheckedChange={(v) => set('useProjectContext', v)} />
      </div>

      <Field label="Brand" hint="Who this work is for.">
        <Textarea rows={3} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand, product, audience…" />
      </Field>
      <Field label="Creative direction" hint="Tone, references, visual language.">
        <Textarea
          rows={4}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          placeholder="Warm, editorial, natural light. Avoid stock-photo gloss."
        />
      </Field>
      <Field label="Standing instructions" hint="Rules the assistant should always follow here.">
        <Textarea
          rows={4}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Always propose three directions before writing copy."
        />
      </Field>

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="md"
          onClick={() =>
            onSave({ context: { ...project.context, brand, direction, instructions } })
          }
        >
          <Settings2 className="h-3.5 w-3.5" />
          Save context
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="text-[12.5px] font-medium text-ink">{label}</label>
        {hint && <span className="text-[11.5px] text-ink-faint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[11px] border border-line bg-surface p-4">
      <p className="text-[20px] font-medium tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-0.5 text-[12px] text-ink-faint">{label}</p>
    </div>
  )
}

export { uid }
