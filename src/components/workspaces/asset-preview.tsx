'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui'
import { useAssets } from './assets-workspace'
import { useUI } from '@/store/ui'
import { useJobs } from '@/store/jobs'
import { copyText, formatBytes, formatCost, relativeTime } from '@/lib/utils'
import { providerLabel } from '@/lib/providers/descriptors'
import type { ProviderId } from '@/lib/providers/types'

interface PreviewData {
  url: string
  kind: 'image' | 'video'
  name: string
  providerId?: ProviderId
  model?: string
  prompt?: string
  seed?: number
  params?: Record<string, unknown>
  createdAt: number
  sizeBytes?: number
  width?: number
  height?: number
  costUsd?: number
  durationMs?: number
}

/**
 * Full-size preview with the complete provenance of a result: what made it,
 * from what prompt, with which settings. Everything needed to make it again.
 */
export function AssetPreview() {
  const id = useUI((s) => s.previewAssetId)
  const close = useUI((s) => s.preview)
  const { data: assets } = useAssets()
  const jobs = useJobs((s) => s.jobs)

  const data = resolve(id, assets, jobs)

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[70] flex bg-black/70 backdrop-blur-[3px]"
          onClick={() => close(null)}
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.99, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="m-auto flex max-h-[92svh] w-full flex-col overflow-hidden rounded-[16px] bg-elevated shadow-float md:max-h-[88vh] md:w-[min(1180px,92vw)] md:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex min-w-0 flex-1 items-center justify-center bg-subtle p-3 md:p-6">
              {data.kind === 'video' ? (
                <video src={data.url} controls className="max-h-[42svh] max-w-full rounded-[10px] md:max-h-[78vh]" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.url}
                  alt={data.name}
                  className="max-h-[42svh] max-w-full rounded-[10px] object-contain md:max-h-[78vh]"
                />
              )}
            </div>

            <aside className="flex min-h-0 shrink-0 flex-col border-line md:w-[304px] md:border-l">
              <div className="flex items-start gap-2 border-b border-line px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">{data.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint">
                    {relativeTime(data.createdAt)}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => close(null)} aria-label="Close">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {data.prompt && (
                  <div className="mb-4">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                      Prompt
                    </p>
                    <p className="text-[12.5px] leading-relaxed text-ink">{data.prompt}</p>
                  </div>
                )}

                <dl className="space-y-2">
                  <Row label="Provider" value={data.providerId ? providerLabel(data.providerId) : '—'} />
                  <Row label="Model" value={data.model ?? '—'} />
                  {data.seed !== undefined && <Row label="Seed" value={String(data.seed)} mono />}
                  {data.width && data.height && (
                    <Row label="Dimensions" value={`${data.width} × ${data.height}`} mono />
                  )}
                  {data.sizeBytes && <Row label="File size" value={formatBytes(data.sizeBytes)} mono />}
                  {data.durationMs && (
                    <Row label="Generation time" value={`${(data.durationMs / 1000).toFixed(1)}s`} mono />
                  )}
                  <Row
                    label="Cost"
                    value={data.providerId === 'local' ? 'Free' : formatCost(data.costUsd)}
                    mono
                  />
                  {Object.entries(data.params ?? {})
                    .filter(([, v]) => v !== undefined && v !== '' && v !== null)
                    .map(([key, value]) => (
                      <Row key={key} label={humanise(key)} value={String(value)} mono />
                    ))}
                </dl>
              </div>

              <div className="flex shrink-0 gap-1.5 border-t border-line p-3">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => window.open(data.url, '_blank')}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
                {data.prompt && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void copyText(data.prompt!)
                      toast.success('Prompt copied')
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </aside>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11.5px] text-ink-faint">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right text-[12px] text-ink-muted ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

function humanise(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
}

/** Preview works for a stored asset or for a job output that is not filed yet. */
function resolve(
  id: string | null,
  assets: { id: string }[] | undefined,
  jobs: Record<string, import('@/lib/jobs/manager').SerializedJob>,
): PreviewData | null {
  if (!id) return null

  if (id.startsWith('job:')) {
    const [, jobId, indexRaw] = id.split(':')
    const job = jobs[jobId]
    const output = job?.outputs[Number(indexRaw) || 0]
    if (!job || !output) return null
    return {
      url: output.url,
      kind: output.type,
      name: job.prompt.split(/\s+/).slice(0, 6).join(' ') || 'Generation',
      providerId: job.providerId,
      model: job.model,
      prompt: job.prompt,
      seed: output.seed ?? (job.params.seed as number | undefined),
      params: job.params,
      createdAt: job.createdAt,
      width: output.width,
      height: output.height,
      costUsd: job.costUsd,
      durationMs: job.completedAt ? job.completedAt - job.createdAt : undefined,
    }
  }

  const asset = (assets as import('@/lib/db/types').Asset[] | undefined)?.find((a) => a.id === id)
  if (!asset) return null
  return {
    url: asset.url,
    kind: asset.kind === 'video' ? 'video' : 'image',
    name: asset.name,
    providerId: asset.providerId,
    model: asset.model,
    prompt: asset.generation?.prompt,
    seed: asset.generation?.seed,
    params: asset.generation?.params,
    createdAt: asset.createdAt,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    costUsd: asset.generation?.costUsd,
    durationMs: asset.generation?.durationMs,
  }
}
