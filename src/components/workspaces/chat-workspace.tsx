'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { PromptComposer } from './prompt-composer'
import { AmbientBackdrop } from './home-workspace'
import { ChatMessageView } from './chat-message'
import { ErrorState } from './error-state'
import { EmptyState } from '@/components/ui'
import { useChat, type ChatMessage } from '@/hooks/use-chat'
import { useModels } from '@/hooks/use-models'
import { useWorkspace, type Tab } from '@/store/workspace'
import { useSettings } from '@/store/settings'
import { routeModel } from '@/lib/providers/router'
import { buildCommands, matchCommands, parseCommand } from '@/lib/model-commands'
import { useGeneration } from '@/hooks/use-generation'
import { useConversationHistory } from '@/hooks/use-conversation-history'
import { uid } from '@/lib/utils'
import { titleFrom } from '@/lib/utils'
import { RESEARCH_STYLE, RESPONSE_STYLE } from '@/lib/response-style'
import { effortSpec, withEffort, type Effort } from '@/lib/response-effort'
import { skillIndex } from '@/lib/skills/prompt'
import type { Skill } from '@/lib/db/types'
import type { ChatAttachment, ModelChoice } from '@/lib/providers/types'

interface ChatState {
  messages: ChatMessage[]
  draft: string
  attachments: ChatAttachment[]
  model: ModelChoice | null
  /** How much answer to ask for. Starts from the saved preference. */
  effort?: Effort
  /** Set once the transcript has been filed in History. */
  conversationId?: string
  seed?: string
  seedAttachments?: ChatAttachment[]
  seedConsumed?: boolean
}

/**
 * The chat workspace.
 *
 * Everything that makes a turn — the transcript, the draft, the chosen model —
 * lives in this tab's state, so the conversation is exactly where you left it
 * when you come back, mid-stream or not.
 */
export function ChatWorkspace({ tab, mode = 'chat' }: { tab: Tab; mode?: 'chat' | 'research' }) {
  const state = tab.state as Partial<ChatState>
  const patchState = useWorkspace((s) => s.patchState)
  const renameTab = useWorkspace((s) => s.renameTab)
  const openTab = useWorkspace((s) => s.openTab)
  const privacy = useSettings((s) => s.privacy)

  const messages = useMemo(() => state.messages ?? [], [state.messages])
  const draft = state.draft ?? ''
  const attachments = state.attachments ?? []
  const model = state.model ?? null

  const activeProjectId = useSettings((s) => s.activeProjectId)
  const defaultEffort = useSettings((s) => s.responseEffort)
  const setSetting = useSettings((s) => s.set)
  const effort = state.effort ?? defaultEffort

  // The shelf, not its contents: only names and descriptions reach the model
  // until one is asked for.
  const { data: skills } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => ((await (await fetch('/api/skills')).json()) as { skills: Skill[] }).skills,
    staleTime: 30_000,
  })
  const enabledSkills = useMemo(() => (skills ?? []).filter((k) => k.enabled), [skills])

  const customInstructions = useSettings((s) => s.customInstructions)

  const style = useMemo(() => {
    const parts = [withEffort(mode === 'research' ? RESEARCH_STYLE : RESPONSE_STYLE, effort)]
    const index = skillIndex(enabledSkills)
    if (index) parts.push(index)
    // Last, so a standing instruction wins over the house style it contradicts.
    if (customInstructions?.trim()) {
      parts.push(`## Standing instructions from the person you are talking to\n\n${customInstructions.trim()}`)
    }
    return parts.join('\n\n')
  }, [mode, effort, enabledSkills, customInstructions])

  const { data: catalogue } = useModels(attachments.length ? 'VISION' : 'CHAT')
  // Every model, not just the chat ones: `/soul` has to be typeable here.
  const { data: everyModel } = useModels()
  const { send, retry, stop, busy } = useChat(tab.id, messages)
  const { generate } = useGeneration(tab.id)

  const commands = useMemo(
    () => buildCommands(everyModel?.models ?? [], skills ?? []),
    [everyModel?.models, skills],
  )
  const command = useMemo(() => parseCommand(draft, commands), [draft, commands])
  const commandMenu = useMemo(() => matchCommands(draft, commands), [draft, commands])
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  const patch = useCallback(
    (next: Partial<ChatState>) => patchState(tab.id, next),
    [patchState, tab.id],
  )

  // The tab holds the working copy; History holds the durable one. Turns are
  // filed as they complete, so closing this tab no longer discards it.
  useConversationHistory({
    conversationId: state.conversationId,
    title: tab.title,
    messages,
    busy,
    projectId: activeProjectId ?? undefined,
    onConversation: useCallback((id: string) => patch({ conversationId: id }), [patch]),
  })

  // The router resolves provider + model per turn, honouring private mode.
  const route = useMemo(
    () =>
      routeModel({
        task: attachments.length ? 'vision' : 'chat',
        privacy,
        preferred: model,
        available: catalogue?.models ?? [],
      }),
    [attachments.length, privacy, model, catalogue?.models],
  )

  /**
   * Runs a `/model` command in place.
   *
   * A generative model produces an image here rather than sending you to the
   * Create tab — the point of typing it in chat is to stay in chat. A chat model
   * simply answers this turn.
   */
  const runCommand = useCallback(
    async (parsed: NonNullable<typeof command>) => {
      const prompt = parsed.rest.trim()
      patch({ draft: '', attachments: [] })

      // A skill named by hand skips the asking: you have already decided, so
      // its instructions go in from the first token rather than after a round
      // trip to find out whether the model agrees.
      if (parsed.command.kind === 'skill') {
        if (!prompt) {
          patch({ draft: `${parsed.command.command} ` })
          return
        }
        if (!route.ok) return
        if (messages.length === 0) renameTab(tab.id, titleFrom(prompt, 'Chat'))

        await send({
          text: prompt,
          providerId: route.providerId,
          model: route.model.id,
          modelName: route.model.name,
          systemPrompt: style,
          maxTokens: effortSpec(effort).maxTokens,
          forcedSkill: parsed.command.skill,
        })
        return
      }

      const { model } = parsed.command

      if (!prompt) {
        // No prompt yet — treat it as choosing the model for what comes next.
        patch({ model: { providerId: model.providerId, modelId: model.id } })
        return
      }

      if (!parsed.command.generates) {
        await send({
          text: prompt,
          providerId: model.providerId,
          model: model.id,
          modelName: model.name,
          systemPrompt: style,
          maxTokens: effortSpec(effort).maxTokens,
          skills: enabledSkills,
        })
        return
      }

      if (messages.length === 0) renameTab(tab.id, titleFrom(prompt, 'Image'))

      const job = await generate({
        providerId: model.providerId,
        model: model.id,
        prompt,
        params: {},
        referenceImages: attachments.length ? attachments.map((a) => a.url) : undefined,
        kind: model.capabilities.includes('VIDEO_GENERATION') ? 'video' : 'image',
      })

      const now = Date.now()
      patch({
        messages: [
          ...messages,
          { id: uid(), role: 'user', content: prompt, createdAt: now },
          {
            id: uid(),
            role: 'assistant',
            content: '',
            providerId: model.providerId,
            model: model.id,
            modelName: model.name,
            createdAt: now,
            generation: job
              ? { jobId: job.id, prompt, modelName: model.name }
              : undefined,
            error: job
              ? undefined
              : {
                  code: 'PROVIDER_ERROR',
                  message: `${model.name} could not start.`,
                  retryable: true,
                },
          },
        ],
      })
    },
    [patch, send, messages, renameTab, tab.id, generate, attachments, effort, style, enabledSkills, route],
  )

  const submit = useCallback(
    async (text: string, files: ChatAttachment[]) => {
      if (command) return runCommand(command)
      if (!route.ok) return
      patch({ draft: '', attachments: [] })

      if (messages.length === 0) {
        renameTab(tab.id, titleFrom(text, mode === 'research' ? 'Research' : 'Chat'))
      }

      await send({
        text,
        attachments: files.length ? files : undefined,
        providerId: route.providerId,
        model: route.model.id,
        modelName: route.model.name,
        systemPrompt: style,
        maxTokens: effortSpec(effort).maxTokens,
        skills: enabledSkills,
      })
    },
    [route, patch, messages.length, renameTab, tab.id, mode, send, command, runCommand, effort, style, enabledSkills],
  )

  // Consume a prompt handed over from Home, exactly once.
  useEffect(() => {
    if (!state.seed || state.seedConsumed || !route.ok) return
    patch({ seedConsumed: true })
    void submit(state.seed, state.seedAttachments ?? [])
  }, [state.seed, state.seedConsumed, route.ok, patch, submit, state.seedAttachments])

  // Follow the stream, unless the reader has scrolled up to read something.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinnedToBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <div className="relative flex h-full flex-col">
      {/*
        The same ambient wash as Home. A conversation is the other place you sit
        for a long time, and a flat canvas behind it reads as a different
        application to the one you started in.
      */}
      <AmbientBackdrop />

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-[760px] px-8 pb-8 pt-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[46vh] items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title={mode === 'research' ? 'What should KOVAI look into?' : 'Start the conversation.'}
                line={
                  mode === 'research'
                    ? 'Ask a question and KOVAI will answer with its reasoning and its limits stated.'
                    : privacy === 'PRIVATE'
                      ? 'Private mode is on — this conversation stays on your machine.'
                      : 'Ask a question, paste an image, or pick a model below.'
                }
              />
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessageView
                key={message.id}
                message={message}
                onRetry={
                  message.id === lastAssistant?.id && route.ok
                    ? () =>
                        void retry({
                          text: '',
                          providerId: route.providerId,
                          model: route.model.id,
                          modelName: route.model.name,
                        })
                    : undefined
                }
                onUseAsPrompt={(text) =>
                  openTab({ kind: 'create', title: 'Image — from chat', state: { prompt: text } })
                }
              />
            ))
          )}
        </div>
      </div>

      <div className="relative shrink-0 px-8 pb-6">
        <div className="mx-auto max-w-[760px]">
          {!route.ok && (
            <ErrorState
              className="mb-2.5"
              compact
              error={{
                code: route.code === 'PRIVACY_BLOCKED' ? 'RUNTIME_OFFLINE' : 'UNCONFIGURED',
                message: route.message,
                detail:
                  route.action?.kind === 'START_RUNTIME'
                    ? 'Start the local runtime, or switch off private mode to use cloud models.'
                    : 'Add provider credentials in Settings → Providers.',
                retryable: false,
              }}
            />
          )}

          {commandMenu.length > 0 && (
            <div className="mb-2 overflow-hidden rounded-[12px] border border-line bg-surface shadow-[--shadow-panel]">
              {commandMenu.map((entry) => (
                <button
                  key={entry.command}
                  onClick={() => patch({ draft: `${entry.command} ` })}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-subtle"
                >
                  <code className="shrink-0 font-mono text-[12px] text-accent">{entry.command}</code>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {entry.kind === 'skill' ? entry.skill.description : entry.model.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-faint">
                    {entry.kind === 'skill'
                      ? 'skill'
                      : `${entry.generates ? 'generates' : 'chat'} · ${entry.model.providerId}`}
                  </span>
                </button>
              ))}

              {/* Taught where it is relevant: the moment you are looking at one
                  list is the moment the other one is worth knowing about. */}
              <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-faint">
                {commandMenu[0]?.kind === 'skill'
                  ? 'Type // for models'
                  : 'Type / for skills'}
              </p>
            </div>
          )}

          <PromptComposer
            value={draft}
            onChange={(draft) => patch({ draft })}
            onSubmit={() => void submit(draft, attachments)}
            onStop={stop}
            busy={busy}
            capability={attachments.length ? 'VISION' : 'CHAT'}
            model={model}
            onModelChange={(model) => patch({ model })}
            effort={effort}
            onEffortChange={(effort) => {
              // Set on this conversation, and remembered as the preference for
              // the next one — choosing it once per chat is the thing nobody
              // wants to do.
              patch({ effort })
              setSetting('responseEffort', effort)
            }}
            attachments={attachments}
            onAttachmentsChange={(attachments) => patch({ attachments })}
            placeholder={mode === 'research' ? 'What should KOVAI research?' : 'Ask KOVAI anything…'}
            hint={
              command ? (
                <span className="text-accent">
                  {command.command.kind === 'skill'
                    ? `${command.command.skill.name} · skill`
                    : `${command.command.model.name}${command.command.generates ? ' · generates' : ''}`}
                </span>
              ) : route.ok && route.substituted && route.reason ? (
                <span className="text-warn">{route.reason}</span>
              ) : null
            }
          />
        </div>
      </div>
    </div>
  )
}
