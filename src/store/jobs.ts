'use client'

import { create } from 'zustand'
import type { SerializedJob } from '@/lib/jobs/manager'

/**
 * Client mirror of the server's generation jobs.
 *
 * The server owns job state; this store is a view of it, refreshed by a single
 * shared poll. One interval serves every tab, the Activity Center and the
 * bottom-right indicator — components subscribe rather than polling themselves.
 */

interface JobsState {
  jobs: Record<string, SerializedJob>
  lastError: string | null
  hydrated: boolean

  sync(): Promise<void>
  add(job: SerializedJob): void
  cancel(id: string): Promise<void>
  active(): SerializedJob[]
  forTab(tabId: string): SerializedJob[]
}

const ACTIVE = new Set(['QUEUED', 'RUNNING'])

/**
 * Derivations live outside the store as pure functions.
 *
 * A selector that returns a freshly built array is a new reference every render,
 * which zustand reads as a change — components must select the stable `jobs`
 * map and memoise these instead.
 */
export function activeJobs(jobs: Record<string, SerializedJob>): SerializedJob[] {
  return Object.values(jobs)
    .filter((j) => ACTIVE.has(j.status))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function jobsForTab(jobs: Record<string, SerializedJob>, tabId: string): SerializedJob[] {
  return Object.values(jobs)
    .filter((j) => j.tabId === tabId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function isJobActive(job: SerializedJob): boolean {
  return ACTIVE.has(job.status)
}

export const useJobs = create<JobsState>((set, get) => ({
  jobs: {},
  lastError: null,
  hydrated: false,

  async sync() {
    try {
      const res = await fetch('/api/image/status', { cache: 'no-store' })
      if (!res.ok) return
      const { jobs } = (await res.json()) as { jobs: SerializedJob[] }
      set({
        jobs: Object.fromEntries(jobs.map((j) => [j.id, j])),
        lastError: null,
        hydrated: true,
      })
    } catch {
      // A failed poll is not worth surfacing; the next one usually succeeds.
      set({ hydrated: true })
    }
  },

  add(job) {
    set((s) => ({ jobs: { ...s.jobs, [job.id]: job } }))
    ensurePolling()
  },

  async cancel(id) {
    // Optimistic, so the button responds immediately; the poll confirms.
    set((s) => ({
      jobs: { ...s.jobs, [id]: { ...s.jobs[id], status: 'CANCELLED', phase: 'DONE' } },
    }))
    await fetch('/api/image/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
    void get().sync()
  },

  // Imperative reads for the poll loop. Components use the pure helpers above.
  active() {
    return activeJobs(get().jobs)
  },

  forTab(tabId) {
    return jobsForTab(get().jobs, tabId)
  },
}))

/* ── One poll for the whole application ───────────────────── */

let timer: ReturnType<typeof setInterval> | null = null

function ensurePolling() {
  if (timer || typeof window === 'undefined') return
  timer = setInterval(() => {
    // Nothing running and nothing to reconcile: stand down until the next job.
    if (!useJobs.getState().active().length) {
      stopPolling()
      return
    }
    // Polling pauses with the tab hidden; jobs keep running on the server.
    if (document.visibilityState === 'hidden') return
    void useJobs.getState().sync()
  }, 1500)
}

function stopPolling() {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

/** Called once by the app shell: pick up anything already running. */
export async function bootstrapJobs() {
  await useJobs.getState().sync()
  if (useJobs.getState().active().length) ensurePolling()
}
