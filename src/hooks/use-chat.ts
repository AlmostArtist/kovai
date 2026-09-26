'use client'

import { useCallback, useRef, useState } from 'react'
import { streamChat } from '@/lib/stream-client'
import { useSettings } from '@/store/settings'
import { useWorkspace } from '@/store/workspace'
import { uid } from '@/lib/utils'
import { requestedSkill, skillBody } from '@/lib/skills/prompt'
import type { Skill } from '@/lib/db/types'
import type {
  ChatAttachment,
  ChatMessageInput,
  ProviderId,
  SerializedProviderError,
} from '@/lib/providers/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  attachments?: ChatAttachment[]
  providerId?: ProviderId
  model?: string
  modelName?: string
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  error?: SerializedProviderError
  streaming?: boolean
  /**
   * Set when this turn produced an image or video rather than text. The message
   * watches the job, so a generation started in chat reports its own progress
   * in place instead of sending you to another tab.
   */
  generation?: { jobId: string; prompt: string; modelName: string }
  /** The skill this turn loaded, if it asked for one. */
  skill?: string
  createdAt: number
}

/**
 * Drives one conversation, held in its tab's state.
 *
 * Keeping the transcript in the workspace store is what lets a tab be left mid
 * answer, switched away from and come back to unchanged — and it is why an
 * in-flight response is aborted on the network, not merely hidden.
 */
export function useChat(tabId: string, messages: ChatMessage[]) {
  const patchState = useWorkspace((s) => s.patchState)
  const { privacy, localRuntimeUrl, activeProjectId, useProjectContext } = useSettings()
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const write = useCallback(
    (next: ChatMessage[]) => patchState(tabId, { messages: next }),
    [patchState, tabId],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
  }, [])

  const send = useCallback(
    async (input: {
      text: string
      attachments?: ChatAttachment[]
      providerId: ProviderId
      model: string
      modelName: string
      systemPrompt?: string
      /** Ceiling on the reply, from the effort control. */
      maxTokens?: number
      /** Enabled skills, for the two-level load. */
      skills?: Skill[]
      /** A skill the person named by hand. It goes in without being asked for. */
      forcedSkill?: Skill
      /** Re-send from a given point, used by Retry. */
      history?: ChatMessage[]
    }) => {
      const base = input.history ?? messages

      // The two halves of a turn are created in the same millisecond, and the
      // store orders a transcript by timestamp. On a tie the order fell out of
      // insertion order, so a conversation reopened from History could show the
      // answer above the question that prompted it. A turn is ordered, so the
      // timestamps say so.
      const askedAt = Date.now()
      const userMessage: ChatMessage = {
        id: uid(),
        role: 'user',
        content: input.text,
        attachments: input.attachments,
        createdAt: askedAt,
      }
      const assistantMessage: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        providerId: input.providerId,
        model: input.model,
        modelName: input.modelName,
        streaming: true,
        createdAt: askedAt + 1,
      }

      const withUser = input.text || input.attachments?.length ? [...base, userMessage] : base
      let working = [...withUser, assistantMessage]
      write(working)
      setBusy(true)

      const controller = new AbortController()
      abortRef.current = controller

      const update = (patch: Partial<ChatMessage>) => {
        working = working.map((m) => (m.id === assistantMessage.id ? { ...m, ...patch } : m))
        write(working)
      }

      let text = ''
      let reasoning = ''
      let usage: { inputTokens?: number; outputTokens?: number } = {}
      let failed = false

      const turn = withUser.map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      }))

      /** One pass over the model. Returns what it said. */
      const run = async (extra: ChatMessageInput[]): Promise<string> => {
        let said = ''
        for await (const event of streamChat({
          providerId: input.providerId,
          model: input.model,
          privacy,
          localRuntimeUrl,
          projectId: useProjectContext ? (activeProjectId ?? undefined) : undefined,
          maxTokens: input.maxTokens,
          signal: controller.signal,
          messages: [
            ...(input.systemPrompt ? [{ role: 'system' as const, content: input.systemPrompt }] : []),
            ...turn,
            ...extra,
          ],
        })) {
          if (event.type === 'text') {
            said += event.text
            text += event.text
            update({ content: text })
          } else if (event.type === 'reasoning') {
            reasoning += event.text
            update({ reasoning })
          } else if (event.type === 'usage') {
            usage = {
              inputTokens: (usage.inputTokens ?? 0) + (event.inputTokens ?? 0),
              outputTokens: (usage.outputTokens ?? 0) + (event.outputTokens ?? 0),
            }
            update({ ...usage, costUsd: event.costUsd })
          } else if (event.type === 'error') {
            update({ error: event.error, streaming: false })
            failed = true
            return said
          }
        }
        return said
      }

      try {
        // A skill typed by hand goes in from the first token: the choice has
        // already been made, so asking the model whether it agrees would only
        // add a round trip and a chance of it declining.
        if (input.forcedSkill) update({ skill: input.forcedSkill.name })

        const said = await run(
          input.forcedSkill ? [{ role: 'user', content: skillBody(input.forcedSkill) }] : [],
        )
        if (failed) {
          setBusy(false)
          abortRef.current = null
          return
        }

        // Level 2: it asked for a skill rather than answering. Hand the skill
        // over and let it answer properly. Once only — a model that keeps
        // asking is looping, not working.
        const wanted = input.forcedSkill ? null : requestedSkill(said, input.skills ?? [])
        if (wanted) {
          text = ''
          update({ content: '', skill: wanted.name })
          await run([
            { role: 'assistant', content: said },
            { role: 'user', content: skillBody(wanted) },
          ])
          if (failed) {
            setBusy(false)
            abortRef.current = null
            return
          }
        }

        update({ streaming: false })

        // A local turn bypassed the server entirely, so the ledger only learns
        // about it if we say so. Counts only.
        if (input.providerId === 'local' && text) {
          void fetch('/api/usage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerId: 'local',
              model: input.model,
              kind: input.attachments?.length ? 'vision' : 'chat',
              ...usage,
              projectId: useProjectContext ? (activeProjectId ?? undefined) : undefined,
            }),
          }).catch(() => {})
        }
      } finally {
        // An aborted turn keeps whatever text arrived — it is not lost.
        if (abortRef.current === controller) {
          abortRef.current = null
          setBusy(false)
          update({ streaming: false })
        }
      }
    },
    [messages, write, privacy, localRuntimeUrl, activeProjectId, useProjectContext],
  )

  /** Drop the failed answer and re-ask with the same input. */
  const retry = useCallback(
    async (input: Parameters<typeof send>[0]) => {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      const history = messages.slice(0, messages.findIndex((m) => m.id === lastUser?.id))
      await send({
        ...input,
        text: lastUser?.content ?? input.text,
        attachments: lastUser?.attachments,
        history,
      })
    },
    [messages, send],
  )

  return { send, retry, stop, busy }
}
