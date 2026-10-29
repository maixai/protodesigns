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

async function openAccountDialog(page: Page): Promise<Locator> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await unlockDemoIdentity(page)
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('[data-settings-section="accountSecurity"]').click()
  const dialog = page.locator('#workspace-account-security-dialog')
  await expect(dialog.locator('[data-account-profile]')).toBeVisible()
  return dialog
}

const VALID_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

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
  await expect(page.locator('#workspace-account-security-title')).toBeFocused()
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
    // 一级菜单仅选择入口；账户走中央窗体，快捷键继续走左侧抽屉。
    const surfaceWidths = new Map<string, number>()
    for (const section of ['accountSecurity', 'shortcuts']) {
      await account.click()
      await group.locator(`[data-settings-section="${section}"]`).click()
      await expect(group).toHaveCount(0)
      await expect(tooltip).toBeHidden()
      if (section === 'accountSecurity') {
        const dialog = page.locator('#workspace-account-security-dialog')
        await expect(dialog.locator('#workspace-account-security-title')).toBeFocused()
        const bounds = await dialog.boundingBox()
        const expectedWidth = Math.min(720, width - 48)
        const expectedHeight = 720
        expect(bounds?.width).toBe(expectedWidth)
        expect(bounds?.height).toBe(expectedHeight)
        expect(bounds?.x).toBeGreaterThanOrEqual(0)
        expect(bounds?.y).toBeGreaterThanOrEqual(0)
        expect((bounds?.x ?? 0) + expectedWidth).toBeLessThanOrEqual(width)
        expect((bounds?.y ?? 0) + expectedHeight).toBeLessThanOrEqual(900)
        surfaceWidths.set(section, bounds?.width ?? 0)
        expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
        await expect(dialog.locator('.account-security__tabs').getByRole('tab')).toHaveText(['Account', 'Identity security'])
        await expect(dialog.locator('[data-account-profile]')).toContainText('林一舟')
        await expect(dialog.locator('[data-security-posture]')).toBeHidden()
        const publicKeyRow = dialog.locator('[data-public-key]')
        expect(await publicKeyRow.evaluate((element) => element.previousElementSibling?.textContent)).toContain('Identity status')
        const fingerprint = publicKeyRow.locator('[data-public-fingerprint]')
        await expect(fingerprint).toContainText('DEMO')
        expect(await fingerprint.getAttribute('title')).toBe(await fingerprint.textContent())
        const fingerprintStyle = await fingerprint.evaluate((element) => ({ whiteSpace: getComputedStyle(element).whiteSpace, textOverflow: getComputedStyle(element).textOverflow }))
        expect(fingerprintStyle).toEqual({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' })
        await expect(publicKeyRow.locator('.account-security__key-version')).toHaveText('v1')
        await expect(publicKeyRow.locator('[data-copy-public-key]')).toHaveAttribute('aria-label', 'Copy full identity public key fingerprint')
        await dialog.getByRole('tab', { name: 'Identity security', exact: true }).click()
        await expect(dialog.locator('[data-settings-passkeys] li')).toHaveCount(3)
        await expect(dialog.locator('[data-security-posture]')).toContainText('2 unlock methods')
        await expect(dialog.locator('[data-public-key]')).toBeHidden()
        await expect(dialog.locator('#workspace-account-security-section-panel-passkeys')).toContainText('without changing its public key')
        await expect(dialog.locator('#workspace-account-security-section-panel-passkeys')).toContainText('never requires paired agents to pair again')
        const controls = await dialog.locator('button:visible').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
        expect(controls.every((height) => height >= 36)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`settings-${section}-${width}.png`) })
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
      } else {
        const drawer = page.locator('#workspace-settings-drawer')
        await expect(drawer.locator('#workspace-settings-drawer-title')).toBeFocused()
        const bounds = await drawer.boundingBox()
        expect(bounds?.x).toBe(0)
        expect(bounds?.y).toBe(0)
        expect(bounds?.height).toBe(900)
        const expectedWidth = width <= 767 ? width : Math.min(600, Math.max(520, width * 0.38))
        expect(bounds?.width).toBe(expectedWidth)
        surfaceWidths.set(section, bounds?.width ?? 0)
        expect(await drawer.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
        const controls = await drawer.locator('button:visible, label').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
        expect(controls.every((height) => height >= 44)).toBe(true)
        await expect(drawer.locator('[data-settings-shortcuts] kbd')).toHaveCount(8)
        await page.screenshot({ path: testInfo.outputPath(`settings-${section}-${width}.png`) })
        await drawer.locator('[data-settings-close]').click()
        await expect(drawer).toHaveCount(0)
      }
      await expect(account).toBeFocused()
    }
    if (width > 767) expect(surfaceWidths.get('accountSecurity') ?? 0).toBeGreaterThan(surfaceWidths.get('shortcuts') ?? Number.POSITIVE_INFINITY)
    expect(errors).toEqual([])
  })
}


test('账户窗体:读取中、失败重试、空态与遮罩关闭', async ({ page }, testInfo) => {
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
  const dialog = page.locator('#workspace-account-security-dialog')
  await expect(dialog.getByRole('status')).toHaveText('Loading identity information…')
  await expect(dialog.locator('.account-security__tabs').getByRole('tab')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('settings-loading.png') })
  await expect(dialog.getByRole('alert')).toContainText('Unable to load identity information')
  await expect(dialog.locator('.account-security__tabs').getByRole('tab')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('settings-error.png') })
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(dialog.getByRole('status')).toBeVisible()
  await expect(dialog.locator('.account-security__tabs').getByRole('tab')).toHaveCount(2)
  await dialog.getByRole('tab', { name: 'Identity security', exact: true }).click()
  await expect(dialog).toContainText('No Passkeys yet')
  await expect(dialog.locator('[data-security-posture]')).toContainText('2 unlock methods')
  await page.screenshot({ path: testInfo.outputPath('settings-empty.png') })
  await page.mouse.click(4, 4)
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('账户与 Agent 窗体:共享几何、下划线一级 tab 与内容左缘', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const dialog = await openAccountDialog(page)
  await expect(dialog.locator('.account-security__eyebrow')).toHaveCount(0)
  await expect(dialog.locator('.account-security__posture')).toBeHidden()
  await expect(dialog.locator('[data-account-security-close]')).toBeVisible()
  const account = await dialog.evaluate((element) => {
    const style = getComputedStyle(element)
    const firstTab = element.querySelector('.account-security__tabs button')
    const content = element.querySelector('[data-account-profile-row]')
    const selected = element.querySelector('.account-security__tabs [aria-selected="true"]')
    if (!(firstTab instanceof HTMLElement) || !(content instanceof HTMLElement) || !(selected instanceof HTMLElement)) throw new Error('Missing account dialog geometry')
    const tabStyle = getComputedStyle(firstTab)
    const selectedStyle = getComputedStyle(selected)
    return {
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      padding: style.padding,
      colorScheme: style.colorScheme,
      contentLeft: content.getBoundingClientRect().left,
      firstTabTextLeft: firstTab.getBoundingClientRect().left + Number.parseFloat(tabStyle.paddingLeft),
      selectedBackground: selectedStyle.backgroundColor,
      selectedBorder: selectedStyle.borderBottomColor,
    }
  })
  expect(account.width).toBe(720)
  expect(account.height).toBe(720)
  expect(account.padding).toBe('24px')
  expect(account.colorScheme).toBe('dark')
  expect(account.firstTabTextLeft).toBeCloseTo(account.contentLeft, 0)
  expect(account.selectedBackground).toBe('rgba(0, 0, 0, 0)')
  expect(account.selectedBorder).not.toBe('rgba(0, 0, 0, 0)')
  await page.keyboard.press('Escape')
  await page.locator('.agent-context-switcher__trigger').click()
  await page.getByRole('button', { name: 'Agent settings', exact: true }).click()
  const agentDialog = page.locator('.agent-editor')
  await expect(agentDialog).toBeVisible()
  const agent = await agentDialog.evaluate((element) => {
    const style = getComputedStyle(element)
    const firstTab = element.querySelector('.agent-editor__tabs button')
    const content = element.querySelector('.agent-editor__panel--model')
    if (!(firstTab instanceof HTMLElement) || !(content instanceof HTMLElement)) throw new Error('Missing agent dialog geometry')
    const tabStyle = getComputedStyle(firstTab)
    return {
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      padding: style.padding,
      colorScheme: style.colorScheme,
      contentLeft: content.getBoundingClientRect().left,
      firstTabTextLeft: firstTab.getBoundingClientRect().left + Number.parseFloat(tabStyle.paddingLeft),
    }
  })
  expect(agent.width).toBe(account.width)
  expect(agent.height).toBe(account.height)
  expect(agent.padding).toBe(account.padding)
  expect(agent.colorScheme).toBe(account.colorScheme)
  expect(agent.firstTabTextLeft).toBeCloseTo(agent.contentLeft, 0)
  await expect(agentDialog.locator('[data-account-security-close]')).toHaveCount(0)
  await expect(agentDialog.locator('.agent-editor__actions')).toBeVisible()
})

test('账户资料:资料行居首、深色三档表面与邮箱排版不降级', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const dialog = await openAccountDialog(page)
  const profile = dialog.locator('[data-account-profile]')
  const row = profile.locator('[data-account-profile-row]')
  expect(await row.evaluate((element) => element.previousElementSibling?.querySelector('h3')?.textContent)).toBe('Account profile')
  await expect(profile.locator('#workspace-account-profile-hint')).toContainText('You can change your avatar; your name and email cannot be edited.')
  await expect(profile.locator('#workspace-account-profile-hint')).not.toContainText('read-only')
  const email = profile.locator('.account-security__email')
  const emailStyle = await email.evaluate((element) => {
    const style = getComputedStyle(element)
    return { fontFamily: style.fontFamily, overflowWrap: style.overflowWrap, textOverflow: style.textOverflow }
  })
  expect(emailStyle.fontFamily).toContain('mono')
  expect(emailStyle.overflowWrap).toBe('anywhere')
  expect(emailStyle.textOverflow).not.toBe('ellipsis')
  const before = await row.evaluate((element) => getComputedStyle(element).backgroundColor)
  await dialog.locator('[data-avatar-button]').hover()
  await expect(dialog.locator('[data-avatar-badge]')).toHaveCSS('opacity', '1')
  const sampled = await dialog.evaluate((element) => {
    const rowElement = element.querySelector('[data-account-profile-row]')
    const button = element.querySelector('[data-avatar-button]')
    const badge = element.querySelector('[data-avatar-badge]')
    if (!(rowElement instanceof HTMLElement) || !(button instanceof HTMLElement) || !(badge instanceof HTMLElement)) throw new Error('Missing profile surfaces')
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (context === null) throw new Error('Canvas unavailable')
    const rgb = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3))
    }
    const luminance = (color: string): number => {
      const channels = rgb(color).map((channel) => {
        const value = channel / 255
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
    }
    const badgeStyle = getComputedStyle(badge)
    const badgeText = luminance(badgeStyle.color)
    const badgeSurface = luminance(badgeStyle.backgroundColor)
    return {
      window: luminance(getComputedStyle(element).backgroundColor),
      row: luminance(getComputedStyle(rowElement).backgroundColor),
      hover: luminance(getComputedStyle(button).backgroundColor),
      rowAfterHover: getComputedStyle(rowElement).backgroundColor,
      badgeOpacity: badgeStyle.opacity,
      badgeContrast: (Math.max(badgeText, badgeSurface) + 0.05) / (Math.min(badgeText, badgeSurface) + 0.05),
    }
  })
  expect(sampled.row).toBeGreaterThan(sampled.window)
  expect(sampled.hover).toBeGreaterThan(sampled.row)
  expect(sampled.rowAfterHover).toBe(before)
  expect(sampled.badgeOpacity).toBe('1')
  expect(sampled.badgeContrast).toBeGreaterThanOrEqual(3)
  await page.screenshot({ path: testInfo.outputPath('account-profile-raised-dark.png') })
})

test('头像编辑:键盘焦点常驻角标,Enter 与 Space 都打开文件选择器', async ({ page }) => {
  const dialog = await openAccountDialog(page)
  const avatar = dialog.locator('[data-avatar-button]')
  await expect(avatar).toHaveAttribute('aria-label', 'Change avatar')
  await tabTo(page, avatar)
  await expect(avatar).toBeFocused()
  await expect(dialog.locator('[data-avatar-badge]')).toHaveCSS('opacity', '1')
  const enterChooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  await (await enterChooser).setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: VALID_PNG })
  await expect(dialog.locator('[data-avatar-feedback]')).toContainText('this session only')
  await expect(avatar).toBeFocused()
  const spaceChooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Space')
  await (await spaceChooser).setFiles([])
  await expect(avatar).toBeFocused()
})

test.describe('触屏头像', () => {
  test.use({ hasTouch: true })

  test('无 hover 设备角标常驻,且只有头像一个点击目标', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 900 })
    const dialog = await openAccountDialog(page)
    const avatar = dialog.locator('[data-avatar-button]')
    await expect(dialog.locator('[data-avatar-badge]')).toHaveCSS('opacity', '1')
    await expect(dialog.locator('[data-account-profile-row]').getByRole('button')).toHaveCount(1)
    const bounds = await avatar.boundingBox()
    expect(bounds?.width).toBeGreaterThanOrEqual(44)
    expect(bounds?.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: testInfo.outputPath('account-avatar-coarse-375.png') })
  })
})

test('头像替换:账户窗体、底栏与全局设置同步,刷新后还原', async ({ page }) => {
  const dialog = await openAccountDialog(page)
  await dialog.locator('[data-avatar-input]').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: VALID_PNG })
  await expect(dialog.locator('[data-avatar-feedback]')).toHaveAttribute('role', 'status')
  await expect(dialog.locator('[data-avatar-feedback]')).toContainText('It will reset after refresh')
  const source = await dialog.locator('[data-avatar-button] img').getAttribute('src')
  expect(source).toMatch(/^data:image\/png;base64,/)
  await page.keyboard.press('Escape')
  const dockAvatar = page.locator('.workspace-dock__settings-trigger .account-avatar img')
  await expect(dockAvatar).toHaveAttribute('src', source ?? '')
  await page.locator('.workspace-dock__settings-trigger').click()
  await expect(page.locator('.global-settings__identity .account-avatar img')).toHaveAttribute('src', source ?? '')
  await page.reload()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await unlockDemoIdentity(page)
  await expect(page.locator('.workspace-dock__settings-trigger .account-avatar img')).toHaveCount(0)
})

test('头像校验:类型、大小与解码失败均保留原图并说明原因', async ({ page }) => {
  const dialog = await openAccountDialog(page)
  const input = dialog.locator('[data-avatar-input]')
  await input.setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: VALID_PNG })
  await expect(dialog.locator('[data-avatar-feedback]')).toContainText('Avatar changed')
  const source = await dialog.locator('[data-avatar-button] img').getAttribute('src')
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  await expect(dialog.getByRole('alert')).toContainText('choose a PNG, JPEG, or WebP image')
  await expect(dialog.locator('[data-avatar-button] img')).toHaveAttribute('src', source ?? '')
  await input.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })
  await expect(dialog.getByRole('alert')).toContainText('5 MB or smaller')
  await expect(dialog.locator('[data-avatar-button] img')).toHaveAttribute('src', source ?? '')
  await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken image') })
  await expect(dialog.getByRole('alert')).toContainText('previous avatar was kept')
  await expect(dialog.locator('[data-avatar-button] img')).toHaveAttribute('src', source ?? '')
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


test('语言二级菜单:radio 即时切换、Esc 分层关闭与 375 不溢出', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await unlockDemoIdentity(page)
  const trigger = page.locator('.workspace-dock__settings-trigger')
  await trigger.click()
  const panel = page.locator('#workspace-settings-panel')
  const language = panel.locator('[data-settings-language]')
  const panelBox = await panel.boundingBox()
  await language.click()
  const menu = panel.locator('[data-language-menu]')
  await expect(menu).toBeVisible()
  // 二级菜单是浮层:展开不改变设置面板的尺寸(内联展开会撑高面板)。
  expect((await panel.boundingBox())?.height).toBe(panelBox?.height)
  const english = menu.getByRole('radio', { name: 'English', exact: true })
  await expect(english).toBeChecked()
  await expect(english).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(language).toBeFocused()
  await expect(language).toContainText('中文')
  await language.click()
  await menu.getByRole('radio', { name: 'English', exact: true }).click()
  await expect(language).toContainText('English')
  await expect(panel).toBeVisible()
  await expect(page.locator('#workspace-settings-drawer')).toHaveCount(0)
  await language.click()
  await expect(menu.getByRole('radio', { name: /English/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(language).toBeFocused()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('language-submenu-375.png') })
})

for (const method of ['button', 'backdrop', 'escape']) {
  test(`抽屉退出动画: ${method} 先 closing 再卸载`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await unlockDemoIdentity(page)
    const trigger = page.locator('.workspace-dock__settings-trigger')
    await trigger.click()
    await page.locator('[data-settings-section="shortcuts"]').click()
    const drawer = page.locator('#workspace-settings-drawer')
    await expect(drawer).toBeVisible()
    if (method === 'button') await drawer.locator('[data-settings-close]').click()
    else if (method === 'backdrop') await page.mouse.click(700, 400)
    else await page.keyboard.press('Escape')
    await expect(drawer).toHaveAttribute('data-closing', 'true')
    await expect(drawer).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
}

test('抽屉退出:reduced-motion 不等待动画直接卸载', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await unlockDemoIdentity(page)
  const trigger = page.locator('.workspace-dock__settings-trigger')
  await trigger.click()
  await page.locator('[data-settings-section="shortcuts"]').click()
  const drawer = page.locator('#workspace-settings-drawer')
  await drawer.locator('[data-settings-close]').click()
  await expect(drawer).toHaveCount(0)
  await expect(page.locator('[data-closing="true"]')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})
