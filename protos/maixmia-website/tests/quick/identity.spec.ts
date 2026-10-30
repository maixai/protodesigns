import { expect, test } from '@playwright/test'
import { unlockDemoIdentity } from '../calibrate/identity-helpers'
import { login, waitForWorkspace } from './helpers'

// 身份门的最小回归:锁定态可见、Passkey 解锁后进入工作台。
// 配对 / 信任变化 / Tooltip 的完整矩阵归 tests/calibrate/identity-pairing.spec.ts。
test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

test('@area:identity 解锁后进入工作台且身份门关闭', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const gate = page.getByTestId('identity-vault-dialog')
  await expect(gate).toBeVisible()
  await unlockDemoIdentity(page)
  await expect(gate).toBeHidden()
  await expect(page).toHaveURL(/#\/workspace$/)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
})

test('@area:identity 文件选择器取消不会关闭账户设置', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('[data-settings-section="accountSecurity"]').click()
  const dialog = page.locator('#workspace-account-security-dialog')
  await expect(dialog.locator('[data-account-profile]')).toBeVisible()
  // 原生 cancel 会冒泡到框体；它只应被文件输入拦住，不能关掉整个账户设置。
  await dialog.locator('[data-avatar-input]').evaluate((input) => input.dispatchEvent(new Event('cancel', { bubbles: true })))
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})
