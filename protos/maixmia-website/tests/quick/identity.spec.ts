import { expect, test } from '@playwright/test'
import { unlockDemoIdentity } from '../calibrate/identity-helpers'

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
