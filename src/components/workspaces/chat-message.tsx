'use client'

import { Children, isValidElement, memo, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check,
  ChevronDown,
  Copy,
  RefreshCw,
  Sparkles,
  Bookmark,
} from 'lucide-react'
import { Button, ProgressLine, Tooltip } from '@/components/ui'
import { useJobs } from '@/store/jobs'
import { useUI } from '@/store/ui'
import { ErrorState } from './error-state'
import { ChartBlock, parseChartSpec } from './chart-block'
import { KovaiMark } from '../shell/kovai-mark'
import { cn, clockTime, copyText, formatCost, formatNumber } from '@/lib/utils'
import { useSettings } from '@/store/settings'
import type { ChatMessage as Message } from '@/hooks/use-chat'

/**
 * One turn of the conversation.
 *
 * Both sides are laid out the same way: a small face in a left gutter, a name
 * and a time above, and the content flush left underneath. Nothing is a bubble
 * and nothing is right-aligned.
 *
 * That symmetry is the point. A bubble caps how much structure a message can
 * carry — a table, a chart or a copy card inside one looks like it escaped from
 * somewhere — and right-aligning half the conversation means the eye starts
 * each turn in a different place. Flush left, both sides can hold anything, and
 * a long transcript reads down a single edge.
 */
export const ChatMessageView = memo(function ChatMessageView({
  message,
  onRetry,
  onUseAsPrompt,
  onSave,
}: {
  message: Message
  onRetry?: () => void
  onUseAsPrompt?: (text: string) => void
  onSave?: (text: string) => void
}) {
  if (message.role === 'user') return <UserTurn message={message} />
  return (
    <AssistantTurn message={message} onRetry={onRetry} onUseAsPrompt={onUseAsPrompt} onSave={onSave} />
  )
})

/**
 * The shared frame: gutter, byline, content.
 *
 * Mirrored for the two sides. Both keep the same parts in the same order —
 * face, name, time, content — so neither side is a different kind of thing;
 * one simply reads from the right edge inward. The name is always the person's
 * own, because a transcript you come back to in a week should say who was
 * talking rather than "You".
 */
function Turn({
  avatar,
  name,
  at,
  side = 'left',
  children,
}: {
  avatar: React.ReactNode
  name: string
  at: number
  side?: 'left' | 'right'
  children: React.ReactNode
}) {
  const mine = side === 'right'

  return (
    // Each turn arrives rather than appearing. Mount-only — a message that
    // re-animated on every streamed token would shiver for the length of the
    // answer.
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group grid gap-x-3 py-7',
        mine ? 'grid-cols-[minmax(0,1fr)_26px]' : 'grid-cols-[26px_minmax(0,1fr)]',
      )}
    >
      {!mine && <div className="pt-[1px]">{avatar}</div>}

      <div className="min-w-0">
        <header className={cn('mb-1.5 flex items-baseline gap-2', mine && 'flex-row-reverse')}>
          <span className="text-[12.5px] font-semibold tracking-[-0.012em] text-ink">{name}</span>
          {/* Always present, never loud: it answers "when was this" without
              having to be hunted for, and sits at the far edge so it never
              competes with the name. */}
          <span
            className={cn(
              'shrink-0 text-[11px] tabular-nums text-ink-faint',
              // Pushed to whichever edge the name is not on, so the byline
              // spans the column the same way on both sides.
              mine ? 'mr-auto' : 'ml-auto',
            )}
          >
            {clockTime(at)}
          </span>
        </header>

        {children}
      </div>

      {mine && <div className="pt-[1px]">{avatar}</div>}
    </motion.div>
  )
}

function UserTurn({ message }: { message: Message }) {
  const displayName = useSettings((s) => s.displayName)
  // Their own name, not "You" — that fallback only appears if KOVAI was never
  // told one during onboarding.
  const name = displayName.trim() || 'You'

  return (
    <Turn
      name={name}
      at={message.createdAt}
      side="right"
      avatar={
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11.5px] font-semibold uppercase text-ink-faint ring-1 ring-line">
          {name.slice(0, 1)}
        </span>
      }
    >
      {message.attachments && message.attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap justify-end gap-2">
          {message.attachments.map((attachment, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={index}
              src={attachment.url}
              alt={attachment.name ?? 'Attached image'}
              className="h-[84px] w-[84px] rounded-[11px] border border-line object-cover"
            />
          ))}
        </div>
      )}

      {/*
        No ground under it. With nothing filled, what tells the two sides apart
        is which edge they hang from — so the text is set flush right under a
        flush-right byline, and the whole turn reads as one object rather than
        a left-aligned paragraph that happens to sit on the right.
      */}
      {message.content && (
        <p className="ml-auto max-w-[86%] whitespace-pre-wrap text-right text-[15px] leading-[1.65] text-ink-muted">
          {message.content}
        </p>
      )}
    </Turn>
  )
}

function AssistantTurn({
  message,
  onRetry,
  onUseAsPrompt,
  onSave,
}: {
  message: Message
  onRetry?: () => void
  onUseAsPrompt?: (text: string) => void
  onSave?: (text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const empty = !message.content && !message.error && message.streaming

  const copy = async () => {
    if (!(await copyText(message.content))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Turn
      name="KOVAI"
      at={message.createdAt}
      avatar={
        // Where the answer ran is provenance, not identity: it sits on the
        // tooltip for when it matters rather than being read on every turn.
        <span
          className="relative flex h-[26px] w-[26px] items-center justify-center"
          title={`${message.providerId === 'local' ? 'Local' : 'Cloud'} · ${message.modelName ?? message.model ?? ''}`}
        >
          {/* A slow halo while the answer is arriving, and nothing once it has.
              It is the only thing on screen that moves during a long reply. */}
          {message.streaming && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: 'color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
              animate={{ opacity: [0.15, 0.55, 0.15], scale: [0.9, 1.35, 0.9] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <KovaiMark className="relative h-[15px] w-[15px]" />
        </span>
      }
    >
      {/*
        No panel around the answer. Everything inside it that deserves a
        container — a table, a chart, a copy card — already brings its own, and
        wrapping those in a second one was a box inside a box.
      */}
      <div>
          {/* Which skill shaped this answer. Named because an answer that follows
            instructions you cannot see is one you cannot judge. */}
        {message.skill && (
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-[7px] bg-accent-soft px-2 py-[3px] text-[11px] text-accent">
            <Sparkles className="h-[10px] w-[10px]" />
            <span className="font-mono">{message.skill}</span>
          </span>
        )}

        {message.generation && <GeneratedResult generation={message.generation} />}

        {message.reasoning && <ReasoningTrace text={message.reasoning} streaming={message.streaming} />}

        {/* While reasoning streams, the trace is already the progress indicator. */}
        {empty && !message.reasoning ? (
          <ThinkingLine />
        ) : (
          message.content && (
            <div className="prose-kovai max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
                {message.content}
              </ReactMarkdown>
              {message.streaming && (
                <span className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] animate-pulse rounded-full bg-accent align-middle" />
              )}
            </div>
          )
        )}

        {message.error && <ErrorState error={message.error} onRetry={onRetry} className="mt-2" compact />}
      </div>

      {!message.streaming && message.content && (
        <footer className="-ml-1.5 mt-3 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          <Action icon={copied ? Check : Copy} label={copied ? 'Copied' : 'Copy'} onClick={() => void copy()} />
          {onRetry && <Action icon={RefreshCw} label="Regenerate" onClick={onRetry} />}
          {onSave && <Action icon={Bookmark} label="Save as prompt" onClick={() => onSave(message.content)} />}
          {onUseAsPrompt && (
            <Action icon={Sparkles} label="Make an image" onClick={() => onUseAsPrompt(message.content)} />
          )}

          <div className="ml-auto flex min-w-0 items-center gap-2.5 pr-1 text-[11px] text-ink-faint">
            {message.outputTokens !== undefined && (
              <span className="tabular-nums">{formatNumber(message.outputTokens)} tok</span>
            )}
            <span>{message.providerId === 'local' ? 'Free' : formatCost(message.costUsd)}</span>
          </div>
        </footer>
      )}
    </Turn>
  )
}

function Action({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="xs"
        onClick={onClick}
        className="text-ink-faint"
      >
        <Icon className="h-[13px] w-[13px]" />
        <span className="text-[11.5px]">{label}</span>
      </Button>
    </Tooltip>
  )
}

/**
 * A generation, shown where it was asked for.
 *
 * Reads the shared job store rather than holding its own state, so the same
 * progress appears here and in the Activity Center, and closing the tab does
 * not abandon the work.
 */
function GeneratedResult({
  generation,
}: {
  generation: NonNullable<Message['generation']>
}) {
  const job = useJobs((s) => s.jobs[generation.jobId])
  const preview = useUI((s) => s.preview)

  if (!job) {
    return (
      <div className="mb-3 flex items-center gap-2 text-[13px] text-ink-faint">
        <span className="h-[6px] w-[6px] rounded-full bg-accent breathe" />
        Starting {generation.modelName}…
      </div>
    )
  }

  if (job.status === 'FAILED' && job.error) {
    return <ErrorState error={job.error} className="mb-3" compact />
  }

  if (['QUEUED', 'RUNNING'].includes(job.status)) {
    return (
      <div className="mb-3 max-w-[420px]">
        <div className="aspect-[16/10] w-full rounded-[13px] border border-line shimmer" />
        <div className="mt-2 flex items-center gap-2">
          <ProgressLine value={job.progress} className="flex-1" />
          <span className="w-[34px] text-right font-mono text-[11px] tabular-nums text-ink-faint">
            {Math.round(job.progress)}%
          </span>
        </div>
        <p className="mt-1 text-[11.5px] text-ink-faint">
          {generation.modelName} · keeps running if you switch tabs
        </p>
      </div>
    )
  }

  if (!job.outputs.length) return null

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {job.outputs.map((output, index) => (
        <button
          key={output.url}
          onClick={() => preview(`job:${job.id}:${index}`)}
          className="overflow-hidden rounded-[13px] border border-line"
        >
          {output.type === 'video' ? (
            <video src={output.url} controls className="max-h-[340px] max-w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={output.url} alt={generation.prompt} className="max-h-[340px] max-w-full object-contain" />
          )}
        </button>
      ))}
    </div>
  )
}

function ThinkingLine() {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="h-[6px] w-[6px] rounded-full bg-accent breathe" />
      <span className="text-[13.5px] text-ink-faint">Thinking…</span>
    </div>
  )
}

/**
 * The model's reasoning, as a worked-through list rather than a wall of text.
 *
 * Collapsed by default: it is evidence, not the answer. Open, each line reads as
 * a step, which is how the model actually produced it.
 */
function ReasoningTrace({ text, streaming }: { text: string; streaming?: boolean }) {
  const [open, setOpen] = useState(false)

  const steps = useMemo(
    () =>
      text
        .split(/\n+/)
        .map((line) => line.replace(/^[\s*\-•\d.]+/, '').trim())
        .filter((line) => line.length > 1)
        .slice(0, 40),
    [text],
  )

  return (
    <div className="mb-3.5">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-[8px] px-1.5 py-1 text-[12px] text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
      >
        {streaming ? (
          <span className="h-[6px] w-[6px] rounded-full bg-accent breathe" />
        ) : (
          <Check className="h-[12px] w-[12px] text-local" />
        )}
        {streaming ? 'Thinking…' : `Thought through ${steps.length} step${steps.length === 1 ? '' : 's'}`}
        <ChevronDown className={cn('h-[12px] w-[12px] transition-transform', open && 'rotate-180')} />
      </button>

      {/* Opens rather than jumps, and each step arrives just behind the one
          above it, so a twenty-step trace reads as it unrolls. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden pl-4"
          >
            <div className="mt-2 space-y-[7px]">
              {steps.map((step, index) => (
                <motion.li
                  key={index}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.018, 0.3), duration: 0.22 }}
                  className="relative text-[12.5px] leading-[1.55] text-ink-muted"
                >
                  <span className="absolute -left-[21px] top-[6px] h-[5px] w-[5px] rounded-full bg-line-strong" />
                  {step}
                </motion.li>
              ))}
            </div>
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── how each markdown element is drawn ───────────────────── */

const MARKDOWN = {
  /**
   * Every fenced block is handled here rather than in `code`.
   *
   * Doing it the other way round means deciding from inside a `code` element
   * whether you are inline or fenced, which react-markdown no longer tells you.
   * Guessing it from the presence of a language tag is what broke plain ```
   * fences: they have no tag, so they fell through to the inline branch and
   * rendered as naked monospace with no block around them at all.
   *
   * From up here it is unambiguous. A fence is a fence whether or not the model
   * labelled it, and the wrapping <pre> is replaced outright so a chart — which
   * is not text — never inherits prose monospace and a panel.
   */
  pre({ children }: React.ComponentProps<'pre'>) {
    const fence = Children.toArray(children)[0]
    if (!isValidElement<{ className?: string; children?: React.ReactNode }>(fence)) {
      return <pre>{children}</pre>
    }

    const language = /language-(\w+)/.exec(fence.props.className ?? '')?.[1]
    const source = String(fence.props.children ?? '').replace(/\n$/, '')

    if (language === 'chart') {
      const spec = parseChartSpec(source)
      if (spec) return <ChartBlock spec={spec} />
    }
    // `isProse` is what guarantees the language below, so the narrowing has to
    // be written out rather than inferred through it.
    return !language || language in COPY_LABELS ? (
      <CopyCard language={language} source={source} />
    ) : (
      <CodeBlock language={language} source={source} />
    )
  },

  /** Only inline code reaches here; fences are taken by `pre` above. */
  code({ className, children, ...props }: React.ComponentProps<'code'>) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },

  table({ children }: React.ComponentProps<'table'>) {
    return (
      <div className="not-prose my-4 overflow-x-auto rounded-[12px] border border-line">
        <table className="w-full border-collapse text-[13px]">{children}</table>
      </div>
    )
  },
  thead({ children }: React.ComponentProps<'thead'>) {
    return <thead className="bg-subtle">{children}</thead>
  },
  th({ children }: React.ComponentProps<'th'>) {
    return (
      <th className="border-b border-line px-3.5 py-2.5 text-left text-[12px] font-medium tracking-[0.01em] text-ink-muted">
        {children}
      </th>
    )
  },
  td({ children }: React.ComponentProps<'td'>) {
    return <td className="border-b border-line px-3.5 py-2.5 align-top text-ink last:border-0">{children}</td>
  },
  tr({ children }: React.ComponentProps<'tr'>) {
    return <tr className="last:[&>td]:border-b-0 hover:bg-subtle/60">{children}</tr>
  },

  blockquote({ children }: React.ComponentProps<'blockquote'>) {
    return (
      <blockquote className="not-prose my-4 rounded-[12px] border border-line bg-subtle px-4 py-3 text-[13.5px] leading-[1.6] text-ink-muted [&>p]:m-0">
        {children}
      </blockquote>
    )
  },

  a({ href, children }: React.ComponentProps<'a'>) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    )
  },

  img({ src, alt }: React.ComponentProps<'img'>) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={String(src)} alt={alt ?? ''} className="my-4 rounded-[12px] border border-line" />
    )
  },

  /**
   * A rule is never drawn. Models reach for `---` between sections out of
   * habit, and inside a bubble every one of them reads as the answer having
   * ended and another begun. The headings already mark the divisions; this
   * keeps the space they create and drops the line.
   */
  hr() {
    return <div className="h-5" />
  },
}

/**
 * Fences that hold prose meant to be lifted out and used.
 *
 * A generated image prompt, a caption, a headline — the thing you asked for and
 * are going to paste somewhere else. A grey code panel is the wrong container
 * for those: it says "source code, read carefully", when what is wanted is
 * "here it is, take it".
 */
const COPY_LABELS: Record<string, string> = {
  prompt: 'Prompt',
  caption: 'Caption',
  copy: 'Copy',
  tagline: 'Tagline',
  headline: 'Headline',
  text: 'Text',
  txt: 'Text',
}

/**
 * The copy card.
 *
 * Dashed accent border and a tinted ground, the same language the composer uses
 * for a mentioned asset: a dotted edge reads as "this is a handle on something"
 * rather than as a panel of output. The text wraps, because a caption you have
 * to drag sideways to read is not a caption.
 */
function CopyCard({ language, source }: { language?: string; source: string }) {
  const [copied, setCopied] = useState(false)
  const label = COPY_LABELS[language ?? ''] ?? 'Text'

  const copy = async () => {
    if (!(await copyText(source))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="not-prose group/card my-4 overflow-hidden rounded-[12px] border-[1.5px] border-dashed border-accent/60 bg-accent-soft/55 transition-colors duration-200 hover:border-accent/85">
      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-accent">
          {label}
        </span>
        <button
          onClick={() => void copy()}
          className="ml-auto inline-flex items-center gap-1 rounded-[6px] px-1.5 py-[2px] text-[11px] text-accent transition-colors hover:bg-accent/10"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="whitespace-pre-wrap break-words px-3.5 pb-3 pt-1.5 text-[13.5px] leading-[1.6] text-ink">
        {source}
      </p>
    </div>
  )
}

function CodeBlock({ language, source }: { language: string; source: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!(await copyText(source))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="not-prose my-4 overflow-hidden rounded-[12px] border border-line bg-subtle">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] lowercase text-ink-faint">{language}</span>
        <button
          onClick={() => void copy()}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-faint transition-colors hover:text-ink"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[12.5px] leading-[1.65]">
        <code>{source}</code>
      </pre>
    </div>
  )
}
