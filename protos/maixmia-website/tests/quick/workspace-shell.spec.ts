import { expect, test } from '@playwright/test'
import { collectRuntimeIssues, login, waitForWorkspace } from './helpers'

// 工作台外壳的高价值回归:登录可用、首屏就绪、窄屏不溢出。
// 这里只保留日常改动最常踩的三条断言;完整几何与像素归 tests/calibrate。
test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

test('@area:workspace 工作台首屏可用且无运行时错误', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await login(page)
  await waitForWorkspace(page)
  await expect(page.locator('.workspace-projects').getByRole('tab', { name: /^项目/ })).toHaveAttribute('aria-selected', 'true')
  expect(issues).toEqual([])
})

test('@area:workspace 375 宽度不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('@area:workspace 切换 Agent 后项目列表随之更换', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const projects = page.locator('.workspace-projects')
  await expect(projects).toContainText('weekly-report')
  await page.locator('.agent-context-switcher__trigger').click()
  await page.locator('.agent-context-switcher__panel .agent-context-switcher__option', { hasText: '研究助手' }).click()
  await expect(projects).toContainText('user-research')
  await expect(projects).not.toContainText('weekly-report')
})
