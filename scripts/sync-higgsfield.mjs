#!/usr/bin/env node
/**
 * Regenerates src/lib/providers/higgsfield/workflows.generated.ts from the
 * published Higgsfield docs.
 *
 * Higgsfield has no catalogue endpoint, so the model list has to come from
 * somewhere. Reading the docs is the only source that is both complete and
 * authoritative: every workflow page carries its exact endpoint path and the
 * full JSON schema of its request body. Transcribing those by hand is how a
 * parameter ends up misspelled — and because the API silently ignores keys it
 * does not recognise, a misspelled parameter is not an error, it is a control
 * that quietly does nothing while the generation is still billed.
 *
 * Reads only. Nothing here touches api.higgsfield.ai or spends credits.
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DOCS = 'https://docs.higgsfield.ai'
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src/lib/providers/higgsfield/workflows.generated.ts',
)

/** Fetches a docs page as markdown, minus the boilerplate index banner. */
async function page(path, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${DOCS}${path}`, { headers: { 'user-agent': 'kovai-docs-sync' } })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      // Every page opens with a blockquoted "Documentation Index" banner that
      // would otherwise be read as the page's own one-line summary.
      return (await res.text()).replace(/^(?:>.*\n|[ \t]*\n)+/, '')
    } catch (error) {
      if (attempt >= attempts) throw new Error(`GET ${path} failed: ${error.message}`)
      await new Promise((r) => setTimeout(r, 600 * attempt))
    }
  }
}

/** Runs `work` over `items` with a fixed number of in-flight requests. */
async function mapLimit(items, limit, work) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await work(items[i])
      }
    }),
  )
  return results
}

const first = (re, text, fallback = '') => re.exec(text)?.[1]?.trim() ?? fallback

async function main() {
  // 1. The two category pages name every model family.
  const families = new Map()
  for (const [category, output] of [
    ['image-generation', 'image'],
    ['video-generation', 'video'],
  ]) {
    const md = await page(`/docs/models/${category}.md`)
    for (const [, slug] of md.matchAll(/href="\/docs\/models\/([a-z0-9-]+)"/g)) {
      if (!families.has(slug)) families.set(slug, { slug, output })
    }
  }
  console.log(`${families.size} model families`)

  // 2. Each family page lists its workflows and their endpoint paths.
  const ROW = /\[([^\]]+)\]\(\/docs\/models\/([a-z0-9-]+)\/([a-z0-9-]+)\)\s*\|\s*`POST (\/[^`]+)`/g
  const workflows = []
  await mapLimit([...families.values()], 8, async (family) => {
    const md = await page(`/docs/models/${family.slug}.md`)
    family.name = first(/^# (.+?) API\s*$/m, md, family.slug)
    for (const [, workflow, slug, wf, endpoint] of md.matchAll(ROW)) {
      workflows.push({ family, workflow, slug: wf, endpoint: endpoint.trim() })
    }
  })
  console.log(`${workflows.length} workflows`)

  // 3. Each workflow page carries the complete request schema.
  const SCHEMA = /<Accordion title="Complete JSON schema">\s*```json[^\n]*\n([\s\S]*?)\n\s*```/
  const entries = []
  await mapLimit(workflows, 8, async (w) => {
    const md = await page(`/docs/models/${w.family.slug}/${w.slug}.md`)
    const raw = SCHEMA.exec(md)?.[1]
    if (!raw) {
      console.warn(`  no schema: ${w.family.slug}/${w.slug}`)
      return
    }
    const schema = JSON.parse(raw)
    const required = new Set(schema.required ?? [])
    entries.push({
      id: `${w.family.slug}/${w.slug}`,
      endpoint: w.endpoint,
      family: w.family.slug,
      familyName: w.family.name,
      workflow: w.workflow,
      description: first(/^> (.+)$/m, md),
      output: w.family.output,
      fields: Object.entries(schema.properties ?? {}).map(([name, spec]) =>
        toField(name, spec, required.has(name)),
      ),
    })
  })

  entries.sort(
    (a, b) =>
      Number(a.output !== 'image') - Number(b.output !== 'image') ||
      a.familyName.localeCompare(b.familyName) ||
      a.workflow.localeCompare(b.workflow),
  )
  console.log(`${entries.length} workflows with schemas`)

  await writeFile(OUT, render(entries))
  console.log(`wrote ${OUT}`)
}

const IMAGE_INPUT = /(^|_)(image|frame)_urls?$/
const VIDEO_INPUT = /(^|_)video_urls?$/
const AUDIO_INPUT = /(^|_)audio_urls?$/

/** Flattens one JSON-schema property into the shape the adapter consumes. */
function toField(name, spec, required) {
  // Optional fields are written as `anyOf: [real, null]`; collapse that away.
  let shape = spec
  if (Array.isArray(spec.anyOf)) {
    const real = spec.anyOf.find((s) => s.type !== 'null')
    if (real) shape = { ...real, default: spec.default, title: spec.title }
  }

  const type = Array.isArray(shape.type) ? shape.type.find((t) => t !== 'null') : shape.type
  const field = { name, type: type ?? 'string' }
  if (required) field.required = true
  if (shape.enum) field.enum = shape.enum
  if (shape.default !== undefined && shape.default !== null) field.default = shape.default
  if (shape.minimum !== undefined) field.min = shape.minimum
  if (shape.maximum !== undefined) field.max = shape.maximum
  if (shape.multipleOf !== undefined) field.step = shape.multipleOf
  if (shape.minItems !== undefined) field.minItems = shape.minItems
  if (shape.maxItems !== undefined) field.maxItems = shape.maxItems
  if (shape.format) field.format = shape.format
  if (field.type === 'array') {
    if (shape.items?.format) field.itemFormat = shape.items.format
    field.maxItems ??= 10
  }
  if (IMAGE_INPUT.test(name)) field.media = 'image'
  else if (VIDEO_INPUT.test(name)) field.media = 'video'
  else if (AUDIO_INPUT.test(name)) field.media = 'audio'
  return field
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function literal(value, indent = 0) {
  const pad = '  '.repeat(indent)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    if (value.every((v) => typeof v !== 'object' || v === null))
      return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`
    return `[\n${value.map((v) => `${pad}  ${literal(v, indent + 1)},\n`).join('')}${pad}]`
  }
  if (value && typeof value === 'object') {
    const body = Object.entries(value)
      .map(([k, v]) => `${pad}  ${IDENT.test(k) ? k : JSON.stringify(k)}: ${literal(v, indent + 1)},\n`)
      .join('')
    return `{\n${body}${pad}}`
  }
  return JSON.stringify(value)
}

function render(entries) {
  return `/**
 * Higgsfield's catalogue — generated, not hand-written.
 *
 * Each entry is one documented workflow: its exact endpoint path and the exact
 * wire names, types, enums and bounds of its request body, taken from the
 * schema Higgsfield publishes for that workflow.
 *
 * Field names matter more here than anywhere else in this codebase. The API
 * ignores keys it does not recognise, so a misspelled parameter is not
 * rejected — it is silently dropped, and the generation is billed anyway.
 *
 * Regenerate with \`npm run sync:higgsfield\`. Do not edit by hand.
 *
 * Source: https://docs.higgsfield.ai/docs/models
 * Synced: ${new Date().toISOString().slice(0, 10)} — ${entries.length} workflows
 */

export type HiggsfieldFieldType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'

export interface HiggsfieldField {
  /** The wire name, sent verbatim. */
  name: string
  type: HiggsfieldFieldType
  required?: boolean
  default?: string | number | boolean
  enum?: (string | number)[]
  min?: number
  max?: number
  step?: number
  minItems?: number
  maxItems?: number
  format?: string
  itemFormat?: string
  /** Set when the field takes a URL to media the caller has to supply. */
  media?: 'image' | 'video' | 'audio'
}

export interface HiggsfieldWorkflow {
  /** \`family/workflow\` — the model id KOVAI uses everywhere else. */
  id: string
  /** Path appended to the API base, exactly as documented. */
  endpoint: string
  family: string
  familyName: string
  workflow: string
  description: string
  output: 'image' | 'video'
  fields: HiggsfieldField[]
}

export const HIGGSFIELD_WORKFLOWS: HiggsfieldWorkflow[] = ${literal(entries)}
`
}

await main()
