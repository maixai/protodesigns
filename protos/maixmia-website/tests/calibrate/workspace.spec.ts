import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const WIDTHS = [375, 768, 1024, 1280, 1600]
const VIEWPORT_HEIGHT = 900

// 会话头(本次改动固化):h1 = 当前会话任务名、副行 = 归属 Agent。这些文案来自 i18n 词条,
// 测试读不到运行时词条,只能按同值写死(与既有的 '工作台' / '给 Mia 的消息' 同一套路)。
// ready / error 态下活跃会话是 weekly,空态回退到 newChat;切换用例另用 knowledge。
const HEADINGS = {
  'zh-CN': { weekly: '把项目周报整理成行动清单', roadmap: '梳理下季度路线图', incident: '复盘线上故障处理', budget: '核对本季度预算使用', launch: '新功能发布前的检查清单', hiring: '整理招聘面试反馈', research: '用户访谈：整理关键发现', knowledge: '团队知识库的整理计划', quarterly: '生成季度复盘数据', newChat: '新建对话' },
  en: { weekly: 'Turn project updates into an action plan', roadmap: 'Plan next quarter’s roadmap', incident: 'Review the production incident', budget: 'Reconcile this quarter’s budget', launch: 'Pre-launch checklist for the new feature', hiring: 'Organize interview feedback', research: 'User interviews: key findings', knowledge: 'Organize the team knowledge base', quarterly: 'Generate the quarterly review data', newChat: 'New conversation' },
} as const
const AGENT_NAMES = {
  'zh-CN': { planning: '规划助手', research: '研究助手', writing: '写作助手' },
  en: { planning: 'Planning agent', research: 'Research agent', writing: 'Writing agent' },
} as const
// 侧栏与对话栏的可访问名 / 抽屉开合按钮(来自 i18n;测试读不到运行时词条,按同值写死)。
const SIDEBAR_NAME = { 'zh-CN': 'Agent 工作区', en: 'Agent workspace' } as const
const OPEN_SIDEBAR = { 'zh-CN': '打开侧栏', en: 'Open sidebar' } as const
const CLOSE_SIDEBAR = { 'zh-CN': '关闭侧栏', en: 'Close sidebar' } as const
// 侧栏项目区:项目名 / 条目路径都来自 mock 数据层,是技术标识,不随语言变化。
// 每个 Agent 的项目按打开顺序排列,首个即进入工作台时默认选中的那个。
const PROJECT_NAMES = {
  planning: ['weekly-report', 'knowledge-base'],
  research: ['user-research', 'benchmarks'],
  writing: ['product-docs', 'changelog'],
} as const
// 「等待交互」受影响条目(位于 writing 的 product-docs 根下)与它的状态芯片选择器。
const AFFECTED_ENTRY = 'release-notes.md'
const CHIP = '.entry-state'
// Agent 切换器与它的元素约定(选项是原生 button,可用类名 / role 定位)。
const AGENT_SELECTOR = '.agent-selector'
// 会话头 = 浏览器式 tab 条 + 常驻的溢出 / 搜索菜单钮。SWITCHER_* 沿用旧名(值改指菜单钮与菜单浮层),
// 使既有「开菜单」的辅助与断言不必逐条改名。
const TABLIST = '.conversation-tabs'
const TAB = '.conversation-tab'
const SWITCHER_TRIGGER = '.conversation-menu__trigger'
const SWITCHER_PANEL = '#conversation-panel'
const TABPANEL = '#conversation-panel-body'
const NEW_CHAT = { 'zh-CN': '新建对话', en: 'New conversation' } as const
// 第二个「等待交互」会话的标题(它是菜单里「等待你」组唯一那一行)。
const QUARTERLY = { 'zh-CN': '生成季度复盘数据', en: 'Generate the quarterly review data' } as const

// 打开菜单(默认关闭)。
async function openSwitcher(page: Page): Promise<void> {
  await page.locator(SWITCHER_TRIGGER).click()
  await expect(page.locator(SWITCHER_PANEL)).toBeVisible()
}

// 关闭菜单后读不到会话行(它们是菜单内容);会话列表的断言须先开菜单。
async function closeSwitcher(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
}

// 按标题点某个可见 tab(该 tab 必须已可见,否则点不到)。
async function clickTab(page: Page, title: string): Promise<void> {
  await page.locator(TAB, { hasText: title }).click()
}

// 空态没有活跃会话,h1 回退到 newChat;其余态是 weekly。
function zhHeadingFor(state: string): string {
  return state === 'empty' ? HEADINGS['zh-CN'].newChat : HEADINGS['zh-CN'].weekly
}

function enHeadingFor(state: string): string {
  return state === 'empty' ? HEADINGS.en.newChat : HEADINGS.en.weekly
}

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

async function login(page: Page, loginLabel = '登录'): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: loginLabel, exact: true }).click()
  await expect(page).toHaveURL(/#\/workspace$/)
}

async function waitForStable(page: Page, state = 'ready', heading: string = zhHeadingFor(state)): Promise<void> {
  await expect(page.getByRole('log')).toHaveAttribute('data-state', state)
  // 视觉隐藏的 h1 文字 = 当前会话标题(Agent 副标题已下线,故这就是纯标题)。
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
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
    // 发送已无独立按钮(本轮删除 ↑ 按钮):空闲态下输入框内没有任何按钮;发送动作由 Enter 承担。
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toHaveCount(0)
    await expect(page.locator('.composer-form button')).toHaveCount(0)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
    expect(await contrastViolations(page)).toEqual([])
    // 独立控件(按钮 / 图标按钮)仍守 44×44。**排除五类**:
    //   ① 侧栏文件树的目录行 —— 密集列表 / 树行,按 design-language ⑥ 走收窄例外(≥1024px 28px);
    //   ② 会话头 tab 条这一行的控件(.conversation-tab / .conversation-icon-button)——
    //      紧凑导航行档(32px),判据换成 WCAG 2.5.8 的间距替代方案(相邻目标中心距 ≥24);
    //   ③ tab 上的关闭钮(.tab-close)—— tab 行内的密集控件档(24px),同属第三档例外;
    //   ④ **文件栏**(顶部那条横向密集行)的行内控件:tab / ▾ 菜单钮 / tab 关闭钮 —— 同为横向
    //      密集行,判据同上(它常驻渲染,故必须排除,否则这条断言会在无文件时也红);
    //   ⑤ **文件面板标题栏**的行内控件:视图分段(24)/ 换行钮与关闭钮(32)—— 它们是那条 40px
    //      工具栏的行内控件,横向排布的间距判据天然成立。三类例外的完整判据分别在
    //      「侧栏密集行触达」「会话头 tab 条」「文件栏几何」「文件面板标题栏」用例里逐条核对。
    const dimensions = await page.locator('.workspace-page button:visible:not(.entry-row__button):not(.conversation-tab):not(.conversation-icon-button):not(.tab-close):not(.file-tab):not(.file-tab-close):not(.file-bar__trigger):not(.file-panel__view):not(.file-panel__toggle):not(.file-panel__close)').evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    for (const dimensionsItem of dimensions) {
      expect(dimensionsItem.width).toBeGreaterThanOrEqual(44)
      expect(dimensionsItem.height).toBeGreaterThanOrEqual(44)
    }
    // ≤1023 侧栏收成抽屉,由「打开侧栏」按钮进入;以上是常驻面板,直接可见 Agent 切换器
    // 与项目区。
    if (width < 1024) {
      await expect(page.getByRole('button', { name: '打开侧栏' })).toBeVisible()
    } else {
      await expect(page.locator(`${AGENT_SELECTOR}__trigger`)).toBeVisible()
      // 项目区默认展示规划助手的项目,首个项目默认展开(其树随展开加载)。
      await expect(page.locator('.workspace-projects')).toContainText(PROJECT_NAMES.planning[0])
      await expect(page.locator('.workspace-projects')).toContainText(PROJECT_NAMES.planning[1])
    }
    // 会话头右端两枚常驻控件:「＋」与溢出 / 搜索菜单钮。它们是 tab 条这一行的行内控件,
    // 走**紧凑导航行档**(32×32),不是 44 的独立控件档。判据换成 WCAG 2.5.8 的间距替代方案:
    // 相邻目标中心各画一个 24px 直径圆、两圆不相交(横排下中心距 = 宽 + 间隙 ≫ 24)。
    for (const control of [page.locator(SWITCHER_TRIGGER), page.getByRole('button', { name: '新建对话', exact: true })]) {
      const box = await control.boundingBox()
      expect(box?.width ?? 0, '会话头控件的宽度 = 32(紧凑导航行档)').toBeGreaterThanOrEqual(31)
      expect(box?.width ?? 0, '会话头控件的宽度 = 32(紧凑导航行档)').toBeLessThanOrEqual(33)
      expect(box?.height ?? 0, '会话头控件的高度 = 32(紧凑导航行档)').toBeGreaterThanOrEqual(31)
      expect(box?.height ?? 0, '会话头控件的高度 = 32(紧凑导航行档)').toBeLessThanOrEqual(33)
    }
    // tab 条默认按最近更新显示近期对话(默认项目 weekly-report 有 6 条);菜单里是全部会话。
    await expect(page.locator(TAB)).not.toHaveCount(0)
    // 演示提示已删除:输入坞下方不再有「演示工作台 · 回复为预设内容…」那行。输入提示行本轮也
    // 下线(改挂在输入框的 title 上,见「输入区重构」用例)—— 那行腾出的位置给了文件栏。
    await expect(page.locator('.demo-note')).toHaveCount(0)
    await expect(page.locator('.composer-hint')).toHaveCount(0)
    await openSwitcher(page)
    await expect(page.locator('.session-item')).toHaveCount(6)
    await closeSwitcher(page)
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
        await expect(page.getByRole('textbox', { name: '给 Mia 的消息' })).toHaveValue('帮我把团队知识库整理工作拆成一周内可执行的计划。')
        await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
      }
    })
  }
}

// 宽度利用(本次改动固化):外壳满幅 + 消息阅读列 768px + 消息列与输入框同宽。
// 背景:原先 workspace 整体套 --dl-container-max(1520px)并居中,宽屏下被挤成中间
// 一块、两侧大片空白。改为「应用外壳满幅、只有消息阅读列限宽」后,以下三条几何任意
// 一条回退都会让页面重新变窄,必须逐条锁死。768 与 workspace-page.vue 的
// --workspace-column-max 同步(测试读不到 CSS 变量,只能写死同值)。
const WORKSPACE_COLUMN_MAX = 768

for (const width of [1280, 1600]) {
  test(`外壳满幅与消息列宽 @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)

    // 外壳满幅:左缘贴视口左缘、宽度用满可用宽度。
    // 以 clientWidth 为基准而非 viewportSize().width —— 经典滚动条(Chromium 桌面)
    // 占在视口内,布局视口比视口参数窄约 15px,拿视口参数比会假红。
    const layout = await page.locator('.workspace-layout').boundingBox()
    const layoutViewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(layout).not.toBeNull()
    if (layout === null) return
    expect(Math.abs(layout.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(layout.width - layoutViewportWidth)).toBeLessThanOrEqual(1)

    // 消息阅读列:上限 768px(父列已限宽,message-body 自身不再限宽,否则正文会被二次
    // 压回 525px 的 --dl-measure)。对话栏拆成下拉面板后,面板内不再有常驻子列占用横向空间,
    // 故 1280 与 1600 两档都能达到上限;两档都不得超出上限。
    const body = await page.locator('.chat-message.assistant .message-body').first().boundingBox()
    expect(body).not.toBeNull()
    if (body === null) return
    expect(body.width).toBeLessThanOrEqual(WORKSPACE_COLUMN_MAX + 1)
    const composer = await page.locator('.composer-form').boundingBox()
    expect(composer).not.toBeNull()
    if (composer === null) return
    expect(composer.width).toBeLessThanOrEqual(WORKSPACE_COLUMN_MAX + 1)

    // 消息列与输入框同轴:两端各自在「被滚动条 gutter 收窄 / 未收窄」的容器里居中。
    // .transcript 带 scrollbar-gutter: stable(既有设计决定:防滚动条出现 / 消失导致正文
    // 左右跳动),它常驻预留一条 gutter。阅读列封顶时 .transcript-inner 与 .composer-inner
    // 各自离心居中,唯一偏差正是半个 gutter(Chromium 经典滚动条下 15/2 = 7.5px);
    // overlay 滚动条引擎(WebKit)gutter 为 0,该式退化为「两者严格同 x」,同一断言跨引擎成立。
    const scrollbarGutter = await page
      .locator('.transcript')
      .evaluate((element) => element.offsetWidth - element.clientWidth)
    const capped = body.width >= WORKSPACE_COLUMN_MAX - 1
    expect(Math.abs(composer.x - body.x - (capped ? scrollbarGutter / 2 : 0))).toBeLessThanOrEqual(1)
    // 1280 与 1600 两档都达到上限 —— 上限这条约束成立,不再被对话栏挤到 703px。
    expect(Math.abs(body.width - WORKSPACE_COLUMN_MAX)).toBeLessThanOrEqual(1)
    expect(Math.abs(composer.width - WORKSPACE_COLUMN_MAX)).toBeLessThanOrEqual(1)
    console.log(`[message column] ${width}px → body ${body.width}px / composer ${composer.width}px`)
  })
}

// 浮动面板外壳(本次改动固化):外壳四周内缩 8px、两块面板之间也留 8px 缝,面板圆角
// 16px(--dl-radius-xl,面板 / 浮层档)。8 与 style.css 的 --dl-chrome-gutter 无关,
// 只是取 --dl-space-2;面板圆角 16 与 workspace-page.vue 的 --dl-radius-xl 同步(测试
// 读不到 CSS 变量,只能写死同值)。
const SHELL_INSET = 8
const PANEL_RADIUS = 16
// 侧栏内边距由外壳 gutter(24)收到 16,与内缩 8 相加仍等于 24 —— Agent 切换器与顶栏
// 品牌左缘因此对齐(见 workspace-page.vue 的 --workspace-shell-inset 注释)。
const CHROME_GUTTER = 24

for (const width of [1280, 1600]) {
  test(`浮动面板外壳几何 @${width}:内缩、缝隙、面板圆角与品牌对齐`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)

    // 以 clientWidth 为基准而非 viewportSize().width —— 经典滚动条(Chromium 桌面)
    // 占在视口内,布局视口比视口参数窄约 15px,拿视口参数比会假红(与上方「外壳满幅」同因)。
    const layoutViewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    const sidebar = await page.locator('.workspace-sidebar').boundingBox()
    const conversation = await page.locator('.conversation').boundingBox()
    expect(sidebar).not.toBeNull()
    expect(conversation).not.toBeNull()
    if (sidebar === null || conversation === null) return

    // 外壳内缩:侧栏左缘退开 8px;对话面板右缘退开 8px。
    expect(Math.abs(sidebar.x - SHELL_INSET)).toBeLessThanOrEqual(1)
    expect(Math.abs(conversation.x + conversation.width - (layoutViewportWidth - SHELL_INSET))).toBeLessThanOrEqual(1)
    // 两块面板之间的水平缝隙 = 8px(布局 gap == 外壳内缩)。
    expect(Math.abs(conversation.x - (sidebar.x + sidebar.width) - SHELL_INSET)).toBeLessThanOrEqual(1)

    // 面板圆角 16px:用单角属性断言,不断言 borderRadius 合成字符串(各家引擎格式不同)。
    for (const panel of [page.locator('.workspace-sidebar'), page.locator('.conversation')]) {
      await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)).toBe(`${PANEL_RADIUS}px`)
    }

    // 回归护栏:内缩 8 + 侧栏内边距 16 = 24 = 外壳 gutter,故 Agent 切换器与顶栏品牌
    // 左缘同在 24px 竖线上(1px 容差吸收面板 1px 描边)。原先承担这条对齐关系的是侧栏里的
    // 「新建对话」按钮,合体控件下线后改由 Agent 切换器承担。
    const agentSelector = await page.locator('.agent-selector').boundingBox()
    const brand = await page.locator('.site-header__brand').boundingBox()
    expect(agentSelector).not.toBeNull()
    expect(brand).not.toBeNull()
    if (agentSelector === null || brand === null) return
    expect(Math.abs(brand.x - CHROME_GUTTER)).toBeLessThanOrEqual(1)
    expect(Math.abs(agentSelector.x - brand.x)).toBeLessThanOrEqual(1)
  })
}

test('375px 外壳仍满幅且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 375 档收成单列(侧栏进抽屉),外壳仍须从视口左缘铺满;满幅改动不得引入横向溢出。
  const layout = await page.locator('.workspace-layout').boundingBox()
  expect(layout).not.toBeNull()
  if (layout === null) return
  expect(Math.abs(layout.x)).toBeLessThanOrEqual(1)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})

test('375px 抽屉面板只圆内侧两角且不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 抽屉(position: fixed; inset: 0 auto 0 0)贴视口左缘、脱离外壳内缩,故只圆朝内容
  // 一侧的右两角,左两角为直角(贴边圆角在视口外、会显得莫名其妙)。
  const radii = await page.locator('.workspace-sidebar').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      topLeft: style.borderTopLeftRadius,
      topRight: style.borderTopRightRadius,
      bottomLeft: style.borderBottomLeftRadius,
      bottomRight: style.borderBottomRightRadius,
    }
  })
  expect(radii.topLeft).toBe('0px')
  expect(radii.bottomLeft).toBe('0px')
  expect(radii.topRight).toBe(`${PANEL_RADIUS}px`)
  expect(radii.bottomRight).toBe(`${PANEL_RADIUS}px`)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
})

// 会话头 = 浏览器式 tab 条 + 常驻菜单钮。头高由紧凑导航行档给出:控件高 32(紧凑档,非 44)
// + 上内边距 4(--dl-space-1)+ 下内边距 8(--dl-space-2)= 44px(下内边距就是 tab 与对话内容
// 之间那道间隔;头部不再有下描丝线,分界线移到转录区上边界)。默认项目 weekly-report 有 6 条会话:
// 1600 下 6 条全可见、1280 下溢出(实验依据:1600 条可用宽约 1135、1280 约 815;1280 放不下 6 个 160 宽的下限)。
const HEADER_MAX_HEIGHT = 45
const HEADER_MIN_HEIGHT = 43
// tab 下内边距 = tab 药丸底边到分界线上沿的间隔(design-language:tab 与内容之间要有间隔)。
const HEADER_CONTENT_GAP = 8
// 紧凑导航行档的控件尺寸(design-language ⑥ 第三档):tab 与 ＋ / 菜单钮都是 32。
const NAV_CONTROL_SIZE = 32
// 间距判据下限:WCAG 2.5.8 的最小目标尺寸 24px(相邻目标中心距 ≥24 即两圆不相交)。
const MIN_TARGET_GAP = 24
const SESSIONS_IN_DEFAULT_PROJECT = 6

for (const width of [1280, 1600]) {
  test(`会话头 tab 条:语义、几何、溢出与 ＋ 贴 strip @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    const heading = page.locator('.conversation-heading')
    const tablist = page.locator(TABLIST)
    // 语义:tablist 在场,tab 是 role=tab,每个都指向存在的 tabpanel。
    await expect(tablist).toHaveAttribute('role', 'tablist')
    const tabs = page.locator(TAB)
    const tabCount = await tabs.count()
    expect(tabCount, '可见 tab 数').toBeGreaterThan(0)
    for (const tab of await tabs.all()) {
      await expect(tab).toHaveJSProperty('tagName', 'BUTTON')
      await expect(tab).toHaveAttribute('role', 'tab')
      await expect(tab).toHaveAttribute('aria-controls', 'conversation-panel-body')
    }
    // 恰一个 aria-selected=true、恰一个 tabindex=0(roving tabindex 与选中态各自独立)。
    await expect(page.locator(`${TAB}[aria-selected="true"]`)).toHaveCount(1)
    await expect(page.locator(`${TAB}[tabindex="0"]`)).toHaveCount(1)
    // tabpanel:存在、role=tabpanel、aria-labelledby = 活动 tab 的 id、内含 role=log 的转录。
    const tabpanel = page.locator(TABPANEL)
    await expect(tabpanel).toHaveAttribute('role', 'tabpanel')
    const activeTabId = await page.locator(`${TAB}[aria-selected="true"]`).getAttribute('id')
    expect(activeTabId).not.toBeNull()
    await expect(tabpanel).toHaveAttribute('aria-labelledby', activeTabId ?? '')
    await expect(tabpanel.locator('[role="log"]')).toHaveCount(1)
    // 整页恰一个 h1,其文字 = 活动会话标题;Agent 首字标记 / 副标题已下线。
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].weekly)
    await expect(page.locator('.agent-mark, .heading-agent, .heading-title')).toHaveCount(0)

    // tab 高度 = 32(紧凑导航行档);＋ 与菜单钮 = 32×32。
    const newChat = page.getByRole('button', { name: '新建对话', exact: true })
    const menuButton = page.locator(SWITCHER_TRIGGER)
    const tabBoxes = await tabs.evaluateAll((elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x, right: rect.right, width: rect.width, height: rect.height, centerX: rect.x + rect.width / 2, centerY: rect.y + rect.height / 2 }
    }))
    const stripBox = await tablist.boundingBox()
    const plusBox = await newChat.boundingBox()
    const menuBox = await menuButton.boundingBox()
    expect(stripBox).not.toBeNull()
    expect(plusBox).not.toBeNull()
    expect(menuBox).not.toBeNull()
    if (stripBox === null || plusBox === null || menuBox === null) return
    for (const box of tabBoxes) {
      expect(box.height, 'tab 高 = 32(紧凑导航行档)').toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
      expect(box.height, 'tab 高 = 32(紧凑导航行档)').toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
    }
    expect(plusBox.width, '＋ 宽 = 32').toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
    expect(plusBox.width, '＋ 宽 = 32').toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
    expect(plusBox.height, '＋ 高 = 32').toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
    expect(plusBox.height, '＋ 高 = 32').toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
    expect(menuBox.width, '菜单钮宽 = 32').toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
    expect(menuBox.width, '菜单钮宽 = 32').toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
    expect(menuBox.height, '菜单钮高 = 32').toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
    expect(menuBox.height, '菜单钮高 = 32').toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)

    // 间距判据(WCAG 2.5.8 间距替代方案):tab / ＋ / 菜单钮两两中心距 ≥24 —— 横排下天然成立
    // (中心距 = 各自一半宽之 + 间隙)。取末个可见 tab 与两枚控件三点。
    const lastTab = tabBoxes[tabBoxes.length - 1]
    expect(lastTab).toBeDefined()
    if (lastTab === undefined) return
    const nodes = [
      { name: '末个 tab', x: lastTab.centerX, y: lastTab.centerY },
      { name: '＋', x: plusBox.x + plusBox.width / 2, y: plusBox.y + plusBox.height / 2 },
      { name: '菜单钮', x: menuBox.x + menuBox.width / 2, y: menuBox.y + menuBox.height / 2 },
    ]
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]
        const b = nodes[j]
        if (a === undefined || b === undefined) continue
        const distance = Math.hypot(a.x - b.x, a.y - b.y)
        console.log(`[nav center-gap] ${a.name} ⇄ ${b.name} = ${distance.toFixed(1)}px`)
        expect(distance, `${a.name} ⇄ ${b.name} 中心距 ≥24`).toBeGreaterThanOrEqual(MIN_TARGET_GAP)
      }
    }

    // 每个可见 tab 完整落在 strip 内(无半截 tab);strip 不纵向裁切。
    for (const box of tabBoxes) {
      expect(box.x, 'tab 左缘 ≥ strip 左缘').toBeGreaterThanOrEqual(stripBox.x - 1)
      expect(box.right, 'tab 右缘 ≤ strip 右缘').toBeLessThanOrEqual(stripBox.x + stripBox.width + 1)
    }
    // ＋ 紧贴 strip:其左缘与最后一个可见 tab 的右缘间距 = 一个 gap(12),不是靠右。
    const lastRight = Math.max(...tabBoxes.map((box) => box.right))
    const gapBeforePlus = plusBox.x - lastRight
    const headingGap = await heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).columnGap) || 0)
    console.log(`[conversation-tabs] ${width}px → 可见 ${tabCount}/${SESSIONS_IN_DEFAULT_PROJECT} / tab 宽 ${tabBoxes[0]?.width.toFixed(1)} / strip ${stripBox.width.toFixed(1)} / ＋左缘−末 tab 右缘 ${gapBeforePlus.toFixed(1)}`)
    expect(Math.abs(gapBeforePlus - headingGap), '＋ 紧贴 strip(间距 = 一个 gap)').toBeLessThanOrEqual(1)

    // 溢出:1280 可见数 < 总数(有隐藏项);1600 全部可见,且菜单钮数字槽不渲染。
    if (width === 1280) {
      expect(tabCount, '1280 有隐藏项').toBeLessThan(SESSIONS_IN_DEFAULT_PROJECT)
      await expect(page.locator('.conversation-menu__count')).toHaveCount(1)
      // 菜单钮计数徽标不得越过头部上边缘(头部上内边距只有 4px)。
      const badgeRect = await page.locator('.conversation-menu__count').boundingBox()
      const headingRect = await heading.boundingBox()
      expect(badgeRect).not.toBeNull()
      expect(headingRect).not.toBeNull()
      if (badgeRect !== null && headingRect !== null) {
        console.log(`[menu count badge] 徽标上缘 ${badgeRect.y.toFixed(1)} / 头部上缘 ${headingRect.y.toFixed(1)}`)
        expect(badgeRect.y, '菜单钮计数徽标不越过头部上边缘').toBeGreaterThanOrEqual(headingRect.y - 0.5)
      }
    } else {
      expect(tabCount, '1600 全部可见').toBe(SESSIONS_IN_DEFAULT_PROJECT)
      await expect(page.locator('.conversation-menu__count')).toHaveCount(0)
    }

    // 面板开合;整页 h1 计数在开合前后都是 1。
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    await menuButton.click()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(SWITCHER_PANEL)).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await closeSwitcher(page)
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    const headingBox = await heading.boundingBox()
    expect(headingBox).not.toBeNull()
    if (headingBox !== null) {
      console.log(`[conversation-heading] ${width}px → ${headingBox.height}px`)
      expect(headingBox.height, '头部高度 ≈44px(32 控件 + 上 4 + 下 8)').toBeLessThanOrEqual(HEADER_MAX_HEIGHT)
      expect(headingBox.height, '头部高度 ≈44px').toBeGreaterThanOrEqual(HEADER_MIN_HEIGHT)
      // 头部不再有贴着 tab 的下横线(border-bottom 已移除,分界线移到转录区上边界)。
      const headingBorderBottom = await heading.evaluate((element) => getComputedStyle(element).borderBlockEndStyle)
      expect(headingBorderBottom, '头部不再有下描丝线').toBe('none')
      // 头部上内边距(4px)必须容得下 3px 的外扩焦点环:否则 tab 的 :focus-visible 环会被头部上边缘挤掉。
      const padTop = await heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBlockStart) || 0)
      expect(padTop, '头部上内边距 ≥ 焦点环外扩 3px').toBeGreaterThanOrEqual(3)
      // 「tab 与对话内容之间的间隔」存在性断言(替换原先「tab 底边压在描丝线上」):
      // 活动 tab 药丸的底边到分界线上沿(转录区的 border-block-start 上沿)实测 ≥8px。
      const activeTabBottom = await page.locator(`${TAB}[aria-selected="true"]`).evaluate((element) => element.getBoundingClientRect().bottom)
      const dividerTop = await page.getByRole('log').evaluate((element) => element.getBoundingClientRect().top)
      console.log(`[tab gap] active tab bottom ${activeTabBottom.toFixed(1)} / divider top ${dividerTop.toFixed(1)} → gap ${(dividerTop - activeTabBottom).toFixed(1)}px`)
      expect(dividerTop - activeTabBottom, `tab 药丸底边到分界线上沿 ≥${HEADER_CONTENT_GAP}px`).toBeGreaterThanOrEqual(HEADER_CONTENT_GAP)
      // 分界线归属内容区:它是转录区的上边框,不是头部的一部分。
      const transcriptBorderTop = await page.getByRole('log').evaluate((element) => getComputedStyle(element).borderBlockStartStyle)
      expect(transcriptBorderTop, '分界线是转录区的上边框').not.toBe('none')

      // 活动 tab 的选中指示:填充 accent-soft + 字重 500,**不存在任何下划线 / 底部伪元素**。
      const activeStyle = await page.locator(`${TAB}[aria-selected="true"]`).evaluate((element) => {
        const style = getComputedStyle(element)
        const after = getComputedStyle(element, '::after')
        return {
          background: style.backgroundColor,
          weight: style.fontWeight,
          afterContent: after.content,
          borderBlockEnd: style.borderBlockEndStyle,
          accentSoft: getComputedStyle(element).getPropertyValue('--dl-accent-soft').trim(),
        }
      })
      console.log(`[active tab] bg ${activeStyle.background} / weight ${activeStyle.weight} / ::after ${activeStyle.afterContent} / border-block-end ${activeStyle.borderBlockEnd}`)
      expect(activeStyle.weight, '活动 tab 字重 500').toBe('500')
      expect(activeStyle.afterContent, '活动 tab 无底部伪元素指示器').toBe('none')
      expect(activeStyle.borderBlockEnd, '活动 tab 无下边框线条').toBe('none')

      // 轻量分隔线的规则性断言与「不吃布局」几何不变断言在「tab 分隔线」用例里,375/768/1280/1600 各测一次。

      // 焦点环完整可见:tablist 不能在纵向把它裁掉(overflow hidden / clip 会抹掉焦点环的上下两条边)。
      const stripOverflowY = await tablist.evaluate((element) => getComputedStyle(element).overflowY)
      expect(['visible', 'clip'], 'tablist overflow-y 不吞焦点环').toContain(stripOverflowY)
      if (stripOverflowY === 'clip') {
        const clipMargin = await tablist.evaluate((element) => Number.parseFloat(getComputedStyle(element).overflowClipMargin) || 0)
        expect(clipMargin, 'overflow:clip 时须留出 ≥3px 裁剪余量').toBeGreaterThanOrEqual(3)
      }
    }
  })
}

// tab 之间的轻量分隔线(本轮修订):**只画在两个相邻的、都非活动的 tab 之间**;紧邻活动 tab 的
// 左右两侧与 tab 条首尾两端都不画。规则性断言(不写死条数)+ 几何不变断言(证明是伪元素、不吃布局)。
// 375 / 768 / 1280 / 1600 各测一次。
for (const width of [375, 768, 1280, 1600]) {
  test(`tab 分隔线:规则 + 不吃布局 @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    const tabs = page.locator(TAB)
    const slots = page.locator('.tab-slot')
    await expect(page.locator(`${TAB}[aria-selected="true"]`)).toHaveCount(1)

    // 分隔线画在**槽位**(.tab-slot)的 ::after 上,选中态由槽位的 data-selected 表达。
    const slotStates = await slots.evaluateAll((elements) => elements.map((element) => {
      const after = getComputedStyle(element, '::after')
      return {
        selected: element.getAttribute('data-selected') === 'true',
        dividerContent: after.content,
        dividerHeight: after.height,
        dividerWidth: after.width,
        dividerColor: after.backgroundColor,
      }
    }))
    let dividerCount = 0
    for (let index = 0; index < slotStates.length; index += 1) {
      const current = slotStates[index]
      const next = slotStates[index + 1]
      if (current === undefined) continue
      // 两侧都非活动才算「相邻两个非活动 tab」;末个槽位右侧没有邻居、首尾两端自然不画。
      const bothInactive = !current.selected && next !== undefined && !next.selected
      const hasDivider = current.dividerContent !== 'none'
      if (hasDivider) dividerCount += 1
      console.log(`[tab divider] ${width}px #${index} selected=${current.selected} → ${hasDivider ? `有 h=${current.dividerHeight} w=${current.dividerWidth} color=${current.dividerColor}` : '无'}`)
      expect(hasDivider, `第 ${index} 个槽位的分隔线(两侧都非活动才应有)`).toBe(bothInactive)
    }
    const expectedDividers = slotStates.slice(0, -1).filter((slot, index) => !slot.selected && slotStates[index + 1]?.selected === false).length
    console.log(`[tab divider] ${width}px 可见 ${slotStates.length} 个,分隔线共 ${dividerCount} 条(期望 ${expectedDividers})`)
    expect(dividerCount, '分隔线条数 = 相邻两侧都非活动的对数').toBe(expectedDividers)
    // 分隔线几何:高度 = tab 高的一半(16px,上下内缩),宽度 = 发丝线宽(1px),颜色为 --dl-border-base。
    for (const slot of slotStates.filter((state) => state.dividerContent !== 'none')) {
      expect(Number.parseFloat(slot.dividerHeight), '分隔线高 = 16px').toBeCloseTo(NAV_CONTROL_SIZE / 2, 0)
      expect(Number.parseFloat(slot.dividerWidth), '分隔线宽 = 发丝线宽 1px').toBeCloseTo(1, 1)
      expect(slot.dividerColor, '分隔线有颜色').not.toBe('rgba(0, 0, 0, 0)')
    }
    // tab 自身无左右边框(分隔线不吃布局)。
    for (const tab of await tabs.all()) {
      expect(await tab.evaluate((element) => getComputedStyle(element).borderInlineStartStyle), 'tab 无左右边框').toBe('none')
    }

    // 几何不变:注入样式把分隔线伪元素关掉,逐值比对各 tab 的 x / width —— 证明它没吃布局。
    const boxesWithDivider = await tabs.evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, width: rect.width } }))
    await page.evaluate(() => {
      const style = document.createElement('style')
      style.id = 'probe-no-divider'
      style.textContent = '.tab-slot::after { content: none !important; }'
      document.head.appendChild(style)
    })
    const boxesWithoutDivider = await tabs.evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, width: rect.width } }))
    await page.evaluate(() => { document.getElementById('probe-no-divider')?.remove() })
    console.log(`[tab divider] ${width}px 去分隔线前后 tab 几何 ${JSON.stringify(boxesWithDivider)} vs ${JSON.stringify(boxesWithoutDivider)}`)
    expect(boxesWithoutDivider, '分隔线不吃布局(tab 位置与宽度逐值不变)').toEqual(boxesWithDivider)
  })
}

// tab 关闭钮(本轮追加):悬停 / 键盘聚焦时出现在 tab 右侧的小关闭钮。结构上关闭钮与 tab **平级**
// (HTML 不允许 button 套 button),用 tab 的 aria-actions 指向它;不进 Tab 顺序(tabindex=-1)。
test('tab 关闭钮:悬停/聚焦可见、默认不可见、零重排、tabindex=-1、aria-actions 关联', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const tabs = page.locator(TAB)
  const slots = page.locator('.tab-slot')
  const closes = page.locator('.tab-close')
  const tabCount = await tabs.count()
  expect(tabCount, '默认项目有多个打开项').toBeGreaterThan(1)
  // 每个可见 tab 一个关闭钮(打开项 > 1 时)。
  await expect(closes).toHaveCount(tabCount)
  const opacityOf = (locator: Locator): Promise<string> => locator.evaluate((element) => getComputedStyle(element).opacity)
  // 未悬停且未聚焦时不可见(opacity 0)。
  await expect.poll(() => opacityOf(closes.first())).toBe('0')

  // 每个关闭钮 tabindex=-1(不破坏 tablist 的单一 Tab 停留点 / roving tabindex)。
  for (const close of await closes.all()) {
    await expect(close).toHaveAttribute('tabindex', '-1')
  }
  // aria-actions 指向存在的元素,id 与 tab 一一对应,aria-label 含对应标题(唯一可辨别)。
  const mapping = await slots.evaluateAll((elements) => elements.map((slot) => {
    const tab = slot.querySelector('[role="tab"]')
    const close = slot.querySelector('.tab-close')
    return {
      tabId: tab?.id ?? '',
      actions: tab?.getAttribute('aria-actions') ?? '',
      closeId: close?.id ?? '',
      closeLabel: close?.getAttribute('aria-label') ?? '',
      // tab 的 title 现在追加了状态词(鼠标提示),不再等于纯会话标题;这里取**可见标签文字**
      // (= 会话标题)来核对关闭钮的可访问名含对应标题。
      title: tab?.querySelector('.conversation-tab__label')?.textContent ?? '',
    }
  }))
  for (const item of mapping) {
    expect(item.actions, 'tab 有 aria-actions').not.toBe('')
    expect(item.closeId, 'aria-actions 指向关闭钮').toBe(item.actions)
    expect(item.closeId, '关闭钮 id 与 tab id 一一对应').toBe(`conversation-close-${item.tabId.replace('conversation-tab-', '')}`)
    expect(item.closeLabel, '关闭钮 aria-label 含对应标题').toContain(item.title)
    expect(await page.locator(`#${item.closeId}`).count(), 'aria-actions 指向的元素存在').toBe(1)
  }

  // 零重排:悬停前 / 悬停后,各 tab 的 x / width 逐值不变(关闭钮是绝对定位 + 恒定预留的槽)。
  const boxesBefore = await tabs.evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, width: rect.width } }))
  const firstSlot = slots.first()
  await firstSlot.hover()
  await expect.poll(() => opacityOf(firstSlot.locator('.tab-close'))).toBe('1')
  const boxesAfterHover = await tabs.evaluateAll((elements) => elements.map((element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, width: rect.width } }))
  console.log(`[tab close] 悬停前后 tab 几何 ${JSON.stringify(boxesBefore)} vs ${JSON.stringify(boxesAfterHover)}`)
  expect(boxesAfterHover, '关闭钮出现零重排').toEqual(boxesBefore)

  // 键盘聚焦该 tab → 关闭钮也可见(不许做成「只有 hover 才能发现」)。
  await page.mouse.move(0, 0)
  await expect.poll(() => opacityOf(firstSlot.locator('.tab-close'))).toBe('0')
  await firstSlot.locator(TAB).focus()
  await expect.poll(() => opacityOf(firstSlot.locator('.tab-close'))).toBe('1')
})

// 关闭 ≠ 删除:关掉的 tab 从条上消失,但仍在 ▾ 面板列表里;在面板里点它 → 重新出现在条上并激活。
test('关闭 ≠ 删除:关掉的 tab 仍在 ▾ 面板,点它重新打开并激活', async ({ page }) => {
  // 用 1600(6 条会话全可见、无溢出),否则关掉一个可见 tab 会被隐藏项顶上、可见数不变。
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const tabs = page.locator(TAB)
  const initialCount = await tabs.count()
  expect(initialCount).toBeGreaterThan(1)
  const secondSlot = page.locator('.tab-slot').nth(1)
  const secondTitle = await secondSlot.locator('.conversation-tab__label').innerText()
  expect(secondTitle).not.toBe('')
  await secondSlot.hover()
  await secondSlot.locator('.tab-close').click()
  // tab 条上少一个。
  await expect(tabs).toHaveCount(initialCount - 1)
  await expect(page.locator(TAB, { hasText: secondTitle })).toHaveCount(0)
  // 会话仍在 ▾ 面板里(照旧列出全部,含已关闭的)。
  await openSwitcher(page)
  const row = page.locator('.session-item', { hasText: secondTitle })
  await expect(row, '已关闭的会话仍在面板里').toHaveCount(1)
  // 点它 → 重新出现在条上并成为活动 tab。
  await row.click()
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(page.locator(TAB, { hasText: secondTitle }), '重新打开后又出现在条上').toHaveCount(1)
  await expect(page.locator(TAB, { hasText: secondTitle })).toHaveAttribute('aria-selected', 'true')
  await expect(tabs).toHaveCount(initialCount)
})

// 关掉活动 tab:相邻项(优先右侧)接管;只剩一个打开项时没有关闭钮。
test('关闭活动 tab:相邻项(优先右侧)接管;只剩一个时无关闭钮', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const tabs = page.locator(TAB)
  const closes = page.locator('.tab-close')
  // 1600 下默认项目 6 条会话全可见、全打开。
  await expect(tabs).toHaveCount(SESSIONS_IN_DEFAULT_PROJECT)
  // 关掉活动 tab(index 0 = weekly),右侧邻居(index 1)接管。
  const activeSlot = page.locator('.tab-slot').first()
  const nextTitle = await page.locator('.tab-slot').nth(1).locator('.conversation-tab__label').innerText()
  await activeSlot.hover()
  await activeSlot.locator('.tab-close').click()
  await expect(page.locator(TAB, { hasText: nextTitle })).toHaveAttribute('aria-selected', 'true')
  // 继续关掉末尾的 tab,直到只剩一个打开项 —— 此时不再有关闭钮。
  for (let remaining = SESSIONS_IN_DEFAULT_PROJECT - 1; remaining > 1; remaining -= 1) {
    const lastSlot = page.locator('.tab-slot').last()
    await lastSlot.hover()
    await lastSlot.locator('.tab-close').click()
    await expect(page.locator('.tab-slot')).toHaveCount(remaining - 1)
  }
  await expect(page.locator('.tab-slot'), '条上恒有 ≥1 个打开项').toHaveCount(1)
  await expect(closes, '只剩一个打开项时没有关闭钮').toHaveCount(0)
})

// Delete 键关闭聚焦的 tab(MDN 的 tab role 文档写明的交互)。
test('Delete 键关闭聚焦的 tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const target = page.locator('.tab-slot').nth(1).locator(TAB)
  const title = await target.locator('.conversation-tab__label').innerText()
  expect(title).not.toBe('')
  await target.focus()
  await page.keyboard.press('Delete')
  await expect(page.locator(TAB, { hasText: title }), 'Delete 关闭了聚焦的 tab').toHaveCount(0)
})

// 溢出菜单:1280 下被隐藏的会话出现在菜单里;从菜单选中隐藏项后它变为可见并成为活动 tab。
test('overflow 菜单:隐藏项在菜单里,选中后变可见', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const total = SESSIONS_IN_DEFAULT_PROJECT
  const visibleTitles = await page.locator(TAB).evaluateAll((elements) => elements.map((element) => element.textContent ?? ''))
  await openSwitcher(page)
  const menuRows = page.locator('.session-item')
  await expect(menuRows).toHaveCount(total)
  // 找一个被隐藏的会话(hiring 是最旧的,正常情况下会被收起)。
  const hiring = HEADINGS['zh-CN'].hiring
  expect(visibleTitles.some((title) => title.includes(hiring)), 'hiring 默认应被收起').toBe(false)
  await page.locator('.session-item', { hasText: hiring }).click()
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(hiring)
  // 它现在必须可见。
  expect(await page.locator(TAB, { hasText: hiring }).count(), '选中的隐藏项变为可见').toBe(1)
  await expect(page.locator(TAB, { hasText: hiring })).toHaveAttribute('aria-selected', 'true')
})

// tab 键盘(WAI-ARIA APG,手动激活):←/→ 只移动焦点、不切换;Enter 才切换;Home/End 到首末;回绕。
test('tab 键盘:←/→ 只移焦点不切换,Enter 才切换,Home/End,回绕', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const tabs = page.locator(TAB)
  const first = tabs.first()
  await first.focus()
  await expect(first).toBeFocused()
  const beforeSelected = await page.locator(`${TAB}[aria-selected="true"]`).getAttribute('data-tab-id')
  const beforeTitle = await page.getByRole('heading', { level: 1 }).innerText()
  // → :焦点移到下一个,但 aria-selected / h1 / 转录都不变(证明手动激活)。
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  expect(await page.locator(`${TAB}[aria-selected="true"]`).getAttribute('data-tab-id'), '←/→ 不切换会话').toBe(beforeSelected)
  expect(await page.getByRole('heading', { level: 1 }).innerText()).toBe(beforeTitle)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  // 仍只有一个 tabindex=0(roving 跟焦点走)。
  await expect(page.locator(`${TAB}[tabindex="0"]`)).toHaveCount(1)
  // Enter 才切换:选中的变成刚聚焦的那个。
  const focusedId = await tabs.nth(1).getAttribute('data-tab-id')
  await page.keyboard.press('Enter')
  await expect(page.locator(`${TAB}[aria-selected="true"]`)).toHaveAttribute('data-tab-id', focusedId ?? '')
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  // 首尾回绕:在最后一个 tab 上按 → 回到第一个。
  const last = tabs.last()
  await last.focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.first()).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tabs.last()).toBeFocused()
  // Home / End。
  await page.keyboard.press('Home')
  await expect(tabs.first()).toBeFocused()
  await page.keyboard.press('End')
  await expect(tabs.last()).toBeFocused()
})

// 切换会话:点 tab 切换,标题与转录同步;换项目后 tab 条换成新项目的会话。
test('点 tab 切换会话;换 Agent 后 tab 条换成新项目的会话', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickTab(page, HEADINGS['zh-CN'].weekly)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].weekly)
  await clickTab(page, HEADINGS['zh-CN'].roadmap)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].roadmap)
  // 换 Agent(= 换项目列表 → 落到新项目首条会话):tab 条换成写作助手项目的会话。
  await page.locator(`${AGENT_SELECTOR}__trigger`).click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].writing }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].knowledge)
  await expect(page.locator(TAB, { hasText: HEADINGS['zh-CN'].quarterly })).toHaveCount(1)
})

// 菜单宽度分档与窄屏铺满:≥561 为 420px;≤560 横向铺满会话头内容宽、不溢出。
test('菜单宽度分档:≥561 为 420px;375 铺满会话头且不溢出', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openSwitcher(page)
  const widePanel = await page.locator(SWITCHER_PANEL).boundingBox()
  expect(widePanel).not.toBeNull()
  if (widePanel !== null) expect(Math.abs(widePanel.width - 420)).toBeLessThanOrEqual(1)
  // 右对齐会话头内容右缘(= 菜单钮右缘)。
  const menuBox = await page.locator(SWITCHER_TRIGGER).boundingBox()
  const heading0 = await page.locator('.conversation-heading').boundingBox()
  if (widePanel !== null && menuBox !== null && heading0 !== null) {
    expect(Math.abs(widePanel.x + widePanel.width - (menuBox.x + menuBox.width))).toBeLessThanOrEqual(1)
  }
  await closeSwitcher(page)

  // ≤560:铺满会话头内容盒(左缘 = 内容左缘,右缘 = 内容右缘),且不横向溢出。
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openSwitcher(page)
  const heading = page.locator('.conversation-heading')
  const pads = await heading.evaluate((element) => {
    const style = getComputedStyle(element)
    return { start: Number.parseFloat(style.paddingInlineStart), end: Number.parseFloat(style.paddingInlineEnd) }
  })
  const headingBox = await heading.boundingBox()
  const panel = await page.locator(SWITCHER_PANEL).boundingBox()
  expect(headingBox).not.toBeNull()
  expect(panel).not.toBeNull()
  expect(await horizontalOverflow(page), '375 下不横向溢出').toBeLessThanOrEqual(0)
  if (headingBox !== null && panel !== null) {
    const contentLeft = headingBox.x + pads.start + 1
    const contentRight = headingBox.x + headingBox.width - pads.end - 1
    console.log(`[menu panel] @375 → panel ${panel.x}..${panel.x + panel.width} / 内容 ${contentLeft}..${contentRight} / width ${panel.width}`)
    expect(Math.abs(panel.x - contentLeft), '面板左缘 = 内容左缘').toBeLessThanOrEqual(1)
    expect(Math.abs(panel.x + panel.width - contentRight), '面板右缘 = 内容右缘').toBeLessThanOrEqual(1)
  }
})

test('切换会话后标题同步更新;换项目后 tab 条与标题一并更新', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 默认:weekly 会话,视觉隐藏的 h1 = 当前会话标题。
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].weekly)
  // 同一项目内切会话(点另一个 tab):标题与活动 tab 一起变。
  await clickTab(page, HEADINGS['zh-CN'].roadmap)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].roadmap)
  await expect(page.locator(TAB, { hasText: HEADINGS['zh-CN'].roadmap })).toHaveAttribute('aria-selected', 'true')
  // 换 Agent(= 换项目列表 → 落到新项目首条会话):tab 条与标题必须一起换,防止只更新一半。
  await page.locator(`${AGENT_SELECTOR}__trigger`).click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].writing }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].knowledge)
  await expect(page.locator(TAB, { hasText: HEADINGS['zh-CN'].weekly })).toHaveCount(0)
})

test('空态会话头:h1 回退到「新建对话」,无活动 tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await page.goto('/#/workspace?s=empty')
  await waitForStable(page, 'empty')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].newChat)
  await expect(page.locator(`${TAB}[aria-selected="true"]`)).toHaveCount(0)
})

test('375px 会话头不横向溢出,tab 标签单行省略;＋ 完整可见', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
  // 「＋」新建对话是紧凑导航行档的控件(32×32),窄屏仍是这个尺寸且完整可见(右缘落在面板内)。
  const newChat = page.getByRole('button', { name: '新建对话', exact: true })
  const newChatBox = await newChat.boundingBox()
  expect(newChatBox?.width ?? 0).toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
  expect(newChatBox?.width ?? 0).toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
  expect(newChatBox?.height ?? 0).toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
  expect(newChatBox?.height ?? 0).toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
  // 窄屏下至少一个 tab 可见;每个可见 tab 完整落在 strip 内(无半截)。
  const tablist = page.locator(TABLIST)
  const strip = await tablist.boundingBox()
  const tabBoxes = await page.locator(TAB).evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, right: rect.right, width: rect.width }
  }))
  console.log(`[375 tabs] 可见 ${tabBoxes.length} / 首 tab 宽 ${tabBoxes[0]?.width.toFixed(1) ?? 0} / strip ${strip?.width.toFixed(1) ?? 0}`)
  expect(tabBoxes.length).toBeGreaterThanOrEqual(1)
  if (strip !== null) {
    for (const box of tabBoxes) {
      expect(box.x).toBeGreaterThanOrEqual(strip.x - 1)
      expect(box.right).toBeLessThanOrEqual(strip.x + strip.width + 1)
    }
  }
  if (newChatBox !== null) {
    const layoutViewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(newChatBox.x + newChatBox.width).toBeLessThanOrEqual(layoutViewportWidth + 1)
  }
  // tab 标签单行省略不换行。
  for (const label of await page.locator('.conversation-tab__label').all()) {
    const measured = await label.evaluate((element) => {
      const style = getComputedStyle(element)
      return { whiteSpace: style.whiteSpace, textOverflow: style.textOverflow }
    })
    expect(measured.whiteSpace).toBe('nowrap')
    expect(measured.textOverflow).toBe('ellipsis')
  }
})

test.describe('英文窄屏与无障碍回归', () => {
  test.use({ locale: 'en-US' })

  for (const state of ['ready', 'empty', 'error']) {
    test(`375px 英文 ${state}：占位文案完整与截图`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
      await login(page, 'Sign in')
      await waitForStable(page, 'ready', enHeadingFor('ready'))
      if (state !== 'ready') await page.goto(`/#/workspace?s=${state}`)
      await waitForStable(page, state, enHeadingFor(state))
      await expectComposerUnclipped(page)
      if (state === 'empty') await expectEmptyAtTop(page)
      await expect(page).toHaveScreenshot(`workspace-${state}-375-en.png`, { fullPage: true })
      await expectComposerUnclipped(page)
      if (state === 'empty') await expectEmptyAtTop(page)
      if (state === 'error') {
        await page.getByRole('button', { name: 'Retry', exact: true }).click()
        await waitForStable(page, 'ready', enHeadingFor('ready'))
        await expect.poll(() => page.getByRole('log').evaluate((element) => Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop))).toBeLessThanOrEqual(1)
        await expect(page.getByRole('button', { name: 'Back to bottom' })).toHaveCount(0)
      }
    })
  }

  test('1280px 英文空态：落顶部且标题完整可见', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
    await login(page, 'Sign in')
    await page.goto('/#/workspace?s=empty')
    await waitForStable(page, 'empty', enHeadingFor('empty'))
    await expectEmptyAtTop(page)
  })

  for (const width of [375, 1280]) {
    test(`地标内可访问名不重复 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await login(page, 'Sign in')
      await waitForStable(page, 'ready', enHeadingFor('ready'))
      // h1 是视觉隐藏的当前会话标题,断言它仍是唯一的一级标题、文字即标题、且没有同名地标顶替。
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS.en.weekly)
      await expect(page.getByRole('region', { name: HEADINGS.en.weekly, exact: true })).toHaveCount(0)
      if (width === 375) await page.getByRole('button', { name: 'Open sidebar' }).click()
      const sidebar = page.getByRole(width === 375 ? 'dialog' : 'complementary', { name: 'Agent workspace', exact: true })
      await expect(sidebar).toBeVisible()
      await expect(sidebar.locator('h2')).toBeVisible()
      await expect(sidebar.locator('h2')).toHaveAttribute('aria-hidden', 'true')
      await expect(sidebar.getByRole('heading', { name: 'Agent workspace', exact: true })).toHaveCount(0)
      await expect(sidebar.getByRole('navigation', { name: 'Agent workspace', exact: true })).toHaveCount(0)
      await expect(sidebar.getByRole('button')).not.toHaveCount(0)
    })
  }

  // 四宽度 × 英文:不得出现横向溢出;触发钮(整块标题)的 aria-expanded 两态与面板开合一致。
  // 中文侧由「有数据态」用例逐宽度覆盖。
  for (const width of [375, 768, 1280, 1600]) {
    test(`英文 @${width}:工作区不横向溢出、切换器两态正确`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await login(page, 'Sign in')
      await waitForStable(page, 'ready', enHeadingFor('ready'))
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
      const trigger = page.locator(SWITCHER_TRIGGER)
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      await trigger.click()
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator(SWITCHER_PANEL)).toBeVisible()
      // 面板打开(source-of-truth 复算):无论宽窄都不引入横向溢出(≤560 铺满 / ≥561 左对齐触发钮)。
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
      await page.keyboard.press('Escape')
      await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
      if (width < 1024) {
        // 窄屏侧栏是抽屉:打开后 Agent 切换器可见,且打开抽屉仍不横向溢出。
        await page.getByRole('button', { name: 'Open sidebar' }).click()
        await expect(page.getByRole('dialog', { name: 'Agent workspace' })).toBeVisible()
        await expect(page.locator(`${AGENT_SELECTOR}__trigger`)).toBeVisible()
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
      } else {
        await expect(page.locator(`${AGENT_SELECTOR}__trigger`)).toBeVisible()
        // 英文 Agent 名(最长的本地化文案)在宽屏触发钮里不截断。
        expect(await page.locator(`${AGENT_SELECTOR}__name`).evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      }
    })
  }
})

test('键盘发送、Enter 空草稿不发送、Shift+Enter 与输入框自动增高', async ({ page }) => {
  await login(page)
  await waitForStable(page)
  const input = page.getByRole('textbox', { name: '给 Mia 的消息' })
  await tabTo(page, input)
  await expect(input).toBeFocused()
  // 发送按钮已删除(本轮):输入框里没有任何按钮;空草稿按 Enter 不发送 —— 「空态不可发」改由
  // send() 的 canSend 守卫承担(原先靠按钮的 aria-disabled 表达)。
  await expect(page.locator('.composer-form button')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('.chat-message')).toHaveCount(4)
  await page.keyboard.type('Please prepare a demo checklist.')
  await page.keyboard.press('Enter')
  await expect(page.locator('.chat-message.user').last()).toContainText('Please prepare a demo checklist.')
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
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

// 「回到底部」= 悬浮图标按钮(本轮回修):它移出输入坞、绝对定位在坞顶边之上并居中于阅读列。
// 核心验收:按钮出现前后,输入坞的**高度与顶边完全一致**(它不再占据坞内布局,不再把坞顶高)。
for (const width of [375, 768]) {
  test(`回到底部悬浮钮 @${width}:坞几何不变、不覆盖坞、居中、点击贴底`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await login(page)
    await waitForStable(page)
    const dock = page.locator('.composer-dock')
    const log = page.getByRole('log')
    const button = page.getByRole('button', { name: '回到底部' })
    await expect(button).toHaveCount(0)
    const before = await dock.boundingBox()
    expect(before).not.toBeNull()
    // 用滚轮上滚让按钮出现(比键盘 Home 更跨引擎确定:Home 依赖焦点落在转录区上,WebKit 下不稳)。
    await log.hover()
    await page.mouse.wheel(0, -800)
    await expect(button).toBeVisible()
    // 坞与按钮的几何在**一次求值**里一起取(减少两次 round-trip 之间被重渲染打断的窗口)。
    const measured = await page.evaluate(() => {
      const dockElement = document.querySelector('.composer-dock')
      const buttonElement = document.querySelector('.scroll-to-bottom')
      if (!(dockElement instanceof HTMLElement) || !(buttonElement instanceof HTMLElement)) return null
      const d = dockElement.getBoundingClientRect()
      const b = buttonElement.getBoundingClientRect()
      return {
        dock: { x: d.x, y: d.y, width: d.width, height: d.height },
        button: { x: b.x, y: b.y, width: b.width, height: b.height },
      }
    })
    expect(measured).not.toBeNull()
    if (before === null || measured === null) return
    const after = measured.dock
    const buttonBox = measured.button
    console.log(`[scroll-to-bottom] @${width} 坞高 ${before.height.toFixed(1)}→${after.height.toFixed(1)} / 坞顶边 ${before.y.toFixed(1)}→${after.y.toFixed(1)} / 按钮 ${buttonBox.width.toFixed(1)}×${buttonBox.height.toFixed(1)}`)
    // 核心:坞高度与顶边逐值相同(≤0.5px 容差,吸收亚像素)。
    expect(Math.abs(after.height - before.height), '坞高度不变').toBeLessThanOrEqual(0.5)
    expect(Math.abs(after.y - before.y), '坞顶边不变').toBeLessThanOrEqual(0.5)
    // 按钮不覆盖坞:其底边在坞顶边之上。
    console.log(`[scroll-to-bottom] @${width} 按钮底边 ${(buttonBox.y + buttonBox.height).toFixed(1)} / 坞顶边 ${after.y.toFixed(1)}`)
    expect(buttonBox.y + buttonBox.height, '按钮不覆盖坞(底边在坞顶边之上)').toBeLessThanOrEqual(after.y + 1)
    // 44×44 独立控件(pill 圆形)。
    expect(buttonBox.width).toBeGreaterThanOrEqual(43.5)
    expect(buttonBox.width).toBeLessThanOrEqual(44.5)
    expect(buttonBox.height).toBeGreaterThanOrEqual(43.5)
    expect(buttonBox.height).toBeLessThanOrEqual(44.5)
    // 水平居中于 composer 列(坞的中心):不偏袒左右手。
    const dockCenter = after.x + after.width / 2
    const buttonCenter = buttonBox.x + buttonBox.width / 2
    expect(Math.abs(buttonCenter - dockCenter), '按钮水平居中').toBeLessThanOrEqual(1)
    expect(buttonBox.x, '按钮不横向溢出').toBeGreaterThanOrEqual(-1)
    expect(buttonBox.x + buttonBox.width, '按钮不横向溢出').toBeLessThanOrEqual(width + 1)
    // 点它仍回到底部贴底。
    await button.click()
    await expect(button).toHaveCount(0)
    await expect.poll(() => log.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1)
  })
}

// 会话搜索框单层焦点环(本轮回修):聚焦时只保留容器那一圈青瓷焦点环,
// 输入框自身不再继承全局 :focus-visible 再叠第二圈(双层绿框)。
test('会话搜索聚焦:只有容器一层焦点环,输入框自身无环', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openSwitcher(page)
  const input = page.getByRole('textbox', { name: '搜索对话' })
  await expect(input).toBeFocused()
  const shadows = await page.evaluate(() => {
    const read = (selector: string): string => {
      const element = document.querySelector(selector)
      return element instanceof HTMLElement ? getComputedStyle(element).boxShadow : ''
    }
    return { container: read('.conversation-search'), input: read('.conversation-search__input') }
  })
  console.log(`[search focus ring] 容器 ${shadows.container} / 输入框 ${shadows.input}`)
  expect(shadows.container, '容器有焦点环').not.toBe('none')
  expect(shadows.container.trim(), '容器焦点环非空').not.toBe('')
  expect(shadows.input, '输入框自身无焦点环(单层)').toBe('none')
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
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
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
    const trigger = page.getByRole('button', { name: '打开侧栏' })
    await tabTo(page, trigger)
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Agent 工作区' })
    await expect(dialog).toBeVisible()
    // 抽屉内容已改为 Agent 切换器 + 项目区:首个焦点是切换器触发钮;末个是「打开项目」
    // (项目行里的 chevron / ⋯ 也是焦点停靠点,但都在两者之间)。圈定规则是「首个 ⇄ 末个」,
    // 故从首个 Shift+Tab 应落到抽屉内最后一个可聚焦控件上。
    const agentTrigger = dialog.locator(`${AGENT_SELECTOR}__trigger`)
    await expect(agentTrigger).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.locator('button:not(:disabled)').last()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(agentTrigger).toBeFocused()
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
  // 会话行住在菜单里:开菜单 → 选第二条 → 菜单自动收起、转录切到该会话。
  await openSwitcher(page)
  await page.locator('.session-item').nth(1).click()
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(page.locator('.chat-message')).toHaveCount(2)
  await openSwitcher(page)
  await expect(page.locator('.session-item').nth(1)).toHaveAttribute('aria-current', 'true')
  await closeSwitcher(page)
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await page.getByRole('textbox', { name: '给 Mia 的消息' }).fill('请帮我准备访谈提纲。')
  await page.getByRole('textbox', { name: '给 Mia 的消息' }).press('Enter')
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
  // 会话按项目隔离:默认项目下原 6 条 + 新建 1 条 = 7 条。
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(7)
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
  await expect(page.locator('.telemetry__word')).toHaveText('思考中')
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
  await expect(page.locator('.telemetry__word')).toHaveText('已停止')
  const partial = await response.locator('.message-body').innerText()
  expect(partial.length).toBeGreaterThan(0)
  await expect(page.locator('.stream-cursor')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重新生成' })).toBeEnabled()
  await expect(response.locator('.message-body')).toHaveText(partial)
  await page.getByRole('button', { name: '回到底部' }).click()
  await page.getByRole('button', { name: '重新生成' }).click()
  await expect(page.locator('.stream-cursor')).toBeVisible()
  await expect(page.locator('.telemetry__word')).toHaveText('已生成', { timeout: 15_000 })
  expect((await response.locator('.message-body').innerText()).length).toBeGreaterThan(partial.length)
  await page.screenshot({ path: testInfo.outputPath('complete.png') })
  const trigger = page.getByRole('button', { name: '打开侧栏' })
  await tabTo(page, trigger)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Agent 工作区' })).toBeVisible()
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
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
  await expect(page).toHaveURL(/#\/workspace$/)
  // 首条消息发出后转录必须贴底、且不出现「回到底部」。这两条此前是非确定性的(曾 2/4 红):
  // 空态 → 常规路由会触发一次归档重载,转录被换成 loading 骨架时浏览器把 scrollTop 钳回 0,
  // 该 scroll 事件曾被误读为「用户向上滚动」而把 isPinned 永久置假,stickToBottom 从此早退。
  // 现在只有指针主动上拖才解除粘底(程序化改内容不算),故这条路径确定性地贴底。
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
  const trigger = page.getByRole('button', { name: '打开侧栏' })
  await trigger.click()
  await expect(page.getByRole('button', { name: '关闭侧栏' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(page.locator('.telemetry__word')).toHaveText('已停止')
})

test('切换语言重取历史，生成中延后刷新，不丢用户输入', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await login(page)
  await waitForStable(page)
  const input = page.getByRole('textbox', { name: '给 Mia 的消息' })
  await input.fill('保留我输入的中文。')
  await input.press('Enter')
  await expect(page.locator('.stream-cursor')).toBeVisible()
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await page.getByRole('button', { name: /English/ }).click()
  await expect(page.locator('.stream-cursor')).toBeVisible()
  await expect(page.locator('.telemetry__word')).toHaveText('Complete', { timeout: 15_000 })
  await expect(page.getByRole('log')).toContainText('Let’s turn the goal into a draft')
  await expect(page.getByRole('log')).toContainText('保留我输入的中文。')
  await openSwitcher(page)
  await expect(page.locator('.session-item').first()).toContainText('Turn project updates into an action plan')
})

// 端到端主路径(项目维度):侧栏换 Agent → 项目区随之更换 → 对话栏新建会话 →
// 会话归属**当前项目**(项目挂在 Agent 上,agent 由项目反推,不存在两处对不上的可能)。
test('侧栏换 Agent → 项目区更换 → 新建会话归属当前项目', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const projects = page.locator('.workspace-projects')
  const trigger = page.locator(`${AGENT_SELECTOR}__trigger`)
  // 初始:规划助手;项目区是它的两个项目,当前项目 weekly-report 已默认展开。
  await expect(trigger).toHaveAttribute('aria-label', AGENT_NAMES['zh-CN'].planning)
  await expect(projects).toContainText(PROJECT_NAMES.planning[0])
  await expect(projects).toContainText(PROJECT_NAMES.planning[1])
  await expect(projects).not.toContainText(PROJECT_NAMES.writing[0])

  await trigger.click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].writing }).click()
  await expect(trigger).toHaveAttribute('aria-label', AGENT_NAMES['zh-CN'].writing)
  // 项目区换成写作助手的项目;规划助手的项目消失。
  await expect(projects).toContainText(PROJECT_NAMES.writing[0])
  await expect(projects).toContainText(PROJECT_NAMES.writing[1])
  await expect(projects).not.toContainText(PROJECT_NAMES.planning[0])
  // 会话切到写作助手首个项目的会话(标题块显示它的首条会话)。
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('.chat-message')).toHaveCount(2)
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(2)
  await closeSwitcher(page)

  // 新建对话 + 发送:新会话必须归属**当前项目**(product-docs)。
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await page.getByRole('textbox', { name: '给 Mia 的消息' }).fill('请帮我写一段发布说明。')
  await page.getByRole('textbox', { name: '给 Mia 的消息' }).press('Enter')
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('请帮我写一段发布说明。')
  await expect(page.locator('.conversation-tab', { hasText: '请帮我写一段发布说明。' })).toHaveAttribute('aria-selected', 'true')
  // 新会话进入 product-docs 的会话列表(knowledge + quarterly + 新会话 = 3),并排在最前。
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(3)
  await expect(page.locator('.session-item').first()).toContainText('请帮我写一段发布说明。')
})

// 侧栏切换 Agent:项目列表随之更换(断言具体项目名的出现 / 消失)。
test('侧栏切换 Agent:项目列表随之更换', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const projects = page.locator('.workspace-projects')
  // 侧栏含区标题 + 项目列表(每个 Agent 两个项目)。
  await expect(page.getByRole('button', { name: '关闭侧栏' })).toHaveCount(0)
  await expect(projects.locator('h2')).toHaveText('项目')
  await expect(projects.locator('.project-item')).toHaveCount(2)
  const trigger = page.locator(`${AGENT_SELECTOR}__trigger`)
  await trigger.click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].research }).click()
  await expect(projects).toContainText(PROJECT_NAMES.research[0])
  await expect(projects).toContainText(PROJECT_NAMES.research[1])
  await expect(projects).not.toContainText(PROJECT_NAMES.planning[0])
  await expect(projects.locator('.project-item')).toHaveCount(2)
})

// 对话切换器的键盘与焦点行为:Enter 开面板后焦点落到搜索框、Esc 归还焦点给触发钮、
// 点击面板外关闭、↑/↓ 在搜索框与行之间移动。见下方「对话切换器」用例组。
test('会话搜索:命中正文、点击或键盘激活后定位并高亮该轮', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openSwitcher(page)
  const search = page.getByRole('textbox', { name: '搜索对话' })
  // 「彩排」只出现在 weekly 会话的助手回复正文里,任何会话标题都不含它。
  await search.fill('彩排')
  const hit = page.locator('.hit-item')
  await expect(hit).toHaveCount(1)
  await expect(hit.locator('.hit-snippet')).toContainText('彩排')
  // 命中理由由判别联合的 reason 判别符驱动(不再用空串 turnId 反推)。
  await expect(hit).toHaveAttribute('data-reason', 'body')
  await expect(hit.locator('.hit-reason')).toHaveText('正文命中')
  await hit.click()
  // 点命中即跳转并收起面板;转录定位到 weekly-4 并高亮。
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  const highlighted = page.locator('.chat-message.is-highlighted')
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted).toHaveAttribute('data-message-id', 'weekly-4')

  // 重新打开菜单:上次的搜索词已随菜单关闭清空,回到会话列表(当前项目 weekly-report 下的 6 条)。
  await openSwitcher(page)
  await expect(page.locator('.hit-item')).toHaveCount(0)
  await expect(page.locator('.session-item')).toHaveCount(6)

  // 键盘复现:Tab 到命中项并用 Enter 激活,同样定位到 weekly-4 并高亮。
  await page.getByRole('textbox', { name: '搜索对话' }).fill('彩排')
  await tabTo(page, page.locator('.hit-item').first())
  await page.keyboard.press('Enter')
  await expect(page.locator('.chat-message.is-highlighted')).toHaveCount(1)
  await expect(page.locator('.chat-message.is-highlighted')).toHaveAttribute('data-message-id', 'weekly-4')

  // 标题命中没有可跳转的具体轮次:理由为「标题命中」,点击只切会话、不产生高亮。
  // 搜索按当前项目隔离(weekly-report),故用该项目内的 launch 会话标题作为标题命中样例
  // —— 它的正文里没有「检查清单」这个整串,只会命中标题。
  await openSwitcher(page)
  await page.getByRole('textbox', { name: '搜索对话' }).fill('检查清单')
  const titleHit = page.locator('.hit-item', { hasText: HEADINGS['zh-CN'].launch })
  await expect(titleHit).toHaveAttribute('data-reason', 'title')
  await expect(titleHit.locator('.hit-reason')).toHaveText('标题命中')
  // 片段行只在正文命中时渲染(本轮修正):契约里 snippet 只是正文变体的字段,标题命中不带,
  // 故结果项里不再出现「标题 → 标题」的重复一行。正文命中的片段仍照常渲染(见上方
  // `.hit-snippet` 含「彩排」的断言)—— 两条一起才证明「按 reason 分流」而非取消片段行。
  await expect(titleHit.locator('.hit-snippet')).toHaveCount(0)
  await titleHit.click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('.chat-message.is-highlighted')).toHaveCount(0)
})

test('选择器键盘:Enter 打开聚焦首项、选项可 Tab、选后与 Esc 归还焦点、点外部关闭', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const trigger = page.locator(`${AGENT_SELECTOR}__trigger`)
  const options = page.locator(`${AGENT_SELECTOR}__option`)
  await tabTo(page, trigger)
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  // 键盘派生的 click(detail = 0):打开后焦点落在首项。
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(options).toHaveCount(3)
  // 选项必须是原生 button(可 Tab 到达),不是无 tabindex 的菜单项。
  for (const option of await options.all()) await expect(option).toHaveJSProperty('tagName', 'BUTTON')
  await expect(options.first()).toBeFocused()

  // Tab 在三个原生按钮之间移动。
  await page.keyboard.press('Tab')
  await expect(options.nth(1)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(options.nth(2)).toBeFocused()

  // 选第二项(研究助手):弹层关闭且焦点回到触发钮,可访问名随之更新。
  await page.keyboard.press('Shift+Tab')
  await expect(options.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-label', AGENT_NAMES['zh-CN'].research)

  // Esc 关闭并归还焦点(不改变选择)。
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-label', AGENT_NAMES['zh-CN'].research)

  // 点击外部关闭。
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.locator('.conversation').click({ position: { x: 240, y: 320 } })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

// Agent 切换器:触发钮与弹层(沿用 disclosure 范式),弹层锚到动作行、落在侧栏面板内不被裁切。
for (const width of [1280, 1600]) {
  test(`Agent 切换器 @${width}:弹层落在侧栏面板内、aria-expanded 两态`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    const actions = page.locator('.sidebar-actions')
    expect(await actions.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)

    const trigger = page.locator(`${AGENT_SELECTOR}__trigger`)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    const box = await trigger.boundingBox()
    expect(box).not.toBeNull()
    if (box === null) return
    // 触发钮占满动作行(窄屏还会给关闭按钮留位),高度不低于触达尺寸。
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThan(120)
    // 中文下当前 Agent 名完整不截断。
    expect(await page.locator(`${AGENT_SELECTOR}__name`).evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)

    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const popover = page.locator(`${AGENT_SELECTOR}__popover`)
    await expect(popover).toBeVisible()
    // 弹层锚到动作行:横向贴齐该行且落在侧栏面板内(面板 overflow: hidden 会把越界内容裁掉)。
    const popoverBox = await popover.boundingBox()
    const sidebarBox = await page.locator('.workspace-sidebar').boundingBox()
    const actionsBox = await actions.boundingBox()
    expect(popoverBox).not.toBeNull()
    expect(sidebarBox).not.toBeNull()
    expect(actionsBox).not.toBeNull()
    if (popoverBox !== null && sidebarBox !== null && actionsBox !== null) {
      expect(popoverBox.x).toBeGreaterThanOrEqual(sidebarBox.x)
      expect(popoverBox.x + popoverBox.width).toBeLessThanOrEqual(sidebarBox.x + sidebarBox.width)
      expect(Math.abs(popoverBox.x - actionsBox.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(popoverBox.x + popoverBox.width - (actionsBox.x + actionsBox.width))).toBeLessThanOrEqual(1)
    }
    await page.keyboard.press('Escape')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
}

// 一次 Escape 只关最上层(本次回修):抽屉在 document 上监听 Escape(见 workspace-page 的
// drawerKeyboard),弹层若不阻止冒泡,同一次按键会同时关掉弹层与抽屉。此用例把「关弹层、
// 抽屉仍在」锁死。
test('窄屏抽屉内弹层:Esc 只关弹层,抽屉仍开', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const sidebarTrigger = page.getByRole('button', { name: '打开侧栏' })
  await sidebarTrigger.click()
  const dialog = page.getByRole('dialog', { name: 'Agent 工作区' })
  await expect(dialog).toBeVisible()
  await expect(sidebarTrigger).toHaveAttribute('aria-expanded', 'true')

  const agentTrigger = page.locator(`${AGENT_SELECTOR}__trigger`)
  await agentTrigger.click()
  await expect(agentTrigger).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator(`${AGENT_SELECTOR}__popover`)).toBeVisible()

  await page.keyboard.press('Escape')
  // 弹层关闭且焦点归还触发钮;抽屉与它的展开态不受这次按键影响。
  await expect(agentTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator(`${AGENT_SELECTOR}__popover`)).toHaveCount(0)
  await expect(agentTrigger).toBeFocused()
  await expect(dialog).toBeVisible()
  await expect(page.locator('.workspace-sidebar')).toHaveClass(/is-open/)
  await expect(sidebarTrigger).toHaveAttribute('aria-expanded', 'true')
})

test.describe('Agent 选择器(英文窄屏)', () => {
  test.use({ locale: 'en-US' })


  test('375px 英文抽屉内选择器弹层不越出侧栏面板', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
    await login(page, 'Sign in')
    await waitForStable(page, 'ready', enHeadingFor('ready'))
    await page.getByRole('button', { name: 'Open sidebar' }).click()
    await expect(page.getByRole('dialog', { name: 'Agent workspace' })).toBeVisible()
    await page.locator(`${AGENT_SELECTOR}__trigger`).click()
    await expect(page.locator(`${AGENT_SELECTOR}__popover`)).toBeVisible()
    const popover = await page.locator(`${AGENT_SELECTOR}__popover`).boundingBox()
    const sidebar = await page.locator('.workspace-sidebar').boundingBox()
    expect(popover).not.toBeNull()
    expect(sidebar).not.toBeNull()
    if (popover === null || sidebar === null) return
    // 最坏情况:窄屏触发钮靠左、英文选项又最长(实测弹层约 203px)。弹层若以触发钮为基准
    // 右对齐会向左越界约 12px、被面板的 overflow: hidden 裁掉;锚到动作行后左缘须仍在面板内。
    expect(popover.x).toBeGreaterThanOrEqual(sidebar.x)
    expect(popover.x + popover.width).toBeLessThanOrEqual(sidebar.x + sidebar.width)
  })

  test('1280px 英文选择器弹层不越出侧栏面板', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
    await login(page, 'Sign in')
    await waitForStable(page, 'ready', enHeadingFor('ready'))
    await page.locator(`${AGENT_SELECTOR}__trigger`).click()
    await expect(page.locator(`${AGENT_SELECTOR}__popover`)).toBeVisible()
    const popover = await page.locator(`${AGENT_SELECTOR}__popover`).boundingBox()
    const sidebar = await page.locator('.workspace-sidebar').boundingBox()
    expect(popover).not.toBeNull()
    expect(sidebar).not.toBeNull()
    if (popover === null || sidebar === null) return
    // 英文选项文案更长,是弹层宽度的最坏情况:仍须落在面板内,不被 overflow: hidden 裁切。
    expect(popover.x).toBeGreaterThanOrEqual(sidebar.x)
    expect(popover.x + popover.width).toBeLessThanOrEqual(sidebar.x + sidebar.width)
  })
})

// ============================================================================
// 本轮新增:输入框下方的运行遥测条 + 「等待交互」确认卡。
// ============================================================================

// 解析设计 token 在当前作用域(.dl-scope--dark)下的实际计算颜色:把探针挂进 .workspace-page,
// 让 var(--dl-*) 解析到深色取值,拿到与用量条填充可直接比较的颜色字符串。
async function resolveToken(page: Page, token: string): Promise<string> {
  return page.locator('.workspace-page').evaluate((root, name) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    root.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)
}

// 三档用量与它们应落的分级配色(与 mock 的 contextUsedTokens / contextWindowTokens 同源)。
const CONTEXT_TIERS = [
  { agent: AGENT_NAMES['zh-CN'].planning, text: '41% (82K/200K)', level: 'info', token: '--dl-info' },
  { agent: AGENT_NAMES['zh-CN'].research, text: '78% (156K/200K)', level: 'warning', token: '--dl-warning' },
  { agent: AGENT_NAMES['zh-CN'].writing, text: '93% (186K/200K)', level: 'error', token: '--dl-error' },
] as const

// 直达「等待交互」演示态:登录 → ?s=waiting(与 ?s=empty / ?s=error 同源)。
async function openWaiting(page: Page): Promise<void> {
  await login(page)
  await page.goto('/#/workspace?s=waiting')
  await waitForStable(page, 'ready', HEADINGS['zh-CN'].knowledge)
}

test('遥测条:五项齐备、状态项为唯一 live region、Context 文本与 mock 一致', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  const bar = page.locator('.telemetry')
  await expect(bar).toBeVisible()

  // 状态项是 live region;遥测条其余部分不抢 live(整页只有这一个 role="status")。
  const status = page.locator('.telemetry__status')
  await expect(status).toHaveAttribute('role', 'status')
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(page.locator('.workspace-page [role="status"]')).toHaveCount(1)

  // 五项:状态 · 模型 · Context · 时长 · 项目。最后一项表达**当前项目**(CLI 的 cwd)——
  // 项目名是技术标识(目录名),条内只显示名;完整路径放进 title(悬停可见)。
  await expect(status).toBeVisible()
  await expect(page.locator('.telemetry__model')).toHaveText('Claude Sonnet 4.5')
  await expect(page.locator('.telemetry__context-text')).toHaveText('41% (82K/200K)')
  await expect(page.locator('.telemetry__elapsed')).toHaveText(/^\d+:\d{2}$/)
  await expect(page.locator('.telemetry__item--workspace')).toContainText(PROJECT_NAMES.planning[0])
  await expect(page.locator('.telemetry__item--workspace')).toHaveAttribute('title', '~/work/weekly-report')
  await expect(page.locator('.telemetry__path')).toHaveCount(0)

  // 尺寸克制:单行、高度守在 28–32px。
  const height = (await bar.boundingBox())?.height ?? 0
  console.log(`[telemetry height] ${height}px`)
  expect(height).toBeGreaterThanOrEqual(28)
  expect(height).toBeLessThanOrEqual(32)

  // 默认(planning)为 41%:用量条填充落在 info 档,且绝不用强调色刷用量条。
  const fill = page.locator('.telemetry__meter-fill')
  await expect(fill).toHaveAttribute('data-level', 'info')
  const fillColor = await fill.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(fillColor).toBe(await resolveToken(page, '--dl-info'))
  expect(fillColor).not.toBe(await resolveToken(page, '--dl-accent'))
})

test('遥测条:用量条按 41% / 78% / 93% 三档落在 info / warning / error', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const trigger = page.locator(`${AGENT_SELECTOR}__trigger`)
  const fill = page.locator('.telemetry__meter-fill')
  const accent = await resolveToken(page, '--dl-accent')
  for (const tier of CONTEXT_TIERS) {
    await trigger.click()
    await page.locator(`${AGENT_SELECTOR}__option`, { hasText: tier.agent }).click()
    await expect(page.locator('.telemetry__context-text')).toHaveText(tier.text)
    await expect(fill).toHaveAttribute('data-level', tier.level)
    const tokenColor = await resolveToken(page, tier.token)
    const fillColor = await fill.evaluate((element) => getComputedStyle(element).backgroundColor)
    console.log(`[telemetry meter] ${tier.text} ${tier.level} → token ${tokenColor} / fill ${fillColor}`)
    expect(fillColor).toBe(tokenColor)
    expect(fillColor).not.toBe(accent)
  }
})

test('遥测条状态项随流式变化,且不再有第二处状态行', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 转录里旧的状态行已并入遥测条,页面内不再有 .generation-status。
  await expect(page.locator('.generation-status')).toHaveCount(0)
  const word = page.locator('.telemetry__word')
  const input = page.getByRole('textbox', { name: '给 Mia 的消息' })
  await input.fill('请把演示顺序排一下。')
  await input.press('Enter')
  await expect(word).toHaveText('思考中')
  await expect(word).toHaveText('输出中', { timeout: 5_000 })
  await page.getByRole('button', { name: '停止生成' }).click()
  await expect(word).toHaveText('已停止')
  await expect(page.locator('.generation-status')).toHaveCount(0)
})

test('等待交互直达 @1280:确认卡出现、遥测等待确认、受影响文件为 pending', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)

  // 遥测条状态 = 等待确认,状态圆点走警告色。
  await expect(page.locator('.telemetry__word')).toHaveText('等待确认')
  await expect(page.locator('.telemetry__dot')).toHaveAttribute('data-level', 'warning')

  // 侧栏是写作助手的 product-docs 项目(默认展开),受影响条目 release-notes.md 的芯片为 pending。
  const chip = page.locator('.entry-row', { hasText: AFFECTED_ENTRY }).locator(CHIP)
  await expect(chip).toHaveAttribute('data-state', 'pending')
  await expect(chip).toHaveText('待确认')

  // 确认卡是转录流里的一条,带可访问名、摘要、受影响文件与两个操作。
  const card = page.locator('.transcript-inner .confirmation-card')
  await expect(card).toHaveCount(1)
  await expect(card).toHaveAttribute('role', 'group')
  await expect(card).toHaveAttribute('aria-label', '需要你的确认')
  await expect(card.locator('.confirmation-summary')).toHaveText('用新草稿改写「release-notes.md」')
  await expect(card.locator('.confirmation-file')).toHaveText(AFFECTED_ENTRY)
  await expect(card.getByRole('button', { name: '允许', exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: '拒绝', exact: true })).toBeVisible()
  // 详情默认收起,点击「查看详情」后展开。
  await expect(card.locator('.confirmation-detail')).toBeHidden()
  await card.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(card.locator('.confirmation-detail')).toBeVisible()
  // 新出现的确认卡与 pending 芯片也在对比度断言范围内(既有对比度用例只跑四态非等待态)。
  expect(await contrastViolations(page)).toEqual([])
})

test('等待交互:允许 → 卡片塌缩留痕、芯片变 modified、状态回到输出中', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  const chip = page.locator('.entry-row', { hasText: AFFECTED_ENTRY }).locator(CHIP)
  await expect(chip).toHaveAttribute('data-state', 'pending')

  await page.locator('.confirmation-card').getByRole('button', { name: '允许', exact: true }).click()

  // 留痕:塌缩成一行、不消失(审计痕迹)。
  const record = page.locator('.confirmation-record')
  await expect(record).toHaveAttribute('data-outcome', 'allowed')
  await expect(record).toContainText('已允许')
  await expect(record).toContainText('用新草稿改写「release-notes.md」')
  await expect(page.locator('.confirmation-card')).toHaveClass(/is-resolved/)
  // 跨区域联动:受影响文件变 modified,遥测状态回到输出中。
  await expect(chip).toHaveAttribute('data-state', 'modified')
  await expect(page.locator('.telemetry__word')).toHaveText('输出中')
  // Agent 继续:多出一条后续消息。
  await expect(page.locator('[data-message-id="confirmation-followup-allowed"]')).toBeVisible()
})

test('等待交互:拒绝 → 留痕为已拒绝、芯片回原状态', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  const chip = page.locator('.entry-row', { hasText: AFFECTED_ENTRY }).locator(CHIP)
  await expect(chip).toHaveAttribute('data-state', 'pending')

  await page.locator('.confirmation-card').getByRole('button', { name: '拒绝', exact: true }).click()

  const record = page.locator('.confirmation-record')
  await expect(record).toHaveAttribute('data-outcome', 'rejected')
  await expect(record).toContainText('已拒绝')
  await expect(page.locator('.confirmation-card')).toHaveClass(/is-resolved/)
  // 芯片回到原状态(release-notes.md 的原始 state 是 created),Agent 改走另一条路。
  await expect(chip).toHaveAttribute('data-state', 'created')
  await expect(page.locator('.telemetry__word')).toHaveText('空闲')
  await expect(page.locator('[data-message-id="confirmation-followup-rejected"]')).toBeVisible()
})

test('等待交互:确认卡键盘路径(Tab 可达、Enter 触发、处理后焦点不丢)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  const card = page.locator('.confirmation-card')
  const allow = card.getByRole('button', { name: '允许', exact: true })
  const reject = card.getByRole('button', { name: '拒绝', exact: true })

  // 两个操作是原生 button 且 ≥44×44 触达尺寸。
  for (const button of [allow, reject]) {
    expect(await button.evaluate((element) => element.tagName)).toBe('BUTTON')
    const box = await button.boundingBox()
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44)
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }

  // Tab 可达:从转录滚动区继续 Tab,依序落到「查看详情 → 允许 → 拒绝」。
  await page.getByRole('log').focus()
  await page.keyboard.press('Tab')
  await expect(card.locator('.confirmation-toggle')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(allow).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(reject).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(allow).toBeFocused()

  // Enter 触发允许:处理后焦点落在留痕上(不丢给 body,也不停在已消失的按钮上)。
  await page.keyboard.press('Enter')
  const record = page.locator('.confirmation-record')
  await expect(record).toBeVisible()
  await expect(record).toBeFocused()
  await expect(page.locator('.confirmation-card')).toHaveClass(/is-resolved/)
})

test('等待交互 @375:确认卡与遥测条均不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  await expect(page.locator('.confirmation-card')).toBeVisible()
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  // 窄屏降级后状态项与 Context 不隐藏。
  await expect(page.locator('.telemetry__status')).toBeVisible()
  await expect(page.locator('.telemetry__context-text')).toBeVisible()
})

// 英文窄屏 + 最长状态词("Waiting for confirmation")是最坏的横向空间情形:
// 状态项与 Context 都必须完整可见,不被裁切。故单独锁定这条。
test.describe('遥测条(英文窄屏)', () => {
  test.use({ locale: 'en-US' })

  test('375px 英文等待交互:状态与 Context 均不被裁切', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
    await login(page, 'Sign in')
    await page.goto('/#/workspace?s=waiting')
    await waitForStable(page, 'ready', HEADINGS.en.knowledge)
    await expect(page.locator('.telemetry__word')).toHaveText('Waiting for confirmation')
    const bar = await page.locator('.telemetry').boundingBox()
    const status = await page.locator('.telemetry__status').boundingBox()
    const context = await page.locator('.telemetry__item--context').boundingBox()
    expect(bar).not.toBeNull()
    expect(status).not.toBeNull()
    expect(context).not.toBeNull()
    if (bar === null || status === null || context === null) return
    // 两项的右缘都须落在遥测条的右缘之内(否则被 overflow: hidden 裁掉)。
    expect(status.x + status.width).toBeLessThanOrEqual(bar.x + bar.width + 1)
    expect(context.x + context.width).toBeLessThanOrEqual(bar.x + bar.width + 1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })
})

// 遥测条降级:按**自身可用宽度**(容器查询)触发,而非视口宽度。遥测条住在阅读列内,可用宽
// 上限 = --workspace-column-max 768 + 两侧内边距,故宽视口下也未必装得下五项。
// 四宽度 × 中英 × (常规 / 等待交互)下:条不横向溢出;状态词与 Context 文本永不裁切;
// 1280 / 1600 宽屏下工作区名也不被裁。等待交互态是最坏情形(最长状态词 +
// 最长动作文案 + 最长 Context),故与常规态一并锁定。
function isUnclipped(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((element) => element.clientWidth >= element.scrollWidth)
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test.describe(`遥测条按自身宽度降级(${locale})`, () => {
    test.use({ locale })
    for (const width of [375, 768, 1280, 1600]) {
      test(`@${width}:条不溢出、状态词与 Context 不被裁、宽屏工作区名不被裁`, async ({ page }) => {
        const en = locale === 'en-US'
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
        await login(page, en ? 'Sign in' : '登录')
        const stateCases = [
          { url: '/#/workspace', heading: en ? HEADINGS.en.weekly : HEADINGS['zh-CN'].weekly },
          { url: '/#/workspace?s=waiting', heading: en ? HEADINGS.en.knowledge : HEADINGS['zh-CN'].knowledge },
        ]
        for (const stateCase of stateCases) {
          // 登录态只存在内存里(原型约定:刷新即重置),任何整页加载都会把它丢掉 —— 而
          // `page.goto` 到与当前**完全相同**的 URL 时,WebKit 会真的重新加载文档、Chromium 不会。
          // 于是这里不做整页导航:首个用例在登录后本来就在目标 URL 上,其余用例只改 hash
          // (同文档路由,登录态不丢),两个引擎下行为一致。
          const target = stateCase.url.slice(1)
          if (!page.url().endsWith(target)) {
            await page.evaluate((hash) => { location.hash = hash }, target)
          }
          await waitForStable(page, 'ready', stateCase.heading)
          const bar = page.locator('.telemetry')
          await expect(bar).toBeVisible()
          const overflow = await bar.evaluate((element) => element.scrollWidth - element.clientWidth)
          expect(overflow, `${stateCase.url} @${width} 遥测条横向溢出`).toBeLessThanOrEqual(1)
          expect(await isUnclipped(page, '.telemetry__word'), `${stateCase.url} @${width} 状态词被裁切`).toBe(true)
          expect(await isUnclipped(page, '.telemetry__context-text'), `${stateCase.url} @${width} Context 文本被裁切`).toBe(true)
          if (width >= 1280) {
            expect(await isUnclipped(page, '.telemetry__ws-name'), `${stateCase.url} @${width} 工作区名被裁切`).toBe(true)
          }
        }
      })
    }
  })
}

// ============================================================================
// 结构性不变量(本轮回修):`waiting` 状态 ⇔ 存在确认请求。
// 遥测状态词为「等待确认」、转录里有确认卡、侧栏有 pending 芯片 —— 三者必须同源,
// 任一演示态下都不允许只出现其中之一。四条演示态 × 两宽度逐格核对,并覆盖复审给出的
// 两条到达路径:① 常规态把选择器切到写作助手;② 从 ?s=waiting 点会话 / 点新建对话回到常规态。
// ============================================================================
const WAITING_WORD = '等待确认'

// 等遥测与确认请求都落定后,断言三个同源事实与演示态一致,并返回落定后的三元组用于日志。
// 「落定」是必要的:status 随 AgentRuntime 先到,确认卡与 pending 芯片晚一次请求(loadConfirmation
// 在 loadTelemetry 里排在 runtime 之后),不等待就会读到中间的瞬时值。
async function expectWaitingLinkage(
  page: Page,
  expectWaiting: boolean,
  label: string,
): Promise<{ word: boolean; cards: number; chips: number }> {
  // 先等运行遥测取回(Context 项出现)、侧栏项目列表与**当前项目的文件树**都加载完,再读值。
  // 芯片住在项目树里:项目默认展开、树本身是异步按需取的,不等树落定会读到「还没有芯片」的
  // 中间瞬时值。
  await expect(page.locator('.telemetry__item--context'), label).toBeVisible()
  await expect(page.locator('.sidebar-loading'), label).toHaveCount(0)
  // 用 toBeAttached 而非 toBeVisible:窄屏下侧栏是收起的抽屉,树在 DOM 里但不可见。
  await expect(page.locator('.project-tree .entry-row').first(), label).toBeAttached()
  const word = page.locator('.telemetry__word')
  const card = page.locator('.transcript-inner .confirmation-card')
  const chip = page.locator(`${CHIP}[data-state="pending"]`)
  if (expectWaiting) {
    await expect(word, label).toHaveText(WAITING_WORD)
    await expect(card, label).toHaveCount(1)
    await expect(chip, label).toHaveCount(1)
  } else {
    await expect(word, label).not.toHaveText(WAITING_WORD)
    await expect(card, label).toHaveCount(0)
    await expect(chip, label).toHaveCount(0)
  }
  return { word: (await word.innerText()) === WAITING_WORD, cards: await card.count(), chips: await chip.count() }
}

for (const width of [375, 1280]) {
  test(`waiting 不变量 @${width}:状态词 / 确认卡 / pending 芯片三者同源`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    // 首态 normal 由登录直接落到 #/workspace;其余态经 hash 切换(goto 只改 hash,不触发整页
    // 重载,内存登录态因此不丢)。
    const states = [
      { demo: 'normal', url: '/#/workspace', status: 'ready', heading: HEADINGS['zh-CN'].weekly },
      { demo: 'empty', url: '/#/workspace?s=empty', status: 'empty', heading: HEADINGS['zh-CN'].newChat },
      { demo: 'error', url: '/#/workspace?s=error', status: 'error', heading: HEADINGS['zh-CN'].weekly },
      { demo: 'waiting', url: '/#/workspace?s=waiting', status: 'ready', heading: HEADINGS['zh-CN'].knowledge },
    ] as const
    for (const [index, state] of states.entries()) {
      if (index > 0) await page.goto(state.url)
      await waitForStable(page, state.status, state.heading)
      const expectWaiting = state.demo === 'waiting'
      const actual = await expectWaitingLinkage(page, expectWaiting, `${state.demo} @${width}`)
      console.log(`[waiting invariant] ${state.demo} @${width} → word=${actual.word} cards=${actual.cards} chips=${actual.chips}`)
    }
  })
}

test('回归路径①:常规态切到写作助手,不得只报「等待确认」', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 常规态下把选择器切到写作助手:它此刻没有确认请求,状态词不得变成「等待确认」。
  const trigger = page.locator(`${AGENT_SELECTOR}__trigger`)
  await trigger.click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].writing }).click()
  // 写作助手的常态给出非确认类的状态与具体动作。
  await expect(page.locator('.telemetry__word')).toHaveText('输出中')
  await expect(page.locator('.telemetry__detail')).toContainText('正在改写发布说明')
  const actual = await expectWaitingLinkage(page, false, 'path① @1280')
  console.log(`[waiting invariant] path① @1280 → word=${actual.word} cards=${actual.cards} chips=${actual.chips}`)
  // 侧栏写作项目在场,但 release-notes.md 是 created(不是 pending)—— 正是复审现象的落点。
  await expect(page.locator('.entry-row', { hasText: AFFECTED_ENTRY }).locator(CHIP)).toHaveAttribute('data-state', 'created')
})

test('回归路径②:?s=waiting 换 Agent 或新建对话后状态词离开「等待确认」', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  await expectWaitingLinkage(page, true, 'path② start @1280')

  // 路径 ②-a:换 Agent 到规划助手 —— 当前会话变 weekly(不等待),三处同源地离开「等待确认」。
  // (点会话不再离开等待态:会话头只提供本项目的会话,选中其中一个不该丢掉等待演示,见 selectSession;
  //  点开等待中的会话要看的是它自己的确认卡。)
  await page.locator(`${AGENT_SELECTOR}__trigger`).click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].planning }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  const afterAgent = await expectWaitingLinkage(page, false, 'path②-agent @1280')
  console.log(`[waiting invariant] path②-agent @1280 → word=${afterAgent.word} cards=${afterAgent.cards} chips=${afterAgent.chips}`)

  // 路径 ②-b:回到 waiting 直达态,再用「＋ 新建对话」离开。先经 normal 再进 waiting:
  // 直接 goto 同一个 hash 不触发 hashchange,演示态不会被重新应用。
  await page.goto('/#/workspace')
  await page.goto('/#/workspace?s=waiting')
  await waitForStable(page, 'ready', HEADINGS['zh-CN'].knowledge)
  await expectWaitingLinkage(page, true, 'path② restart @1280')
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  const afterNew = await expectWaitingLinkage(page, false, 'path②-new @1280')
  console.log(`[waiting invariant] path②-new @1280 → word=${afterNew.word} cards=${afterNew.cards} chips=${afterNew.chips}`)
  await expect(page.locator('.entry-row', { hasText: AFFECTED_ENTRY }).locator(CHIP)).toHaveAttribute('data-state', 'created')
})

// ============================================================================
// 本轮新增:侧栏「项目」维度(项目 = Agent Host 上的一个目录,即 CLI 的 cwd)。
// 项目行单控件交互、项目内的文件树、打开 / 关闭项目、会话按项目隔离。
// ============================================================================
// 项目行**单控件**(本轮改动):整行一个按钮 —— 点未展开的行 = 选中 + 展开 + 折叠其它;
// 点已展开的行 = 折叠(仍保持选中)。上一轮照 Primer 做的「chevron / 名称两段式」已下线,
// 故这里是**语义替换**而非放宽:原两条「两态独立」的断言不可能再成立(展开与选中由同一次
// 点击一起决定),新断言锁的是单展开不变量 —— 至多一个项目展开,且展开者必为当前选中者。
test('项目行单控件:选中与展开一起切换,至多一个展开、展开者即选中者', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const items = page.locator('.project-item')
  const rowButton = (index: number) => items.nth(index).locator('.project-row__button')
  // 单展开不变量:展开集至多一个成员,且凡展开者必带 aria-current。
  const expectSingleExpand = async (label: string): Promise<void> => {
    const states = await items.evaluateAll((els) => els.map((el) => {
      const button = el.querySelector('.project-row__button')
      return {
        expanded: button?.getAttribute('aria-expanded') === 'true',
        current: button?.getAttribute('aria-current') === 'true',
      }
    }))
    expect(states.filter((state) => state.expanded).length, `${label}:展开的项目数`).toBeLessThanOrEqual(1)
    for (const state of states) if (state.expanded) expect(state.current, `${label}:展开者即选中者`).toBe(true)
  }

  // 初始:首个项目选中且展开,第二个两者皆否。
  await expect(rowButton(0)).toHaveAttribute('aria-expanded', 'true')
  await expect(rowButton(0)).toHaveAttribute('aria-current', 'true')
  await expect(rowButton(1)).toHaveAttribute('aria-expanded', 'false')
  await expect(rowButton(1)).not.toHaveAttribute('aria-current', 'true')
  await expectSingleExpand('初始')
  // 可访问名就是项目名;aria-controls 指向自己的树容器。
  await expect(rowButton(0)).toHaveText(PROJECT_NAMES.planning[0].toString())
  await expect(rowButton(0)).toHaveAttribute('aria-controls', `project-tree-${PROJECT_NAMES.planning[0]}`)

  // 点未展开的第二行:它变展开 + 变当前,第一行被折叠。
  await rowButton(1).click()
  await expect(rowButton(1)).toHaveAttribute('aria-expanded', 'true')
  await expect(rowButton(1)).toHaveAttribute('aria-current', 'true')
  await expect(rowButton(0)).toHaveAttribute('aria-expanded', 'false')
  await expect(rowButton(0)).not.toHaveAttribute('aria-current', 'true')
  await expectSingleExpand('展开第二个')

  // 再点已展开的第二行:折叠,但**仍是当前项目**。
  await rowButton(1).click()
  await expect(rowButton(1)).toHaveAttribute('aria-expanded', 'false')
  await expect(rowButton(1)).toHaveAttribute('aria-current', 'true')
  await expectSingleExpand('折叠第二个')

  // 造第三个项目(打开 api-server,自动选中并展开),再做「三项目来回点」的不变量核对。
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  const dialog = page.locator('dialog.picker')
  await dialog.locator('.picker__item', { hasText: 'api-server' }).locator('.picker__check').check()
  await dialog.getByRole('button', { name: '打开', exact: true }).click()
  await expect(items).toHaveCount(3)
  await expectSingleExpand('打开第三个后')
  for (const index of [0, 2, 1, 0, 2]) {
    await rowButton(index).click()
    await expect(rowButton(index)).toHaveAttribute('aria-expanded', 'true')
    await expect(rowButton(index)).toHaveAttribute('aria-current', 'true')
    await expectSingleExpand(`切到第 ${index} 个项目`)
  }
})

// 缩进与对齐(本轮改动):逐层 8px;同层目录行与文件行标签左缘相等;导引线是装饰性的。
// 本轮把 mock 的树加深到 5 层(src → components → layout → header → index.ts),
// 故步长核对覆盖 1→5 层(此前只有 1→3 层)。
test('项目树缩进:逐层 8px、同层标签左缘对齐、导引线装饰性(1→5 层)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const tree = page.locator('.project-item').nth(0).locator('.project-tree')
  // 逐层展开到第 5 层。weekly-report 树:
  //   src(1) → components(2) → layout(3) → header(4) → index.ts(5);另展开 utils 使第 3 层
  // 同时出现目录(layout)与文件(format.ts),以核对同层「文件夹 / 文件」标签左缘。
  for (const dir of ['src', 'components', 'layout', 'header', 'utils']) {
    await tree.locator('.entry-row[data-kind="directory"]', { hasText: dir }).first().locator('.entry-row__button').click()
  }
  await expect(tree.locator('.entry-row', { hasText: 'index.ts' })).toHaveCount(1)
  await expect(tree.locator('.entry-row', { hasText: 'format.ts' })).toHaveCount(1)

  const rows = await tree.locator('.entry-row').evaluateAll((els) => els.map((el) => {
    const name = el.querySelector('.entry-name')
    // 量**标签文字的左缘**(Range 取文字墨迹),而不是元素盒 —— 目录行的悬停留白
    // 会让盒与墨迹错开 4px,只量盒就看不见「文件夹与文件对不齐」。
    const range = document.createRange()
    if (name) range.selectNodeContents(name)
    const textLeft = name ? range.getBoundingClientRect().left : 0
    return {
      kind: el.getAttribute('data-kind') ?? '',
      name: name?.textContent ?? '',
      level: Number(getComputedStyle(el).getPropertyValue('--workspace-tree-level')),
      left: textLeft,
      guides: el.querySelectorAll('.entry-guide').length,
      guidesHidden: el.querySelector('.entry-guides')?.getAttribute('aria-hidden') ?? null,
    }
  }))
  const byLevel = new Map<number, typeof rows>()
  for (const row of rows) byLevel.set(row.level, [...(byLevel.get(row.level) ?? []), row])
  const levels = [...byLevel.keys()].sort((a, b) => a - b)
  // mock 已加深到 5 层,故 1→5 层全部出现、逐层核对。
  expect(levels).toEqual([1, 2, 3, 4, 5])
  for (let index = 1; index < levels.length; index += 1) {
    const previous = byLevel.get(levels[index - 1] ?? -1)?.[0]
    const current = byLevel.get(levels[index] ?? -1)?.[0]
    expect(previous, `第 ${levels[index]} 层应有前一层行`).toBeDefined()
    expect(current, `第 ${levels[index]} 层应有行`).toBeDefined()
    if (!previous || !current) return
    expect(Math.abs((current.left - previous.left) - 8), `第 ${levels[index]} 层的缩进步长`).toBeLessThanOrEqual(1)
  }
  // 同层:目录行与文件行的标签左缘必须一致(历史教训:缩进值小时二者会错开)。
  // 第 1 层(src/notes 目录 vs README.md 等文件)、第 2 层(components/utils 目录 vs main.ts)、
  // 第 3 层(layout 目录 vs format.ts)都有同层目录 + 文件,故这三层都参与核对。
  for (const [level, list] of byLevel) {
    const dirs = list.filter((row) => row.kind === 'directory').map((row) => row.left)
    const files = list.filter((row) => row.kind === 'file').map((row) => row.left)
    if (!dirs.length || !files.length) continue
    expect(Math.max(...dirs) - Math.min(...dirs), `第 ${level} 层目录行内左缘一致`).toBeLessThanOrEqual(1)
    expect(Math.abs((dirs[0] ?? 0) - (files[0] ?? 0)), `第 ${level} 层目录与文件左缘一致`).toBeLessThanOrEqual(1)
  }
  // 导引线:每行 level-1 段(覆盖该层的所有子项,含最后一项),且纯装饰(aria-hidden)。
  // 深树的最深层(index.ts,level 5)有 4 段 —— 逐条核对,最后一项不漏线。
  for (const row of rows) {
    expect(row.guides, `${row.name} 的导引线段数`).toBe(row.level - 1)
    expect(row.guidesHidden, `${row.name} 的导引线应 aria-hidden`).toBe('true')
  }
})

// ============================================================================
// 本轮新增:让「项目」(上下文)与「树行」(文件结构)一眼可辨的四个装置 ——
// 排印分级 / chevron 换位 / 收纳脊线 + 留白关系 / 项目专属前导记号。逐条机械核对。
// ============================================================================
test('排印分级:项目行 13px / 600,树行 12px / 400', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const projectName = page.locator('.project-item').nth(0).locator('.project-row__name')
  await expect.poll(() => projectName.evaluate((element) => getComputedStyle(element).fontSize)).toBe('13px')
  await expect.poll(() => projectName.evaluate((element) => getComputedStyle(element).fontWeight)).toBe('600')
  // 目录行与文件行同档(12px / 400):树行整体低于项目行一级。
  const tree = page.locator('.project-item').nth(0).locator('.project-tree')
  const treeName = tree.locator('.entry-name').first()
  await expect.poll(() => treeName.evaluate((element) => getComputedStyle(element).fontSize)).toBe('12px')
  await expect.poll(() => treeName.evaluate((element) => getComputedStyle(element).fontWeight)).toBe('400')
})

test('chevron 位置:项目行在行右半,树目录行在行左半', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const row = page.locator('.project-item').nth(0).locator('.project-row')
  const rowBox = await row.boundingBox()
  const projectCaret = await row.locator('.project-row__caret').boundingBox()
  expect(rowBox, '项目行有几何盒').not.toBeNull()
  expect(projectCaret, '项目行 chevron 有几何盒').not.toBeNull()
  if (rowBox === null || projectCaret === null) return
  // 手风琴惯例:项目行 chevron 贴行尾,左缘落在行中线右侧。
  expect(projectCaret.x - (rowBox.x + rowBox.width / 2), '项目行 chevron 在行右半').toBeGreaterThan(0)
  // 树节点沿用行首 chevron,左缘落在行中线左侧 —— 位置本身即信号。
  const dirRow = page.locator('.project-item').nth(0).locator('.project-tree .entry-row[data-kind="directory"]').first()
  const dirBox = await dirRow.boundingBox()
  const dirCaret = await dirRow.locator('.tree-caret').boundingBox()
  expect(dirBox, '树目录行有几何盒').not.toBeNull()
  expect(dirCaret, '树目录行 chevron 有几何盒').not.toBeNull()
  if (dirBox === null || dirCaret === null) return
  expect(dirCaret.x - (dirBox.x + dirBox.width / 2), '树目录行 chevron 在行左半').toBeLessThan(0)
})

test('项目专属前导记号:16px、aria-hidden;树里图标数为 0', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const mark = page.locator('.project-item').nth(0).locator('.project-row__mark')
  await expect(mark).toHaveCount(1)
  await expect(mark).toHaveAttribute('aria-hidden', 'true')
  const box = await mark.boundingBox()
  expect(box, '记号有几何盒').not.toBeNull()
  if (box === null) return
  expect(Math.abs(box.width - 16), '记号宽 16').toBeLessThanOrEqual(1)
  expect(Math.abs(box.height - 16), '记号高 16').toBeLessThanOrEqual(1)
  // 树里没有任何图标元素(dl-icon)—— 这一个记号因此是项目行独有的最强区分信号。
  await expect(page.locator('.project-tree .dl-icon')).toHaveCount(0)
})

test('展开脊线:与记号列左缘 / level-1 caret 列左缘同一竖线;折叠时消失', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const row = page.locator('.project-item').nth(0).locator('.project-row')
  const tree = page.locator('.project-item').nth(0).locator('.project-tree')
  const ridge = tree.locator('.project-ridge')
  await expect(ridge, '展开项目的脊线在场').toBeVisible()
  const ridgeBox = await ridge.boundingBox()
  const markBox = await row.locator('.project-row__mark').boundingBox()
  const dirCaret = await tree.locator('.entry-row[data-kind="directory"]').first().locator('.tree-caret').boundingBox()
  expect(ridgeBox, '脊线有几何盒').not.toBeNull()
  expect(markBox, '记号有几何盒').not.toBeNull()
  expect(dirCaret, 'level-1 caret 有几何盒').not.toBeNull()
  if (ridgeBox === null || markBox === null || dirCaret === null) return
  // 脊线 x = 记号列左缘 = 树 level-1 目录行 caret 列左缘(= 树逐级导引线所在的 8px 竖线)。
  // 说明:设计要点原文写「记号右缘」;但脊线若落在记号右缘(24px)会横穿 level-2 的 caret
  // 列 [16,32],且不与树的导引线共线(导引线在 8px)。按要点自带的「结构性不成立时按实际
  // 成立的那条断言并在注释写明原因」处理:对齐到三条竖线真正共线的位置 —— 记号的**左缘**。
  expect(Math.abs(ridgeBox.x - markBox.x), '脊线 x = 记号列左缘').toBeLessThanOrEqual(1)
  expect(Math.abs(ridgeBox.x - dirCaret.x), '脊线 x = 树 level-1 caret 列左缘').toBeLessThanOrEqual(1)
  // 折叠后期容器 v-show 隐藏,脊线随之消失。
  await row.locator('.project-row__button').click()
  await expect(ridge, '折叠后脊线消失').not.toBeVisible()
})

test('项目行留白:上方 ≥ 下方 × 1.4(USWDS 标题归属规则)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 展开第 2 个项目:它上方有第 1 个项目、下方有自己的树,同一行的上下留白因此可比。
  await page.locator('.project-item').nth(1).locator('.project-row__button').click()
  await expect(page.locator('.project-item').nth(1).locator('.project-tree .entry-row').first()).toBeAttached()
  const spacing = await page.evaluate(() => {
    const items = document.querySelectorAll('.project-item')
    const first = items[0]?.getBoundingClientRect()
    const second = items[1]?.getBoundingClientRect()
    const row = items[1]?.querySelector('.project-row')?.getBoundingClientRect()
    const firstRow = items[1]?.querySelector('.entry-row')?.getBoundingClientRect()
    if (!first || !second || !row || !firstRow) return null
    return { above: second.top - first.bottom, below: firstRow.top - row.bottom }
  })
  expect(spacing, '量到项目行上下留白').not.toBeNull()
  if (spacing === null) return
  expect(spacing.below, '下方留白不为 0').toBeGreaterThan(0)
  expect(spacing.above / spacing.below, '上方留白 / 下方留白').toBeGreaterThanOrEqual(1.4)
})

test('项目行悬停不位移:⋯ 出现前后名称与 chevron 的 x 不变', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const row = page.locator('.project-item').nth(0).locator('.project-row')
  const menu = row.locator('.project-menu')
  const readX = () => row.evaluate((element) => ({
    name: element.querySelector('.project-row__name')?.getBoundingClientRect().x ?? 0,
    caret: element.querySelector('.project-row__caret')?.getBoundingClientRect().x ?? 0,
  }))
  await page.mouse.move(0, 0)
  const rest = await readX()
  // 常态下 ⋯ 不可见(槽位常驻预留),悬停后显现。
  await expect(menu).toHaveCSS('opacity', '0')
  await row.hover()
  await expect(menu).toHaveCSS('opacity', '1')
  const hovered = await readX()
  expect(Math.abs(hovered.name - rest.name), '⋯ 出现前后名称 x 不变').toBeLessThanOrEqual(0.5)
  expect(Math.abs(hovered.caret - rest.caret), '⋯ 出现前后 chevron x 不变').toBeLessThanOrEqual(0.5)
})

test('候选目录文件数与已打开项目的条目数对齐', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await page.getByRole('button', { name: '打开项目', exact: true }).click()
  const dialog = page.locator('dialog.picker')
  await expect(dialog).toBeVisible()
  // weekly-report 已打开,项目树里有 13 条(entryCount);候选列表显示的检测文件数必须与之一致,
  // 否则演示里会出现「候选说 9 个、打开后 13 条」的观感矛盾(见 mocks/workspace.ts 的注释)。
  await expect(dialog.locator('.picker__item', { hasText: 'weekly-report' }).locator('.picker__meta')).toContainText('13 个文件')
})

// 区块标题(本轮改动):文案居中 + 左右各一条 1px 虚线;窄宽度下不换行。
// 虚线是本设计语言新引入的装置,只用于区块标题。
for (const width of [375, 1280]) {
  test(`项目区块标题:居中 + 两侧 1px 虚线 @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    if (width === 375) await page.getByRole('button', { name: '打开侧栏' }).click()
    const label = page.locator('.sidebar-label')
    await expect(label).toBeVisible()
    const measured = await label.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      // 用 Range 量文本自身,避开 ::before / ::after 的占位。
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      const before = getComputedStyle(element, '::before')
      const after = getComputedStyle(element, '::after')
      return {
        leftGap: text.left - rect.left,
        rightGap: rect.right - text.right,
        beforeStyle: before.borderTopStyle,
        afterStyle: after.borderTopStyle,
        borderWidth: before.borderTopWidth,
        height: rect.height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      }
    })
    // 居中:左右两侧留白之差 ≤1。
    expect(Math.abs(measured.leftGap - measured.rightGap), '标题居中').toBeLessThanOrEqual(1)
    // 左右各一条 1px 虚线。
    expect(measured.beforeStyle).toBe('dashed')
    expect(measured.afterStyle).toBe('dashed')
    expect(measured.borderWidth).toBe('1px')
    // 不换行:渲染高度不超过一行。
    expect(measured.height).toBeLessThanOrEqual(measured.lineHeight + 2)
  })
}

// 新建会话的转录必须**只含本次发送的内容**。回归上一轮评审报的真 bug:新建后发消息,
// 首屏那次装载的 getTranscript('weekly') 会在新对话打开之后才返回,把同项目既有会话的
// 4 条历史消息写回转录(实测:登录后约 450ms 点「新建对话」再发一条 → 6 条)。
test('新建会话:初始为空,只含本次发送的两条', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 当前项目 weekly-report 的既有会话有 4 条历史,它们一条都不该混进新会话。
  await expect(page.locator('.chat-message[data-message-id^="weekly-"]')).toHaveCount(4)
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await expect(page.locator('.chat-message')).toHaveCount(0)
  await page.getByRole('textbox', { name: '给 Mia 的消息' }).fill('只应出现这两条。')
  await page.getByRole('textbox', { name: '给 Mia 的消息' }).press('Enter')
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
  // 用户 + 助手 = 2 条,且不含任何既有会话的正文。
  await expect(page.locator('.chat-message')).toHaveCount(2)
  await expect(page.locator('.chat-message.user .message-body')).toHaveText('只应出现这两条。')
  await expect(page.locator('.chat-message[data-message-id^="weekly-"]')).toHaveCount(0)
})

test('文件树:目录可折叠、文件行整行可点可聚焦、芯片只标新建 / 已改', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const tree = page.locator('.project-item').nth(0).locator('.project-tree')
  const srcRow = tree.locator('.entry-row[data-kind="directory"]', { hasText: 'src' }).first()
  // 顶层目录默认折叠:它下面的文件不可见。
  await expect(srcRow.locator('.entry-row__button')).toHaveAttribute('aria-expanded', 'false')
  await expect(tree.locator('.entry-row[data-kind="file"]', { hasText: 'main.ts' })).toHaveCount(0)
  // 整行是一个 button:点行内任意处(这里点行中部,即名称区域)都会展开。
  await srcRow.locator('.entry-row__button').click()
  await expect(srcRow.locator('.entry-row__button')).toHaveAttribute('aria-expanded', 'true')
  await expect(tree.locator('.entry-row[data-kind="file"]', { hasText: 'main.ts' })).toHaveCount(1)
  // 再点同一行(目录没有「激活」动作,整行的动作就只有折叠 / 展开)即折叠。
  await srcRow.locator('.entry-row__button').click()
  await expect(srcRow.locator('.entry-row__button')).toHaveAttribute('aria-expanded', 'false')
  await expect(tree.locator('.entry-row[data-kind="file"]', { hasText: 'main.ts' })).toHaveCount(0)
  // 再展开,取一个顶层文件行做交互性断言(本轮改动:文件行从「只读展示行」变成整行 button
  // —— 单击预览 / 双击固定 / Enter 固定)。
  await srcRow.locator('.entry-row__button').click()
  const readmeRow = tree.locator('.entry-row[data-kind="file"]', { hasText: 'README.md' })
  await expect(readmeRow).toHaveCount(1)
  const fileButton = readmeRow.locator('.entry-row__button')
  await expect(fileButton).toHaveJSProperty('tagName', 'BUTTON')
  const nameSpan = readmeRow.locator('.entry-name')
  await expect(nameSpan).toHaveJSProperty('tagName', 'SPAN')
  // 文件行里恰好一个可聚焦控件(那个整行 button)—— 不再是「不可 Tab 到达的只读行」。
  await expect(readmeRow.locator('button')).toHaveCount(1)
  await expect(readmeRow.locator('a, [tabindex]')).toHaveCount(0)

  // 芯片:created(新建)/ modified(已修改)渲染;none 不渲染。
  const createdChip = tree.locator('.entry-row', { hasText: 'main.ts' }).locator('.entry-state')
  await expect(createdChip).toHaveAttribute('data-state', 'created')
  await expect(createdChip).toHaveText('新建')
  const modifiedChip = readmeRow.locator('.entry-state')
  await expect(modifiedChip).toHaveAttribute('data-state', 'modified')
  await expect(modifiedChip).toHaveText('已修改')
  // .gitignore 是 none:不渲染芯片。
  const noneRow = tree.locator('.entry-row', { hasText: '.gitignore' })
  await expect(noneRow).toHaveCount(1)
  await expect(noneRow.locator('.entry-state')).toHaveCount(0)
  // 目录行不带芯片。
  await expect(srcRow.locator('.entry-state')).toHaveCount(0)
})

// 侧栏密集行的触达判据(本轮改动,依据 design-language ⑥ 的收窄例外):触达尺寸分两档、
// 取决于输入方式而非视觉密度。密集列表 / 树行是唯一的收窄例外,必须**同时**满足:
//   ① 整行为命中区(宽度 = 容器可用宽、高度 = 行高);② 相邻目标不重叠(相邻行中心各画 24px 圆
//   不相交,即圆心距 ≥24)。≥1024px 常驻侧栏面板是桌面指针环境,走本档;≤1023px 抽屉回到 44×44。
// 这是**语义替换**而非放宽:上一轮「侧栏所有 button ≥44」在 28px 行距下与判据②自相矛盾
// (44px 命中区必然与相邻行重叠),故按新规则换成完整判据 —— 见「有数据态」循环里对
// .entry-row__button 的排除(那里核对独立控件,这里核对密集行)。
test('侧栏密集行触达:≥1024 整行可点 + 圆心距 ≥24;≤1023 抽屉回到 44', async ({ page }) => {
  // ---- ≥1024px:密集档 ----
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const tree = page.locator('.project-item').nth(0).locator('.project-tree')
  // 展开 src,让至少 3 个连续交互行可见(核相邻圆心距)。
  await tree.locator('.entry-row[data-kind="directory"]', { hasText: 'src' }).first().locator('.entry-row__button').click()
  await expect(tree.locator('.entry-row', { hasText: 'main.ts' })).toHaveCount(1)

  const measured = await page.evaluate(() => {
    const list = document.querySelector('.project-item:nth-child(1) .project-tree .entry-list')
    if (!(list instanceof HTMLElement)) return null
    const buttons = [...list.querySelectorAll<HTMLElement>('.entry-row__button')]
    return {
      listWidth: list.getBoundingClientRect().width,
      rows: buttons.map((button) => {
        const rect = button.getBoundingClientRect()
        return { width: rect.width, height: rect.height, centerY: rect.y + rect.height / 2 }
      }),
    }
  })
  expect(measured, '文件树行已渲染').not.toBeNull()
  if (measured === null) return
  expect(measured.rows.length, '至少 3 个可交互树行').toBeGreaterThanOrEqual(3)
  for (const row of measured.rows) {
    // ① 整行为命中区:命中区宽度铺满列表可用宽(±1)。
    expect(Math.abs(row.width - measured.listWidth), '目录行命中区 = 整行宽').toBeLessThanOrEqual(1)
    // 行高 ≥24(密集档下限,判据圆的直径)。
    expect(row.height, '密集行行高 ≥24').toBeGreaterThanOrEqual(24)
  }
  // ② 相邻交互行不重叠:圆心距 ≥24(行距 28 > 24,余量 4)。
  for (let index = 1; index < measured.rows.length; index += 1) {
    const previous = measured.rows[index - 1]
    const current = measured.rows[index]
    if (!previous || !current) return
    expect(current.centerY - previous.centerY, `第 ${index} 对相邻行圆心距 ≥24`).toBeGreaterThanOrEqual(24)
  }
  // 真实交互验证「整行可点」:点目录行**最右缘**(不是只量盒子),该目录确实折叠。
  const srcButton = tree.locator('.entry-row[data-kind="directory"]', { hasText: 'src' }).first().locator('.entry-row__button')
  await expect(srcButton).toHaveAttribute('aria-expanded', 'true')
  const box = await srcButton.boundingBox()
  expect(box, '目录行有几何盒').not.toBeNull()
  if (box === null) return
  await page.mouse.click(box.x + box.width - 3, box.y + box.height / 2)
  await expect(srcButton, '点最右缘应切换展开态').toHaveAttribute('aria-expanded', 'false')
  await expect(tree.locator('.entry-row', { hasText: 'main.ts' })).toHaveCount(0)

  // ---- ≤1023px:抽屉(触屏语境)回到 44×44 ----
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await page.getByRole('button', { name: '打开侧栏' }).click()
  await expect(page.locator('.workspace-sidebar')).toBeVisible()
  const narrow = await page.locator('.project-item').nth(0).locator('.entry-row__button').first().boundingBox()
  expect(narrow, '抽屉里有树行').not.toBeNull()
  expect(narrow?.width ?? 0, '抽屉树行宽 ≥44').toBeGreaterThanOrEqual(44)
  expect(narrow?.height ?? 0, '抽屉树行高 ≥44').toBeGreaterThanOrEqual(44)
})

// 深树 @375 抽屉:加深到第 5 层后,最深层仍不横向溢出、文件名走省略号截断。
test('深树 @375 抽屉:第 5 层不横向溢出、文件名走省略号', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await page.getByRole('button', { name: '打开侧栏' }).click()
  await expect(page.locator('.workspace-sidebar')).toBeVisible()
  const tree = page.locator('.project-item').nth(0).locator('.project-tree')
  for (const dir of ['src', 'components', 'layout', 'header']) {
    await tree.locator('.entry-row[data-kind="directory"]', { hasText: dir }).first().locator('.entry-row__button').click()
  }
  const deepest = tree.locator('.entry-row', { hasText: 'index.ts' })
  await expect(deepest).toHaveCount(1)
  // 页面整体不得横向溢出。
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  // 深缩进下文件名走省略号:单行不换行 + 溢出省略 + min-width:0 允许在 flex 里收缩。
  const nameStyle = await deepest.locator('.entry-name').evaluate((element) => {
    const style = getComputedStyle(element)
    return { textOverflow: style.textOverflow, whiteSpace: style.whiteSpace, overflow: style.overflow, minWidth: style.minWidth }
  })
  expect(nameStyle.whiteSpace).toBe('nowrap')
  expect(nameStyle.textOverflow).toBe('ellipsis')
  expect(nameStyle.overflow).toBe('hidden')
  expect(nameStyle.minWidth).toBe('0px')
  // 最深层行的右缘仍落在侧栏面板内(深缩进没有把内容推出面板)。
  const sidebar = await page.locator('.workspace-sidebar').boundingBox()
  const rowBox = await deepest.boundingBox()
  expect(sidebar, '侧栏有几何盒').not.toBeNull()
  expect(rowBox, '最深层行有几何盒').not.toBeNull()
  if (sidebar === null || rowBox === null) return
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(sidebar.x + sidebar.width + 1)
})

test('项目 ⋯ → 关闭项目:只移除该项目;键盘可用、Esc 归还焦点', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const projects = page.locator('.workspace-projects')
  const items = page.locator('.project-item')
  await expect(items).toHaveCount(2)
  const trigger = items.first().locator('.project-menu__trigger')
  await trigger.click()
  await expect(page.locator('.project-menu__item')).toHaveText('关闭项目')
  // Esc 关闭菜单并把焦点归还触发钮;项目列表不受影响。
  await page.keyboard.press('Escape')
  await expect(page.locator('.project-menu__item')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(items).toHaveCount(2)
  // 键盘打开 + 触发关闭(关掉**当前**项目,最坏情况:既要从列表移除,也要让选中项落到
  // 剩下的项目上 —— Bug 常出在「连带移除」或「关掉后选中项悬空」)。
  await page.keyboard.press('Enter')
  const closeItem = page.locator('.project-menu__item')
  await expect(closeItem).toBeVisible()
  await closeItem.click()
  // 只移除被关的那一个:另一个项目仍在,且被选中项落到它上面。
  await expect(items).toHaveCount(1)
  await expect(projects).toContainText(PROJECT_NAMES.planning[1])
  await expect(projects).not.toContainText(PROJECT_NAMES.planning[0])
  await expect(items.first().locator('.project-row__button')).toHaveAttribute('aria-current', 'true')
  // 新当前项目(knowledge-base)没有会话:activeId 归空,h1 回退到「新建对话」。
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].newChat)
  // 再关掉最后一个:没有项目可归属时侧栏给空态,遥测的项目项随之下线(不留上一个项目的假信息)。
  await items.first().locator('.project-menu__trigger').click()
  await page.locator('.project-menu__item').click()
  await expect(page.locator('.project-item')).toHaveCount(0)
  await expect(projects).toContainText('还没有打开的项目')
  await expect(page.locator('.telemetry__item--workspace')).toHaveCount(0)
})

test('打开项目:搜索过滤 → 勾选 → 打开后进入侧栏并自动选中;已打开不可重复勾选', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const openButton = page.getByRole('button', { name: '打开项目', exact: true })
  await openButton.click()
  const dialog = page.locator('dialog.picker')
  await expect(dialog).toBeVisible()
  // 已打开的项目带「已打开」标记,且不可再勾选。
  const opened = dialog.locator('.picker__item', { hasText: PROJECT_NAMES.planning[0] })
  await expect(opened.locator('.picker__badge')).toHaveText('已打开')
  await expect(opened.locator('.picker__check')).toBeDisabled()
  // 搜索过滤(按 name / path)。
  const search = dialog.locator('.picker__search-input')
  await search.fill('api')
  await expect(dialog.locator('.picker__item')).toHaveCount(1)
  await expect(dialog.locator('.picker__item')).toContainText('api-server')
  // 勾选并打开。
  await dialog.locator('.picker__check').check()
  await dialog.getByRole('button', { name: '打开', exact: true }).click()
  // 关闭后焦点归还触发钮。
  await expect(dialog).not.toBeVisible()
  await expect(openButton).toBeFocused()
  // 新项目进入侧栏,并被**自动选中**;会话切到它(它没有会话 → 面板空态、转录空态)。
  await expect(page.locator('.project-item')).toHaveCount(3)
  const added = page.locator('.project-item').filter({ hasText: 'api-server' })
  await expect(added.locator('.project-row__button')).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await openSwitcher(page)
  await expect(page.locator('.conversation-hint')).toHaveText('这个项目还没有对话')
})

test('打开项目对话框:取消 / Esc 关闭并归还焦点', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const openButton = page.getByRole('button', { name: '打开项目', exact: true })
  await openButton.click()
  const dialog = page.locator('dialog.picker')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(openButton).toBeFocused()
  await expect(page.locator('.project-item')).toHaveCount(2)
  // Esc 同样关闭并归还焦点。
  await openButton.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(openButton).toBeFocused()
  await expect(page.locator('.project-item')).toHaveCount(2)
})

test('会话按项目隔离:只显示当前项目的会话,无会话项目显示空态', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 项目 A(weekly-report):6 条会话,且不含其它项目的会话标题。会话行住在菜单里。
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(6)
  await expect(page.locator(SWITCHER_PANEL)).not.toContainText(HEADINGS['zh-CN'].research)
  await expect(page.locator(SWITCHER_PANEL)).not.toContainText(HEADINGS['zh-CN'].knowledge)
  await closeSwitcher(page)
  // 切到项目 B(knowledge-base):它没有会话 → 面板空态,旧项目的会话不再出现。
  await page.locator('.project-item').filter({ hasText: PROJECT_NAMES.planning[1] }).locator('.project-row__button').click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(0)
  await expect(page.locator('.conversation-hint')).toHaveText('这个项目还没有对话')
  await expect(page.locator(SWITCHER_PANEL)).not.toContainText(HEADINGS['zh-CN'].weekly)
  await expect(page.locator('[data-message-id="weekly-1"]')).toHaveCount(0)
})

test('端到端:项目 A 下新建会话,切到项目 B 时不出现,切回 A 仍在', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 在项目 A(weekly-report)下新建并发送。
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await page.getByRole('textbox', { name: '给 Mia 的消息' }).fill('请整理一下本季度的目标。')
  await page.getByRole('textbox', { name: '给 Mia 的消息' }).press('Enter')
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(7)
  await expect(page.locator('.session-item').first()).toContainText('请整理一下本季度的目标。')
  await closeSwitcher(page)
  // 等保存收尾:保存中会短暂锁住项目 / 会话切换(与既有「生成中不可切」同一把锁)。
  await expect(page.getByRole('textbox', { name: '给 Mia 的消息' })).not.toHaveAttribute('readonly', '')
  // 切到项目 B(knowledge-base):新会话归属 A,不出现在 B。
  await page.locator('.project-item').filter({ hasText: PROJECT_NAMES.planning[1] }).locator('.project-row__button').click()
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(0)
  await closeSwitcher(page)
  await expect(page.locator('.workspace-projects')).not.toContainText('请整理一下本季度的目标。')
  // 切回项目 A:新会话仍在。
  await page.locator('.project-item').filter({ hasText: PROJECT_NAMES.planning[0] }).locator('.project-row__button').click()
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(7)
  await expect(page.locator('.session-item').first()).toContainText('请整理一下本季度的目标。')
})

// ============================================================================
// 本轮新增:会话头 = 浏览器式 tab 条 + 常驻的溢出 / 搜索菜单。
// 覆盖:tab 上的等待徽标与菜单的收起计数、四方同源不变量、窄屏下「等待会话被隐藏 ⇒ 菜单钮
// 出警告徽标」(用户原第 3 条要求的新形态落点)、⌘/Ctrl+K、Esc / 点外关闭、↑/↓ 焦点、徽标对比度。
// ============================================================================

// waiting 直达态下(默认项目 product-docs 只有 2 条会话,都可见):
// quarterly(未看过)的 tab 前导槽挂「等待交互」状态图标;点开后它成为活动会话 → 视为已看过 → 图标收起。
// (tab 上的「等待确认」文字徽标已由状态图标取代;▾ 面板里仍保留文字标记。)
test('waiting:quarterly 的 tab 挂「等待交互」图标,点开后收起', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  const quarterlyTab = page.locator(TAB, { hasText: QUARTERLY['zh-CN'] })
  await expect(quarterlyTab).toHaveCount(1)
  const quarterlyIcon = quarterlyTab.locator('.tab-status')
  await expect(quarterlyIcon).toHaveAttribute('data-status', 'awaiting')
  await expect(quarterlyIcon).toHaveAttribute('data-icon', 'choiceCard')
  // 状态图标(16px)不得把 tab 撑高:tab 高度恒为 32(紧凑导航行档)。
  const badgeTabBox = await quarterlyTab.boundingBox()
  const badgeBox = await quarterlyIcon.boundingBox()
  console.log(`[tab status] tab 高 ${badgeTabBox?.height.toFixed(1)} / 图标高 ${badgeBox?.height.toFixed(1)}`)
  expect(badgeTabBox?.height ?? 0, '带状态图标的 tab 高仍为 32').toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
  expect(badgeTabBox?.height ?? 0, '带状态图标的 tab 高仍为 32').toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
  expect(badgeBox?.height ?? 0, '状态图标高 < tab 高(不撑高)').toBeLessThan(badgeTabBox?.height ?? 0)
  // knowledge 是当前会话,它已「看过」,故状态槽里**没有图形**(槽位仍在,标签不位移)。
  await expect(page.locator(TAB, { hasText: HEADINGS['zh-CN'].knowledge }).locator('.tab-status')).toHaveAttribute('data-icon', 'none')
  await quarterlyTab.click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(quarterlyTab.locator('.tab-status')).toHaveAttribute('data-icon', 'none')
  await expect(page.locator(TAB, { hasText: QUARTERLY['zh-CN'] })).toHaveAttribute('aria-selected', 'true')
})

// 窄到只显示 1 个 tab 时,未打开的等待会话(quarterly)会被收起 ⇒ 菜单钮出**警告徽标**
// (用户原第 3 条要求在新形态下的落点:信号落在真正会丢的位置)。
for (const width of [375, 768]) {
  test(`waiting @${width}:quarterly 被收起时菜单钮出警告徽标`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await openWaiting(page)
    const visibleTitles = await page.locator(TAB).evaluateAll((elements) => elements.map((element) => element.textContent ?? ''))
    const quarterlyVisible = visibleTitles.some((title) => title.includes(QUARTERLY['zh-CN']))
    const menuBadge = page.locator('.conversation-menu__count')
    console.log(`[tabs overflow] @${width} → 可见 ${visibleTitles.length} / quarterly 可见=${quarterlyVisible} / 菜单徽标=${await menuBadge.count()}`)
    if (!quarterlyVisible) {
      // 被隐藏 + 等待-未看过 ⇒ 警告徽标,数字 = 1。
      await expect(menuBadge).toHaveCount(1)
      await expect(menuBadge).toHaveAttribute('data-level', 'warning')
      await expect(menuBadge).toHaveText('1')
      await expect(page.locator(SWITCHER_TRIGGER)).toHaveAccessibleName(new RegExp('等待确认'))
    } else {
      // 若该宽度下 quarterly 仍可见,则「等待交互」状态图标挂在那枚 tab 上,菜单钮不出警告徽标。
      await expect(page.locator(TAB, { hasText: QUARTERLY['zh-CN'] }).locator('.tab-status')).toHaveAttribute('data-icon', 'choiceCard')
    }
  })
}

// 四方同源不变量:菜单里「等待你」组行数 ⇔ 满足 status === 'awaiting' && !seen 的会话数;
// waiting 态下遥测状态词仍为「等待确认」且确认卡存在(既有的三方同源不变量继续成立)。
// 四条演示态 × 两宽度逐格核对。
for (const width of [375, 1280]) {
  test(`等待语义同源:等待你组行数 ⇔ awaiting 且未打开 @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    const states = [
      { demo: 'normal', url: '/#/workspace', status: 'ready', heading: HEADINGS['zh-CN'].weekly, expected: 0 },
      { demo: 'empty', url: '/#/workspace?s=empty', status: 'empty', heading: HEADINGS['zh-CN'].newChat, expected: 0 },
      { demo: 'error', url: '/#/workspace?s=error', status: 'error', heading: HEADINGS['zh-CN'].weekly, expected: 0 },
      { demo: 'waiting', url: '/#/workspace?s=waiting', status: 'ready', heading: HEADINGS['zh-CN'].knowledge, expected: 1 },
    ] as const
    for (const [index, state] of states.entries()) {
      if (index > 0) await page.goto(state.url)
      await waitForStable(page, state.status, state.heading)
      await openSwitcher(page)
      const awaitingTitles = page.locator('.conversation-group__title', { hasText: '等待你' })
      await expect(awaitingTitles, `${state.demo}:等待你组存在性`).toHaveCount(state.expected > 0 ? 1 : 0)
      const awaitingRows = state.expected > 0 ? await page.locator('.conversation-group').first().locator('.session-item').count() : 0
      await closeSwitcher(page)
      console.log(`[waiting linkage] ${state.demo} @${width} → awaitingRows=${awaitingRows} expected=${state.expected}`)
      expect(awaitingRows, `${state.demo}:等待你组行数 = awaiting 且未打开`).toBe(state.expected)
      if (state.demo === 'waiting') {
        await expect(page.locator('.telemetry__word')).toHaveText('等待确认')
        await expect(page.locator('.transcript-inner .confirmation-card')).toHaveCount(1)
        await expect(page.locator(`${CHIP}[data-state="pending"]`)).toHaveCount(1)
      }
    }
  })
}

// 从菜单选中 waiting 态的 quarterly:它成为活动 tab(可见),菜单「等待你」组消失,
// 它**自己的**确认卡出现在转录里(跨区域一致)。
test('从菜单选中 waiting 的 quarterly:其确认卡出现、等待你组消失', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  await openSwitcher(page)
  const awaitingRow = page.locator('.conversation-group').first().locator('.session-item')
  await expect(awaitingRow).toContainText(QUARTERLY['zh-CN'])
  await awaitingRow.click()
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(QUARTERLY['zh-CN'])
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator(TAB, { hasText: QUARTERLY['zh-CN'] })).toHaveAttribute('aria-selected', 'true')
  // 重新打开:只剩「本项目」组,无「等待你」组。
  await openSwitcher(page)
  await expect(page.locator('.conversation-group')).toHaveCount(1)
  await expect(page.locator('.conversation-group__title')).toHaveText(/本项目.*2/)
  await expect(page.locator('.conversation-group__title', { hasText: '等待你' })).toHaveCount(0)
  await closeSwitcher(page)
  // 跨区域一致:转录里是**它自己**的确认卡,pending 芯片是它的受影响文件,遥测说等待确认。
  await expect(page.locator('.telemetry__word')).toHaveText('等待确认')
  await expect(page.locator('.transcript-inner .confirmation-card')).toHaveCount(1)
  await expect(page.locator('.confirmation-summary')).toHaveText('用最新数据重写「release-plan.csv」')
  await expect(page.locator('.entry-row', { hasText: 'release-plan.csv' }).locator(CHIP)).toHaveAttribute('data-state', 'pending')
})

// 菜单的键盘与焦点:⌘/Ctrl+K 开菜单并聚焦搜索框(Linux 下提示 Ctrl K)、Esc 关闭归还焦点、
// 点击菜单外关闭。
test('菜单键盘:⌘/Ctrl+K 开菜单聚焦搜索、Esc 归还焦点、点外关闭', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const trigger = page.locator(SWITCHER_TRIGGER)
  await trigger.focus()
  await expect(trigger).toBeFocused()
  // 全局快捷键:打开菜单并把焦点落到搜索框。
  await page.keyboard.press('Control+k')
  await expect(page.locator(SWITCHER_PANEL)).toBeVisible()
  await expect(page.getByRole('textbox', { name: '搜索对话' })).toBeFocused()
  await expect(page.locator('.conversation-search__hint')).toHaveText('Ctrl K')
  // Esc:关闭菜单并把焦点还给菜单钮。
  await page.keyboard.press('Escape')
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  // 点菜单外关闭:菜单右对齐菜单钮,故点转录区**左缘**(菜单之外)即「点外部」。
  await trigger.click()
  await expect(page.locator(SWITCHER_PANEL)).toBeVisible()
  await page.locator('.transcript').click({ position: { x: 6, y: 150 } })
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
})

// ↑/↓ 在搜索框与行之间移动,Home/End 到首 / 末行(焦点始终停在真实元素上)。
test('菜单 ↑/↓:搜索框 ↓ 到首行、首行 ↑ 回搜索框、Home/End 到首/末行', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openSwitcher(page)
  const search = page.getByRole('textbox', { name: '搜索对话' })
  const rows = page.locator('.session-item')
  await expect(search).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(rows.first()).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(search).toBeFocused()
  await page.keyboard.press('End')
  await expect(rows.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(rows.first()).toBeFocused()
})

// 状态图标对比度:五个状态的图标与其**所在 tab 的底色** ≥3:1(WCAG 1.4.11 非文字元素),
// 深浅两套 × 活动 / 非活动两档 tab 底色都量。旧「等待确认」文字徽标在 tab 上已由状态图标取代;
// ▾ 面板里的文字徽标仍在,单独核对 --dl-warning 压 --dl-warning-subtle ≥4.5:1。
const ICON_TOKEN: Record<string, string> = {
  sparkles: '--dl-text-secondary',
  dot: '--dl-accent',
  choiceCard: '--dl-warning',
  check: '--dl-success',
  ring: '--dl-text-tertiary',
}

test('状态图标对比度 ≥3:1(五态 × 深浅 × 活动/非活动);面板等待徽标 ≥4.5:1', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  const matrix = await page.locator('.workspace-page').evaluate((root, tokens) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) return []
    const toRgb = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
    }
    const weights = [0.2126, 0.7152, 0.0722]
    const luminance = (rgb: number[]): number => rgb
      .map((channel) => { const n = channel / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4 })
      .reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0)
    const ratio = (fg: string, bg: string): number => {
      const a = luminance(toRgb(fg))
      const b = luminance(toRgb(bg))
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    const read = (scope: Element, colorToken: string, bgToken: string): number => {
      const fg = document.createElement('span')
      fg.style.color = `var(${colorToken})`
      const bg = document.createElement('span')
      bg.style.backgroundColor = `var(${bgToken})`
      scope.append(fg, bg)
      const value = ratio(getComputedStyle(fg).color, getComputedStyle(bg).backgroundColor)
      fg.remove()
      bg.remove()
      return value
    }
    // 深色作用域 = .workspace-page 自身;浅色作用域挂到 body 上(body 不在深色作用域内,
    // 故 .dl-scope 的语义 token 解析到 :root 的浅色取值)。
    const light = document.createElement('div')
    light.className = 'dl-scope'
    document.body.appendChild(light)
    const rows = Object.entries(tokens).map(([icon, token]) => ({
      icon,
      darkInactive: read(root, token, '--dl-bg-elevated'),
      darkActive: read(root, token, '--dl-accent-soft'),
      lightInactive: read(light, token, '--dl-bg-elevated'),
      lightActive: read(light, token, '--dl-accent-soft'),
    }))
    light.remove()
    return rows
  }, ICON_TOKEN)
  expect(matrix.length, '五态各一行').toBe(5)
  for (const row of matrix) {
    console.log(`[icon contrast] ${row.icon.padEnd(11)} dark ${row.darkInactive.toFixed(2)}/${row.darkActive.toFixed(2)} · light ${row.lightInactive.toFixed(2)}/${row.lightActive.toFixed(2)} (inactive/active tab)`)
    expect(row.darkInactive, `${row.icon} 深色(非活动 tab)≥3:1`).toBeGreaterThanOrEqual(3)
    expect(row.darkActive, `${row.icon} 深色(活动 tab)≥3:1`).toBeGreaterThanOrEqual(3)
    expect(row.lightInactive, `${row.icon} 浅色(非活动 tab)≥3:1`).toBeGreaterThanOrEqual(3)
    expect(row.lightActive, `${row.icon} 浅色(活动 tab)≥3:1`).toBeGreaterThanOrEqual(3)
  }

  // ▾ 面板里的文字徽标仍用 --dl-warning / --dl-warning-subtle,4.5:1 这条继续锁死(开面板后量)。
  await openSwitcher(page)
  await expect(page.locator('.session-badge').first()).toBeVisible()
  const panel = await page.locator('.workspace-page').evaluate((root) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) return null
    const toRgb = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
    }
    const weights = [0.2126, 0.7152, 0.0722]
    const luminance = (rgb: number[]): number => rgb
      .map((channel) => { const n = channel / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4 })
      .reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0)
    const ratio = (fg: string, bg: string): number => {
      const a = luminance(toRgb(fg))
      const b = luminance(toRgb(bg))
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    }
    const badge = root.querySelector('.session-badge')
    const dark = badge ? ratio(getComputedStyle(badge).color, getComputedStyle(badge).backgroundColor) : 0
    const probe = document.createElement('div')
    probe.className = 'dl-scope'
    const fg = document.createElement('span')
    fg.style.color = 'var(--dl-warning)'
    const bg = document.createElement('span')
    bg.style.backgroundColor = 'var(--dl-warning-subtle)'
    probe.append(fg, bg)
    document.body.appendChild(probe)
    const light = ratio(getComputedStyle(fg).color, getComputedStyle(bg).backgroundColor)
    probe.remove()
    return { dark, light }
  })
  expect(panel).not.toBeNull()
  if (panel === null) return
  console.log(`[panel badge contrast] dark ${panel.dark.toFixed(2)}:1 / light ${panel.light.toFixed(2)}:1`)
  expect(panel.dark, '面板等待徽标对比度 ≥4.5').toBeGreaterThanOrEqual(4.5)
  expect(panel.light, '面板等待徽标对比度 ≥4.5').toBeGreaterThanOrEqual(4.5)
})

// ============================================================================
// 本轮改动:① ▾ 钉到会话头右缘;② tab 拖拽 / 快捷键重排(顺序是视图状态);
// ③ 输入区重构(坞无独立面、输入框悬浮、转录按输入高度动态内缩)。
// ============================================================================

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// tab 条当前的 DOM 顺序(data-tab-id 序列)。
function tabIds(page: Page): Promise<(string | null)[]> {
  return page.locator(TAB).evaluateAll((elements) => elements.map((element) => element.getAttribute('data-tab-id')))
}

// 转录区(滚动容器 .transcript)的底部内边距 / 滚动内边距(px)。两者都应 = 输入框高度 + 间隙。
function transcriptPadBottom(page: Page): Promise<number> {
  return page.locator('.transcript').evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBlockEnd) || 0)
}

function transcriptScrollPadBottom(page: Page): Promise<number> {
  return page.locator('.transcript').evaluate((element) => Number.parseFloat(getComputedStyle(element).scrollPaddingBlockEnd) || 0)
}

// 转录区计算出的 mask-image(maskImage 或 -webkit-mask-image)。
function transcriptMaskImage(page: Page): Promise<string> {
  return page.locator('.transcript').evaluate((element) => {
    const style = getComputedStyle(element)
    return style.maskImage !== 'none' && style.maskImage !== '' ? style.maskImage : style.webkitMaskImage
  })
}

// 悬浮输入框的组件级常量(间隙 / 留白),从 .workspace-page 的计算样式读出。
function composerVars(page: Page): Promise<{ gap: number; clearance: number }> {
  return page.locator('.workspace-page').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      gap: Number.parseFloat(style.getPropertyValue('--composer-float-gap')) || 0,
      clearance: Number.parseFloat(style.getPropertyValue('--composer-clearance')) || 0,
    }
  })
}

// 转录区(滚动容器)底部的流内区域几何:本轮输入提示行下线后只剩遥测条,多行输入时它的几何
// 必须逐值不变(它留在文档流内,不随悬浮簇长高而移动)。
function flowGeom(page: Page): Promise<{ telemetry: Rect | null }> {
  return page.evaluate(() => {
    const pick = (selector: string): Rect | null => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return { telemetry: pick('.telemetry') }
  })
}

// 用鼠标把第 fromIndex 个可见 tab 拖到第 toIndex 个可见 tab 的位置(按拖动前的几何取中心点)。
async function dragTab(page: Page, fromIndex: number, toIndex: number): Promise<void> {
  const tabs = page.locator(TAB)
  const from = await tabs.nth(fromIndex).boundingBox()
  const to = await tabs.nth(toIndex).boundingBox()
  expect(from, '被拖 tab 有几何盒').not.toBeNull()
  expect(to, '目标 tab 有几何盒').not.toBeNull()
  if (from === null || to === null) return
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  // 分步移动:越过 4px 阈值 → 进入拖拽;终点落在目标 tab 中心 → 落点索引 = toIndex。
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
}

// ① ▾ 钉到会话头右缘。用 waiting 演示态:当前项目只有 2 条会话,strip 常不满(tab 触到 240 上限),
// 自由空间会落在 ▾ 左侧 —— 这正是「有没有把 ▾ 钉到右缘」能看出差别的情形。
for (const width of [375, 768, 1280, 1600]) {
  test(`▾ 钉在头部右缘 @${width}:右缘 == 内容盒右缘,＋ 仍紧贴 strip`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await page.goto('/#/workspace?s=waiting')
    await waitForStable(page, 'ready', HEADINGS['zh-CN'].knowledge)
    const heading = page.locator('.conversation-heading')
    const pads = await heading.evaluate((element) => {
      const style = getComputedStyle(element)
      return { end: Number.parseFloat(style.paddingInlineEnd) }
    })
    const headingBox = await heading.boundingBox()
    const menuBox = await page.locator(SWITCHER_TRIGGER).boundingBox()
    expect(headingBox).not.toBeNull()
    expect(menuBox).not.toBeNull()
    if (headingBox === null || menuBox === null) return
    const contentRight = headingBox.x + headingBox.width - pads.end
    console.log(`[pin menu] @${width} ▾右缘 ${(menuBox.x + menuBox.width).toFixed(1)} / 内容盒右缘 ${contentRight.toFixed(1)}`)
    expect(Math.abs(menuBox.x + menuBox.width - contentRight), '▾ 右缘 == 头部内容盒右缘(精确相等)').toBeLessThanOrEqual(0.5)

    // ＋ 仍紧贴 strip:auto margin 只吸收了 ▾ 左侧的剩余空间,没有改变 strip 的可用宽。
    const plusBox = await page.getByRole('button', { name: '新建对话', exact: true }).boundingBox()
    const lastTabRight = await page.locator(TAB).last().evaluate((element) => element.getBoundingClientRect().right)
    const headingGap = await heading.evaluate((element) => Number.parseFloat(getComputedStyle(element).columnGap) || 0)
    expect(plusBox).not.toBeNull()
    if (plusBox === null) return
    console.log(`[pin menu] @${width} ＋左缘−末 tab 右缘 ${(plusBox.x - lastTabRight).toFixed(1)}(期望 ${headingGap}) / ＋与 ▾ 之间空白 ${(menuBox.x - (plusBox.x + plusBox.width)).toFixed(1)}px`)
    expect(Math.abs(plusBox.x - lastTabRight - headingGap), '＋ 仍紧贴 strip(间距 = 一个 gap)').toBeLessThanOrEqual(1)
  })
}

// ② tab 拖拽排序:顺序变化、落点索引正确、拖后不切会话、Esc 取消恢复、关闭钮上按下不拖拽。
test('tab 拖拽排序:顺序与落点、活动会话不变、Esc 取消、关闭钮不启动拖拽', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await expect(page.locator(TAB), '1600 下默认项目 6 条全可见').toHaveCount(SESSIONS_IN_DEFAULT_PROJECT)
  const before = await tabIds(page)
  const activeBefore = await page.locator(`${TAB}[aria-selected="true"]`).getAttribute('data-tab-id')
  const headingBefore = await page.getByRole('heading', { level: 1 }).innerText()

  // 拖第 2 个后台 tab(索引 1)到索引 3。
  const source = 1
  const target = 3
  const expected = [...before]
  const moved = expected.splice(source, 1)[0] ?? null
  expected.splice(target, 0, moved)
  await dragTab(page, source, target)
  await expect.poll(() => tabIds(page), { message: '拖动后顺序数组确实变化且落点索引正确' }).toEqual(expected)
  console.log(`[tab drag] 顺序 ${JSON.stringify(before)} → ${JSON.stringify(expected)}`)

  // 拖动后台标签页**不切换**会话(浏览器同款):活动 id 与 h1 都不变。
  await expect(page.locator(`${TAB}[aria-selected="true"]`)).toHaveAttribute('data-tab-id', activeBefore ?? '')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(headingBefore)

  // Esc 取消:拖动中途按 Esc → 放弃本次拖拽,顺序保持上一步的结果。
  const tabs = page.locator(TAB)
  const from = await tabs.nth(3).boundingBox()
  const to = await tabs.nth(0).boundingBox()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  if (from !== null && to !== null) {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
    await page.keyboard.press('Escape')
    await page.mouse.up()
  }
  await expect.poll(() => tabIds(page), { message: 'Esc 取消后顺序恢复' }).toEqual(expected)
  await expect(page.locator('.tab-slot.is-dragging')).toHaveCount(0)

  // 关闭钮上按下不启动拖拽:在关闭钮上「按下 → 拖开 → 抬起」不产生 is-dragging,顺序不变。
  const secondSlot = page.locator('.tab-slot').nth(1)
  await secondSlot.hover()
  const closeBox = await secondSlot.locator('.tab-close').boundingBox()
  expect(closeBox).not.toBeNull()
  if (closeBox !== null) {
    await page.mouse.move(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(closeBox.x + closeBox.width / 2 + 60, closeBox.y + closeBox.height / 2, { steps: 6 })
    await expect(page.locator('.tab-slot.is-dragging'), '关闭钮上按下不启动拖拽').toHaveCount(0)
    await page.mouse.up()
  }
  await expect.poll(() => tabIds(page), { message: '关闭钮上的手势不改变顺序' }).toEqual(expected)
})

// ② tab 键盘重排:焦点在 tab 上时 Ctrl+Shift+PageDown / PageUp 逐位右 / 左移,并 live 播报结果。
test('tab 键盘重排:Ctrl+Shift+PageDown/PageUp 移一位、aria-live 播报、roving tabindex 唯一', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const before = await tabIds(page)
  await page.locator(TAB).first().focus()
  await expect(page.locator(TAB).first()).toBeFocused()

  await page.keyboard.press('Control+Shift+PageDown')
  const expected = [...before]
  const moved = expected.splice(0, 1)[0] ?? null
  expected.splice(1, 0, moved)
  await expect.poll(() => tabIds(page), { message: '快捷键右移一位后顺序变化' }).toEqual(expected)
  // 焦点跟随被移动的 tab(现在在索引 1)。
  await expect(page.locator(TAB).nth(1)).toBeFocused()
  // aria-live 播报文本(1 基位次 + 总数)。
  const live = page.locator('.conversation-tabs__live')
  await expect(live).toHaveAttribute('aria-live', 'polite')
  await expect(live).toHaveText(/已移到第 2 位,共 \d+ 位/)
  console.log(`[tab keyboard] 播报:${await live.innerText()}`)
  // roving tabindex 仍唯一。
  await expect(page.locator(`${TAB}[tabindex="0"]`)).toHaveCount(1)

  // PageUp 移回原位。
  await page.keyboard.press('Control+Shift+PageUp')
  await expect.poll(() => tabIds(page)).toEqual(before)
  // 边界:在首个 tab 上 PageUp 是无操作(不越界、不报错)。
  await page.locator(TAB).first().focus()
  await page.keyboard.press('Control+Shift+PageUp')
  await expect.poll(() => tabIds(page)).toEqual(before)
})

// ③ 输入区重构:坞无底面与上边界、输入框悬浮、多行时流内区域几何逐值不变、最后一条可滚到输入框之上。
test('输入区重构:坞无面、输入框悬浮、内缩三值相等、多行时流内区域几何不变', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const form = page.locator('.composer-form')
  const input = page.getByRole('textbox', { name: '给 Mia 的消息' })

  // 坞:无底面(背景透明)、无上边界。
  const dockStyle = await page.locator('.composer-dock').evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, borderTop: style.borderBlockStartStyle }
  })
  console.log(`[dock] background ${dockStyle.background} / border-block-start ${dockStyle.borderTop}`)
  expect(dockStyle.background, '坞无底面(背景透明)').toBe('rgba(0, 0, 0, 0)')
  expect(dockStyle.borderTop, '坞无上边界').toBe('none')

  // 输入框悬浮:绝对定位 + 阴影在场。
  const formStyle = await form.evaluate((element) => {
    const style = getComputedStyle(element)
    return { position: style.position, shadow: style.boxShadow }
  })
  console.log(`[composer-form] position ${formStyle.position} / box-shadow ${formStyle.shadow}`)
  expect(formStyle.position, '输入框悬浮(绝对定位)').toBe('absolute')
  expect(formStyle.shadow, '输入框带阴影').not.toBe('none')

  // 发送钮已删(计数 0);提示行本轮也下线,「Enter 发送 · Shift+Enter 换行」改挂在输入框的
  // title 上 —— 删了发送钮又删了提示行 = 完全不知道 Enter 能发送,故必须补这处兜底。
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toHaveCount(0)
  await expect(page.locator('.composer-form button')).toHaveCount(0)
  await expect(page.locator('.composer-hint')).toHaveCount(0)
  await expect(page.locator('.composer-form')).toHaveAttribute('title', 'Enter 发送 · Shift+Enter 换行')

  // 内缩三值:转录区 padding-block-end == scroll-padding-block-end == 输入框高度 + 间隙 + 留白。
  const vars = await composerVars(page)
  const singleHeight = (await form.boundingBox())?.height ?? 0
  const expectedInset = singleHeight + vars.gap + vars.clearance
  await expect.poll(() => transcriptPadBottom(page)).toBeGreaterThan(0)
  const padSingle = await transcriptPadBottom(page)
  const scrollPadSingle = await transcriptScrollPadBottom(page)
  console.log(`[input area] 单行:输入框高 ${singleHeight.toFixed(1)} / padding-bottom ${padSingle.toFixed(1)} / scroll-padding-bottom ${scrollPadSingle.toFixed(1)} / 间隙 ${vars.gap} + 留白 ${vars.clearance} → 期望 ${expectedInset.toFixed(1)}`)
  expect(Math.abs(padSingle - expectedInset), '转录区 padding-block-end = 输入框高 + 间隙 + 留白').toBeLessThanOrEqual(1)
  expect(Math.abs(scrollPadSingle - padSingle), 'scroll-padding-block-end == padding-block-end').toBeLessThanOrEqual(1)

  // mask-image 已生效且是「先实心、后淡出」的多色标渐变(不是两色标)。
  const mask = await transcriptMaskImage(page)
  const solidStops = mask.split('rgb(').length - 1
  console.log(`[input area] mask-image ${mask} / 实心色标 ${solidStops} 个`)
  expect(mask, 'mask-image 含 linear-gradient').toContain('linear-gradient')
  expect(mask, 'mask-image 含 calc() 定位的色标').toContain('calc(')
  expect(solidStops, 'mask-image 至少两个实心色标(先实心后淡出)').toBeGreaterThanOrEqual(2)

  const flowBefore = await flowGeom(page)
  // 多行:输入 4 行 → 输入框长高,但不挤占流内区域;内缩三值同步跟随。
  await input.fill('line1\nline2\nline3\nline4')
  await expect.poll(async () => (await form.boundingBox())?.height ?? 0).toBeGreaterThan(singleHeight)
  const multiHeight = (await form.boundingBox())?.height ?? 0
  const flowAfter = await flowGeom(page)
  for (const key of ['telemetry'] as const) {
    const a = flowBefore[key]
    const b = flowAfter[key]
    expect(a, `${key} 单行有几何盒`).not.toBeNull()
    expect(b, `${key} 多行有几何盒`).not.toBeNull()
    if (a === null || b === null) continue
    console.log(`[input area] 流内 ${key}:单行 ${JSON.stringify(a)} → 多行 ${JSON.stringify(b)}`)
    expect(Math.abs(b.x - a.x), `${key} x 不变`).toBeLessThanOrEqual(0.5)
    expect(Math.abs(b.y - a.y), `${key} y 不变`).toBeLessThanOrEqual(0.5)
    expect(Math.abs(b.width - a.width), `${key} width 不变`).toBeLessThanOrEqual(0.5)
    expect(Math.abs(b.height - a.height), `${key} height 不变`).toBeLessThanOrEqual(0.5)
  }
  await expect.poll(() => transcriptPadBottom(page)).toBeCloseTo(multiHeight + vars.gap + vars.clearance, 0)
  const padMulti = await transcriptPadBottom(page)
  const scrollPadMulti = await transcriptScrollPadBottom(page)
  console.log(`[input area] 多行:输入框高 ${multiHeight.toFixed(1)} / padding-bottom ${padMulti.toFixed(1)} / scroll-padding-bottom ${scrollPadMulti.toFixed(1)} / 期望 ${(multiHeight + vars.gap + vars.clearance).toFixed(1)}`)
  expect(Math.abs(padMulti - (multiHeight + vars.gap + vars.clearance)), '多行时 padding-block-end 跟随').toBeLessThanOrEqual(1)
  expect(Math.abs(scrollPadMulti - padMulti), '多行时 scroll-padding == padding').toBeLessThanOrEqual(1)

  // 贴底时最后一条消息与输入框不重叠,且落在留白处(距输入框上缘 = 留白值)。
  await page.getByRole('log').evaluate((element) => { element.scrollTop = element.scrollHeight })
  const lastMessage = await page.locator('.chat-message').last().boundingBox()
  const inputBox = await form.boundingBox()
  expect(lastMessage).not.toBeNull()
  expect(inputBox).not.toBeNull()
  if (lastMessage !== null && inputBox !== null) {
    const clearancePx = inputBox.y - (lastMessage.y + lastMessage.height)
    console.log(`[input area] 末条消息底 ${(lastMessage.y + lastMessage.height).toFixed(1)} / 输入框顶 ${inputBox.y.toFixed(1)} / 留白 ${clearancePx.toFixed(1)}px(期望 ${vars.clearance})`)
    expect(lastMessage.y + lastMessage.height, '最后一条消息与输入框不相交').toBeLessThanOrEqual(inputBox.y + 1)
    expect(Math.abs(clearancePx - vars.clearance), '末条到输入框上缘 = 留白值').toBeLessThanOrEqual(1)
  }

  // 「回到底部」浮在输入框上方、两者不重叠、都不覆盖输入框。
  await page.getByRole('log').hover()
  await page.mouse.wheel(0, -800)
  const button = page.getByRole('button', { name: '回到底部' })
  await expect(button).toBeVisible()
  const buttonBox = await button.boundingBox()
  const inputBoxAfter = await form.boundingBox()
  expect(buttonBox).not.toBeNull()
  expect(inputBoxAfter).not.toBeNull()
  if (buttonBox !== null && inputBoxAfter !== null) {
    console.log(`[input area] 回到底部底 ${(buttonBox.y + buttonBox.height).toFixed(1)} / 输入框顶 ${inputBoxAfter.y.toFixed(1)}`)
    expect(buttonBox.y + buttonBox.height, '「回到底部」浮在输入框之上、不覆盖输入框').toBeLessThanOrEqual(inputBoxAfter.y + 1)
  }
})

// ③ 核心缺陷回归:贴底时最后一条消息**不与悬浮输入框相交**、且落在**留白**处(距输入框上缘 =
// 留白值)、并落在**淡出带的全亮区**(其底边 ≤ 淡出带起点 → 不被光晕压暗)。
// 覆盖 375 / 768 / 1280 / 1600 × 单行 / 多行草稿。
test('输入区内缩:四宽度 × 单/多行草稿,末条落在留白处且在全亮区', async ({ page }) => {
  for (const width of [375, 768, 1280, 1600]) {
    for (const multiline of [false, true]) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await login(page)
      await waitForStable(page)
      const input = page.getByRole('textbox', { name: '给 Mia 的消息' })
      const form = page.locator('.composer-form')
      if (multiline) {
        await input.fill('第一行草稿\n第二行草稿\n第三行草稿\n第四行草稿')
      }
      const vars = await composerVars(page)
      // 等内缩随输入高度落定(ResizeObserver → CSS 变量),再贴底测量。
      const formHeightEarly = (await form.boundingBox())?.height ?? 0
      await expect.poll(() => transcriptPadBottom(page), { message: '内缩跟随输入框高度' }).toBeCloseTo(formHeightEarly + vars.gap + vars.clearance, 0)
      // 贴底。
      await page.getByRole('log').evaluate((element) => { element.scrollTop = element.scrollHeight })
      await page.waitForTimeout(80)
      const formHeight = (await form.boundingBox())?.height ?? 0
      const pad = await transcriptPadBottom(page)
      const scrollPad = await transcriptScrollPadBottom(page)
      const lastMessage = await page.locator('.chat-message').last().boundingBox()
      const inputBox = await form.boundingBox()
      const transcriptBox = await page.locator('.transcript').boundingBox()
      expect(lastMessage, `${width}/${multiline ? '多行' : '单行'} 末条存在`).not.toBeNull()
      expect(inputBox, `${width}/${multiline ? '多行' : '单行'} 输入框存在`).not.toBeNull()
      expect(transcriptBox, `${width}/${multiline ? '多行' : '单行'} 转录区存在`).not.toBeNull()
      if (lastMessage === null || inputBox === null || transcriptBox === null) continue
      const label = `@${width} ${multiline ? '多行' : '单行'}`
      const lastBottom = lastMessage.y + lastMessage.height
      const clearancePx = inputBox.y - lastBottom
      // 淡出带起点 = 转录区底边 − 内缩值(= 贴底静止位置);末条底边应 ≤ 该点(落在全亮区)。
      const fadeStart = transcriptBox.y + transcriptBox.height - pad
      console.log(`[inset] ${label}:输入框高 ${formHeight.toFixed(1)} / padding ${pad.toFixed(1)} / scroll-padding ${scrollPad.toFixed(1)} / 末条底 ${lastBottom.toFixed(1)} / 输入框顶 ${inputBox.y.toFixed(1)} / 留白 ${clearancePx.toFixed(1)}px / 淡出带起点 ${fadeStart.toFixed(1)}`)
      // 1) 不相交(末条底边不越过输入框上缘)。
      expect(clearancePx, `${label}:末条消息与输入框不相交`).toBeGreaterThanOrEqual(-1)
      // 2) 到输入框上缘的距离 = 声明的留白值(±1px)。
      expect(Math.abs(clearancePx - vars.clearance), `${label}:末条到输入框上缘 = 留白 ${vars.clearance}`).toBeLessThanOrEqual(1)
      // 3) 末条底边 ≤ 淡出带起点(全亮区,不被压暗)。
      expect(lastBottom - fadeStart, `${label}:末条底边 ≤ 淡出带起点(全亮区)`).toBeLessThanOrEqual(1)
      // 4) 内缩三值一致。
      expect(Math.abs(pad - (formHeight + vars.gap + vars.clearance)), `${label}:padding = 输入框高 + 间隙 + 留白`).toBeLessThanOrEqual(1)
      expect(Math.abs(scrollPad - pad), `${label}:scroll-padding == padding`).toBeLessThanOrEqual(1)
    }
  }
})

// ③ scroll-padding 的落地:搜索正文命中跳转后,被高亮的那一轮**完整落在输入框之上**
// (只给 padding 时「跳转定位」仍会把目标落到输入框底下 —— 这是 WCAG C43 要成对给的原因)。
test('搜索正文命中跳转:被高亮的轮次完整落在悬浮输入框之上', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await login(page)
  await waitForStable(page)
  await openSwitcher(page)
  await page.getByRole('textbox', { name: '搜索对话' }).fill('彩排')
  const hit = page.locator('.hit-item')
  await expect(hit).toHaveCount(1)
  await hit.click()
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  const highlighted = page.locator('.chat-message.is-highlighted')
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted).toHaveAttribute('data-message-id', 'weekly-4')
  // 等滚动定位落定(平滑滚动在 reduced-motion 下退化为瞬时,这里仍给一帧)。
  await page.waitForTimeout(120)
  const messageBox = await highlighted.boundingBox()
  const inputBox = await page.locator('.composer-form').boundingBox()
  expect(messageBox).not.toBeNull()
  expect(inputBox).not.toBeNull()
  if (messageBox === null || inputBox === null) return
  console.log(`[scroll-padding] 高亮轮次底 ${(messageBox.y + messageBox.height).toFixed(1)} / 输入框顶 ${inputBox.y.toFixed(1)} / 间隙 ${(inputBox.y - (messageBox.y + messageBox.height)).toFixed(1)}px`)
  expect(messageBox.y + messageBox.height, '高亮轮次完整落在输入框之上').toBeLessThanOrEqual(inputBox.y + 1)
})

// ============================================================================
// 本轮新增:① 助手消息的作者名 = 会话所属 Agent 名(不再一律「Mia」)+ 双方圆形头像;
// ② 头像 / 作者名 / 时间戳进入阅读列两侧的 gutter,正文列宽度保持不变。
// 逐条机械核对。头像文案 / 作者名取自 i18n(测试读不到运行时词条,按同值写死)。
// ============================================================================

test('助手作者名 = 会话所属 Agent 名(三档各验一次),不出现「Mia」', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  // 默认(规划助手 / weekly):助手消息作者名 = 规划助手;用户侧 = 你;全页作者名不含产品名「Mia」。
  await expect(page.locator('.chat-message.assistant .message-author').first()).toHaveText(AGENT_NAMES['zh-CN'].planning)
  await expect(page.locator('.chat-message.user .message-author').first()).toHaveText('你')
  await expect(page.locator('.message-author', { hasText: 'Mia' }), '作者名不再出现产品名 Mia').toHaveCount(0)

  // 换 Agent 到研究助手 → 助手作者名随之变。
  const trigger = page.locator(`${AGENT_SELECTOR}__trigger`)
  await trigger.click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].research }).click()
  await expect(page.locator('.chat-message.assistant .message-author').first()).toHaveText(AGENT_NAMES['zh-CN'].research)
  await expect(page.locator('.message-author', { hasText: 'Mia' })).toHaveCount(0)
})

// 写作助手这一档 + 留痕的后续消息,用等待交互直达态(与既有「允许 → 留痕」用例同一稳定路径)。
test('助手作者名(写作助手):消息与后续留痕都用 Agent 名', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  await expect(page.locator('.chat-message.assistant .message-author').first()).toHaveText(AGENT_NAMES['zh-CN'].writing)
  await expect(page.locator('.message-author', { hasText: 'Mia' })).toHaveCount(0)
  // 留痕的后续消息同样用 Agent 名(允许后追加的那条也是该 Agent 说的)。
  await page.locator('.confirmation-card').getByRole('button', { name: '允许', exact: true }).click()
  await expect(page.locator('.confirmation-record')).toHaveAttribute('data-outcome', 'allowed')
  await expect(page.locator('[data-message-id="confirmation-followup-allowed"] .message-author')).toHaveText(AGENT_NAMES['zh-CN'].writing)
})

test('每条消息一个圆形头像:计数 == 消息数、aria-hidden、圆形、28px(≤1023 为 24px)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  const messageCount = await page.locator('.chat-message').count()
  expect(messageCount, '默认会话至少 4 条消息').toBeGreaterThanOrEqual(4)
  const avatars = page.locator('.chat-message .message-avatar')
  await expect(avatars, '每条消息恰一个头像').toHaveCount(messageCount)

  for (const avatar of await avatars.all()) {
    await expect(avatar, '头像为装饰(aria-hidden)').toHaveAttribute('aria-hidden', 'true')
    const measured = await avatar.evaluate((element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return { radius: style.borderTopLeftRadius, width: rect.width, height: rect.height }
    })
    expect(measured.radius, '头像为圆形(pill / 50%)').toMatch(/9999px|50%/)
    expect(Math.abs(measured.width - 28), '头像宽 28px').toBeLessThanOrEqual(1)
    expect(Math.abs(measured.height - 28), '头像高 28px').toBeLessThanOrEqual(1)
  }

  // 助手侧头像 = Agent 首字(规划助手 → 规);用户侧 = 用户首字(林一舟 → 林)。
  await expect(page.locator('.chat-message.assistant .message-avatar').first()).toHaveText('规')
  await expect(page.locator('.chat-message.user .message-avatar').first()).toHaveText('林')

  // ≤1023:头像降到 24px。
  await page.setViewportSize({ width: 768, height: VIEWPORT_HEIGHT })
  await expect.poll(
    () => page.locator('.message-avatar').first().evaluate((element) => Math.round(element.getBoundingClientRect().width)),
    { message: '窄屏头像降到 24px' },
  ).toBe(24)
})

test('消息时间戳:走等宽字体 + 等宽数字,且每条消息一个', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const time = page.locator('.message-time').first()
  await expect(time).toBeVisible()
  const style = await time.evaluate((element) => {
    const computed = getComputedStyle(element)
    return { family: computed.fontFamily, numeric: computed.fontVariantNumeric }
  })
  console.log(`[message-time] font-family ${style.family} / font-variant-numeric ${style.numeric}`)
  expect(style.family.toLowerCase(), '时间戳字体含等宽族').toContain('mono')
  expect(style.numeric, '时间戳用等宽数字').toBe('tabular-nums')
  // 每条消息一个时间戳(与消息数一致)。
  await expect(page.locator('.message-time')).toHaveCount(await page.locator('.chat-message').count())
})

// 头像位置与正文列宽度(本轮核心):助手头像在内容左侧、用户头像在内容右侧(镜像);
// 头像凸入侧向 gutter 但**不挤压正文列**(正文列宽度与改造前逐值相同 = 768)。
test('头像镜像位置 + 不挤压正文列 + 侧向留白实测 @1280/1600', async ({ page }) => {
  for (const width of [1280, 1600]) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)

    // 正文列宽度 = 768(父列限宽;头像的负外边距把它拉到列外的 gutter,故列宽不变)。
    const assistantRow = page.locator('.chat-message.assistant').first()
    const assistantBody = await assistantRow.locator('.message-body').boundingBox()
    const assistantAvatar = await assistantRow.locator('.message-avatar').boundingBox()
    const assistantContent = await assistantRow.locator('.message-content').boundingBox()
    expect(assistantBody).not.toBeNull()
    expect(assistantAvatar).not.toBeNull()
    expect(assistantContent).not.toBeNull()
    if (assistantBody === null || assistantAvatar === null || assistantContent === null) return
    expect(Math.abs(assistantBody.width - WORKSPACE_COLUMN_MAX), `@${width} 助手正文列宽 = 768(不被头像挤压)`).toBeLessThanOrEqual(1)
    expect(Math.abs(assistantBody.x - assistantContent.x), `@${width} 正文列 = 内容块左缘`).toBeLessThanOrEqual(1)
    // 助手:头像在内容左侧,且凸入左 gutter(头像左缘落在正文列左缘之外)。
    expect(assistantAvatar.x + assistantAvatar.width, `@${width} 助手头像在内容左侧`).toBeLessThanOrEqual(assistantContent.x + 1)
    expect(assistantAvatar.x, `@${width} 助手头像凸入左 gutter`).toBeLessThan(assistantContent.x - 5)

    // 用户:镜像 —— 头像在内容右侧,且凸入右 gutter。
    const userRow = page.locator('.chat-message.user').first()
    const userAvatar = await userRow.locator('.message-avatar').boundingBox()
    const userContent = await userRow.locator('.message-content').boundingBox()
    expect(userAvatar).not.toBeNull()
    expect(userContent).not.toBeNull()
    if (userAvatar === null || userContent === null) return
    expect(userAvatar.x, `@${width} 用户头像在内容右侧`).toBeGreaterThanOrEqual(userContent.x + userContent.width - 1)
    expect(userAvatar.x + userAvatar.width, `@${width} 用户头像凸入右 gutter`).toBeGreaterThan(userContent.x + userContent.width + 5)

    // 侧向留白实测:正文列两侧到转录区边缘的距离,以及 gutter 占用。
    const transcriptBox = await page.locator('.transcript').boundingBox()
    if (transcriptBox !== null) {
      const leftWhitespace = assistantBody.x - transcriptBox.x
      const rightWhitespace = transcriptBox.x + transcriptBox.width - (assistantBody.x + assistantBody.width)
      console.log(`[gutter] @${width} 正文列 x=${assistantBody.x.toFixed(1)} w=${assistantBody.width.toFixed(1)} / 左留白 ${leftWhitespace.toFixed(1)}px / 右留白 ${rightWhitespace.toFixed(1)}px / 头像 ${assistantAvatar.width.toFixed(1)}px + 间隙 = gutter(结构性留白)`)
    }
    // 头像整块落在转录区之内(负外边距没有把它推出滚动容器 —— 否则会出横向滚动条)。
    expect(assistantAvatar.x, `@${width} 助手头像不越出转录区左缘`).toBeGreaterThanOrEqual((transcriptBox?.x ?? 0) - 1)
    expect(userAvatar.x + userAvatar.width, `@${width} 用户头像不越出转录区右缘`).toBeLessThanOrEqual((transcriptBox?.x ?? 0) + (transcriptBox?.width ?? 0) + 1)
  }
})

// ============================================================================
// 本轮新增(第二条):tab 的状态图标 —— 五态各一种形状(不靠颜色区分,WCAG 1.4.1 通过版),
// 颜色只作加固(≥3:1,见上面对比度用例),「响应中」有慢速呼吸(reduced-motion 下退成静态)。
// ============================================================================

// 形状指纹:图形态 = SVG 的路径 d;CSS 形状(dot / ring)= 描边宽 + 底色。两态指纹相等即形状相同。
async function statusFingerprints(page: Page): Promise<Record<string, string>> {
  return page.locator('.tab-status').evaluateAll((elements) => {
    const result: Record<string, string> = {}
    for (const element of elements) {
      const icon = element.getAttribute('data-icon')
      if (icon === null || icon === 'none') continue
      const svg = element.querySelector('svg')
      if (svg) {
        result[icon] = `svg:${Array.from(svg.querySelectorAll('path')).map((path) => path.getAttribute('d')).join('|')}`
        continue
      }
      const shape = element.querySelector('span')
      const style = shape ? getComputedStyle(shape) : null
      result[icon] = style ? `css:${style.borderTopWidth}:${style.backgroundColor}` : 'none'
    }
    return result
  })
}

test('tab 状态图标:五态形状互不相同 + 每态颜色 == 对应 token + title 含状态词', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const normal = await statusFingerprints(page)
  console.log(`[tab status] 常规态 ${JSON.stringify(normal)}`)
  for (const icon of ['sparkles', 'dot', 'check', 'ring']) expect(normal[icon], `常规态含 ${icon}`).toBeDefined()

  // 每态颜色 == 对应 token(深色作用域)。
  const resolvedMap: Record<string, string> = {
    sparkles: await resolveToken(page, '--dl-text-secondary'),
    dot: await resolveToken(page, '--dl-accent'),
    choiceCard: await resolveToken(page, '--dl-warning'),
    check: await resolveToken(page, '--dl-success'),
    ring: await resolveToken(page, '--dl-text-tertiary'),
  }
  const colors = await page.locator('.tab-status').evaluateAll((elements) => elements.map((element) => ({
    icon: element.getAttribute('data-icon') ?? 'none',
    color: getComputedStyle(element).color,
  })))
  for (const item of colors) {
    if (item.icon === 'none' || resolvedMap[item.icon] === undefined) continue
    expect(item.color, `${item.icon} 的颜色 == 对应 token`).toBe(resolvedMap[item.icon])
  }

  // title 追加状态词(weekly 是活动会话 streaming → 「响应中」)。
  const activeTitle = await page.locator(`${TAB}[aria-selected="true"]`).getAttribute('title')
  const activeLabel = await page.locator(`${TAB}[aria-selected="true"] .conversation-tab__label`).innerText()
  console.log(`[tab title] ${activeTitle}`)
  expect(activeTitle ?? '').toContain(activeLabel)
  expect(activeTitle ?? '').toContain('响应中')

  // 第五态 choiceCard 在 ?s=waiting(该态下已有两个等待会话,不新增常规态等待会话)。
  await page.goto('/#/workspace?s=waiting')
  await waitForStable(page, 'ready', HEADINGS['zh-CN'].knowledge)
  const waiting = await statusFingerprints(page)
  console.log(`[tab status] waiting 态 ${JSON.stringify(waiting)}`)
  expect(waiting.choiceCard, 'waiting 态含 choiceCard').toBeDefined()
  const choice = page.locator('.tab-status[data-icon="choiceCard"]').first()
  expect(await choice.evaluate((element) => getComputedStyle(element).color)).toBe(resolvedMap.choiceCard)

  // 五态形状指纹两两不等(不是只比颜色)。
  const all = { ...normal, ...waiting }
  console.log(`[tab status] 五态指纹 ${JSON.stringify(all)}`)
  expect(Object.keys(all).length, '五态齐备').toBe(5)
  expect(new Set(Object.values(all)).size, '五态形状互不相同').toBe(5)
})

test('「响应中」图标:慢速呼吸(只动 opacity、周期 ≥1.5s),reduced-motion 下静态', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const dot = page.locator('.tab-status[data-icon="dot"] .tab-status__dot').first()
  await expect(dot).toHaveCount(1)
  const anim = await dot.evaluate((element) => {
    const style = getComputedStyle(element)
    const animations = element.getAnimations()
    const frames = animations.flatMap((animation) => (animation.effect instanceof KeyframeEffect ? Array.from(animation.effect.getKeyframes()) : []))
    const keys = new Set<string>()
    for (const frame of frames) for (const key of Object.keys(frame)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(key)) keys.add(key)
    return { name: style.animationName, duration: style.animationDuration, iteration: style.animationIterationCount, keys: [...keys], bg: style.backgroundColor, count: animations.length }
  })
  console.log(`[status anim] name ${anim.name} / duration ${anim.duration} / iteration ${anim.iteration} / 关键帧属性 ${JSON.stringify(anim.keys)} / bg ${anim.bg}`)
  expect(anim.name, '「响应中」有动画').not.toBe('none')
  expect(Number.parseFloat(anim.duration), '周期 ≥1.5s').toBeGreaterThanOrEqual(1.5)
  expect(anim.count, '取到动画').toBeGreaterThanOrEqual(1)
  expect(anim.keys, '只动 opacity(动效白名单)').toEqual(['opacity'])
  expect(anim.bg, '静止态仍是实心圆点').not.toBe('rgba(0, 0, 0, 0)')

  // reduced-motion:退成静态实心 accent 圆点(「降级动效、不消除动效」)。
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reduced = await dot.evaluate((element) => {
    const style = getComputedStyle(element)
    return { name: style.animationName, bg: style.backgroundColor }
  })
  console.log(`[status anim] reduced-motion name ${reduced.name} / bg ${reduced.bg}`)
  expect(reduced.name, 'reduced-motion 下无动画').toBe('none')
  expect(reduced.bg, 'reduced-motion 下仍是实心圆点').not.toBe('rgba(0, 0, 0, 0)')
})

test('「响应完成(未看过)」图标随「已看过」变化', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const roadmapTab = page.locator(TAB, { hasText: HEADINGS['zh-CN'].roadmap })
  await expect(roadmapTab.locator('.tab-status'), 'roadmap 是 completed 且未看过 → 对勾').toHaveAttribute('data-icon', 'check')
  await roadmapTab.click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(roadmapTab.locator('.tab-status'), '看过之后对勾收起').toHaveAttribute('data-icon', 'none')
})

// 前导状态槽不挤压标签:加图标后 tab 宽度与可见数按既有规则重算(脚本算法未变),标签仍单行省略。
for (const width of [1280, 1600]) {
  test(`tab 前导状态槽不挤压标签 @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    const tabs = page.locator(TAB)
    const count = await tabs.count()
    const firstTab = await tabs.first().boundingBox()
    const slot = await tabs.first().locator('.tab-status').boundingBox()
    const label = await tabs.first().locator('.conversation-tab__label').boundingBox()
    console.log(`[tab layout] @${width} 可见 ${count} / tab 宽 ${firstTab?.width.toFixed(1)} / 状态槽 ${slot?.width.toFixed(1)} / 标签宽 ${label?.width.toFixed(1)}`)
    // 状态槽固定 16px(--dl-icon-sm);标签仍占满剩余且单行省略。
    expect(Math.abs((slot?.width ?? 0) - 16), '状态槽固定 16px').toBeLessThanOrEqual(1)
    expect(label?.width ?? 0, '标签仍有可用宽').toBeGreaterThan(40)
    const labelStyle = await tabs.first().locator('.conversation-tab__label').evaluate((element) => {
      const style = getComputedStyle(element)
      return { whiteSpace: style.whiteSpace, textOverflow: style.textOverflow }
    })
    expect(labelStyle.whiteSpace).toBe('nowrap')
    expect(labelStyle.textOverflow).toBe('ellipsis')
    // 未活动与活动 tab 都有状态槽(活动那个恰一个)。
    expect(await page.locator(`${TAB}[aria-selected="true"] .tab-status`).count()).toBe(1)
    // 既有规则未变:1600 六条全可见、1280 有隐藏项。
    expect(count).toBe(width === 1600 ? SESSIONS_IN_DEFAULT_PROJECT : count)
    if (width === 1280) expect(count, '1280 有隐藏项').toBeLessThan(SESSIONS_IN_DEFAULT_PROJECT)
  })
}

// ============================================================================
// 本轮新增:双击文件树里的文件 → 在右侧(文件面板)渲染该文件;输入框下方新增文件栏。
// ============================================================================

const FILE_BAR = '.file-bar-dock'
// 文件面板缩放的尺寸下限(与 file-panel.vue 的 PANEL_MIN_W / PANEL_MIN_H 同值;测试读不到组件常量)。
const PANEL_MIN_W = 320
const PANEL_MIN_H = 200
const FILE_TAB = '.file-tab'
const FILE_PANEL = '.file-panel'
// 默认项目 weekly-report 里的顶层文件(技术标识,不随语言变化;无需展开目录即可见到)。
const README = 'README.md'
const PROGRESS = 'progress.csv'
const GITIGNORE = '.gitignore'

// 文件树里的文件行:整行一个 button。单击 = 预览,双击 = 钉住。
async function clickFileRow(page: Page, name: string): Promise<void> {
  await page.locator('.entry-row[data-kind="file"]', { hasText: name }).first().locator('.entry-row__button').click()
}

async function pinFileRow(page: Page, name: string): Promise<void> {
  await page.locator('.entry-row[data-kind="file"]', { hasText: name }).first().locator('.entry-row__button').dblclick()
}

// 窄屏侧栏是抽屉:打开它才能点树行;点完把抽屉关掉(否则会盖住要量的东西)。
async function openSidebarIfNarrow(page: Page, width: number): Promise<void> {
  if (width < 1024) await page.getByRole('button', { name: '打开侧栏' }).click()
}

async function closeSidebarIfOpen(page: Page): Promise<void> {
  if (await page.getByRole('dialog', { name: 'Agent 工作区' }).count() > 0) {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Agent 工作区' })).toHaveCount(0)
  }
}

// 文件栏里可见 tab 的标签文字(按顺序)。
function fileTabLabels(page: Page): Promise<(string | null)[]> {
  return page.locator(`${FILE_TAB} .file-tab__label`).evaluateAll((elements) => elements.map((el) => el.textContent))
}

// 文件栏 tab 标签的字体样式(预览槽应为斜体)。
function firstTabFontStyle(page: Page, which: 'first' | 'last'): Promise<string> {
  const target = which === 'first' ? page.locator(`${FILE_TAB} .file-tab__label`).first() : page.locator(`${FILE_TAB} .file-tab__label`).last()
  return target.evaluate((el) => getComputedStyle(el).fontStyle)
}

// 拖拽文件栏里第 from 个可见槽到第 to 个槽的位置。
async function dragFileTab(page: Page, from: number, to: number): Promise<void> {
  const slots = page.locator('.file-tab-slot')
  const fromBox = await slots.nth(from).boundingBox()
  const toBox = await slots.nth(to).boundingBox()
  expect(fromBox, '被拖 tab 有几何盒').not.toBeNull()
  expect(toBox, '目标 tab 有几何盒').not.toBeNull()
  if (fromBox === null || toBox === null) return
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 10 })
  await page.mouse.up()
}

// 面板(会话面板 .conversation)的**内容盒**:描边内侧的那块 —— 停靠的文件栏底边应与它重合。
function panelInnerBox(page: Page): Promise<Rect> {
  return page.locator('.conversation').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const left = rect.x + (Number.parseFloat(style.borderInlineStartWidth) || 0)
    const top = rect.y + (Number.parseFloat(style.borderBlockStartWidth) || 0)
    const right = rect.x + rect.width - (Number.parseFloat(style.borderInlineEndWidth) || 0)
    const bottom = rect.y + rect.height - (Number.parseFloat(style.borderBlockEndWidth) || 0)
    return { x: left, y: top, width: right - left, height: bottom - top }
  })
}

test('文件树:单击 = 预览(临时槽斜体)、双击 = 钉住、Enter 也能钉住', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 文件栏**常驻**:还没打开任何文件时它也在,并显示教学性空态。
  await expect(page.locator(FILE_BAR)).toHaveCount(1)
  await expect(page.locator('.file-bar__empty')).toHaveCount(1)
  await expect(page.locator(FILE_TAB)).toHaveCount(0)

  // 单击 README.md = 预览:出现一个 tab、它是活动项、标签斜体、面板打开。
  await clickFileRow(page, README)
  await expect(page.locator(FILE_BAR)).toHaveCount(1)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  await expect(page.locator(FILE_TAB).first()).toHaveAttribute('aria-selected', 'true')
  expect(await firstTabFontStyle(page, 'first'), '预览槽标签斜体').toBe('italic')
  await expect(page.locator(FILE_PANEL)).toBeVisible()

  // 再单击另一个文件 = 顶掉旧预览:临时槽只有一个,仍只有一格。
  await clickFileRow(page, PROGRESS)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  expect(await fileTabLabels(page)).toEqual(['progress.csv'])
  expect(await firstTabFontStyle(page, 'first')).toBe('italic')

  // 双击它 = 钉住:预览原地转正(仍一格,但不再是斜体)。
  await pinFileRow(page, PROGRESS)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  expect(await firstTabFontStyle(page, 'first'), '钉住后不再斜体').toBe('normal')

  // 再单击 README = 新的预览(固定项留下),于是两格;新预览是最后一格且斜体。
  await clickFileRow(page, README)
  await expect(page.locator(FILE_TAB)).toHaveCount(2)
  expect(await fileTabLabels(page)).toEqual(['progress.csv', 'README.md'])
  expect(await firstTabFontStyle(page, 'last')).toBe('italic')

  // Enter 也能钉住:焦点在文件行上按 Enter → 预览转正(格数不变、斜体消失)。
  await page.locator('.entry-row[data-kind="file"]', { hasText: README }).first().locator('.entry-row__button').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator(FILE_TAB)).toHaveCount(2)
  expect(await firstTabFontStyle(page, 'last'), 'Enter 把预览钉住').toBe('normal')
})

for (const width of [375, 768, 1280, 1600]) {
  test(`文件栏几何 @${width}:工作台级底栏(横跨侧栏左缘到对话栏右缘)、常驻、空态有教学文案`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    // 常驻:没有打开任何文件时**这条栏依然在**,并给出教学性空态(它同时承担「把这个手势告诉用户」)。
    const bar = page.locator(FILE_BAR)
    await expect(bar, '文件栏常驻').toHaveCount(1)
    await expect(page.locator('.file-bar__empty')).toHaveText('双击左侧文件,即可在这里打开')
    await expect(page.locator(FILE_TAB)).toHaveCount(0)
    const emptyBarBox = await bar.boundingBox()

    await openSidebarIfNarrow(page, width)
    await pinFileRow(page, README)
    await closeSidebarIfOpen(page)
    await expect(bar).toHaveCount(1)
    const barBox = await bar.boundingBox()
    const sidebarBox = await page.locator('.workspace-sidebar').boundingBox()
    const conversationBox = await page.locator('.conversation').boundingBox()
    const barContent = await page.locator('.file-bar').boundingBox()
    const telemetryBox = await page.locator('.telemetry').boundingBox()
    const inputBox = await page.locator('.composer-form').boundingBox()
    expect(emptyBarBox).not.toBeNull()
    expect(barBox).not.toBeNull()
    expect(sidebarBox).not.toBeNull()
    expect(conversationBox).not.toBeNull()
    expect(barContent).not.toBeNull()
    expect(telemetryBox).not.toBeNull()
    expect(inputBox).not.toBeNull()
    if (emptyBarBox === null || barBox === null || sidebarBox === null || conversationBox === null || barContent === null || telemetryBox === null || inputBox === null) return
    console.log(`[file bar] @${width} 栏 ${barBox.width.toFixed(1)}×${barBox.height.toFixed(1)} @${barBox.x.toFixed(1)}..${(barBox.x + barBox.width).toFixed(1)} / 侧栏左缘 ${sidebarBox.x.toFixed(1)} · 对话栏右缘 ${(conversationBox.x + conversationBox.width).toFixed(1)} / 栏内容 x ${barContent.x.toFixed(1)}`)
    // 常驻带来的实质好处:首开 / 不开文件,栏高**逐值相同**(工作台几何因此恒定)。
    expect(Math.abs(barBox.height - emptyBarBox.height), '空 / 非空两态栏高相同').toBeLessThanOrEqual(1)
    // ① 整宽:左缘 == 侧栏左缘,右缘 == 对话面板右缘(外壳内缩之内的整宽)。
    //    窄屏(≤1023)侧栏是抽屉、脱离流(定位在视口外),故那一档改断言「横跨外壳内宽」。
    if (width >= 1024) {
      expect(Math.abs(barBox.x - sidebarBox.x), '栏左缘 == 侧栏左缘').toBeLessThanOrEqual(1)
    } else {
      const layoutLeft = await page.locator('.workspace-layout').evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return rect.x + (Number.parseFloat(getComputedStyle(el).paddingInlineStart) || 0)
      })
      expect(Math.abs(barBox.x - layoutLeft), '窄屏:栏左缘 == 外壳内容盒左缘').toBeLessThanOrEqual(1)
    }
    expect(Math.abs((barBox.x + barBox.width) - (conversationBox.x + conversationBox.width)), '栏右缘 == 对话栏右缘').toBeLessThanOrEqual(1)
    // ② 在两块面板**下方**(外壳网格第三行,中间一条与外壳同宽的缝)。
    //    窄屏(≤1023)侧栏是抽屉(fixed、占满视口高),故那一档以对话面板为基准。
    const aboveBottom = width >= 1024 ? Math.max(sidebarBox.y + sidebarBox.height, conversationBox.y + conversationBox.height) : conversationBox.y + conversationBox.height
    expect(barBox.y, '栏在两块面板下方').toBeGreaterThanOrEqual(aboveBottom - 1)
    // ③ 栏高 = 一行 tab(32)+ 上下内边距 8×2 + 上下发丝线 1×2 = 50。
    expect(Math.abs(barBox.height - (32 + 2 * 8 + 2)), '栏高 = 32 + 16 + 2 = 50').toBeLessThanOrEqual(1)
    // ④ 栏内容与侧栏内容的**内边距同值**(两者都是 16 + 1px 描边):≥1024 时与侧栏内容左缘重合,
    //    窄屏侧栏是抽屉(脱离流、定位在视口外),故那一档只核内边距同值。
    const sidebarPad = await page.locator('.workspace-sidebar').evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingInlineStart) || 0)
    const barPad = barContent.x - (barBox.x + 1)
    console.log(`[file bar] @${width} 栏内边距 ${barPad.toFixed(1)} / 侧栏内边距 ${sidebarPad.toFixed(1)}`)
    expect(Math.abs(barPad - sidebarPad), '栏内容内边距 == 侧栏内边距').toBeLessThanOrEqual(1)
    if (width >= 1024) {
      expect(Math.abs(barContent.x - (sidebarBox.x + sidebarPad + 1)), '栏内容 x == 侧栏内容 x').toBeLessThanOrEqual(1.5)
    }
    // 底栏**不再占对话面板内部空间**:输入框仍在对话面板之内(栏只在外壳那一行)。
    expect(inputBox.y + inputBox.height, '输入框仍在对话面板内(栏不在其下)').toBeLessThanOrEqual(conversationBox.y + conversationBox.height + 1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })
}

test('文件栏:关闭 ≠ 删除(菜单里可再打开)、Delete 关闭聚焦项、拖拽换位不改活动项', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 三个顶层文件各自双击钉住(避免预览互相顶掉)。
  for (const name of [README, PROGRESS, GITIGNORE]) await pinFileRow(page, name)
  await expect(page.locator(FILE_TAB)).toHaveCount(3)
  expect(await fileTabLabels(page)).toEqual(['README.md', 'progress.csv', '.gitignore'])

  // 关闭第一个 tab:从栏上撤下(≠ 删除)。
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await expect(page.locator(FILE_TAB)).toHaveCount(2)
  expect(await fileTabLabels(page)).toEqual(['progress.csv', '.gitignore'])

  // 它仍在 ▾ 菜单的「最近打开」里;点它可再打开(重新出现在栏上)。
  await page.locator('.file-bar__trigger').click()
  await expect(page.locator('.file-bar__panel')).toBeVisible()
  const recentRow = page.locator('.file-bar__row', { hasText: README })
  await expect(recentRow, '关掉的文件在「最近打开」里').toHaveCount(1)
  await recentRow.click()
  await expect(page.locator('.file-bar__panel')).toHaveCount(0)
  await expect(page.locator(FILE_TAB)).toHaveCount(3)
  expect(await fileTabLabels(page)).toContain('README.md')

  // Delete 关闭聚焦的 tab。
  const target = page.locator('.file-tab-slot').nth(1).locator(FILE_TAB)
  const victim = await target.locator('.file-tab__label').innerText()
  await target.focus()
  await page.keyboard.press('Delete')
  await expect(page.locator(FILE_TAB, { hasText: victim }), 'Delete 关闭了聚焦的 tab').toHaveCount(0)

  // 拖拽换位:顺序变化,**活动项不变**(拖动后台 tab 不切活动文件)。
  await expect(page.locator(FILE_TAB)).toHaveCount(2)
  const activeBefore = await page.locator(`${FILE_TAB}[aria-selected="true"]`).getAttribute('data-file-path')
  const orderBefore = await page.locator(FILE_TAB).evaluateAll((elements) => elements.map((el) => el.getAttribute('data-file-path')))
  await dragFileTab(page, 0, 1)
  const orderAfter = await page.locator(FILE_TAB).evaluateAll((elements) => elements.map((el) => el.getAttribute('data-file-path')))
  console.log(`[file bar drag] ${JSON.stringify(orderBefore)} → ${JSON.stringify(orderAfter)}`)
  expect(orderAfter, '拖拽改变了顺序').not.toEqual(orderBefore)
  await expect(page.locator(`${FILE_TAB}[aria-selected="true"]`), '拖拽不切活动文件').toHaveAttribute('data-file-path', activeBefore ?? '')

  // 全部关掉 → 栏上无 tab,但**栏常驻**(显示空态);面板收起。
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await expect(page.locator(FILE_TAB)).toHaveCount(0)
  await expect(page.locator(FILE_BAR)).toHaveCount(1)
  await expect(page.locator('.file-bar__empty')).toHaveCount(1)
  await expect(page.locator(FILE_PANEL)).toHaveCount(0)
})

// 文件栏改成「面板底部整宽」后,可用宽不再是 768 而是面板内宽 —— 可见 tab 数随之变多。
// 六个文件在四档宽度下的可见数(实测值写进断言,防止可用宽算法回退):
//   375 → 2、768 → 4、1280 → 6、1600 → 6(溢出部分由 ▾ 菜单兜住)。
const FILE_BAR_VISIBLE = { 375: 2, 768: 4, 1280: 6, 1600: 6 } as const

for (const width of [375, 768, 1280, 1600]) {
  test(`文件栏可见数与溢出 @${width}:六个文件的可见 tab 数,溢出进 ▾ 菜单`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    await openSidebarIfNarrow(page, width)
    // 展开 src / src/utils / notes,凑够六个可打开的文件。
    const tree = page.locator('.project-item').nth(0).locator('.project-tree')
    for (const dir of ['src', 'utils', 'notes']) {
      await tree.locator('.entry-row[data-kind="directory"]', { hasText: dir }).first().locator('.entry-row__button').click()
    }
    for (const name of [README, PROGRESS, GITIGNORE, 'main.ts', 'format.ts', '2026-W40.md']) await pinFileRow(page, name)
    await closeSidebarIfOpen(page)

    const expected = FILE_BAR_VISIBLE[width]
    const visible = await page.locator(FILE_TAB).count()
    const total = await page.locator('.file-tab-slot').count()
    console.log(`[file bar visible] @${width} 可见 ${visible}/${total}(期望 ${expected})`)
    expect(visible, '可见 tab 数(栏改为整宽后实测值)').toBe(expected)
    // 装不下的都在 ▾ 菜单里,菜单钮带「已收起」计数。
    const hidden = 6 - visible
    if (hidden > 0) {
      await expect(page.locator('.file-bar__count')).toHaveText(String(hidden))
      await page.locator('.file-bar__trigger').click()
      await expect(page.locator('.file-bar__panel')).toBeVisible()
      const rows = await page.locator('.file-bar__row').count()
      console.log(`[file bar visible] @${width} 菜单行 ${rows}(期望 ${hidden})`)
      expect(rows, '被隐藏的 tab 都进 ▾ 菜单').toBe(hidden)
      // 选中一个**确实被收起**的项(format.ts 在 375 与 768 两档都排不进可见窗口)——
      // 它随即变为活动 tab 且可见(活动项永远可见)。
      await page.locator('.file-bar__row', { hasText: 'format.ts' }).click()
      await expect(page.locator(`${FILE_TAB}[aria-selected="true"]`)).toHaveAttribute('data-file-path', 'src/utils/format.ts')
      await expect(page.locator(FILE_TAB, { hasText: 'format' })).toHaveCount(1)
    } else {
      await expect(page.locator('.file-bar__count')).toHaveCount(0)
    }
  })
}

// 文件栏停靠在坞的文档流最底下:它的高度把坞顶(转录区底边)顶高,输入框也随之被抬起。
// 覆盖 375/768/1280/1600 × 单/多行(「无文件栏」那一半由既有的「输入区内缩」用例覆盖)。
test('文件栏内缩:内缩三值相等,末条不与输入框 / 遥测条 / 文件栏相交且在全亮区', async ({ page }) => {
  test.setTimeout(90_000)
  for (const width of [375, 768, 1280, 1600]) {
    for (const multiline of [false, true]) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await login(page)
      await waitForStable(page)
      const label = `@${width} ${multiline ? '多行' : '单行'}`
      const vars = await composerVars(page)
      const form = page.locator('.composer-form')
      const bar = page.locator(FILE_BAR)

      // 常驻的实质好处:0 个文件与 N 个文件时,**内缩三值与转录区几何逐值相同**
      // (首次打开文件不再引起版面跳动)。多行草稿先填好并等内缩落定,免得把「草稿长高」
      // (ResizeObserver → CSS 变量,晚一帧)误当成「打开文件」的影响。
      if (multiline) {
        await page.getByRole('textbox', { name: '给 Mia 的消息' }).fill('第一行草稿\n第二行草稿\n第三行草稿\n第四行草稿')
        const formHeightEarly = (await form.boundingBox())?.height ?? 0
        await expect.poll(() => transcriptPadBottom(page), { message: `${label}:草稿长高后内缩落定` }).toBeCloseTo(formHeightEarly + vars.gap + vars.clearance, 0)
      }
      const emptyPad = await transcriptPadBottom(page)
      const emptyScrollPad = await transcriptScrollPadBottom(page)
      const emptyTranscriptBox = await page.locator('.transcript').boundingBox()

      await openSidebarIfNarrow(page, width)
      await pinFileRow(page, README)
      await closeSidebarIfOpen(page)
      await expect(bar).toHaveCount(1)

      const filledTranscriptBox = await page.locator('.transcript').boundingBox()
      expect(emptyTranscriptBox).not.toBeNull()
      expect(filledTranscriptBox).not.toBeNull()
      if (emptyTranscriptBox === null || filledTranscriptBox === null) continue
      const filledPad = await transcriptPadBottom(page)
      const filledScrollPad = await transcriptScrollPadBottom(page)
      console.log(`[file bar inset] ${label}:打开文件前后 转录区 ${emptyTranscriptBox.y.toFixed(1)}..${(emptyTranscriptBox.y + emptyTranscriptBox.height).toFixed(1)} → ${filledTranscriptBox.y.toFixed(1)}..${(filledTranscriptBox.y + filledTranscriptBox.height).toFixed(1)} / padding ${emptyPad.toFixed(1)} → ${filledPad.toFixed(1)} / scroll-padding ${emptyScrollPad.toFixed(1)} → ${filledScrollPad.toFixed(1)}`)
      expect(Math.abs(filledTranscriptBox.y - emptyTranscriptBox.y), `${label}:打开文件前后转录区顶边不变`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(filledTranscriptBox.height - emptyTranscriptBox.height), `${label}:打开文件前后转录区高度不变`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(filledPad - emptyPad), `${label}:打开文件前后 padding 不变`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(filledScrollPad - emptyScrollPad), `${label}:打开文件前后 scroll-padding 不变`).toBeLessThanOrEqual(0.5)

      // 内缩三值:padding == scroll-padding == 输入框高 + 输入框到坞顶的间隙 + 留白。
      // (文件栏**不在**这一项里:它停靠在坞的文档流里,坞高因此包含了它,坞顶随之被顶高 ——
      //  见下一条「从面板内底量起」的断言,那里才把文件栏的高度算进来。)
      const formHeight = (await form.boundingBox())?.height ?? 0
      const expected = formHeight + vars.gap + vars.clearance
      await expect.poll(() => transcriptPadBottom(page), { message: `${label}:内缩跟随` }).toBeCloseTo(expected, 0)
      const pad = await transcriptPadBottom(page)
      const scrollPad = await transcriptScrollPadBottom(page)
      console.log(`[file bar inset] ${label}:输入框高 ${formHeight.toFixed(1)} / padding ${pad.toFixed(1)} / scroll-padding ${scrollPad.toFixed(1)} / 期望 ${expected.toFixed(1)}`)
      expect(Math.abs(pad - expected), `${label}:padding = 输入框高 + 间隙 + 留白`).toBeLessThanOrEqual(1)
      expect(Math.abs(scrollPad - pad), `${label}:scroll-padding == padding`).toBeLessThanOrEqual(1)

      // 贴底:末条与输入框、遥测条、文件栏均不相交;末条底边 ≥ 淡出带起点。
      await page.getByRole('log').evaluate((element) => { element.scrollTop = element.scrollHeight })
      await page.waitForTimeout(80)
      const lastMessage = await page.locator('.chat-message').last().boundingBox()
      const formBox = await form.boundingBox()
      const barBox = await bar.boundingBox()
      const telemetryBox = await page.locator('.telemetry').boundingBox()
      const transcriptBox = await page.locator('.transcript').boundingBox()
      const inner = await panelInnerBox(page)
      const dockBox = await page.locator('.composer-dock').boundingBox()
      expect(lastMessage).not.toBeNull()
      expect(formBox).not.toBeNull()
      expect(barBox).not.toBeNull()
      expect(telemetryBox).not.toBeNull()
      expect(transcriptBox).not.toBeNull()
      expect(dockBox).not.toBeNull()
      if (lastMessage === null || formBox === null || barBox === null || telemetryBox === null || transcriptBox === null || dockBox === null) continue
      const lastBottom = lastMessage.y + lastMessage.height
      const fadeStart = transcriptBox.y + transcriptBox.height - pad
      console.log(`[file bar inset] ${label}:末条底 ${lastBottom.toFixed(1)} / 输入框顶 ${formBox.y.toFixed(1)} / 遥测条顶 ${telemetryBox.y.toFixed(1)} / 文件栏顶 ${barBox.y.toFixed(1)} / 淡出带起点 ${fadeStart.toFixed(1)}`)
      expect(lastBottom, `${label}:末条与输入框不相交`).toBeLessThanOrEqual(formBox.y + 1)
      expect(lastBottom, `${label}:末条与遥测条不相交`).toBeLessThanOrEqual(telemetryBox.y + 1)
      expect(lastBottom, `${label}:末条与文件栏不相交`).toBeLessThanOrEqual(barBox.y + 1)
      expect(lastBottom - fadeStart, `${label}:末条底边 ≤ 淡出带起点(全亮区)`).toBeLessThanOrEqual(1)

      // 从**对话面板内底**量到末条底边 = 输入框高 + 坞高 + 间隙 + 留白。
      // 文件栏**不在这一项里** —— 它已升格为工作台级底栏(在外壳网格第三行),不再占对话面板内部空间。
      const stack = formHeight + dockBox.height + vars.gap + vars.clearance
      const measured = (inner.y + inner.height) - lastBottom
      console.log(`[file bar inset] ${label}:面板内底 − 末条底 ${measured.toFixed(1)} / 输入框 ${formHeight.toFixed(1)} + 坞 ${dockBox.height.toFixed(1)} + 间隙 ${vars.gap} + 留白 ${vars.clearance} = ${stack.toFixed(1)}`)
      expect(Math.abs(measured - stack), `${label}:面板内底到末条 = 输入框 + 坞 + 间隙 + 留白`).toBeLessThanOrEqual(1)
    }
  }
})

test('文件面板:默认整个文件 + 三种变更标记 + 词级高亮 + 折叠展开 / 统一 diff', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickFileRow(page, README)
  const panel = page.locator(FILE_PANEL)
  await expect(panel).toBeVisible()
  // 非模态对话框(不写 aria-modal)+ 可访问名;内容区是文件栏那个 tablist 的 tabpanel。
  await expect(panel).toHaveAttribute('role', 'dialog')
  await expect(panel).not.toHaveAttribute('aria-modal', /.*/)
  await expect(panel).toHaveAttribute('aria-label', '文件面板')
  const body = panel.locator('#file-panel-body')
  await expect(body).toHaveAttribute('role', 'tabpanel')
  // 顶部元信息条:路径(等宽)+ 状态芯片 + 变更统计。
  await expect(panel.locator('.file-panel__path')).toHaveText(README)
  await expect(panel.locator('.file-panel__chip')).toHaveAttribute('data-state', 'modified')
  await expect(panel.locator('.file-panel__stats [data-kind="added"]')).toHaveText(/^\+\d+$/)
  await expect(panel.locator('.file-panel__stats [data-kind="removed"]')).toHaveText(/^−\d+$/)
  // 行号栏的三种变更标记用**形状**区分(+ / − / ~),不只靠颜色。
  const markers = await panel.locator('.file-line__marker').evaluateAll((elements) => [...new Set(elements.map((el) => el.textContent ?? ''))].filter((text) => text !== ''))
  console.log(`[file panel] 变更标记 ${JSON.stringify(markers)}`)
  expect(markers.sort(), '三种形状的变更标记都在场').toEqual(['+', '−', '~'].sort())
  // 词级高亮区间在场(不整行染色)。
  expect(await panel.locator('.file-line__hl').count(), '词级高亮区间在场').toBeGreaterThan(0)
  // 默认视图 = 整个文件。
  await expect(panel.locator('.file-panel__view[aria-pressed="true"]')).toHaveText('整个文件')
  await expect(panel).toHaveAttribute('data-view', 'file')

  // 折叠:未变更的长片段折起来。
  const fold = panel.locator('.file-line__fold')
  expect(await fold.count(), '有可展开的折叠段').toBeGreaterThan(0)

  // 统一 diff:折叠段退成**静态**分隔(不可展开),而整个文件视图里它是按钮。
  await panel.locator('.file-panel__view', { hasText: '统一 diff' }).click()
  await expect(panel).toHaveAttribute('data-view', 'unified')
  await expect(panel.locator('.file-line__fold').first()).toHaveAttribute('data-view', 'unified')
  await panel.locator('.file-panel__view', { hasText: '整个文件' }).click()
  await expect(panel).toHaveAttribute('data-view', 'file')
  await expect(panel.locator('.file-line__fold').first()).not.toHaveAttribute('data-view', 'unified')

  // 点「展开」把它放出来(整个文件视图下折叠段是可展开按钮)。
  const beforeCount = await panel.locator('.file-line').count()
  await panel.locator('.file-line__fold').first().click()
  const afterCount = await panel.locator('.file-line').count()
  console.log(`[file panel] 展开前后行数 ${beforeCount} → ${afterCount}`)
  expect(afterCount, '展开后多出被折叠的行').toBeGreaterThan(beforeCount)

  // 面板的几何(浮动窗口:默认几何避开会话头与输入区,尺寸约视口高的 2/3)。
  const viewport = await transcriptAreaRect(page)
  const panelBox = await panel.boundingBox()
  const headingBox = await page.locator('.conversation-heading').boundingBox()
  const composerBox = await page.locator('.composer-form').boundingBox()
  expect(panelBox).not.toBeNull()
  expect(headingBox).not.toBeNull()
  expect(composerBox).not.toBeNull()
  if (panelBox !== null && headingBox !== null && composerBox !== null) {
    const ratio = panelBox.height / viewport.height
    console.log(`[file panel] 视口高 ${viewport.height.toFixed(1)} / 面板高 ${panelBox.height.toFixed(1)} → ${(ratio * 100).toFixed(1)}% / 面板 ${panelBox.y.toFixed(1)}..${(panelBox.y + panelBox.height).toFixed(1)}`)
    expect(ratio, '面板高约视口高的 2/3').toBeGreaterThan(0.45)
    expect(ratio, '面板高约视口高的 2/3').toBeLessThanOrEqual(0.70)
    expect(panelBox.y, '默认不压住会话头(tab 条)').toBeGreaterThanOrEqual(headingBox.y + headingBox.height - 1)
    expect(panelBox.y + panelBox.height, '默认避开输入区').toBeLessThanOrEqual(composerBox.y + 1)
  }
  // 默认宽度仍取「阅读列 + 两侧 gutter」(与消息正文同宽同轴的可读宽度)。
  const bodyBox = await page.locator('.chat-message.assistant .message-body').first().boundingBox()
  expect(bodyBox).not.toBeNull()
  if (bodyBox !== null && panelBox !== null) {
    console.log(`[file panel] 表面宽 ${panelBox.width.toFixed(1)} / 阅读列 ${bodyBox.width.toFixed(1)}`)
    expect(panelBox.width, '默认宽 ≥ 阅读列').toBeGreaterThanOrEqual(bodyBox.width)
  }
  // 新界面(文件栏 + 文件面板)也在对比度断言范围内。
  expect(await contrastViolations(page)).toEqual([])
})

test('文件面板:窄于阈值时并排自动降级为统一;换行开关生效', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openSidebarIfNarrow(page, 768)
  await clickFileRow(page, README)
  await closeSidebarIfOpen(page)
  const panel = page.locator(FILE_PANEL)
  const sideButton = panel.locator('.file-panel__view', { hasText: '并排 diff' })
  // 768 下面板宽度 ≥ 阈值 → 并排可用。
  await expect(sideButton).toBeEnabled()
  await sideButton.click()
  await expect(panel).toHaveAttribute('data-view', 'side')
  await expect(panel.locator('.file-side')).toHaveCount(1)

  // 375 下面板窄于阈值 → 并排按钮禁用,数据视图**自动降级为统一 diff**。
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await expect(sideButton, '窄屏并排按钮禁用').toBeDisabled()
  await expect(panel, '窄屏自动降级为统一 diff').toHaveAttribute('data-view', 'unified')
  await expect(panel.locator('.file-side')).toHaveCount(0)

  // 换行开关:默认不换行(white-space: pre),打开后 text 走 pre-wrap。
  await panel.locator('.file-panel__view', { hasText: '整个文件' }).click()
  const wrapToggle = panel.locator('.file-panel__toggle')
  await expect(wrapToggle).toHaveAttribute('aria-pressed', 'false')
  const whiteSpace = (): Promise<string> => panel.locator('.file-line__text').first().evaluate((el) => getComputedStyle(el).whiteSpace)
  expect(await whiteSpace()).toBe('pre')
  await wrapToggle.click()
  await expect(wrapToggle).toHaveAttribute('aria-pressed', 'true')
  expect(await whiteSpace()).toBe('pre-wrap')
  // 换行后横向不再滚动。
  const overflowAfter = await bodyScroll(page)
  console.log(`[file panel] 换行后横向溢出 ${overflowAfter}`)
  expect(overflowAfter).toBeLessThanOrEqual(1)
})

// 文件面板内容区的横向溢出量。
function bodyScroll(page: Page): Promise<number> {
  return page.locator('#file-panel-body').evaluate((element) => element.scrollWidth - element.clientWidth)
}

test('文件面板四态:loading / ready(有数据)/ empty / error 均可达;Esc 关闭面板', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // loading → ready。
  await clickFileRow(page, README)
  await expect(page.locator(FILE_PANEL)).toHaveAttribute('data-status', 'loading')
  await expect(page.locator(FILE_PANEL)).toHaveAttribute('data-status', 'ready')
  await expect(page.locator(FILE_PANEL).locator('.file-line').first()).toBeVisible()

  // Esc 收起面板 —— 文件仍留在栏上(关闭 ≠ 删除)。
  await page.keyboard.press('Escape')
  await expect(page.locator(FILE_PANEL)).toHaveCount(0)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  // 从栏上点回 → 面板重开。
  await page.locator(FILE_TAB).first().click()
  await expect(page.locator(FILE_PANEL)).toHaveAttribute('data-status', 'ready')

  // empty:切到写作助手 → 展开 assets → 打开二进制文件(不可预览)。
  await page.locator(`${AGENT_SELECTOR}__trigger`).click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].writing }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  // 打开集是**全局**的:换了 Agent / 项目,先前打开的文件仍在栏上。
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  await expect(page.locator(FILE_BAR)).toHaveCount(1)
  await expect(page.locator('.file-bar__empty')).toHaveCount(0)
  const tree = page.locator('.project-item').nth(0).locator('.project-tree')
  await tree.locator('.entry-row[data-kind="directory"]', { hasText: 'assets' }).first().locator('.entry-row__button').click()
  await clickFileRow(page, 'key-art.png')
  await expect(page.locator(FILE_PANEL)).toHaveAttribute('data-status', 'empty')
  await expect(page.locator('.file-panel__state h2')).toHaveText('无法预览这个文件')
})

test('文件面板 error 态:?s=error 下打开文件 → 错误 + 重试', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await page.goto('/#/workspace?s=error')
  await waitForStable(page, 'error')
  await clickFileRow(page, README)
  const panel = page.locator(FILE_PANEL)
  await expect(panel).toHaveAttribute('data-status', 'error')
  await expect(panel.locator('.file-panel__state h2')).toHaveText('无法读取这个文件')
  // 重试仍在同一演示态(仍 error),但按钮是可点的、不是假交互。
  await panel.getByRole('button', { name: '重试', exact: true }).click()
  await expect(panel).toHaveAttribute('data-status', 'error')
})

test('文件面板:待确认文件的允许 / 拒绝与转录里的确认卡作用于同一确认请求', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  // 写作助手 product-docs 的 release-notes.md 是当前确认请求的受影响文件。
  await clickFileRow(page, AFFECTED_ENTRY)
  const panel = page.locator(FILE_PANEL)
  await expect(panel).toBeVisible()
  await expect(panel.locator('.file-panel__chip')).toHaveAttribute('data-state', 'pending')
  // 面板里的摘要与转录里的确认卡**同一个** ConfirmationRequest(文案与受影响文件一致)。
  await expect(panel.locator('.file-panel__confirm')).toBeVisible()
  await expect(panel.locator('.file-panel__confirm-summary')).toHaveText('用新草稿改写「release-notes.md」')
  await expect(page.locator('.transcript-inner .confirmation-card .confirmation-summary')).toHaveText('用新草稿改写「release-notes.md」')

  // 在面板里允许 → 转录里的确认卡同时塌缩成留痕(同源同动作)。
  await panel.getByRole('button', { name: '允许', exact: true }).click()
  await expect(panel.locator('.file-panel__confirm-record')).toHaveAttribute('data-outcome', 'allowed')
  await expect(page.locator('.transcript-inner .confirmation-record')).toHaveAttribute('data-outcome', 'allowed')
  // 芯片从待确认变已修改(与文件栏 / 文件树同一条派生规则)。
  await expect(panel.locator('.file-panel__chip')).toHaveAttribute('data-state', 'modified')
  await expect(page.locator('.entry-row', { hasText: AFFECTED_ENTRY }).locator(CHIP)).toHaveAttribute('data-state', 'modified')
})

test('文件面板:文件栏 tab 带状态芯片;面板打开时「回到底部」不被遮挡', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 700 })
  await login(page)
  await waitForStable(page)
  await openSidebarIfNarrow(page, 768)
  await clickFileRow(page, README)
  await closeSidebarIfOpen(page)
  // 文件栏 tab 带上文件树里的状态芯片(README 是 modified)。
  const chip = page.locator(`${FILE_TAB} .file-tab__chip`)
  await expect(chip).toHaveCount(1)
  await expect(chip).toHaveAttribute('data-state', 'modified')
  await expect(chip).toHaveText('已修改')

  // 面板打开时把转录上滚,让「回到底部」出现 —— 它必须落在面板**之下**(不被遮挡),
  // 且与输入框、文件栏三者纵向互不相交。
  await page.getByRole('log').focus()
  await page.keyboard.press('Home')
  const button = page.getByRole('button', { name: '回到底部' })
  await expect(button).toBeVisible()
  const buttonBox = await button.boundingBox()
  const panelBox = await page.locator(FILE_PANEL).boundingBox()
  const formBox = await page.locator('.composer-form').boundingBox()
  const barBox = await page.locator(FILE_BAR).boundingBox()
  expect(buttonBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  expect(formBox).not.toBeNull()
  expect(barBox).not.toBeNull()
  if (buttonBox === null || panelBox === null || formBox === null || barBox === null) return
  console.log(`[file panel occlude] 按钮顶 ${buttonBox.y.toFixed(1)} / 面板底 ${(panelBox.y + panelBox.height).toFixed(1)} / 输入框顶 ${formBox.y.toFixed(1)} / 文件栏顶 ${barBox.y.toFixed(1)}`)
  // 面板底边 ≤ 按钮顶边 → 按钮完整露在面板之外(不被遮挡)。
  expect(panelBox.y + panelBox.height, '面板不遮「回到底部」').toBeLessThanOrEqual(buttonBox.y + 1)
  // 三者纵向不相交:回到底部 → 输入框 → 文件栏,自上而下。
  expect(buttonBox.y + buttonBox.height, '回到底部不覆盖输入框').toBeLessThanOrEqual(formBox.y + 1)
  expect(formBox.y + formBox.height, '输入框不覆盖文件栏').toBeLessThanOrEqual(barBox.y + 1)
})

// ============================================================================
// 本轮新增:① 窗体 header 做薄(≈40px)且同时是拖拽手柄;② 窗体可拖动 / 可缩放
// (APG Window Splitter);③ 文件栏常驻;④ 文件栏按**项目**共享 + 最近打开跨项目分组。
// ============================================================================

// 面板的几何(视口坐标系 —— 它是 position: fixed 的浮动窗口,可在浏览器可显示区域任意位置拖动)。
function panelRectInArea(page: Page): Promise<Rect> {
  return page.evaluate(() => {
    const element = document.querySelector('.file-panel')
    if (!(element instanceof HTMLElement)) return { x: 0, y: 0, width: 0, height: 0 }
    const b = element.getBoundingClientRect()
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  })
}

// 视口尺寸(= 面板的钳制边界)。
function transcriptAreaRect(page: Page): Promise<Rect> {
  return page.evaluate(() => ({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }))
}

// 面板的外边距(--dl-space-6,与组件里的钳制口径同值)。
const PANEL_MARGIN = 24

// 按住某点拖到目标点(真实指针事件)。
async function dragFromTo(page: Page, fromX: number, fromY: number, dx: number, dy: number): Promise<void> {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(fromX + dx, fromY + dy, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(120)
}

// 等面板几何落定再断言:样式写入是同步的,但**布局**要到下一帧才反映(实测 Chromium 紧接按键
// 读 rect 会读到上一帧;WebKit 在大步长拖动后也会读到过渡态),故几何断言一律用 expect.poll。
async function expectPanelRect(
  page: Page,
  expected: { x?: number; y?: number; width?: number; height?: number },
  label: string,
): Promise<void> {
  if (expected.x !== undefined) await expect.poll(async () => (await panelRectInArea(page)).x, { message: `${label}: x` }).toBeCloseTo(expected.x, 0)
  if (expected.y !== undefined) await expect.poll(async () => (await panelRectInArea(page)).y, { message: `${label}: y` }).toBeCloseTo(expected.y, 0)
  if (expected.width !== undefined) await expect.poll(async () => (await panelRectInArea(page)).width, { message: `${label}: 宽` }).toBeCloseTo(expected.width, 0)
  if (expected.height !== undefined) await expect.poll(async () => (await panelRectInArea(page)).height, { message: `${label}: 高` }).toBeCloseTo(expected.height, 0)
}

test('文件面板标题栏:40px 薄头、内部不换行、内容区不小于所需', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickFileRow(page, README)
  const panel = page.locator(FILE_PANEL)
  const header = panel.locator('.file-panel__meta')
  const headerBox = await header.boundingBox()
  const panelBox = await panel.boundingBox()
  const bodyBox = await panel.locator('.file-panel__body').boundingBox()
  expect(headerBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  expect(bodyBox).not.toBeNull()
  if (headerBox === null || panelBox === null || bodyBox === null) return
  console.log(`[panel header] 高 ${headerBox.height.toFixed(1)} / 宽 ${headerBox.width.toFixed(1)} / 内容区高 ${bodyBox.height.toFixed(1)}`)
  // 薄头:恰 40px(一档控件 32 + 上下各 4)。
  expect(Math.abs(headerBox.height - 40), '标题栏高 = 40').toBeLessThanOrEqual(1)
  // 内部元素**共线**(不换行):所有子块的中心 y 相同。
  const centers = await header.evaluate((element) => [...element.children].map((child) => {
    const rect = child.getBoundingClientRect()
    return Number((rect.y + rect.height / 2).toFixed(1))
  }))
  console.log(`[panel header] 子块中心 y ${JSON.stringify(centers)}`)
  expect(new Set(centers).size, '标题栏内部元素共线(不换行)').toBe(1)
  // 内容区 = 面板高 − 标题栏高 − 上下描边(头变薄只会让内容区更大,不会更小)。
  const expectedBody = panelBox.height - headerBox.height - 2
  expect(Math.abs(bodyBox.height - expectedBody), '内容区高 = 面板高 − 标题栏高 − 描边').toBeLessThanOrEqual(2)
  expect(bodyBox.height, '内容区仍够放一个文件').toBeGreaterThan(200)
  // 标题栏是**一条 40px 工具栏**:行内控件走密集档(分段 24 / 换行与关闭 32),
  // 判据是 WCAG 2.5.8 的间距替代方案(横向排布下中心距远大于 24,天然成立)。
  const sizes = await header.evaluate((element) => {
    const read = (selector: string): { w: number; h: number } | null => {
      const el = element.querySelector(selector)
      if (!(el instanceof HTMLElement)) return null
      const rect = el.getBoundingClientRect()
      return { w: rect.width, h: rect.height }
    }
    return { view: read('.file-panel__view'), toggle: read('.file-panel__toggle'), close: read('.file-panel__close') }
  })
  console.log(`[panel header] 控件尺寸 ${JSON.stringify(sizes)}`)
  expect(sizes.view?.h ?? 0, '视图分段按钮 = 24(密集档)').toBeLessThanOrEqual(25)
  expect(sizes.toggle?.h ?? 0, '换行钮 = 32').toBeGreaterThanOrEqual(31)
  expect(sizes.toggle?.h ?? 0, '换行钮 = 32').toBeLessThanOrEqual(33)
  expect(sizes.close?.h ?? 0, '关闭钮 = 32').toBeGreaterThanOrEqual(31)
  expect(sizes.close?.h ?? 0, '关闭钮 = 32').toBeLessThanOrEqual(33)
})

test('文件面板拖动:位置改变、四边钳进转录区、双击复位默认几何、方向键移动', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickFileRow(page, README)
  const header = page.locator('.file-panel__meta')
  const reset = await panelRectInArea(page)
  const area = await transcriptAreaRect(page)
  console.log(`[panel drag] 默认几何 ${JSON.stringify(reset)} / 视口 ${JSON.stringify(area)}`)

  // ① 拖动改变位置。
  let box = await header.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return
  await dragFromTo(page, box.x + box.width / 2, box.y + box.height / 2, 40, 40)
  const moved = await panelRectInArea(page)
  console.log(`[panel drag] 拖 +40,+40 → ${JSON.stringify(moved)}`)
  await expectPanelRect(page, { x: reset.x + 40, y: reset.y + 40, width: reset.width }, '拖动 +40,+40')

  // ② 向四边拖出界 → 被钳回(临界值:0 与 区域 − 尺寸)。
  box = await header.boundingBox()
  if (box === null) return
  await dragFromTo(page, box.x + box.width / 2, box.y + box.height / 2, -3000, -3000)
  const clampedTopLeft = await panelRectInArea(page)
  console.log(`[panel drag] 拖 -3000,-3000 → ${JSON.stringify(clampedTopLeft)}`)
  await expectPanelRect(page, { x: PANEL_MARGIN, y: PANEL_MARGIN }, '向左上拖出界被钳回视口内边距')
  expect(clampedTopLeft.width, '钳制不改尺寸').toBeCloseTo(reset.width, 0)
  box = await header.boundingBox()
  if (box === null) return
  await dragFromTo(page, box.x + box.width / 2, box.y + box.height / 2, 3000, 3000)
  const clampedBottomRight = await panelRectInArea(page)
  console.log(`[panel drag] 拖 +3000,+3000 → ${JSON.stringify(clampedBottomRight)}`)
  // 钳制口径是「浏览器可显示区域」= 布局视口;两个引擎对经典滚动条的算法不同(实测差 9px),
  // 故这里断言**钳到边缘这一事实**(右 / 下缘贴住视口内边距,容差一档滚动条宽度),不写死像素。
  const live = await transcriptAreaRect(page)
  const rightEdge = clampedBottomRight.x + clampedBottomRight.width
  const bottomEdge = clampedBottomRight.y + clampedBottomRight.height
  console.log(`[panel drag] 右缘 ${rightEdge.toFixed(1)} / 视口右缘内边距 ${(live.width - PANEL_MARGIN).toFixed(1)} · 下缘 ${bottomEdge.toFixed(1)} / 视口下缘内边距 ${(live.height - PANEL_MARGIN).toFixed(1)}`)
  expect(rightEdge, '右缘不越出视口').toBeLessThanOrEqual(live.width - PANEL_MARGIN + 1)
  expect(rightEdge, '右缘确实贴到视口').toBeGreaterThanOrEqual(live.width - PANEL_MARGIN - 16)
  expect(bottomEdge, '下缘不越出视口').toBeLessThanOrEqual(live.height - PANEL_MARGIN + 1)
  expect(bottomEdge, '下缘确实贴到视口').toBeGreaterThanOrEqual(live.height - PANEL_MARGIN - 16)

  // 可拖出对话面板:把面板拖到侧栏上方(视口左缘)仍然成立 —— 范围是**整个视口**,不再是对话面板内部。
  const conversationBox = await page.locator('.conversation').boundingBox()
  expect(conversationBox).not.toBeNull()
  if (conversationBox !== null) {
    box = await header.boundingBox()
    if (box === null) return
    await dragFromTo(page, box.x + box.width / 2, box.y + box.height / 2, -3000, 0)
    const outsideConversation = await panelRectInArea(page)
    console.log(`[panel drag] 拖到视口左缘 → ${JSON.stringify(outsideConversation)} / 对话面板左缘 ${conversationBox.x.toFixed(1)}`)
    await expectPanelRect(page, { x: PANEL_MARGIN }, '可拖到视口左缘(越出对话面板)')
    expect(outsideConversation.x, '确实越出了对话面板').toBeLessThan(conversationBox.x)
  }

  // 视口收缩后**重新钳一次**(浮动窗口最经典的缺陷:视口变小后窗口留在界外)。
  box = await header.boundingBox()
  if (box === null) return
  await dragFromTo(page, box.x + box.width / 2, box.y + box.height / 2, 3000, 3000)
  await page.setViewportSize({ width: 900, height: 700 })
  await expect.poll(async () => {
    const rect = await panelRectInArea(page)
    return rect.x + rect.width <= 900 - PANEL_MARGIN + 1 && rect.y + rect.height <= 700 - PANEL_MARGIN + 1
  }, { message: '视口收缩后窗口被重新钳入' }).toBe(true)
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })

  // ③ 双击标题栏 → 复位默认几何(实测值 = 打开时的默认几何)。
  await header.dblclick({ position: { x: 200, y: 20 } })
  await page.waitForTimeout(200)
  const restored = await panelRectInArea(page)
  console.log(`[panel drag] 双击复位 → ${JSON.stringify(restored)}`)
  await expectPanelRect(page, { x: reset.x, y: reset.y, width: reset.width, height: reset.height }, '双击复位默认几何')

  // ④ 键盘:方向键按步长移动,Shift 大步长。
  // 几何写入样式是同步的,但**布局**要到下一帧才反映出来(实测:紧接按键读 rect 会读到上一帧),
  // 故这里用 expect.poll 等它落定。
  await header.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expectPanelRect(page, { x: reset.x + 16, y: reset.y + 16 }, '方向键各移 16')
  const stepOnce = await panelRectInArea(page)
  console.log(`[panel drag] 方向键 +16 → ${JSON.stringify(stepOnce)}`)
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  const maxX = area.width - stepOnce.width - PANEL_MARGIN
  await expectPanelRect(page, { x: Math.min(stepOnce.x + 64, maxX), y: stepOnce.y + 64 }, 'Shift 大步长 64(必要时被视口右缘钳住)')
  console.log(`[panel drag] Shift+方向键 +64 → ${JSON.stringify(await panelRectInArea(page))}`)
})

test('文件面板缩放:四边分隔条按 APG、四角 44×44、拖动 / 方向键 / Home / End 与钳制', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickFileRow(page, README)
  const area = await transcriptAreaRect(page)
  const reset = await panelRectInArea(page)

  // ① 四角手柄实测 44×44(本仓触达下限);四边是 8px 的细条。
  const corners = await page.locator('.file-panel__resize--corner').evaluateAll((elements) => elements.map((el) => {
    const rect = el.getBoundingClientRect()
    return { w: rect.width, h: rect.height }
  }))
  console.log(`[panel resize] 四角 ${JSON.stringify(corners)}`)
  expect(corners.length, '四角手柄齐备').toBe(4)
  for (const corner of corners) {
    expect(corner.w, '角手柄宽 ≥44').toBeGreaterThanOrEqual(43.5)
    expect(corner.h, '角手柄高 ≥44').toBeGreaterThanOrEqual(43.5)
  }
  const edgeBox = await page.locator('.file-panel__resize--e').boundingBox()
  expect(edgeBox?.width ?? 0, '边条宽 ≈8').toBeLessThanOrEqual(9)

  // ② 分隔条的 ARIA:role / orientation / valuenow / min / max / controls。
  const east = page.locator('.file-panel__resize--e')
  await expect(east).toHaveAttribute('role', 'separator')
  await expect(east).toHaveAttribute('aria-orientation', 'vertical')
  await expect(east).toHaveAttribute('aria-controls', 'file-panel-body')
  await expect(east).toHaveAttribute('aria-valuemin', String(Math.round(PANEL_MIN_W)))
  await expect(east).toHaveAttribute('aria-valuemax', String(Math.round(area.width - 2 * PANEL_MARGIN)))
  const nowBefore = Number(await east.getAttribute('aria-valuenow'))
  console.log(`[panel resize] E aria valuenow ${nowBefore} min 320 max ${Math.round(area.width - 2 * PANEL_MARGIN)}`)
  expect(Math.abs(nowBefore - reset.width), 'aria-valuenow = 当前宽').toBeLessThanOrEqual(0.5)
  const south = page.locator('.file-panel__resize--s')
  await expect(south).toHaveAttribute('aria-orientation', 'horizontal')
  await expect(south).toHaveAttribute('aria-valuemax', String(Math.round(area.height - 2 * PANEL_MARGIN)))

  // ③ 拖四角:尺寸改变且在 min/max 内(临界值:最小 320×200,最大 = 转录区)。
  const se = await page.locator('.file-panel__resize--se').boundingBox()
  expect(se).not.toBeNull()
  if (se === null) return
  await dragFromTo(page, se.x + se.width / 2, se.y + se.height / 2, 120, 80)
  const bigger = await panelRectInArea(page)
  console.log(`[panel resize] SE 拖 +120,+80 → ${JSON.stringify(bigger)}`)
  await expectPanelRect(page, { width: reset.width + 120, height: reset.height + 80 }, 'SE 拖 +120,+80')
  const se2 = await page.locator('.file-panel__resize--se').boundingBox()
  if (se2 === null) return
  await dragFromTo(page, se2.x + se2.width / 2, se2.y + se2.height / 2, -3000, -3000)
  const minimum = await panelRectInArea(page)
  console.log(`[panel resize] SE 拖到极限 → ${JSON.stringify(minimum)}`)
  await expectPanelRect(page, { width: PANEL_MIN_W, height: PANEL_MIN_H }, '缩到最小(320×200)')
  const se3 = await page.locator('.file-panel__resize--se').boundingBox()
  if (se3 === null) return
  await dragFromTo(page, se3.x + se3.width / 2, se3.y + se3.height / 2, 3000, 3000)
  const maximum = await panelRectInArea(page)
  console.log(`[panel resize] SE 拖到最大 → ${JSON.stringify(maximum)}`)
  await expectPanelRect(page, { width: area.width - 2 * PANEL_MARGIN, height: area.height - 2 * PANEL_MARGIN }, '放大到视口上限')

  // ④ 方向键调整(±16)、Shift 大步长(±64)、Home / End 到最小 / 最大。
  // 先 Home 归到最小宽,免得「已经是最大宽、再向右无效」被误读成步长不对。
  await east.focus()
  await page.keyboard.press('Home')
  const base = Number(await east.getAttribute('aria-valuenow'))
  expect(base, 'Home 到最小').toBeCloseTo(PANEL_MIN_W, 0)
  await page.keyboard.press('ArrowRight')
  const step1 = Number(await east.getAttribute('aria-valuenow'))
  await page.keyboard.press('Shift+ArrowRight')
  const step2 = Number(await east.getAttribute('aria-valuenow'))
  console.log(`[panel resize] E 方向键 ${base} → ${step1} → ${step2}`)
  expect(Math.abs(step1 - base - 16), '方向键步长 16').toBeLessThanOrEqual(0.5)
  expect(Math.abs(step2 - step1 - 64), 'Shift 大步长 64').toBeLessThanOrEqual(0.5)
  await page.keyboard.press('End')
  expect(Number(await east.getAttribute('aria-valuenow')), 'End 到最大').toBeCloseTo(Math.round(area.width - 2 * PANEL_MARGIN), 0)
  // aria-valuenow 随缩放更新(before / after 不同,且与渲染尺寸一致)。
  await expect.poll(async () => {
    const rect = await panelRectInArea(page)
    return Math.abs(Number(await east.getAttribute('aria-valuenow')) - rect.width)
  }, { message: 'aria-valuenow 与渲染宽一致' }).toBeLessThanOrEqual(1)
})

test('文件栏跨项目 / 跨会话共享:换会话、换项目都不清空', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await pinFileRow(page, README)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)

  // 换会话(同项目)→ 文件栏不变。
  await clickTab(page, HEADINGS['zh-CN'].roadmap)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator(`${FILE_TAB}[data-file-path="README.md"]`), '换会话后文件栏不变').toHaveCount(1)

  // 换项目(knowledge-base,同 Agent 的第二个项目)→ **也不清空**(打开集是全局的)。
  await page.locator('.project-item', { hasText: PROJECT_NAMES.planning[1] }).locator('.project-row__button').click()
  await waitForStable(page, 'empty')
  await expect(page.locator(`${FILE_TAB}[data-file-path="README.md"]`), '换项目后文件栏不变').toHaveCount(1)
  await expect(page.locator(`${FILE_TAB}[data-file-path="README.md"] .file-tab__project`), 'tab 上仍标着它自己的项目').toHaveText(PROJECT_NAMES.planning[0])

  // 在第二个项目里再开一个文件 → 栏里同时含两个项目的文件,两两可区分。
  const tree = page.locator('.project-item', { hasText: PROJECT_NAMES.planning[1] }).locator('.project-tree')
  await tree.locator('.entry-row[data-kind="directory"]', { hasText: 'docs' }).first().locator('.entry-row__button').click()
  await pinFileRow(page, 'index.md')
  await expect(page.locator(FILE_TAB)).toHaveCount(2)
  const labels = await page.locator(`${FILE_TAB} .file-tab__project`).evaluateAll((elements) => elements.map((el) => el.textContent))
  console.log(`[file bar] 跨项目 tab 出处 ${JSON.stringify(labels)}`)
  expect(labels, '每个 tab 显示自己的项目名').toEqual([PROJECT_NAMES.planning[0], PROJECT_NAMES.planning[1]])
})

test('最近打开:跨项目分组、两段式行、点其它项目的行直接打开且不切换当前项目', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // weekly-report 里开两个再全关掉(留进「最近打开」)。
  await pinFileRow(page, README)
  await pinFileRow(page, PROGRESS)
  for (let index = 0; index < 2; index += 1) {
    await page.locator('.file-tab-slot').first().hover()
    await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  }
  await expect(page.locator(FILE_TAB)).toHaveCount(0)
  // 切到写作助手的 product-docs:开一个再关掉,另开一个留在栏上。
  await page.locator(`${AGENT_SELECTOR}__trigger`).click()
  await page.locator(`${AGENT_SELECTOR}__option`, { hasText: AGENT_NAMES['zh-CN'].writing }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await pinFileRow(page, AFFECTED_ENTRY)
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await pinFileRow(page, 'release-plan.csv')
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  // 遥测条的项目名是异步取的:先等它落定再采样(否则会采到上一个项目的残值)。
  await expect(page.locator('.telemetry__ws-name')).toHaveText(PROJECT_NAMES.writing[0])
  const projectBefore = await page.locator('.telemetry__ws-name').innerText()

  await page.locator('.file-bar__trigger').click()
  await expect(page.locator('.file-bar__panel')).toBeVisible()
  const titles = await page.locator('.file-bar__group-title').allTextContents()
  console.log(`[recent menu] 分组 ${JSON.stringify(titles)}`)
  expect(titles, '先「本项目」再「其它项目」').toEqual(['本项目', '其它项目'])

  // 行一律两段式:主行文件名、次行「项目 › 目录路径」。
  const otherRow = page.locator('.file-bar__group').nth(1).locator('.file-bar__row', { hasText: README })
  await expect(otherRow.locator('.file-bar__row-name')).toHaveText(README)
  const otherDesc = await otherRow.locator('.file-bar__row-path').innerText()
  console.log(`[recent menu] 其它项目次行 ${JSON.stringify(otherDesc)}`)
  expect(otherDesc, '次行含「项目 › 路径」').toContain(`${PROJECT_NAMES.planning[0]} ›`)
  const currentDesc = await page.locator('.file-bar__group').first().locator('.file-bar__row-path').first().innerText()
  console.log(`[recent menu] 本项目次行 ${JSON.stringify(currentDesc)}`)
  expect(currentDesc, '本项目组次行也是两段式').toContain(`${PROJECT_NAMES.writing[0]} ›`)

  // 点其它项目的行 → **直接打开该文件,当前项目不变**(跨项目打开是阅读动作,不带来导航)。
  await otherRow.click()
  await expect(page.locator('.file-bar__panel')).toHaveCount(0)
  await expect(page.locator('.file-panel__path')).toHaveText(README)
  await expect(page.locator('.file-panel__project')).toHaveText(PROJECT_NAMES.planning[0])
  const projectAfter = await page.locator('.telemetry__ws-name').innerText()
  console.log(`[recent menu] 当前项目 ${JSON.stringify([projectBefore, projectAfter])}`)
  expect(projectAfter, '当前项目不变').toBe(projectBefore)
  await expect(page.locator(`${AGENT_SELECTOR}__trigger`)).toHaveAttribute('aria-label', AGENT_NAMES['zh-CN'].writing)
  // 跨项目打开不提供写动作:待确认那条不渲染。
  await expect(page.locator('.file-panel__confirm')).toHaveCount(0)
})
