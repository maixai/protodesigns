import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import SidebarViewTabs from './sidebar-view-tabs.vue'

// 侧栏视图切换:项目、插件与 Agent 级 MCP;低矮文字 tab + 细下划线。
const meta = {
  title: '组件/SidebarViewTabs',
  component: SidebarViewTabs,
  args: {
    label: '侧栏视图', idPrefix: 'story-sidebar', modelValue: 'projects',
    options: [{ id: 'projects', label: '项目', count: 2 }, { id: 'plugins', label: '插件', count: 1 }, { id: 'mcp', label: 'MCP', count: 4 }],
  },
  render: (args) => ({
    components: { SidebarViewTabs },
    setup() { const value = ref(args.modelValue); return { args, value } },
    template: '<div style="inline-size: 300px"><SidebarViewTabs v-bind="args" v-model="value" /></div>',
  }),
} satisfies Meta<typeof SidebarViewTabs>
export default meta
type Story = StoryObj<typeof meta>
export const 三个视图: Story = {}
export const 无计数: Story = { args: { options: [{ id: 'projects', label: '项目' }, { id: 'plugins', label: '插件' }, { id: 'mcp', label: 'MCP' }] } }
export const 英文三视图: Story = { args: { options: [{ id: 'projects', label: 'Projects', count: 2 }, { id: 'plugins', label: 'Plugins', count: 2 }, { id: 'mcp', label: 'MCP', count: 4 }] } }
