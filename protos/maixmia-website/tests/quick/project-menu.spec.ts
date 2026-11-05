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
  await expect(tablist.getByRole('tab')).toHaveText(['模型', '权限', '插件', 'MCP'])
  await expect(tablist).toHaveAttribute('aria-orientation', 'horizontal')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('@area:project-menu 侧栏只保留项目导航,不再出现插件与 MCP 入口', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)

  await expect(page.locator('.workspace-projects')).toHaveAccessibleName('项目')
  await expect(page.locator('.workspace-projects [role="tablist"]')).toHaveCount(0)
  await expect(page.locator('.project-row__mcp')).toHaveCount(0)
  await expect(page.locator('#sidebar-view-tab-mcp')).toHaveCount(0)
})

test('@area:project-menu 项目行 ⋯ 在左 caret 在最右,并与 Agent 箭头对齐', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await login(page)
    await waitForWorkspace(page)
    if (width === 375) await page.getByRole('button', { name: '打开侧栏', exact: true }).first().click()
    const row = page.locator('.project-item').first()
    const menu = row.locator('.project-menu__trigger')
    const caret = row.locator('.project-row__toggle')
    const chevron = page.locator('.agent-context-switcher__chevron')
    const [menuBox, caretBox, chevronBox] = await Promise.all([menu.boundingBox(), caret.boundingBox(), chevron.boundingBox()])
    expect(menuBox).not.toBeNull()
    expect(caretBox).not.toBeNull()
    expect(chevronBox).not.toBeNull()
    if (menuBox !== null && caretBox !== null && chevronBox !== null) {
      // 纵向密集行档:命中区 28×28,满足 WCAG 2.5.8 的 24px 下限。
      expect(menuBox.width).toBeGreaterThanOrEqual(24)
      expect(menuBox.height).toBeGreaterThanOrEqual(24)
      expect(caretBox.width).toBeGreaterThanOrEqual(24)
      expect(caretBox.height).toBeGreaterThanOrEqual(24)
      // 两个命中区紧邻;中心距 28px,满足密集行的 24px 间距判据。
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(caretBox.x + 0.5)
      expect(caretBox.x + caretBox.width / 2 - (menuBox.x + menuBox.width / 2)).toBeGreaterThanOrEqual(24 - 0.5)
      // caret 图标与 Agent 行 chevron 的右缘对齐。
      expect(Math.abs(caretBox.x + caretBox.width - chevronBox.x - chevronBox.width), JSON.stringify({ width, caretBox, chevronBox })).toBeLessThanOrEqual(0.5)
      const caretIconBox = await row.locator('.project-row__caret').boundingBox()
      expect(caretIconBox).not.toBeNull()
      if (caretIconBox !== null) expect(Math.abs(caretIconBox.x + caretIconBox.width - chevronBox.x - chevronBox.width)).toBeLessThanOrEqual(0.5)
      // 悬停只提亮字形,不铺背景色块。
      await row.hover()
      await menu.hover()
      expect(await menu.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    }
  }
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

  // 横向标签栏:Right 切到下一个,焦点停留在 Tab 上,不自动跳进面板。
  await page.keyboard.press('ArrowRight')
  await expect(permissionTab).toBeFocused()
  await expect(permissionTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(modelTab).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page.locator('.project-item')).toHaveCount(2)
})
