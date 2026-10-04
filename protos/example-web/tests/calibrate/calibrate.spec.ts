import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 设计校准:宽度清单与 .claude/rules/baseline-web.md 的多宽度要求一致。
const WIDTHS = [375, 768, 1280, 1600] as const
const VIEWPORT_HEIGHT = 900

// 横向溢出量:> 0 表示内容超出视口宽度,属于破版。
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

// 等待页面进入稳定态:异步 dummy 数据有 150-300ms 随机延迟,
// 不等它落定就截图会让基线随时机漂移,产生假失败。
async function waitForStable(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: '示例原型' })).toBeVisible()
  await expect(page.getByText('林晚晴')).toBeVisible()
}

for (const width of WIDTHS) {
  test.describe(`宽度 ${width}px`, () => {
    test('浅色下不破版', async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto('/')
      await waitForStable(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      await expect(page).toHaveScreenshot(`home-${width}-light.png`, { fullPage: true })
    })

    test('深色下不破版', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto('/')
      await waitForStable(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      await expect(page).toHaveScreenshot(`home-${width}-dark.png`, { fullPage: true })
    })
  })
}

test('异步数据的四态可达', async ({ page }) => {
  await page.goto('/')

  // 有数据:点击后列表渲染出来。
  await page.getByRole('button', { name: /加载用户|加载中/ }).click()
  await expect(page.getByText('林晚晴')).toBeVisible()
  await expect(page.getByText('lin.wanqing@example.com')).toBeVisible()
})

test('壳能力可演示:菜单命令有可见反馈', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('最近命令:（尚未触发）')).toBeVisible()

  await page.getByRole('button', { name: '切换深浅色' }).click()
  await expect(page.getByText('最近命令:view.toggle-theme')).toBeVisible()
})
