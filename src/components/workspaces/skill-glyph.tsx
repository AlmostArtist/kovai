'use client'

import { cn } from '@/lib/utils'

/**
 * A skill, drawn as the file it is.
 *
 * A page with its corner folded, labelled MD — because that is literally what
 * a skill is on disk, and a file manager whose files do not look like files is
 * just a list with extra spacing. The fold is a real notch in the silhouette
 * rather than a triangle laid on top, so it still reads at 28px.
 *
 * Colour carries state: a skill on the shelf wears the accent, one that is off
 * goes grey. That is the only difference that matters at a glance.
 */
export function SkillGlyph({
  enabled,
  size = 54,
  className,
}: {
  enabled: boolean
  size?: number
  className?: string
}) {
  const tint = enabled ? 'var(--color-accent)' : 'var(--color-ink-faint)'

  return (
    <svg
      viewBox="0 0 44 54"
      width={size * (44 / 54)}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden
    >
      {/* The page, with the top-right corner cut away. */}
      <path
        d="M4 0h24l16 16v34a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z"
        fill={tint}
        opacity={enabled ? 1 : 0.55}
      />
      {/* The fold, lit from the front so it reads as turned over. */}
      <path d="M28 0l16 16H32a4 4 0 0 1-4-4V0z" fill="var(--color-ink)" opacity={0.28} />

      <text
        x="22"
        y="40"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        letterSpacing="0.5"
        fill="var(--color-surface)"
        fontFamily="var(--font-sans)"
      >
        MD
      </text>
    </svg>
  )
}
