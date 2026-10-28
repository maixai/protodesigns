import { unlockDemoIdentity } from './identity-helpers'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

// 只通过真实 Tab 寻找入口,不调用 focus() 跳过键盘路径。
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (const attempt of Array.from({ length: 100 }, (_, index) => index)) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
    if (attempt === 99) await expect(target).toBeFocused()
  }
}

test('账户 disclosure:键盘可达、Esc 关闭、登出二次确认与还焦', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const header = page.locator('.site-header')
  const login = header.getByRole('button', { name: 'Sign in', exact: true })
  await tabTo(page, login)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/workspace$/)
  await unlockDemoIdentity(page)
  // 会话头 h1 = 当前会话任务名(activeId 默认 weekly),不再是固定的页面名。
  await expect(page.getByRole('heading', { level: 1, name: 'Turn project updates into an action plan', exact: true })).toBeVisible()
  await expect(header).toHaveCount(0)
  const account = page.locator('.workspace-dock__settings-trigger')
  await expect(account).toHaveAttribute('aria-label', 'Account and settings: 林一舟')
  await expect(page.locator('main.workspace-page')).toBeFocused()
  await tabTo(page, account)
  await page.keyboard.press('Enter')
  const panel = page.locator('#workspace-settings-panel')
  const security = panel.getByRole('button', { name: 'Account and security', exact: true })
  await expect(security).toBeFocused()
  await page.keyboard.press('End')
  const signOut = panel.getByRole('button', { name: 'Sign out', exact: true })
  await expect(signOut).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(security).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#workspace-settings-drawer-title')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(account).toBeFocused()
  await expect(account).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')
  await page.keyboard.press('End')
  await expect(signOut).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Sign out?', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: testInfo.outputPath('sign-out-confirm.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(signOut).toBeFocused()
  await expect(page).toHaveURL(/#\/workspace$/)
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await page.mouse.click(1, 1)
  await expect(dialog).not.toBeVisible()
  await expect(signOut).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).not.toHaveURL(/#/)
  await expect(login).toBeVisible()
  await expect(login).toBeFocused()
  await expect(account).toHaveCount(0)
})

test('工作台守卫、登录态首页重定向、登出与刷新即重置', async ({ page }) => {
  await page.goto('/#/workspace?s=error')
  await expect(page).not.toHaveURL(/#/)
  const header = page.locator('.site-header')
  await expect(header.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  await header.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/workspace$/)
  await unlockDemoIdentity(page)
  await page.evaluate(() => { window.location.hash = '' })
  await expect(page).toHaveURL(/#\/workspace$/)
  await expect(header).toHaveCount(0)
  await page.evaluate(() => { window.location.hash = '#quickstart' })
  await expect(page).toHaveURL(/#\/workspace$/)
  await expect(header).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(/#\/workspace$/)
  await expect(header).toHaveCount(0)
  await expect(page.getByTestId('identity-vault-dialog')).toBeHidden()
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('#workspace-settings-panel').getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('dialog', { name: 'Sign out?', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(header.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused()
  await page.reload()
  await expect(page).not.toHaveURL(/#/)
  await expect(header.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})

for (const width of [375, 768, 1280, 1600]) {
  test(`账户与工作台壳 @${width}:不溢出且无运行错误`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await unlockDemoIdentity(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Turn project updates into an action plan', exact: true })).toBeVisible()
    const account = page.locator('.workspace-dock__settings-trigger')
    await expect(page.locator('.workspace-dock__account-name')).toHaveCount(0)
    await account.hover()
    const tooltip = page.locator('.workspace-dock__settings-tooltip')
    await expect(tooltip).toBeVisible()
    await account.click()
    await expect(tooltip).toBeHidden()
    const group = page.locator('#workspace-settings-panel')
    await expect(group).toBeVisible()
    const dimensions = await account.boundingBox()
    expect(dimensions?.width).toBe(32)
    expect(dimensions?.height).toBe(32)
    const bounds = await group.boundingBox()
    expect(bounds?.x).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width)
    expect(await page.locator('html').evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath(`workspace-account-${width}.png`) })
    await expect(group.getByRole('heading', { name: 'Global settings', exact: true })).toHaveCount(0)
    await expect(group).not.toContainText('Identity unlocked')
    await page.keyboard.press('Escape')
    // 一级菜单仅选择入口；模态抽屉接管焦点，退出后归还头像。
    const drawerWidths = new Map<string, number>()
    for (const section of ['accountSecurity', 'languageRegion', 'shortcuts']) {
      await account.click()
      await group.locator(`[data-settings-section="${section}"]`).click()
      const drawer = page.locator('#workspace-settings-drawer')
      await expect(drawer.locator('#workspace-settings-drawer-title')).toBeFocused()
      await expect(group).toHaveCount(0)
      await expect(tooltip).toBeHidden()
      const bounds = await drawer.boundingBox()
      expect(bounds?.x).toBe(0)
      expect(bounds?.y).toBe(0)
      expect(bounds?.height).toBe(900)
      const expectedWidth = width <= 767 ? width : section === 'accountSecurity' ? Math.min(680, Math.max(600, width * 0.44)) : section === 'shortcuts' ? Math.min(600, Math.max(520, width * 0.38)) : Math.min(520, Math.max(440, width * 0.32))
      expect(bounds?.width).toBe(expectedWidth)
      drawerWidths.set(section, bounds?.width ?? 0)
      expect(await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      const controls = await drawer.locator('button:visible, label').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
      expect(controls.every((height) => height >= 44)).toBe(true)
      if (section === 'accountSecurity') {
        await expect(drawer.locator('[data-settings-passkeys] li')).toHaveCount(3)
        await expect(drawer).not.toContainText(/Identity unlocked|身份已解锁/)
        await expect(drawer.getByRole('button', { name: /Manage identity|Lock/ })).toHaveCount(0)
      }
      if (section === 'shortcuts') await expect(drawer.locator('[data-settings-shortcuts] kbd')).toHaveCount(8)
      await page.screenshot({ path: testInfo.outputPath(`settings-${section}-${width}.png`) })
      if (section === 'shortcuts') await drawer.locator('[data-settings-close]').click()
      else await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      await expect(account).toBeFocused()
    }
    if (width > 767) expect(drawerWidths.get('accountSecurity') ?? 0).toBeGreaterThan(drawerWidths.get('languageRegion') ?? Number.POSITIVE_INFINITY)
    expect(errors).toEqual([])
  })
}


test('账户抽屉:读取中、失败重试、无 Passkey 与遮罩关闭', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  // 测试替换 API 返回值，不修改契约与运行时 DOM；首次 gate 读取仍走原始数据。
  await page.route(/\/src\/api\/workspace\.ts(?:\?.*)?$/, async (route) => {
    const response = await route.fetch()
    const source = await response.text()
    const body = source.replace(/export async function getIdentityVault\(\) \{[\s\S]*?\n\}/, `
      let settingsReads = 0;
      export async function getIdentityVault() {
        await delay(600);
        settingsReads += 1;
        if (settingsReads === 2) return { ok: false, error: new Error('Simulated settings failure') };
        return { ok: true, value: { ...mockIdentityVault(), ...(settingsReads > 2 ? { passkeys: [] } : {}) } };
      }`)
    expect(body).not.toBe(source)
    await route.fulfill({ response, body })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await unlockDemoIdentity(page)
  const trigger = page.locator('.workspace-dock__settings-trigger')
  await trigger.click()
  await page.locator('[data-settings-section="accountSecurity"]').click()
  const drawer = page.locator('#workspace-settings-drawer')
  await expect(drawer.getByRole('status')).toHaveText('Loading identity information…')
  await page.screenshot({ path: testInfo.outputPath('settings-loading.png') })
  await expect(drawer.getByRole('alert')).toContainText('Unable to load identity information')
  await page.screenshot({ path: testInfo.outputPath('settings-error.png') })
  await drawer.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(drawer.getByRole('status')).toBeVisible()
  await expect(drawer).toContainText('No Passkeys yet')
  await expect(drawer).not.toContainText('Identity unlocked')
  await page.screenshot({ path: testInfo.outputPath('settings-empty.png') })
  await page.mouse.click(800, 400)
  await expect(drawer).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('未登录裸片段保留原生锚点语义；已登录刷新清空内存会话', async ({ page }) => {
  await page.goto('/#quickstart')
  await expect(page).toHaveURL(/#quickstart$/)
  await expect(page.locator('.site-header')).toBeVisible()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/#\/workspace$/)
  await unlockDemoIdentity(page)
  await page.reload()
  await expect(page).not.toHaveURL(/#/)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})


for (const sample of [
  { name: 'client hints Apple', clientPlatform: 'macOS', platform: 'Win32', agent: '', modifier: '⌘' },
  { name: 'platform Apple fallback', clientPlatform: undefined, platform: 'MacIntel', agent: '', modifier: '⌘' },
  { name: 'platform Windows fallback', clientPlatform: undefined, platform: 'Win32', agent: '', modifier: 'Ctrl' },
  { name: 'user agent fallback', clientPlatform: undefined, platform: undefined, agent: 'iPad', modifier: '⌘' },
  { name: 'unknown platform', clientPlatform: undefined, platform: '', agent: '', modifier: 'Ctrl/Cmd' },
]) {
  test(`快捷键平台修饰键: ${sample.name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(({ clientPlatform, platform, agent }) => {
      Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: clientPlatform === undefined ? undefined : { platform: clientPlatform } })
      Object.defineProperty(navigator, 'platform', { configurable: true, value: platform })
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: agent })
    }, sample)
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await unlockDemoIdentity(page)
    await page.locator('.workspace-dock__settings-trigger').click()
    await page.locator('[data-settings-section="shortcuts"]').click()
    const shortcuts = page.locator('[data-settings-shortcuts]')
    await expect(shortcuts.locator('kbd')).toHaveCount(8)
    await expect(shortcuts.locator('kbd').first()).toHaveText(`${sample.modifier}+K`)
    if (sample.modifier !== 'Ctrl/Cmd') {
      await expect(shortcuts).not.toContainText('Ctrl/Cmd')
      await expect(shortcuts.locator('p').first()).toContainText(`Use ${sample.modifier} as the modifier key`)
    }
  })
}


for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`设置菜单动效与降级: ${reducedMotion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion === 'reduce' ? 'reduce' : 'no-preference' })
    await page.addInitScript(() => {
      document.addEventListener('transitionrun', (event) => {
        if (event.target instanceof HTMLElement && event.target.id === 'workspace-settings-panel') {
          performance.mark(`settings-transition-${event.propertyName}`)
        }
      })
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await unlockDemoIdentity(page)
    const trigger = page.locator('.workspace-dock__settings-trigger')
    await trigger.click()
    const panel = page.locator('#workspace-settings-panel')
    await expect(panel).toBeVisible()
    await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).transform)).toBe('none')
    const properties = await page.evaluate(() => performance.getEntriesByType('mark').map((entry) => entry.name).filter((name) => name.startsWith('settings-transition-')))
    if (reducedMotion === 'reduce') expect(properties).toEqual([])
    else expect(properties.sort()).toEqual(['settings-transition-opacity', 'settings-transition-transform'])
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
}
