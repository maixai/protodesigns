import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { collectRuntimeIssues, expectDialogButtonHitPriority, expectDialogOutsideCornerResize, expectDialogResizeCue, login, waitForWorkspace } from './helpers'
import { unlockDemoIdentity } from '../calibrate/identity-helpers'

// 统一项目设置窗体:一个 dialog、一个 Tab 控件(模型 / 权限 / 插件 / MCP)、一个底部动作区;
// 保存只作用于当前域,关闭前对未保存的域先确认。
test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

async function openSettings(page: Page) {
  const trigger = page.locator('.project-item').first().locator('.project-menu__trigger')
  await trigger.click()
  await page.getByRole('menuitem', { name: '项目设置：weekly-report', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '项目设置 · weekly-report', exact: true })
  await expect(dialog).toBeVisible()
  return { trigger, dialog }
}

// Tab 的可访问名会带「有未保存的更改」等状态后缀,故按固定顺序取,不按名字精确匹配。
const TAB_INDEX: Record<string, number> = { 模型: 0, 权限: 1, 插件: 2, MCP: 3 }

async function selectTab(page: Page, dialog: Locator, name: string) {
  await dialog.locator('.project-settings__tablist [role="tab"]').nth(TAB_INDEX[name] ?? 0).click()
}

async function discardDrafts(page: Page, dialog: Locator, domains: string) {
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '有未保存的更改', exact: true })
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText(domains)
  await confirm.getByRole('button', { name: '放弃更改并关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
}

test('@area:project-settings 项目模型在统一窗体内切换,保存当前域;Esc 先确认再丢弃', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { trigger, dialog } = await openSettings(page)

  // 正文第一个可交互元素就是模式开关;上方没有说明段落或 Agent 只读区块。
  const modelPanel = dialog.locator('.project-model')
  const firstInteractive = modelPanel.locator('button, input, select, textarea').first()
  await expect(firstInteractive).toHaveAttribute('role', 'radio')
  await expect(firstInteractive).toHaveText('跟随 Agent')

  await dialog.getByRole('radio', { name: '跟随 Agent', exact: true }).click()
  const summary = dialog.locator('.follow-summary[data-kind="model"]')
  await expect(summary).toContainText('Agent 当前生效配置')
  await expect(summary).toContainText('Claude Sonnet 5.5')
  await expect(summary).toContainText('回退')
  await expect(modelPanel.locator('input, select, textarea')).toHaveCount(0)
  await expect(modelPanel.locator('[data-section]')).toHaveCount(0)

  await dialog.getByRole('radio', { name: '自定义', exact: true }).click()
  await expect(summary).toHaveCount(0)
  await expect(modelPanel.locator('[data-section]')).toHaveCount(3)
  await dialog.locator('[data-section="model"]').click()
  await dialog.locator('select[id$="-effort"]').selectOption('max')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'saved')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  const reopened = await openSettings(page)
  await reopened.dialog.locator('[data-section="model"]').click()
  await expect(reopened.dialog.locator('select[id$="-effort"]')).toHaveValue('max')
  await reopened.dialog.locator('select[id$="-effort"]').selectOption('low')

  // 有草稿时 Esc 不再静默丢弃:先弹确认层,确认层自己的 Esc 只关确认层。
  await page.keyboard.press('Escape')
  const confirm = page.getByRole('alertdialog', { name: '有未保存的更改', exact: true })
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('模型')
  await expect(confirm.getByRole('button', { name: '继续编辑', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(reopened.dialog).toBeVisible()

  // 放弃后才关闭,重新打开回到已保存的值。
  await discardDrafts(page, reopened.dialog, '模型')
  const discarded = await openSettings(page)
  await discarded.dialog.locator('[data-section="model"]').click()
  await expect(discarded.dialog.locator('select[id$="-effort"]')).toHaveValue('max')
  await expect(discarded.dialog.locator('textarea')).toHaveCount(0)
  await expect(discarded.dialog).not.toContainText('.mcp.json')
  await discarded.dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(discarded.dialog).toBeHidden()
  expect(issues).toEqual([])
})

test('@area:project-settings 项目权限在 Tab 内切换后草稿保留,保存前不落库', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)
  await selectTab(page, dialog, '权限')

  const permissionPanel = dialog.locator('.project-permission')
  const firstInteractive = permissionPanel.locator('button, input, select, textarea').first()
  await expect(firstInteractive).toHaveAttribute('role', 'radio')
  await expect(firstInteractive).toHaveText('跟随 Agent')

  const editor = dialog.locator('.permission-editor[data-scope="project"]')
  await expect(editor).toBeVisible()

  // 跟随态只读:模式与三类规则计数可见,编辑器与全部编辑控件不渲染。
  await dialog.getByRole('radio', { name: '跟随 Agent', exact: true }).click()
  const summary = dialog.locator('.follow-summary[data-kind="permissions"]')
  await expect(summary).toContainText('默认权限模式')
  await expect(summary).toContainText('自动')
  await expect(summary).toContainText('允许 3 · 拒绝 2 · 询问 2')
  await expect(editor).toHaveCount(0)
  await expect(permissionPanel.locator('input, select, textarea')).toHaveCount(0)
  await summary.getByRole('button', { name: '查看 Agent 规则明细', exact: true }).click()
  await expect(summary).toContainText('Read(./.env)')

  // 切回自定义:编辑器重新挂载,项目草稿值仍在。
  await dialog.getByRole('radio', { name: '自定义', exact: true }).click()
  await expect(editor).toBeVisible()

  const initialRuleTabs = dialog.getByRole('tablist', { name: '权限规则分组', exact: true }).getByRole('tab')
  await expect(initialRuleTabs).toHaveCount(3)
  expect(await initialRuleTabs.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-rule-kind')))).toEqual(['allow', 'deny', 'ask'])
  await expect(initialRuleTabs).toHaveText(['允许2', '拒绝1', '询问1'])

  const projectMode = editor.locator('[data-mode-trigger]')
  await expect(projectMode).toHaveAccessibleName('模式 仅按规则')
  await expect(projectMode).toHaveText('仅按规则')
  await projectMode.click()
  const inheritOption = editor.getByRole('listbox', { name: '模式', exact: true }).locator('[data-mode="inherit"]')
  await expect(inheritOption).toContainText('使用 Agent 的默认权限模式，不在项目级覆盖。')
  await inheritOption.click()
  await expect(projectMode).toHaveText('继承 Agent')
  await expect(dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'dirty')

  await initialRuleTabs.nth(2).click()
  const ask = editor.locator('.permissions-rules[data-kind="ask"]')
  await ask.getByRole('button', { name: '为「weekly-report」添加询问规则', exact: true }).click()
  await expect(editor.getByLabel('「weekly-report」的询问规则 specifier', { exact: true })).toBeFocused()
  await editor.getByLabel('「weekly-report」的询问规则 specifier', { exact: true }).fill('WebFetch(domain:*)')
  await ask.getByRole('button', { name: '添加', exact: true }).click()
  await expect(ask).toContainText('WebFetch(domain:*)')
  await expect(ask.getByRole('button', { name: '为「weekly-report」添加询问规则', exact: true })).toBeFocused()

  // 切到模型页再切回来:权限草稿仍在,模型页自己是干净的。
  await selectTab(page, dialog, '模型')
  await expect(dialog.locator('.project-settings__tablist').getByRole('tab', { name: '权限 · 有未保存的更改', exact: true })).toBeVisible()
  await expect(dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'clean')
  await selectTab(page, dialog, '权限')
  await expect(ask).toContainText('WebFetch(domain:*)')
  await expect(projectMode).toHaveText('继承 Agent')

  // 未保存时关闭需要确认;放弃后重新打开是原始状态。
  await discardDrafts(page, dialog, '权限')
  const reopened = await openSettings(page)
  await selectTab(page, reopened.dialog, '权限')
  await expect(reopened.dialog.locator('.permission-editor [data-mode-trigger]')).toHaveText('仅按规则')
  await expect(reopened.dialog.locator('.permission-editor')).not.toContainText('WebFetch(domain:*)')

  // 保存只作用于当前域。
  await reopened.dialog.locator('.permission-editor [data-mode-trigger]').click()
  await reopened.dialog.locator('.permission-editor [data-mode="default"]').click()
  await expect(reopened.dialog.locator('.permission-editor [data-mode-trigger]')).toHaveText('每次询问')
  await reopened.dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(reopened.dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'saved')
  await expect(reopened.dialog.locator('textarea')).toHaveCount(0)
  expect(issues).toEqual([])
})


test('@area:project-settings 统一窗体在 375 / 768 / 1280 / 1600 下均无横向溢出,标签栏恒为横向', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)
  const tablist = dialog.locator('.project-settings__tablist')
  // 项目徽记只表达身份,不是控件。
  await expect(dialog.locator('.project-settings__mark')).toHaveAttribute('aria-hidden', 'true')

  for (const kind of ['模型', '权限'] as const) {
    await selectTab(page, dialog, kind)
    for (const width of [375, 768, 1280, 1600]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(tablist).toBeVisible()
      await expect(tablist).toHaveAttribute('aria-orientation', 'horizontal')
      // 标签栏横贯窗体、紧接 Header 下缘,不随宽度切成左侧栏。
      const geometry = await dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const list = element.querySelector('.project-settings__tablist')?.getBoundingClientRect()
        const head = element.querySelector('.project-settings__head')?.getBoundingClientRect()
        return {
          left: bounds.left, right: bounds.right,
          listLeft: list?.left ?? 0, listRight: list?.right ?? 0, listTop: list?.top ?? 0,
          headBottom: head?.bottom ?? null,
        }
      })
      expect(geometry.headBottom).not.toBeNull()
      expect(Math.abs(geometry.listTop - (geometry.headBottom ?? 0))).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.listLeft - (geometry.left + 1))).toBeLessThanOrEqual(1)
      expect(Math.abs(geometry.listRight - (geometry.right - 1))).toBeLessThanOrEqual(1)
      // 路径在四档宽度都留在头部、可识别为路径(窄屏可折到第二行)。
      await expect(dialog.locator('.project-settings__head .project-settings__path')).toBeVisible()
      await expect(dialog.locator('.project-settings__head .project-settings__path')).toContainText('~/work/weekly-report')
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (kind === '权限' && width === 375) {
        await dialog.locator('[data-mode-trigger]').click()
        const menu = dialog.getByRole('listbox', { name: '模式', exact: true })
        await expect(menu.locator('[data-mode="dontAsk"]')).toContainText('询问规则按拒绝处理')
        const geometry = await menu.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          return bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth
        })
        expect(geometry).toBe(true)
        await page.keyboard.press('Escape')
        await expect(dialog.locator('[data-mode-trigger]')).toBeFocused()
      }
    }
  }
  await selectTab(page, dialog, '模型')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(issues).toEqual([])
})

interface FrameMetrics {
  width: number
  height: number
  top: number
  bottom: number
  left: number
  right: number
  contentClientWidth: number
  contentClientHeight: number
  contentScrollHeight: number
  contentOverflowY: string
  contentHoldsHead: boolean
  contentHoldsActions: boolean
  docScrollHeight: number
  docClientHeight: number
  innerWidth: number
  innerHeight: number
}

// dvh 与上限的重算发生在 resize 后的下一帧,量几何前先等两帧,避免读到旧值。
async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

// 只读窗框几何:宽高、安全边距、正文滚动容器与页面自身是否滚动。
async function readFrame(dialog: Locator): Promise<FrameMetrics> {
  return dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>('.project-settings__content')
    const head = element.querySelector<HTMLElement>('.project-settings__head')
    const actions = element.querySelector<HTMLElement>('.project-settings__actions')
    if (content === null || head === null || actions === null) throw new Error('project settings frame is incomplete')
    const bounds = element.getBoundingClientRect()
    return {
      width: bounds.width,
      height: bounds.height,
      top: bounds.top,
      bottom: bounds.bottom,
      left: bounds.left,
      right: bounds.right,
      contentClientWidth: content.clientWidth,
      contentClientHeight: content.clientHeight,
      contentScrollHeight: content.scrollHeight,
      contentOverflowY: getComputedStyle(content).overflowY,
      contentHoldsHead: content.contains(head),
      contentHoldsActions: content.contains(actions),
      docScrollHeight: document.documentElement.scrollHeight,
      docClientHeight: document.documentElement.clientHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }
  })
}

// 窗体高度由 dvh 推导:Chromium 在 resize 后可能延迟重算,断言前轮询到目标高度,
// 避免并行负载下读到上一档视口的旧几何。
async function expectFrameHeight(dialog: Locator, expected: number): Promise<void> {
  await expect.poll(async () => {
    const frame = await readFrame(dialog)
    return Math.abs(frame.height - expected) <= 1
  }).toBe(true)
}

test('@area:project-settings 大型设置面:宽高只随视口变化,正文是唯一滚动容器', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)
  await expect(dialog.locator('.project-model__mode')).toBeVisible()
  await expectFrameHeight(dialog, 810)

  // 常见笔记本视口:高度取九成视口,旧的 720 上限不再提前截断;宽度收口在大型模态档。
  const model = await readFrame(dialog)
  expect(Math.abs(model.height - model.innerHeight * 0.9)).toBeLessThanOrEqual(1)
  expect(model.width).toBe(1120)
  expect(model.top).toBeGreaterThanOrEqual(16)
  expect(model.innerHeight - model.bottom).toBeGreaterThanOrEqual(16)
  expect(model.contentOverflowY).toBe('auto')
  // 头部与动作区固定在滚动视口之外,只有正文滚动;1280×900 下模型自定义默认态完整容纳。
  expect(model.contentHoldsHead).toBe(false)
  expect(model.contentHoldsActions).toBe(false)
  expect(model.docScrollHeight).toBeLessThanOrEqual(model.docClientHeight)
  expect(model.contentScrollHeight).toBeLessThanOrEqual(model.contentClientHeight + 1)

  // 跟随态只读摘要同样不滚动(模型)。
  await dialog.getByRole('radio', { name: '跟随 Agent', exact: true }).click()
  await expect(dialog.locator('.follow-summary[data-kind="model"]')).toBeVisible()
  const modelFollow = await readFrame(dialog)
  expect(modelFollow.contentScrollHeight).toBeLessThanOrEqual(modelFollow.contentClientHeight + 1)
  await dialog.getByRole('radio', { name: '自定义', exact: true }).click()
  await expect(dialog.locator('.project-model__subtabs')).toBeVisible()

  await selectTab(page, dialog, '权限')
  await expect(dialog.locator('.permission-editor')).toBeVisible()
  const permissions = await readFrame(dialog)
  expect(Math.abs(permissions.height - model.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(permissions.width - model.width)).toBeLessThanOrEqual(1)
  expect(permissions.contentScrollHeight).toBeLessThanOrEqual(permissions.contentClientHeight + 1)

  // 跟随态只读摘要同样不滚动(权限)。
  await dialog.getByRole('radio', { name: '跟随 Agent', exact: true }).click()
  await expect(dialog.locator('.follow-summary[data-kind="permissions"]')).toContainText('默认权限模式')
  const permissionsFollow = await readFrame(dialog)
  expect(permissionsFollow.contentScrollHeight).toBeLessThanOrEqual(permissionsFollow.contentClientHeight + 1)
  await dialog.getByRole('radio', { name: '自定义', exact: true }).click()
  await expect(dialog.locator('.permission-editor')).toBeVisible()

  // 1440×900:高度仍是九成视口,宽度不跟着视口变宽。
  await page.setViewportSize({ width: 1440, height: 900 })
  await expectFrameHeight(dialog, 810)
  const wide = await readFrame(dialog)
  expect(Math.abs(wide.height - wide.innerHeight * 0.9)).toBeLessThanOrEqual(1)
  expect(wide.width).toBe(1120)
  expect(wide.left).toBeGreaterThanOrEqual(16)
  expect(wide.innerWidth - wide.right).toBeGreaterThanOrEqual(16)
  // 1440 宽下权限默认态同样完整容纳,不出现纵向滚动条。
  await selectTab(page, dialog, '权限')
  await expect(dialog.locator('.permission-editor')).toBeVisible()
  const permissionsWide = await readFrame(dialog)
  expect(permissionsWide.contentScrollHeight).toBeLessThanOrEqual(permissionsWide.contentClientHeight + 1)

  // 1600 宽:有明确上限,不随视口无限拉宽。
  await page.setViewportSize({ width: 1600, height: 900 })
  await expectFrameHeight(dialog, 810)
  const capped = await readFrame(dialog)
  expect(capped.width).toBe(1120)
  expect(capped.width).toBeLessThan(capped.innerWidth - 2 * 16)

  // 视口高 1100:90dvh 超过 900,高度上限此时才接管。
  await page.setViewportSize({ width: 1280, height: 1100 })
  await expectFrameHeight(dialog, 900)
  const tall = await readFrame(dialog)
  expect(Math.abs(tall.height - 900)).toBeLessThanOrEqual(1)
  expect(tall.top).toBeGreaterThanOrEqual(16)
  expect(tall.innerHeight - tall.bottom).toBeGreaterThanOrEqual(16)

  // 短视口:窗体仍收在视口内、动作区可见,正文可滚,页面本身不滚。
  await page.setViewportSize({ width: 375, height: 400 })
  await expectFrameHeight(dialog, 360)
  const short = await readFrame(dialog)
  expect(Math.abs(short.height - short.innerHeight * 0.9)).toBeLessThanOrEqual(1)
  expect(short.bottom).toBeLessThanOrEqual(short.innerHeight)
  expect(short.contentScrollHeight).toBeGreaterThan(short.contentClientHeight)
  // 页面高度在 resize 后的下一帧才落定;轮询到文档不再滚动再断言,避免读到旧布局。
  await expect.poll(async () => {
    const frame = await readFrame(dialog)
    return frame.docScrollHeight <= frame.docClientHeight
  }).toBe(true)
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)

  await page.setViewportSize({ width: 1280, height: 900 })
  await selectTab(page, dialog, '模型')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(issues).toEqual([])
})

test('@area:project-settings 短视口下键盘移动焦点会把选项滚入菜单可视区', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)
  await selectTab(page, dialog, '权限')
  await page.setViewportSize({ width: 375, height: 400 })
  const trigger = dialog.locator('[data-mode-trigger]')
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  const menu = dialog.getByRole('listbox', { name: '模式', exact: true })
  await expect(menu).toBeVisible()
  await page.keyboard.press('End')
  await expect(menu.locator('[data-mode="bypassPermissions"]')).toBeFocused()
  const geometry = await menu.evaluate((element) => {
    const option = element.querySelector<HTMLElement>('[data-mode="bypassPermissions"]')
    if (option === null) return null
    const bounds = element.getBoundingClientRect()
    const optionBounds = option.getBoundingClientRect()
    return {
      scrollTop: element.scrollTop,
      top: bounds.top,
      bottom: bounds.bottom,
      optionTop: optionBounds.top,
      optionBottom: optionBounds.bottom,
    }
  })
  expect(geometry).not.toBeNull()
  if (geometry !== null) {
    expect(geometry.scrollTop).toBeGreaterThan(0)
    expect(geometry.optionTop).toBeGreaterThanOrEqual(geometry.top - 1)
    expect(geometry.optionBottom).toBeLessThanOrEqual(geometry.bottom + 1)
  }
  expect(issues).toEqual([])
})

test('@area:project-settings 分隔线只落在区域边界:Header 不画线,标签栏底边线分隔 chrome 与正文,动作区线横贯全宽', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)

  // 只读几何与层级色:哪条线落在哪个边界、两端与谁相接,以及 chrome 的块高量级。
  const readGeometry = async () => dialog.evaluate((element) => {
    const head = element.querySelector<HTMLElement>('.project-settings__head')
    const mark = element.querySelector<HTMLElement>('.project-settings__mark')
    const tablist = element.querySelector<HTMLElement>('.project-settings__tablist')
    const content = element.querySelector<HTMLElement>('.project-settings__content')
    const rule = element.querySelector<HTMLElement>('.project-settings__actions-rule')
    if (head === null || mark === null || tablist === null || content === null || rule === null) return null
    const headStyle = getComputedStyle(head)
    const tablistStyle = getComputedStyle(tablist)
    const ruleStyle = getComputedStyle(rule)
    const dialogBounds = element.getBoundingClientRect()
    const headBounds = head.getBoundingClientRect()
    const markBounds = mark.getBoundingClientRect()
    const tablistBounds = tablist.getBoundingClientRect()
    const contentBounds = content.getBoundingClientRect()
    const ruleBounds = rule.getBoundingClientRect()
    return {
      dialogLeft: dialogBounds.left, dialogRight: dialogBounds.right, dialogBottom: dialogBounds.bottom,
      headLeft: headBounds.left, headRight: headBounds.right, headBottom: headBounds.bottom, headHeight: headBounds.height,
      markWidth: markBounds.width, markHeight: markBounds.height,
      headBorderWidth: headStyle.borderBlockEndWidth,
      listLeft: tablistBounds.left, listRight: tablistBounds.right, listTop: tablistBounds.top,
      listBottom: tablistBounds.bottom, listHeight: tablistBounds.height,
      listInlineBorder: tablistStyle.borderInlineEndWidth,
      listBlockBorder: tablistStyle.borderBlockEndWidth, listBorderStyle: tablistStyle.borderBlockEndStyle,
      listBorderColor: tablistStyle.borderBlockEndColor, ruleColor: ruleStyle.backgroundColor,
      contentTop: contentBounds.top, contentBottom: contentBounds.bottom,
      ruleLeft: ruleBounds.left, ruleRight: ruleBounds.right, ruleTop: ruleBounds.top, ruleHeight: ruleBounds.height,
      isRuleInScrollContainer: content.contains(rule),
    }
  })

  const wide = await readGeometry()
  expect(wide).not.toBeNull()
  if (wide !== null) {
    // 头部不画线;标签栏底边线是 chrome 与正文之间唯一的分界。
    expect(wide.headBorderWidth).toBe('0px')
    expect(wide.listBlockBorder).toBe('1px')
    expect(wide.listBorderStyle).toBe('solid')
    expect(wide.listInlineBorder).toBe('0px')
    expect(wide.listBorderColor).toBe(wide.ruleColor)
    // 标签栏通栏:左右缘贴窗体左右内缘,上缘紧接头部下缘,正文从它的下缘开始。
    expect(Math.abs(wide.listLeft - (wide.dialogLeft + 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(wide.listRight - (wide.dialogRight - 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(wide.listTop - wide.headBottom)).toBeLessThanOrEqual(1)
    expect(Math.abs(wide.contentTop - wide.listBottom)).toBeLessThanOrEqual(1)
    // 标签栏高度 = 44px 触达 + 1px 底边线,不再有纵向栏的通高留白。
    expect(wide.listHeight).toBeGreaterThanOrEqual(44)
    expect(wide.listHeight).toBeLessThanOrEqual(46)
    // 动作区线横贯内容 pane 全宽,上缘落在滚动视口底缘且不在滚动容器内。
    expect(Math.abs(wide.ruleLeft - (wide.dialogLeft + 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(wide.ruleRight - (wide.dialogRight - 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(wide.ruleTop - wide.contentBottom)).toBeLessThanOrEqual(1)
    expect(wide.ruleHeight).toBeLessThanOrEqual(1)
    expect(wide.isRuleInScrollContainer).toBe(false)
    // 头部 / 动作条收成窗框量级:单行文本 + 一档内距、一个 44px 控件 + 一档内距;
    // mark 是图标级徽记,不再占交互目标尺寸。
    expect(wide.headHeight).toBeLessThanOrEqual(56)
    expect(wide.dialogBottom - wide.contentBottom).toBeLessThanOrEqual(70)
    expect(wide.markWidth).toBeLessThanOrEqual(28)
    expect(wide.markHeight).toBeLessThanOrEqual(28)
  }

  // 窄屏与宽屏同一套结构:标签栏仍横贯整宽,底边线仍是唯一分界;动作区线同样横贯全宽。
  await page.setViewportSize({ width: 375, height: 900 })
  await expect(dialog.locator('.project-settings__tablist')).toHaveAttribute('aria-orientation', 'horizontal')
  // 窗框高度用 dvh,重算落在 resize 后的下一帧;等布局落定再量分隔线几何。
  await settleLayout(page)
  const narrow = await readGeometry()
  expect(narrow).not.toBeNull()
  if (narrow !== null) {
    expect(narrow.headBorderWidth).toBe('0px')
    expect(narrow.listBlockBorder).toBe('1px')
    expect(narrow.listInlineBorder).toBe('0px')
    expect(Math.abs(narrow.listLeft - (narrow.dialogLeft + 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(narrow.listRight - (narrow.dialogRight - 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(narrow.contentTop - narrow.listBottom)).toBeLessThanOrEqual(1)
    expect(Math.abs(narrow.ruleLeft - (narrow.dialogLeft + 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(narrow.ruleRight - (narrow.dialogRight - 1))).toBeLessThanOrEqual(1)
    expect(narrow.isRuleInScrollContainer).toBe(false)
    // 窄屏路径回到第二行,头部仍明显低于旧版;动作条最多两行,mark 不放大。
    expect(narrow.headHeight).toBeLessThanOrEqual(76)
    expect(narrow.dialogBottom - narrow.contentBottom).toBeLessThanOrEqual(90)
    expect(narrow.markWidth).toBeLessThanOrEqual(28)
  }
  expect(issues).toEqual([])
})

test.describe('English project settings', () => {
  test.use({ locale: 'en-US' })
  test('@area:project-settings English project settings stays within 375 and 1280 widths', async ({ page }) => {
    const issues = collectRuntimeIssues(page)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await unlockDemoIdentity(page)
    await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
    await page.locator('.project-item').first().locator('.project-menu__trigger').click()
    await page.getByRole('menuitem', { name: 'Project settings：weekly-report', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Project settings · weekly-report', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.project-settings__tablist [role="tab"]')).toHaveText(['Model', 'Permissions', 'Plugins', 'MCP'])
    await dialog.locator('.project-settings__tablist [role="tab"]').nth(1).click()
    await expect(dialog.locator('.permission-editor')).toBeVisible()
    await dialog.getByRole('radio', { name: 'Follow Agent', exact: true }).click()
    await expect(dialog.locator('.follow-summary[data-kind="permissions"]')).toContainText('Default permission mode')
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    expect(issues).toEqual([])
  })
})

interface DialogGeometry {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

async function readDialogGeometry(dialog: Locator): Promise<DialogGeometry> {
  return dialog.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height,
    }
  })
}

test('@area:project-settings 窗口控制:拖动标题栏移动、Esc 取消拖动与窄屏退化', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)

  const standard = await readDialogGeometry(dialog)
  expect(Math.abs(standard.width - 1120)).toBeLessThanOrEqual(1)
  expect(Math.abs(standard.height - 810)).toBeLessThanOrEqual(1)
  // 窗体不再提供最大化控制。
  await expect(dialog.getByRole('button', { name: /最大化窗口|还原标准大小/ })).toHaveCount(0)

  // 拖动标题栏 = 平移,宽高不变。
  const header = dialog.locator('.dl-dialog__header')
  const headerBox = await header.boundingBox()
  if (headerBox === null) throw new Error('header missing')
  await page.mouse.move(headerBox.x + 200, headerBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(headerBox.x + 320, headerBox.y + 80, { steps: 8 })
  await page.mouse.up()
  await settleLayout(page)
  const dragged = await readDialogGeometry(dialog)
  expect(Math.abs(dragged.width - standard.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(dragged.height - standard.height)).toBeLessThanOrEqual(1)
  expect(dragged.left).toBeGreaterThan(standard.left)

  // 拖动过程中的 Esc 只取消拖动,不关闭窗体,并回到拖动前的几何。
  const beforeEsc = await readDialogGeometry(dialog)
  const dragBox = await header.boundingBox()
  if (dragBox === null) throw new Error('header missing')
  await page.mouse.move(dragBox.x + 200, dragBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(dragBox.x + 280, dragBox.y + 60, { steps: 4 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(dialog).toBeVisible()
  const afterEsc = await readDialogGeometry(dialog)
  expect(Math.abs(afterEsc.left - beforeEsc.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(afterEsc.top - beforeEsc.top)).toBeLessThanOrEqual(1)

  // 静止态没有常驻抓手;动作按钮恒优先于角手柄,按钮之外的外侧角落仍能缩放。
  await expectDialogResizeCue(page, dialog)
  await expectDialogButtonHitPriority(dialog)
  await expectDialogOutsideCornerResize(page, dialog)

  // 窄窗(仍可操作)下动作区换行,按钮的命中优先级不变。
  await page.setViewportSize({ width: 800, height: 700 })
  await settleLayout(page)
  await expectDialogButtonHitPriority(dialog)

  // 窄屏退化为固定 sheet:没有窗口操作,也没有缩放手柄。
  await page.setViewportSize({ width: 375, height: 900 })
  await expect(dialog.getByRole('button', { name: /最大化窗口|还原标准大小/ })).toHaveCount(0)
  await expect(dialog.locator('[role="separator"]')).toHaveCount(0)
  await expect(dialog.locator('.dl-dialog__header')).toHaveCSS('cursor', 'default')
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)

  await page.setViewportSize({ width: 1280, height: 900 })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(issues).toEqual([])
})

test('@area:project-settings 1280×800 默认模型页滚动只发生在正文内', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)
  await expect(dialog.locator('.project-model__mode')).toBeVisible()
  await settleLayout(page)
  // 模型页内容本身超长(用户已确认接受正文滚动,用最大化兜底);
  // 这里断言的是「窗框高度来自共享策略」与「溢出被限制在正文容器内」。
  const frame = await dialog.evaluate((element) => {
    const content = element.querySelector<HTMLElement>('.project-settings__content')
    if (content === null) throw new Error('content missing')
    const bounds = element.getBoundingClientRect()
    return {
      height: bounds.height,
      overflowY: getComputedStyle(content).overflowY,
      docScrollHeight: document.documentElement.scrollHeight,
      docClientHeight: document.documentElement.clientHeight,
    }
  })
  expect(Math.abs(frame.height - 720)).toBeLessThanOrEqual(1)
  expect(frame.overflowY).toBe('auto')
  expect(frame.docScrollHeight).toBeLessThanOrEqual(frame.docClientHeight)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(issues).toEqual([])
})
