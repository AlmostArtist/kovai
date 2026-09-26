'use client'

import { useEffect } from 'react'
import { useWorkspace } from '@/store/workspace'
import { useUI } from '@/store/ui'
import { useSettings } from '@/store/settings'

/**
 * Global keyboard handling.
 *
 * Shortcuts are the fastest surface in the product, so they are registered once
 * here rather than scattered across components. Anything typed into a field is
 * left alone unless it carries a modifier.
 */
export function useShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable === true

      const workspace = useWorkspace.getState()
      const ui = useUI.getState()

      // ⌘K / ⌘/ reach the palette and search from anywhere, including a prompt.
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        ui.setCommandOpen(!ui.commandOpen)
        return
      }
      if (mod && event.key === '/') {
        event.preventDefault()
        ui.setSearchOpen(!ui.searchOpen)
        return
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        workspace.openTab({ kind: 'projects', title: 'Projects' })
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 't') {
        event.preventDefault()
        workspace.restoreLast()
        return
      }

      if (mod && event.key.toLowerCase() === 't') {
        event.preventDefault()
        // Home is a single place, so "new tab" opens a new conversation —
        // the one surface where a second copy is actually useful.
        workspace.openTab({ kind: 'chat' })
        return
      }
      if (mod && event.key.toLowerCase() === 'w') {
        event.preventDefault()
        workspace.closeTab(workspace.activeTabId)
        return
      }
      if (mod && event.key.toLowerCase() === 'b' && !typing) {
        event.preventDefault()
        const settings = useSettings.getState()
        settings.set('sidebarCollapsed', !settings.sidebarCollapsed)
        return
      }

      // ⌘⌥← / → and ⌃Tab move between tabs.
      if ((event.ctrlKey && event.key === 'Tab') || (mod && event.altKey && event.key === 'ArrowRight')) {
        event.preventDefault()
        workspace.cycle(event.shiftKey ? -1 : 1)
        return
      }
      if (mod && event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        workspace.cycle(-1)
        return
      }

      // ⌘1…⌘9 jump straight to a tab.
      if (mod && /^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1
        const tab = workspace.tabs[index]
        if (tab) {
          event.preventDefault()
          workspace.setActive(tab.id)
        }
        return
      }

      if (event.key === 'Escape') {
        if (ui.commandOpen) ui.setCommandOpen(false)
        else if (ui.searchOpen) ui.setSearchOpen(false)
        else if (ui.previewAssetId) ui.preview(null)
        else if (ui.activityOpen) ui.setActivityOpen(false)
        else if (ui.usageOpen) ui.setUsageOpen(false)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
