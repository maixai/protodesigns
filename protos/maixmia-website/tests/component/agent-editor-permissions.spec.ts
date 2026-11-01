import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentEditorDialog from '../../src/components/agent-editor-dialog.vue'
import * as api from '../../src/api/agent-permissions'
import { mockAgentSummaries } from '../../src/mocks/workspace'
import { mockGetAgentPermissions } from '../../src/mocks/agent-permissions'
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/agent-permissions', () => ({ getAgentPermissions: vi.fn() }))
const agent = mockAgentSummaries()[0]
if (agent === undefined) throw new Error('Missing Agent editor fixture')

describe('agent editor permissions tab', () => {
  afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = '' })

  it('shows three tabs for an existing Agent and blocks saving when permissions fail to load', async () => {
    useI18n().setLocale('zh-CN')
    vi.mocked(api.getAgentPermissions).mockResolvedValue({ ok: false, error: new Error('Permission service unavailable') })
    const wrapper = mount(AgentEditorDialog, { props: { open: true, focusIdentity: false, agent, canDelete: false, busy: false, error: '', savedToken: 0 } })
    await flushPromises()
    await flushPromises()
    expect(wrapper.findAll('.agent-editor__tabs [role="tab"]')).toHaveLength(3)
    await wrapper.get('[role="tab"][id$="tab-permissions"]').trigger('click')
    expect(wrapper.text()).toContain('Permission service unavailable')
    expect(wrapper.text()).toContain('权限尚未加载')
    expect(wrapper.get('.agent-editor__save-button').attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('.agent-editor__permission-state button').text()).toBe('重试')
    wrapper.unmount()
  })

  it('keeps the permission draft and focuses the failing tab after a partial save failure', async () => {
    useI18n().setLocale('zh-CN')
    vi.mocked(api.getAgentPermissions).mockImplementation(async (agentId) => ({ ok: true, value: mockGetAgentPermissions(agentId) }))
    const wrapper = mount(AgentEditorDialog, { props: { open: true, focusIdentity: false, agent, canDelete: false, busy: false, error: '', savedToken: 0 }, attachTo: document.body })
    await flushPromises()
    await flushPromises()
    await wrapper.get('[role="tab"][id$="tab-permissions"]').trigger('click')
    const modeTrigger = wrapper.get('.permission-editor [data-mode-trigger]')
    await modeTrigger.trigger('click')
    await wrapper.get('.permission-editor [data-mode="dontAsk"]').trigger('click')
    await wrapper.setProps({ error: 'Agent 基本与模型配置已保存；权限未保存', errorTab: 'permissions' })
    await flushPromises()
    expect(wrapper.get('[role="tab"][id$="tab-permissions"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('.permission-editor [data-mode-trigger]').text()).toBe('仅按规则')
    expect(wrapper.get('[role="alert"]').text()).toContain('权限未保存')
    expect(document.activeElement).toBe(wrapper.get('[role="tab"][id$="tab-permissions"]').element)
    wrapper.unmount()
  })

  it('hides the permissions tab while creating an Agent', async () => {
    vi.mocked(api.getAgentPermissions).mockImplementation(async (agentId) => ({ ok: true, value: mockGetAgentPermissions(agentId) }))
    const wrapper = mount(AgentEditorDialog, { props: { open: true, focusIdentity: false, canDelete: false, busy: false, error: '', savedToken: 0 } })
    await flushPromises()
    expect(wrapper.findAll('.agent-editor__tabs [role="tab"]')).toHaveLength(2)
    expect(wrapper.find('[id$="tab-permissions"]').exists()).toBe(false)
    expect(api.getAgentPermissions).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
