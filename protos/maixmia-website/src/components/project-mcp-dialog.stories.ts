import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockAgentSummaries, mockProjects } from '../mocks/workspace'
import ProjectMcpDialog from './project-mcp-dialog.vue'

const agent = mockAgentSummaries()[0]
const project = agent === undefined ? undefined : mockProjects(agent.id)[0]
if (agent === undefined || project === undefined) throw new Error('Missing project MCP story fixture')

const meta = {
  title: '组件/ProjectMcpDialog', component: ProjectMcpDialog,
  args: { open: true, agent, project },
} satisfies Meta<typeof ProjectMcpDialog>
export default meta
type Story = StoryObj<typeof meta>
export const 项目MCP草稿与Agent只读上下文: Story = {}
