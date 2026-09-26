'use client'

import { useEffect, useState } from 'react'

/**
 * What size of screen this is.
 *
 * One definition, shared. The alternative — every component picking its own
 * width — is how an interface ends up with a sidebar that thinks it is on a
 * phone while the toolbar beside it thinks it is on a desktop.
 *
 * The numbers match Tailwind's own, so a `md:` class and a `useIsMobile()`
 * branch in the same component always agree about which side of the line they
 * are on. Anything that can be expressed as a `md:` class should be, and this
 * hook is for the cases that cannot: a drawer instead of a rail, a sheet
 * instead of a dialog, an effect that should not run on a touch screen.
 */

/** Tailwind's `md`. Below it, one column and no room for a rail. */
export const MOBILE_BREAKPOINT = 768
/** Tailwind's `lg`. Below it, the sidebar is worth collapsing to icons. */
export const NARROW_BREAKPOINT = 1024

/**
 * Tracks a media query.
 *
 * Starts false on the server and on the first client render, then corrects
 * itself in an effect — so the markup React hydrates always matches what the
 * server sent, whatever size the window turns out to be.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const apply = () => setMatches(media.matches)
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [query])

  return matches
}

/** Phone, or a window narrow enough to be treated as one. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}

/** Too narrow for a full sidebar, but still a two-dimensional layout. */
export function useIsNarrow(): boolean {
  return useMediaQuery(`(max-width: ${NARROW_BREAKPOINT - 1}px)`)
}

/**
 * Whether the pointer is coarse — a finger rather than a mouse.
 *
 * Distinct from width on purpose. Hover affordances should be gated on this,
 * not on how wide the window is: a touch laptop is wide and cannot hover, and
 * a small window on a desktop is narrow and can.
 */
export function useIsTouch(): boolean {
  return useMediaQuery('(hover: none), (pointer: coarse)')
}
