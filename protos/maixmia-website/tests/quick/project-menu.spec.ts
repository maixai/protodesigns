import { expect, test } from '@playwright/test'
import { login, waitForWorkspace } from './helpers'

// 项目行 ⋯ 菜单的最小回归:打开、菜单项、Esc 关闭与焦点归还。
// 关闭项目后的窗口连带拆除与播报归 tests/calibrate/workspace.spec.ts。
test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

test('@area:project-menu 菜单打开、Esc 关闭并归还焦点', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const items = page.locator('.project-item')
  await expect(items).toHaveCount(2)
  const trigger = items.first().locator('.project-menu__trigger')
  await trigger.click()
  await expect(page.locator('.project-menu__item')).toHaveText(['关闭项目'])
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(page.locator('.project-menu__item')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(items).toHaveCount(2)
})
