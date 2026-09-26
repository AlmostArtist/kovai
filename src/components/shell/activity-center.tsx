'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useMemo } from 'react'
import { Activity, CheckCircle2, CircleSlash, Loader2, TriangleAlert, X } from 'lucide-react'
import { Button, ProgressLine, Tooltip } from '@/components/ui'
import { activeJobs, isJobActive, jobsForTab, useJobs } from '@/store/jobs'
import { useUI } from '@/store/ui'
import { useWorkspace } from '@/store/workspace'
import { cn, relativeTime, truncate } from '@/lib/utils'
import { providerLabel } from '@/lib/providers/descriptors'
import type { SerializedJob } from '@/lib/jobs/manager'

const PHASE_LABEL: Record<string, string> = {
  PREPARING: 'Preparing',
  GENERATING: 'Generating',
  FINALIZING: 'Finalizing',
  DONE: 'Complete',
}

/** Quiet top-bar entry. Appears only when something is actually running. */
export function ActivityIndicator() {
  const jobs = useJobs((s) => s.jobs)
  const setActivityOpen = useUI((s) => s.setActivityOpen)
  const active = useMemo(() => activeJobs(jobs), [jobs])
  if (!active.length) return null

  return (
    <Tooltip content="Activity">
      <button
        onClick={() => setActivityOpen(true)}
        className="flex h-[30px] items-center gap-1.5 rounded-[8px] border border-line bg-subtle px-2 text-ink transition-colors duration-150 hover:border-line-strong"
      >
        <span className="h-[6px] w-[6px] rounded-full bg-accent breathe" />
        <span className="text-[12px] font-medium tabular-nums">{active.length}</span>
      </button>
    </Tooltip>
  )
}

/**
 * The Activity Center.
 *
 * Generation is asynchronous, so the interface needs one place that always
 * knows what is in flight. It sits out of the way in the corner, stays silent
 * when nothing is happening, and clicking a job takes you back to the tab that
 * started it.
 */
export function ActivityCenter() {
  const jobs = useJobs((s) => s.jobs)
  const open = useUI((s) => s.activityOpen)
  const setOpen = useUI((s) => s.setActivityOpen)

  const active = useMemo(() => activeJobs(jobs), [jobs])
  const recent = useMemo(
    () => Object.values(jobs).sort((a, b) => b.createdAt - a.createdAt).slice(0, 12),
    [jobs],
  )

  return (
    <div className="pb-safe pointer-events-none fixed inset-x-2 bottom-4 z-40 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-auto w-full overflow-hidden rounded-[14px] border border-line bg-elevated shadow-float sm:w-[336px]"
          >
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
              <Activity className="h-[13px] w-[13px] text-ink-faint" />
              <p className="flex-1 text-[13px] font-medium">Activity</p>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {recent.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-ink-faint">
                  Nothing running.
                </p>
              ) : (
                recent.map((job) => <JobRow key={job.id} job={job} />)
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active.length > 0 && !open && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => setOpen(true)}
            className="pointer-events-auto flex items-center gap-2.5 rounded-[11px] border border-line bg-elevated py-2 pl-3 pr-3.5 shadow-float transition-transform duration-150 hover:-translate-y-[1px]"
          >
            <Loader2 className="h-[13px] w-[13px] animate-spin text-accent" />
            <span className="text-[12.5px] font-medium text-ink">
              {active.length} active generation{active.length === 1 ? '' : 's'}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

function JobRow({ job }: { job: SerializedJob }) {
  const cancel = useJobs((s) => s.cancel)
  const setActive = useWorkspace((s) => s.setActive)
  const tabs = useWorkspace((s) => s.tabs)
  void jobsForTab
  const running = isJobActive(job)
  const tabExists = job.tabId && tabs.some((t) => t.id === job.tabId)

  return (
    <div
      className={cn(
        'group border-b border-line px-3.5 py-2.5 last:border-b-0',
        tabExists && 'cursor-pointer hover:bg-subtle',
      )}
      onClick={() => tabExists && setActive(job.tabId!)}
    >
      <div className="flex items-start gap-2.5">
        <StatusGlyph status={job.status} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] text-ink">{truncate(job.prompt, 46)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-faint">
            <span>{providerLabel(job.providerId)}</span>
            <span>·</span>
            <span className="truncate">{job.model}</span>
            <span>·</span>
            <span>{running ? PHASE_LABEL[job.phase] : relativeTime(job.createdAt)}</span>
          </p>
        </div>

        {running ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void cancel(job.id)
            }}
            className="shrink-0 text-[11px] text-ink-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
          >
            Cancel
          </button>
        ) : (
          job.status === 'COMPLETED' && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
              {job.outputs.length}
            </span>
          )
        )}
      </div>

      {running && (
        <div className="mt-2 flex items-center gap-2">
          <ProgressLine value={job.progress} className="flex-1" />
          <span className="w-[30px] shrink-0 text-right font-mono text-[10.5px] tabular-nums text-ink-faint">
            {Math.round(job.progress)}%
          </span>
        </div>
      )}

      {job.status === 'FAILED' && job.error && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-danger">{job.error.message}</p>
      )}
    </div>
  )
}

function StatusGlyph({ status }: { status: SerializedJob['status'] }) {
  const className = 'h-[13px] w-[13px] shrink-0 mt-[1px]'
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle2 className={cn(className, 'text-local')} />
    case 'FAILED':
      return <TriangleAlert className={cn(className, 'text-danger')} />
    case 'CANCELLED':
      return <CircleSlash className={cn(className, 'text-ink-faint')} />
    default:
      return <Loader2 className={cn(className, 'animate-spin text-accent')} />
  }
}
