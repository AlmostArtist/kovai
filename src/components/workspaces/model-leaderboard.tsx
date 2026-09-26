'use client'

import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { Segmented } from '@/components/ui'
import { useModels } from '@/hooks/use-models'
import { isFreeModel, providerLabel } from '@/lib/providers/descriptors'
import { cn, formatNumber } from '@/lib/utils'
import type { AIModel, Capability } from '@/lib/providers/types'

/**
 * A leaderboard of the models KOVAI can actually reach.
 *
 * Deliberately *not* a quality ranking. There is no benchmark score in the
 * catalogue, and inventing one — or borrowing a leaderboard without its
 * methodology — would present opinion as measurement. What is measurable is
 * published: context window, input price, capabilities. The metric being sorted
 * on is always named, so the order can be argued with.
 */

type Filter = 'all' | 'chat' | 'vision' | 'reasoning' | 'image' | 'free' | 'local'
type Metric = 'context' | 'price'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'chat', label: 'Chat' },
  { value: 'vision', label: 'Vision' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'image', label: 'Image' },
  { value: 'free', label: 'Free' },
  { value: 'local', label: 'Local' },
]

const CAPABILITY: Partial<Record<Filter, Capability>> = {
  chat: 'CHAT',
  vision: 'VISION',
  reasoning: 'REASONING',
  image: 'IMAGE_GENERATION',
}

export function ModelLeaderboard() {
  const [filter, setFilter] = useState<Filter>('all')
  const [metric, setMetric] = useState<Metric>('context')
  const { data, isLoading } = useModels()

  const rows = useMemo(() => {
    let models = data?.models ?? []

    const capability = CAPABILITY[filter]
    if (capability) models = models.filter((m) => m.capabilities.includes(capability))
    if (filter === 'free') models = models.filter(isFreeModel)
    if (filter === 'local') models = models.filter((m) => m.providerId === 'local')

    const scored = models
      .map((model) => ({ model, value: valueFor(model, metric) }))
      .filter((row) => row.value !== null) as { model: AIModel; value: number }[]

    // Context: bigger first. Price: cheapest first, which is the useful order.
    scored.sort((a, b) => (metric === 'context' ? b.value - a.value : a.value - b.value))
    return scored.slice(0, 12)
  }, [data?.models, filter, metric])

  const max = Math.max(...rows.map((r) => r.value), 0)

  return (
    <section className="rounded-[14px] border border-line bg-surface p-5">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="text-[14px] font-medium tracking-[-0.01em] text-ink">Model leaderboard</h2>
        <Segmented
          size="sm"
          className="ml-auto"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'context', label: 'Context window' },
            { value: 'price', label: 'Input price' },
          ]}
        />
      </div>

      <p className="mb-3.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-muted">
        <Info className="mt-[2px] h-[12px] w-[12px] shrink-0 text-ink-faint" />
        Ranked by what providers publish — {metric === 'context' ? 'context window, largest first' : 'input price, cheapest first'}.
        Not a quality score: no benchmark data ships with these catalogues, and inventing one would be a guess dressed as a measurement.
      </p>

      <Segmented className="mb-4" value={filter} onChange={setFilter} options={FILTERS} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[30px] rounded-[8px] shimmer" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-ink-faint">
          Nothing matches, or the providers publish no {metric === 'context' ? 'context sizes' : 'prices'} for these models.
        </p>
      ) : (
        <ol className="space-y-[7px]">
          {rows.map((row, index) => {
            const width = max > 0 ? Math.max((row.value / max) * 100, 2) : 2
            const local = row.model.providerId === 'local'
            return (
              <li key={`${row.model.providerId}:${row.model.id}`} className="group">
                <div className="mb-[3px] flex items-baseline gap-2">
                  <span className="w-[16px] shrink-0 text-right font-mono text-[10.5px] text-ink-faint">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={row.model.id}>
                    {row.model.name}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-ink-faint">
                    {providerLabel(row.model.providerId)}
                  </span>
                  <span className="w-[76px] shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink-muted">
                    {label(row.value, metric)}
                  </span>
                </div>
                <div className="ml-[24px] h-[6px] overflow-hidden rounded-full bg-subtle">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', local ? 'bg-local' : 'bg-cloud')}
                    style={{ width: `${width}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function valueFor(model: AIModel, metric: Metric): number | null {
  if (metric === 'context') return model.contextLength ?? null
  // Local models are genuinely free; a cloud model with no published price is
  // unknown, and unknown is not zero.
  if (model.providerId === 'local') return 0
  const price = model.pricing?.inputPerMTok
  return typeof price === 'number' ? price : null
}

function label(value: number, metric: Metric): string {
  if (metric === 'context') return `${formatNumber(value)} tok`
  return value === 0 ? 'Free' : `$${value.toFixed(2)}/M`
}
