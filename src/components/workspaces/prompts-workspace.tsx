'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Heart, Plus, Sparkles, Trash2, Type } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Dialog, DialogContent, EmptyState, Input, Textarea } from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { useWorkspace, type Tab } from '@/store/workspace'
import { cn, copyText, relativeTime } from '@/lib/utils'
import type { PromptEntry } from '@/lib/db/types'

/** A place to keep the prompts that worked, and reach them in one click. */
export function PromptsWorkspace(_props: { tab: Tab }) {
  const client = useQueryClient()
  const openTab = useWorkspace((s) => s.openTab)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<PromptEntry | null>(null)
  const [draft, setDraft] = useState({ title: '', body: '', tags: '' })

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: async () => ((await (await fetch('/api/prompts')).json()) as { prompts: PromptEntry[] }).prompts,
  })

  const save = useMutation({
    mutationFn: async (entry: Partial<PromptEntry>) => {
      await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['prompts'] })
      setEditing(null)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/prompts/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['prompts'] })
      toast.success('Prompt deleted')
    },
  })

  const filtered = useMemo(() => {
    if (!query.trim()) return prompts ?? []
    const q = query.toLowerCase()
    return (prompts ?? []).filter((p) => `${p.title} ${p.body} ${p.tags.join(' ')}`.toLowerCase().includes(q))
  }, [prompts, query])

  const open = (entry?: PromptEntry) => {
    setEditing(entry ?? ({ id: '', title: '', body: '', tags: [], favorite: false, useCount: 0, createdAt: 0, updatedAt: 0 } as PromptEntry))
    setDraft({ title: entry?.title ?? '', body: entry?.body ?? '', tags: entry?.tags.join(', ') ?? '' })
  }

  return (
    <WorkspaceScroll>
      <WorkspaceHeader
        title="Prompts"
        subtitle="The ones that worked, kept where you can reach them."
        actions={
          <>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts"
              className="w-[200px]"
            />
            <Button variant="primary" size="sm" onClick={() => open()}>
              <Plus className="h-3.5 w-3.5" />
              New prompt
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[136px] rounded-[11px] shimmer" />
          ))}
        </div>
      ) : !filtered.length ? (
        <EmptyState
          icon={Type}
          title={query ? 'Nothing matched.' : 'No prompts saved yet.'}
          line={query ? 'Try a different search.' : 'Save a prompt once and reuse it anywhere in KOVAI.'}
          action={
            !query && (
              <Button variant="primary" size="md" onClick={() => open()}>
                Write a prompt
              </Button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] gap-3">
          {filtered.map((prompt) => (
            <div
              key={prompt.id}
              className="group flex flex-col rounded-[11px] border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong"
            >
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                  {prompt.title}
                </p>
                <button
                  onClick={() => save.mutate({ ...prompt, favorite: !prompt.favorite })}
                  className="shrink-0 text-ink-faint transition-colors hover:text-ink"
                  aria-label="Favourite"
                >
                  <Heart className={cn('h-[13px] w-[13px]', prompt.favorite && 'fill-current text-ink')} />
                </button>
              </div>

              <p className="mt-2 line-clamp-4 flex-1 text-[12.5px] leading-relaxed text-ink-muted">
                {prompt.body}
              </p>

              {prompt.tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {prompt.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-[5px] border border-line bg-subtle px-1.5 py-[1px] text-[10.5px] text-ink-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-3 flex items-center gap-1 border-t border-line pt-2.5">
                <button
                  onClick={() => {
                    void copyText(prompt.body)
                    save.mutate({ ...prompt, useCount: prompt.useCount + 1 })
                    toast.success('Prompt copied')
                  }}
                  className="rounded-[6px] p-1 text-ink-faint transition-colors hover:text-ink"
                  title="Copy"
                >
                  <Copy className="h-[13px] w-[13px]" />
                </button>
                <button
                  onClick={() =>
                    openTab({ kind: 'create', title: prompt.title, state: { prompt: prompt.body } })
                  }
                  className="rounded-[6px] p-1 text-ink-faint transition-colors hover:text-ink"
                  title="Use in Create"
                >
                  <Sparkles className="h-[13px] w-[13px]" />
                </button>
                <button
                  onClick={() => open(prompt)}
                  className="ml-1 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove.mutate(prompt.id)}
                  className="ml-auto rounded-[6px] p-1 text-ink-faint opacity-0 transition-all hover:text-danger group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="h-[13px] w-[13px]" />
                </button>
                <span className="text-[11px] text-ink-faint">{relativeTime(prompt.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent title={editing?.id ? 'Edit prompt' : 'New prompt'} width="lg">
          <div className="space-y-3 px-5 pb-5">
            <Input
              autoFocus
              placeholder="Title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Textarea
              rows={8}
              placeholder="The prompt itself…"
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <Input
              placeholder="Tags, comma separated"
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="md" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={!draft.title.trim() || !draft.body.trim()}
                onClick={() =>
                  save.mutate({
                    ...(editing?.id ? editing : {}),
                    id: editing?.id || undefined,
                    title: draft.title,
                    body: draft.body,
                    tags: draft.tags
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              >
                Save prompt
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </WorkspaceScroll>
  )
}
