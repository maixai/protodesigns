import { definePreview } from '@storybook/vue3-vite'
import { mockAgentSummaries } from '../mocks/workspace'
import AgentEditorDialog from './agent-editor-dialog.vue'
const agent = mockAgentSummaries()[0]
if (!agent) throw new Error('Missing Agent settings story fixture')
const meta = definePreview({ addons: [] }).meta({ title: '组件/AgentEditorDialog', component: AgentEditorDialog,
  args: { open: true, agent, focusIdentity: false, canDelete: false, busy: false, error: '', savedToken: 0 },
})
export const 默认模型页 = meta.story({})
export const 来自项目的插件管理 = meta.story({ args: { initialTab: 'plugins', initialPluginKey: 'browser-tools@community' } })
export const 来自项目的MCP管理 = meta.story({ args: { initialTab: 'mcp' } })
