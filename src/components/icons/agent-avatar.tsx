'use client'

import { Bot } from 'lucide-react'
import { LottieIcon } from './lottie-icon'
import { cn } from '@/lib/utils'

/**
 * An agent's face.
 *
 * The twelve animated faces in /public/icons are the point of this component:
 * an agent you can pick out of a row at a glance has a character before it has
 * said anything. An emoji or an image URL still works, and a bare name still
 * falls back to its initial, so agents made before the faces existed are not
 * suddenly blank.
 *
 * Unlike the navigation icons, these are not mapped onto the theme. A nav icon
 * has to sit quietly in a row of others, so it wears one hue; a face is a
 * portrait, and repainting it in the interface accent throws away the thing
 * that told twelve agents apart.
 */

/** The twelve faces an agent can wear, in the order they are offered. */
export const AGENT_FACES = Array.from({ length: 12 }, (_, i) => `Agent-${i + 1}`)

/** How an agent's face is stored in its `avatar` field. */
export const faceValue = (name: string) => `lottie:${name}`
export const isFace = (avatar?: string) => Boolean(avatar?.startsWith('lottie:'))
export const faceName = (avatar?: string) => (isFace(avatar) ? avatar!.slice('lottie:'.length) : null)

/**
 * The ring colour drawn around a face when its agent is awake.
 *
 * The face itself is left alone, so this is the one place a theme colour
 * touches an agent: a state indicator around the portrait rather than a wash
 * over it.
 */
const RING_COLOURS = [
  'var(--color-accent)',
  'var(--color-cloud)',
  'var(--color-local)',
  'var(--color-warn)',
  'var(--color-danger)',
]

export function faceTint(avatar?: string): string {
  const name = faceName(avatar)
  if (!name) return 'var(--color-accent)'
  const index = Number(name.replace(/\D/g, '')) || 1
  return RING_COLOURS[(index - 1) % RING_COLOURS.length]
}

export function AgentAvatar({
  avatar,
  name,
  className,
  /** Animated faces stop moving when the agent is asleep. */
  asleep,
}: {
  avatar?: string
  name?: string
  className?: string
  asleep?: boolean
}) {
  const face = faceName(avatar)

  if (face) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center overflow-hidden transition-[filter,opacity] duration-300',
          asleep && 'opacity-55 saturate-[0.35]',
          className,
        )}
      >
        <LottieIcon name={face} paint={false} fallback={Bot} className="h-full w-full" />
      </span>
    )
  }

  if (avatar?.startsWith('http') || avatar?.startsWith('/')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar} alt="" className={cn('rounded-[inherit] object-cover', className)} />
    )
  }

  return (
    <span className={cn('inline-flex items-center justify-center leading-none', className)}>
      {avatar || name?.slice(0, 1).toUpperCase() || <Bot className="h-3/5 w-3/5" />}
    </span>
  )
}
