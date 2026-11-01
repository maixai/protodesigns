import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentReadonlyContext from '../../src/components/agent-readonly-context.vue'
import * as api from '../../src/api/agent-mcp'
import * as permissionApi from '../../src/api/agent-permissions'
import { mockAgentSummaries } from '../../src/mocks/workspace'
import { mockListAgentMcpServers, mockListProjectMcpServers } from '../../src/mocks/agent-mcp'
import { mockGetAgentPermissions } from '../../src/mocks/agent-permissions'
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/agent-mcp', () => ({ listAgentMcpServers: vi.fn() }))
vi.mock('../../src/api/agent-permissions', () => ({ getAgentPermissions: vi.fn() }))
const agent = mockAgentSummaries()[0]
if (agent === undefined) throw new Error('Missing Agent context fixture')

describe('agent readonly context', () => {
  afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = '' })

  it('counts shadowing by project definitions even when a project server is disabled', async () => {
    useI18n().setLocale('zh-CN')
    vi.mocked(api.listAgentMcpServers).mockImplementation(async (agentId) => ({ ok: true, value: mockListAgentMcpServers(agentId) }))
    const project = mockListProjectMcpServers('~/work/weekly-report')
    const wrapper = mount(AgentReadonlyContext, { props: { kind: 'mcp', agent, projectServers: project.servers } })
    await flushPromises()
    await flushPromises()
    const rows = wrapper.findAll('.agent-context__facts > div')
    expect(rows[2]?.text()).toContain('被项目同名定义遮蔽')
    expect(rows[2]?.text()).toContain('2')
    expect(wrapper.find('input, select').exists()).toBe(false)
    const disclosure = wrapper.get('.agent-context__disclosure')
    const controlledId = disclosure.attributes('aria-controls')
    expect(controlledId).toBe('mcp-agent-context-planning')
    expect(wrapper.find(`#${controlledId}`).exists()).toBe(true)
    await disclosure.trigger('click')
    expect(wrapper.find(`#${controlledId}`).exists()).toBe(true)
    expect(wrapper.findAll('.agent-context__server')).toHaveLength(4)
    expect(wrapper.text()).not.toContain('工具描述')
    wrapper.unmount()
  })

  it('uses only localized Chinese group names in permission counts and expanded headings', async () => {
    useI18n().setLocale('zh-CN')
    vi.mocked(permissionApi.getAgentPermissions).mockImplementation(async (agentId) => ({ ok: true, value: mockGetAgentPermissions(agentId) }))
    const wrapper = mount(AgentReadonlyContext, { props: { kind: 'permissions', agent } })
    await flushPromises()
    await flushPromises()
    expect(wrapper.get('.agent-context__facts').text()).toContain('允许 3 · 拒绝 2 · 询问 2')
    expect(wrapper.get('.agent-context__facts').text()).not.toContain('allow 3')
    await wrapper.get('.agent-context__disclosure').trigger('click')
    expect(wrapper.findAll('.agent-context__rules h4').map((heading) => heading.text())).toEqual(['拒绝', '询问', '允许'])
    expect(wrapper.find('.agent-context__rules h4 code').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses only localized English group names in permission counts and expanded headings', async () => {
    useI18n().setLocale('en')
    vi.mocked(permissionApi.getAgentPermissions).mockImplementation(async (agentId) => ({ ok: true, value: mockGetAgentPermissions(agentId) }))
    const wrapper = mount(AgentReadonlyContext, { props: { kind: 'permissions', agent } })
    await flushPromises()
    await flushPromises()
    expect(wrapper.get('.agent-context__facts').text()).toContain('Allow 3 · Deny 2 · Ask 2')
    await wrapper.get('.agent-context__disclosure').trigger('click')
    expect(wrapper.findAll('.agent-context__rules h4').map((heading) => heading.text())).toEqual(['Deny', 'Ask', 'Allow'])
    expect(wrapper.find('.agent-context__rules h4 code').exists()).toBe(false)
    wrapper.unmount()
  })

  it('localizes the model subscription label in the English read-only summary', async () => {
    useI18n().setLocale('en')
    const wrapper = mount(AgentReadonlyContext, { props: { kind: 'model', agent } })
    await flushPromises()
    expect(wrapper.text()).toContain('Claude · Work')
    expect(wrapper.text()).not.toContain('Claude · 工作')
    const disclosure = wrapper.get('.agent-context__disclosure')
    const controlledId = disclosure.attributes('aria-controls')
    expect(wrapper.find(`#${controlledId}`).exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps Agent load failure local and states that same-name checking is unavailable', async () => {
    useI18n().setLocale('zh-CN')
    vi.mocked(api.listAgentMcpServers).mockResolvedValue({ ok: false, error: new Error('Agent MCP unavailable') })
    const wrapper = mount(AgentReadonlyContext, { props: { kind: 'mcp', agent, projectServers: [] } })
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('Agent MCP unavailable')
    expect(wrapper.text()).toContain('同名检查暂不可用')
    expect(wrapper.get('.agent-context__state button').text()).toBe('重试')
    wrapper.unmount()
  })
})
