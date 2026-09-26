'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Images, Search } from 'lucide-react'
import { cn, relativeTime } from '@/lib/utils'
import type { Asset } from '@/lib/db/types'

/**
 * The `@` picker.
 *
 * Attaching something you already have should not mean leaving the composer,
 * finding it in the library, downloading it and dragging it back. Typing `@`
 * searches what is already saved and puts it straight into the message.
 *
 * Previews are the whole point: an asset list without thumbnails is a list of
 * filenames, and nobody recognises their own work from `a3f2-final-v2`.
 */

export interface AssetMention {
  id: string
  name: string
  url: string
  kind: Asset['kind']
}

/** Matches an `@query` the caret is currently inside. */
export function findMention(value: string, caret: number): { query: string; from: number } | null {
  const before = value.slice(0, caret)
  const match = /(?:^|\s)@([^\s@]{0,40})$/.exec(before)
  if (!match) return null
  return { query: match[1] ?? '', from: caret - match[1].length - 1 }
}

export function AssetMentionMenu({
  query,
  onPick,
  onDismiss,
}: {
  query: string
  onPick: (asset: AssetMention) => void
  onDismiss: () => void
}) {
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const { data: assets, isLoading } = useQuery({
    queryKey: ['assets', 'all'],
    queryFn: async () => ((await (await fetch('/api/assets')).json()) as { assets: Asset[] }).assets,
    staleTime: 30_000,
  })

  const matches = useMemo(() => {
    const all = (assets ?? []).filter((a) => a.kind !== 'document')
    if (!query.trim()) return all.slice(0, 8)
    const q = query.toLowerCase()
    return all
      .filter((a) => `${a.name} ${a.description ?? ''} ${a.model ?? ''}`.toLowerCase().includes(q))
      .slice(0, 8)
  }, [assets, query])

  useEffect(() => setIndex(0), [query])

  // Arrow keys and Enter are bound on the window so the textarea keeps focus —
  // a picker that steals the caret makes you click back before you can keep typing.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!matches.length) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setIndex((i) => (i + 1) % matches.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setIndex((i) => (i - 1 + matches.length) % matches.length)
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const asset = matches[index]
        if (asset) onPick({ id: asset.id, name: asset.name, url: asset.url, kind: asset.kind })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [matches, index, onPick, onDismiss])

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 z-30 mb-2 w-[340px] overflow-hidden rounded-[14px] border border-line bg-elevated shadow-[--shadow-float]"
    >
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Search className="h-[12px] w-[12px] text-ink-faint" />
        <span className="text-[12px] text-ink-muted">
          {query ? `Assets matching “${query}”` : 'Your assets'}
        </span>
      </div>

      <div className="max-h-[260px] overflow-y-auto p-1.5">
        {isLoading ? (
          <div className="space-y-1.5 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[40px] rounded-[9px] shimmer" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <p className="flex items-center gap-2 px-2.5 py-5 text-[12.5px] text-ink-faint">
            <Images className="h-[13px] w-[13px]" />
            {query ? 'Nothing matched.' : 'No assets saved yet.'}
          </p>
        ) : (
          matches.map((asset, i) => (
            <button
              key={asset.id}
              onMouseEnter={() => setIndex(i)}
              onClick={() => onPick({ id: asset.id, name: asset.name, url: asset.url, kind: asset.kind })}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors',
                i === index ? 'bg-subtle' : 'hover:bg-subtle',
              )}
            >
              <span className="h-[34px] w-[34px] shrink-0 overflow-hidden rounded-[8px] border border-line bg-subtle">
                {asset.kind === 'video' ? (
                  <video src={asset.url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.thumbnailUrl ?? asset.url} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{asset.name}</span>
                <span className="block truncate text-[10.5px] text-ink-faint">
                  {[asset.model, asset.origin, relativeTime(asset.createdAt)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * The highlight layer behind the composer's text.
 *
 * A textarea cannot colour part of its own value, so the value is mirrored in a
 * div underneath it with identical typography and padding. The mirror paints a
 * tinted, dotted-underlined box behind every `@mention` and is otherwise
 * invisible; the real text sits on top and stays fully editable.
 *
 * Deriving the highlight from the text rather than from picker state means it
 * survives a reload, a paste, and hand-editing the name — the three cases where
 * a remembered list of chips silently goes stale.
 */
export function MentionHighlight({
  value,
  names,
  className,
  scrollTop = 0,
}: {
  value: string
  names: string[]
  className?: string
  scrollTop?: number
}) {
  const parts = useMemo(() => splitMentions(value, names), [value, names])

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words', className)}
    >
      <div style={{ transform: `translateY(${-scrollTop}px)` }}>
        {parts.map((part, i) =>
          part.mention ? (
            <span
              key={i}
              className="rounded-[4px] bg-accent-soft/80 text-transparent decoration-dotted decoration-from-font underline underline-offset-[3px] decoration-accent/70"
              style={{ boxShadow: '0 0 0 1px color-mix(in srgb, var(--color-accent) 22%, transparent)' }}
            >
              {part.text}
            </span>
          ) : (
            <span key={i} className="text-transparent">
              {part.text}
            </span>
          ),
        )}
        {/* A trailing newline is not rendered by a div; this keeps the mirror
            the same height as the textarea when the value ends in one. */}
        {value.endsWith('\n') && <span> </span>}
      </div>
    </div>
  )
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Splits `value` into plain and `@mention` runs, longest known name first. */
export function splitMentions(value: string, names: string[]): { text: string; mention: boolean }[] {
  const known = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length).map(escapeRegExp)
  const pattern = new RegExp(known.length ? `@(?:${known.join('|')})` : '@[^\\s@]+', 'g')

  const parts: { text: string; mention: boolean }[] = []
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > cursor) parts.push({ text: value.slice(cursor, start), mention: false })
    parts.push({ text: match[0], mention: true })
    cursor = start + match[0].length
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), mention: false })
  return parts
}

/**
 * The chips shown under the composer for each mentioned asset.
 *
 * Dotted underline plus the accent colour, so a reference reads as a live
 * pointer to something rather than as text that happens to be coloured.
 */
export function MentionChips({
  mentions,
  onRemove,
}: {
  mentions: AssetMention[]
  onRemove: (id: string) => void
}) {
  if (!mentions.length) return null

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pt-3">
      {mentions.map((mention) => (
        <span
          key={mention.id}
          className="group inline-flex items-center gap-1.5 rounded-[9px] border border-dashed border-accent/45 bg-accent-soft/70 py-[3px] pl-[3px] pr-2"
        >
          <span className="h-[20px] w-[20px] overflow-hidden rounded-[6px] border border-accent/25">
            {mention.kind === 'video' ? (
              <video src={mention.url} className="h-full w-full object-cover" muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mention.url} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="max-w-[150px] truncate text-[11.5px] font-medium text-accent underline decoration-dotted decoration-from-font underline-offset-[3px]">
            @{mention.name}
          </span>
          <button
            onClick={() => onRemove(mention.id)}
            className="text-[13px] leading-none text-accent/60 transition-colors hover:text-accent"
            aria-label={`Remove ${mention.name}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
