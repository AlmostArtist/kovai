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
  /**
   * The navigation drawer is open.
   *
   * Only meaningful on a phone, where the sidebar is an overlay rather than a
   * column. It lives here rather than in the sidebar because the thing that
   * opens it is in the header and the things that close it are the workspaces.
   */
  navOpen: boolean

  setCommandOpen(open: boolean): void
  setSearchOpen(open: boolean): void
  setActivityOpen(open: boolean): void
  toggleInspector(): void
  setUsageOpen(open: boolean): void
  preview(assetId: string | null): void
  setIslandOpen(open: boolean): void
  setNavOpen(open: boolean): void
}

export const useUI = create<UIState>((set) => ({
  commandOpen: false,
  searchOpen: false,
  activityOpen: false,
  inspectorOpen: true,
  usageOpen: false,
  previewAssetId: null,
  islandOpen: false,
  navOpen: false,

  setCommandOpen: (commandOpen) => set({ commandOpen, searchOpen: false }),
  setSearchOpen: (searchOpen) => set({ searchOpen, commandOpen: false }),
  setActivityOpen: (activityOpen) => set({ activityOpen }),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  setUsageOpen: (usageOpen) => set({ usageOpen }),
  preview: (previewAssetId) => set({ previewAssetId }),
  setIslandOpen: (islandOpen) => set({ islandOpen }),
  setNavOpen: (navOpen) => set({ navOpen }),
}))
