import { expect } from 'storybook/test'
import { preview } from '../../.storybook/preview'
import { visibleStoryButton, visibleStoryElement } from '../../.storybook/play-helpers'
import AgentMcp from './agent-mcp.vue'

// 数据来自真实 dummy API,详情与新建复用同一编辑器,窄屏由工作台 viewport 切换。
const meta = preview.meta({
  title: '组件/AgentMcp',
  component: AgentMcp,
  args: { agentId: 'planning', agentName: '规划助手' },
  render: (args) => ({
    components: { AgentMcp },
    setup() { return { args } },
    template: '<div style="max-inline-size: var(--dl-measure); padding: var(--dl-space-3)"><AgentMcp v-bind="args" /></div>',
  }),
})

export const 已安装与异常恢复 = meta.story({})
export const 插件停用与更新不影响状态 = meta.story({ args: { agentId: 'research', agentName: '研究助手' } })
export const Agent空态 = meta.story({ args: { agentId: 'empty-agent', agentName: '空白 Agent' } })
export const 手配详情即编辑 = meta.story({
  play: async ({ mount, canvasElement, userEvent }) => {
    // 显式完成 Vue 挂载后才等待异步列表,不让 play 的等待反过来阻塞挂载阶段。
    await mount()
    const row = await visibleStoryButton(canvasElement, '.agent-mcp .mcp-main[data-server-id="agent:planning:sentry"]')
    await userEvent.click(row)
    await visibleStoryElement(canvasElement, '.agent-mcp .mcp-detail .mcp-server-editor')
    await expect(canvasElement.querySelector('.agent-mcp')).toHaveAttribute('data-view', 'detail')
  },
})
export const 插件托管只读 = meta.story({
  play: async ({ mount, canvasElement, userEvent }) => {
    await mount()
    const row = await visibleStoryButton(canvasElement, '.agent-mcp .mcp-plugin-main[data-server-id="plugin:community:browser-tools:browser"]')
    await userEvent.click(row)
    await visibleStoryElement(canvasElement, '.agent-mcp .mcp-plugin-detail .mcp-readonly-badge')
    await expect(canvasElement.querySelector('.agent-mcp')).toHaveAttribute('data-view', 'pluginDetail')
    await expect(canvasElement.querySelector('.agent-mcp .mcp-server-editor')).not.toBeInTheDocument()
  },
})
