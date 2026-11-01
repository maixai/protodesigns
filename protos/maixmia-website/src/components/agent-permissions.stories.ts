import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { nextTick, onMounted, ref } from 'vue'
import type { AgentPermissions } from '../contracts/generated/agent-permissions'
import type { ProjectPermissionGroup } from '../contracts/generated/project-permission-group'
import AgentPermissionsEditor from './agent-permissions.vue'
import { mockGetAgentPermissions, mockListProjectPermissionGroup } from '../mocks/agent-permissions'

const agent: AgentPermissions = mockGetAgentPermissions('planning')
const project: ProjectPermissionGroup = mockListProjectPermissionGroup('~/work/weekly-report')

// 受控编辑器只呈现草稿;事件由 Storybook 记录,不写回仓库。
const meta = {
  title: '组件/AgentPermissions',
  component: AgentPermissionsEditor,
  args: { scope: 'agent', ownerId: agent.agentId, defaultMode: agent.defaultMode, rules: agent.rules, idPrefix: 'story-agent-permissions' },
  render: (args) => ({
    components: { AgentPermissionsEditor },
    setup() { return { args } },
    template: '<AgentPermissionsEditor v-bind="args" />',
  }),
} satisfies Meta<typeof AgentPermissionsEditor>

export default meta
type Story = StoryObj<typeof meta>

export const Agent级草稿: Story = {}
export const 菜单展开: Story = {
  render: (args) => ({
    components: { AgentPermissionsEditor },
    setup() {
      const root = ref<HTMLElement | null>(null)
      onMounted(async () => {
        await nextTick()
        root.value?.querySelector<HTMLButtonElement>('[data-mode-trigger]')?.click()
      })
      return { args, root }
    },
    template: '<div ref="root"><AgentPermissionsEditor v-bind="args" /></div>',
  }),
}
export const 项目继承草稿: Story = { args: { scope: 'project', ownerId: project.path, ownerName: 'weekly-report', defaultMode: null, rules: project.rules, idPrefix: 'story-project-permissions' } }
export const 禁用态: Story = { args: { disabled: true } }
export const 空规则: Story = { args: { scope: 'agent', ownerId: 'empty-agent', defaultMode: 'auto', rules: [], idPrefix: 'story-empty-permissions' } }
