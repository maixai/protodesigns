import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

// 设计校准:宽度清单在 .claude/rules/baseline-web.md 的四档之上追加 1024 ——
// ≥1024 是左右两栏布局,1024 是两栏的最窄情形,必须单独固化。
// 本页特殊约定(已确认的设计决定,须被测试固化):
//   1. 整页深色、节奏固定,不响应 prefers-color-scheme —— 系统浅色/深色下外观必须不变;
//   2. ≥1024 为左右两栏(左:Hero + 可达条 / 右:被外框框住的标签切换面板),
//      两栏同底、以一条内嵌式发丝线分隔;<1024 退回纵向堆叠(Hero → 可达条 → 切换面板);
//   3. 截图统一在 reduced-motion 下取:面板切换 / 滚动等动效瞬时完成,稳态确定。
const WIDTHS = [375, 768, 1024, 1280, 1600] as const
const VIEWPORT_HEIGHT = 900

// 横向溢出量:> 0 表示内容超出视口宽度,属于破版。
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

// 等待页面进入稳定态:本页无异步数据,等 h1 与页脚都落定即可
// (页脚是文档最后一屏,它出现说明整页已完成布局,截全页图不会截到未布局的状态)。
// 追加等容器字号落定:dev 模式下 Vite 以 JS 注入样式,挂载后第一拍 .dl-container
// 子树可能仍按 16px 默认字号计算(em 尺寸随之偏大 —— 实测安装卡组 1120px,
// 落定后 1050px,页脚随之位移 22px);生产构建的 CSS 是 <head> 阻塞 <link>,无此瞬态
// (已用 vite preview 验证)。不等待会把「样式在途」误判成「交互引发布局位移」。
// 15px 即 --dl-font-size-md(测试无法引用 CSS 变量,取值须同步)。
async function waitForStable(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('.site-footer')).toBeVisible()
  // 逐容器等到齐:各 .dl-container 的翻转并不同时(实测首个容器已 15px 时
  // 安装区块仍可能 16px),必须全部落定
  await expect
    .poll(() =>
      page
        .locator('.dl-container')
        .evaluateAll((els) => els.every((el) => getComputedStyle(el).fontSize === '15px')),
    )
    .toBe(true)
  // 再确认页脚文档坐标在两次采样间不动:字号翻转是单调的,但异步到来时机不定,
  // 「见到全 15px」只能说明此刻落定;位置在 150ms 窗口内不变才是布局落定的终证
  const footer = page.locator('.site-footer')
  let previousY = Number.NaN
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(150)
        const y = await footer.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
        const settled = y === previousY
        previousY = y
        return settled
      },
      { timeout: 10_000 },
    )
    .toBe(true)
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
      // inert 内容不在无障碍树中(不可感知、不可操作),不参与对比度断言;
      // 同时规避切换动效进行中"旧 panel 淡出未完成"的误判(属性翻转与渲染提交
      // 不在同一拍,可能读到 visibility:visible + opacity:0 的中间态)。
      if (element.closest('[inert]') !== null) continue
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
    // 系统浅色下的截图即基线。
    await expect(page).toHaveScreenshot(`home-${width}.png`, { fullPage: true })
    // 整页深色、节奏固定、不响应系统主题:系统深色模式下必须命中同一基线。
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

// 切换面板逐屏遍历:非活动 panel 是 visibility:hidden,天然截不到图、
// 对比度断言也扫不到,必须逐屏激活后分别验证,否则覆盖率会假性达标。
// 截图基线只在基准宽度 1280 逐屏各截一张;其余宽度保留整页截图(默认首屏)。
const TAB_LABELS = ['Forms', 'Anywhere', 'Share', 'Configure', 'Quickstart'] as const
const TAB_IDS = ['form-factors', 'anywhere', 'share', 'config', 'quickstart'] as const

test('切换面板逐屏:不破版且对比度达标', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  const indicator = page.locator('.feature-tabs__indicator')

  for (const [index, id] of TAB_IDS.entries()) {
    const label = TAB_LABELS[index] ?? ''
    if (index > 0) {
      const activeTab = page.getByRole('tab', { name: label, exact: true })
      await activeTab.click()
      // 点击后指针悬停在活动标签上;移开指针,让后续断言与截图都落在静止态上。
      await page.mouse.move(0, 0)
      const panel = page.getByRole('tabpanel', { name: label })
      await expect(panel).toBeVisible()
      // 等切换动效落定再断言与截图:webkit 上 0.01ms 过渡的计算样式翻转
      // 与渲染提交不在同一拍,不等待会读到 / 截到淡出中的中间态。
      await expect
        .poll(() => panel.evaluate((el) => Number(getComputedStyle(el).opacity)))
        .toBe(1)
      // 青瓷短线随切换实测重定位:等它的宽度被写出(非初始 0)且位置落定,
      // 否则截图可能截到短线尚未平移到位的中间态。
      await expect
        .poll(() => indicator.evaluate((el) => Number.parseFloat(getComputedStyle(el).width)))
        .toBeGreaterThan(0)
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    expect(await contrastViolations(page)).toEqual([])
    await expect(page).toHaveScreenshot(`home-1280-panel-${id}.png`, { fullPage: true })
  }
})

// tab 切换与地址栏 hash 同步:点击与键盘两条路径都必须把 hash 更新为当前激活
// panel 的 id —— 否则用户切面板后复制链接 / 刷新,所见与当前面板不一致。
// 同时断言落位不被破坏:写 hash 必须经组件内的静默机制(replaceState + 暂时摘除
// 锚点 id),不得引发页面滚动(原生片段滚动会改变落位)。
test('切换标签后地址栏 hash 同步为当前面板 id,且不引发页面滚动', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  // 先滚一个小偏移并记录位置:后续写 hash 不得改变页面滚动位置。
  // (两栏布局下切换区块紧邻顶栏,scrollIntoView 会贴到 scrollY=0,
  //  无法区分"没滚动"与"被拽回顶部",故显式滚开。)
  await page.evaluate(() => {
    window.scrollTo({ top: 80, behavior: 'instant' })
  })
  const scrollBefore = await page.evaluate(() => window.scrollY)
  expect(scrollBefore).toBeGreaterThan(0)
  const historyBefore = await page.evaluate(() => history.length)

  // 点击路径
  const shareTab = page.getByRole('tab', { name: 'Share', exact: true })
  await shareTab.click()
  await expect(shareTab).toHaveAttribute('aria-selected', 'true')
  expect(await page.evaluate(() => window.location.hash)).toBe('#share')
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)

  // 键盘路径:←/→ 循环切换
  await shareTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Configure', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(await page.evaluate(() => window.location.hash)).toBe('#config')
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)

  // 键盘路径:Home / End 跳首尾
  await page.keyboard.press('End')
  await expect(page.getByRole('tab', { name: 'Quickstart', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(await page.evaluate(() => window.location.hash)).toBe('#quickstart')
  await page.keyboard.press('Home')
  expect(await page.evaluate(() => window.location.hash)).toBe('#form-factors')
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)

  // hash 同步用 replace 语义:连续切换不应堆历史记录(否则后退会逐个回放标签)。
  expect(await page.evaluate(() => history.length)).toBe(historyBefore)
})

// 顶栏高度:与 --dl-header-height 同源(测试无法引用 CSS 变量,取值须同步)。
const HEADER_HEIGHT = 60

// hash 深链:五个 panel 保留公开锚点 id,Hero 双按钮与页脚 NAVIGATE 依赖此能力。
// 落位判定是「标签栏不被顶栏遮挡」而不是「发生滚动」—— 两栏布局(≥1024)下
// 切换区块紧邻顶栏,正确落位时 scrollY 可以是 0。
test('hash 深链:#quickstart 直达最后一屏且标签栏不被顶栏遮挡', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/#quickstart')
  await waitForStable(page)

  await expect(page.getByRole('tabpanel', { name: 'Quickstart' })).toBeVisible()
  // 页面上有两个 tablist(特性切换 + 安装引导),限定到特性切换的标签条
  const tablistBox = await page.locator('.feature-tabs__tablist').boundingBox()
  expect(tablistBox).not.toBeNull()
  if (tablistBox === null) return
  expect(tablistBox.y).toBeGreaterThanOrEqual(HEADER_HEIGHT)
})

// 深链落位回归:五个 hash 入口在桌面与窄屏下,落位后标签栏与活动面板都必须
// 在视口内且不被 sticky 顶栏遮挡(滚动目标是整个区块顶部,公开锚点 id 挂在
// 区块顶部的锚点 span 上,原生与补滚两条路径的落点因此一致)。
// 窄屏追加:活动标签在横向滚动区内必须完整可见(激活时自动横向对齐)。
for (const width of [1280, 375] as const) {
  for (const [index, id] of TAB_IDS.entries()) {
    const label = TAB_LABELS[index] ?? ''
    test(`hash 深链 #${id} @${width}px:标签栏与面板可见且不被顶栏遮挡`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
      await page.goto(`/#${id}`)
      await waitForStable(page)
      if (width === 375) {
        // 堆叠模式:等挂载后的补滚落定(reduced-motion 下滚动即时完成)
        await page.waitForFunction(() => window.scrollY > 0)
      } else {
        // 两栏模式:区块紧邻顶栏,等「标签栏顶 ≥ 顶栏底」的落位成立即可
        await page.waitForFunction((headerHeight) => {
          const tablist = document.querySelector('.feature-tabs__tablist')
          return tablist !== null && tablist.getBoundingClientRect().top >= headerHeight
        }, HEADER_HEIGHT)
      }

      const panel = page.getByRole('tabpanel', { name: label })
      await expect(panel).toBeVisible()

      const tablistBox = await page.locator('.feature-tabs__tablist').boundingBox()
      const panelBox = await panel.boundingBox()
      expect(tablistBox).not.toBeNull()
      expect(panelBox).not.toBeNull()
      if (tablistBox === null || panelBox === null) return

      // 标签栏:完整落在视口纵向范围内,且不被顶栏遮挡
      expect(tablistBox.y).toBeGreaterThanOrEqual(HEADER_HEIGHT)
      expect(tablistBox.y + tablistBox.height).toBeLessThanOrEqual(VIEWPORT_HEIGHT)
      // 面板:顶部落在视口内且不被顶栏遮挡(面板可能高于一屏,不断言底部)
      expect(panelBox.y).toBeGreaterThanOrEqual(HEADER_HEIGHT)
      expect(panelBox.y).toBeLessThanOrEqual(VIEWPORT_HEIGHT)

      if (width === 375) {
        // 窄屏:活动标签横向完整落在视口内
        const tabBox = await page
          .getByRole('tab', { name: label, exact: true })
          .boundingBox()
        expect(tabBox).not.toBeNull()
        if (tabBox === null) return
        expect(tabBox.x).toBeGreaterThanOrEqual(0)
        expect(tabBox.x + tabBox.width).toBeLessThanOrEqual(width)
      }
    })
  }
}

// M1 回归:URL 已是 #quickstart 时,对完全相同的 URL+fragment 再导航
// (地址栏对同一含片段 URL 再回车即走此路径)。这条路径不派发 hashchange、
// 不触发任何 JS 回调,落位完全由浏览器原生片段滚动决定 —— 公开锚点 id 挂在
// 区块顶部的锚点 span 上,原生落点 = 区块顶部,标签栏不得被顶栏遮住。
// (曾有的 bug:锚点 id 挂在 panel 上时,此路径把 panel 滚到顶栏下沿,
//  同区块的标签栏被整体滚到顶栏背后。)
for (const width of [1280, 375] as const) {
  test(`同 URL 同 fragment 再导航 @${width}px:标签栏不被顶栏遮挡`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await page.goto('/#quickstart')
    await waitForStable(page)

    // 模拟地址栏回车:同文档片段导航,不重载、无 hashchange。
    // (个别引擎对 href 自赋值按重载处理,此时上下文销毁属预期;
    //  重载后走初始深链路径,落位同样必须正确,后续断言仍成立。)
    await page
      .evaluate(() => {
        window.location.href = window.location.href
      })
      .catch(() => {})
    await waitForStable(page)

    const tablist = page.locator('.feature-tabs__tablist')
    await expect
      .poll(async () => (await tablist.boundingBox())?.y ?? Number.NEGATIVE_INFINITY)
      .toBeGreaterThanOrEqual(HEADER_HEIGHT)
    // 激活态与面板不受再导航影响
    await expect(
      page.getByRole('tab', { name: 'Quickstart', exact: true }),
    ).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel', { name: 'Quickstart' })).toBeVisible()
  })
}

// 窄屏切换回归:激活态变化时活动标签必须自动横向对齐进可视区。
// 用 hash 切换而不是 click —— Playwright 的 click 会自动把元素滚进视口,遮蔽回归。
test('375px:切到最后一个标签后,活动标签横向完整可见', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  await page.evaluate(() => {
    window.location.hash = '#quickstart'
  })
  const lastTab = page.getByRole('tab', { name: 'Quickstart', exact: true })
  await expect(lastTab).toHaveAttribute('aria-selected', 'true')
  // 等标签栏横向对齐落定
  await page.waitForFunction(
    () => (document.querySelector('.feature-tabs__tablist')?.scrollLeft ?? 0) > 0,
  )

  const box = await lastTab.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
  // 活动标签不贴视口边缘:仪器外框本身带来至少 41px 的内缩
  // (页面 gutter 24 + 外框描边 1 + 外框 padding 16),标签条另有自己的
  // scroll-padding 对齐 gutter。留 4px 容差防亚像素抖动。
  expect(box.x + box.width).toBeLessThanOrEqual(375 - 20)
})

// M2 回归:375px 下标签条横向溢出时 ——
// ① 初始即有可见的溢出暗示(溢出端渐隐遮罩,由 JS 按可滚余量加类);
// ② 非触屏指针有可用路径:鼠标纵向滚轮在标签条上映射为横向滚动,
//    末项可因此滚进视野(此前鼠标用户没有任何手段够到末项)。
test('375px:标签条溢出有可见暗示,鼠标滚轮可把末项滚进视野', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  // 把切换区块滚进视口,确保鼠标悬停在标签条上
  await page.evaluate(() => {
    document.querySelector('.feature-tabs')?.scrollIntoView({ behavior: 'instant' })
  })
  const tablist = page.locator('.feature-tabs__tablist')

  // ① 溢出暗示:溢出端遮罩生效(优先读标准属性,退回 -webkit- 前缀)
  await expect
    .poll(() =>
      tablist.evaluate((el) => {
        const style = getComputedStyle(el)
        return style.maskImage !== 'none'
          ? style.maskImage
          : style.getPropertyValue('-webkit-mask-image')
      }),
    )
    .toContain('linear-gradient')

  // ② 鼠标滚轮(非触屏)横向滚动
  const box = await tablist.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const scrollBefore = await tablist.evaluate((el) => el.scrollLeft)
  await page.mouse.wheel(0, 480)
  await expect
    .poll(() => tablist.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(scrollBefore)

  // 末项滚进视野:可见宽度不低于 40px
  const lastTab = page.getByRole('tab', { name: 'Quickstart', exact: true })
  const lastBox = await lastTab.boundingBox()
  expect(lastBox).not.toBeNull()
  if (lastBox === null) return
  const visibleWidth = Math.min(lastBox.x + lastBox.width, 375) - Math.max(lastBox.x, 0)
  expect(visibleWidth).toBeGreaterThanOrEqual(40)
})

// m2 回归:标签条尺寸变化(窗口缩放 / 字号 / 语言切换)后,活动标签必须补正
// 横向对齐,且补正只动横向 —— 不得拽动页面纵向滚动。
test('标签条尺寸变化后活动标签补正横向对齐,且不引发页面纵向滚动', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  // 先切到末项并滚到页脚(标签条离屏),再缩到窄屏触发标签条尺寸变化
  await page.evaluate(() => {
    window.location.hash = '#quickstart'
  })
  await expect(page.getByRole('tab', { name: 'Quickstart', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await page.evaluate(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
  })
  // 竞态防线:instant 滚动在并行负载下未必在 resize 前落笔 —— 若缩窗时滚动
  // 尚未生效,WebKit 会按未滚动的状态钳位,之后读到的 scrollY 恒为 0( flaky )。
  // 先等纵向滚动真正落定再缩窗,断言的前提才确定。
  await page.waitForFunction(() => window.scrollY > 0)
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })

  // 等 ResizeObserver 回调完成补正(横向 scrollLeft 被写正)
  await page.waitForFunction(
    () => (document.querySelector('.feature-tabs__tablist')?.scrollLeft ?? 0) > 0,
  )
  // 补正只动横向:页面纵向滚动不得归零(标签条此刻不在视口内)
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(0)

  // 把切换区块滚回视口:活动标签应已被补正对齐,横向完整可见
  await page.evaluate(() => {
    document.querySelector('.feature-tabs')?.scrollIntoView({ behavior: 'instant' })
  })
  const lastTab = page.getByRole('tab', { name: 'Quickstart', exact: true })
  const box = await lastTab.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)
})

// M3 回归:选中态对比度 —— 青瓷短线 vs 页面底、vs 表头线(其相邻色)均 ≥ 3:1
// (非文本组件,WCAG 1.4.11);活动标签文字 vs 页面底 ≥ 4.5:1(正文阈值)。
// 仪器外框 vs 页面底:实测约 1.95:1,低于 3:1 —— 深色下面阶差物理上无法更大,
// 层级由线承担,登记为已知偏离(annotate,不粉饰、不断言达标)。
test('选中态对比度:青瓷短线/相邻色 ≥3:1,活动标签文字/页面底 ≥4.5:1', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  const ratios = await page.evaluate(() => {
    type Rgb = [number, number, number]

    function parseColor(value: string): Rgb {
      const matched = value.match(/rgba?\(([^)]+)\)/)
      const parts = (matched?.[1] ?? '0,0,0')
        .split(/[,/\s]+/)
        .filter((part) => part.length > 0)
        .map(Number)
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
    }

    function luminance(color: Rgb): number {
      const channel = (value: number): number => {
        const scaled = value / 255
        return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])
    }

    function ratio(a: Rgb, b: Rgb): number {
      const la = luminance(a)
      const lb = luminance(b)
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
    }

    const indicator = document.querySelector('.feature-tabs__indicator')
    const head = document.querySelector('.feature-tabs__head')
    const frame = document.querySelector('.feature-tabs__frame')
    const split = document.querySelector('.home-split')
    const activeTab = document.querySelector('[role="tab"][aria-selected="true"]')
    if (indicator === null || head === null || frame === null || split === null || activeTab === null) {
      return null
    }
    const indicatorBg = parseColor(getComputedStyle(indicator).backgroundColor)
    const baselineColor = parseColor(getComputedStyle(head).borderBottomColor)
    const frameBorder = parseColor(getComputedStyle(frame).borderTopColor)
    const pageBase = parseColor(getComputedStyle(split).backgroundColor)
    const tabText = parseColor(getComputedStyle(activeTab).color)
    return {
      indicatorVsBase: ratio(indicatorBg, pageBase),
      indicatorVsBaseline: ratio(indicatorBg, baselineColor),
      textVsBase: ratio(tabText, pageBase),
      frameVsBase: ratio(frameBorder, pageBase),
    }
  })
  expect(ratios).not.toBeNull()
  if (ratios === null) return
  expect(ratios.indicatorVsBase).toBeGreaterThanOrEqual(3)
  expect(ratios.indicatorVsBaseline).toBeGreaterThanOrEqual(3)
  expect(ratios.textVsBase).toBeGreaterThanOrEqual(4.5)
  // 已知偏离登记:外框描边(--dl-border-strong)对页面底低于 3:1。
  // 此处只断言它确实可被分辨(>1),实测值随报告流出。
  testInfo.annotations.push({
    type: 'known-deviation',
    description: `仪器外框/页面底对比度 ${ratios.frameVsBase.toFixed(2)}:1,低于 WCAG 1.4.11 的 3:1 建议值 —— 深色下面阶差物理受限,层级由线承担,登记为已知偏离`,
  })
  expect(ratios.frameVsBase).toBeGreaterThan(1)
})

// 两栏最窄情形(1024px):表头线标签条在右栏(约 504px 可用)内必须放得下,
// 等宽五格不得溢出为横向滚动(此区间没有挂溢出暗示,溢出会静默裁掉末项)。
test('1024px:表头线标签条在右栏内不溢出', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1024, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  const overflow = await page
    .locator('.feature-tabs__tablist')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
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

  // 滚动状态下语言切换与登录仍可见可点,不是"滚到中部就够不着"。
  // (顶栏已精简:无导航项与 CTA 链接,只留品牌 / 语言 / 登录。)
  await expect(header.getByRole('button', { name: 'Language' })).toBeVisible()
  const login = header.getByRole('button', { name: 'Sign in' })
  await expect(login).toBeVisible()

  // 登录暂不接流程,但点击必须弹轻提示,不能是无反应的假交互。
  await login.click()
  await expect(page.locator('.n-message')).toContainText('sign-in')
})

test('切换语言后页面文案与 <html lang> 随之变化', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your AI agent, always within reach' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Language' }).click()
  // 语言下拉经 menu-props / node-props 注入了 menu / menuitemradio 角色
  // (NDropdown 默认不输出任何 ARIA 角色),按角色 + 文案定位。
  await page.getByRole('menuitemradio', { name: '中文' }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: '随时在你身边的 AI Agent' }),
  ).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page).toHaveTitle(/Mia/)

  // 区块的无障碍名称也必须随语言切换,不能残留英文。
  // (「Mia 的可达方式」是可达性事实条 ReachBar 的 region 名,不受面板化改造影响。)
  await expect(page.getByRole('region', { name: 'Mia 的可达方式' })).toBeVisible()
  // 切换面板的 tab 与 tabpanel 名称同样随语言切换(默认活动面板为第一屏「两种形态」)。
  await expect(page.getByRole('tab', { name: '统一管理' })).toBeVisible()
  await expect(page.getByRole('tabpanel', { name: '两种形态' })).toBeVisible()
})

// ==========================================================================
// 安装引导(Install section):三 Tab 切换 + 满宽两列面板 + 平台检测高亮
// ==========================================================================
//
// v3 重做后的验收锚点(v1 / v2 的失败阈值全部转成可判定的几何断言):
//   - 仪器外框满容器宽(1280→1232 / 1600→1520),不再出现 v2 的「内容岛」;
//   - 左列钉在正文行宽 35em(15px 字号下 525px),不再出现 v2 的 19 字/行;
//   - 三面板叠放、容器 = 最高面板:高度红线按宽度分档 —— ≥1024 绝对口径
//     (高度差 <5%、每个面板 ≥320px、最矮面板与容器之间 ≤96px),<1024
//     单列堆叠改比例口径(空白带 ≤ 容器高 1/8),两档都有断言覆盖;
//   - 各面板左列填充率 ≥90%(headless 曾只填 57%,M3);
//   - 首个 Tab 内容左缘与面板内容左缘同轴(:first-of-type,M1);
//   - 安装 Tab 是组件内状态,绝不接管地址栏 hash(feature-tabs 是唯一 hash 所有者)。

// 安装命令:与 src/data/home.ts 的 HEADLESS_INSTALL_COMMAND 同源(测试无法引用
// 源码常量,取值须同步)。
const INSTALL_COMMAND = 'curl -fsSL https://mia.maix.ai/install.sh | sh'

// 剪贴板打桩:真实 clipboard 的可用性依赖权限与安全上下文,双引擎行为不一;
// 这里只验证组件自己的成功 / 失败两条路径。navigator.clipboard 可能不存在
// (非安全上下文),此时在原型链上补一个 stub。
async function stubClipboard(page: Page, mode: 'resolve' | 'reject'): Promise<void> {
  await page.addInitScript((stubMode) => {
    const writeText =
      stubMode === 'resolve'
        ? () => Promise.resolve()
        : () => Promise.reject(new DOMException('Write permission denied', 'NotAllowedError'))
    if (typeof navigator.clipboard === 'object' && navigator.clipboard !== null) {
      Object.defineProperty(navigator.clipboard, 'writeText', {
        configurable: true,
        value: writeText,
      })
    } else {
      Object.defineProperty(Navigator.prototype, 'clipboard', {
        configurable: true,
        get: () => ({ writeText }),
      })
    }
  }, mode)
}

// 切到指定的安装 Tab 并等切换动效落定(reduced-motion 下 0.01ms 过渡的计算样式
// 翻转与渲染提交不在同一拍,不等待会读到 / 截到淡出中的中间态)。
// 非活动面板是 inert(从无障碍树移除),所以不断言 inert 面板里的内容,
// 一律先切到目标 Tab。
async function selectInstallTab(page: Page, tabName: string, panelId: string): Promise<void> {
  const tab = page.getByRole('tab', { name: tabName })
  await tab.click()
  // 点击后指针悬停在活动标签上;移开指针,让后续断言与截图都落在静止态上
  await page.mouse.move(0, 0)
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const panel = page.locator(`#install-panel-${panelId}`)
  await expect(panel).toBeVisible()
  await expect
    .poll(() => panel.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBe(1)
}

// v3 几何验收(≥1024):外框满容器宽、左列守 35em、三面板内容高度差 <5% 且每个
// ≥320px、无 >96px 空白带、各面板左列填充率 ≥90%、首个 Tab 与面板内容左缘同轴、
// 事实格列数随宽度(≥1440 三列)。inert + visibility:hidden 的面板保留完整几何
// (布局不消失),可以在不切 Tab 的前提下测量全部三个面板。
async function expectInstallGeometry(page: Page, width: number): Promise<void> {
  // 面板满宽:仪器外框与 .dl-container 同宽同左缘(1px 容差防亚像素抖动)
  const containerBox = await page.locator('.install .dl-container').boundingBox()
  const frameBox = await page.locator('.install__frame').boundingBox()
  expect(containerBox).not.toBeNull()
  expect(frameBox).not.toBeNull()
  if (containerBox === null || frameBox === null) return
  expect(Math.abs(frameBox.width - containerBox.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(frameBox.x - containerBox.x)).toBeLessThanOrEqual(1)

  // M1:首个 Tab 的内容(图标)左缘与面板内容左缘同轴 —— 首 tab 左 padding 归零
  // 由 :first-of-type 承担(tablist 首元素子节点是装饰性指示条,:first-child
  // 永远匹配不到首 tab,曾因此失效)。此处 scrollLeft=0(未切换过 Tab)。
  const tabIconX = await page
    .locator('.install__tab')
    .first()
    .locator('svg')
    .first()
    .evaluate((el) => el.getBoundingClientRect().x)
  const panelContentX = await page
    .locator('#install-panel-desktopApp .install__eyebrow')
    .evaluate((el) => el.getBoundingClientRect().x)
  expect(Math.abs(tabIconX - panelContentX)).toBeLessThanOrEqual(1)

  // 左列守正文行宽:--dl-measure = 35em,在正文 15px 字号下解析为 525px
  // (测试无法引用 CSS 变量,取值须同步)
  const mainWidth = await page
    .locator('#install-panel-desktopApp .install__main')
    .evaluate((el) => el.getBoundingClientRect().width)
  expect(Math.abs(mainWidth - 525)).toBeLessThanOrEqual(2)

  // m1:事实格列数随宽度 —— ≥1440 右列 ≥674px,两列下格宽近 400px 而 dd 实测
  // 最宽 ~155px,右半全空,故升三列;以下保持两列(窄屏降一列由窄屏测试覆盖)
  const factCols = await page
    .locator('#install-panel-headless .install__facts')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
  expect(factCols).toBe(width >= 1440 ? 3 : 2)

  // 三面板内容高度(面板内层保持自然高度,align-items:start 不拉伸):
  //   1. 每个 ≥320px —— v1 的 98px 是失败阈值;
  //   2. 最高与最矮之差 <5% —— 「容器 = 最高面板」的代价(底部留白)趋零的证据;
  //   3. 最矮面板与容器之间 ≤96px —— 无大空白带的独立红线(≥1024 绝对值口径;
  //      <1024 单列堆叠用比例口径,见窄屏测试)。
  const inners = page.locator('.install__panel-inner')
  await expect(inners).toHaveCount(3)
  const heights = await inners.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  )
  const tallest = Math.max(...heights)
  const shortest = Math.min(...heights)
  for (const height of heights) expect(height).toBeGreaterThanOrEqual(320)
  expect(tallest - shortest).toBeLessThanOrEqual(tallest * 0.05)
  const panelsBox = await page.locator('.install__panels').boundingBox()
  expect(panelsBox).not.toBeNull()
  if (panelsBox === null) return
  expect(Math.abs(panelsBox.height - tallest)).toBeLessThanOrEqual(1)
  expect(panelsBox.height - shortest).toBeLessThanOrEqual(96)

  // M3:各面板左列填充率 ≥90%(可用内容高 = 面板内层高 − 96px 内边距)。
  // 修复前 headless 左列只填 57%,主按钮下方整片死空,竖线还把空放大。
  const mains = await page
    .locator('.install__panel .install__main')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
  expect(mains).toHaveLength(3)
  mains.forEach((mainHeight, index) => {
    const available = (heights[index] ?? 0) - 96
    expect(mainHeight).toBeGreaterThanOrEqual(available * 0.9)
  })
}

// 双语落差是前几轮反复出问题的地方,几何断言在 en / zh × 1280 / 1600 下各跑一遍。
test('安装引导:外框满宽、左列守行宽、三面板高度齐平(双语 × 两宽度)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  // en @ 1280(默认语言)
  await expectInstallGeometry(page, 1280)

  // zh @ 1280:经语言下拉切换(menuitemradio 单选语义)
  await page.getByRole('button', { name: 'Language' }).click()
  await page.getByRole('menuitemradio', { name: '中文' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expectInstallGeometry(page, 1280)

  // zh @ 1600:宽屏下复验(视口变化是同步重排,无需额外等待)
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await expectInstallGeometry(page, 1600)

  // en @ 1600
  await page.getByRole('button', { name: '语言' }).click()
  await page.getByRole('menuitemradio', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expectInstallGeometry(page, 1600)
})

// M2 窄屏口径:<1024 面板退化为单列堆叠,三面板的内容构成差异(桌面:两组分段
// 控件 + 6 格事实;Headless:命令区 + 说明段 + 4 格事实;移动端:说明段 + 4 组
// 多行事实)在纵向上完整展开,不再能被两列布局吸收 —— 压到 96px 以内只能塞占位
// 内容(反模式)或删真实内容。故窄屏用比例红线:最矮面板与容器之差 ≤ 容器高的
// 1/8(约一个内容块的高度;小于一个内容块的空档不会被读作「缺了一块」)。
// 断言没跑到的地方就是问题藏身处:375 / 768 双语都覆盖。
// 语言经 context locale 注入(navigator.language → 初始语言),不走语言下拉 ——
// 本测试断言的是几何,语言只是输入;并行负载下下拉点击不是确定路径。
test('窄屏(375 / 768):安装引导空白带在比例红线内(双语)', async ({ browser }) => {
  for (const width of [375, 768] as const) {
    for (const locale of ['en-US', 'zh-CN'] as const) {
      const context = await browser.newContext({
        viewport: { width, height: VIEWPORT_HEIGHT },
        reducedMotion: 'reduce',
        locale,
      })
      const page = await context.newPage()
      await page.goto('/')
      await waitForStable(page)

      // M1 同轴断言在窄屏同样成立(scrollLeft=0,未切换过 Tab)
      const tabIconX = await page
        .locator('.install__tab')
        .first()
        .locator('svg')
        .first()
        .evaluate((el) => el.getBoundingClientRect().x)
      const panelContentX = await page
        .locator('#install-panel-desktopApp .install__eyebrow')
        .evaluate((el) => el.getBoundingClientRect().x)
      expect(Math.abs(tabIconX - panelContentX)).toBeLessThanOrEqual(1)

      const heights = await page
        .locator('.install__panel-inner')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
      expect(heights).toHaveLength(3)
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(320)
      const shortest = Math.min(...heights)
      const panelsBox = await page.locator('.install__panels').boundingBox()
      expect(panelsBox).not.toBeNull()
      if (panelsBox === null) {
        await context.close()
        return
      }
      // 容器 = 最高面板(切换不跳动的前提)
      expect(Math.abs(panelsBox.height - Math.max(...heights))).toBeLessThanOrEqual(1)
      // 比例红线:空白带 ≤ 容器高的 1/8
      expect(panelsBox.height - shortest).toBeLessThanOrEqual(panelsBox.height / 8)
      await context.close()
    }
  }
})

// 命令块:满右列宽(满宽后长命令不再需要横向滚动)、15px 等宽、不换行。
test('安装引导:命令块满右列宽且不横向滚动', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)
  await selectInstallTab(page, 'Headless', 'headless')

  const asideBox = await page.locator('#install-panel-headless .install__aside').boundingBox()
  const wrapBox = await page.locator('.install__code-wrap').boundingBox()
  expect(asideBox).not.toBeNull()
  expect(wrapBox).not.toBeNull()
  if (asideBox === null || wrapBox === null) return
  // 命令框与右列同宽同左缘(满宽)
  expect(Math.abs(wrapBox.width - asideBox.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(wrapBox.x - asideBox.x)).toBeLessThanOrEqual(1)

  const code = page.locator('.install__code')
  // 1280 下右列足够宽:命令完整放下,代码区无横向滚动
  expect(await code.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
  await expect(page.locator('.install__command')).toHaveText(INSTALL_COMMAND)
  expect(
    await page.locator('.install__command').evaluate((el) => getComputedStyle(el).whiteSpace),
  ).toBe('nowrap')
  // 命令字号 15px(--dl-font-size-md;测试无法引用 CSS 变量,取值须同步)
  expect(
    await page.locator('.install__command').evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('15px')
})

// Tab 语义:roving tabindex + ←/→ 循环 + Home/End 跳首尾(自动激活,焦点留在 tab 上);
// 切换绝不写地址栏 hash(feature-tabs 已有整套 hash 机制,安装 Tab 只是组件内状态)。
test('安装引导:Tab 键盘操作合规,且切换不写地址栏 hash', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  const desktopTab = page.getByRole('tab', { name: 'Desktop app' })
  const headlessTab = page.getByRole('tab', { name: 'Headless' })
  const mobileTab = page.getByRole('tab', { name: 'Mobile' })

  // roving tabindex:仅选中 tab 为 0
  await expect(desktopTab).toHaveAttribute('tabindex', '0')
  await expect(headlessTab).toHaveAttribute('tabindex', '-1')

  await desktopTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(headlessTab).toHaveAttribute('aria-selected', 'true')
  await expect(headlessTab).toHaveAttribute('tabindex', '0')
  await expect(desktopTab).toHaveAttribute('tabindex', '-1')
  // 自动激活:焦点移到新 tab 上,不进入面板
  await expect(headlessTab).toBeFocused()
  await expect(page.getByRole('tabpanel', { name: 'Headless' })).toBeVisible()

  // Home / End 跳首尾
  await page.keyboard.press('End')
  await expect(mobileTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(desktopTab).toHaveAttribute('aria-selected', 'true')

  // 全程不写地址栏 hash(初始为空,切换后仍为空)
  expect(await page.evaluate(() => window.location.hash)).toBe('')
})

// 页脚零位移(上一版 Tab 切换页脚位移 115px 是被否的成因之一):
// 切换安装 Tab、切换平台 / 架构,页脚文档坐标都必须不动 —— 三面板叠放等高,
// 切换只动 transform / opacity;分段控件切换只改控件内选中态,不改任何高度。
// 页脚位置按文档坐标取(getBoundingClientRect + scrollY):Playwright 点击前会把
// 控件自动滚进视口,视口坐标会被这次滚动污染。
test('安装引导:切换 Tab、平台与架构时页脚位置不变', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  const footer = page.locator('.site-footer')
  const footerY = (): Promise<number> =>
    footer.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
  const y0 = await footerY()

  // 切换三个安装 Tab
  await selectInstallTab(page, 'Headless', 'headless')
  expect(await footerY()).toBe(y0)
  await selectInstallTab(page, 'Mobile', 'mobileApp')
  expect(await footerY()).toBe(y0)
  await selectInstallTab(page, 'Desktop app', 'desktopApp')
  expect(await footerY()).toBe(y0)

  // 切换平台与架构
  const platformGroup = page.getByRole('radiogroup', { name: 'Desktop platform' })
  const archGroup = page.getByRole('radiogroup', { name: 'Architecture or package' })
  await platformGroup.getByRole('radio', { name: 'Windows' }).click()
  expect(await footerY()).toBe(y0)
  await archGroup.getByRole('radio', { name: 'ARM64' }).click()
  expect(await footerY()).toBe(y0)
  await platformGroup.getByRole('radio', { name: 'Linux' }).click()
  expect(await footerY()).toBe(y0)
  await archGroup.getByRole('radio', { name: 'AppImage' }).click()
  expect(await footerY()).toBe(y0)
})

// 桌面面板:平台 / 架构切换后下载按钮文案同步变化(写明平台与架构,误判在点击前
// 可见);两个分段控件保持 radiogroup 语义与 aria-checked 切换。默认活动面板即桌面。
test('安装引导:桌面平台与架构切换同步下载按钮文案', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  const platformGroup = page.getByRole('radiogroup', { name: 'Desktop platform' })
  const archGroup = page.getByRole('radiogroup', { name: 'Architecture or package' })
  await expect(platformGroup).toBeVisible()
  await expect(archGroup).toBeVisible()

  // 默认:macOS + Apple silicon(roving tabindex:仅选中项为 0)
  const macos = platformGroup.getByRole('radio', { name: 'macOS' })
  await expect(macos).toHaveAttribute('aria-checked', 'true')
  await expect(macos).toHaveAttribute('tabindex', '0')
  await expect(platformGroup.getByRole('radio', { name: 'Windows' })).toHaveAttribute(
    'tabindex',
    '-1',
  )
  await expect(
    page.getByRole('button', { name: 'Download for macOS (Apple silicon)', exact: true }),
  ).toBeVisible()

  // 切到 Windows:架构回落到该平台第一项(AMD64)
  await platformGroup.getByRole('radio', { name: 'Windows' }).click()
  await expect(archGroup.getByRole('radio', { name: 'AMD64' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(
    page.getByRole('button', { name: 'Download for Windows (AMD64)', exact: true }),
  ).toBeVisible()

  // 切架构:ARM64
  await archGroup.getByRole('radio', { name: 'ARM64' }).click()
  await expect(
    page.getByRole('button', { name: 'Download for Windows (ARM64)', exact: true }),
  ).toBeVisible()

  // 切到 Linux:默认 deb
  await platformGroup.getByRole('radio', { name: 'Linux' }).click()
  await expect(
    page.getByRole('button', { name: 'Download for Linux (deb)', exact: true }),
  ).toBeVisible()

  // 下载不接真实下载,但点击必须给轻提示
  await page.getByRole('button', { name: 'Download for Linux (deb)', exact: true }).click()
  await expect(page.locator('.n-message')).toContainText('download')
})

// 移动端面板:单一行动点,点击给轻提示(不接后端,不能是无反应的假交互)。
test('安装引导:移动端等待列表点击给轻提示', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)
  await selectInstallTab(page, 'Mobile', 'mobileApp')

  await page.getByRole('button', { name: 'Join the waitlist' }).click()
  await expect(page.locator('.n-message')).toContainText('waitlist')
})

// 逐屏截图:headless / mobile 两个非默认面板各自的整页基线(默认桌面面板由
// home-1280 整页基线覆盖);切屏后断言不破版且对比度达标 —— inert 面板的文字
// 不参与全局对比度扫描,必须逐屏激活后分别验证,否则覆盖率假性达标。
const INSTALL_PANEL_SHOTS = [
  { tab: 'Headless', id: 'headless' },
  { tab: 'Mobile', id: 'mobileApp' },
] as const

test('安装引导逐屏:headless / mobile 面板不破版且对比度达标', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  for (const { tab, id } of INSTALL_PANEL_SHOTS) {
    await selectInstallTab(page, tab, id)
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
    expect(await contrastViolations(page)).toEqual([])
    await expect(page).toHaveScreenshot(`home-1280-install-${id}.png`, { fullPage: true })
  }
})

// 检测高亮:屏蔽 Chromium 的 userAgentData(否则自定义 UA 不生效 —— 检测优先取
// 低熵 platform 字段),让双引擎都走 userAgent 解析路径。
async function stubNoUAData(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'userAgentData', {
      configurable: true,
      get: () => undefined,
    })
  })
}

// 命中桌面平台(macOS UA):桌面 Tab 出现「你的系统」小标;三条红线之
// 「绝不隐藏其它项」—— 三个 Tab 必须俱在,且全页只有一处小标。
test('安装引导:检测到 macOS 时桌面 Tab 出现小标,且三个 Tab 俱在', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    viewport: { width: 1280, height: VIEWPORT_HEIGHT },
    reducedMotion: 'reduce',
  })
  await stubNoUAData(context)
  const page = await context.newPage()
  await page.goto('/')
  await waitForStable(page)

  await expect(page.locator('.install__tab')).toHaveCount(3)
  await expect(page.locator('.install__current')).toHaveCount(1)
  await expect(
    page.locator('.install__tab[data-target="desktopApp"] .install__current'),
  ).toHaveText('Your system')
  await context.close()
})

// 命中移动平台(Android UA):小标落在移动端 Tab 上;「只高亮、绝不改选中态」——
// 默认选中的桌面 Tab 保持不变。
test('安装引导:检测到 Android 时移动端 Tab 出现小标,且不改选中态', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    viewport: { width: 1280, height: VIEWPORT_HEIGHT },
    reducedMotion: 'reduce',
  })
  await stubNoUAData(context)
  const page = await context.newPage()
  await page.goto('/')
  await waitForStable(page)

  await expect(page.locator('.install__tab')).toHaveCount(3)
  await expect(page.locator('.install__current')).toHaveCount(1)
  await expect(
    page.locator('.install__tab[data-target="mobileApp"] .install__current'),
  ).toHaveText('Your system')
  // 只高亮:选中态不受检测结果影响
  await expect(page.locator('.install__tab[data-target="desktopApp"]')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await context.close()
})

// 检测失败是正常路径:解析不出的 UA 不出小标、无 JS 错误、三个 Tab 俱在。
test('安装引导:UA 解析不出时不出现小标且无报错', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: 'CustomAgent/1.0',
    viewport: { width: 1280, height: VIEWPORT_HEIGHT },
    reducedMotion: 'reduce',
  })
  await stubNoUAData(context)
  const page = await context.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await page.goto('/')
  await waitForStable(page)

  await expect(page.locator('.install__tab')).toHaveCount(3)
  await expect(page.locator('.install__current')).toHaveCount(0)
  expect(pageErrors).toEqual([])
  await context.close()
})

// iPadOS 桌面模式(m3):UA 伪装成 Macintosh 但保留 Mobile token,且带触点数;
// 单看 Macintosh / 低熵 platform=macOS 会被骗到桌面侧。「Mac 皮囊 + Mobile
// token 或触点」只可能是 iPad(Apple 不出触屏 Mac)—— 小标必须落在移动端 Tab。
test('安装引导:iPadOS 桌面模式 UA 落在移动端 Tab', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/605.1.15',
    viewport: { width: 1280, height: VIEWPORT_HEIGHT },
    reducedMotion: 'reduce',
    hasTouch: true,
  })
  await stubNoUAData(context)
  const page = await context.newPage()
  await page.goto('/')
  await waitForStable(page)

  await expect(page.locator('.install__tab')).toHaveCount(3)
  await expect(page.locator('.install__current')).toHaveCount(1)
  await expect(
    page.locator('.install__tab[data-target="mobileApp"] .install__current'),
  ).toHaveText('Your system')
  // 只高亮:选中态不受检测结果影响
  await expect(page.locator('.install__tab[data-target="desktopApp"]')).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await context.close()
})

// 复制成功路径:状态区(role="status",常驻 DOM)播报结果,两处复制按钮
// (左列主行动点 + 命令块图标按钮)共用同一状态机,可及名与字形同步变化。
// aria-live 唯一性按 DOM 计数:inert 面板从无障碍树移除,getByRole 在
// 非 headless 面板激活时数不到它,但「全页只有一个播报区」是 DOM 事实。
test('安装引导:复制安装命令成功 —— 状态区播报且两处按钮同步', async ({ page }) => {
  await stubClipboard(page, 'resolve')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)

  const status = page.locator('[role="status"]')
  await expect(status).toHaveCount(1)
  await expect(status).toBeAttached()

  await selectInstallTab(page, 'Headless', 'headless')
  const panel = page.locator('#install-panel-headless')

  // 左列主行动点:复制安装命令
  await panel.locator('.install__main').getByRole('button', { name: 'Copy install command' }).click()
  await expect(status).toHaveText('Copied')
  // 可及名同步变化(字形 copy → check 是纯视觉,断言落在可及名上);
  // 命令块图标按钮同步变为 Copied(共用同一状态机)
  await expect(
    panel.locator('.install__main').getByRole('button', { name: 'Copied' }),
  ).toBeVisible()
  await expect(
    panel.locator('.install__command-area').getByRole('button', { name: 'Copied' }),
  ).toBeVisible()
})

// 命令块图标复制按钮:与左列主按钮走同一逻辑、同一个 aria-live 状态区。
test('安装引导:命令块图标复制按钮共享同一状态区', async ({ page }) => {
  await stubClipboard(page, 'resolve')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)
  await selectInstallTab(page, 'Headless', 'headless')

  await page
    .locator('#install-panel-headless .install__command-area')
    .getByRole('button', { name: 'Copy install command' })
    .click()
  await expect(page.locator('[role="status"]')).toHaveText('Copied')
})

// 复制失败路径:clipboard reject(非安全上下文 / 权限被拒)时 ——
// 文案改「复制失败,请手动选择」且命令文本被自动选中(用户可直接 Ctrl+C)。
test('安装引导:复制失败 —— 提示失败且命令文本被选中', async ({ page }) => {
  await stubClipboard(page, 'reject')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)
  await selectInstallTab(page, 'Headless', 'headless')

  await page
    .locator('#install-panel-headless .install__command-area')
    .getByRole('button', { name: 'Copy install command' })
    .click()

  await expect(page.locator('[role="status"]')).toHaveText(
    'Copy failed — select the command manually',
  )
  // 自动选中命令文本:选区内容恰为安装命令(不含 $ 提示符)
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe(INSTALL_COMMAND)
})

// 窄屏:面板降单列后代码块横向滚动(overflow-x:auto)而不是压缩字号;
// 页面整体不横向溢出。
test('375px:安装引导代码块横向滚动而非压缩字号', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)
  await selectInstallTab(page, 'Headless', 'headless')

  const code = page.locator('.install__code')
  await expect(code).toBeVisible()
  // 命令比容器宽:代码区内部可横向滚动
  expect(await code.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0)
  // 字号保持 15px(--dl-font-size-md),不压缩
  expect(
    await page.locator('.install__command').evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('15px')
  // 页面整体不破版
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0)
})

// C1 回归:复制按钮在横向滚动容器之外(代码块右侧的固定格),命令文字被代码区
// 裁剪 —— 任何 scrollLeft 下文字与按钮都不可能交叠。此前按钮 absolute 叠在
// 滚动区右上角且无实底,375px 初始位置可见文字被图标盖住约 31px。
// 几何断言:按钮左缘不伸进代码区(代码区是裁剪边界,其右缘之右无可见文字),
// 在 scrollLeft = 0 与滚到最右两种状态下分别成立。
test('375px:复制按钮与命令可见区在两种滚动位置下均无交叠(C1)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)
  await selectInstallTab(page, 'Headless', 'headless')

  const code = page.locator('.install__code')
  const copy = page.locator('.install__copy')
  await expect(code).toBeVisible()

  // 前提:命令确实比代码区宽(存在横向滚动),否则本断言无意义
  expect(await code.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0)
  // 前提:代码区确实承担横向裁剪
  expect(await code.evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto')

  const assertNoOverlap = async (): Promise<void> => {
    const codeBox = await code.boundingBox()
    const copyBox = await copy.boundingBox()
    expect(codeBox).not.toBeNull()
    expect(copyBox).not.toBeNull()
    if (codeBox === null || copyBox === null) return
    // 1px 容差防亚像素抖动
    expect(copyBox.x).toBeGreaterThanOrEqual(codeBox.x + codeBox.width - 1)
  }

  // 初始 scrollLeft = 0
  expect(await code.evaluate((el) => el.scrollLeft)).toBe(0)
  await assertNoOverlap()
  // 滚到最右
  await code.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  expect(await code.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  await assertNoOverlap()
})

// m2:375 下 Tab 行横向溢出的可靠暗示 —— 溢出端渐隐遮罩(48px,与激活对齐的
// gutter 同源)+ 激活标签自动对齐进可视区。此前渐隐只有 32px 且激活对齐用
// scrollIntoView nearest,切换后左缘留下超出渐隐区的半截实体文字碎片。
// 「无碎片」判据:任何被边缘切断的标签,min(可见宽, 隐藏宽) ≤ 渐隐宽 + 1px
// —— 要么残段完整落在渐隐区内(可见 ≤48),要么只缺一个尾巴(隐藏 ≤48);
// 两侧都超过渐隐宽的「中段实体碎片」不允许存在。
async function expectTabRowNoFragment(page: Page): Promise<void> {
  const fragments = await page.evaluate(() => {
    const tl = document.querySelector('.install__tablist')
    if (tl === null) return [-1]
    const left = tl.scrollLeft
    const right = left + tl.clientWidth
    const out: number[] = []
    for (const tab of tl.querySelectorAll<HTMLElement>('[role="tab"]')) {
      const start = tab.offsetLeft
      const end = start + tab.offsetWidth
      const visible = Math.min(end, right) - Math.max(start, left)
      const hidden = end - start - visible
      if (visible > 1 && hidden > 1) out.push(Math.min(visible, hidden))
    }
    return out
  })
  for (const fragment of fragments) expect(fragment).toBeLessThanOrEqual(49)
}

// 活动标签完整落在可视区内(含 gutter clearance 48px 的容忍: clamp 到滚动边界时
// 一侧 clearance 可为 0)。
async function expectActiveTabInView(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const tl = document.querySelector('.install__tablist')
    const active = tl?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    if (tl === null || active === undefined || active === null) return null
    const left = tl.scrollLeft
    const right = left + tl.clientWidth
    const start = active.offsetLeft
    const end = start + active.offsetWidth
    return { inView: start >= left - 1 && end <= right + 1 }
  })
  expect(result).not.toBeNull()
  expect(result?.inView).toBe(true)
}

test('375px:安装 Tab 行溢出端渐隐、激活对齐进可视区且无碎片(m2,双语)', async ({
  browser,
}) => {
  // 语言经 context locale 注入(同窄屏测试的理由:并行负载下语言下拉不是确定路径)
  for (const locale of ['en-US', 'zh-CN'] as const) {
    const context = await browser.newContext({
      viewport: { width: 375, height: VIEWPORT_HEIGHT },
      reducedMotion: 'reduce',
      locale,
    })
    const page = await context.newPage()
    await page.goto('/')
    await waitForStable(page)

    const tablist = page.locator('.install__tablist')
    const isZh = locale === 'zh-CN'
    const lastTabName = isZh ? '移动端' : 'Mobile'

    // 初始:scrollLeft=0,只有右端溢出 → 只有右端渐隐
    await expect(tablist).toHaveClass(/install__tablist--overflow-end/)
    await expect(tablist).not.toHaveClass(/install__tablist--overflow-start/)
    expect(await tablist.evaluate((el) => el.scrollLeft)).toBe(0)
    // 前提:标签行确实溢出,否则本断言无意义
    expect(await tablist.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0)
    await expectTabRowNoFragment(page)

    // 切到最后一个 Tab:scrollLeft 右移,左端出现渐隐;活动标签完整入视野
    await page.getByRole('tab', { name: lastTabName }).click()
    await expect(page.getByRole('tab', { name: lastTabName })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect
      .poll(() => tablist.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0)
    await expect(tablist).toHaveClass(/install__tablist--overflow-start/)
    await expectActiveTabInView(page)
    await expectTabRowNoFragment(page)

    // 切回中间 Tab:两端都可再滚 → 两端渐隐俱在;活动标签仍完整入视野
    await page.getByRole('tab', { name: 'Headless' }).click()
    await expect(page.getByRole('tab', { name: 'Headless' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(tablist).toHaveClass(/install__tablist--overflow-start/)
    await expect(tablist).toHaveClass(/install__tablist--overflow-end/)
    await expectActiveTabInView(page)
    await expectTabRowNoFragment(page)

    await context.close()
  }
})

// M1 回归:复制按钮命中区 ≥ 44×44(--dl-target-size,design-language.md §⑭),
// 视觉字形不随命中区放大。
test('安装引导:复制按钮命中区不小于 44×44(M1)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)
  await selectInstallTab(page, 'Headless', 'headless')

  // 命令块内的图标复制按钮(左列主按钮是全宽文字按钮,天然满足)
  const box = await page.locator('.install__copy').boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
})

// m1 回归:复制状态区按行高预留一整行,填入播报文案时高度不变、
// 全页不下移(此前 min-height:1em 只有 12px,填入 17px 行盒把页脚顶下 5px)。
// 页脚位置按文档坐标取:点击复制按钮时 Playwright 会先把它滚进视口,
// 视口坐标会被这次滚动污染。
test('安装引导:点击复制写入状态文案时页脚位置不变(m1)', async ({ page }) => {
  await stubClipboard(page, 'resolve')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await page.goto('/')
  await waitForStable(page)
  await selectInstallTab(page, 'Headless', 'headless')

  const footer = page.locator('.site-footer')
  const footerY = (): Promise<number> =>
    footer.evaluate((el) => el.getBoundingClientRect().top + window.scrollY)
  const yBefore = await footerY()

  await page
    .locator('#install-panel-headless .install__command-area')
    .getByRole('button', { name: 'Copy install command' })
    .click()
  await expect(page.locator('[role="status"]')).toHaveText('Copied')

  expect(await footerY()).toBe(yBefore)
})
