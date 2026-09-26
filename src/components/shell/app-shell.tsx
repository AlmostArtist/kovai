'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './sidebar'
import { TopTabs } from './top-tabs'
import { CommandPalette } from './command-palette'
import { ActivityCenter } from './activity-center'
import { Onboarding } from './onboarding'
import { UsagePanel } from './usage-panel'
import { CompanionRail } from './companion-rail'
import { DynamicIsland } from './dynamic-island'
import { MobileBar } from './mobile-bar'
import { AssetPreview } from '../workspaces/asset-preview'
import { WorkspaceSurface } from '../workspaces/workspace-surface'
import { useWorkspace } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { useUI } from '@/store/ui'
import { bootstrapJobs } from '@/store/jobs'
import { useShortcuts } from '@/hooks/use-shortcuts'
import { useHydrated } from '@/hooks/use-hydrated'
import { KovaiMark } from './kovai-mark'

export function AppShell() {
  const tabs = useWorkspace((s) => s.tabs)
  const activeTabId = useWorkspace((s) => s.activeTabId)
  const onboarded = useSettings((s) => s.onboarded)
  const collapsed = useSettings((s) => s.sidebarCollapsed)
  const hydrated = useHydrated()

  useShortcuts()

  // Pick up any generation that was running before this page loaded.
  useEffect(() => {
    void bootstrapJobs()
  }, [])

  // Until the saved session is back, show the frame rather than a workspace
  // that is about to be replaced.
  if (!hydrated) {
    return (
      <div className="flex h-[100dvh] w-full items-center justify-center bg-canvas">
        <KovaiMark className="h-6 w-6 opacity-40 breathe" />
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-canvas">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <TopTabs />

        <main className="relative min-h-0 flex-1">
          {/*
            Every open tab stays mounted. Hiding rather than unmounting is what
            preserves a streaming answer, a scroll position and a half-written
            prompt when you move between tabs.
          */}
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="absolute inset-0"
              style={{
                visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                pointerEvents: tab.id === activeTabId ? 'auto' : 'none',
              }}
              aria-hidden={tab.id !== activeTabId}
              inert={tab.id !== activeTabId}
            >
              <AnimatePresence initial={false}>
                {tab.id === activeTabId && (
                  <motion.div
                    className="h-full"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <WorkspaceSurface tab={tab} />
                  </motion.div>
                )}
              </AnimatePresence>
              {tab.id !== activeTabId && <WorkspaceSurface tab={tab} />}
            </div>
          ))}
        </main>
      </div>

      <CompanionRail />
      <DynamicIsland />
      <CommandPalette />
      <ActivityCenter />
      <UsagePanel />
      <AssetPreview />
      {!onboarded && <Onboarding />}

      <span className="sr-only" aria-live="polite">
        {collapsed ? 'Sidebar collapsed' : 'Sidebar expanded'}
      </span>
    </div>
  )
}
