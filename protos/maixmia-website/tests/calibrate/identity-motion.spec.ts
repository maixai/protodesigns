import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { unlockDemoIdentity } from './identity-helpers'

test.use({ locale: 'zh-CN' })

// 在浏览器首帧开始观察，不以操作后的静态断言代替防闪验证。
async function observeGate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    function sample(): void {
      const main = document.querySelector('.workspace-page')
      const gate = document.querySelector('dialog.identity-gate')
      const surface = gate?.querySelector('.identity-gate__surface')
      const state = surface?.getAttribute('data-state')
      if (main !== null && !performance.getEntriesByName('motion-workspace-first-frame').length) {
        performance.mark('motion-workspace-first-frame')
        if (gate?.matches(':modal') && state === 'loading') performance.mark('motion-loading-first-frame')
      }
      if (state !== undefined && state !== null) {
        if (!performance.getEntriesByName(`motion-state-${state}`).length) performance.mark(`motion-state-${state}`)
        if (state !== 'exiting') {
          const content = main?.querySelector('.workspace-layout')
          if (content && getComputedStyle(content).visibility !== 'hidden') performance.mark('motion-content-flash')
        }
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
}

for (const width of [375, 1280]) {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    test(`身份动效:首帧遮挡、固定舞台、退出焦点 @${width} ${reducedMotion}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: reducedMotion === 'reduce' ? 'reduce' : 'no-preference' })
      await page.setViewportSize({ width, height: 900 })
      await observeGate(page)
      await page.goto('/')
      await page.getByRole('button', { name: '登录', exact: true }).click()
      const gate = page.getByTestId('identity-vault-dialog')
      const heading = gate.locator('#identity-vault-title')
      await expect(heading).toHaveText('解锁你的身份密钥')
      await expect(heading).toBeFocused()
      expect(await page.evaluate(() => performance.getEntriesByName('motion-loading-first-frame').length)).toBe(1)
      expect(await page.evaluate(() => performance.getEntriesByName('motion-content-flash').length)).toBe(0)
      const stage = gate.locator('.identity-gate__stage')
      const before = await stage.boundingBox()
      const frame = await gate.boundingBox()
      const primary = gate.getByRole('button', { name: '使用 Passkey 解锁', exact: true })
      const button = await primary.boundingBox()
      await page.keyboard.press('Escape')
      await expect(gate).toBeVisible()
      await primary.click()
      await expect(heading).toHaveText('验证你的 Passkey')
      await expect(heading).toBeFocused()
      expect(await stage.boundingBox()).toEqual(before)
      expect(await gate.boundingBox()).toEqual(frame)
      const verification = gate.getByTestId('mock-passkey-unlock')
      expect((await verification.boundingBox())?.y).toBe(button?.y)
      await page.screenshot({ path: testInfo.outputPath('motion-passkey.png') })
      await verification.click()
      await expect(verification).toBeDisabled()
      await expect(verification).toHaveText('正在验证…')
      await expect(gate.locator('.identity-gate__hero')).toHaveClass(/is-verifying/)
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.getAttribute('data-testid'))).toBe('identity-vault-dialog')
      if (reducedMotion === 'reduce') {
        const motion = await gate.locator('.identity-gate__hero').evaluate((element) => ({ spin: getComputedStyle(element, '::after').animationName, transform: getComputedStyle(element).transform }))
        expect(motion).toEqual({ spin: 'none', transform: 'none' })
      }
      await expect(heading).toHaveText('身份已解锁')
      await expect(heading).toBeFocused()
      expect(await stage.boundingBox()).toEqual(before)
      expect(await gate.boundingBox()).toEqual(frame)
      // 成功截图由 identity-gate 回归覆盖；这里不让截图栅格化暂停渲染时间轴。
      await expect(gate).toBeHidden()
      await expect(page.locator('main.workspace-page')).toBeFocused()
      await expect(page.locator('.workspace-dock')).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
      expect(await page.locator('main.workspace-page').evaluate((element) => ({ transform: getComputedStyle(element).transform, filter: getComputedStyle(element).filter }))).toEqual({ transform: 'none', filter: 'none' })
      if (width === 1280) await expect(page.locator('#workspace-sidebar')).toBeInViewport()
      expect(await page.evaluate(() => performance.getEntriesByName('motion-content-flash').length)).toBe(0)
      if (reducedMotion !== 'reduce') {
        const duration = await page.evaluate(() => {
          const success = performance.getEntriesByName('motion-state-success')[0]?.startTime ?? 0
          const exiting = performance.getEntriesByName('motion-state-exiting')[0]?.startTime ?? 0
          return exiting - success
        })
        expect(duration).toBeGreaterThanOrEqual(650)
        expect(duration).toBeLessThan(850)
      }
      await page.screenshot({ path: testInfo.outputPath('motion-workspace.png') })
    })
  }
}

test('身份动效:已解锁用户访问首页被守卫送回，不闪现 gate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await unlockDemoIdentity(page)
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('dialog.identity-gate[open]')) performance.mark('motion-unlocked-gate-flash')
    })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
  })
  await page.evaluate(() => { window.location.hash = '' })
  await expect(page).toHaveURL(/#\/workspace$/)
  await expect(page.locator('.site-header')).toHaveCount(0)
  await expect(page.locator('main.workspace-page')).toBeFocused()
  await expect(page.getByTestId('identity-vault-dialog')).toBeHidden()
  expect(await page.evaluate(() => performance.getEntriesByName('motion-unlocked-gate-flash').length)).toBe(0)
})
