'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Brain, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Input, Tooltip } from '@/components/ui'
import { cn, relativeTime } from '@/lib/utils'
import type { AgentMemory } from '@/lib/db/types'

/**
 * What an agent remembers.
 *
 * Two kinds of thing, deliberately shown together: notes it has been given, and
 * the conversation it has actually had. A memory you cannot read is a memory you
 * cannot trust — if an agent keeps bringing something up, this is where you find
 * out why, and where you can take it away.
 */
export function AgentMemoryPanel({ agentId, agentName }: { agentId: string; agentName: string }) {
  const client = useQueryClient()
  const [note, setNote] = useState('')

  const { data: memories, isLoading } = useQuery({
    queryKey: ['agent-memory', agentId],
    queryFn: async () =>
      ((await (await fetch(`/api/agents/${agentId}/memory?limit=200`)).json()) as {
        memories: AgentMemory[]
      }).memories,
  })

  const invalidate = () => client.invalidateQueries({ queryKey: ['agent-memory', agentId] })

  const addNote = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error('That note could not be saved.')
    },
    onSuccess: () => {
      setNote('')
      void invalidate()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const clear = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agents/${agentId}/memory`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Memory could not be cleared.')
    },
    onSuccess: () => {
      void invalidate()
      toast.success(`${agentName} has forgotten everything.`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const forget = useMutation({
    mutationFn: async (memoryId: string) => {
      const res = await fetch(`/api/agents/${agentId}/memory?memoryId=${memoryId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('That could not be forgotten.')
    },
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(error.message),
  })

  const notes = useMemo(() => (memories ?? []).filter((m) => m.kind === 'note'), [memories])
  const turns = useMemo(
    () => [...(memories ?? []).filter((m) => m.kind === 'message')].reverse(),
    [memories],
  )

  return (
    <div className="mt-3 rounded-[14px] border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Brain className="h-[13px] w-[13px] text-ink-faint" />
        <p className="text-[13.5px] font-medium text-ink">Memory</p>
        <span className="text-[11.5px] text-ink-faint">
          {notes.length} note{notes.length === 1 ? '' : 's'} · {turns.length} exchange
          {turns.length === 1 ? '' : 's'}
        </span>
        {(notes.length > 0 || turns.length > 0) && (
          <Tooltip content="Forget everything">
            <button
              onClick={() => clear.mutate()}
              className="ml-auto text-[11.5px] text-ink-faint transition-colors hover:text-danger"
            >
              Clear
            </button>
          </Tooltip>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-b border-line p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (note.trim()) addNote.mutate(note.trim())
        }}
      >
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Something it should always remember…"
          className="flex-1"
        />
        <Button variant="secondary" size="md" type="submit" disabled={!note.trim() || addNote.isPending}>
          <Plus className="h-3.5 w-3.5" />
          Remember
        </Button>
      </form>

      <div className="max-h-[320px] overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">Loading…</p>
        ) : !notes.length && !turns.length ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-faint">
            Nothing yet. Anything you say to {agentName} on the rail is kept here.
          </p>
        ) : (
          <>
            {notes.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} onForget={() => forget.mutate(memory.id)} />
            ))}
            {turns.map((memory) => (
              <MemoryRow key={memory.id} memory={memory} onForget={() => forget.mutate(memory.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function MemoryRow({ memory, onForget }: { memory: AgentMemory; onForget: () => void }) {
  return (
    <div className="group flex items-start gap-2.5 border-b border-line px-4 py-2.5 last:border-0">
      <span
        className={cn(
          'mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full',
          memory.kind === 'note'
            ? 'bg-warn'
            : memory.role === 'user'
              ? 'bg-line-strong'
              : 'bg-local',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] leading-relaxed text-ink">{memory.content}</span>
        <span className="mt-0.5 block text-[11px] text-ink-faint">
          {[
            memory.kind === 'note' ? 'Note' : memory.role === 'user' ? 'You said' : 'It said',
            memory.context,
            relativeTime(memory.createdAt),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      {(
        <Tooltip content="Forget this">
          <button
            onClick={onForget}
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Forget this note"
          >
            <Trash2 className="h-[12px] w-[12px] text-ink-faint hover:text-danger" />
          </button>
        </Tooltip>
      )}
    </div>
  )
}
