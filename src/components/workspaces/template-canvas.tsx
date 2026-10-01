'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Maximize2, RotateCcw, Replace } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui'
import { paintBackground } from '@/lib/templates/gradient'
import { cutout, loadImage } from '@/lib/templates/cutout'
import type { BackgroundSpec } from '@/lib/templates/types'
import { cn } from '@/lib/utils'

/**
 * The composite, still in pieces.
 *
 * The template's output is deliberately not a finished picture. A cutout is
 * never perfect and a crop is a matter of taste, so what comes back is two
 * layers — the scene and the subject — with the subject still movable. Scale
 * it, drag it, drop it onto a different background, or replace it outright and
 * keep the position you had already settled on.
 *
 * Everything is drawn at full resolution into an offscreen canvas and only
 * *shown* scaled down, so what downloads is the size the model produced rather
 * than the size of the preview.
 */

/** The output's proportions. Portrait, matching what the template asks for. */
const RATIO = 3 / 4
const WIDTH = 1536
const HEIGHT = Math.round(WIDTH / RATIO)

export interface Layer {
  /** Centre, as a fraction of the canvas, so it survives a resize. */
  x: number
  y: number
  /** Height as a fraction of the canvas height. Width follows the aspect. */
  scale: number
}

export const DEFAULT_LAYER: Layer = { x: 0.5, y: 0.56, scale: 0.86 }

export function TemplateCanvas({
  subjectUrl,
  background,
  layer,
  onLayerChange,
  onReplace,
  fileName,
}: {
  /** The generated portrait, before cutting out. */
  subjectUrl: string
  background: BackgroundSpec
  layer: Layer
  onLayerChange: (layer: Layer) => void
  onReplace?: () => void
  fileName: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const subjectRef = useRef<HTMLCanvasElement | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [keyed, setKeyed] = useState(true)
  const [dragging, setDragging] = useState(false)

  /* ── The cutout, done once per image ───────────────────────── */

  useEffect(() => {
    let cancelled = false
    setState('loading')

    void (async () => {
      try {
        const image = await loadImage(subjectUrl)
        if (cancelled) return

        const lifted = cutout(image)
        if (lifted) {
          subjectRef.current = lifted.canvas
          setKeyed(true)
        } else {
          // No flat backdrop to key against. Using the image whole is wrong but
          // recoverable; silently returning nothing is neither.
          const whole = document.createElement('canvas')
          whole.width = image.naturalWidth
          whole.height = image.naturalHeight
          whole.getContext('2d')?.drawImage(image, 0, 0)
          subjectRef.current = whole
          setKeyed(false)
        }
        setState('ready')
      } catch {
        if (!cancelled) setState('failed')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [subjectUrl])

  /* ── Painting ──────────────────────────────────────────────── */

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const subject = subjectRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    paintBackground(ctx, background, WIDTH, HEIGHT)
    if (!subject) return

    const height = HEIGHT * layer.scale
    const width = (subject.width / subject.height) * height
    ctx.drawImage(subject, layer.x * WIDTH - width / 2, layer.y * HEIGHT - height / 2, width, height)
  }, [background, layer])

  useEffect(() => {
    if (state === 'ready') paint()
  }, [paint, state])

  /* ── Dragging and scaling ──────────────────────────────────── */

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return
    const box = event.currentTarget.getBoundingClientRect()
    onLayerChange({
      ...layer,
      x: clamp((event.clientX - box.left) / box.width, -0.2, 1.2),
      y: clamp((event.clientY - box.top) / box.height, -0.2, 1.2),
    })
  }

  const download = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error('That image could not be saved.')
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName}.png`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Saved.')
    }, 'image/png')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative mx-auto flex min-h-0 w-full max-w-[420px] flex-1 items-center justify-center">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
          }}
          onPointerMove={move}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className={cn(
            'max-h-full w-auto max-w-full touch-none rounded-[14px] border border-line shadow-panel',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
            state !== 'ready' && 'opacity-0',
          )}
          style={{ aspectRatio: String(RATIO) }}
        />

        {state === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[12.5px] text-ink-faint">Lifting the subject…</p>
          </div>
        )}
        {state === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            <p className="text-[12.5px] text-ink-muted">
              That image could not be read back for editing.
            </p>
          </div>
        )}
      </div>

      {state === 'ready' && (
        <>
          {!keyed && (
            <p className="text-center text-[11.5px] text-warn">
              No flat backdrop was found, so the whole picture is being used as the layer.
            </p>
          )}

          <div className="flex items-center gap-2.5 px-1">
            <Maximize2 className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
            <input
              type="range"
              min={30}
              max={140}
              value={Math.round(layer.scale * 100)}
              onChange={(e) => onLayerChange({ ...layer, scale: Number(e.target.value) / 100 })}
              className="h-[3px] flex-1 accent-[var(--color-accent)]"
              aria-label="Subject size"
            />
            <span className="w-[38px] shrink-0 text-right text-[11.5px] tabular-nums text-ink-faint">
              {Math.round(layer.scale * 100)}%
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="md" onClick={download}>
              <Download className="h-[13px] w-[13px]" />
              Download PNG
            </Button>
            <Button variant="secondary" size="md" onClick={() => onLayerChange(DEFAULT_LAYER)}>
              <RotateCcw className="h-[13px] w-[13px]" />
              Recentre
            </Button>
            {onReplace && (
              <Button variant="ghost" size="md" onClick={onReplace}>
                <Replace className="h-[13px] w-[13px]" />
                Replace layer
              </Button>
            )}
          </div>

          <p className="px-1 text-[11.5px] text-ink-faint">
            Drag the subject to move it. The background stays live — pick another and it changes
            underneath.
          </p>
        </>
      )}
    </div>
  )
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
