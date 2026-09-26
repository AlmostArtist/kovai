'use client'

import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronRight,
  Download,
  EyeOff,
  FileText,
  Folder,
  LayoutGrid,
  List,
  MoreVertical,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  Textarea,
  Tooltip,
} from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { SkillGlyph } from './skill-glyph'
import { parseSkill, toSkillFile } from '@/lib/skills/format'
import { cn, copyText, relativeTime } from '@/lib/utils'
import type { Tab } from '@/store/workspace'
import type { Skill } from '@/lib/db/types'

/**
 * K Skills.
 *
 * A skill is a SKILL.md: YAML frontmatter naming it and saying when to use it,
 * then a body of instructions. The format is Claude's, unchanged, so a skill
 * written for one works in the other.
 *
 * What makes them cheap is that only the name and description are ever in the
 * prompt. A shelf of fifty costs about fifty lines; the body of one loads only
 * for the turn that asked for it, and leaves again after.
 */
type Shelf = 'all' | 'on' | 'off' | 'imported' | 'written'

const SHELVES: { id: Shelf; label: string }[] = [
  { id: 'all', label: 'All skills' },
  { id: 'on', label: 'On the shelf' },
  { id: 'off', label: 'Off' },
  { id: 'imported', label: 'Imported' },
  { id: 'written', label: 'Written here' },
]

function onShelf(skill: Skill, shelf: Shelf): boolean {
  if (shelf === 'on') return skill.enabled
  if (shelf === 'off') return !skill.enabled
  if (shelf === 'imported') return skill.origin === 'imported'
  if (shelf === 'written') return skill.origin === 'written'
  return true
}

export function SkillsWorkspace({ tab }: { tab: Tab }) {
  const client = useQueryClient()
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState<Shelf>((tab.state.shelf as Shelf) ?? 'all')
  const [layout, setLayout] = useState<'grid' | 'list'>('grid')
  const [reading, setReading] = useState<Skill | null>(null)
  const [drafting, setDrafting] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: skills, isLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => ((await (await fetch('/api/skills')).json()) as { skills: Skill[] }).skills,
  })

  const invalidate = () => client.invalidateQueries({ queryKey: ['skills'] })

  const install = useMutation({
    mutationFn: async (source: string) => {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const body = (await res.json()) as {
        skill?: Skill
        replaced?: boolean
        error?: { message: string; detail?: string }
      }
      if (!res.ok || !body.skill)
        throw new Error(body.error?.detail ?? body.error?.message ?? 'That skill could not be installed.')
      return body
    },
    onSuccess: ({ skill, replaced }) => {
      void invalidate()
      setDrafting(null)
      toast.success(replaced ? `${skill!.name} updated.` : `${skill!.name} installed.`)
    },
    onError: (error: Error) => toast.error('Not a skill', { description: error.message }),
  })

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await fetch(`/api/skills/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
    },
    onSuccess: () => void invalidate(),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/skills/${id}`, { method: 'DELETE' })
    },
    onSuccess: () => {
      void invalidate()
      setReading(null)
      toast.success('Skill removed.')
    },
  })

  const readFiles = async (files: FileList | File[]) => {
    for (const file of [...files].slice(0, 20)) {
      if (!/\.(md|markdown|txt)$/i.test(file.name)) {
        toast.error(`${file.name} is not a Markdown file.`)
        continue
      }
      install.mutate(await file.text())
    }
  }

  const all = useMemo(() => skills ?? [], [skills])
  const counts = useMemo(
    () => Object.fromEntries(SHELVES.map((s) => [s.id, all.filter((k) => onShelf(k, s.id)).length])),
    [all],
  )

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return all
      .filter((k) => onShelf(k, shelf))
      .filter((k) => !term || `${k.name} ${k.description}`.toLowerCase().includes(term))
  }, [all, shelf, query])

  const shelfLabel = SHELVES.find((s) => s.id === shelf)!.label

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* The shelves. Skills have no folders of their own, so these are the
          distinctions that actually exist rather than an invented hierarchy. */}
      <aside className="flex shrink-0 flex-col border-b border-line bg-surface md:w-[212px] md:border-b-0 md:border-r">
        <div className="hidden p-3 md:block">
          <Button variant="primary" className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="h-[13px] w-[13px]" />
            Import SKILL.md
          </Button>
        </div>

        <p className="hidden px-4 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint md:block">
          Shelves
        </p>

        <nav className="flex min-h-0 flex-row gap-1 overflow-x-auto px-2 py-2 no-scrollbar md:flex-1 md:flex-col md:gap-0 md:overflow-x-visible md:overflow-y-auto md:py-0 md:pb-3">
          {SHELVES.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setShelf(entry.id)}
              className={cn(
                'flex h-[32px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[8px] px-3 text-[13px] transition-colors md:w-full md:gap-2.5 md:px-2',
                shelf === entry.id ? 'bg-subtle text-ink' : 'text-ink-muted hover:bg-subtle hover:text-ink',
              )}
            >
              <Folder
                className={cn('h-[14px] w-[14px]', shelf === entry.id ? 'text-accent' : 'text-ink-faint')}
              />
              <span className="min-w-0 truncate text-left md:flex-1">{entry.label}</span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-ink-faint">
                {counts[entry.id] ?? 0}
              </span>
            </button>
          ))}
        </nav>

        {/* On a phone these live in the strip itself; there is no rail
            underneath them to sit at the bottom of. */}
        <div className="hidden border-t border-line p-3 md:block">
          <Button variant="secondary" className="w-full" onClick={() => setDrafting('')}>
            <FileText className="h-[13px] w-[13px]" />
            Write one
          </Button>
        </div>
      </aside>

      <div
        className="min-w-0 flex-1 overflow-y-auto"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void readFiles(e.dataTransfer.files)
        }}
      >
        <div className="px-4 py-4 md:px-7 md:py-6">
          <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[19px] font-medium tracking-[-0.022em] text-ink md:text-[21px]">
                {shelfLabel} <span className="text-ink-faint">({filtered.length})</span>
              </h1>
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-faint">
                Skills
                <ChevronRight className="h-[11px] w-[11px]" />
                <span className="text-ink-muted">{shelfLabel}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1 md:w-[240px] md:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-[13px] w-[13px] -translate-y-1/2 text-ink-faint" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search skills"
                  className="pl-8"
                />
              </div>

              <Segmented
                size="sm"
                value={layout}
                onChange={setLayout}
                options={[
                  { value: 'grid', label: <LayoutGrid className="h-[13px] w-[13px]" />, title: 'Grid' },
                  { value: 'list', label: <List className="h-[13px] w-[13px]" />, title: 'List' },
                ]}
              />
            </div>

            {/* The rail's two actions, which have nowhere to live on a phone. */}
            <div className="flex gap-2 md:hidden">
              <Button variant="primary" className="flex-1" onClick={() => fileRef.current?.click()}>
                <Upload className="h-[13px] w-[13px]" />
                Import
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setDrafting('')}>
                <FileText className="h-[13px] w-[13px]" />
                Write one
              </Button>
            </div>
          </header>

          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void readFiles(e.target.files)
              e.target.value = ''
            }}
          />

          {isLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[168px] rounded-[12px] shimmer" />
              ))}
            </div>
          ) : !filtered.length ? (
            <EmptyState
              icon={Sparkles}
              title={query ? 'Nothing matched.' : 'Nothing on this shelf.'}
              line={
                query
                  ? 'Try a word from the name or the description.'
                  : 'A skill is a SKILL.md — frontmatter naming it and saying when to use it, then the instructions. Drop one here, or write one.'
              }
              action={
                !query ? (
                  <Button variant="primary" size="md" onClick={() => fileRef.current?.click()}>
                    Import a SKILL.md
                  </Button>
                ) : undefined
              }
            />
          ) : layout === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3">
              {filtered.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onOpen={() => setReading(skill)}
                  onToggle={(enabled) => toggle.mutate({ id: skill.id, enabled })}
                  onRemove={() => remove.mutate(skill.id)}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
              <div className="grid grid-cols-[minmax(0,1fr)_120px_120px_36px] gap-3 border-b border-line px-4 py-2.5 text-[11.5px] text-ink-faint">
                <span>Name</span>
                <span>Origin</span>
                <span>Updated</span>
                <span />
              </div>
              {filtered.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  onOpen={() => setReading(skill)}
                  onToggle={(enabled) => toggle.mutate({ id: skill.id, enabled })}
                  onRemove={() => remove.mutate(skill.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={Boolean(reading)} onOpenChange={(open) => !open && setReading(null)}>
        {reading && (
          <DialogContent title={reading.name} description={reading.description} width="lg">
            <div className="max-h-[56vh] overflow-y-auto px-5 pb-4">
              <pre className="whitespace-pre-wrap break-words rounded-[10px] border border-line bg-subtle px-3.5 py-3 text-[12.5px] leading-[1.6] text-ink">
                {reading.instructions || 'This skill has no instructions in its body.'}
              </pre>
            </div>
            <div className="flex items-center gap-2 border-t border-line px-5 py-3">
              <span className="text-[11.5px] text-ink-faint">
                {reading.origin === 'imported' ? 'Imported' : 'Written here'} ·{' '}
                {relativeTime(reading.updatedAt)}
              </span>
              <Button
                variant="ghost"
                size="md"
                className="ml-auto"
                onClick={async () => {
                  if (await copyText(toSkillFile(reading))) toast.success('SKILL.md copied.')
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Copy as SKILL.md
              </Button>
              <Button variant="ghost" size="md" onClick={() => remove.mutate(reading.id)}>
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={drafting !== null} onOpenChange={(open) => !open && setDrafting(null)}>
        {drafting !== null && (
          <PasteSkill
            value={drafting}
            onChange={setDrafting}
            onInstall={() => install.mutate(drafting)}
            saving={install.isPending}
          />
        )}
      </Dialog>
    </div>
  )
}

/** A skill as a file card, the way a file manager shows one. */
function SkillCard({
  skill,
  onOpen,
  onToggle,
  onRemove,
}: {
  skill: Skill
  onOpen: () => void
  onToggle: (enabled: boolean) => void
  onRemove: () => void
}) {
  return (
    <div className="group relative rounded-[12px] border border-line bg-surface transition-colors hover:border-line-strong">
      <SkillMenu skill={skill} onToggle={onToggle} onRemove={onRemove} onOpen={onOpen} />

      <button onClick={onOpen} className="flex w-full flex-col items-center px-4 pb-3 pt-6">
        <SkillGlyph enabled={skill.enabled} size={54} />
        <p className="mt-3 w-full truncate text-center font-mono text-[12px] text-ink">{skill.name}</p>
        <p className="mt-1 line-clamp-2 min-h-[32px] w-full text-center text-[11.5px] leading-[1.45] text-ink-faint">
          {skill.description}
        </p>
      </button>

      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px] text-ink-faint">
        <span>{skill.enabled ? 'On the shelf' : 'Off'}</span>
        <span>{relativeTime(skill.updatedAt)}</span>
      </div>
    </div>
  )
}

function SkillRow({
  skill,
  onOpen,
  onToggle,
  onRemove,
}: {
  skill: Skill
  onOpen: () => void
  onToggle: (enabled: boolean) => void
  onRemove: () => void
}) {
  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_120px_120px_36px] items-center gap-3 border-b border-line px-4 py-2.5 transition-colors last:border-0 hover:bg-subtle">
      <button onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left">
        <SkillGlyph enabled={skill.enabled} size={26} />
        <span className="min-w-0">
          <span className="block truncate font-mono text-[12.5px] text-ink">{skill.name}</span>
          <span className="block truncate text-[11.5px] text-ink-faint">{skill.description}</span>
        </span>
      </button>
      <span className="text-[12px] text-ink-muted">
        {skill.origin === 'imported' ? 'Imported' : 'Written here'}
      </span>
      <span className="text-[11.5px] text-ink-faint">{relativeTime(skill.updatedAt)}</span>
      <div className="relative h-[28px]">
        <SkillMenu skill={skill} onToggle={onToggle} onRemove={onRemove} onOpen={onOpen} inline />
      </div>
    </div>
  )
}

/** The ⋮ every file manager has, with the things you can do to one skill. */
function SkillMenu({
  skill,
  onOpen,
  onToggle,
  onRemove,
  inline,
}: {
  skill: Skill
  onOpen: () => void
  onToggle: (enabled: boolean) => void
  onRemove: () => void
  inline?: boolean
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-ink-faint transition-all hover:bg-subtle hover:text-ink',
            inline
              ? 'opacity-0 group-hover:opacity-100'
              : 'absolute right-1.5 top-1.5 z-10 opacity-0 group-hover:opacity-100',
          )}
          aria-label={`More for ${skill.name}`}
        >
          <MoreVertical className="h-[14px] w-[14px]" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[186px]">
        <MenuRow icon={FileText} label="Open" onClick={onOpen} />
        <MenuRow
          icon={skill.enabled ? EyeOff : Check}
          label={skill.enabled ? 'Take off the shelf' : 'Put on the shelf'}
          onClick={() => onToggle(!skill.enabled)}
        />
        <MenuRow
          icon={Download}
          label="Copy as SKILL.md"
          onClick={async () => {
            if (await copyText(toSkillFile(skill))) toast.success('SKILL.md copied.')
          }}
        />
        <div className="my-1 h-px bg-line" />
        <MenuRow icon={Trash2} label="Remove" onClick={onRemove} danger />
      </PopoverContent>
    </Popover>
  )
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[7px] px-2 py-[6px] text-left text-[12.5px] transition-colors',
        danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-subtle',
      )}
    >
      <Icon className={cn('h-[13px] w-[13px]', danger ? '' : 'text-ink-faint')} />
      {label}
    </button>
  )
}

const TEMPLATE = `---
name: writing-commit-messages
description: Writes commit messages from a diff, in the imperative mood with a short subject and a body that explains why. Use when the user asks for a commit message or pastes a diff.
---

# Writing commit messages

## Subject

- Imperative mood: "add", not "added" or "adds".
- Under 50 characters, no trailing full stop.

## Body

Explain what changed and why it changed. The diff already says how.
`

function PasteSkill({
  value,
  onChange,
  onInstall,
  saving,
}: {
  value: string
  onChange: (next: string) => void
  onInstall: () => void
  saving: boolean
}) {
  const parsed = useMemo(() => (value.trim() ? parseSkill(value) : null), [value])
  const problem = parsed?.problems[0]?.message

  return (
    <DialogContent
      title="Paste a skill"
      description="A SKILL.md: frontmatter with a name and a description, then the instructions."
      width="lg"
    >
      <div className="px-5 pb-4">
        <Textarea
          rows={16}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={TEMPLATE}
          className="font-mono text-[12.5px]"
        />
      </div>

      <div className="flex items-center gap-3 border-t border-line px-5 py-3">
        <p className="min-w-0 flex-1 truncate text-[12px] text-ink-faint">
          {!value.trim() ? (
            <button onClick={() => onChange(TEMPLATE)} className="text-accent hover:underline">
              Start from an example
            </button>
          ) : problem ? (
            <span className="text-danger">{problem}</span>
          ) : parsed?.skill ? (
            <span className="inline-flex items-center gap-1.5 text-local">
              <Check className="h-3 w-3" />
              {parsed.skill.name}
            </span>
          ) : null}
        </p>
        <Tooltip content={problem ?? ''}>
          <Button
            variant="primary"
            size="md"
            disabled={!parsed?.skill || saving}
            onClick={onInstall}
          >
            {saving ? 'Installing…' : 'Install skill'}
          </Button>
        </Tooltip>
      </div>
    </DialogContent>
  )
}
