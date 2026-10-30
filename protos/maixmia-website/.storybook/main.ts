import { defineMain } from '@storybook/vue3-vite/node'

// Storybook 作为组件工作台:stories 既是人工视觉评审对象,也是 addon-vitest 的测试用例。
export default defineMain({
  framework: '@storybook/vue3-vite',
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-vitest'],
  staticDirs: ['../public'],
})
