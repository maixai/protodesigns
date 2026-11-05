// 项目启停使用显式覆盖 API;null 为恢复,不等同于 false。
import type { ProjectToolOverrides } from '../contracts/generated/project-tool-overrides'
import type { PluginMcpServer } from '../contracts/generated/plugin-mcp-server'
import type { Result } from './result'
import { delay } from '../mocks/delay'
import { mockProjectToolOverrides, mockSetProjectToolOverride } from '../mocks/project-tools'
import { mockInstalledPlugins, mockProjectPluginMcpServers } from '../mocks/workspace'
import { mockListAgentMcpServers } from '../mocks/agent-mcp'
import { resolveProjectPlugins, projectToolsRevision } from '../data/project-tools'
import { currentRoute } from '../router'
import { useI18n } from '../i18n'
const { t } = useI18n()
function unavailable(): Error | null { return currentRoute.value.demoState === 'error' ? new Error(t.value.workspace.projectSettings.loadError) : null }
export async function getProjectToolOverrides(path: string): Promise<Result<ProjectToolOverrides>> {
  await delay()
  const error = unavailable()
  return error ? { ok: false, error } : { ok: true, value: mockProjectToolOverrides(path) }
}
export async function setProjectToolOverride(path: string, agentId: string, kind: 'plugins' | 'mcp', key: string, enabled: boolean | null): Promise<Result<ProjectToolOverrides>> {
  await delay()
  const error = unavailable()
  if (error) return { ok: false, error }
  const known = kind === 'plugins'
    ? resolveProjectPlugins(mockInstalledPlugins('agent', agentId) ?? [], mockInstalledPlugins('project', path) ?? [], mockProjectToolOverrides(path)).some((item) => item.key === key)
    : mockListAgentMcpServers(agentId).some((item) => item.name === key)
  if (!known) return { ok: false, error: new Error(t.value.workspace.projectSettings.loadError) }
  const value = mockSetProjectToolOverride(path, kind, key, enabled)
  projectToolsRevision.value += 1
  return { ok: true, value }
}
export async function listProjectPluginMcpServers(path: string, agentId: string): Promise<Result<PluginMcpServer[]>> {
  await delay()
  const error = unavailable()
  return error ? { ok: false, error } : { ok: true, value: mockProjectPluginMcpServers(path, agentId) }
}
