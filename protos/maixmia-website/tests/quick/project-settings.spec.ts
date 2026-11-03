import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { collectRuntimeIssues, login, waitForWorkspace } from './helpers'
import { unlockDemoIdentity } from '../calibrate/identity-helpers'

// 统一项目设置窗体:一个 dialog、一个 Tab 控件(模型 / 权限 / MCP)、一个底部动作区;
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
const TAB_INDEX: Record<string, number> = { 模型: 0, 权限: 1, MCP: 2 }

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

  const context = dialog.locator('.agent-context[data-kind="model"]')
  await expect(context).toContainText('Agent 级 · 只读 · 规划助手')
  await expect(context).toContainText('Claude Sonnet 5.5')
  await expect(context.locator('input, select')).toHaveCount(0)

  await dialog.getByRole('radio', { name: '跟随 Agent', exact: true }).click()
  await expect(context).toBeVisible()
  await dialog.getByRole('radio', { name: '自定义', exact: true }).click()
  await expect(context).toBeVisible()
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

  const editor = dialog.locator('.permission-editor[data-scope="project"]')
  await expect(editor).toBeVisible()
  const initialRuleTabs = dialog.getByRole('tablist', { name: '权限规则分组', exact: true }).getByRole('tab')
  await expect(initialRuleTabs).toHaveCount(3)
  expect(await initialRuleTabs.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-rule-kind')))).toEqual(['allow', 'deny', 'ask'])
  await expect(initialRuleTabs).toHaveText(['允许2', '拒绝1', '询问1'])
  const context = dialog.locator('.agent-context[data-kind="permissions"]')
  await expect(context).toContainText('允许 3 · 拒绝 2 · 询问 2')
  await expect(context).toContainText('自动')
  await context.getByRole('button').click()
  await expect(context).toContainText('Read(./.env)')

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

test('@area:project-settings 项目 MCP 配置草稿与即时连接分离,同名遮蔽按定义而非启停', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)
  await selectTab(page, dialog, 'MCP')

  const context = dialog.locator('.agent-context[data-kind="mcp"]')
  await expect(context).toContainText('Agent 服务器数')
  await expect(context).toContainText('被项目同名定义遮蔽')
  await expect(context.locator('.agent-context__facts')).toContainText('2')
  await expect(dialog).toContainText('停用项目服务器也仍然遮蔽 Agent 同名服务器')
  const github = dialog.locator('[data-server-id="project:~/work/weekly-report:github"]')
  const connect = github.locator('.project-mcp__connection button')
  await expect(connect).toBeEnabled()
  await github.locator('input').nth(1).fill('GitHub Project')
  await expect(connect).toBeDisabled()
  await expect(github).toContainText('先保存配置')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  expect(issues).toEqual([])
  await expect(dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'saved')
  await expect(connect).toBeEnabled()
  await connect.click()
  await expect(github).toContainText('已连接')
  await expect(dialog).toContainText('连接操作 · 立即生效')
  await expect(dialog).toContainText('保存后，Agent 的同名服务器将重新生效')
  expect(issues).toEqual([])
})

test('@area:project-settings 项目 MCP 启停保存后仍恢复需认证事实，不伪造已连接', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)
  await selectTab(page, dialog, 'MCP')

  const github = dialog.locator('[data-server-id="project:~/work/weekly-report:github"]')
  const enabled = github.locator('.project-mcp__enabled input')
  await expect(github).toContainText('需认证')
  await enabled.uncheck()
  await expect(github).toContainText('需认证')
  await expect(github).toContainText('待保存')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'saved')
  await expect(github).toContainText('已停用')
  await expect(github).not.toContainText('已连接')
  await enabled.check()
  await expect(github).toContainText('已停用')
  await expect(github).toContainText('待保存')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.locator('.project-config__save-state')).toHaveAttribute('data-state', 'saved')
  await expect(github).toContainText('需认证')
  await expect(github).not.toContainText('已连接')
  await expect(github.locator('.project-mcp__connection button')).toBeEnabled()
  expect(issues).toEqual([])
})

test('@area:project-settings 统一窗体在 375 / 768 / 1280 / 1600 下均无横向溢出,窄屏 Tab 重排为横向', async ({ page }) => {
  const issues = collectRuntimeIssues(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page)
  await waitForWorkspace(page)
  const { dialog } = await openSettings(page)
  const tablist = dialog.locator('.project-settings__tablist')
  // 项目徽记只表达身份,不是控件。
  await expect(dialog.locator('.project-settings__mark')).toHaveAttribute('aria-hidden', 'true')

  for (const kind of ['模型', '权限', 'MCP'] as const) {
    await selectTab(page, dialog, kind)
    for (const width of [375, 768, 1280, 1600]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(tablist).toBeVisible()
      await expect(tablist).toHaveAttribute('aria-orientation', width <= 839 ? 'horizontal' : 'vertical')
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

test('@area:project-settings 发丝分隔线只落在区域边界:宽屏通栏头线与动作区线,窄屏省略头线', async ({ page }) => {
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
      headBorderWidth: headStyle.borderBlockEndWidth, headBorderStyle: headStyle.borderBlockEndStyle,
      headBorderColor: headStyle.borderBlockEndColor, navBorderColor: tablistStyle.borderInlineEndColor,
      navTop: tablistBounds.top, navRight: tablistBounds.right,
      navInlineBorder: tablistStyle.borderInlineEndWidth, navBlockBorder: tablistStyle.borderBlockEndWidth,
      contentBottom: contentBounds.bottom,
      ruleLeft: ruleBounds.left, ruleRight: ruleBounds.right, ruleTop: ruleBounds.top, ruleHeight: ruleBounds.height,
      isRuleInScrollContainer: content.contains(rule),
    }
  })

  const wide = await readGeometry()
  expect(wide).not.toBeNull()
  if (wide !== null) {
    // 头线:贯通整窗内宽,与导航竖线同一发丝权重与层级色。
    expect(wide.headBorderStyle).toBe('solid')
    expect(wide.headBorderWidth).toBe('1px')
    expect(wide.headBorderColor).toBe(wide.navBorderColor)
    expect(wide.navInlineBorder).toBe('1px')
    expect(Math.abs(wide.headLeft - (wide.dialogLeft + 1))).toBeLessThanOrEqual(1)
    expect(Math.abs(wide.headRight - (wide.dialogRight - 1))).toBeLessThanOrEqual(1)
    // T 形交接:竖线上端正好从横线下缘开始,不进头部、不留缝。
    expect(Math.abs(wide.navTop - wide.headBottom)).toBeLessThanOrEqual(1)
    // 动作区线:左端接竖线、右端到窗体右内缘,上缘落在滚动视口底缘且不在滚动容器内。
    expect(Math.abs(wide.ruleLeft - wide.navRight)).toBeLessThanOrEqual(1)
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

  // 窄屏:头部与 band 之间不加线,band 底缘线是唯一分界;动作区线横贯整窗内宽。
  await page.setViewportSize({ width: 375, height: 900 })
  await expect(dialog.locator('.project-settings__tablist')).toHaveAttribute('aria-orientation', 'horizontal')
  const narrow = await readGeometry()
  expect(narrow).not.toBeNull()
  if (narrow !== null) {
    expect(narrow.headBorderWidth).toBe('0px')
    expect(narrow.navInlineBorder).toBe('0px')
    expect(narrow.navBlockBorder).toBe('1px')
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
    await dialog.locator('.project-settings__tablist [role="tab"]').nth(2).click()
    await expect(dialog.locator('.agent-context[data-kind="mcp"]')).toContainText('Agent level · read-only')
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    expect(issues).toEqual([])
  })
})
