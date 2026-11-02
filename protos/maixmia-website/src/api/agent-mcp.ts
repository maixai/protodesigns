// 继承 Agent 与项目自有 MCP API;业务失败统一走 Result,项目操作按 path 返回更新后的分组。
import type { McpProjectGroup } from '../contracts/generated/mcp-project-group'
import type { McpServer } from '../contracts/generated/mcp-server'
import type { McpServerInput } from '../contracts/generated/mcp-server-input'
import type { PluginMcpServer } from '../contracts/generated/plugin-mcp-server'
import { useI18n } from '../i18n'
import { delay } from '../mocks/delay'
import {
  mockAddAgentMcpServer, mockAddProjectMcpServer, mockConnectAgentMcpServer,
  mockConnectProjectMcpServer, mockListAgentMcpServers, mockListProjectMcpServers,
  mockRemoveAgentMcpServer, mockRemoveProjectMcpServer, mockSaveProjectMcpGroup,
  mockSetAgentMcpServerEnabled,
  mockSetProjectMcpServerEnabled,
} from '../mocks/agent-mcp'
import { currentRoute } from '../router'
import { mockAgentPluginMcpServers, mockReconnectAgentPluginMcpServer } from '../mocks/workspace'
import type { Result } from './result'

const { t } = useI18n()
const SERVER_NAME_PATTERN = /^[A-Za-z0-9._-]+$/

function unavailableError(): Error | null {
  return currentRoute.value.demoState === 'error' ? new Error(t.value.workspace.mcp.loadError) : null
}

function pluginMutationError(serverId: string): Error | null {
  return serverId.startsWith('plugin:') ? new Error(t.value.workspace.mcp.pluginReadOnly) : null
}

function validateInput(input: McpServerInput, existing: readonly McpServer[], duplicateMessage: string): Error | null {
  const copy = t.value.workspace.mcp
  const name = input.name.trim()
  if (name === '' || input.endpoint.trim() === '') return new Error(copy.requiredFields)
  if (!SERVER_NAME_PATTERN.test(name)) return new Error(copy.invalidName)
  if (existing.some((server) => server.name === name)) return new Error(duplicateMessage)
  return null
}

function normalizedInput(input: McpServerInput): McpServerInput {
  return { ...input, name: input.name.trim(), endpoint: input.endpoint.trim(), displayName: input.displayName.trim() }
}

export async function listAgentMcpServers(agentId: string): Promise<Result<McpServer[]>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockListAgentMcpServers(agentId) }
}

// 插件贡献走独立只读 API,与手配列表及写操作互不复用。
export async function listAgentPluginMcpServers(agentId: string): Promise<Result<PluginMcpServer[]>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  const servers = mockAgentPluginMcpServers(agentId)
  if (servers === null) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  return { ok: true, value: servers }
}

// 插件重连只恢复运行时连接;非 failed 状态一律拒绝,不改安装态或配置。
export async function reconnectAgentPluginMcpServer(agentId: string, sdkName: string): Promise<Result<PluginMcpServer[]>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  const current = mockAgentPluginMcpServers(agentId)
  if (current === null) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  const server = current.find((item) => item.sdkName === sdkName)
  if (server === undefined) return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  if (server.status !== 'failed') return { ok: false, error: new Error(t.value.workspace.mcp.pluginReconnectUnavailable) }
  return { ok: true, value: mockReconnectAgentPluginMcpServer(agentId, sdkName) }
}

export async function addAgentMcpServer(agentId: string, input: McpServerInput): Promise<Result<McpServer[]>> {
  await delay()
  const unavailable = unavailableError()
  if (unavailable !== null) return { ok: false, error: unavailable }
  const invalid = validateInput(input, mockListAgentMcpServers(agentId), t.value.workspace.mcp.duplicateName)
  if (invalid !== null) return { ok: false, error: invalid }
  return { ok: true, value: mockAddAgentMcpServer(agentId, normalizedInput(input)) }
}

export async function removeAgentMcpServer(agentId: string, serverId: string): Promise<Result<McpServer[]>> {
  await delay()
  const readOnly = pluginMutationError(serverId)
  if (readOnly !== null) return { ok: false, error: readOnly }
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockRemoveAgentMcpServer(agentId, serverId) }
}

export async function setAgentMcpServerEnabled(agentId: string, serverId: string, enabled: boolean): Promise<Result<McpServer[]>> {
  await delay()
  const readOnly = pluginMutationError(serverId)
  if (readOnly !== null) return { ok: false, error: readOnly }
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockSetAgentMcpServerEnabled(agentId, serverId, enabled) }
}

export async function authenticateAgentMcpServer(agentId: string, serverId: string): Promise<Result<McpServer[]>> {
  await delay()
  const readOnly = pluginMutationError(serverId)
  if (readOnly !== null) return { ok: false, error: readOnly }
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockConnectAgentMcpServer(agentId, serverId) }
}

export async function reconnectAgentMcpServer(agentId: string, serverId: string): Promise<Result<McpServer[]>> {
  await delay()
  const readOnly = pluginMutationError(serverId)
  if (readOnly !== null) return { ok: false, error: readOnly }
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockConnectAgentMcpServer(agentId, serverId) }
}

export async function listProjectMcpServers(path: string): Promise<Result<McpProjectGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockListProjectMcpServers(path) }
}

export async function saveProjectMcpGroup(path: string, servers: readonly McpServer[]): Promise<Result<McpProjectGroup>> {
  await delay()
  const unavailable = unavailableError()
  if (unavailable !== null) return { ok: false, error: unavailable }
  const names = new Set<string>()
  for (const server of servers) {
    const input: McpServerInput = { name: server.name, displayName: server.displayName, transport: server.transport, endpoint: server.endpoint }
    const invalid = validateInput(input, [], t.value.workspace.mcp.duplicateProjectName)
    if (invalid !== null) return { ok: false, error: invalid }
    if (names.has(server.name.trim()) || server.scope !== 'project' || server.ownerId !== path) {
      return { ok: false, error: new Error(t.value.workspace.mcp.duplicateProjectName) }
    }
    names.add(server.name.trim())
  }
  return { ok: true, value: mockSaveProjectMcpGroup(path, servers) }
}

export async function addProjectMcpServer(path: string, input: McpServerInput): Promise<Result<McpProjectGroup>> {
  await delay()
  const unavailable = unavailableError()
  if (unavailable !== null) return { ok: false, error: unavailable }
  const invalid = validateInput(input, mockListProjectMcpServers(path).servers, t.value.workspace.mcp.duplicateProjectName)
  if (invalid !== null) return { ok: false, error: invalid }
  return { ok: true, value: mockAddProjectMcpServer(path, normalizedInput(input)) }
}

export async function removeProjectMcpServer(path: string, serverId: string): Promise<Result<McpProjectGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockRemoveProjectMcpServer(path, serverId) }
}

export async function setProjectMcpServerEnabled(path: string, serverId: string, enabled: boolean): Promise<Result<McpProjectGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockSetProjectMcpServerEnabled(path, serverId, enabled) }
}

export async function authenticateProjectMcpServer(path: string, serverId: string): Promise<Result<McpProjectGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockConnectProjectMcpServer(path, serverId) }
}

export async function reconnectProjectMcpServer(path: string, serverId: string): Promise<Result<McpProjectGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockConnectProjectMcpServer(path, serverId) }
}
