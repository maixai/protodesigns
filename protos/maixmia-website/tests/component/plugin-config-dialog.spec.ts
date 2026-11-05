import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import PluginConfigDialog from '../../src/components/plugin-config-dialog.vue'
import { mockMarketplaceBindings } from '../../src/mocks/workspace'
import { useI18n } from '../../src/i18n'
const plugin = mockMarketplaceBindings('agent', 'planning')?.flatMap((binding) => binding.marketplace.plugins).find((item) => item.id === 'test-runner')
if (!plugin) throw new Error('Missing plugin review fixture')
beforeEach(() => { useI18n().setLocale('zh-CN'); document.body.innerHTML = '' })
describe('plugin install scope confirmation', () => {
  it('uses the explicit project scope without leaking Agent installation copy and preserves busy cancellation', async () => {
    const wrapper = mount(PluginConfigDialog, { props: { plugin, marketplaceName: 'Anthropic Plugins', agentName: '规划助手', scopeText: '只安装到本项目「weekly-report」；不修改 Agent 的安装记录。', busy: true, error: '' }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('.plugin-config-dialog__scope').text()).toContain('本项目「weekly-report」')
    expect(wrapper.get('.plugin-config-dialog__scope').text()).not.toContain('所有项目')
    await wrapper.trigger('cancel')
    expect(wrapper.emitted('cancel')).toBeUndefined()
    await wrapper.setProps({ busy: false })
    await wrapper.trigger('cancel')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })
  it('retains the original Agent scope when no project scope is supplied', () => {
    const wrapper = mount(PluginConfigDialog, { props: { plugin, marketplaceName: 'Anthropic Plugins', agentName: '规划助手', busy: false, error: '' } })
    expect(wrapper.get('.plugin-config-dialog__scope').text()).toContain('该 Agent 的所有项目')
    wrapper.unmount()
  })
})
