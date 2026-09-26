'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Boxes,
  Cpu,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Sparkles,
  Telescope,
  Workflow as WorkflowIcon,
} from 'lucide-react'
import { PromptComposer } from './prompt-composer'
import { useWorkspace, type Tab } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { DEFAULT_APPEARANCE } from '@/lib/appearance'
import { useJobs } from '@/store/jobs'
import { MarketsTile, NewsTile, NotesTile, TasksTile } from './bento'
import { classifyIntent, destinationLabel, type Destination } from '@/lib/intent'
import { matchSlash, parseSlash, SLASH_COMMANDS, type SlashCommand } from '@/lib/slash-commands'
import { cn, greeting, relativeTime, truncate } from '@/lib/utils'
import type { Project } from '@/lib/db/types'
import type { ChatAttachment, ModelChoice } from '@/lib/providers/types'

interface HomeState {
  draft: string
  attachments: ChatAttachment[]
  pinnedDestination: Destination | null
  model: ModelChoice | null
}

/** One-tap starting points, in the order most people reach for them. */
const SUGGESTIONS: { label: string; destination: Destination; command?: SlashCommand }[] = [
  { label: 'Create an image', destination: 'create' },
  { label: 'Read an image', destination: 'vision' },
  { label: 'Research something', destination: 'research' },
  { label: 'Write a script', destination: 'chat' },
  { label: 'Build a workflow', destination: 'workflow' },
]

/**
 * Home.
 *
 * A calm, full-bleed surface: an ambient wash, the greeting, one composer, and
 * beneath it the three things worth coming back to — work in progress, what is
 * running locally, and recent conversations. Everything else lives a click away
 * rather than competing here.
 */
export function HomeWorkspace({ tab }: { tab: Tab }) {
  const state = tab.state as Partial<HomeState>
  const patchState = useWorkspace((s) => s.patchState)
  const openTab = useWorkspace((s) => s.openTab)
  const displayName = useSettings((s) => s.displayName)

  const draft = state.draft ?? ''
  const attachments = state.attachments ?? []
  const pinned = state.pinnedDestination ?? null
  const model = state.model ?? null

  const patch = (next: Partial<HomeState>) => patchState(tab.id, next)

  const slash = useMemo(() => parseSlash(draft), [draft])
  const slashMenu = useMemo(() => matchSlash(draft), [draft])
  const intent = useMemo(() => classifyIntent(draft, attachments.length > 0), [draft, attachments.length])
  const destination = slash?.command.destination ?? pinned ?? intent.destination

  /** Opens a workspace with whatever is already written. */
  const go = (to: Destination, text: string, command?: SlashCommand) => {
    const prompt = command?.prefix && text ? command.prefix + text : text
    const title = truncate(text || destinationLabel(to), 28)

    switch (to) {
      case 'create':
        openTab({
          kind: 'create',
          title: `${command?.kind === 'video' ? 'Video' : 'Image'} — ${title}`,
          state: {
            prompt,
            references: attachments.map((a) => a.url),
            wantsVideo: command?.kind === 'video',
          },
        })
        break
      case 'vision':
        openTab({ kind: 'vision', title: `Vision — ${title}`, state: { images: attachments, question: prompt } })
        break
      case 'research':
        openTab({ kind: 'research', title: `Research — ${title}`, state: { seed: prompt, model } })
        break
      case 'workflow':
        openTab({ kind: 'workflows', title: 'Workflows', state: { seed: prompt } })
        break
      default:
        openTab({ kind: 'chat', title, state: { seed: prompt, seedAttachments: attachments, model } })
    }

    patch({ draft: '', attachments: [], pinnedDestination: null })
  }

  const dispatch = () => {
    if (slash) return go(slash.command.destination, slash.rest, slash.command)
    if (!draft.trim() && !attachments.length) return
    go(destination, draft.trim())
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <HomeBackdrop />

      <div className="relative mx-auto flex min-h-full w-full max-w-[1120px] flex-col items-center px-8 pb-12 pt-[13vh]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <h1 className="text-center text-[30px] font-medium leading-[1.25] tracking-[-0.03em] text-ink">
            {greeting(displayName).replace(/\.$/, '')}
            <br />
            <span className="text-ink-muted">What are you creating today?</span>
          </h1>

          <div className="mx-auto mt-8 w-full max-w-[620px]">
            {slashMenu.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-2 overflow-hidden rounded-[18px] border border-line bg-surface/90 shadow-[--shadow-float] backdrop-blur-xl"
              >
                {slashMenu.map((command) => (
                  <button
                    key={command.command}
                    onClick={() => patch({ draft: `${command.command} ` })}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-subtle"
                  >
                    <code className="font-mono text-[12px] text-accent">{command.command}</code>
                    <span className="text-[13px] text-ink">{command.label}</span>
                    <span className="ml-auto truncate text-[11.5px] text-ink-faint">{command.hint}</span>
                  </button>
                ))}
              </motion.div>
            )}

            <PromptComposer
              value={draft}
              onChange={(draft) => patch({ draft })}
              onSubmit={dispatch}
              attachments={attachments}
              onAttachmentsChange={(attachments) => patch({ attachments })}
              model={model}
              onModelChange={(model) => patch({ model })}
              capability={attachments.length ? 'VISION' : 'CHAT'}
              placeholder="Message KOVAI, or type / for a command…"
              autoFocus
              className="rounded-[26px] border-line/80 bg-surface/85 shadow-[--shadow-float] backdrop-blur-xl"
              hint={
                slash ? (
                  <span className="inline-flex items-center gap-1 text-accent">
                    {slash.command.label}
                    <ArrowRight className="h-[10px] w-[10px]" />
                  </span>
                ) : draft.trim() || attachments.length ? (
                  <span className="inline-flex items-center gap-1">
                    {destinationLabel(destination)}
                    <ArrowRight className="h-[10px] w-[10px]" />
                  </span>
                ) : null
              }
            />

            <div className="-mx-8 mt-3.5 flex flex-nowrap items-center justify-center gap-1.5 overflow-x-auto px-8 no-scrollbar">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion.label}
                  onClick={() => go(suggestion.destination, draft.trim(), suggestion.command)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-line/70 bg-surface/75 px-3.5 py-[7px] text-[12.5px] text-ink-muted backdrop-blur-md transition-all duration-150 hover:border-line-strong hover:text-ink"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-14 w-full pb-4"
        >
          {/*
            A bento rather than a row of equal cards: the tiles answer different
            questions and deserve different weight. News is the tallest because
            it is the one you scan; the rest are glanceable.
          */}
          {/*
            Column count follows the space, not a single breakpoint: four columns
            at 900px squeezed "Pick default news sources" into one word per line.
            Auto rows rather than a fixed height, because a tile that clips its
            own content is worse than a grid that is a little taller.
          */}
          <div className="grid grid-cols-1 gap-3 auto-rows-[minmax(210px,auto)] sm:grid-cols-2 xl:grid-cols-4">
            <NewsTile className="sm:col-span-2 xl:row-span-2" />
            <TasksTile />
            <MarketsTile className="xl:row-span-2" />
            <NotesTile className="sm:col-span-2 xl:col-span-1" />
          </div>
        </motion.div>
      </div>
    </div>
  )
}

/**
 * The ambient wash.
 *
 * Drawn rather than photographed: two soft radial fields over the canvas
 * colour. Used anywhere that wants Home's warmth without its scenery — the
 * chat surface, where a photograph behind a long transcript would be noise.
 */
function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 dark:opacity-60"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-cloud) 22%, transparent) 0%, transparent 46%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-90 dark:opacity-50"
        style={{
          background:
            'radial-gradient(120% 70% at 50% -14%, color-mix(in srgb, var(--color-cloud) 30%, transparent) 0%, transparent 60%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[46%] opacity-80 dark:opacity-35"
        style={{
          background:
            'radial-gradient(80% 100% at 50% 128%, color-mix(in srgb, var(--color-warn) 34%, transparent) 0%, transparent 68%)',
        }}
      />
    </div>
  )
}

/**
 * Home's scenery.
 *
 * The same place at two times of day: sunlit for the light theme, moonlit for
 * the dark one. Both images are in the document from the first paint and the
 * swap is a pure opacity crossfade keyed off the `dark` class — no JavaScript
 * reads the theme, so there is no flash of the wrong sky on load, and changing
 * the theme dissolves between day and night rather than cutting.
 *
 * The veil over the top is what makes it a background rather than a photograph
 * with an interface on it. It is mixed from the canvas colour, so it fades to
 * near-white in the light theme and to near-black in the dark one, and it goes
 * opaque before the composer so that nothing anyone has to read is sitting over
 * open water.
 */
/**
 * How much of the canvas colour is laid over the scenery, per theme.
 *
 * The two pictures need very different treatment, which is why this is not one
 * gradient reading a flipping variable. Dark ink on a sunlit beach is legible
 * with almost nothing over it, so the day version is barely veiled and you can
 * actually see where you are. Light ink on a night scene is not: the moon and
 * the lit water are brighter than the text, so the night version needs a real
 * scrim before the words have anywhere to sit.
 *
 * Both end fully opaque before the bento grid, so nothing anyone has to read is
 * ever over open water.
 */
const VEIL = {
  light:
    'linear-gradient(180deg,' +
    ' color-mix(in srgb, var(--color-canvas) 16%, transparent) 0%,' +
    ' transparent 22%,' +
    ' color-mix(in srgb, var(--color-canvas) 24%, transparent) 46%,' +
    ' color-mix(in srgb, var(--color-canvas) 82%, transparent) 62%,' +
    ' var(--color-canvas) 74%)',
  dark:
    'linear-gradient(180deg,' +
    ' color-mix(in srgb, var(--color-canvas) 58%, transparent) 0%,' +
    ' color-mix(in srgb, var(--color-canvas) 42%, transparent) 24%,' +
    ' color-mix(in srgb, var(--color-canvas) 68%, transparent) 44%,' +
    ' color-mix(in srgb, var(--color-canvas) 94%, transparent) 60%,' +
    ' var(--color-canvas) 72%)',
}

/**
 * A softer pool behind the greeting and the composer.
 *
 * The linear veil is an average, and an average is no defence against a bright
 * spot in the wrong place — the moon in the night version sits exactly where
 * "What are you creating today?" is written. This keeps the scenery at the
 * edges and gives the words a backing wherever the picture is busy. It is much
 * lighter by day, where the only thing it has to soften is a palm frond.
 */
const FOCUS = {
  light:
    'radial-gradient(56% 42% at 50% 27%,' +
    ' color-mix(in srgb, var(--color-canvas) 46%, transparent) 0%,' +
    ' color-mix(in srgb, var(--color-canvas) 20%, transparent) 58%,' +
    ' transparent 80%)',
  dark:
    'radial-gradient(58% 44% at 50% 27%,' +
    ' color-mix(in srgb, var(--color-canvas) 64%, transparent) 0%,' +
    ' color-mix(in srgb, var(--color-canvas) 34%, transparent) 55%,' +
    ' transparent 78%)',
}

/** Long enough to read as dusk falling, short enough not to feel broken. */
const FADE = 'opacity 900ms cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * Home's scenery.
 *
 * The same place at two times of day: sunlit for the light theme, moonlit for
 * the dark one. Every layer exists twice and the swap is a pure opacity
 * crossfade keyed off the `dark` class — no JavaScript reads the theme, so
 * there is no flash of the wrong sky on load, and changing the theme dissolves
 * between day and night rather than cutting.
 */
function HomeBackdrop() {
  const appearance = useSettings((s) => s.appearance) ?? DEFAULT_APPEARANCE
  const wallpaper = appearance.wallpaper ?? 'scene'
  const strength = (appearance.wallpaperStrength ?? 100) / 100

  // One of their own replaces both times of day: a picture someone chose is the
  // picture, not a lighting condition to be matched to a theme.
  const custom = wallpaper !== 'scene' && wallpaper !== 'none' ? wallpaper : null

  if (wallpaper === 'none') return <AmbientBackdrop />

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* The picture, at whatever strength was asked for. Kept in its own layer
          so the veils above it stay at full opacity — fading those too would
          take the protection off the text along with the scenery. */}
      <div className="absolute inset-0" style={{ opacity: strength, transition: FADE }}>
        {custom ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={custom} alt="" decoding="async" className="h-full w-full object-cover" />
        ) : (
          [
            { src: '/backdrops/home-light.webp', mode: 'light' as const },
            { src: '/backdrops/home-dark.webp', mode: 'dark' as const },
          ].map(({ src, mode }) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={src}
              src={src}
              alt=""
              decoding="async"
              className={cn(
                'absolute inset-0 h-full w-full object-cover',
                mode === 'dark' ? 'opacity-0 dark:opacity-100' : 'opacity-100 dark:opacity-0',
              )}
              style={{ transition: FADE }}
            />
          ))
        )}
      </div>

      {[
        { key: 'light-focus', background: FOCUS.light, mode: 'light' as const },
        { key: 'dark-focus', background: FOCUS.dark, mode: 'dark' as const },
        { key: 'light-veil', background: VEIL.light, mode: 'light' as const },
        { key: 'dark-veil', background: VEIL.dark, mode: 'dark' as const },
      ].map(({ key, background, mode }) => (
        <div
          key={key}
          className={cn(
            'absolute inset-0',
            mode === 'dark' ? 'opacity-0 dark:opacity-100' : 'opacity-100 dark:opacity-0',
          )}
          style={{ background, transition: FADE }}
        />
      ))}
    </div>
  )
}

export { AmbientBackdrop }
