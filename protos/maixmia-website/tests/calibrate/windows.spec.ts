// 工作台窗体布局的**纯函数**断言(不经过 UI):区域(surface)持 tab 成员、窗体持几何 / 归属 /
// 内容,层序由**数组顺序**表达。这些断言直接对 src/data/windows 的纯操作做,两个引擎上结果一致。
//
// 覆盖设计要点里的「不变量」:
//   ① 任何区域的 activeId 非空时必须 ∈ 其 members;
//   ② floating 窗体的 id 不得出现在任何区域的 members 里(反之 docked 必须属于某区域);
//   ③ maximized × floating 互斥;
//   ④ 一个窗体至多属于一个区域。
import { expect, test } from '@playwright/test'
import type { WorkspaceLayout } from '../../src/contracts/generated/workspace-layout'
import {
  MAIN_SURFACE,
  activateTab,
  blurSurface,
  chatMemberIds,
  closeTab,
  dockWindow,
  emptyLayout,
  fileMemberIds,
  floatWindow,
  focusWindow,
  hideWindow,
  isMember,
  layoutViolations,
  memberWindows,
  openFloating,
  openTab,
  reorderChatMembers,
  reorderFileMembers,
  reorderTabs,
  seedChatWindow,
  setWindowRect,
  visibleWindows,
  windowIdOf,
} from '../../src/data/windows'

const README = 'README.md'
const PROGRESS = 'progress.csv'
// 两个对话会话 id(与 mock 数据同值;windowIdOf 对 chat 取 sessionId)。
const WEEKLY = 'weekly'
const ROADMAP = 'roadmap'

test('空布局:恰一个根区域,无成员、无窗体', () => {
  const layout = emptyLayout()
  expect(layout.surfaces).toHaveLength(1)
  expect(layout.surfaces[0]).toMatchObject({ id: MAIN_SURFACE, parentId: null, members: [], activeId: '' })
  expect(layout.windows).toEqual([])
  expect(layout.focus).toBe('')
  expect(layout.recent).toEqual([])
  expect(layoutViolations(layout)).toEqual([])
})

test('openTab:成员落在区域上,窗体持内容 / 归属 / 几何;同一内容重复打开不新增', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  // 窗体 id 由内容唯一决定(文件取路径),可被调用方取得。
  expect(windowIdOf({ kind: 'file', path: README })).toBe(README)
  expect(memberWindows(layout, MAIN_SURFACE).map((win) => win.id)).toEqual([README])
  expect(layout.windows).toHaveLength(1)
  const win = layout.windows[0]
  expect(win?.placement).toBe('docked')
  expect(win?.view).toBe('normal')
  expect(win?.visible).toBe(true)
  expect(win?.content).toEqual({ kind: 'file', path: README })
  // 打开即激活:区域的 activeId 与全局面板焦点同时落到它。
  expect(layout.surfaces[0]?.activeId).toBe(README)
  expect(layout.focus).toBe(README)
  expect(layout.recent).toEqual([README])

  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  expect(memberWindows(layout, MAIN_SURFACE).map((win) => win.id)).toEqual([README, PROGRESS])
  // 数组顺序 = 层序:后打开的排在数组末尾(在上)。
  expect(layout.windows.map((item) => item.id)).toEqual([README, PROGRESS])

  const again = openTab(layout, MAIN_SURFACE, { kind: 'file', path: README })
  expect(again.windows).toHaveLength(2)
  expect(again.surfaces[0]?.members).toEqual([README, PROGRESS])
  // 再次打开 = 复用同一窗体并置顶(不重复建窗)。
  expect(again.windows.map((item) => item.id)).toEqual([PROGRESS, README])
  expect(layoutViolations(again)).toEqual([])
})

test('closeTab:只从成员撤下并隐藏窗体(关闭 ≠ 删除),激活位交给相邻 tab', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  const closed = closeTab(layout, MAIN_SURFACE, PROGRESS)
  expect(closed.surfaces[0]?.members).toEqual([README])
  // 窗体仍在数组里(几何 / 归属留着),只是不可见 —— 再点回来即原样恢复。
  expect(closed.windows).toHaveLength(2)
  expect(closed.windows.find((win) => win.id === PROGRESS)?.visible).toBe(false)
  // 关掉的是活动 tab → 激活位让给相邻的 README。
  expect(closed.surfaces[0]?.activeId).toBe(README)
  expect(closed.focus).toBe('')
  expect(layoutViolations(closed)).toEqual([])

  // 重新打开(「最近关闭」那条路径)= 重新加入成员并置顶,成员顺序回到条尾。
  const reopened = openTab(closed, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  expect(reopened.windows.find((win) => win.id === PROGRESS)?.visible).toBe(true)
  expect(reopened.focus).toBe(PROGRESS)
  expect(memberWindows(reopened, MAIN_SURFACE).map((win) => win.id)).toEqual([README, PROGRESS])
  expect(layoutViolations(reopened)).toEqual([])

  // activateTab 只对**成员**操作:隐藏成员(关窗口 ≠ 关标签)可被它重新显示,成员不变。
  const hiddenMember = hideWindow(reopened, README)
  const shown = activateTab(hiddenMember, MAIN_SURFACE, README)
  expect(shown.windows.find((win) => win.id === README)?.visible).toBe(true)
  expect(shown.surfaces[0]?.members).toEqual([README, PROGRESS])
  expect(shown.focus).toBe(README)
  expect(layoutViolations(shown)).toEqual([])
})

test('focusWindow:把窗体抬到数组末尾(最上层),并写回所属区域的 activeId', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  const focused = focusWindow(layout, README)
  expect(focused.windows.map((item) => item.id)).toEqual([PROGRESS, README])
  expect(focused.focus).toBe(README)
  expect(focused.surfaces[0]?.activeId).toBe(README)
  expect(layoutViolations(focused)).toEqual([])

  // 已聚焦且已在最上层 → 原样返回(不再无谓地重排)。
  expect(focusWindow(focused, README)).toEqual(focused)
})

test('hideWindow / setWindowRect:隐藏与几何落定都不动成员,也不清几何来源', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  const sized = setWindowRect(layout, README, { x: 40, y: 60, width: 480, height: 320 })
  expect(sized.windows[0]?.rect).toEqual({ x: 40, y: 60, width: 480, height: 320 })
  // 成员不受几何变更影响。
  expect(sized.surfaces[0]?.members).toEqual([README])

  const hidden = hideWindow(sized, README)
  expect(visibleWindows(hidden)).toEqual([])
  expect(hidden.focus).toBe('')
  // 隐藏不改几何 / 归属 —— 再显示即原样。
  expect(hidden.windows[0]?.rect).toEqual({ x: 40, y: 60, width: 480, height: 320 })
  expect(hidden.windows[0]?.placement).toBe('docked')
  expect(layoutViolations(hidden)).toEqual([])
})

test('reorderTabs:按给定顺序重排区域成员', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  const reordered = reorderTabs(layout, MAIN_SURFACE, [PROGRESS, README])
  expect(reordered.surfaces[0]?.members).toEqual([PROGRESS, README])
  // 重排只动成员顺序,不动窗体数组(层序)。
  expect(reordered.windows.map((win) => win.id)).toEqual([README, PROGRESS])
  expect(layoutViolations(reordered)).toEqual([])
})

test('floatWindow / dockWindow:归属在区域与浮层之间迁移,成员与 placement 始终自洽', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })

  // docked → floating:从**所有**区域的成员里摘掉,交出自有矩形,view 归 normal。
  const floated = floatWindow(layout, README, { x: 10, y: 20, width: 300, height: 200 })
  expect(floated.surfaces[0]?.members).toEqual([PROGRESS])
  expect(isMember(floated, MAIN_SURFACE, README)).toBe(false)
  const floating = floated.windows.find((win) => win.id === README)
  expect(floating?.placement).toBe('floating')
  expect(floating?.view).toBe('normal')
  expect(floating?.rect).toEqual({ x: 10, y: 20, width: 300, height: 200 })
  expect(layoutViolations(floated)).toEqual([])

  // floating → docked:插到成员指定下标处并激活。
  const docked = dockWindow(floated, README, MAIN_SURFACE, 0)
  expect(docked.surfaces[0]?.members).toEqual([README, PROGRESS])
  expect(docked.windows.find((win) => win.id === README)?.placement).toBe('docked')
  expect(docked.surfaces[0]?.activeId).toBe(README)
  expect(layoutViolations(docked)).toEqual([])

  // 越界下标被夹到合法范围(不越界插入)。
  const appended = dockWindow(floated, README, MAIN_SURFACE, 99)
  expect(appended.surfaces[0]?.members).toEqual([PROGRESS, README])
  expect(layoutViolations(appended)).toEqual([])
})

// 向下拖出 tab 的落点是 floatWindow(见 workspace.spec 的手势用例)。这里断言它的**纯操作**性质:
// 拆出后条上少一项、多一个 floating 窗体,不变量恒为空;且原布局对象**未被改动** ——
// 「松手前都可逆」的撤销正是把这一份原样写回(所有操作都不可变)。
test('向下拖出:floatWindow 摘掉条上的成员并交出 floating 窗体,原布局对象不被改动(撤销即原样写回)', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  const membersBefore = [...(layout.surfaces[0]?.members ?? [])]

  // 拆出**非活动**的那个 tab(活动的是后开的 PROGRESS)。
  const floated = floatWindow(layout, README, { x: 300, y: 400, width: 0, height: 0 })
  expect(memberWindows(floated, MAIN_SURFACE).map((win) => win.id), '条上少一项').toEqual([PROGRESS])
  expect(isMember(floated, MAIN_SURFACE, README)).toBe(false)
  const win = floated.windows.find((item) => item.id === README)
  expect(win?.placement, '内容成了悬浮窗体').toBe('floating')
  expect(win?.visible).toBe(true)
  expect(win?.rect).toEqual({ x: 300, y: 400, width: 0, height: 0 })
  expect(layoutViolations(floated), '不变量恒为空').toEqual([])

  // 原布局对象一个字段都没动 —— 撤销 = 把它原样写回。
  expect(layout.surfaces[0]?.members, '原对象的成员顺序原样').toEqual(membersBefore)
  expect(layout.windows.find((item) => item.id === README)?.placement).toBe('docked')
  expect(layout.focus).toBe(PROGRESS)
  expect(layoutViolations(layout)).toEqual([])
})

test('openFloating:新建悬浮窗体不占 tab(不进任何 members),可见 / 置顶 / 聚焦 / 记入 recent', () => {
  const layout = openFloating(emptyLayout(), { kind: 'file', path: README }, { x: 0, y: 0, width: 0, height: 0 })
  const win = layout.windows[0]
  expect(win?.id).toBe(README)
  expect(win?.placement).toBe('floating')
  expect(win?.view).toBe('normal')
  expect(win?.visible).toBe(true)
  expect(win?.rect).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  // **不占 tab**:id 不出现在任何区域的 members 里(不变量④)。
  expect(isMember(layout, MAIN_SURFACE, README)).toBe(false)
  expect(layout.surfaces[0]?.members).toEqual([])
  expect(layout.surfaces[0]?.activeId).toBe('')
  expect(layout.focus).toBe(README)
  expect(layout.recent).toEqual([README])
  expect(layoutViolations(layout)).toEqual([])
})

test('openFloating:已有同 id 窗体则复用(不新建重复窗),并把停靠 / 隐藏的它转为悬浮', () => {
  // 停靠工况:先 openTab(成员 + 可见 + 激活),并给它记一个「上次悬浮矩形」。
  let layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  // 再停靠一个**邻居**并把 README 置为活动 —— 用来验证 README 被摘走时,腾出的活动位是
  // **交给相邻成员**(与 floatWindow / closeTab 同规则),而不是清空。
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  layout = activateTab(layout, MAIN_SURFACE, README)
  layout = setWindowRect(layout, README, { x: 11, y: 22, width: 300, height: 200 })
  const before = layout.windows.length
  layout = openFloating(layout, { kind: 'file', path: README }, { x: 0, y: 0, width: 0, height: 0 })
  expect(layout.windows, '复用同一窗体,不新增').toHaveLength(before)
  const win = layout.windows.find((item) => item.id === README)
  expect(win?.placement).toBe('floating')
  expect(win?.visible).toBe(true)
  // **已有窗体保留其记忆的矩形** —— 这是「还原悬浮时回到上次悬浮 rect」的前提。
  expect(win?.rect, '已有窗体不覆盖其记忆的矩形').toEqual({ x: 11, y: 22, width: 300, height: 200 })
  // 从所有区域的成员里摘掉,并把腾出的活动位交给相邻成员(不变量①)。
  expect(isMember(layout, MAIN_SURFACE, README)).toBe(false)
  expect(layout.surfaces[0]?.activeId, '活动位交给相邻成员').toBe(PROGRESS)
  expect(layout.focus).toBe(README)
  expect(layoutViolations(layout)).toEqual([])

  // 已悬浮工况:重复调用不产生第二个窗体,矩形同样原样保留。
  const again = openFloating(layout, { kind: 'file', path: README }, { x: 99, y: 99, width: 111, height: 111 })
  expect(again.windows, '仍只有 README 与 PROGRESS 两个窗体').toHaveLength(2)
  expect(again.windows.find((item) => item.id === README)?.rect).toEqual({ x: 11, y: 22, width: 300, height: 200 })
  expect(layoutViolations(again)).toEqual([])
})

test('blurSurface:清空 activeId(文件让位),成员与窗体原样不动', () => {
  const layout = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  expect(layout.surfaces[0]?.activeId).toBe(README)
  const blurred = blurSurface(layout, MAIN_SURFACE)
  expect(blurred.surfaces[0]?.activeId).toBe('')
  // tab 仍在条上(成员不变)、窗体仍在(几何 / 归属都不动)。
  expect(blurred.surfaces[0]?.members).toEqual([README])
  expect(blurred.windows).toEqual(layout.windows)
  expect(layoutViolations(blurred)).toEqual([])
  // 幂等:已为空时原样返回。
  expect(blurSurface(blurred, MAIN_SURFACE)).toEqual(blurred)
})

test('activateTab:焦点已在它身上但区域 activeId 已被清空时,仍要把它放回内容区', () => {
  // 场景:文件停靠并激活 → 选中对话把 activeId 清空(焦点仍留在该文件窗)→ 再点回它的 tab。
  const docked = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })
  const blurred = blurSurface(docked, MAIN_SURFACE)
  expect(blurred.focus).toBe(README)
  const reactivated = activateTab(blurred, MAIN_SURFACE, README)
  expect(reactivated.surfaces[0]?.activeId, 'activeId 被恢复').toBe(README)
  expect(layoutViolations(reactivated)).toEqual([])
  // 已是「焦点 = 它、activeId = 它」时仍然原样返回(早退保留)。
  expect(activateTab(reactivated, MAIN_SURFACE, README)).toEqual(reactivated)
})

test('不变量守卫:构造出的违规都被 layoutViolations 抓到', () => {  const base = openTab(emptyLayout(), MAIN_SURFACE, { kind: 'file', path: README })

  // activeId 不在 members 里。
  const badActive: WorkspaceLayout = { ...base, surfaces: base.surfaces.map((surface) => ({ ...surface, activeId: 'ghost' })) }
  expect(layoutViolations(badActive).some((item) => item.includes('activeId'))).toBe(true)

  // floating 窗体却出现在区域的 members 里。
  const badFloating: WorkspaceLayout = { ...base, windows: base.windows.map((win) => ({ ...win, placement: 'floating' })) }
  expect(layoutViolations(badFloating).some((item) => item.includes('floating'))).toBe(true)

  // floating × maximized 互斥。
  const badMax: WorkspaceLayout = {
    ...base,
    surfaces: base.surfaces.map((surface) => ({ ...surface, members: [], activeId: '' })),
    windows: base.windows.map((win) => ({ ...win, placement: 'floating', view: 'maximized' })),
  }
  expect(layoutViolations(badMax).some((item) => item.includes('maximized'))).toBe(true)

  // 一个窗体同时属于两个区域。
  const badOwners: WorkspaceLayout = {
    ...base,
    surfaces: [
      ...base.surfaces,
      { id: 'other', parentId: MAIN_SURFACE, axis: 'column', weight: 1, members: [README], activeId: '' },
    ],
  }
  expect(layoutViolations(badOwners).some((item) => item.includes('同时属于'))).toBe(true)
})

// ============================================================================
// 单元 C1:对话也是窗体 —— 与文件走同一条窗体机制
// ============================================================================

// 把一个会话补成区域成员并激活(页面装载时的「补一个成员」规则)。
function seedChat(layout: WorkspaceLayout, sessionId: string, index: number): WorkspaceLayout {
  return activateTab(seedChatWindow(layout, MAIN_SURFACE, sessionId, index), MAIN_SURFACE, sessionId)
}

test('seedChatWindow:为会话补一个停靠成员,已有窗体(关闭 / 悬浮过)则原样返回', () => {
  const layout = seedChatWindow(emptyLayout(), MAIN_SURFACE, WEEKLY, 0)
  expect(windowIdOf({ kind: 'chat', sessionId: WEEKLY }), '对话窗体 id = 会话 id').toBe(WEEKLY)
  // 它是一个**停靠**窗体,且成了区域成员(= 条上的一项)。
  const win = layout.windows.find((item) => item.id === WEEKLY)
  expect(win?.placement).toBe('docked')
  expect(win?.content).toEqual({ kind: 'chat', sessionId: WEEKLY })
  expect(chatMemberIds(layout, MAIN_SURFACE)).toEqual([WEEKLY])
  // 补齐只是补成员,不抢焦点。
  expect(layout.surfaces[0]?.activeId).toBe('')
  expect(layout.focus).toBe('')
  expect(layoutViolations(layout)).toEqual([])

  // 插到指定下标:已有的成员相对顺序保留(new 在中间)。
  let two = seedChatWindow(layout, MAIN_SURFACE, ROADMAP, 0)
  expect(chatMemberIds(two, MAIN_SURFACE)).toEqual([ROADMAP, WEEKLY])
  two = seedChatWindow(two, MAIN_SURFACE, 'incident', 1)
  expect(chatMemberIds(two, MAIN_SURFACE), '插在下标处').toEqual([ROADMAP, 'incident', WEEKLY])

  // 已有窗体(哪怕已经关闭 = 隐藏、或已拆出 = 悬浮)一律原样返回 —— 不能把已关闭的会话
  // 重新拉回条上,也不能把悬浮的窗体重新塞进 members(不变量④)。
  const closed = closeTab(two, MAIN_SURFACE, ROADMAP)
  expect(seedChatWindow(closed, MAIN_SURFACE, ROADMAP, 0), '已关闭的会话不复活').toEqual(closed)
  const floated = floatWindow(two, ROADMAP, { x: 1, y: 2, width: 0, height: 0 })
  const seeded = seedChatWindow(floated, MAIN_SURFACE, ROADMAP, 0)
  expect(isMember(seeded, MAIN_SURFACE, ROADMAP), '悬浮的会话不被塞回 members').toBe(false)
  expect(layoutViolations(seeded)).toEqual([])
})

test('对话成员与文件成员各自成序:reorderChatMembers / reorderFileMembers 互不串扰', () => {
  // 先对话、后文件地建一条混合的条。
  let layout = emptyLayout()
  layout = seedChat(layout, WEEKLY, 0)
  layout = seedChat(layout, ROADMAP, 1)
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: README })
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  expect(chatMemberIds(layout, MAIN_SURFACE)).toEqual([WEEKLY, ROADMAP])
  expect(fileMemberIds(layout, MAIN_SURFACE)).toEqual([README, PROGRESS])

  // 重排对话:只动对话的相对顺序,文件成员原样保留。
  const chatsReordered = reorderChatMembers(layout, MAIN_SURFACE, [ROADMAP, WEEKLY])
  expect(chatMemberIds(chatsReordered, MAIN_SURFACE), '对话顺序按给定顺序').toEqual([ROADMAP, WEEKLY])
  expect(fileMemberIds(chatsReordered, MAIN_SURFACE), '文件成员顺序不受对话重排影响').toEqual([README, PROGRESS])
  expect(layoutViolations(chatsReordered)).toEqual([])

  // 重排文件:只动文件的相对顺序,对话原样保留(条上「先对话、后文件」的次序稳定)。
  const filesReordered = reorderFileMembers(layout, MAIN_SURFACE, [PROGRESS, README])
  expect(fileMemberIds(filesReordered, MAIN_SURFACE)).toEqual([PROGRESS, README])
  expect(chatMemberIds(filesReordered, MAIN_SURFACE), '对话成员顺序不受文件重排影响').toEqual([WEEKLY, ROADMAP])
  expect(layoutViolations(filesReordered)).toEqual([])
  // 未提到的成员被丢弃(与 reorderTabs 一致),但**只丢自己那一种**。
  expect(chatMemberIds(reorderChatMembers(layout, MAIN_SURFACE, [ROADMAP]), MAIN_SURFACE)).toEqual([ROADMAP])
  expect(fileMemberIds(reorderChatMembers(layout, MAIN_SURFACE, [ROADMAP]), MAIN_SURFACE)).toEqual([README, PROGRESS])
})

test('对话的拆出 / 停靠:与文件同一套 floatWindow / dockWindow,成员与 placement 始终自洽', () => {
  let layout = seedChat(emptyLayout(), WEEKLY, 0)
  layout = seedChat(layout, ROADMAP, 1)
  expect(layout.surfaces[0]?.activeId).toBe(ROADMAP)

  // 向下拖出 = floatWindow:从成员里摘掉、交出 floating 窗体、腾出的活动位交给相邻成员。
  const floated = floatWindow(layout, ROADMAP, { x: 300, y: 400, width: 0, height: 0 })
  expect(chatMemberIds(floated, MAIN_SURFACE), '条上少一项').toEqual([WEEKLY])
  const floating = floated.windows.find((item) => item.id === ROADMAP)
  expect(floating?.placement).toBe('floating')
  expect(floating?.visible).toBe(true)
  // 腾出的活动位交给相邻成员(与 closeTab / buildSplit 同规则):ROADMAP 是末位 → 交给左侧的 WEEKLY。
  expect(floated.surfaces[0]?.activeId, '腾出的活动位交给相邻成员').toBe(WEEKLY)
  expect(layoutViolations(floated), '不变量恒为空').toEqual([])
  // 原布局对象未被改动 —— 「松手前都可逆」的撤销即把它原样写回。
  expect(chatMemberIds(layout, MAIN_SURFACE)).toEqual([WEEKLY, ROADMAP])
  expect(layout.windows.find((item) => item.id === ROADMAP)?.placement).toBe('docked')

  // 拖回条上 = dockWindow:插回成员、置为停靠可见并激活。
  const docked = dockWindow(floated, ROADMAP, MAIN_SURFACE, 0)
  expect(chatMemberIds(docked, MAIN_SURFACE), '插回条上').toEqual([ROADMAP, WEEKLY])
  expect(docked.windows.find((item) => item.id === ROADMAP)?.placement).toBe('docked')
  expect(docked.windows.find((item) => item.id === ROADMAP)?.visible).toBe(true)
  expect(docked.surfaces[0]?.activeId).toBe(ROADMAP)
  expect(layoutViolations(docked)).toEqual([])
})

test('对话与文件同域混装:一条不变量序列下 layoutViolations 恒为空', () => {
  // 建:两个对话 + 两个文件;拆出一个对话;关掉一个文件;再停靠回对话。
  let layout = seedChat(emptyLayout(), WEEKLY, 0)
  layout = seedChat(layout, ROADMAP, 1)
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: README })
  layout = openTab(layout, MAIN_SURFACE, { kind: 'file', path: PROGRESS })
  expect(layoutViolations(layout)).toEqual([])
  layout = floatWindow(layout, WEEKLY, { x: 10, y: 10, width: 200, height: 200 })
  expect(layoutViolations(layout)).toEqual([])
  layout = closeTab(layout, MAIN_SURFACE, README)
  expect(layoutViolations(layout)).toEqual([])
  layout = dockWindow(layout, WEEKLY, MAIN_SURFACE, 0)
  expect(layoutViolations(layout)).toEqual([])
  expect(chatMemberIds(layout, MAIN_SURFACE), '对话与文件的成员互不串位').toEqual([WEEKLY, ROADMAP])
  expect(fileMemberIds(layout, MAIN_SURFACE)).toEqual([PROGRESS])
})
