import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 设计校准:宽度清单与 .claude/rules/baseline-web.md 的多宽度要求一致。
// 本页特殊约定(已确认的设计决定,须被测试固化):
//   1. 深浅分段节奏固定,不响应 prefers-color-scheme —— 系统深色下外观必须不变;
//   2. Hero 多端同屏演示带时序动画 —— 截图统一在 reduced-motion 下取(synced 稳态,确定);
//   3. 演示控件(重放 / 模拟桌面端离线 / 恢复同步)真实可点,状态与三端显示随之变化。
const WIDTHS = [375, 768, 1280, 1600] as const
const VIEWPORT_HEIGHT = 900

// 横向溢出量:> 0 表示内容超出视口宽度,属于破版。
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

// 等待页面进入稳定态:本页无异步数据,等 h1 与页脚都落定即可
// (页脚是文档最后一屏,它出现说明整页已完成布局,截全页图不会截到未布局的状态)。
async function waitForStable(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.site-footer')).toBeVisible()
}

// 对比度断言:design-language.md §⑭ 要求「正文与背景 ≥ 4.5:1,由校准装置逐对断言」。
//
// 两处刻意为之、否则会漏判的做法:
//   1. 不因祖先带渐变(氛围辉光)而跳过 —— 跳过会让 Hero 内的元素整体免检,
//      而那正是最需要查的地方。渐变不计入底色谱,只计 background-color:
//      忽略一层极低不透明度的辉光会让底色略偏暗、浅色文字算出的对比度略偏高;
//      若这样仍然通过,实际渲染只会更好。
//   2. 淡出元素照样检查,并把 opacity 合成为等效色。把「变暗 / 淡出」的元素跳过,
//      恰好会漏掉「淡出之后就看不清」—— 那正是要防的。
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
    // 必须正确推进 alpha:若把结果一律当成不透明,透明背景会被合成为黑色,
    // 浅色区的深色文字就会被误判成"深底深字"。
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
      // 禁用控件豁免:WCAG 1.4.3 明确豁免非活动(inactive)界面组件的对比度要求,
      // 禁用态的语义就是"不可操作",其文字刻意弱化(--dl-text-disabled)。
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
      // (多个嵌套淡出组会被近似为在第一个边界上一次应用总 alpha;本页只有一处,精确。)
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
    // 深浅节奏固定、不响应系统主题:深色模式下必须命中同一基线。
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

test('顶栏滚动时固定在视口顶端', async ({ page }) => {
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

  // 滚动状态下导航与主 CTA 仍可点到,不是"滚到中部就够不着"。
  // 页脚也有同名链接,故把范围收敛到顶栏内。
  const headerNav = page.locator('.site-header__nav')
  await expect(headerNav.getByRole('link', { name: 'Anywhere' })).toBeVisible()
  await expect(page.locator('.site-header__cta')).toBeVisible()
})

test('切换语言后页面文案与 <html lang> 随之变化', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your Mia, beyond your desk' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Language' }).click()
  // Naive UI 下拉项不是 ARIA menuitem(普通 div),按组件类名 + 文案定位。
  await page.locator('.n-dropdown-option', { hasText: '中文' }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: '你的 Mia,不只在电脑前' }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page).toHaveTitle(/Mia/)

  // 区块的无障碍名称也必须随语言切换,不能残留英文。
  await expect(page.getByRole('region', { name: 'Mia 的可达方式' })).toBeVisible()
})
