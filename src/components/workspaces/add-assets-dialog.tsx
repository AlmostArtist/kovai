'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FolderOpen, Plus, Shapes, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, DialogContent, Input, Select, Textarea } from '@/components/ui'
import { cn, formatBytes } from '@/lib/utils'
import type { Asset, Project } from '@/lib/db/types'

/**
 * The step before an import.
 *
 * Files dropped straight into a library arrive named `IMG_4821` with no context,
 * and nobody goes back to fix that later. Naming and filing them at the moment
 * of import costs seconds and is the only time the intent is still fresh.
 */

export interface PendingFile {
  file: File
  previewUrl: string
}

type Category = 'auto' | 'image' | 'video' | 'reference'

const CATEGORIES: { value: Category; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Decide from the file itself' },
  { value: 'image', label: 'Image', hint: 'Filed under Images' },
  { value: 'video', label: 'Video', hint: 'Filed under Videos' },
  { value: 'reference', label: 'Reference', hint: 'Material to generate from' },
]

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm'

export function AddAssetsDialog({
  initialFiles,
  onDone,
  onClose,
}: {
  initialFiles: File[]
  onDone: () => void
  onClose: () => void
}) {
  const [pending, setPending] = useState<PendingFile[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>('auto')
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => ((await (await fetch('/api/projects')).json()) as { projects: Project[] }).projects,
  })

  const add = useCallback((files: FileList | File[]) => {
    const accepted = [...files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
    const rejected = [...files].length - accepted.length
    if (rejected) toast.error(`${rejected} file${rejected === 1 ? '' : 's'} skipped — images and video only.`)
    if (!accepted.length) return

    setPending((current) => {
      const next = [
        ...current,
        ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]
      return next
    })
  }, [])

  useEffect(() => {
    if (initialFiles.length) add(initialFiles)
    // Only on mount: later drops go through `add` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The first file suggests a name, so the common case needs no typing.
  useEffect(() => {
    if (!name && pending.length === 1) {
      setName(pending[0].file.name.replace(/\.[^.]+$/, ''))
    }
  }, [pending, name])

  // Object URLs are a real leak if they are never revoked.
  useEffect(() => () => pending.forEach((p) => URL.revokeObjectURL(p.previewUrl)), [pending])

  const remove = (index: number) => {
    setPending((current) => {
      URL.revokeObjectURL(current[index].previewUrl)
      return current.filter((_, i) => i !== index)
    })
  }

  const save = async () => {
    if (!pending.length) return
    setSaving(true)

    let saved = 0
    const failures: string[] = []

    for (const [index, item] of pending.entries()) {
      try {
        const form = new FormData()
        form.append('file', item.file)
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        const body = (await res.json()) as {
          url?: string
          mimeType?: string
          sizeBytes?: number
          error?: { message: string }
        }
        if (!res.ok || !body.url) {
          failures.push(`${item.file.name}: ${body.error?.message ?? 'rejected'}`)
          continue
        }

        const isVideo = item.file.type.startsWith('video/')
        const kind = category === 'auto' || category === 'reference' ? (isVideo ? 'video' : 'image') : category
        const origin = category === 'reference' ? 'reference' : 'upload'
        const dimensions = isVideo ? null : await measure(body.url)

        // A single file keeps the typed name; a batch is numbered from it, so
        // the set stays identifiable instead of collapsing into duplicates.
        const base = name.trim() || item.file.name.replace(/\.[^.]+$/, '')
        const assetName = pending.length === 1 ? base : `${base} ${index + 1}`

        const payload: Partial<Asset> = {
          name: assetName,
          description: description.trim() || undefined,
          kind,
          url: body.url,
          origin,
          mimeType: body.mimeType ?? item.file.type,
          sizeBytes: body.sizeBytes ?? item.file.size,
          width: dimensions?.width,
          height: dimensions?.height,
          projectId: projectId || undefined,
        }

        await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        saved += 1
      } catch {
        failures.push(`${item.file.name}: could not be read`)
      }
    }

    setSaving(false)
    if (saved) toast.success(`Added ${saved} asset${saved === 1 ? '' : 's'}`)
    if (failures.length) {
      toast.error(`${failures.length} skipped`, {
        description: failures.slice(0, 3).join('\n'),
        duration: 7000,
      })
    }
    onDone()
  }

  const totalSize = pending.reduce((sum, p) => sum + p.file.size, 0)

  return (
    <DialogContent
      title="Add assets"
      description="Name and file them now — it is the only moment the context is still fresh."
      width="xl"
    >
      <div className="grid max-h-[70vh] grid-cols-1 gap-0 overflow-y-auto md:grid-cols-2">
        {/* Details */}
        <div className="space-y-3.5 border-line px-5 pb-5 md:border-r">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">Name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={pending.length === 1 ? 'My asset' : 'Base name for the set'}
            />
            {pending.length > 1 && (
              <p className="mt-1 text-[11px] text-ink-faint">
                {pending.length} files — each is numbered, “{(name.trim() || 'Asset')} 1”, “
                {(name.trim() || 'Asset')} 2”, and so on.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">Description</label>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this is, and what it is for"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">Category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} — {option.hint}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">Project</label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {(projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
              <FolderOpen className="h-[10px] w-[10px]" />
              Filed here and available to that project&rsquo;s work.
            </p>
          </div>
        </div>

        {/* Media */}
        <div className="px-5 pb-5">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              if (e.target.files) add(e.target.files)
              e.target.value = ''
            }}
          />

          <div className="mb-2 flex items-baseline justify-between">
            <label className="text-[12px] font-medium text-ink">Media</label>
            {pending.length > 0 && (
              <span className="text-[11px] text-ink-faint">
                {pending.length} file{pending.length === 1 ? '' : 's'} · {formatBytes(totalSize)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                add(e.dataTransfer.files)
              }}
              className={cn(
                'flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed transition-colors',
                dragging ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong hover:bg-subtle',
              )}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface">
                <Plus className="h-[13px] w-[13px] text-ink-faint" />
              </span>
              <span className="px-2 text-center text-[11px] leading-tight text-ink-muted">
                Drag &amp; drop or click
              </span>
            </button>

            {pending.map((item, index) => (
              <div
                key={item.previewUrl}
                className="group relative aspect-square overflow-hidden rounded-[12px] border border-line bg-subtle"
              >
                {item.file.type.startsWith('video/') ? (
                  <video src={item.previewUrl} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                )}
                <button
                  onClick={() => remove(index)}
                  className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X className="h-[10px] w-[10px]" />
                </button>
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white">
                  {item.file.name}
                </span>
              </div>
            ))}
          </div>

          {pending.length === 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-faint">
              <Shapes className="mt-[2px] h-[11px] w-[11px] shrink-0" />
              PNG, JPEG, WebP, GIF, AVIF, MP4 and WebM. Files are checked by their contents, not their
              extension.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line px-5 py-3">
        <span className="text-[11.5px] text-ink-faint">
          {pending.length === 0 ? 'Add at least one file.' : 'Saved to your asset library.'}
        </span>
        <Button variant="ghost" size="md" className="ml-auto" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="md" disabled={!pending.length || saving} onClick={() => void save()}>
          {saving
            ? 'Adding…'
            : `Add ${pending.length || ''} ${pending.length === 1 ? 'asset' : 'assets'}`.trim()}
        </Button>
      </div>
    </DialogContent>
  )
}

/** Reads real dimensions so the metadata is measured, not guessed. */
function measure(url: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new window.Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = url
  })
}
