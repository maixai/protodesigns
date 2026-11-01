import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentMcp from '../../src/components/agent-mcp.vue'
import * as api from '../../src/api/agent-mcp'
import type { McpServer, McpServerStatusId } from '../../src/contracts/generated/mcp-server'
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/agent-mcp', () => ({
  listAgentMcpServers: vi.fn(), addAgentMcpServer: vi.fn(), removeAgentMcpServer: vi.fn(),
  setAgentMcpServerEnabled: vi.fn(), authenticateAgentMcpServer: vi.fn(), reconnectAgentMcpServer: vi.fn(),
}))
function server(name: string, status: McpServerStatusId): McpServer {
  return {
    id: `agent:planning:${name}`, name, displayName: name === 'sentry' ? 'Sentry' : name === 'postgres' ? 'PostgreSQL' : name,
    description: `${name} MCP tools`, scope: 'agent', ownerId: 'planning', transport: 'stdio', endpoint: `npx -y ${name}`,
    enabled: status !== 'disabled', status, errorMessage: status === 'failed' ? 'ECONNREFUSED' : '',
    tools: status === 'connected' ? [{ name: 'list_items', description: 'List items.' }] : [],
  }
}
function agentList(): McpServer[] {
  return [server('github', 'connected'), server('sentry', 'needsAuth'), server('postgres', 'failed'), server('filesystem', 'connected')]
}
async function mountPanel(): Promise<VueWrapper> {
  const wrapper = mount(AgentMcp, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('agent-mcp', () => {
  beforeEach(() => {
    useI18n().setLocale('zh-CN')
    vi.mocked(api.listAgentMcpServers).mockResolvedValue({ ok: true, value: agentList() })
    vi.mocked(api.authenticateAgentMcpServer).mockImplementation(async () => ({ ok: true, value: agentList().map((item) => item.name === 'sentry' ? { ...item, status: 'connected' satisfies McpServerStatusId } : item) }))
    vi.mocked(api.reconnectAgentMcpServer).mockImplementation(async () => ({ ok: true, value: agentList() }))
    vi.mocked(api.setAgentMcpServerEnabled).mockImplementation(async () => ({ ok: true, value: agentList() }))
    vi.mocked(api.removeAgentMcpServer).mockImplementation(async () => ({ ok: true, value: agentList().slice(1) }))
    vi.mocked(api.addAgentMcpServer).mockImplementation(async (_agentId, input) => ({ ok: true, value: [...agentList(), server(input.name, 'connected')] }))
  })
  afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = '' })

  it('renders only Agent servers, the scope statement and a plain-text project entry hint', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.findAll('.mcp-row')).toHaveLength(4)
    expect(wrapper.find('[data-group="project"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Agent 级 MCP，项目默认继承；项目可用同名服务器覆盖')
    expect(wrapper.text()).toContain('项目自有 MCP 在项目 ⋯ → MCP 中配置')
    expect(wrapper.find('.mcp-project-tip').element.tagName).toBe('P')
    expect(wrapper.emitted('count')?.at(-1)).toEqual([4])
    wrapper.unmount()
  })

  it('authenticates immediately and shows tools only while connected', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.get('[data-server-id="agent:planning:sentry"]').text()).not.toContain('个工具')
    await wrapper.get('[aria-label="认证「Sentry」"]').trigger('click')
    await flushPromises()
    expect(api.authenticateAgentMcpServer).toHaveBeenCalledWith('planning', 'agent:planning:sentry')
    expect(wrapper.get('[data-server-id="agent:planning:sentry"]').text()).toContain('已连接')
    wrapper.unmount()
  })

  it('adds and removes Agent servers without a save action', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('.mcp-add').trigger('click')
    await wrapper.get('#agent-mcp-planning-name').setValue('linear')
    await wrapper.get('#agent-mcp-planning-endpoint').setValue('npx -y linear')
    await wrapper.get('button[type="submit"]').trigger('click')
    await flushPromises()
    expect(api.addAgentMcpServer).toHaveBeenCalledWith('planning', expect.objectContaining({ name: 'linear' }))
    expect(wrapper.emitted('count')?.at(-1)).toEqual([5])
    expect(wrapper.text()).not.toContain('保存后生效')
    await wrapper.get('[data-server-id="agent:planning:github"]').trigger('click')
    await wrapper.get('.mcp-detail-actions .mcp-danger').trigger('click')
    await wrapper.get('.mcp-confirm .mcp-danger').trigger('click')
    await flushPromises()
    expect(api.removeAgentMcpServer).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps loading and error counts undefined and retries independently', async () => {
    vi.mocked(api.listAgentMcpServers).mockReturnValueOnce(new Promise(() => {}))
    const loading = mount(AgentMcp, { props: { agentId: 'planning', agentName: '规划助手' } })
    await flushPromises()
    expect(loading.emitted('count')?.at(-1)).toEqual([undefined])
    loading.unmount()
    vi.mocked(api.listAgentMcpServers).mockResolvedValueOnce({ ok: false, error: new Error('Agent MCP unavailable') })
    const wrapper = await mountPanel()
    expect(wrapper.get('[role="alert"]').text()).toBe('Agent MCP unavailable')
    expect(wrapper.emitted('count')?.at(-1)).toEqual([undefined])
    await wrapper.get('.mcp-action').trigger('click')
    expect(api.listAgentMcpServers).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })
})
