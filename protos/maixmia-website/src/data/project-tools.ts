// 所有项目工具表面的唯一生效推导入口;定义归属与启用覆盖分开计算。
import { ref } from 'vue'
import type { InstalledPlugin } from '../contracts/generated/installed-plugin'
import type { MarketplaceBinding } from '../contracts/generated/marketplace-binding'
import type { McpServer } from '../contracts/generated/mcp-server'
import type { ProjectToolOverrides } from '../contracts/generated/project-tool-overrides'
import type { ProjectPluginEntry } from '../contracts/generated/project-plugin-entry'
import type { ProjectMarketplaceEntry } from '../contracts/generated/project-marketplace-entry'
import type { ProjectMcpEntry } from '../contracts/generated/project-mcp-entry'

export const projectToolsRevision = ref(0)
export function pluginIdentity(item: InstalledPlugin): string { return `${item.plugin.id}@${item.plugin.marketplaceId}` }
export function resolveProjectPlugins(agent: readonly InstalledPlugin[], project: readonly InstalledPlugin[], overrides: ProjectToolOverrides): ProjectPluginEntry[] {
  const keys = new Set([...agent, ...project].map(pluginIdentity))
  return [...keys].flatMap((key): ProjectPluginEntry[] => {
    const inherited = agent.find((item) => pluginIdentity(item) === key)
    const own = project.find((item) => pluginIdentity(item) === key)
    const installed = own ?? inherited
    if (!installed) return []
    const overrideEnabled = own ? null : overrides.plugins.find((item) => item.key === key)?.enabled ?? null
    return [{ key, source: own ? inherited ? 'both' : 'project' : 'agent', agentEnabled: inherited?.enabled ?? null,
      overrideEnabled, effectiveEnabled: own?.enabled ?? overrideEnabled ?? installed.enabled, installed }]
  }).sort((a, b) => a.installed.plugin.name.localeCompare(b.installed.plugin.name))
}
export function resolveProjectMarkets(agent: readonly MarketplaceBinding[], project: readonly MarketplaceBinding[]): ProjectMarketplaceEntry[] {
  const ids = new Set([...agent, ...project].map((item) => item.marketplace.id))
  return [...ids].flatMap((id): ProjectMarketplaceEntry[] => {
    const inherited = agent.find((item) => item.marketplace.id === id)
    const own = project.find((item) => item.marketplace.id === id)
    const binding = own ?? inherited
    return binding ? [{ source: own ? inherited ? 'both' : 'project' : 'agent', binding }] : []
  })
}
export function resolveProjectMcp(agent: readonly McpServer[], project: readonly McpServer[], overrides: ProjectToolOverrides): ProjectMcpEntry[] {
  return [...project.map((server): ProjectMcpEntry => ({ source: 'project', server, agentEnabled: null, overrideEnabled: null,
    effectiveEnabled: server.enabled, shadowed: false, replacesAgent: agent.some((item) => item.name === server.name) })),
  ...agent.map((server): ProjectMcpEntry => {
    const shadowed = project.some((item) => item.name === server.name)
    const overrideEnabled = overrides.mcp.find((item) => item.key === server.name)?.enabled ?? null
    return { source: 'agent', server, agentEnabled: server.enabled, overrideEnabled, shadowed, replacesAgent: false,
      effectiveEnabled: !shadowed && (overrideEnabled ?? server.enabled) }
  })]
}
