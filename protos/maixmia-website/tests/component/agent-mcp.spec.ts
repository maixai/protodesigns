import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NSwitch } from 'naive-ui'
import AgentMcp from '../../src/components/agent-mcp.vue'
import * as api from '../../src/api/agent-mcp'
import type { McpServer, McpServerStatusId } from '../../src/contracts/generated/mcp-server'
import type { PluginMcpServer, PluginMcpStatusId } from '../../src/contracts/generated/plugin-mcp-server'
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/agent-mcp', () => ({
  listAgentMcpServers: vi.fn(), listAgentPluginMcpServers: vi.fn(), reconnectAgentPluginMcpServer: vi.fn(),
  addAgentMcpServer: vi.fn(), removeAgentMcpServer: vi.fn(),
  setAgentMcpServerEnabled: vi.fn(), authenticateAgentMcpServer: vi.fn(), reconnectAgentMcpServer: vi.fn(),
}))
function server(name: string, status: McpServerStatusId): McpServer {
  return {
    id: `agent:planning:${name}`, name, displayName: name === 'sentry' ? 'Sentry' : name === 'postgres' ? 'PostgreSQL' : name,
    description: `${name} MCP tools`, scope: 'agent', ownerId: 'planning', transport: 'stdio', endpoint: `npx -y ${name}`,
    enabled: status !== 'disabled', status, errorMessage: status === 'failed' ? 'ECONNREFUSED' : '',
    tools: status === 'connected' ? [{ name: 'list_items', description: 'List items.', qualifiedName: `mcp__${name}__list_items` }] : [],
  }
}
function agentList(): McpServer[] {
  return [server('github', 'connected'), server('sentry', 'needsAuth'), server('postgres', 'failed'), server('filesystem', 'connected')]
}
function pluginServer(status: PluginMcpStatusId = 'connected', pluginId = 'data-analysis'): PluginMcpServer {
  const isBrowser = pluginId === 'browser-tools'
  const marketplaceId = isBrowser ? 'community' : 'anthropic'
  const name = isBrowser ? 'browser' : 'data-analysis'
  return {
    id: `plugin:${marketplaceId}:${pluginId}:${name}`, sdkName: `plugin:${pluginId}:${name}`, pluginId, marketplaceId,
    pluginName: isBrowser ? 'Browser Tools' : 'Data Analysis', name,
    displayName: isBrowser ? 'Browser Automation' : 'Dataset Notebook',
    description: isBrowser ? 'Navigate pages and capture visual evidence.' : 'Profile datasets and assemble reproducible analysis notebooks.',
    status, errorMessage: status === 'failed' ? 'The runtime stopped unexpectedly.' : '',
    tools: isBrowser
      ? [{ name: 'browser_navigate', description: 'Open a URL in the controlled browser.', qualifiedName: 'mcp__plugin_browser-tools_browser__browser_navigate' }]
      : [{ name: 'profile_dataset', description: 'Summarize column types and distributions.', qualifiedName: 'mcp__plugin_data-analysis_data-analysis__profile_dataset' }],
  }
}
function pluginList(): PluginMcpServer[] {
  return [pluginServer('connected', 'browser-tools'), pluginServer('failed')]
}
async function mountPanel(): Promise<VueWrapper> {
  const wrapper = mount(AgentMcp, { props: { agentId: 'planning', agentName: '规划助手' }, attachTo: document.body })
  await flushPromises()
  await flushPromises()
  return wrapper
}

const STATUS_WORDS = ['已连接', '需认证', '连接失败', '已停用', '插件已停用', '需配置', '连接中']
function expectNoVisibleStatus(element: Element): void {
  const clone = element.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return
  clone.querySelectorAll('.mcp-visually-hidden').forEach((node) => node.remove())
  const text = clone.textContent ?? ''
  for (const word of STATUS_WORDS) expect(text).not.toContain(word)
}

describe('agent-mcp', () => {
  beforeEach(() => {
    useI18n().setLocale('zh-CN')
    // Happy DOM 尚未实现 Popover;空实现只支撑组合式生命周期,真浏览器仍使用原生 top layer。
    HTMLElement.prototype.showPopover = vi.fn()
    HTMLElement.prototype.hidePopover = vi.fn()
    vi.mocked(api.listAgentMcpServers).mockResolvedValue({ ok: true, value: agentList() })
    vi.mocked(api.listAgentPluginMcpServers).mockResolvedValue({ ok: true, value: pluginList() })
    vi.mocked(api.reconnectAgentPluginMcpServer).mockResolvedValue({ ok: true, value: [pluginServer('connected', 'browser-tools'), pluginServer()] })
    vi.mocked(api.authenticateAgentMcpServer).mockImplementation(async () => ({ ok: true, value: agentList().map((item) => item.name === 'sentry' ? { ...item, status: 'connected' satisfies McpServerStatusId, tools: [{ name: 'list_items', description: 'List items.', qualifiedName: 'mcp__sentry__list_items' }] } : item) }))
    vi.mocked(api.reconnectAgentMcpServer).mockImplementation(async () => ({ ok: true, value: agentList() }))
    vi.mocked(api.setAgentMcpServerEnabled).mockImplementation(async () => ({ ok: true, value: agentList() }))
    vi.mocked(api.removeAgentMcpServer).mockImplementation(async () => ({ ok: true, value: agentList().slice(1) }))
    vi.mocked(api.addAgentMcpServer).mockImplementation(async (_agentId, input) => ({ ok: true, value: [...agentList(), server(input.name, 'connected')] }))
  })
  afterEach(() => {
    vi.clearAllMocks()
    Reflect.deleteProperty(HTMLElement.prototype, 'showPopover')
    Reflect.deleteProperty(HTMLElement.prototype, 'hidePopover')
    document.body.innerHTML = ''
  })

  it('separates manual and read-only plugin servers with inline health metadata', async () => {
    const wrapper = await mountPanel()
    expect(wrapper.findAll('[data-group="manual"] .mcp-row')).toHaveLength(4)
    expect(wrapper.findAll('.mcp-plugin-row')).toHaveLength(2)
    expect(wrapper.get('[data-group="manual"] h3').text()).toBe('已安装')
    const github = wrapper.get('[data-server-id="agent:planning:github"]')
    expect(github.find('.mcp-title code').exists()).toBe(false)
    expect(github.find('.mcp-meta code').exists()).toBe(false)
    expect(github.get('.mcp-visually-hidden').text()).toBe('已连接')
    expectNoVisibleStatus(github.element)
    expect(github.get('.mcp-status-dot').attributes('aria-hidden')).toBe('true')
    expect(github.find('.mcp-tools-count').exists()).toBe(true)
    const sentry = wrapper.get('[data-server-id="agent:planning:sentry"]')
    expect(sentry.get('.mcp-visually-hidden').text()).toBe('需认证')
    expectNoVisibleStatus(sentry.element)
    expect(wrapper.get('[data-server-id="agent:planning:postgres"]').get('.mcp-visually-hidden').text()).toBe('连接失败')
    expectNoVisibleStatus(wrapper.get('[data-server-id="agent:planning:postgres"]').element)
    expect(sentry.find('.mcp-tools-count').exists()).toBe(false)
    expect(wrapper.find('[data-group="project"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Agent 级 MCP，项目默认继承；项目可用同名服务器覆盖')
    expect(wrapper.text()).not.toContain('项目自有 MCP 在项目 ⋯ → MCP 中配置')
    expect(wrapper.get('.mcp-plugin-disclosure').attributes('aria-expanded')).toBe('true')
    const healthy = wrapper.get('[data-server-id="plugin:community:browser-tools:browser"]')
    expect(healthy.text()).toContain('来自 Browser Tools')
    expect(healthy.text()).toContain('1 个工具')
    expectNoVisibleStatus(healthy.element)
    expect(wrapper.find('.mcp-plugin-manage').exists()).toBe(false)
    expect(healthy.get('.mcp-visually-hidden').text()).toBe('已连接')
    expect(healthy.find('.mcp-title code').exists()).toBe(false)
    const failed = wrapper.get('[data-server-id="plugin:anthropic:data-analysis:data-analysis"]')
    expect(failed.text()).toContain('来自 Data Analysis')
    expect(failed.find('.mcp-tools-count').exists()).toBe(false)
    expect(failed.get('.mcp-visually-hidden').text()).toBe('连接失败')
    expectNoVisibleStatus(failed.element)
    expect(failed.element.parentElement?.querySelector('.mcp-plugin-reconnect')).not.toBeNull()
    expect(wrapper.find('.mcp-plugin-row .mcp-switch').exists()).toBe(false)
    expect(wrapper.emitted('count')?.at(-1)).toEqual([6])
    wrapper.unmount()
  })

  it('authenticates immediately and shows tools only while connected', async () => {
    const wrapper = await mountPanel()
    const row = wrapper.get('[data-server-id="agent:planning:sentry"]')
    expect(row.text()).not.toContain('个工具')
    await wrapper.get('[aria-label="认证「Sentry」"]').trigger('click')
    await flushPromises()
    expect(api.authenticateAgentMcpServer).toHaveBeenCalledWith('planning', 'agent:planning:sentry')
    expect(row.get('.mcp-visually-hidden').text()).toBe('已连接')
    expect(row.find('.mcp-tools-count').exists()).toBe(true)
    expect(wrapper.find('[aria-label="认证「Sentry」"]').exists()).toBe(false)
    expect(document.activeElement).toBe(row.element)
    wrapper.unmount()
  })

  it('keeps manual authentication failure visible without a second live announcement and retries', async () => {
    vi.mocked(api.authenticateAgentMcpServer).mockImplementationOnce(async () => ({ ok: false, error: new Error('Auth failed') }))
    const wrapper = await mountPanel()
    const row = wrapper.get('[data-server-id="agent:planning:sentry"]')
    const authenticate = wrapper.get('[aria-label="认证「Sentry」"]')
    await authenticate.trigger('click')
    await flushPromises()
    expect(wrapper.get('.mcp-error').text()).toBe('Auth failed')
    expect(wrapper.get('.mcp-error').attributes('role')).toBeUndefined()
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(0)
    expect(wrapper.emitted('announce')).toEqual([['操作「Sentry」失败，请重试']])
    expect(document.activeElement).toBe(authenticate.element)
    await authenticate.trigger('click')
    await flushPromises()
    expect(wrapper.find('[aria-label="认证「Sentry」"]').exists()).toBe(false)
    expect(row.get('.mcp-visually-hidden').text()).toBe('已连接')
    expect(document.activeElement).toBe(row.element)
    expect(wrapper.emitted('announce')?.at(-1)).toEqual(['已认证并连接「Sentry」'])
    wrapper.unmount()
  })

  it('keeps non-announced toggle failures assertive without using the announce channel', async () => {
    vi.mocked(api.setAgentMcpServerEnabled).mockResolvedValueOnce({ ok: false, error: new Error('Toggle failed') })
    const wrapper = await mountPanel()
    wrapper.getComponent(NSwitch).vm.$emit('update:value', false)
    await flushPromises()
    expect(wrapper.get('.mcp-error').text()).toBe('Toggle failed')
    expect(wrapper.get('.mcp-error').attributes('role')).toBe('alert')
    expect(wrapper.emitted('announce')).toBeUndefined()
    wrapper.unmount()
  })

  it('uses a hollow disabled dot without a connect action', async () => {
    vi.mocked(api.listAgentMcpServers).mockResolvedValueOnce({ ok: true, value: [server('github', 'disabled')] })
    const wrapper = await mountPanel()
    const row = wrapper.get('[data-server-id="agent:planning:github"]')
    expect(row.get('.mcp-visually-hidden').text()).toBe('已停用')
    expectNoVisibleStatus(row.element)
    expect(row.get('.mcp-status-dot').attributes('aria-hidden')).toBe('true')
    expect(row.find('.mcp-tools-count').exists()).toBe(false)
    expect(row.find('.mcp-connect-action').exists()).toBe(false)
    expect(wrapper.get('.mcp-row[data-status="disabled"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens a short reason tooltip only for abnormal rows and closes it with Escape', async () => {
    const wrapper = await mountPanel()
    const row = wrapper.get('[data-server-id="agent:planning:sentry"]')
    row.element.focus()
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 40))
    await flushPromises()
    const tooltip = wrapper.get('[role="tooltip"]')
    expect(tooltip.text()).toBe('认证后可恢复连接')
    expect(tooltip.attributes('data-visible')).toBe('true')
    expect(row.attributes('aria-describedby')).toBe(tooltip.attributes('id'))
    await row.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(tooltip.attributes('data-visible')).toBe('false')
    const connected = wrapper.get('[data-server-id="agent:planning:github"]')
    await connected.trigger('focus')
    await flushPromises()
    expect(tooltip.attributes('data-visible')).toBe('false')
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
    expect(wrapper.emitted('count')?.at(-1)).toEqual([7])
    expect(wrapper.text()).not.toContain('保存后生效')
    await wrapper.get('[data-server-id="agent:planning:github"]').trigger('click')
    await wrapper.get('.mcp-detail-actions .mcp-danger').trigger('click')
    await wrapper.get('.mcp-confirm .mcp-danger').trigger('click')
    await flushPromises()
    expect(api.removeAgentMcpServer).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps loading and manual-error counts undefined and retries the manual source', async () => {
    vi.mocked(api.listAgentMcpServers).mockReturnValueOnce(new Promise(() => {}))
    const loading = mount(AgentMcp, { props: { agentId: 'planning', agentName: '规划助手' } })
    await flushPromises()
    expect(loading.emitted('count')?.at(-1)).toEqual([undefined])
    loading.unmount()
    vi.mocked(api.listAgentMcpServers).mockResolvedValueOnce({ ok: false, error: new Error('Agent MCP unavailable') })
    const wrapper = await mountPanel()
    expect(wrapper.get('[data-group="manual"] [role="alert"]').text()).toBe('Agent MCP unavailable')
    expect(wrapper.emitted('count')?.at(-1)).toEqual([undefined])
    await wrapper.get('[data-group="manual"] .mcp-action').trigger('click')
    expect(api.listAgentMcpServers).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('keeps manual rows usable when the plugin source fails and retries only that source', async () => {
    vi.mocked(api.listAgentPluginMcpServers).mockResolvedValueOnce({ ok: false, error: new Error('Plugin MCP unavailable') })
    const wrapper = await mountPanel()
    expect(wrapper.findAll('[data-group="manual"] .mcp-row')).toHaveLength(4)
    expect(wrapper.get('.mcp-plugin-error').text()).toContain('Plugin MCP unavailable')
    expect(wrapper.emitted('count')?.at(-1)).toEqual([undefined])
    await wrapper.get('.mcp-plugin-error .mcp-action').trigger('click')
    await flushPromises()
    expect(api.listAgentPluginMcpServers).toHaveBeenCalledTimes(2)
    expect(api.listAgentMcpServers).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('count')?.at(-1)).toEqual([6])
    wrapper.unmount()
  })

  it('opens a read-only plugin detail, emits its management target and restores row focus', async () => {
    const wrapper = await mountPanel()
    const row = wrapper.get('[data-server-id="plugin:community:browser-tools:browser"]')
    await row.trigger('click')
    await flushPromises()
    const detail = wrapper.get('.mcp-plugin-detail')
    expect(detail.text()).toContain('Navigate pages')
    expect(detail.text()).toContain('Browser Tools')
    expect(detail.text()).toContain('browser_navigate')
    expect(detail.find('.mcp-detail-identity code').exists()).toBe(false)
    expect(detail.get('.mcp-facts code').text()).toBe('plugin:browser-tools:browser')
    expect(detail.text()).not.toContain('连接目标')
    expect(detail.text()).not.toContain('传输')
    expect(detail.findAll('.mcp-actions button')).toHaveLength(1)
    expect(document.activeElement).toBe(wrapper.get('.mcp-plugin-detail .mcp-back').element)
    await detail.get('.mcp-action').trigger('click')
    expect(wrapper.emitted('managePlugin')?.at(-1)).toEqual(['browser-tools', 'community', 'Browser Tools'])
    await detail.get('.mcp-back').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(row.element)
    wrapper.unmount()
  })

  it('refreshes only the plugin projection on reactivation without leaving its detail', async () => {
    const wrapper = await mountPanel()
    await wrapper.get('[data-server-id="plugin:community:browser-tools:browser"]').trigger('click')
    await flushPromises()
    await wrapper.setProps({ active: false })
    vi.mocked(api.listAgentPluginMcpServers).mockResolvedValueOnce({ ok: true, value: [pluginServer('pluginDisabled', 'browser-tools'), pluginServer('failed')] })
    await wrapper.setProps({ active: true })
    await flushPromises()
    expect(api.listAgentPluginMcpServers).toHaveBeenCalledTimes(2)
    expect(api.listAgentMcpServers).toHaveBeenCalledTimes(1)
    expect(wrapper.attributes('data-view')).toBe('pluginDetail')
    expect(wrapper.get('.mcp-plugin-detail').text()).toContain('插件已停用')
    expect(wrapper.find('.mcp-plugin-detail .mcp-tools').exists()).toBe(false)
    expect(wrapper.find('.mcp-plugin-detail .mcp-plugin-reconnect').exists()).toBe(false)
    wrapper.unmount()
  })

  it('presents pending without tools or reconnect in both list and detail', async () => {
    vi.mocked(api.listAgentPluginMcpServers).mockResolvedValueOnce({ ok: true, value: [pluginServer('pending')] })
    const wrapper = await mountPanel()
    const row = wrapper.get('.mcp-plugin-main')
    expect(row.get('.mcp-visually-hidden').text()).toBe('连接中')
    expectNoVisibleStatus(row.element)
    expect(row.find('.mcp-tools-count').exists()).toBe(false)
    expect(wrapper.find('.mcp-plugin-reconnect').exists()).toBe(false)
    expect(wrapper.find('.mcp-plugin-manage').exists()).toBe(false)
    expect(wrapper.get('.mcp-plugin-row').attributes('data-status')).toBe('pending')
    await row.trigger('click')
    await flushPromises()
    const detail = wrapper.get('.mcp-plugin-detail')
    expect(detail.get('.mcp-detail-status').text()).toContain('连接中')
    expect(detail.find('.mcp-tools').exists()).toBe(false)
    expect(detail.find('.mcp-plugin-reconnect').exists()).toBe(false)
    expect(detail.findAll('.mcp-actions button')).toHaveLength(1)
    expect(detail.get('.mcp-actions button').text()).toBe('在插件中管理')
    wrapper.unmount()
  })

  it('withholds tools and reconnect for needsAuth, needsConfiguration and pluginDisabled', async () => {
    const states = ['needsAuth', 'needsConfiguration', 'pluginDisabled'] satisfies PluginMcpStatusId[]
    for (const state of states) {
      vi.mocked(api.listAgentPluginMcpServers).mockResolvedValueOnce({ ok: true, value: [pluginServer(state)] })
      const wrapper = await mountPanel()
      const row = wrapper.get('.mcp-plugin-main')
      expect(row.get('.mcp-visually-hidden').text()).toBe(state === 'needsAuth' ? '需认证' : state === 'needsConfiguration' ? '需配置' : '插件已停用')
      expectNoVisibleStatus(row.element)
      expect(row.find('.mcp-tools-count').exists()).toBe(false)
      expect(wrapper.find('.mcp-plugin-reconnect').exists()).toBe(false)
      const manage = wrapper.get('.mcp-plugin-manage')
      expect(manage.text()).toBe('管理')
      await manage.trigger('click')
      expect(wrapper.emitted('managePlugin')?.at(-1)).toEqual(['data-analysis', 'anthropic', 'Data Analysis'])
      await row.trigger('click')
      await flushPromises()
      expect(wrapper.find('.mcp-plugin-detail .mcp-tools').exists()).toBe(false)
      expect(wrapper.find('.mcp-plugin-detail .mcp-plugin-reconnect').exists()).toBe(false)
      expect(wrapper.findAll('.mcp-plugin-detail .mcp-actions button')).toHaveLength(1)
      wrapper.unmount()
    }
  })

  it('keeps zero-tool connected health accessible without a visible zero count', async () => {
    vi.mocked(api.listAgentPluginMcpServers).mockResolvedValueOnce({ ok: true, value: [{ ...pluginServer(), tools: [] }] })
    const wrapper = await mountPanel()
    const row = wrapper.get('.mcp-plugin-main')
    expect(row.find('.mcp-tools-count').exists()).toBe(false)
    expectNoVisibleStatus(row.element)
    expect(row.get('.mcp-visually-hidden').text()).toBe('已连接')
    wrapper.unmount()
  })

  it('reconnects a failed row without changing counts and returns focus to its detail button', async () => {
    const wrapper = await mountPanel()
    const row = wrapper.get('[data-server-id="plugin:anthropic:data-analysis:data-analysis"]')
    const reconnect = wrapper.get('.mcp-plugin-row[data-status="failed"] .mcp-plugin-reconnect')
    await reconnect.trigger('click')
    await flushPromises()
    expect(api.reconnectAgentPluginMcpServer).toHaveBeenCalledWith('planning', 'plugin:data-analysis:data-analysis')
    expect(wrapper.find('.mcp-plugin-row[data-status="failed"]').exists()).toBe(false)
    expectNoVisibleStatus(row.element)
    expect(row.find('.mcp-tools-count').exists()).toBe(true)
    expect(document.activeElement).toBe(row.element)
    expect(wrapper.emitted('count')?.at(-1)).toEqual([6])
    expect(wrapper.emitted('announce')?.at(-1)).toEqual(['已重新连接「Dataset Notebook」'])
    wrapper.unmount()
  })

  it('keeps reconnect failure visible and focused in detail, then allows an immediate retry', async () => {
    vi.mocked(api.reconnectAgentPluginMcpServer).mockResolvedValueOnce({ ok: false, error: new Error('Runtime reconnect rejected') })
    const wrapper = await mountPanel()
    await wrapper.get('[data-server-id="plugin:anthropic:data-analysis:data-analysis"]').trigger('click')
    await flushPromises()
    const detail = wrapper.get('.mcp-plugin-detail')
    expect(detail.text()).toContain('The runtime stopped unexpectedly.')
    expect(detail.find('.mcp-tools').exists()).toBe(false)
    expect(detail.findAll('.mcp-actions button')).toHaveLength(2)
    const reconnect = detail.get('.mcp-plugin-reconnect')
    await reconnect.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Runtime reconnect rejected')
    // 失败只经 announce 播报一次;可见横幅不再叠加 assertive alert。
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    expect(detail.find('.mcp-tools').exists()).toBe(false)
    expect(document.activeElement).toBe(reconnect.element)
    expect(wrapper.emitted('announce')?.at(-1)).toEqual(['重连「Dataset Notebook」失败，请重试'])
    await reconnect.trigger('click')
    await flushPromises()
    expect(detail.find('.mcp-plugin-reconnect').exists()).toBe(false)
    expect(detail.find('.mcp-tools').exists()).toBe(true)
    expect(document.activeElement).toBe(detail.get('.mcp-back').element)
    expect(wrapper.emitted('count')?.at(-1)).toEqual([6])
    wrapper.unmount()
  })

  it('shows item-level reconnecting text without loading the whole plugin section', async () => {
    vi.mocked(api.reconnectAgentPluginMcpServer).mockReturnValueOnce(new Promise(() => {}))
    const wrapper = await mountPanel()
    const reconnect = wrapper.get('.mcp-plugin-row .mcp-plugin-reconnect')
    await reconnect.trigger('click')
    expect(reconnect.text()).toBe('重连中…')
    expect(reconnect.attributes('aria-disabled')).toBe('true')
    expect(wrapper.find('.mcp-plugin-section .n-skeleton').exists()).toBe(false)
    expect(wrapper.attributes('aria-busy')).toBe('false')
    wrapper.unmount()
  })

  it('limits the empty copy to manual servers and hides an empty plugin section', async () => {
    vi.mocked(api.listAgentMcpServers).mockResolvedValueOnce({ ok: true, value: [] })
    const withPlugins = await mountPanel()
    expect(withPlugins.get('[data-group="manual"] .mcp-state').text()).toContain('还没有手动添加的服务器')
    expect(withPlugins.find('.mcp-plugin-section').exists()).toBe(true)
    withPlugins.unmount()
    vi.mocked(api.listAgentPluginMcpServers).mockResolvedValueOnce({ ok: true, value: [] })
    const withoutPlugins = await mountPanel()
    expect(withoutPlugins.find('.mcp-plugin-section').exists()).toBe(false)
    withoutPlugins.unmount()
  })
})
