import type { Preview } from '@storybook/vue3-vite'
import '../src/style.css'

// 模板原型的预览壳:只提供设计 token 作用域,不绑定具体产品的主题实现。
const preview: Preview = {
  decorators: [
    (story) => ({
      setup() {
        return { story }
      },
      template: '<div class="dl-scope" style="min-height: 100vh; padding: var(--dl-space-6); background: var(--dl-bg-base); color: var(--dl-text-primary);"><component :is="story" /></div>',
    }),
  ],
  parameters: { layout: 'fullscreen' },
}

export default preview
