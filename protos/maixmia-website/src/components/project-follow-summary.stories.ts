import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockAgentSummaries } from '../mocks/workspace'
import ProjectFollowSummary from './project-follow-summary.vue'

const agent = mockAgentSummaries()[0]
if (agent === undefined) throw new Error('Missing follow summary story fixture')

const meta = {
  title: '组件/ProjectFollowSummary', component: ProjectFollowSummary,
  args: { kind: 'model', agent },
} satisfies Meta<typeof ProjectFollowSummary>
export default meta
type Story = StoryObj<typeof meta>

// 模型跟随态:来源 / 模型 / 思考强度 / 回退。
export const 模型摘要: Story = { args: { kind: 'model' } }

// 权限跟随态:Agent 模式与三类规则计数,可展开规则明细。
export const 权限摘要: Story = { args: { kind: 'permissions' } }
