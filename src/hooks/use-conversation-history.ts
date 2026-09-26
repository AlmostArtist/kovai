'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { ChatMessage } from './use-chat'

/**
 * Keeps a chat tab's transcript in the library.
 *
 * Tabs already survive a reload, but they are working state: close one and the
 * conversation is gone. History is the durable copy — every turn is written to
 * the store as it completes, so a conversation can be found and reopened long
 * after its tab was closed.
 *
 * Writing happens between turns rather than per token. A streaming message has
 * no final content yet, and saving it would mean either a write per frame or a
 * half-written answer in the record.
 */
export function useConversationHistory({
  conversationId,
  title,
  messages,
  busy,
  projectId,
  onConversation,
}: {
  conversationId?: string
  title: string
  messages: ChatMessage[]
  busy: boolean
  projectId?: string
  /** Called once, with the id the transcript was filed under. */
  onConversation: (id: string) => void
}) {
  /** Ids already written, so a re-render does not re-send the transcript. */
  const saved = useRef(new Set<string>())
  const savedTitle = useRef<string | null>(null)
  const writing = useRef(false)
  /** The conversation the refs above describe. */
  const filedUnder = useRef<string | undefined>(conversationId)

  // A different conversation means none of it has been written yet. The id this
  // hook minted for a brand-new conversation is not a different one, though —
  // resetting on that would re-send the transcript it had just finished saving.
  useEffect(() => {
    if (conversationId === filedUnder.current) return
    filedUnder.current = conversationId
    saved.current = new Set()
    savedTitle.current = null
  }, [conversationId])

  const flush = useCallback(async () => {
    if (writing.current) return
    writing.current = true
    try {
      const id = conversationId ?? filedUnder.current ?? crypto.randomUUID()
      filedUnder.current = id

      if (savedTitle.current !== title) {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, title, projectId }),
        })
        if (!res.ok) return
        savedTitle.current = title
        if (!conversationId) onConversation(id)
      }

      for (const message of messages) {
        if (saved.current.has(message.id) || message.streaming) continue

        // A generation turn's assistant message is an empty shell around a job;
        // the image itself is already filed in the album with its prompt, so
        // there is nothing here worth keeping.
        if (message.role === 'assistant' && !message.content.trim() && !message.error) continue

        const res = await fetch(`/api/conversations/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: message.id,
            role: message.role,
            content: message.content,
            reasoning: message.reasoning,
            attachments: message.attachments,
            providerId: message.providerId,
            model: message.model,
            inputTokens: message.inputTokens,
            outputTokens: message.outputTokens,
            costUsd: message.costUsd,
            error: message.error ? message.error.message : undefined,
            createdAt: message.createdAt,
          }),
        })
        if (res.ok) saved.current.add(message.id)
      }
    } catch {
      // History is a convenience, not the transcript itself — the tab still has
      // every message either way, so a failed write is never surfaced.
    } finally {
      writing.current = false
    }
  }, [conversationId, title, messages, projectId, onConversation])

  useEffect(() => {
    if (busy || !messages.length) return
    void flush()
  }, [busy, messages, flush])
}
