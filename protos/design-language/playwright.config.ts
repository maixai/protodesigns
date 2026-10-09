import { defineConfig, devices } from '@playwright/test'

// 校准装置:同一原型跑 Chromium 与 WebKit 两个引擎,逐宽度截图并做布局断言。
// 之所以要两个引擎:桌面壳在 macOS / Linux 上跑的是 WebKit 系,在 Windows 上是 Chromium 系,
// 只在 Chrome 里验过的布局,到了壳里可能不成立。
//
// 注意:两个引擎的截图基线各自独立(文件名带 project 名),
// 因为字体栅格化不同会导致逐像素差异 —— 跨引擎不做像素比对,只做布局断言。
//
// 三类 project:
//   - chromium / webkit:tests/calibrate 的逐原型深度断言 + 像素基线(`make calibrate`);
//   - smoke:tests/smoke 的仓库级通用兜底(`make smoke`,见下方 SMOKE 开关)。
const PORT = Number(process.env['PORT'] ?? 5173)
const BASE_URL = process.env['BASE_URL'] ?? `http://127.0.0.1:${PORT}`
// dev server 启动命令:默认用 pnpm;由 make 调用时通过 DEV_COMMAND 注入实际可用的包管理器命令
// (本机 pnpm 可能只以 corepack 形式存在,不在 PATH 上)。
const DEV_COMMAND =
  process.env['DEV_COMMAND'] ?? `pnpm dev --host 127.0.0.1 --port ${PORT}`

// SMOKE=1:冒烟模式。冒烟只关心确定性断言(溢出 / console error / 请求失败 / 交互),
// 像素基线不在其判定范围内 —— 基线按创建时的 OS 生成,换 OS 跑必然假失败。
//
// 两个覆盖缺一不可:
//   - ignoreSnapshots:跳过截图断言(基线缺失时调阈值救不了,是"找不到基线"的硬失败);
//   - snapshotDir:把基线根目录挪到 test-results/(已 gitignore)。
//     实测 Playwright 1.63 在 ignoreSnapshots 下**仍会把缺失的基线落盘**;若落进真实
//     snapshots 目录,等于让之后的 `make calibrate` 拿未复核的图当期望值 —— 像素门禁就此失效。
const SMOKE = process.env['SMOKE'] === '1'
const CALIBRATE_SMOKE_OVERRIDES = SMOKE
  ? { ignoreSnapshots: true, snapshotDir: 'test-results/smoke-baselines' }
  : {}

export default defineConfig({
  fullyParallel: true,
  reporter: [['list']],
  // 允许 1% 的像素差,吸收字体栅格化与抗锯齿噪声。
  //
  // animations: 'disabled' —— 截图时把 CSS 动画 / 过渡冻结到终态。
  // 不冻结时,**fullPage 截图会持续报「Failed to take two consecutive stable screenshots」**:
  // 实测两次捕获之间整页高度在 10757 与 10846 之间摆动(可复现 +89px),而这一页高达约 1 万像素、
  // 一次捕获要几秒 —— 页面里任何在动的元素都会让「连续两张一致」永远不成立。
  // 注意:基线必须与判定用同一组选项生成,否则等于拿另一套渲染结果当期望。
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    baseURL: BASE_URL,
  },
  projects: [
    {
      name: 'chromium',
      testDir: './tests/calibrate',
      use: { ...devices['Desktop Chrome'] },
      ...CALIBRATE_SMOKE_OVERRIDES,
    },
    {
      name: 'webkit',
      testDir: './tests/calibrate',
      use: { ...devices['Desktop Safari'] },
      ...CALIBRATE_SMOKE_OVERRIDES,
    },
    { name: 'smoke', testDir: './tests/smoke', use: { ...devices['Desktop Chrome'] } },
  ],
  // 复用已在跑的 dev server,没有则自动拉起。
  webServer: {
    command: DEV_COMMAND,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
