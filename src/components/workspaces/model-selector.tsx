'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Cpu, Search, TriangleAlert } from 'lucide-react'
import { Badge, Popover, PopoverContent, PopoverTrigger } from '@/components/ui'
import { useModels } from '@/hooks/use-models'
import { useSettings } from '@/store/settings'
import { cn, formatBytes, formatNumber } from '@/lib/utils'
import { isFreeModel, providerLabel } from '@/lib/providers/descriptors'
import type { AIModel, Capability, ModelChoice } from '@/lib/providers/types'

/**
 * Model selection.
 *
 * The list is whatever KOVAI can actually reach right now — installed local
 * models and live cloud catalogues. In private mode cloud models are simply not
 * in it. Providers that could not be reached are named at the bottom instead of
 * silently vanishing.
 */
export function ModelSelector({
  capability,
  value,
  onChange,
  align = 'start',
  className,
  compact,
}: {
  capability: Capability
  value: ModelChoice | null
  onChange: (choice: ModelChoice | null) => void
  align?: 'start' | 'end'
  className?: string
  compact?: boolean
}) {
  const { data, isLoading } = useModels(capability)
  const privacy = useSettings((s) => s.privacy)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const models = data?.models ?? []
  const selected = value ? models.find((m) => m.providerId === value.providerId && m.id === value.modelId) : null

  // A pinned model can outlive the thing it pointed at — a model removed from
  // Ollama, a file taken out of the models folder, or an id that changed shape
  // between versions. Rather than quietly keeping a dead selection (and letting
  // the router silently substitute), drop back to Auto once the catalogue has
  // actually loaded and disagrees.
  useEffect(() => {
    if (!value || !models.length || selected) return
    onChange(null)
  }, [value, models.length, selected, onChange])

  const grouped = useMemo(() => {
    const filtered = query
      ? models.filter((m) => `${m.name} ${m.id} ${m.providerId}`.toLowerCase().includes(query.toLowerCase()))
      : models
    const map = new Map<string, AIModel[]>()
    for (const model of filtered) {
      map.set(model.providerId, [...(map.get(model.providerId) ?? []), model])
    }
    // Local first: it is free, private and usually what the user wants offered.
    return [...map.entries()].sort(([a], [b]) => (a === 'local' ? -1 : b === 'local' ? 1 : a.localeCompare(b)))
  }, [models, query])

  const label = selected
    ? selected.name
    : value
      ? value.modelId
      : isLoading
        ? 'Loading models…'
        : models.length
          ? 'Auto'
          : 'No models'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'group flex items-center gap-1.5 rounded-[9px] border border-line bg-surface transition-colors duration-150 hover:border-line-strong',
            compact ? 'h-7 pl-2 pr-1.5' : 'h-8 pl-2.5 pr-2',
            className,
          )}
        >
          <span
            className={cn(
              'h-[6px] w-[6px] shrink-0 rounded-full',
              (selected?.providerId ?? 'local') === 'local' ? 'bg-local' : 'bg-cloud',
            )}
          />
          <span className={cn('max-w-[190px] truncate font-medium text-ink', compact ? 'text-[12px]' : 'text-[12.5px]')}>
            {label}
          </span>
          <ChevronDown className="h-[12px] w-[12px] shrink-0 text-ink-faint" />
        </button>
      </PopoverTrigger>

      <PopoverContent align={align} className="w-[336px] p-0">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter models"
            className="h-[38px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
          />
        </div>

        <div className="max-h-[310px] overflow-y-auto p-1.5">
          <button
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
            className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left transition-colors hover:bg-subtle"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink">Auto</p>
              <p className="text-[11.5px] text-ink-faint">
                Let the router choose for each request
              </p>
            </div>
            {!value && <Check className="h-3.5 w-3.5 text-ink" />}
          </button>

          {grouped.map(([providerId, list]) => (
            <div key={providerId} className="mt-1.5">
              <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
                  {providerLabel(providerId as AIModel['providerId'])}
                </span>
                <span className="text-[11px] text-ink-faint">{list.length}</span>
              </div>

              {list.map((model) => {
                const active = value?.providerId === model.providerId && value?.modelId === model.id
                return (
                  <button
                    key={`${model.providerId}:${model.id}`}
                    onClick={() => {
                      onChange({ providerId: model.providerId, modelId: model.id })
                      setOpen(false)
                    }}
                    className="flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-[7px] text-left transition-colors hover:bg-subtle"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-ink">{model.name}</p>
                      <p className="mt-[1px] flex items-center gap-1.5 truncate text-[11px] text-ink-faint">
                        {model.contextLength ? <span>{formatNumber(model.contextLength)} ctx</span> : null}
                        {model.sizeBytes ? <span>{formatBytes(model.sizeBytes, 0)}</span> : null}
                        {isFreeModel(model) ? (
                          <span className="text-local">Free</span>
                        ) : model.pricing?.inputPerMTok !== undefined ? (
                          <span>${model.pricing.inputPerMTok.toFixed(2)}/M in</span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 pt-[2px]">
                      {model.capabilities.includes('VISION') && <Badge tone="neutral">vis</Badge>}
                      {model.capabilities.includes('REASONING') && <Badge tone="neutral">rsn</Badge>}
                      {active && <Check className="ml-0.5 h-3.5 w-3.5 text-ink" />}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}

          {!isLoading && models.length === 0 && (
            <div className="px-3 py-6 text-center">
              <Cpu className="mx-auto mb-2 h-4 w-4 text-ink-faint" />
              <p className="text-[12.5px] text-ink">
                {privacy === 'PRIVATE' ? 'No local models detected.' : 'No models available.'}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                {privacy === 'PRIVATE'
                  ? 'Start the local runtime and install a model with Ollama.'
                  : 'Connect a provider in Settings.'}
              </p>
            </div>
          )}

          {data?.unavailable.length ? (
            <div className="mt-2 border-t border-line px-2.5 pb-1 pt-2">
              {data.unavailable.map((entry) => (
                <p
                  key={entry.providerId}
                  className="flex items-start gap-1.5 py-[2px] text-[11px] leading-relaxed text-ink-faint"
                >
                  <TriangleAlert className="mt-[2px] h-[10px] w-[10px] shrink-0" />
                  <span>
                    <span className="text-ink-muted">{providerLabel(entry.providerId)}</span>{' '}
                    unavailable
                  </span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
