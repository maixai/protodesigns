import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProjectFollowSummary from '../../src/components/project-follow-summary.vue'
import * as permissionApi from '../../src/api/agent-permissions'
import { mockGetAgentPermissions } from '../../src/mocks/agent-permissions'
import { mockAgentSummaries } from '../../src/mocks/workspace'
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/agent-permissions', () => ({ getAgentPermissions: vi.fn() }))
const agent = mockAgentSummaries()[0]
if (agent === undefined) throw new Error('Missing Agent fixture')

describe('project follow summary', () => {
  afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = '' })

  it('模型跟随态只呈现生效值,不渲染任何编辑控件', async () => {
    useI18n().setLocale('zh-CN')
    const wrapper = mount(ProjectFollowSummary, { props: { kind: 'model', agent } })
    await flushPromises()

    const facts = wrapper.get('.follow-summary__facts')
    expect(facts.text()).toContain('模型来源')
    expect(facts.text()).toContain('Claude · 工作')
    expect(facts.text()).toContain('默认模型')
    expect(facts.text()).toContain('Claude Sonnet 5.5')
    expect(facts.text()).toContain('思考强度')
    expect(facts.text()).toContain('回退模型链')
    expect(wrapper.find('input, select, textarea').exists()).toBe(false)
    wrapper.unmount()
  })

  it('模型跟随态在英文下本地化订阅标签', async () => {
    useI18n().setLocale('en')
    const wrapper = mount(ProjectFollowSummary, { props: { kind: 'model', agent } })
    await flushPromises()

    expect(wrapper.text()).toContain('Claude · Work')
    expect(wrapper.text()).not.toContain('Claude · 工作')
    wrapper.unmount()
  })

  it('权限跟随态显示 Agent 模式与计数,展开后按拒绝 / 询问 / 允许列出规则', async () => {
    useI18n().setLocale('zh-CN')
    vi.mocked(permissionApi.getAgentPermissions).mockImplementation(async (agentId) => ({ ok: true, value: mockGetAgentPermissions(agentId) }))
    const wrapper = mount(ProjectFollowSummary, { props: { kind: 'permissions', agent } })
    await flushPromises()
    await flushPromises()

    const facts = wrapper.get('.follow-summary__facts')
    expect(facts.text()).toContain('自动')
    expect(facts.text()).toContain('允许 3 · 拒绝 2 · 询问 2')
    expect(wrapper.find('input, select, textarea').exists()).toBe(false)

    const disclosure = wrapper.get('.follow-summary__disclosure')
    expect(disclosure.attributes('aria-expanded')).toBe('false')
    await disclosure.trigger('click')
    expect(disclosure.attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('.follow-summary__rules h4').map((heading) => heading.text())).toEqual([
      '拒绝 · 2',
      '询问 · 2',
      '允许 · 3',
    ])
    expect(wrapper.find('.follow-summary__rules').text()).toContain('Read(./.env)')
    wrapper.unmount()
  })

  it('权限读取失败只影响摘要本身,并提供重试', async () => {
    useI18n().setLocale('zh-CN')
    vi.mocked(permissionApi.getAgentPermissions).mockResolvedValue({ ok: false, error: new Error('Agent permissions unavailable') })
    const wrapper = mount(ProjectFollowSummary, { props: { kind: 'permissions', agent } })
    await flushPromises()
    await flushPromises()

    expect(wrapper.get('.follow-summary__state').attributes('role')).toBe('alert')
    expect(wrapper.text()).toContain('Agent permissions unavailable')
    expect(wrapper.get('.follow-summary__state button').text()).toBe('重试')
    wrapper.unmount()
  })
})
