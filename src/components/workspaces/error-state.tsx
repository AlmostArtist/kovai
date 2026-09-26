'use client'

import { useState } from 'react'
import { ChevronRight, Play, RefreshCw, Settings, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui'
import { useWorkspace } from '@/store/workspace'
import { useLocalRuntime } from '@/hooks/use-local-runtime'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { SerializedProviderError } from '@/lib/providers/types'

/**
 * How failure looks in KOVAI.
 *
 * The headline is always something a person can act on. The provider's own
 * words are kept, but behind a disclosure — never as the primary message. Each
 * error offers the action that actually resolves it: start the runtime, connect
 * the provider, or simply try again.
 */
export function ErrorState({
  error,
  onRetry,
  onChangeModel,
  className,
  compact,
}: {
  error: SerializedProviderError
  onRetry?: () => void
  onChangeModel?: () => void
  className?: string
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const openTab = useWorkspace((s) => s.openTab)
  const { start } = useLocalRuntime()
  const [starting, setStarting] = useState(false)

  const needsRuntime = error.code === 'RUNTIME_OFFLINE'
  const needsSetup = error.code === 'UNCONFIGURED' || error.code === 'INVALID_KEY'

  const handleStart = async () => {
    setStarting(true)
    const pending = toast.loading('Starting the local runtime…')
    try {
      await start()
      toast.success('Local runtime ready', { id: pending })
      onRetry?.()
    } catch (err) {
      toast.error('Could not start the runtime', {
        id: pending,
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-[11px] border border-line bg-surface',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-[2px] h-[15px] w-[15px] shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-ink">{error.message}</p>

          {error.detail && (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-ink-muted transition-colors hover:text-ink"
              >
                <ChevronRight
                  className={cn('h-[11px] w-[11px] transition-transform duration-150', expanded && 'rotate-90')}
                />
                Provider details
              </button>
              {expanded && (
                <pre className="mt-2 max-h-[132px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-line bg-subtle p-2.5 font-mono text-[11.5px] leading-relaxed text-ink-muted">
                  {error.detail}
                </pre>
              )}
            </>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {needsRuntime && (
              <Button variant="primary" size="xs" disabled={starting} onClick={handleStart}>
                <Play className="h-3 w-3" />
                {starting ? 'Starting…' : 'Start local runtime'}
              </Button>
            )}
            {needsSetup && (
              <Button variant="primary" size="xs" onClick={() => openTab({ kind: 'settings', title: 'Settings' })}>
                <Settings className="h-3 w-3" />
                Open provider settings
              </Button>
            )}
            {onRetry && error.retryable && (
              <Button variant="secondary" size="xs" onClick={onRetry}>
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
            {onChangeModel && (
              <Button variant="ghost" size="xs" onClick={onChangeModel}>
                Change model
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
