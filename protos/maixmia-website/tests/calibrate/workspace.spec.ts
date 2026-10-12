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
// Agent 栏(工作台底栏)与它的元素约定:标签是 role=tab 的原生 button;放不下时收进右侧 ▾
// 菜单(手写 disclosure,选项同样是原生 button —— 本仓的 NDropdown 选项无 tabindex、键盘不可用)。
const AGENT_BAR = '.agent-bar'
const AGENT_TAB = '.agent-bar__tab'
const AGENT_TRIGGER = '.agent-bar__trigger'
const AGENT_PANEL = '#agent-bar-panel'
// 当前 Agent 的标签(整宽底栏里那枚描边标签);某个 Agent 被收进 ▾ 菜单时它不在条上。
function agentTab(page: Page, agent: 'planning' | 'research' | 'writing'): Locator {
  return page.locator(`${AGENT_TAB}[data-agent="${agent}"]`)
}
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

// 选中某个 Agent:先点底栏上可见的那枚标签;该标签被收进溢出菜单时(窄屏),点 ▾ 再点菜单里那一项。
// 迁自原先「点选择器触发钮 → 点下拉选项」的两条式写法 —— 选择从侧栏的下拉搬到了底栏的标签条。
async function selectAgent(page: Page, name: string): Promise<void> {
  const tab = page.locator(AGENT_TAB, { hasText: name })
  if (await tab.count() > 0) {
    await tab.click()
    return
  }
  await page.locator(AGENT_TRIGGER).click()
  await page.locator(`${AGENT_PANEL} .agent-bar__option`, { hasText: name }).click()
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
  // 输入框 id / name 按**会话**唯一(workspace-composer-<sessionId>),不再是一个固定的全局 id。
  await expect(input).toHaveAttribute('id', /^workspace-composer-/)
  await expect(input).toHaveAttribute('name', /^workspace-composer-/)
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
    await expect(page.getByRole('textbox', { name: /与「.+」对话/ })).toBeVisible()
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
    //   ③ tab 上的关闭钮(.tab-close)与拆出钮(.tab-pop)—— tab 行内的密集控件档(24px),同属第三档例外;
    //      (拆出钮是本轮新增:拖拽之外的非拖拽通路 WCAG 2.5.7,与关闭钮同排、同档。)
    //   ④ **文件栏**(顶部那条横向密集行)的行内控件:tab / ▾ 菜单钮 / tab 关闭钮 —— 同为横向
    //      密集行,判据同上(它常驻渲染,故必须排除,否则这条断言会在无文件时也红);
    //   ⑤ **文件面板标题栏**的行内控件:视图分段(24)/ 换行钮与关闭钮(32)/ 悬浮↔停靠钮(32)
    //      —— 它们是那条 40px 工具栏的行内控件,横向排布的间距判据天然成立。三类例外的完整判据
    //      分别在「侧栏密集行触达」「会话头 tab 条」「文件栏几何」「文件面板标题栏」用例里逐条核对。
    //   ⑥ **Agent 栏**(底栏那条横向密集行)的行内控件:标签与溢出 ▾(同为 32)—— 同属横向密集行,
    //      判据同上;它常驻渲染,故必须排除(见「Agent 栏几何」用例里逐条核对)。
    const dimensions = await page.locator('.workspace-page button:visible:not(.entry-row__button):not(.conversation-tab):not(.conversation-icon-button):not(.tab-close):not(.tab-pop):not(.file-tab):not(.file-tab-close):not(.file-bar__trigger):not(.file-panel__view):not(.file-panel__toggle):not(.file-panel__placement):not(.file-panel__reset):not(.file-panel__close):not(.agent-bar__tab):not(.agent-bar__trigger)').evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    for (const dimensionsItem of dimensions) {
      expect(dimensionsItem.width).toBeGreaterThanOrEqual(44)
      expect(dimensionsItem.height).toBeGreaterThanOrEqual(44)
    }
    // Agent 选择在**常驻的底栏**(Agent 栏),所有宽度下都可见;当前项标在规划助手那枚标签上。
    // ≤1023 侧栏收成抽屉,由「打开侧栏」按钮进入;≥1024 是常驻面板,直接可见项目区
    // (侧栏已只剩项目区 —— Agent 选择器不再住在里面,见下方「Agent 栏」用例组的负向断言)。
    await expect(agentTab(page, 'planning')).toHaveAttribute('aria-selected', 'true')
    if (width < 1024) {
      await expect(page.getByRole('button', { name: '打开侧栏' })).toBeVisible()
    } else {
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
      // 空位占位**不含输入坞**(没有窗体就没有输入框);error 态落在装载那段对话上,有输入框。
      if (state === 'empty') await expect(page.locator('.composer-dock'), '空位占位没有输入坞').toHaveCount(0)
      if (width === 375 && state === 'error') await expectComposerUnclipped(page)
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
        // 建议卡已下线:空位占位只剩问候语,没有任何可点的次级入口。
        await expect(page.locator('.suggestion-card')).toHaveCount(0)
        await expect(page.locator('.suggestions')).toHaveCount(0)
        await expect(page.getByRole('log').getByRole('heading').first()).toBeVisible()
        await expect(page.getByRole('log')).toContainText('一舟，今天一起完成什么？')
        // 空位占位**没有输入坞**(见上方断言),故「输入框为空」改由「新对话不再被卡片预填」来验:
        // 点区域 ＋ 建一段新会话 → 输入框必为空。这也替换了原先「点卡片 → 输入框出现建议正文」那条链。
        await page.getByRole('button', { name: '新建对话', exact: true }).click()
        await expect(page.getByRole('textbox', { name: /与「.+」对话/ })).toHaveValue('')
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

    // 回归护栏:内缩 8 + 侧栏内边距 16 = 24 = 外壳 gutter,故侧栏内容与顶栏品牌左缘同在
    // 24px 竖线上(1px 容差吸收面板 1px 描边)。原先承担这条对齐关系的是侧栏里的 Agent 切换器,
    // 它搬到底栏之后改由**项目区**承担(侧栏内边距不变,内容左缘不动)。
    const projects = await page.locator('.workspace-projects').boundingBox()
    const brand = await page.locator('.site-header__brand').boundingBox()
    const sidebarContentLeft = await page.locator('.workspace-sidebar').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.x + (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.paddingInlineStart) || 0)
    })
    expect(projects).not.toBeNull()
    expect(brand).not.toBeNull()
    if (projects === null || brand === null) return
    expect(Math.abs(brand.x - CHROME_GUTTER)).toBeLessThanOrEqual(1)
    expect(Math.abs(projects.x - sidebarContentLeft), '侧栏内容左缘 = 面板内边距处').toBeLessThanOrEqual(1)
    expect(Math.abs(projects.x - brand.x), '侧栏内容与品牌同一条竖线').toBeLessThanOrEqual(1)
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
    // ＋ 紧贴**条尾的最后一个东西** —— 文件那一组插在 tablist 与 ＋ 之间后,「紧贴 tablist」不再成立;
    // 不断言的对象换成「谁在 ＋ 前面」,间距仍应恰是一个 gap。
    const beforePlus = await newChat.evaluate((el) => {
      const previous = el.previousElementSibling
      return previous === null ? null : previous.getBoundingClientRect().right
    })
    expect(beforePlus, '＋ 前面有内容(文件组)').not.toBeNull()
    if (beforePlus !== null) {
      const tailGap = plusBox.x
      console.log(`[conversation-tabs] ${width}px → ＋ 与前一元素的间距 ${(tailGap - beforePlus).toFixed(1)}(期望 ${headingGap})`)
      expect(Math.abs(tailGap - beforePlus - headingGap), '＋ 紧贴前一元素(间距 = 一个 gap)').toBeLessThanOrEqual(1)
    }
    // 而「先对话、后文件」的次序本身也要立得住:文件组恰在 tablist 之后。
    const fileGroupX = await page.locator(FILE_BAR).boundingBox()
    expect(fileGroupX, '文件组有几何盒').not.toBeNull()
    if (fileGroupX !== null) expect(fileGroupX.x, '文件组在对话 tablist 之后').toBeGreaterThanOrEqual(stripBox.x + stripBox.width - 1)

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
  // 本轮:tab 上多了「拆出」钮(拖拽之外的非拖拽通路,WCAG 2.5.7),故 aria-actions 由**两个** id
  // 组成(拆出 + 关闭)—— 断言因此从「等于关闭钮 id」改为「包含关闭钮 id,且每个 id 都指向存在的元素」。
  const mapping = await slots.evaluateAll((elements) => elements.map((slot) => {
    const tab = slot.querySelector('[role="tab"]')
    const close = slot.querySelector('.tab-close')
    const pop = slot.querySelector('.tab-pop')
    return {
      tabId: tab?.id ?? '',
      actions: tab?.getAttribute('aria-actions') ?? '',
      closeId: close?.id ?? '',
      closeLabel: close?.getAttribute('aria-label') ?? '',
      popId: pop?.id ?? '',
      popLabel: pop?.getAttribute('aria-label') ?? '',
      // tab 的 title 现在追加了状态词(鼠标提示),不再等于纯会话标题;这里取**可见标签文字**
      // (= 会话标题)来核对关闭钮的可访问名含对应标题。
      title: tab?.querySelector('.conversation-tab__label')?.textContent ?? '',
    }
  }))
  for (const item of mapping) {
    expect(item.actions, 'tab 有 aria-actions').not.toBe('')
    expect(item.actions.split(' '), 'aria-actions 指向关闭钮').toContain(item.closeId)
    expect(item.actions.split(' '), 'aria-actions 指向拆出钮').toContain(item.popId)
    expect(item.closeId, '关闭钮 id 与 tab id 一一对应').toBe(`conversation-close-${item.tabId.replace('conversation-tab-', '')}`)
    expect(item.closeLabel, '关闭钮 aria-label 含对应标题').toContain(item.title)
    expect(item.popLabel, '拆出钮 aria-label 含对应标题').toContain(item.title)
    for (const actionId of item.actions.split(' ')) {
      expect(await page.locator(`#${actionId}`).count(), `aria-actions 指向的元素 ${actionId} 存在`).toBe(1)
    }
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

// 关掉活动 tab:相邻项(优先右侧)接管;只剩一个 tab 时**关闭钮仍在**(每块区域功能完全一样,
// 关闭钮不再随数量消失),关掉最后一个 tab → 根区域既无成员又无子区域 → 引导页。
test('关闭活动 tab:相邻项(优先右侧)接管;只剩一个时关闭钮仍在,关掉最后一个 → 引导页', async ({ page }) => {
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
  // 继续关掉末尾的 tab,直到只剩一个打开项。
  for (let remaining = SESSIONS_IN_DEFAULT_PROJECT - 1; remaining > 1; remaining -= 1) {
    const lastSlot = page.locator('.tab-slot').last()
    await lastSlot.hover()
    await lastSlot.locator('.tab-close').click()
    await expect(page.locator('.tab-slot')).toHaveCount(remaining - 1)
  }
  await expect(page.locator('.tab-slot'), '条上仍有一个打开项').toHaveCount(1)
  // 语义已反转:只剩一个 tab 时关闭钮**仍在**(不再「只剩一个就没有关闭钮」)。
  await expect(closes, '只剩一个 tab 时关闭钮仍在').toHaveCount(1)
  // 关掉最后一个 tab → 根区域成员清空 → 引导页(全页没有任何转录,故 role="log" 为 0)。
  await page.locator('.tab-slot').first().hover()
  await closes.click()
  await expect(page.locator('.onboarding'), '关掉最后一个 tab → 引导页').toHaveCount(1)
  await expect(page.getByRole('log'), '引导页不是转录').toHaveCount(0)
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
  await selectAgent(page, AGENT_NAMES['zh-CN'].writing)
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
  await selectAgent(page, AGENT_NAMES['zh-CN'].writing)
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
      if (state === 'empty') await expect(page.locator('.composer-dock'), '空位占位没有输入坞').toHaveCount(0)
      else await expectComposerUnclipped(page)
      if (state === 'empty') await expectEmptyAtTop(page)
      await expect(page).toHaveScreenshot(`workspace-${state}-375-en.png`, { fullPage: true })
      if (state === 'empty') await expectEmptyAtTop(page)
      else await expectComposerUnclipped(page)
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
        // 窄屏侧栏是抽屉:打开后只余项目区(Agent 选择已搬到常驻的底栏),且打开抽屉仍不横向溢出。
        await page.getByRole('button', { name: 'Open sidebar' }).click()
        await expect(page.getByRole('dialog', { name: 'Agent workspace' })).toBeVisible()
        await expect(page.locator('.workspace-sidebar .agent-bar'), '侧栏里不再有 Agent 选择').toHaveCount(0)
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
      } else {
        // 英文 Agent 名(最长的本地化文案)在标签里不截断。
        expect(await agentTab(page, 'planning').locator('.agent-bar__name').evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
      }
      // Agent 栏在所有宽度下都在(它是外壳第三行的常驻底栏)。
      await expect(page.locator(AGENT_BAR)).toBeVisible()
    })
  }
})

test('键盘发送、Enter 空草稿不发送、Shift+Enter 与输入框自动增高', async ({ page }) => {
  await login(page)
  await waitForStable(page)
  const input = page.getByRole('textbox', { name: /与「.+」对话/ })
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

// 「回到底部」= 坞内**唯一**仍绝对定位的悬浮件:它锚在坞顶之上、浮在转录区下缘那一带,
// 与坞的相对关系**不再建立在「坞是浮层」上**(坞现已并入面板流内)。
// 核心验收:按钮不覆盖坞(底边在坞顶边之上)、仍在坞顶之上、44×44 居中,且坞的停靠几何不受它影响。
for (const width of [375, 768]) {
  test(`回到底部悬浮钮 @${width}:不覆盖坞、仍在坞顶之上、居中、点击贴底`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await login(page)
    await waitForStable(page)
    const log = page.getByRole('log')
    const button = page.getByRole('button', { name: '回到底部' })
    await expect(button).toHaveCount(0)
    // 按钮出现前的坞几何:坞底边 = 面板内容盒底边(坞是面板的最后一个流内子项)。
    const before = await dockGeom(page)
    expect(before.dock).not.toBeNull()
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
    if (before.dock === null || measured === null) return
    const after = measured.dock
    const buttonBox = measured.button
    console.log(`[scroll-to-bottom] @${width} 坞高 ${before.dock.height.toFixed(1)}→${after.height.toFixed(1)} / 坞顶边 ${before.dock.y.toFixed(1)}→${after.y.toFixed(1)} / 按钮 ${buttonBox.width.toFixed(1)}×${buttonBox.height.toFixed(1)}`)
    // 坞是流内元素:按钮绝对定位,出现它不改变坞的几何(高度与顶边逐值相同,吸收亚像素)。
    expect(Math.abs(after.height - before.dock.height), '坞高度不变').toBeLessThanOrEqual(0.5)
    expect(Math.abs(after.y - before.dock.y), '坞顶边不变').toBeLessThanOrEqual(0.5)
    // 坞停靠几何:坞底边 == 面板内容盒底边。
    expect(Math.abs(after.y + after.height - before.panelContentBottom), '坞底边 == 面板内容盒底边').toBeLessThanOrEqual(1)
    // 按钮不覆盖坞:其底边在坞顶边之上(仍在坞顶之上)。
    console.log(`[scroll-to-bottom] @${width} 按钮底边 ${(buttonBox.y + buttonBox.height).toFixed(1)} / 坞顶边 ${after.y.toFixed(1)}`)
    expect(buttonBox.y + buttonBox.height, '按钮不覆盖坞(底边在坞顶边之上)').toBeLessThanOrEqual(after.y + 1)
    expect(buttonBox.y, '按钮确实在坞顶之上').toBeLessThan(after.y)
    // 44×44 独立控件(pill 圆形)。
    expect(buttonBox.width).toBeGreaterThanOrEqual(43.5)
    expect(buttonBox.width).toBeLessThanOrEqual(44.5)
    expect(buttonBox.height).toBeGreaterThanOrEqual(43.5)
    expect(buttonBox.height).toBeLessThanOrEqual(44.5)
    // 水平居中于坞(坞横跨面板宽、内限宽列居中,两者中心重合):不偏袒左右手。
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
    // 抽屉内容已只剩项目区(Agent 选择搬到了底栏):首个可聚焦控件是关闭钮 ×(窄屏才有),
    // 末个是「打开项目」(项目行里的 chevron / ⋯ 也是焦点停靠点,但都在两者之间)。
    // 圈定规则是「首个 ⇄ 末个」,故从首个 Shift+Tab 应落到抽屉内最后一个可聚焦控件上。
    const closeButton = dialog.locator('.sidebar-actions button')
    await expect(closeButton).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.locator('button:not(:disabled)').last()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(closeButton).toBeFocused()
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
  await page.getByRole('textbox', { name: /与「.+」对话/ }).fill('请帮我准备访谈提纲。')
  await page.getByRole('textbox', { name: /与「.+」对话/ }).press('Enter')
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
  // 「停止生成」只在流式期间存在,故这两条必须在流还没跑完前落定 —— 中间**不做慢操作**
  // (截图要编码整页 PNG,满载下可耗秒级,足以让 32ms/块的 mock 流先跑完,于是断言落在一个
  //  已经结束的流上:这正是此前满载抖动的机制)。截图因此移到停止之后,只作留档。
  await page.getByRole('log').hover()
  await page.mouse.wheel(0, -800)
  await expect(page.getByRole('button', { name: '回到底部' })).toBeVisible()
  const top = await page.getByRole('log').evaluate((element) => element.scrollTop)
  await expect.poll(async () => (await response.locator('.message-body').innerText()).length).toBeGreaterThan(100)
  expect(await page.getByRole('log').evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(top + 1)
  // 点停止前先确认按钮确实在(它随流结束消失);失败信息因此指向「流已跑完」而不是暧昧的 detached。
  const stopButton = page.getByRole('button', { name: '停止生成' })
  await expect(stopButton, '流式仍在进行(否则本用例的前提不成立)').toBeVisible()
  await stopButton.click()
  await page.screenshot({ path: testInfo.outputPath('stopped.png') })
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
  // 建议卡已下线:空态不再有「点卡片建会话并预填草稿」这条链。改用区域 ＋ 建一段空会话,
  // 再直接在输入框里打字发送 —— 替换的只是选一段话的方式,意图(空态发送回到常规路由)不变。
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await page.getByRole('textbox').fill('帮我把团队知识库整理工作拆成一周内可执行的计划。')
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
  const input = page.getByRole('textbox', { name: /与「.+」对话/ })
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

// 本需求的**核心不变量**:草稿按会话独立保存,且任何一次装载 / 切语言都不得丢掉它。
test('切语言不丢草稿:输入框内容按会话独立保存', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const input = page.getByRole('textbox', { name: /与「.+」对话/ })
  await input.fill('这段草稿必须活过切语言。')
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await page.getByRole('button', { name: /English/ }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  // 切语言只重取会话列表 / 转录 / 遥测;运行态(草稿)一个字段都不动。
  await expect(page.getByRole('textbox', { name: /Message to ".+"/ })).toHaveValue('这段草稿必须活过切语言。')
})

// 端到端主路径(项目维度):侧栏换 Agent → 项目区随之更换 → 对话栏新建会话 →
// 会话归属**当前项目**(项目挂在 Agent 上,agent 由项目反推,不存在两处对不上的可能)。
test('侧栏换 Agent → 项目区更换 → 新建会话归属当前项目', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const projects = page.locator('.workspace-projects')
  // 初始:规划助手 —— 底栏那枚标签即当前项;项目区是它的两个项目,当前项目 weekly-report 已默认展开。
  await expect(agentTab(page, 'planning')).toHaveAttribute('aria-selected', 'true')
  await expect(projects).toContainText(PROJECT_NAMES.planning[0])
  await expect(projects).toContainText(PROJECT_NAMES.planning[1])
  await expect(projects).not.toContainText(PROJECT_NAMES.writing[0])

  await selectAgent(page, AGENT_NAMES['zh-CN'].writing)
  await expect(agentTab(page, 'writing')).toHaveAttribute('aria-selected', 'true')
  await expect(agentTab(page, 'planning')).toHaveAttribute('aria-selected', 'false')
  // 项目区换成写作助手的项目;规划助手的项目消失。
  await expect(projects).toContainText(PROJECT_NAMES.writing[0])
  await expect(projects).toContainText(PROJECT_NAMES.writing[1])
  await expect(projects).not.toContainText(PROJECT_NAMES.planning[0])
  // 会话切到写作助手首个项目的会话(标题块显示它的首条会话)。
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator('.chat-message')).toHaveCount(2)
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(3)
  await closeSwitcher(page)

  // 新建对话 + 发送:新会话必须归属**当前项目**(product-docs)。
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await page.getByRole('textbox', { name: /与「.+」对话/ }).fill('请帮我写一段发布说明。')
  await page.getByRole('textbox', { name: /与「.+」对话/ }).press('Enter')
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('请帮我写一段发布说明。')
  await expect(page.locator('.conversation-tab', { hasText: '请帮我写一段发布说明。' })).toHaveAttribute('aria-selected', 'true')
  // 新会话进入 product-docs 的会话列表(knowledge + quarterly + release + 新会话 = 4),并排在最前。
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(4)
  await expect(page.locator('.session-item').first()).toContainText('请帮我写一段发布说明。')
})

// 底栏换 Agent:项目列表随之更换(断言具体项目名的出现 / 消失)。
test('侧栏切换 Agent:项目列表随之更换', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const projects = page.locator('.workspace-projects')
  // 侧栏含区标题 + 项目列表(每个 Agent 两个项目)。
  await expect(page.getByRole('button', { name: '关闭侧栏' })).toHaveCount(0)
  await expect(projects.locator('h2')).toHaveText('项目')
  await expect(projects.locator('.project-item')).toHaveCount(2)
  await selectAgent(page, AGENT_NAMES['zh-CN'].research)
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

// Agent 栏的键盘语义(与会话 tab 条同规则,APG Tabs):恰一个 tabindex="0"(roving tabindex),
// ←/→ 只移焦点**不切换**(切换要重取项目 / 会话 / 转录,自动激活会让按住方向键连拉一串请求),
// Home/End 到首 / 末项并回绕,Enter / Space 才激活。
test('Agent 栏键盘:roving tabindex 唯一、←/→ 只移焦点、Home/End、Enter 与 Space 激活', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // roving tabindex:恰一个 tabindex="0",落在当前 Agent 上。
  await expect(page.locator(`${AGENT_TAB}[tabindex="0"]`)).toHaveCount(1)
  await expect(agentTab(page, 'planning')).toHaveAttribute('tabindex', '0')
  await expect(page.locator(`${AGENT_TAB}[aria-selected="true"]`)).toHaveCount(1)

  await agentTab(page, 'planning').focus()
  await expect(agentTab(page, 'planning')).toBeFocused()
  // ←/→ 只移焦点,不切换 Agent(aria-selected 不动)。
  await page.keyboard.press('ArrowRight')
  await expect(agentTab(page, 'research')).toBeFocused()
  await expect(agentTab(page, 'planning'), '←/→ 不激活').toHaveAttribute('aria-selected', 'true')
  await agentTab(page, 'research').focus()
  await page.keyboard.press('End')
  await expect(agentTab(page, 'writing'), 'End 到末项').toBeFocused()
  await page.keyboard.press('Home')
  await expect(agentTab(page, 'planning'), 'Home 到首项').toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(agentTab(page, 'writing'), '← 从首项回绕到末项').toBeFocused()

  // Enter 激活聚焦项:研究助手成为当前项,项目区随之更换。
  await agentTab(page, 'research').focus()
  await page.keyboard.press('Enter')
  await expect(agentTab(page, 'research')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.workspace-projects')).toContainText(PROJECT_NAMES.research[0])

  // Space 同样激活。
  await agentTab(page, 'planning').focus()
  await page.keyboard.press('Space')
  await expect(agentTab(page, 'planning')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.workspace-projects')).toContainText(PROJECT_NAMES.planning[0])
})

// ---- Agent 栏 = 外壳第三行的整宽底栏 ----
// 本组覆盖:① 侧栏**不再**有 Agent 选择器(负向);② 标签是圆角矩形的**描边**标签(有描边、
// 背景不填色),当前项唯一且靠描边换色表达;③ 标签高 32(紧凑导航行档)、整条底栏高 50;
// ④ 放不下时收进右侧 ▾ 菜单,弹层落在**视口内 / 底栏之内**(旧写的「落在侧栏面板内」已随选择器
// 搬离侧栏而作废 —— 那不是换个选择器就能成立的断言);⑤ Agent 级 Badge 的聚合。
for (const width of [1280, 1600]) {
  test(`Agent 栏 @${width}:整宽底栏、描边标签、当前项唯一、栏高 50`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)

    // 负向:Agent 选择已从侧栏搬到这条底栏 —— 侧栏里不该再有它(标签条只在底栏那一处)。
    await expect(page.locator('.agent-selector')).toHaveCount(0)
    await expect(page.locator('.workspace-sidebar .agent-bar')).toHaveCount(0)

    // 整宽:底栏横跨侧栏左缘到对话面板右缘(外壳内缩 8)。
    const layoutViewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
    const dock = await page.locator('.agent-bar-dock').boundingBox()
    const sidebar = await page.locator('.workspace-sidebar').boundingBox()
    expect(dock).not.toBeNull()
    expect(sidebar).not.toBeNull()
    if (dock === null || sidebar === null) return
    expect(Math.abs(dock.x - SHELL_INSET), '底栏左缘 = 外壳内缩').toBeLessThanOrEqual(1)
    expect(Math.abs(dock.x + dock.width - (layoutViewportWidth - SHELL_INSET)), '底栏右缘 = 视口 − 外壳内缩').toBeLessThanOrEqual(1)
    // 高 50 = 标签 32 + 上下内边距各 8 + 上下描边各 1。
    expect(Math.abs(dock.height - 50), '底栏高 = 50').toBeLessThanOrEqual(1)
    // 内容内边距与侧栏内容对齐(两侧的内边距都是 16,故两者的内容左缘同在一条竖线上)。
    const sidebarContentLeft = await page.locator('.workspace-sidebar').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.x + (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.paddingInlineStart) || 0)
    })
    const firstTab = await agentTab(page, 'planning').boundingBox()
    expect(firstTab).not.toBeNull()
    if (firstTab !== null) expect(Math.abs(firstTab.x - sidebarContentLeft), '标签左缘 = 侧栏内容左缘(两边内边距同值)').toBeLessThanOrEqual(1)

    // 宽屏放得下三个标签 → 不出现溢出钮。
    await expect(page.locator(AGENT_TAB)).toHaveCount(3)
    await expect(page.locator(AGENT_TRIGGER)).toHaveCount(0)
    // 每个标签:role=tab 的原生 button、**有描边**、**背景不填色**(描边标签)、高 32。
    for (const tab of await page.locator(AGENT_TAB).all()) {
      await expect(tab).toHaveJSProperty('tagName', 'BUTTON')
      await expect(tab).toHaveAttribute('role', 'tab')
      const style = await tab.evaluate((element) => {
        const computed = getComputedStyle(element)
        return { border: computed.borderTopWidth, background: computed.backgroundColor, height: element.getBoundingClientRect().height }
      })
      console.log(`[agent tab] ${await tab.getAttribute('data-agent')} border ${style.border} / bg ${style.background} / h ${style.height.toFixed(1)}`)
      expect(Number.parseFloat(style.border), '标签有描边').toBeGreaterThanOrEqual(1)
      expect(style.background, '标签是描边而非填充:背景不铺色').toBe('rgba(0, 0, 0, 0)')
      expect(style.height, '标签高 = 32(紧凑导航行档)').toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
      expect(style.height, '标签高 = 32(紧凑导航行档)').toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
    }
    // 当前项唯一,且标在规划助手那枚标签上:描边换成青瓷色,背景**仍不铺色**。
    await expect(page.locator(`${AGENT_TAB}[aria-selected="true"]`)).toHaveCount(1)
    const current = await agentTab(page, 'planning').evaluate((element) => {
      const computed = getComputedStyle(element)
      return { border: computed.borderTopColor, background: computed.backgroundColor }
    })
    expect(current.border, '当前项用青瓷描边').toBe(await resolveToken(page, '--dl-accent'))
    expect(current.background, '当前项不铺填充底').toBe('rgba(0, 0, 0, 0)')
  })
}

// 窄屏放不下:末尾的 Agent 收进右侧 ▾ 菜单(手写 disclosure,选项是原生 button)。
// 弹层**向上弹**(底栏贴着视口底,向下会被裁),故断言它落在**视口内**、且横向落在**底栏之内**。
test('Agent 栏溢出 @375:▾ 列出被收起的 Agent、弹层落在视口内与底栏之内、Esc 还焦', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  await expect(page.locator(AGENT_TRIGGER)).toBeVisible()
  const visibleCount = await page.locator(AGENT_TAB).count()
  console.log(`[agent overflow] @375 可见标签 ${visibleCount} / 溢出钮 ${await page.locator(AGENT_TRIGGER).count()}`)
  expect(visibleCount, '窄屏放不下三个标签').toBeLessThan(3)
  // 当前项永远可见:被收起的是尾部那些,当前 Agent 不在其中。
  await expect(agentTab(page, 'planning')).toHaveCount(1)

  await page.locator(AGENT_TRIGGER).click()
  const panel = page.locator(AGENT_PANEL)
  await expect(panel).toBeVisible()
  const options = page.locator(`${AGENT_PANEL} .agent-bar__option`)
  await expect(options, '菜单列出被收起的 Agent').toHaveCount(3 - visibleCount)
  for (const option of await options.all()) await expect(option).toHaveJSProperty('tagName', 'BUTTON')

  // 弹层几何:落在视口内、横向落在底栏之内、在底栏之上(向上弹)。
  const panelBox = await panel.boundingBox()
  const dockBox = await page.locator('.agent-bar-dock').boundingBox()
  const layoutViewportWidth = await page.evaluate(() => document.documentElement.clientWidth)
  expect(panelBox).not.toBeNull()
  expect(dockBox).not.toBeNull()
  if (panelBox !== null && dockBox !== null) {
    console.log(`[agent overflow] panel ${panelBox.x.toFixed(1)}..${(panelBox.x + panelBox.width).toFixed(1)} / dock ${dockBox.x.toFixed(1)}..${(dockBox.x + dockBox.width).toFixed(1)} / 视口 ${layoutViewportWidth}`)
    expect(panelBox.x, '弹层左缘在视口内').toBeGreaterThanOrEqual(0)
    expect(panelBox.x + panelBox.width, '弹层右缘在视口内').toBeLessThanOrEqual(layoutViewportWidth + 1)
    expect(panelBox.x, '弹层左缘在底栏之内').toBeGreaterThanOrEqual(dockBox.x - 1)
    expect(panelBox.x + panelBox.width, '弹层右缘在底栏之内').toBeLessThanOrEqual(dockBox.x + dockBox.width + 1)
    expect(panelBox.y + panelBox.height, '弹层在底栏之上(向上弹)').toBeLessThanOrEqual(dockBox.y + 1)
    expect(await horizontalOverflow(page), '弹层不引入横向溢出').toBeLessThanOrEqual(1)
  }

  // 键盘打开:Enter 打开后焦点落在首项;Esc 关闭并把焦点还给 ▾。
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await page.locator(AGENT_TRIGGER).focus()
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await expect(options.first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.locator(AGENT_TRIGGER)).toBeFocused()

  // 从菜单选一个被收起的 Agent:它成为当前项(并因此永远可见),菜单收起。
  await page.locator(AGENT_TRIGGER).click()
  await expect(panel).toBeVisible()
  await page.locator(`${AGENT_PANEL} .agent-bar__option`, { hasText: AGENT_NAMES['zh-CN'].research }).click()
  await expect(panel).toHaveCount(0)
  await expect(agentTab(page, 'research')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.workspace-projects')).toContainText(PROJECT_NAMES.research[0])
})

test.describe('Agent 栏(英文窄屏)', () => {
  test.use({ locale: 'en-US' })

  test('375px 英文弹层落在视口与底栏之内;1280px 英文名不截断', async ({ page }) => {
    // 375:英文状态词最长(Response complete),弹层宽度是它的最坏情况 —— 仍须落在视口与底栏之内。
    await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
    await login(page, 'Sign in')
    await waitForStable(page, 'ready', enHeadingFor('ready'))
    await expect(page.locator(AGENT_TRIGGER)).toBeVisible()
    await page.locator(AGENT_TRIGGER).click()
    const panel = page.locator(AGENT_PANEL)
    await expect(panel).toBeVisible()
    const panelBox = await panel.boundingBox()
    const dockBox = await page.locator('.agent-bar-dock').boundingBox()
    const viewport = await page.evaluate(() => document.documentElement.clientWidth)
    expect(panelBox).not.toBeNull()
    expect(dockBox).not.toBeNull()
    if (panelBox !== null && dockBox !== null) {
      expect(panelBox.x, '英文弹层左缘在视口内').toBeGreaterThanOrEqual(0)
      expect(panelBox.x + panelBox.width, '英文弹层右缘在视口内').toBeLessThanOrEqual(viewport + 1)
      expect(panelBox.x, '英文弹层左缘在底栏之内').toBeGreaterThanOrEqual(dockBox.x - 1)
      expect(panelBox.x + panelBox.width, '英文弹层右缘在底栏之内').toBeLessThanOrEqual(dockBox.x + dockBox.width + 1)
    }
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)

    // 1280:三个标签全可见、无溢出钮;英文 Agent 名(最长的一档)完整不截断。
    // 只改窗口宽、不重新导航 —— 登录态只在内存里,`goto` 到同一个 hash 会真刷新一次并登出。
    await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
    await waitForStable(page, 'ready', enHeadingFor('ready'))
    await expect(page.locator(AGENT_TAB)).toHaveCount(3)
    await expect(page.locator(AGENT_TRIGGER)).toHaveCount(0)
    for (const name of Object.values(AGENT_NAMES.en)) {
      const label = page.locator(AGENT_TAB, { hasText: name }).locator('.agent-bar__name')
      expect(await label.evaluate((element) => element.scrollWidth - element.clientWidth), `${name} 不截断`).toBeLessThanOrEqual(1)
    }
  })
})

// ---- Agent 级 Badge 的聚合 ----
// 信号 = 该 Agent 名下、**未看过**的「等待交互」与「响应完成」会话数(listAgentSignals 按页面的
// 「已看过」集合算出)。两类并存取更紧急的一档(等待交互 > 响应完成);数量 > 1 时追加计数;
// 打开那段对话(它成为活动会话)即清除 —— 与 tab 上的状态 Badge 共用同一份「已看过」集合。
test('Agent Badge:等待交互优先于响应完成(两类并存取更紧急的一档)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const writingBadge = agentTab(page, 'writing').locator('.agent-bar__badge')
  // 常规态:写作助手名下有一条**未看过**的「响应完成」(release 会话)→ 成功档。
  await expect(writingBadge, '常规态:写作助手有未看过的响应完成').toHaveAttribute('data-level', 'success')
  await expect(writingBadge).toContainText('已完成')
  // 负向:研究助手只有一条「响应中」会话 → 无此类对话,不挂 Badge。
  await expect(agentTab(page, 'research').locator('.agent-bar__badge'), '无此类对话不挂 Badge').toHaveCount(0)

  // 等待态:写作助手名下**同时**有未看过的等待交互(quarterly)与响应完成(release)。
  await page.goto('/#/workspace?s=waiting')
  await waitForStable(page, 'ready', HEADINGS['zh-CN'].knowledge)
  await expect(writingBadge, '两类并存 → 取更紧急的等待交互').toHaveAttribute('data-level', 'warning')
  await expect(writingBadge).toContainText('待确认')

  // 点开等待中的 quarterly(它成为活动会话 → 视为已看过):等待信号清掉,而响应完成那条**还在**,
  // 于是 Badge 回落成成功档 —— 这一步同时证明「两类确实并存」与「并存时取等待交互」。
  await clickTab(page, QUARTERLY['zh-CN'])
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(writingBadge, '等待信号点开后清掉,落回仍在的响应完成信号').toHaveAttribute('data-level', 'success')
})

test('Agent Badge:数量 > 1 带计数、逐条点开后清除、不改变标签与底栏高度', async ({ page }) => {
  // 1600:默认项目 weekly-report 的 6 条会话全可见,「点开 roadmap / launch」两条都能点到。
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const planningTab = agentTab(page, 'planning')
  const badge = planningTab.locator('.agent-bar__badge')
  // 规划助手名下两条未看过的「响应完成」(roadmap / launch)→ 成功档 + 计数 2。
  await expect(badge).toHaveAttribute('data-level', 'success')
  await expect(badge.locator('.agent-bar__badge-count')).toHaveText('2')
  // Badge 不改变标签高 / 栏高:带 Badge 的标签与不带 Badge 的(研究助手)同高,底栏同为 50。
  const badgedHeight = (await planningTab.boundingBox())?.height ?? 0
  const plainHeight = (await agentTab(page, 'research').boundingBox())?.height ?? 0
  const dockHeight = (await page.locator('.agent-bar-dock').boundingBox())?.height ?? 0
  console.log(`[agent badge] 带 Badge 高 ${badgedHeight.toFixed(1)} / 无 Badge 高 ${plainHeight.toFixed(1)} / 底栏 ${dockHeight.toFixed(1)}`)
  expect(Math.abs(badgedHeight - plainHeight), 'Badge 不改变标签高').toBeLessThanOrEqual(0.5)
  expect(Math.abs(dockHeight - 50), '底栏高 50').toBeLessThanOrEqual(1)

  // 逐条点开:计数 2 → 1(只剩一条时不再带计数)→ 0(Badge 清除)。
  await clickTab(page, HEADINGS['zh-CN'].roadmap)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(badge.locator('.agent-bar__badge-count'), '只剩一条时不带计数').toHaveCount(0)
  await expect(badge).toContainText('已完成')
  await clickTab(page, HEADINGS['zh-CN'].launch)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(badge, '两条都看过 → Badge 清除').toHaveCount(0)
  expect(Math.abs(((await page.locator('.agent-bar-dock').boundingBox())?.height ?? 0) - 50), '清除后底栏高仍为 50').toBeLessThanOrEqual(1)
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

  // 状态项是 live region;遥测条里**只有它**一个(其余部分不抢 live)。
  // 整页的 role="status" 现在有**两处**,各管各的事:① 遥测条的状态项(本用例关心的那个);
  // ② 悬浮 ↔ 停靠的播报(.workspace-live,见「悬浮 ↔ 停靠的键盘通路与播报」用例)。
  const status = page.locator('.telemetry__status')
  await expect(status).toHaveAttribute('role', 'status')
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(page.locator('.telemetry [role="status"]'), '遥测条里只有一个 live region').toHaveCount(1)
  await expect(page.locator('.workspace-page [role="status"]'), '整页两处:遥测状态项 + 停靠播报').toHaveCount(2)

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
  const fill = page.locator('.telemetry__meter-fill')
  const accent = await resolveToken(page, '--dl-accent')
  for (const tier of CONTEXT_TIERS) {
    await selectAgent(page, tier.agent)
    await expect(page.locator('.telemetry__context-text')).toHaveText(tier.text)
    await expect(fill).toHaveAttribute('data-level', tier.level)
    const tokenColor = await resolveToken(page, tier.token)
    // 属性翻转与样式重算是两件事:改完属性立刻读计算样式,满载时可能读到上一档的颜色。
    // 用 poll 读到同色为止(不是放宽阈值,也不是 retry 掩盖 —— 目标值仍是精确的 token 值)。
    await expect
      .poll(async () => fill.evaluate((element) => getComputedStyle(element).backgroundColor), { message: `${tier.text} 的用量条取 ${tier.token}` })
      .toBe(tokenColor)
    const fillColor = await fill.evaluate((element) => getComputedStyle(element).backgroundColor)
    console.log(`[telemetry meter] ${tier.text} ${tier.level} → token ${tokenColor} / fill ${fillColor}`)
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
  const input = page.getByRole('textbox', { name: /与「.+」对话/ })
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
  await expect(page.locator('.sidebar-loading'), label).toHaveCount(0)
  // 用 toBeAttached 而非 toBeVisible:窄屏下侧栏是收起的抽屉,树在 DOM 里但不可见。
  await expect(page.locator('.project-tree .entry-row').first(), label).toBeAttached()
  const word = page.locator('.telemetry__word')
  const card = page.locator('.transcript-inner .confirmation-card')
  const chip = page.locator(`${CHIP}[data-state="pending"]`)
  // 空位占位**没有输入坞**(没有窗体就没有输入框)→ 遥测条整条不在,状态词无从谈起。
  const hasComposer = await page.locator('.composer-dock').count() > 0
  if (expectWaiting) {
    await expect(page.locator('.telemetry__item--context'), label).toBeVisible()
    await expect(word, label).toHaveText(WAITING_WORD)
    await expect(card, label).toHaveCount(1)
    await expect(chip, label).toHaveCount(1)
  } else {
    if (hasComposer) await expect(word, label).not.toHaveText(WAITING_WORD)
    await expect(card, label).toHaveCount(0)
    await expect(chip, label).toHaveCount(0)
  }
  return { word: hasComposer && (await word.innerText()) === WAITING_WORD, cards: await card.count(), chips: await chip.count() }
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
  // 常规态下把 Agent 栏切到写作助手:它此刻没有确认请求,状态词不得变成「等待确认」。
  await selectAgent(page, AGENT_NAMES['zh-CN'].writing)
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
  await selectAgent(page, AGENT_NAMES['zh-CN'].planning)
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
  await page.getByRole('textbox', { name: /与「.+」对话/ }).fill('只应出现这两条。')
  await page.getByRole('textbox', { name: /与「.+」对话/ }).press('Enter')
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
  // 新当前项目(knowledge-base)没有会话:区域既无成员又无子区域 → 渲染**引导页**;
  // h1 随之等于引导页的标题(而不是「新建对话」—— 引导页上的大标题与 h1 必须对得上,
  // 否则读屏用户听到的页面标题与屏幕上的标题不一致)。
  await expect(page.locator('.onboarding')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('这里还没有打开的窗口')
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
  // 新项目进入侧栏,并被**自动选中**;会话切到它 —— 它没有会话 ⇒ 根区域既无成员又无子区域 ⇒
  // 引导页(没有转录,故 role="log" 为 0)。
  await expect(page.locator('.project-item')).toHaveCount(3)
  const added = page.locator('.project-item').filter({ hasText: 'api-server' })
  await expect(added.locator('.project-row__button')).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.onboarding'), '无会话项目 → 引导页').toHaveCount(1)
  await expect(page.getByRole('log'), '引导页不是转录').toHaveCount(0)
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
  // 切到项目 B(knowledge-base):它没有会话 ⇒ 根区域既无成员又无子区域 ⇒ 引导页,旧项目的会话不再出现。
  await page.locator('.project-item').filter({ hasText: PROJECT_NAMES.planning[1] }).locator('.project-row__button').click()
  await expect(page.locator('.onboarding'), '无会话项目 → 引导页').toHaveCount(1)
  await expect(page.getByRole('log'), '引导页不是转录').toHaveCount(0)
  await expect(page.locator('.workspace-projects')).not.toContainText(HEADINGS['zh-CN'].weekly)
  await expect(page.locator('[data-message-id="weekly-1"]')).toHaveCount(0)
})

test('端到端:项目 A 下新建会话,切到项目 B 时不出现,切回 A 仍在', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 在项目 A(weekly-report)下新建并发送。
  await page.getByRole('button', { name: '新建对话', exact: true }).click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'empty')
  await page.getByRole('textbox', { name: /与「.+」对话/ }).fill('请整理一下本季度的目标。')
  await page.getByRole('textbox', { name: /与「.+」对话/ }).press('Enter')
  await expect(page.locator('.telemetry__word')).toHaveText('已生成')
  await openSwitcher(page)
  await expect(page.locator('.session-item')).toHaveCount(7)
  await expect(page.locator('.session-item').first()).toContainText('请整理一下本季度的目标。')
  await closeSwitcher(page)
  // 等保存收尾:保存中会短暂锁住项目 / 会话切换(与既有「生成中不可切」同一把锁)。
  await expect(page.getByRole('textbox', { name: /与「.+」对话/ })).not.toHaveAttribute('readonly', '')
  // 切到项目 B(knowledge-base):项目无会话 ⇒ 引导页;新会话归属 A,不出现在 B。
  await page.locator('.project-item').filter({ hasText: PROJECT_NAMES.planning[1] }).locator('.project-row__button').click()
  await expect(page.locator('.onboarding'), '无会话项目 → 引导页').toHaveCount(1)
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

// waiting 直达态下(默认项目 product-docs 有 3 条会话,都可见):
// quarterly(未看过)的 tab 挂**「等待交互」文字 Badge**;点开后它成为活动会话 → 视为已看过 → Badge 消失。
// (第六轮起,等待 / 完成两态改由文字 Badge 承载,图形只留给「正在产出」的呼吸灯。)
test('waiting:quarterly 的 tab 挂「等待交互」Badge,点开后消失', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await openWaiting(page)
  const quarterlyTab = page.locator(TAB, { hasText: QUARTERLY['zh-CN'] })
  await expect(quarterlyTab).toHaveCount(1)
  const badge = quarterlyTab.locator('.tab-badge')
  await expect(badge, '等待交互用文字 Badge 表达').toHaveText('待确认')
  await expect(badge).toHaveAttribute('data-level', 'warning')
  // 等待态不再有图形指示 —— 前导槽里既没有呼吸灯,也没有任何别的形状。
  await expect(quarterlyTab.locator('.tab-status')).toHaveAttribute('data-status', 'awaiting')
  await expect(quarterlyTab.locator('.tab-status'), '等待态没有图形指示').toHaveAttribute('data-icon', 'none')
  await expect(quarterlyTab.locator('.tab-status__dot')).toHaveCount(0)
  // Badge 不得把 tab 撑高:tab 高度恒为 32(紧凑导航行档)。
  const badgeTabBox = await quarterlyTab.boundingBox()
  const badgeBox = await badge.boundingBox()
  console.log(`[tab status] tab 高 ${badgeTabBox?.height.toFixed(1)} / Badge ${badgeBox?.width.toFixed(1)}×${badgeBox?.height.toFixed(1)}`)
  expect(badgeTabBox?.height ?? 0, '带 Badge 的 tab 高仍为 32').toBeGreaterThanOrEqual(NAV_CONTROL_SIZE - 1)
  expect(badgeTabBox?.height ?? 0, '带 Badge 的 tab 高仍为 32').toBeLessThanOrEqual(NAV_CONTROL_SIZE + 1)
  expect(badgeBox?.height ?? 0, 'Badge 高 < tab 高(不撑高)').toBeLessThan(badgeTabBox?.height ?? 0)
  // knowledge 是当前会话(已「看过」)→ 没有任何 Badge。
  await expect(page.locator(TAB, { hasText: HEADINGS['zh-CN'].knowledge }).locator('.tab-badge')).toHaveCount(0)
  await quarterlyTab.click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(quarterlyTab.locator('.tab-badge'), '点开后 Badge 消失').toHaveCount(0)
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
      // 若该宽度下 quarterly 仍可见,则「等待交互」Badge 挂在那枚 tab 上,菜单钮不出警告徽标。
      await expect(page.locator(TAB, { hasText: QUARTERLY['zh-CN'] }).locator('.tab-badge'), '等待交互 Badge 挂在 tab 上').toHaveText('待确认')
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
  await expect(page.locator('.conversation-group__title')).toHaveText(/本项目.*3/)
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

// 转录区(滚动容器 .transcript)的底部内边距 / 滚动内边距(px)。坞并入面板后是**静态**一档
// (--dl-space-4 = 16):它只表达「最后一条消息与坞顶之间那道留白」,不再随输入框高度变化。
const TRANSCRIPT_BOTTOM_PAD = 16

function transcriptPadBottom(page: Page): Promise<number> {
  return page.locator('.transcript').evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBlockEnd) || 0)
}

function transcriptScrollPadBottom(page: Page): Promise<number> {
  return page.locator('.transcript').evaluate((element) => Number.parseFloat(getComputedStyle(element).scrollPaddingBlockEnd) || 0)
}

// 坞与它上下相邻的几何:坞(position 非 absolute/fixed)、转录区底边、面板内容盒底边。
// 用来机械证明「坞是面板内的流内元素:坞底边 == 面板内容盒底边,坞顶边 == 转录区底边(相邻不重叠)」。
function dockGeom(page: Page): Promise<{
  dock: Rect | null
  dockPosition: string
  transcript: Rect | null
  panelContentBottom: number
}> {
  return page.evaluate(() => {
    const pick = (selector: string): Rect | null => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const dockElement = document.querySelector('.composer-dock')
    const dockPosition = dockElement instanceof HTMLElement ? getComputedStyle(dockElement).position : 'none'
    const panel = document.querySelector('.conversation-panel')
    let panelContentBottom = 0
    if (panel instanceof HTMLElement) {
      const rect = panel.getBoundingClientRect()
      const style = getComputedStyle(panel)
      // 面板无内边距(坞是它的最后一个子项),故内容盒底边 = 边框盒底边 − 下描边。
      panelContentBottom = rect.y + rect.height - (Number.parseFloat(style.borderBlockEndWidth) || 0) - (Number.parseFloat(style.paddingBlockEnd) || 0)
    }
    return { dock: pick('.composer-dock'), dockPosition, transcript: pick('.transcript'), panelContentBottom }
  })
}

// 转录区计算出的 mask-image(maskImage 或 -webkit-mask-image)。
function transcriptMaskImage(page: Page): Promise<string> {
  return page.locator('.transcript').evaluate((element) => {
    const style = getComputedStyle(element)
    return style.maskImage !== 'none' && style.maskImage !== '' ? style.maskImage : style.webkitMaskImage
  })
}

// 坞内的流内区块(遥测条)几何:坞并入面板、坞锚在面板底之后,遥测条是坞的**最后一个**子项,
// 其纵向位置由坞底推出 —— 故多行输入(输入框向下长高、坞顶被推高)时它的几何必须逐值不变。
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

// ① ▾ 钉到会话头右缘。用 waiting 演示态:当前项目只有 3 条会话,strip 常不满(tab 触到 240 上限),
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
    // 同上:＋ 前面现在是文件组,故按「前一元素」核间距。
    const beforePlusX = await page.locator('.conversation-icon-button').first().evaluate((el) => {
      const previous = el.previousElementSibling
      return previous === null ? null : previous.getBoundingClientRect().right
    })
    expect(beforePlusX, '＋ 前面有内容').not.toBeNull()
    if (beforePlusX !== null) expect(Math.abs(plusBox.x - beforePlusX - headingGap), '＋ 紧贴前一元素(间距 = 一个 gap)').toBeLessThanOrEqual(1)
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
  // aria-live 播报文本(1 基位次 + 总数)。播报通道已上移到页面级(全页唯一的那一条)。
  const live = page.locator('.workspace-tab-live')
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

// ③ 输入坞并入对话面板:坞是面板内的流内元素(不是浮层)、输入框回到流内、转录区只留**静态**内缩、
// 整条 mask-image 已删除、多行输入时坞内流内区块(遥测条)几何逐值不变。
test('输入区重构:坞为流内元素、坞底贴面板内底、转录区与坞相邻、无 mask、内缩静态', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const form = page.locator('.composer-form')
  const input = page.getByRole('textbox', { name: /与「.+」对话/ })

  // 坞:无底面(背景透明)、无上边界。
  const dockStyle = await page.locator('.composer-dock').evaluate((element) => {
    const style = getComputedStyle(element)
    return { background: style.backgroundColor, borderTop: style.borderBlockStartStyle }
  })
  console.log(`[dock] background ${dockStyle.background} / border-block-start ${dockStyle.borderTop}`)
  expect(dockStyle.background, '坞无底面(背景透明)').toBe('rgba(0, 0, 0, 0)')
  expect(dockStyle.borderTop, '坞无上边界').toBe('none')

  // 坞是面板内的**流内**元素(不是 absolute / fixed):层序回到第 1 层,文件窗体可覆盖它。
  const geom = await dockGeom(page)
  console.log(`[dock] position ${geom.dockPosition} / dock ${JSON.stringify(geom.dock)} / transcript ${JSON.stringify(geom.transcript)} / 面板内底 ${geom.panelContentBottom}`)
  expect(['absolute', 'fixed'], '坞不是绝对 / 固定定位(已并入面板流内)').not.toContain(geom.dockPosition)
  expect(geom.dock).not.toBeNull()
  expect(geom.transcript).not.toBeNull()
  if (geom.dock === null || geom.transcript === null) return
  // 坞是面板的最后一个流内子项 → 其底边就是面板内容盒底边。
  expect(Math.abs(geom.dock.y + geom.dock.height - geom.panelContentBottom), '坞底边 == 面板内容盒底边').toBeLessThanOrEqual(1)
  // 转录区底边 == 坞顶边(相邻),且两者不重叠(转录区底边不越过坞顶边)。
  const transcriptBottom = geom.transcript.y + geom.transcript.height
  console.log(`[dock] 转录区底 ${transcriptBottom.toFixed(1)} / 坞顶 ${geom.dock.y.toFixed(1)}`)
  expect(Math.abs(transcriptBottom - geom.dock.y), '转录区底边 == 坞顶边(相邻)').toBeLessThanOrEqual(1)

  // 输入框回到流内:不再是绝对定位;仍抬起(阴影在场)。
  const formStyle = await form.evaluate((element) => {
    const style = getComputedStyle(element)
    return { position: style.position, shadow: style.boxShadow }
  })
  console.log(`[composer-form] position ${formStyle.position} / box-shadow ${formStyle.shadow}`)
  expect(['absolute', 'fixed'], '输入框是流内元素(不再悬浮)').not.toContain(formStyle.position)
  expect(formStyle.shadow, '输入框带阴影').not.toBe('none')

  // 发送钮已删(计数 0);提示行本轮也下线,「Enter 发送 · Shift+Enter 换行」改挂在输入框的
  // title 上 —— 删了发送钮又删了提示行 = 完全不知道 Enter 能发送,故必须补这处兜底。
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toHaveCount(0)
  await expect(page.locator('.composer-form button')).toHaveCount(0)
  await expect(page.locator('.composer-hint')).toHaveCount(0)
  await expect(page.locator('.composer-form')).toHaveAttribute('title', 'Enter 发送 · Shift+Enter 换行')

  // 内缩:转录区的底部内缩是**静态**一档(--dl-space-4),与输入框高度无关;scroll-padding 同值。
  const padSingle = await transcriptPadBottom(page)
  const scrollPadSingle = await transcriptScrollPadBottom(page)
  console.log(`[input area] 单行:padding-bottom ${padSingle.toFixed(1)} / scroll-padding-bottom ${scrollPadSingle.toFixed(1)}(静态 ${TRANSCRIPT_BOTTOM_PAD})`)
  expect(Math.abs(padSingle - TRANSCRIPT_BOTTOM_PAD), '转录区 padding-block-end 为静态一档').toBeLessThanOrEqual(0.5)
  expect(Math.abs(scrollPadSingle - padSingle), 'scroll-padding-block-end == padding-block-end').toBeLessThanOrEqual(0.5)

  // mask-image 已**整条删除**(坞并入流内后不再需要在转录区下缘做边缘淡出)。
  const mask = await transcriptMaskImage(page)
  console.log(`[input area] mask-image ${mask}`)
  expect(mask, 'mask-image 已删除(none)').toBe('none')

  const flowBefore = await flowGeom(page)
  const dockBefore = geom.dock
  // 多行:输入 4 行 → 输入框向下长高、坞顶被推高(转录区收缩),但坞内流内区块几何逐值不变。
  await input.fill('line1\nline2\nline3\nline4')
  await expect.poll(async () => (await form.boundingBox())?.height ?? 0).toBeGreaterThan(0)
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
  // 多行时静态内缩逐值不变。
  const padMulti = await transcriptPadBottom(page)
  const scrollPadMulti = await transcriptScrollPadBottom(page)
  expect(Math.abs(padMulti - padSingle), '多行时 padding-block-end 不变(静态)').toBeLessThanOrEqual(0.5)
  expect(Math.abs(scrollPadMulti - padSingle), '多行时 scroll-padding 不变').toBeLessThanOrEqual(0.5)
  // 坞底边仍贴面板内容盒底边(坞锚在面板底,长高只把坞顶推上去)。
  const geomMulti = await dockGeom(page)
  if (geomMulti.dock !== null) {
    console.log(`[input area] 多行坞 ${JSON.stringify(geomMulti.dock)}(单行 ${JSON.stringify(dockBefore)})`)
    expect(Math.abs(geomMulti.dock.y + geomMulti.dock.height - geomMulti.panelContentBottom), '多行时坞底边仍贴面板内底').toBeLessThanOrEqual(1)
    expect(geomMulti.dock.y, '多行时坞顶被推高').toBeLessThan(dockBefore.y)
  }

  // 贴底时最后一条消息与坞顶不相交,且落在静态留白处(距坞顶 = 静态内缩值)。
  await page.getByRole('log').evaluate((element) => { element.scrollTop = element.scrollHeight })
  const lastMessage = await page.locator('.chat-message').last().boundingBox()
  const dockBox = await page.locator('.composer-dock').boundingBox()
  expect(lastMessage).not.toBeNull()
  expect(dockBox).not.toBeNull()
  if (lastMessage !== null && dockBox !== null) {
    const clearancePx = dockBox.y - (lastMessage.y + lastMessage.height)
    console.log(`[input area] 末条消息底 ${(lastMessage.y + lastMessage.height).toFixed(1)} / 坞顶 ${dockBox.y.toFixed(1)} / 留白 ${clearancePx.toFixed(1)}px(期望 ${TRANSCRIPT_BOTTOM_PAD})`)
    expect(lastMessage.y + lastMessage.height, '最后一条消息与坞不相交').toBeLessThanOrEqual(dockBox.y + 1)
    expect(Math.abs(clearancePx - TRANSCRIPT_BOTTOM_PAD), '末条到坞顶 = 静态留白').toBeLessThanOrEqual(1)
  }

  // 「回到底部」浮在坞顶之上、不覆盖坞(坞内唯一仍悬浮的件)。
  await page.getByRole('log').hover()
  await page.mouse.wheel(0, -800)
  const button = page.getByRole('button', { name: '回到底部' })
  await expect(button).toBeVisible()
  const buttonBox = await button.boundingBox()
  const dockBoxAfter = await page.locator('.composer-dock').boundingBox()
  expect(buttonBox).not.toBeNull()
  expect(dockBoxAfter).not.toBeNull()
  if (buttonBox !== null && dockBoxAfter !== null) {
    console.log(`[input area] 回到底部底 ${(buttonBox.y + buttonBox.height).toFixed(1)} / 坞顶 ${dockBoxAfter.y.toFixed(1)}`)
    expect(buttonBox.y + buttonBox.height, '「回到底部」浮在坞顶之上、不覆盖坞').toBeLessThanOrEqual(dockBoxAfter.y + 1)
  }
})

// ③ 核心缺陷回归:坞并入面板后,**内缩与淡出带都不再存在** —— 转录区只有一条静态底部内缩
// (--dl-space-4),mask-image 已整条删除。贴底时末条仍落在坞顶之上的留白处、且不与坞相交。
// 覆盖 375 / 768 / 1280 / 1600 × 单行 / 多行草稿,并逐值核对「多行不改变内缩」。
test('输入区内缩:四宽度 × 单/多行草稿,内缩静态、无 mask、末条落在留白处', async ({ page }) => {
  for (const width of [375, 768, 1280, 1600]) {
    for (const multiline of [false, true]) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await login(page)
      await waitForStable(page)
      const input = page.getByRole('textbox', { name: /与「.+」对话/ })
      const form = page.locator('.composer-form')
      if (multiline) {
        await input.fill('第一行草稿\n第二行草稿\n第三行草稿\n第四行草稿')
        // 多行输入框长高落定后再量静态内缩(它不应有任何变化)。
        await expect.poll(async () => (await form.boundingBox())?.height ?? 0, { message: '多行输入框已长高' }).toBeGreaterThan(0)
      }
      const formHeight = (await form.boundingBox())?.height ?? 0
      // 贴底。
      await page.getByRole('log').evaluate((element) => { element.scrollTop = element.scrollHeight })
      await page.waitForTimeout(80)
      const pad = await transcriptPadBottom(page)
      const scrollPad = await transcriptScrollPadBottom(page)
      const mask = await transcriptMaskImage(page)
      const lastMessage = await page.locator('.chat-message').last().boundingBox()
      const dockBox = await page.locator('.composer-dock').boundingBox()
      expect(lastMessage, `${width}/${multiline ? '多行' : '单行'} 末条存在`).not.toBeNull()
      expect(dockBox, `${width}/${multiline ? '多行' : '单行'} 坞存在`).not.toBeNull()
      if (lastMessage === null || dockBox === null) continue
      const label = `@${width} ${multiline ? '多行' : '单行'}`
      const lastBottom = lastMessage.y + lastMessage.height
      const clearancePx = dockBox.y - lastBottom
      console.log(`[inset] ${label}:输入框高 ${formHeight.toFixed(1)} / padding ${pad.toFixed(1)} / scroll-padding ${scrollPad.toFixed(1)} / mask ${mask} / 末条底 ${lastBottom.toFixed(1)} / 坞顶 ${dockBox.y.toFixed(1)} / 留白 ${clearancePx.toFixed(1)}px`)
      // 1) 内缩是静态一档,单行 / 多行逐值相同。
      expect(Math.abs(pad - TRANSCRIPT_BOTTOM_PAD), `${label}:padding 为静态一档`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(scrollPad - pad), `${label}:scroll-padding == padding`).toBeLessThanOrEqual(0.5)
      // 2) mask-image 已删除。
      expect(mask, `${label}:无 mask(整条删除)`).toBe('none')
      // 3) 末条底边不越过坞顶(不相交),且落在静态留白处。
      expect(lastBottom, `${label}:末条消息与坞不相交`).toBeLessThanOrEqual(dockBox.y + 1)
      expect(Math.abs(clearancePx - TRANSCRIPT_BOTTOM_PAD), `${label}:末条到坞顶 = 静态留白`).toBeLessThanOrEqual(1)
    }
  }
})

// ③ scroll-padding 的落地:搜索正文命中跳转后,被高亮的那一轮**完整落在坞顶之上**
// (只给 padding 时「跳转定位」仍会把目标落到坞底下 —— 这是 WCAG C43 要成对给的原因)。
test('搜索正文命中跳转:被高亮的轮次完整落在坞之上', async ({ page }) => {
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
  // 满载下这一刻可能正赶上一次 re-render:元素短暂脱离文档,读到的盒是 null(实测 webkit 并发 5 时 1/5)。
  // 故**整条判定**放进 poll 里:每次重试都重新读两个盒,不先读一次再断言(两次读之间仍可能变)。
  await expect.poll(async () => {
    const message = await highlighted.boundingBox()
    const input = await page.locator('.composer-form').boundingBox()
    if (message === null || input === null) return Number.NEGATIVE_INFINITY
    console.log(`[scroll-padding] 高亮轮次底 ${(message.y + message.height).toFixed(1)} / 输入框顶 ${input.y.toFixed(1)} / 间隙 ${(input.y - (message.y + message.height)).toFixed(1)}px`)
    return input.y - (message.y + message.height)
  }, { message: '高亮轮次完整落在输入框之上' }).toBeGreaterThanOrEqual(-1)

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
  await selectAgent(page, AGENT_NAMES['zh-CN'].research)
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
// 第六轮:tab 的状态指示收敛为「一个呼吸灯 + 两种文字 Badge」——
// 图形只保留「正在产出」的呼吸圆点;「等待交互」/「输出完成」改由文字 Badge 承担;
// 「新会话」「等待对话」不再有任何指示。下面既有正向断言,也有**负向断言**(被删掉的图形不得复活)。
// ============================================================================

test('tab 状态指示:只有呼吸灯与两种文字 Badge,被删掉的三种图形不存在', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  // ① 图形只剩呼吸灯:每条 tab 的前导槽要么是 dot(会话状态 streaming),要么空着。
  const icons = await page.locator('.tab-status').evaluateAll((elements) => elements.map((el) => el.getAttribute('data-icon')))
  console.log(`[tab status] 常规态 data-icon ${JSON.stringify(icons)}`)
  expect(icons.length, '每条 tab 都还留着前导槽').toBeGreaterThan(2)
  expect(icons.every((icon) => icon === 'dot' || icon === 'none'), '图形只有 dot / 空槽两种').toBe(true)
  const streamingCount = await page.locator('.tab-status[data-icon="dot"]').count()
  console.log(`[tab status] 常规态呼吸灯 ${streamingCount} 个`)
  expect(streamingCount, '常规态有正在产出的会话(weekly 种子状态 streaming)').toBe(1)
  // 呼吸灯色 = 强调色 token。
  const dotColor = await page.locator('.tab-status[data-icon="dot"]').first().evaluate((el) => getComputedStyle(el).color)
  expect(dotColor, '呼吸灯取强调色').toBe(await resolveToken(page, '--dl-accent'))

  // ② 负向断言:被删掉的三种图形与两个 CSS 形状一律不得存在。
  await expect(page.locator('.tab-status[data-icon="sparkles"]', ), '新会话不再有图形').toHaveCount(0)
  await expect(page.locator('.tab-status[data-icon="choiceCard"]'), '等待交互不再有图形').toHaveCount(0)
  await expect(page.locator('.tab-status[data-icon="check"]'), '输出完成不再有图形').toHaveCount(0)
  await expect(page.locator('.tab-status[data-icon="ring"]'), '等待对话不再有图形').toHaveCount(0)
  await expect(page.locator('.tab-status__glyph'), '不再渲染任何状态图形').toHaveCount(0)
  await expect(page.locator('.tab-status__ring'), '空心圆环已删除').toHaveCount(0)

  // ③ 两种 Badge:常规态有 completed 且未看过的会话 → 成功色 Badge;没有等待会话 → 无警告色 Badge。
  const successBadges = page.locator('.tab-badge[data-level="success"]')
  const warningBadges = page.locator('.tab-badge[data-level="warning"]')
  await expect(successBadges, '未看过的「输出完成」挂成功色 Badge').toHaveCount(2)
  await expect(warningBadges, '常规态没有等待会话').toHaveCount(0)
  const badgeText = await successBadges.first().innerText()
  const badgeColor = await successBadges.first().evaluate((el) => getComputedStyle(el).color)
  const badgeBg = await successBadges.first().evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log(`[tab badge] 成功档文案「${badgeText}」字 ${badgeColor} 底 ${badgeBg}`)
  expect(badgeText, 'Badge 用会话状态词,不是自造的词').toBe('已完成')
  expect(badgeColor, '成功档字色 = --dl-success').toBe(await resolveToken(page, '--dl-success'))
  expect(badgeBg, '成功档底色 = --dl-success-subtle').toBe(await resolveToken(page, '--dl-success-subtle'))
  // 「新会话」「等待对话」两态不带任何指示:budget / incident / hiring 这些 tab 里外都没有标记。
  const idleTab = page.locator(TAB, { hasText: HEADINGS['zh-CN'].incident })
  await expect(idleTab.locator('.tab-badge')).toHaveCount(0)
  await expect(idleTab.locator('.tab-status')).toHaveAttribute('data-icon', 'none')
  const newTab = page.locator(TAB, { hasText: HEADINGS['zh-CN'].budget })
  await expect(newTab.locator('.tab-badge')).toHaveCount(0)
  await expect(newTab.locator('.tab-status')).toHaveAttribute('data-icon', 'none')

  // ④ 等待档:warning 的底 / 字成对取自警告语义族。
  await page.goto('/#/workspace?s=waiting')
  await waitForStable(page, 'ready', HEADINGS['zh-CN'].knowledge)
  const waitingBadge = page.locator(TAB, { hasText: QUARTERLY['zh-CN'] }).locator('.tab-badge')
  await expect(waitingBadge).toHaveText('待确认')
  await expect(waitingBadge).toHaveAttribute('data-level', 'warning')
  const warningColor = await waitingBadge.evaluate((el) => getComputedStyle(el).color)
  const warningBg = await waitingBadge.evaluate((el) => getComputedStyle(el).backgroundColor)
  console.log(`[tab badge] 警告档字 ${warningColor} 底 ${warningBg}`)
  expect(warningColor, '警告档字色 = --dl-warning').toBe(await resolveToken(page, '--dl-warning'))
  expect(warningBg, '警告档底色 = --dl-warning-subtle').toBe(await resolveToken(page, '--dl-warning-subtle'))
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

test('「输出完成(未看过)」Badge 随「已看过」变化', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const roadmapTab = page.locator(TAB, { hasText: HEADINGS['zh-CN'].roadmap })
  await expect(roadmapTab.locator('.tab-badge'), 'roadmap 是 completed 且未看过 → 成功色 Badge').toHaveText('已完成')
  await expect(roadmapTab.locator('.tab-status'), '完成态同样没有图形').toHaveAttribute('data-icon', 'none')
  await roadmapTab.click()
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(roadmapTab.locator('.tab-badge'), '看过之后 Badge 收起').toHaveCount(0)
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

// 文件那一组现在住在**顶部行**里(对话 tablist 之后),故锚点就是它的组件根。
const FILE_BAR = '.file-bar'
// 文件面板缩放的尺寸下限(与 file-panel.vue 的 PANEL_MIN_W / PANEL_MIN_H 同值;测试读不到组件常量)。
const PANEL_MIN_W = 320
const PANEL_MIN_H = 200
const FILE_TAB = '.file-tab'
// 文件那一组是 toolbar(不是 tablist):每项是 aria-pressed 的切换按钮。
const FILE_TOOLBAR = '.file-tabs'
const FILE_PANEL = '.file-panel'
// 默认项目 weekly-report 里的顶层文件(技术标识,不随语言变化;无需展开目录即可见到)。
const README = 'README.md'
const PROGRESS = 'progress.csv'
const GITIGNORE = '.gitignore'

// 文件树里的文件行:整行一个 button。单击 / 双击 / Enter **三条入口行为一致** —— 都打开一个
// **悬浮**窗体(不占 tab)。要让文件占据区域内容区,再双击悬浮窗的标题栏把它停靠(见 openDockedFile)。
async function clickFileRow(page: Page, name: string): Promise<void> {
  await page.locator('.entry-row[data-kind="file"]', { hasText: name }).first().locator('.entry-row__button').click()
}

// 把**最近打开的那个悬浮窗体**停靠到区域内容区。
// 用标题栏上的原生「停靠」按钮(而不是双击):窄宽度下标题栏右侧被控件挤满,双击落点会落到
// 行尾控件上(那不算手柄);按钮是有 aria-label 的原生控件,任何宽度都点得准。
// 悬浮窗体按层序渲染,新开的在最后(openFloating 会置顶),故取最后一个。
async function dockLastFloating(page: Page): Promise<void> {
  const floating = page.locator(`${FILE_PANEL}[data-mode="floating"]`)
  await expect(floating).not.toHaveCount(0)
  await floating.last().locator('.file-panel__placement').click()
  await expect.poll(async () => page.locator(`${FILE_PANEL}[data-mode="docked"]`).count(), { message: '文件已停靠到内容区' }).toBeGreaterThan(0)
}

// 打开一个文件并把它**钉进**区域内容区:单击树行(悬浮)+ 点标题栏的「停靠」按钮。
// 「钉住」= 停靠 —— 树行本身的单击 / 双击 / Enter 已不再有「预览 / 钉住」之分。
async function openDockedFile(page: Page, name: string): Promise<void> {
  await clickFileRow(page, name)
  await dockLastFloating(page)
}

// 按**路径**精确停靠某个悬浮窗体(多窗口下比「取最后一个」确定)。path 是域内完整相对路径。
async function dockFloatingPath(page: Page, path: string): Promise<void> {
  const win = page.locator(`${FILE_PANEL}[data-mode="floating"][data-file-path="${path}"]`)
  await expect(win, `${path} 的悬浮窗在场`).toHaveCount(1)
  await win.locator('.file-panel__placement').click()
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"][data-file-path="${path}"]`), `${path} 已停靠`).toHaveCount(1)
}

// 窄屏侧栏是抽屉:打开它才能点树行;点完把抽屉关掉(否则会盖住要量的东西)。
// 幂等:已经开着就不再点(否则会点在被自己盖住的入口上)。
async function openSidebarIfNarrow(page: Page, width: number): Promise<void> {
  if (width >= 1024) return
  if (await page.locator('.workspace-sidebar.is-open').count() > 0) return
  await page.getByRole('button', { name: '打开侧栏' }).click()
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

// 文件栏 tab 标签的字体样式(打开即独占,标签**一律**正体 —— 预览斜体已作废)。
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

test('文件树打开 = 悬浮窗体(不占 tab):单击 / 双击 / Enter 行为一致,重复打开同一文件不新增', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 文件那一组**常驻**(住顶部行),但没打开文件时**不占位**(不抢对话 tablist 的宽度)。
  await expect(page.locator(FILE_BAR)).toHaveCount(1)
  await expect(page.locator(FILE_TOOLBAR)).toHaveAttribute('role', 'toolbar')
  await expect(page.locator(FILE_TAB)).toHaveCount(0)
  await expect(page.locator('.file-bar__empty')).toHaveCount(0)

  // 单击打开 → 一个**悬浮**窗体:覆盖层、不占 tab(条上仍是 0 项)。
  await clickFileRow(page, README)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '单击 → 悬浮窗体').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`)).toHaveCSS('position', 'fixed')
  await expect(page.locator(FILE_TAB), '悬浮窗体不占 tab').toHaveCount(0)
  await expect(page.locator(`${FILE_PANEL}[data-file-path="README.md"]`)).toHaveAttribute('data-focused', 'true')
  await expect(page.locator(FILE_PANEL).locator('.file-line').first(), '内容渲染出来了').toBeVisible()

  // 双击 / Enter 与单击**行为一致**:仍是同一个悬浮窗体(不新增、不变成第二个、也不上条)。
  await page.locator('.entry-row[data-kind="file"]', { hasText: README }).first().locator('.entry-row__button').dblclick()
  await expect(page.locator(FILE_PANEL), '双击不新增').toHaveCount(1)
  await page.locator('.entry-row[data-kind="file"]', { hasText: README }).first().locator('.entry-row__button').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator(FILE_PANEL), 'Enter 与单击一致(复用同一窗体)').toHaveCount(1)
  await expect(page.locator(FILE_TAB), '三条入口都不占 tab').toHaveCount(0)

  // 再打开另一个文件 → **第二个悬浮窗体**(多窗口并存,谁也不顶掉谁)。
  await clickFileRow(page, PROGRESS)
  await expect(page.locator(FILE_PANEL), '两次打开 = 两个悬浮窗').toHaveCount(2)
  await expect(page.locator(FILE_TAB), '仍不占 tab').toHaveCount(0)

  // 关掉全部悬浮窗 → 一个都不剩(关闭 ≠ 删除:从树里再点即回来,见「多悬浮窗口」用例)。
  await closeAllFileWindows(page)
  await expect(page.locator(FILE_PANEL)).toHaveCount(0)
  await expect(page.locator(FILE_BAR)).toHaveCount(1)
})

test('悬浮 ↔ 停靠:双击标题栏即停靠(加入成员、占据内容区、不再作浮层),再双击还原悬浮(回到记忆几何)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  // 开一个悬浮窗体,并把它拖到一个便于识别的非默认位置(几何要被记忆)。
  await clickFileRow(page, README)
  const floating = page.locator(`${FILE_PANEL}[data-mode="floating"]`)
  await expect(floating).toHaveCount(1)
  const headerBox = await floating.locator('.dl-window__meta').boundingBox()
  expect(headerBox, '悬浮窗标题栏有几何盒').not.toBeNull()
  if (headerBox === null) return
  await dragFromTo(page, headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2, 48, 24)
  const placed = await panelRectOf(page, README)
  console.log(`[dock] 停靠前悬浮几何 ${JSON.stringify(placed)}`)
  // 像素基线:此前整套截图口径都在「未打开任何文件」的静置态,窗体两态完全没有回归保护。
  // 几何固定后截图,基线才稳定。
  await expect(page).toHaveScreenshot('workspace-file-window-floating-1280.png')

  // 双击标题栏(身份区,不是行尾控件)→ **停靠到区域内容区**。
  await floating.locator('.dl-window__meta').dblclick({ position: { x: 120, y: 20 } })
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '停靠窗体在场').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '停靠后不再作为浮层渲染').toHaveCount(0)
  // 占一个 tab,且是活动项。
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  await expect(page.locator(`${FILE_TAB}[data-file-path="README.md"][aria-pressed="true"]`), '它是条上的活动项').toHaveCount(1)
  // 转录被它替换(同一时刻只显示一件东西)。
  await expect(page.locator('.transcript'), '转录被它替换').toHaveCount(0)
  // 「内容区确实被它占据」的机械证明:区域内容区中心命中停靠窗体。
  const hit = await page.evaluate(() => {
    const area = document.querySelector('.transcript-area')
    if (!(area instanceof HTMLElement)) return 'no-area'
    const rect = area.getBoundingClientRect()
    const el = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    if (el === null) return 'null'
    if (el.closest('.dl-window--docked') !== null) return 'docked'
    if (el.closest('.transcript') !== null) return 'transcript'
    return el.tagName
  })
  console.log(`[dock] 内容区中心命中 → ${hit}`)
  expect(hit, '区域内容区中心命中的是停靠窗体').toBe('docked')
  // 像素基线:停靠态(独占区域内容区 + 条上多一枚 tab)。
  await expect(page).toHaveScreenshot('workspace-file-window-docked-1280.png')
  // 停靠窗体填满内容区(顶边 / 底边贴合)。
  const areaBox = await page.locator('.transcript-area').boundingBox()
  const dockedBox = await page.locator(`${FILE_PANEL}[data-mode="docked"]`).boundingBox()
  expect(areaBox).not.toBeNull()
  expect(dockedBox).not.toBeNull()
  if (areaBox !== null && dockedBox !== null) {
    expect(Math.abs(dockedBox.y - areaBox.y), '停靠窗体顶边贴内容区顶边').toBeLessThanOrEqual(1)
    expect(Math.abs(dockedBox.y + dockedBox.height - (areaBox.y + areaBox.height)), '停靠窗体底边贴内容区底边').toBeLessThanOrEqual(1)
  }

  // 双击停靠窗的标题栏 → **还原悬浮**:脱离成员(条上清空)、回到**记忆的悬浮几何**。
  await page.locator(`${FILE_PANEL}[data-mode="docked"] .dl-window__meta`).dblclick({ position: { x: 120, y: 20 } })
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '还原为悬浮窗体').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`)).toHaveCount(0)
  await expect(page.locator(FILE_TAB), '脱离成员,条上不再有它').toHaveCount(0)
  await expect(page.locator('.transcript'), '转录回来').toHaveCount(1)
  await expect.poll(async () => Math.round((await panelRectOf(page, README)).x), { message: '回到记忆的悬浮几何 x' }).toBe(Math.round(placed.x))
  const restored = await panelRectOf(page, README)
  console.log(`[dock] 还原后几何 ${JSON.stringify(restored)}(原 ${JSON.stringify(placed)})`)
  expect(Math.abs(restored.y - placed.y), '回到记忆的悬浮几何 y').toBeLessThanOrEqual(1)
  expect(Math.abs(restored.width - placed.width), '宽也一致').toBeLessThanOrEqual(1)
  expect(Math.abs(restored.height - placed.height), '高也一致').toBeLessThanOrEqual(1)
})

// 「显示一个已经打开的窗体」= reveal 语义,不是「再开一份」:
// 树中的一次点击在文件**已经停靠在某块区域的 tab 条上**时,应当把**那块区域**切到它这一项
// 并给一次提醒脉冲 —— 而不是把它从条上拽走、变成悬浮窗(用户报的缺陷)。
// 业界对照:VS Code 把 reveal 做成一等动词(TreeView.reveal / WebviewPanel.reveal,与 open 并列);
// 「点已打开项却又开一份」在 VS Code / IntelliJ / Zed 都是被反复公开抱怨的缺陷。
test('文件树里点一个已经拥有 tab 的文件:切到它所在的区域并提醒,不再把它拽成悬浮窗', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 打开并停靠 → 它拥有一个 tab。
  await openDockedFile(page, README)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '文件占据内容区').toHaveCount(1)
  await expect(page.locator(`${FILE_TAB}[data-file-path="README.md"]`), '它拥有一个 tab').toHaveCount(1)

  // 先把内容区让给一段对话 —— 这样「切回来」才是可观察的变化(否则 activateTab 会早退)。
  await page.locator('.conversation-tab').first().click()
  await expect(page.locator('.transcript:not(.transcript--placeholder)'), '内容区先显示对话').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '文件让位').toHaveCount(0)

  // 再在树里点同一个文件:**不应**出现悬浮窗,而应把内容区切回它这一项。
  await clickFileRow(page, README)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '不再把它拽成悬浮窗').toHaveCount(0)
  await expect(page.locator(`${FILE_TAB}`), '仍留在 tab 条上').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '内容区切回该文件').toHaveCount(1)

  // 提醒动效的机械证据:该 tab 在点击后的一拍内带 data-pulsing(动画与降级都挂在这个标记上)。
  const tab = page.locator(`${FILE_TAB}[data-file-path="README.md"]`)
  await expect(tab, '给一次提醒脉冲').toHaveAttribute('data-pulsing', 'true')
  // 信息不得只由动效承载:同一条 role=status 播报说清了去了哪里。
  await expect(page.locator('.workspace-live')).toContainText('已切换到')
  // 脉冲是**一次性**的:一拍之后标记自己消失(循环闪烁是被平台规范劝退的反模式)。
  await expect(tab).not.toHaveAttribute('data-pulsing', 'true', { timeout: 3000 })
})

test('文件树里点一个正在悬浮的文件:只把它置顶聚焦,不新增第二个窗口', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickFileRow(page, README)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '首次打开 = 悬浮窗体').toHaveCount(1)
  await clickFileRow(page, README)
  await expect(page.locator(FILE_PANEL), '仍只有一个窗体,不新增').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '仍是那个悬浮窗体').toHaveCount(1)
  await expect(page.locator(FILE_TAB), '不占 tab').toHaveCount(0)
})

test('停靠态文件面板的 ✕ 关掉该文件的 tab:面板与 tab 一起消失,不留矛盾状态', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openDockedFile(page, README)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '文件停靠占据内容区').toHaveCount(1)
  await expect(page.locator(FILE_TAB), '它有一个 tab').toHaveCount(1)

  await page.locator(`${FILE_PANEL}[data-mode="docked"] .file-panel__close`).click()

  // 面板与 tab **一起**消失 —— 而不是「面板纹丝不动、只把 tab 标记成不可见」:
  // 停靠态下 hideWindow 只置 visible:false,而区域取活动成员时不看 visible,于是会留下
  // 「按自己的标记没有任何成员可见、却仍在渲染那个文件」的矛盾态(评审实测)。
  await expect(page.locator(FILE_PANEL), '面板消失').toHaveCount(0)
  await expect(page.locator(FILE_TAB), 'tab 也撤下').toHaveCount(0)
  // 区域内容区回到一段对话(相邻成员接管),不是停在那个文件上、也不是空位占位。
  await expect(page.locator('.transcript--placeholder'), '不停在空位占位上').toHaveCount(0)
  await expect(page.locator('.transcript:not(.transcript--placeholder)'), '内容区交给相邻成员').toHaveCount(1)
})

test('区域内容区同一时刻只显示一件:点对话 tab 文件让位(tab 仍在条上),点文件 tab 又占回内容区', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openDockedFile(page, README)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`)).toHaveCount(1)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  // 停靠窗体的 tab 是**正体**(文件项一律正体,预览斜体已作废)。
  expect(await firstTabFontStyle(page, 'first'), '文件 tab 是正体').toBe('normal')

  // 点一个对话 tab → 显示该对话:停靠窗体让位(内容区回到转录),但它的 tab 仍在条上。
  await clickTab(page, HEADINGS['zh-CN'].roadmap)
  await expect(page.getByRole('log')).toBeVisible()
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '文件让位').toHaveCount(0)
  await expect(page.locator(FILE_TAB), '它的 tab 仍在条上').toHaveCount(1)
  await expect(page.locator('.transcript')).toHaveCount(1)

  // 点回文件 tab → 该文件重新占据内容区。
  await page.locator(`${FILE_TAB}[data-file-path="README.md"]`).click()
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '文件重新占据内容区').toHaveCount(1)
  await expect(page.locator('.transcript')).toHaveCount(0)
})

test('悬浮 ↔ 停靠的键盘通路与播报:标题栏原生按钮回车即转换,role=status 播报状态变化', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickFileRow(page, README)
  // 悬浮态按钮 = 「停靠到内容区」,是**原生 button**(可 Tab 可达、Enter 可触发)。
  const dockButton = page.locator(`${FILE_PANEL}[data-mode="floating"] .file-panel__placement`)
  await expect(dockButton).toHaveAttribute('aria-label', '停靠到内容区')
  await dockButton.focus()
  await expect(dockButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '回车即停靠').toHaveCount(1)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  await expect(page.locator('.workspace-live'), '状态变化经 role=status 播报').toHaveText(/README\.md.*停靠/)

  // 停靠态按钮文案反之,回车还原为悬浮。
  const floatButton = page.locator(`${FILE_PANEL}[data-mode="docked"] .file-panel__placement`)
  await expect(floatButton).toHaveAttribute('aria-label', '悬浮为独立窗口')
  await floatButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '回车即还原悬浮').toHaveCount(1)
  await expect(page.locator(FILE_TAB)).toHaveCount(0)
  await expect(page.locator('.workspace-live')).toHaveText(/README\.md.*悬浮/)
})

// 复位几何:「双击标题栏复位」这个旧手势已改指「停靠 / 悬浮」,复位能力因此改挂到标题栏上的
// 一个原生按钮 —— 顺带把它从「鼠标专属手势」变成键盘可达。
test('复位几何:标题栏的原生按钮把悬浮窗还原为默认落点,且键盘可达', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickFileRow(page, README)
  const panel = page.locator(`${FILE_PANEL}[data-mode="floating"]`)
  await expect(panel).toHaveCount(1)

  const origin = await panel.boundingBox()
  expect(origin).not.toBeNull()
  if (origin === null) return

  // 先把它挪走:位移要够大,才能把「复位成功」与「根本没动」区分开。
  await dragFromTo(page, origin.x + 60, origin.y + 18, -140, 96)
  await expect
    .poll(async () => (await panel.boundingBox())?.x ?? origin.x, { message: '已被拖离默认落点' })
    .toBeLessThan(origin.x - 40)

  const reset = panel.locator('.file-panel__reset')
  await expect(reset, '悬浮态才有复位钮').toHaveCount(1)
  await expect(reset).toHaveAttribute('aria-label', '复位窗口位置与大小')
  await reset.focus()
  await expect(reset).toBeFocused()
  await page.keyboard.press('Enter')

  await expect.poll(async () => (await panel.boundingBox())?.x ?? -1, { message: '复位回默认 x' }).toBeCloseTo(origin.x, 0)
  await expect.poll(async () => (await panel.boundingBox())?.y ?? -1, { message: '复位回默认 y' }).toBeCloseTo(origin.y, 0)

  // 停靠态的几何由区域内容区给出,没有「默认几何」可复位,故不渲染该钮。
  await page.locator(`${FILE_PANEL}[data-mode="floating"] .file-panel__placement`).click()
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`)).toHaveCount(1)
  await expect(page.locator('.file-panel__reset'), '停靠态不渲染复位钮').toHaveCount(0)
  // 停靠态的几何由区域内容区给出,没有可调整的自由尺寸 → 缩放手柄一枚都不渲染。
  await expect(page.locator('.dl-window__resize'), '停靠态不渲染缩放手柄').toHaveCount(0)
})

for (const width of [375, 768, 1280, 1600]) {
  test(`文件组几何 @${width}:住在顶部行里(对话 tablist 之后)、常驻、不撑高顶部行、不越出对话面板`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)
    // 常驻:没有打开任何文件时这一组依然在,并给出教学性空态。
    const bar = page.locator(FILE_BAR)
    await expect(bar, '文件组常驻').toHaveCount(1)
    await expect(page.locator(FILE_TAB)).toHaveCount(0)
    // 空的时候这一组宽度为 0(把行宽完整留给对话 tablist);提示文案改在下拉的「文件」页里。
    const emptyW = (await bar.boundingBox())?.width ?? -1
    expect(emptyW, '空态不占宽').toBeLessThanOrEqual(1)
    const emptyBarBox = await bar.boundingBox()
    const emptyRowBox = await page.locator('.conversation-heading').boundingBox()

    // 打开一个文件并停靠:窄屏下抽屉盖住悬浮窗,故先点树行(悬浮)、关抽屉、再双击标题栏停靠。
    await openSidebarIfNarrow(page, width)
    await clickFileRow(page, README)
    await closeSidebarIfOpen(page)
    await dockLastFloating(page)
    await expect(bar).toHaveCount(1)
    const barBox = await bar.boundingBox()
    const rowBox = await page.locator('.conversation-heading').boundingBox()
    const conversationBox = await page.locator('.conversation').boundingBox()
    const tabsBox = await page.locator('.conversation-tabs').boundingBox()
    const triggerBox = await page.locator(SWITCHER_TRIGGER).boundingBox()
    expect(emptyBarBox).not.toBeNull()
    expect(emptyRowBox).not.toBeNull()
    expect(barBox).not.toBeNull()
    expect(rowBox).not.toBeNull()
    expect(conversationBox).not.toBeNull()
    expect(tabsBox).not.toBeNull()
    expect(triggerBox).not.toBeNull()
    if (emptyBarBox === null || emptyRowBox === null || barBox === null || rowBox === null || conversationBox === null || tabsBox === null || triggerBox === null) return
    console.log(`[file group] @${width} 组 ${barBox.width.toFixed(1)}×${barBox.height.toFixed(1)} @${barBox.x.toFixed(1)}..${(barBox.x + barBox.width).toFixed(1)} / 顶部行 ${rowBox.x.toFixed(1)}..${(rowBox.x + rowBox.width).toFixed(1)} y ${rowBox.y.toFixed(1)}..${(rowBox.y + rowBox.height).toFixed(1)} / 对话 tablist 右缘 ${(tabsBox.x + tabsBox.width).toFixed(1)} / ＋▾ 左缘 ${triggerBox.x.toFixed(1)}`)

    // ① 常驻的好处仍然成立:空 / 非空两态下**顶部行的高度不变**(打开第一个文件不引起版面跳动)。
    expect(Math.abs(rowBox.height - emptyRowBox.height), '空 / 非空两态顶部行高度相同').toBeLessThanOrEqual(1)
    // (空态这一组宽高都为 0 —— 它不占位;真正要守的不变量是**顶部行的高度不变**,见上。)
    expect(Math.abs(emptyBarBox.height), '空态文件组不占高').toBeLessThanOrEqual(1)
    // ② 文件组高度 = 一行 tab(32)—— 与对话 tab 同档,故它不撑高顶部行。
    expect(Math.abs(barBox.height - 32), '文件组高 = 32(与对话 tab 同档)').toBeLessThanOrEqual(1)
    // ③ 次序:对话 tablist → 文件组 → ＋▾(先对话、后文件;＋▾ 是条尾控件)。
    expect(tabsBox.x + tabsBox.width, '对话在文件之前').toBeLessThanOrEqual(barBox.x + 1)
    expect(barBox.x + barBox.width, '文件在 ＋▾ 之前').toBeLessThanOrEqual(triggerBox.x + 1)
    // ④ 不越出对话面板:左缘 ≥ 面板左缘、右缘 ≤ 面板右缘(它现在住在面板的头部里)。
    expect(barBox.x, '文件组不越出对话面板左缘').toBeGreaterThanOrEqual(conversationBox.x - 1)
    expect(barBox.x + barBox.width, '文件组不越出对话面板右缘').toBeLessThanOrEqual(conversationBox.x + conversationBox.width + 1)
    // ⑤ 顶部行整体仍在面板内、且高度也没有被撑高(与「未打开文件」时同值,见 ①)。
    expect(rowBox.y + rowBox.height, '顶部行在面板内').toBeLessThanOrEqual(conversationBox.y + conversationBox.height + 1)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })
}

test('文件组:关闭 ≠ 删除(下拉「文件」页里可再打开)、Delete 关闭聚焦项、拖拽换位不改活动项', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 三个顶层文件各自打开并停靠到内容区(条上三个 tab)。
  for (const name of [README, PROGRESS, GITIGNORE]) await openDockedFile(page, name)
  await expect(page.locator(FILE_TAB)).toHaveCount(3)
  expect(await fileTabLabels(page)).toEqual(['README.md', 'progress.csv', '.gitignore'])

  // 关闭第一个 tab:从栏上撤下(≠ 删除)。
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await expect(page.locator(FILE_TAB)).toHaveCount(2)
  expect(await fileTabLabels(page)).toEqual(['progress.csv', '.gitignore'])

  // 它仍在下拉的「文件」页里;点它可再打开(重新出现在条上)。
  // 先收起**全部**文件窗口 —— 它们是 overlay 层的浮窗,会盖住同为 overlay 的下拉、拦截点击。
  await closeAllFileWindows(page)
  await openSwitcher(page)
  await page.locator('.conversation-filter__option', { hasText: '文件' }).click()
  const recentRow = page.locator('.conversation-row[data-file-option]', { hasText: README })
  await expect(recentRow, '关掉的文件在下拉的「文件」页里').toHaveCount(1)
  await recentRow.click()
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(page.locator(FILE_TAB)).toHaveCount(3)
  expect(await fileTabLabels(page)).toContain('README.md')

  // Delete 关闭聚焦的 tab。
  const target = page.locator('.file-tab-slot').nth(1).locator(FILE_TAB)
  const victim = await target.locator('.file-tab__label').innerText()
  await target.focus()
  await page.keyboard.press('Delete')
  await expect(page.locator(FILE_TAB, { hasText: victim }), 'Delete 关闭了聚焦的 tab').toHaveCount(0)

  // 拖拽换位:顺序变化,**活动项不变**(拖动后台 tab 不切活动文件)。
  // 两个停靠窗体**同时可见**,条上两项都处于按下态 —— 故「活动项」按**当前聚焦的窗体**核对。
  await expect(page.locator(FILE_TAB)).toHaveCount(2)
  const activeBefore = await page.locator(`${FILE_PANEL}[data-focused="true"]`).getAttribute('data-file-path')
  const orderBefore = await page.locator(FILE_TAB).evaluateAll((elements) => elements.map((el) => el.getAttribute('data-file-path')))
  await dragFileTab(page, 0, 1)
  const orderAfter = await page.locator(FILE_TAB).evaluateAll((elements) => elements.map((el) => el.getAttribute('data-file-path')))
  console.log(`[file bar drag] ${JSON.stringify(orderBefore)} → ${JSON.stringify(orderAfter)}`)
  expect(orderAfter, '拖拽改变了顺序').not.toEqual(orderBefore)
  await expect(page.locator(`${FILE_PANEL}[data-focused="true"]`), '拖拽不切活动文件').toHaveAttribute('data-file-path', activeBefore ?? '')

  // 全部关掉 → 条上无文件项,但**这一组常驻**(显示空态);面板收起。
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await expect(page.locator(FILE_TAB)).toHaveCount(0)
  await expect(page.locator(FILE_BAR)).toHaveCount(1)
  // 关光之后这一组不占位;「关掉的怎么找回」由下拉的「文件」页承担(那里才有空文案)。
  expect(await page.locator(FILE_BAR).evaluate((el) => el.getBoundingClientRect().width), '关光后这一组不占位').toBeLessThanOrEqual(1)
  await expect(page.locator(FILE_PANEL)).toHaveCount(0)
})

// 文件栏改成「面板底部整宽」后,可用宽不再是 768 而是面板内宽 —— 可见 tab 数随之变多。
// 六个文件在四档宽度下的可见数(实测值写进断言,防止可用宽算法回退):
//   375 → 2、768 → 4、1280 → 6、1600 → 6(溢出部分由 ▾ 菜单兜住)。
// 文件那一组搬进顶部行后,它的可用宽由会话栏单向定额(见 conversation-switcher 的 measureStrip),
// 故可见数**重新实测取样**(不再是底栏时代那组值)。
const FILE_BAR_VISIBLE = { 375: 1, 768: 2, 1280: 2, 1600: 3 } as const

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
    // 逐个打开并停靠:窄屏下抽屉盖住悬浮窗,故每次「开抽屉 → 点树行 → 关抽屉 → 停靠」;
    // 一次只留一个悬浮窗,避免多窗级联时彼此的缩放手柄互相拦截(那些手柄画在面板**外侧**)。
    for (const [name, path] of [
      [README, 'README.md'],
      [PROGRESS, 'progress.csv'],
      [GITIGNORE, '.gitignore'],
      ['main.ts', 'src/main.ts'],
      ['format.ts', 'src/utils/format.ts'],
      ['2026-W40.md', 'notes/2026-W40.md'],
    ] as const) {
      await openSidebarIfNarrow(page, width)
      await clickFileRow(page, name)
      await closeSidebarIfOpen(page)
      await dockFloatingPath(page, path)
    }
    // 条上**渲染**的槽位数受可用宽约束(装不下的进 ▾),故 6 个成员不等于 6 个槽位 ——
    // 条上的可见数由下面按 FILE_BAR_VISIBLE[width] 核对,全量由 ▾ 的「文件」页核对。

    // 允许宽由会话栏在 ResizeObserver + rAF 之后写出,可见数随之变化 —— 等它落定再采样,
    // 不读瞬时值(否则会数到还没重排的旧帧)。
    await expect
      .poll(async () => page.locator('.conversation-heading').evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue('--file-strip-width')) || 0), { message: `@${width}:文件组允许宽已落定` })
      .toBeGreaterThan(0)
    await page.waitForTimeout(120)
    const expected = FILE_BAR_VISIBLE[width]
    const visible = await page.locator(FILE_TAB).count()
    const total = await page.locator('.file-tab-slot').count()
    const allowance = await page.locator('.conversation-heading').evaluate((el) => getComputedStyle(el).getPropertyValue('--file-strip-width'))
    console.log(`[file group visible] @${width} 可见 ${visible}/${total} / 允许宽 ${allowance} / 期望 ${expected}`)
    expect(visible, '可见数 ≥1 且 ≤6').toBeGreaterThanOrEqual(1)
    expect(visible, '可见数 ≤6').toBeLessThanOrEqual(6)
    expect(visible, '顶部行里的实测值').toBe(expected)
    // 装不下的都在 ▾ 下拉的「文件」页里(下拉已并入会话栏,用过滤钮切过去)。
    const hidden = 6 - visible
    await closeAllFileWindows(page)
    await openSwitcher(page)
    await page.locator('.conversation-filter__option', { hasText: '文件' }).click()
    // 下拉列出**全部**打开的文件(含条上已可见的)—— 与会话那一页同构,只是分了页。
    const rows = await page.locator('.conversation-row[data-file-option]').count()
    console.log(`[file group visible] @${width} 下拉文件行 ${rows}/6(其中不可见 ${hidden})`)
    expect(rows, '下拉列出全部 6 个打开的文件').toBe(6)
    if (hidden > 0) {
      // 选中一个**确实被收起**的项(format.ts 在 375 与 768 两档都排不进可见窗口)——
      // 它随即变为活动项且可见。
      await page.locator('.conversation-row[data-file-option]', { hasText: 'format.ts' }).click()
      // 多窗口全部可见,条上多个项都处于按下态 —— 故按**具体路径**核对「它被激活并可见」。
      await expect(page.locator(`${FILE_TAB}[data-file-path="src/utils/format.ts"]`)).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator(FILE_TAB, { hasText: 'format' })).toHaveCount(1)
    }
  })
}

// 底部内缩与「文件那一组」已**无几何关系**(它住顶部行),这里复核的仍是:内缩是静态一档、
// 打开文件前后转录区几何**逐值不变**(顶部行高度不变 ⇒ 面板几何不变)、末条不与坞相交且落在留白处、
// 无 mask。覆盖 375/768/1280/1600 × 单/多行。
test('文件栏内缩:内缩静态一档,末条不与坞 / 遥测条 / 文件栏相交且无 mask', async ({ page }) => {
  test.setTimeout(90_000)
  for (const width of [375, 768, 1280, 1600]) {
    for (const multiline of [false, true]) {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await login(page)
      await waitForStable(page)
      const label = `@${width} ${multiline ? '多行' : '单行'}`
      const form = page.locator('.composer-form')
      const bar = page.locator(FILE_BAR)

      // 常驻的实质好处:0 个文件与 N 个文件时,**内缩与转录区几何逐值相同**
      // (首次打开文件不再引起版面跳动)。多行草稿先填好并等输入框长高落定,免得把「草稿长高」
      // 误当成「打开文件」的影响。
      if (multiline) {
        await page.getByRole('textbox', { name: /与「.+」对话/ }).fill('第一行草稿\n第二行草稿\n第三行草稿\n第四行草稿')
        await expect.poll(async () => (await form.boundingBox())?.height ?? 0, { message: `${label}:草稿长高落定` }).toBeGreaterThan(0)
      }
      const emptyPad = await transcriptPadBottom(page)
      const emptyScrollPad = await transcriptScrollPadBottom(page)
      const emptyTranscriptBox = await page.locator('.transcript').boundingBox()

      await openSidebarIfNarrow(page, width)
      // 打开一个**悬浮**窗体(不占 tab、不改内容区):本用例要证明的是「打开文件前后转录区几何逐值不变」。
      await clickFileRow(page, README)
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

      // 内缩:静态一档(与输入框高度无关);scroll-padding 同值。文件栏**不在**这一项里(它住顶部行)。
      const formHeight = (await form.boundingBox())?.height ?? 0
      const pad = await transcriptPadBottom(page)
      const scrollPad = await transcriptScrollPadBottom(page)
      const mask = await transcriptMaskImage(page)
      console.log(`[file bar inset] ${label}:输入框高 ${formHeight.toFixed(1)} / padding ${pad.toFixed(1)} / scroll-padding ${scrollPad.toFixed(1)}(静态 ${TRANSCRIPT_BOTTOM_PAD}) / mask ${mask}`)
      expect(Math.abs(pad - TRANSCRIPT_BOTTOM_PAD), `${label}:padding 为静态一档`).toBeLessThanOrEqual(0.5)
      expect(Math.abs(scrollPad - pad), `${label}:scroll-padding == padding`).toBeLessThanOrEqual(0.5)
      expect(mask, `${label}:无 mask(整条删除)`).toBe('none')

      // 贴底:末条与坞、遥测条均不相交,且落在静态留白处。
      await page.getByRole('log').evaluate((element) => { element.scrollTop = element.scrollHeight })
      await page.waitForTimeout(80)
      const lastMessage = await page.locator('.chat-message').last().boundingBox()
      const formBox = await form.boundingBox()
      const telemetryBox = await page.locator('.telemetry').boundingBox()
      const inner = await panelInnerBox(page)
      const dockBox = await page.locator('.composer-dock').boundingBox()
      expect(lastMessage).not.toBeNull()
      expect(formBox).not.toBeNull()
      expect(telemetryBox).not.toBeNull()
      expect(dockBox).not.toBeNull()
      if (lastMessage === null || formBox === null || telemetryBox === null || dockBox === null) continue
      const lastBottom = lastMessage.y + lastMessage.height
      console.log(`[file bar inset] ${label}:末条底 ${lastBottom.toFixed(1)} / 输入框顶 ${formBox.y.toFixed(1)} / 遥测条顶 ${telemetryBox.y.toFixed(1)} / 坞顶 ${dockBox.y.toFixed(1)}`)
      expect(lastBottom, `${label}:末条与坞不相交`).toBeLessThanOrEqual(dockBox.y + 1)
      expect(lastBottom, `${label}:末条与输入框不相交`).toBeLessThanOrEqual(formBox.y + 1)
      expect(lastBottom, `${label}:末条与遥测条不相交`).toBeLessThanOrEqual(telemetryBox.y + 1)
      expect(Math.abs(dockBox.y - lastBottom - TRANSCRIPT_BOTTOM_PAD), `${label}:末条到坞顶 = 静态留白`).toBeLessThanOrEqual(1)
      // (文件那一组已住进顶部行,不再与转录区下缘有任何几何关系,故这里不再有「与文件栏不相交」一项。)

      // 从**对话面板内底**量到末条底边 = 坞高 + 静态留白(坞底边 == 面板内容盒底边)。
      // 文件栏**不在这一项里** —— 它已升格为工作台级底栏(在外壳网格第三行),不再占对话面板内部空间。
      const stack = dockBox.height + TRANSCRIPT_BOTTOM_PAD
      const measured = (inner.y + inner.height) - lastBottom
      console.log(`[file bar inset] ${label}:面板内底 − 末条底 ${measured.toFixed(1)} / 坞 ${dockBox.height.toFixed(1)} + 留白 ${TRANSCRIPT_BOTTOM_PAD} = ${stack.toFixed(1)}`)
      expect(Math.abs(measured - stack), `${label}:面板内底到末条 = 坞高 + 静态留白`).toBeLessThanOrEqual(1)
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

test('文件面板四态:loading / ready(有数据)/ empty / error 均可达;Esc 收起悬浮窗体', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // loading → ready。
  await clickFileRow(page, README)
  await expect(page.locator(FILE_PANEL)).toHaveAttribute('data-status', 'loading')
  await expect(page.locator(FILE_PANEL)).toHaveAttribute('data-status', 'ready')
  await expect(page.locator(FILE_PANEL).locator('.file-line').first()).toBeVisible()

  // Esc 收起**悬浮**窗体(不占 tab)→ 条上仍无文件项;再点树行即原样恢复(关闭 ≠ 删除)。
  await page.keyboard.press('Escape')
  await expect(page.locator(FILE_PANEL)).toHaveCount(0)
  await expect(page.locator(FILE_TAB), '悬浮窗体不占 tab').toHaveCount(0)
  await clickFileRow(page, README)
  await expect(page.locator(FILE_PANEL)).toHaveAttribute('data-status', 'ready')

  // empty:切到写作助手 → 展开 assets → 打开二进制文件(不可预览)。
  await selectAgent(page, AGENT_NAMES['zh-CN'].writing)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  // 打开集**按 (Agent, 项目) 分域**:换了 Agent / 项目即换域,先前那个域的文件不再出现在条上
  // (它没被关掉 —— 切回原域会原样恢复),于是这里回到常驻的教学性空态。
  await expect(page.locator(FILE_TAB)).toHaveCount(0)
  await expect(page.locator(FILE_BAR)).toHaveCount(1)
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

  // 悬浮窗体打开时:把转录上滚,让「回到底部」出现 —— 它必须落在窗体**之下**(不被遮挡),
  // 且与坞、文件组在纵向次序上自上而下依次排开(坞已并入面板流内,不再是浮层)。
  await page.getByRole('log').focus()
  await page.keyboard.press('Home')
  const button = page.getByRole('button', { name: '回到底部' })
  await expect(button).toBeVisible()
  const buttonBox = await button.boundingBox()
  const panelBox = await page.locator(FILE_PANEL).boundingBox()
  const dockBox = await page.locator('.composer-dock').boundingBox()
  expect(buttonBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  expect(dockBox).not.toBeNull()
  if (buttonBox === null || panelBox === null || dockBox === null) return
  console.log(`[file panel occlude] 按钮顶 ${buttonBox.y.toFixed(1)} / 面板底 ${(panelBox.y + panelBox.height).toFixed(1)} / 坞顶 ${dockBox.y.toFixed(1)}`)
  // 面板底边 ≤ 按钮顶边 → 按钮完整露在面板之外(不被遮挡)。
  expect(panelBox.y + panelBox.height, '面板不遮「回到底部」').toBeLessThanOrEqual(buttonBox.y + 1)
  // 两者纵向不相交:回到底部 → 坞,自上而下(坞顶就是输入框顶)。
  expect(buttonBox.y + buttonBox.height, '回到底部不覆盖坞').toBeLessThanOrEqual(dockBox.y + 1)
  // 顶部行里的文件组仍在坞之上 —— 次序整体是 文件组 → … → 回到底部 → 坞。
  const barBox = await page.locator(FILE_BAR).boundingBox()
  expect(barBox, '文件组有几何盒').not.toBeNull()
  if (barBox !== null) expect(barBox.y + barBox.height, '文件组在坞之上').toBeLessThanOrEqual(dockBox.y + 1)

  // 停靠之后:文件栏 tab 带上文件树里的状态芯片(README 是 modified)。
  await dockLastFloating(page)
  const chip = page.locator(`${FILE_TAB} .file-tab__chip`)
  await expect(chip).toHaveCount(1)
  await expect(chip).toHaveAttribute('data-state', 'modified')
  await expect(chip).toHaveText('已修改')
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

// 某个文件窗口的几何(多窗口下每个窗口各有各的)。
function panelRectOf(page: Page, path: string): Promise<Rect> {
  return page.locator(`${FILE_PANEL}[data-file-path="${path}"]`).evaluate((element) => {
    const b = element.getBoundingClientRect()
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  })
}

// 关掉**全部悬浮**窗体(多窗口下一次 Esc 只关聚焦的那一个):按到没有悬浮窗为止。
// 停靠窗体不吃 Esc(它是区域内容区里的一块,不覆盖别的浮层),故这里只针对悬浮窗体 ——
// 会盖住下拉 / 别的浮层的正是它们。
async function closeAllFileWindows(page: Page): Promise<void> {
  for (let guard = 0; guard < 12; guard += 1) {
    const floating = page.locator(`${FILE_PANEL}[data-mode="floating"]`)
    if (await floating.count() === 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(40)
  }
  expect(await page.locator(`${FILE_PANEL}[data-mode="floating"]`).count(), '悬浮窗体都关掉了').toBe(0)
}

// 窗口的**下边界**(= 输入框顶 − 回到底部钮的预留 − 一档外边距),与 file-panel.vue 的 bottomLimit 同口径。
const PANEL_JUMP_RESERVE = 44 + 2 * 8
async function panelBottomLimit(page: Page): Promise<number> {
  // 下界已去掉:窗体可以走到视口下缘(留一档外边距)。保留这个函数名只为「预期下界」的语义清晰。
  const viewport = await transcriptAreaRect(page)
  return viewport.height - PANEL_MARGIN
}

// 顶部行下沿 + 一档外边距 = 窗体**顶边**的下限(唯一保留的约束:拖拽手柄不许被顶部 chrome 盖住)。
async function panelTopLimit(page: Page): Promise<number> {
  const heading = await page.locator('.conversation-heading').boundingBox()
  return (heading?.y ?? 0) + (heading?.height ?? 0) + PANEL_MARGIN
}

// 输入框中心的 elementFromPoint:用来机械地证明「窗体拖到输入区纬度后输入框仍可被命中」。
async function composerHit(page: Page): Promise<string> {
  return page.evaluate(() => {
    const form = document.querySelector('.composer-form')
    if (!(form instanceof HTMLElement)) return 'no-composer'
    const rect = form.getBoundingClientRect()
    const element = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    if (element === null) return 'null'
    if (element.closest('.file-panel') !== null) return 'file-panel'
    if (element.closest('.composer-form') !== null) return 'composer'
    return element.tagName
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
  const header = panel.locator('.dl-window__meta')
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
  const header = page.locator('.dl-window__meta')
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
  // 拖动 = **纯平移**:宽高逐值不变(曾经这里会把高度压小 —— 下边界被取 min、顶边继续下移)。
  expect(moved.width, '拖动:宽不变').toBeCloseTo(reset.width, 0)
  expect(moved.height, '拖动:高不变').toBeCloseTo(reset.height, 0)

  // ② 边缘钳制:拖动到**区域右 / 下边缘带**现在会触发切分(落点语义已统一 —— 拖悬浮窗体与拖 tab
  //    共用同一个解析器,见 regions.spec 的切分 / 并入用例),故「拖到边缘被钳回」这一步改用
  //    **方向键**核:键盘与拖动共用同一套平移钳制,且键盘路径完全不触发落点。
  await header.focus()
  await expect(header).toBeFocused()
  for (let step = 0; step < 24; step += 1) await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(async () => { const rect = await panelRectInArea(page); return Math.round(rect.x + rect.width) }, { message: '右缘贴到视口内边距' }).toBe(Math.round(area.width - PANEL_MARGIN))
  for (let step = 0; step < 24; step += 1) await page.keyboard.press('Shift+ArrowDown')
  const floor = await panelBottomLimit(page)
  await expect.poll(async () => { const rect = await panelRectInArea(page); return Math.round(rect.y + rect.height) }, { message: '下缘贴到视口内边距' }).toBe(Math.round(floor))
  const clampedBottomRight = await panelRectInArea(page)
  console.log(`[panel drag] 方向键撞右 / 下缘 → ${JSON.stringify(clampedBottomRight)}`)
  // 平移不改尺寸(拖动 / 方向键共用同一套 clampRect:只平移,不压盒子)。
  expect(clampedBottomRight.width, '边缘钳制:宽不变').toBeCloseTo(reset.width, 0)
  expect(clampedBottomRight.height, '边缘钳制:高不变').toBeCloseTo(reset.height, 0)

  // 再往左上撞到钳制面 → 被钳回内边距。
  // 这里**只做横向拖拽**:位移大到足以撞到左缘,指针又全程停在视口内且不离开窗口的横向范围 ——
  // 指针一旦跑出视口,webkit 会停止投递后续指针事件,斜向 / 超长拖拽会中途失灵(实测,引擎的
  // 指针语义,不是产品的钳制行为)。纵向的钳制改由方向键核(见下),两轴都不漏。
  box = await header.boundingBox()
  if (box === null) return
  // 向左上撞到钳制面 → 被钳回内边距。
  // 这一步改用**方向键**(Shift = 大步长 64):超长拖拽会让指针离开窗口或视口,webkit 随之停止投递
  // 后续指针事件、拖拽只走到开头一小段(实测 —— 引擎的指针语义,不是产品的钳制行为);
  // 键盘走的是**同一套 clampRect**,两轴相位的钳制照样被验证,且结果确定。
  await header.focus()
  // 先确认焦点真在标题栏上再按键 —— 否则按键会被吞掉,后面的断言读到的是一次未发生的移动(满载时实测)。
  await expect(header).toBeFocused()
  for (let step = 0; step < 10; step += 1) await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(async () => (await panelRectInArea(page)).x, { message: '向左撞到视口内边距' }).toBe(PANEL_MARGIN)
  for (let step = 0; step < 12; step += 1) await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(async () => (await panelRectInArea(page)).y, { message: '向上撞到视口上缘内边距' }).toBe(PANEL_MARGIN)
  const clampedLeft = await panelRectInArea(page)
  console.log(`[panel drag] Shift+← ×10 / Shift+↑ ×12 → ${JSON.stringify(clampedLeft)}`)
  expect(clampedLeft.width, '平移不改尺寸').toBeCloseTo(reset.width, 0)
  expect(clampedLeft.height, '平移不改尺寸').toBeCloseTo(reset.height, 0)

  // 可越出对话面板:窗口被推到视口左缘后**确实越出了对话面板的左缘**(范围是整个视口)。
  const conversationBox = await page.locator('.conversation').boundingBox()
  expect(conversationBox).not.toBeNull()
  if (conversationBox !== null) {
    console.log(`[panel drag] 窗口 x ${clampedLeft.x.toFixed(1)} / 对话面板左缘 ${conversationBox.x.toFixed(1)}`)
    expect(clampedLeft.x, '确实越出了对话面板').toBeLessThan(conversationBox.x)
  }

  // 视口收缩后**重新钳一次**(浮动窗口最经典的缺陷:视口变小后窗口留在界外)。
  // 此刻窗口贴在左上内边距,收缩到 900×700 后仍在界内 —— 但这两个尺寸都必须被重新钳过。
  await page.setViewportSize({ width: 900, height: 700 })
  await expect.poll(async () => {
    const rect = await panelRectInArea(page)
    return rect.x + rect.width <= 900 - PANEL_MARGIN + 1 && rect.y + rect.height <= 700 - PANEL_MARGIN + 1
  }, { message: '视口收缩后窗口被重新钳入' }).toBe(true)
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })

  // ③ (原「双击标题栏 → 复位默认几何」已删除:双击标题栏这一手势在本单元改指「停靠到内容区」,
  //    「复位几何」这个能力随之不存在了 —— 见本单元的状态转换表与悬浮窗体一节的说明。)
  // ④ 键盘:方向键按步长移动,Shift 大步长。基线取当前位置(不再有「复位」可回)。
  // 几何写入样式是同步的,但**布局**要到下一帧才反映出来(实测:紧接按键读 rect 会读到上一帧),
  // 故这里用 expect.poll 等它落定。
  const base = await panelRectInArea(page)
  await header.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expectPanelRect(page, { x: base.x + 16, y: base.y + 16 }, '方向键各移 16')
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
  const corners = await page.locator('.dl-window__resize--corner').evaluateAll((elements) => elements.map((el) => {
    const rect = el.getBoundingClientRect()
    return { w: rect.width, h: rect.height }
  }))
  console.log(`[panel resize] 四角 ${JSON.stringify(corners)}`)
  expect(corners.length, '四角手柄齐备').toBe(4)
  for (const corner of corners) {
    expect(corner.w, '角手柄宽 ≥44').toBeGreaterThanOrEqual(43.5)
    expect(corner.h, '角手柄高 ≥44').toBeGreaterThanOrEqual(43.5)
  }
  const edgeBox = await page.locator('.dl-window__resize--e').boundingBox()
  expect(edgeBox?.width ?? 0, '边条宽 ≈8').toBeLessThanOrEqual(9)

  // ② 分隔条的 ARIA:role / orientation / valuenow / min / max / controls。
  const east = page.locator('.dl-window__resize--e')
  await expect(east).toHaveAttribute('role', 'separator')
  await expect(east).toHaveAttribute('aria-orientation', 'vertical')
  await expect(east).toHaveAttribute('aria-controls', 'file-panel-body')
  await expect(east).toHaveAttribute('aria-valuemin', String(Math.round(PANEL_MIN_W)))
  await expect(east).toHaveAttribute('aria-valuemax', String(Math.round(area.width - 2 * PANEL_MARGIN)))
  const nowBefore = Number(await east.getAttribute('aria-valuenow'))
  console.log(`[panel resize] E aria valuenow ${nowBefore} min 320 max ${Math.round(area.width - 2 * PANEL_MARGIN)}`)
  expect(Math.abs(nowBefore - reset.width), 'aria-valuenow = 当前宽').toBeLessThanOrEqual(0.5)
  const south = page.locator('.dl-window__resize--s')
  await expect(south).toHaveAttribute('aria-orientation', 'horizontal')
  await expect(south).toHaveAttribute('aria-valuemax', String(Math.round(area.height - 2 * PANEL_MARGIN)))

  // ③ 拖四角:尺寸改变且在 min/max 内(临界值:最小 320×200,最大 = 转录区)。
  const se = await page.locator('.dl-window__resize--se').boundingBox()
  expect(se).not.toBeNull()
  if (se === null) return
  await dragFromTo(page, se.x + se.width / 2, se.y + se.height / 2, 120, 80)
  const bigger = await panelRectInArea(page)
  console.log(`[panel resize] SE 拖 +120,+80 → ${JSON.stringify(bigger)}`)
  // ⑤ 的硬约束:缩放时高度可以变(压小是合法的),但**下缘不得越过「输入框之上」**。
  expect(Math.abs(bigger.width - (reset.width + 120)), 'SE 拖:宽 +120').toBeLessThanOrEqual(1)
  expect(bigger.y + bigger.height, 'SE 拖:下缘不越出视口').toBeLessThanOrEqual((await panelBottomLimit(page)) + 1)
  const se2 = await page.locator('.dl-window__resize--se').boundingBox()
  if (se2 === null) return
  await dragFromTo(page, se2.x + se2.width / 2, se2.y + se2.height / 2, -3000, -3000)
  // 把指针带回视口内并**显式再抬一次**:出界拖拽的 pointerup 可能送不到页面,
  // 指针会一直处于按下态,下一次拖拽就再也收不到 move(webkit 实测)。
  await page.mouse.move(640, 400)
  await page.mouse.up()
  const minimum = await panelRectInArea(page)
  console.log(`[panel resize] SE 拖到极限 → ${JSON.stringify(minimum)}`)
  await expectPanelRect(page, { width: PANEL_MIN_W, height: PANEL_MIN_H }, '缩到最小(320×200)')
  const se3 = await page.locator('.dl-window__resize--se').boundingBox()
  if (se3 === null) return
  await dragFromTo(page, se3.x + se3.width / 2, se3.y + se3.height / 2, 3000, 3000)
  // 把指针带回视口内并**显式再抬一次**:出界拖拽的 pointerup 可能送不到页面,
  // 指针会一直处于按下态,下一次拖拽就再也收不到 move(webkit 实测)。
  await page.mouse.move(640, 400)
  await page.mouse.up()
  const maximum = await panelRectInArea(page)
  console.log(`[panel resize] SE 拖到最大 → ${JSON.stringify(maximum)}`)
  // 宽度到视口上限;高度到**「输入框之上」**那条线为止(不再是视口下缘 —— 见 ⑤ 的硬约束)。
  await expectPanelRect(page, { width: area.width - 2 * PANEL_MARGIN }, '放大到视口宽上限')
  expect(await panelBottomLimit(page) - (maximum.y + maximum.height), '放大到视口上限后下缘贴住视口下缘').toBeLessThanOrEqual(1)
  await expect(south).toHaveAttribute('aria-valuemax', String(Math.round(area.height - 2 * PANEL_MARGIN)))

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

test('文件窗口按 (Agent, 项目) 分域:悬浮窗几何 + 条上 tab 都跟着分域走,切回来原样恢复', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 一个**悬浮**窗(带自己的几何)+ 一个**停靠** tab(占条):两种归属都要按分域保存与恢复。
  await clickFileRow(page, README)
  const floating = page.locator(`${FILE_PANEL}[data-mode="floating"]`)
  const header = floating.locator('.dl-window__meta')
  const headerBox = await header.boundingBox()
  expect(headerBox, '悬浮窗标题栏有几何盒').not.toBeNull()
  if (headerBox !== null) await dragFromTo(page, headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2, 40, 20)
  const placed = await panelRectOf(page, README)
  console.log(`[file domain] 摆好的悬浮窗 ${JSON.stringify(placed)}`)
  await clickFileRow(page, PROGRESS)
  await dockLastFloating(page)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)

  // 换会话(同项目、同 Agent = 同一分域)→ 悬浮窗与 tab 都不变。
  await clickTab(page, HEADINGS['zh-CN'].roadmap)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"][data-file-path="README.md"]`), '换会话后分域不变').toHaveCount(1)
  await expect(page.locator(`${FILE_TAB}[data-file-path="progress.csv"]`), '换会话后 tab 不变').toHaveCount(1)

  // 换项目(knowledge-base)—— 分域换成新的一对 → 条上与浮层里都不再有旧域的东西。
  // 新域没有会话 ⇒ 根区域既无成员又无子区域 ⇒ 引导页(没有转录,故不能等 role="log")。
  await page.locator('.project-item', { hasText: PROJECT_NAMES.planning[1] }).locator('.project-row__button').click()
  await expect(page.locator('.onboarding'), '无会话项目 → 引导页').toHaveCount(1)
  await expect(page.locator(FILE_TAB), '换项目即换域,条上不再有旧域的文件').toHaveCount(0)
  await expect(page.locator(FILE_PANEL), '浮层里也不再有旧域的窗口').toHaveCount(0)
  // 侧栏仍是范围指示的一半(本批不做 Agent 栏,故只断言侧栏这一半)。
  await expect(page.locator('.project-item', { hasText: PROJECT_NAMES.planning[1] }).locator('.project-row__button')).toHaveAttribute('aria-current', 'true')

  // 在新域里开一个文件并停靠 → 条上只有它。
  const tree = page.locator('.project-item', { hasText: PROJECT_NAMES.planning[1] }).locator('.project-tree')
  await tree.locator('.entry-row[data-kind="directory"]', { hasText: 'docs' }).first().locator('.entry-row__button').click()
  await openDockedFile(page, 'index.md')
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  const labels = await fileTabLabels(page)
  console.log(`[file bar] 新域 tab ${JSON.stringify(labels)}`)
  expect(labels, '新域只有新域的文件').toEqual(['index.md'])

  // 切回第一个项目 → 旧域**原样恢复**:tab 与悬浮窗都在,悬浮窗回到记忆的几何。
  await page.locator('.project-item', { hasText: PROJECT_NAMES.planning[0] }).locator('.project-row__button').click()
  await waitForStable(page)
  await expect(page.locator(`${FILE_TAB}[data-file-path="progress.csv"]`), '切回来旧域的 tab 原样恢复').toHaveCount(1)
  await expect(page.locator(FILE_TAB), '恢复的是旧域那一份,不掺新域').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"][data-file-path="README.md"]`), '悬浮窗也原样恢复').toHaveCount(1)
  await expect.poll(async () => Math.round((await panelRectOf(page, README)).x), { message: '悬浮窗恢复的位置与原分域一致' }).toBe(Math.round(placed.x))
  const restored = await panelRectOf(page, README)
  console.log(`[file domain] 恢复后的悬浮窗 ${JSON.stringify(restored)}`)
  expect(Math.abs(restored.y - placed.y), '纵向也一致').toBeLessThanOrEqual(1)
  expect(Math.abs(restored.width - placed.width), '宽度也一致').toBeLessThanOrEqual(1)
  expect(Math.abs(restored.height - placed.height), '高度也一致').toBeLessThanOrEqual(1)
})

test('文件 tab:主标签是文件名、条内不出现项目名(分域之后项目是重复信息)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openDockedFile(page, README)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  const tab = page.locator(FILE_TAB).first()

  // 主标签 = **文件名**。
  await expect(tab.locator('.file-tab__label'), '主标签是文件名').toHaveText('README.md')
  // 负向断言:条内不再有项目标识 / 项目名文本(第九轮撤销跨项目后,"再标一次项目"是重复信息)。
  await expect(page.locator('.file-tab__mark'), '项目首字标识已删除').toHaveCount(0)
  const barText = await page.locator(FILE_BAR).innerText()
  console.log(`[file tab] 栏内文本 ${JSON.stringify(barText)}`)
  expect(barText, '条内不出现项目名').not.toContain(PROJECT_NAMES.planning[0])
  expect(barText, '条内不出现项目名').not.toContain(PROJECT_NAMES.planning[1])

  // title = 「文件名 · 域内路径 · 打开方式」—— 项目名不再出现(项目由侧栏当前项目给出)。
  const title = await tab.getAttribute('title')
  console.log(`[file tab] title = ${JSON.stringify(title)}`)
  expect(title, 'title 含文件名').toContain('README.md')
  expect(title, 'title 含域内完整路径').toContain('README.md')
  expect(title, 'title 的字段分隔符').toContain(' · ')
  expect(title, 'title 不再重复项目名').not.toContain(PROJECT_NAMES.planning[0])

  // 换到另一个项目(另一 Agent 的 benchmarks)→ 新域自己的 README,条上仍只有一条、仍不写项目名。
  await selectAgent(page, AGENT_NAMES['zh-CN'].research)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await page.locator('.project-item', { hasText: PROJECT_NAMES.research[1] }).locator('.project-row__button').click()
  await expect(page.locator('.project-item', { hasText: PROJECT_NAMES.research[1] }).locator('.entry-row[data-kind="file"]', { hasText: README })).toBeVisible()
  await expect(page.locator(FILE_TAB), '换 Agent + 换项目 = 换域,条上先是空的').toHaveCount(0)
  await openDockedFile(page, README)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  const crossLabels = await fileTabLabels(page)
  console.log(`[file tab] 新域标签 ${JSON.stringify(crossLabels)}`)
  expect(crossLabels, '新域主标签仍是文件名').toEqual([README])
  const crossText = await page.locator(FILE_BAR).innerText()
  expect(crossText, '新域条内同样不写项目名').not.toContain(PROJECT_NAMES.research[1])
})

test('多悬浮窗口:各自独立几何 / 级联 / 聚焦置顶 / F6 循环 / Esc 收起 ≠ 删除 / 可覆盖输入区', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  for (const name of [README, PROGRESS, GITIGNORE]) await clickFileRow(page, name)
  const panel = (path: string): Locator => page.locator(`${FILE_PANEL}[data-file-path="${path}"]`)

  // ① 三个文件 = 三个**同时可见的悬浮窗口**。悬浮窗体**不占 tab** —— 文件条上仍是空的
  //    (它们不是区域成员,只有停靠窗体才上条)。
  await expect(page.locator(FILE_PANEL), '三个文件三个窗口').toHaveCount(3)
  await expect(page.locator(FILE_TAB), '悬浮窗体不占 tab').toHaveCount(0)
  for (const name of [README, PROGRESS, GITIGNORE]) await expect(panel(name), `${name} 的窗口在场`).toHaveCount(1)
  // **每个窗口渲染的是自己的内容**(不是骨架屏):内容按 (域, 路径) 各存一份,互不覆盖。
  for (const name of [README, PROGRESS, GITIGNORE]) {
    await expect(panel(name).locator('#file-panel-body .file-line').first(), `${name} 的内容渲染出来了`).toBeVisible()
  }
  await expect(page.locator(`${FILE_PANEL}[data-status="loading"]`), '没有窗口停在骨架屏').toHaveCount(0)
  // 在多窗口之间来回切几轮:任何一轮都不得回到骨架屏(内容命中缓存,不重新拉取)。
  // 用 F6 循环而不是点击 —— 级联下被压住的窗口点不到(命中区被上面的窗口与自己的 44px 手柄挡住),
  // 而 F6 走的是同一套「切到某个窗口」的路径。
  for (let round = 0; round < 3; round += 1) {
    await page.keyboard.press('F6')
    await expect.poll(async () => page.locator(`${FILE_PANEL}[data-status="loading"]`).count(), { message: `第 ${round + 1} 轮聚焦后:没有骨架屏` }).toBe(0)
  }
  console.log(`[multi window] 三轮切换后骨架屏计数 ${await page.locator(`${FILE_PANEL}[data-status="loading"]`).count()}`)

  // ② 级联:新窗口按小偏移错开,不完全重叠(窗口管理器的惯例)。
  const windowPositions = (): Promise<string[]> => page.locator(FILE_PANEL).evaluateAll((els) => els.map((el) => {
    const rect = el.getBoundingClientRect()
    return `${Math.round(rect.x)},${Math.round(rect.y)}`
  }))
  // 位置在焦点切换后会随级联序重算,故用 poll 等它落定(几何断言在本仓一律如此),不读瞬时值。
  await expect.poll(async () => new Set(await windowPositions()).size, { message: '三个窗口位置两两不同(级联偏移生效)' }).toBe(3)
  const boxes = await page.locator(FILE_PANEL).evaluateAll((els) => els.map((el) => {
    const rect = el.getBoundingClientRect()
    return { path: el.getAttribute('data-file-path'), x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width) }
  }))
  console.log(`[multi window] 三个窗口 ${JSON.stringify(boxes)}`)

  // ③ 聚焦置顶:点最下面那个窗口(README 最先开 → 栈位最低),它的栈位应变最大。
  // 层序由**数组顺序 / DOM 顺序**表达(整层窗口共用 --dl-z-overlay,前后关系靠 DOM 顺序),
  // 故这里量的是它在 .file-panel 兄弟里的位次:位次越大越在上。
  const stackIndexOf = (path: string): Promise<number> => panel(path).evaluate((el) => Array.from(document.querySelectorAll('.file-panel')).indexOf(el))
  const stackBefore = { readme: await stackIndexOf(README), progress: await stackIndexOf(PROGRESS), gitignore: await stackIndexOf(GITIGNORE) }
  console.log(`[multi window] 聚焦前栈位 ${JSON.stringify(stackBefore)}`)
  expect(stackBefore.readme, '先开的那一个在最下').toBeLessThan(stackBefore.gitignore)
  // 点它**没被盖住**的那一条(级联向右下错开,故最下面那个窗口的左侧一条是露出来的);
  // 窗口的四周是 44px 的缩放手柄,点得离边远一点。
  const readmeBody = panel(README).locator('.file-panel__body')
  await readmeBody.click({ position: { x: 14, y: 120 } })
  await expect.poll(async () => stackIndexOf(README), { message: '点谁谁在上' }).toBeGreaterThan(await stackIndexOf(GITIGNORE))
  await expect(panel(README)).toHaveAttribute('data-focused', 'true')
  await expect(panel(GITIGNORE)).toHaveAttribute('data-focused', 'false')

  // ④ 每个窗口各自独立:拖 README 的窗口不会动到其他两个。
  const others = await page.locator(FILE_PANEL).evaluateAll((els) => els.map((el) => {
    const rect = el.getBoundingClientRect()
    return { path: el.getAttribute('data-file-path'), x: Math.round(rect.x), y: Math.round(rect.y) }
  }))
  const readmeBox = await panel(README).locator('.dl-window__meta').boundingBox()
  expect(readmeBox).not.toBeNull()
  if (readmeBox !== null) {
    await dragFromTo(page, readmeBox.x + readmeBox.width / 2, readmeBox.y + readmeBox.height / 2, 60, 40)
    await expect.poll(async () => (await panel(README).boundingBox())?.x ?? 0, { message: 'README 的窗口动了' }).toBeGreaterThan(readmeBox.x)
  }
  const after = await page.locator(FILE_PANEL).evaluateAll((els) => els.map((el) => {
    const rect = el.getBoundingClientRect()
    return { path: el.getAttribute('data-file-path'), x: Math.round(rect.x), y: Math.round(rect.y) }
  }))
  for (const other of others.filter((item) => item.path !== README)) {
    const now = after.find((item) => item.path === other.path)
    expect(now?.x, `${other.path} 的窗口没被带着动`).toBe(other.x)
    expect(now?.y, `${other.path} 的窗口没被带着动`).toBe(other.y)
  }

  // ⑤ 下边界:把窗口推到右下角 → 底 / 右缘停在视口内边距上。
  //    这里用**方向键**而不是拖动:拖到区域边缘带现在会触发切分(落点语义统一,见 regions.spec),
  //    而键盘与拖动共用同一套平移钳制,且完全不触发落点。
  const floor = await panelBottomLimit(page)
  const areaForClamp = await transcriptAreaRect(page)
  const readmeHeader = panel(README).locator('.dl-window__meta')
  await readmeHeader.focus()
  await expect(readmeHeader).toBeFocused()
  for (let step = 0; step < 20; step += 1) await page.keyboard.press('Shift+ArrowRight')
  for (let step = 0; step < 20; step += 1) await page.keyboard.press('Shift+ArrowDown')
  const dragged = await panelRectOf(page, README)
  console.log(`[multi window] 键盘推到右下 → ${JSON.stringify(dragged)} / 视口下缘内边距 ${floor.toFixed(1)}`)
  // 下界 / 右界已去掉:窗口能走到视口下 / 右缘附近(留一档外边距)。
  expect(dragged.y + dragged.height, '能到达视口下缘').toBeLessThanOrEqual(floor + 1)
  expect(dragged.x + dragged.width, '能到达视口右缘').toBeLessThanOrEqual(areaForClamp.width - PANEL_MARGIN + 1)
  expect(dragged.y, '顶边不受顶部行下沿约束').toBeGreaterThanOrEqual(PANEL_MARGIN - 1)
  // ---- 两层 z 模型的机械证明:坞并入第 1 层(应用外壳)之后,第 2 层(文件窗体)可以盖住它。
  //      先把窗口推到能压住侧栏 / 标签条的纬度,逐点 elementFromPoint;再把它推到**输入区纬度**,
  //      证明输入框中心的命中从「输入区」翻转为「文件窗体」。 ----
  // 在某个坐标上用 elementFromPoint 判定命中归属(分 层 2 的窗体 / 层 1 的坞、标签条、侧栏)。
  async function pointHit(selector: string): Promise<string> {
    return page.evaluate((sel: string) => {
      const element = document.querySelector(sel)
      if (!(element instanceof HTMLElement)) return 'no-element'
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      if (hit === null) return 'null'
      if (hit.closest('.file-panel') !== null) return 'file-panel'
      if (hit.closest('.composer-dock') !== null) return 'composer'
      if (hit.closest('.conversation-heading') !== null) return 'tabs'
      if (hit.closest('.workspace-sidebar') !== null) return 'sidebar'
      return hit.tagName
    }, selector)
  }
  await panel(README).locator('.dl-window__meta').focus()
  await expect(panel(README).locator('.dl-window__meta')).toBeFocused()
  for (let step = 0; step < 8; step += 1) await page.keyboard.press('Shift+ArrowUp')
  // 横向也走键盘(Shift 大步长 64):小步拖拽在 webkit 上仍会中途停止投递(实测只走到 1/3),
  // 键盘路径确定且与拖拽共用同一套平移钳制。
  for (let step = 0; step < 8; step += 1) await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(async () => Math.round((await panelRectOf(page, README)).x), { message: '能盖住左侧栏' }).toBe(PANEL_MARGIN)
  const covering = await panelRectOf(page, README)
  console.log(`[multi window] 两层测定时的窗体几何 ${JSON.stringify(covering)}`)
  const tabsHit = await pointHit('.conversation-tabs')
  const sidebarHit = await pointHit('.project-list')
  const zValues = await page.evaluate(() => {
    const z = (selector: string): string => {
      const element = document.querySelector(selector)
      return element instanceof HTMLElement ? getComputedStyle(element).zIndex : 'n/a'
    }
    return { zPanel: z('.file-panel'), zDock: z('.composer-dock'), zHeading: z('.conversation-heading'), zSidebar: z('.workspace-sidebar') }
  })
  console.log(`[multi window] 外壳命中 标签条→${tabsHit} / 侧栏→${sidebarHit}`)
  console.log(`[multi window] z 窗体 ${zValues.zPanel} / 输入坞 ${zValues.zDock} / 顶部行 ${zValues.zHeading} / 侧栏 ${zValues.zSidebar}`)
  // 窗体(第 2 层)盖住外壳(第 1 层):标签条与侧栏都被它压住。
  expect(tabsHit, '标签条中心命中的是文件窗体').toBe('file-panel')
  expect(sidebarHit, '侧栏行中心命中的是文件窗体').toBe('file-panel')
  expect(Number(zValues.zPanel), '窗体层序高于外壳').toBeGreaterThan(Number(zValues.zHeading === 'auto' ? 0 : zValues.zHeading))
  // 输入坞已并入第 1 层:不再设 z-index(不再是压在窗体之上的浮层)。
  expect(zValues.zDock, '输入坞已回到第 1 层(不设 z-index)').toBe('auto')
  // 此刻窗体未盖住输入区(停在左上),点输入框仍可聚焦。
  await page.locator('.composer-form textarea').click()
  // 未被覆盖时输入框仍可聚焦(输入框 id 按会话唯一:workspace-composer-<sessionId>)。
  expect(await page.evaluate(() => document.activeElement?.id ?? ''), '未被覆盖时输入框仍可聚焦').toMatch(/^workspace-composer-/)

  // 把窗体推到**输入区纬度**:坞在第 1 层,故输入框中心的命中翻转为文件窗体(用户要的「能被文件窗体覆盖」)。
  await panel(README).locator('.dl-window__meta').focus()
  await expect(panel(README).locator('.dl-window__meta')).toBeFocused()
  for (let step = 0; step < 5; step += 1) await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(async () => {
    const box = await panel(README).boundingBox()
    const input = await page.locator('.composer-form').boundingBox()
    if (box === null || input === null) return false
    const centreY = input.y + input.height / 2
    return box.y <= centreY && box.y + box.height >= centreY
  }, { message: '窗体已推到输入区纬度' }).toBe(true)
  const composerHit = await pointHit('.composer-form')
  const coveringRect = await panelRectOf(page, README)
  console.log(`[multi window] 窗体推入输入区后几何 ${JSON.stringify(coveringRect)} / 输入框中心命中 → ${composerHit}`)
  expect(composerHit, '窗体盖住输入区后,输入框中心命中的是文件窗体').toBe('file-panel')

  // ⑥ F6 在可见窗口之间循环焦点。
  await page.locator('.workspace-page').click({ position: { x: 4, y: 4 } })
  await page.keyboard.press('F6')
  const focusedAfterF6 = await page.locator(`${FILE_PANEL}[data-focused="true"]`).getAttribute('data-file-path')
  await page.keyboard.press('F6')
  const focusedAfterF6b = await page.locator(`${FILE_PANEL}[data-focused="true"]`).getAttribute('data-file-path')
  console.log(`[multi window] F6 循环 ${focusedAfterF6} → ${focusedAfterF6b}`)
  expect(focusedAfterF6, 'F6 后恰有一个窗口聚焦').not.toBeNull()
  expect(focusedAfterF6b, 'F6 换到下一个窗口').not.toBe(focusedAfterF6)

  // ⑥b 向上拖到顶:**上界已去掉**,顶边可以到视口顶 + 一档外边距;此时拖拽手柄已被顶部 chrome
  //     盖住 —— 于是必须能从**非鼠标通路**把这个窗口找回来(这是去掉上界的代价与前提)。
  const beforeUp = await panelRectOf(page, README)
  // 向上到顶:用**键盘**推动 —— 向上拖拽会让指针立刻离开窗口(窗口顶边就是它的边界),而指针一旦
  // 离开窗口,引擎就停止投递后续指针事件(实测),上拖必然中途失灵。方向键走的是**同一套平移钳制**,
  // 且不依赖指针,故用它把窗口推到视口上缘(这也正是「手柄被 chrome 盖住后仍能操作」的通路之一)。
  // 方向键的监听在**标题栏**上,故先把焦点交给它(条上按钮在前面的步骤里点过一次,此时它可能被
  // 别的窗口压住 —— 键盘路径本来就是为了绕开「被遮挡」而存在的通路,这里也用它)。
  await panel(README).locator('.dl-window__meta').focus()
  await expect(panel(README).locator('.dl-window__meta')).toBeFocused()
  for (let step = 0; step < 8; step += 1) await page.keyboard.press('Shift+ArrowUp')
  await expect.poll(async () => Math.round((await panelRectOf(page, README)).y), { message: '向上能到视口上缘内边距' }).toBe(PANEL_MARGIN)
  const afterUp = await panelRectOf(page, README)
  console.log(`[multi window] Shift+↑ ×8 → ${JSON.stringify(afterUp)}(原 ${JSON.stringify(beforeUp)})`)
  expect(afterUp.width, '上移:宽不变').toBe(beforeUp.width)
  expect(afterUp.height, '上移:高不变').toBe(beforeUp.height)
  const headingBottom = (await page.locator('.conversation-heading').boundingBox())?.y ?? 0
  expect(afterUp.y, '此时顶边确实在顶部行之上(手柄被 chrome 盖住)').toBeLessThan(headingBottom)
  // 通路②:方向键继续移动它(此刻手柄已被顶部 chrome 盖住,鼠标路径不可用)。
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => Math.round((await panelRectOf(page, README)).y), { message: '方向键能移动它' }).toBe(PANEL_MARGIN + 16)
  // 通路③(Esc 隐藏 + 条上按钮点回来)在下面 ⑦ 里按「当前聚焦窗口」统一核 —— 那里不依赖具体是哪一个。

  // ⑦ Esc 收起**当前聚焦的悬浮窗体**:悬浮窗体不占 tab,故条上本来就为空。
  await page.keyboard.press('Escape')
  await expect.poll(async () => page.locator(`${FILE_PANEL}[data-mode="floating"]`).count(), { message: 'Esc 关掉一个窗口' }).toBe(2)
  await expect(page.locator(FILE_TAB), '悬浮窗体不占 tab').toHaveCount(0)
  // 全部收起(悬浮窗体只吃 Esc;停靠窗体才靠「对话让位 / 关 tab」)。
  await closeAllFileWindows(page)
  await expect(page.locator(FILE_PANEL), '全部收起后一个浮层都不剩').toHaveCount(0)
  // 从文件树再点开 README → 它按**记忆的几何**回来(关闭 ≠ 删除:rect 在收起期间原样留着)。
  await clickFileRow(page, README)
  await expect(panel(README), '点回来即重新显示').toHaveCount(1)
  await expect.poll(async () => Math.round((await panelRectOf(page, README)).y), { message: '回到被收起时的几何' }).toBe(PANEL_MARGIN + 16)
  await expect.poll(async () => Math.round((await panelRectOf(page, README)).x), { message: '横向也回到被收起时的几何' }).toBe(PANEL_MARGIN)
})

test('文件面板:滚轮 / 横向滚动都隔离在面板内,不穿透到背后页面与转录区', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 用**悬浮**窗体:本用例要把它缩到最小以造出溢出,只有悬浮窗体有缩放手柄。
  await clickFileRow(page, README)
  await expect(page.locator(FILE_PANEL)).toBeVisible()
  const body = page.locator('#file-panel-body')
  await expect(body).toBeVisible()

  // 先把「可滚」这件事做实:展开被折叠的未变更段(README 共 24 行),再把面板缩到最小高度,
  // 这样内容区一定溢出 —— 否则「滚轮滚的是内容而不是背景」这条断言会因为没得滚而空过。
  for (let guard = 0; guard < 8; guard += 1) {
    const fold = page.locator('#file-panel-body button.file-line__fold').first()
    if ((await fold.count()) === 0) break
    await fold.click()
  }
  const se = await page.locator('.dl-window__resize--se').boundingBox()
  expect(se, '有 SE 角手柄').not.toBeNull()
  if (se !== null) await dragFromTo(page, se.x + se.width / 2, se.y + se.height / 2, -3000, -3000)
  await expectPanelRect(page, { width: PANEL_MIN_W, height: PANEL_MIN_H }, '缩到最小以制造溢出')

  // ① 内容区**始终是真正的滚动容器**:overflow: auto + 两轴 contain。
  const styles = await body.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      overscrollX: style.overscrollBehaviorX,
      overscrollY: style.overscrollBehaviorY,
    }
  })
  console.log(`[file panel] 内容区 overflow ${styles.overflowX}/${styles.overflowY} overscroll ${styles.overscrollX}/${styles.overscrollY}`)
  expect(styles.overflowY, '内容区纵向 overflow: auto').toBe('auto')
  expect(styles.overflowX, '内容区横向 overflow: auto(横向滚动条不隐藏)').toBe('auto')
  expect(styles.overscrollX, '横向 overscroll-behavior: contain').toBe('contain')
  expect(styles.overscrollY, '纵向 overscroll-behavior: contain').toBe('contain')

  // ② 面板外框也吃掉滚轮(内容不足一屏时,链条由这一层兜住 —— Chrome 144 起 overflow: hidden 的
  //    盒子也参与 overscroll)。面板根自身无溢出,「面」这一层才是承载它的盒子。
  const surface = page.locator('.dl-window__surface')
  const surfaceStyles = await surface.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      overflow: style.overflow,
      overscrollX: style.overscrollBehaviorX,
      overscrollY: style.overscrollBehaviorY,
    }
  })
  console.log(`[file panel] 外框 overflow ${surfaceStyles.overflow} overscroll ${surfaceStyles.overscrollX}/${surfaceStyles.overscrollY}`)
  expect(surfaceStyles.overscrollX, '外框横向 contain').toBe('contain')
  expect(surfaceStyles.overscrollY, '外框纵向 contain').toBe('contain')
  expect(surfaceStyles.overflow, '外框裁剪溢出(圆角 + 隔离)').toBe('hidden')

  // ③ 行为:在内容区上滚轮 → 内容区滚,转录区的 scrollTop **不动**。
  await body.evaluate((element) => {
    element.scrollTop = 0
  })
  const transcript = page.getByRole('log')
  // 让转录区先有一个非零基线(它自己也可滚 —— 面板开着时不该被面板上的滚轮带动)。
  await transcript.evaluate((element) => {
    element.scrollTop = 40
  })
  // 会话可能是「贴底跟随」的,设完值等它稳定再取基线,否则会采到抖动中的残值。
  await page.waitForTimeout(120)
  const before = await transcript.evaluate((element) => element.scrollTop)
  expect(before, '转录区确有非零可滚基线').toBeGreaterThan(0)
  const bodyBox = await body.boundingBox()
  expect(bodyBox, '内容区有几何盒').not.toBeNull()
  if (bodyBox !== null) {
    await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2)
    for (let index = 0; index < 6; index += 1) await page.mouse.wheel(0, 120)
    await page.waitForTimeout(60)
  }
  const afterScroll = await body.evaluate((element) => element.scrollTop)
  const after = await transcript.evaluate((element) => element.scrollTop)
  console.log(`[file panel] 滚轮后 内容区 scrollTop ${afterScroll} 转录区 ${before} → ${after}`)
  expect(afterScroll, '内容区自己滚了').toBeGreaterThan(0)
  expect(after, '转录区没被带着滚').toBe(before)

  // ④ 横向:内容区横向滚到底也不会把页面推向左右(页面 inline 溢出保持不出现)。
  await page.evaluate(() => {
    document.documentElement.scrollLeft = 0
    document.documentElement.scrollTop = 0
  })
  const pageBefore = await page.evaluate(() => ({ x: document.documentElement.scrollLeft, y: document.documentElement.scrollTop }))
  if (bodyBox !== null) {
    await page.mouse.move(bodyBox.x + bodyBox.width / 2, bodyBox.y + bodyBox.height / 2)
    for (let index = 0; index < 6; index += 1) await page.mouse.wheel(160, 0)
    await page.waitForTimeout(60)
  }
  const pageAfter = await page.evaluate(() => ({ x: document.documentElement.scrollLeft, y: document.documentElement.scrollTop }))
  const transcriptAfter = await transcript.evaluate((element) => element.scrollTop)
  console.log(`[file panel] 横向滚后 页面 ${JSON.stringify(pageBefore)} → ${JSON.stringify(pageAfter)},转录区 ${transcriptAfter}`)
  expect(pageAfter, '页面没被横向滚动带动').toEqual(pageBefore)
  expect(transcriptAfter, '横向滚也没带动转录区').toBe(before)

  // ⑤ 横向滚动条未被隐藏:内容区存在横向可滚区,且**没有任何**隐藏滚动条的声明
  //    (headless Chromium / WebKit 用 overlay 滚动条,量厚度恒为 0,故只判「没被禁止」+「真的滚得动」)。
  const overflowInfo = await body.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollbarWidth: getComputedStyle(element).scrollbarWidth,
    scrollLeft: element.scrollLeft,
  }))
  console.log(`[file panel] 内容区 scrollWidth ${overflowInfo.scrollWidth} clientWidth ${overflowInfo.clientWidth} scrollbar-width ${overflowInfo.scrollbarWidth} scrollLeft ${overflowInfo.scrollLeft}`)
  expect(overflowInfo.scrollWidth, '长行造出横向可滚区').toBeGreaterThan(overflowInfo.clientWidth)
  expect(overflowInfo.scrollbarWidth, '未隐藏滚动条(scrollbar-width ≠ none)').not.toBe('none')
  expect(overflowInfo.scrollLeft, '横向确实滚得动(滚动条可操作)').toBeGreaterThan(0)
})


test('最近关闭:只列**本域**的、两段式行(域内目录路径)、点回来即重新打开', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // weekly-report 里开两个再全关掉(留进本域的「最近关闭」)。
  await openDockedFile(page, README)
  await openDockedFile(page, PROGRESS)
  for (let index = 0; index < 2; index += 1) {
    await page.locator('.file-tab-slot').first().hover()
    await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  }
  await expect(page.locator(FILE_TAB)).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator(FILE_PANEL)).toHaveCount(0)

  // 下拉的「文件」页 = 本域已打开的 + 本域关掉过的;这里只剩后半段。
  await openSwitcher(page)
  await page.locator('.conversation-filter__option', { hasText: '文件' }).click()
  const titles = await page.locator('.conversation-group__title').allTextContents()
  console.log(`[file menu] 分组 ${JSON.stringify(titles)}`)
  expect(titles, '无打开项时只剩「最近关闭」').toEqual(['最近关闭'])
  const rows = await page.locator('.conversation-row[data-file-option]').evaluateAll((elements) => elements.map((el) => ({
    name: el.querySelector('.conversation-row__name')?.textContent ?? '',
    path: el.querySelector('.conversation-row__path')?.textContent ?? '',
  })))
  console.log(`[file menu] 行 ${JSON.stringify(rows)}`)
  expect(rows.length, '两条关闭的文件都在').toBe(2)
  for (const row of rows) expect(row.path, '次行是域内目录路径').toBe('/')
  const panelText = await page.locator(SWITCHER_PANEL).innerText()
  expect(panelText, '最近列表不写项目名').not.toContain(PROJECT_NAMES.planning[0])

  // 点其中一条 → 窗口重新打开该文件,条上重新出现它的项(关闭 ≠ 删除)。
  await page.locator('.conversation-row[data-file-option]', { hasText: README }).click()
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(page.locator(`${FILE_PANEL}[data-file-path="README.md"]`)).toHaveAttribute('data-status', 'ready')
  await expect(page.locator(`${FILE_TAB}[data-file-path="README.md"]`)).toHaveCount(1)
  await expect(page.locator('.file-panel__path')).toHaveText(README)
  await closeAllFileWindows(page)

  // 切到另一个域再回来:本域的「最近关闭」原样还在(域状态不被清空)。
  await selectAgent(page, AGENT_NAMES['zh-CN'].writing)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await openSwitcher(page)
  await page.locator('.conversation-filter__option', { hasText: '文件' }).click()
  await expect(page.locator('.conversation-group__title'), '新域没有本域的最近记录').toHaveCount(0)
  await closeSwitcher(page)
  await selectAgent(page, AGENT_NAMES['zh-CN'].planning)
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await openSwitcher(page)
  await page.locator('.conversation-filter__option', { hasText: '文件' }).click()
  await expect.poll(async () => page.locator('.conversation-row[data-file-option]').count(), { message: '切回原域,最近关闭原样恢复' }).toBe(2)
  const backRows = await page.locator('.conversation-row[data-file-option]').count()
  console.log(`[file menu] 切回原域后行数 ${backRows}`)
})

// ============================================================================
// 文件那一页并进了会话栏的下拉(用「对话 / 文件」两个 aria-pressed 过滤钮切),语义与形态同旧。
// ============================================================================

test('下拉「文件」页:列出全部已打开的文件(含条上可见的)、分组正确、空文案只在真空中出现', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const fileFilter = page.locator('.conversation-filter__option', { hasText: '文件' })

  // ① 真的空:无打开、无最近 → 只有空文案,没有任何分组 / 行。
  await openSwitcher(page)
  await fileFilter.click()
  await expect(page.locator('.conversation-hint'), '空文案在场').toHaveText('还没有打开过文件')
  await expect(page.locator('.conversation-row[data-file-option]')).toHaveCount(0)
  await expect(page.locator('.conversation-group__title')).toHaveCount(0)
  await closeSwitcher(page)

  // ② 仅 1 个打开文件、0 个关闭:这一页里**恰 1 行**,空文案不存在。
  await openDockedFile(page, README)
  await closeAllFileWindows(page)
  await openSwitcher(page)
  await fileFilter.click()
  await expect(page.locator('.conversation-row[data-file-option]'), '仅 1 个打开文件时 1 行').toHaveCount(1)
  await expect(page.locator('.conversation-hint'), '非空时没有空文案').toHaveCount(0)
  await expect(page.locator('.conversation-group__title')).toHaveText(['已打开 · 1'])
  await expect(page.locator('.conversation-row__name').first()).toHaveText(README)
  // 次行 = 域内目录路径(分域之后不再写项目名)。
  await expect(page.locator('.conversation-row__path').first()).toHaveText('/')
  // 点「已可见」的那一行 = 显示它的窗口(不出错即可)。
  await page.locator('.conversation-row[data-file-option]').first().click()
  await expect(page.locator(SWITCHER_PANEL)).toHaveCount(0)
  await expect(page.locator(`${FILE_TAB}[aria-pressed="true"]`)).toHaveAttribute('data-file-path', README)

  // ③ 3 打开 + 1 关闭 → 4 行,分组正确(已打开 · 3 / 最近关闭)。
  //    注意:顶部行里一次只显示得下若干项(实测 @1600 = 3),**不是**全部—— 溢出项进下拉,故
  //    打开集一律按**下拉**核对,不按条上的可见项数核对。
  await openDockedFile(page, PROGRESS)
  await openDockedFile(page, GITIGNORE)
  await page.locator('.project-item').nth(0).locator('.project-tree').locator('.entry-row[data-kind="directory"]', { hasText: 'notes' }).first().locator('.entry-row__button').click()
  await openDockedFile(page, '2026-W40.md')
  const closing = await page.locator('.file-tab-slot').first().locator('.file-tab__label').innerText()
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await closeAllFileWindows(page)

  await openSwitcher(page)
  await fileFilter.click()
  const titles = await page.locator('.conversation-group__title').allTextContents()
  console.log(`[file menu] 分组 ${JSON.stringify(titles)}`)
  expect(titles, '先「已打开」再「最近关闭」').toEqual(['已打开 · 3', '最近关闭'])
  await expect(page.locator('.conversation-row[data-file-option]'), '3 打开 + 1 关闭 = 4 行').toHaveCount(4)
  const openNames = await page.locator('.conversation-group').first().locator('.conversation-row__name').allTextContents()
  console.log(`[file menu] 已打开 ${JSON.stringify(openNames)}`)
  expect(openNames).toEqual(['progress.csv', '.gitignore', '2026-W40.md'])
  await expect(page.locator('.conversation-group').nth(1).locator('.conversation-row__name')).toHaveText(closing)

  // ④ 过滤钮是 aria-pressed 的切换钮(不是 tab),两页只显示各自那一类。
  await expect(fileFilter).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.conversation-filter__option', { hasText: '对话' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-conversation-option]'), '文件页里没有对话行').toHaveCount(0)
  await page.locator('.conversation-filter__option', { hasText: '对话' }).click()
  await expect(fileFilter).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.conversation-row[data-file-option]'), '对话页里没有文件行').toHaveCount(0)
  await expect(page.locator('[data-conversation-option]').first(), '对话页里对话行在场').toBeVisible()
})

test('整站 Header 可折叠(仅工作台页):两态高度、aria 翻转、无布局过渡、折叠态不可聚焦', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const header = page.locator('.site-header')
  const collapse = page.locator('.site-header__collapse')
  const mark = page.locator('.site-header__collapse-mark')
  const transcript = page.locator('.transcript')
  const heading = page.locator('.conversation-heading')

  // ---- 展开态 ----
  const expandedHeader = await header.boundingBox()
  const expandedTranscript = await transcript.boundingBox()
  const expandedHeading = await heading.boundingBox()
  const btnBox = await collapse.boundingBox()
  expect(expandedHeader).not.toBeNull()
  expect(expandedTranscript).not.toBeNull()
  expect(expandedHeading).not.toBeNull()
  expect(btnBox).not.toBeNull()
  if (expandedHeader === null || expandedTranscript === null || expandedHeading === null || btnBox === null) return
  await expect(collapse, '展开态 aria-expanded=true').toHaveAttribute('aria-expanded', 'true')
  await expect(collapse).toHaveAttribute('aria-controls', 'site-header-inner')
  // 命中区 ≥44×44(可见记号只是一枚很小的三角)。
  expect(btnBox.width, '折叠控件命中区宽 ≥44').toBeGreaterThanOrEqual(43.5)
  expect(btnBox.height, '折叠控件命中区高 ≥44').toBeGreaterThanOrEqual(43.5)
  const markBox = await mark.boundingBox()
  console.log(`[header collapse] 控件 ${btnBox.width.toFixed(0)}×${btnBox.height.toFixed(0)} / 三角 ${markBox?.width.toFixed(0) ?? '?'}×${markBox?.height.toFixed(0) ?? '?'}`)
  expect((markBox?.width ?? 0), '可见三角很小(≤16px)').toBeLessThanOrEqual(16)
  // **没有布局过渡**:内层显式 transition:none;只有三角的旋转有过渡,且过渡属性是 transform。
  const innerTransition = await page.locator('.site-header__inner').evaluate((el) => getComputedStyle(el).transitionProperty)
  const markTransition = await mark.evaluate((el) => getComputedStyle(el).transitionProperty)
  console.log(`[header collapse] 内层 transition-property ${innerTransition} / 三角 ${markTransition}`)
  expect(innerTransition, '折叠是布局变化 → 内层不做过渡').toBe('none')
  expect(markTransition, '只有三角旋转可过渡').toBe('transform')
  const markBefore = await mark.evaluate((el) => getComputedStyle(el).transform)
  expect(markBefore, '展开态三角不旋转').toBe('none')

  // ---- 折叠 ----
  await collapse.click()
  await expect(collapse, '折叠态 aria-expanded=false').toHaveAttribute('aria-expanded', 'false')
  await expect.poll(async () => (await header.boundingBox())?.height ?? -1, { message: '折叠后顶栏高归 0' }).toBeLessThanOrEqual(1)
  const collapsedTranscript = await transcript.boundingBox()
  const collapsedHeading = await heading.boundingBox()
  expect(collapsedTranscript).not.toBeNull()
  expect(collapsedHeading).not.toBeNull()
  if (collapsedTranscript === null || collapsedHeading === null) return
  console.log(`[header collapse] 顶栏高 ${expandedHeader.height.toFixed(1)} → ${(await header.boundingBox())?.height.toFixed(1)} / 转录区高 ${expandedTranscript.height.toFixed(1)} → ${collapsedTranscript.height.toFixed(1)}(+${(collapsedTranscript.height - expandedTranscript.height).toFixed(1)}) / 转录区顶 ${expandedTranscript.y.toFixed(1)} → ${collapsedTranscript.y.toFixed(1)}`)
  // 腾出的高度交还给面板:转录区变高 ≈ 顶栏原来的高度。
  // 用 poll 而非一次性取值:顶栏高度归 0 与页面重排是两处 DOM 变更,重负载下(整仓 smoke 并行跑满)
  // 两者之间可能隔着一次同步点,一次性采样会抓到还没重排的中帧。
  await expect.poll(async () => {
    const box = await transcript.boundingBox()
    return box === null ? -999 : Math.abs((box.height - expandedTranscript.height) - expandedHeader.height)
  }, { message: '转录区增高 = 顶栏原高' }).toBeLessThanOrEqual(2)
  await expect.poll(async () => {
    const box = await transcript.boundingBox()
    return box === null ? -999 : Math.abs((expandedTranscript.y - box.y) - expandedHeader.height)
  }, { message: '转录区上移 = 顶栏原高' }).toBeLessThanOrEqual(2)
  // 工作台**自己的**会话头不受影响。
  expect(Math.abs(collapsedHeading.height - expandedHeading.height), '工作台会话头高度不变').toBeLessThanOrEqual(1)
  // 三角旋转走 transform。
  const markAfter = await mark.evaluate((el) => getComputedStyle(el).transform)
  console.log(`[header collapse] 三角 transform ${markBefore} → ${markAfter}`)
  expect(markAfter, '折叠后三角旋转 180°(transform)').not.toBe('none')
  expect(markAfter, '旋转矩阵 = 180°').toContain('matrix(-1')

  // ---- 折叠态的 a11y ----
  // 顶栏内的链接 / 控件移出可达性树与 Tab 序。
  expect(await page.locator('.site-header__inner').evaluate((el) => el.hasAttribute('inert')), '折叠态顶栏内层 inert').toBe(true)
  // 顶栏内的控件(品牌链接 / 语言 / 账号)逐个试聚焦:inert 让它们既离开可达性树、也离开 Tab 序。
  const innerControls = await page.locator('.site-header__inner').evaluate((el) => {
    const candidates = Array.from(el.querySelectorAll<HTMLElement>('a, button, [tabindex]'))
    const focusable = candidates.filter((candidate) => { candidate.focus(); return document.activeElement === candidate }).length
    const activeInside = document.activeElement !== null && el.contains(document.activeElement)
    return { total: candidates.length, focusable, activeInside }
  })
  console.log(`[header collapse] 折叠态顶栏内控件 ${innerControls.total} 个 / 仍可聚焦 ${innerControls.focusable}`)
  expect(innerControls.total, '顶栏内确有可交互控件(样本非空)').toBeGreaterThan(0)
  expect(innerControls.focusable, '折叠态顶栏内控件都不可聚焦(inert)').toBe(0)
  expect(innerControls.activeInside, '焦点不会落到顶栏内部').toBe(false)
  // 折叠控件本身仍可见、可聚焦(回退入口常在)。
  await expect(collapse).toBeVisible()
  await collapse.focus()
  await expect(collapse).toBeFocused()

  // ---- 展开回去 ----
  await collapse.click()
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(async () => (await header.boundingBox())?.height ?? -1).toBeGreaterThanOrEqual(expandedHeader.height - 1)
  expect(await page.locator('.site-header__inner').evaluate((el) => el.hasAttribute('inert')), '展开态移除 inert').toBe(false)

  // ---- 只作用于工作台页:首页不渲染折叠控件,且顶栏常驻 ----
  await page.goto('/')
  await expect(page.locator('.site-header__collapse')).toHaveCount(0)
  await expect.poll(async () => (await header.boundingBox())?.height ?? -1).toBeGreaterThanOrEqual(expandedHeader.height - 1)
})

test('横滑后退防护:根滚动容器禁用过度滚动、局部滚动链隔离、守卫不误伤合法横向滚动', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  // ① 本引擎是否**接受**这句 CSS(手势本身模拟不了,但「属性被不被认可」是可验证的)。
  const supported = await page.evaluate(() => CSS.supports('overscroll-behavior', 'none'))
  console.log(`[swipe guard] CSS.supports('overscroll-behavior','none') = ${supported}`)
  expect(supported, '本引擎接受 overscroll-behavior: none').toBe(true)

  // ② 根滚动容器:类落在 documentElement 上,html 与 body 的**两个轴**都解析为 none。
  const rootStyles = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement)
    const body = getComputedStyle(document.body)
    return {
      isWorkspace: document.documentElement.classList.contains('is-workspace'),
      htmlX: html.overscrollBehaviorX,
      htmlY: html.overscrollBehaviorY,
      bodyX: body.overscrollBehaviorX,
      bodyY: body.overscrollBehaviorY,
    }
  })
  console.log(`[swipe guard] 根 html ${rootStyles.htmlX}/${rootStyles.htmlY} body ${rootStyles.bodyX}/${rootStyles.bodyY}`)
  expect(rootStyles.isWorkspace, '工作台给根元素加了 is-workspace').toBe(true)
  expect(rootStyles.htmlX, 'html 横向 none').toBe('none')
  expect(rootStyles.htmlY, 'html 纵向 none').toBe('none')
  expect(rootStyles.bodyX, 'body 横向 none').toBe('none')
  expect(rootStyles.bodyY, 'body 纵向 none').toBe('none')

  // ③ 守卫的收放随指针位置:落在「自带 contain 的滚动容器」里摘掉(保住合成器滚动),落在
  //    没有自家滚动容器的区域就挂上。这条不是优化 —— 非 passive 监听会把整棵子树拖成主线程
  //    滚动,转录区在流式输出时会因此发涩并与贴底逻辑抢跑(校准里「真实动效路径」会抖)。
  await expect(page.locator('.workspace-page')).toHaveAttribute('data-swipe-guard', 'armed')
  const transcript = page.getByRole('log')
  await page.mouse.move(0, 0)
  const transcriptBox = await transcript.boundingBox()
  expect(transcriptBox, '转录区有几何盒').not.toBeNull()
  if (transcriptBox !== null) {
    await page.mouse.move(transcriptBox.x + 40, transcriptBox.y + 16)
    await expect(page.locator('.workspace-page'), '指针在转录区(带 contain)→ 守卫收起').toHaveAttribute('data-swipe-guard', 'idle')
  }
  await agentTab(page, 'planning').hover()
  await expect(page.locator('.workspace-page'), '指针在没有 contain 的区域 → 守卫挂上').toHaveAttribute('data-swipe-guard', 'armed')

  // ④ workspace 内自己的滚动容器一律 contain(根禁导航 + 局部禁链式传播 = 页面侧的完整覆盖)。
  // 用**悬浮**窗体:本用例要缩到最小以造出横向可滚区,只有悬浮窗体有缩放手柄。
  await clickFileRow(page, README)
  await expect(page.locator(FILE_PANEL)).toBeVisible()
  // 默认不换行(white-space: pre),但面板默认宽度足够宽,最长行仍放得下 —— 把面板缩到最小宽度,
  // 内容区才真的出现横向可滚区,「守卫不误伤合法横向滚动」这条才有意义。
  const corner = await page.locator('.dl-window__resize--se').boundingBox()
  expect(corner, '有 SE 角手柄').not.toBeNull()
  if (corner !== null) await dragFromTo(page, corner.x + corner.width / 2, corner.y + corner.height / 2, -3000, -3000)
  await expectPanelRect(page, { width: PANEL_MIN_W, height: PANEL_MIN_H }, '缩到最小以造出横向可滚区')
  // 拖角之后指针停在角手柄上(面板内、非滚动容器)→ 守卫处于挂载态,下面的合成事件才有意义。
  await expect(page.locator('.workspace-page')).toHaveAttribute('data-swipe-guard', 'armed')
  const containers = await page.evaluate(() => {
    const read = (selector: string): { selector: string; x: string; y: string } | null => {
      const element = document.querySelector(selector)
      if (element === null) return null
      const style = getComputedStyle(element)
      return { selector, x: style.overscrollBehaviorX, y: style.overscrollBehaviorY }
    }
    return ['.transcript', '.project-scroll', '#file-panel-body', '.dl-window__surface']
      .map(read)
      .filter((item): item is { selector: string; x: string; y: string } => item !== null)
  })
  console.log(`[swipe guard] 局部滚动容器 ${JSON.stringify(containers)}`)
  expect(containers.length, '局部滚动容器都取到了').toBe(4)
  for (const item of containers) {
    expect(item.y, `${item.selector} 纵向 contain`).toBe('contain')
    expect(item.x, `${item.selector} 横向 contain`).toBe('contain')
  }

  // ⑤ 守卫本身(合成 WheelEvent,直接看 defaultPrevented —— 手势之外的规则是可验证的)。
  const probe = await page.evaluate(() => {
    // 从某个元素上发一次可取消的 wheel,返回它是否被守卫吞掉。
    const fire = (selector: string, deltaX: number, deltaY: number): boolean => {
      const target = document.querySelector(selector)
      if (target === null) return false
      const event = new WheelEvent('wheel', { deltaX, deltaY, bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    const body = document.querySelector('#file-panel-body')
    if (body instanceof HTMLElement) body.scrollLeft = 0
    return {
      // 横向意图 + 内容区还有余量 → 放行(否则会把文件内容区本应有的横向滚动一并干掉)。
      contentHasRoom: fire('#file-panel-body', 120, 0),
      // 横向意图 + 落在不能横向滚动的区域(工作台根)→ 吞掉这次横滑。
      notScrollable: fire('.workspace-page', 120, 0),
      // 纵向意图(垂直为主)→ 一律不拦,页面纵向滚动不受影响。
      vertical: fire('.workspace-page', 0, 120),
    }
  })
  console.log(`[swipe guard] 守卫 defaultPrevented 内容区有余量 ${probe.contentHasRoom} / 不可横滚区 ${probe.notScrollable} / 纵向 ${probe.vertical}`)
  expect(probe.contentHasRoom, '仍可横向滚动时守卫不拦').toBe(false)
  expect(probe.notScrollable, '不可横向滚动的区域上横滑被吞').toBe(true)
  expect(probe.vertical, '纵向滚动不被守卫影响').toBe(false)

  // ⑥ 到边缘之后才拦:内容区滚到最右,再向右滑就没有余量了。
  const edge = await page.evaluate(() => {
    const body = document.querySelector('#file-panel-body')
    if (!(body instanceof HTMLElement)) return null
    body.scrollLeft = body.scrollWidth
    const event = new WheelEvent('wheel', { deltaX: 120, deltaY: 0, bubbles: true, cancelable: true })
    body.dispatchEvent(event)
    return { scrollLeft: body.scrollLeft, scrollWidth: body.scrollWidth, clientWidth: body.clientWidth, prevented: event.defaultPrevented }
  })
  console.log(`[swipe guard] 到右边缘 ${JSON.stringify(edge)}`)
  expect(edge, '内容区可取到').not.toBeNull()
  if (edge !== null && edge.scrollWidth > edge.clientWidth) {
    expect(edge.prevented, '已到边缘 → 守卫接管,不再把滑动交给浏览器').toBe(true)
  }

  // ⑦ 离开工作台 → 类被摘掉,根元素的过度滚动行为恢复默认(首页滚动语义不被缩小)。
  await page.evaluate(() => {
    window.location.hash = ''
  })
  await expect(page.locator('.workspace-page')).toHaveCount(0)
  const homeStyles = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement)
    const body = getComputedStyle(document.body)
    return {
      isWorkspace: document.documentElement.classList.contains('is-workspace'),
      htmlX: html.overscrollBehaviorX,
      htmlY: html.overscrollBehaviorY,
      bodyX: body.overscrollBehaviorX,
    }
  })
  console.log(`[swipe guard] 离开后 类 ${homeStyles.isWorkspace} html ${homeStyles.htmlX}/${homeStyles.htmlY} body ${homeStyles.bodyX}`)
  expect(homeStyles.isWorkspace, '离开工作台后类被摘掉').toBe(false)
  expect(homeStyles.htmlX, '首页 html 恢复默认').not.toBe('none')
  expect(homeStyles.htmlY, '首页 html 纵向恢复默认').not.toBe('none')
  expect(homeStyles.bodyX, '首页 body 恢复默认').not.toBe('none')
})

// ============================================================================
// 向下拖出 tab → 悬浮窗体;悬浮窗体拖到顶部 tab 条 → 吸附停靠
// ============================================================================

// 按住某点、**分多步**移到目标点(不要一步到位:一步到位只会让轴向锁定与落点判定各走一次极端分支)。
async function pressDragTo(page: Page, fromX: number, fromY: number, toX: number, toY: number, steps = 16): Promise<void> {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(toX, toY, { steps })
}

test('向下拖出 tab:越过条下沿 → 摘掉条上的 tab 并出悬浮窗体(跟手);拖回条内 → 撤销;再拖出松手 → 保持悬浮', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openDockedFile(page, README)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)

  const slotBox = await page.locator('.file-tab-slot').first().boundingBox()
  const stripBox = await page.locator(FILE_TOOLBAR).boundingBox()
  expect(slotBox, 'tab 有几何盒').not.toBeNull()
  expect(stripBox, 'tab 条有几何盒').not.toBeNull()
  if (slotBox === null || stripBox === null) return
  const grabX = slotBox.x + slotBox.width / 2
  const grabY = slotBox.y + slotBox.height / 2
  const stripBottom = stripBox.y + stripBox.height
  const tearY = stripBottom + 40

  // 向下拖过条下沿 40px(判定阈值是 24px)→ 拆出。DOM 侧的两条断言就是「不变量④」的投影:
  // 一个 floating 窗体不得同时留在任何区域的 members 里(= 条上不该还有它的 tab)。
  await pressDragTo(page, grabX, grabY, grabX, tearY)
  await expect(page.locator(FILE_TAB), '拆出后条上不再有它').toHaveCount(0)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '内容成了悬浮窗体').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '拆出即置顶聚焦').toHaveAttribute('data-focused', 'true')
  await expect(page.locator('.workspace-live'), '拆出经 role=status 播报').toHaveText(/拆出.*README\.md/)

  // 跟手:指针再向下 60px,窗体跟着走 —— 证明初始矩形是按指针(减抓取偏移)算的,不是默认几何。
  const before = await panelRectOf(page, README)
  await page.mouse.move(grabX, tearY + 60)
  const after = await panelRectOf(page, README)
  console.log(`[tear out] 跟手 ${JSON.stringify(before)} → ${JSON.stringify(after)}`)
  expect(Math.round(after.y - before.y), '窗体随指针下移相同的量').toBe(60)

  // 迟滞:回到条下沿 12px 以内 → 自动撤销(松手前都可逆)。撤销要回到**拆出前的样子** ——
  // 它此前是停靠在内容区里的活动项,故条上的 tab 与内容区里的停靠窗体都应原样回来。
  await page.mouse.move(grabX, stripBottom + 6)
  await expect(page.locator(FILE_TAB), '拖回条内 → tab 复原').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '悬浮窗体撤掉').toHaveCount(0)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '停靠窗体原样回来').toHaveCount(1)
  await expect(page.locator('.workspace-live'), '撤销经 role=status 播报').toHaveText(/README\.md.*放回/)

  // 再拖出去并**松手** → 保持悬浮(tab 不回来)。
  await page.mouse.move(grabX, tearY, { steps: 8 })
  await expect(page.locator(FILE_TAB), '又一次拆出').toHaveCount(0)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`)).toHaveCount(1)
  await page.mouse.up()
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '松手后保持悬浮').toHaveCount(1)
  await expect(page.locator(FILE_TAB), '条上仍没有它').toHaveCount(0)

  // 松手时把落定几何记进当前分域:切到别的 Agent 再切回来,它按原样回来(不是又回到默认位置)。
  const placed = await panelRectOf(page, README)
  await selectAgent(page, AGENT_NAMES['zh-CN'].research)
  await expect(page.locator(FILE_PANEL), '换分域 → 它的窗体不在场').toHaveCount(0)
  await selectAgent(page, AGENT_NAMES['zh-CN'].planning)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '切回来 → 悬浮窗体原样回来').toHaveCount(1)
  await expect.poll(async () => Math.round((await panelRectOf(page, README)).y), '几何按落定值恢复').toBe(Math.round(placed.y))
})

test('拆出的非拖拽通路:tab 上的按钮可点、Enter 即把该文件拆成悬浮窗体', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openDockedFile(page, README)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)

  // WCAG 2.5.7:拖拽不能是唯一入口 —— 每枚 tab 上有一枚真按钮,带 aria-label。
  // 该钮**不在 Tab 序里**(tabindex=-1):键盘等价通路改由快捷键 Ctrl/Cmd+Shift+M 承担,
  // WCAG 2.5.7 要求的是「存在非拖拽入口」,不要求在 Tab 序里(见 regions.spec 的快捷键用例)。
  const pop = page.locator('.file-tab-pop')
  await expect(pop, '每一枚 tab 都带一个拆出按钮').toHaveCount(1)
  await expect(pop).toHaveAttribute('aria-label', '把 README.md 拆出为悬浮窗口')
  await expect(pop, '已移出 Tab 序').toHaveAttribute('tabindex', '-1')
  await pop.focus()
  await expect(pop, '可键盘聚焦(程序化)').toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), 'Enter 即拆出为悬浮窗体').toHaveCount(1)
  await expect(page.locator(FILE_TAB), '条上不再有它').toHaveCount(0)
  await expect(page.locator('.workspace-live')).toHaveText(/拆出.*README\.md/)
  // 焦点交给新窗体的标题栏(键盘操作者不丢位置)。
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"] .dl-window__meta`)).toBeFocused()
})

test('吸附:悬浮窗体拖到顶部 tab 条上 → 整条高亮 + 落点提示(不遮挡命中区);移出即消失;松手停靠回条上', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await clickFileRow(page, README)
  const floating = page.locator(`${FILE_PANEL}[data-mode="floating"]`)
  await expect(floating).toHaveCount(1)

  const headerBox = await floating.locator('.dl-window__meta').boundingBox()
  const headingBox = await page.locator('.conversation-heading').boundingBox()
  expect(headerBox, '标题栏有几何盒').not.toBeNull()
  expect(headingBox, '顶部条有几何盒').not.toBeNull()
  if (headerBox === null || headingBox === null) return
  const fromX = headerBox.x + 120
  const fromY = headerBox.y + 20
  const toX = headingBox.x + headingBox.width / 2
  const toY = headingBox.y + headingBox.height / 2

  // 按住标题栏、分多步拖进顶部条。
  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(toX, toY, { steps: 12 })

  await expect(page.locator('.conversation-heading'), '整条 tab 条描边高亮').toHaveClass(/is-drop-target/)
  const hint = page.locator('.conversation-heading__dock-hint')
  await expect(hint, '出现落点提示').toBeVisible()
  await expect(hint, '文案说清松手会发生什么').toHaveText('在此处松手可以最大化并重新占用这个 Tab 位置')
  await expect(hint, '提示不接收指针 —— 不遮挡条的命中区').toHaveCSS('pointer-events', 'none')
  await expect(page.locator('.workspace-live'), '落点经 role=status 播报').toHaveText(/松手将把.*README\.md.*停靠/)
  // 提示本身也不与条重叠(挂在条下沿之下),故不占条的命中区。
  const hintBox = await hint.boundingBox()
  expect(hintBox, '提示有几何盒').not.toBeNull()
  if (hintBox !== null) expect(hintBox.y, '提示落在条下沿之下').toBeGreaterThanOrEqual(headingBox.y + headingBox.height - 1)

  // 指针离开条的矩形 → 提示淡出消失(条不再高亮)。
  await page.mouse.move(toX, headingBox.y + headingBox.height + 260, { steps: 12 })
  await expect(page.locator('.conversation-heading'), '离开后不再高亮').not.toHaveClass(/is-drop-target/)
  await expect(hint, '提示消失').toHaveCount(0)

  // 再进条并**松手** → 插回区域成员、占一个 tab、成为当前项。
  await page.mouse.move(toX, toY, { steps: 12 })
  await expect(hint, '回到条上提示再现').toBeVisible()
  await page.mouse.up()
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '停靠进区域内容区').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '不再是悬浮窗体').toHaveCount(0)
  await expect(page.locator(FILE_TAB), '占回一个 tab').toHaveCount(1)
  await expect(page.locator(`${FILE_TAB}[data-file-path="README.md"][aria-pressed="true"]`), '它是当前项').toHaveCount(1)
  await expect(page.locator('.conversation-heading'), '松手后不再高亮').not.toHaveClass(/is-drop-target/)
  await expect(hint, '松手后提示消失').toHaveCount(0)
})

test('Escape 取消:拖出途中按 Esc 撤销拆出;悬浮窗体拖到条上按 Esc 放弃吸附并回到按下时的几何', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openDockedFile(page, README)

  // ① 拖出途中 Esc:撤销拆出、tab 复原(松手前都可逆)。
  const slotBox = await page.locator('.file-tab-slot').first().boundingBox()
  const stripBox = await page.locator(FILE_TOOLBAR).boundingBox()
  expect(slotBox, 'tab 有几何盒').not.toBeNull()
  expect(stripBox, 'tab 条有几何盒').not.toBeNull()
  if (slotBox === null || stripBox === null) return
  await pressDragTo(page, slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2, slotBox.x + slotBox.width / 2, stripBox.y + stripBox.height + 40)
  await expect(page.locator(FILE_TAB), '已拆出').toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator(FILE_TAB), 'Esc 撤销拆出、tab 复原').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '悬浮窗体撤掉').toHaveCount(0)
  await page.mouse.up()
  await expect(page.locator(FILE_TAB), '松手后仍是 tab').toHaveCount(1)

  // ② 悬浮窗体拖到条上再 Esc:放弃吸附,几何回到按下时的那一份。
  await page.locator(`${FILE_PANEL}[data-mode="docked"] .file-panel__placement`).click()
  const floating = page.locator(`${FILE_PANEL}[data-mode="floating"]`)
  await expect(floating, '停靠 → 悬浮').toHaveCount(1)
  const before = await panelRectOf(page, README)
  const headerBox = await floating.locator('.dl-window__meta').boundingBox()
  const headingBox = await page.locator('.conversation-heading').boundingBox()
  expect(headerBox, '标题栏有几何盒').not.toBeNull()
  expect(headingBox, '顶部条有几何盒').not.toBeNull()
  if (headerBox === null || headingBox === null) return
  await page.mouse.move(headerBox.x + 120, headerBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(headingBox.x + headingBox.width / 2, headingBox.y + headingBox.height / 2, { steps: 12 })
  await expect(page.locator('.conversation-heading'), '已落在条上').toHaveClass(/is-drop-target/)

  await page.keyboard.press('Escape')
  await expect(page.locator('.conversation-heading'), 'Esc 后提示收起').not.toHaveClass(/is-drop-target/)
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '仍是悬浮窗体').toHaveCount(1)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '没有吸附').toHaveCount(0)
  const after = await panelRectOf(page, README)
  console.log(`[tear escape] 几何 ${JSON.stringify(before)} → ${JSON.stringify(after)}`)
  expect(Math.round(after.y), '几何回到按下时的那一份').toBe(Math.round(before.y))
  await page.mouse.up()
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '松手也不吸附').toHaveCount(1)
  await expect(page.locator(FILE_TAB), '条上仍没有它').toHaveCount(0)
})

// ============================================================================
// 单元 C1:对话也是窗体 —— 与文件走同一条窗体机制
// ============================================================================

// 悬浮的**对话**窗体(chat-panel)与对话 tab 上的「拆出」钮。两者都是本轮新增的挂点。
const CHAT_PANEL = '.chat-panel'
const CHAT_TAB_POP = '.tab-pop'

test('对话窗体①:每个会话都在条上、都带成员化的拆出入口;成员顺序 = 条上顺序且不被重算冲掉', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  // 默认项目 6 条会话全在条上,每条都带「拆出」钮 —— 只有**成员化的窗体**才有这个入口
  // (它不是所有会话都具有的装饰,而是「这个 tab 背后有一个窗体」的机械证据)。
  await expect(page.locator(TAB), '每个会话都在条上').toHaveCount(SESSIONS_IN_DEFAULT_PROJECT)
  await expect(page.locator(CHAT_TAB_POP), '每条都带拆出入口').toHaveCount(SESSIONS_IN_DEFAULT_PROJECT)

  // 条上顺序 = 区域成员的对话顺序(组件不再另存一份):拖第 2 条到第 4 位 → 顺序被写回成员。
  const before = await tabIds(page)
  await dragTab(page, 1, 3)
  const expected = [...before]
  const moved = expected.splice(1, 1)[0] ?? null
  expected.splice(3, 0, moved)
  await expect.poll(() => tabIds(page), { message: '拖拽把新顺序写回成员' }).toEqual(expected)

  // 关键:此后往成员数组里**加一个文件成员**(停靠打开一个文件)——对话的相对顺序不被
  // 「每次渲染重算所有会话」冲掉(成员是增量维护的)。文件组占走顶部行的宽度后,条上可见的
  // 对话 tab 会少几个(溢出的收进 ▾ 菜单),故这里核对**可见的那一段**仍是成员顺序的前缀。
  await openDockedFile(page, README)
  await expect(page.locator(FILE_TAB)).toHaveCount(1)
  const visibleAfter = await tabIds(page)
  expect(visibleAfter.length, '条被文件组挤窄后仍有可见对话 tab').toBeGreaterThan(0)
  expect(visibleAfter, '可见段 = 成员顺序的前缀(顺序未被重算冲掉)').toEqual(expected.slice(0, visibleAfter.length))
})

test('对话窗体②③:向下拖对话 tab → 悬浮对话窗体(含着它自己的输入坞与草稿);拖回条上 → 停靠占 tab', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  // 先在**活动对话**的输入框里打一段草稿 —— 草稿随会话存活,拆出后必须跟着窗体走。
  const activeInput = page.locator('.composer-dock textarea').first()
  await activeInput.fill('拆出后仍在的草稿')
  await expect(activeInput).toHaveValue('拆出后仍在的草稿')

  // 拖**活动**那条 tab(第 1 条)向下拆出 —— 走与文件完全相同的那条内容无关的路径。
  const slot = page.locator('.tab-slot').first()
  const title = await slot.locator('.conversation-tab__label').innerText()
  const slotBox = await slot.boundingBox()
  const stripBox = await page.locator('.conversation-tabs').boundingBox()
  expect(slotBox, 'tab 有几何盒').not.toBeNull()
  expect(stripBox, '对话 tab 条有几何盒').not.toBeNull()
  if (slotBox === null || stripBox === null) return
  const grabX = slotBox.x + slotBox.width / 2
  const grabY = slotBox.y + slotBox.height / 2
  const tearY = stripBox.y + stripBox.height + 40

  await pressDragTo(page, grabX, grabY, grabX, tearY)
  // 条上不再有它(不变量④的投影:悬浮窗体不得同时留在区域的 members 里)。
  await expect(page.locator(TAB, { hasText: title }), '拆出后条上不再有它').toHaveCount(0)
  await expect(page.locator(TAB)).toHaveCount(SESSIONS_IN_DEFAULT_PROJECT - 1)
  // 内容成了**悬浮对话窗体**:固定定位、置顶聚焦,里面渲染该会话的转录。
  const chatPanel = page.locator(`${CHAT_PANEL}[data-mode="floating"]`)
  await expect(chatPanel, '内容成了悬浮对话窗体').toHaveCount(1)
  await expect(chatPanel).toHaveAttribute('data-focused', 'true')
  await expect(chatPanel).toHaveCSS('position', 'fixed')
  await expect(chatPanel.locator('.transcript-inner .chat-message').first(), '悬浮窗体里渲染该会话的转录').toBeVisible()
  // 输入坞**属于对话窗体**:悬浮的对话窗体含它,且草稿随窗体带了出来、可继续输入。
  const floatingInput = chatPanel.locator('textarea')
  await expect(floatingInput, '悬浮对话窗体含输入坞').toHaveCount(1)
  await expect(floatingInput, '草稿随窗体走').toHaveValue('拆出后仍在的草稿')
  await expect(floatingInput).not.toHaveAttribute('readonly', '')
  await floatingInput.fill('拆出后仍在的草稿，再续写一句')
  await expect(floatingInput).toHaveValue('拆出后仍在的草稿，再续写一句')
  await expect(page.locator('.workspace-live'), '拆出经 role=status 播报').toContainText('拆出')

  // 松手 → 保持悬浮。
  await page.mouse.move(grabX, tearY + 40, { steps: 6 })
  await page.mouse.up()
  await expect(chatPanel, '松手后保持悬浮').toHaveCount(1)
  await expect(page.locator(TAB), '条上仍没有它').toHaveCount(SESSIONS_IN_DEFAULT_PROJECT - 1)

  // 抓住悬浮对话窗的标题栏拖到顶部条上松手 → 吸附停靠、占回一个 tab。
  const headerBox = await chatPanel.locator('.dl-window__meta').boundingBox()
  const headingBox = await page.locator('.conversation-heading').boundingBox()
  expect(headerBox, '标题栏有几何盒').not.toBeNull()
  expect(headingBox, '顶部条有几何盒').not.toBeNull()
  if (headerBox === null || headingBox === null) return
  await page.mouse.move(headerBox.x + 100, headerBox.y + headerBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(headingBox.x + headingBox.width / 2, headingBox.y + headingBox.height / 2, { steps: 12 })
  await expect(page.locator('.conversation-heading'), '落在条上 → 整条高亮').toHaveClass(/is-drop-target/)
  // 落点提示是**对话专用**词条(文件那条的「最大化」用在对话上不贴切)。
  await expect(page.locator('.conversation-heading__dock-hint'), '提示用对话专用词条').toHaveText('在此处松手可以把这段对话停靠回这个 Tab 位置')
  await page.mouse.up()

  await expect(page.locator(CHAT_PANEL), '不再悬浮').toHaveCount(0)
  await expect(page.locator(TAB), '停靠占一个 tab').toHaveCount(SESSIONS_IN_DEFAULT_PROJECT)
  await expect(page.locator(TAB, { hasText: title }), '该会话回到条上').toHaveCount(1)
  await expect(page.locator(TAB, { hasText: title }), '停靠后成为当前项(内容区显示它)').toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.transcript'), '内容区仍显示转录').toHaveCount(1)
  // 输入坞随窗体**停靠回区域内容区**,草稿仍在。
  await expect(page.locator('.composer-dock textarea').first(), '输入坞随窗体停靠回来,草稿仍在').toHaveValue('拆出后仍在的草稿，再续写一句')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
})

test('对话窗体④:点对话 tab 与点文件 tab 都切换内容区(同一区域同一时刻只显示一件)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  await openDockedFile(page, README)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '文件占据内容区').toHaveCount(1)
  await expect(page.locator('.transcript')).toHaveCount(0)

  // 点一个**别的**对话 tab → 内容区切成那段对话的转录(文件让位,但它的 tab 仍在条上)。
  await clickTab(page, HEADINGS['zh-CN'].roadmap)
  await expect(page.locator('.transcript'), '内容区换成转录').toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 }), '切到的是点的那段对话').toHaveText(HEADINGS['zh-CN'].roadmap)
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '文件让位').toHaveCount(0)
  await expect(page.locator(FILE_TAB), '它的 tab 仍在条上').toHaveCount(1)

  // 点回文件 tab → 该文件重新占据内容区。
  await page.locator(`${FILE_TAB}[data-file-path="README.md"]`).click()
  await expect(page.locator(`${FILE_PANEL}[data-mode="docked"]`), '文件重新占据内容区').toHaveCount(1)
  await expect(page.locator('.transcript')).toHaveCount(0)

  // 此时文件是区域的活动成员;关掉它的 tab → 内容区交给**相邻成员**(closeTab 的相邻接管规则)。
  await page.locator('.file-tab-slot').first().hover()
  await page.locator('.file-tab-slot').first().locator('.file-tab-close').click()
  await expect(page.locator(FILE_TAB), '文件 tab 撤下').toHaveCount(0)
  await expect(page.locator('.transcript'), '内容区交给相邻成员(转录回来)').toHaveCount(1)
  await expect(page.getByRole('log'), '不是卡在加载态').toHaveAttribute('data-state', 'ready')
  // 接管者是一段**对话**(不是文件的残留):h1 因此不再是文件名。
  const handoverHeading = await page.getByRole('heading', { level: 1 }).innerText()
  expect(handoverHeading, '接管者是相邻的对话').not.toBe(README)
  expect(Object.values(HEADINGS['zh-CN']), 'h1 是一段对话的标题').toContain(handoverHeading)

  // 再点回原对话 tab → 又切回转录(两处的「让位」语义一致)。
  await clickTab(page, HEADINGS['zh-CN'].weekly)
  await expect(page.locator('.transcript')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS['zh-CN'].weekly)
})

test('对话窗体⑥:对话 tab 上的「拆出」钮可点、Enter 即把该对话拆成悬浮窗体(WCAG 2.5.7)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)
  const slot = page.locator('.tab-slot').nth(1)
  const title = await slot.locator('.conversation-tab__label').innerText()

  const pop = slot.locator(CHAT_TAB_POP)
  await expect(pop, '每一枚对话 tab 都带一个拆出按钮').toHaveCount(1)
  // 可访问名含对应标题(图标按钮必须带 aria-label,不能只靠图形传达含义)。
  expect(await pop.getAttribute('aria-label'), '可访问名含对应标题').toContain(title)
  // 该钮**不在 Tab 序里**:键盘等价通路是快捷键 Ctrl/Cmd+Shift+M(见 regions.spec)。
  await expect(pop, '已移出 Tab 序').toHaveAttribute('tabindex', '-1')
  await pop.focus()
  await expect(pop, '可键盘聚焦(程序化)').toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.locator(`${CHAT_PANEL}[data-mode="floating"]`), 'Enter 即拆成悬浮对话窗体').toHaveCount(1)
  await expect(page.locator(TAB, { hasText: title }), '条上不再有它').toHaveCount(0)
  await expect(page.locator('.workspace-live')).toContainText('拆出')
  // 焦点交给新窗体的标题栏(键盘操作者不丢位置)。
  await expect(page.locator(`${CHAT_PANEL}[data-mode="floating"] .dl-window__meta`)).toBeFocused()
})

// 对话窗的最小尺寸与文件窗**不同**(输入坞需要高度),故不能共用文件窗的 200 那一档。
const CHAT_PANEL_MIN_H = 320

test('对话窗体⑦:悬浮对话窗与文件窗同一套缩放手柄 —— 四边可聚焦分隔条 / 四角 44×44 / SE 可见抓手,指针与键盘都能调尺寸', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  // 用「拆出」钮把一段对话拆成悬浮窗(非拖拽通路,落点确定)。
  // 该钮移出了 Tab 序,故用程序化聚焦 + Enter(与对话窗体⑥ 同一条路径)。
  const slot = page.locator('.tab-slot').first()
  const pop = slot.locator(CHAT_TAB_POP)
  await pop.focus()
  await page.keyboard.press('Enter')
  const chatPanel = page.locator(`${CHAT_PANEL}[data-mode="floating"]`)
  await expect(chatPanel, '拆出为悬浮对话窗').toHaveCount(1)

  const rectOf = (): Promise<Rect> =>
    chatPanel.evaluate((element) => {
      const b = element.getBoundingClientRect()
      return { x: b.x, y: b.y, width: b.width, height: b.height }
    })

  // ① 8 枚手柄齐备:四边(可聚焦分隔条)+ 四角(44×44 指针目标)。
  await expect(chatPanel.locator('.dl-window__resize'), '四边 + 四角共 8 枚').toHaveCount(8)
  for (const edge of ['e', 'w', 'n', 's'] as const) {
    await expect(chatPanel.locator(`.dl-window__resize--${edge}`), `${edge} 边在`).toHaveCount(1)
  }
  const corners = await chatPanel.locator('.dl-window__resize--corner').evaluateAll((elements) => elements.map((el) => {
    const rect = el.getBoundingClientRect()
    return { w: rect.width, h: rect.height }
  }))
  console.log(`[chat resize] 四角 ${JSON.stringify(corners)}`)
  expect(corners.length, '四角齐备').toBe(4)
  for (const corner of corners) {
    expect(corner.w, '角手柄宽 ≥44').toBeGreaterThanOrEqual(43.5)
    expect(corner.h, '角手柄高 ≥44').toBeGreaterThanOrEqual(43.5)
  }
  // 四边是放在窗体**外**的 8px 隐形命中区(与文件窗同款)。
  const edgeBox = await chatPanel.locator('.dl-window__resize--e').boundingBox()
  expect(edgeBox?.width ?? 0, '边条宽 ≈8').toBeLessThanOrEqual(9)

  // ② 右下角(SE)有**可见的点阵抓手**,其余三角完全透明 —— 两个窗体长得一样。
  await expect(chatPanel.locator('.dl-window__resize-grip'), '只有一枚可见抓手').toHaveCount(1)
  await expect(chatPanel.locator('.dl-window__resize--se .dl-window__resize-grip'), '抓手挂在 SE 角上').toHaveCount(1)
  await expect(chatPanel.locator('.dl-window__resize-grip'), '抓手纯装饰').toHaveAttribute('aria-hidden', 'true')
  const gripPaint = await chatPanel.locator('.dl-window__resize-grip').evaluate((el) => {
    const style = getComputedStyle(el)
    return { image: style.backgroundImage, color: style.color, pointerEvents: style.pointerEvents }
  })
  console.log(`[chat resize] SE 抓手 ${JSON.stringify(gripPaint)}`)
  expect(gripPaint.image, '与标题栏抓手同一套点阵画法').toContain('radial-gradient')
  expect(gripPaint.pointerEvents, '抓手本身不吃指针(命中区是角手柄)').toBe('none')
  // 其余三角没有抓手(完全透明)。
  for (const corner of ['ne', 'nw', 'sw'] as const) {
    await expect(chatPanel.locator(`.dl-window__resize--${corner} .dl-window__resize-grip`), `${corner} 角无抓手`).toHaveCount(0)
  }

  // ③ 分隔条的 ARIA(APG Window Splitter):role / 轴向 / 边界 / aria-controls 指向**对话**内容区。
  const east = chatPanel.locator('.dl-window__resize--e')
  await expect(east).toHaveAttribute('role', 'separator')
  await expect(east).toHaveAttribute('aria-orientation', 'vertical')
  await expect(east).toHaveAttribute('aria-controls', 'chat-panel-body')
  await expect(east).toHaveAttribute('aria-valuemin', '320')
  const south = chatPanel.locator('.dl-window__resize--s')
  await expect(south).toHaveAttribute('role', 'separator')
  await expect(south).toHaveAttribute('aria-orientation', 'horizontal')
  // 最小高是**对话窗自己的 320**(不是文件窗的 200)—— 按窗体配置传入,不写死在共用层。
  await expect(south).toHaveAttribute('aria-valuemin', String(CHAT_PANEL_MIN_H))
  const nowBefore = Number(await east.getAttribute('aria-valuenow'))
  expect(Math.abs(nowBefore - (await rectOf()).width), 'aria-valuenow = 当前宽').toBeLessThanOrEqual(1)

  // ④ 指针:拖 SE 角改尺寸(右下角那枚可见抓手所在的角)。
  const start = await rectOf()
  const se = await chatPanel.locator('.dl-window__resize--se').boundingBox()
  expect(se, 'SE 角有几何盒').not.toBeNull()
  if (se === null) return
  await dragFromTo(page, se.x + se.width / 2, se.y + se.height / 2, 120, 60)
  const bigger = await rectOf()
  console.log(`[chat resize] SE 拖 +120,+60 → ${JSON.stringify(bigger)}`)
  expect(Math.abs(bigger.width - (start.width + 120)), 'SE 拖:宽 +120').toBeLessThanOrEqual(1)
  expect(Math.abs(bigger.height - (start.height + 60)), 'SE 拖:高 +60').toBeLessThanOrEqual(1)

  // ⑤ 指针:往左上拖到底 → 夹在 **320×320**(对话窗自己的下限)。
  const se2 = await chatPanel.locator('.dl-window__resize--se').boundingBox()
  expect(se2).not.toBeNull()
  if (se2 === null) return
  await dragFromTo(page, se2.x + se2.width / 2, se2.y + se2.height / 2, -3000, -3000)
  // 把指针带回视口内并**显式再抬一次**:出界拖拽的 pointerup 可能送不到页面,
  // 指针会一直处于按下态,下一次拖拽就再也收不到 move(webkit 实测)。
  await page.mouse.move(640, 400)
  await page.mouse.up()
  await expect.poll(async () => {
    const rect = await rectOf()
    return `${Math.round(rect.width)}x${Math.round(rect.height)}`
  }, { message: '拖到最小夹在 320×320' }).toBe(`320x${CHAT_PANEL_MIN_H}`)
  console.log(`[chat resize] 拖到最小 → ${JSON.stringify(await rectOf())}`)

  // ⑥ 键盘(WCAG 2.5.7 的非拖动通路):方向键 ±16、Shift ±64、Home / End 到最小 / 最大。
  // 起点是刚才夹住的 320,故方向键那两步的结果是可预期的 320 + 16 + 64 = 400。
  await east.focus()
  await expect(east).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(async () => Math.round(Number(await east.getAttribute('aria-valuenow'))), { message: '方向键 16 + Shift 64 → 400' }).toBe(400)
  await page.keyboard.press('Home')
  await expect.poll(async () => Math.round(Number(await east.getAttribute('aria-valuenow'))), { message: 'Home 到最小宽' }).toBe(320)
  await page.keyboard.press('End')
  await expect.poll(async () => Math.round(Number(await east.getAttribute('aria-valuenow'))), { message: 'End 到最大宽' }).toBe(Math.round(1280 - 2 * PANEL_MARGIN))
  // 键盘也是真的改了渲染尺寸(不只是 ARIA 变了)。
  await expect.poll(async () => Math.round((await rectOf()).width), { message: '渲染宽跟着键盘走' }).toBe(Math.round(1280 - 2 * PANEL_MARGIN))
  // 高度那条分隔条同样可键盘调整(Home → 对话窗的 320 下限)。
  await south.focus()
  await page.keyboard.press('Home')
  await expect.poll(async () => Math.round(Number(await south.getAttribute('aria-valuenow'))), { message: 'S:Home 到最小高' }).toBe(CHAT_PANEL_MIN_H)
})

// 标题栏控件的**命中区守卫**:窗宽收到允许的最小档时,标题栏的控件行会顶到右侧那条
// 44px 的预留里 —— 若溢出,点击会被右下角(NE)的 44×44 角手柄接走,按钮「点了没反应」。
//
// 依据:`protodesign-baseline` ⑧ 的反模式**「假交互」**(按钮不可点),它的可机械判定形式就是
//   「按钮矩形与角手柄的命中区相交 ⇒ elementFromPoint(按钮中心) 返回的不是它自己」。
// 这里同时断言两条:① 命中点归自己(指针对);② 矩形与任何角手柄不相交(几何因)。
// 触发工况:窗宽 = 该窗体允许的最小档(文件 320、对话 320);最严的是**视口 ≥1024**(侧向
// gutter 40,内容盒最窄 = 320 − 40 − 44 = 236),≤1023(gutter 16)同样要过,故两档各跑一遍。
// 前提:被审的窗体此刻必须**在层序最上**(它自己接指针)——故调用方一次只留一个悬浮窗。
async function auditHeaderHitTargets(page: Page, panel: Locator, minWidth: number, condition: string): Promise<void> {
  await panel.locator('.dl-window__resize--e').focus()
  await page.keyboard.press('Home')
  // 几何写入是同步的,但**容器查询**要等一次样式重算才跟上 —— 落定前取样会读到「窄档规则尚未
  // 生效」的中间态(实测同一档差 4px)。等一拍再量,断言与日志才是确定的。
  await page.waitForTimeout(150)
  await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0), { message: `${condition}: 已收到最小窗宽` }).toBe(minWidth)

  const audit = await panel.evaluate((root) => {
    const box = root.getBoundingClientRect()
    const corners = [...root.querySelectorAll('.dl-window__resize--corner')].map((el) => el.getBoundingClientRect())
    return [...root.querySelectorAll('.dl-window__meta button')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const rect = el.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        const owner = hit === null ? null : hit.closest('button')
        return {
          cls: el.className,
          localRight: Number((rect.right - box.left).toFixed(1)),
          self: owner === el,
          hitBy: owner === el ? 'self' : String((owner ?? hit)?.className ?? 'null'),
          overlapsCorner: corners.some((corner) => rect.right > corner.left && rect.left < corner.right && rect.bottom > corner.top && rect.top < corner.bottom),
        }
      })
  })
  console.log(`[header hit] ${condition} → ${JSON.stringify(audit)}`)
  expect(audit.length, `${condition}: 标题栏里应有可见控件`).toBeGreaterThan(0)
  for (const item of audit) {
    expect(item.self, `${condition}: 「${item.cls}」的命中点没被别人接走(被 ${item.hitBy} 盖住)`).toBe(true)
    expect(item.overlapsCorner, `${condition}: 「${item.cls}」的矩形不与任何角手柄的命中区相交`).toBe(false)
  }
  // 结构性判据:整行落在内容盒右缘之内(= 窗宽 − 44 的 NE 预留),这条比逐控件更早暴露溢出。
  for (const item of audit) expect(item.localRight, `${condition}: 「${item.cls}」右缘不侵入 NE 预留`).toBeLessThanOrEqual(minWidth - 44 + 0.5)
}

test('标题栏在最小窗宽下仍可点:文件窗与对话窗的每一枚控件都不被角手柄的命中区盖住(反模式「假交互」的机械判据)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  // ---- 文件窗:工具行最宽(视图分段 + 换行 + 复位 + 停靠 + 关闭),最容易顶进 NE 预留 ----
  await clickFileRow(page, README)
  const filePanel = page.locator(`${FILE_PANEL}[data-mode="floating"]`)
  await expect(filePanel).toHaveCount(1)
  for (const width of [1280, 768] as const) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await auditHeaderHitTargets(page, filePanel, PANEL_MIN_W, `文件窗 @${width}(gutter ${width >= 1024 ? 40 : 16})`)
  }
  // 不只是命中测试对:最小窗宽下**真的点一次关闭钮**,窗体消失(Playwright 的 click 自带
  // 「命中点必须是目标元素」的可操作判定,故这一步同时是端到端的证明)。
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await filePanel.locator('.dl-window__resize--e').focus()
  await page.keyboard.press('Home')
  await expect.poll(async () => Math.round((await filePanel.boundingBox())?.width ?? 0), { message: '文件窗已收到最小宽' }).toBe(PANEL_MIN_W)

  // 收窄**不删功能**:最窄档把「自动换行」的可见文字换成图标,但可访问名、aria-pressed 与
  // 可操作性都不变(否则收窄就变成了静默砍功能)。
  const wrapToggle = filePanel.locator('.file-panel__toggle')
  await expect(wrapToggle.locator('.file-panel__toggle-label'), '最窄档隐去可见文字').toBeHidden()
  await expect(wrapToggle.locator('.file-panel__toggle-icon'), '同一枚钮换成图标').toBeVisible()
  await expect(wrapToggle, '隐去文字后仍有可访问名').toHaveAttribute('aria-label', '自动换行')
  await expect(wrapToggle).toHaveAttribute('aria-pressed', 'false')
  await wrapToggle.click()
  await expect(wrapToggle, '最窄档仍可操作,状态语义不变').toHaveAttribute('aria-pressed', 'true')

  await filePanel.locator('.file-panel__close').click()
  await expect(page.locator(`${FILE_PANEL}[data-mode="floating"]`), '最小窗宽下关闭钮真的能用').toHaveCount(0)

  // ---- 对话窗:只有两枚图标钮,预期本来就过 —— 用同一条断言确认,不靠眼看 ----
  const slot = page.locator('.tab-slot').first()
  await slot.locator(CHAT_TAB_POP).focus()
  await page.keyboard.press('Enter')
  const chatPanel = page.locator(`${CHAT_PANEL}[data-mode="floating"]`)
  await expect(chatPanel, '拆出为悬浮对话窗').toHaveCount(1)
  for (const width of [1280, 768] as const) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await auditHeaderHitTargets(page, chatPanel, PANEL_MIN_W, `对话窗 @${width}(gutter ${width >= 1024 ? 40 : 16})`)
  }
})

// 输入坞的焦点环:全局 :focus-visible 给的是**外扩** 3px 的环,而输入框住在
// `.textarea-sizer { overflow: hidden }` 里、两者盒子逐值相等 —— 环画在输入框身上会整条被裁掉,
// 只剩四个圆角处逃出的小楔形(实测强差异像素仅 327 个,四条边的中点全无变化),键盘用户看不出
// 哪个输入框被聚焦。修法是把环改画在**输入坞容器**上(与 .conversation-search 同一条既有做法),
// 且容器必须落在任何裁切祖先之内 —— 这两件事都是机械可判定的,故在这里锁死。
test('输入坞焦点环:画在容器上、输入框自身无环,且不被任何裁切祖先切掉(区域与悬浮窗体两处)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForStable(page)

  // 聚焦输入框后,量三件事:容器的环、输入框自身的环、以及「环的外扩量是否落在所有裁切祖先之内」。
  const audit = async (selector: string): Promise<{ ring: string; textareaRing: string; clipMargin: number }> =>
    page.locator(selector).evaluate(async (form) => {
      const textarea = form.querySelector('textarea')
      if (!(textarea instanceof HTMLTextAreaElement)) throw new Error(`找不到输入框:${selector}`)
      textarea.focus()
      // 实测:`focus()` 之后**同步**读 computed box-shadow 会读到尚未落定的中间值
      // (`rgba(0,0,0,0.2) 0px 2px 8px 0px, oklab(0 0 0 / 0) 0px 0px 0px 0px` —— 静置态只有一条阴影,
      // 读到的却被补成了两条、第二条是透明的零值)。本仓没有给 .composer-form 声明过渡,
      // 具体成因未查明;等一拍再读可稳定拿到落定值,故按此处置。
      await new Promise((resolve) => setTimeout(resolve, 400))
      const rect = form.getBoundingClientRect()
      // 外扩环会被任何 overflow 非 visible 的祖先裁掉,故取「容器到各裁切祖先内缘」的最小距离。
      let clipMargin = Number.POSITIVE_INFINITY
      let node: HTMLElement | null = form.parentElement
      while (node !== null) {
        const style = getComputedStyle(node)
        if (style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible') {
          const outer = node.getBoundingClientRect()
          clipMargin = Math.min(clipMargin, rect.left - outer.left, rect.top - outer.top, outer.right - rect.right, outer.bottom - rect.bottom)
        }
        node = node.parentElement
      }
      return {
        ring: getComputedStyle(form).boxShadow,
        textareaRing: getComputedStyle(textarea).boxShadow,
        clipMargin: Number.isFinite(clipMargin) ? clipMargin : Number.POSITIVE_INFINITY,
      }
    })

  const docked = await audit('.conversation-panel .composer-form')
  expect(docked.ring, '环画在输入坞容器上').toContain('0px 0px 0px 3px')
  expect(docked.textareaRing, '输入框自身不再画环(否则与容器叠成双层)').toBe('none')
  expect(docked.clipMargin, '外扩 3px 的环完整落在裁切祖先之内').toBeGreaterThanOrEqual(3)

  // 拆出一段对话:悬浮窗体里的输入坞(同一个组件、另一种宿主)同样成立。
  await page.locator('.tab-pop').first().click()
  const floating = page.locator(`${CHAT_PANEL}[data-mode="floating"]`)
  await expect(floating).toHaveCount(1)
  const inPanel = await audit(`${CHAT_PANEL}[data-mode="floating"] .composer-form`)
  expect(inPanel.ring, '悬浮窗体里的环同样画在容器上').toContain('0px 0px 0px 3px')
  expect(inPanel.clipMargin, '不被窗体的 overflow:hidden 圆角面裁掉').toBeGreaterThanOrEqual(3)
})

// tab 上的状态徽标:既不许把标题压成 0 宽,也**不许自己被截断**。
// 前半条是「看不出是哪段对话」;后半条是语义问题 —— 英文 "Response complete" 截成 "Response…"
// 会被读成进行态,而它表达的恰恰是**已完成**,截短等于把语义读反(WCAG 1.4.1:这枚徽标存在的
// 唯一理由就是用文字表意,截到只剩省略号等于理由落空)。两个宽度各验一次:密(6 个 tab)与疏。
for (const width of [1280, 1600]) {
  test(`tab 状态徽标 @${width}:标题不被压没,徽标不被截断,且不压到相邻 tab`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForStable(page)

    // 常规态里 roadmap / launch 是「已完成且未看过」,带上文字徽标。
    const badged = page.locator('.conversation-tab:has(.tab-badge)')
    await expect(badged.first(), '条上存在带徽标的 tab').toBeVisible()

    const rows = await badged.evaluateAll((tabs) => tabs.map((tab) => {
      const label = tab.querySelector('.conversation-tab__label')
      const badge = tab.querySelector('.tab-badge')
      if (!(label instanceof HTMLElement) || !(badge instanceof HTMLElement)) return null
      const tabRect = tab.getBoundingClientRect()
      return {
        title: label.textContent ?? '',
        badgeText: badge.textContent ?? '',
        labelWidth: label.getBoundingClientRect().width,
        // scrollWidth > clientWidth ⟹ 文字被省略号截掉了。
        badgeTruncated: badge.scrollWidth > badge.clientWidth + 1,
        badgeRightBeyondTab: badge.getBoundingClientRect().right - tabRect.right,
      }
    }))
    for (const row of rows) {
      expect(row, '徽标节点结构完整').not.toBeNull()
      if (row === null) continue
      console.log(`[tab badge @${width}] ${JSON.stringify(row)}`)
      expect(row.labelWidth, `标题「${row.title}」不被徽标压没`).toBeGreaterThanOrEqual(40)
      expect(row.badgeTruncated, `徽标「${row.badgeText}」不被截断`).toBe(false)
      expect(row.badgeRightBeyondTab, `徽标「${row.badgeText}」不越过本 tab 右缘(否则压到相邻 tab)`).toBeLessThanOrEqual(1)
    }
  })
}
