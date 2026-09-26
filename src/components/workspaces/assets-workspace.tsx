'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Heart, Images, MoreHorizontal, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  EmptyState,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui'
import { WorkspaceHeader } from './workspace-surface'
import { AddAssetsDialog } from './add-assets-dialog'
import { useUI } from '@/store/ui'
import type { Tab } from '@/store/workspace'
import { cn, copyText, formatBytes, relativeTime } from '@/lib/utils'
import { providerLabel } from '@/lib/providers/descriptors'
import type { Asset } from '@/lib/db/types'

type Folder = 'all' | 'images' | 'videos' | 'references' | 'generated' | 'uploads' | 'favorites'

const FOLDERS: { id: Folder; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'images', label: 'Images' },
  { id: 'videos', label: 'Videos' },
  { id: 'references', label: 'References' },
  { id: 'generated', label: 'Generated' },
  { id: 'uploads', label: 'Uploads' },
  { id: 'favorites', label: 'Favorites' },
]

export function useAssets() {
  return useQuery({
    queryKey: ['assets', 'all'],
    queryFn: async () => ((await (await fetch('/api/assets')).json()) as { assets: Asset[] }).assets,
  })
}

/**
 * The asset library.
 *
 * Every generated image lands here automatically with the prompt, model, seed
 * and settings that produced it — so a result from three days ago is still
 * reproducible, and "use this as a reference" is one click.
 */
export function AssetsWorkspace({ tab }: { tab: Tab }) {
  const [folder, setFolder] = useState<Folder>((tab.state.folder as Folder) ?? 'all')
  const [query, setQuery] = useState('')
  const { data: assets, isLoading } = useAssets()
  const preview = useUI((s) => s.preview)
  const client = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [adding, setAdding] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // Files chosen or dropped are staged, not saved: the dialog is where they get
  // a name, a description and a home.
  const stage = useCallback((files: FileList | File[]) => {
    const list = [...files]
    if (list.length) setPendingFiles(list)
    setAdding(true)
  }, [])

  const filtered = useMemo(() => {
    let list = assets ?? []
    switch (folder) {
      case 'images':
        list = list.filter((a) => a.kind === 'image')
        break
      case 'videos':
        list = list.filter((a) => a.kind === 'video')
        break
      case 'references':
        list = list.filter((a) => a.origin === 'reference')
        break
      case 'generated':
        list = list.filter((a) => a.origin === 'generated')
        break
      case 'uploads':
        list = list.filter((a) => a.origin === 'upload')
        break
      case 'favorites':
        list = list.filter((a) => a.favorite)
        break
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((a) =>
        `${a.name} ${a.model ?? ''} ${a.generation?.prompt ?? ''}`.toLowerCase().includes(q),
      )
    }
    return list
  }, [assets, folder, query])

  return (
    <div className="flex h-full flex-col md:flex-row">
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false)
            setPendingFiles([])
          }
        }}
      >
        {adding && (
          <AddAssetsDialog
            initialFiles={pendingFiles}
            onClose={() => {
              setAdding(false)
              setPendingFiles([])
            }}
            onDone={() => {
              setAdding(false)
              setPendingFiles([])
              void client.invalidateQueries({ queryKey: ['assets'] })
            }}
          />
        )}
      </Dialog>

      <div className="shrink-0 border-b border-line bg-surface p-2 md:w-[180px] md:border-b-0 md:border-r md:p-3">
        <div className="flex flex-row gap-1 overflow-x-auto no-scrollbar md:block md:space-y-[1px]">
          {FOLDERS.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setFolder(entry.id)}
              className={cn(
                'flex h-[32px] shrink-0 items-center whitespace-nowrap rounded-[8px] px-3 text-left text-[13px] transition-colors duration-150 md:h-[30px] md:w-full md:px-2.5',
                folder === entry.id
                  ? 'bg-subtle font-medium text-ink'
                  : 'text-ink-muted hover:bg-subtle',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="relative min-w-0 flex-1 overflow-y-auto"
        data-drag-active={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          // Only clear when the pointer actually leaves the region.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          stage(e.dataTransfer.files)
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm"
          hidden
          onChange={(e) => {
            if (e.target.files) stage(e.target.files)
            e.target.value = ''
          }}
        />

        {dragging && (
          <div className="pointer-events-none absolute inset-4 z-10 flex items-center justify-center rounded-[16px] border-2 border-dashed border-accent/50 bg-accent-soft/60 backdrop-blur-sm">
            <p className="text-[13.5px] font-medium text-accent">Drop to add</p>
          </div>
        )}

        <div className="px-4 py-5 md:px-8 md:py-7">
          <WorkspaceHeader
            title="Assets"
            subtitle={`${filtered.length} item${filtered.length === 1 ? '' : 's'}`}
            actions={
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-ink-faint" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search assets"
                    className="w-full pl-8 sm:w-[220px]"
                  />
                </div>
                <Button variant="primary" size="sm" onClick={() => stage([])}>
                  <Upload className="h-3.5 w-3.5" />
                  Add assets
                </Button>
              </>
            }
          />

          {isLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-[11px] shimmer" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Images}
              title={query ? 'Nothing matched.' : 'Nothing here yet.'}
              line={
                query
                  ? 'Try a different search.'
                  : 'Drop images and video in from your computer, or generate them — everything lands here with its details.'
              }
              action={
                !query && (
                  <Button variant="primary" size="md" onClick={() => stage([])}>
                    <Upload className="h-3.5 w-3.5" />
                    Add from your computer
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(178px,1fr))] gap-3">
              {filtered.map((asset) => (
                <AssetCard key={asset.id} asset={asset} onOpen={() => preview(asset.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AssetCard({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  const client = useQueryClient()

  const update = useMutation({
    mutationFn: async (patch: Partial<Asset>) => {
      await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['assets'] }),
  })

  const remove = useMutation({
    mutationFn: async () => {
      await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['assets'] })
      toast.success('Asset removed')
    },
  })

  return (
    <div className="group relative">
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
            alt={asset.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}
      </button>

      <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <Tooltip content={asset.favorite ? 'Unfavourite' : 'Favourite'}>
          <button
            onClick={() => update.mutate({ favorite: !asset.favorite })}
            className="pointer-events-auto flex h-[24px] w-[24px] items-center justify-center rounded-[7px] bg-black/55 text-white backdrop-blur-sm"
            aria-label="Favourite"
          >
            <Heart className={cn('h-[12px] w-[12px]', asset.favorite && 'fill-current')} />
          </button>
        </Tooltip>

        <Popover>
          <PopoverTrigger asChild>
            <button
              className="pointer-events-auto flex h-[24px] w-[24px] items-center justify-center rounded-[7px] bg-black/55 text-white backdrop-blur-sm"
              aria-label="More"
            >
              <MoreHorizontal className="h-[12px] w-[12px]" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[160px]">
            <button
              onClick={() => window.open(asset.url, '_blank')}
              className="flex w-full items-center gap-2.5 rounded-[7px] px-2 py-[6px] text-left text-[12.5px] transition-colors hover:bg-subtle"
            >
              <Download className="h-[13px] w-[13px] text-ink-faint" />
              Download
            </button>
            {asset.generation?.prompt && (
              <button
                onClick={() => {
                  void copyText(asset.generation!.prompt)
                  toast.success('Prompt copied')
                }}
                className="flex w-full items-center gap-2.5 rounded-[7px] px-2 py-[6px] text-left text-[12.5px] transition-colors hover:bg-subtle"
              >
                <Images className="h-[13px] w-[13px] text-ink-faint" />
                Copy prompt
              </button>
            )}
            <div className="my-1 h-px bg-line" />
            <button
              onClick={() => remove.mutate()}
              className="flex w-full items-center gap-2.5 rounded-[7px] px-2 py-[6px] text-left text-[12.5px] text-danger transition-colors hover:bg-danger-soft"
            >
              <Trash2 className="h-[13px] w-[13px]" />
              Delete
            </button>
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-2 px-0.5">
        <p className="truncate text-[12.5px] text-ink">{asset.name}</p>
        <p className="mt-[1px] truncate text-[11px] text-ink-faint">
          {[asset.providerId ? providerLabel(asset.providerId) : asset.origin, asset.model, relativeTime(asset.createdAt)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}

export { formatBytes }


