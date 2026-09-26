import 'server-only'

import { randomUUID } from 'node:crypto'
import { getChatProvider } from '../providers/registry'
import { createJob, getJob } from '../jobs/manager'
import { ProviderError, toProviderError } from '../providers/types'
import { store } from '../db'
import type { Workflow, WorkflowNode, WorkflowRun } from '../db/types'
import type { ProviderId } from '../providers/types'

/**
 * Workflow execution.
 *
 * Nodes run in dependency order, each receiving the outputs of the nodes wired
 * into it. Every node delegates to the same provider layer the workspaces use,
 * so a workflow can do anything the interface can do and nothing it cannot.
 *
 * Values flow as a simple record; a node's config can reference upstream output
 * with {{nodeId}} or {{nodeId.field}}.
 */

type Values = Record<string, unknown>

export async function runWorkflow(
  workflow: Workflow,
  input: Values = {},
): Promise<WorkflowRun> {
  const db = await store()
  const order = topoSort(workflow)

  const run: WorkflowRun = {
    id: randomUUID(),
    workflowId: workflow.id,
    status: 'RUNNING',
    steps: order.map((node) => ({ nodeId: node.id, status: 'PENDING' })),
    startedAt: Date.now(),
  }
  await db.workflows.upsertRun(run)

  const values: Values = { ...input }

  for (const node of order) {
    const step = run.steps.find((s) => s.nodeId === node.id)!
    step.status = 'RUNNING'
    step.startedAt = Date.now()
    await db.workflows.upsertRun(run)

    try {
      const output = await runNode(node, values, workflow)
      if (output === SKIP) {
        step.status = 'SKIPPED'
      } else {
        values[node.id] = output
        step.status = 'COMPLETED'
        step.output = output
      }
      step.endedAt = Date.now()
    } catch (err) {
      const error = toProviderError(err)
      step.status = 'FAILED'
      step.error = error.message
      step.endedAt = Date.now()
      run.status = 'FAILED'
      run.error = `${node.label}: ${error.message}`
      run.endedAt = Date.now()
      await db.workflows.upsertRun(run)
      return run
    }

    await db.workflows.upsertRun(run)
  }

  run.status = 'COMPLETED'
  run.endedAt = Date.now()
  await db.workflows.upsertRun(run)
  return run
}

/** Sentinel returned by a CONDITION node that gates the branch off. */
const SKIP = Symbol('skip')

async function runNode(node: WorkflowNode, values: Values, workflow: Workflow): Promise<unknown> {
  const cfg = node.config as Record<string, string | undefined>

  switch (node.type) {
    case 'INPUT':
      return values[node.id] ?? cfg.value ?? ''

    case 'CHAT':
    case 'VISION': {
      const providerId = (cfg.providerId as ProviderId) ?? 'openrouter'
      const model = cfg.model
      if (!model) throw new ProviderError({ code: 'BAD_REQUEST', message: `${node.label} has no model selected.` })

      const prompt = interpolate(cfg.prompt ?? '{{input}}', values)
      const images = node.type === 'VISION' ? collectImages(cfg.images, values) : []

      let text = ''
      for await (const chunk of getChatProvider(providerId).streamChat({
        model,
        messages: [
          ...(cfg.system ? [{ role: 'system' as const, content: cfg.system }] : []),
          {
            role: 'user' as const,
            content: prompt,
            attachments: images.map((url) => ({ url, mimeType: 'image/*' })),
          },
        ],
      })) {
        if (chunk.type === 'text') text += chunk.text
        if (chunk.type === 'error') throw chunk.error
      }
      return text
    }

    case 'IMAGE':
    case 'VIDEO': {
      const providerId = (cfg.providerId as ProviderId) ?? 'higgsfield'
      const model = cfg.model
      if (!model) throw new ProviderError({ code: 'BAD_REQUEST', message: `${node.label} has no model selected.` })

      const job = await createJob({
        providerId,
        kind: node.type === 'VIDEO' ? 'video' : 'image',
        projectId: workflow.projectId,
        request: {
          model,
          prompt: interpolate(cfg.prompt ?? '{{input}}', values),
          params: (node.config.params as Record<string, unknown>) ?? {},
          referenceImages: collectImages(cfg.references, values),
        },
      })

      // Generation is asynchronous everywhere else; inside a workflow the step
      // waits, because the next node needs the result.
      const finished = await waitForJob(job.id)
      if (finished.status !== 'COMPLETED') {
        throw finished.error ?? new ProviderError({ code: 'PROVIDER_ERROR', message: 'Generation failed.' })
      }
      return { urls: finished.outputs.map((o) => o.url), jobId: finished.id }
    }

    case 'HTTP': {
      const url = interpolate(cfg.url ?? '', values)
      if (!/^https?:\/\//.test(url))
        throw new ProviderError({ code: 'BAD_REQUEST', message: `${node.label} needs an absolute URL.` })
      const res = await fetch(url, {
        method: cfg.method ?? 'GET',
        headers: cfg.headers ? (JSON.parse(cfg.headers) as Record<string, string>) : undefined,
        body: cfg.body ? interpolate(cfg.body, values) : undefined,
        signal: AbortSignal.timeout(30_000),
      })
      const text = await res.text()
      if (!res.ok)
        throw new ProviderError({
          code: 'PROVIDER_ERROR',
          message: `${node.label} failed (${res.status}).`,
          detail: text.slice(0, 300),
        })
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    }

    case 'CONDITION': {
      const left = interpolate(cfg.left ?? '', values)
      const right = interpolate(cfg.right ?? '', values)
      const passes =
        cfg.operator === 'contains'
          ? left.includes(right)
          : cfg.operator === 'not_equals'
            ? left !== right
            : cfg.operator === 'not_empty'
              ? left.trim().length > 0
              : left === right
      return passes ? true : SKIP
    }

    case 'TRANSFORM':
      return interpolate(cfg.template ?? '{{input}}', values)

    case 'SAVE': {
      const db = await store()
      const urls = collectImages(cfg.source, values)
      const saved = []
      for (const url of urls) {
        saved.push(
          await db.assets.upsert({
            id: randomUUID(),
            name: interpolate(cfg.name ?? 'Workflow output', values).slice(0, 80),
            kind: /\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : 'image',
            url,
            origin: 'generated',
            projectId: workflow.projectId,
            favorite: false,
            createdAt: Date.now(),
          }),
        )
      }
      return { saved: saved.length, assets: saved.map((a) => a.id) }
    }

    case 'EXPORT':
      return { exported: values[cfg.source ?? ''] ?? values }

    default:
      throw new ProviderError({
        code: 'BAD_REQUEST',
        message: `Unknown node type "${node.type}".`,
      })
  }
}

async function waitForJob(jobId: string, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const job = await getJob(jobId)
    if (job && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return job
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new ProviderError({ code: 'TIMEOUT', message: 'The generation step timed out.' })
}

/** `{{nodeId}}` / `{{nodeId.field}}` / `{{input}}` substitution. */
function interpolate(template: string, values: Values): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = resolve(path, values)
    if (value === undefined || value === null) return ''
    return typeof value === 'string' ? value : JSON.stringify(value)
  })
}

function resolve(path: string, values: Values): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, values)
}

function collectImages(ref: string | undefined, values: Values): string[] {
  if (!ref) return []
  const value = resolve(ref.replace(/[{}]/g, '').trim(), values) ?? ref
  if (typeof value === 'string') return value.startsWith('http') || value.startsWith('data:') ? [value] : []
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (value && typeof value === 'object' && Array.isArray((value as { urls?: string[] }).urls))
    return (value as { urls: string[] }).urls
  return []
}

/** Kahn's algorithm; disconnected nodes still run, in their stored order. */
function topoSort(workflow: Workflow): WorkflowNode[] {
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]))
  const indegree = new Map(workflow.nodes.map((n) => [n.id, 0]))
  const outgoing = new Map<string, string[]>()

  for (const edge of workflow.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  }

  const queue = workflow.nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0)
  const sorted: WorkflowNode[] = []

  while (queue.length) {
    const node = queue.shift()!
    sorted.push(node)
    for (const next of outgoing.get(node.id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(byId.get(next)!)
    }
  }

  // A cycle leaves nodes unsorted; append them so the run fails loudly at the
  // offending node rather than silently dropping work.
  for (const node of workflow.nodes) if (!sorted.includes(node)) sorted.push(node)
  return sorted
}
