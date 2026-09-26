'use client'

import { useState } from 'react'
import { Cpu, HardDrive, Play, RefreshCw, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Popover, PopoverContent, PopoverTrigger, StatusDot, Tooltip } from '@/components/ui'
import { useLocalRuntime } from '@/hooks/use-local-runtime'
import { cn, formatBytes } from '@/lib/utils'

/**
 * Local runtime status and lifecycle.
 *
 * A browser cannot start a process, so the control here is honest about which
 * mode it is in: in the desktop build (or when the Next.js server is running on
 * this machine) the button starts the runtime; otherwise it explains what to run.
 */
export function RuntimeStatus({ collapsed }: { collapsed: boolean }) {
  const { snapshot, isLoading, start, stop, refresh } = useLocalRuntime({ poll: true })
  const [starting, setStarting] = useState(false)
  const online = snapshot?.online ?? false

  const handleStart = async () => {
    setStarting(true)
    const pending = toast.loading('Starting the local runtime…', {
      description: 'First launch builds a Python environment — this can take a few minutes.',
    })
    try {
      await start((status) =>
        // Show what the script is actually doing, so a long first run reads as
        // progress rather than as a hang.
        toast.loading('Starting the local runtime…', { id: pending, description: status }),
      )
      toast.success('Local runtime ready', { id: pending, description: undefined })
    } catch (err) {
      toast.error('Could not start the local runtime', {
        id: pending,
        description: err instanceof Error ? err.message : undefined,
        duration: 8000,
      })
    } finally {
      setStarting(false)
    }
  }

  const state = starting ? 'busy' : online ? 'ready' : isLoading ? 'busy' : 'offline'
  const system = snapshot?.system

  if (collapsed) {
    return (
      <Tooltip content={online ? 'Local runtime running' : 'Local runtime offline'} side="right">
        <button
          onClick={online ? undefined : handleStart}
          className="flex h-8 w-full items-center justify-center rounded-[8px] border border-line bg-subtle"
          aria-label="Local runtime"
        >
          <StatusDot state={state} />
        </button>
      </Tooltip>
    )
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-[34px] w-full items-center gap-2 rounded-[9px] border border-line bg-subtle px-2.5 transition-colors duration-150 hover:border-line-strong">
          <StatusDot state={state} />
          <span className="flex-1 text-left text-[12px] font-medium text-ink">Local runtime</span>
          <span className="text-[11px] text-ink-faint">
            {starting ? 'Starting' : online ? 'Running' : 'Offline'}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent side="right" align="end" className="w-[286px] p-0">
        <div className="border-b border-line px-3.5 py-3">
          <div className="flex items-center gap-2">
            <StatusDot state={state} />
            <p className="text-[13px] font-medium">
              {online ? 'Running' : starting ? 'Starting…' : 'Not running'}
            </p>
            {snapshot?.latencyMs !== undefined && online && (
              <span className="ml-auto text-[11px] text-ink-faint">{snapshot.latencyMs}ms</span>
            )}
          </div>
          {!online && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
              {snapshot?.detail ?? "KOVAI's local runtime isn't running."}
            </p>
          )}
        </div>

        {online && system && (
          <div className="space-y-2.5 border-b border-line px-3.5 py-3">
            <Metric
              icon={Cpu}
              label={system.chip || system.arch}
              value={`${Math.round(system.cpuPercent)}% · ${system.cpuCount} cores`}
              fill={system.cpuPercent / 100}
            />
            <Metric
              icon={HardDrive}
              label="Memory"
              value={`${formatBytes(system.ramTotalBytes - system.ramAvailableBytes, 0)} of ${formatBytes(system.ramTotalBytes, 0)}`}
              fill={
                system.ramTotalBytes
                  ? (system.ramTotalBytes - system.ramAvailableBytes) / system.ramTotalBytes
                  : 0
              }
            />
            {system.gpu && (
              <Metric
                icon={Cpu}
                label={system.gpu}
                value={
                  system.vramTotalBytes
                    ? `${formatBytes((system.vramTotalBytes ?? 0) - (system.vramFreeBytes ?? 0), 0)} of ${formatBytes(system.vramTotalBytes, 0)} VRAM`
                    : 'GPU available'
                }
                fill={
                  system.vramTotalBytes
                    ? ((system.vramTotalBytes ?? 0) - (system.vramFreeBytes ?? 0)) / system.vramTotalBytes
                    : 0
                }
              />
            )}

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {Object.entries(system.backends)
                .filter(([, enabled]) => enabled)
                .map(([name]) => (
                  <span
                    key={name}
                    className="rounded-[5px] border border-line bg-subtle px-1.5 py-[1px] text-[10.5px] text-ink-muted"
                  >
                    {name}
                  </span>
                ))}
              <span className="rounded-[5px] border border-line bg-subtle px-1.5 py-[1px] text-[10.5px] text-ink-muted">
                {snapshot?.models.length ?? 0} models
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5 p-2">
          {online ? (
            <>
              <Button variant="ghost" size="xs" onClick={() => refresh()}>
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto text-ink-muted"
                onClick={() => void stop()}
              >
                <Square className="h-3 w-3" />
                Stop
              </Button>
            </>
          ) : (
            <Button variant="primary" size="xs" className="w-full" disabled={starting} onClick={handleStart}>
              <Play className="h-3 w-3" />
              {starting ? 'Starting…' : 'Start local runtime'}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  fill,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  fill: number
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Icon className="h-[11px] w-[11px] text-ink-faint" />
        <span className="truncate text-[11.5px] text-ink">{label}</span>
        <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{value}</span>
      </div>
      <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-line">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            fill > 0.85 ? 'bg-warn' : 'bg-ink-faint',
          )}
          style={{ width: `${Math.min(100, Math.max(2, fill * 100))}%` }}
        />
      </div>
    </div>
  )
}
