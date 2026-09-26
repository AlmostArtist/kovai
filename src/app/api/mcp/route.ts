import { randomUUID } from 'node:crypto'
import { listTools, serverStatuses, upsertServer } from '@/lib/mcp/manager'
import { ProviderError } from '@/lib/providers/types'
import { assertLocalRequest, fail, ok, readJson } from '@/lib/api'
import type { McpServerConfig } from '@/lib/mcp/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [servers, tools] = await Promise.all([serverStatuses(), listTools()])
    return ok({ servers, tools })
  } catch (err) {
    return fail(err)
  }
}

/**
 * Adds or updates an MCP server.
 *
 * A stdio server is an arbitrary command, so this is only accepted from this
 * machine — the same rule that guards starting the local runtime. Configuration
 * that can run a process should not be reachable from a deployed instance.
 */
export async function POST(req: Request) {
  try {
    assertLocalRequest(req)
    const body = await readJson<Partial<McpServerConfig>>(req)

    if (!body.name?.trim()) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'Give the server a name.' })
    }
    const transport = body.transport === 'http' ? 'http' : 'stdio'
    if (transport === 'stdio' && !body.command?.trim()) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'A local server needs a command to run.' })
    }
    if (transport === 'http' && !/^https?:\/\//.test(body.url ?? '')) {
      throw new ProviderError({ code: 'BAD_REQUEST', message: 'A remote server needs an http(s) URL.' })
    }

    const config: McpServerConfig = {
      id: body.id ?? randomUUID(),
      name: body.name.trim(),
      transport,
      command: transport === 'stdio' ? body.command?.trim() : undefined,
      args: transport === 'stdio' ? (body.args ?? []) : undefined,
      env: body.env,
      url: transport === 'http' ? body.url : undefined,
      headers: body.headers,
      enabled: body.enabled ?? true,
      createdAt: body.createdAt ?? Date.now(),
    }

    await upsertServer(config)
    return ok({ servers: await serverStatuses() }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}
