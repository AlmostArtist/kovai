import type { TabKind } from '@/store/workspace'

/**
 * Task routing for the home composer.
 *
 * One input, several destinations. The rules are deliberately transparent —
 * the interface shows the routed destination before committing, and the user
 * can always override it, so a wrong guess costs a click rather than a surprise.
 */

export type Destination = Extract<TabKind, 'chat' | 'create' | 'vision' | 'research' | 'workflow'>

interface Rule {
  destination: Destination
  weight: number
  pattern: RegExp
}

const RULES: Rule[] = [
  // Image generation — the verb plus a visual noun is a strong signal.
  { destination: 'create', weight: 3, pattern: /\b(generate|create|make|render|design|produce)\b.{0,40}\b(image|photo|shot|render|poster|logo|mockup|thumbnail|illustration|artwork|visual|scene|portrait)\b/i },
  { destination: 'create', weight: 3, pattern: /\b(cinematic|photoreal|studio lighting|product shot|hero image|key visual|moodboard)\b/i },
  { destination: 'create', weight: 2, pattern: /\b(image of|picture of|photo of|shot of)\b/i },

  // Vision — reasoning about an image the user already has.
  { destination: 'vision', weight: 3, pattern: /\b(analy[sz]e|describe|read|extract|identify|critique|what('s| is) (in|happening|going on))\b.{0,30}\b(this|that|the|my)?\s*(image|photo|picture|screenshot|frame|shot)\b/i },
  { destination: 'vision', weight: 2, pattern: /\b(from this|in this)\s+(image|photo|picture|screenshot)\b/i },

  // Research — the user wants sourced answers rather than a conversation.
  { destination: 'research', weight: 3, pattern: /\b(research|investigate|compare|survey|find out|look up|latest|state of the art|benchmark)\b/i },
  { destination: 'research', weight: 2, pattern: /\b(sources?|citations?|evidence|papers?)\b/i },

  // Workflows — multi-step, repeatable work.
  { destination: 'workflow', weight: 3, pattern: /\b(workflow|pipeline|automate|batch|for each|step by step process)\b/i },
]

export interface IntentResult {
  destination: Destination
  confidence: 'low' | 'medium' | 'high'
  /** Why it routed this way, shown in the interface. */
  reason: string
}

const LABELS: Record<Destination, string> = {
  chat: 'Chat',
  create: 'Create image',
  vision: 'Vision',
  research: 'Research',
  workflow: 'Workflow',
}

export function classifyIntent(text: string, hasImages = false): IntentResult {
  const input = text.trim()

  // An attached image is a fact, not a guess — it outranks every keyword.
  if (hasImages) {
    return { destination: 'vision', confidence: 'high', reason: 'An image is attached.' }
  }
  if (!input) {
    return { destination: 'chat', confidence: 'low', reason: 'Defaults to chat.' }
  }

  // Explicit slash-commands always take precedence.
  const lower = input.toLowerCase()
  if (lower.startsWith('/image') || lower.startsWith('/chart')) {
    return {
      destination: 'create',
      confidence: 'high',
      reason: lower.startsWith('/chart') ? 'Slash command /chart (visualize data)' : 'Slash command /image (generate image)',
    }
  }
  if (lower.startsWith('/vision')) {
    return { destination: 'vision', confidence: 'high', reason: 'Slash command /vision (image reasoning)' }
  }
  if (lower.startsWith('/research')) {
    return { destination: 'research', confidence: 'high', reason: 'Slash command /research (deep research)' }
  }
  if (lower.startsWith('/workflow')) {
    return { destination: 'workflow', confidence: 'high', reason: 'Slash command /workflow (task pipeline)' }
  }
  if (lower.startsWith('/chat') || lower.startsWith('/text')) {
    return { destination: 'chat', confidence: 'high', reason: 'Slash command /text (text generation)' }
  }

  const scores = new Map<Destination, number>()
  let matched: Rule | null = null

  for (const rule of RULES) {
    if (!rule.pattern.test(input)) continue
    scores.set(rule.destination, (scores.get(rule.destination) ?? 0) + rule.weight)
    if (!matched || rule.weight > matched.weight) matched = rule
  }

  if (!scores.size) {
    return { destination: 'chat', confidence: 'low', reason: 'Reads as a conversation.' }
  }

  const [destination, score] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    destination,
    confidence: score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low',
    reason: `Routed to ${LABELS[destination]}.`,
  }
}

export const destinationLabel = (d: Destination) => LABELS[d]
