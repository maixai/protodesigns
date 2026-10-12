import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// 输入坞本轮新增的四个入口(模型切换 / `+` 上传 / 侧栏拖入 / 粘贴)与附件区。
// 判据都取机械可判定的那部分;需要判断力的部分(视觉、中文排版)不在本文件范围。
const VIEWPORT_HEIGHT = 900
const WEEKLY_TITLE = '把项目周报整理成行动清单'
const ROADMAP_TITLE = '梳理下季度路线图'
// 模型名是品牌名(i18n 两种语言同值),测试读不到运行时词条,按同值写死。
const MODEL_DEFAULT = 'Claude Sonnet 4.5'
const MODEL_DEEP = 'Claude Opus 4.1'
const MODEL_LONG = 'Claude Sonnet 4.5 (1M)'
// 1×1 透明 PNG:最小合法图片,用于上传 / 粘贴的假图片(setInputFiles 与 DataTransfer 都吃字节)。
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// 侧栏文件行拖拽用的自定义 MIME 类型(与 src/data/attachments.ts 的 FILE_DRAG_TYPE 同值)。
const FILE_DRAG_TYPE = 'application/x-maixmia-file'

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

// 读应用内存里**真正存下来**的消息:浏览器侧动态 import 与应用共用同一份模块实例(同一 URL),
// 故 mock 里存下的用户消息带什么附件,就是「发送出去的 payload」带什么 —— 用来机械验证
// 「粘贴文本的全文随消息出去」,而不是只看芯片的展示。
interface StoredMessage {
  role: string
  body: string
  attachments: { kind: string; name: string; content?: string; path?: string; charCount?: number }[]
}

function storedMessages(page: Page): Promise<StoredMessage[]> {
  return page.evaluate(async (): Promise<StoredMessage[]> => {
    const moduleUrl = '/src/mocks/workspace.ts'
    const mod: { mockTranscript: (sessionId: string) => StoredMessage[] } = await import(moduleUrl)
    return mod.mockTranscript('weekly')
  })
}

// 等「这一轮用户消息」落定(发送是异步的:mock 在延迟后才记录)。
async function waitForSent(page: Page, body: string): Promise<StoredMessage[]> {
  await expect.poll(async () => {
    const users = (await storedMessages(page)).filter((message) => message.role === 'user')
    return users.at(-1)?.body ?? ''
  }, { message: `等「${body}」落定到 mock` }).toBe(body)
  return storedMessages(page)
}

async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/#\/workspace$/)
}

// 输入坞 + 遥测落定:转录就绪、底行的 Context 项在(它只在遥测取回后渲染)。
async function waitForComposer(page: Page, title = WEEKLY_TITLE): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  await expect(page.locator('.composer-form')).toBeVisible()
  await expect(page.locator('.telemetry__item--context')).toBeVisible()
}

// ---- 附件区与底行的构图 ----

test('底行在卡片内:五个遥测项都是 .composer-form 后代,框外不再有遥测条', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)

  // 用户第 2 条的机械判据:状态 / 模型 / context / 时长 / 项目五项都住在输入框卡片**内部**。
  const items = await page.evaluate(() => {
    const form = document.querySelector('.composer-form')
    const selectors = ['.telemetry__status', '.telemetry__item--model', '.telemetry__item--context', '.telemetry__item--elapsed', '.telemetry__item--workspace']
    return selectors.map((selector) => ({ selector, inside: document.querySelector(selector)?.closest('.composer-form') === form }))
  })
  for (const item of items) expect(item.inside, `${item.selector} 应住在 .composer-form 内部`).toBe(true)

  // 卡片内自上而下的三段:附件区(有附件才渲染)→ 输入行 → 底行。
  const children = await page.evaluate(() => Array.from(document.querySelector('.composer-form')?.children ?? []).map((element) => element.className))
  console.log(`[composer] 卡片内子元素 ${JSON.stringify(children)}`)
  expect(children).toContain('composer-input-row')
  expect(children).toContain('composer-bar')

  // 底行:左 ⊕、右「模型 ▾ + 遥测项」。
  const bar = page.locator('.composer-bar')
  await expect(bar.locator('.composer-attach')).toHaveCount(1)
  await expect(bar.locator('.model-menu')).toHaveCount(1)
  // 遥测条已从框外搬走(旧构图的那条不再存在)。
  await expect(page.locator('.composer-inner .telemetry')).toHaveCount(0)
})

// ---- 模型切换(作用域 = 本会话)----

test('模型下拉:可开、可键盘选、Esc 还焦;切换按新窗口重算 context 且不扰动别的对话', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)

  const trigger = page.locator('.model-menu__trigger')
  const menu = page.locator('.model-menu__popover')
  await expect(page.locator('.telemetry__model')).toHaveText(MODEL_DEFAULT)
  await expect(page.locator('.telemetry__context-text')).toHaveText('41% (82K/200K)')

  // 键盘打开:聚焦触发钮后 Enter(原生 click)。面板是 listbox 语义的一部分(role=menu)。
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(menu).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  const options = menu.getByRole('menuitemradio')
  await expect(options).toHaveCount(3)
  // 打开时焦点落在当前项;↓ 走一项、Enter 选中(第二项 = Opus 4.1),关闭并把焦点还给触发钮。
  await expect(options.nth(0)).toBeFocused()
  await expect(options.nth(0)).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  await expect(page.locator('.telemetry__model')).toHaveText(MODEL_DEEP)
  await expect(trigger).toBeFocused()

  // 再开一次并 Esc:关闭 + 焦点回到触发钮。
  await page.keyboard.press('ArrowDown')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toBeFocused()

  // 切到 1M 模型:模型名变,context 的分母随之变(百分比按新窗口重算)。
  await trigger.click()
  await expect(menu).toBeVisible()
  await options.filter({ hasText: MODEL_LONG }).click()
  await expect(page.locator('.telemetry__model')).toHaveText(MODEL_LONG)
  await expect(page.locator('.telemetry__context-text')).toHaveText('8% (82K/1M)')

  // 作用域 = 本会话:另一段对话还是默认模型与默认窗口;切回来仍是 1M。
  await page.locator('.conversation-tab', { hasText: ROADMAP_TITLE }).click()
  await waitForComposer(page, ROADMAP_TITLE)
  await expect(page.locator('.telemetry__model')).toHaveText(MODEL_DEFAULT)
  await expect(page.locator('.telemetry__context-text')).toHaveText('41% (82K/200K)')
  await page.locator('.conversation-tab', { hasText: WEEKLY_TITLE }).click()
  await waitForComposer(page, WEEKLY_TITLE)
  await expect(page.locator('.telemetry__model')).toHaveText(MODEL_LONG)
})

// ---- `+` 上传 ----

test('+ 上传:图片走缩略图、文件走文件名 + 大小;超限给可见提示且不加入', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)

  const input = page.locator('.composer-file-input')
  await input.setInputFiles([
    { name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('a short note') },
  ])
  const chips = page.locator('.attachment-chip')
  await expect(chips).toHaveCount(2)
  const image = page.locator('.attachment-chip[data-kind="image"]')
  await expect(image).toContainText('diagram.png')
  // 图片:缩略图 <img>(objectURL)。
  await expect(image.locator('.attachment-chip__thumb')).toHaveCount(1)
  const file = page.locator('.attachment-chip[data-kind="file"]')
  await expect(file).toContainText('notes.txt')
  await expect(file.locator('.attachment-chip__meta')).not.toHaveCount(0)

  // 超限文件:可见提示 + 不加入(不静默丢弃)。
  await input.setInputFiles({ name: 'huge.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(6 * 1024 * 1024) })
  const error = page.locator('.composer-attachment-error')
  await expect(error).toBeVisible()
  await expect(error).toContainText('huge.bin')
  await expect(chips).toHaveCount(2)
  // 报错经**已有的** role=status 通道播报(全页 live region 数不因此增加)。
  await expect(page.locator('.workspace-live')).toContainText('huge.bin')

  // 删除钮:原生 button,可访问名说明删的是哪一个。
  await expect(image.locator('.attachment-chip__remove')).toHaveAttribute('aria-label', /diagram\.png/)
})

// ---- 侧栏文件:拖入 + 非拖拽通路 ----

// 侧栏文件行的定位:按**条目名**找行(行序随目录 / 文件分组变化,按下标不稳)。
function entryRow(page: Page, name: string) {
  return page.locator('.entry-row').filter({ has: page.locator('.entry-name', { hasText: name }) })
}

// 展开一个目录行(树默认只展开到项目一层)。
async function expandDirectory(page: Page, name: string): Promise<void> {
  await entryRow(page, name).locator('.entry-row__button').click()
}

test('侧栏文件:拖入有落点反馈且出现路径芯片;点「加入当前对话」是等价通路', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)
  // 展开 src 一层,拿到一个**带目录的相对路径**(src/main.ts)的文件行。
  await expandDirectory(page, 'src')
  await expect(entryRow(page, 'main.ts')).toBeVisible()

  // 拖拽:在页面上下文里造一个 DataTransfer,走 dragstart → dragover → dragleave → dragover → drop。
  // 每步之间等一帧,让 Vue 把落点反馈落到 DOM。
  const drag = await page.evaluate(async () => {
    const frame = (): Promise<void> => new Promise((resolve) => { requestAnimationFrame(() => resolve()) })
    const row = Array.from(document.querySelectorAll('.entry-row')).find((element) => element.querySelector('.entry-name')?.textContent === 'main.ts')
    const source = row?.querySelector('.entry-row__button--file')
    const target = document.querySelector('.composer-form')
    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) return null
    const data = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }))
    const carried = data.getData('application/x-maixmia-file')
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }))
    await frame()
    const duringDrag = target.classList.contains('is-drop-target')
    const hintDuringDrag = document.querySelector('.composer-drop-hint') !== null
    target.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true, dataTransfer: data }))
    await frame()
    const afterLeave = target.classList.contains('is-drop-target')
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }))
    await frame()
    return { carried, duringDrag, hintDuringDrag, afterLeave, afterDrop: target.classList.contains('is-drop-target') }
  })
  expect(drag, '拖拽涉及的元素都在场').not.toBeNull()
  if (drag === null) return
  console.log(`[drag] 携带路径 ${drag.carried} / 拖入中反馈 ${drag.duringDrag} / 提示 ${drag.hintDuringDrag} / 离开后 ${drag.afterLeave} / 落下后 ${drag.afterDrop}`)
  expect(drag.carried, '拖源带出的是自定义类型的路径').toBe('src/main.ts')
  expect(drag.duringDrag, 'dragover 时卡片有落点反馈').toBe(true)
  expect(drag.hintDuringDrag, 'dragover 时有可见落点提示').toBe(true)
  expect(drag.afterLeave, 'dragleave 后落点反馈复原').toBe(false)
  expect(drag.afterDrop, 'drop 后落点反馈复原').toBe(false)
  const chip = page.locator('.attachment-chip')
  await expect(chip).toHaveCount(1)
  await expect(chip.locator('.attachment-chip__meta')).toHaveText('src/main.ts')
  await expect(page.locator('.workspace-live')).toContainText('main.ts')

  // 清掉,再走**非拖拽通路**(WCAG 2.5.7):点文件行那枚「加入当前对话」按钮 → 同一个附件。
  await chip.locator('.attachment-chip__remove').click()
  await expect(chip).toHaveCount(0)
  const row = entryRow(page, 'main.ts')
  const add = row.locator('.entry-row__add')
  await expect(add).toHaveAttribute('aria-label', /main\.ts/)
  // 它必须是文件行按钮的**兄弟**,不能嵌在里面(嵌套 button 是非法 HTML)。
  await expect(page.locator('.entry-row__button--file button'), '文件行按钮里不能再嵌按钮').toHaveCount(0)
  // 密集行(树行)的行内控件:命中区 ≥24×24,且可键盘到达。
  const box = await add.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(24)
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(24)
  await add.focus()
  await expect(add).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(chip).toHaveCount(1)
  await expect(chip.locator('.attachment-chip__meta')).toHaveText('src/main.ts')

  // 根目录下的文件(README.md 这类):名字与路径**完全相同**,路径是补充信息、不该再重复一遍。
  await chip.locator('.attachment-chip__remove').click()
  await expect(chip).toHaveCount(0)
  await entryRow(page, 'README.md').locator('.entry-row__add').click()
  await expect(chip).toHaveCount(1)
  await expect(chip.locator('.attachment-chip__name'), '名字照常显示').toHaveText('README.md')
  await expect(chip.locator('.attachment-chip__meta'), '路径与名字相同则不再重复').toHaveCount(0)
})

// ---- 粘贴 ----

// 在输入框上派发一次合成 paste,返回事件是否被接管(preventDefault)。
async function paste(page: Page, payload: { text?: string; imageBase64?: string }): Promise<boolean> {
  return page.evaluate((data) => {
    const textarea = document.querySelector('.composer-textarea')
    if (!(textarea instanceof HTMLElement)) return false
    const transfer = new DataTransfer()
    if (data.imageBase64 !== undefined) {
      const bytes = Uint8Array.from(atob(data.imageBase64), (char) => char.charCodeAt(0))
      transfer.items.add(new File([bytes], 'clip.png', { type: 'image/png' }))
    }
    if (data.text !== undefined) transfer.setData('text/plain', data.text)
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)
    return event.defaultPrevented
  }, payload)
}

test('粘贴:图片 → 缩略图芯片;长文本 → 芯片且发送出全文;短文本不被接管', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)
  const chips = page.locator('.attachment-chip')

  // (a) 图片:接管 + 缩略图芯片。
  expect(await paste(page, { imageBase64: PNG_BASE64 }), '图片粘贴被接管').toBe(true)
  await expect(page.locator('.attachment-chip[data-kind="image"] .attachment-chip__thumb')).toHaveCount(1)
  await chips.first().locator('.attachment-chip__remove').click()
  await expect(chips).toHaveCount(0)

  // (c) 短文本:不接管(交给浏览器默认插入)——防止「短粘贴被打扰」。
  expect(await paste(page, { text: '短文本' }), '短文本不接管').toBe(false)
  await expect(chips).toHaveCount(0)

  // (b) 长文本(≥1,000 字符):接管 + 「[粘贴文本 · N 行 · M 字符]」芯片。
  const longText = Array.from({ length: 30 }, (_, index) => `第 ${index + 1} 行:` + '内容'.repeat(20)).join('\n')
  const lines = longText.split('\n').length
  const chars = Array.from(longText).length
  console.log(`[paste] 长文本 ${lines} 行 / ${chars} 字符`)
  expect(chars).toBeGreaterThanOrEqual(1000)
  expect(await paste(page, { text: longText }), '长文本被接管').toBe(true)
  const summary = page.locator('.attachment-chip[data-kind="text"] .attachment-chip__summary')
  await expect(summary).toHaveText(`[粘贴文本 · ${lines} 行 · ${chars} 字符]`)

  // 发送:芯片消失、正文随消息出去 —— **全文**存在那条用户消息的附件里。
  await page.locator('.composer-textarea').fill('看下这份内容')
  await page.locator('.composer-textarea').press('Enter')
  await expect(chips).toHaveCount(0)
  const stored = await waitForSent(page, '看下这份内容')
  const sent = [...stored].reverse().find((message) => message.role === 'user')
  expect(sent?.attachments).toHaveLength(1)
  expect(sent?.attachments[0]?.kind).toBe('text')
  expect(sent?.attachments[0]?.content, '发出的 payload 含粘贴文本全文').toBe(longText)
})

// ---- 移除 ----

test('移除附件:点 × 后芯片消失,且不再随消息送出', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)
  const row = page.locator('.entry-row', { has: page.locator('.entry-name', { hasText: 'README.md' }) })
  await row.locator('.entry-row__add').click()
  const chip = page.locator('.attachment-chip')
  await expect(chip).toHaveCount(1)
  await expect(page.locator('.workspace-live')).toContainText('README.md')

  await chip.locator('.attachment-chip__remove').click()
  await expect(chip).toHaveCount(0)
  await expect(page.locator('.workspace-live')).toContainText('已移除附件')

  await page.locator('.composer-textarea').fill('只发这段文字')
  await page.locator('.composer-textarea').press('Enter')
  const stored = await waitForSent(page, '只发这段文字')
  const sent = [...stored].reverse().find((message) => message.role === 'user')
  expect(sent?.attachments, '移除后的附件不再随消息送出').toHaveLength(0)
})

// ---- 两种宿主:悬浮对话窗体里的输入坞同样成立 ----

test('悬浮对话窗体:输入坞同样带底行、⊕ 上传与模型下拉都可用', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)

  await page.locator('.tab-pop').first().click()
  const panel = page.locator('.chat-panel[data-mode="floating"]')
  await expect(panel).toHaveCount(1)
  await expect(panel.locator('.composer-bar')).toHaveCount(1)
  await expect(panel.locator('.composer-attach')).toHaveCount(1)

  // 悬浮态下 `+` 上传同样出芯片。
  await panel.locator('.composer-file-input').setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') })
  await expect(panel.locator('.attachment-chip[data-kind="image"] .attachment-chip__thumb')).toHaveCount(1)

  // 悬浮态下模型下拉同样可开、可切换。
  await panel.locator('.model-menu__trigger').click()
  await expect(panel.locator('.model-menu__popover')).toBeVisible()
  await panel.getByRole('menuitemradio').filter({ hasText: MODEL_DEEP }).click()
  await expect(panel.locator('.telemetry__model')).toHaveText(MODEL_DEEP)
})

// ---- 遥测底行的降级次序(本轮缺陷的机械守卫)----

// 模型项在本轮之前是「只读文本」,窄档把它藏掉只是少一条信息;它变成**控件**之后,
// 藏掉就等于窄屏没法切模型 —— 与用户「模型应当能切换,不能只是显示」的要求直接冲突。
// 故立此断言:模型永不隐藏,让位的是项目名与状态详情(两者仍在 title 上,信息不丢)。
test('窄宽度下模型控件仍在:让位的是项目名与状态详情,且真的还能开', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)
  const model = page.locator('.telemetry__item--model')
  const trigger = page.locator('.model-menu__trigger')
  await expect(model, '桌面宽:模型项在场').toBeVisible()

  // 收到基线最窄档 375。
  await page.setViewportSize({ width: 375, height: VIEWPORT_HEIGHT })
  await expect(model, '375 下模型项仍可见').toBeVisible()
  await expect(trigger, '375 下模型触发钮可用').toBeEnabled()
  await expect(page.locator('.telemetry__item--workspace'), '窄档让位的是项目名').toBeHidden()
  const barOverflow = await page.locator('.composer-bar').evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(barOverflow, '底行自身不横向溢出').toBeLessThanOrEqual(0)
  const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(docOverflow, '整页不横向溢出').toBeLessThanOrEqual(0)

  // 可达不只是「看得见」:窄屏点一下仍能弹出并选中。
  await trigger.click()
  await expect(page.locator('[role="menuitemradio"]')).toHaveCount(3)
  await page.keyboard.press('Escape')
})

// 英文的「1 lines」是可见语病(中文没有单复数)。词条单列一条 linesOne,按数量选。
test('粘贴文本芯片的行数在英文里走单数:1 line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForComposer(page)
  await page.getByRole('button', { name: '语言', exact: true }).click()
  await page.getByRole('button', { name: /English/ }).click()
  // 单行长文本(≥1,000 字符)被接管成芯片,芯片按行数取词条。
  expect(await paste(page, { text: 'x'.repeat(1500) }), '长文本粘贴被接管').toBe(true)
  const summary = page.locator('.attachment-chip[data-kind="text"] .attachment-chip__summary')
  await expect(summary, '单行写 1 line,不写 1 lines').toHaveText(/\[Pasted text · 1 line · 1500 chars\]/)
})
