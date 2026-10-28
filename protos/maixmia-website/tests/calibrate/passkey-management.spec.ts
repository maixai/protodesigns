import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { IdentityVault, PasskeySummary } from '../../src/contracts/generated/identity-vault'
import type { DeviceUnlockCapability } from '../../src/contracts/generated/device-unlock-capability'
import { unlockDemoIdentity } from './identity-helpers'

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

function passkey(id: string, canUnlock = true, isThisDevice = false, recoveryConfigured = true): PasskeySummary {
  return { id, label: `测试 Passkey · ${id}`, createdAt: '2026-10-01T08:00:00Z', lastUsedAt: '2026-10-20T08:00:00Z', prfSupported: canUnlock, canUnlock, backupEligible: canUnlock, isThisDevice }
}
function vaultWith(passkeys: PasskeySummary[], recoveryConfigured = true): IdentityVault {
  return { state: 'locked', publicKey: 'mock-user-public-key:v1', fingerprint: 'DEMO 0075 0120 01BF 0279 02E1 03D7 043F 0530', keyVersion: 1, passkeys, unlockMethods: [...(passkeys.some((item) => item.canUnlock) ? ['passkey' as const] : []), ...(recoveryConfigured ? ['recoveryKey' as const] : [])], recoveryKeyConfigured: recoveryConfigured, lastUnlockedAt: '' }
}
async function mockIdentity(page: Page, vault: IdentityVault, capability: DeviceUnlockCapability): Promise<void> {
  await page.route(/\/src\/api\/workspace\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    const withVault = source.replace(/export async function getIdentityVault\(\) \{[\s\S]*?\n\}/, `export async function getIdentityVault() { await delay(200); return { ok: true, value: ${JSON.stringify(vault)} }; }`)
    const withCapability = withVault.replace(/export async function getDeviceUnlockCapability\(\) \{[\s\S]*?\n\}/, `export async function getDeviceUnlockCapability() { await delay(200); return { ok: true, value: ${JSON.stringify(capability)} }; }`)
    const body = withCapability.replace(/export async function removePasskey\([^)]*\)\s*\{[\s\S]*?\n\}/, `export async function removePasskey(id) { await delay(200); const next = ${JSON.stringify(vault)}; next.passkeys = next.passkeys.filter((item) => item.id !== id); next.unlockMethods = next.recoveryKeyConfigured ? ['recoveryKey'] : []; return { ok: true, value: next }; }`)
    expect(body).not.toBe(source)
    await route.fulfill({ response, body })
  })
}
async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await unlockDemoIdentity(page)
}
async function openAccount(page: Page) {
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('[data-settings-section="accountSecurity"]').click()
  const drawer = page.locator('#workspace-settings-drawer')
  await expect(drawer.locator('[data-settings-passkeys]')).toBeVisible()
  return drawer
}

test('Passkeys:三行清单、添加不改变身份与 Agent 信任', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  const drawer = await openAccount(page)
  const rows = drawer.locator('[data-settings-passkeys] > li')
  await expect(rows).toHaveCount(3)
  await expect(rows.first()).toContainText('当前设备')
  await expect(rows.first()).toContainText('可解锁')
  await expect(rows.first()).toContainText('已同步')
  await expect(rows.last()).toContainText('仅登录')
  await expect(rows.last()).toContainText('可以登录，不能解锁身份密钥')
  await expect(rows.first().locator('time').first()).not.toContainText(/\d{4}-\d{2}-\d{2}T/)
  const fingerprint = await drawer.locator('[data-public-fingerprint]').textContent() ?? ''
  const publicKey = drawer.locator('[data-public-key]')
  await publicKey.locator('summary').click()
  await expect(publicKey.locator('[data-public-fingerprint]')).toContainText('DEMO')
  await page.screenshot({ path: testInfo.outputPath('passkeys-list-1280.png') })
  await drawer.locator('[data-add-passkey]').click()
  await expect(drawer.locator('[data-add-passkey-flow] h4')).toBeFocused()
  await drawer.getByRole('button', { name: '创建 Passkey', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('passkey-add-verify-1280.png') })
  await drawer.locator('[data-settings-add-passkey-confirm]').click()
  await expect(drawer.getByRole('heading', { name: 'Passkey 已添加', exact: true })).toBeFocused()
  await expect(drawer.locator('[data-settings-passkeys] > li')).toHaveCount(4)
  await expect(drawer.locator('[data-public-fingerprint]')).toHaveText(fingerprint)
  await expect(publicKey.locator('summary')).toContainText('v1')
  await drawer.getByRole('button', { name: '完成', exact: true }).click()
  await expect(drawer.locator('[data-add-passkey]')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.locator('.agent-context-switcher__trigger').click()
  await page.getByRole('button', { name: 'Agent 设置', exact: true }).click()
  await page.getByRole('tab', { name: '安全', exact: true }).click()
  await expect(page.getByTestId('agent-identity-security').locator('.security-hero')).toHaveAttribute('data-state', 'trusted')
})

test('Passkey 移除:普通确认与状态提示，身份版本不变', async ({ page }, testInfo) => {
  await login(page)
  const drawer = await openAccount(page)
  const row = drawer.locator('[data-passkey-id="passkey-work"]')
  await row.getByRole('button', { name: 'Chrome · 工作电脑 的操作', exact: true }).click()
  await drawer.getByRole('button', { name: '移除 Passkey', exact: true }).click()
  const dialog = drawer.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await expect(dialog).toContainText('已配对的 Agent 不受影响')
  await page.screenshot({ path: testInfo.outputPath('passkey-remove-1280.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Chrome · 工作电脑 的操作', exact: true })).toBeFocused()
  await row.getByRole('button', { name: 'Chrome · 工作电脑 的操作', exact: true }).click()
  await drawer.getByRole('button', { name: '移除 Passkey', exact: true }).click()
  await dialog.locator('[data-remove-passkey-confirm]').click()
  await expect(drawer.locator('[data-settings-passkeys] > li')).toHaveCount(2)
  await expect(drawer.getByRole('status')).toContainText('Passkey 已移除')
  await expect(drawer.getByRole('status')).toContainText('密码管理器')
  await expect(drawer.locator('[data-public-key] summary')).toContainText('v1')
})

test('Passkey 移除:最后一把但有恢复密钥时警告并允许', async ({ page }) => {
  const vault = vaultWith([passkey('only', true, true)], true)
  await mockIdentity(page, vault, { prfAvailable: true, localPasskeyCount: 1, canUseRecoveryKey: true, canRequestDeviceTransfer: false })
  await login(page)
  const drawer = await openAccount(page)
  await drawer.locator('[data-passkey-id="only"]').getByRole('button').click()
  await drawer.getByRole('button', { name: '移除 Passkey', exact: true }).click()
  const dialog = drawer.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('只能使用恢复密钥')
  await dialog.locator('[data-remove-passkey-confirm]').click()
  await expect(drawer).toContainText('还没有 Passkey')
  await expect(drawer.locator('[data-public-key] summary')).toContainText('v1')
})

test('Passkey 移除:最后一个解锁因子被阻止', async ({ page }) => {
  const vault = vaultWith([passkey('last', true, true)], false)
  await mockIdentity(page, vault, { prfAvailable: true, localPasskeyCount: 1, canUseRecoveryKey: false, canRequestDeviceTransfer: false })
  await login(page)
  const drawer = await openAccount(page)
  await drawer.locator('[data-passkey-id="last"]').getByRole('button').click()
  await drawer.getByRole('button', { name: '移除 Passkey', exact: true }).click()
  const dialog = drawer.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('这是最后一个解锁方式')
  await expect(dialog.locator('[data-remove-passkey-confirm]')).toHaveCount(0)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(drawer.locator('[data-settings-passkeys] > li')).toHaveCount(1)
})

test('恢复密钥:新鲜 UV、一次性展示、复制下载及旧密钥失效', async ({ page }, testInfo) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await login(page)
  const drawer = await openAccount(page)
  await drawer.locator('[data-recovery-generate]').click()
  await expect(drawer.locator('[data-settings-recovery-confirm]')).toBeVisible()
  await drawer.locator('[data-settings-recovery-confirm]').click()
  const reveal = drawer.locator('[data-recovery-reveal]')
  await expect(reveal).toBeVisible()
  const first = (await reveal.locator('[data-recovery-key]').innerText()).replaceAll(' · ', '-')
  expect(first).toBe('MIA-DEMO-RECOVERY-2026-01')
  await reveal.getByRole('button', { name: '复制', exact: true }).click()
  await expect(drawer.getByRole('status')).toContainText('已复制')
  const downloaded = page.waitForEvent('download')
  await reveal.locator('[data-download-recovery]').click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('mia-recovery-key.txt')
  await page.screenshot({ path: testInfo.outputPath('recovery-reveal-1280.png') })
  await reveal.getByRole('button', { name: '完成', exact: true }).click()
  await expect(drawer.locator('[data-recovery-key]')).toHaveCount(0)
  await drawer.locator('[data-recovery-generate]').click()
  await drawer.locator('[data-settings-recovery-confirm]').click()
  await expect(drawer.locator('[data-recovery-key]')).not.toHaveText(first.split('-').join(' · '))
  await page.keyboard.press('Escape')
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('#workspace-settings-panel').getByRole('button', { name: '锁定控制台', exact: true }).click()
  const gate = page.getByTestId('identity-vault-dialog')
  await gate.getByRole('button', { name: '使用恢复密钥', exact: true }).click()
  await gate.getByTestId('recovery-key-input').fill(first)
  await gate.getByRole('button', { name: '解锁身份', exact: true }).click()
  await expect(gate.getByRole('alert')).toContainText('恢复密钥不正确')
  await gate.getByTestId('recovery-key-input').fill('MIA-DEMO-RECOVERY-2026-02')
  await gate.getByRole('button', { name: '解锁身份', exact: true }).click()
  await expect(gate).toBeHidden()
})

test('设备不支持 PRF 时添加流程明确阻塞', async ({ page }) => {
  await mockIdentity(page, vaultWith([passkey('local', true, true)]), { prfAvailable: false, localPasskeyCount: 0, canUseRecoveryKey: true, canRequestDeviceTransfer: false })
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const gate = page.getByTestId('identity-vault-dialog')
  await gate.getByRole('button', { name: '使用恢复密钥', exact: true }).click()
  await gate.getByTestId('recovery-key-input').fill('MIA-DEMO-RECOVERY-2026')
  await gate.getByRole('button', { name: '解锁身份', exact: true }).click()
  await expect(gate).toBeHidden()
  const drawer = await openAccount(page)
  await drawer.locator('[data-add-passkey]').click()
  await expect(drawer.getByRole('alert')).toContainText('这台设备不支持 Passkey 解锁')
  await expect(drawer.getByRole('button', { name: '创建 Passkey', exact: true })).toHaveCount(0)
  await expect(drawer.locator('[data-settings-passkeys] > li')).toHaveCount(1)
})
