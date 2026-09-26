'use client'

import { useEffect, useState } from 'react'
import { useSettings } from '@/store/settings'
import { useWorkspace } from '@/store/workspace'
import { useCompanions } from '@/store/companions'

/**
 * Restores the persisted session after mount.
 *
 * Tabs and preferences live in localStorage, which the server cannot see. If the
 * stores rehydrated during the first render, the restored workspace would not
 * match the server-rendered markup — and returning users would watch onboarding
 * flash past before their tabs appeared. Rehydrating in an effect keeps the
 * first paint honest and the swap invisible.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    void Promise.all([
      useSettings.persist.rehydrate(),
      useWorkspace.persist.rehydrate(),
      useCompanions.persist.rehydrate(),
    ]).finally(() => setHydrated(true))
  }, [])

  return hydrated
}
