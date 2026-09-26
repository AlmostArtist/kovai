import type { Destination } from './intent'

/**
 * Slash commands for the home composer.
 *
 * Typing is faster than aiming. `/image a red bicycle` should go straight to the
 * canvas with the prompt already in it, without first hunting for the right
 * button — and the menu doubles as a list of what this workspace can do.
 */
export interface SlashCommand {
  command: string
  label: string
  hint: string
  destination: Destination
  /** Prepended to the prompt, for commands that describe a kind of output. */
  prefix?: string
  /** Pre-fills the workspace with a capability rather than a prompt. */
  kind?: 'image' | 'video'
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/image', label: 'Generate an image', hint: 'Higgsfield, KIE or a local model', destination: 'create', kind: 'image' },
  {
    command: '/chart',
    label: 'Generate a chart',
    hint: 'A clean data visualisation',
    destination: 'create',
    kind: 'image',
    prefix: 'A clean, minimal data chart, flat vector style, legible labels, generous whitespace: ',
  },
  {
    command: '/logo',
    label: 'Generate a logo',
    hint: 'Marks and wordmarks',
    destination: 'create',
    kind: 'image',
    prefix: 'A simple, geometric logo mark, flat vector, solid background, no text: ',
  },
  { command: '/video', label: 'Generate video', hint: 'From a first frame', destination: 'create', kind: 'video' },
  { command: '/vision', label: 'Read an image', hint: 'Ask questions about a picture', destination: 'vision' },
  { command: '/research', label: 'Research', hint: 'Structured answers, stated limits', destination: 'research' },
  { command: '/chat', label: 'Chat', hint: 'A plain conversation', destination: 'chat' },
  { command: '/workflow', label: 'Workflow', hint: 'Chain steps together', destination: 'workflow' },
]

/** Parses `/image a red bicycle` into its command and the rest of the prompt. */
export function parseSlash(draft: string): { command: SlashCommand; rest: string } | null {
  const match = /^(\/[a-z]+)(?:\s+([\s\S]*))?$/i.exec(draft.trim())
  if (!match) return null
  const command = SLASH_COMMANDS.find((c) => c.command === match[1].toLowerCase())
  return command ? { command, rest: (match[2] ?? '').trim() } : null
}

/** The commands offered while someone is still typing one. */
export function matchSlash(draft: string): SlashCommand[] {
  const match = /^\/([a-z]*)$/i.exec(draft.trim())
  if (!match) return []
  const term = match[1].toLowerCase()
  return SLASH_COMMANDS.filter((c) => c.command.slice(1).startsWith(term))
}
