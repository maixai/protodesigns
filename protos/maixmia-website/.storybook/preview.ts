import { definePreview } from '@storybook/vue3-vite'
import docs from '@storybook/addon-docs'
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { useI18n } from '../src/i18n'
import { darkOverrides } from '../src/theme'
import '../src/style.css'

// 初始化 i18n 单例;stories 里的组件与产品页面读同一套词条。
useI18n()

// 所有 story 共用产品壳的深色作用域与 Naive UI 主题,
// 保证 Storybook 里的视觉与 make run 看到的一致。
export const preview = definePreview({
  addons: [docs()],
  // Vue renderer 会为返回的装饰器选项注入 story 组件,不能把 StoryFn 当成动态组件。
  decorators: [
    () => ({
      components: { NConfigProvider, NMessageProvider },
      setup() {
        return { darkOverrides }
      },
      template: `
        <n-config-provider :theme-overrides="darkOverrides">
          <n-message-provider>
            <div class="dl-scope dl-scope--dark" style="min-height: 100vh; padding: var(--dl-space-6); background: var(--dl-bg-base); color: var(--dl-text-primary);">
              <story />
            </div>
          </n-message-provider>
        </n-config-provider>
      `,
    }),
  ],
  parameters: {
    controls: { expanded: true },
    layout: 'fullscreen',
  },
})

export default preview
