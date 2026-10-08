import { defineConfig, devices } from '@playwright/test'

// 校准装置:同一原型跑 Chromium 与 WebKit 两个引擎,逐宽度截图并做布局断言。
// 之所以要两个引擎:桌面壳在 macOS / Linux 上跑的是 WebKit 系,在 Windows 上是 Chromium 系,
// 只在 Chrome 里验过的布局,到了壳里可能不成立。
//
// 注意:两个引擎的截图基线各自独立(文件名带 project 名),
// 因为字体栅格化不同会导致逐像素差异 —— 跨引擎不做像素比对,只做布局断言。
const PORT = Number(process.env['PORT'] ?? 5173)
const BASE_URL = process.env['BASE_URL'] ?? `http://127.0.0.1:${PORT}`
// dev server 启动命令:默认用 pnpm;由 make 调用时通过 DEV_COMMAND 注入实际可用的包管理器命令
// (本机 pnpm 可能只以 corepack 形式存在,不在 PATH 上)。
const DEV_COMMAND =
  process.env['DEV_COMMAND'] ?? `pnpm dev --host 127.0.0.1 --port ${PORT}`

export default defineConfig({
  testDir: './tests/calibrate',
  fullyParallel: true,
  reporter: [['list']],
  // 允许 1% 的像素差,吸收字体栅格化与抗锯齿噪声。
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: BASE_URL,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // 复用已在跑的 dev server,没有则自动拉起。
  webServer: {
    command: DEV_COMMAND,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
