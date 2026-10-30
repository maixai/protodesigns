import { expect, test } from '@playwright/test'
import { login, waitForWorkspace } from './helpers'

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
