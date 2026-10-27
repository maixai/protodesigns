import { unlockDemoIdentity } from './identity-helpers'
// 单元 C2:区域切分。
//
// 两层断言:
//   · **纯模型**(不经过 UI):splitSurface / withSurfaceSplit / removeSurface / setSeparatorPercent
//     与布局不变量 —— 两个引擎上结果一致,先把数据层的语义钉死;
//   · **UI**:拖 tab 到区域右 / 下边缘切分、分隔线的 APG Window Splitter 键盘通路、
//     四态之外的两条新语义(输入坞只出现在承载对话的那块区域;拆出钮移出 Tab 序后由快捷键承担)。
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { WorkspaceLayout } from '../../src/contracts/generated/workspace-layout'
import type { WindowContent } from '../../src/contracts/generated/window-content'
import {
  MAIN_SURFACE,
  OWN_WEIGHT,
  activateTab,
  chatWindowId,
  dockWindow,
  emptyLayout,
  fileMemberIds,
  fileWindowId,
  layoutViolations,
  openFloating,
  openTab,
  removeSurface,
  reorderChatMembers,
  rootSurface,
  seedChatWindow,
  separatorPercent,
  setSeparatorPercent,
  splitSurface,
  surfaceOf,
  withSurfaceSplit,
} from '../../src/data/windows'

const PROJECT = 'weekly-report'
const README = 'README.md'
const PROGRESS = 'progress.csv'
const WEEKLY = 'weekly'
const ROADMAP = 'roadmap'
// 窗体身份是**复合键**:文件 = file://<项目>/<路径>,对话 = chat://<项目>/<会话 id>。
// 裸文件名不唯一(README.md 同时在多个项目里),故纯模型断言一律用复合 id。
const README_ID = fileWindowId(PROJECT, README)
const PROGRESS_ID = fileWindowId(PROJECT, PROGRESS)
const WEEKLY_ID = chatWindowId(PROJECT, WEEKLY)
const ROADMAP_ID = chatWindowId(PROJECT, ROADMAP)
const fileContent = (path: string): WindowContent => ({ kind: 'file', projectId: PROJECT, path })
const chatContent = (sessionId: string): WindowContent => ({ kind: 'chat', projectId: PROJECT, sessionId })
const VIEWPORT_HEIGHT = 900

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' })

// ============================================================================
// 一、纯模型:区域树的切分 / 合并 / 权重
// ============================================================================

// 建一个「两个对话 + 一个文件」的根区域布局(切分要跨成员类型验)。
function baseLayout(): WorkspaceLayout {
  let layout = emptyLayout()
  layout = seedChatWindow(layout, MAIN_SURFACE, chatContent('weekly'), 0)
  layout = seedChatWindow(layout, MAIN_SURFACE, chatContent('roadmap'), 1)
  layout = openTab(layout, MAIN_SURFACE, fileContent('README.md'))
  return layout
}

test('splitSurface:返回新区域 id、新区域挂在被切区域之下,且入参布局一个字段都不动', () => {
  const layout = baseLayout()
  const before = JSON.parse(JSON.stringify(layout)) as WorkspaceLayout
  const id = splitSurface(layout, MAIN_SURFACE, 'row', README_ID)
  expect(id, '返回新区域 id').not.toBe('')
  // 纯规划:入参布局原样(与「松手前都可逆」同源 —— 一切操作都不可变)。
  expect(layout, '入参布局未被改动').toEqual(before)

  const next = withSurfaceSplit(layout, MAIN_SURFACE, 'row', README_ID)
  const created = surfaceOf(next, id)
  expect(created, '新区域已建').toBeDefined()
  expect(created).toMatchObject({ parentId: MAIN_SURFACE, axis: 'row', members: [README_ID], activeId: README_ID })
  // 「被切的 tab 归新区域并成为其 activeId」:新区域只装它一个,原区域不再有这个成员。
  expect(fileMemberIds(next, MAIN_SURFACE), '原区域不再有这个文件成员').toEqual([])
  expect(next.focus, '新区域成为当前项').toBe(README_ID)
  expect(layoutViolations(next), '不变量恒为空').toEqual([])
  // 根 id 不变(切分只往根下面挂子区域)。
  expect(rootSurface(next)?.id).toBe(MAIN_SURFACE)
})

test('splitSurface:区域不存在 / 窗体不存在时返回空串(调用方据此判定未切分)', () => {
  const layout = baseLayout()
  expect(splitSurface(layout, 'ghost', 'row', README_ID)).toBe('')
  expect(splitSurface(layout, MAIN_SURFACE, 'row', 'ghost')).toBe('')
  // 两次切分得到两个不同的 id,且都挂在被切区域之下。
  const first = withSurfaceSplit(layout, MAIN_SURFACE, 'row', README_ID)
  const second = withSurfaceSplit(first, ROADMAP_ID, 'column', ROADMAP_ID)
  const ids = second.surfaces.map((surface) => surface.id)
  expect(new Set(ids).size, 'id 不重复').toBe(ids.length)
  expect(surfaceOf(second, ROADMAP_ID)?.parentId, '第二次切的是 ROADMAP_ID 所在的那块').not.toBeNull()
  expect(layoutViolations(second)).toEqual([])
})

test('splitSurface:被切区域的活动成员是它自己时,活动位交给相邻成员(与 closeTab 同规则)', () => {
  // 激活 LAST(文件),再把它切出去 → 原区域的活动位应落到相邻的对话上,而不是悬空。
  const layout = activateTab(baseLayout(), MAIN_SURFACE, README_ID)
  expect(surfaceOf(layout, MAIN_SURFACE)?.activeId).toBe(README_ID)
  const next = withSurfaceSplit(layout, MAIN_SURFACE, 'row', README_ID)
  const source = surfaceOf(next, MAIN_SURFACE)
  expect(source?.activeId, '不指向已迁走的成员').not.toBe(README_ID)
  expect(source?.members.includes(source?.activeId ?? ''), 'activeId 仍 ∈ members').toBe(true)
  expect(layoutViolations(next)).toEqual([])
})

test('removeSurface:成员与子区域都托付给父区域,根区域不可删', () => {
  const layout = withSurfaceSplit(baseLayout(), MAIN_SURFACE, 'row', README_ID)
  const child = layout.surfaces.at(-1)
  expect(child).toBeDefined()
  if (child === undefined) return

  const merged = removeSurface(layout, child.id)
  expect(surfaceOf(merged, child.id), '子区域已摘除').toBeUndefined()
  expect(fileMemberIds(merged, MAIN_SURFACE), '成员回到了父区域').toEqual([README_ID])
  expect(layoutViolations(merged)).toEqual([])

  // 根区域没有父区域可托付 → 原样返回。
  expect(removeSurface(merged, MAIN_SURFACE)).toEqual(merged)
})

test('removeSurface:子区域的子区域改挂到父区域名下(树不断链)', () => {
  const one = withSurfaceSplit(baseLayout(), MAIN_SURFACE, 'row', README_ID)
  const mid = one.surfaces.at(-1)
  if (mid === undefined) return
  const two = withSurfaceSplit(one, mid.id, 'column', ROADMAP_ID)
  const leaf = two.surfaces.at(-1)
  if (leaf === undefined) return
  const collapsed = removeSurface(two, mid.id)
  expect(surfaceOf(collapsed, leaf.id)?.parentId, '叶子改挂在根下').toBe(MAIN_SURFACE)
  expect(layoutViolations(collapsed)).toEqual([])
})

test('setSeparatorPercent:按百分比改权重,夹在 10–90;separatorPercent 读回同一个数', () => {
  const layout = withSurfaceSplit(baseLayout(), MAIN_SURFACE, 'row', README_ID)
  expect(separatorPercent(layout, MAIN_SURFACE, 0), '首次切分对半').toBe(50)

  const widened = setSeparatorPercent(layout, MAIN_SURFACE, 0, 80)
  expect(separatorPercent(widened, MAIN_SURFACE, 0), '调到 80%').toBe(80)
  // 自身内容的权重是常量(区域没有「自身权重」字段),故调那条分隔线改的是**子区域**的权重。
  expect(surfaceOf(widened, layout.surfaces.at(-1)?.id ?? '')?.weight).toBe(Math.round((OWN_WEIGHT * 20) / 80))

  // 越界被夹住:任何一侧都不会被拖到消失。
  expect(separatorPercent(setSeparatorPercent(layout, MAIN_SURFACE, 0, 0), MAIN_SURFACE, 0)).toBe(10)
  expect(separatorPercent(setSeparatorPercent(layout, MAIN_SURFACE, 0, 999), MAIN_SURFACE, 0)).toBe(90)
  // 越界的分隔线下标原样返回。
  expect(setSeparatorPercent(layout, MAIN_SURFACE, 9, 50)).toEqual(layout)
  expect(layoutViolations(widened)).toEqual([])
})

test('setSeparatorPercent:两个子区域之间那条分隔线同时改左右两个权重并保持其和', () => {
  const one = withSurfaceSplit(baseLayout(), MAIN_SURFACE, 'row', README_ID)
  const two = withSurfaceSplit(one, MAIN_SURFACE, 'row', ROADMAP_ID)
  const children = two.surfaces.filter((surface) => surface.parentId === MAIN_SURFACE)
  expect(children, '两个子区域').toHaveLength(2)
  const left = children[0]
  const right = children[1]
  if (left === undefined || right === undefined) return
  const sumBefore = left.weight + right.weight

  // 下标 1 = 两个子区域之间那条(下标 0 是「自身内容 ↔ 首个子区域」)。
  const next = setSeparatorPercent(two, MAIN_SURFACE, 1, 25)
  const after = next.surfaces.filter((surface) => surface.parentId === MAIN_SURFACE)
  expect(after[0]?.weight, '左侧 = 25%').toBe(Math.round(sumBefore * 0.25))
  expect((after[0]?.weight ?? 0) + (after[1]?.weight ?? 0), '两侧之和不变').toBe(sumBefore)
  expect(separatorPercent(next, MAIN_SURFACE, 1)).toBe(25)
  expect(layoutViolations(next)).toEqual([])
})

test('reorderChatMembers 与切分互不串位:切出去的区域只影响自己那份成员', () => {
  const layout = withSurfaceSplit(baseLayout(), MAIN_SURFACE, 'row', ROADMAP_ID)
  expect(fileMemberIds(layout, MAIN_SURFACE)).toEqual([README_ID])
  const reordered = reorderChatMembers(layout, MAIN_SURFACE, [WEEKLY_ID])
  expect(surfaceOf(reordered, MAIN_SURFACE)?.members.includes(ROADMAP_ID), '已迁走的对话不会被重排拉回来').toBe(false)
  expect(layoutViolations(reordered)).toEqual([])
})

test('dockWindow 到一个子区域:成员落在那块区域上,不变量恒为空', () => {
  const layout = withSurfaceSplit(baseLayout(), MAIN_SURFACE, 'row', README_ID)
  const child = layout.surfaces.at(-1)
  if (child === undefined) return
  // dockWindow 的契约是「这个窗体此刻不属于任何区域」(页面只在悬浮窗上调用它),故先造一个悬浮窗。
  const floating = openFloating(layout, fileContent('progress.csv'), { x: 0, y: 0, width: 0, height: 0 })
  const docked = dockWindow(floating, PROGRESS_ID, child.id, 0)
  expect(surfaceOf(docked, child.id)?.members, '成员插在子区域下标 0 处').toEqual([PROGRESS_ID, README_ID])
  expect(surfaceOf(docked, child.id)?.activeId, '停靠即成为该区域的活动成员').toBe(PROGRESS_ID)
  expect(layoutViolations(docked)).toEqual([])
})

// ============================================================================
// 二、UI:切分 / 分隔线 / 输入坞归属 / 快捷键
// ============================================================================

async function login(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await unlockDemoIdentity(page)
  await expect(page).toHaveURL(/#\/workspace$/)
}

async function waitForReady(page: Page): Promise<void> {
  await expect(page.getByRole('log')).toHaveAttribute('data-state', 'ready')
  await page.evaluate(async () => { await document.fonts.ready })
}

// 打开一个文件并停靠进内容区(树行单击 = 悬浮,标题栏「停靠」钮 = 进内容区)。
async function openDockedFile(page: Page, name: string): Promise<void> {
  await page.locator('.entry-row[data-kind="file"]', { hasText: name }).first().locator('.entry-row__button').click()
  const floating = page.locator('.file-panel[data-mode="floating"]')
  await expect(floating).toHaveCount(1)
  await floating.last().locator('.file-panel__placement').click()
  await expect(page.locator('.file-panel[data-mode="docked"]')).toHaveCount(1)
}

// 打开一个文件为**悬浮**窗体(树行单击即悬浮,不点「停靠」)。
async function openFloatingFile(page: Page, name: string): Promise<void> {
  await page.locator('.entry-row[data-kind="file"]', { hasText: name }).first().locator('.entry-row__button').click()
  await expect(page.locator(`.file-panel[data-mode="floating"][data-file-path="${name}"]`)).toHaveCount(1)
}

// 按住悬浮窗体的**标题栏**、分多步拖到目标点(松手由调用方决定)。落在标题栏的识别区(非按钮)
// 上,否则会被当成点按钮而不启动拖动。
async function holdDragFloatingWindow(page: Page, name: string, toX: number, toY: number): Promise<void> {
  const header = await page.locator(`.file-panel[data-mode="floating"][data-file-path="${name}"] .dl-window__meta`).boundingBox()
  expect(header, '悬浮窗体标题栏有几何盒').not.toBeNull()
  if (header === null) return
  await page.mouse.move(header.x + 120, header.y + header.height / 2)
  await page.mouse.down()
  await page.mouse.move(toX, toY, { steps: 12 })
}

// 把一枚 tab 拖到某块区域的**右缘带**里松手:越过条下沿即拆出(既有手势),再横move到右缘。
async function dragTabToRightEdge(page: Page, tab: Locator): Promise<void> {
  const tabBox = await tab.boundingBox()
  const region = await page.locator('.conversation[data-surface-id]').first().boundingBox()
  expect(tabBox, 'tab 有几何盒').not.toBeNull()
  expect(region, '区域有几何盒').not.toBeNull()
  if (tabBox === null || region === null) return
  const strip = await page.locator('.file-tabs').boundingBox()
  const stripBottom = (strip?.y ?? tabBox.y) + (strip?.height ?? tabBox.height)
  // 先向下越过条下沿(拆出),再移到右缘带内(切分意图),松手。
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(tabBox.x + tabBox.width / 2, stripBottom + 60, { steps: 8 })
  await page.mouse.move(region.x + region.width - 30, region.y + region.height / 2 - 120, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(120)
}

const SURFACES = '.conversation[data-surface-id]'

test('最小化左侧根显示区:右侧子区域扩展占满,不出现创建会话引导', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await dragTabToRightEdge(page, page.locator('.tab-slot').first())
  await expect(page.locator(SURFACES), '切分后两块区域').toHaveCount(2)
  const panes = page.locator(SURFACES)
  const leftWidth = (await panes.nth(0).boundingBox())?.width ?? 0
  // 收起左侧(根区域)自身的页签:根区域不置 minimized,但自身内容区没有可见成员时
  // 不应再渲染(否则会显示创建会话引导页,把空间又占回去);右侧子区域应吃满整行。
  await panes.nth(0).locator('.conversation-minimize').click()
  await expect(page.locator(SURFACES), '只剩右侧显示区').toHaveCount(1)
  await expect(page.locator('.guide-shell'), '不显示创建会话引导').toHaveCount(0)
  const rightWidth = (await page.locator(SURFACES).first().boundingBox())?.width ?? 0
  expect(rightWidth, '右侧区域扩展到原左侧的空间').toBeGreaterThan(leftWidth)
  await expect(page.locator('.workspace-dock__chip')).toHaveCount(1)
  // 恢复:左侧根区域自身内容区回来,重新成为两块。
  await page.locator('.workspace-dock__restore').click()
  await expect(page.locator(SURFACES), '恢复为两块显示区').toHaveCount(2)
})

test('最小化切分区域里的整块显示区:释放空间,恢复时回到原位置而不是并进兄弟区域', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await dragTabToRightEdge(page, page.locator('.tab-slot').nth(1))
  await expect(page.locator(SURFACES), '切分后两块区域').toHaveCount(2)
  const panes = page.locator(SURFACES)
  const rightTab = panes.nth(1).locator('.conversation-tab')
  await expect(rightTab).toHaveCount(1)
  const rightTabId = await rightTab.getAttribute('data-tab-id')
  expect(rightTabId).not.toBeNull()
  // 收起右侧整块显示区 → 它从渲染里消失、空间让给左边;底栏出现一个整区条目。
  await panes.nth(1).locator('.conversation-minimize').click()
  await expect(page.locator(SURFACES), '整块显示区释放空间').toHaveCount(1)
  await expect(page.locator('.workspace-dock__chip'), '整区条目仍在底栏').toHaveCount(1)
  await expect(page.locator('.workspace-dock__chip')).toContainText('weekly-report')
  // 恢复:右侧显示区回到**原位置**(surface 仍留在区域树里,parentId / weight 未动),
  // 不是把 roadmap 并进左边那块区域。
  await page.locator('.workspace-dock__restore').click()
  await expect(page.locator('.workspace-dock__chip')).toHaveCount(0)
  await expect(page.locator(SURFACES), '恢复为两块显示区').toHaveCount(2)
  await expect(page.locator(SURFACES).nth(1).locator(`.conversation-tab[data-tab-id="${rightTabId ?? ''}"]`), '原 tab 回到右侧显示区').toHaveCount(1)
  await expect(page.locator(SURFACES).nth(0).locator(`.conversation-tab[data-tab-id="${rightTabId ?? ''}"]`), '没有被并进左侧').toHaveCount(0)
})

test('拖 tab 到区域右缘 → 沿该边切出一块新区域;两块各显示各自的 active 成员', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await openDockedFile(page, README)
  await expect(page.locator(SURFACES), '切分前只有一块区域').toHaveCount(1)
  await expect(page.locator('.transcript'), '内容区被文件占着').toHaveCount(0)

  await dragTabToRightEdge(page, page.locator('.file-tab').first())

  await expect(page.locator(SURFACES), '切分后两块区域').toHaveCount(2)
  const panes = page.locator(SURFACES)
  // 原区域回到对话(被切走的正是它当时的活动成员),新区域装着那个文件。
  await expect(panes.nth(0).locator('.transcript'), '原区域显示转录').toHaveCount(1)
  const filePane = panes.nth(1)
  await expect(filePane.locator('.file-panel[data-mode="docked"][data-file-path="README.md"]'), '新区域显示该文件的停靠面板').toHaveCount(1)
  await expect(page.locator(SURFACES).filter({ has: page.locator('.file-panel') }), '只有一块区域装着文件').toHaveCount(1)
  await expect(page.locator('.file-tab'), '文件仍是一个 tab(只是换了区域)').toHaveCount(1)

  // 分隔线:APG Window Splitter 的 ARIA 齐备。
  const separator = page.locator('.split-separator')
  await expect(separator).toHaveCount(1)
  await expect(separator).toHaveAttribute('role', 'separator')
  await expect(separator).toHaveAttribute('aria-orientation', 'vertical')
  const separatorMin = Number(await separator.getAttribute('aria-valuemin'))
  const separatorMax = Number(await separator.getAttribute('aria-valuemax'))
  expect(separatorMin).toBeGreaterThanOrEqual(10)
  expect(separatorMax).toBe(100 - separatorMin)
  await expect(separator).toHaveAttribute('aria-valuenow', '50')
  await expect(separator).toHaveAttribute('tabindex', '0')
})

test('分隔线方向键 / Home / End:改权重并真的改变两块区域的宽度', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await openDockedFile(page, README)
  await dragTabToRightEdge(page, page.locator('.file-tab').first())

  const separator = page.locator('.split-separator')
  const paneWidths = async (): Promise<number[]> => page.locator(SURFACES).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)))
  const ratio = async (): Promise<number> => {
    const widths = await paneWidths()
    const total = widths.reduce((sum, width) => sum + width, 0)
    return total === 0 ? 0 : (widths[0] ?? 0) / total
  }

  await separator.focus()
  await expect(separator).toBeFocused()
  expect(await ratio(), '初始对半').toBeCloseTo(0.5, 1)

  // 方向键一步(5 个百分点):aria-valuenow 立刻变,宽度随之变(误差容差取 0.05 —— 两块宽度
  // 各自取整后占比会差个千分之几)。
  await page.keyboard.press('ArrowRight')
  await expect(separator).toHaveAttribute('aria-valuenow', '55')
  await expect.poll(ratio, { message: '右侧区域变窄' }).toBeCloseTo(0.55, 1)
  await page.keyboard.press('ArrowLeft')
  await expect(separator).toHaveAttribute('aria-valuenow', '50')
  await expect.poll(ratio, { message: '回到对半' }).toBeCloseTo(0.5, 1)

  // 左 / 上方向键是反向。
  await page.keyboard.press('ArrowLeft')
  await expect(separator).toHaveAttribute('aria-valuenow', '45')
  await expect.poll(ratio, { message: '左侧区域变窄' }).toBeCloseTo(0.45, 1)
  // Home / End 到极值:下限被 320px 的最小可读宽度夹住(不再是固定的 10%)。
  const min = Number(await separator.getAttribute('aria-valuemin'))
  const max = Number(await separator.getAttribute('aria-valuemax'))
  expect(min).toBeGreaterThanOrEqual(10)
  expect(max).toBe(100 - min)
  await page.keyboard.press('Home')
  await expect(separator).toHaveAttribute('aria-valuenow', String(min))
  await expect.poll(ratio, { message: '左侧区域缩到最小可读宽度' }).toBeCloseTo(min / 100, 1)
  await page.keyboard.press('End')
  await expect(separator).toHaveAttribute('aria-valuenow', String(max))
  await expect.poll(ratio, { message: '左侧区域撑到最大' }).toBeCloseTo(max / 100, 1)
})

test('缩窄窗口后分栏不会低于 320px:存储的百分比失配时自动转为纵向堆叠', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await dragTabToRightEdge(page, page.locator('.tab-slot').first())
  const separator = page.locator('.split-separator')
  await separator.focus()
  await page.keyboard.press('Home')
  const leftAtWide = await page.locator(SURFACES).first().boundingBox()
  expect(leftAtWide?.width ?? 0, '1600 下最小栏仍 ≥320').toBeGreaterThanOrEqual(319)

  // 1600 推到的 25% 存进布局;缩到 1280 后该比例只剩 243px,必须自动堆叠而不是继续横排。
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await expect(page.locator('.split').first(), '1280 下转为纵向堆叠').toHaveAttribute('data-axis', 'column')
  const widthsAt1280 = await page.locator(SURFACES).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width))
  for (const width of widthsAt1280) expect(width, '1280 下每栏都是整行宽').toBeGreaterThanOrEqual(320)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '不横向溢出').toBeLessThanOrEqual(0)

  // 继续缩到 768 也不得落回窄栏。
  await page.setViewportSize({ width: 768, height: VIEWPORT_HEIGHT })
  await expect(page.locator('.split').first(), '768 下仍为纵向堆叠').toHaveAttribute('data-axis', 'column')
  const widthsAt768 = await page.locator(SURFACES).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width))
  for (const width of widthsAt768) expect(width, '768 下每栏都是整行宽').toBeGreaterThanOrEqual(320)
})

test('输入坞只在承载对话的区域:文件那一块不渲染它', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await openDockedFile(page, README)
  await dragTabToRightEdge(page, page.locator('.file-tab').first())

  await expect(page.locator(SURFACES), '两块区域').toHaveCount(2)
  // 切分后:原区域回到对话(承载对话 → 有自己的输入坞),新区域只装着那个文件(没有对话 → 没有输入坞)。
  await expect(page.locator('.composer-dock'), '整页只有一个输入坞').toHaveCount(1)
  const filePane = page.locator(SURFACES).filter({ has: page.locator('.file-panel') })
  await expect(filePane.locator('.composer-dock'), '只有文件成员的区域不渲染输入坞').toHaveCount(0)
  const chatPane = page.locator(SURFACES).filter({ has: page.locator('.transcript') })
  await expect(chatPane.locator('.composer-dock'), '承载对话的那块区域渲染输入坞').toHaveCount(1)
})

test('两块区域各承载一段对话:各有自己的输入坞,输入框内容彼此独立', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  // 把第 2 条对话 tab 拖到右缘 → 新区域也承载对话(两块都是对话)。
  await dragTabToRightEdge(page, page.locator('.tab-slot').nth(1))

  await expect(page.locator(SURFACES), '两块区域').toHaveCount(2)
  const chatPanes = page.locator(SURFACES).filter({ has: page.locator('.transcript') })
  await expect(chatPanes, '两块都承载对话').toHaveCount(2)
  // 输入坞属于**对话窗体本身**:两块区域各承载一段对话 → 各有自己的输入坞(不再「全页只有一个」)。
  const composers = page.locator('.composer-dock textarea')
  await expect(composers, '每段对话各一个输入框').toHaveCount(2)
  // 两段对话的转录都就绪后输入框才可输入(loading 态是只读的)。
  await expect(chatPanes.nth(0).locator('.transcript')).toHaveAttribute('data-state', 'ready')
  await expect(chatPanes.nth(1).locator('.transcript')).toHaveAttribute('data-state', 'ready')
  // 全页 `role="log"` 仍恰为 1:多对话视图并存时只有 live 那一个承担播报通道。
  await expect(page.getByRole('log'), '全页恰一个 live region').toHaveCount(1)

  // 草稿按会话独立:在一处打字不影响另一处。
  await composers.nth(0).fill('第一段对话的草稿')
  await expect(composers.nth(0)).toHaveValue('第一段对话的草稿')
  await expect(composers.nth(1), '另一处不受影响').toHaveValue('')
  await composers.nth(1).fill('第二段对话的草稿')
  await expect(composers.nth(0), '第一处草稿仍在').toHaveValue('第一段对话的草稿')

  // 切走再切回:两处草稿都原样还在(切换只改活动成员,不动任何运行态)。
  await page.locator(SURFACES).nth(1).locator('.conversation-tab').first().click()
  await expect(composers.nth(0)).toHaveValue('第一段对话的草稿')
  await expect(composers.nth(1)).toHaveValue('第二段对话的草稿')

  // 新建对话的落点在**承载该 ＋ 的那块区域**,新会话的输入框随即拿到焦点。
  // 每块区域各有一枚 ＋(功能完全对等),故按区域收窄,否则命中多枚。
  // 该 Agent 打开了多个项目 → ＋ 会先弹出项目选择浮层,选首个项目后才真正建会话。
  await page.locator(SURFACES).nth(0).getByRole('button', { name: /新建对话或打开文件|New conversation or open file/, exact: true }).click()
  await page.getByRole('menuitem', { name: /^新建对话$|^New conversation$/ }).click()
  const picker = page.locator('.project-picker')
  await expect(picker, '多项目下先选归属').toHaveCount(1)
  await picker.locator('[role="option"]').first().click()
  await expect(picker).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? ''), { message: '新建后输入框自动聚焦' }).toMatch(/^workspace-composer-/)
})

test('拆出钮已移出 Tab 序;快捷键 Ctrl/Cmd+Shift+M 即把聚焦的 tab 拆成悬浮窗体', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await openDockedFile(page, README)

  // 两处拆出钮都在 DOM 里、都有可访问名与快捷键声明,但都不在 Tab 序里。
  const filePop = page.locator('.file-tab-pop')
  const chatPop = page.locator('.tab-pop').first()
  await expect(filePop).toHaveAttribute('tabindex', '-1')
  await expect(chatPop).toHaveAttribute('tabindex', '-1')
  await expect(filePop).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+M Meta+Shift+M')
  await expect(chatPop).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+M Meta+Shift+M')
  // title 是中英双语(悬停即可读到快捷键)。
  expect(await filePop.getAttribute('title')).toContain('Ctrl/Cmd+Shift+M')
  expect(await chatPop.getAttribute('title')).toContain('Ctrl/Cmd+Shift+M')

  // 从文件 tab 出发 Tab 若干次,全程不得落在任何拆出钮上。
  await page.locator('.file-tab').first().focus()
  const landed: string[] = []
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('Tab')
    landed.push(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? ''))
  }
  expect(landed.some((name) => name.includes('file-tab-pop') || name.includes('tab-pop')), 'Tab 序里不出现拆出钮').toBe(false)

  // 快捷键通路:聚焦文件 tab → Ctrl/Cmd+Shift+M → 该 tab 拆出为悬浮窗体。
  await page.locator('.file-tab').first().focus()
  await page.keyboard.press('Control+Shift+m')
  await expect(page.locator('.file-panel[data-mode="floating"]'), '快捷键即拆出').toHaveCount(1)
  await expect(page.locator('.file-tab'), '条上不再有它').toHaveCount(0)
  await expect(page.locator('.workspace-live')).toHaveText(/拆出.*README\.md/)
  // 拆出后焦点会（在下一帧）交给新窗体的标题栏。先等它落定再继续：否则那一次延迟聚焦会在
  // 满载时抢走下面刚放到对话 tab 上的焦点，快捷键就落到别处去了（不是靠等待掩盖，是等状态落定）。
  await expect(page.locator('.file-panel[data-mode="floating"] .dl-window__meta')).toBeFocused()

  // 对话 tab 上也一样(同一个快捷键、同一条通路)。
  await expect(page.locator('.tab-slot')).not.toHaveCount(0)
  await page.locator('.conversation-tab').first().focus()
  await expect(page.locator('.conversation-tab').first()).toBeFocused()
  await page.keyboard.press('Control+Shift+m')
  await expect(page.locator('.chat-panel[data-mode="floating"]'), '对话也可由快捷键拆出').toHaveCount(1)
})

// 四档宽度都把区域切成两块:不横向溢出、两块都还在、承载对话的区域各有一个输入坞(端基线的多宽度要求)。
for (const width of [375, 768, 1280, 1600]) {
  test(`切分后 @${width}:不横向溢出,两块区域都在,各承载对话的区域各有一个输入坞`, async ({ page }) => {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })
    await login(page)
    await waitForReady(page)
    // 拖走的正是活动对话(第一条):切分后两块区域各承载一段对话。
    await dragTabToRightEdge(page, page.locator('.tab-slot').first())
    await expect(page.locator(SURFACES), '两块区域').toHaveCount(2)
    await expect(page.locator('.composer-dock'), '每块承载对话的区域各一个输入坞').toHaveCount(2)
    await expect(page.getByRole('log'), '全页恰一个 live region').toHaveCount(1)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, '不横向溢出').toBeLessThanOrEqual(0)
    // 极窄分屏里 tab 不能绘制到「＋」上;若常驻控件因空间不足降级,至少保留下来的 ▾ 必须可命中。
    const plus = page.getByRole('button', { name: /新建对话或打开文件|New conversation or open file/, exact: true })
    if (await plus.count() > 0) {
      const plusBox = await plus.first().boundingBox()
      expect(plusBox).not.toBeNull()
      if (plusBox !== null) {
        const hitPlus = await page.evaluate(({ x, y }) => {
          const element = document.elementFromPoint(x, y)
          const label = element !== null && element.closest('button')?.getAttribute('aria-label')
          return label === '新建对话或打开文件' || label === 'New conversation or open file'
        }, { x: plusBox.x + plusBox.width / 2, y: plusBox.y + plusBox.height / 2 })
        expect(hitPlus, '「＋」未被 tab 覆盖').toBe(true)
      }
    }
    const menu = page.locator('.conversation-menu__trigger').first()
    await expect(menu).toBeVisible()
    const menuBox = await menu.boundingBox()
    expect(menuBox).not.toBeNull()
    if (menuBox !== null) {
      const hitMenu = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y)
        return element !== null && element.closest('button')?.classList.contains('conversation-menu__trigger')
      }, { x: menuBox.x + menuBox.width / 2, y: menuBox.y + menuBox.height / 2 })
      expect(hitMenu, '「▾」未被覆盖').toBe(true)
    }
    // 分隔线在宽容器里被键盘调到两端极值都不产生文档级横向溢出;窄容器没有分隔线,
    // 因为分栏已退化为纵向堆叠(两块都拿整行宽度,正文不再被压成竖排)。
    const separator = page.locator('.split-separator')
    if (await separator.count() > 0) {
      await separator.focus()
      const min = Number(await separator.getAttribute('aria-valuemin'))
      const max = Number(await separator.getAttribute('aria-valuemax'))
      expect(min).toBeGreaterThanOrEqual(10)
      expect(max).toBeLessThanOrEqual(90)
      await page.keyboard.press('Home')
      await expect(separator).toHaveAttribute('aria-valuenow', String(min))
      const overflowAtMin = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflowAtMin, '调到极小值后仍不溢出').toBeLessThanOrEqual(0)
      await page.keyboard.press('End')
      await expect(separator).toHaveAttribute('aria-valuenow', String(max))
      const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflowAfter, '调到极大值后仍不溢出').toBeLessThanOrEqual(0)
    } else {
      await expect(page.locator('.split').first(), '窄容器退化为纵向堆叠').toHaveAttribute('data-axis', 'column')
      const paneBoxes = await page.locator(SURFACES).evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return { y: rect.y, width: rect.width, height: rect.height }
      }))
      for (const paneBox of paneBoxes) {
        expect(paneBox.width, '每块区域都拿到可读的整行宽度').toBeGreaterThanOrEqual(300)
        expect(paneBox.height, '堆叠后每块区域仍有可用高度').toBeGreaterThanOrEqual(400)
      }
      // 转录区至少留出 4 行正文;输入坞完整落在栏内,不被下一栏盖住。
      const firstPane = page.locator(SURFACES).first()
      const transcriptBox = await firstPane.locator('.transcript').boundingBox()
      expect(transcriptBox?.height ?? 0, '转录区至少 4 行').toBeGreaterThanOrEqual(100)
      const composerBox = await firstPane.locator('.composer-dock').boundingBox()
      const firstBox = paneBoxes[0]
      expect((composerBox?.y ?? 0) + (composerBox?.height ?? 0), '输入坞不越出栏底').toBeLessThanOrEqual((firstBox?.y ?? 0) + (firstBox?.height ?? 0) + 1)
    }
  })
}

// ============================================================================
// 三、落点解析统一:拖悬浮窗体走与拖 tab 同一套语义(顶条停靠 / 边缘切分 / 内部并入 / 保持悬浮)
// ============================================================================

test('拖悬浮窗体(不是 tab)到区域右缘 → 切出第二块区域,被拖窗体是新区域的活动成员', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await openFloatingFile(page, README)
  await expect(page.locator(SURFACES), '切分前只有一块区域').toHaveCount(1)

  const region = await page.locator(SURFACES).first().boundingBox()
  expect(region, '区域有几何盒').not.toBeNull()
  if (region === null) return
  await holdDragFloatingWindow(page, README, region.x + region.width - 30, region.y + region.height / 2)

  // 落点预览:半透明带 + 落点区域整体描边高亮。
  await expect(page.locator('.split-preview'), '边缘带内出现落点预览带').toHaveCount(1)
  await expect(page.locator(SURFACES).first(), '落点区域整体描边高亮').toHaveClass(/is-split-target/)
  await page.mouse.up()

  await expect(page.locator(SURFACES), '切出第二块区域').toHaveCount(2)
  const newPane = page.locator(SURFACES).nth(1)
  await expect(newPane.locator('.file-panel[data-mode="docked"][data-file-path="README.md"]'), '新区域显示该文件的停靠面板').toHaveCount(1)
  await expect(newPane.locator('.file-tab[data-file-path="README.md"][aria-pressed="true"]'), '被拖窗体是新区域的活动成员').toHaveCount(1)
  await expect(page.locator('.file-panel[data-mode="floating"]'), '不再是悬浮窗体').toHaveCount(0)
  await expect(page.locator('.file-tab'), '文件仍是一个 tab(只是换了区域)').toHaveCount(1)
})

test('拖悬浮窗体到**另一块**区域内部 → 并入该区域(多一个 tab、浮窗消失,不新增区域)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  // 先用拖 tab 造出两块区域。
  await dragTabToRightEdge(page, page.locator('.tab-slot').nth(1))
  await expect(page.locator(SURFACES), '两块区域').toHaveCount(2)

  // 悬浮窗默认居中于输入坞(在**第 0 块**区域内),故它当前落在第 0 块;这里拖进**第 1 块**(另一块)
  // 的内部 → 并入。同区域内拖动只是移动窗口(见 workspace.spec 的面板拖动用例),不会并入。
  await openFloatingFile(page, README)
  const target = await page.locator(SURFACES).nth(1).boundingBox()
  expect(target, '目标区域有几何盒').not.toBeNull()
  if (target === null) return
  await holdDragFloatingWindow(page, README, target.x + target.width / 2, target.y + target.height / 2)
  await expect(page.locator(SURFACES).nth(1), '内部落点 → 并入该区域(描边高亮)').toHaveClass(/is-merge-target/)
  await page.mouse.up()

  await expect(page.locator(SURFACES), '并入不新增区域').toHaveCount(2)
  await expect(page.locator('.file-panel[data-mode="floating"]'), '浮窗消失').toHaveCount(0)
  await expect(page.locator('.file-tab'), '该区域多了一个文件 tab').toHaveCount(1)
  await expect(page.locator(SURFACES).nth(1).locator('.file-panel[data-mode="docked"][data-file-path="README.md"]'), '并入的是第 1 块区域').toHaveCount(1)
})

test('新切出的区域与根区域功能对等:有 ＋ 与菜单钮,菜单里能搜到会话', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await dragTabToRightEdge(page, page.locator('.tab-slot').nth(1))
  await expect(page.locator(SURFACES)).toHaveCount(2)

  const child = page.locator(SURFACES).nth(1)
  await expect(child.getByRole('button', { name: /新建对话或打开文件|New conversation or open file/, exact: true }), '新区域有 ＋').toHaveCount(1)
  const trigger = child.locator('.conversation-menu__trigger')
  await expect(trigger, '新区域有菜单钮').toHaveCount(1)
  await trigger.click()
  await expect(child.locator('.conversation-menu__panel'), '菜单浮层开在该区域').toBeVisible()
  await child.locator('.conversation-search__input').fill('周报')
  await expect(child.locator('.hit-item').first(), '能在该区域的菜单里搜到会话').toBeVisible()
})

test('区域只剩一个 tab 时关闭钮仍在且可用;关掉后该区域被移除(两块 → 一块)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await dragTabToRightEdge(page, page.locator('.tab-slot').nth(1))
  await expect(page.locator(SURFACES), '两块区域').toHaveCount(2)

  const child = page.locator(SURFACES).nth(1)
  await expect(child.locator('.tab-slot'), '新区域只有一个 tab').toHaveCount(1)
  const close = child.locator('.tab-close')
  await expect(close, '只剩一个 tab 也有关闭钮').toHaveCount(1)
  await expect(close, '关闭钮不在 Tab 序里(与现状一致)').toHaveAttribute('tabindex', '-1')
  await child.locator('.tab-slot').first().hover()
  await close.click()

  await expect(page.locator(SURFACES), '摘空 → 区域被移除').toHaveCount(1)
  await expect(page.locator('.workspace-live'), '区域移除经 role=status 播报').toHaveText(/空区域/)
})

test('根区域为唯一区域时关掉最后一个 tab → 引导页;主按钮恢复一块带 tab 的区域并聚焦输入框', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: VIEWPORT_HEIGHT })
  await login(page)
  await waitForReady(page)
  await expect(page.locator(SURFACES)).toHaveCount(1)

  // 逐个关掉根区域的所有 tab(关闭钮恒在,不再随数量消失)。
  for (let guard = 0; guard < 20; guard += 1) {
    const slots = page.locator('.tab-slot')
    if (await slots.count() === 0) break
    const slot = slots.first()
    await slot.hover()
    await slot.locator('.tab-close').click()
  }

  // 引导页出现。它不是转录,故全页**没有任何** role="log" —— 不变量「恰为 1」在此退化为 0。
  await expect(page.locator('.onboarding'), '整块右侧渲染引导页').toHaveCount(1)
  await expect(page.getByRole('log'), '引导页不是转录').toHaveCount(0)
  await expect(page.locator('.transcript'), '没有任何转录视图').toHaveCount(0)
  // 全页 h1 恰为 1:它住在页面级,不随空区域消失(这与「住在会话头里」的关键差别)。
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.locator('.onboarding__title')).toHaveText('这里还没有打开的窗口')
  // 像素基线:引导页是本轮**全新的界面**,而现有 workspace-empty-* 拍的是 ?s=empty 的空位占位
  // (那块区域还有成员、只是没有活动成员),与「一块区域都不剩」不是同一个状态 —— 不补这张,
  // 新界面就没有回归保护。
  await expect(page).toHaveScreenshot('workspace-onboarding-1600.png', { fullPage: true })

  // 主按钮 = 与区域 ＋ 同一个动作:恢复一块带 tab 的区域 + 一段新会话,输入框自动聚焦。
  // 平权之后没有「当前项目」:引导页 + 有多个已打开项目 ⇒ 先弹出项目选择浮层(归属需用户拍板),
  // 选一个项目才真正建会话。浮层是 listbox 单选的锚定浮层(不是居中模态),锚在触发点下方。
  await page.locator('.onboarding__primary').click()
  const picker = page.locator('.project-picker')
  await expect(picker, '多项目下先让用户选归属').toHaveCount(1)
  await picker.locator('[role="option"]').first().click()
  await expect(picker, '选完即收起').toHaveCount(0)
  await expect(page.locator('.onboarding'), '引导页退出').toHaveCount(0)
  await expect(page.locator(SURFACES), '恢复一块带 tab 的区域').toHaveCount(1)
  await expect(page.locator('.tab-slot'), '新会话占一个 tab').toHaveCount(1)
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? ''), { message: '新会话输入框自动聚焦' }).toMatch(/^workspace-composer-/)
  await expect(page.getByRole('heading', { level: 1 }), '恢复后 h1 仍恰为 1').toHaveCount(1)
  await expect(page.getByRole('log'), '恢复后恰一个 live region').toHaveCount(1)
})
