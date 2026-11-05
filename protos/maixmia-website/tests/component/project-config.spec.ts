import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectSettingsDialog from '../../src/components/project-settings-dialog.vue'
import * as modelApi from '../../src/api/project-settings'
import * as permissionApi from '../../src/api/agent-permissions'
import * as mcpApi from '../../src/api/agent-mcp'
import type { Result } from '../../src/api/result'
import type { ProjectPermissionGroup } from '../../src/contracts/generated/project-permission-group'
import { mockProjectModelSettings } from '../../src/mocks/project-settings'
import { mockGetAgentPermissions, mockListProjectPermissionGroup } from '../../src/mocks/agent-permissions'
import { mockAgentSummaries, mockProjects } from '../../src/mocks/workspace'
import { mockListAgentMcpServers, mockListProjectMcpServers } from '../../src/mocks/agent-mcp'
vi.mock('../../src/mocks/delay', () => ({ delay: async () => {} }))
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/project-settings', () => ({ getProjectModelSettings: vi.fn(), saveProjectModelSettings: vi.fn() }))
vi.mock('../../src/api/agent-permissions', () => ({
  getAgentPermissions: vi.fn(), listProjectPermissionGroup: vi.fn(), saveProjectPermissionGroup: vi.fn(),
}))

vi.mock('../../src/api/agent-mcp', () => ({
  listProjectMcpServers: vi.fn(), authenticateProjectMcpServer: vi.fn(), reconnectProjectMcpServer: vi.fn(), listAgentMcpServers: vi.fn(), listProjectAgentMcpServers: vi.fn(),
}))

const agent = mockAgentSummaries()[0]
const project = agent === undefined ? undefined : mockProjects(agent.id)[0]
if (agent === undefined || project === undefined) throw new Error('Missing project settings fixture')

function mountDialog(): VueWrapper {
  return mount(ProjectSettingsDialog, {
    props: { open: true, agent, project },
    attachTo: document.body,
  })
}

function tabs(wrapper: VueWrapper) {
  return wrapper.findAll('.project-settings__tablist [role="tab"]')
}

async function selectTab(wrapper: VueWrapper, index: number): Promise<void> {
  await tabs(wrapper)[index]?.trigger('click')
  await flushPromises()
}

// 权限编辑器改成覆盖模式,制造一处分区草稿。
async function dirtyPermissions(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.permission-editor [data-mode-trigger]').trigger('click')
  await wrapper.get('.permission-editor [data-mode="default"]').trigger('click')
  await flushPromises()
}

function firstInteractive(root: Element | null): Element | null {
  return root?.querySelector('button, input, select, textarea') ?? null
}

describe('project-settings-dialog', () => {
  beforeEach(() => {
    useI18n().setLocale('zh-CN')
    window.innerWidth = 1024
    vi.mocked(modelApi.getProjectModelSettings).mockImplementation(async (path) => ({ ok: true, value: mockProjectModelSettings(path) }))
    vi.mocked(modelApi.saveProjectModelSettings).mockImplementation(async (_path, settings) => ({ ok: true, value: structuredClone(settings) }))
    vi.mocked(permissionApi.listProjectPermissionGroup).mockImplementation(async (path) => ({ ok: true, value: mockListProjectPermissionGroup(path) }))
    vi.mocked(permissionApi.saveProjectPermissionGroup).mockImplementation(async (_path, value) => ({ ok: true, value }))
    vi.mocked(permissionApi.getAgentPermissions).mockImplementation(async (id) => ({ ok: true, value: mockGetAgentPermissions(id) }))
    vi.mocked(mcpApi.listProjectMcpServers).mockImplementation(async (path) => ({ ok: true, value: mockListProjectMcpServers(path) }))
    vi.mocked(mcpApi.listProjectAgentMcpServers).mockImplementation(async (id) => ({ ok: true, value: mockListAgentMcpServers(id) }))
  })
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('插件详情草稿进入统一关闭确认,即时标签不出现底部保存按钮', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()
    await selectTab(wrapper, 2)
    await wrapper.get('.plugin-main[data-plugin-key="test-runner@anthropic"]').trigger('click')
    await wrapper.get('.plugin-detail [data-config-key="command"]').setValue('pnpm test:unsaved')
    expect(tabs(wrapper)[2]?.attributes('aria-label')).toContain('有未保存的更改')
    expect(wrapper.find('.project-config__buttons .dl-btn--primary').exists()).toBe(false)
    await wrapper.get('.project-config__buttons .dl-btn--ghost').trigger('click')
    await flushPromises()
    expect(wrapper.get('.project-settings__confirm').text()).toContain('插件')
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('只有一个窗体与一个 Tab 控件,打开时并行预取模型与权限', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    expect(wrapper.findAll('dialog.project-settings')).toHaveLength(1)
    expect(wrapper.get('.project-settings__title').text()).toBe('项目设置 · weekly-report')

    const tablist = wrapper.get('.project-settings__tablist')
    expect(tablist.attributes('aria-orientation')).toBe('horizontal')
    expect(wrapper.get('.dl-dialog__main').classes()).toContain('dl-dialog__main--stacked')
    expect(tabs(wrapper).map((tab) => tab.find('.project-settings__tab-label').text())).toEqual(['模型', '权限', '插件', 'MCP'])
    expect(tabs(wrapper)[0]?.attributes('aria-selected')).toBe('true')
    expect(tabs(wrapper).map((tab) => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1'])

    // 三个面板同时挂载,切换时零加载延迟。
    expect(wrapper.findAll('.project-settings__panel[role="tabpanel"]')).toHaveLength(4)
    expect(modelApi.getProjectModelSettings).toHaveBeenCalledTimes(1)
    expect(permissionApi.listProjectPermissionGroup).toHaveBeenCalledTimes(1)

    // 打开后焦点落在当前 Tab,不跳进面板。
    expect(document.activeElement).toBe(tabs(wrapper)[0]?.element)

    wrapper.unmount()
  })

  it('两页正文的第一个可交互元素都是模式开关,开关上方没有说明段落或 Agent 只读区块', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    const modelPanel = wrapper.get('.project-model')
    const modelFirst = firstInteractive(modelPanel.element)
    expect(modelFirst?.getAttribute('role')).toBe('radio')
    expect(modelFirst?.textContent?.trim()).toBe('跟随 Agent')
    expect(modelPanel.find('.project-config__scope').exists()).toBe(false)

    await selectTab(wrapper, 1)
    const permissionPanel = wrapper.get('.project-permission')
    const permissionFirst = firstInteractive(permissionPanel.element)
    expect(permissionFirst?.getAttribute('role')).toBe('radio')
    expect(permissionFirst?.textContent?.trim()).toBe('跟随 Agent')
    expect(permissionPanel.find('.project-config__scope').exists()).toBe(false)

    wrapper.unmount()
  })

  it('模型跟随态只读呈现生效值,不出现任何可编辑控件;切回自定义恢复二级标签', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    const modelPanel = wrapper.get('.project-model')
    const radios = modelPanel.findAll('[role="radio"]')
    await radios[0]?.trigger('click')
    await flushPromises()
    expect(wrapper.get('.follow-summary[data-kind="model"]').text()).toContain('当前生效')
    expect(wrapper.get('.follow-summary[data-kind="model"]').text()).toContain('Claude Sonnet 5.5')
    expect(wrapper.get('.follow-summary[data-kind="model"]').text()).toContain('回退')
    expect(wrapper.find('.project-model input, .project-model select, .project-model textarea').exists()).toBe(false)
    expect(wrapper.find('.project-model__subtabs').exists()).toBe(false)
    expect(wrapper.get('.project-config__save-state').attributes('data-state')).toBe('dirty')

    await radios[1]?.trigger('click')
    await flushPromises()
    expect(wrapper.find('.follow-summary').exists()).toBe(false)
    expect(wrapper.findAll('.project-model__subtabs [role="tab"]')).toHaveLength(3)
    expect(wrapper.find('.project-model select').exists()).toBe(true)

    // 切回跟随并保存:payload 带 followAgent=true,保存后回到 clean。
    await radios[0]?.trigger('click')
    await flushPromises()
    await wrapper.get('.project-config__buttons .dl-btn--primary').trigger('click')
    await flushPromises()
    expect(modelApi.saveProjectModelSettings).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(modelApi.saveProjectModelSettings).mock.calls[0]?.[1]
    expect(saved?.model.followAgent).toBe(true)
    expect(wrapper.get('.project-config__save-state').attributes('data-state')).toBe('saved')

    wrapper.unmount()
  })

  it('权限跟随态只读呈现 Agent 模式与规则计数,不渲染编辑器;保存不因保留值失败', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    await selectTab(wrapper, 1)
    const permissionPanel = wrapper.get('.project-permission')
    const radios = permissionPanel.findAll('[role="radio"]')
    await radios[0]?.trigger('click')
    await flushPromises()
    await flushPromises()

    const summary = wrapper.get('.follow-summary[data-kind="permissions"]')
    expect(summary.text()).toContain('默认权限模式')
    expect(summary.text()).toContain('自动')
    expect(summary.text()).toContain('允许 3 · 拒绝 2 · 询问 2')
    expect(wrapper.find('.permission-editor').exists()).toBe(false)
    expect(wrapper.find('.project-permission input, .project-permission select, .project-permission textarea').exists()).toBe(false)

    // 展开可看到 Agent 规则明细。
    const disclosure = summary.get('.follow-summary__disclosure')
    expect(disclosure.attributes('aria-expanded')).toBe('false')
    await disclosure.trigger('click')
    expect(summary.get('.follow-summary__disclosure').attributes('aria-expanded')).toBe('true')
    expect(summary.text()).toContain('Read(./.env)')

    await wrapper.get('.project-config__buttons .dl-btn--primary').trigger('click')
    await flushPromises()
    expect(permissionApi.saveProjectPermissionGroup).toHaveBeenCalledTimes(1)
    const saved = vi.mocked(permissionApi.saveProjectPermissionGroup).mock.calls[0]?.[1]
    expect(saved?.followAgent).toBe(true)
    expect(saved?.rules.length).toBeGreaterThan(0)
    expect(wrapper.get('.project-config__save-state').attributes('data-state')).toBe('saved')

    wrapper.unmount()
  })

  it('切换 Tab 保留草稿,非活动域的脏状态同时进入可见徽标与可访问名', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    await selectTab(wrapper, 1)
    expect(tabs(wrapper)[1]?.attributes('aria-selected')).toBe('true')
    expect(wrapper.get('.project-settings__tablist button[aria-selected="true"] .project-settings__tab-label').text()).toBe('权限')
    expect(document.activeElement).toBe(tabs(wrapper)[1]?.element)

    await dirtyPermissions(wrapper)
    expect(wrapper.get('.project-config__save-state').attributes('data-state')).toBe('dirty')

    // 切到模型页:权限草稿仍在,模型页自己是干净的。
    await selectTab(wrapper, 0)
    expect(tabs(wrapper)[0]?.attributes('aria-selected')).toBe('true')
    expect(tabs(wrapper)[1]?.attributes('aria-label')).toBe('权限 · 有未保存的更改')
    expect(tabs(wrapper)[1]?.get('.project-settings__tab-badge').text()).toBe('未保存')
    expect(wrapper.get('.project-config__save-state').attributes('data-state')).toBe('clean')
    expect(wrapper.get('.project-config__buttons .dl-btn--primary').attributes('disabled')).toBeDefined()

    // 切回权限页,草稿原样保留。
    await selectTab(wrapper, 1)
    expect(wrapper.get('.permission-editor [data-mode-trigger]').text()).toBe('每次询问')

    await wrapper.get('.project-config__buttons .dl-btn--primary').trigger('click')
    await flushPromises()
    expect(permissionApi.saveProjectPermissionGroup).toHaveBeenCalledTimes(1)
    expect(modelApi.saveProjectModelSettings).not.toHaveBeenCalled()
    expect(tabs(wrapper)[1]?.attributes('aria-label')).toBe('权限')

    wrapper.unmount()
  })

  it('关闭前确认点名未保存的域,Esc 只关闭确认层,放弃后才关闭窗体', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    await selectTab(wrapper, 1)
    await dirtyPermissions(wrapper)

    await wrapper.get('.project-config__buttons .dl-btn--ghost').trigger('click')
    await flushPromises()
    const confirm = wrapper.get('[role="alertdialog"]')
    expect(confirm.text()).toContain('权限')
    expect(document.activeElement).toBe(confirm.get('.dl-btn--ghost').element)

    // 确认层的 Esc 只关闭确认层,窗体仍然打开。
    confirm.element.dispatchEvent(new Event('cancel', { cancelable: true }))
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.find('dialog.project-settings').attributes('open')).toBeDefined()

    await wrapper.get('.project-config__buttons .dl-btn--ghost').trigger('click')
    await flushPromises()
    await wrapper.get('[role="alertdialog"] .project-settings__discard').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('没有草稿时关闭立即发生,不弹确认', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    await wrapper.get('.project-config__buttons .dl-btn--ghost').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('保存失败标在对应 Tab 上并持续可见', async () => {
    vi.mocked(permissionApi.saveProjectPermissionGroup).mockImplementation(async () => ({ ok: false, error: new Error('save failed') }))
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    await selectTab(wrapper, 1)
    await dirtyPermissions(wrapper)
    await wrapper.get('.project-config__buttons .dl-btn--primary').trigger('click')
    await flushPromises()

    expect(wrapper.get('.project-config__save-state').attributes('data-state')).toBe('error')
    expect(wrapper.get('.project-config__save-state').text()).toBe('save failed')
    expect(document.activeElement).toBe(wrapper.get('.project-config__save-state').element)
    expect(tabs(wrapper)[1]?.attributes('aria-label')).toBe('权限 · 保存失败')

    // 切到别的域后,失败标记仍在权限 Tab 上。
    await selectTab(wrapper, 0)
    expect(tabs(wrapper)[1]?.get('.project-settings__tab-badge').text()).toBe('保存失败')

    wrapper.unmount()
  })

  it('任一域保存中时窗体不可关闭,也不弹丢弃确认', async () => {
    let resolveSave: ((result: Result<ProjectPermissionGroup>) => void) | null = null
    vi.mocked(permissionApi.saveProjectPermissionGroup).mockImplementation(() => new Promise<Result<ProjectPermissionGroup>>((resolve) => { resolveSave = resolve }))
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    await selectTab(wrapper, 1)
    await dirtyPermissions(wrapper)
    await wrapper.get('.project-config__buttons .dl-btn--primary').trigger('click')
    await flushPromises()

    const closeButton = wrapper.get('.project-config__buttons .dl-btn--ghost')
    expect(closeButton.attributes('disabled')).toBeDefined()
    await closeButton.trigger('click')
    await wrapper.get('dialog.project-settings').trigger('cancel')
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.emitted('close')).toBeUndefined()

    const permission = mockListProjectPermissionGroup(project.path)
    resolveSave?.({ ok: true, value: permission })
    await flushPromises()
    await wrapper.get('.project-config__buttons .dl-btn--ghost').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
  })

  it('标签栏恒为横向:Left / Right 循环切换,Home / End 直达首末,上下键不生效', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await flushPromises()

    const tablist = wrapper.get('.project-settings__tablist')
    expect(tablist.attributes('aria-orientation')).toBe('horizontal')

    // 首项向左回绕到最后一项。
    await tablist.trigger('keydown', { key: 'ArrowLeft' })
    await flushPromises()
    expect(tabs(wrapper)[3]?.attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs(wrapper)[3]?.element)

    await tablist.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(tabs(wrapper)[0]?.attributes('aria-selected')).toBe('true')

    // 纵向方向键不再有语义。
    await tablist.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(tabs(wrapper)[0]?.attributes('aria-selected')).toBe('true')

    await tablist.trigger('keydown', { key: 'End' })
    await flushPromises()
    expect(tabs(wrapper)[3]?.attributes('aria-selected')).toBe('true')
    await tablist.trigger('keydown', { key: 'Home' })
    await flushPromises()
    expect(tabs(wrapper)[0]?.attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs(wrapper)[0]?.element)

    wrapper.unmount()
  })
})
