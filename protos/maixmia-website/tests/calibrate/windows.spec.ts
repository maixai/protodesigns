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
import type { WindowRect } from '../../src/contracts/generated/workspace-window'
import type { WindowContent } from '../../src/contracts/generated/window-content'
import {
  MAIN_SURFACE,
  activateTab,
  blurSurface,
  chatMemberIds,
  chatWindowId,
  closeTab,
  closeGroup,
  dropWindows,
  groupOfWindow,
  isMinimizedWindow,
  minimizeGroup,
  minimizedGroupsOf,
  restoreGroup,
  removeSurface,
  visibleMemberIds,
  visibleMemberWindows,
  dockWindow,
  emptyLayout,
  fileMemberIds,
  fileWindowId,
  floatWindow,
  floatingWindowsIntersecting,
  focusWindow,
  hideWindow,
  hideWindows,
  isMember,
  layoutViolations,
  memberWindows,
  openFloating,
  openTab,
  rectsIntersect,
  reorderChatMembers,
  reorderFileMembers,
  reorderTabs,
  seedChatWindow,
  setWindowRect,
  surfaceOf,
  surfaceOwning,
  visibleWindows,
  windowIdOf,
  withSurfaceSplit,
} from '../../src/data/windows'

const PROJECT = 'weekly-report'
const fileContent = (path: string): WindowContent => ({ kind: 'file', projectId: PROJECT, path })
const chatContent = (sessionId: string): WindowContent => ({ kind: 'chat', projectId: PROJECT, sessionId })
const README_ID = fileWindowId(PROJECT, 'README.md')
const PROGRESS_ID = fileWindowId(PROJECT, 'progress.csv')
// 窗体身份是**复合键**(项目 + 内容):文件 = file://<项目>/<路径>,对话 = chat://<项目>/<会话 id>。
// 裸文件名不唯一(README.md 同时在多个项目里),故断言一律用复合 id。
const WEEKLY_ID = chatWindowId(PROJECT, 'weekly')
const ROADMAP_ID = chatWindowId(PROJECT, 'roadmap')
const INCIDENT_ID = chatWindowId(PROJECT, 'incident')

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
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  // 窗体 id 由内容唯一决定(文件取路径),可被调用方取得。
  expect(windowIdOf(fileContent('README.md'))).toBe(README_ID)
  expect(memberWindows(layout, MAIN_SURFACE).map((win) => win.id)).toEqual([README_ID])
  expect(layout.windows).toHaveLength(1)
  const win = layout.windows[0]
  expect(win?.placement).toBe('docked')
  expect(win?.view).toBe('normal')
  expect(win?.visible).toBe(true)
  expect(win?.content).toEqual(fileContent('README.md'))
  // 打开即激活:区域的 activeId 与全局面板焦点同时落到它。
  expect(layout.surfaces[0]?.activeId).toBe(README_ID)
  expect(layout.focus).toBe(README_ID)
  expect(layout.recent).toEqual([README_ID])

  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  expect(memberWindows(layout, MAIN_SURFACE).map((win) => win.id)).toEqual([README_ID, PROGRESS_ID])
  // 数组顺序 = 层序:后打开的排在数组末尾(在上)。
  expect(layout.windows.map((item) => item.id)).toEqual([README_ID, PROGRESS_ID])

  const again = openTab(layout, MAIN_SURFACE, fileContent('README.md'))
  expect(again.windows).toHaveLength(2)
  expect(again.surfaces[0]?.members).toEqual([README_ID, PROGRESS_ID])
  // 再次打开 = 复用同一窗体并置顶(不重复建窗)。
  expect(again.windows.map((item) => item.id)).toEqual([PROGRESS_ID, README_ID])
  expect(layoutViolations(again)).toEqual([])
})

test('closeTab:只从成员撤下并隐藏窗体(关闭 ≠ 删除),激活位交给相邻 tab', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  const closed = closeTab(layout, MAIN_SURFACE, PROGRESS_ID)
  expect(closed.surfaces[0]?.members).toEqual([README_ID])
  // 窗体仍在数组里(几何 / 归属留着),只是不可见 —— 再点回来即原样恢复。
  expect(closed.windows).toHaveLength(2)
  expect(closed.windows.find((win) => win.id === PROGRESS_ID)?.visible).toBe(false)
  // 关掉的是活动 tab → 激活位让给相邻的 README_ID。
  expect(closed.surfaces[0]?.activeId).toBe(README_ID)
  expect(closed.focus).toBe('')
  expect(layoutViolations(closed)).toEqual([])

  // 重新打开(「最近关闭」那条路径)= 重新加入成员并置顶,成员顺序回到条尾。
  const reopened = openTab(closed, MAIN_SURFACE, fileContent('progress.csv'))
  expect(reopened.windows.find((win) => win.id === PROGRESS_ID)?.visible).toBe(true)
  expect(reopened.focus).toBe(PROGRESS_ID)
  expect(memberWindows(reopened, MAIN_SURFACE).map((win) => win.id)).toEqual([README_ID, PROGRESS_ID])
  expect(layoutViolations(reopened)).toEqual([])

  // activateTab 只对**成员**操作:隐藏成员(关窗口 ≠ 关标签)可被它重新显示,成员不变。
  const hiddenMember = hideWindow(reopened, README_ID)
  const shown = activateTab(hiddenMember, MAIN_SURFACE, README_ID)
  expect(shown.windows.find((win) => win.id === README_ID)?.visible).toBe(true)
  expect(shown.surfaces[0]?.members).toEqual([README_ID, PROGRESS_ID])
  expect(shown.focus).toBe(README_ID)
  expect(layoutViolations(shown)).toEqual([])
})

test('focusWindow:把窗体抬到数组末尾(最上层),并写回所属区域的 activeId', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  const focused = focusWindow(layout, README_ID)
  expect(focused.windows.map((item) => item.id)).toEqual([PROGRESS_ID, README_ID])
  expect(focused.focus).toBe(README_ID)
  expect(focused.surfaces[0]?.activeId).toBe(README_ID)
  expect(layoutViolations(focused)).toEqual([])

  // 已聚焦且已在最上层 → 原样返回(不再无谓地重排)。
  expect(focusWindow(focused, README_ID)).toEqual(focused)
})

test('hideWindow / setWindowRect:隐藏与几何落定都不动成员,也不清几何来源', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  const sized = setWindowRect(layout, README_ID, { x: 40, y: 60, width: 480, height: 320 })
  expect(sized.windows[0]?.rect).toEqual({ x: 40, y: 60, width: 480, height: 320 })
  // 成员不受几何变更影响。
  expect(sized.surfaces[0]?.members).toEqual([README_ID])

  const hidden = hideWindow(sized, README_ID)
  expect(visibleWindows(hidden)).toEqual([])
  expect(hidden.focus).toBe('')
  // 隐藏不改几何 / 归属 —— 再显示即原样。
  expect(hidden.windows[0]?.rect).toEqual({ x: 40, y: 60, width: 480, height: 320 })
  expect(hidden.windows[0]?.placement).toBe('docked')
  expect(layoutViolations(hidden)).toEqual([])
})

test('reorderTabs:按给定顺序重排区域成员', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  const reordered = reorderTabs(layout, MAIN_SURFACE, [PROGRESS_ID, README_ID])
  expect(reordered.surfaces[0]?.members).toEqual([PROGRESS_ID, README_ID])
  // 重排只动成员顺序,不动窗体数组(层序)。
  expect(reordered.windows.map((win) => win.id)).toEqual([README_ID, PROGRESS_ID])
  expect(layoutViolations(reordered)).toEqual([])
})

test('floatWindow / dockWindow:归属在区域与浮层之间迁移,成员与 placement 始终自洽', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))

  // docked → floating:从**所有**区域的成员里摘掉,交出自有矩形,view 归 normal。
  const floated = floatWindow(layout, README_ID, { x: 10, y: 20, width: 300, height: 200 })
  expect(floated.surfaces[0]?.members).toEqual([PROGRESS_ID])
  expect(isMember(floated, MAIN_SURFACE, README_ID)).toBe(false)
  const floating = floated.windows.find((win) => win.id === README_ID)
  expect(floating?.placement).toBe('floating')
  expect(floating?.view).toBe('normal')
  expect(floating?.rect).toEqual({ x: 10, y: 20, width: 300, height: 200 })
  expect(layoutViolations(floated)).toEqual([])

  // floating → docked:插到成员指定下标处并激活。
  const docked = dockWindow(floated, README_ID, MAIN_SURFACE, 0)
  expect(docked.surfaces[0]?.members).toEqual([README_ID, PROGRESS_ID])
  expect(docked.windows.find((win) => win.id === README_ID)?.placement).toBe('docked')
  expect(docked.surfaces[0]?.activeId).toBe(README_ID)
  expect(layoutViolations(docked)).toEqual([])

  // 越界下标被夹到合法范围(不越界插入)。
  const appended = dockWindow(floated, README_ID, MAIN_SURFACE, 99)
  expect(appended.surfaces[0]?.members).toEqual([PROGRESS_ID, README_ID])
  expect(layoutViolations(appended)).toEqual([])
})

// ============================================================================
// dockWindow 的**移动**语义:一个窗体至多属于一个区域(不变量③)。
// 此前它只从**目标区域**过滤,于是「把一段已经在 A 区开着的对话,从别处停靠进 B 区」会让它同时
// 属于 A 与 B —— 同一个对话在两块区域各挂一枚 tab。修法:先从**所有**区域摘掉,再插进目标区域。
// ============================================================================

test('dockWindow 是「移动」而非「复制」:已在 A 区的窗体停靠进 B 区后只属于 B', () => {
  // 根区域:两个对话 + 一个文件;把 README_ID 切到子区域 —— 它此后只属于子区域。
  let layout = seedChat(emptyLayout(), 'weekly', 0)
  layout = seedChat(layout, 'roadmap', 1)
  layout = openTab(layout, MAIN_SURFACE, fileContent('README.md'))
  layout = withSurfaceSplit(layout, MAIN_SURFACE, 'row', README_ID)
  const child = layout.surfaces.at(-1)
  expect(child).toBeDefined()
  if (child === undefined) return
  expect(surfaceOwning(layout, README_ID)?.id, '切分后 README_ID 只属于子区域').toBe(child.id)

  // 把它从子区域停靠回根区域(与「在切换器里点一段已在别处打开的项」同一条路径)。
  const moved = dockWindow(layout, README_ID, MAIN_SURFACE, 0)
  expect(surfaceOwning(moved, README_ID)?.id, '移动后只属于根区域').toBe(MAIN_SURFACE)
  expect(surfaceOf(moved, child.id)?.members, '原子区域不再有它').toEqual([])
  expect(surfaceOf(moved, child.id)?.activeId, '子区域没有其他成员 → 活动位清空').toBe('')
  expect(fileMemberIds(moved, MAIN_SURFACE), '插在目标区域下标 0 处').toEqual([README_ID])
  expect(surfaceOf(moved, MAIN_SURFACE)?.activeId, '置为目标区域的活动成员').toBe(README_ID)
  expect(moved.focus).toBe(README_ID)
  expect(layoutViolations(moved), '不变量恒为空(尤其③:至多属于一个区域)').toEqual([])

  // 反向也成立:把它再停靠回子区域 → 只属于子区域,根区域不再有它。
  const back = dockWindow(moved, README_ID, child.id, 0)
  expect(surfaceOwning(back, README_ID)?.id).toBe(child.id)
  expect(surfaceOf(back, MAIN_SURFACE)?.members.includes(README_ID)).toBe(false)
  expect(layoutViolations(back)).toEqual([])
})

test('dockWindow 移动语义:原区域的活动位交给相邻成员(优先右侧,其次左侧)', () => {
  // 根区域 A = [ROADMAP_ID, WEEKLY_ID];把 README_ID 切到子区域 B,再让 ROADMAP_ID 成为 A 的活动成员。
  let layout = seedChat(emptyLayout(), 'roadmap', 0)
  layout = seedChat(layout, 'weekly', 1)
  layout = openTab(layout, MAIN_SURFACE, fileContent('README.md'))
  layout = withSurfaceSplit(layout, MAIN_SURFACE, 'row', README_ID)
  const childId = layout.surfaces.at(-1)?.id ?? ''
  expect(childId).not.toBe('')
  layout = activateTab(layout, MAIN_SURFACE, ROADMAP_ID)
  expect(surfaceOf(layout, MAIN_SURFACE)?.activeId).toBe(ROADMAP_ID)

  // ROADMAP_ID 是 A 的首项 → 搬走后活动位交给**右侧**的 WEEKLY_ID。
  const moved = dockWindow(layout, ROADMAP_ID, childId, 0)
  expect(surfaceOf(moved, MAIN_SURFACE)?.members).toEqual([WEEKLY_ID])
  expect(surfaceOf(moved, MAIN_SURFACE)?.activeId, '交给右侧邻居').toBe(WEEKLY_ID)
  expect(surfaceOf(moved, childId)?.members).toEqual([ROADMAP_ID, README_ID])
  expect(surfaceOf(moved, childId)?.activeId).toBe(ROADMAP_ID)
  expect(layoutViolations(moved)).toEqual([])

  // 末位没有右邻 → 交给**左侧**邻居:另起一份 A = [ROADMAP_ID, WEEKLY_ID],活动是末位的 WEEKLY_ID。
  let left = seedChat(emptyLayout(), 'roadmap', 0)
  left = seedChat(left, 'weekly', 1)
  left = openTab(left, MAIN_SURFACE, fileContent('README.md'))
  left = withSurfaceSplit(left, MAIN_SURFACE, 'row', README_ID)
  const leftChildId = left.surfaces.at(-1)?.id ?? ''
  left = activateTab(left, MAIN_SURFACE, WEEKLY_ID)
  const movedLeft = dockWindow(left, WEEKLY_ID, leftChildId, 1)
  expect(surfaceOf(movedLeft, MAIN_SURFACE)?.activeId, '末位 → 交给左侧邻居').toBe(ROADMAP_ID)
  expect(surfaceOf(movedLeft, leftChildId)?.members).toEqual([README_ID, WEEKLY_ID])
  expect(layoutViolations(movedLeft)).toEqual([])
})

test('dockWindow:窗体已在目标区域里(同区域重排)→ 只改下标并激活,不产生重复成员', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  const moved = dockWindow(layout, README_ID, MAIN_SURFACE, 1)
  expect(surfaceOf(moved, MAIN_SURFACE)?.members, '成员仍只有两份').toEqual([PROGRESS_ID, README_ID])
  expect(surfaceOf(moved, MAIN_SURFACE)?.activeId).toBe(README_ID)
  expect(layoutViolations(moved)).toEqual([])
})

test('dockWindow:被隐藏(关过 tab)的窗体重新停靠会恢复可见', () => {
  let layout = seedChat(emptyLayout(), 'weekly', 0)
  layout = closeTab(layout, MAIN_SURFACE, WEEKLY_ID)
  expect(layout.windows.find((win) => win.id === WEEKLY_ID)?.visible, '关掉 = 隐藏').toBe(false)
  const docked = dockWindow(layout, WEEKLY_ID, MAIN_SURFACE, 0)
  expect(chatMemberIds(docked, MAIN_SURFACE), '重新回到条上').toEqual([WEEKLY_ID])
  expect(docked.windows.find((win) => win.id === WEEKLY_ID)?.visible, '恢复可见').toBe(true)
  expect(docked.windows.find((win) => win.id === WEEKLY_ID)?.placement).toBe('docked')
  expect(surfaceOf(docked, MAIN_SURFACE)?.activeId).toBe(WEEKLY_ID)
  expect(layoutViolations(docked)).toEqual([])
})

// 向下拖出 tab 的落点是 floatWindow(见 workspace.spec 的手势用例)。这里断言它的**纯操作**性质:
// 拆出后条上少一项、多一个 floating 窗体,不变量恒为空;且原布局对象**未被改动** ——
// 「松手前都可逆」的撤销正是把这一份原样写回(所有操作都不可变)。
test('向下拖出:floatWindow 摘掉条上的成员并交出 floating 窗体,原布局对象不被改动(撤销即原样写回)', () => {
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  const membersBefore = [...(layout.surfaces[0]?.members ?? [])]

  // 拆出**非活动**的那个 tab(活动的是后开的 PROGRESS_ID)。
  const floated = floatWindow(layout, README_ID, { x: 300, y: 400, width: 0, height: 0 })
  expect(memberWindows(floated, MAIN_SURFACE).map((win) => win.id), '条上少一项').toEqual([PROGRESS_ID])
  expect(isMember(floated, MAIN_SURFACE, README_ID)).toBe(false)
  const win = floated.windows.find((item) => item.id === README_ID)
  expect(win?.placement, '内容成了悬浮窗体').toBe('floating')
  expect(win?.visible).toBe(true)
  expect(win?.rect).toEqual({ x: 300, y: 400, width: 0, height: 0 })
  expect(layoutViolations(floated), '不变量恒为空').toEqual([])

  // 原布局对象一个字段都没动 —— 撤销 = 把它原样写回。
  expect(layout.surfaces[0]?.members, '原对象的成员顺序原样').toEqual(membersBefore)
  expect(layout.windows.find((item) => item.id === README_ID)?.placement).toBe('docked')
  expect(layout.focus).toBe(PROGRESS_ID)
  expect(layoutViolations(layout)).toEqual([])
})

test('openFloating:新建悬浮窗体不占 tab(不进任何 members),可见 / 置顶 / 聚焦 / 记入 recent', () => {
  const layout = openFloating(emptyLayout(), fileContent('README.md'), { x: 0, y: 0, width: 0, height: 0 })
  const win = layout.windows[0]
  expect(win?.id).toBe(README_ID)
  expect(win?.placement).toBe('floating')
  expect(win?.view).toBe('normal')
  expect(win?.visible).toBe(true)
  expect(win?.rect).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  // **不占 tab**:id 不出现在任何区域的 members 里(不变量④)。
  expect(isMember(layout, MAIN_SURFACE, README_ID)).toBe(false)
  expect(layout.surfaces[0]?.members).toEqual([])
  expect(layout.surfaces[0]?.activeId).toBe('')
  expect(layout.focus).toBe(README_ID)
  expect(layout.recent).toEqual([README_ID])
  expect(layoutViolations(layout)).toEqual([])
})

test('openFloating:已有同 id 窗体则复用(不新建重复窗),并把停靠 / 隐藏的它转为悬浮', () => {
  // 停靠工况:先 openTab(成员 + 可见 + 激活),并给它记一个「上次悬浮矩形」。
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  // 再停靠一个**邻居**并把 README_ID 置为活动 —— 用来验证 README_ID 被摘走时,腾出的活动位是
  // **交给相邻成员**(与 floatWindow / closeTab 同规则),而不是清空。
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  layout = activateTab(layout, MAIN_SURFACE, README_ID)
  layout = setWindowRect(layout, README_ID, { x: 11, y: 22, width: 300, height: 200 })
  const before = layout.windows.length
  layout = openFloating(layout, fileContent('README.md'), { x: 0, y: 0, width: 0, height: 0 })
  expect(layout.windows, '复用同一窗体,不新增').toHaveLength(before)
  const win = layout.windows.find((item) => item.id === README_ID)
  expect(win?.placement).toBe('floating')
  expect(win?.visible).toBe(true)
  // **已有窗体保留其记忆的矩形** —— 这是「还原悬浮时回到上次悬浮 rect」的前提。
  expect(win?.rect, '已有窗体不覆盖其记忆的矩形').toEqual({ x: 11, y: 22, width: 300, height: 200 })
  // 从所有区域的成员里摘掉,并把腾出的活动位交给相邻成员(不变量①)。
  expect(isMember(layout, MAIN_SURFACE, README_ID)).toBe(false)
  expect(layout.surfaces[0]?.activeId, '活动位交给相邻成员').toBe(PROGRESS_ID)
  expect(layout.focus).toBe(README_ID)
  expect(layoutViolations(layout)).toEqual([])

  // 已悬浮工况:重复调用不产生第二个窗体,矩形同样原样保留。
  const again = openFloating(layout, fileContent('README.md'), { x: 99, y: 99, width: 111, height: 111 })
  expect(again.windows, '仍只有 README_ID 与 PROGRESS_ID 两个窗体').toHaveLength(2)
  expect(again.windows.find((item) => item.id === README_ID)?.rect).toEqual({ x: 11, y: 22, width: 300, height: 200 })
  expect(layoutViolations(again)).toEqual([])
})

test('blurSurface:清空 activeId(文件让位),成员与窗体原样不动', () => {
  const layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  expect(layout.surfaces[0]?.activeId).toBe(README_ID)
  const blurred = blurSurface(layout, MAIN_SURFACE)
  expect(blurred.surfaces[0]?.activeId).toBe('')
  // tab 仍在条上(成员不变)、窗体仍在(几何 / 归属都不动)。
  expect(blurred.surfaces[0]?.members).toEqual([README_ID])
  expect(blurred.windows).toEqual(layout.windows)
  expect(layoutViolations(blurred)).toEqual([])
  // 幂等:已为空时原样返回。
  expect(blurSurface(blurred, MAIN_SURFACE)).toEqual(blurred)
})

test('activateTab:焦点已在它身上但区域 activeId 已被清空时,仍要把它放回内容区', () => {
  // 场景:文件停靠并激活 → 选中对话把 activeId 清空(焦点仍留在该文件窗)→ 再点回它的 tab。
  const docked = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  const blurred = blurSurface(docked, MAIN_SURFACE)
  expect(blurred.focus).toBe(README_ID)
  const reactivated = activateTab(blurred, MAIN_SURFACE, README_ID)
  expect(reactivated.surfaces[0]?.activeId, 'activeId 被恢复').toBe(README_ID)
  expect(layoutViolations(reactivated)).toEqual([])
  // 已是「焦点 = 它、activeId = 它」时仍然原样返回(早退保留)。
  expect(activateTab(reactivated, MAIN_SURFACE, README_ID)).toEqual(reactivated)
})

test('不变量守卫:构造出的违规都被 layoutViolations 抓到', () => {  const base = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))

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
      { id: 'other', parentId: MAIN_SURFACE, axis: 'column', weight: 1, members: [README_ID], activeId: '' },
    ],
  }
  expect(layoutViolations(badOwners).some((item) => item.includes('同时属于'))).toBe(true)
})

// ============================================================================
// 单元 C1:对话也是窗体 —— 与文件走同一条窗体机制
// ============================================================================

// 把一个会话补成区域成员并激活(页面装载时的「补一个成员」规则)。
// 入参是**裸会话 id**,内部用 chatContent 补出项目维度(窗体身份是复合键)。
function seedChat(layout: WorkspaceLayout, sessionId: string, index: number): WorkspaceLayout {
  const content = chatContent(sessionId)
  return activateTab(seedChatWindow(layout, MAIN_SURFACE, content, index), MAIN_SURFACE, windowIdOf(content))
}

test('seedChatWindow:为会话补一个停靠成员,已有窗体(关闭 / 悬浮过)则原样返回', () => {
  const layout = seedChatWindow(emptyLayout(), MAIN_SURFACE, chatContent('weekly'), 0)
  expect(windowIdOf(chatContent('weekly')), '对话窗体 id = 复合键 chat://<项目>/<会话>').toBe(WEEKLY_ID)
  // 它是一个**停靠**窗体,且成了区域成员(= 条上的一项)。
  const win = layout.windows.find((item) => item.id === WEEKLY_ID)
  expect(win?.placement).toBe('docked')
  expect(win?.content).toEqual(chatContent('weekly'))
  expect(chatMemberIds(layout, MAIN_SURFACE)).toEqual([WEEKLY_ID])
  // 补齐只是补成员,不抢焦点。
  expect(layout.surfaces[0]?.activeId).toBe('')
  expect(layout.focus).toBe('')
  expect(layoutViolations(layout)).toEqual([])

  // 插到指定下标:已有的成员相对顺序保留(new 在中间)。
  let two = seedChatWindow(layout, MAIN_SURFACE, chatContent('roadmap'), 0)
  expect(chatMemberIds(two, MAIN_SURFACE)).toEqual([ROADMAP_ID, WEEKLY_ID])
  two = seedChatWindow(two, MAIN_SURFACE, chatContent('incident'), 1)
  expect(chatMemberIds(two, MAIN_SURFACE), '插在下标处').toEqual([ROADMAP_ID, INCIDENT_ID, WEEKLY_ID])

  // 已有窗体(哪怕已经关闭 = 隐藏、或已拆出 = 悬浮)一律原样返回 —— 不能把已关闭的会话
  // 重新拉回条上,也不能把悬浮的窗体重新塞进 members(不变量④)。
  const closed = closeTab(two, MAIN_SURFACE, ROADMAP_ID)
  expect(seedChatWindow(closed, MAIN_SURFACE, chatContent('roadmap'), 0), '已关闭的会话不复活').toEqual(closed)
  const floated = floatWindow(two, ROADMAP_ID, { x: 1, y: 2, width: 0, height: 0 })
  const seeded = seedChatWindow(floated, MAIN_SURFACE, chatContent('roadmap'), 0)
  expect(isMember(seeded, MAIN_SURFACE, ROADMAP_ID), '悬浮的会话不被塞回 members').toBe(false)
  expect(layoutViolations(seeded)).toEqual([])
})

test('对话成员与文件成员各自成序:reorderChatMembers / reorderFileMembers 互不串扰', () => {
  // 先对话、后文件地建一条混合的条。
  let layout = emptyLayout()
  layout = seedChat(layout, 'weekly', 0)
  layout = seedChat(layout, 'roadmap', 1)
  layout = openTab(layout, MAIN_SURFACE, fileContent('README.md'))
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  expect(chatMemberIds(layout, MAIN_SURFACE)).toEqual([WEEKLY_ID, ROADMAP_ID])
  expect(fileMemberIds(layout, MAIN_SURFACE)).toEqual([README_ID, PROGRESS_ID])

  // 重排对话:只动对话的相对顺序,文件成员原样保留。
  const chatsReordered = reorderChatMembers(layout, MAIN_SURFACE, [ROADMAP_ID, WEEKLY_ID])
  expect(chatMemberIds(chatsReordered, MAIN_SURFACE), '对话顺序按给定顺序').toEqual([ROADMAP_ID, WEEKLY_ID])
  expect(fileMemberIds(chatsReordered, MAIN_SURFACE), '文件成员顺序不受对话重排影响').toEqual([README_ID, PROGRESS_ID])
  expect(layoutViolations(chatsReordered)).toEqual([])

  // 重排文件:只动文件的相对顺序,对话原样保留(条上「先对话、后文件」的次序稳定)。
  const filesReordered = reorderFileMembers(layout, MAIN_SURFACE, [PROGRESS_ID, README_ID])
  expect(fileMemberIds(filesReordered, MAIN_SURFACE)).toEqual([PROGRESS_ID, README_ID])
  expect(chatMemberIds(filesReordered, MAIN_SURFACE), '对话成员顺序不受文件重排影响').toEqual([WEEKLY_ID, ROADMAP_ID])
  expect(layoutViolations(filesReordered)).toEqual([])
  // 未提到的成员被丢弃(与 reorderTabs 一致),但**只丢自己那一种**。
  expect(chatMemberIds(reorderChatMembers(layout, MAIN_SURFACE, [ROADMAP_ID]), MAIN_SURFACE)).toEqual([ROADMAP_ID])
  expect(fileMemberIds(reorderChatMembers(layout, MAIN_SURFACE, [ROADMAP_ID]), MAIN_SURFACE)).toEqual([README_ID, PROGRESS_ID])
})

test('对话的拆出 / 停靠:与文件同一套 floatWindow / dockWindow,成员与 placement 始终自洽', () => {
  let layout = seedChat(emptyLayout(), 'weekly', 0)
  layout = seedChat(layout, 'roadmap', 1)
  expect(layout.surfaces[0]?.activeId).toBe(ROADMAP_ID)

  // 向下拖出 = floatWindow:从成员里摘掉、交出 floating 窗体、腾出的活动位交给相邻成员。
  const floated = floatWindow(layout, ROADMAP_ID, { x: 300, y: 400, width: 0, height: 0 })
  expect(chatMemberIds(floated, MAIN_SURFACE), '条上少一项').toEqual([WEEKLY_ID])
  const floating = floated.windows.find((item) => item.id === ROADMAP_ID)
  expect(floating?.placement).toBe('floating')
  expect(floating?.visible).toBe(true)
  // 腾出的活动位交给相邻成员(与 closeTab / buildSplit 同规则):ROADMAP_ID 是末位 → 交给左侧的 WEEKLY_ID。
  expect(floated.surfaces[0]?.activeId, '腾出的活动位交给相邻成员').toBe(WEEKLY_ID)
  expect(layoutViolations(floated), '不变量恒为空').toEqual([])
  // 原布局对象未被改动 —— 「松手前都可逆」的撤销即把它原样写回。
  expect(chatMemberIds(layout, MAIN_SURFACE)).toEqual([WEEKLY_ID, ROADMAP_ID])
  expect(layout.windows.find((item) => item.id === ROADMAP_ID)?.placement).toBe('docked')

  // 拖回条上 = dockWindow:插回成员、置为停靠可见并激活。
  const docked = dockWindow(floated, ROADMAP_ID, MAIN_SURFACE, 0)
  expect(chatMemberIds(docked, MAIN_SURFACE), '插回条上').toEqual([ROADMAP_ID, WEEKLY_ID])
  expect(docked.windows.find((item) => item.id === ROADMAP_ID)?.placement).toBe('docked')
  expect(docked.windows.find((item) => item.id === ROADMAP_ID)?.visible).toBe(true)
  expect(docked.surfaces[0]?.activeId).toBe(ROADMAP_ID)
  expect(layoutViolations(docked)).toEqual([])
})

test('对话与文件同域混装:一条不变量序列下 layoutViolations 恒为空', () => {
  // 建:两个对话 + 两个文件;拆出一个对话;关掉一个文件;再停靠回对话。
  let layout = seedChat(emptyLayout(), 'weekly', 0)
  layout = seedChat(layout, 'roadmap', 1)
  layout = openTab(layout, MAIN_SURFACE, fileContent('README.md'))
  layout = openTab(layout, MAIN_SURFACE, fileContent('progress.csv'))
  expect(layoutViolations(layout)).toEqual([])
  layout = floatWindow(layout, WEEKLY_ID, { x: 10, y: 10, width: 200, height: 200 })
  expect(layoutViolations(layout)).toEqual([])
  layout = closeTab(layout, MAIN_SURFACE, README_ID)
  expect(layoutViolations(layout)).toEqual([])
  layout = dockWindow(layout, WEEKLY_ID, MAIN_SURFACE, 0)
  expect(layoutViolations(layout)).toEqual([])
  expect(chatMemberIds(layout, MAIN_SURFACE), '对话与文件的成员互不串位').toEqual([WEEKLY_ID, ROADMAP_ID])
  expect(fileMemberIds(layout, MAIN_SURFACE)).toEqual([PROGRESS_ID])
})

// ============================================================================
// 遮挡判定:显示一个**停靠**窗体前,让几何上挡住目标区域显示区的悬浮窗体让位
// (根因:两层结构下停靠窗体抬不过浮层,只能让浮层让位)。
// ============================================================================

test('floatingWindowsIntersecting:相交 / 不相交 / 边贴边(面积 0)/ 已隐藏 / docked 一律按规则取舍', () => {
  // 布局:README_ID **停靠**在区域里(不该被返回),另开三个文件为悬浮窗体。
  let layout = openTab(emptyLayout(), MAIN_SURFACE, fileContent('README.md'))
  // 三个悬浮文件的**复合窗体键**(与它们的内容一一对应)。
  const OVERLAP = fileWindowId(PROJECT, 'overlap.md')
  const OUTSIDE = fileWindowId(PROJECT, 'outside.md')
  const TOUCHING = fileWindowId(PROJECT, 'touching.md')
  for (const path of ['overlap.md', 'outside.md', 'touching.md']) {
    layout = openFloating(layout, fileContent(path), { x: 0, y: 0, width: 0, height: 0 })
  }
  const box: WindowRect = { x: 100, y: 100, width: 200, height: 200 }
  const rects: Record<string, WindowRect> = {
    // README_ID 的实测矩与 box 完全重合 —— 但它是 docked,永不被返回。
    [README_ID]: { x: 100, y: 100, width: 200, height: 200 },
    [OVERLAP]: { x: 250, y: 250, width: 100, height: 100 }, // 与 box 交叠 50×50
    [OUTSIDE]: { x: 500, y: 500, width: 40, height: 40 }, // 完全在外
    [TOUCHING]: { x: 300, y: 100, width: 100, height: 100 }, // 左缘贴 box 右缘 → 面积 0
  }
  const rectOf = (id: string): WindowRect | null => rects[id] ?? null

  expect(floatingWindowsIntersecting(layout, box, rectOf), '只返回相交的**可见悬浮**窗体').toEqual([OVERLAP])
  // 量不到几何的窗体(未渲染)不计入。
  expect(floatingWindowsIntersecting(layout, box, () => null), '量不到几何 → 不计入').toEqual([])
  // 已隐藏的浮窗不在渲染中,同样不算(它可能仍留着记忆的几何)。
  expect(floatingWindowsIntersecting(hideWindow(layout, OVERLAP), box, rectOf), '已隐藏的浮窗不算').toEqual([])

  // rectsIntersect 的边界语义:边贴边(面积 0)不算相交。
  expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }), '边贴边不算').toBe(false)
  expect(rectsIntersect({ x: 0, y: 0, width: 11, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }), '有一点重叠就算').toBe(true)
})

test('hideWindows:逐窗复用 hideWindow 的语义,只置 visible,原布局不被改动', () => {
  let layout = openFloating(emptyLayout(), fileContent('README.md'), { x: 11, y: 22, width: 300, height: 200 })
  layout = openFloating(layout, fileContent('progress.csv'), { x: 5, y: 6, width: 320, height: 210 })
  const hidden = hideWindows(layout, [README_ID, PROGRESS_ID])

  expect(visibleWindows(hidden), '都收起了').toEqual([])
  expect(hidden.focus, '焦点落在被收起的窗上 → 清空').toBe('')
  // 只改 visible:几何 / 归属 / 内容一个不动(故重开即原样)。
  const win = hidden.windows.find((item) => item.id === README_ID)
  expect(win?.placement).toBe('floating')
  expect(win?.rect).toEqual({ x: 11, y: 22, width: 300, height: 200 })
  expect(layoutViolations(hidden), '不变量恒为空').toEqual([])
  // 原布局对象未被改动 —— 收起只返回新布局(与其它操作同一条不可变纪律)。
  expect(visibleWindows(layout)).toHaveLength(2)
  expect(layoutViolations(layout)).toEqual([])
  // 空 ids 原样返回(不再造新对象)。
  expect(hideWindows(layout, [])).toBe(layout)
})


// 最小化记录与区域成员是两份不同语义：前者控制投影，后者保留原位与顺序。
function minimizedFixture(): WorkspaceLayout {
  const first = openTab(emptyLayout(), MAIN_SURFACE, chatContent('weekly'))
  const second = openTab(first, MAIN_SURFACE, fileContent('README.md'))
  const third = openTab(second, MAIN_SURFACE, { kind: 'chat', projectId: 'knowledge-base', sessionId: 'other' })
  const active = activateTab(third, MAIN_SURFACE, WEEKLY_ID)
  return minimizeGroup(active, { surfaceId: MAIN_SURFACE, projectId: PROJECT, name: PROJECT, memberIds: [WEEKLY_ID, README_ID], lastActiveId: WEEKLY_ID })
}

test('最小化纯操作:保留成员与顺序、过滤可见集合、组外相邻项接管', () => {
  const layout = minimizedFixture()
  expect(layout.surfaces[0]?.members).toEqual([WEEKLY_ID, README_ID, 'chat://knowledge-base/other'])
  expect(layout.surfaces[0]?.activeId).toBe('chat://knowledge-base/other')
  expect(layout.focus).toBe('chat://knowledge-base/other')
  expect(visibleMemberIds(layout, MAIN_SURFACE)).toEqual(['chat://knowledge-base/other'])
  expect(visibleMemberWindows(layout, MAIN_SURFACE).map((win) => win.id)).toEqual(['chat://knowledge-base/other'])
  expect(visibleWindows(layout).map((win) => win.id)).toEqual(['chat://knowledge-base/other'])
  expect(isMinimizedWindow(layout, WEEKLY_ID)).toBe(true)
  expect(minimizedGroupsOf(layout)).toHaveLength(1)
  expect(groupOfWindow(layout, README_ID)?.id).toBe('group:main:weekly-report')
  expect(layoutViolations(layout)).toEqual([])
  const restored = restoreGroup(layout, 'group:main:weekly-report')
  expect(restored.groups).toEqual([])
  expect(restored.surfaces[0]?.members).toEqual(layout.surfaces[0]?.members)
  expect(restored.surfaces[0]?.activeId).toBe(WEEKLY_ID)
  expect(restored.focus).toBe(WEEKLY_ID)
  expect(layoutViolations(restored)).toEqual([])
})

test('最小化纯操作:同区域同项目重复最小化更新已有组、全部收起时无活动项', () => {
  const layout = minimizedFixture()
  const next = openTab(layout, MAIN_SURFACE, chatContent('roadmap'))
  const minimized = minimizeGroup(next, { surfaceId: MAIN_SURFACE, projectId: PROJECT, name: PROJECT, memberIds: [ROADMAP_ID], lastActiveId: ROADMAP_ID })
  expect(minimized.groups).toHaveLength(1)
  expect(minimized.groups[0]?.memberIds).toEqual([WEEKLY_ID, README_ID, ROADMAP_ID])
  const closedOther = closeTab(minimized, MAIN_SURFACE, 'chat://knowledge-base/other')
  expect(closedOther.surfaces[0]?.activeId).toBe('')
  expect(layoutViolations(closedOther)).toEqual([])
  expect(restoreGroup(closedOther, 'group:main:weekly-report').focus).toBe(ROADMAP_ID)
})

test('最小化纯操作:关闭组不是恢复；窗体隐藏且从成员移出', () => {
  const closed = closeGroup(minimizedFixture(), 'group:main:weekly-report')
  expect(closed.groups).toEqual([])
  expect(closed.surfaces[0]?.members).toEqual(['chat://knowledge-base/other'])
  expect(closed.windows.find((win) => win.id === README_ID)?.visible).toBe(false)
  expect(closed.windows.find((win) => win.id === WEEKLY_ID)?.visible).toBe(false)
  expect(layoutViolations(closed)).toEqual([])
})

test('最小化纯操作:关闭、停靠、浮动、删除单个窗体时摘除组引用，空组移除', () => {
  const layout = minimizedFixture()
  const closed = closeTab(layout, MAIN_SURFACE, WEEKLY_ID)
  expect(closed.groups[0]?.memberIds).toEqual([README_ID])
  expect(closed.groups[0]?.lastActiveId).toBe('')
  const floating = floatWindow(layout, WEEKLY_ID, { x: 0, y: 0, width: 320, height: 200 })
  const docked = dockWindow(layout, WEEKLY_ID, MAIN_SURFACE, 0)
  const dropped = dropWindows(layout, [WEEKLY_ID])
  const opened = openFloating(layout, chatContent('weekly'), { x: 0, y: 0, width: 320, height: 200 })
  for (const next of [closed, floating, docked, dropped, opened]) {
    expect(next.groups[0]?.memberIds).toEqual([README_ID])
    expect(layoutViolations(next)).toEqual([])
  }
  expect(dropWindows(layout, [WEEKLY_ID, README_ID]).groups).toEqual([])
})

test('最小化纯操作:区域删除时组解散；来源丢失时恢复到根区域', () => {
  const base = openTab(openTab(emptyLayout(), MAIN_SURFACE, chatContent('weekly')), MAIN_SURFACE, fileContent('README.md'))
  const split = withSurfaceSplit(base, MAIN_SURFACE, 'row', README_ID)
  const child = split.surfaces.at(-1)
  if (child === undefined) throw new Error('Missing child surface')
  const minimized = minimizeGroup(split, { surfaceId: child.id, projectId: PROJECT, name: PROJECT, memberIds: [README_ID], lastActiveId: README_ID })
  const removed = removeSurface(minimized, child.id)
  expect(removed.groups).toEqual([])
  expect(visibleMemberIds(removed, MAIN_SURFACE)).toContain(README_ID)
  expect(layoutViolations(removed)).toEqual([])
  const orphan: WorkspaceLayout = { ...minimized, surfaces: minimized.surfaces.filter((surface) => surface.id !== child.id) }
  const recovered = restoreGroup(orphan, `group:${child.id}:${PROJECT}`)
  expect(recovered.groups).toEqual([])
  expect(recovered.surfaces[0]?.members).toContain(README_ID)
  expect(recovered.focus).toBe(README_ID)
  expect(layoutViolations(recovered)).toEqual([])
})

test('最小化纯操作:组内最后活动项、重复归组与不存在的停靠成员均被不变量拒绝', () => {
  const layout = minimizedFixture()
  const group = layout.groups[0]
  if (group === undefined) throw new Error('Missing minimized group')
  expect(layoutViolations({ ...layout, groups: [{ ...group, surfaceId: 'missing' }] })).not.toEqual([])
  expect(layoutViolations({ ...layout, groups: [{ ...group, lastActiveId: 'missing' }] })).not.toEqual([])
  expect(layoutViolations({ ...layout, groups: [group, { ...group, id: 'duplicate' }] })).not.toEqual([])
  expect(layoutViolations({ ...layout, groups: [{ ...group, memberIds: ['missing'], lastActiveId: '' }] })).not.toEqual([])
})

test('最小化纯操作:重排可见成员不丢弃最小化成员或改变其相对顺序', () => {
  const layout = openTab(openTab(minimizedFixture(), MAIN_SURFACE, chatContent('roadmap')), MAIN_SURFACE, chatContent('incident'))
  const reordered = reorderChatMembers(layout, MAIN_SURFACE, [INCIDENT_ID, ROADMAP_ID, 'chat://knowledge-base/other'])
  expect(reordered.surfaces[0]?.members).toContain(WEEKLY_ID)
  expect(reordered.surfaces[0]?.members).toContain(README_ID)
  expect(reordered.groups).toEqual(layout.groups)
  expect(layoutViolations(reordered)).toEqual([])
})
