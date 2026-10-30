import { expect, test } from '@playwright/test'

// 模板原型的日常快检:加载首页、点击按钮、确认 dummy 用户进入列表。
// 更完整的响应式 / 壳能力断言归 tests/calibrate。
test('@area:app 加载 dummy 用户后渲染列表', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('示例原型')
  await page.getByRole('button', { name: '加载用户', exact: true }).click()
  await expect(page.locator('.user-list__name')).toHaveCount(3)
  await expect(page.locator('.user-list')).toContainText('林晚晴')
})
