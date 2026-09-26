'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUpRight,
  Copy,
  Download,
  GalleryVerticalEnd,
  History,
  ImagePlus,
  Layers,
  Maximize2,
  Plug,
  Plus,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button, EmptyState, ProgressLine, Segmented, Textarea, Tooltip } from '@/components/ui'
import { ModelSelector } from './model-selector'
import { ParamControls, defaultsFor, referenceLimit } from './param-controls'
import { ErrorState } from './error-state'
import { useModels } from '@/hooks/use-models'
import { useGeneration } from '@/hooks/use-generation'
import { jobsForTab, useJobs } from '@/store/jobs'
import { useUI } from '@/store/ui'
import { useWorkspace, type Tab } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { cn, copyText, fileToDataUrl, formatCost, modKey, relativeTime, truncate } from '@/lib/utils'
import { providerLabel } from '@/lib/providers/descriptors'
import type { ModelChoice } from '@/lib/providers/types'
import type { SerializedJob } from '@/lib/jobs/manager'

interface CreateState {
  prompt: string
  model: ModelChoice | null
  params: Record<string, unknown>
  references: string[]
  selectedJobId: string | null
  panel: 'settings' | 'history'
}

const PHASE_COPY: Record<string, string> = {
  PREPARING: 'Preparing',
  GENERATING: 'Generating',
  FINALIZING: 'Finalizing',
  DONE: 'Complete',
}

/**
 * The image workspace.
 *
 * Prompt on the left, the work in the middle, controls on the right. Generation
 * is asynchronous end to end: pressing Generate returns a job, the canvas shows
 * its progress, and nothing here blocks — close the tab and it still finishes.
 */
export function CreateWorkspace({ tab }: { tab: Tab }) {
  const state = tab.state as Partial<CreateState>
  const patchState = useWorkspace((s) => s.patchState)
  const openTab = useWorkspace((s) => s.openTab)
  const patch = useCallback((next: Partial<CreateState>) => patchState(tab.id, next), [patchState, tab.id])

  // Which of the three the phone is showing. Local rather than tab state: it
  // describes the size of the window, not the work, and restoring "you were
  // looking at the canvas" on a desktop that shows all three is meaningless.
  const [view, setView] = useState<'prompt' | 'canvas' | 'panel'>('prompt')

  const prompt = state.prompt ?? ''
  const params = state.params ?? {}
  const references = state.references ?? []
  const panel = state.panel ?? 'settings'

  const { data: catalogue } = useModels('IMAGE_GENERATION')
  const models = catalogue?.models ?? []
  const imageProviders = useMemo(
    () => [...new Set(models.map((m) => m.providerId))],
    [models],
  )

  // Remember the last model per tab; fall back to the first available one.
  const model = state.model ?? (models[0] ? { providerId: models[0].providerId, modelId: models[0].id } : null)
  const selectedModel = models.find((m) => m.providerId === model?.providerId && m.id === model?.modelId)
  const refSpec = referenceLimit(selectedModel?.params)

  const { generate, error, clearError, submitting } = useGeneration(tab.id)
  const allJobs = useJobs((s) => s.jobs)
  const jobs = useMemo(() => jobsForTab(allJobs, tab.id), [allJobs, tab.id])
  const cancel = useJobs((s) => s.cancel)

  const activeJob = jobs.find((j) => ['QUEUED', 'RUNNING'].includes(j.status))
  const selectedJob =
    jobs.find((j) => j.id === state.selectedJobId) ?? activeJob ?? jobs.find((j) => j.status === 'COMPLETED')

  // Applying a model's declared defaults keeps the controls honest when the
  // selection changes between providers with different capabilities.
  const lastModelKey = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedModel) return
    const key = `${selectedModel.providerId}:${selectedModel.id}`
    if (lastModelKey.current === key) return
    lastModelKey.current = key
    patch({ params: { ...defaultsFor(selectedModel.params), ...params } })
  }, [selectedModel, patch, params])

  const run = async () => {
    if (!model || !prompt.trim()) return
    clearError()
    const job = await generate({
      providerId: model.providerId,
      model: model.modelId,
      prompt: prompt.trim(),
      params,
      referenceImages: references.length ? references : undefined,
      kind: selectedModel?.capabilities.includes('VIDEO_GENERATION') ? 'video' : 'image',
    })
    if (job) patch({ selectedJobId: job.id })
  }

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void run()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    /*
      Three columns on a desktop — write, look, adjust — and on a phone the
      same three as one screen at a time. They are not stacked: a prompt box
      above a canvas above a settings panel would put the generate button a
      scroll away from the image it produces, which is the one relationship
      this workspace is built around.
    */
    <div className="flex h-full flex-col md:flex-row">
      <div className="flex shrink-0 border-b border-line bg-surface p-1.5 md:hidden">
        <Segmented
          className="w-full"
          value={view}
          onChange={setView}
          options={[
            { value: 'prompt', label: 'Prompt' },
            { value: 'canvas', label: 'Canvas' },
            { value: 'panel', label: 'Adjust' },
          ]}
        />
      </div>

      {/* Prompt column */}
      <div
        className={cn(
          'flex min-h-0 flex-col border-line bg-surface md:w-[336px] md:shrink-0 md:border-r',
          view === 'prompt' ? 'flex-1 md:flex-none' : 'hidden md:flex',
        )}
      >
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line px-4">
          <Sparkles className="h-[14px] w-[14px] text-ink-faint" />
          <span className="text-[13px] font-medium">Create</span>
          {imageProviders.length > 1 && (
            <Segmented
              size="sm"
              className="ml-auto"
              value={model?.providerId ?? imageProviders[0]}
              onChange={(providerId) => {
                const next = models.find((m) => m.providerId === providerId)
                if (next) patch({ model: { providerId: next.providerId, modelId: next.id }, params: defaultsFor(next.params) })
              }}
              options={imageProviders.map((id) => ({ value: id, label: providerLabel(id) }))}
            />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ReferenceStrip
            references={references}
            spec={refSpec}
            onChange={(references) => patch({ references })}
          />

          <Textarea
            value={prompt}
            onChange={(e) => patch({ prompt: e.target.value })}
            rows={7}
            placeholder="Describe the image. Subject, setting, light, lens, mood…"
            className="mt-3 min-h-[148px] text-[13.5px] leading-[1.6]"
          />

          <div className="mt-2 flex items-center justify-between">
            <ModelSelector
              capability="IMAGE_GENERATION"
              value={model}
              onChange={(choice) => {
                const next = models.find((m) => m.providerId === choice?.providerId && m.id === choice?.modelId)
                patch({ model: choice, params: next ? defaultsFor(next.params) : {} })
              }}
              compact
            />
            <span className="text-[11px] text-ink-faint">{prompt.trim().length} chars</span>
          </div>

          {error && (
            <ErrorState
              error={error}
              className="mt-3"
              compact
              onRetry={() => void run()}
              onChangeModel={() => clearError()}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-line p-3">
          {activeJob ? (
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => void cancel(activeJob.id)}
            >
              Cancel generation
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!model || !prompt.trim() || submitting}
              onClick={() => {
                // A phone only shows one of the three, so starting a
                // generation from the prompt view has to move you to the one
                // the picture will arrive on. Otherwise the button appears to
                // do nothing at all.
                setView('canvas')
                void run()
              }}
            >
              {submitting ? 'Starting…' : 'Generate'}
              <span className="ml-1 text-[11px] opacity-60">{modKey()}↵</span>
            </Button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div
        className={cn(
          'min-w-0 flex-1 overflow-y-auto bg-canvas',
          view === 'canvas' ? '' : 'hidden md:block',
        )}
      >
        <Canvas
          job={selectedJob}
          hasProvider={models.length > 0}
          onUseAsReference={(url) => patch({ references: [...references, url] })}
          onReuse={(job) => patch({ prompt: job.prompt, params: job.params })}
        />
      </div>

      {/* Settings / history */}
      <div
        className={cn(
          'flex min-h-0 flex-col border-line bg-surface md:w-[300px] md:shrink-0 md:border-l',
          view === 'panel' ? 'flex-1 md:flex-none' : 'hidden md:flex',
        )}
      >
        <div className="flex h-[46px] shrink-0 items-center px-3">
          <Segmented
            size="sm"
            value={panel}
            onChange={(panel) => patch({ panel })}
            options={[
              { value: 'settings', label: 'Settings' },
              { value: 'history', label: 'History' },
            ]}
          />

          {/* This tab's history is only this tab's. The album is everything
              KOVAI has ever made, which is what "where did that one go" means. */}
          <Tooltip content="Open the album">
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              onClick={() => openTab({ kind: 'album', title: 'Album' })}
              aria-label="Open the album"
            >
              <GalleryVerticalEnd className="h-[14px] w-[14px]" />
            </Button>
          </Tooltip>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-line p-4">
          {panel === 'settings' ? (
            selectedModel ? (
              <>
                <div className="mb-4 rounded-[10px] border border-line bg-subtle p-3">
                  <p className="text-[12.5px] font-medium text-ink">{selectedModel.name}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint">
                    {selectedModel.description ?? providerLabel(selectedModel.providerId)}
                  </p>
                </div>
                <ParamControls
                  params={selectedModel.params ?? []}
                  values={params}
                  onChange={(params) => patch({ params })}
                />
              </>
            ) : (
              <p className="text-[12.5px] text-ink-faint">Select a model to see its controls.</p>
            )
          ) : (
            <HistoryList
              jobs={jobs}
              selectedId={selectedJob?.id}
              onSelect={(id) => patch({ selectedJobId: id })}
              onReuse={(job) => patch({ prompt: job.prompt, params: job.params, model: { providerId: job.providerId, modelId: job.model } })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ReferenceStrip({
  references,
  spec,
  onChange,
}: {
  references: string[]
  spec: { max: number; label: string } | null
  onChange: (references: string[]) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const privacy = useSettings((s) => s.privacy)
  if (!spec) return null

  const add = async (files: FileList | File[]) => {
    const room = spec.max - references.length
    if (room <= 0) {
      toast.error(`This model takes at most ${spec.max} reference image${spec.max === 1 ? '' : 's'}.`)
      return
    }
    const next: string[] = []
    for (const file of [...files].filter((f) => f.type.startsWith('image/')).slice(0, room)) {
      try {
        if (privacy === 'PRIVATE') {
          next.push(await fileToDataUrl(file))
        } else {
          const form = new FormData()
          form.append('file', file)
          const res = await fetch('/api/upload', { method: 'POST', body: form })
          const body = (await res.json()) as { url?: string; error?: { message: string } }
          if (!res.ok || !body.url) {
            toast.error(body.error?.message ?? 'That image could not be used.')
            continue
          }
          // Cloud providers need a reachable URL, so references are uploaded and
          // referenced absolutely.
          next.push(new URL(body.url, window.location.origin).toString())
        }
      } catch {
        toast.error('That image could not be read.')
      }
    }
    if (next.length) onChange([...references, ...next])
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-ink">{spec.label}</span>
        <span className="text-[11px] text-ink-faint">
          {references.length}/{spec.max}
        </span>
      </div>

      <div
        className="flex flex-wrap gap-2 rounded-[10px] border border-dashed border-line p-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void add(e.dataTransfer.files)
        }}
        onPaste={(e) => {
          if (e.clipboardData.files.length) void add(e.clipboardData.files)
        }}
      >
        {references.map((url, index) => (
          <div
            key={`${url}-${index}`}
            className="group relative h-[56px] w-[56px] overflow-hidden rounded-[8px] border border-line"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
            <button
              onClick={() => onChange(references.filter((_, i) => i !== index))}
              className="absolute right-0.5 top-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove reference"
            >
              <X className="h-[8px] w-[8px]" />
            </button>
          </div>
        ))}

        {references.length < spec.max && (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-[56px] w-[56px] items-center justify-center rounded-[8px] border border-line bg-subtle text-ink-faint transition-colors hover:text-ink"
            aria-label="Add reference image"
          >
            <Plus className="h-[14px] w-[14px]" />
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

function Canvas({
  job,
  hasProvider,
  onUseAsReference,
  onReuse,
}: {
  job: SerializedJob | undefined
  hasProvider: boolean
  onUseAsReference: (url: string) => void
  onReuse: (job: SerializedJob) => void
}) {
  const preview = useUI((s) => s.preview)
  const openTab = useWorkspace((s) => s.openTab)
  const [index, setIndex] = useState(0)
  const running = job && ['QUEUED', 'RUNNING'].includes(job.status)

  useEffect(() => setIndex(0), [job?.id])

  // Nothing can be generated until a provider exists, so say that rather than
  // showing an empty gallery the Generate button could never fill.
  if (!job && !hasProvider) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={Plug}
          title="No image provider is connected."
          line="Higgsfield handles image generation; KIE adds edits and video. Add credentials to start creating."
          action={
            <Button
              variant="primary"
              size="md"
              onClick={() => openTab({ kind: 'settings', title: 'Settings', state: { section: 'providers' } })}
            >
              Connect a provider
            </Button>
          }
        />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={ImagePlus}
          title="Nothing generated yet."
          line="Write a prompt and press Generate. You can keep working while it runs."
        />
      </div>
    )
  }

  if (running) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-5 md:px-8">
        <div className="w-full max-w-[520px]">
          <div className="aspect-[16/10] w-full rounded-[14px] border border-line shimmer" />
          <div className="mt-5 flex items-center gap-3">
            <span className="text-[13px] font-medium text-ink">{PHASE_COPY[job.phase]}</span>
            <ProgressLine value={job.progress} className="flex-1" />
            <span className="w-[34px] text-right font-mono text-[12px] tabular-nums text-ink-faint">
              {Math.round(job.progress)}%
            </span>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">
            {providerLabel(job.providerId)} · {job.model} — you can switch tabs; this keeps running.
          </p>
        </div>
      </div>
    )
  }

  if (job.status === 'FAILED' && job.error) {
    return (
      <div className="flex h-full items-center justify-center px-5 md:px-8">
        <ErrorState error={job.error} className="w-full max-w-[460px]" />
      </div>
    )
  }

  if (job.status === 'CANCELLED') {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={X} title="Generation cancelled." line="Nothing was produced for this run." />
      </div>
    )
  }

  const output = job.outputs[index]
  if (!output) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={ImagePlus} title="No output was returned." />
      </div>
    )
  }

  return (
    <motion.div
      key={job.id}
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="pb-safe mx-auto flex h-full max-w-[880px] flex-col px-4 py-5 md:px-8 md:py-7"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {output.type === 'video' ? (
          <video
            src={output.url}
            controls
            className="max-h-full max-w-full rounded-[13px] border border-line"
          />
        ) : (
          <button onClick={() => preview(`job:${job.id}:${index}`)} className="min-h-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={output.url}
              alt={job.prompt}
              className="max-h-full max-w-full rounded-[13px] border border-line object-contain shadow-panel"
            />
          </button>
        )}
      </div>

      {job.outputs.length > 1 && (
        <div className="mt-4 flex shrink-0 justify-center gap-2">
          {job.outputs.map((out, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={cn(
                'h-[46px] w-[46px] overflow-hidden rounded-[8px] border transition-all duration-150',
                i === index ? 'border-ink' : 'border-line opacity-60 hover:opacity-100',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={out.url} alt={`Result ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => window.open(output.url, '_blank')}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onUseAsReference(output.url)}>
            <Layers className="h-3.5 w-3.5" />
            Use as reference
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onReuse(job)}>
            <Wand2 className="h-3.5 w-3.5" />
            Reuse settings
          </Button>
          <Tooltip content="Copy prompt">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void copyText(job.prompt)
                toast.success('Prompt copied')
              }}
              aria-label="Copy prompt"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Open full size">
            <Button variant="ghost" size="icon" onClick={() => preview(`job:${job.id}:${index}`)} aria-label="Open full size">
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>

          <div className="ml-auto flex items-center gap-2 text-[11.5px] text-ink-faint">
            <span>{providerLabel(job.providerId)}</span>
            <span>·</span>
            <span>{job.model}</span>
            {typeof job.params.aspectRatio === 'string' && (
              <>
                <span>·</span>
                <span>{job.params.aspectRatio}</span>
              </>
            )}
            <span>·</span>
            <span>{formatCost(job.costUsd)}</span>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
          {job.prompt}
        </p>
      </div>
    </motion.div>
  )
}

function HistoryList({
  jobs,
  selectedId,
  onSelect,
  onReuse,
}: {
  jobs: SerializedJob[]
  selectedId?: string
  onSelect: (id: string) => void
  onReuse: (job: SerializedJob) => void
}) {
  if (!jobs.length) {
    return (
      <EmptyState
        icon={History}
        title="No generations yet."
        line="Everything you make in this tab collects here with its settings."
        className="py-10"
      />
    )
  }

  return (
    <div className="space-y-1.5">
      <AnimatePresence initial={false}>
        {jobs.map((job) => (
          <motion.button
            key={job.id}
            layout
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onSelect(job.id)}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-[10px] border p-2 text-left transition-colors duration-150',
              job.id === selectedId
                ? 'border-line-strong bg-subtle'
                : 'border-line hover:bg-subtle',
            )}
          >
            <div className="h-[38px] w-[38px] shrink-0 overflow-hidden rounded-[7px] border border-line bg-subtle">
              {job.outputs[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={job.outputs[0].url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className={cn('h-full w-full', ['QUEUED', 'RUNNING'].includes(job.status) && 'shimmer')} />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] text-ink">{truncate(job.prompt, 34)}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                {job.model} · {relativeTime(job.createdAt)}
              </p>
            </div>

            <span
              onClick={(e) => {
                e.stopPropagation()
                onReuse(job)
              }}
              className="shrink-0 rounded-[5px] p-1 text-ink-faint transition-colors hover:text-ink"
              title="Reuse settings"
            >
              <ArrowUpRight className="h-[13px] w-[13px]" />
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
