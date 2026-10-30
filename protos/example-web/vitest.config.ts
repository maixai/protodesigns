import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// 模板原型的组件测试基座:
//   component: Vitest + Vue Test Utils + happy-dom;
//   storybook: stories 作为真浏览器渲染的视觉用例。
const dirname = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'component',
            environment: 'happy-dom',
            include: ['tests/component/**/*.spec.ts'],
            globals: true,
          },
        },
        {
          extends: true,
          plugins: [
            storybookTest({
              configDir: path.join(dirname, '.storybook'),
              storybookScript: 'pnpm storybook',
            }),
          ],
          test: {
            name: 'storybook',
            setupFiles: ['./.storybook/vitest.setup.ts'],
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }),
)
