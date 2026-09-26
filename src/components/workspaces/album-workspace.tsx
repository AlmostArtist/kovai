'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, Images, Search, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, EmptyState, Input, Spinner, Tooltip } from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { useAssets } from './assets-workspace'
import { useUI } from '@/store/ui'
import { useWorkspace, type Tab } from '@/store/workspace'
import { providerLabel } from '@/lib/providers/descriptors'
import { cn, copyText, relativeTime } from '@/lib/utils'
import type { Asset } from '@/lib/db/types'

/**
 * The album.
 *
 * Assets is the whole library — uploads, references, documents. This is only
 * what KOVAI made, in the order it was made, with the prompt under each one.
 * Generated work is the part people come back to look through rather than
 * search for, so it gets a surface that is a contact sheet first and a file
 * manager second.
 */
export function AlbumWorkspace({ tab }: { tab: Tab }) {
  const [query, setQuery] = useState('')
  const [model, setModel] = useState<string>('all')
  const { data: assets, isLoading } = useAssets()
  const preview = useUI((s) => s.preview)
  const openTab = useWorkspace((s) => s.openTab)

  const generated = useMemo(
    () => (assets ?? []).filter((a) => a.origin === 'generated' && a.kind !== 'document'),
    [assets],
  )

  const models = useMemo(() => {
    const seen = new Map<string, number>()
    for (const asset of generated) {
      if (!asset.model) continue
      seen.set(asset.model, (seen.get(asset.model) ?? 0) + 1)
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [generated])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return generated.filter((asset) => {
      if (model !== 'all' && asset.model !== model) return false
      if (!term) return true
      return `${asset.name} ${asset.generation?.prompt ?? ''} ${asset.model ?? ''}`
        .toLowerCase()
        .includes(term)
    })
  }, [generated, query, model])

  const days = useMemo(() => groupByDay(filtered), [filtered])

  return (
    <WorkspaceScroll>
      <WorkspaceHeader
        title="Album"
        subtitle={
          isLoading
            ? 'Loading…'
            : `${filtered.length} generated ${filtered.length === 1 ? 'piece' : 'pieces'}`
        }
        actions={
          <>
            <div className="relative w-full sm:w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-ink-faint" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search prompts"
                className="pl-8"
              />
            </div>
            <Button variant="secondary" onClick={() => openTab({ kind: 'create', title: 'Create' })}>
              <Sparkles className="h-[13px] w-[13px]" />
              Generate
            </Button>
          </>
        }
      />

      {models.length > 1 && (
        <div className="-mx-1 mb-6 flex flex-wrap gap-1.5 px-1">
          <FilterChip active={model === 'all'} onClick={() => setModel('all')}>
            All models
          </FilterChip>
          {models.map(([name, count]) => (
            <FilterChip key={name} active={model === name} onClick={() => setModel(name)}>
              {shortModel(name)}
              <span className="text-ink-faint"> {count}</span>
            </FilterChip>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Images}
          title={query || model !== 'all' ? 'Nothing matched.' : 'The album is empty.'}
          line={
            query || model !== 'all'
              ? 'Try a different model, or a word from the prompt.'
              : 'Everything you generate is kept here automatically, with the prompt that made it.'
          }
        />
      ) : (
        <div className="space-y-10">
          {days.map(([day, rows]) => (
            <section key={day}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                  {day}
                </h2>
                <span className="h-px flex-1 bg-line" />
                <span className="text-[11.5px] text-ink-faint">{rows.length}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {rows.map((asset) => (
                  <AlbumTile key={asset.id} asset={asset} onOpen={() => preview(asset.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </WorkspaceScroll>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-[5px] text-[12px] transition-colors duration-150',
        active
          ? 'border-ink bg-ink text-canvas'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function AlbumTile({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  const client = useQueryClient()

  const remove = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('That image could not be removed.')
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Removed from the album.')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const prompt = asset.generation?.prompt

  return (
    <figure className="group relative">
      <button
        onClick={onOpen}
        className="block aspect-square w-full overflow-hidden rounded-[11px] border border-line bg-subtle"
      >
        {asset.kind === 'video' ? (
          <video src={asset.url} className="h-full w-full object-cover" muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbnailUrl ?? asset.url}
            alt={prompt ?? asset.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}
      </button>

      <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {prompt && (
          <Tooltip content="Copy prompt">
            <button
              onClick={() => {
                void copyText(prompt)
                toast.success('Prompt copied.')
              }}
              className="pointer-events-auto flex h-[24px] w-[24px] items-center justify-center rounded-[7px] bg-black/55 text-white backdrop-blur-sm"
              aria-label="Copy prompt"
            >
              <Copy className="h-[12px] w-[12px]" />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Download">
          <button
            onClick={() => window.open(asset.url, '_blank')}
            className="pointer-events-auto flex h-[24px] w-[24px] items-center justify-center rounded-[7px] bg-black/55 text-white backdrop-blur-sm"
            aria-label="Download"
          >
            <Download className="h-[12px] w-[12px]" />
          </button>
        </Tooltip>
        <Tooltip content="Remove">
          <button
            onClick={() => remove.mutate()}
            className="pointer-events-auto flex h-[24px] w-[24px] items-center justify-center rounded-[7px] bg-black/55 text-white backdrop-blur-sm"
            aria-label="Remove"
          >
            <Trash2 className="h-[12px] w-[12px]" />
          </button>
        </Tooltip>
      </div>

      {/* The prompt is the caption. It is what the image is, and what you would
          copy to make another one like it. */}
      <figcaption className="mt-2 px-0.5">
        <p className="line-clamp-2 text-[12px] leading-[1.45] text-ink-muted">
          {prompt ?? asset.name}
        </p>
        <p className="mt-1 truncate text-[11px] text-ink-faint">
          {[
            asset.model ? shortModel(asset.model) : null,
            asset.providerId ? providerLabel(asset.providerId) : null,
            relativeTime(asset.createdAt),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </figcaption>
    </figure>
  )
}

/** `soul-2/generate` reads as `soul-2` in a chip; the workflow is noise here. */
function shortModel(model: string): string {
  return model.includes('/') ? model.slice(0, model.indexOf('/')) : model
}

const DAY = 86_400_000

function groupByDay(assets: Asset[]): [string, Asset[]][] {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const today = midnight.getTime()

  const groups = new Map<string, Asset[]>()
  for (const asset of [...assets].sort((a, b) => b.createdAt - a.createdAt)) {
    const at = asset.createdAt
    const label =
      at >= today
        ? 'Today'
        : at >= today - DAY
          ? 'Yesterday'
          : new Date(at).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
            })
    const bucket = groups.get(label)
    if (bucket) bucket.push(asset)
    else groups.set(label, [asset])
  }
  return [...groups.entries()]
}
