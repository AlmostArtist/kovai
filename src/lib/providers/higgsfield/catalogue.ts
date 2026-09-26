import { HIGGSFIELD_WORKFLOWS, type HiggsfieldField, type HiggsfieldWorkflow } from './workflows.generated'
import type { AIModel, ParamSpec } from '../types'

export type { HiggsfieldField, HiggsfieldWorkflow }

/**
 * Turns Higgsfield's generated workflow list into models KOVAI can offer.
 *
 * The generated file is a faithful copy of the published request schemas and
 * nothing more. This module is where those schemas become a catalogue: which
 * workflows are worth showing, what each one can do, and which controls the
 * Create workspace should draw for it.
 */

/**
 * Soul ID trains a character and returns a reference id rather than an image,
 * so it is not something the Create workspace can render a result for. It stays
 * in the generated file — it is a real endpoint — but it is not a model here.
 */
const TRAINING_WORKFLOWS = new Set(['soul-id/create-character'])

/** The prompt is the prompt; it never becomes a parameter control. */
const PROMPT_FIELD = 'prompt'

export const HIGGSFIELD_MODELS: HiggsfieldWorkflow[] = HIGGSFIELD_WORKFLOWS.filter(
  (w) => !TRAINING_WORKFLOWS.has(w.id),
)

export function specFor(id: string): HiggsfieldWorkflow | undefined {
  return HIGGSFIELD_MODELS.find((w) => w.id === id)
}

/** The image inputs a workflow takes, in the order references should fill them. */
export function imageFields(spec: HiggsfieldWorkflow): HiggsfieldField[] {
  const fields = spec.fields.filter((f) => f.media === 'image')
  // An array field swallows every reference, so it always goes first; the
  // single-URL fields are positional (first frame, then last frame).
  return [...fields.filter((f) => f.type === 'array'), ...fields.filter((f) => f.type !== 'array')]
}

/** How many reference images the workflow can be given in total. */
export function referenceCapacity(spec: HiggsfieldWorkflow): number {
  return imageFields(spec).reduce((sum, f) => sum + (f.type === 'array' ? (f.maxItems ?? 10) : 1), 0)
}

/** True when the workflow cannot run without reference media. */
export function requiresImages(spec: HiggsfieldWorkflow): boolean {
  return imageFields(spec).some((f) => f.required)
}

/** A readable name: "SOUL V2" for a single-workflow family, "Kling 3 · Pro" otherwise. */
function displayName(spec: HiggsfieldWorkflow): string {
  const siblings = HIGGSFIELD_MODELS.filter((w) => w.family === spec.family)
  if (siblings.length < 2) return spec.familyName
  return `${spec.familyName} · ${spec.workflow}`
}

const LABELS: Record<string, string> = {
  aspect_ratio: 'Aspect ratio',
  batch_size: 'Images',
  cfg_scale: 'Prompt adherence',
  duration: 'Duration',
  enhance_prompt: 'Prompt enhancement',
  generate_audio: 'Generate audio',
  negative_prompt: 'Negative prompt',
  num_images: 'Images',
  prompt_optimizer: 'Prompt optimiser',
  resolution: 'Resolution',
  seed: 'Seed',
  style_id: 'Style',
  style_strength: 'Style strength',
}

/** `custom_reference_strength` → "Custom reference strength". */
function labelFor(name: string): string {
  if (LABELS[name]) return LABELS[name]
  const words = name.replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Controls most people never touch stay behind the "Advanced" disclosure. */
const ADVANCED = new Set([
  'seed',
  'negative_prompt',
  'cfg_scale',
  'style_id',
  'style_strength',
  'custom_reference_id',
  'custom_reference_strength',
  'prompt_extend',
  'enable_thinking',
  'moderation',
  'output_format',
  'bitrate_mode',
])

/** One schema field becomes one control — or nothing, when it has no UI. */
function toParam(field: HiggsfieldField): ParamSpec | null {
  const label = labelFor(field.name)
  const advanced = ADVANCED.has(field.name) || undefined

  if (field.media === 'image') return null // handled as reference images

  if (field.media === 'video' || field.media === 'audio') {
    return {
      key: field.name,
      label,
      type: 'text',
      advanced,
      placeholder: `https://… ${field.media} URL`,
      help: `A publicly reachable ${field.media} URL.`,
    }
  }

  if (field.enum?.length) {
    return {
      key: field.name,
      label,
      type: 'enum',
      default: field.default !== undefined ? String(field.default) : undefined,
      options: field.enum.map((value) => ({ value: String(value), label: String(value) })),
      advanced,
    }
  }

  if (field.type === 'boolean') {
    return { key: field.name, label, type: 'boolean', default: field.default as boolean | undefined, advanced }
  }

  if (field.type === 'integer' || field.type === 'number') {
    return {
      key: field.name,
      label,
      type: 'number',
      min: field.min,
      max: field.max,
      step: field.step ?? (field.type === 'integer' ? 1 : 0.1),
      default: field.default as number | undefined,
      advanced,
    }
  }

  // Structured values — an RGB triple, a list of palette colours — have no
  // single control, and guessing one would misreport what the API accepts.
  if (field.type === 'array' || field.type === 'object') return null

  return {
    key: field.name,
    label,
    type: 'text',
    multiline: field.name.includes('prompt'),
    default: field.default as string | undefined,
    advanced,
  }
}

export function toAIModel(spec: HiggsfieldWorkflow): AIModel {
  const params: ParamSpec[] = []

  const capacity = referenceCapacity(spec)
  if (capacity > 0) {
    const required = requiresImages(spec)
    params.push({
      key: 'referenceImages',
      label: required ? 'Source images' : 'Reference images',
      type: 'images',
      max: capacity,
      help: required ? 'This workflow needs at least one image.' : undefined,
    })
  }

  for (const field of spec.fields) {
    if (field.name === PROMPT_FIELD) continue
    const param = toParam(field)
    if (param) params.push(param)
  }

  const capabilities: AIModel['capabilities'] =
    spec.output === 'video'
      ? ['VIDEO_GENERATION']
      : capacity > 0
        ? ['IMAGE_GENERATION', 'IMAGE_EDITING']
        : ['IMAGE_GENERATION']

  return {
    id: spec.id,
    name: displayName(spec),
    providerId: 'higgsfield',
    capabilities,
    description: spec.description,
    family: spec.familyName,
    params,
    tags: ['creative'],
  }
}
