'use client'

import { useCallback, useState } from 'react'
import { useJobs } from '@/store/jobs'
import { useSettings } from '@/store/settings'
import type { ProviderId, SerializedProviderError } from '@/lib/providers/types'
import type { SerializedJob } from '@/lib/jobs/manager'

/**
 * Starts a generation and hands back a job to watch.
 *
 * The call returns as soon as the job exists — it never waits for the image.
 * Progress arrives through the shared jobs store, so the user can switch tabs,
 * start something else, or close the workspace entirely.
 */
export function useGeneration(tabId?: string) {
  const addJob = useJobs((s) => s.add)
  const cancelJob = useJobs((s) => s.cancel)
  const activeProjectId = useSettings((s) => s.activeProjectId)
  const [error, setError] = useState<SerializedProviderError | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const generate = useCallback(
    async (input: {
      providerId: ProviderId
      model: string
      prompt: string
      params: Record<string, unknown>
      referenceImages?: string[]
      kind?: 'image' | 'video'
    }): Promise<SerializedJob | null> => {
      setSubmitting(true)
      setError(null)
      try {
        const res = await fetch('/api/image/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, tabId, projectId: activeProjectId ?? undefined }),
        })
        const body = (await res.json()) as { job?: SerializedJob; error?: SerializedProviderError }

        if (!res.ok || !body.job) {
          setError(
            body.error ?? {
              code: 'PROVIDER_ERROR',
              message: 'Image generation failed to start.',
              retryable: true,
            },
          )
          return null
        }

        addJob(body.job)
        return body.job
      } catch (err) {
        setError({
          code: 'NETWORK',
          message: 'Could not reach the server.',
          detail: err instanceof Error ? err.message : undefined,
          retryable: true,
        })
        return null
      } finally {
        setSubmitting(false)
      }
    },
    [addJob, tabId, activeProjectId],
  )

  return { generate, cancel: cancelJob, error, clearError: () => setError(null), submitting }
}
