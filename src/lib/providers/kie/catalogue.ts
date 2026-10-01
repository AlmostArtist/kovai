import type { AIModel, ParamSpec } from '../types'

/**
 * KIE model configuration.
 *
 * KIE exposes a broad, frequently changing catalogue, so models are treated as
 * *configuration* rather than code: the provider tries the live catalogue first
 * and falls back to this file. Adding a model here is enough to make it appear
 * in the Create workspace with the right controls — the UI builds its settings
 * panel from `params`, so a model without a seed simply has no seed field.
 *
 * You can also point KOVAI at your own JSON file with KIE_MODELS_FILE.
 */

const ASPECT = (values: string[], fallback = values[0]): ParamSpec => ({
  key: 'aspectRatio',
  label: 'Aspect ratio',
  type: 'enum',
  default: fallback,
  options: values.map((v) => ({ value: v, label: v })),
})

const SEED: ParamSpec = {
  key: 'seed',
  label: 'Seed',
  type: 'number',
  min: 0,
  max: 2_147_483_647,
  step: 1,
  advanced: true,
}

const NEGATIVE: ParamSpec = {
  key: 'negativePrompt',
  label: 'Negative prompt',
  type: 'text',
  multiline: true,
  advanced: true,
  placeholder: 'What to keep out of the frame',
}

const OUTPUT_FORMAT: ParamSpec = {
  key: 'outputFormat',
  label: 'Format',
  type: 'enum',
  default: 'png',
  advanced: true,
  options: [
    { value: 'png', label: 'PNG' },
    { value: 'jpeg', label: 'JPEG' },
  ],
}

export const KIE_FALLBACK_MODELS: AIModel[] = [
  {
    id: 'google/nano-banana',
    name: 'Nano Banana',
    providerId: 'kie',
    capabilities: ['IMAGE_GENERATION'],
    description: 'Fast general-purpose image generation.',
    tags: ['fast'],
    params: [
      ASPECT(['1:1', '3:4', '4:3', '9:16', '16:9'], '16:9'),
      { key: 'count', label: 'Images', type: 'number', min: 1, max: 4, step: 1, default: 1 },
      OUTPUT_FORMAT,
    ],
  },
  {
    id: 'google/nano-banana-edit',
    name: 'Nano Banana Edit',
    providerId: 'kie',
    capabilities: ['IMAGE_EDITING'],
    description: 'Prompt-driven editing of supplied images.',
    params: [
      { key: 'referenceImages', label: 'Images to edit', type: 'images', max: 5 },
      ASPECT(['auto', '1:1', '3:4', '4:3', '9:16', '16:9'], 'auto'),
      OUTPUT_FORMAT,
    ],
  },
  {
    id: 'bytedance/seedream-v4',
    name: 'Seedream v4',
    providerId: 'kie',
    capabilities: ['IMAGE_GENERATION'],
    description: 'High-detail image generation with reference support.',
    tags: ['creative'],
    params: [
      ASPECT(['1:1', '3:4', '4:3', '9:16', '16:9', '21:9'], '16:9'),
      {
        key: 'imageSize',
        label: 'Resolution',
        type: 'enum',
        default: '2K',
        options: [
          { value: '1K', label: '1K' },
          { value: '2K', label: '2K' },
          { value: '4K', label: '4K' },
        ],
      },
      { key: 'referenceImages', label: 'Reference images', type: 'images', max: 4 },
      SEED,
      NEGATIVE,
    ],
  },
  {
    id: 'google/veo-3-fast',
    name: 'Veo 3 Fast',
    providerId: 'kie',
    capabilities: ['VIDEO_GENERATION'],
    description: 'Text or image driven video generation.',
    params: [
      ASPECT(['16:9', '9:16'], '16:9'),
      { key: 'referenceImages', label: 'First frame', type: 'images', max: 1 },
      {
        key: 'duration',
        label: 'Duration',
        type: 'enum',
        default: '8',
        options: [{ value: '8', label: '8 seconds' }],
      },
      SEED,
    ],
  },
]

/**
 * An entry in KIE's own catalogue, or in a user-supplied KIE_MODELS_FILE.
 *
 * KIE names the identifier `model` (with `slug` alongside it); a hand-written
 * file is more likely to say `id`. All three are accepted because the only
 * thing that matters is finding the string the API will recognise — and
 * failing to find it is how a live catalogue of 218 real models silently
 * became a hard-coded list of guesses.
 */
export interface KieModelConfig {
  id?: string
  model?: string
  slug?: string
  name?: string
  title?: string
  description?: string | null
  capabilities?: string[]
  /** KIE's own classification: "Text to Image", "Image to Image", … */
  taskType?: string[]
  params?: ParamSpec[]
}

/** Controls to offer for a remote model that ships no schema of its own. */
export const DEFAULT_IMAGE_PARAMS: ParamSpec[] = [
  ASPECT(['auto', '1:1', '3:4', '4:3', '9:16', '16:9'], 'auto'),
  { key: 'referenceImages', label: 'Reference images', type: 'images', max: 4 },
  SEED,
  NEGATIVE,
]

export const DEFAULT_VIDEO_PARAMS: ParamSpec[] = [
  ASPECT(['16:9', '9:16', '1:1'], '16:9'),
  { key: 'referenceImages', label: 'First frame', type: 'images', max: 1 },
  SEED,
]
