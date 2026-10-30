import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { collectRuntimeIssues, login, waitForWorkspace } from './helpers'

const VALID_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const AVATAR_FILE = { name: 'agent.png', mimeType: 'image/png', buffer: VALID_PNG }
const AVATAR_URL = `data:image/png;base64,${VALID_PNG.toString('base64')}`

// Agent 设置的高价值回归:入口、两页签、脏状态保存、连接状态与实现同源。
// 完整键盘矩阵、几何与英文窄屏归 tests/calibrate/workspace.spec.ts。
test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

async function openAgentSettings(page: import('@playwright/test').Page) {
  await page.locator('.agent-context-switcher__trigger').click()
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Agent 设置', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

// 铅笔徽标常显;键盘聚焦仍需落到头像按钮并保留可见焦点。
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

test('@area:agent-settings 打开设置、切换页签并保存脏状态', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const dialog = await openAgentSettings(page)
  await expect(dialog.locator('.agent-editor__tabs').getByRole('tab')).toHaveCount(2)
  await expect(dialog.getByTestId('agent-editor-connection')).toHaveAccessibleName('在线')
  await dialog.getByRole('tab', { name: '基本', exact: true }).click()
  const save = dialog.getByRole('button', { name: '保存', exact: true })
  const state = dialog.locator('.agent-editor__save-state')
  await expect(state).toHaveText('无未保存的更改')
  await expect(save).toHaveAttribute('aria-disabled', 'true')
  await dialog.getByRole('textbox', { name: '名称' }).fill('规划官')
  await expect(state).toHaveText('有未保存的更改')
  await expect(save).not.toHaveAttribute('aria-disabled', 'true')
  await save.click()
  await expect(dialog).toBeVisible()
  await expect(save).toBeFocused()
  await expect(state).toContainText('已保存')
})

test('@area:agent-settings 头像草稿只在基本页预览，保存和移除同时更新头部及侧栏', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const issues = collectRuntimeIssues(page)
  await login(page)
  await waitForWorkspace(page)
  const dialog = await openAgentSettings(page)
  await dialog.getByRole('tab', { name: '基本', exact: true }).click()
  const avatar = dialog.getByTestId('agent-avatar-button')
  const sidebar = page.locator('.agent-context-switcher__trigger')
  await expect(avatar).toHaveText('规')
  await expect(dialog.getByRole('button', { name: '移除头像', exact: true })).toHaveCount(0)
  await dialog.getByTestId('agent-avatar-input').setInputFiles(AVATAR_FILE)
  await expect(avatar.locator('img')).toHaveAttribute('src', AVATAR_URL)
  await expect(dialog.locator('.agent-editor__save-state')).toHaveText('有未保存的更改')
  await expect(dialog.locator('.agent-editor__avatar-mark img')).toHaveCount(0)
  await expect(sidebar.locator('img')).toHaveCount(0)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.agent-editor__save-state')).toContainText('已保存')
  await expect(dialog.locator('.agent-editor__avatar-mark img')).toHaveAttribute('src', AVATAR_URL)
  await expect(sidebar.locator('img')).toHaveAttribute('src', AVATAR_URL)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await sidebar.click()
  await expect(page.locator('.agent-context-switcher__option[data-agent="planning"] img')).toHaveAttribute('src', AVATAR_URL)
  await expect(page.locator('.agent-context-switcher__option[data-agent="research"] img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click()
  await dialog.getByRole('tab', { name: '基本', exact: true }).click()
  await dialog.getByRole('button', { name: '移除头像', exact: true }).click()
  await expect(avatar.locator('img')).toHaveCount(0)
  await expect(dialog.locator('.agent-editor__save-state')).toHaveText('有未保存的更改')
  await expect(sidebar.locator('img')).toHaveAttribute('src', AVATAR_URL)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.agent-editor__save-state')).toContainText('已保存')
  await expect(sidebar.locator('img')).toHaveCount(0)
  await expect(sidebar.locator('.agent-context-switcher__mark')).toHaveText('规')
  await expect(dialog.locator('.agent-editor__avatar-mark')).toHaveText('规')
  expect(issues).toEqual([])
})

test('@area:agent-settings 取消、Esc 与遮罩关闭均丢弃头像草稿', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  for (const close of ['cancel', 'escape', 'backdrop']) {
    const dialog = await openAgentSettings(page)
    await dialog.getByRole('tab', { name: '基本', exact: true }).click()
    await expect(dialog.getByTestId('agent-avatar-button').locator('img')).toHaveCount(0)
    await expect(dialog.locator('.agent-editor__save-state')).toHaveText('无未保存的更改')
    await dialog.getByTestId('agent-avatar-input').setInputFiles(AVATAR_FILE)
    await expect(dialog.getByTestId('agent-avatar-button').locator('img')).toHaveAttribute('src', AVATAR_URL)
    if (close === 'cancel') await dialog.getByRole('button', { name: '取消', exact: true }).click()
    else if (close === 'escape') await page.keyboard.press('Escape')
    else await page.mouse.click(1, 1)
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.agent-context-switcher__trigger img')).toHaveCount(0)
  }
  const dialog = await openAgentSettings(page)
  await dialog.getByRole('tab', { name: '基本', exact: true }).click()
  await expect(dialog.getByTestId('agent-avatar-button').locator('img')).toHaveCount(0)
  await expect(dialog.locator('.agent-editor__save-state')).toHaveText('无未保存的更改')
})

test('@area:agent-settings 类型、大小与解码错误保留草稿，读取后还焦', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const dialog = await openAgentSettings(page)
  await dialog.getByRole('tab', { name: '基本', exact: true }).click()
  const avatar = dialog.getByTestId('agent-avatar-button')
  const pencil = avatar.locator('.agent-editor__avatar-pencil')
  await expect(pencil).toHaveCSS('opacity', '1')
  await avatar.hover()
  await expect(pencil).toHaveCSS('opacity', '1')
  await page.mouse.move(0, 0)
  await expect(pencil).toHaveCSS('opacity', '1')
  await tabTo(page, avatar)
  await expect(pencil).toHaveCSS('opacity', '1')
  // 文件选择器的原生弹层在无头环境偶发不触发，直接给隐藏输入喂文件；
  // 焦点先移开，才能验证读取完成后是否还焦到头像按钮。
  const input = dialog.getByTestId('agent-avatar-input')
  await dialog.getByRole('button', { name: '保存', exact: true }).focus()
  await input.setInputFiles(AVATAR_FILE)
  await expect(avatar.locator('img')).toHaveAttribute('src', AVATAR_URL)
  await expect(avatar).toBeFocused()
  await input.setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  await expect(dialog.getByRole('alert')).toHaveText('请选择 PNG、JPEG 或 WebP 图片。')
  await expect(avatar.locator('img')).toHaveAttribute('src', AVATAR_URL)
  await input.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
  await expect(dialog.getByRole('alert')).toHaveText('图片不能超过 5 MB，请选择较小的图片。')
  await expect(avatar.locator('img')).toHaveAttribute('src', AVATAR_URL)
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken image') })
  await expect(dialog.getByRole('alert')).toHaveText('无法读取这张图片，请重新选择。')
  await expect(avatar.locator('img')).toHaveAttribute('src', AVATAR_URL)
  await expect(avatar).toBeFocused()
  await expect(dialog.locator('.agent-editor__save-state')).toHaveText('有未保存的更改')
  await expect(page.locator('.agent-context-switcher__trigger img')).toHaveCount(0)
})

test('@area:agent-settings 紧凑资料区在四档宽度下不溢出，长名称先省略且徽标保留', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const dialog = await openAgentSettings(page)
  await dialog.getByRole('tab', { name: '基本', exact: true }).click()
  const avatar = dialog.getByTestId('agent-avatar-button')
  const nameInput = dialog.getByRole('textbox', { name: '名称', exact: true })
  await expect(avatar).toHaveCSS('width', '48px')
  await expect(avatar).toHaveCSS('height', '48px')
  await expect(nameInput).toHaveCSS('font-size', '15px')
  await expect(nameInput).toHaveCSS('font-weight', '500')
  await expect(dialog.getByRole('textbox', { name: '备注', exact: true })).toHaveCSS('font-size', '13px')
  await expect(dialog.locator('.agent-editor__profile-header label')).toHaveCount(2)
  await expect(dialog.locator('.agent-editor__profile-text')).toHaveCSS('border-top-width', '1px')
  await nameInput.fill('这是一个用于验证头像与连接状态和内置徽标共存的很长的规划助手名称')
  await dialog.getByTestId('agent-avatar-input').setInputFiles(AVATAR_FILE)
  await expect(dialog.getByTestId('agent-avatar-button').locator('img')).toHaveAttribute('src', AVATAR_URL)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.agent-editor__save-state')).toContainText('已保存')
  for (const width of [375, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(dialog.getByTestId('agent-avatar-button')).toBeVisible()
    await expect(dialog.locator('.agent-editor__badge')).toBeVisible()
    await expect(dialog.getByTestId('agent-editor-connection')).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bounds = await dialog.locator('.agent-editor__head').evaluate((element) => {
      const parent = element.getBoundingClientRect()
      return Array.from(element.querySelectorAll('.agent-editor__avatar-mark, .agent-editor__agent-name, .agent-editor__connection, .agent-editor__badge')).every((child) => {
        const box = child.getBoundingClientRect()
        return box.width > 0 && box.left >= parent.left && box.right <= parent.right
      })
    })
    expect(bounds).toBe(true)
    const profileBounds = await dialog.locator('.agent-editor__profile-header').evaluate((element) => {
      const parent = element.getBoundingClientRect()
      return Array.from(element.querySelectorAll('input, button, label')).every((child) => {
        const box = child.getBoundingClientRect()
        return box.width > 0 && box.left >= parent.left && box.right <= parent.right
      })
    })
    expect(profileBounds).toBe(true)
    await expect(dialog.getByRole('textbox', { name: '备注', exact: true })).toBeVisible()
    await expect(dialog.getByText('PNG、JPEG 或 WebP，不超过 5 MB。点击保存后生效。', { exact: true })).toHaveCount(0)
  }
})

test('@area:agent-settings 侧栏 Agent 状态与设置头部一致', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  await expect(page.locator('.agent-context-switcher__trigger')).toHaveAccessibleName(/规划助手.*在线/)
  const dialog = await openAgentSettings(page)
  await expect(dialog.getByTestId('agent-editor-connection')).toHaveAccessibleName('在线')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})
