import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import SegmentedControl from './segmented-control.vue'

// 分段控件:共享边线格、radiogroup 语义与 roving tabindex。
const meta = {
  title: '组件/SegmentedControl',
  component: SegmentedControl,
  args: {
    label: '侧栏视图',
    modelValue: 'projects',
    options: [
      { id: 'projects', label: '项目' },
      { id: 'plugins', label: '插件' },
    ],
  },
  render: (args) => ({
    components: { SegmentedControl },
    setup() {
      const value = ref(args.modelValue)
      return { args, value }
    },
    template: '<SegmentedControl v-bind="args" v-model="value" />',
  }),
} satisfies Meta<typeof SegmentedControl>

export default meta
type Story = StoryObj<typeof meta>

export const 项目与插件: Story = {}

// 项目设置 / 首页安装区的真实二选一:选中项必须一眼可辨。
export const 跟随与自定义: Story = {
  args: {
    label: '配置方式',
    modelValue: 'custom',
    options: [
      { id: 'follow', label: '跟随 Agent' },
      { id: 'custom', label: '自定义' },
    ],
  },
}

export const 三段: Story = {
  args: {
    options: [
      { id: 'all', label: '全部' },
      { id: 'active', label: '进行中' },
      { id: 'done', label: '已完成' },
    ],
    modelValue: 'active',
  },
}
