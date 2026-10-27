import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { unlockDemoIdentity } from './identity-helpers'

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

async function openGate(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '解锁你的身份密钥', exact: true })).toBeVisible()
}

for (const width of [375, 768, 1280, 1600]) {
  test(`全屏身份 gate:构图、四个操作面与成功握手 @${width}`, async ({ page }, testInfo) => {
    const issues: string[] = []
    page.on('pageerror', (error) => issues.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') issues.push(message.text()) })
    page.on('requestfailed', (request) => issues.push(request.url()))
    page.on('response', (response) => { if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`) })
    await page.setViewportSize({ width, height: 900 })
    await openGate(page)
    const gate = page.getByTestId('identity-vault-dialog')
    const title = gate.locator('#identity-vault-title')
    const primary = gate.getByRole('button', { name: '使用 Passkey 解锁', exact: true })
    await expect(title).toBeFocused()
    await expect(title).toBeInViewport({ ratio: 1 })
    await expect(gate.locator('.identity-gate__hero')).toBeInViewport({ ratio: 1 })
    await expect(gate.locator('.identity-gate__footer')).toBeInViewport({ ratio: 1 })
    await expect(gate.locator('.identity-gate__fingerprint')).toBeInViewport({ ratio: 1 })
    expect(await primary.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
    expect(await gate.evaluate((element) => element.getBoundingClientRect().width)).toBe(width)
    await expect(gate).toHaveAttribute('aria-describedby', 'identity-gate-description')
    await expect(gate.getByTestId('reset-identity-confirm')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(gate).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({ path: testInfo.outputPath(`gate-idle-${width}.png`) })
    await primary.click()
    await expect(title).toHaveText('验证你的 Passkey')
    await expect(title).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath(`gate-passkey-${width}.png`) })
    await gate.getByRole('button', { name: '取消', exact: true }).click()
    await gate.getByRole('button', { name: '使用恢复密钥', exact: true }).click()
    await expect(gate.getByTestId('recovery-key-input')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`gate-recovery-${width}.png`) })
    await gate.getByRole('button', { name: '返回', exact: true }).click()
    await gate.getByRole('button', { name: '无法解锁？', exact: true }).click()
    await expect(gate.getByTestId('reset-identity-confirm')).toBeDisabled()
    await gate.getByRole('checkbox').check()
    await expect(gate.getByTestId('reset-identity-confirm')).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath(`gate-reset-${width}.png`) })
    await gate.getByRole('button', { name: '返回', exact: true }).click()
    expect(await gate.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
    await primary.click()
    await gate.getByTestId('mock-passkey-unlock').click()
    await expect(gate.getByTestId('mock-passkey-unlock')).toBeDisabled()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.getAttribute('data-testid'))).toBe('identity-vault-dialog')
    await expect(title).toHaveText('身份已解锁')
    await page.screenshot({ path: testInfo.outputPath(`gate-success-${width}.png`) })
    await expect(gate).toBeHidden()
    expect(issues).toEqual([])
  })
}

test('身份 gate:短视口滚动、焦点陷阱与重进后清空恢复步骤', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 520 })
  await openGate(page)
  const gate = page.getByTestId('identity-vault-dialog')
  await expect(gate.locator('.identity-gate__footer')).toBeInViewport({ ratio: 1 })
  await expect(gate.locator('.identity-gate__hero')).toBeInViewport({ ratio: 1 })
  await expect(gate.locator('#identity-vault-title')).toBeInViewport({ ratio: 1 })
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.getAttribute('data-testid'))).toBe('identity-vault-dialog')
  }
  await gate.getByRole('button', { name: '无法解锁？', exact: true }).click()
  await gate.getByRole('checkbox').check()
  await expect(gate.getByTestId('reset-identity-confirm')).toBeInViewport()
  await expect(gate.locator('.identity-gate__footer')).toBeInViewport({ ratio: 1 })
  await gate.getByRole('button', { name: '返回', exact: true }).click()
  await gate.getByRole('button', { name: '无法解锁？', exact: true }).click()
  await expect(gate.getByRole('checkbox')).not.toBeChecked()
  await gate.getByRole('button', { name: '返回', exact: true }).click()
  await unlockDemoIdentity(page)
  await page.locator('.account-menu__trigger').click()
  await page.getByRole('button', { name: '锁定身份', exact: true }).click()
  await expect(gate.getByRole('button', { name: '使用 Passkey 解锁', exact: true })).toBeVisible()
  await expect(gate.getByTestId('recovery-key-input')).toHaveCount(0)
})

test('身份 gate:读取失败可重试、无 Passkey 有恢复路径', async ({ page }, testInfo) => {
  // 只替换测试浏览器拿到的数据读取函数，不改变原型契约、数据层或 DOM。
  await page.route(/\/src\/api\/workspace\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    const body = source.replace(/export async function getIdentityVault\(\) \{[\s\S]*?\n\}/, `
      let gateReads = 0;
      export async function getIdentityVault() {
        await delay(900);
        gateReads += 1;
        if (gateReads === 1) return { ok: false, error: new Error('Simulated vault failure') };
        return { ok: true, value: { ...mockIdentityVault(), passkeys: [] } };
      }`)
    expect(body).not.toBe(source)
    await route.fulfill({ response, body })
  })
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const gate = page.getByTestId('identity-vault-dialog')
  await expect(gate.locator('#identity-vault-title')).toHaveText('正在读取身份…')
  await expect(gate.locator('.identity-gate__header')).toBeVisible()
  await expect(gate.locator('.identity-gate__footer')).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath('gate-loading-375.png') })
  await expect(gate.getByRole('alert')).toContainText('暂时无法读取身份')
  await page.screenshot({ path: testInfo.outputPath('gate-error-375.png') })
  await gate.getByRole('button', { name: '重试', exact: true }).click()
  await expect(gate).toContainText('尚未配置 Passkey')
  await expect(gate.getByRole('button', { name: '使用 Passkey 解锁', exact: true })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('gate-no-passkeys-375.png') })
  await gate.getByRole('button', { name: '使用恢复密钥', exact: true }).click()
  await gate.getByTestId('recovery-key-input').fill('MIA-DEMO-RECOVERY-2026')
  await gate.getByRole('button', { name: '解锁身份', exact: true }).click()
  await expect(gate).toBeHidden()
})

test('身份 gate:英文窄屏与深色最差纹理底对比度', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const gate = page.getByTestId('identity-vault-dialog')
  await expect(gate.getByRole('button', { name: 'Unlock with Passkey', exact: true })).toBeVisible()
  expect(await gate.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
  await expect(gate.locator('.identity-gate__footer')).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: testInfo.outputPath('gate-english-375.png') })
  const ratios = await gate.evaluate((element) => {
    const rgb = (value: string): number[] => value.match(/[\d.]+/g)?.map(Number).slice(0, 3) ?? []
    const background = rgb(getComputedStyle(element.querySelector('.identity-gate__surface') ?? element).backgroundColor)
    const primary = rgb(getComputedStyle(element.querySelector('h2') ?? element).color)
    const secondary = rgb(getComputedStyle(element.querySelector('.identity-gate__footer') ?? element).color)
    const button = element.querySelector('.identity-gate__primary') ?? element
    const accent = rgb(getComputedStyle(button).backgroundColor)
    const onAccent = rgb(getComputedStyle(button).color)
    // 两条网格与两道环全部叠加的上界；实际同心环不会相交，因此比真实最亮像素更保守。
    const opacity = 1 - (1 - 0.04) ** 2 * (1 - 0.08) ** 2
    const textured = background.map((channel, index) => channel * (1 - opacity) + (accent[index] ?? 0) * opacity)
    function luminance(color: number[]): number {
      const linear = color.map((channel) => channel / 255 <= 0.04045 ? channel / 255 / 12.92 : ((channel / 255 + 0.055) / 1.055) ** 2.4)
      return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722
    }
    function ratio(a: number[], b: number[]): number { return (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05) }
    return { primary: ratio(primary, textured), secondary: ratio(secondary, textured), button: ratio(onAccent, accent) }
  })
  for (const value of Object.values(ratios)) expect(value).toBeGreaterThanOrEqual(4.5)
  console.log('Gate contrast ratios', ratios)
})
