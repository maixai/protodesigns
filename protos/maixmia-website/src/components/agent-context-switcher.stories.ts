import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import AgentEditorDialog from './agent-editor-dialog.vue'
import type { AgentConfig } from '../contracts/generated/agent-config'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import AgentContextSwitcher from './agent-context-switcher.vue'
import { mockAgentSummaries } from '../mocks/workspace'

// Agent 导航上下文:侧栏整行档与底栏紧凑档,以及在线 / 离线 / 认证失败的状态呈现。
const agents = mockAgentSummaries()
const AVATAR_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const meta = {
  title: '组件/AgentContextSwitcher',
  component: AgentContextSwitcher,
  args: {
    value: 'planning',
    agents,
    variant: 'sidebar',
  },
} satisfies Meta<typeof AgentContextSwitcher>

export default meta
type Story = StoryObj<typeof meta>

export const 侧栏档: Story = {
  render: (args) => ({
    components: { AgentContextSwitcher },
    setup() {
      return { args }
    },
    template: '<div class="dl-scope dl-scope--dark" style="inline-size: 300px; padding: var(--dl-space-4); background: var(--dl-bg-base);"><AgentContextSwitcher v-bind="args" /></div>',
  }),
}

export const 已设置头像: Story = {
  ...侧栏档,
  args: { agents: agents.map((agent) => ({ ...agent, avatarUrl: AVATAR_URL })) },
}

export const 头像与长名称: Story = {
  ...侧栏档,
  args: { agents: agents.map((agent) => ({ ...agent, name: '𠮷野的项目规划与研究协作助手', avatarUrl: agent.id === 'planning' ? AVATAR_URL : '' })) },
}

// 在同一工作台预览设置草稿与已保存头像；仅保存事件更新摘要，取消不回写。
export const 设置头像: Story = {
  render: (args) => ({
    components: { AgentContextSwitcher, AgentEditorDialog },
    setup() {
      const agent = ref<AgentSummary | undefined>(args.agents[0])
      const isOpen = ref(false)
      const savedToken = ref(0)
      function save(config: AgentConfig): void {
        if (agent.value === undefined) return
        agent.value = { ...agent.value, ...config }
        savedToken.value += 1
      }
      return { agent, isOpen, savedToken, save }
    },
    template: '<div class="dl-scope dl-scope--dark" style="padding: var(--dl-space-4); background: var(--dl-bg-base);"><template v-if="agent"><AgentContextSwitcher :value="agent.id" :agents="[agent]" variant="sidebar" @settings="isOpen = true" /><AgentEditorDialog :open="isOpen" :focus-identity="false" :agent="agent" :can-delete="false" :busy="false" error="" :saved-token="savedToken" @submit="save" @cancel="isOpen = false" /></template></div>',
  }),
}

// 从切换器进入「基本」页，可预览紧凑资料行、移除入口、选图反馈与保存前后差异。
export const 资料头已有头像与长文案: Story = {
  ...设置头像,
  args: {
    agents: agents.map((agent) => ({ ...agent, avatarUrl: AVATAR_URL, name: '𠮷野的项目规划与研究协作助手', note: '负责跨项目需求梳理、每周计划与交付跟踪，保存后同步资料。' })),
  },
}

export const 底栏紧凑档: Story = {
  args: { variant: 'dock' },
  render: (args) => ({
    components: { AgentContextSwitcher },
    setup() {
      return { args }
    },
    template: '<div class="dl-scope dl-scope--dark" style="padding: var(--dl-space-4); background: var(--dl-bg-base);"><AgentContextSwitcher v-bind="args" /></div>',
  }),
}

export const 离线与认证失败: Story = {
  args: {
    value: 'research',
    agents: agents.map((agent) => agent.id === 'research'
      ? { ...agent, identity: { ...agent.identity, trustState: 'keyChanged' as const } }
      : agent),
  },
  render: (args) => ({
    components: { AgentContextSwitcher },
    setup() {
      return { args }
    },
    template: '<div class="dl-scope dl-scope--dark" style="inline-size: 300px; padding: var(--dl-space-4); background: var(--dl-bg-base);"><AgentContextSwitcher v-bind="args" /></div>',
  }),
}
