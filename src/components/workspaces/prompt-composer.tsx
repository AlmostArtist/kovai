'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Image as ImageIcon, Mic, Paperclip, Square, Wrench, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Tooltip } from '@/components/ui'
import { ModelSelector } from './model-selector'
import { EffortSelector } from './effort-selector'
import { useSettings } from '@/store/settings'
import { cn, fileToDataUrl, modKey } from '@/lib/utils'
import {
  AssetMentionMenu,
  MentionChips,
  MentionHighlight,
  findMention,
  type AssetMention,
} from './asset-mention'
import type { Capability, ChatAttachment, ModelChoice } from '@/lib/providers/types'
import type { Effort } from '@/lib/response-effort'

/**
 * The prompt composer.
 *
 * One control does the whole job: type, drop images, choose a model, send.
 * Attachments become data URLs in private mode so an image reaches the local
 * runtime without ever being uploaded to a server.
 */
export function PromptComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  capability = 'CHAT',
  model,
  onModelChange,
  effort,
  onEffortChange,
  attachments,
  onAttachmentsChange,
  placeholder = 'Ask KOVAI anything…',
  autoFocus,
  hint,
  actions,
  className,
  minRows = 1,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop?: () => void
  busy?: boolean
  capability?: Capability
  model: ModelChoice | null
  onModelChange: (choice: ModelChoice | null) => void
  /** Only the surfaces that ask a model for prose offer this. */
  effort?: Effort
  onEffortChange?: (effort: Effort) => void
  attachments?: ChatAttachment[]
  onAttachmentsChange?: (attachments: ChatAttachment[]) => void
  placeholder?: string
  autoFocus?: boolean
  hint?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  minRows?: number
}) {
  const privacy = useSettings((s) => s.privacy)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [mention, setMention] = useState<{ query: string; from: number } | null>(null)
  const [mentions, setMentions] = useState<AssetMention[]>([])
  const [scrollTop, setScrollTop] = useState(0)

  // A chip is only shown while its `@name` is still in the text, so deleting
  // the words deletes the reference — one source of truth instead of two.
  const activeMentions = useMemo(
    () => mentions.filter((m) => value.includes(`@${m.name}`)),
    [mentions, value],
  )
  const mentionNames = useMemo(
    () => [...mentions.map((m) => m.name), ...(attachments ?? []).map((a) => a.name ?? '')],
    [mentions, attachments],
  )

  // The URL is the identity, here and in the keys below. State persisted before
  // attachments were deduplicated can still hold the same image twice, so the
  // render collapses duplicates rather than trusting what it is handed.
  const shown = useMemo(() => {
    const seen = new Set<string>()
    return (attachments ?? []).filter((a) => !seen.has(a.url) && seen.add(a.url))
  }, [attachments])

  /**
   * Replaces the typed `@query` with the asset's name and attaches it.
   *
   * The asset joins `attachments`, so a mentioned image is a real part of the
   * message rather than a label the model never sees.
   */
  const pickMention = useCallback(
    (asset: AssetMention) => {
      const element = textareaRef.current
      const caret = element?.selectionStart ?? value.length
      const active = findMention(value, caret)
      if (active) {
        const next = `${value.slice(0, active.from)}@${asset.name} ${value.slice(caret)}`
        onChange(next)
      }
      setMention(null)
      setMentions((current) =>
        current.some((m) => m.id === asset.id) ? current : [...current, asset],
      )
      // Mentioning the same asset twice is one attachment, not two: the
      // duplicate would be sent to the model and shown twice in the composer.
      if (asset.kind !== 'video' && !(attachments ?? []).some((a) => a.url === asset.url)) {
        onAttachmentsChange?.([
          ...(attachments ?? []),
          { url: asset.url, mimeType: 'image/*', name: asset.name },
        ])
      }
      queueMicrotask(() => element?.focus())
    },
    [value, onChange, attachments, onAttachmentsChange],
  )

  const removeMention = useCallback(
    (id: string) => {
      const asset = mentions.find((m) => m.id === id)
      setMentions((current) => current.filter((m) => m.id !== id))
      if (!asset) return
      // Take the words out with the chip; leaving `@name` behind would send the
      // model a reference to an image that is no longer attached.
      onChange(value.split(`@${asset.name}`).join('').replace(/[ \t]{2,}/g, ' ').trimStart())
      onAttachmentsChange?.((attachments ?? []).filter((a) => a.url !== asset.url))
    },
    [mentions, attachments, onAttachmentsChange, onChange, value],
  )

  const canAttach = Boolean(onAttachmentsChange)

  // Grow with the content, then scroll. A composer that jumps is a composer
  // people stop trusting.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
  }, [value])

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!onAttachmentsChange) return
      const images = [...files].filter((f) => f.type.startsWith('image/'))
      if (!images.length) {
        toast.error('Only images can be attached here.')
        return
      }

      const added: ChatAttachment[] = []
      for (const file of images.slice(0, 5)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name} is over 20 MB.`)
          continue
        }
        try {
          // Private mode keeps the bytes in the browser; online mode uploads so
          // cloud providers can fetch a URL rather than a huge inline payload.
          if (privacy === 'PRIVATE') {
            added.push({ url: await fileToDataUrl(file), mimeType: file.type, name: file.name })
          } else {
            const form = new FormData()
            form.append('file', file)
            const res = await fetch('/api/upload', { method: 'POST', body: form })
            const body = (await res.json()) as { url?: string; error?: { message: string } }
            if (!res.ok || !body.url) {
              toast.error(body.error?.message ?? 'That file could not be attached.')
              continue
            }
            added.push({ url: body.url, mimeType: file.type, name: file.name })
          }
        } catch {
          toast.error(`${file.name} could not be read.`)
        }
      }
      const existing = new Set((attachments ?? []).map((a) => a.url))
      const fresh = added.filter((a) => !existing.has(a.url))
      if (fresh.length) onAttachmentsChange([...(attachments ?? []), ...fresh])
    },
    [attachments, onAttachmentsChange, privacy],
  )

  const submit = () => {
    if (busy || (!value.trim() && !attachments?.length)) return
    onSubmit()
    setMentions([])
    setMention(null)
  }

  return (
    <div
      // Companions placed on the composer find it by this attribute. A fixed
      // overlay cannot reach into the workspace any other way, and the composer
      // moves — tabs change, the sidebar collapses, the box grows as you type.
      data-composer
      className={cn(
        // `relative` anchors the @ picker, which sits above the composer.
        'relative rounded-[14px] border border-line bg-surface shadow-panel transition-colors duration-150 focus-within:border-line-strong',
        className,
      )}
      data-drag-active={dragging || undefined}
      onDragOver={(e) => {
        if (!canAttach) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canAttach) return
        e.preventDefault()
        setDragging(false)
        void addFiles(e.dataTransfer.files)
      }}
    >
      {mention && (
        <AssetMentionMenu
          query={mention.query}
          onPick={pickMention}
          onDismiss={() => setMention(null)}
        />
      )}

      <MentionChips mentions={activeMentions} onRemove={removeMention} />

      {shown.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {shown.filter((a) => !activeMentions.some((m) => m.url === a.url)).map((attachment) => (
            <div
              key={attachment.url}
              className="group relative h-[58px] w-[58px] overflow-hidden rounded-[9px] border border-line"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.url} alt={attachment.name ?? 'Attachment'} className="h-full w-full object-cover" />
              <button
                onClick={() => onAttachmentsChange?.(shown.filter((a) => a.url !== attachment.url))}
                className="absolute right-1 top-1 flex h-[16px] w-[16px] items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove attachment"
              >
                <X className="h-[9px] w-[9px]" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <MentionHighlight
          value={value}
          names={mentionNames}
          scrollTop={scrollTop}
          className="max-h-[260px] px-4 pb-2 pt-3.5 text-[14.5px] leading-[1.6]"
        />

        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          value={value}
          rows={minRows}
          onChange={(e) => {
            onChange(e.target.value)
            setMention(findMention(e.target.value, e.target.selectionStart ?? e.target.value.length))
          }}
          onClick={(e) => {
            const el = e.currentTarget
            setMention(findMention(el.value, el.selectionStart ?? el.value.length))
          }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          onBlur={() => setTimeout(() => setMention(null), 150)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (files.length && canAttach) {
              e.preventDefault()
              void addFiles(files)
            }
          }}
          onKeyDown={(e) => {
            // The picker binds Enter, arrows and Escape while it is open.
            if (mention && ['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) return
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className="relative max-h-[260px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[14.5px] leading-[1.6] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        {canAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Tooltip content="Attach images">
              <Button variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-[14px] w-[14px]" />
              </Button>
            </Tooltip>
          </>
        )}

        {actions}

        <div className="mx-1 h-4 w-px bg-line" />

        <ModelSelector capability={capability} value={model} onChange={onModelChange} compact />

        {effort && onEffortChange && (
          <EffortSelector value={effort} onChange={onEffortChange} compact />
        )}

        <div className="flex-1" />

        {hint && <div className="mr-1.5 truncate text-[11.5px] text-ink-faint">{hint}</div>}

        {busy && onStop ? (
          <Tooltip content="Stop">
            <Button variant="secondary" size="icon" onClick={onStop} aria-label="Stop">
              <Square className="h-[11px] w-[11px] fill-current" />
            </Button>
          </Tooltip>
        ) : (
          <Tooltip content="Send" shortcut="↵">
            <Button
              variant="primary"
              size="icon"
              onClick={submit}
              disabled={busy || (!value.trim() && !attachments?.length)}
              aria-label="Send"
            >
              <ArrowUp className="h-[14px] w-[14px]" />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/** Small pill buttons that sit under the home composer. */
export function ComposerAction({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border px-2.5 text-[12.5px] font-medium transition-all duration-150',
        active
          ? 'border-ink bg-ink text-canvas'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
    >
      <Icon className="h-[13px] w-[13px]" />
      {label}
    </button>
  )
}

export { ImageIcon, Mic, Wrench, modKey }
