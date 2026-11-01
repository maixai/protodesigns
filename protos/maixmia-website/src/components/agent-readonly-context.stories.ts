import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockAgentSummaries } from '../mocks/workspace'
import AgentReadonlyContext from './agent-readonly-context.vue'

const agent = mockAgentSummaries()[0]
if (agent === undefined) throw new Error('Missing Agent context story fixture')
const meta = {
  title: '组件/AgentReadonlyContext', component: AgentReadonlyContext,
  args: { kind: 'model', agent },
} satisfies Meta<typeof AgentReadonlyContext>
export default meta
type Story = StoryObj<typeof meta>
export const 模型摘要: Story = {}
export const 权限摘要: Story = { args: { kind: 'permissions' } }
export const MCP摘要: Story = { args: { kind: 'mcp' } }
