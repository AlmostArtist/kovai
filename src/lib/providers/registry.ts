import 'server-only'

import { localProvider, LocalProvider } from './local'
import { openRouterProvider } from './openrouter'
import { higgsfieldProvider } from './higgsfield'
import { kieProvider } from './kie'
import { DESCRIPTORS, PROVIDER_ORDER } from './descriptors'
import { ProviderError } from './types'
import type {
  AIModel,
  Capability,
  ChatProvider,
  ImageProvider,
  ProviderDescriptor,
  ProviderId,
  ProviderStatus,
} from './types'

/**
 * The single place that knows which providers exist.
 *
 * Registering a new provider is one entry here plus its adapter folder. No
 * component, hook or API route enumerates providers by hand.
 */
const CHAT_PROVIDERS: Partial<Record<ProviderId, ChatProvider>> = {
  local: localProvider,
  openrouter: openRouterProvider,
}

const IMAGE_PROVIDERS: Partial<Record<ProviderId, ImageProvider>> = {
  higgsfield: higgsfieldProvider,
  kie: kieProvider,
}

export function getChatProvider(id: ProviderId): ChatProvider {
  const provider = CHAT_PROVIDERS[id]
  if (!provider) throw new Error(`No chat provider registered for "${id}".`)
  return provider
}

export function getImageProvider(id: ProviderId): ImageProvider {
  const provider = IMAGE_PROVIDERS[id]
  if (!provider) throw new Error(`No image provider registered for "${id}".`)
  return provider
}

/**
 * Throws the setup error for a provider whose credentials are missing. Called
 * before a job is created so the interface shows "connect this provider"
 * straight away rather than recording a generation that was never going to run.
 */
export function assertImageProviderReady(id: ProviderId): void {
  const provider = getImageProvider(id)
  if (provider.configured) return
  const missing = DESCRIPTORS[id].requiredEnv.filter((key) => !process.env[key]?.trim())
  throw new ProviderError({
    code: 'UNCONFIGURED',
    message: `${DESCRIPTORS[id].name} isn't connected.`,
    providerId: id,
    detail: `Missing ${missing.join(' and ') || 'credentials'}. Add them in Settings → Providers.`,
    retryable: false,
  })
}

export function isImageProvider(id: string): id is ProviderId {
  return id in IMAGE_PROVIDERS
}

export const imageProviderIds = Object.keys(IMAGE_PROVIDERS) as ProviderId[]

export interface ProviderState {
  descriptor: ProviderDescriptor
  status: ProviderStatus
}

/** Status of every provider, resolved in parallel. Never throws. */
export async function getProviderStates(): Promise<ProviderState[]> {
  const all = { ...CHAT_PROVIDERS, ...IMAGE_PROVIDERS }
  return Promise.all(
    PROVIDER_ORDER.map(async (id) => {
      const provider = all[id]
      const descriptor = DESCRIPTORS[id]
      if (!provider) return { descriptor, status: { state: 'OFFLINE', detail: 'Not registered.' } as ProviderStatus }
      try {
        return { descriptor, status: await provider.status() }
      } catch (err) {
        return {
          descriptor,
          status: {
            state: 'ERROR',
            detail: err instanceof Error ? err.message : 'Status check failed.',
          } as ProviderStatus,
        }
      }
    }),
  )
}

/**
 * Every model KOVAI can currently reach, optionally filtered by capability.
 * A provider that is unconfigured or offline contributes nothing rather than
 * failing the whole call — the interface shows the rest and flags the gap.
 */
export async function listAllModels(options: {
  capability?: Capability
  /** In PRIVATE mode, cloud chat/vision providers are excluded entirely. */
  includeCloudText?: boolean
  localRuntimeUrl?: string
} = {}): Promise<{ models: AIModel[]; unavailable: { providerId: ProviderId; reason: string }[] }> {
  const { capability, includeCloudText = true, localRuntimeUrl } = options
  const unavailable: { providerId: ProviderId; reason: string }[] = []

  const sources: { id: ProviderId; list: () => Promise<AIModel[]> }[] = [
    {
      id: 'local',
      list: () => (localRuntimeUrl ? new LocalProvider(localRuntimeUrl) : localProvider).listModels(),
    },
    ...(includeCloudText ? [{ id: 'openrouter' as const, list: () => openRouterProvider.listModels() }] : []),
    { id: 'higgsfield', list: () => higgsfieldProvider.listModels() },
    { id: 'kie', list: () => kieProvider.listModels() },
  ]

  const results = await Promise.all(
    sources.map(async ({ id, list }) => {
      try {
        return await list()
      } catch (err) {
        unavailable.push({
          providerId: id,
          reason: err instanceof Error ? err.message : 'Unavailable.',
        })
        return [] as AIModel[]
      }
    }),
  )

  const models = results.flat().filter((m) => !capability || m.capabilities.includes(capability))
  return { models, unavailable }
}
