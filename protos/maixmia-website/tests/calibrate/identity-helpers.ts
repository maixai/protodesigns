import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export async function unlockDemoIdentity(page: Page): Promise<void> {
  const gate = page.getByTestId('identity-vault-dialog')
  await expect(gate).toBeVisible()
  await gate.getByRole('button', { name: /使用 Passkey 解锁|Unlock with Passkey/, exact: true }).click()
  await gate.getByTestId('mock-passkey-unlock').click()
  await expect(gate).toBeHidden()
}

// 仅使用界面完成 Agent 本机确认,不直接写 mock 或绕过安全码校验。
export async function pairDemoAgent(page: Page, name = '发布助手', note = '', isEnglish = false, manual = false): Promise<void> {
  const dialog = page.getByTestId('agent-pairing-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: isEnglish ? 'No running agent? Open the simulated agent' : '没有正在运行的 Agent？打开模拟 Agent 端', exact: true }).click()
  const panel = page.getByTestId('mock-agent-panel')
  await panel.getByRole('button', { name: isEnglish ? 'Generate pairing invitation' : '生成配对邀请', exact: true }).click()
  await expect(panel.getByTestId('mock-agent-code')).toHaveValue(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/)
  if (manual) {
    const code = await panel.getByTestId('mock-agent-code').inputValue()
    await dialog.getByTestId('pairing-code-input').fill(code.toLowerCase())
    await expect(dialog.getByTestId('pairing-code-input')).toHaveValue(code)
    await dialog.getByRole('button', { name: isEnglish ? 'Find agent' : '查找 Agent', exact: true }).click()
  } else await panel.getByTestId('mock-agent-open-link').click()
  await expect(dialog.getByTestId('pairing-safety-code')).toHaveText(await panel.locator('.identity-code').innerText())
  await dialog.getByRole('checkbox', { name: isEnglish ? 'The safety codes match' : '安全码一致', exact: true }).check()
  await dialog.getByRole('button', { name: isEnglish ? 'Confirm and add with Passkey' : '用 Passkey 确认并添加', exact: true }).click()
  await dialog.getByTestId('mock-pairing-passkey').click()
  await panel.getByTestId('mock-agent-allow').click()
  await expect(dialog.getByTestId('pairing-name')).toHaveValue('我的 Mia Agent')
  await dialog.getByTestId('pairing-name').fill(name)
  await dialog.getByRole('textbox', { name: isEnglish ? 'Note (optional)' : '备注（可选）', exact: true }).fill(note)
  await expect(dialog.getByTestId('pairing-name')).toHaveValue(name)
  await dialog.getByRole('button', { name: isEnglish ? 'Finish' : '完成', exact: true }).click()
  await expect(dialog).toBeHidden()
}
