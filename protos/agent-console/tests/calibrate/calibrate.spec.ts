import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 设计校准:宽度清单与 .claude/rules/baseline-web.md 的多宽度要求一致。
const WIDTHS = [375, 768, 1280, 1600] as const
const VIEWPORT_HEIGHT = 900
// 首次点击的示例指令:与 src/agent/script.ts 的 EXAMPLE_PROMPTS 首条一致。
const FIRST_EXAMPLE = /强调色统一成青瓷绿/
// 一次完整脚本会话约 8-10 秒,涉及审批的用例给足上限。
const SESSION_TIMEOUT = 60_000

// 横向溢出量:> 0 表示内容超出视口宽度,属于破版。
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

// 等待连接握手完成、进入空白会话态:连接中约 700ms,不等待会截到骨架屏。
async function waitForReady(page: Page): Promise<void> {
  await expect(page.getByTestId('console')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('session-empty')).toBeVisible()
  await expect(page.getByTestId('prompt-input')).toBeEnabled()
}

// 从空态发起一轮会话,并等到转录流渲染出用户回显。
async function startSession(page: Page): Promise<void> {
  await waitForReady(page)
  await page.getByRole('button', { name: FIRST_EXAMPLE }).click()
  await expect(page.getByTestId('user-echo')).toBeVisible()
}

// 走到审批阻塞点:此时 4 次工具调用全部落定,后续内容尚未产生。
async function reachApproval(page: Page): Promise<void> {
  await startSession(page)
  await expect(page.getByTestId('approval-row')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('tool-row')).toHaveCount(4)
}

for (const width of WIDTHS) {
  test.describe(`宽度 ${width}px`, () => {
    test('浅色空态不破版', async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto('/')
      await waitForReady(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      await expect(page).toHaveScreenshot(`console-empty-${width}-light.png`)
    })

    test('深色空态不破版', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto('/')
      await waitForReady(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
      await expect(page).toHaveScreenshot(`console-empty-${width}-dark.png`)
    })
  })
}

test('四态可达:连接中 / 失败 / 重试回到空态', async ({ page }) => {
  await page.goto('/')
  await waitForReady(page)

  // 重连演示:连接中 → 失败。
  await page.getByRole('button', { name: '重连' }).click()
  await expect(page.getByTestId('console')).toHaveAttribute('data-state', 'connecting')
  await expect(page.getByTestId('session-connecting')).toBeVisible()
  await expect(page.getByTestId('session-error')).toBeVisible()
  await expect(page.getByText('连接失败')).toBeVisible()

  // 重试:回到空态。
  await page.getByRole('button', { name: '重试' }).click()
  await expect(page.getByTestId('session-empty')).toBeVisible()
})

test('空态点击示例指令:转录流出现用户回显与思考区', async ({ page }) => {
  await page.goto('/')
  await startSession(page)

  await expect(page.getByTestId('transcript')).toBeVisible()
  await expect(page.getByTestId('user-echo')).toContainText('强调色统一成青瓷绿')
  await expect(page.getByTestId('thinking-block')).toBeVisible()
})

test('思考过程可展开与收起', async ({ page }) => {
  await page.goto('/')
  await startSession(page)

  const block = page.getByTestId('thinking-block')
  await expect(block).toBeVisible()
  const toggle = block.getByRole('button')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(block.getByText('定位主题与 design token 模块')).toBeVisible()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(block.getByText('定位主题与 design token 模块')).toBeHidden()
})

test('工具调用行可展开查看参数与结果', async ({ page }) => {
  await page.goto('/')
  await startSession(page)

  const readRow = page.locator('[data-tool-name="Read"]')
  await expect(readRow).toBeVisible()
  const toggle = readRow.getByRole('button').first()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')

  await toggle.click()
  const detail = readRow.getByTestId('tool-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('src/theme.ts')
  await expect(detail).toContainText('themeOverrides')
})

test('Edit 结果渲染为带行号的 unified diff', async ({ page }) => {
  test.setTimeout(SESSION_TIMEOUT)
  await page.goto('/')
  await startSession(page)

  const editRow = page.locator('[data-tool-name="Edit"]')
  await expect(editRow).toBeVisible({ timeout: 20_000 })
  await editRow.getByRole('button').first().click()

  const diff = editRow.getByTestId('diff-view')
  await expect(diff).toBeVisible()

  const added = diff.locator('.diff__line--added')
  const removed = diff.locator('.diff__line--removed')
  await expect(added).toHaveCount(2)
  await expect(removed).toHaveCount(2)
  await expect(added.first()).toContainText("primaryColor: '#2e6f63'")
  await expect(removed.first()).toContainText("primaryColor: '#3f8a7c'")

  // 新增行与删除行的底色必须不同(绿 / 红区分)。
  const addedBackground = await added.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  const removedBackground = await removed
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(addedBackground).not.toBe(removedBackground)
})

test('失败的 Bash 调用显示失败态与退出码', async ({ page }) => {
  test.setTimeout(SESSION_TIMEOUT)
  await page.goto('/')
  await startSession(page)

  const bashRow = page.locator('[data-tool-name="Bash"]').first()
  await expect(bashRow).toBeVisible({ timeout: 25_000 })
  await expect(bashRow).toContainText('失败')
  await expect(bashRow).toContainText('退出码 1')
})

test('审批真阻塞:未响应前不产生后续内容,点击批准后继续', async ({ page }) => {
  test.setTimeout(SESSION_TIMEOUT)
  await page.goto('/')
  await reachApproval(page)

  // 审批按钮存在。
  await expect(page.getByRole('button', { name: '[y] 批准' })).toBeVisible()
  await expect(page.getByRole('button', { name: '[n] 拒绝' })).toBeVisible()

  // 阻塞验证:静置一段时间,工具行数量不变(推送尚未发生)。
  await page.waitForTimeout(800)
  await expect(page.getByTestId('tool-row')).toHaveCount(4)

  // 点击批准:回显选择,并出现第 5 次工具调用(推送)。
  await page.getByRole('button', { name: '[y] 批准' }).click()
  await expect(page.getByTestId('user-echo').last()).toContainText('y')
  await expect(page.getByTestId('tool-row')).toHaveCount(5, { timeout: 15_000 })
  await expect(page.getByText('已推送到 main,本轮改动完成。')).toBeVisible({ timeout: 15_000 })
})

test('键盘 n 走拒绝分支', async ({ page }) => {
  test.setTimeout(SESSION_TIMEOUT)
  await page.goto('/')
  await reachApproval(page)

  await page.keyboard.press('n')
  await expect(page.getByTestId('user-echo').last()).toContainText('n')
  await expect(page.getByText('已取消推送,改动保留在本地工作区,需要时再告诉我。')).toBeVisible({
    timeout: 15_000,
  })
  // 拒绝分支不应产生推送调用。
  await expect(page.getByTestId('tool-row')).toHaveCount(4)
})

test('键盘 y 走批准分支', async ({ page }) => {
  test.setTimeout(SESSION_TIMEOUT)
  await page.goto('/')
  await reachApproval(page)

  await page.keyboard.press('y')
  await expect(page.getByTestId('user-echo').last()).toContainText('y')
  await expect(page.getByTestId('tool-row')).toHaveCount(5, { timeout: 15_000 })
})

test('生成中按 esc 中断,已生成内容保留并标记已中断', async ({ page }) => {
  test.setTimeout(SESSION_TIMEOUT)
  await page.goto('/')
  await startSession(page)

  // 等到 agent 文本正在流式吐字的那一刻,再按 Esc,确保命中"中断生成"。
  const streaming = page.locator('[data-testid="assistant-text"][data-streaming="true"]')
  await expect(streaming).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')

  await expect(page.getByTestId('console')).toHaveAttribute('data-generating', 'false')
  await expect(page.locator('.stream__interrupted')).toBeVisible()
  await expect(page.getByTestId('transcript')).toBeVisible()
  await expect(page.getByTestId('user-echo')).toContainText('强调色统一成青瓷绿')
})

// 把转录流滚回顶部,让截图覆盖开头部分。
async function scrollTranscriptToTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const body = document.querySelector('.console__body')
    if (body instanceof HTMLElement) {
      body.scrollTop = 0
    }
  })
}

test('会话完成后的转录流(浅色)截图', async ({ page }) => {
  test.setTimeout(SESSION_TIMEOUT)
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await reachApproval(page)
  await page.getByRole('button', { name: '[n] 拒绝' }).click()
  await expect(page.getByTestId('console')).toHaveAttribute('data-generating', 'false', {
    timeout: 15_000,
  })

  // 展开 Edit 的 diff,并滚回顶部,让截图覆盖完整转录流开头。
  await page.locator('[data-tool-name="Edit"]').getByRole('button').first().click()
  await scrollTranscriptToTop(page)
  await expect(page).toHaveScreenshot('console-session-1280-light.png')
})

test('会话完成后的转录流(深色)截图', async ({ page }) => {
  test.setTimeout(SESSION_TIMEOUT)
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await reachApproval(page)
  await page.getByRole('button', { name: '[n] 拒绝' }).click()
  await expect(page.getByTestId('console')).toHaveAttribute('data-generating', 'false', {
    timeout: 15_000,
  })

  await page.locator('[data-tool-name="Edit"]').getByRole('button').first().click()
  await scrollTranscriptToTop(page)
  await expect(page).toHaveScreenshot('console-session-1280-dark.png')
})
