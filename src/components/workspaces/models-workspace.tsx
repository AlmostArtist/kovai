'use client'

import { useMemo, useState } from 'react'
import { Boxes, Cpu, Download, HardDrive, Play, RefreshCw, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, EmptyState, Input, Segmented, StatusDot } from '@/components/ui'
import { WorkspaceHeader, WorkspaceScroll } from './workspace-surface'
import { useModels } from '@/hooks/use-models'
import { ModelLeaderboard } from './model-leaderboard'
import { useLocalRuntime, type InstallableModel } from '@/hooks/use-local-runtime'
import { useProviders } from '@/hooks/use-providers'
import { useSettings } from '@/store/settings'
import { ProgressLine } from '@/components/ui'
import { cn, formatBytes, formatNumber } from '@/lib/utils'
import { providerLabel } from '@/lib/providers/descriptors'
import type { AIModel, Capability } from '@/lib/providers/types'
import type { Tab } from '@/store/workspace'

type Filter = 'all' | 'local' | 'online' | 'image' | 'vision' | 'reasoning'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'local', label: 'Local' },
  { value: 'online', label: 'Online' },
  { value: 'image', label: 'Image' },
  { value: 'vision', label: 'Vision' },
  { value: 'reasoning', label: 'Reasoning' },
]

/**
 * The model library.
 *
 * Installed local models are read from the machine, cloud catalogues from the
 * provider. Nothing here is a hard-coded list pretending to be available — an
 * empty section means nothing is actually there.
 */
export function ModelsWorkspace(_props: { tab: Tab }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const { data, isLoading, refetch } = useModels()
  const { data: providers } = useProviders()
  const connectedCount = providers?.filter((p) => p.status.state === 'READY').length ?? 0

  const models = useMemo(() => {
    let list = data?.models ?? []
    switch (filter) {
      case 'local':
        list = list.filter((m) => m.providerId === 'local')
        break
      case 'online':
        list = list.filter((m) => m.providerId !== 'local')
        break
      case 'image':
        list = list.filter((m) => m.capabilities.includes('IMAGE_GENERATION') || m.capabilities.includes('VIDEO_GENERATION'))
        break
      case 'vision':
        list = list.filter((m) => m.capabilities.includes('VISION'))
        break
      case 'reasoning':
        list = list.filter((m) => m.capabilities.includes('REASONING'))
        break
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((m) => `${m.name} ${m.id} ${m.providerId}`.toLowerCase().includes(q))
    }
    return list
  }, [data?.models, filter, query])

  const grouped = useMemo(() => {
    const map = new Map<string, AIModel[]>()
    for (const model of models) map.set(model.providerId, [...(map.get(model.providerId) ?? []), model])
    return [...map.entries()].sort(([a], [b]) => (a === 'local' ? -1 : b === 'local' ? 1 : a.localeCompare(b)))
  }, [models])

  return (
    <WorkspaceScroll>
      <WorkspaceHeader
        title="Models"
        subtitle={modelsSubtitle(data?.models.length ?? 0, connectedCount)}
        actions={
          <>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter models"
              className="w-full sm:w-[200px]"
            />
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </>
        }
      />

      <LocalRuntimePanel />

      <div className="mt-6">
        <ModelLeaderboard />
      </div>

      <div className="mb-5 mt-8">
        <Segmented value={filter} onChange={setFilter} options={FILTERS} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[108px] rounded-[11px] shimmer" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No models match."
          line="Connect a provider in Settings, or start the local runtime and install a model."
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([providerId, list]) => (
            <section key={providerId}>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-[13px] font-medium text-ink">
                  {providerLabel(providerId as AIModel['providerId'])}
                </h2>
                <span className="text-[12px] text-ink-faint">{list.length}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(268px,1fr))] gap-3">
                {list.map((model) => (
                  <ModelCard key={`${model.providerId}:${model.id}`} model={model} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {data?.unavailable.length ? (
        <div className="mt-8 rounded-[11px] border border-line bg-surface p-4">
          <p className="text-[12.5px] font-medium text-ink">Some providers could not be reached</p>
          <ul className="mt-2 space-y-1">
            {data.unavailable.map((entry) => (
              <li key={entry.providerId} className="text-[12.5px] leading-relaxed text-ink-muted">
                <span className="text-ink">{providerLabel(entry.providerId)}</span> — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </WorkspaceScroll>
  )
}

function ModelCard({ model }: { model: AIModel }) {
  const settings = useSettings()
  const isDefault =
    settings.chatModel?.providerId === model.providerId && settings.chatModel?.modelId === model.id

  const setDefault = () => {
    const choice = { providerId: model.providerId, modelId: model.id }
    if (model.capabilities.includes('IMAGE_GENERATION')) settings.set('imageModel', choice)
    else if (model.capabilities.includes('VISION')) settings.set('visionModel', choice)
    else settings.set('chatModel', choice)
    toast.success(`${model.name} set as default`)
  }

  return (
    <div className="group rounded-[11px] border border-line bg-surface p-3.5 transition-colors duration-150 hover:border-line-strong">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-ink">
            {model.name}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">{model.id}</p>
        </div>
        <span
          className={cn(
            'mt-[3px] h-[6px] w-[6px] shrink-0 rounded-full',
            model.providerId === 'local' ? 'bg-local' : 'bg-cloud',
          )}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1">
        {model.capabilities.slice(0, 4).map((capability) => (
          <Badge key={capability} tone="neutral">
            {CAPABILITY_LABEL[capability] ?? capability.toLowerCase()}
          </Badge>
        ))}
      </div>

      <div className="mt-2.5 flex items-center gap-2 text-[11.5px] text-ink-faint">
        {model.contextLength ? <span>{formatNumber(model.contextLength)} ctx</span> : null}
        {model.sizeBytes ? <span>{formatBytes(model.sizeBytes, 1)}</span> : null}
        <span>
          {model.providerId === 'local'
            ? 'Free'
            : model.pricing?.inputPerMTok !== undefined
              ? `$${model.pricing.inputPerMTok.toFixed(2)}/M in`
              : 'Cost unavailable'}
        </span>

        <button
          onClick={setDefault}
          className="ml-auto text-[11.5px] text-ink-faint opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
        >
          {isDefault ? 'Default' : 'Set default'}
        </button>
      </div>
    </div>
  )
}

function modelsSubtitle(models: number, providers: number): string {
  const modelText = models === 1 ? '1 model' : `${models} models`
  const providerText = providers === 1 ? '1 connected provider' : `${providers} connected providers`
  return `${modelText} across ${providerText}`
}

const CAPABILITY_LABEL: Partial<Record<Capability, string>> = {
  CHAT: 'chat',
  VISION: 'vision',
  REASONING: 'reasoning',
  TOOLS: 'tools',
  EMBEDDINGS: 'embeddings',
  IMAGE_GENERATION: 'image',
  IMAGE_EDITING: 'edit',
  VIDEO_GENERATION: 'video',
  UPSCALE: 'upscale',
}

function LocalRuntimePanel() {
  const { snapshot, start, stop, unload, refresh } = useLocalRuntime({ poll: true })
  const [starting, setStarting] = useState(false)
  const online = snapshot?.online ?? false
  const system = snapshot?.system

  const handleStart = async () => {
    setStarting(true)
    const pending = toast.loading('Starting the local runtime…', {
      description: 'First launch builds a Python environment — this can take a few minutes.',
    })
    try {
      await start((status) =>
        // Show what the script is actually doing, so a long first run reads as
        // progress rather than as a hang.
        toast.loading('Starting the local runtime…', { id: pending, description: status }),
      )
      toast.success('Local runtime ready', { id: pending, description: undefined })
    } catch (err) {
      toast.error('Could not start the local runtime', {
        id: pending,
        description: err instanceof Error ? err.message : undefined,
        duration: 8000,
      })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="rounded-[13px] border border-line bg-surface p-5">
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-subtle">
          <Cpu className="h-[16px] w-[16px] text-ink-muted" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-medium tracking-[-0.01em] text-ink">Local runtime</p>
            <StatusDot state={starting ? 'busy' : online ? 'ready' : 'offline'} />
            <span className="text-[12.5px] text-ink-muted">
              {starting ? 'Starting' : online ? 'Running' : 'Not running'}
            </span>
          </div>

          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            {online && system
              ? [system.chip || system.arch, `${formatBytes(system.ramTotalBytes, 0)} RAM`, `${formatBytes(system.ramAvailableBytes, 0)} available`, system.gpu]
                  .filter(Boolean)
                  .join(' · ')
              : (snapshot?.detail ?? 'Start the runtime to use models on this machine.')}
          </p>

          {online && system?.modelsDir && (
            <div className="mt-2.5 space-y-1 border-l-2 border-line pl-2.5">
              <p className="text-[11.5px] text-ink-muted">
                <span className="text-ink-faint">Models folder</span>{' '}
                <code className="font-mono text-[11px] text-ink">{system.modelsDir}</code>{' '}
                <span className="text-ink-faint">
                  — {system.ggufCount} file{system.ggufCount === 1 ? '' : 's'}
                </span>
              </p>
              <p className="text-[11.5px] text-ink-muted">
                <span className="text-ink-faint">Runs them with</span>{' '}
                {system.llamaServer ? (
                  <code className="font-mono text-[11px] text-ink">{system.llamaServer}</code>
                ) : (
                  <span className="text-warn">
                    no llama-server found — install llama.cpp or set KOVAI_LLAMA_SERVER
                  </span>
                )}
              </p>
            </div>
          )}

          {online && snapshot?.loadedModel && (
            <div className="mt-3 flex items-center gap-2 rounded-[9px] border border-line bg-subtle px-2.5 py-2">
              <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-local" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                <span className="text-ink-muted">In memory:</span> {snapshot.loadedModel}
              </span>
              <button
                onClick={() => void unload()}
                className="shrink-0 text-[11.5px] text-ink-faint transition-colors hover:text-ink"
              >
                Unload
              </button>
            </div>
          )}

          {online && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(system?.backends ?? {}).map(([name, enabled]) => (
                <Badge key={name} tone={enabled ? 'local' : 'neutral'}>
                  {name} {enabled ? 'ready' : 'absent'}
                </Badge>
              ))}
              <Badge tone="neutral">{snapshot?.models.length ?? 0} installed</Badge>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {online ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => refresh()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void stop()}>
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" disabled={starting} onClick={handleStart}>
              <Play className="h-3.5 w-3.5" />
              {starting ? 'Starting…' : 'Start local runtime'}
            </Button>
          )}
        </div>
      </div>

      {online && snapshot && snapshot.installable.length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint">
            On disk, not yet installed
          </p>
          <div className="space-y-1.5">
            {snapshot.installable.map((model) => (
              <InstallableRow key={model.file} model={model} onInstalled={refresh} />
            ))}
          </div>
        </div>
      )}

      {online && snapshot && snapshot.models.length === 0 && snapshot.installable.length === 0 && (
        <div className="mt-4 rounded-[10px] border border-line bg-subtle p-3">
          <p className="text-[12.5px] font-medium text-ink">No local models detected.</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
            Drop a <code className="font-mono text-[11.5px]">.gguf</code> file into{' '}
            <code className="font-mono text-[11.5px]">models/</code> and it runs straight from there — or
            install one with <code className="font-mono text-[11.5px]">ollama pull llama3.2</code>.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * A GGUF file that is present on disk but not runnable yet.
 *
 * Importing copies several gigabytes into the inference backend's store, so the
 * progress the backend reports is streamed through to the interface rather than
 * hidden behind a spinner that says nothing.
 */
function InstallableRow({
  model,
  onInstalled,
}: {
  model: InstallableModel
  onInstalled: () => void
}) {
  const runtimeUrl = useSettings((s) => s.localRuntimeUrl)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const install = async () => {
    setBusy(true)
    setStatus('Starting…')
    try {
      const res = await fetch(`${runtimeUrl}/models/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: model.file }),
      })
      if (!res.ok || !res.body) throw new Error('The runtime rejected the import.')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let index: number
        while ((index = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, index).replace(/\r$/, '')
          buffer = buffer.slice(index + 1)
          if (!line.startsWith('data:')) continue

          const event = JSON.parse(line.slice(5).trim()) as {
            type: string
            text?: string
            message?: string
            model?: string
          }
          if (event.type === 'status' && event.text) setStatus(event.text)
          if (event.type === 'error') throw new Error(event.message ?? 'Import failed.')
          if (event.type === 'done') {
            toast.success(`${event.model} is ready to run`)
            setStatus(null)
            onInstalled()
            return
          }
        }
      }
      throw new Error('The import ended without confirming.')
    } catch (err) {
      toast.error('Could not install that model', {
        description: err instanceof Error ? err.message : undefined,
      })
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[9px] border border-line bg-subtle px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <HardDrive className="h-[13px] w-[13px] shrink-0 text-ink-faint" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] text-ink">{model.name}</p>
          <p className="truncate text-[11px] text-ink-faint">{formatBytes(model.sizeBytes, 1)} · GGUF</p>
        </div>
        <Button variant="secondary" size="xs" disabled={busy} onClick={() => void install()}>
          <Download className="h-3 w-3" />
          {busy ? 'Installing…' : 'Install'}
        </Button>
      </div>
      {status && (
        <div className="mt-2">
          <ProgressLine value={busy ? 55 : 100} />
          <p className="mt-1 truncate text-[11px] text-ink-faint">{status}</p>
        </div>
      )}
    </div>
  )
}
