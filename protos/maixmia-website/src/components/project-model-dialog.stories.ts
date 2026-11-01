import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { mockAgentSummaries, mockProjects } from '../mocks/workspace'
import ProjectModelDialog from './project-model-dialog.vue'

const agent = mockAgentSummaries()[0]
const project = agent === undefined ? undefined : mockProjects(agent.id)[0]
if (agent === undefined || project === undefined) throw new Error('Missing project model story fixture')

const meta = {
  title: '组件/ProjectModelDialog', component: ProjectModelDialog,
  args: { open: true, agent, project },
} satisfies Meta<typeof ProjectModelDialog>
export default meta
type Story = StoryObj<typeof meta>
export const 项目模型与Agent只读上下文: Story = {}
export const 跟随Agent: Story = { args: { project: mockProjects(agent.id)[1] ?? project } }
