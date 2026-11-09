import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { defaultDialogRect, DIALOG_HEIGHT_RATIO } from '../../src/data/window-geometry'

// 与共享窗体策略同源;窄屏 sheet 的宽度不再受内容等级上限约束。
export async function expectedDialogRect(dialog: Locator): Promise<ReturnType<typeof defaultDialogRect>> {
  const policy = await dialog.evaluate((element) => {
    const style = getComputedStyle(element)
    const token = (name: string): number => {
      const value = Number.parseFloat(style.getPropertyValue(name))
      if (!Number.isFinite(value)) throw new Error(`Missing dialog token: ${name}`)
      return value
    }
    return { box: { width: innerWidth, height: innerHeight }, margin: token('--workspace-dialog-margin'),
      narrow: innerWidth <= 768 || matchMedia('(pointer: coarse)').matches,
      maxWidth: token('--workspace-dialog-width-regular'), maxHeight: token('--workspace-dialog-max-height'),
      minWidth: token('--workspace-dialog-min-width'), minHeight: token('--workspace-dialog-min-height') }
  })
  const { narrow, ...rest } = policy
  return defaultDialogRect({ ...rest, maxWidth: narrow ? Number.POSITIVE_INFINITY : rest.maxWidth, heightRatio: DIALOG_HEIGHT_RATIO })
}

// 仅供明确要放弃草稿的用例使用,必须验证确认层而不是绕过遮挡或自动吞掉意外弹窗。
export async function discardAndCloseAgentSettings(page: Page, dialog: Locator): Promise<void> {
  await dialog.locator('.agent-editor__buttons > .dl-btn--ghost').click()
  const confirm = dialog.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await expect(confirm.getByRole('button', { name: /^(继续编辑|Keep editing)$/ })).toBeFocused()
  await confirm.getByRole('button', { name: /^(放弃更改并关闭|Discard changes and close)$/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.agent-editor__confirm[open]')).toHaveCount(0)
}
