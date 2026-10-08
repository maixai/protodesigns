import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 设计校准:宽度清单与 .claude/rules/baseline-web.md 的多宽度要求一致。
// 本页特殊约定(须被测试固化):
//   1. 纯浅色页,不响应 prefers-color-scheme —— 系统深色下外观必须不变;
//   2. 标签页链路流动点在 reduced-motion 下不渲染 —— 截图统一在 reduced-motion
//      下取,页面完全静态、确定(标签页完全用户驱动,本无自动轮播);
//   3. 标签页加载后默认停在 01 屏、层选择器默认停在 L2 —— 基线截图依赖这些不变量。
const WIDTHS = [375, 768, 1280, 1600] as const
const VIEWPORT_HEIGHT = 900

async function waitForConsole(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Overview', exact: true })).toBeVisible()
  await expect(page.locator('.console-overview')).toHaveAttribute('data-state', 'ready')
}

async function signInToConsole(page: Page): Promise<void> {
  await page.goto('/')
  await page.locator('.site-header').getByRole('button', { name: 'Sign in', exact: true }).click()
  await waitForConsole(page)
}

// 量元素本体,伪元素扩命中区不算达标;只检查可见且非 inert 的交互项。
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('a, button'))
    .filter((element) => element.closest('[inert]') === null && element.getClientRects().length > 0)
    .filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.width < 44 || rect.height < 44
    })
    .map((element) => `${element.textContent?.trim()}: ${element.getBoundingClientRect().width}×${element.getBoundingClientRect().height}`))
}

// 横向溢出量:> 0 表示内容超出视口宽度,属于破版。
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

// 等待页面进入稳定态:h1 落定 + 标签页图版(01 屏编号)落定 + 页脚落定。
// 本页已无异步视图,三个锚点都落定即视为稳定。
// 五个面板常驻 DOM(叠放,非活动面板 inert + 视觉隐藏),编号锚点取第一个面板。
async function waitForStable(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.hero-plate__counter').first()).toHaveText(/^01 \//)
  await expect(page.locator('.site-footer')).toBeVisible()
}

// 对比度断言:design-language.md §⑭ 要求「正文与背景 ≥ 4.5:1,由校准装置逐对断言」。
// 淡出元素照样检查,并把 opacity 合成为等效色;禁用控件豁免(WCAG 1.4.3)。
async function contrastViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number]

    function parseColor(value: string): Rgba {
      const matched = value.match(/rgba?\(([^)]+)\)/)
      const body = matched?.[1]
      if (!body) return [0, 0, 0, 0]
      const parts = body.split(/[,/\s]+/).filter((part) => part.length > 0).map(Number)
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
    }

    // 相对亮度(WCAG 2.x 定义)。
    function luminance(color: Rgba): number {
      const channel = (value: number): number => {
        const scaled = value / 255
        return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])
    }

    // 源色 over 目标色(source-over,直通 alpha)。
    function over(source: Rgba, backdrop: Rgba): Rgba {
      const sourceAlpha = source[3]
      const backdropAlpha = backdrop[3]
      const outAlpha = sourceAlpha + backdropAlpha * (1 - sourceAlpha)
      if (outAlpha === 0) return [0, 0, 0, 0]
      const blend = (index: 0 | 1 | 2): number =>
        (source[index] * sourceAlpha +
          backdrop[index] * backdropAlpha * (1 - sourceAlpha)) /
        outAlpha
      return [blend(0), blend(1), blend(2), outAlpha]
    }

    function ratio(foreground: Rgba, background: Rgba): number {
      const a = luminance(foreground)
      const b = luminance(background)
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }

    const violations: string[] = []

    for (const element of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      // 只检查有直接文本的元素(纯容器交给其子元素各自判定)。
      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim()
      if (ownText.length === 0) continue
      if (element.closest('[aria-hidden="true"]') !== null) continue
      if (element.closest('svg') !== null) continue

      const style = getComputedStyle(element)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      if (Number(style.opacity) === 0) continue
      if (element.closest('[inert]') !== null) continue
      // 禁用控件豁免:WCAG 1.4.3 明确豁免非活动界面组件的对比度要求。
      if (element.closest('button:disabled, [aria-disabled="true"]') !== null) continue

      // 祖先链:元素自身 → html。
      const chain: HTMLElement[] = []
      let cursor: HTMLElement | null = element
      while (cursor !== null) {
        chain.push(cursor)
        cursor = cursor.parentElement
      }

      // 由内向外累积。遇到第一个 opacity < 1 的层即"组边界":组内的背景先合成为
      // 不透明底,再整体按累计 alpha 压到组外底色上 —— 等价于 CSS 的 opacity 分组语义。
      let inner: Rgba = [0, 0, 0, 0]
      let outer: Rgba = [0, 0, 0, 0]
      let groupAlpha = 1
      let pastBoundary = false
      for (const layer of chain) {
        const layerStyle = getComputedStyle(layer)
        const layerAlpha = Number(layerStyle.opacity)
        const layerBackground = parseColor(layerStyle.backgroundColor)
        if (pastBoundary) {
          outer = over(outer, layerBackground)
        } else {
          inner = over(inner, layerBackground)
          if (layerAlpha < 1) pastBoundary = true
        }
        groupAlpha *= layerAlpha
      }
      // 组外一直追溯到画布仍不透明:垫上白色底。
      if (outer[3] < 1) outer = over(outer, [255, 255, 255, 1])
      // 组内底色如果不透明,它就是文字背后的底色;否则继续垫到组外底色上。
      const innerOpaque: Rgba = inner[3] < 1 ? over(inner, outer) : inner

      const background = over([innerOpaque[0], innerOpaque[1], innerOpaque[2], groupAlpha], outer)
      const textColor = parseColor(style.color)
      const foreground = over([textColor[0], textColor[1], textColor[2], groupAlpha], outer)
      const value = ratio(foreground, background)

      const fontSize = Number.parseFloat(style.fontSize)
      const fontWeight = Number(style.fontWeight)
      // 本设计语言字重封顶 600,故"大字号"实际只由字号决定(≥24px 才享 3:1 豁免)。
      const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)
      const threshold = isLargeText ? 3 : 4.5

      if (value < threshold) {
        const className = element.className === '' ? '' : `.${String(element.className).split(' ').join('.')}`
        violations.push(
          `${element.tagName.toLowerCase()}${className} 「${ownText.slice(0, 24)}」 ${value.toFixed(2)}:1 (需 ${threshold}:1)`,
        )
      }
    }
    return violations
  })
}

for (const width of WIDTHS) {
  test(`宽度 ${width}px:不破版,且外观与系统主题无关`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await page.goto('/')
    await waitForStable(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    // 浅色截图即基线。
    await expect(page).toHaveScreenshot(`home-${width}.png`, { fullPage: true })
    // 纯浅色页、不响应系统主题:深色模式下必须命中同一基线。
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    await expect(page).toHaveScreenshot(`home-${width}.png`, { fullPage: true })
  })
}

test('正文与背景对比度逐对达标', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  expect(await contrastViolations(page)).toEqual([])
})

test('标签页默认停在 01 屏,点击 / 方向键 / Home·End 三条路径可切换', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  // 基线不变量:初始必须停在 01 屏(每屏编号是其固有注册号,不随切换变化),
  // 否则全部截图基线失真。切换行为经 aria-selected / inert / visibility 断言。
  await expect(page.locator('.hero-plate__counter').first()).toHaveText('01 / 05')
  await expect(page.getByRole('tab', { name: 'Mesh' })).toHaveAttribute('aria-selected', 'true')
  // 非活动面板:inert(不可 Tab、不被读屏播报)+ 视觉隐藏(visibility,不是 display)。
  await expect(page.locator('#hero-panel-access')).toHaveAttribute('inert', '')
  await expect(page.locator('#hero-panel-access')).toBeHidden()
  await expect(page.locator('#hero-panel-mesh')).not.toHaveAttribute('inert', '')

  // 路径一:点击标签 → 03 屏(端到端加密链路)。
  await page.getByRole('tab', { name: 'Encryption' }).click()
  await expect(page.getByRole('tab', { name: 'Encryption' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#hero-panel-encryption')).not.toHaveAttribute('inert', '')
  await expect(page.locator('#hero-panel-encryption')).toBeVisible()
  await expect(page.locator('#hero-panel-mesh')).toHaveAttribute('inert', '')

  // 路径二:方向键(roving tabindex,自动激活,焦点留在标签上);循环:01 屏按 ← 到末屏。
  await page.getByRole('tab', { name: 'Encryption' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Environments' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'Encryption' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: 'DNS' })).toHaveAttribute('aria-selected', 'true')

  // 路径三:Home / End 跳首尾(末屏是 05 · 私有 DNS)。
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: 'Mesh' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'DNS' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#hero-panel-dns')).not.toHaveAttribute('inert', '')
  await expect(page.locator('#hero-panel-dns')).toBeVisible()
})

test('跨层 Mesh 层选择器:三条键盘路径可切换,非活动面板 inert,切换整节高度不跳', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  // 初始停在 L2;非活动面板 inert + 视觉隐藏(visibility,不是 display)。
  await expect(page.getByRole('tab', { name: /L2/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#mesh-layer-panel-l3')).toHaveAttribute('inert', '')
  await expect(page.locator('#mesh-layer-panel-l3')).toBeHidden()
  await expect(page.locator('#mesh-layer-panel-l2')).not.toHaveAttribute('inert', '')

  const section = page.locator('#mesh')
  const heightL2 = await section.evaluate((el) => el.offsetHeight)

  // 路径一:点击 → L3。
  await page.getByRole('tab', { name: /L3/ }).click()
  await expect(page.getByRole('tab', { name: /L3/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#mesh-layer-panel-l3')).not.toHaveAttribute('inert', '')
  await expect(page.locator('#mesh-layer-panel-l3')).toBeVisible()
  await expect(page.locator('#mesh-layer-panel-l2')).toHaveAttribute('inert', '')
  expect(await section.evaluate((el) => el.offsetHeight)).toBe(heightL2)

  // 路径二:方向键(roving tabindex,自动激活);L2 按 ← 循环到 L7。
  await page.getByRole('tab', { name: /L3/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: /L7/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: /L3/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('tab', { name: /L7/ })).toHaveAttribute('aria-selected', 'true')

  // 路径三:Home / End 跳首尾;切换后整节高度不跳动。
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: /L2/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: /L7/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#mesh-layer-panel-l7')).not.toHaveAttribute('inert', '')
  expect(await section.evaluate((el) => el.offsetHeight)).toBe(heightL2)
})

test('顶栏滚动时固定在视口顶端,登录后自动进入控制台', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  const header = page.locator('.site-header')
  await expect(header).toBeVisible()

  // 滚到页面中部:顶栏必须仍贴在视口顶端,而不是随文档一起滚走。
  const scrolled = await page.evaluate(() => {
    window.scrollTo({ top: Math.round(document.body.scrollHeight / 2), behavior: 'instant' })
    return window.scrollY
  })
  expect(scrolled).toBeGreaterThan(0)

  const top = await header.evaluate((el) => el.getBoundingClientRect().top)
  expect(Math.abs(top)).toBeLessThanOrEqual(1)

  const login = header.getByRole('button', { name: 'Sign in' })
  await expect(login).toBeVisible()
  await login.click()
  await waitForConsole(page)
  await expect(page).toHaveURL(/#\/console$/)
  await expect(header.getByRole('button', { name: /Account menu/ })).toBeVisible()
  await expect(login).toHaveCount(0)
  await expect(page.locator('.site-footer')).toHaveCount(0)
})

test('顶栏语言切换后页面文案与 <html lang> 随之变化', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Every device you own, on one private network' }),
  ).toBeVisible()

  // 语言切换器是紧凑 disclosure 下拉(触发钮 + 弹出层选项):先点触发钮展开,
  // 再点目标语种 —— 全程原生 button,键盘与指针都可操作。
  const header = page.locator('.site-header')
  const trigger = header.getByRole('button', { name: /Switch language|切换语言/ })
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await header.getByRole('button', { name: '中文', exact: true }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: '把每一台设备,放进同一张私有网络' }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page).toHaveTitle(/Minos/)
})

test('页脚锚点链接指向页内真实区块', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await waitForStable(page)

  // 页脚导航恰好 4 个入口,且每个 href 都指向页内真实存在的区块 id。
  const links = page.locator('.site-footer__link')
  await expect(links).toHaveCount(4)
  const hrefs = await links.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('href') ?? ''),
  )
  for (const href of hrefs) {
    expect(href.startsWith('#')).toBe(true)
    await expect(page.locator(href)).toHaveCount(1)
  }

  await page.locator('.site-footer').getByRole('link', { name: 'Quickstart' }).click()
  await expect(page).toHaveURL(/#quickstart$/)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

for (const width of WIDTHS) {
  test(`控制台宽度 ${width}px:截图、触达、对比度、浅色不随系统变化`, async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()) })
    page.on('response', (response) => { if (response.status() >= 400) runtimeErrors.push(`${response.status()} ${response.url()}`) })
    page.on('requestfailed', (request) => runtimeErrors.push(`Request failed: ${request.url()}`))
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await signInToConsole(page)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    expect(await smallTargets(page)).toEqual([])
    expect(await contrastViolations(page)).toEqual([])
    await expect(page).toHaveScreenshot(`console-${width}.png`, { fullPage: true })
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await expect(page).toHaveScreenshot(`console-${width}.png`, { fullPage: true })
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    if (width < 768) {
      const nav = page.getByRole('navigation', { name: 'Console navigation' })
      expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
      await nav.getByRole('link', { name: 'Settings', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    }
    expect(runtimeErrors).toEqual([])
  })
}

test('账户菜单:真实 Tab、Enter、Space、Esc 与登出对话框焦点约束', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signInToConsole(page)
  // 在已登录首页,品牌仍是 #top 原生锚点,登录按钮互斥消失。
  await page.locator('.site-header__brand').click()
  await waitForStable(page)
  await expect(page.locator('.site-header__brand')).toHaveAttribute('href', '#top')
  const trigger = page.getByRole('button', { name: /Account menu/ })
  await page.locator('.site-header__brand').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /Switch language/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger).toHaveAttribute('aria-haspopup', 'true')
  const group = page.locator('#account-popover')
  const consoleItem = group.getByRole('button', { name: 'Console', exact: true })
  const logoutItem = group.getByRole('button', { name: 'Sign out', exact: true })
  await expect(consoleItem).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(logoutItem).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(consoleItem).toBeFocused()
  await page.keyboard.press('Enter')
  await waitForConsole(page)
  await expect(page).toHaveURL(/#\/console$/)
  await expect(trigger).toBeFocused()
  await expect(group).toHaveCount(0)

  await page.keyboard.press('Space')
  await expect(consoleItem).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(logoutItem).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Sign out?', exact: true })
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
  const confirm = dialog.getByRole('button', { name: 'Confirm sign out', exact: true })
  await expect(dialog).toBeVisible()
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirm).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(confirm).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(page).toHaveURL(/#\/console$/)

  // 取消按钮与 Esc 一样恢复触发钮;确认后才清会话,且焦点移交登录按钮。
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(confirm).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('.site-header').getByRole('button', { name: 'Sign in', exact: true })).toBeFocused()
  await expect(trigger).toHaveCount(0)
  await expect(page.locator('.n-message')).toContainText('You are signed out')
})

test('账户菜单:外部点击与 focusout 关闭,取消与确认登出', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signInToConsole(page)
  const trigger = page.getByRole('button', { name: /Account menu/ })
  await trigger.click()
  await page.getByRole('heading', { level: 1 }).click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()
  await page.locator('#account-popover').getByRole('button', { name: 'Sign out', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign out?', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(trigger).toBeFocused()
  await expect(page).toHaveURL(/#\/console$/)
  await trigger.click()
  await page.locator('#account-popover').getByRole('button', { name: 'Sign out', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm sign out' }).click()
  await waitForStable(page)
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})

test('未登录路由守卫、未知路径回落、刷新清会话、原生锚点仍可用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/#/console/networks?s=empty')
  await waitForStable(page)
  await expect(page).toHaveURL(/#\/$/)
  await page.goto('/#/not-a-page')
  await waitForStable(page)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await waitForConsole(page)
  await page.evaluate(() => { window.location.hash = '#/console/unknown' })
  await waitForConsole(page)
  await page.locator('.site-header__brand').click()
  await waitForStable(page)
  await page.locator('.site-footer').getByRole('link', { name: 'Quickstart' }).click()
  await expect(page).toHaveURL(/#quickstart$/)
  await expect(page.getByRole('button', { name: /Account menu/ })).toBeVisible()
  await page.getByRole('button', { name: /Account menu/ }).click()
  await page.locator('#account-popover').getByRole('button', { name: 'Console', exact: true }).click()
  await waitForConsole(page)
  await page.reload()
  await waitForStable(page)
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
})

test('侧边栏六项各有路由、标题与 aria-current,中英词条贯穿控制台', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signInToConsole(page)
  const sections = [
    { id: 'networks', label: 'Networks' }, { id: 'machines', label: 'Machines' },
    { id: 'access', label: 'Access control' }, { id: 'dns', label: 'DNS' },
    { id: 'settings', label: 'Settings' }, { id: 'overview', label: 'Overview' },
  ]
  const nav = page.getByRole('navigation', { name: 'Console navigation' })
  for (const section of sections) {
    const link = nav.getByRole('link', { name: section.label, exact: true })
    await link.click()
    await expect(page).toHaveURL(new RegExp(`#/console${section.id === 'overview' ? '' : `/${section.id}`}$`))
    await expect(link).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1, name: section.label, exact: true })).toBeVisible()
    if (section.id !== 'overview') await expect(page.locator('.console-placeholder')).toContainText('Detailed design will follow')
  }
  await page.getByRole('button', { name: /Switch language/ }).click()
  await page.getByRole('button', { name: '中文', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '概览', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '控制台导航' }).getByRole('link', { name: '访问控制' })).toBeVisible()
  await page.getByRole('button', { name: /账户菜单/ }).click()
  await page.locator('#account-popover').getByRole('button', { name: '登出', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '确认登出？', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '确认登出', exact: true })).toBeVisible()
})

test('概览四态可通过 URL 演示,错误重试真正重发请求', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signInToConsole(page)
  await page.evaluate(() => { window.location.hash = '#/console?s=empty' })
  await expect(page.locator('.console-overview')).toHaveAttribute('data-state', 'loading')
  await expect(page.getByRole('status')).toContainText('Loading networks')
  await expect(page.locator('.console-overview')).toHaveAttribute('data-state', 'empty')
  await expect(page.getByRole('heading', { name: 'No networks or devices yet' })).toBeVisible()
  await page.evaluate(() => { window.location.hash = '#/console?s=error' })
  await expect(page.locator('.console-overview')).toHaveAttribute('data-state', 'error')
  await expect(page.getByRole('alert')).toContainText('Workspace data could not be loaded')
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.locator('.console-overview')).toHaveAttribute('data-state', 'loading')
  await expect(page.locator('.console-overview')).toHaveAttribute('data-state', 'error')
  await page.evaluate(() => { window.location.hash = '#/console' })
  await waitForConsole(page)
  await expect(page.locator('.network-card')).toHaveCount(3)
  await expect(page.locator('.machine-card')).toHaveCount(5)
})

test('控制台与模态在 200% 文本缩放下不破版,交互本体达 44×44', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await signInToConsole(page)
  // 只在测试中覆盖字号 token,模拟用户放大文本,不修改原型持久状态。
  await page.addStyleTag({ content: ':root { --dl-font-size-xs: 24px; --dl-font-size-sm: 26px; --dl-font-size-md: 30px; --dl-font-size-lg: 38px; --dl-font-size-xl: 46px; --dl-font-size-2xl: 58px; }' })
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  await page.getByRole('button', { name: /Account menu/ }).click()
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  await page.locator('#account-popover').getByRole('button', { name: 'Sign out', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const width = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(width).toBeLessThanOrEqual(0)
  expect(await smallTargets(page)).toEqual([])
})
