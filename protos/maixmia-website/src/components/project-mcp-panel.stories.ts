import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockAgentSummaries, mockProjects } from '../mocks/workspace'
import ProjectMcpPanel from './project-mcp-panel.vue'

const agent = mockAgentSummaries()[0]
const project = agent === undefined ? undefined : mockProjects(agent.id)[0]
if (agent === undefined || project === undefined) throw new Error('Missing project MCP story fixture')

const meta = {
  title: '组件/ProjectMcpPanel',
  component: ProjectMcpPanel,
  args: { agent, project },
} satisfies Meta<typeof ProjectMcpPanel>
export default meta
type Story = StoryObj<typeof meta>

export const 项目服务器: Story = {}
export const 窄宽服务器行: Story = {
  render: (args) => ({
    components: { ProjectMcpPanel },
    setup() { return { args } },
    template: '<div style="inline-size: calc(var(--dl-space-12) * 7 + var(--dl-space-4))"><ProjectMcpPanel v-bind="args" /></div>',
  }),
}
