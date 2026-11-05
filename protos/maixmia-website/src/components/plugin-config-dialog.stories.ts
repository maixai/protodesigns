import { definePreview } from '@storybook/vue3-vite'
import { mockMarketplaceBindings } from '../mocks/workspace'
import PluginConfigDialog from './plugin-config-dialog.vue'
const plugin = mockMarketplaceBindings('agent', 'planning')?.flatMap((binding) => binding.marketplace.plugins).find((item) => item.id === 'test-runner')
if (!plugin) throw new Error('Missing plugin review story fixture')
const meta = definePreview({ addons: [] }).meta({ title: '组件/PluginConfigDialog', component: PluginConfigDialog, args: { plugin, marketplaceName: 'Anthropic Plugins', agentName: '规划助手', busy: false, error: '' } })
export const Agent安装确认 = meta.story({})
export const 项目安装确认 = meta.story({ args: { scopeText: '只安装到本项目「weekly-report」；不修改 Agent 的安装记录。' } })
export const 项目安装失败 = meta.story({ args: { scopeText: '只安装到本项目「weekly-report」；不修改 Agent 的安装记录。', error: 'The project host is unavailable. Try again.' } })
