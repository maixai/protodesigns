import type { Meta, StoryObj } from '@storybook/vue3-vite'
import App from './App.vue'

// 模板原型的整页 story:展示菜单栏、空态、加载后列表与状态栏。
const meta = {
  title: '示例/App',
  component: App,
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

export const 默认: Story = {}
