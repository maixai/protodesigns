import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 冒烟检查(Tier 1):只做确定性、零 LLM 判定的检查,每次改动后必跑,不阻塞交付。
//
// 与 tests/calibrate 的分工:
//   - tests/calibrate 是**本原型手写**的深度断言 + 像素基线,覆盖越深越费时;
//   - 本文件是**仓库级通用兜底**,任何原型(含新建的)复制样板目录即自动具备基础覆盖。
// 两者由 `make smoke` 一起跑(SMOKE=1 下像素比对降级为不判定,只留断言)。
//
// 判定标准只取「机械可判定」的那部分,依据 `.claude/rules/protodesign-baseline.md`
// ⑧ 节的 L1 区。需要人 / LLM 判断的项(信息层次、美学、a11y 语义)不在本文件范围。

// 首页逐个宽度核对;与 .claude/rules/baseline-web.md 的多宽度要求一致。
const HOME_WIDTHS = [375, 768, 1280, 1600] as const

// 站内路由只在两档极端宽度核对:冒烟要快,中间档交给 calibrate 的逐原型断言。
const ROUTE_WIDTHS = [375, 1600] as const

const VIEWPORT_HEIGHT = 900

// 从首页爬取的同源路由上限与深度:冒烟不做全站遍历。
const MAX_DISCOVERED_ROUTES = 8

// dummy 数据有 150-300ms 随机延迟,不等它落定就断言会产生假失败。
const SETTLE_MS = 400

// 横向溢出量:> 0 表示内容超出视口宽度,属于破版。
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

// 等 dummy 数据落定。用固定短等待而非 networkidle:后者在长连接 / 流式页面上不收敛。
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(SETTLE_MS)
}

// 收集运行时问题:未捕获异常、console error、4xx/5xx 响应、请求失败。
// 返回的是同一个数组引用,断言时能看到累积的全部问题。
//
// 注意 pageerror 与 console 是两条独立的通道:未捕获的 JS 异常**只**走 pageerror,
// 不会以 type='error' 出现在 console 事件里(实测 Playwright 1.63 + Chromium)。
// 只监听 console 会静默漏掉运行时崩溃 —— 那恰恰是本检查最该抓到的一类。
function collectRuntimeIssues(page: Page): string[] {
  const issues: string[] = []
  page.on('pageerror', (error) => {
    issues.push(`uncaught error: ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console.error: ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => {
    issues.push(`request failed: ${request.url()}`)
  })
  return issues
}

// 从当前页的链接里挑出同源、站内、非原生锚点的路由。
// 原生锚点(如首页的 #quickstart)不参与路由,导航过去只是滚动,重复检查同一页没有意义。
async function discoverSameOriginRoutes(page: Page): Promise<string[]> {
  const currentUrl = page.url()
  const origin = new URL(currentUrl).origin
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href]'), (element) => element.getAttribute('href')),
  )

  const routes = new Set<string>()
  for (const href of hrefs) {
    if (href === null || href.length === 0) continue
    if (/^(mailto|tel|javascript):/i.test(href)) continue

    const resolved = new URL(href, currentUrl)
    if (resolved.origin !== origin) continue
    if (resolved.hash !== '' && !resolved.hash.startsWith('#/')) continue
    if (resolved.href === currentUrl) continue

    routes.add(resolved.href)
    if (routes.size >= MAX_DISCOVERED_ROUTES) break
  }
  return [...routes]
}

test('首页在四个宽度下不破版,且无运行时问题', async ({ page }) => {
  const issues = collectRuntimeIssues(page)

  for (const width of HOME_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await page.goto('/')
    await settle(page)
    expect(await horizontalOverflow(page), `首页在 ${width}px 出现横向溢出`).toBeLessThanOrEqual(0)
  }

  expect(issues, '首页存在运行时问题').toEqual([])
})

test('首页可达的站内路由无运行时问题、不破版', async ({ page }) => {
  const issues = collectRuntimeIssues(page)

  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await settle(page)

  const routes = await discoverSameOriginRoutes(page)
  for (const route of routes) {
    await page.goto(route)
    await settle(page)
    for (const width of ROUTE_WIDTHS) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      expect(
        await horizontalOverflow(page),
        `${route} 在 ${width}px 出现横向溢出`,
      ).toBeLessThanOrEqual(0)
    }
  }

  expect(issues, '站内路由存在运行时问题').toEqual([])
})
