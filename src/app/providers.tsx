'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui'
import { useSettings } from '@/store/settings'
import { applyAppearance, DEFAULT_APPEARANCE } from '@/lib/appearance'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={400} skipDelayDuration={300}>
        <ThemeSync />
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-line)',
              color: 'var(--color-ink)',
              borderRadius: '10px',
              fontSize: '13px',
              boxShadow: 'var(--shadow-float)',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

/** Keeps the document class in step with the preference, including "system". */
function ThemeSync() {
  const theme = useSettings((s) => s.theme)
  const appearance = useSettings((s) => s.appearance)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      // Re-applied on every flip, not just on change: the accent has a
      // different value per theme, and the stylesheet's own `.dark` block would
      // otherwise win back the variable this set.
      applyAppearance(appearance ?? DEFAULT_APPEARANCE, dark)
    }
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, appearance])

  return null
}
