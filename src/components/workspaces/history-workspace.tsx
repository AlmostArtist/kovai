'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, EmptyState, Input, Spinner, Tooltip } from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { useWorkspace, type Tab } from '@/store/workspace'
import { providerLabel } from '@/lib/providers/descriptors'
import { cn, relativeTime } from '@/lib/utils'
import type { ChatMessage } from '@/hooks/use-chat'
import type { Conversation, StoredMessage } from '@/lib/db/types'
import type { ProviderId } from '@/lib/providers/types'

interface ConversationSummary extends Conversation {
  messageCount: number
  preview: string
  model?: string
  providerId?: ProviderId
}

/**
 * History.
 *
 * Tabs are where work happens; this is where it is kept. Every conversation is
 * written to the library as its turns complete, so closing a tab no longer
 * throws the conversation away — it moves here, searchable, and reopens with
 * its whole transcript intact.
 *
 * Grouped by day rather than listed flat, because "the one from yesterday" is
 * how people actually look for a conversation they half remember.
 */
export function HistoryWorkspace({ tab }: { tab: Tab }) {
  const [query, setQuery] = useState('')
  const openTab = useWorkspace((s) => s.openTab)
  const client = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', 'history'],
    queryFn: async () => {
      const res = await fetch('/api/conversations?summaries=1', { cache: 'no-store' })
      if (!res.ok) throw new Error('History could not be loaded.')
      return (await res.json()) as { conversations: ConversationSummary[]; total: number }
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('That conversation could not be deleted.')
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['conversations'] })
      toast.success('Conversation deleted.')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const conversations = useMemo(() => {
    const all = data?.conversations ?? []
    const term = query.trim().toLowerCase()
    if (!term) return all
    return all.filter((c) => `${c.title} ${c.preview}`.toLowerCase().includes(term))
  }, [data?.conversations, query])

  const groups = useMemo(() => groupByDay(conversations), [conversations])

  /** Reopens a conversation in a chat tab, transcript and all. */
  const open = async (conversation: ConversationSummary) => {
    try {
      const res = await fetch(`/api/conversations/${conversation.id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const body = (await res.json()) as { messages: StoredMessage[] }
      openTab({
        kind: 'chat',
        title: conversation.title,
        state: {
          conversationId: conversation.id,
          messages: body.messages.map(toChatMessage),
        },
      })
    } catch {
      toast.error('That conversation could not be opened.')
    }
  }

  return (
    <WorkspaceScroll>
      <WorkspaceHeader
        title="History"
        subtitle={
          isLoading
            ? 'Loading…'
            : `${data?.total ?? 0} conversation${data?.total === 1 ? '' : 's'} kept`
        }
        actions={
          <div className="relative w-full sm:w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              className="pl-8"
            />
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={query ? 'Nothing matched.' : 'No conversations yet.'}
          line={
            query
              ? 'Try a shorter search, or a word from the first message.'
              : 'Conversations are kept here automatically as you have them.'
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([day, rows]) => (
            <section key={day}>
              <h2 className="mb-2.5 text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-faint">
                {day}
              </h2>
              <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
                {rows.map((conversation, index) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      'group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle',
                      index > 0 && 'border-t border-line',
                    )}
                  >
                    <button
                      onClick={() => void open(conversation)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[13.5px] text-ink">
                        {conversation.title}
                      </span>
                      {conversation.preview && (
                        <span className="mt-0.5 block truncate text-[12px] text-ink-faint">
                          {conversation.preview}
                        </span>
                      )}
                    </button>

                    <span className="hidden shrink-0 text-[11.5px] text-ink-faint sm:block">
                      {[
                        `${conversation.messageCount} message${conversation.messageCount === 1 ? '' : 's'}`,
                        conversation.providerId ? providerLabel(conversation.providerId) : null,
                        relativeTime(conversation.updatedAt),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>

                    <Tooltip content="Delete">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => remove.mutate(conversation.id)}
                        aria-label={`Delete ${conversation.title}`}
                      >
                        <Trash2 className="h-[13px] w-[13px]" />
                      </Button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </WorkspaceScroll>
  )
}

/** A stored message, back in the shape the chat tab renders. */
function toChatMessage(message: StoredMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === 'system' ? 'assistant' : message.role,
    content: message.content,
    reasoning: message.reasoning,
    attachments: message.attachments,
    providerId: message.providerId,
    model: message.model,
    modelName: message.model,
    inputTokens: message.inputTokens,
    outputTokens: message.outputTokens,
    costUsd: message.costUsd,
    createdAt: message.createdAt,
  }
}

const DAY = 86_400_000

/** "Today", "Yesterday", then the date — newest group first. */
function groupByDay(conversations: ConversationSummary[]): [string, ConversationSummary[]][] {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const today = midnight.getTime()

  const groups = new Map<string, ConversationSummary[]>()
  for (const conversation of [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const at = conversation.updatedAt
    const label =
      at >= today
        ? 'Today'
        : at >= today - DAY
          ? 'Yesterday'
          : at >= today - 7 * DAY
            ? 'Earlier this week'
            : new Date(at).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'long',
                year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
              })
    const bucket = groups.get(label)
    if (bucket) bucket.push(conversation)
    else groups.set(label, [conversation])
  }
  return [...groups.entries()]
}
