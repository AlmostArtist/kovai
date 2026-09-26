'use client'

import { create } from 'zustand'

/** Transient interface state: overlays, panels, the thing you just clicked. */
interface UIState {
  commandOpen: boolean
  searchOpen: boolean
  activityOpen: boolean
  inspectorOpen: boolean
  usageOpen: boolean
  previewAssetId: string | null
  /**
   * The right-edge control island is expanded.
   *
   * Shared rather than local because the companion rail drifts along the same
   * edge and has to step aside for it — an agent walking underneath a panel
   * reads as a bug rather than as depth.
   */
  islandOpen: boolean

  setCommandOpen(open: boolean): void
  setSearchOpen(open: boolean): void
  setActivityOpen(open: boolean): void
  toggleInspector(): void
  setUsageOpen(open: boolean): void
  preview(assetId: string | null): void
  setIslandOpen(open: boolean): void
}

export const useUI = create<UIState>((set) => ({
  commandOpen: false,
  searchOpen: false,
  activityOpen: false,
  inspectorOpen: true,
  usageOpen: false,
  previewAssetId: null,
  islandOpen: false,

  setCommandOpen: (commandOpen) => set({ commandOpen, searchOpen: false }),
  setSearchOpen: (searchOpen) => set({ searchOpen, commandOpen: false }),
  setActivityOpen: (activityOpen) => set({ activityOpen }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setUsageOpen: (usageOpen) => set({ usageOpen }),
  preview: (previewAssetId) => set({ previewAssetId }),
  setIslandOpen: (islandOpen) => set({ islandOpen }),
}))
