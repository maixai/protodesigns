import { expect, test } from '@playwright/test'
import { unlockDemoIdentity } from '../calibrate/identity-helpers'
import { expectDialogButtonHitPriority, expectDialogOutsideCornerResize, expectDialogResizeCue, login, waitForWorkspace } from './helpers'

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
  // 头部与标签栏同属 chrome:有标签栏时头部无分界线,标签栏底边线是唯一分界。
  await expect(dialog.locator('.account-security__header')).toHaveCSS('border-bottom-width', '0px')
  await expect(dialog.locator('.account-security__tabs')).toHaveCSS('border-bottom-width', '1px')
  // 原生 cancel 会冒泡到框体；它只应被文件输入拦住，不能关掉整个账户设置。
  await dialog.locator('[data-avatar-input]').evaluate((input) => input.dispatchEvent(new Event('cancel', { bubbles: true })))
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
})

test('@area:identity 通行密钥页中文文案、⋯ 无底板与菜单单边框', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('[data-settings-section="accountSecurity"]').click()
  const dialog = page.locator('#workspace-account-security-dialog')
  const tab = dialog.getByRole('tab', { name: '通行密钥', exact: true })
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(dialog.getByRole('heading', { name: /^通行密钥/ })).toBeVisible()
  await expect(dialog).not.toContainText('Passkey')

  // 行尾 ⋯ 不再使用基础按钮的描边与悬停底色,只保留 44px 命中区。
  const action = dialog.locator('.account-security__menu-wrap > .account-security__icon-button').first()
  await expect(action).toBeVisible()
  const readAction = async (): Promise<{ border: string; background: string; width: number; height: number }> => action.evaluate((element) => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return { border: style.borderTopWidth, background: style.backgroundColor, width: rect.width, height: rect.height }
  })
  const resting = await readAction()
  expect(resting.border).toBe('0px')
  expect(resting.background).toBe('rgba(0, 0, 0, 0)')
  expect(resting.width).toBeGreaterThanOrEqual(44)
  expect(resting.height).toBeGreaterThanOrEqual(44)
  await action.hover()
  const hovered = await readAction()
  expect(hovered.border).toBe('0px')
  expect(hovered.background).toBe('rgba(0, 0, 0, 0)')

  // 菜单表面只有外层一条边框;内层菜单项不再重复描边。
  await action.click()
  const menu = dialog.locator('.account-security__menu')
  const item = menu.getByRole('button', { name: '移除通行密钥', exact: true })
  await expect(item).toBeVisible()
  expect(await menu.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('1px')
  expect(await item.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe('0px')
})

test('@area:identity 账户设置窄屏退化为固定 sheet', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('[data-settings-section="accountSecurity"]').click()
  const dialog = page.locator('#workspace-account-security-dialog')
  await expect(dialog.locator('[data-account-profile]')).toBeVisible()
  await expect(dialog.getByRole('button', { name: /最大化窗口|还原标准大小/ })).toHaveCount(0)
  await expect(dialog.locator('[role="separator"]')).toHaveCount(4)

  // 账户窗体没有 actions 槽:右下角的表现与另外两个窗体一致(无抓手、外侧角落可缩放)。
  await expectDialogResizeCue(page, dialog)
  await expectDialogButtonHitPriority(dialog)
  await expectDialogOutsideCornerResize(page, dialog)

  await page.setViewportSize({ width: 375, height: 900 })
  await expect(dialog.getByRole('button', { name: /最大化窗口|还原标准大小/ })).toHaveCount(0)
  await expect(dialog.locator('[role="separator"]')).toHaveCount(0)
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)

  await page.setViewportSize({ width: 1280, height: 900 })
  await dialog.locator('[data-account-security-close]').click()
  await expect(dialog).not.toBeVisible()
})

test('@area:identity 账户设置关闭钮与悬浮窗体头部图标钮同档', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('[data-settings-section="accountSecurity"]').click()
  const dialog = page.locator('#workspace-account-security-dialog')
  const close = dialog.locator('[data-account-security-close]')
  await expect(close).toBeVisible()

  // 用探针读出同作用域下 token 解析后的颜色,避免在测试里写死色值。
  const resting = await close.evaluate((element) => {
    const probe = document.createElement('span')
    element.append(probe)
    probe.style.color = 'var(--dl-text-tertiary)'
    const tertiary = getComputedStyle(probe).color
    probe.style.color = 'var(--dl-text-primary)'
    const primary = getComputedStyle(probe).color
    probe.style.background = 'var(--dl-bg-hover)'
    const hoverBackground = getComputedStyle(probe).backgroundColor
    probe.remove()
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      borderTop: style.borderTopWidth,
      borderLeft: style.borderLeftWidth,
      radius: style.borderTopLeftRadius,
      color: style.color,
      background: style.backgroundColor,
      tertiary,
      primary,
      hoverBackground,
    }
  })
  // 无边框、无静止底色、32×32、圆角 md —— 与 chat-panel__action / file-panel__close 同一档。
  expect(resting.width).toBe(32)
  expect(resting.height).toBe(32)
  expect(resting.borderTop).toBe('0px')
  expect(resting.borderLeft).toBe('0px')
  expect(resting.radius).toBe('8px')
  expect(resting.background).toBe('rgba(0, 0, 0, 0)')
  expect(resting.color).toBe(resting.tertiary)

  await close.hover()
  await expect.poll(
    () => close.evaluate((element) => getComputedStyle(element).backgroundColor),
    { message: '悬停出现底色' },
  ).toBe(resting.hoverBackground)
  expect(await close.evaluate((element) => getComputedStyle(element).color), '悬停文字升到主色').toBe(resting.primary)

  // 键盘可达:标题栏之后的下一个 Tab 落点就是关闭钮,焦点环内收(贴边不被表面裁切)。
  await page.mouse.move(0, 0)
  await dialog.locator('.dl-dialog__header').focus()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  expect(await close.evaluate((element) => getComputedStyle(element).boxShadow), '焦点环可见').toContain('inset')
})

test('@area:identity 1280×800 账户页不出现正文纵向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  await waitForWorkspace(page)
  await page.locator('.workspace-dock__settings-trigger').click()
  await page.locator('[data-settings-section="accountSecurity"]').click()
  const dialog = page.locator('#workspace-account-security-dialog')
  await expect(dialog.locator('[data-account-profile]')).toBeVisible()
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  const frame = await dialog.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('.account-security__body')
    if (body === null) throw new Error('body missing')
    return { height: element.getBoundingClientRect().height, client: body.clientHeight, scroll: body.scrollHeight }
  })
  expect(Math.abs(frame.height - 720)).toBeLessThanOrEqual(1)
  expect(frame.scroll).toBeLessThanOrEqual(frame.client + 1)
  await dialog.locator('[data-account-security-close]').click()
  await expect(dialog).not.toBeVisible()
})
