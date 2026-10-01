import type { BackgroundSpec } from './types'

/**
 * One gradient, two renderers.
 *
 * The picker needs CSS and the compositor needs canvas calls. Both read the
 * same spec, so a background cannot look like one thing in the swatch and
 * another in the exported file.
 */

/** For `style={{ background: toCss(spec) }}`. */
export function toCss(spec: BackgroundSpec): string {
  const stops = spec.stops.map((s) => `${s.color} ${Math.round(s.at * 100)}%`).join(', ')
  if (spec.kind === 'linear') return `linear-gradient(${spec.angle ?? 180}deg, ${stops})`
  const rx = Math.round((spec.rx ?? 0.75) * 100)
  const ry = Math.round((spec.ry ?? 0.75) * 100)
  const cx = Math.round((spec.cx ?? 0.5) * 100)
  const cy = Math.round((spec.cy ?? 0.5) * 100)
  return `radial-gradient(ellipse ${rx}% ${ry}% at ${cx}% ${cy}%, ${stops})`
}

/** Fills the whole canvas with the gradient. */
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  spec: BackgroundSpec,
  width: number,
  height: number,
): void {
  let gradient: CanvasGradient

  if (spec.kind === 'linear') {
    // CSS measures the angle clockwise from "up"; canvas wants two points.
    // The line is centred on the canvas and long enough to cover the diagonal,
    // which is what stops a steep angle from banding out before the corner.
    const radians = ((spec.angle ?? 180) - 90) * (Math.PI / 180)
    const half = Math.abs(Math.cos(radians) * width) / 2 + Math.abs(Math.sin(radians) * height) / 2
    const cx = width / 2
    const cy = height / 2
    gradient = ctx.createLinearGradient(
      cx - Math.cos(radians) * half,
      cy - Math.sin(radians) * half,
      cx + Math.cos(radians) * half,
      cy + Math.sin(radians) * half,
    )
  } else {
    // An ellipse, drawn as a circle under a scale, because canvas has no
    // elliptical gradient of its own.
    const cx = (spec.cx ?? 0.5) * width
    const cy = (spec.cy ?? 0.5) * height
    const rx = Math.max(1, (spec.rx ?? 0.75) * width)
    const ry = Math.max(1, (spec.ry ?? 0.75) * height)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, ry / rx)
    gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
    for (const stop of spec.stops) gradient.addColorStop(clamp01(stop.at), stop.color)
    ctx.fillStyle = gradient
    // The rect is drawn in the scaled space, so it has to be large enough to
    // still cover the canvas once the squash is undone.
    const reach = Math.max(width, height) * 2
    ctx.fillRect(-reach, -reach, reach * 2, reach * 2)
    ctx.restore()
    return
  }

  for (const stop of spec.stops) gradient.addColorStop(clamp01(stop.at), stop.color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
