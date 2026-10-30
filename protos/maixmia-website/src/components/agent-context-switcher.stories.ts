import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AgentContextSwitcher from './agent-context-switcher.vue'
import { mockAgentSummaries } from '../mocks/workspace'

// Agent 导航上下文:侧栏整行档与底栏紧凑档,以及在线 / 离线 / 认证失败的状态呈现。
const agents = mockAgentSummaries()

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
