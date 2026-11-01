import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AgentMcp from './agent-mcp.vue'

// 300px 容器模拟工作台侧栏;数据来自真实 dummy API,保留异步四态。
const meta = {
  title: '组件/AgentMcp',
  component: AgentMcp,
  args: { agentId: 'planning', agentName: '规划助手' },
  render: (args) => ({
    components: { AgentMcp },
    setup() { return { args } },
    template: '<div style="inline-size: 300px"><AgentMcp v-bind="args" /></div>',
  }),
} satisfies Meta<typeof AgentMcp>

export default meta
type Story = StoryObj<typeof meta>

export const Agent级服务器: Story = {}
export const Agent空态: Story = { args: { agentId: 'empty-agent', agentName: '空白 Agent' } }
