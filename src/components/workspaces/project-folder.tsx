'use client'

import { motion } from 'framer-motion'
import { FileText, Image as ImageIcon, MessagesSquare, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Asset } from '@/lib/db/types'

/**
 * A project, drawn as a folder.
 *
 * Three layers in the order a real one has them: a back panel with the tab
 * stepping up on the left, the paper inside it, and a front flap over that. The
 * back is an SVG path rather than a div, because the tab is a step in the
 * silhouette — a notch in one continuous outline — and stacking two rectangles
 * to fake it leaves a seam wherever they meet.
 *
 * The sheets are paper, not photographs: near-white in both themes, with the
 * asset inset so a margin shows around it. A thumbnail bled to the edges reads
 * as a picture lying on the desk; the same thumbnail with a white border reads
 * as a page, which is what is actually in the folder.
 *
 * On hover the flap drops and the paper lifts out of it — the movement a real
 * folder makes when it opens, and the only reason the metaphor earns its space.
 */
export function ProjectFolder({
  name,
  count,
  previews,
  kinds,
  accent,
  onOpen,
}: {
  name: string
  count: string
  previews: Asset[]
  kinds: ('image' | 'video' | 'document' | 'chat')[]
  accent?: string
  onOpen: () => void
}) {
  const sheets = previews.slice(0, 3)

  return (
    <button onClick={onOpen} className="group block w-full text-left" aria-label={`Open ${name}`}>
      <div className="rounded-[16px] p-3 transition-colors duration-200 group-hover:bg-subtle">
        <div className="relative h-[128px] w-full">
          {/* Back panel: one outline, with the tab stepping up on the left. */}
          <svg
            viewBox="0 0 168 128"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            <path
              d="M10 0h46a10 10 0 0 1 7.7 3.6l6.6 8A10 10 0 0 0 78 15h80a10 10 0 0 1 10 10v93a10 10 0 0 1-10 10H10a10 10 0 0 1-10-10V10A10 10 0 0 1 10 0z"
              fill="color-mix(in srgb, var(--color-ink) 8%, var(--color-surface))"
            />
          </svg>

          {/* The paper inside. */}
          {sheets.map((sheet, index) => {
            const offset = index - (sheets.length - 1) / 2
            return (
              <motion.div
                key={sheet.id}
                className="absolute left-1/2 top-[9px] h-[82px] w-[64px] overflow-hidden rounded-[4px] bg-[#f4f4f5] p-[3px] shadow-[0_3px_10px_rgba(0,0,0,0.4)]"
                style={{ zIndex: 2 + index, marginLeft: -32 }}
                initial={false}
                animate={{ rotate: offset * 11, x: offset * 38, y: Math.abs(offset) * 6 }}
                whileHover={{ y: Math.abs(offset) * 6 - 14 }}
                transition={{ type: 'spring', stiffness: 250, damping: 22 }}
              >
                {sheet.kind === 'video' ? (
                  <video
                    src={sheet.url}
                    className="h-full w-full rounded-[2px] object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sheet.thumbnailUrl ?? sheet.url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full rounded-[2px] object-cover"
                  />
                )}
              </motion.div>
            )
          })}

          {/* Front flap. */}
          <motion.div
            className="absolute inset-x-0 bottom-0 h-[68px] overflow-hidden rounded-[10px]"
            style={{
              zIndex: 6,
              background: accent
                ? `linear-gradient(165deg, color-mix(in srgb, ${accent} 34%, var(--flap)) 0%, var(--flap) 68%)`
                : 'var(--flap)',
              // A lit top edge is what separates the flap from the paper behind
              // it; without it the two just abut and the folder goes flat.
              boxShadow:
                '0 -7px 18px rgba(0,0,0,0.38), inset 0 1.5px 0 color-mix(in srgb, var(--color-ink) 26%, transparent)',
              ['--flap' as string]: 'color-mix(in srgb, var(--color-ink) 22%, var(--color-surface))',
            }}
            initial={false}
            whileHover={{ y: 7 }}
            transition={{ type: 'spring', stiffness: 250, damping: 22 }}
          >
            {/* What is inside, as badges along the bottom of the flap. */}
            <div className="absolute bottom-2.5 left-2.5 flex">
              {kinds.slice(0, 4).map((kind, index) => (
                <span
                  key={kind}
                  className="flex h-[23px] w-[23px] items-center justify-center rounded-full border-2 bg-surface"
                  style={{
                    marginLeft: index ? -7 : 0,
                    zIndex: 4 - index,
                    borderColor: 'color-mix(in srgb, var(--color-ink) 22%, var(--color-surface))',
                  }}
                  title={kind}
                >
                  <KindGlyph kind={kind} />
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="px-4 pb-1">
        <p className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-ink">{name}</p>
        <p className="mt-0.5 text-[12px] text-ink-faint">{count}</p>
      </div>
    </button>
  )
}

function KindGlyph({ kind }: { kind: 'image' | 'video' | 'document' | 'chat' }) {
  const className = cn('h-[11px] w-[11px]')
  if (kind === 'image') return <ImageIcon className={cn(className, 'text-accent')} />
  if (kind === 'video') return <Video className={cn(className, 'text-warn')} />
  if (kind === 'chat') return <MessagesSquare className={cn(className, 'text-cloud')} />
  return <FileText className={cn(className, 'text-ink-faint')} />
}
