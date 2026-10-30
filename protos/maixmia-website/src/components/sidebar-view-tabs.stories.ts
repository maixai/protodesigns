import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import SidebarViewTabs from './sidebar-view-tabs.vue'

// 侧栏视图切换:低矮文字 tab + 细下划线,带可选的等宽计数。
const meta = {
  title: '组件/SidebarViewTabs',
  component: SidebarViewTabs,
  args: {
    label: '侧栏视图',
    idPrefix: 'story-sidebar',
    modelValue: 'projects',
    options: [
      { id: 'projects', label: '项目', count: 2 },
      { id: 'plugins', label: '插件', count: 1 },
    ],
  },
  render: (args) => ({
    components: { SidebarViewTabs },
    setup() {
      const value = ref(args.modelValue)
      return { args, value }
    },
    template: '<div style="inline-size: 260px"><SidebarViewTabs v-bind="args" v-model="value" /></div>',
  }),
} satisfies Meta<typeof SidebarViewTabs>

export default meta
type Story = StoryObj<typeof meta>

export const 项目与插件: Story = {}

export const 无计数: Story = {
  args: {
    options: [
      { id: 'projects', label: '项目' },
      { id: 'plugins', label: '插件' },
    ],
  },
}
