import { defineMain } from '@storybook/vue3-vite/node'

// 模板原型的 Storybook 基座:新原型复制本目录即可获得组件预览与 Vitest 视觉用例。
export default defineMain({
  framework: '@storybook/vue3-vite',
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-vitest'],
  staticDirs: ['../public'],
})
