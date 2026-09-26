import 'server-only'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { store } from '../db'
import { toolId, type McpServerConfig, type McpServerStatus, type McpTool } from './types'

/**
 * Connections to MCP servers.
 *
 * Clients are cached per server and reused across requests: connecting means
 * either spawning a process or completing an HTTP handshake, and doing that per
 * tool call would make every agent step cost a connection.
 *
 * A server that fails to connect is reported, never thrown — one broken server
 * must not take the tool list, the agent, or the settings page down with it.
 */

interface Connection {
  client: Client
  connectedAt: number
  tools: McpTool[]
}

const globalRef = globalThis as typeof globalThis & {
  __kovaiMcp?: { connections: Map<string, Connection>; failures: Map<string, string> }
}
const state = (globalRef.__kovaiMcp ??= { connections: new Map(), failures: new Map() })

const SETTINGS_KEY = 'mcpServers'

export async function listServers(): Promise<McpServerConfig[]> {
  const db = await store()
  const settings = await db.settings.read()
  const raw = settings[SETTINGS_KEY]
  return Array.isArray(raw) ? (raw as McpServerConfig[]) : []
}

export async function saveServers(servers: McpServerConfig[]): Promise<McpServerConfig[]> {
  const db = await store()
  await db.settings.write({ [SETTINGS_KEY]: servers })
  return servers
}

export async function upsertServer(config: McpServerConfig): Promise<McpServerConfig[]> {
  const servers = await listServers()
  const index = servers.findIndex((s) => s.id === config.id)
  if (index === -1) servers.push(config)
  else servers[index] = config
  // A changed definition invalidates the live connection.
  await disconnect(config.id)
  return saveServers(servers)
}

export async function removeServer(id: string): Promise<McpServerConfig[]> {
  await disconnect(id)
  return saveServers((await listServers()).filter((s) => s.id !== id))
}

export async function disconnect(id: string): Promise<void> {
  const connection = state.connections.get(id)
  state.connections.delete(id)
  state.failures.delete(id)
  if (connection) await connection.client.close().catch(() => {})
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...state.connections.keys()].map(disconnect))
}

/**
 * Whether KOVAI may spawn local processes for stdio servers.
 *
 * An MCP stdio server is an arbitrary command. That is the whole point of the
 * transport, but it means the configuration is as privileged as a shell, so it
 * is gated by an explicit environment switch and never driven by request data.
 */
function stdioAllowed(): boolean {
  return process.env.KOVAI_ALLOW_MCP_STDIO !== '0'
}

async function connect(config: McpServerConfig): Promise<Connection> {
  const existing = state.connections.get(config.id)
  if (existing) return existing

  const client = new Client(
    { name: 'kovai', version: '0.1.0' },
    { capabilities: {} },
  )

  if (config.transport === 'stdio') {
    if (!stdioAllowed()) {
      throw new Error('Local MCP servers are disabled (KOVAI_ALLOW_MCP_STDIO=0).')
    }
    if (!config.command) throw new Error('This server has no command to run.')

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...(process.env as Record<string, string>), ...(config.env ?? {}) },
      stderr: 'ignore',
    })
    await client.connect(transport)
  } else {
    if (!config.url) throw new Error('This server has no URL.')
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers: config.headers },
    })
    await client.connect(transport)
  }

  const listed = await client.listTools()
  const tools: McpTool[] = (listed.tools ?? []).map((tool) => ({
    id: toolId(config.id, tool.name),
    serverId: config.id,
    serverName: config.name,
    name: tool.name,
    description: tool.description,
    inputSchema: (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
  }))

  const connection: Connection = { client, connectedAt: Date.now(), tools }
  state.connections.set(config.id, connection)
  state.failures.delete(config.id)
  return connection
}

/** Connection state for every configured server. Never throws. */
export async function serverStatuses(): Promise<McpServerStatus[]> {
  const servers = await listServers()

  return Promise.all(
    servers.map(async (config): Promise<McpServerStatus> => {
      if (!config.enabled) return { config, state: { status: 'disabled' } }
      const started = Date.now()
      try {
        const connection = await connect(config)
        return {
          config,
          state: {
            status: 'connected',
            toolCount: connection.tools.length,
            latencyMs: Date.now() - started,
          },
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not connect.'
        state.failures.set(config.id, message)
        return { config, state: { status: 'error', message } }
      }
    }),
  )
}

/** Every tool across every enabled server that is reachable. */
export async function listTools(serverIds?: string[]): Promise<McpTool[]> {
  const servers = (await listServers()).filter(
    (s) => s.enabled && (!serverIds?.length || serverIds.includes(s.id)),
  )

  const results = await Promise.all(
    servers.map(async (config) => {
      try {
        return (await connect(config)).tools
      } catch {
        return [] as McpTool[]
      }
    }),
  )
  return results.flat()
}

export interface ToolResult {
  ok: boolean
  /** Text rendering of the result, which is what a model can actually consume. */
  content: string
  isError?: boolean
}

/** Invokes one tool by its namespaced id. */
export async function callTool(
  id: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const parts = id.includes('__') ? { serverId: id.slice(0, id.indexOf('__')), name: id.slice(id.indexOf('__') + 2) } : null
  if (!parts) return { ok: false, content: `"${id}" is not a valid tool id.`, isError: true }

  const config = (await listServers()).find((s) => s.id === parts.serverId)
  if (!config) return { ok: false, content: `No MCP server "${parts.serverId}" is configured.`, isError: true }
  if (!config.enabled) return { ok: false, content: `${config.name} is disabled.`, isError: true }

  try {
    const { client } = await connect(config)
    const result = await client.callTool({ name: parts.name, arguments: args })

    // Results arrive as typed content blocks; a model needs text.
    const blocks = (result.content ?? []) as { type: string; text?: string; [k: string]: unknown }[]
    const content =
      blocks
        .map((block) =>
          block.type === 'text' ? (block.text ?? '') : `[${block.type}]`,
        )
        .filter(Boolean)
        .join('\n')
        .trim() || '(the tool returned no output)'

    return { ok: !result.isError, content, isError: Boolean(result.isError) }
  } catch (err) {
    return {
      ok: false,
      content: err instanceof Error ? err.message : 'The tool call failed.',
      isError: true,
    }
  }
}
