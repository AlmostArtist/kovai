/** Configuration for one MCP server. Client-safe: holds no secrets beyond env. */
export interface McpServerConfig {
  id: string
  name: string
  /** stdio spawns a local process; http connects to a running endpoint. */
  transport: 'stdio' | 'http'
  /** stdio only. */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** http only. */
  url?: string
  headers?: Record<string, string>
  enabled: boolean
  createdAt: number
}

export interface McpTool {
  /** Namespaced as `<serverId>__<toolName>` so two servers can share a name. */
  id: string
  serverId: string
  serverName: string
  name: string
  description?: string
  /** JSON Schema for the tool's arguments, passed through to the model. */
  inputSchema: Record<string, unknown>
}

export type McpServerState =
  | { status: 'connected'; toolCount: number; latencyMs?: number }
  | { status: 'disabled' }
  | { status: 'error'; message: string }

export interface McpServerStatus {
  config: McpServerConfig
  state: McpServerState
}

/** Namespacing keeps tool names unique across servers. */
export function toolId(serverId: string, name: string): string {
  return `${serverId}__${name}`
}

export function splitToolId(id: string): { serverId: string; name: string } | null {
  const index = id.indexOf('__')
  if (index === -1) return null
  return { serverId: id.slice(0, index), name: id.slice(index + 2) }
}
