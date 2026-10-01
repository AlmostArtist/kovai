'use client'

import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, ImagePlus, Loader2, Sparkles, Wand2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, EmptyState, Select, Spinner } from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { ErrorState } from './error-state'
import { TemplateCanvas, DEFAULT_LAYER, type Layer } from './template-canvas'
import { toCss } from '@/lib/templates/gradient'
import { useJobs, isJobActive } from '@/store/jobs'
import { useSettings } from '@/store/settings'
import { useWorkspace, type Tab } from '@/store/workspace'
import { cn, fileToDataUrl } from '@/lib/utils'
import type { PublicTemplate } from '@/lib/templates/types'
import type { SerializedJob } from '@/lib/jobs/manager'
import type { SerializedProviderError } from '@/lib/providers/types'

/**
 * Templates.
 *
 * A template is a finished result with the decisions that actually matter
 * left open. The user picks a photograph, a look and a backdrop; everything
 * else — which model, what it is asked, how the subject is lifted out and
 * reassembled — belongs to the template and is never shown, because none of
 * it is a choice anyone benefits from making.
 */
export function TemplatesWorkspace({ tab }: { tab: Tab }) {
  const patchState = useWorkspace((s) => s.patchState)
  const openId = tab.state.templateId as string | undefined

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await fetch('/api/templates')
      const body = (await res.json()) as { templates?: PublicTemplate[]; error?: { message: string } }
      if (!res.ok || !body.templates) throw new Error(body.error?.message ?? 'Templates failed to load.')
      return body.templates
    },
    staleTime: 60_000,
  })

  const open = data?.find((t) => t.id === openId)

  if (open) {
    return (
      <TemplateRunner
        tab={tab}
        template={open}
        onBack={() => patchState(tab.id, { templateId: undefined })}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <WorkspaceScroll>
        <div className="px-4 py-5 md:px-8 md:py-7">
          <WorkspaceHeader
            title="Templates"
            subtitle="Finished pieces of work with the choices left in"
          />
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : error ? (
            <ErrorState
              error={{ code: 'PROVIDER_ERROR', message: (error as Error).message, retryable: true }}
              onRetry={() => void refetch()}
            />
          ) : !data?.length ? (
            <EmptyState icon={Wand2} title="No templates yet." line="They will appear here." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onOpen={() => patchState(tab.id, { templateId: template.id })}
                />
              ))}
            </div>
          )}
        </div>
      </WorkspaceScroll>
    </div>
  )
}

function TemplateCard({ template, onOpen }: { template: PublicTemplate; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group overflow-hidden rounded-[16px] border border-line bg-surface text-left transition-all duration-200 hover:border-line-strong hover:shadow-panel"
    >
      <div
        className="relative h-[164px] w-full overflow-hidden"
        style={{ background: toCss(template.cover) }}
      >
        {/* The styles the template offers, as a stack of chips — the quickest
            honest summary of what it does. */}
        <div className="absolute inset-0 flex flex-wrap content-end gap-1.5 p-3.5">
          {template.styles.slice(0, 5).map((style) => (
            <span
              key={style.id}
              className="rounded-full bg-black/30 px-2 py-[3px] text-[10.5px] font-medium text-white backdrop-blur-[2px]"
            >
              {style.label}
            </span>
          ))}
          {template.styles.length > 5 && (
            <span className="rounded-full bg-black/30 px-2 py-[3px] text-[10.5px] font-medium text-white backdrop-blur-[2px]">
              +{template.styles.length - 5}
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-medium tracking-[-0.01em] text-ink">{template.name}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{template.tagline}</p>
          </div>
          <ChevronRight className="mt-1 h-[15px] w-[15px] shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
        </div>

        <ol className="mt-3 space-y-1">
          {template.steps.map((step, index) => (
            <li key={step} className="flex items-baseline gap-2 text-[11.5px] text-ink-faint">
              <span className="tabular-nums text-ink-muted">{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </button>
  )
}

/* ── Running one ────────────────────────────────────────────── */

function TemplateRunner({
  tab,
  template,
  onBack,
}: {
  tab: Tab
  template: PublicTemplate
  onBack: () => void
}) {
  const privacy = useSettings((s) => s.privacy)
  const activeProjectId = useSettings((s) => s.activeProjectId)
  const addJob = useJobs((s) => s.add)
  const jobs = useJobs((s) => s.jobs)
  const fileRef = useRef<HTMLInputElement>(null)

  const [photo, setPhoto] = useState<{ url: string; preview: string } | null>(null)
  const [styleId, setStyleId] = useState(template.styles[0]?.id ?? '')
  const [backgroundId, setBackgroundId] = useState(template.backgrounds[0]?.id ?? '')
  const [jobId, setJobId] = useState<string | null>(null)
  const [layer, setLayer] = useState<Layer>(DEFAULT_LAYER)
  const [starting, setStarting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<SerializedProviderError | null>(null)

  const job = jobId ? jobs[jobId] : undefined
  const running = job ? isJobActive(job) : false
  const output = job?.outputs?.[0]?.url
  const background = template.backgrounds.find((b) => b.id === backgroundId) ?? template.backgrounds[0]

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('That is not an image.')
      return
    }
    setUploading(true)
    try {
      const preview = await fileToDataUrl(file)

      // The model has to be able to fetch the photograph, so in online mode it
      // is uploaded and referenced absolutely. In private mode there is no
      // upload and no template run — which the Generate button says plainly
      // rather than failing here.
      if (privacy === 'PRIVATE') {
        setPhoto({ url: '', preview })
        return
      }

      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const body = (await res.json()) as { url?: string; error?: { message: string } }
      if (!res.ok || !body.url) {
        toast.error(body.error?.message ?? 'That photo could not be used.')
        return
      }
      setPhoto({ url: new URL(body.url, window.location.origin).toString(), preview })
    } catch {
      toast.error('That photo could not be read.')
    } finally {
      setUploading(false)
    }
  }

  const run = async () => {
    if (!photo?.url) return
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/templates/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          styleId,
          imageUrl: photo.url,
          tabId: tab.id,
          projectId: activeProjectId ?? undefined,
        }),
      })
      const body = (await res.json()) as { job?: SerializedJob; error?: SerializedProviderError }
      if (!res.ok || !body.job) {
        setError(
          body.error ?? { code: 'PROVIDER_ERROR', message: 'That could not be started.', retryable: true },
        )
        return
      }
      addJob(body.job)
      setJobId(body.job.id)
      setLayer(DEFAULT_LAYER)
    } catch {
      setError({ code: 'NETWORK', message: 'The request never left the browser.', retryable: true })
    } finally {
      setStarting(false)
    }
  }

  const style = template.styles.find((s) => s.id === styleId)
  const blocked = privacy === 'PRIVATE'

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line px-4 py-3.5 md:px-6">
        <WorkspaceHeader
          className="mb-0"
          title={template.name}
          subtitle={template.tagline}
          actions={
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-[13px] w-[13px]" />
              All templates
            </Button>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* The three decisions. */}
        <div className="min-h-0 shrink-0 overflow-y-auto border-line lg:w-[360px] lg:border-r">
          <div className="space-y-5 px-4 py-5 md:px-6">
            <Field index={1} label="Your photo" hint={template.inputHint}>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void upload(file)
                  e.target.value = ''
                }}
              />
              {photo ? (
                <div className="relative overflow-hidden rounded-[12px] border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt="" className="h-[180px] w-full object-cover" />
                  <button
                    onClick={() => setPhoto(null)}
                    aria-label="Remove photo"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-[2px]"
                  >
                    <X className="h-[13px] w-[13px]" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-[132px] w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <ImagePlus className="h-5 w-5" />
                      <span className="text-[12.5px]">Choose a photo</span>
                    </>
                  )}
                </button>
              )}
            </Field>

            <Field index={2} label="Style" hint={style?.hint ?? 'How it should be drawn'}>
              <Select value={styleId} onChange={(e) => setStyleId(e.target.value)} className="w-full">
                {template.styles.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field index={3} label="Background" hint="Changeable afterwards, so this is not final">
              <div className="grid grid-cols-4 gap-2">
                {template.backgrounds.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setBackgroundId(entry.id)}
                    title={entry.label}
                    aria-label={entry.label}
                    aria-pressed={entry.id === backgroundId}
                    className={cn(
                      'h-[52px] rounded-[9px] border-2 transition-all',
                      entry.id === backgroundId
                        ? 'border-ink scale-[1.03]'
                        : 'border-transparent hover:border-line-strong',
                    )}
                    style={{ background: toCss(entry.spec) }}
                  />
                ))}
              </div>
            </Field>

            {error && <ErrorState error={error} onRetry={() => void run()} />}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={!photo?.url || !styleId || starting || running || blocked}
              onClick={() => void run()}
            >
              {running ? (
                <>
                  <Loader2 className="h-[14px] w-[14px] animate-spin" />
                  {job?.phase === 'GENERATING' ? `Drawing… ${job.progress}%` : 'Starting…'}
                </>
              ) : (
                <>
                  <Sparkles className="h-[14px] w-[14px]" />
                  {output ? 'Generate again' : 'Generate'}
                </>
              )}
            </Button>

            {blocked && (
              <p className="text-[11.5px] leading-relaxed text-warn">
                This template runs on a cloud model, so it is unavailable in private mode. Switch to
                online mode to use it.
              </p>
            )}
          </div>
        </div>

        {/* The result. */}
        <div className="flex min-h-0 flex-1 flex-col bg-canvas p-4 md:p-6">
          {output ? (
            <TemplateCanvas
              subjectUrl={output}
              background={background.spec}
              layer={layer}
              onLayerChange={setLayer}
              onReplace={() => fileRef.current?.click()}
              fileName={`${template.id}-${styleId}`}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={Wand2}
                title={running ? 'Working…' : 'Nothing made yet.'}
                line={
                  running
                    ? 'The portrait is being drawn. You can leave this tab — it will be here.'
                    : 'Pick a photo, a style and a background, then generate.'
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** One numbered decision. */
function Field({
  index,
  label,
  hint,
  children,
}: {
  index: number
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-subtle text-[10.5px] font-medium tabular-nums text-ink-muted">
          {index}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{label}</p>
          <p className="text-[11.5px] leading-snug text-ink-faint">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
