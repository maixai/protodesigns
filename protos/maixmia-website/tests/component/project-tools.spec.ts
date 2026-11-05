import { describe, expect, it, vi } from 'vitest'
import { resolveProjectPlugins, resolveProjectMcp, resolveProjectMarkets } from '../../src/data/project-tools'
import { mockInstalledPlugins, mockMarketplaceBindings, mockProjectPluginMcpServers } from '../../src/mocks/workspace'
import { mockListAgentMcpServers, mockListProjectMcpServers } from '../../src/mocks/agent-mcp'
import { mockProjectToolOverrides, mockSetProjectToolOverride } from '../../src/mocks/project-tools'
import { setProjectToolOverride } from '../../src/api/project-tools'
import { listProjectAgentMcpServers } from '../../src/api/agent-mcp'
vi.mock('../../src/mocks/delay', () => ({ delay: async () => {} }))

describe('project tool resolution', () => {
  it('merges plugin identity once and prefers project configuration, not Agent enablement', () => {
    const agent = mockInstalledPlugins('agent', 'writing') ?? []
    const project = mockInstalledPlugins('project', '~/work/product-docs') ?? []
    const overrides = mockProjectToolOverrides('~/work/product-docs')
    overrides.plugins = [{ key: 'docs-writer@anthropic', enabled: false }]
    const entries = resolveProjectPlugins(agent, project, overrides)
    expect(entries.filter((item) => item.key === 'docs-writer@anthropic')).toHaveLength(1)
    expect(entries.find((item) => item.key === 'docs-writer@anthropic')).toMatchObject({ source: 'both', effectiveEnabled: true, overrideEnabled: null, agentEnabled: true, installed: { scope: 'project' } })
  })
  it('uses project-copy enablement over both the Agent default and stale inherited overrides', () => {
    const agent = mockInstalledPlugins('agent', 'writing') ?? []
    const project = (mockInstalledPlugins('project', '~/work/product-docs') ?? []).map((item) => ({ ...item, enabled: false }))
    const overrides = mockProjectToolOverrides('~/work/product-docs')
    overrides.plugins = [{ key: 'docs-writer@anthropic', enabled: true }]
    expect(resolveProjectPlugins(agent, project, overrides).find((item) => item.key === 'docs-writer@anthropic')).toMatchObject({ effectiveEnabled: false, overrideEnabled: null, source: 'both' })
  })
  it('supports bidirectional overrides and clearing restores the current Agent default without mutating it', async () => {
    const before = mockInstalledPlugins('agent', 'research') ?? []
    const path = '~/work/override-test'
    const enabled = await setProjectToolOverride(path, 'research', 'plugins', 'notion-sync@community', true)
    expect(enabled.ok).toBe(true)
    const entries = resolveProjectPlugins(before, [], mockProjectToolOverrides(path))
    expect(entries.find((item) => item.key === 'notion-sync@community')).toMatchObject({ agentEnabled: false, effectiveEnabled: true })
    expect(mockInstalledPlugins('agent', 'research')).toEqual(before)
    await setProjectToolOverride(path, 'research', 'plugins', 'notion-sync@community', null)
    expect(resolveProjectPlugins(before, [], mockProjectToolOverrides(path)).find((item) => item.key === 'notion-sync@community')).toMatchObject({ effectiveEnabled: false, overrideEnabled: null })
  })
  it('never falls back from a disabled project namesake and keeps both definitions visible', () => {
    const project = mockListProjectMcpServers('~/work/weekly-report').servers.map((server) => ({ ...server, enabled: false }))
    const entries = resolveProjectMcp(mockListAgentMcpServers('planning'), project, mockProjectToolOverrides('~/work/weekly-report'))
    expect(entries.filter((item) => item.server.name === 'github')).toHaveLength(2)
    expect(entries.find((item) => item.server.name === 'github' && item.source === 'agent')).toMatchObject({ shadowed: true, effectiveEnabled: false })
    expect(entries.find((item) => item.server.name === 'github' && item.source === 'project')).toMatchObject({ replacesAgent: true, effectiveEnabled: false })
  })
  it('projects plugin MCP from effective project enablement and removes disabled tools', () => {
    const path = '~/work/plugin-mcp-test'
    mockSetProjectToolOverride(path, 'plugins', 'browser-tools@community', false)
    expect(mockProjectPluginMcpServers(path, 'planning').find((server) => server.pluginId === 'browser-tools')).toMatchObject({ status: 'pluginDisabled', tools: [] })
    mockSetProjectToolOverride(path, 'plugins', 'browser-tools@community', null)
    expect(mockProjectPluginMcpServers(path, 'planning').find((server) => server.pluginId === 'browser-tools')?.status).toBe('connected')
  })
  it('merges marketplace registration while keeping Agent-only registration read-only', () => {
    const entries = resolveProjectMarkets(mockMarketplaceBindings('agent', 'planning') ?? [], mockMarketplaceBindings('project', '~/work/weekly-report') ?? [])
    expect(entries.find((entry) => entry.binding.marketplace.id === 'anthropic')?.source).toBe('both')
    expect(entries.find((entry) => entry.binding.marketplace.id === 'community')?.source).toBe('agent')
  })
  it('redacts inherited environment and headers at the project API boundary', async () => {
    const result = await listProjectAgentMcpServers('planning')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.find((server) => server.name === 'sentry')?.config).toEqual({ type: 'http', url: 'https://mcp.sentry.dev/mcp' })
    expect(result.value.find((server) => server.name === 'filesystem')?.endpoint).toBe('npx')
    expect(JSON.stringify(result.value)).not.toContain('demo-sentry-secret')
  })
})
