import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number | undefined, precision = 1): string {
  if (!bytes || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : precision)} ${units[i]}`
}

export function formatNumber(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

/** Cost is only ever shown when we actually have one. */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return 'Cost unavailable'
  if (usd === 0) return 'Free'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

export function relativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp
  if (delta < 45_000) return 'just now'
  const minutes = Math.round(delta / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Section labels for time-grouped lists: Today, Yesterday, 7 days, … */
export function timeBucket(timestamp: number): string {
  const day = 24 * 60 * 60_000
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  if (timestamp >= startOfToday) return 'Today'
  if (timestamp >= startOfToday - day) return 'Yesterday'
  if (timestamp >= startOfToday - 7 * day) return 'Last 7 days'
  if (timestamp >= startOfToday - 30 * day) return 'Last 30 days'
  return 'Earlier'
}

export function greeting(name: string): string {
  const hour = new Date().getHours()
  const part = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}.` : `${part}.`
}

export function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

/** Titles derived from the first thing a person typed. */
export function titleFrom(text: string, fallback = 'Untitled'): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (!clean) return fallback
  return truncate(clean, 42)
}

export const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

export function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** Read a File as a data URL — used in private mode so images never leave. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

/**
 * Copies text to the clipboard, wherever the page happens to be served from.
 *
 * `navigator.clipboard` only exists in a secure context. KOVAI is routinely
 * opened on the LAN address the dev server prints — plain http on an IP, which
 * is not one — and there the whole object is undefined, so every copy button in
 * the app threw rather than doing nothing. The old `execCommand` path still
 * works there, so it is the fallback rather than an error message.
 *
 * Returns whether the text actually reached the clipboard, so the caller can
 * say so honestly instead of flashing "Copied" either way.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission refused, or the document was not focused. Fall through.
  }

  try {
    const field = document.createElement('textarea')
    field.value = text
    // Off-screen rather than hidden: a field that is not rendered cannot be
    // selected, and a selection is what execCommand copies.
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
    document.body.appendChild(field)
    field.select()
    const copied = document.execCommand('copy')
    field.remove()
    return copied
  } catch {
    return false
  }
}

/** A wall-clock time for a message: "2:14 pm". */
export function clockTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(timestamp),
  )
}
