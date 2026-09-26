'use client'

/**
 * Desktop bridge.
 *
 * KOVAI runs as a web application and as a Tauri desktop app from the same
 * codebase. Where the desktop shell can do something the browser cannot —
 * starting the local runtime process — we use it; otherwise we fall back to the
 * server route. Nothing else in the interface needs to know which it is.
 */

interface TauriInternals {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

function bridge(): TauriInternals | null {
  if (typeof window === 'undefined') return null
  const internals = (window as unknown as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__
  return internals && typeof internals.invoke === 'function' ? internals : null
}

export const isDesktop = () => bridge() !== null

export interface RuntimeControlResult {
  running: boolean
  pid: number | null
  message: string
}

/** Returns null when not running under Tauri, so callers can use the web path. */
export async function desktopStartRuntime(): Promise<RuntimeControlResult | null> {
  const tauri = bridge()
  if (!tauri) return null
  return tauri.invoke<RuntimeControlResult>('start_runtime')
}

export async function desktopStopRuntime(): Promise<RuntimeControlResult | null> {
  const tauri = bridge()
  if (!tauri) return null
  return tauri.invoke<RuntimeControlResult>('stop_runtime')
}
