'use client'

import { useQuery } from '@tanstack/react-query'
import type { ProviderDescriptor, ProviderStatus } from '@/lib/providers/types'

export interface ProviderState {
  descriptor: ProviderDescriptor
  status: ProviderStatus
}

/** Connection state for every provider. Refreshed on focus, not on a timer. */
export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: async (): Promise<ProviderState[]> => {
      const res = await fetch('/api/providers', { cache: 'no-store' })
      if (!res.ok) throw new Error('Could not read provider status.')
      const body = (await res.json()) as { providers: ProviderState[] }
      return body.providers
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

export function useProvider(id: string) {
  const { data } = useProviders()
  return data?.find((p) => p.descriptor.id === id)
}
