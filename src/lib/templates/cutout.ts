'use client'

/**
 * Lifting the subject off the flat background.
 *
 * The model was asked to put the subject on one uniform colour, which turns
 * this from a segmentation problem into a keying problem. The difference
 * matters: segmentation needs a model and guesses; keying is arithmetic and
 * is exact wherever the colour really is flat.
 *
 * Four things make the difference between a usable cutout and a bad one, and
 * all four are here:
 *
 * 1. The key colour is *measured*, not assumed. The prompt asks for a specific
 *    magenta; what comes back is near it, not it. Sampling the border means
 *    the key is whatever the model actually painted.
 *
 * 2. Distance is measured in chroma only, ignoring brightness. A backdrop is
 *    never perfectly even — it falls off at the corners and picks up bounce
 *    near the shoulders — and all of that is brightness. Keying on full RGB
 *    distance would leave a dark halo in exactly those places.
 *
 * 3. Background is decided by connectivity, not just by colour. Only pixels
 *    reachable from the edge of the frame are removed, so a magenta shirt
 *    button stays and the subject does not come out full of holes.
 *
 * 4. Spill is suppressed. A saturated backdrop throws colour onto hair and
 *    shoulders; left alone, a cut-out subject carries a pink rim onto their
 *    new background and reads as pasted.
 */

/** How close a pixel's chroma must be to the key before it is fully gone. */
const NEAR = 0.10
/** And how far before it is left completely alone. Between the two it feathers. */
const FAR = 0.26

export interface Cutout {
  canvas: HTMLCanvasElement
  /** The subject's bounds within that canvas, after trimming. */
  width: number
  height: number
}

/**
 * Loads an image the canvas is allowed to read back.
 *
 * Provider outputs are cross-origin, and drawing one onto a canvas taints it
 * — every later `getImageData` throws. Routing through this origin is what
 * makes the pixels readable at all.
 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  const sameOrigin = url.startsWith('/') || url.startsWith('data:') || url.startsWith('blob:')
  const src = sameOrigin ? url : `/api/proxy/image?url=${encodeURIComponent(url)}`

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That image could not be loaded.'))
    image.src = src
  })
}

/** Chroma, as the two colour-difference axes. Brightness deliberately dropped. */
function chroma(r: number, g: number, b: number): [number, number] {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  return [(b - y) / 255, (r - y) / 255]
}

/**
 * Cuts the subject out and returns a trimmed, transparent canvas.
 *
 * Returns null when the image has no flat border to key against — a photograph
 * the user supplied themselves, for instance — so the caller can fall back to
 * using it whole rather than destroying it.
 */
export function cutout(image: HTMLImageElement): Cutout | null {
  const w = image.naturalWidth
  const h = image.naturalHeight
  if (!w || !h) return null

  const source = document.createElement('canvas')
  source.width = w
  source.height = h
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(image, 0, 0)

  const frame = ctx.getImageData(0, 0, w, h)
  const data = frame.data

  const key = sampleKey(data, w, h)
  if (!key) return null

  const [kcb, kcr] = chroma(key[0], key[1], key[2])

  // Soft alpha from chroma distance alone. 0 means "this is the backdrop".
  const soft = new Float32Array(w * h)
  for (let i = 0, p = 0; p < data.length; i++, p += 4) {
    const [cb, cr] = chroma(data[p], data[p + 1], data[p + 2])
    const distance = Math.hypot(cb - kcb, cr - kcr)
    soft[i] = distance <= NEAR ? 0 : distance >= FAR ? 1 : (distance - NEAR) / (FAR - NEAR)
  }

  const reachable = floodFromEdges(soft, w, h)

  // Only what the flood actually reached is allowed to become transparent.
  // Everything else keeps its pixels, however close to the key they are.
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const p = i * 4
      const alpha = reachable[i] ? soft[i] : 1

      if (alpha <= 0) {
        data[p + 3] = 0
        continue
      }

      if (alpha < 1) suppressSpill(data, p, kcb, kcr)
      data[p + 3] = Math.round(alpha * 255)

      if (alpha > 0.12) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) return null

  ctx.putImageData(frame, 0, 0)

  // Trimmed to the subject, with a hair of margin so the feathered edge is not
  // itself clipped. A layer you can position has to start at its own bounds —
  // otherwise half of what you are dragging is empty space.
  const pad = 2
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  const cw = Math.min(w, maxX + pad + 1) - x
  const ch = Math.min(h, maxY + pad + 1) - y

  const trimmed = document.createElement('canvas')
  trimmed.width = cw
  trimmed.height = ch
  const out = trimmed.getContext('2d')
  if (!out) return null
  out.drawImage(source, x, y, cw, ch, 0, 0, cw, ch)

  return { canvas: trimmed, width: cw, height: ch }
}

/**
 * The backdrop colour, measured from the border.
 *
 * A median rather than a mean: one stray pixel of hair reaching the edge drags
 * an average somewhere useless, and a median does not care. If the border is
 * not reasonably uniform there is no key to find, and saying so is better than
 * keying on the average of a photograph.
 */
function sampleKey(data: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []

  const push = (x: number, y: number) => {
    const p = (y * w + x) * 4
    rs.push(data[p])
    gs.push(data[p + 1])
    bs.push(data[p + 2])
  }

  const step = Math.max(1, Math.floor(Math.min(w, h) / 160))
  for (let x = 0; x < w; x += step) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y += step) {
    push(0, y)
    push(w - 1, y)
  }
  if (rs.length < 8) return null

  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const key: [number, number, number] = [median(rs), median(gs), median(bs)]

  // Is the border actually one colour? If most of it sits near the median, it
  // is a backdrop. If it does not, this is a photograph and keying it would
  // punch holes in the sky.
  const [kcb, kcr] = chroma(key[0], key[1], key[2])
  let agree = 0
  for (let i = 0; i < rs.length; i++) {
    const [cb, cr] = chroma(rs[i], gs[i], bs[i])
    if (Math.hypot(cb - kcb, cr - kcr) < FAR) agree++
  }
  if (agree / rs.length < 0.8) return null

  // A flat *grey* border is a studio wall, not a key colour — refusing it stops
  // this from eating a legitimately pale background.
  const saturation = Math.hypot(kcb, kcr)
  return saturation < 0.08 ? null : key
}

/**
 * Marks every backdrop pixel connected to the edge of the frame.
 *
 * Scanline flood fill rather than per-pixel, because a 4K portrait is eight
 * million pixels and a naive stack fill spends its time on bookkeeping.
 */
function floodFromEdges(soft: Float32Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h)
  const stack: number[] = []

  const seed = (x: number, y: number) => {
    const i = y * w + x
    if (!seen[i] && soft[i] < 1) {
      seen[i] = 1
      stack.push(x, y)
    }
  }

  for (let x = 0; x < w; x++) {
    seed(x, 0)
    seed(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    seed(0, y)
    seed(w - 1, y)
  }

  while (stack.length) {
    const y = stack.pop() as number
    const x = stack.pop() as number
    const row = y * w

    let left = x
    while (left > 0 && !seen[row + left - 1] && soft[row + left - 1] < 1) {
      seen[row + left - 1] = 1
      left--
    }
    let right = x
    while (right < w - 1 && !seen[row + right + 1] && soft[row + right + 1] < 1) {
      seen[row + right + 1] = 1
      right++
    }

    for (let i = left; i <= right; i++) {
      if (y > 0) {
        const up = (y - 1) * w + i
        if (!seen[up] && soft[up] < 1) {
          seen[up] = 1
          stack.push(i, y - 1)
        }
      }
      if (y < h - 1) {
        const down = (y + 1) * w + i
        if (!seen[down] && soft[down] < 1) {
          seen[down] = 1
          stack.push(i, y + 1)
        }
      }
    }
  }

  return seen
}

/**
 * Pulls the key colour back out of a partly transparent pixel.
 *
 * Hair at the edge of a magenta backdrop is genuinely part magenta — the light
 * bounced. Keeping it means the subject carries a pink fringe onto whatever
 * they are placed on, which is the single most obvious tell of a bad cutout.
 * The pixel's chroma is moved away from the key, leaving its brightness alone
 * so the strand does not go grey.
 */
function suppressSpill(data: Uint8ClampedArray, p: number, kcb: number, kcr: number): void {
  const r = data[p]
  const g = data[p + 1]
  const b = data[p + 2]
  const [cb, cr] = chroma(r, g, b)

  const length = Math.hypot(kcb, kcr)
  if (length < 1e-4) return

  // How much of this pixel's chroma points along the key's direction.
  const along = (cb * kcb + cr * kcr) / length
  if (along <= 0) return

  const y = 0.299 * r + 0.587 * g + 0.114 * b
  const strength = Math.min(1, along / length)
  const pull = 0.85 * strength

  data[p] = Math.round(r + (y - r) * pull)
  data[p + 1] = Math.round(g + (y - g) * pull)
  data[p + 2] = Math.round(b + (y - b) * pull)
}
