import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 设计校准:宽度清单与 .claude/rules/baseline-web.md 的多宽度要求一致。
const WIDTHS = [375, 768, 1280, 1600] as const
const VIEWPORT_HEIGHT = 900

// 窄宽度下整页高度过大;这些宽度只截视口,宽屏才截整页。
const FULL_PAGE_WIDTHS: readonly number[] = [1280, 1600]

// 横向溢出量:> 0 表示内容超出视口宽度,属于破版。
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

// 等页面高度连续多轮不变。
// 只等某个选择器是不够的:除它之外的异步区块落地同样会撑高页面,而整页高达约 1 万像素、
// 截图本身要几秒 —— 足够让它们落地,于是 Playwright 的「连续两张截图一致」永远不成立
// (`Failed to take two consecutive stable screenshots`)。实测两次捕获之间页高长了 89px。
// 这里按「页高稳定」而不是「某个元素出现」来判落定,与具体是哪个区块无关。
const STABLE_SAMPLES = 3
const STABLE_INTERVAL_MS = 150

async function waitForStableHeight(page: Page): Promise<void> {
  let previous = -1
  let equalRounds = 0
  // 上限 6s:即使某处持续变化,也不要让用例无限等下去(超时由用例自身的 timeout 兜底)。
  for (let i = 0; i < 40; i += 1) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    equalRounds = height === previous ? equalRounds + 1 : 0
    if (equalRounds >= STABLE_SAMPLES - 1) return
    previous = height
    await page.waitForTimeout(STABLE_INTERVAL_MS)
  }
}

// 等待页面进入稳定态:调教台已渲染完成,且整页高度已落定。
// 不等它落定就截图会让基线漂移,产生假失败。
async function waitForPage(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /青瓷/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /排版调教台/ })).toBeVisible()
  // 必须等异步区块的数据落定(dummy API 有 150-300ms 随机延迟)。
  // 不等它,整页截图会时而抓到加载态、时而抓到完成态 —— 基线必然漂移。
  await expect(page.locator('.list__item').first()).toBeVisible()
  await waitForStableHeight(page)
}

for (const width of WIDTHS) {
  const fullPage = FULL_PAGE_WIDTHS.includes(width)

  test.describe(`宽度 ${width}px`, () => {
    test('浅色下不破版', async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto('/')
      await waitForPage(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      await expect(page).toHaveScreenshot(`tuning-${width}-light.png`, { fullPage })
    })

    test('深色下不破版', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto('/')
      await waitForPage(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      await expect(page).toHaveScreenshot(`tuning-${width}-dark.png`, { fullPage })
    })
  })
}

// 调教台的候选值必须真的生效,否则这些对比就是假的。
test('排版调教台的候选值确实生效', async ({ page }) => {
  await page.goto('/')
  await waitForPage(page)

  const measured = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('.tune__cell'))
    return cells.map((cell) => {
      const para = cell.querySelector('.tune__para')
      if (!para) return null
      const style = getComputedStyle(para)
      return {
        label: cell.querySelector('.tune__meta code')?.textContent?.trim() ?? '',
        lineHeight: style.lineHeight,
        fontSize: style.fontSize,
        maxWidth: style.maxWidth,
      }
    })
  })

  const rows = measured.filter((row): row is NonNullable<typeof row> => row !== null)
  expect(rows.length).toBeGreaterThan(0)

  // 行高候选:至少三个互不相同的实际行高
  expect(new Set(rows.map((row) => row.lineHeight)).size).toBeGreaterThanOrEqual(3)
  // 字号候选:至少两个互不相同的实际字号
  expect(new Set(rows.map((row) => row.fontSize)).size).toBeGreaterThanOrEqual(2)
})

// 对比度底线:正文 / 次级 / 三级文字在各自底色上都必须达到 4.5:1。
// 把它做成断言而不是靠肉眼:设计语言里最容易悄悄失守的就是低阶文字色。
//
// 状态色与点缀色同样会作为文字出现(错误提示、Do / Don't 标签、状态徽标),
// 也必须一并核算 —— 否则深色块漏配状态色时,对比度会静默跌破底线而测试照绿。
async function collectContrast(page: Page): Promise<{ name: string; ratio: number }[]> {
  return page.evaluate(() => {
    // CSS 变量返回的是 hex 字面量,这里统一转成 rgb 再算相对亮度。
    const hexToRgb = (hex: string): [number, number, number] => {
      const value = hex.replace('#', '').trim()
      return [
        Number.parseInt(value.slice(0, 2), 16),
        Number.parseInt(value.slice(2, 4), 16),
        Number.parseInt(value.slice(4, 6), 16),
      ]
    }
    const luminance = (rgb: readonly [number, number, number]): number => {
      const channel = (raw: number): number => {
        const scaled = raw / 255
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
    }
    const contrast = (foreground: string, background: string): number => {
      const a = luminance(hexToRgb(foreground))
      const b = luminance(hexToRgb(background))
      const lighter = Math.max(a, b)
      const darker = Math.min(a, b)
      return (lighter + 0.05) / (darker + 0.05)
    }

    // 状态 / 点缀色 → 各自的 subtle 底色,作为一组必须核算的色对。
    const statusColors: [string, string][] = [
      ['--dl-success', '--dl-success-subtle'],
      ['--dl-warning', '--dl-warning-subtle'],
      ['--dl-error', '--dl-error-subtle'],
      ['--dl-info', '--dl-info-subtle'],
      ['--dl-highlight', '--dl-highlight-subtle'],
    ]

    const pairs: { name: string; fg: string; bg: string }[] = []
    for (const element of Array.from(document.querySelectorAll('[data-dl-dir]'))) {
      const style = getComputedStyle(element)
      const surface = style.getPropertyValue('--dl-bg-base').trim()
      const card = style.getPropertyValue('--dl-bg-elevated').trim()
      for (const token of ['--dl-text-primary', '--dl-text-secondary', '--dl-text-tertiary']) {
        const fg = style.getPropertyValue(token).trim()
        pairs.push({ name: `${token} on bg-base`, fg, bg: surface })
        pairs.push({ name: `${token} on bg-elevated`, fg, bg: card })
      }
      for (const [fgToken, subtleToken] of statusColors) {
        const fg = style.getPropertyValue(fgToken).trim()
        const subtle = style.getPropertyValue(subtleToken).trim()
        pairs.push({ name: `${fgToken} on bg-base`, fg, bg: surface })
        pairs.push({ name: `${fgToken} on bg-elevated`, fg, bg: card })
        pairs.push({ name: `${fgToken} on its subtle`, fg, bg: subtle })
      }
    }
    return pairs.map((pair) => ({ ...pair, ratio: contrast(pair.fg, pair.bg) }))
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`文字与状态色对比度达到 4.5:1(${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    await waitForPage(page)

    const ratios = await collectContrast(page)
    expect(ratios.length).toBeGreaterThan(0)
    const failing = ratios.filter((entry) => entry.ratio < 4.5)
    expect(failing.map((entry) => `${entry.name}=${entry.ratio.toFixed(2)}`)).toEqual([])
  })
}

// WCAG 1.4.12:行高必须能被调到 1.5× 而不破版。这里验证正文行高本身已不低于 1.5。
test('正文行高不低于 WCAG 1.4.12 的 1.5 倍', async ({ page }) => {
  await page.goto('/')
  await waitForPage(page)

  const ratio = await page.evaluate(() => {
    const scope = document.querySelector('[data-dl-dir]')
    if (!scope) return null
    const probe = document.createElement('p')
    probe.textContent = '校验'
    probe.style.fontSize = 'var(--dl-font-size-md)'
    probe.style.lineHeight = 'var(--dl-line-body)'
    scope.appendChild(probe)
    const style = getComputedStyle(probe)
    const value = Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize)
    probe.remove()
    return value
  })

  expect(ratio).not.toBeNull()
  expect(ratio ?? 0).toBeGreaterThanOrEqual(1.5)
})

// 无障碍:系统开启"减少动态效果"时,动效必须被降级。
test('开启减少动态效果时动效被降级', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await waitForPage(page)

  const duration = await page.evaluate(() => {
    const button = document.querySelector('.material__btn')
    return button ? getComputedStyle(button).transitionDuration : null
  })

  expect(duration).not.toBeNull()
  // 降级后是 0.01ms(1e-05s),远小于任何正常时长
  expect(Number.parseFloat(duration ?? '1')).toBeLessThan(0.01)
})

// 四态可达:异步区块由真实 api 层驱动。
test('异步四态可达', async ({ page }) => {
  await page.goto('/')
  await waitForPage(page)

  await page.getByRole('button', { name: '空态' }).click()
  await expect(page.getByText('还没有样例记录。')).toBeVisible()

  await page.getByRole('button', { name: '失败态' }).click()
  // 必须定位异步区块自己的错误容器:页面里"组件样板"区块有一个常驻的 n-alert,
  // 用 role=alert 会立刻命中它,断言随之失去意义。
  await expect(page.locator('.stage__error')).toBeVisible()

  await page.getByRole('button', { name: '有数据' }).click()
  await expect(page.locator('.list__item').first()).toBeVisible()
})
