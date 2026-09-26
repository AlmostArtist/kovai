'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useSettings } from '@/store/settings'
import { isFreeModel } from '@/lib/providers/descriptors'
import type { AIModel, Capability, ProviderId } from '@/lib/providers/types'

interface ModelsResponse {
  models: AIModel[]
  unavailable: { providerId: ProviderId; reason: string }[]
}

/**
 * The models KOVAI can currently reach for a given capability.
 *
 * In private mode the query key includes the privacy setting, so switching
 * modes re-resolves the catalogue — cloud text models are not merely hidden,
 * they are never fetched.
 */
export function useModels(capability?: Capability) {
  const privacy = useSettings((s) => s.privacy)
  const runtimeUrl = useSettings((s) => s.localRuntimeUrl)
  const onlyFree = useSettings((s) => s.onlyFreeModels)

  const query = useQuery({
    queryKey: ['models', capability ?? 'all', privacy, runtimeUrl],
    queryFn: async (): Promise<ModelsResponse> => {
      const params = new URLSearchParams({ privacy, runtime: runtimeUrl })
      if (capability) params.set('capability', capability)
      const res = await fetch(`/api/models?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not load the model catalogue.')
      return (await res.json()) as ModelsResponse
    },
    staleTime: 60_000,
  })

  // Filtering happens here rather than in the query key, so toggling the
  // preference is instant and does not refetch the catalogue.
  return useMemo(() => {
    if (!onlyFree || !query.data) return query
    return {
      ...query,
      data: { ...query.data, models: query.data.models.filter(isFreeModel) },
    }
  }, [query, onlyFree])
}
