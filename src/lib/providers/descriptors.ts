import type { ProviderDescriptor, ProviderId } from './types'

/**
 * Client-safe provider metadata.
 *
 * The adapters themselves are server-only (they hold credentials), but the
 * interface needs to name providers, show their capabilities and render setup
 * states. That metadata lives here so no component ever imports an adapter.
 */

export const LOCAL_DESCRIPTOR: ProviderDescriptor = {
  id: 'local',
  name: 'Local Runtime',
  kind: 'LOCAL',
  capabilities: ['CHAT', 'VISION', 'EMBEDDINGS', 'REASONING', 'TOOLS'],
  summary: 'Models running on this machine. Nothing leaves the device.',
  requiredEnv: [],
}

export const OPENROUTER_DESCRIPTOR: ProviderDescriptor = {
  id: 'openrouter',
  name: 'OpenRouter',
  kind: 'CLOUD',
  capabilities: ['CHAT', 'VISION', 'REASONING', 'TOOLS'],
  summary: 'Online chat, vision and reasoning across many hosted models.',
  docsUrl: 'https://openrouter.ai/docs',
  requiredEnv: ['OPENROUTER_API_KEY'],
}

export const HIGGSFIELD_DESCRIPTOR: ProviderDescriptor = {
  id: 'higgsfield',
  name: 'Higgsfield',
  kind: 'CLOUD',
  capabilities: ['IMAGE_GENERATION', 'IMAGE_EDITING', 'VIDEO_GENERATION'],
  summary: 'Primary image and video generation. Imagery only — never chat or vision.',
  docsUrl: 'https://docs.higgsfield.ai',
  requiredEnv: ['HF_API_KEY_ID', 'HF_API_KEY_SECRET'],
}

export const KIE_DESCRIPTOR: ProviderDescriptor = {
  id: 'kie',
  name: 'KIE',
  kind: 'CLOUD',
  capabilities: ['IMAGE_GENERATION', 'IMAGE_EDITING', 'VIDEO_GENERATION', 'UPSCALE'],
  summary: 'Secondary generation provider for images, edits and video.',
  docsUrl: 'https://docs.kie.ai',
  requiredEnv: ['KIE_API_KEY'],
}

export const DESCRIPTORS: Record<ProviderId, ProviderDescriptor> = {
  local: LOCAL_DESCRIPTOR,
  openrouter: OPENROUTER_DESCRIPTOR,
  higgsfield: HIGGSFIELD_DESCRIPTOR,
  kie: KIE_DESCRIPTOR,
}

export const PROVIDER_ORDER: ProviderId[] = ['local', 'openrouter', 'higgsfield', 'kie']

/**
 * Whether a model costs nothing to run.
 *
 * Local models are free because they run on your own hardware. A cloud model is
 * free only when the provider says its rates are zero — an absent price means
 * unknown, not free, so it is excluded rather than assumed.
 */
export function isFreeModel(model: {
  providerId: ProviderId
  id: string
  pricing?: { inputPerMTok?: number; outputPerMTok?: number; perRequest?: number }
}): boolean {
  if (model.providerId === 'local') return true

  const { inputPerMTok, outputPerMTok, perRequest } = model.pricing ?? {}
  const known = [inputPerMTok, outputPerMTok, perRequest].filter(
    (value): value is number => typeof value === 'number',
  )
  if (known.length) return known.every((value) => value === 0)

  // OpenRouter marks its no-cost variants with a :free suffix.
  return model.id.endsWith(':free')
}

/** Short badge text shown on every generation and every assistant message. */
export function providerLabel(id: ProviderId): string {
  return id === 'local' ? 'LOCAL' : DESCRIPTORS[id].name
}
