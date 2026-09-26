'use client'

import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSettings } from '@/store/settings'
import { desktopStartRuntime, desktopStopRuntime } from '@/lib/desktop'
import type { AIModel } from '@/lib/providers/types'
import type { SystemInfo } from '@/lib/providers/local'

export interface RuntimeSnapshot {
  online: boolean
  version?: string
  latencyMs?: number
  system: SystemInfo | null
  /** Models that can actually be run right now. */
  models: AIModel[]
  /** GGUF files present on disk that nothing on this machine can run. */
  installable: InstallableModel[]
  /** The model currently resident in memory, if any. */
  loadedModel: string | null
  detail?: string
}

/**
 * Live view of the local runtime.
 *
 * The browser talks to 127.0.0.1 directly, which is also how local chat and
 * vision are streamed — that is what keeps private mode private. Starting and
 * stopping the process goes through the Next.js server (or Tauri on desktop),
 * because a web page cannot and should not spawn processes itself.
 */
export function useLocalRuntime(options: { poll?: boolean } = {}) {
  const baseUrl = useSettings((s) => s.localRuntimeUrl)
  const client = useQueryClient()

  const query = useQuery({
    queryKey: ['runtime', baseUrl],
    refetchInterval: options.poll ? 4000 : false,
    staleTime: 3000,
    retry: false,
    queryFn: async (): Promise<RuntimeSnapshot> => {
      const started = performance.now()
      try {
        const health = await fetch(`${baseUrl}/health`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(2500),
        })
        if (!health.ok) return offline(`The runtime responded ${health.status}.`)
        const info = (await health.json()) as { status?: string; version?: string }
        if (info.status !== 'ok') return offline('The runtime is starting up.')

        const [system, raw] = await Promise.all([
          fetch(`${baseUrl}/system`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then(toSystem)
            .catch(() => null),
          fetch(`${baseUrl}/models`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : { models: [] }))
            .then((b: { models?: RawModel[] }) => b.models ?? [])
            .catch(() => [] as RawModel[]),
        ])

        return {
          online: true,
          version: info.version,
          latencyMs: Math.round(performance.now() - started),
          system,
          models: raw.filter((m) => m.registered !== false).map(toModel),
          installable: raw
            .filter((m) => m.registered === false && m.file)
            .map((m) => ({ file: m.file!, name: m.name || m.file!, sizeBytes: m.size })),
          loadedModel: raw.find((m) => m.loaded)?.name ?? null,
        }
      } catch {
        return offline("KOVAI's local runtime isn't running.")
      }
    },
  })

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ['runtime'] })
    void client.invalidateQueries({ queryKey: ['models'] })
  }, [client])

  /**
   * Starts the runtime and waits for it to answer.
   *
   * The first launch builds a Python virtual environment and installs
   * dependencies, which can take minutes on a cold cache — so this waits
   * generously and reports what the script is actually doing rather than
   * spinning silently and then blaming a terminal the user never saw.
   */
  const start = useCallback(
    async (onProgress?: (status: string) => void) => {
      const viaDesktop = await desktopStartRuntime().catch(() => null)
      if (!viaDesktop) {
        const res = await fetch('/api/runtime/start', { method: 'POST' })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string; detail?: string }
          }
          throw new Error(body.error?.detail || body.error?.message || 'Could not start the local runtime.')
        }
      }

      const deadline = Date.now() + 6 * 60_000
      let lastStatus = ''

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500))

        // Probe the runtime directly; the cached query would lag behind.
        const up = await fetch(`${baseUrl}/health`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(2000),
        })
          .then((r) => r.ok)
          .catch(() => false)

        if (up) {
          refresh()
          return true
        }

        const log = await fetch('/api/runtime/log', { cache: 'no-store' })
          .then((r) => (r.ok ? (r.json() as Promise<{ status: string | null; failed?: boolean }>) : null))
          .catch(() => null)

        if (log?.status && log.status !== lastStatus) {
          lastStatus = log.status
          onProgress?.(log.status)
        }

        // A script that has stopped on an error will not recover by waiting.
        if (log?.failed) {
          throw new Error(lastStatus || 'The startup script reported an error.')
        }
      }

      throw new Error(
        lastStatus
          ? `The runtime is still starting (${lastStatus}). Full output is in .kovai/runtime.log.`
          : 'The runtime did not come up. See .kovai/runtime.log for the startup output.',
      )
    },
    [baseUrl, refresh],
  )

  /** Releases the resident model's memory without stopping the runtime. */
  const unload = useCallback(async () => {
    await fetch(`${baseUrl}/models/unload`, { method: 'POST' }).catch(() => {})
    refresh()
  }, [baseUrl, refresh])

  const stop = useCallback(async () => {
    const viaDesktop = await desktopStopRuntime().catch(() => null)
    if (!viaDesktop) await fetch('/api/runtime/stop', { method: 'POST' }).catch(() => {})
    refresh()
  }, [refresh])

  return { ...query, snapshot: query.data, start, stop, unload, refresh }
}

function offline(detail: string): RuntimeSnapshot {
  return { online: false, system: null, models: [], installable: [], loadedModel: null, detail }
}

interface RawModel {
  id: string
  name?: string
  family?: string
  size?: number
  capabilities?: string[]
  context_length?: number
  quantization?: string
  source?: string
  registered?: boolean
  default?: boolean
  file?: string
  loaded?: boolean
}

/** A GGUF on disk that cannot be run because no backend can run it. */
export interface InstallableModel {
  file: string
  name: string
  sizeBytes?: number
}

function toModel(m: RawModel): AIModel {
  const lower = m.id.toLowerCase()
  const capabilities = (m.capabilities?.map((c) => c.toUpperCase()) ?? []) as AIModel['capabilities']
  const tags: NonNullable<AIModel['tags']> = []
  if (m.default) tags.push('default')
  if (capabilities.includes('VISION')) tags.push('vision')
  return {
    tags,
    id: m.id,
    name: m.name || m.id,
    providerId: 'local',
    capabilities: capabilities.length
      ? capabilities
      : /vl|vision|llava|moondream|pixtral/.test(lower)
        ? ['CHAT', 'VISION']
        : /embed|bge|nomic|minilm/.test(lower)
          ? ['EMBEDDINGS']
          : ['CHAT'],
    contextLength: m.context_length,
    description: [m.family, m.quantization, m.source].filter(Boolean).join(' · ') || undefined,
    sizeBytes: m.size,
    family: m.family,
  }
}

function toSystem(raw: Record<string, never> | null): SystemInfo | null {
  if (!raw) return null
  return {
    platform: raw.platform ?? 'unknown',
    arch: raw.arch ?? 'unknown',
    chip: raw.chip ?? 'unknown',
    cpuCount: raw.cpu_count ?? 0,
    cpuPercent: raw.cpu_percent ?? 0,
    ramTotalBytes: raw.ram_total ?? 0,
    ramAvailableBytes: raw.ram_available ?? 0,
    gpu: raw.gpu ?? null,
    vramTotalBytes: raw.vram_total ?? null,
    vramFreeBytes: raw.vram_free ?? null,
    backends: raw.backends ?? { ollama: false, llamacpp: false },
    loadedModels: raw.loaded_models ?? [],
    uptimeSeconds: raw.uptime ?? 0,
    modelsDir: raw.models_dir ?? null,
    ggufCount: raw.gguf_count ?? 0,
    llamaServer: raw.llama_server ?? null,
  }
}
