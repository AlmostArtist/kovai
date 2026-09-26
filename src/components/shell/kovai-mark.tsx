import { cn } from '@/lib/utils'

/**
 * The KOVAI mark: an aperture. Four arcs that leave an opening at the centre —
 * a workspace that frames the work rather than filling it. Drawn in currentColor
 * so it inherits the surface it sits on.
 */
export function KovaiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={cn('text-ink', className)} aria-hidden>
      <circle cx="10" cy="10" r="8.6" stroke="currentColor" strokeWidth="1.3" opacity="0.28" />
      <path
        d="M10 1.4a8.6 8.6 0 0 1 8.6 8.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10 18.6A8.6 8.6 0 0 1 1.4 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="10" r="2.9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}
