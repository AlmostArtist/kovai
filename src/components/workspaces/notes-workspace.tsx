'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pin, PinOff, Plus, Search, StickyNote, Trash2 } from 'lucide-react'
import { Button, EmptyState, Input } from '@/components/ui'
import { useWorkspace, type Tab } from '@/store/workspace'
import { cn, relativeTime, truncate, uid } from '@/lib/utils'
import type { Note } from '@/lib/db/types'

const COLORS: { value: NonNullable<Note['color']>; className: string }[] = [
  { value: 'neutral', className: 'bg-ink-faint' },
  { value: 'amber', className: 'bg-warn' },
  { value: 'green', className: 'bg-local' },
  { value: 'blue', className: 'bg-cloud' },
  { value: 'violet', className: 'bg-accent' },
  { value: 'rose', className: 'bg-danger' },
]

/**
 * Notes.
 *
 * A list and an editor, and nothing between you and typing. Saving is implicit
 * — a note you have to remember to save is a note you lose.
 */
export function NotesWorkspace({ tab }: { tab: Tab }) {
  const client = useQueryClient()
  const patchState = useWorkspace((s) => s.patchState)
  const selectedId = tab.state.selectedId as string | undefined
  const [query, setQuery] = useState('')

  const { data: notes } = useQuery({
    queryKey: ['notes'],
    queryFn: async () => ((await (await fetch('/api/notes')).json()) as { notes: Note[] }).notes,
  })

  const save = useMutation({
    mutationFn: async (note: Partial<Note>) => {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      })
      return ((await res.json()) as { note: Note }).note
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['notes'] }),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['notes'] })
      patchState(tab.id, { selectedId: undefined })
    },
  })

  const filtered = useMemo(() => {
    const all = notes ?? []
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q))
  }, [notes, query])

  const selected = (notes ?? []).find((n) => n.id === selectedId) ?? filtered[0]

  const create = () => {
    const note: Note = {
      id: uid(),
      title: 'New note',
      body: '',
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    save.mutate(note)
    patchState(tab.id, { selectedId: note.id })
  }

  return (
    <div className="flex h-full">
      <div className="flex w-[280px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex shrink-0 items-center gap-2 p-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes"
              className="h-8 pl-8 text-[12.5px]"
            />
          </div>
          <Button variant="primary" size="icon" onClick={create} aria-label="New note">
            <Plus className="h-[14px] w-[14px]" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] text-ink-faint">
              {query ? 'Nothing matched.' : 'No notes yet.'}
            </p>
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                onClick={() => patchState(tab.id, { selectedId: note.id })}
                className={cn(
                  'mb-1 flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors',
                  note.id === selected?.id ? 'bg-subtle' : 'hover:bg-subtle',
                )}
              >
                <span
                  className={cn(
                    'mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full',
                    COLORS.find((c) => c.value === (note.color ?? 'neutral'))?.className,
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{note.title}</span>
                    {note.pinned && <Pin className="h-[10px] w-[10px] shrink-0 text-ink-faint" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                    {note.body ? truncate(note.body, 40) : relativeTime(note.updatedAt)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {selected ? (
        <NoteEditor
          key={selected.id}
          note={selected}
          onSave={(patch) => save.mutate({ ...selected, ...patch })}
          onDelete={() => remove.mutate(selected.id)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={StickyNote}
            title="Nothing written down yet."
            line="Notes are the quiet half of a workspace — somewhere to put a thought before it becomes work."
            action={
              <Button variant="primary" size="md" onClick={create}>
                Write a note
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}

function NoteEditor({
  note,
  onSave,
  onDelete,
}: {
  note: Note
  onSave: (patch: Partial<Note>) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)

  // Saving is debounced rather than manual: a note you must remember to save is
  // a note you eventually lose.
  useEffect(() => {
    if (title === note.title && body === note.body) return
    const timer = setTimeout(() => onSave({ title, body }), 600)
    return () => clearTimeout(timer)
  }, [title, body, note.title, note.body, onSave])

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-5 py-2.5">
        <div className="flex items-center gap-1">
          {COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => onSave({ color: color.value })}
              className={cn(
                'h-[13px] w-[13px] rounded-full transition-transform',
                color.className,
                (note.color ?? 'neutral') === color.value
                  ? 'scale-110 ring-2 ring-line-strong ring-offset-2 ring-offset-[--color-canvas]'
                  : 'opacity-50 hover:opacity-100',
              )}
              aria-label={`Colour ${color.value}`}
            />
          ))}
        </div>

        <span className="ml-3 text-[11.5px] text-ink-faint">Edited {relativeTime(note.updatedAt)}</span>

        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={() => onSave({ pinned: !note.pinned })}
          aria-label={note.pinned ? 'Unpin' : 'Pin'}
        >
          {note.pinned ? <PinOff className="h-[13px] w-[13px]" /> : <Pin className="h-[13px] w-[13px]" />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} aria-label="Delete note">
          <Trash2 className="h-[13px] w-[13px] text-danger" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-8 py-7">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent text-[22px] font-medium tracking-[-0.02em] text-ink outline-none placeholder:text-ink-faint"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Start writing…"
            className="mt-4 min-h-[60vh] w-full resize-none bg-transparent text-[15px] leading-[1.7] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>
    </div>
  )
}
