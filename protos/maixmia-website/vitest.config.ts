import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// 组件级测试分两层:
//   component: Vitest + Vue Test Utils + happy-dom,毫秒级,日常每次改动都跑;
//   storybook: Storybook 的 stories 作为测试用例,真浏览器(Chromium)渲染,归视觉基线。
//
// 两者都不替代 Playwright 的 tests/quick 与 tests/calibrate:
//   quick 验集成行为,calibrate 验几何/像素/多宽度。
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
          // 交互断言与编辑器 stories 会延迟装载这些模块;预先优化避免测试中途整页重载并丢失 runner。
          optimizeDeps: {
            include: [
              'storybook/test',
              '@codemirror/commands', '@codemirror/state', '@codemirror/language', '@codemirror/view',
              '@codemirror/lang-css', '@codemirror/lang-html', '@codemirror/lang-javascript', '@codemirror/lang-json',
              '@codemirror/lang-markdown', '@codemirror/lang-python', '@codemirror/legacy-modes/mode/shell', '@lezer/highlight',
            ],
          },
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
