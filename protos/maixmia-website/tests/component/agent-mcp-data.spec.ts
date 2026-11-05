import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  addAgentMcpServer, updateAgentMcpServer, authenticateAgentMcpServer, reconnectAgentMcpServer, reconnectAgentPluginMcpServer, removeAgentMcpServer, setAgentMcpServerEnabled,
} from '../../src/api/agent-mcp'
import { mockAgentPluginMcpServers, mockInstalledPlugins, mockResetAgentPluginMcpRuntime, mockSetPluginEnabled } from '../../src/mocks/workspace'
import { mockListAgentMcpServers } from '../../src/mocks/agent-mcp'
import { useI18n } from '../../src/i18n'

beforeEach(() => {
  useI18n().setLocale('zh-CN')
  mockResetAgentPluginMcpRuntime()
})

afterEach(() => {
  mockSetPluginEnabled('agent', 'research', 'community', 'notion-sync', false)
  mockResetAgentPluginMcpRuntime()
  vi.useRealTimers()
})

describe('plugin MCP projection and manual API boundary', () => {
  it('derives disabled before missing configuration and ignores available updates', () => {
    const initial = mockAgentPluginMcpServers('research') ?? []
    const browser = initial.find((server) => server.pluginId === 'browser-tools')
    const notion = initial.find((server) => server.pluginId === 'notion-sync')
    expect(browser?.status).toBe('connected')
    expect(notion?.status).toBe('pluginDisabled')
    expect(notion).not.toHaveProperty('endpoint')
    expect(notion).not.toHaveProperty('transport')
    expect(notion?.id).toBe('plugin:community:notion-sync:notion-workspace')

    mockSetPluginEnabled('agent', 'research', 'community', 'notion-sync', true)
    const enabled = mockAgentPluginMcpServers('research') ?? []
    expect(enabled.find((server) => server.pluginId === 'notion-sync')?.status).toBe('needsConfiguration')
  })

  it('keeps runtime health outside the manifest and reconnects without touching installation state', async () => {
    vi.useFakeTimers()
    const planning = mockAgentPluginMcpServers('planning') ?? []
    const browser = planning.find((server) => server.pluginId === 'browser-tools')
    const dataset = planning.find((server) => server.pluginId === 'data-analysis')
    expect(browser?.status).toBe('connected')
    expect(dataset?.status).toBe('failed')
    expect(dataset?.displayName).toBe('Dataset Notebook')
    expect(dataset?.id).toBe('plugin:anthropic:data-analysis:data-analysis')
    expect(dataset?.sdkName).toBe('plugin:data-analysis:data-analysis')
    expect(browser?.sdkName).toBe('plugin:browser-tools:browser')
    expect(browser?.tools[0]?.qualifiedName).toBe('mcp__plugin_browser-tools_browser__browser_navigate')
    const github = mockListAgentMcpServers('planning').find((server) => server.name === 'github')
    expect(github?.tools[0]?.qualifiedName).toBe('mcp__github__list_issues')
    expect(dataset?.errorMessage).toContain('runtime stopped unexpectedly')
    const installedBefore = mockInstalledPlugins('agent', 'planning')
    const contribution = installedBefore?.find((item) => item.plugin.id === 'data-analysis')?.plugin.mcpServers[0]
    expect(contribution).not.toHaveProperty('connectionStatus')

    const request = reconnectAgentPluginMcpServer('planning', 'plugin:data-analysis:data-analysis')
    await vi.advanceTimersByTimeAsync(300)
    const result = await request
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toHaveLength(2)
      expect(result.value.find((server) => server.pluginId === 'data-analysis')?.status).toBe('connected')
      expect(result.value.find((server) => server.pluginId === 'data-analysis')?.errorMessage).toBe('')
    }
    expect(mockInstalledPlugins('agent', 'planning')).toEqual(installedBefore)
  })

  it('rejects plugin reconnect while disabled or missing required configuration', async () => {
    vi.useFakeTimers()
    const sdkName = 'plugin:notion-sync:notion-workspace'
    const disabledRequest = reconnectAgentPluginMcpServer('research', sdkName)
    await vi.advanceTimersByTimeAsync(300)
    const disabledResult = await disabledRequest
    expect(disabledResult.ok).toBe(false)
    if (!disabledResult.ok) expect(disabledResult.error.message).toBe('只有连接失败的插件 MCP 可以重连')

    mockSetPluginEnabled('agent', 'research', 'community', 'notion-sync', true)
    expect(mockAgentPluginMcpServers('research')?.find((server) => server.sdkName === sdkName)?.status).toBe('needsConfiguration')
    const configRequest = reconnectAgentPluginMcpServer('research', sdkName)
    await vi.advanceTimersByTimeAsync(300)
    const configResult = await configRequest
    expect(configResult.ok).toBe(false)
    if (!configResult.ok) expect(configResult.error.message).toBe('只有连接失败的插件 MCP 可以重连')
  })

  it('rejects plugin ids in every manual mutation API', async () => {
    vi.useFakeTimers()
    const id = 'plugin:anthropic:data-analysis:data-analysis'
    const requests = [
      updateAgentMcpServer('planning', id, { name: 'plugin', displayName: '', config: { command: 'node' } }),
      removeAgentMcpServer('planning', id),
      setAgentMcpServerEnabled('planning', id, false),
      authenticateAgentMcpServer('planning', id),
      reconnectAgentMcpServer('planning', id),
    ]
    await vi.advanceTimersByTimeAsync(300)
    const results = await Promise.all(requests)
    for (const result of results) {
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('插件提供的 MCP 为只读，请在插件中管理')
    }
  })
})


describe('manual MCP configuration writes', () => {
  it('isolates secrets, preserves enablement, clears old runtime facts and rejects renames', async () => {
    vi.useFakeTimers()
    const agentId = 'configuration-test-agent'
    const added = addAgentMcpServer(agentId, { name: 'remote', displayName: 'Remote', config: { type: 'http', url: 'https://example.com/mcp', oauth: { scopes: 'read write' } }, clientSecret: 'secret-value' })
    await vi.advanceTimersByTimeAsync(300)
    const result = await added
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('secret-value')
    const server = mockListAgentMcpServers(agentId)[0]
    expect(server?.clientSecretSet).toBe(true)
    expect(server?.status).toBe('needsAuth')
    const id = `agent:${agentId}:remote`
    const disable = setAgentMcpServerEnabled(agentId, id, false)
    await vi.advanceTimersByTimeAsync(300)
    await disable
    const update = updateAgentMcpServer(agentId, id, { name: 'remote', displayName: 'Updated', config: { type: 'http', url: 'https://new.example.com/mcp', oauth: {} }, clientSecret: '' })
    await vi.advanceTimersByTimeAsync(300)
    const updated = await update
    expect(updated.ok).toBe(true)
    expect(mockListAgentMcpServers(agentId)[0]).toMatchObject({ enabled: false, status: 'disabled', tools: [], errorMessage: '', clientSecretSet: true, endpoint: 'https://new.example.com/mcp' })
    const rename = updateAgentMcpServer(agentId, id, { name: 'renamed', displayName: '', config: { command: 'node' } })
    await vi.advanceTimersByTimeAsync(300)
    expect((await rename).ok).toBe(false)
    expect(mockListAgentMcpServers(agentId)[0]?.name).toBe('remote')
  })
  it('uses the same validation before mutation and leaves the stored configuration unchanged on failure', async () => {
    vi.useFakeTimers()
    const before = mockListAgentMcpServers('planning')
    const request = updateAgentMcpServer('planning', 'agent:planning:postgres', { name: 'postgres', displayName: 'Invalid', config: { type: 'stdio', command: 'node', timeout: 999 } })
    await vi.advanceTimersByTimeAsync(300)
    expect((await request).ok).toBe(false)
    expect(mockListAgentMcpServers('planning')).toEqual(before)
    const valid = updateAgentMcpServer('planning', 'agent:planning:postgres', { name: 'postgres', displayName: 'Changed', config: { type: 'http', url: 'https://example.com/mcp', oauth: {} } })
    await vi.advanceTimersByTimeAsync(300)
    expect((await valid).ok).toBe(true)
    expect(mockListAgentMcpServers('planning').find((server) => server.name === 'postgres')).toMatchObject({ status: 'needsAuth', tools: [], errorMessage: '' })
  })
})
