'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Lottie, type LottieHandle } from 'lottie-react'
import { cn } from '@/lib/utils'

/**
 * An animated navigation icon.
 *
 * The source files are full-colour illustrations — a dark stroke carrying the
 * shape plus three to eleven fill colours, and no two icons share a palette.
 * None of that suits a themed interface, so every colour is rewritten: the dark
 * strokes become the current ink, and the rest become the destination's own hue.
 *
 * The rewrite happens on the rendered SVG rather than on the animation data.
 * Recolouring the JSON before handing it to the player looks like the obvious
 * place for it, and it does work for fills — but the player kept drawing strokes
 * in their original colours, which is what left every outline black in dark
 * mode. Painting the SVG makes a smaller claim about how the player works
 * internally, and holds whatever it does.
 *
 * Animations loop continuously — except for anyone who has asked their system
 * for reduced motion, who gets a still first frame instead. A row of icons
 * looping forever with no way to stop them is the exact pattern WCAG 2.2.2
 * exists for, and the player warns about it; honouring the preference someone
 * has already expressed is the answer, rather than adding a switch they would
 * have to find.
 *
 * Looping is a render loop per icon for as long as the rail is on screen —
 * worth knowing if the fans ever spin up, since it is the one cost of having
 * them always in motion.
 */

type LottieJson = Record<string, unknown>
type Channels = [number, number, number]

/** One fetch per icon for the whole session, shared across every mount. */
const cache = new Map<string, Promise<LottieJson | null>>()

function load(name: string): Promise<LottieJson | null> {
  const existing = cache.get(name)
  if (existing) return existing

  const request = fetch(`/icons/${name}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<LottieJson>) : null))
    .catch(() => null)

  cache.set(name, request)
  return request
}

/* ── Colour ───────────────────────────────────────────────── */

/** Perceived lightness, weighted for human sensitivity to green. */
function luminance([r, g, b]: Channels): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Below this, a colour is read as the drawing's structure rather than its fill. */
const INK_THRESHOLD = 0.22

/**
 * Maps one source colour onto the theme.
 *
 * Lightness is the one property these palettes share: the dark parts are the
 * drawing's structure and the rest is its body. So dark goes to ink — which is
 * what makes the whole set invert correctly between themes — and everything else
 * goes to the destination's hue, kept at its original lightness so shading and
 * depth survive.
 */
function toneOf(channels: Channels, ink: Channels, accent: Channels): Channels {
  const light = luminance(channels)
  if (light <= INK_THRESHOLD) return ink

  const t = Math.min(((light - INK_THRESHOLD) / (1 - INK_THRESHOLD)) * 0.82, 0.82)
  return [
    accent[0] + (1 - accent[0]) * t,
    accent[1] + (1 - accent[1]) * t,
    accent[2] + (1 - accent[2]) * t,
  ]
}

/** Parses `#rgb`, `#rrggbb` or `rgb()` into 0–1 channels. */
function toChannels(css: string): Channels | null {
  const value = css.trim()

  const short = /^#([0-9a-f]{3})$/i.exec(value)
  if (short) {
    const [r, g, b] = [...short[1]].map((c) => parseInt(c + c, 16) / 255)
    return [r, g, b]
  }

  const hex = /^#?([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const int = parseInt(hex[1], 16)
    return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255]
  }

  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value)
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]

  return null
}

const toCss = ([r, g, b]: Channels) =>
  `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`

/* ── Painting ─────────────────────────────────────────────── */

const PAINTED = ['fill', 'stroke'] as const
type PaintedAttribute = (typeof PAINTED)[number]

/**
 * What was written where, so a repaint is idempotent.
 *
 * Each element remembers the colour it arrived with and the colour that replaced
 * it. Seeing our own value back means leaving it alone; seeing anything else
 * means the player has redrawn and that value is the new source. Without this
 * the theme's near-white ink would be re-read as a pale body colour on the next
 * pass, and every pass after that would drift further.
 */
const painted = new WeakMap<
  Element,
  Partial<Record<PaintedAttribute, { source: string; written: string }>>
>()

/**
 * Masks and clip paths are drawn in black and white for a reason: those values
 * are the mask, not a colour choice. Tinting one punches a hole in the icon.
 */
function isMaskGeometry(element: Element): boolean {
  return Boolean(element.closest('defs, mask, clipPath, filter, pattern'))
}

function paint(root: Element, ink: Channels, accent: Channels): void {
  root.querySelectorAll('[fill], [stroke]').forEach((element) => {
    if (isMaskGeometry(element)) return

    const memo = painted.get(element) ?? {}
    for (const attribute of PAINTED) {
      const current = element.getAttribute(attribute)
      if (!current || current === 'none') continue

      const previous = memo[attribute]
      const source = previous?.written === current ? previous.source : current

      const channels = toChannels(source)
      if (!channels) continue

      const next = toCss(toneOf(channels, ink, accent))
      if (next !== current) element.setAttribute(attribute, next)
      memo[attribute] = { source, written: next }
    }
    painted.set(element, memo)
  })
}

/* ── Component ────────────────────────────────────────────── */

export function LottieIcon({
  name,
  active,
  accent,
  ink,
  paint: shouldPaint = true,
  className,
  fallback: Fallback,
}: {
  /** File name in /public/icons, without the extension. */
  name: string
  active?: boolean
  /** CSS colour for everything that is not the drawing's structure. */
  accent?: string
  /**
   * Colour for the drawing's structure. Defaults to the theme's ink, which is
   * near-black in light mode and near-white in dark — the element's own text
   * colour is unreliable here, because a muted nav item is grey rather than the
   * ink the outline needs to be.
   */
  ink?: string
  /**
   * Whether to map the animation onto the theme. Off leaves the artwork exactly
   * as it was drawn — which is what you want when the illustration itself is
   * the point, as with the agent faces, rather than an icon that has to sit
   * quietly in a row of others.
   */
  paint?: boolean
  className?: string
  /** Drawn while the animation loads, and if the file is missing. */
  fallback: React.ComponentType<{ className?: string }>
}) {
  const [data, setData] = useState<LottieJson | null>(null)
  const container = useRef<HTMLSpanElement>(null)
  const lottie = useRef<LottieHandle>(null)
  const frame = useRef<number | null>(null)
  const still = useReducedMotion()

  useEffect(() => {
    let alive = true
    void load(name).then((json) => {
      if (alive && json) setData(json)
    })
    return () => {
      alive = false
    }
  }, [name])

  /** Repaints on the next frame, so a burst of mutations costs one pass. */
  const repaint = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      const element = container.current
      const svg = element?.querySelector('svg')
      if (!element || !svg) return

      const inkColour = toChannels(resolve(ink ?? 'var(--color-ink)', element)) ?? [0, 0, 0]
      const tint = accent ? (toChannels(resolve(accent, element)) ?? inkColour) : inkColour
      paint(svg, inkColour, tint)
    })
  }, [accent, ink])

  // The player builds and updates the SVG on its own schedule, so the paint
  // follows it rather than running once and hoping. Only colour attributes are
  // watched: the geometry changes every frame, and observing that would mean a
  // repaint every frame for nothing.
  useEffect(() => {
    const element = container.current
    if (!element || !data || !shouldPaint) return

    repaint()
    const observer = new MutationObserver(repaint)
    observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [...PAINTED],
    })
    return () => {
      observer.disconnect()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [data, repaint, shouldPaint])

  // Ink and accent both move when the theme flips, so the icons are repainted
  // or a light-mode outline stays dark against a dark rail.
  useEffect(() => {
    if (!shouldPaint) return
    const observer = new MutationObserver(repaint)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [repaint, shouldPaint])

  // Starts as soon as it is ready and keeps going, unless the system asked for
  // stillness — in which case the drawing is all of it that is wanted.
  useEffect(() => {
    if (!data) return
    if (still) lottie.current?.pause()
    else lottie.current?.play()
  }, [data, still])

  return (
    <span
      ref={container}
      data-active={active || undefined}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
    >
      {data ? (
        <Lottie
          lottieRef={lottie}
          src={data}
          loop={!still}
          autoplay={!still}
          className="h-full w-full"
        />
      ) : (
        <Fallback className="h-full w-full" />
      )}
    </span>
  )
}

/** Resolves a CSS custom property to a concrete colour. */
function resolve(value: string, element: HTMLElement): string {
  const variable = /^var\((--[^)]+)\)$/.exec(value.trim())
  if (!variable) return value
  return getComputedStyle(element).getPropertyValue(variable[1]).trim() || value
}
