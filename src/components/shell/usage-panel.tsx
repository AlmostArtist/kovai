'use client'

import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Gauge, X } from 'lucide-react'
import { Button, Segmented, Tooltip } from '@/components/ui'
import { useUI } from '@/store/ui'
import { cn, formatCost, formatNumber } from '@/lib/utils'
import { useState } from 'react'
import { providerLabel } from '@/lib/providers/descriptors'
import type { ProviderId } from '@/lib/providers/types'

interface UsageResponse {
  totals: { calls: number; images: number; tokens: number; costUsd: number; costUnknownCount: number }
  byProvider: {
    providerId: ProviderId
    calls: number
    images: number
    tokens: number
    costUsd: number
    costUnknown: number
  }[]
  byKind: Record<string, number>
}

export function UsageButton({ collapsed }: { collapsed: boolean }) {
  const setUsageOpen = useUI((s) => s.setUsageOpen)
  const { data } = useUsage(1)

  const label = data
    ? data.totals.costUsd > 0
      ? formatCost(data.totals.costUsd)
      : `${data.totals.calls} calls`
    : '—'

  if (collapsed) {
    return (
      <Tooltip content="Usage" side="right">
        <button
          onClick={() => setUsageOpen(true)}
          className="flex h-8 w-full items-center justify-center rounded-[8px] border border-line bg-subtle text-ink-faint"
          aria-label="Usage"
        >
          <Gauge className="h-[13px] w-[13px]" />
        </button>
      </Tooltip>
    )
  }

  return (
    <button
      onClick={() => setUsageOpen(true)}
      className="flex h-[34px] w-full items-center gap-2 rounded-[9px] border border-line bg-subtle px-2.5 transition-colors duration-150 hover:border-line-strong"
    >
      <Gauge className="h-[13px] w-[13px] text-ink-faint" />
      <span className="flex-1 text-left text-[12px] font-medium text-ink">Usage</span>
      <span className="text-[11px] text-ink-faint">{label}</span>
    </button>
  )
}

function useUsage(days: number) {
  return useQuery({
    queryKey: ['usage', days],
    queryFn: async (): Promise<UsageResponse> => {
      const res = await fetch(`/api/usage?days=${days}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not load usage.')
      return (await res.json()) as UsageResponse
    },
    staleTime: 20_000,
  })
}

/**
 * Usage is a ledger of what happened, not a projection.
 *
 * Local work is free and says so. Cloud work shows a cost only where the
 * provider reported one; otherwise it says the cost is unavailable rather than
 * inventing a number from a price list that may be out of date.
 */
export function UsagePanel() {
  const open = useUI((s) => s.usageOpen)
  const setOpen = useUI((s) => s.setUsageOpen)
  const [days, setDays] = useState(1)
  const { data, isLoading } = useUsage(days)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-4 top-[62px] z-50 w-[340px] overflow-hidden rounded-[14px] border border-line bg-elevated shadow-float"
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <p className="text-[13.5px] font-medium">Usage</p>
              <Segmented
                size="sm"
                className="ml-auto"
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
                options={[
                  { value: '1', label: 'Today' },
                  { value: '7', label: '7d' },
                  { value: '30', label: '30d' },
                ]}
              />
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {isLoading && <div className="px-4 py-6 text-[13px] text-ink-faint">Loading…</div>}

            {data && (
              <>
                <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
                  <Stat label="Calls" value={formatNumber(data.totals.calls)} />
                  <Stat label="Images" value={formatNumber(data.totals.images)} />
                  <Stat label="Tokens" value={formatNumber(data.totals.tokens)} />
                </div>

                <div className="px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-ink-muted">Reported cost</span>
                    <span className="font-mono text-[14px] tracking-tight text-ink">
                      {data.totals.costUsd > 0 ? formatCost(data.totals.costUsd) : '$0.00'}
                    </span>
                  </div>
                  {data.totals.costUnknownCount > 0 && (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                      {data.totals.costUnknownCount} call
                      {data.totals.costUnknownCount === 1 ? '' : 's'} had no price reported by the provider.
                      Cost unavailable for those.
                    </p>
                  )}
                </div>

                <div className="border-t border-line px-4 py-3">
                  {data.byProvider.length === 0 ? (
                    <p className="py-2 text-center text-[12.5px] text-ink-faint">
                      Nothing used yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {data.byProvider.map((entry) => (
                        <div key={entry.providerId} className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              'h-[6px] w-[6px] rounded-full',
                              entry.providerId === 'local'
                                ? 'bg-local'
                                : 'bg-cloud',
                            )}
                          />
                          <span className="flex-1 text-[12.5px] text-ink">
                            {providerLabel(entry.providerId)}
                          </span>
                          <span className="text-[11.5px] text-ink-faint">
                            {entry.calls} call{entry.calls === 1 ? '' : 's'}
                          </span>
                          <span className="w-[74px] text-right font-mono text-[11.5px] text-ink-muted">
                            {entry.providerId === 'local'
                              ? 'Free'
                              : entry.costUsd > 0
                                ? formatCost(entry.costUsd)
                                : 'Unavailable'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-elevated px-3 py-3">
      <p className="font-mono text-[16px] tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-faint">{label}</p>
    </div>
  )
}
