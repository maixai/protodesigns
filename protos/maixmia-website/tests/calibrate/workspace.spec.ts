import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const WIDTHS = [375, 768, 1024, 1280, 1600]
const VIEWPORT_HEIGHT = 900

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

async function login(page: Page, loginLabel = '登录'): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: loginLabel, exact: true }).click()
  await expect(page).toHaveURL(/#\/workspace$/)
}

async function waitForStable(page: Page, state = 'ready', title = '工作台'): Promise<void> {
  await expect(page.getByRole('log')).toHaveAttribute('data-state', state)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect.poll(() => page.locator('.workspace-page').evaluate((element) => getComputedStyle(element).fontSize)).toBe('15px')
  await page.evaluate(async () => { await document.fonts.ready })
}

async function expectComposerUnclipped(page: Page): Promise<void> {
  const input = page.getByRole('textbox')
  await expect(input).toHaveValue('')
  await expect(input).toHaveAttribute('id', 'workspace-composer')
  await expect(input).toHaveAttribute('name', 'workspace-composer')
  await expect.poll(() => input.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(0)
  const bounds = await input.boundingBox()
  expect(bounds?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
}

async function expectEmptyAtTop(page: Page): Promise<void> {
  const log = page.getByRole('log')
  await expect(log).toHaveAttribute('data-state', 'empty')
  // 等数据请求结束，避免在加载逻辑设置最终滚动落点前误判通过。
  await expect(page.locator('.sidebar-loading')).toHaveCount(0)
  // scrollTop 归零在 375 / 1280 / 1600 是有约束力的（这三档空态内容高于容器，
  // 可滚 33–84px，一旦回退成「贴底」就不再为 0）；768 档空态内容不高于容器、
  // 不可滚，该断言在这一档结构性成立，不构成覆盖。
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(0)
  // 此处刻意不断言「空态不出现『回到底部』按钮」：该按钮的渲染条件是
  // status === 'ready'，而空态 status 恒为 'empty'，断言它必然为 0 是同义反复、
  // 永远不会失败，只会伪装成覆盖。该按钮的显隐由 ready 态承担 —— 见下方
  // 「error 重试后贴底」与「手动上滚锁定位置…」两处用例。
  const heading = log.getByRole('heading').first()
  await expect(heading).toBeVisible()
  const containerRect = await log.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top + element.clientTop, bottom: rect.top + element.clientTop + element.clientHeight }
  })
  const headingRect = await heading.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  })
  expect(headingRect.top).toBeGreaterThanOrEqual(containerRect.top)
  expect(headingRect.bottom).toBeLessThanOrEqual(containerRect.bottom)
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

async function tabTo(page: Page, target: Locator): Promise<void> {
  for (const attempt of Array.from({ length: 25 }, (_, index) => index)) {
    if (await target.evaluate((element) => element === document.activeElement)) return
    await page.keyboard.press('Tab')
    if (attempt === 24) await expect(target).toBeFocused()
  }
}

async function contrastViolations(page: Page): Promise<string[]> {
  return page.locator('.workspace-page').evaluate((root) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) return ['Canvas unavailable']
    const rgba = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const luminance = (color: number[]): number => {
      const channels = color.slice(0, 3).map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722
    }
    return Array.from(root.querySelectorAll<HTMLElement>('*')).flatMap((element) => {
      if (element.closest('[aria-hidden="true"], [inert], :disabled, [aria-disabled="true"], svg')) return []
      if (!Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())) return []
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (!rect.width || !rect.height || rect.right <= 0 || style.visibility === 'hidden') return []
      const layers: HTMLElement[] = [element]
      const ancestry = { parent: element.parentElement }
      while (ancestry.parent) { layers.push(ancestry.parent); ancestry.parent = ancestry.parent.parentElement }
      const background = layers.reverse().reduce<number[]>((under, layer) => {
        const over = rgba(getComputedStyle(layer).backgroundColor)
        const alpha = (over[3] ?? 0) / 255
        return [0, 1, 2].map((index) => (over[index] ?? 0) * alpha + (under[index] ?? 0) * (1 - alpha))
      }, [255, 255, 255])
      const foregroundLuminance = luminance(rgba(style.color))
      const backgroundLuminance = luminance(background)
      const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      return ratio < 4.5 ? [`${element.className}: ${ratio.toFixed(2)}`] : []
    })
  })
}

for (const width of WIDTHS) {
  test(`有数据态 @${width}：布局、触达、对比度、运行健康与截图`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    await expect(page.getByRole('textbox', { name: '给 Mia 的消息' })).toBeVisible()
    if (width === 375) await expectComposerUnclipped(page)
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toHaveAttribute('aria-disabled', 'true')
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
    expect(await contrastViolations(page)).toEqual([])
    const dimensions = await page.locator('.workspace-page button:visible').evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    for (const dimensionsItem of dimensions) {
      expect(dimensionsItem.width).toBeGreaterThanOrEqual(44)
      expect(dimensionsItem.height).toBeGreaterThanOrEqual(44)
    }
    if (width < 1024) await expect(page.getByRole('button', { name: '打开对话列表' })).toBeVisible()
    else await expect(page.locator('.session-item')).toHaveCount(4)
    await expect(page).toHaveScreenshot(`workspace-ready-${width}.png`, { fullPage: true })
    expect(errors).toEqual([])
  })

  for (const state of ['empty', 'error']) {
    test(`${state} 可寻址 @${width}：不溢出与可操作`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await login(page)
      await page.goto(`/#/workspace?s=${state}`)
      await waitForStable(page, state)
      if (width === 375) await expectComposerUnclipped(page)
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
      expect(await contrastViolations(page)).toEqual([])
      if (state === 'empty') await expectEmptyAtTop(page)
      if (width === 1280) {
        await expect(page.locator('.sidebar-loading')).toHaveCount(0)
        await expect(page).toHaveScreenshot(`workspace-${state}-${width}.png`, { fullPage: true })
      }
      await page.screenshot({ path: testInfo.outputPath(`${state}-${width}.png`) })
      if (state === 'error') {
        await page.getByRole('button', { name: '重试', exact: true }).click()
        await waitForStable(page)
        await expect(page).toHaveURL(/#\/workspace$/)
        await expect.poll(() => page.getByRole('log').evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThanOrEqual(1)
        await expect(page.getByRole('button', { name: '回到底部' })).toHaveCount(0)
      } else {
        const suggestions = page.locator('.suggestion-card')
        await expect(suggestions).toHaveCount(3)
        await suggestions.first().click()
        await expect(page.getByRole('textbox')).toHaveValue('帮我把团队知识库整理工作拆成一周内可执行的计划。')
        await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
      }
    })
  }
}

test.describe('英文窄屏与无障碍回归', () => {
  test.use({ locale: 'en-US' })

  for (const state of ['ready', 'empty', 'error']) {
    test(`375px 英文 ${state}：占位文案完整与截图`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
      await login(page, 'Sign in')
      await waitForStable(page, 'ready', 'Workspace')
      if (state !== 'ready') await page.goto(`/#/workspace?s=${state}`)
      await waitForStable(page, state, 'Workspace')
      await expectComposerUnclipped(page)
      if (state === 'empty') await expectEmptyAtTop(page)
      await expect(page).toHaveScreenshot(`workspace-${state}-375-en.png`, { fullPage: true })
      await expectComposerUnclipped(page)
      if (state === 'empty') await expectEmptyAtTop(page)
      if (state === 'error') {
        await page.getByRole('button', { name: 'Retry', exact: true }).click()
        await waitForStable(page, 'ready', 'Workspace')
        await expect.poll(() => page.getByRole('log').evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThanOrEqual(1)
        await expect(page.getByRole('button', { name: 'Back to bottom' })).toHaveCount(0)
      }
    })
  }

  test('1280px 英文空态：落顶部且标题完整可见', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
    await login(page, 'Sign in')
    await page.goto('/#/workspace?s=empty')
    await waitForStable(page, 'empty', 'Workspace')
    await expectEmptyAtTop(page)
  })

  for (const width of [375, 1280]) {
    test(`地标内可访问名不重复 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await login(page, 'Sign in')
      await waitForStable(page, 'ready', 'Workspace')
      await expect(page.getByRole('heading', { name: 'Workspace', exact: true })).toHaveCount(1)
      await expect(page.getByRole('region', { name: 'Workspace', exact: true })).toHaveCount(0)
      if (width === 375) await page.getByRole('button', { name: 'Open conversation list' }).click()
      const sidebar = page.getByRole(width === 375 ? 'dialog' : 'complementary', { name: 'Recent conversations', exact: true })
      await expect(sidebar).toBeVisible()
      await expect(sidebar.locator('h2')).toBeVisible()
      await expect(sidebar.locator('h2')).toHaveAttribute('aria-hidden', 'true')
      await expect(sidebar.getByRole('heading', { name: 'Recent conversations', exact: true })).toHaveCount(0)
      await expect(sidebar.getByRole('navigation', { name: 'Recent conversations', exact: true })).toHaveCount(0)
      await expect(sidebar.getByRole('button')).not.toHaveCount(0)
    })
  }
})

test('键盘发送、空按钮可聚焦、Shift+Enter 与输入框自动增高', async ({ page }) => {
  await login(page)
  await waitForStable(page)
  const input = page.getByRole('textbox', { name: '给 Mia 的消息' })
  const send = page.getByRole('button', { name: '发送消息', exact: true })
  await tabTo(page, input)
  await expect(input).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(send).toBeFocused()
  await expect(send).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Enter')
  await expect(page.locator('.chat-message')).toHaveCount(4)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('Please prepare a demo checklist.')
  await page.keyboard.press('Enter')
  await expect(page.locator('.chat-message.user').last()).toContainText('Please prepare a demo checklist.')
  await expect(page.getByRole('status')).toHaveText('已生成')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(input).not.toHaveAttribute('readonly', '')
  const before = (await input.boundingBox())?.height ?? 0
  await page.keyboard.type('first line')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('second line')
  await expect(input).toHaveValue('first line\nsecond line')
  await expect(page.locator('.chat-message')).toHaveCount(6)
  expect((await input.boundingBox())?.height ?? 0).toBeGreaterThan(before)
  await input.fill('line\n'.repeat(10))
  const size = await input.evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight }))
  expect(size.scroll).toBeGreaterThan(size.client)
})

test('手动上滚锁定位置，追加消息不抢滚动，返回底部恢复粘底', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 700 })
  await login(page)
  await waitForStable(page)
  const log = page.getByRole('log')
  // 贴底时不应出现「回到底部」。与空态那次断言不同，这条是真能失败的：
  // 同一次用例里手动上滚后该按钮就会渲染出来（见下方断言），故不构成同义反复。
  await expect(page.getByRole('button', { name: '回到底部' })).toHaveCount(0)
  await log.focus()
  await page.keyboard.press('Home')
  await expect(page.getByRole('button', { name: '回到底部' })).toBeVisible()
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(0)
  const input = page.getByRole('textbox')
  await input.fill('请继续细化准备工作。')
  await input.press('Enter')
  await expect(page.getByRole('status')).toHaveText('已生成')
  expect(await log.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: '回到底部' }).click()
  await expect(page.getByRole('button', { name: '回到底部' })).toHaveCount(0)
  await expect.poll(() => log.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1)
})

for (const width of [375, 768]) {
  test(`抽屉键盘、焦点圈定、Esc 还焦与遮罩 @${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await login(page)
    await waitForStable(page)
    const trigger = page.getByRole('button', { name: '打开对话列表' })
    await tabTo(page, trigger)
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: '最近对话' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '新建对话' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.locator('.session-item').last()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: '新建对话' })).toBeFocused()
    expect(await contrastViolations(page)).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`drawer-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await page.keyboard.press('Enter')
    await page.mouse.click(width - 10, 400)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
}

test('加载骨架、新建与会话切换', async ({ page }, testInfo) => {
  await login(page)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'loading')
  await expect(page.locator('.transcript-loading .n-skeleton').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('loading.png') })
  await waitForStable(page)
  await page.locator('.session-item').nth(1).click()
  await expect(page.locator('.chat-message')).toHaveCount(2)
  await expect(page.locator('.session-item').nth(1)).toHaveAttribute('aria-current', 'true')
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await page.getByRole('textbox').fill('请帮我准备访谈提纲。')
  await page.getByRole('textbox').press('Enter')
  await expect(page.getByRole('status')).toHaveText('已生成')
  await expect(page.locator('.session-item')).toHaveCount(5)
  await expect(page.locator('.session-item').first()).toContainText('请帮我准备访谈提纲。')
})

test('真实动效路径：排队、光标、流式、停止保留、重新生成与完成', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 768, height: 700 })
  await login(page)
  await waitForStable(page)
  const input = page.getByRole('textbox')
  await input.fill('请帮我把任务再拆细一点。')
  await input.press('Enter')
  await expect(page.getByRole('status')).toHaveText('正在思考…')
  await expect(page.locator('.stream-cursor')).toBeVisible()
  const response = page.locator('.chat-message.assistant').last()
  await expect(response).toHaveAttribute('aria-live', 'off')
  await expect.poll(async () => (await response.locator('.message-body').innerText()).length).toBeGreaterThan(30)
  await page.screenshot({ path: testInfo.outputPath('streaming.png') })
  await page.getByRole('log').hover()
  await page.mouse.wheel(0, -800)
  await expect(page.getByRole('button', { name: '回到底部' })).toBeVisible()
  const top = await page.getByRole('log').evaluate((element) => element.scrollTop)
  await expect.poll(async () => (await response.locator('.message-body').innerText()).length).toBeGreaterThan(100)
  expect(await page.getByRole('log').evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(top + 1)
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.getByRole('status')).toHaveText('已停止，已保留生成的内容')
  const partial = await response.locator('.message-body').innerText()
  expect(partial.length).toBeGreaterThan(0)
  await expect(page.locator('.stream-cursor')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新生成' })).toBeEnabled()
  await expect(response.locator('.message-body')).toHaveText(partial)
  await page.getByRole('button', { name: '回到底部' }).click()
  await page.getByRole('button', { name: '重新生成' }).click()
  await expect(page.locator('.stream-cursor')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('已生成', { timeout: 15_000 })
  expect((await response.locator('.message-body').innerText()).length).toBeGreaterThan(partial.length)
  await page.screenshot({ path: testInfo.outputPath('complete.png') })
  const trigger = page.getByRole('button', { name: '打开对话列表' })
  await tabTo(page, trigger)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: '最近对话' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})

test('空态发送回到正常路由，切语言保留新对话', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 })
  await login(page)
  await page.goto('/#/workspace?s=empty')
  await waitForStable(page, 'empty')
  await expectEmptyAtTop(page)
  await page.locator('.suggestion-card').first().click()
  await page.getByRole('textbox').press('Enter')
  await expect(page.getByRole('status')).toHaveText('已生成')
  await expect(page).toHaveURL(/#\/workspace$/)
  await expect.poll(() => page.getByRole('log').evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: '回到底部' })).toHaveCount(0)
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await page.getByRole('button', { name: /English/ }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('log')).toContainText('帮我把团队知识库整理工作')
  await expect(page.getByRole('log')).toContainText('Let’s turn the goal into a draft')
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})

test('生成时打开抽屉跳过禁用按钮，Esc 返回入口', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 375, height: 900 })
  await login(page)
  await waitForStable(page)
  await page.getByRole('textbox').fill('整理一下这份计划。')
  await page.getByRole('textbox').press('Enter')
  await expect(page.locator('.stream-cursor')).toBeVisible()
  const trigger = page.getByRole('button', { name: '打开对话列表' })
  await trigger.click()
  await expect(page.getByRole('button', { name: '关闭对话列表' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.getByRole('status')).toHaveText('已停止，已保留生成的内容')
})

test('切换语言重取历史，生成中延后刷新，不丢用户输入', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await login(page)
  await waitForStable(page)
  const input = page.getByRole('textbox')
  await input.fill('保留我输入的中文。')
  await input.press('Enter')
  await expect(page.locator('.stream-cursor')).toBeVisible()
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await page.getByRole('button', { name: /English/ }).click()
  await expect(page.locator('.stream-cursor')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Response complete', { timeout: 15_000 })
  await expect(page.getByRole('log')).toContainText('Let’s turn the goal into a draft')
  await expect(page.getByRole('log')).toContainText('保留我输入的中文。')
  await expect(page.locator('.session-item').first()).toContainText('Turn project updates into an action plan')
})
