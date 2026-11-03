import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { unlockDemoIdentity } from '../calibrate/identity-helpers'

// tests/quick 的最小登录与就绪辅助:
// 只保留日常快检需要的路径,不复制 calibrate 里的视觉/几何等待逻辑。
export async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await unlockDemoIdentity(page)
  await expect(page).toHaveURL(/#\/workspace$/)
}

export async function waitForWorkspace(page: Page): Promise<void> {
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('把项目周报整理成行动清单')
}

// 收集运行时问题:未捕获异常、console error、失败请求。
// 与 tests/smoke 同源,但这里只覆盖本次改动涉及的页面,不重复全站遍历。
export function collectRuntimeIssues(page: Page): string[] {
  const issues: string[] = []
  page.on('pageerror', (error) => { issues.push(`uncaught error: ${error.message}`) })
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console.error: ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) issues.push(`HTTP ${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => { issues.push(`request failed: ${request.url()}`) })
  return issues
}

// 设置窗体:动作区与头部按钮的完整命中矩形内,最上层必须是按钮自身或其子元素。
// 手柄在 DOM 中排在表面之后,只靠几何避让会在 padding 变化 / 按钮换行时重新重叠;
// 这里验的是层序:按钮四角的内侧、四边中点与中心做 elementFromPoint,结果不得落到 resize 手柄上。
// 按钮自身有圆角,矩形的 1px 角点按 CSS 命中规则本就属于圆角之外,故角点取四分之一内缩。
export async function expectDialogButtonHitPriority(dialog: Locator): Promise<void> {
  const result = await dialog.evaluate((element) => {
    const buttons = Array.from(element.querySelectorAll<HTMLElement>(
      '.dl-dialog__actions button, .dl-dialog__controls button',
    ))
    const misses: string[] = []
    for (const button of buttons) {
      const rect = button.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) continue
      const quarterX = rect.width / 4
      const quarterY = rect.height / 4
      const points: [number, number][] = [
        [rect.left + quarterX, rect.top + quarterY],
        [rect.right - quarterX, rect.top + quarterY],
        [rect.left + quarterX, rect.bottom - quarterY],
        [rect.right - quarterX, rect.bottom - quarterY],
        [rect.left + rect.width / 2, rect.top + 1],
        [rect.left + rect.width / 2, rect.bottom - 1],
        [rect.left + 1, rect.top + rect.height / 2],
        [rect.right - 1, rect.top + rect.height / 2],
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
      ]
      for (const [x, y] of points) {
        const hit = document.elementFromPoint(x, y)
        if (hit === null || !(hit === button || button.contains(hit))) {
          const label = button.textContent?.trim() || button.getAttribute('aria-label') || 'button'
          misses.push(`${label} @ ${Math.round(x)},${Math.round(y)}`)
        }
      }
    }
    return { count: buttons.length, misses }
  })
  expect(result.count).toBeGreaterThan(0)
  expect(result.misses).toEqual([])
}

// 设置窗体:静止态没有常驻抓手;边带悬停的强调沿表面圆角轮廓着色,手柄自身不铺色块。
export async function expectDialogResizeCue(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog.locator('.dl-dialog__resize-grip')).toHaveCount(0)
  expect(await dialog.locator('.dl-dialog__resize--corner').evaluateAll(
    (corners) => corners.map((corner) => corner.childElementCount),
  )).toEqual([0, 0, 0, 0])

  const surface = dialog.locator('.dl-dialog__surface')
  const before = await surface.evaluate((element) => getComputedStyle(element).borderTopColor)
  const east = await dialog.locator('.dl-dialog__resize--e').boundingBox()
  if (east === null) throw new Error('east resize handle missing')
  await page.mouse.move(east.x + east.width / 2, east.y + east.height / 2)
  // 圆角轮廓由表面自身绘制,强调只能是它的描边 / 焦点环,不能是手柄的方形底色。
  await expect.poll(() => surface.evaluate((element) => getComputedStyle(element).borderTopColor)).not.toBe(before)
  const wash = await dialog.locator('.dl-dialog__resize--e').evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(wash).toBe('rgba(0, 0, 0, 0)')
  await page.mouse.move(0, 0)
}

// 设置窗体:动作按钮之外的右下角外侧角落仍能发起缩放(向内收,避免撞上尺寸上限)。
export async function expectDialogOutsideCornerResize(page: Page, dialog: Locator): Promise<void> {
  const before = await dialog.boundingBox()
  if (before === null) throw new Error('dialog frame missing')
  const start = { x: before.x + before.width - 6, y: before.y + before.height - 6 }
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    return element instanceof Element ? String(element.className) : ''
  }, start)
  expect(hit).toContain('dl-dialog__resize--se')

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 40, start.y - 40, { steps: 5 })
  await page.mouse.up()
  const after = await dialog.boundingBox()
  if (after === null) throw new Error('dialog frame missing after resize')
  expect(after.width).toBeLessThan(before.width - 20)
  expect(after.height).toBeLessThan(before.height - 20)
}
