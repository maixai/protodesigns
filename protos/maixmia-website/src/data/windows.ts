// 工作台窗体布局的模型与纯操作(视图状态,不进契约的只有「布局本身」;其形状来自契约生成物)。
//
// 心智模型(与 VS Code / IntelliJ 一致):
//   · **区域(surface)是容器,tab 组属于区域,不属于窗体** —— 一块区域持有它那串成员窗体的 id(即它的 tab 条);
//   · **窗体**只持有「几何 + 归属 + 内容引用」,不持有 tab 列表;
//   · 窗体的内容是**通用**的(判别联合),不得假设它一定是文件;
//   · 浮动窗口(popout)不属于任何区域。
//
// 整层窗体的前后顺序**由数组顺序表达**(靠后者在上),不用自增 z —— 自增在多区域下语义会崩,
// 且本仓层级只有 4 档 token,就地写数值违反「禁止 magic number」。渲染层据此按数组顺序出 DOM,
// 全层共用 --dl-z-overlay,谁压谁由 DOM 顺序决定。
//
// 所有数据结构都来自契约生成物(src/contracts/generated/),此处不手写。
// 布局按 (Agent, 项目) 分域保存(刷新即重置):切域时旧域原样留着,切回来即恢复。

import type { AgentId } from '../contracts/generated/chat-session'
import type { FileContent, FileLine } from '../contracts/generated/file-content'
import type { Surface } from '../contracts/generated/surface'
import type { WindowContent } from '../contracts/generated/window-content'
import type { WorkspaceLayout } from '../contracts/generated/workspace-layout'
import type { WindowRect, WorkspaceWindow } from '../contracts/generated/workspace-window'

// ---- 文件面板的异步四态(判别联合,与契约的 TranscriptState 同构)----
export type FilePanelState =
  | { status: 'loading' }
  | { status: 'ready'; content: FileContent }
  | { status: 'empty' }
  | { status: 'error' }

// ---- 分域 ----
// 键 = (Agent, 项目) 对:tab 表示的对话或文件只能属于被选中的 Agent 与被选中的项目,
// 于是「区域成员 / 窗体几何 / 最近打开」都按这一对分域保存,条上不会混装两个项目的东西。
export function fileDomainKey(agentId: AgentId, projectId: string): string {
  return `${agentId}::${projectId}`
}

// 所有域拼成的整张表(键 = fileDomainKey)。
export type WorkspaceMap = Record<string, WorkspaceLayout>

// 本单元唯一的根区域 id。多区域演进时这里会变成动态生成。
export const MAIN_SURFACE = 'main'

// 一份空布局:含唯一的根区域(无成员、无激活)。
export function emptyLayout(): WorkspaceLayout {
  return {
    surfaces: [{ id: MAIN_SURFACE, parentId: null, axis: 'row', weight: 1, members: [], activeId: '' }],
    windows: [],
    focus: '',
    recent: [],
  }
}

export function emptyWorkspace(): WorkspaceMap {
  return {}
}

// 取某个域的当前布局;该域还没被碰过时返回一份空布局(**不写入** —— 读不该产生副作用)。
export function layoutOf(workspace: WorkspaceMap, key: string): WorkspaceLayout {
  return workspace[key] ?? emptyLayout()
}

// 不可变地写回某个域。
export function withLayout(workspace: WorkspaceMap, key: string, layout: WorkspaceLayout): WorkspaceMap {
  return { ...workspace, [key]: layout }
}

// ---- 区域与窗体:查询 ----

// 取某个区域。
export function surfaceOf(layout: WorkspaceLayout, surfaceId: string): Surface | undefined {
  return layout.surfaces.find((surface) => surface.id === surfaceId)
}

// 窗体所属的区域;浮窗不属于任何区域(返回 undefined)。
export function surfaceOwning(layout: WorkspaceLayout, windowId: string): Surface | undefined {
  return layout.surfaces.find((surface) => surface.members.includes(windowId))
}

// 区域成员对应的窗体(按 tab 顺序;找不到对应窗体的成员被略过)。
export function memberWindows(layout: WorkspaceLayout, surfaceId: string): WorkspaceWindow[] {
  const surface = surfaceOf(layout, surfaceId)
  if (surface === undefined) return []
  return surface.members.flatMap((id) => {
    const win = layout.windows.find((item) => item.id === id)
    return win === undefined ? [] : [win]
  })
}

// 可见窗体(**数组顺序 = 层序**,靠后者在上)。
export function visibleWindows(layout: WorkspaceLayout): WorkspaceWindow[] {
  return layout.windows.filter((win) => win.visible)
}

// 当前聚焦的窗体:焦点窗可见则取它,否则取最上层(数组末位)的可见窗体;都没有则 undefined。
export function focusedWindow(layout: WorkspaceLayout): WorkspaceWindow | undefined {
  const focused = layout.windows.find((win) => win.id === layout.focus && win.visible)
  if (focused !== undefined) return focused
  return visibleWindows(layout).at(-1)
}

// 某窗体是否是某区域的成员。
export function isMember(layout: WorkspaceLayout, surfaceId: string, windowId: string): boolean {
  return surfaceOf(layout, surfaceId)?.members.includes(windowId) ?? false
}

// ---- 内容与命名 ----

// 窗体 id:由内容唯一决定(文件取路径,对话取会话 id),故同一内容重复打开只复用同一个窗体。
export function windowIdOf(content: WindowContent): string {
  return content.kind === 'file' ? content.path : content.sessionId
}

// 文件窗体的路径;非文件窗体为空串(展示层据此决定是否渲染文件信息)。
export function windowPath(win: WorkspaceWindow): string {
  return win.content.kind === 'file' ? win.content.path : ''
}

// 文件 tab 的视图投影:从窗体内容取出文件那一支。组件只读它需要的字段,不重复定义数据结构。
export type FileTab = Extract<WindowContent, { kind: 'file' }>

// 对话 tab 的视图投影:与 FileTab 同构,组件的 tab 条据此渲染。
export type ChatTab = Extract<WindowContent, { kind: 'chat' }>

// tab / 活动窗口的唯一标识(对文件 tab 而言即其路径,对对话而言即其会话 id)。
export function fileTabKey(tab: FileTab): string {
  return windowIdOf(tab)
}

export function chatTabKey(tab: ChatTab): string {
  return windowIdOf(tab)
}

// 窗体是否是对话窗体(渲染层据此分流到对话窗体而不是文件面板)。判别联合收窄后返回其内容。
export function chatContentOf(win: WorkspaceWindow): ChatTab | null {
  return win.content.kind === 'chat' ? win.content : null
}

// 区域成员里的**对话** id(按成员顺序)—— 会话头 tab 条的唯一顺序来源。
export function chatMemberIds(layout: WorkspaceLayout, surfaceId: string): string[] {
  return memberWindows(layout, surfaceId).flatMap((win) => (win.content.kind === 'chat' ? [win.content.sessionId] : []))
}

// 区域成员里的**文件**路径(按成员顺序)—— 文件栏的唯一顺序来源。
export function fileMemberIds(layout: WorkspaceLayout, surfaceId: string): string[] {
  return memberWindows(layout, surfaceId).flatMap((win) => (win.content.kind === 'file' ? [win.content.path] : []))
}

// 展示名 = 路径末段。
export function fileBaseName(path: string): string {
  return path.split('/').at(-1) ?? path
}

// 该文件所在的目录(项目内相对路径);根目录下的文件返回空串。
export function fileDirName(path: string): string {
  return path.split('/').slice(0, -1).join('/')
}

// 把一份路径记入「最近打开」(按 id 去重、置顶、限量)。
const RECENT_LIMIT = 16

export function rememberRecent(recent: readonly string[], windowId: string): string[] {
  return [windowId, ...recent.filter((item) => item !== windowId)].slice(0, RECENT_LIMIT)
}

// ---- 布局操作(全部是**纯函数**:入参布局不变,返回新布局)----
//
// 所有操作都带 surfaceId —— 这是从单区域演进到多区域时唯一必须现在留的口子。
// 载体层只做「取当前域 → 调操作 → 写回」,不在别处复制这些规则。

// 新窗体的默认几何:按当前可见窗体的数量做级联偏移,避免完全重叠(窗口管理器的惯例)。
// 宽高留 0 = 「还没摆过位置」,由窗体组件按视口算真实默认几何。
const WINDOW_CASCADE_STEP = 28

function cascadeRect(layout: WorkspaceLayout): WindowRect {
  const openCount = visibleWindows(layout).length
  return { x: WINDOW_CASCADE_STEP * openCount, y: WINDOW_CASCADE_STEP * openCount, width: 0, height: 0 }
}

// 把某窗体抬到数组末尾 = 最上层(层序即数组顺序)。
function toTop(windows: readonly WorkspaceWindow[], windowId: string): WorkspaceWindow[] {
  const target = windows.find((win) => win.id === windowId)
  if (target === undefined) return [...windows]
  return [...windows.filter((win) => win.id !== windowId), target]
}

// 替换数组中同 id 的窗体(其余原样)。
function replaceWindow(windows: readonly WorkspaceWindow[], next: WorkspaceWindow): WorkspaceWindow[] {
  return windows.map((win) => (win.id === next.id ? next : win))
}

// 把某个区域替换成新的一份(其余区域原样)。
function replaceSurface(layout: WorkspaceLayout, surfaceId: string, patch: (surface: Surface) => Surface): WorkspaceLayout {
  return { ...layout, surfaces: layout.surfaces.map((surface) => (surface.id === surfaceId ? patch(surface) : surface)) }
}

// 该窗体是否已聚焦且已在最上层(数组末位)—— 无需变更时早退,避免无谓的重渲染。
function isFocusedOnTop(layout: WorkspaceLayout, windowId: string): boolean {
  return layout.focus === windowId && layout.windows.at(-1)?.id === windowId
}

// 打开一个窗体并激活:已在区域里则只激活(不新增、不重复建窗),否则追加到区域成员末尾。
// 已有窗体**按原样恢复**(几何 / 呈现都留着),只置为可见并置顶;从没有过则按级联默认几何。
// 返回新布局;窗体 id 可由 windowIdOf(content) 取得。
export function openTab(layout: WorkspaceLayout, surfaceId: string, content: WindowContent): WorkspaceLayout {
  if (surfaceOf(layout, surfaceId) === undefined) return layout
  const id = windowIdOf(content)
  const existing = layout.windows.find((win) => win.id === id)
  const win: WorkspaceWindow = existing === undefined
    ? { id, content, placement: 'docked', view: 'normal', visible: true, rect: cascadeRect(layout) }
    : { ...existing, content, visible: true }
  const base = existing === undefined ? [...layout.windows, win] : replaceWindow(layout.windows, win)
  return {
    ...replaceSurface(layout, surfaceId, (surface) => ({
      ...surface,
      members: surface.members.includes(id) ? surface.members : [...surface.members, id],
      activeId: id,
    })),
    windows: toTop(base, id),
    focus: id,
    recent: rememberRecent(layout.recent, id),
  }
}

// 关闭区域里的一个 tab(≠ 删除):从成员的 tab 条撤下并**隐藏其窗体**;窗体本身(几何 / 层序)
// 留着,故从「最近关闭」再点回来是原样。
export function closeTab(layout: WorkspaceLayout, surfaceId: string, windowId: string): WorkspaceLayout {
  const surface = surfaceOf(layout, surfaceId)
  if (surface === undefined) return layout
  const index = surface.members.indexOf(windowId)
  if (index < 0) return layout
  const neighborId = surface.members[index + 1] ?? surface.members[index - 1] ?? ''
  const nextActive = surface.activeId === windowId ? neighborId : surface.activeId
  const win = layout.windows.find((item) => item.id === windowId)
  return {
    ...replaceSurface(layout, surfaceId, (item) => ({
      ...item,
      members: item.members.filter((id) => id !== windowId),
      activeId: nextActive,
    })),
    windows: win === undefined ? layout.windows : replaceWindow(layout.windows, { ...win, visible: false }),
    focus: layout.focus === windowId ? '' : layout.focus,
  }
}

// 激活区域里的一个 tab:不可见 → 显示并置顶;可见但未激活该区域 → 置为活动并置顶;已是活动且已聚焦 → 不变。
// 早退条件必须**同时**满足「全局面板焦点是它」与「该区域的 activeId 是它」:两者可以不一致 ——
// 选中一个对话会把区域的 activeId 清空(文件让位),但面板焦点仍留在那个文件窗体上;
// 若只按焦点早退,再点回它的 tab 就永远不会把它放回内容区。
export function activateTab(layout: WorkspaceLayout, surfaceId: string, windowId: string): WorkspaceLayout {
  const surface = surfaceOf(layout, surfaceId)
  if (surface === undefined) return layout
  const win = layout.windows.find((item) => item.id === windowId)
  if (win === undefined) return layout
  if (!win.visible) return showWindow(layout, surfaceId, windowId)
  if (layout.focus === windowId && surface.activeId === windowId) return layout
  return {
    ...replaceSurface(layout, surfaceId, (item) => ({ ...item, activeId: windowId })),
    windows: toTop(layout.windows, windowId),
    focus: windowId,
  }
}

// 让区域**不再指向任何成员**:清空 activeId,即当前占据内容区的那个窗体让位(其 tab 仍留在成员里),
// 成员 / 几何 / 层序都不动。对话也是成员了,所以这不是「显示对话」的手段 —— 它表达的是
// 「这块区域此刻没有活动成员」。载体据此渲染**空位占位**(转录位的空态,不含输入坞)。
export function blurSurface(layout: WorkspaceLayout, surfaceId: string): WorkspaceLayout {
  const surface = surfaceOf(layout, surfaceId)
  if (surface === undefined || surface.activeId === '') return layout
  return replaceSurface(layout, surfaceId, (item) => ({ ...item, activeId: '' }))
}

// 让某窗体可见并置顶(被关闭过的窗体在这里恢复显示)。
function showWindow(layout: WorkspaceLayout, surfaceId: string, windowId: string): WorkspaceLayout {
  const existing = layout.windows.find((item) => item.id === windowId)
  if (existing === undefined) return layout
  return {
    ...replaceSurface(layout, surfaceId, (surface) => ({ ...surface, activeId: windowId })),
    windows: toTop(replaceWindow(layout.windows, { ...existing, visible: true }), windowId),
    focus: windowId,
  }
}

// 聚焦一个窗体(点它 / 在它里面交互都会来这):置顶 —— 与桌面窗口管理器的「点谁谁在上」一致。
// 浮窗不属于任何区域,无 activeId 可写(仍照常聚焦置顶)。
export function focusWindow(layout: WorkspaceLayout, windowId: string): WorkspaceLayout {
  if (layout.windows.find((win) => win.id === windowId) === undefined) return layout
  if (isFocusedOnTop(layout, windowId)) return layout
  const owner = surfaceOwning(layout, windowId)
  return {
    ...(owner === undefined ? layout : replaceSurface(layout, owner.id, (surface) => ({ ...surface, activeId: windowId }))),
    windows: toTop(layout.windows, windowId),
    focus: windowId,
  }
}

// 隐藏一个窗体(Esc / 窗口的关闭钮):不同于关标签 —— 标签留在条上,再点一次即恢复显示。
export function hideWindow(layout: WorkspaceLayout, windowId: string): WorkspaceLayout {
  const win = layout.windows.find((item) => item.id === windowId)
  if (win === undefined) return layout
  return {
    ...layout,
    windows: replaceWindow(layout.windows, { ...win, visible: false }),
    focus: layout.focus === windowId ? '' : layout.focus,
  }
}

// 某个窗体的几何落定 → 记进布局(关窗口 / 切域都不清几何;null = 回到默认几何)。
export function setWindowRect(layout: WorkspaceLayout, windowId: string, rect: WindowRect | null): WorkspaceLayout {
  const win = layout.windows.find((item) => item.id === windowId)
  if (win === undefined) return layout
  const next: WindowRect = rect ?? { x: 0, y: 0, width: 0, height: 0 }
  return { ...layout, windows: replaceWindow(layout.windows, { ...win, rect: next }) }
}

// 按给定顺序重排区域成员的 tab 条。顺序里没提到的成员**不保留**(与拖拽 / 键盘重排的调用方
// 传全量顺序一致;载体不依赖「漏传则补末尾」这种隐式兜底)。
export function reorderTabs(layout: WorkspaceLayout, surfaceId: string, order: readonly string[]): WorkspaceLayout {
  const surface = surfaceOf(layout, surfaceId)
  if (surface === undefined) return layout
  const members = new Set(surface.members)
  const next = order.filter((id) => members.has(id))
  return replaceSurface(layout, surfaceId, (item) => ({ ...item, members: next }))
}

// 按给定顺序重排区域里的**对话**成员;文件成员原相对顺序保留、排在对话之后 ——
// 条上「先对话、后文件」的次序因此稳定(两个 tab 组各自渲染,互不干扰成员数组里的交错)。
// 顺序里没提到的对话成员被丢弃(与 reorderTabs 一致:载体传全量顺序,不依赖隐式兜底)。
export function reorderChatMembers(layout: WorkspaceLayout, surfaceId: string, order: readonly string[]): WorkspaceLayout {
  const surface = surfaceOf(layout, surfaceId)
  if (surface === undefined) return layout
  const chatIds = new Set(chatMemberIds(layout, surfaceId))
  const files = surface.members.filter((id) => !chatIds.has(id))
  const next = [...order.filter((id) => chatIds.has(id)), ...files]
  return replaceSurface(layout, surfaceId, (item) => ({ ...item, members: next }))
}

// 按给定顺序重排区域里的**文件**成员;对话成员原相对顺序保留、排在文件之前(与
// reorderChatMembers 互为镜像,两处都保持「先对话、后文件」的稳定次序)。
export function reorderFileMembers(layout: WorkspaceLayout, surfaceId: string, order: readonly string[]): WorkspaceLayout {
  const surface = surfaceOf(layout, surfaceId)
  if (surface === undefined) return layout
  const fileIds = new Set(fileMemberIds(layout, surfaceId))
  const chats = surface.members.filter((id) => !fileIds.has(id))
  const next = [...chats, ...order.filter((id) => fileIds.has(id))]
  return replaceSurface(layout, surfaceId, (item) => ({ ...item, members: next }))
}

// 会话的**增量成员维护**(禁止每次渲染把「所有会话」重算成成员数组 —— 那会冲掉用户拖拽改过的顺序):
// 某个会话还没有窗体时,为它补一个**停靠**的对话窗体,并作为区域成员插到 index 处。
// 已有窗体则**原样返回** —— 已关闭的会话其窗体仍在(隐藏),不会被重新拉回条上;
// 已拆出为悬浮的会话同样是「有窗体」,不会被重新加进 members(不变量④)。
// 这里刻意不碰 focus / activeId:补成员是装载期的补齐,不该抢走用户当前的焦点。
export function seedChatWindow(layout: WorkspaceLayout, surfaceId: string, sessionId: string, index: number): WorkspaceLayout {
  if (layout.windows.some((win) => win.id === sessionId)) return layout
  const surface = surfaceOf(layout, surfaceId)
  if (surface === undefined) return layout
  const win: WorkspaceWindow = {
    id: sessionId,
    content: { kind: 'chat', sessionId },
    placement: 'docked',
    view: 'normal',
    visible: true,
    rect: { x: 0, y: 0, width: 0, height: 0 },
  }
  const at = Math.max(0, Math.min(index, surface.members.length))
  const members = [...surface.members.slice(0, at), sessionId, ...surface.members.slice(at)]
  return {
    ...replaceSurface(layout, surfaceId, (item) => ({ ...item, members })),
    windows: [...layout.windows, win],
  }
}

// ---- 浮动 / 停靠 ----

// 打开一个**悬浮**窗体:这是「单击文件树里的文件」的落点 —— 它**不占 tab**(id 不进任何区域的
// members),只作为浮层盖在界面上。已有同 id 窗体则复用并把它转为悬浮(不新建重复窗体):
// 无论它此前是隐藏的、还是正停靠在某个区域里,结果都是同一个悬浮窗体 —— 树中的一次点击
// 语义就是「把这个文件作为悬浮窗口拿上来」。
// 同时置为可见、置顶、聚焦,并记入「最近打开」。几何取调用方给的矩形(新建时为级联默认)。
export function openFloating(layout: WorkspaceLayout, content: WindowContent, rect: WindowRect): WorkspaceLayout {
  const id = windowIdOf(content)
  const existing = layout.windows.find((win) => win.id === id)
  const win: WorkspaceWindow = existing === undefined
    ? { id, content, placement: 'floating', view: 'normal', visible: true, rect }
    : { ...existing, content, placement: 'floating', view: 'normal', visible: true }
  const base = existing === undefined ? [...layout.windows, win] : replaceWindow(layout.windows, win)
  return {
    // 从**所有**区域的成员里摘掉:悬浮窗体不属于任何区域(不变量④)。它腾出的活动位交给
    // **相邻成员**(与 floatWindow / closeTab / buildSplit 同一条规则)—— 它此前正停靠在某块
    // 区域里并占据内容区时,那块区域不该因此空下来。它本来就不是任何区域的成员时,这条是空操作。
    surfaces: layout.surfaces.map((surface) => ({
      ...surface,
      members: surface.members.filter((item) => item !== id),
      activeId: surface.activeId === id ? neighborMember(surface.members, id) : surface.activeId,
    })),
    windows: toTop(base, id),
    focus: id,
    recent: rememberRecent(layout.recent, id),
  }
}

// docked → floating:把它从所有区域的成员里摘掉,并交出自有矩形。
// 同时把 view 归为 normal —— maximized × floating 互斥,脱离区域即失去被最大化的前提。
// **腾出的活动位交给相邻成员**(优先右侧、其次左侧,与 closeTab / buildSplit 同一条规则):
// 一段对话被拆出后,它原来占据的内容区不该空着 —— 交给旁边的成员,与「关掉一个 tab」同一语义。
export function floatWindow(layout: WorkspaceLayout, windowId: string, rect: WindowRect): WorkspaceLayout {
  const win = layout.windows.find((item) => item.id === windowId)
  if (win === undefined) return layout
  return {
    ...layout,
    surfaces: layout.surfaces.map((surface) => ({
      ...surface,
      members: surface.members.filter((id) => id !== windowId),
      activeId: surface.activeId === windowId ? neighborMember(surface.members, windowId) : surface.activeId,
    })),
    windows: replaceWindow(layout.windows, { ...win, placement: 'floating', view: 'normal', rect }),
    focus: layout.focus === windowId ? '' : layout.focus,
  }
}

// floating → docked:插到目标区域成员的指定下标处(越界则夹到合法范围),置为可见并激活它。
// 置可见是必要的:它可能正是从「最近关闭」复原回来的那一个(关闭只把 visible 置假)。
export function dockWindow(layout: WorkspaceLayout, windowId: string, surfaceId: string, index: number): WorkspaceLayout {
  const win = layout.windows.find((item) => item.id === windowId)
  const surface = surfaceOf(layout, surfaceId)
  if (win === undefined || surface === undefined) return layout
  const rest = surface.members.filter((id) => id !== windowId)
  const at = Math.max(0, Math.min(index, rest.length))
  const members = [...rest.slice(0, at), windowId, ...rest.slice(at)]
  return {
    ...replaceSurface(layout, surfaceId, (item) => ({ ...item, members, activeId: windowId })),
    windows: replaceWindow(layout.windows, { ...win, placement: 'docked', visible: true }),
    focus: windowId,
  }
}

// ---- 区域切分(区域树:扁平数组 + parentId 邻接表)----
//
// 契约刻意不递归表达区域(递归类型会被 json-schema 无限展开),故层级用 **扁平数组 + parentId**
// 表示。渲染层据此递归(组件递归没有类型上的限制),数据层只维护邻接关系。
//
// 心智模型(混合节点):一个区域**既是**一块内容区(它自己的 tab 组),**又可以**沿它的 `axis`
// 容纳若干子区域 —— 于是「把某个 tab 拖到区域右缘」= 给这个区域挂一个只含该 tab 的子区域,
// 原区域其余成员原地不动(与 VS Code 的 editor group 切分同向)。`axis` 表达**本区域排布子区域
// 的方向**(row 横排 / column 竖排),`weight` 表达**本区域相对其兄弟的占比**。

// 区域自身内容在一个切分容器里的权重。区域没有「自身权重」字段(`weight` 是它相对父区域的占比),
// 故取一个固定基数,与子区域的 weight 同量级。它只用于按比例分配空间,**绝对值无意义**。
// 取千位基数是为了让「按百分比调分隔线」有足够细的刻度:权重是整数,基数越小,
// 百分比回读的取整误差越大(基数 50 时调到 80% 会回读成 79%)。
export const OWN_WEIGHT = 1000
// 被切出的子区域的默认权重:与 OWN_WEIGHT 相等 → 首次切分即对半。
const SPLIT_WEIGHT = 1000
// 分隔线的百分比边界:任何一侧都不允许被拖到消失(下限 10% / 上限 90%)。
// 导出给渲染层绑 aria-valuemin / valuemax —— 边界只有这一处定义。
export const MIN_SEPARATOR_PERCENT = 10
export const MAX_SEPARATOR_PERCENT = 90

// 根区域:parentId 为 null 的那一个。
export function rootSurface(layout: WorkspaceLayout): Surface | undefined {
  return layout.surfaces.find((surface) => surface.parentId === null)
}

// 某区域的子区域,按数组顺序(= 排布顺序)。
export function childSurfaces(layout: WorkspaceLayout, surfaceId: string): Surface[] {
  return layout.surfaces.filter((surface) => surface.parentId === surfaceId)
}

// 生成一个未被占用的子区域 id(纯函数:只看当前布局,结果可预期、可复现)。
function nextSurfaceId(layout: WorkspaceLayout): string {
  const used = new Set(layout.surfaces.map((surface) => surface.id))
  let n = 2
  while (used.has(`s${n}`)) n += 1
  return `s${n}`
}

// 某区域成员里某个 id 的相邻接管者(优先右侧,其次左侧,都没有则为空)—— 与 closeTab 同一条规则。
function neighborMember(members: readonly string[], id: string): string {
  const index = members.indexOf(id)
  if (index < 0) return ''
  return members[index + 1] ?? members[index - 1] ?? ''
}

// 沿某条边切分一个区域:把窗体 `at` 摘进一个**新建的子区域**并让它成为当前项;原区域其余成员原地不动。
//   · `at` 可以是原区域的成员(常规切分),也可以是别处的窗体(拖出后成浮窗再落回时的停靠式切分);
//   · 新区域固定追加在**原区域内容之后**(右 / 下)—— 契约的 Surface 只有 axis 没有「侧别」字段,
//     故「拖到左缘」与「拖到右缘」结果相同,只是轴向不同;这是本契约下的已知取舍。
//
// splitSurface 是**纯规划**:返回新区域的 id(不可切分时为空串),入参布局一个字段都不动 ——
// 于是调用方可以先探测「这样切会得到哪个区域 / 是否合法」再决定要不要写回。真正的写回用
// withSurfaceSplit,两者共用同一条构造路径,故 id 与结果必然一致。
export function splitSurface(layout: WorkspaceLayout, surfaceId: string, axis: Surface['axis'], at: string): string {
  const candidate = buildSplit(layout, surfaceId, axis, at)
  if (candidate === null) return ''
  const id = candidate.surfaces.at(-1)?.id ?? ''
  // 守卫:切分后的布局必须仍然满足全部不变量(否则视为不可切分)。
  return layoutViolations(candidate).length === 0 ? id : ''
}

// 应用切分:把规划结果写回布局(不可切分时原样返回)。
export function withSurfaceSplit(layout: WorkspaceLayout, surfaceId: string, axis: Surface['axis'], at: string): WorkspaceLayout {
  return buildSplit(layout, surfaceId, axis, at) ?? layout
}

// 切分的唯一构造路径:摘走 `at`、给它建一个挂在 `surfaceId` 下的子区域、把子区域追加到区域数组末尾。
// 目标区域或窗体不存在时返回 null。
function buildSplit(layout: WorkspaceLayout, surfaceId: string, axis: Surface['axis'], at: string): WorkspaceLayout | null {
  if (surfaceOf(layout, surfaceId) === undefined) return null
  if (!layout.windows.some((win) => win.id === at)) return null
  const id = nextSurfaceId(layout)
  // 从**所有**区域里摘掉 `at`(它可能来自任何一个区域),腾出的活动位交给相邻成员。
  // 被切的区域**保留其余成员**,只把自身的排布轴改成新的切分方向。
  const surfaces: Surface[] = layout.surfaces.map((surface) => {
    const members = surface.members.filter((member) => member !== at)
    const activeId = surface.activeId === at ? neighborMember(surface.members, at) : surface.activeId
    return surface.id === surfaceId ? { ...surface, axis, members, activeId } : { ...surface, members, activeId }
  })
  const next: Surface = { id, parentId: surfaceId, axis, weight: SPLIT_WEIGHT, members: [at], activeId: at }
  return {
    surfaces: [...surfaces, next],
    // 被切出的窗体在新区域里是**停靠且可见**的(它可能刚从悬浮态落回来)。
    windows: layout.windows.map((win) => (win.id === at ? { ...win, placement: 'docked', visible: true } : win)),
    focus: at,
    recent: rememberRecent(layout.recent, at),
  }
}

// 合并 / 删除一个区域:把它的成员与子区域都托付给它的父区域,然后把它从树里摘掉。
// 根区域不可删除(没有父区域可托付)。返回新布局;目标不存在或为根时原样返回。
export function removeSurface(layout: WorkspaceLayout, surfaceId: string): WorkspaceLayout {
  const target = surfaceOf(layout, surfaceId)
  if (target === undefined || target.parentId === null) return layout
  const parentId = target.parentId
  const surfaces = layout.surfaces
    .filter((surface) => surface.id !== surfaceId)
    .map((surface) => {
      if (surface.id === parentId) {
        // 成员托付给父区域(去重:同一窗体不会被登记两次),活动位在父区域空缺时接过来。
        const members = [...surface.members, ...target.members.filter((id) => !surface.members.includes(id))]
        return { ...surface, members, activeId: surface.activeId === '' ? target.activeId : surface.activeId }
      }
      // 子区域改挂到父区域名下,树的其余部分不动。
      if (surface.parentId === surfaceId) return { ...surface, parentId }
      return surface
    })
  return { ...layout, surfaces }
}

// 把某区域切分容器里**第 index 条分隔线**调到给定的左侧占比(百分比)。分隔线编号与渲染一致:
// items = [自身内容(权重固定 OWN_WEIGHT), ...子区域(各自 weight)],index=0 是自身内容与首个子区域之间。
// 第 0 条只能调右侧子区域的权重(自身内容没有字段可写);其余各条同时调左右两个子区域的权重并保持其和。
export function setSeparatorPercent(layout: WorkspaceLayout, surfaceId: string, index: number, percent: number): WorkspaceLayout {
  const children = childSurfaces(layout, surfaceId)
  if (index < 0 || index >= children.length) return layout
  const pct = Math.min(MAX_SEPARATOR_PERCENT, Math.max(MIN_SEPARATOR_PERCENT, Math.round(percent)))
  if (index === 0) {
    const child = children[0]
    if (child === undefined) return layout
    // 自身内容固定 OWN_WEIGHT,要让左侧占比为 pct → 右侧权重 = OWN_WEIGHT × (100 − pct) / pct。
    const weight = Math.max(1, Math.round((OWN_WEIGHT * (100 - pct)) / pct))
    return replaceSurface(layout, child.id, (surface) => ({ ...surface, weight }))
  }
  const left = children[index - 1]
  const right = children[index]
  if (left === undefined || right === undefined) return layout
  const sum = left.weight + right.weight
  if (sum < 2) return layout
  const nextLeft = Math.max(1, Math.min(sum - 1, Math.round((pct / 100) * sum)))
  const nextRight = sum - nextLeft
  return {
    ...layout,
    surfaces: layout.surfaces.map((surface) => {
      if (surface.id === left.id) return { ...surface, weight: nextLeft }
      if (surface.id === right.id) return { ...surface, weight: nextRight }
      return surface
    }),
  }
}

// 某条分隔线的当前百分比(左侧占两侧之和的比例)—— 喂给分隔条的 aria-valuenow。
export function separatorPercent(layout: WorkspaceLayout, surfaceId: string, index: number): number {
  const children = childSurfaces(layout, surfaceId)
  if (index < 0 || index >= children.length) return 50
  const first = index === 0 ? OWN_WEIGHT : (children[index - 1]?.weight ?? OWN_WEIGHT)
  const second = children[index]?.weight ?? SPLIT_WEIGHT
  const sum = first + second
  if (sum <= 0) return 50
  return Math.round((first / sum) * 100)
}

// ---- 不变量 ----
//
// 返回被违反的不变量(人类可读;空数组 = 全部满足)。供断言与运行时守卫使用:
//   ① 任何区域的 activeId 非空时必须 ∈ 其 members;
//   ② 区域的成员必须指向存在的窗体;
//   ③ 一个窗体至多属于一个区域;
//   ④ floating 窗体的 id 不得出现在任何区域的 members 里;
//   ⑤ **可见**的 docked 窗体必须属于某个区域(隐藏的可以不属于:关闭 ≠ 删除,placement 不被销毁);
//   ⑥ maximized × floating 互斥;
//   ⑦ focus 非空时必须指向存在的窗体;
//   ⑧ 区域树的 parentId 必须指向存在的区域(根为 null),且不得指向自己。
export function layoutViolations(layout: WorkspaceLayout): string[] {
  const violations: string[] = []
  const ids = new Set(layout.windows.map((win) => win.id))
  const surfaceIds = new Set(layout.surfaces.map((surface) => surface.id))
  for (const surface of layout.surfaces) {
    if (surface.activeId !== '' && !surface.members.includes(surface.activeId)) {
      violations.push(`surface ${surface.id}: activeId ${surface.activeId} 不在 members 里`)
    }
    for (const id of surface.members) {
      if (!ids.has(id)) violations.push(`surface ${surface.id}: 成员 ${id} 没有对应的窗体`)
    }
    // 区域树:parentId 要么是 null(根),要么指向存在的另一个区域。
    if (surface.parentId !== null) {
      if (surface.parentId === surface.id) violations.push(`surface ${surface.id}: parentId 指向自己`)
      else if (!surfaceIds.has(surface.parentId)) violations.push(`surface ${surface.id}: parentId ${surface.parentId} 不存在`)
    }
  }
  for (const win of layout.windows) {
    const owners = layout.surfaces.filter((surface) => surface.members.includes(win.id))
    if (owners.length > 1) violations.push(`window ${win.id}: 同时属于 ${owners.length} 个区域`)
    if (win.placement === 'floating' && owners.length > 0) violations.push(`window ${win.id}: floating 却出现在区域的 members 里`)
    if (win.placement === 'docked' && win.visible && owners.length === 0) violations.push(`window ${win.id}: 可见的 docked 窗体却不属于任何区域`)
    if (win.placement === 'floating' && win.view === 'maximized') violations.push(`window ${win.id}: floating × maximized 互斥`)
  }
  if (layout.focus !== '' && !ids.has(layout.focus)) violations.push(`focus ${layout.focus} 不存在`)
  return violations
}

// ---- 折叠未变更的片段 ----
// 依据:IntelliJ 的 diff 可配置保留几行上下文,长文件里只展开变更周围若干行。
// 这里给出「展示项」序列:每一行,或一段被折叠的未变更行(可展开)。
export const FOLD_CONTEXT = 2
// 折叠门槛:未变更的连续行超过这个数才折起来(只差一两行就折会显得碎)。
const FOLD_MIN = FOLD_CONTEXT * 2 + 1

export type FileDisplayItem =
  | { kind: 'line'; line: FileLine }
  | { kind: 'fold'; start: number; count: number }

// 计算展示项。expanded 是「已展开的折叠段起点」集合(下标基准与 lines 一致)。
export function buildDisplayItems(lines: readonly FileLine[], expanded: ReadonlySet<number>): FileDisplayItem[] {
  // 变更行(含其上下 FOLD_CONTEXT 行)标记为「必显」。
  const visible = new Array<boolean>(lines.length).fill(false)
  for (const [index, line] of lines.entries()) {
    if (line.change === 'none') continue
    const from = Math.max(0, index - FOLD_CONTEXT)
    const to = Math.min(lines.length - 1, index + FOLD_CONTEXT)
    for (let cursor = from; cursor <= to; cursor += 1) visible[cursor] = true
  }
  const items: FileDisplayItem[] = []
  let index = 0
  while (index < lines.length) {
    if (visible[index] === true) {
      const line = lines[index]
      if (line !== undefined) items.push({ kind: 'line', line })
      index += 1
      continue
    }
    // 收集一段连续的未变更行。
    let end = index
    while (end < lines.length && visible[end] !== true) end += 1
    const count = end - index
    if (count < FOLD_MIN || expanded.has(index)) {
      for (let cursor = index; cursor < end; cursor += 1) {
        const line = lines[cursor]
        if (line !== undefined) items.push({ kind: 'line', line })
      }
    } else {
      items.push({ kind: 'fold', start: index, count })
    }
    index = end
  }
  return items
}
