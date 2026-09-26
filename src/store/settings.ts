'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ModelChoice } from '@/lib/providers/types'
import { DEFAULT_EFFORT, type Effort } from '@/lib/response-effort'
import { DEFAULT_APPEARANCE, type Appearance } from '@/lib/appearance'

/**
 * Preferences that shape routing and appearance.
 *
 * `privacy` is the most consequential switch in the product: in PRIVATE mode the
 * interface will not even enumerate cloud text models, and chat and vision are
 * streamed straight from the browser to the local runtime.
 */

export type PrivacyMode = 'PRIVATE' | 'ONLINE'
export type ThemePreference = 'light' | 'dark' | 'system'
export type Intent = 'auto' | 'fast' | 'reasoning' | 'vision' | 'coding' | 'creative'

export type { ModelChoice }

interface SettingsState {
  onboarded: boolean
  displayName: string
  privacy: PrivacyMode
  theme: ThemePreference
  intent: Intent
  sidebarCollapsed: boolean
  localRuntimeUrl: string

  /** Remembered selections, per task. Null means "let the router decide". */
  chatModel: ModelChoice | null
  visionModel: ModelChoice | null
  imageModel: ModelChoice | null

  activeProjectId: string | null
  useProjectContext: boolean
  /** Hide cloud models that cost money, leaving free and local ones. */
  onlyFreeModels: boolean
  /** How much answer to ask for. A new chat starts here. */
  responseEffort: Effort
  /** Accent, type and reading font. */
  appearance: Appearance
  /**
   * Added to the system prompt on every turn. The place for standing
   * preferences — a language, a house style, things never to do.
   */
  customInstructions: string

  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void
  complete(name: string, privacy: PrivacyMode): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      onboarded: false,
      displayName: '',
      privacy: 'ONLINE',
      theme: 'system',
      intent: 'auto',
      sidebarCollapsed: false,
      localRuntimeUrl:
        process.env.NEXT_PUBLIC_LOCAL_RUNTIME_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8756',

      chatModel: null,
      visionModel: null,
      imageModel: null,

      activeProjectId: null,
      useProjectContext: true,
      onlyFreeModels: false,
      responseEffort: DEFAULT_EFFORT,
      appearance: DEFAULT_APPEARANCE,
      customInstructions: '',

      set: (key, value) => set({ [key]: value } as Pick<SettingsState, typeof key>),
      complete: (name, privacy) => set({ onboarded: true, displayName: name.trim(), privacy }),
    }),
    { name: 'kovai.settings', version: 1, skipHydration: true },
  ),
)
