import { expect, test } from '@playwright/test'
import { login, waitForWorkspace } from './helpers'

// 项目行 ⋯ 菜单的最小回归:只有「设置」+「关闭项目」两个一级项;
// 「设置」直接打开统一设置窗体,不再有子菜单。
test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

test('@area:project-menu ⋯ 菜单只有两个一级项,「设置」直接打开统一设置窗体', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const trigger = page.locator('.project-item').first().locator('.project-menu__trigger')

  await trigger.click()
  await expect(page.locator('.project-menu__item')).toHaveText(['设置', '关闭项目'])
  await expect(page.locator('.project-menu__submenu')).toHaveCount(0)
  await expect(page.locator('.project-menu__subitem')).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  const settings = page.getByRole('menuitem', { name: '项目设置：weekly-report', exact: true })
  await expect(settings).not.toHaveAttribute('aria-haspopup')
  await expect(settings).not.toHaveAttribute('aria-expanded')

  await settings.click()
  await expect(page.locator('.project-menu__item')).toHaveCount(0)

  const dialog = page.getByRole('dialog', { name: '项目设置 · weekly-report', exact: true })
  await expect(dialog).toBeVisible()
  const tablist = dialog.locator('.project-settings__tablist')
  await expect(tablist).toHaveCount(1)
  await expect(tablist.getByRole('tab')).toHaveText(['模型', '权限', 'MCP'])
  await expect(tablist).toHaveAttribute('aria-orientation', 'vertical')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('@area:project-menu 键盘从菜单进入设置窗体,Tab 间用方向键切换,Esc 关闭并归还焦点', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const trigger = page.locator('.project-item').first().locator('.project-menu__trigger')

  await trigger.focus()
  await page.keyboard.press('Enter')
  const settings = page.getByRole('menuitem', { name: '项目设置：weekly-report', exact: true })
  await expect(settings).toBeFocused()

  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: '项目设置 · weekly-report', exact: true })
  await expect(dialog).toBeVisible()
  const tablist = dialog.locator('.project-settings__tablist')
  const modelTab = tablist.getByRole('tab', { name: '模型', exact: true })
  const permissionTab = tablist.getByRole('tab', { name: '权限', exact: true })
  await expect(modelTab).toBeFocused()
  await expect(modelTab).toHaveAttribute('aria-selected', 'true')

  // 纵向 Tab:Down 切到下一个,焦点停留在 Tab 上,不自动跳进面板。
  await page.keyboard.press('ArrowDown')
  await expect(permissionTab).toBeFocused()
  await expect(permissionTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(modelTab).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.locator('.project-item')).toHaveCount(2)
})
