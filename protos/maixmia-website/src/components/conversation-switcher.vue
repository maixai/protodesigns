<script setup lang="ts">
// 会话头 = 浏览器式 tab 条(近期对话)+ 常驻的溢出 / 搜索菜单。
//
// 形态:左侧 tablist 按「最近更新」排近期对话,活动 tab 用青瓷填充 + 一条压在下描丝线上的
// 短线表达「当前项」(与本仓首页 feature-tabs 的表头线同族);装不下时,溢出部分收进右侧
// 常驻的菜单钮,菜单里可查看全部会话并搜索。
//
// 三条既定取舍(用户拍板 + 调研支撑):
//   ① 菜单钮常驻 —— 它是溢出与搜索的稳定入口,不因「当前无溢出」而消失(否则搜索入口会跳位)。
//   ② Agent 标识全交给侧栏 —— 头部只放 tab 条,不再有首字标记 / Agent 副标题。
//   ③ tab 不因等待状态前置 —— 一律按最近更新排序、永不跳位;等待由两处承担:tab 上的徽标,
//      与菜单里置顶的「等待你」分组。跳位会让用户刚建立的肌肉记忆失效(浏览器 tab 也不跳位)。
//
// 组件是**受控的**:sessions / searchQuery / open 等由页面持有,组件只读 value、通过事件请求变更。
// 它渲染 header 内的 [tablist][＋][菜单钮][视觉隐藏 h1] 与菜单浮层 —— 用 display: contents 的根,
// 使这些成为 .conversation-heading 的直接 flex 子项(浮层则锚到会话头,见样式注释)。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { ChatSession, SessionStatus } from '../contracts/generated/chat-session'
import type { ConversationSearchHit } from '../contracts/generated/conversation-search-hit'
import type { ProjectEntryStateId } from '../contracts/generated/project-entry'
import type { Project } from '../contracts/generated/project'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { chatWindowId, fileBaseName, fileDirName, fileTabKey, parseWindowId } from '../data/windows'
import type { FileTab } from '../data/windows'
import { badgeMapOf } from '../data/project-identity'
import type { ProjectBadge } from '../data/project-identity'
import { TEAR_OUT_KEYSHORTCUTS, isTearOutShortcut } from '../data/shortcuts'
import { viewportRectOf } from '../data/viewport-rect'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

// 会话列表的异步四态与页面里的 sessionStatus 同型;这里只用它决定菜单内的占位渲染。
type SessionsStatus = 'loading' | 'ready' | 'empty' | 'error'

// disabled 可选:生成 / 保存中锁定切换,避免与正在进行的生成争用同一份工作台状态。
const props = defineProps<{
  sessions: ChatSession[]
  sessionsStatus: SessionsStatus
  // 当前 Agent 已打开的全部项目 —— 用于解析每段对话 / 每个文件的**归属标识**
  // (项目缩写 + 标识色绑定类 + 悬停里的项目名与路径)。多项目并行时,tab 上必须能看出归属。
  projects: Project[]
  minimizableProjectCounts: Readonly<Record<string, number>>
  // 下拉的**会话列表**里要隐去的会话 id(视图状态,不进契约):本区域正在显示的那段 + 任何可见的
  // 悬浮对话。判据由页面持有(见 workspace-page 的 switcherExcludedSessionIds)—— 组件只负责滤掉,
  // 因为它只管列表;**tab 条不受影响**(tabSessions 由 order + sessions 全量映射,被隐去的会话
  // 恰恰就是条上那些 tab,过滤 sessions 会把它们一并抹掉)。
  excludedSessionIds: readonly string[]
  searchQuery: string
  searchHits: ConversationSearchHit[]
  isSearching: boolean
  activeId: string
  // 已「打开过」的会话集合(视图状态,不进契约):某会话在 awaiting / completed 期间成为活动
  // 会话即记入 —— 这两个状态需要一个「已看过」的信号来收起它的提示图标。菜单「等待你」组同用。
  seenSessions: Set<string>
  // 某段对话的**实时**状态覆盖:排队 / 流式 → streaming、完成 → completed;null 表示回落取
  // 会话自身的 status。每段对话各有自己的生成态(按会话查询),页级「当前会话」已消失。
  statusOf: (session: ChatSession) => SessionStatus | null
  // **条上对话的顺序**:区域成员里的对话窗体 id(按成员顺序,**复合键** chat://<项目>/<会话>)
  // —— 唯一事实源。组件不再自排一份顺序:新出现 / 已关闭由页面按「补一个成员 / 撤下一个成员」
  // 增量维护成员数组,拖拽重排也写回成员(经 reorder 事件),于是「成员顺序 = 条上顺序」恒成立。
  order: string[]
  // 「显示一个已打开的窗体」时的提醒落点:与它同 id 的 tab 会短暂脉冲一次(见下方动画)。
  // 由页面持有并在一拍后清空 —— 组件不持有这个状态,它只负责把这一帧画出来。
  pulseKey?: string
  // 行内时间戳的格式化(随当前语言),由页面传入,避免两处各写一份日期格式。
  formatTime: (timestamp: string) => string
  open: boolean
  disabled?: boolean
  // ---- 文件(与对话同条:先对话、后文件) ----
  // 文件那一组不是 tablist 而是 toolbar(同一时刻可有多个文件窗口,不存在「一个 tab 对一个 panel」),
  // 故这里只收「本域(Agent + 项目)已打开的文件」与它们的状态,渲染由本组件的下拉统一承担。
  files: FileTab[]
  // 当前聚焦的文件(下拉里那一行的 aria-current)。
  activeFilePath: string
  // 窗口**可见**的文件集合 —— 列表里那一行的 aria-pressed 就是它(多窗口期可有多个)。
  visibleFilePaths: readonly string[]
  // 文件状态芯片(与文件树 / 文件栏同源同值)。
  fileStateOf: (tab: FileTab) => ProjectEntryStateId
  // 本域里关掉过、仍可从下拉重新打开的路径(新在前)。
  recentFiles: readonly string[]
  // 区域切分后本组件会在**每一块区域**里各渲染一份:＋ / 菜单 / 菜单浮层**每块区域各一份**
  // (每块区域功能完全一样)。全页只该有一份的东西(h1 地标、tab 重排的 aria-live、区域 / 窗体
  // 变化的 role=status)**不在本组件里**,它们由页面持有 —— 空区域消失后根区域可能根本没有会话头,
  // 住在会话头里的地标会跟着一起消失。
  // 本区域所属 tabpanel 的 id(aria-controls 的目标):多区域下必须按区域区分,不能重名。
  panelId: string
  // 菜单浮层的 id(每块区域各一份,同样按区域区分)。
  menuPanelId: string
}>()

const emit = defineEmits<{
  'minimize-project': [projectId: string]
  // 条上的最小化钮:收起**整块显示区**(不是某个项目的部分 tab)。
  'minimize-surface': []
  select: [session: ChatSession]
  'select-hit': [hit: ConversationSearchHit]
  'search-input': [value: string]
  'clear-search': []
  'reset-search': []
  // 新建对话:带上 ＋ 按钮在视口里的矩形 —— 该 Agent 打开了多个项目时,页面据此把项目选择
  // 浮层锚到这个触发点上(归属要让用户拍板,浮层贴着发起它的那枚钮弹出)。
  'new-chat': [origin: WindowRect]
  // ＋ 菜单里选「打开文件」:带上 ＋ 的视口矩形,页面据此把文件选择浮层锚到它下方。
  'open-file-picker': [origin: WindowRect]
  close: [id: string]
  // 条上对话**重排**(拖拽 / Ctrl+Shift+PageUp/Down):交出完整的新顺序,页面写回区域成员。
  reorder: [order: string[]]
  'update:open': [open: boolean]
  'select-file': [path: string]
  'close-file': [path: string]
  'open-recent-file': [path: string]
  // 非拖拽通路(WCAG 2.5.7):tab 上那枚按钮把该对话拆出为悬浮窗体(与文件栏同一套事件)。
  'tear-pop': [key: string, origin: WindowRect]
  // 向下拖出:out = 判定为拆出;move = 跟手位置;cancel = 指针回到条内,撤销拆出;end = 本次拖拽收尾。
  'tear-out': [detail: TabTearDetail]
  // point = 窗体左上角该落到的点(跟手用);pointer = 指针的视口坐标(落点判定用 —— 两者差一个抓取偏移)。
  'tear-move': [detail: { point: { x: number; y: number }; pointer: { x: number; y: number } }]
  'tear-cancel': []
  'tear-end': []
  // tab 重排(拖拽 / 快捷键)的 aria-live 播报文本:组件只报「发生了什么」,播报区由**页面**
  // 持有(全页恰一条),组件不再自持一份 live region。
  announce: [text: string]
}>()

// 拆出为悬浮窗体时交给页面的那一组几何(与文件栏的 TabTearDetail 同形):point = 窗体左上角应落到的点
// (已扣掉抓取偏移),origin = 被拖的 tab 在屏幕上的矩形(FLIP 的来源)。
interface TabTearDetail {
  key: string
  point: { x: number; y: number }
  origin: WindowRect
}

const { t } = useI18n()

// ---- ＋ 的选择菜单:先问「新建对话还是打开文件」,再走各自的动作 ----
// 之前 ＋ 只有一个含义(新建对话);加入文件选择后,两种动作都合理,直接把 ＋ 绑死成其中一种
// 会让另一种变成隐藏功能。故 ＋ 是 disclosure:点开两项,选完即收起。
// 菜单本身很轻(两行文字),不引入图标:两个动作的词义已经足够区分。
const addOpen = ref(false)
const addLabel = computed(() => t.value.workspace.addMenu.label)

function addItems(): HTMLButtonElement[] {
  return Array.from(addMenuRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
}

function closeAdd(restoreFocus: boolean): void {
  if (!addOpen.value) return
  addOpen.value = false
  if (restoreFocus) newChatRef.value?.focus()
}

function toggleAdd(): void {
  if (addOpen.value) {
    closeAdd(true)
    return
  }
  // 与 ▾ 的会话菜单互斥:同一时刻只开一个浮层,免得两层叠在标题行上。
  close(false)
  addOpen.value = true
  void nextTick(() => addItems()[0]?.focus())
}

// 选「新建对话」:先把焦点交还 ＋(项目选择浮层以 ＋ 为锚点,取消时要能回到它),
// 再走页面既有的 new-chat 通路(多项目时由页面弹项目选择浮层)。
function chooseAddConversation(): void {
  closeAdd(false)
  newChatRef.value?.focus()
  emit('new-chat', viewportRectOf(newChatRef.value))
}

// 选「打开文件」:同样把焦点交还 ＋ —— 文件选择浮层挂载时把当前焦点记为「取消后回到哪里」。
function chooseAddFile(): void {
  closeAdd(false)
  newChatRef.value?.focus()
  emit('open-file-picker', viewportRectOf(newChatRef.value))
}

// 菜单键盘:Esc 收起并还焦点;↑ / ↓ / Home / End 在两项之间移动。
function onAddKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    closeAdd(true)
    return
  }
  const items = addItems()
  if (items.length === 0) return
  const index = items.findIndex((item) => item === document.activeElement)
  let next = -1
  if (event.key === 'ArrowDown') next = (index + 1) % items.length
  else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = items.length - 1
  if (next < 0) return
  event.preventDefault()
  items[next]?.focus()
}

// 文件个数变化要重算行的分配(单向定额按「文件数 × 单品上限」给宽)。
watch(() => props.files.length, () => { measureStrip() })

// ---- 下拉的分类过滤(两个 aria-pressed 切换钮,**不是** tab:它们不切换面板,只过滤同一个列表)----
type MenuFilter = 'conversations' | 'files'
const menuFilter = ref<MenuFilter>('conversations')

// ---- 归属标识(项目 → 缩写 / 名称 / 路径 / 标识色绑定类) ----
// 用户名下的项目表在建段时给全,组件按 projectId 回查即可;查不到(理论上不会)时退化为 id 本身,
// 保证归属信息永远读得出来(文字通道优先)。
const projectBadges = computed<Map<string, ProjectBadge>>(() => badgeMapOf(props.projects))
function badgeOf(projectId: string): ProjectBadge | undefined {
  return projectBadges.value.get(projectId)
}
function markOf(projectId: string): string {
  return badgeOf(projectId)?.mark ?? ''
}
function projectNameOf(projectId: string): string {
  return badgeOf(projectId)?.name ?? projectId
}
function identityClassOfProject(projectId: string): string {
  return badgeOf(projectId)?.identityClass ?? ''
}
// 会话的**复合窗体键**(与页面 data/windows 的 chatWindowId 同源):条上顺序与关闭 / 拆出都按它。
function windowKeyOf(session: ChatSession): string {
  return chatWindowId(session.projectId, session.id)
}

// 文件行:主行文件名、次行**所属项目 + 目录**(打开集跨项目,出处必须写全);根目录下的文件用 '/' 占位。
function fileRowLocation(projectId: string, path: string): string {
  const dir = fileDirName(path)
  return `${projectNameOf(projectId)} › ${dir === '' ? '/' : dir}`
}
function fileRowPath(tab: FileTab): string {
  return fileRowLocation(tab.projectId, tab.path)
}
// 「最近关闭」段只拿得到复合窗体键(没有 FileTab 对象),故经 parseWindowId 回查项目与路径。
function closedFileRowPath(key: string): string {
  const parsed = parseWindowId(key)
  return parsed === null ? key : fileRowLocation(parsed.projectId, parsed.ref)
}
function closedFileBaseName(key: string): string {
  const parsed = parseWindowId(key)
  return parsed === null ? key : fileBaseName(parsed.ref)
}

// 下拉里的文件行 = 显示该文件的窗口(单窗口期即切换活动文件);关掉过的行 = 重新打开。
function onSelectFileRow(key: string): void {
  emit('select-file', key)
  close(false)
}

function onOpenRecentRow(key: string): void {
  emit('open-recent-file', key)
  close(false)
}

// 关掉过、仍可从下拉重新打开的文件(复合窗体键);仍打开着的不重复列(它们已在下拉的「已打开」段)。
const closedFilePaths = computed(() => props.recentFiles.filter((key) => !props.files.some((tab) => fileTabKey(tab) === key)))

// 文件的状态芯片文案(与文件树 / 文件栏同一套词条)。
function fileChipLabel(tab: FileTab): string | null {
  const state = props.fileStateOf(tab)
  if (state === 'none') return null
  return t.value.workspace.entryStates[state]
}

const rootRef = ref<HTMLElement | null>(null)
const tabsRef = ref<HTMLElement | null>(null)
// ＋ 的定位上下文(菜单锚点)与菜单浮层;newChatRef 同时是项目 / 文件浮层的锚点来源。
const addRootRef = ref<HTMLElement | null>(null)
const addMenuRef = ref<HTMLElement | null>(null)
const newChatRef = ref<HTMLButtonElement | null>(null)
const menuTriggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

// 全部会话按**最近更新**倒序:菜单的几组沿用这个顺序(它是「索引」,便于按时间查找)。
const orderedSessions = computed(() => [...props.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
// 下拉列表要展示的会话 = 全量里滤掉「已打开、正摆在眼前的那些」(见 excludedSessionIds 的说明)。
// 只作用于**列表**;tab 条走 sessionByWindow(仍用全量 sessions),故条上的 tab 一枚不少。
const menuSessions = computed(() => orderedSessions.value.filter((session) => !props.excludedSessionIds.includes(session.id)))
// 会话按**复合窗体键**索引:tab 条的顺序由 props.order(复合键)给出,这里只做 键 → 会话 的映射。
const sessionByWindow = computed(() => new Map(props.sessions.map((session) => [windowKeyOf(session), session])))

// ---- tab 条的顺序(由布局成员给出,单一事实源)----
// props.order 是区域成员里的对话窗体 id(复合键,按成员顺序)。页面在「会话新出现 / 关闭 / 重排」时
// 增量维护成员数组,故这里不再自存一份 manualOrder —— 两处各存一份顺序必然有一天对不上。
// 未在 sessions 里的键(尚未落定的)被略过。
const tabSessions = computed(() => props.order.flatMap((key) => {
  const session = sessionByWindow.value.get(key)
  return session === undefined ? [] : [session]
}))

// tab 的关闭钮**恒常存在**(不再「只剩一个打开项时不给」):每块区域功能完全一样,关掉最后一个
// tab 由页面负责把清空的区域摘除(根区域则回落到引导页),关闭钮因此不该在任何数量下消失。

// 「需要徽标 / 需要前置」的唯一判定:该会话在等待交互,且用户在它等待期间还没打开过它。
function isAwaitingUnseen(session: ChatSession): boolean {
  return session.status === 'awaiting' && !props.seenSessions.has(session.id)
}

// ---- tab 状态指示:只留「呼吸灯」+ 两种文字 Badge ----
// 上一版给五个状态各画了一种形状,信息量过载:tab 条上真正值得一眼看出的只有「这条正在产出」
// 与「这条要你介入 / 刚出结果」。故收敛成三条规则:
//   ① 「思考中 / 输出中」(有效状态 streaming)→ 前导槽里的**呼吸圆点**,是唯一的图形指示;
//   ② 「等待交互」→ 警告色文字 Badge,「输出完成」→ 成功色文字 Badge。文字自带语义,
//      不必再借形状来区分(WCAG 1.4.1 要的是「不靠颜色也能分辨」,文字本身就满足);
//   ③ 「新会话」与「等待对话」→ **不再有任何指示** —— 它们没有需要用户立刻知道的信息。
// 前导槽恒定占位(空槽或圆点),故状态出现 / 消失都不会让标签横向位移。
type TabBadge = { level: 'warning' | 'success'; text: string }

// 有效状态:该会话若正被实时生成覆盖则用覆盖值,否则取会话自身的 status。
function effectiveStatus(session: ChatSession): SessionStatus {
  return props.statusOf(session) ?? session.status
}

// 「正在产出」= 唯一的呼吸灯条件(排队与流式在 tab 这一层都报 streaming)。
function isProducing(session: ChatSession): boolean {
  return effectiveStatus(session) === 'streaming'
}

// awaiting / completed 是「需要你知道」的两态:看过之后 Badge 不再显示(与菜单「等待你」组同一套
// 「已看过」判定);活动会话本身即在被看,故一律视为已看过。
function tabBadge(session: ChatSession): TabBadge | null {
  if (session.id === props.activeId || props.seenSessions.has(session.id)) return null
  const status = effectiveStatus(session)
  if (status === 'awaiting') return { level: 'warning', text: t.value.workspace.sessionStatus.awaiting }
  if (status === 'completed') return { level: 'success', text: t.value.workspace.sessionStatus.completed }
  return null
}

// tab 的 title(鼠标悬停可读)= 标题 + **归属项目名** + 状态词(补充通道,不承担唯一信息)。
// 状态信息另由遥测条的 live region 与 ▾ 面板的文字承担,故 tab 的**可访问名**(来自可见标签文字)
// 不变,不影响既有按名字定位的断言。
function tabTitle(session: ChatSession): string {
  return `${session.title} · ${projectNameOf(session.projectId)} · ${t.value.workspace.sessionStatus[effectiveStatus(session)]}`
}

const awaitingSessions = computed(() => menuSessions.value.filter(isAwaitingUnseen))
// 菜单里「本项目」组与「等待你」组不重复:已看过(或本就不等待)的会话落进后面的**按项目分组**。
const projectSessions = computed(() => menuSessions.value.filter((session) => !isAwaitingUnseen(session)))
// **按项目分组**(多项目并行时的核心:候选列表不再只列一个项目,而要标出每段的归属)。
// 组的顺序 = 该组里最近更新那段的位置(会话已按最近更新倒序),组头带该项目的标识(色点 + 名称)。
interface ProjectGroup {
  projectId: string
  badge: ProjectBadge | undefined
  sessions: ChatSession[]
}
// 可最小化的项目 = 当前区域里至少有一个 tab 的项目;计数用于按钮文案,
// 避免组头「本组候选会话数」与「实际会收起的页签数」看起来对不上。
const minimizableProjectIds = computed(() => Object.keys(props.minimizableProjectCounts))
// tab 条上的整块显示区最小化:作用对象 = 本区域当前全部可见页签(不按项目拆)。
const surfaceTabCount = computed(() => Object.values(props.minimizableProjectCounts).reduce((sum, count) => sum + count, 0))
const minimizeLabel = computed(() => t.value.workspace.dock.minimizeSurfaceLabel.replace('{count}', String(surfaceTabCount.value)))
watch(surfaceTabCount, () => { measureStrip() })
const projectGroups = computed<ProjectGroup[]>(() => {
  const groups = new Map<string, ChatSession[]>()
  for (const session of projectSessions.value) {
    const list = groups.get(session.projectId)
    if (list === undefined) groups.set(session.projectId, [session])
    else list.push(session)
  }
  // 有文件但没有候选对话的项目也必须有组头入口。
  for (const projectId of minimizableProjectIds.value) if (!groups.has(projectId)) groups.set(projectId, [])
  return [...groups.entries()].map(([projectId, sessions]) => ({ projectId, badge: badgeOf(projectId), sessions }))
})
// 组头文案:{项目名} · {条数}。
function groupLabel(badge: ProjectBadge | undefined, projectId: string, count: number): string {
  return t.value.workspace.projectGroup.replace('{name}', badge?.name ?? projectId).replace('{count}', String(count))
}

// ---- 溢出计算(简单、确定、可断言)----
// 调研:Telerik TabStrip 与 SAP Fiori 的 tabsOverflowMode 默认都是「超出部分收进末尾的『更多』
// 菜单」;Firefox 最小 tab 宽 76px(英文 / 图标语境),中文标题需要更宽,故 min 取 160(≈10 个汉字)。
// tab 等宽 + clamp 是把「不出现半截 tab」做成长度确定性保证的手段(CSS 表达不出「先按内容宽、
// 不够再收缩截断」,这是已知的 CSS 局限)。strip 由 ResizeObserver 观察会话头可用宽度重算。
const stripWidth = ref(0)
// 极窄区域(375 下的分屏)放不下第四个常驻控件:此时隐藏条上的最小化钮,
// 项目组入口仍在 ▾ 菜单里 —— 不能为了一个按钮把整行撑出横向溢出。
const canShowMinimize = ref(false)
const tabMin = ref(160)
const tabMax = ref(240)
// tab 之间的一档间隙(与 .conversation-tabs 的 gap 同源),算可见数与等宽时要扣掉。
const tabGap = ref(4)

// 量会话头的内容宽,再减去 [汉堡?][＋][菜单钮] 及其间隙,得到 tab 条可用宽。
function measureStrip(): void {
  const heading = tabsRef.value?.closest('.conversation-heading')
  if (!(heading instanceof HTMLElement)) return
  const style = getComputedStyle(heading)
  const padStart = Number.parseFloat(style.paddingInlineStart) || 0
  const padEnd = Number.parseFloat(style.paddingInlineEnd) || 0
  const gap = Number.parseFloat(style.columnGap) || 0
  // tab 条这一行的控件走**紧凑导航行**档(--workspace-nav-control-size,32px),
  // 不是 44px 的独立控件档;预留宽据此算,否则会低估可用宽、少放一个 tab。
  const target = Number.parseFloat(style.getPropertyValue('--workspace-nav-control-size')) || 32
  tabMin.value = Number.parseFloat(style.getPropertyValue('--workspace-tab-min')) || 160
  tabMax.value = Number.parseFloat(style.getPropertyValue('--workspace-tab-max')) || 240
  const stripStyle = tabsRef.value === null ? null : getComputedStyle(tabsRef.value)
  tabGap.value = stripStyle === null ? 4 : Number.parseFloat(stripStyle.columnGap) || 0
  const isNarrow = window.matchMedia('(max-width: 1023px)').matches
  const contentWidth = heading.clientWidth - padStart - padEnd
  // 先判断常驻控件放不放得下,再按它算预留宽 —— 否则隐藏钮仍占宽,条仍会溢出。
  canShowMinimize.value = contentWidth >= target * 2 + gap * 3 + (isNarrow ? target + gap : 0) + target + gap
  // 预留:＋ 与菜单钮(各一个紧凑档尺寸)+ 行内间隙;条上的整组最小化钮可见时再加一个紧凑档尺寸
  // 与一段间隙;窄屏还有汉堡钮与它的那段间隙。文件那一组插在 tablist 与 ＋ 之间,故行里比原先多一段 gap。
  const minimizeAllowance = surfaceTabCount.value > 0 && canShowMinimize.value
    ? target + gap
    : 0
  const reserved = target * 2 + gap * 3 + minimizeAllowance + (isNarrow ? target + gap : 0)
  // ---- 与文件那一组**共享同一行** ----
  // 谁也不能去读对方**渲染后**的宽:两组互为对方宽度会互相追着变(实测 375px 下先互相挤成 0、
  // 再一起回弹,浏览器还报 ResizeObserver loop)。故改为**单向定额**:由本组件(手里有顶部行的
  // 度量)一次算出文件组的允许宽,写进 --file-strip-width;文件组只读这个值,永不反过来影响本组。
  // 定额 = min(文件数 × 单个文件 item 上限, 行内容宽的 40%)—— 文件通常少,给足;但不许挤走对话。
  const fileGroupStyle = heading.querySelector('.file-bar') instanceof HTMLElement ? getComputedStyle(heading.querySelector('.file-bar') as HTMLElement) : null
  const fileTabMax = Number.parseFloat(fileGroupStyle?.getPropertyValue('--file-tab-max') ?? '') || 220
  const fileCount = props.files.length
  const fileAllowance = fileCount === 0 ? 0 : Math.min(fileCount * fileTabMax, contentWidth * 0.4)
  heading.style.setProperty('--file-strip-width', `${Math.round(fileAllowance)}px`)
  // 留 1px 给亚像素取整:极窄分屏(375 切成两块)下 tab 槽的 width 与父盒取整方向不一致,
  // 会多出 1px 的 documentElement.scrollWidth;不靠 overflow:hidden 兜底(那会吞焦点环)。
  stripWidth.value = Math.max(0, contentWidth - reserved - (fileAllowance > 0 ? fileAllowance + gap : 0) - 1)
}

const visibleCount = computed(() => {
  const total = tabSessions.value.length
  if (total === 0) return 0
  // 连一个「能收住内容」的 tab 都放不下时不要硬塞:tab 自身的内容 min-content(标题下限 +
  // 状态槽 + 恒定预留槽)约 72px,硬塞会让它画到 0 宽的槽外、盖住左侧汉堡钮 / 右侧「＋」。
  // 低于这个下限时把全部对话交给 ▾ 菜单;96px 是 72px 内容下限 + 一点余量。
  const MIN_RENDERABLE_TAB = 96
  if (stripWidth.value < MIN_RENDERABLE_TAB) return 0
  // n 个 tab 加 n-1 段间隙要装进 stripWidth:宽度 ≥ tabMin 时最多能放几个。
  const fits = Math.max(1, Math.floor((stripWidth.value + tabGap.value) / (tabMin.value + tabGap.value)))
  return Math.min(total, fits)
})

const tabWidth = computed(() => {
  if (visibleCount.value === 0) return tabMin.value
  // 等宽 = clamp((可用宽 − 间隙总宽) / 可见数, min, max);但当可用宽连 min 都放不下时(even < min),
  // 取 even —— 否则 tab 会宽过 strip、溢出条盒。min 是「目标」而非硬下限。
  const even = (stripWidth.value - tabGap.value * (visibleCount.value - 1)) / visibleCount.value
  // 槽宽取整:分数宽度会让极窄行的右缘落在半像素上,scrollWidth 向上取整后多出 1px。
  if (even < tabMin.value) return Math.max(0, Math.floor(even))
  return Math.min(tabMax.value, Math.floor(even))
})

// 可见 tab:从**打开集**里取最近的前 visibleCount 条;**活动会话永远可见** —— 不在窗口内时用
// 活动 tab 顶掉最后一个可见项(被顶掉的进菜单)。可见顺序因此不严格等于时间序,这是有先例的
// 既定行为(Telerik 文档与实现范例都强调活动 tab 不能藏进「更多」)。
const visibleTabs = computed(() => {
  const list = tabSessions.value
  const count = visibleCount.value
  // 放不下任何一个 tab 时**一个都不渲染**。只靠宽度算 0 不够:下面的「活动 tab 永远可见」
  // 回退会把它重新塞回来,而 tab 的内容 min-content 会画到 0 宽的槽外,盖住左侧的「＋」。
  // 此时全部对话交给 ▾ 菜单,内容区仍显示活动对话。
  if (count === 0) return []
  if (count >= list.length) return list
  const window = list.slice(0, count)
  const active = list.find((session) => session.id === props.activeId)
  if (active === undefined || window.some((session) => session.id === active.id)) return window
  return [...window.slice(0, count - 1), active]
})

const visibleIds = computed(() => new Set(visibleTabs.value.map((session) => session.id)))
// 普通计数 = **打开但没排下**(隐藏)的条数 —— 已关闭的会话不算「隐藏」,它只是被撤下了。
const hiddenSessions = computed(() => tabSessions.value.filter((session) => !visibleIds.value.has(session.id)))
const hasHidden = computed(() => hiddenSessions.value.length > 0)
// 警告信号 = 「等待交互且未看过」里**不在可见 tab 条上**的那些(既含隐藏、也含已关闭)。
// 关掉一个正在等你的会话**不会**把它标为「已看过」(你并没有打开它,Agent 仍在等你)——
// 但信号必须仍能被看到,所以落到 ▾ 徽标上。
const awaitingOffscreenCount = computed(() => orderedSessions.value.filter((session) => isAwaitingUnseen(session) && !visibleIds.value.has(session.id)).length)

// 菜单触发钮的徽标:优先「等待-未看过且不在 tab 条上」的条数(这才是会丢掉的信号);
// 否则当有隐藏项时显示普通的收起条数(tertiary);都没有则不渲染。
const menuBadge = computed<{ level: 'warning' | 'plain'; text: string } | null>(() => {
  if (awaitingOffscreenCount.value > 0) return { level: 'warning', text: String(awaitingOffscreenCount.value) }
  if (hasHidden.value) return { level: 'plain', text: String(hiddenSessions.value.length) }
  return null
})
const menuTriggerLabel = computed(() => {
  let label = t.value.workspace.conversationMenu
  if (hasHidden.value) label += `,${t.value.workspace.hiddenCount.replace('{count}', String(hiddenSessions.value.length))}`
  if (awaitingOffscreenCount.value > 0) label += `,${t.value.workspace.hiddenAwaiting.replace('{count}', String(awaitingOffscreenCount.value))}`
  return label
})

// ---- roving tabindex(WAI-ARIA APG Tabs)----
// 仅一个 tab tabindex="0"(跟焦点走,默认 = 活动会话),aria-selected="true" 仅活动那一个。
const focusedTabId = ref('')
const tabStopId = computed(() => {
  const tabs = visibleTabs.value
  if (tabs.length === 0) return ''
  if (tabs.some((session) => session.id === focusedTabId.value)) return focusedTabId.value
  if (tabs.some((session) => session.id === props.activeId)) return props.activeId
  return tabs[0]?.id ?? ''
})

// ←/→ 只移动焦点并回绕,**不切换会话**;Enter / Space 才激活。
// 手动激活是硬要求:每次切换都要拉转录数据,自动激活会让按住方向键连拉一串请求。
// 已知且接受的偏离:按 Tab 离开 tablist 会先经过同行的 ＋ 与菜单钮再到面板(APG 假设 tablist
// 独占该行)—— 二者本就是相邻控件、顺序合理,不为此做 tabindex 特殊处理。
function focusTab(id: string): void {
  focusedTabId.value = id
  tabsRef.value?.querySelector<HTMLElement>(`.conversation-tab[data-tab-id="${id}"]`)?.focus()
}

function onTabsKeydown(event: KeyboardEvent): void {
  const tabs = visibleTabs.value
  if (tabs.length === 0) return
  const target = event.target
  const currentId = target instanceof HTMLElement ? target.dataset.tabId : undefined
  const index = tabs.findIndex((session) => session.id === currentId)
  if (index < 0) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const session = tabs[index]
    if (session !== undefined) emit('select', session)
    return
  }
  // Delete 关闭聚焦的 tab(MDN 的 tab role 文档写明的交互:「removes the currently selected tab
  // from the tab list」)。不劫持 Ctrl/Cmd+W —— 那是浏览器的快捷键。只剩一个 tab 时同样生效
  // (关掉最后一项由页面把清空的区域摘除 / 回落到引导页,见脚本顶部的说明)。
  if (event.key === 'Delete') {
    event.preventDefault()
    const session = tabs[index]
    if (session !== undefined) emit('close', windowKeyOf(session))
    return
  }
  // Ctrl+Shift+PageUp / PageDown:把聚焦的 tab 逐位左 / 右移。Chrome 与 Firefox 都用这一对
  // 快捷键做标签页重排(Firefox 另有 Ctrl+Home/End),纯拖拽对键盘用户不可达,故必须给这条通路。
  if (event.ctrlKey && event.shiftKey && (event.key === 'PageUp' || event.key === 'PageDown')) {
    event.preventDefault()
    moveTab(index, event.key === 'PageUp' ? index - 1 : index + 1)
    return
  }
  // Ctrl/Cmd+Shift+M:把**聚焦的 tab** 拆出为悬浮窗体(其「拆出」钮已移出 Tab 序,这里是它的
  // 键盘等价通路;WCAG 2.5.7 只要求存在非拖拽入口,不要求它落在 Tab 序里)。
  if (isTearOutShortcut(event)) {
    event.preventDefault()
    const session = tabs[index]
    if (session !== undefined) emitPop(session)
    return
  }
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  const nextTab = tabs[next]
  if (nextTab !== undefined) focusTab(nextTab.id)
}

// ---- tab 拖拽:横向重排 + 向下拆出(两种手势共用同一次按下)----
// 越过阈值后**先定轴向再锁定**,之后不再改 —— 拖到一半改向不会在两种手势之间来回跳。
// 横向 = 重排(写回区域成员,见 reorder 事件);向下 = 把该 tab 拆出为悬浮窗体(与文件栏同一套范式)。
// 纵向那一支的元素会被从条上摘掉(收不到后续指针事件),故它在确认拆出时把 move / up 改挂到 document。
// 全程用 Pointer Events,不用 HTML5 drag-and-drop(后者在拖动期间抑制键盘事件,Esc 取消会失效)。
const DRAG_THRESHOLD_PX = 4
// 越过 tab 条**下沿**这么多 → 判定为拆出;回到下沿以内这么多 → 撤销。两值之差构成迟滞带。
const TEAR_DROP_DISTANCE = 24
const TEAR_REATTACH_DISTANCE = 12
const dragId = ref('')
const dragIndex = ref(-1)
const dropIndex = ref(-1)
const dragOffsetX = ref(0)
// 「拖拽结束后紧跟的那一次 click」需要被抑制,否则会误切会话(浏览器同款:拖动后台标签页
// 不会切过去)。每次新的 pointerdown 复位;click 处理器消费后也复位。
let suppressClick = false
let dragAxis: 'none' | 'x' | 'y' = 'none'
let dragStartX = 0
let dragStartY = 0
let dragPointerId = -1
let dragSlot: HTMLElement | null = null
// 拖拽开始时各可见槽位的左缘与等宽(落点判定基准)。transform 不影响已记录的左缘 —— 判定稳定。
let slotLefts: number[] = []
let slotWidth = 0
// 拆出的几何基准(按下时量一次;一次拖拽期间 tab 条与 tab 都不动)。
let stripBottom = 0
let grabOffsetX = 0
let grabOffsetY = 0
let dragOrigin: WindowRect = { x: 0, y: 0, width: 0, height: 0 }
// 本次拖拽是否拆出过(含撤销过的情形):决定松手时要不要通知页面收尾。
let didTearOut = false
// 当前是否处于拆出态(窗体已从条上摘掉、跟着指针走)。
let tearActive = false
// 我们自己释放过指针捕获 —— 随之而来的 lostpointercapture 不是「指针被系统打断」,忽略一次。
let ignoreLostCapture = false

function resetDrag(): void {
  dragId.value = ''
  dragIndex.value = -1
  dropIndex.value = -1
  dragOffsetX.value = 0
  dragPointerId = -1
  dragSlot = null
  slotLefts = []
  slotWidth = 0
  dragAxis = 'none'
  tearActive = false
  didTearOut = false
}

function onTabPointerDown(event: PointerEvent, index: number): void {
  suppressClick = false
  // 只响应主指针(多指触摸时其余指针不参与本次手势)。
  if (!event.isPrimary) return
  if (event.button !== 0) return
  if (visibleTabs.value.length < 1) return
  // 关闭钮 / 拆出钮上按下不启动拖拽(它们各有自己的动作)。
  const target = event.target
  if (target instanceof Element && (target.closest('.tab-close') !== null || target.closest('.tab-pop') !== null)) return
  const slot = event.currentTarget
  if (!(slot instanceof HTMLElement)) return
  const slots = Array.from(tabsRef.value?.querySelectorAll<HTMLElement>('.tab-slot') ?? [])
  if (slots.length !== visibleTabs.value.length) return
  const rect = slot.getBoundingClientRect()
  dragSlot = slot
  slotLefts = slots.map((element) => element.getBoundingClientRect().left)
  slotWidth = rect.width
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragPointerId = event.pointerId
  dragIndex.value = index
  dropIndex.value = index
  // 拆出的判定基准:条的下沿(拖过它 24px 即拆出)、按下点相对本 tab 左上角的偏移(窗体初始位置
  // 据此算,否则会瞬移)、本 tab 的屏幕矩形(FLIP 的来源)。
  const strip = tabsRef.value?.getBoundingClientRect()
  stripBottom = strip?.bottom ?? rect.bottom
  grabOffsetX = event.clientX - rect.left
  grabOffsetY = event.clientY - rect.top
  dragOrigin = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  // 刻意**不在按下时就捕获指针**:捕获会把随后的 click 改派到捕获元素,普通点击(选中 tab)
  // 就废了。只有越过阈值、确认是一次拖拽时,才在 pointermove 里 setPointerCapture。
}

// 指针 x 落在哪个可见槽位的区间里;落在首槽之前 → 0,末槽之后 → 末位(钳到可见范围)。
function resolveDropIndex(pointerX: number): number {
  const count = slotLefts.length
  if (count === 0) return dragIndex.value
  for (let i = 0; i < count; i += 1) {
    if (pointerX < (slotLefts[i] ?? 0) + slotWidth) return i
  }
  return count - 1
}

function onTabPointerMove(event: PointerEvent): void {
  if (dragIndex.value < 0 || event.pointerId !== dragPointerId) return
  // 纵向手势已交给 document 级处理器(元素会被摘掉,这里收不到事件)。
  if (dragAxis === 'y') return
  const dx = event.clientX - dragStartX
  const dy = event.clientY - dragStartY
  if (dragAxis === 'none') {
    // 移动超过阈值才判定为拖拽;否则仍是点击选中(浏览器同款:轻微抖动不该变成拖动)。
    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    const dragged = visibleTabs.value[dragIndex.value]
    const slot = event.currentTarget
    if (dragged === undefined || !(slot instanceof HTMLElement)) return
    dragId.value = windowKeyOf(dragged)
    dragSlot = slot
    // 轴向锁定:明确的**向下**意图(纵向分量占优)才是拆出,其余一律按重排。
    dragAxis = dy > 0 && dy > Math.abs(dx) ? 'y' : 'x'
    // 确认是拖拽,此刻才捕获指针 —— 捕获会把随后的 click 改派到捕获元素,普通点击(选中 tab)
    // 就废了。纵向那一支会在拆出时主动释放它。
    slot.setPointerCapture(event.pointerId)
    if (dragAxis === 'y') {
      addTearListeners()
      evaluateTear(event)
      return
    }
  }
  dragOffsetX.value = dx
  dropIndex.value = resolveDropIndex(event.clientX)
}

// 指针相对 tab 条下沿的位置:判定拆出 / 撤销拆出。两处共用,阈值之差即迟滞带。
function evaluateTear(event: PointerEvent): void {
  const below = event.clientY - stripBottom
  if (tearActive) {
    if (below <= TEAR_REATTACH_DISTANCE) {
      cancelTear()
      return
    }
    // 跟手:窗体的左上角 = 指针 − 抓取偏移,由页面写进窗体几何(零过渡)。
    emit('tear-move', {
      point: { x: event.clientX - grabOffsetX, y: event.clientY - grabOffsetY },
      pointer: { x: event.clientX, y: event.clientY },
    })
    return
  }
  if (below >= TEAR_DROP_DISTANCE) startTear(event)
}

// 判定为拆出:元素即将从 tab 条移到浮层 —— **先释放指针捕获**(搬走之后再 setPointerCapture
// 会失去跟踪),再把 move / up / cancel 改挂到 document。
function startTear(event: PointerEvent): void {
  tearActive = true
  didTearOut = true
  if (dragSlot !== null && dragSlot.hasPointerCapture(event.pointerId)) {
    ignoreLostCapture = true
    dragSlot.releasePointerCapture(event.pointerId)
  }
  emit('tear-out', {
    key: dragId.value,
    point: { x: event.clientX - grabOffsetX, y: event.clientY - grabOffsetY },
    origin: dragOrigin,
  })
}

function cancelTear(): void {
  if (!tearActive) return
  tearActive = false
  emit('tear-cancel')
}

function addTearListeners(): void {
  document.addEventListener('pointermove', onTearPointerMove)
  document.addEventListener('pointerup', onTearPointerUp)
  document.addEventListener('pointercancel', onTearPointerCancel)
  document.addEventListener('lostpointercapture', onTearLostCapture)
}

function removeTearListeners(): void {
  document.removeEventListener('pointermove', onTearPointerMove)
  document.removeEventListener('pointerup', onTearPointerUp)
  document.removeEventListener('pointercancel', onTearPointerCancel)
  document.removeEventListener('lostpointercapture', onTearLostCapture)
}

function onTearPointerMove(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId || !event.isPrimary) return
  evaluateTear(event)
}

function onTearPointerUp(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId) return
  endTearDrag()
}

// 指针被系统取消(触摸被中断 / 指针离开窗口):撤销拆出并收尾。
function onTearPointerCancel(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId) return
  cancelTear()
  endTearDrag()
}

function onTearLostCapture(event: PointerEvent): void {
  // 自己主动释放捕获的那一次不是取消信号。
  if (ignoreLostCapture) {
    ignoreLostCapture = false
    return
  }
  if (event.pointerId !== dragPointerId) return
  cancelTear()
  endTearDrag()
}

function endTearDrag(): void {
  removeTearListeners()
  if (didTearOut) emit('tear-end')
  resetDrag()
}

function onTabPointerUp(event: PointerEvent): void {
  if (dragIndex.value < 0 || event.pointerId !== dragPointerId) return
  // 纵向手势由 document 级处理器收尾。
  if (dragAxis === 'y') return
  const slot = event.currentTarget
  if (slot instanceof HTMLElement && slot.hasPointerCapture(event.pointerId)) slot.releasePointerCapture(event.pointerId)
  const wasDragging = dragId.value !== ''
  const from = dragIndex.value
  const to = dropIndex.value
  resetDrag()
  if (!wasDragging) return
  suppressClick = true
  if (to < 0 || to === from) return
  commitReorder(from, to)
}

// 指针被系统取消(触摸中断 / 指针离开窗口)或按 Esc:一律放弃本次拖拽、恢复原顺序。
function cancelDrag(event?: PointerEvent): void {
  if (dragIndex.value < 0) return
  // 纵向手势的取消走 onTearPointerCancel(它会撤销拆出并收尾)。
  if (dragAxis === 'y') return
  if (event !== undefined) {
    const slot = event.currentTarget
    if (slot instanceof HTMLElement && slot.hasPointerCapture(event.pointerId)) slot.releasePointerCapture(event.pointerId)
  }
  const wasDragging = dragId.value !== ''
  resetDrag()
  if (wasDragging) suppressClick = true
}

function onDragKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || dragIndex.value < 0) return
  event.preventDefault()
  event.stopPropagation()
  if (dragAxis === 'y') {
    cancelTear()
    endTearDrag()
    return
  }
  cancelDrag()
}

// 把可见段按 [from, to] 重排,隐藏项保持原相对顺序接在其后;交出**完整**的新顺序给页面写回成员。
// 顺序的单位是**复合窗体键**(与区域成员同一口径),页面据此直接写回成员数组。
function commitReorder(from: number, to: number): void {
  const keys = visibleTabs.value.map((session) => windowKeyOf(session))
  const moved = keys[from]
  if (moved === undefined) return
  keys.splice(from, 1)
  keys.splice(to, 0, moved)
  const movedSet = new Set(keys)
  const rest = tabSessions.value.map((session) => windowKeyOf(session)).filter((key) => !movedSet.has(key))
  emit('reorder', [...keys, ...rest])
}

// 键盘重排:移动一位 + 播报 + 焦点跟随被移动的 tab。
function moveTab(from: number, to: number): void {
  const count = visibleTabs.value.length
  if (to < 0 || to >= count || to === from) return
  const moved = visibleTabs.value[from]
  if (moved === undefined) return
  commitReorder(from, to)
  announce(moved.title, to, count)
  void nextTick(() => focusTab(moved.id))
}

// tab 上的「拆出」按钮(WCAG 2.5.7 的非拖拽通路):把该 tab 的屏幕矩形一并交给页面。
// 快捷键那条通路复用同一个 emit,只是矩形从 DOM 里现取(点不到 event.currentTarget)。
// 抛给页面的是**复合窗体键**(窗体的真实身份),DOM 查询仍用会话 id(data-tab-id)。
function emitPop(session: ChatSession): void {
  const slot = tabsRef.value?.querySelector<HTMLElement>(`.conversation-tab[data-tab-id="${CSS.escape(session.id)}"]`)?.closest('.tab-slot') ?? null
  const rect = slot instanceof HTMLElement ? slot.getBoundingClientRect() : null
  emit('tear-pop', windowKeyOf(session), rect === null
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
}

function onTabPop(event: MouseEvent, session: ChatSession): void {
  const slot = event.currentTarget instanceof Element ? event.currentTarget.closest('.tab-slot') : null
  const rect = slot instanceof HTMLElement ? slot.getBoundingClientRect() : null
  emit('tear-pop', windowKeyOf(session), rect === null
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
}

function announce(title: string, index: number, total: number): void {
  // 只把「发生了什么」报给页面 —— 播报区是全页唯一的那一条,由页面持有(见 emits 说明)。
  emit('announce', t.value.workspace.tabMoved
    .replace('{title}', title)
    .replace('{index}', String(index + 1))
    .replace('{total}', String(total)))
}

// 拖拽结束后紧跟的 click 需要被吞掉(不改活动会话);其余情况正常选中。
function onTabClick(session: ChatSession): void {
  if (suppressClick) {
    suppressClick = false
    return
  }
  emit('select', session)
}

// **双击 tab = 把这段对话拆出为悬浮窗体**:与 tab 上那枚拆出钮、快捷键 Ctrl/Cmd+Shift+M
// 走**同一条**通路(同一个 tear-pop、同一份来源矩形),只是多了一条指针入口。单击仍照常选中
// (双击的第一次单击就是选中),不加延迟判定去躲开 —— 与文件 tab、与 Obsidian / VS Code 的
// tab 双击语义一致。原有非拖拽通路一条不动(WCAG 2.5.7 要求的是「存在等价通路」)。
function onTabDblClick(event: MouseEvent, session: ChatSession): void {
  onTabPop(event, session)
}

// 槽位的位移:被拖的跟随指针(轻微抬升),其余让位(让出 / 让入一格)。只用 transform。
// 纵向拆出那一支不做重排预览 —— 被拖的 tab 会从条上摘掉,其余不必让位。
function slotTransform(index: number): string | undefined {
  const tab = visibleTabs.value[index]
  if (tab === undefined) return undefined
  if (dragId.value === windowKeyOf(tab)) return dragAxis === 'y' ? undefined : `translate(${dragOffsetX.value}px, var(--dl-lift-hover))`
  if (dragId.value === '' || dragAxis === 'y') return undefined
  const span = slotWidth + tabGap.value
  const from = dragIndex.value
  const to = dropIndex.value
  if (from < to && index > from && index <= to) return `translateX(${-span}px)`
  if (from > to && index >= to && index < from) return `translateX(${span}px)`
  return undefined
}

// ---- 菜单(disclosure:命名容器 + 原生按钮行)----
const isSearchActive = computed(() => props.searchQuery.trim().length > 0)
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
const shortcutHint = computed(() => (isMac ? '⌘K' : 'Ctrl K'))
const groupTitle = (template: string, count: number): string => template.replace('{count}', String(count))
// 关闭钮的可访问名 = 「关闭 + 该 tab 的标题」,唯一可辨别(多个关闭钮不能都叫「关闭」)。
const closeLabel = (title: string): string => t.value.workspace.closeTab.replace('{title}', title)
// 「拆出」钮的可访问名 = 「把 {name} 拆出为悬浮窗口」({name} = 会话标题)——与文件栏同一套词条。
const popLabel = (title: string): string => t.value.workspace.fileBar.popOut.replace('{name}', title)
// 悬停 title:当前语言文案 + 快捷键(按钮已不在 Tab 序,快捷键是它的键盘通路)。
const popTitle = (title: string): string => t.value.workspace.fileBar.popOutTitle.replaceAll('{name}', title)
// tab 的 aria-actions:指向与它平级的行内控件(拆出钮与关闭钮恒在 —— 关闭钮不再随数量消失)。
function tabActions(tab: ChatSession): string {
  return [`conversation-pop-${tab.id}`, `conversation-close-${tab.id}`].join(' ')
}

function rowElements(): HTMLElement[] {
  return Array.from(panelRef.value?.querySelectorAll<HTMLElement>('[data-conversation-option]') ?? [])
}

async function scrollActiveIntoView(): Promise<void> {
  await nextTick()
  const current = panelRef.value?.querySelector<HTMLElement>('[data-conversation-option][aria-current="true"]')
  current?.scrollIntoView({ block: 'nearest' })
}

function requestOpen(next: boolean): void {
  emit('update:open', next)
}

function close(restoreFocus: boolean): void {
  if (!props.open) return
  if (panelRef.value !== null) panelRef.value.inert = true
  requestOpen(false)
  if (restoreFocus) menuTriggerRef.value?.focus()
}

function togglePanel(): void {
  if (props.open) close(false)
  else {
    // ▾ 菜单与 ＋ 的选择菜单互斥。
    closeAdd(false)
    requestOpen(true)
  }
}

function onSelect(session: ChatSession): void {
  emit('select', session)
  close(true)
}

function onSelectHit(hit: ConversationSearchHit): void {
  emit('select-hit', hit)
  close(true)
}

function onSearchInput(event: Event): void {
  const target = event.target
  if (target instanceof HTMLInputElement) emit('search-input', target.value)
}

// 菜单键盘:Esc 关面板并归还焦点(阻止冒泡,免得窄屏抽屉的 document 级 Escape 一并关掉抽屉);
// ↑/↓ 在搜索框与行之间移动,Home/End 到首 / 末行。
function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (!props.open) return
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  const rows = rowElements()
  if (rows.length === 0) return
  const index = rows.findIndex((row) => row === document.activeElement)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (index === -1) rows[0]?.focus()
    else rows[Math.min(index + 1, rows.length - 1)]?.focus()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (index <= 0) searchRef.value?.focus()
    else rows[index - 1]?.focus()
  } else if (event.key === 'Home') {
    event.preventDefault()
    rows[0]?.focus()
  } else if (event.key === 'End') {
    event.preventDefault()
    rows.at(-1)?.focus()
  }
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  // ＋ 选择菜单:焦点离开展开区就收起;回到 ＋ 自身不算离开。
  if (!(next instanceof Node && addRootRef.value?.contains(next) === true)) closeAdd(false)
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  close(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  // ＋ 选择菜单:点它外面(含标题行其它位置)就收起。
  if (!(target instanceof Node && addRootRef.value?.contains(target) === true)) closeAdd(false)
  if (target instanceof Node && rootRef.value?.contains(target) === true) return
  close(false)
}

// 打开:聚焦搜索框并把当前会话那行滚入可见区;关闭:复位搜索词(保留转录里的命中高亮 ——
// 点命中会关面板,若这里清高亮,刚跳转并高亮的那一轮会被立刻抹掉)。
watch(() => props.open, async (isOpen, wasOpen) => {
  if (isOpen) {
    await nextTick()
    searchRef.value?.focus()
    await scrollActiveIntoView()
  } else if (wasOpen) {
    emit('reset-search')
  }
})

let observer: ResizeObserver | undefined

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDragKeydown)
  measureStrip()
  const heading = tabsRef.value?.closest('.conversation-heading')
  if (heading instanceof HTMLElement && typeof ResizeObserver !== 'undefined') {
    // 回调**推迟到下一帧**:两组的可用宽互为对方实占宽,同步回调会在同一帧内互相触发,
    // 浏览器随之报「ResizeObserver loop completed with undelivered notifications」(实测)。
    // 隔一帧再量,布局已经落定,既不再报错也能收敛。
    observer = new ResizeObserver(() => { requestAnimationFrame(() => measureStrip()) })
    observer.observe(heading)
    // 也观察**文件那一组**:它与本组共享行宽,而两组的可用宽互为对方实占宽 —— 只观察顶部行
    // 会在「行宽不变、对方变宽」时漏信号(对方变宽不会改变行宽),于是本组留着过时的可用宽、
    // 两组加起来超出行宽(实测 375px 下溢出 29px)。观察对方即补上这一半的信号。
    // 也观察文件组:它变宽 / 变窄会改变本组该让出多少 —— 但本组只**读**它的个数(见 measureStrip
    // 里的单向定额),不读它的实占宽,故不会形成互追。
    const fileGroup = heading.querySelector('.file-bar')
    if (fileGroup instanceof HTMLElement) observer.observe(fileGroup)
  }
  window.addEventListener('resize', measureStrip)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDragKeydown)
  observer?.disconnect()
  window.removeEventListener('resize', measureStrip)
})
</script>

<template>
  <!-- 根是 display: contents:下面的 tablist / ＋ / 菜单钮 / h1 成为 .conversation-heading 的
       直接 flex 子项,浮层则锚到会话头(最近的可定位祖先)。 -->
  <div ref="rootRef" class="conversation-tabs-root" @focusout="onFocusOut">
    <div ref="tabsRef" class="conversation-tabs" role="tablist" :aria-label="t.workspace.conversations" @keydown="onTabsKeydown">
      <!-- 每个 tab 包一层槽位。理由:HTML 不允许 <button> 里再嵌 <button>,而关闭钮必须是个按钮;
           故按 APG「Tabs with Action Buttons」的做法,关闭钮与 tab **平级**,并用 tab 上的
           aria-actions 指向它。槽位 role="presentation" 使 tablist 的「拥有子项」仍是 tab 本身;
           槽位也承担定位上下文 —— 关闭钮绝对定位压在 tab 右侧预留的槽里,出现时不改变任何 tab 的宽度与位置。 -->
      <div
        v-for="(tab, index) in visibleTabs"
        :key="tab.id"
        class="tab-slot"
        role="presentation"
        :data-selected="tab.id === activeId"
        :class="{ 'is-dragging': windowKeyOf(tab) === dragId }"
        :style="{ width: `${tabWidth}px`, transform: slotTransform(index) }"
        @pointerdown="onTabPointerDown($event, index)"
        @pointermove="onTabPointerMove"
        @pointerup="onTabPointerUp"
        @pointercancel="cancelDrag($event)"
      >
        <button
          :id="`conversation-tab-${tab.id}`"
          :data-tab-id="tab.id"
          role="tab"
          class="conversation-tab"
          :class="identityClassOfProject(tab.projectId)"
          :data-pulsing="windowKeyOf(tab) === pulseKey ? 'true' : undefined"
          :aria-selected="tab.id === activeId"
          :tabindex="tab.id === tabStopId ? 0 : -1"
          :aria-actions="tabActions(tab)"
          :aria-controls="panelId"
          :title="tabTitle(tab)"
          @click="onTabClick(tab)"
          @dblclick="onTabDblClick($event, tab)"
          @focus="focusedTabId = tab.id"
        >
          <!-- 归属的**颜色通道**:贴容器左缘、通高的一条 3px 标识色条。只作图形,不填整块 tab 底
               (填底会跟强调色争夺「可操作」的语义)。色号由按钮上的 .dl-identity-N 绑定类给出。 -->
          <span v-if="markOf(tab.projectId)" class="tab-identity" aria-hidden="true" />
          <!-- 前导状态槽:恒定 16px 占位,槽宽不随状态变化 —— 呼吸灯出现 / 消失时标签不位移。
               除了「正在产出」的呼吸圆点,这里不再画任何图形(其余状态见脚本里的规则注释)。 -->
          <span class="tab-status" :data-status="effectiveStatus(tab)" :data-icon="isProducing(tab) ? 'dot' : 'none'" aria-hidden="true">
            <span v-if="isProducing(tab)" class="tab-status__dot" />
          </span>
          <!-- 归属的**文字通道**(主通道,色觉障碍下唯一可用):项目缩写前缀,如「WR · README.md」。
               它必须始终可见,不能只藏在悬停里 —— 那等于在触屏与色觉障碍下不存在。 -->
          <span v-if="markOf(tab.projectId)" class="conversation-tab__mark" aria-hidden="true">{{ markOf(tab.projectId) }}</span>
          <span class="conversation-tab__label">{{ tab.title }}</span>
          <!-- 需要你介入 / 刚出结果的文字 Badge。用文字而不是图形:语义不依赖颜色(WCAG 1.4.1),
               两个档位只用来分出紧迫度。 -->
          <span v-if="tabBadge(tab)" class="tab-badge" :data-level="tabBadge(tab)?.level">{{ tabBadge(tab)?.text }}</span>
        </button>
        <!-- 「拆出」钮:拖拽之外的非拖拽通路(WCAG 2.5.7 —— 凡靠拖动手势完成的功能都要有
             非拖动的等价入口)。它是**真按钮**(指针可点、Enter 可触发),图标纯装饰,
             语义由 aria-label / title 承担;与关闭钮并排、同在悬停 / 聚焦时显现。
             它**不在 Tab 序里**(tabindex=-1):键盘通路改由快捷键 Ctrl/Cmd+Shift+M 承担
             (在 tab 条上按即把当前聚焦的 tab 拆出),故 tab 条上少一个重复的逐项停靠点。
             title 为当前语言文案,悬停即可读到快捷键(见 aria-keyshortcuts)。 -->
        <button
          :id="`conversation-pop-${tab.id}`"
          type="button"
          class="tab-pop"
          tabindex="-1"
          :aria-keyshortcuts="TEAR_OUT_KEYSHORTCUTS"
          :aria-label="popLabel(tab.title)"
          :title="popTitle(tab.title)"
          @click="onTabPop($event, tab)"
        >
          <DliIcon name="window" size="sm" />
        </button>
        <!-- 关闭钮:很小很轻(24×24),不进 Tab 顺序(tabindex=-1),但仍是可访问的
             (aria-actions 由 tab 指向它 + 自有 aria-label)。恒常渲染 —— 每块区域功能完全一样,
             关掉最后一个 tab 由页面把清空的区域摘除 / 回落到引导页,关闭钮不该在任何数量下消失。 -->
        <button
          :id="`conversation-close-${tab.id}`"
          type="button"
          class="tab-close"
          tabindex="-1"
          :aria-label="closeLabel(tab.title)"
          @click="emit('close', windowKeyOf(tab))"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
    <!-- 文件那一组(toolbar + aria-pressed 切换按钮)由页面经默认插槽交进来,位置固定在
         对话 tablist 之后、＋ 之前 —— 「先对话、后文件」的分组次序因此是结构决定的,不靠 CSS 调序。 -->
    <slot />
    <!-- ＋:不再是单一动作,而是「新建对话 / 打开文件」二选一。点击打开一个两行的轻菜单,
         选完即收起;菜单锚在 ＋ 自己身上,右缘对齐(＋ 靠近标题行右侧,左对齐会越出窄屏)。 -->
    <div ref="addRootRef" class="workspace-tab-add">
      <button
        ref="newChatRef"
        type="button"
        class="conversation-icon-button workspace-tab-add__trigger"
        :disabled="disabled"
        :aria-label="addLabel"
        :title="addLabel"
        aria-haspopup="menu"
        :aria-expanded="addOpen"
        :aria-controls="`${menuPanelId}-add`"
        @click="toggleAdd"
      ><span aria-hidden="true">＋</span></button>
      <Transition name="add-menu-pop">
        <div
          v-if="addOpen"
          :id="`${menuPanelId}-add`"
          ref="addMenuRef"
          class="workspace-tab-add__menu"
          role="menu"
          :aria-label="addLabel"
          @keydown="onAddKeydown"
        >
          <button type="button" class="workspace-tab-add__item" role="menuitem" :disabled="disabled" @click="chooseAddConversation">
            {{ t.workspace.addMenu.conversation }}
          </button>
          <button type="button" class="workspace-tab-add__item" role="menuitem" :disabled="disabled" @click="chooseAddFile">
            {{ t.workspace.addMenu.file }}
          </button>
        </div>
      </Transition>
    </div>
    <!-- 右侧工具簇:整组最小化 + ▾。整簇用 auto 外边距钉到会话头右缘 —— 菜单钮仍是
         最右一项(既有「▾ 钉右缘」的布局约定不变),最小化钮紧贴在它左侧。
         最小化只用一个横线图标 + 可访问名,不占标签文字宽度。 -->
    <div class="conversation-heading__actions">
      <button
        v-if="surfaceTabCount > 0 && canShowMinimize"
        type="button"
        class="conversation-icon-button conversation-minimize"
        :aria-label="minimizeLabel"
        :title="minimizeLabel"
        @click="emit('minimize-surface')"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 12h12" /></svg>
      </button>
      <button
        ref="menuTriggerRef"
        type="button"
        class="conversation-icon-button conversation-menu__trigger"
        :aria-expanded="open"
        :aria-controls="menuPanelId"
        :aria-label="menuTriggerLabel"
        @click="togglePanel"
      >
        <svg class="conversation-menu__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        <span v-if="menuBadge" class="conversation-menu__count" :data-level="menuBadge.level" aria-hidden="true">{{ menuBadge.text }}</span>
      </button>
    </div>
    <Transition name="conversation-menu-pop">
      <div
        v-if="open"
        :id="menuPanelId"
        ref="panelRef"
        class="conversation-menu__panel"
        role="dialog"
        :aria-label="t.workspace.conversations"
        @keydown="onMenuKeydown"
      >
        <div class="conversation-search">
          <DliIcon class="conversation-search__icon" name="search" size="sm" />
          <input
            ref="searchRef"
            type="text"
            class="conversation-search__input"
            name="conversation-search"
            :value="searchQuery"
            :aria-label="t.workspace.searchConversations"
            :placeholder="t.workspace.searchPlaceholder"
            autocomplete="off"
            @input="onSearchInput"
          >
          <button v-if="searchQuery" type="button" class="conversation-search__clear" :aria-label="t.workspace.clearSearch" @click="emit('clear-search')">×</button>
          <kbd v-else class="conversation-search__hint" aria-hidden="true">{{ shortcutHint }}</kbd>
        </div>
        <!-- 分类过滤:**两个 aria-pressed 的切换钮**,不是 tab —— 它们不切换面板,只是过滤同一个列表
             (tab 语义留给「选项↔面板」的一对一关系)。 -->
        <div class="conversation-filter" role="group" :aria-label="t.workspace.switcher.filterLabel">
          <button type="button" class="conversation-filter__option" :aria-pressed="menuFilter === 'conversations'" @click="menuFilter = 'conversations'">{{ t.workspace.switcher.filterConversations }}</button>
          <button type="button" class="conversation-filter__option" :aria-pressed="menuFilter === 'files'" @click="menuFilter = 'files'">{{ t.workspace.switcher.filterFiles }}</button>
        </div>
        <div v-if="menuFilter === 'files'" class="conversation-list">
          <p v-if="props.files.length === 0 && closedFilePaths.length === 0" class="conversation-hint">{{ t.workspace.fileBar.menuEmpty }}</p>
          <section v-if="props.files.length > 0" class="conversation-group">
            <h2 class="conversation-group__title">{{ t.workspace.fileBar.openGroup.replace('{count}', String(props.files.length)) }}</h2>
            <button
              v-for="tab in props.files" :key="fileTabKey(tab)"
              type="button" class="conversation-row" data-file-option
              :aria-current="fileTabKey(tab) === activeFilePath ? 'true' : undefined"
              :aria-pressed="visibleFilePaths.includes(fileTabKey(tab))"
              @click="onSelectFileRow(fileTabKey(tab))"
            >
              <span class="conversation-row__main">
                <span class="conversation-row__name">{{ fileBaseName(tab.path) }}</span>
                <span v-if="fileChipLabel(tab)" class="entry-state" :data-state="fileStateOf(tab)">{{ fileChipLabel(tab) }}</span>
              </span>
              <span class="conversation-row__path">{{ fileRowPath(tab) }}</span>
            </button>
          </section>
          <section v-if="closedFilePaths.length > 0" class="conversation-group">
            <h2 class="conversation-group__title">{{ t.workspace.fileBar.recentClosed }}</h2>
            <button v-for="key in closedFilePaths" :key="key" type="button" class="conversation-row" data-file-option @click="onOpenRecentRow(key)">
              <span class="conversation-row__main"><span class="conversation-row__name">{{ closedFileBaseName(key) }}</span></span>
              <span class="conversation-row__path">{{ closedFileRowPath(key) }}</span>
            </button>
          </section>
        </div>
        <div v-else class="conversation-list">
          <template v-if="isSearchActive">
            <div v-if="isSearching" class="conversation-loading" :aria-label="t.workspace.loading"><NSkeleton text :repeat="3" :animated="false" /></div>
            <p v-else-if="searchHits.length === 0" class="conversation-hint">{{ t.workspace.searchEmpty }}</p>
            <template v-else>
              <button
                v-for="hit in searchHits"
                :key="`${hit.sessionId}-${hit.reason}`"
                type="button"
                class="hit-item"
                data-conversation-option
                :data-reason="hit.reason"
                @click="onSelectHit(hit)"
              >
                <span class="hit-title">{{ hit.title }}</span>
                <span v-if="hit.reason === 'body'" class="hit-snippet">{{ hit.snippet }}</span>
                <span class="hit-reason">{{ hit.reason === 'body' ? t.workspace.matchBody : t.workspace.matchTitle }}</span>
              </button>
            </template>
          </template>
          <template v-else>
            <div v-if="sessionsStatus === 'loading'" class="conversation-loading" :aria-label="t.workspace.loading"><NSkeleton text :repeat="3" :animated="false" /></div>
            <p v-else-if="sessionsStatus === 'error'" class="conversation-hint">{{ t.workspace.sessionsError }}</p>
            <p v-else-if="sessionsStatus === 'empty'" class="conversation-hint">{{ t.workspace.sessionsEmpty }}</p>
            <!-- 会话都在显示中时,列表会被过滤空(见 excludedSessionIds)—— 那是正常态,给一句说明,
                 而不是留一片空白。它与 sessionsEmpty 不是一回事:那个是「这个项目还没有对话」。 -->
            <p v-else-if="menuSessions.length === 0 && minimizableProjectIds.length === 0" class="conversation-hint">{{ t.workspace.sessionsAllDisplayed }}</p>
            <template v-else>
              <section v-if="awaitingSessions.length > 0" class="conversation-group">
                <h2 class="conversation-group__title">{{ groupTitle(t.workspace.awaitingGroup, awaitingSessions.length) }}</h2>
                <button
                  v-for="session in awaitingSessions"
                  :key="session.id"
                  type="button"
                  class="session-item"
                  data-conversation-option
                  :aria-current="session.id === activeId ? 'true' : undefined"
                  @click="onSelect(session)"
                >
                  <span class="session-title">{{ session.title }}</span>
                  <span v-if="session.preview" class="session-preview">{{ session.preview }}</span>
                  <span class="session-meta"><time :datetime="session.updatedAt">{{ formatTime(session.updatedAt) }}</time><span class="session-badge">{{ t.workspace.statusWords.waiting }}</span></span>
                </button>
              </section>
              <!-- **按项目分组**:候选不再只列一个项目的会话,每组组头带该项目的标识(色点 + 名称)。
                   「等待你」组在上、按项目分组在下,两组不重复。 -->
              <section
                v-for="group in projectGroups" :key="group.projectId"
                class="conversation-group" :class="group.badge?.identityClass"
              >
                <div class="conversation-group__heading">
                  <h2 class="conversation-group__title"><span class="conversation-group__dot" aria-hidden="true" />{{ groupLabel(group.badge, group.projectId, group.sessions.length) }}</h2>
                  <button v-if="minimizableProjectIds.includes(group.projectId)" type="button" class="conversation-group__minimize" :data-project-id="group.projectId" @click="emit('minimize-project', group.projectId); close(false)">{{ t.workspace.conversationGroupMinimize.replace('{count}', String(minimizableProjectCounts[group.projectId] ?? 0)) }}</button>
                </div>
                <button
                  v-for="session in group.sessions"
                  :key="session.id"
                  type="button"
                  class="session-item"
                  data-conversation-option
                  :aria-current="session.id === activeId ? 'true' : undefined"
                  @click="onSelect(session)"
                >
                  <span class="session-title">{{ session.title }}</span>
                  <span v-if="session.preview" class="session-preview">{{ session.preview }}</span>
                  <span class="session-meta"><time :datetime="session.updatedAt">{{ formatTime(session.updatedAt) }}</time></span>
                </button>
              </section>
            </template>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* display: contents:本组件不产生盒子,子项直接参与会话头的 flex 布局。 */
.conversation-tabs-root {
  display: contents;
}

/* tab 条:flex 0 1 auto —— 可见 tab 的宽度由脚本按可用宽算好,总数不会超出可用宽。
   overflow 取 visible(不用 hidden):tab 的 :focus-visible 焦点环是向外画的 box-shadow,
   一旦裁切会把环的上下两条边整条抹掉(基线 ⑦ 禁止吞焦点样式)。横向的「半截 tab」由脚本的
   宽度 clamp 保证(见 tabWidth),不靠裁切兜底。tab 之间留一档间隙(见 --workspace-tab-gap)。
   本行的形态跟随 Chrome 的 tab 设计轨迹:圆角矩形 + 间距,**不画任何分隔线**
   (圆角 tab 设计规范明确「圆角 tab 应关掉分隔线;quiet tabs 除选中指示外不画任何分隔线」)。 */
.conversation-tabs {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--workspace-tab-gap);
  overflow: visible;
}

/* ＋ 的选择菜单:＋ 本身仍是紧凑导航行的图标钮(32×32),外面这层只提供定位上下文。
   菜单右缘对齐 ＋ 的右缘 —— ＋ 靠近标题行右侧,左对齐会在 375 档越出视口。 */
.workspace-tab-add {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.workspace-tab-add__menu {
  position: absolute;
  inset-block-start: calc(100% + var(--dl-space-1));
  inset-inline-end: 0;
  z-index: var(--dl-z-overlay);
  min-inline-size: 180px;
  display: grid;
  gap: 1px;
  padding: var(--dl-space-1);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  background: var(--dl-bg-elevated);
  box-shadow: var(--dl-shadow-lg);
}

/* 菜单行:与其它下拉行同族(紧凑列表,36px 控件高),文字左对齐。 */
.workspace-tab-add__item {
  min-block-size: var(--dl-control-height);
  padding-inline: var(--dl-space-3);
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  text-align: start;
  white-space: nowrap;
}

.workspace-tab-add__item:hover:not(:disabled) { background: var(--dl-bg-hover); }
.workspace-tab-add__item:active:not(:disabled) { background: var(--dl-accent-soft); }
.workspace-tab-add__item:focus-visible { box-shadow: var(--dl-focus-ring); }
.workspace-tab-add__item:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }

.add-menu-pop-enter-active,
.add-menu-pop-leave-active {
  transition: opacity var(--dl-duration-fast) var(--dl-ease-standard), transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.add-menu-pop-enter-from,
.add-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--dl-space-1)));
}

/* 槽位:tab 的 flex 项外壳(宽度由脚本按可用宽写在槽位上,tab 填满它),同时是关闭钮的定位上下文。
   关闭钮绝对定位压在 tab 右侧预留的槽里,故它的出现**不改变 tab 的宽度与位置**(零重排)。
   role="presentation" 让 tablist 的「拥有子项」仍是 tab 本身(而不是这层包装 div)。 */
.tab-slot {
  position: relative;
  flex: 0 1 auto;
  display: flex;
  min-width: 0;
  /* 拖拽让位只走 transform(动效白名单);被拖的那枚加 .is-dragging 关掉过渡,直接跟手。 */
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.tab-slot.is-dragging {
  transition: none;
}

/* 单个 tab:圆角矩形(四角全圆,--dl-radius-md),固定 32px 高 —— 本仓设计语言的第三档触达尺寸:
   密集导航行内横排的控件;判据是 WCAG 2.5.8 的间距替代方案(相邻目标中心各画 24px 圆、两圆不相交),
   横排下天然成立(中心距 = 宽 + 间隙 ≫ 24)。见 .conversation-heading 里 --workspace-nav-control-size
   的取值依据。不再有贴边 / 压线 / 方角 —— tab 与内容区之间是留白间隔(间隔落在头部下内边距上)。
   右内边距**恒常预留**关闭钮的槽(--workspace-tab-reserved):悬停出现时零重排(禁止靠 :hover 改内边距)。 */
.conversation-tab {
  /* position: relative —— 提醒脉冲的环画在 ::after 上,需要一个定位上下文;
     同时是归属色条(绝对定位贴左缘)的定位上下文。overflow:hidden 让色条被圆角裁住,
     不越出 tab 的圆角轮廓(它只裁后代,不裁 tab 自己的外扩焦点环)。 */
  position: relative;
  overflow: hidden;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  block-size: var(--workspace-nav-control-size);
  padding-inline-start: var(--dl-space-3);
  padding-inline-end: var(--workspace-tab-reserved);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  font-weight: 400;
  text-align: start;
  /* 本 tab 同时承担**横向重排**与**向下拆出**两种指针手势,故两个轴都交给指针事件 ——
     否则纵向拖动会被浏览器当成滚动手势吞掉(拖出根本收不到 pointermove)。
     条这一行本身不可滚,代价只是「手指落在 tab 上时不能拖动页面」。 */
  touch-action: none;
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard), background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

/* 轻量分隔线:**只画在两个相邻的、都非活动的槽位之间**。紧邻活动 tab 的左右两侧、tab 条的首尾
   两端、以及最后一个 tab 与 ＋/▾ 之间都不画。槽位带 data-selected 表达 tab 的选中态,故判定移到
   槽位这一层 —— 自身非活动 + 右侧兄弟也非活动(`:has(+ …)`)才画;只约束一侧会在活动 tab 左侧多画
   一条(Vivaldi 社区那份改法踩过这个坑)。线画在**左侧槽位**的 ::after 上(落在两槽之间的缝里)。
   - 用**伪元素**画(绝对定位),不吃布局 —— 若改用 border / 背景,会改变 tab 宽度与位置,把等宽计算顶翻。
   - 上下内缩:高度取 tab 高的一半(--workspace-tab-divider),垂直居中 —— Material 3 的 inset divider
     手法(上下内缩、两侧留白)才是「轻量分隔」;顶满 tab 高就成了分栏。
   - 颜色用 --dl-border-base 这一档发丝色:比选中态(accent-soft 填充)弱,不抢眼。
     依据:Chrome 的分隔线只出现在非活动 tab 之间;分隔线规范「像布料上一道安静的接缝,
     若它成了最先被注意到的东西就是过火」;深色界面通则要求默认分隔线克制,更强对比留给选中 / 悬停 / 焦点环。 */
.tab-slot[data-selected='false']:has(+ .tab-slot[data-selected='false'])::after {
  content: '';
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: calc(-1 * (var(--workspace-tab-gap) / 2) - var(--dl-border-width) / 2);
  inline-size: var(--dl-border-width);
  block-size: var(--workspace-tab-divider);
  transform: translateY(-50%);
  background: var(--dl-border-base);
}

/* 关闭钮:很小很轻(24×24,密集行内控件的下限,正是本轮新开的那一档),✕ 字 12px。
   默认三级文字色、自身悬停 / 聚焦时提到一级 + --dl-bg-hover 底(与 Chrome 的关闭钮同做法)。
   可见性由槽位的 :hover / :focus-within 驱动 —— 键盘聚焦该 tab 时**也出现**(不许做成
   「只有 hover 才能发现」)。不进 Tab 顺序(tabindex=-1),但仍是可访问的(aria-actions + 自有 aria-label)。 */
.tab-close {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: var(--dl-space-1);
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-icon-lg);
  block-size: var(--dl-icon-lg);
  border-radius: var(--dl-radius-pill);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-tight);
  opacity: 0;
  transition: opacity var(--dl-duration-fast) var(--dl-ease-standard), color var(--dl-duration-fast) var(--dl-ease-standard), background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

/* 「拆出」钮:与关闭钮同尺寸(24×24)、同显现规则,排在关闭钮**左侧**(让开一个图标宽 + 一档间隙)。
   它是拖拽之外的非拖拽通路,但**不进 Tab 顺序**(tabindex=-1)——键盘通路改由快捷键
   Ctrl/Cmd+Shift+M 承担(WCAG 2.5.7 要求的是「存在非拖拽入口」,不要求在 Tab 序里)。 */
.tab-pop {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: calc(var(--dl-space-1) + var(--dl-icon-lg) + var(--dl-space-1));
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-icon-lg);
  block-size: var(--dl-icon-lg);
  border-radius: var(--dl-radius-pill);
  color: var(--dl-text-tertiary);
  opacity: 0;
  transition: opacity var(--dl-duration-fast) var(--dl-ease-standard), color var(--dl-duration-fast) var(--dl-ease-standard), background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.tab-slot:hover .tab-close,
.tab-slot:focus-within .tab-close,
.tab-slot:hover .tab-pop,
.tab-slot:focus-within .tab-pop {
  opacity: 1;
}

.tab-close:hover,
.tab-close:focus-visible,
.tab-pop:hover,
.tab-pop:focus-visible {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.tab-close:focus-visible,
.tab-pop:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.conversation-tab:hover:not([aria-selected='true']) {
  background: var(--dl-bg-hover);
}

.conversation-tab:active {
  transform: translateY(var(--dl-lift-press));
}

/* 拖动中不给被拖的 tab 加按压位移(位移已由槽位的 transform 承担,叠加会抖)。 */
.tab-slot.is-dragging .conversation-tab:active {
  transform: none;
}

.conversation-tab:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 活动 tab:青瓷浅底 + 文字提到一级 + 字重 500。**两个非颜色线索**(填充 + 字重)——
   a11y 规范要求「不要只靠颜色区分」,故字重这一档必须保留;不做任何下划线 / 底部伪元素。 */
.conversation-tab[aria-selected='true'] {
  background: var(--dl-accent-soft);
  color: var(--dl-text-primary);
  font-weight: 500;
}

/* 归属的**颜色通道**:贴容器左缘、通高的一条 3px 标识色条。var(--dl-identity) 由按钮上的
   .dl-identity-N 绑定类给出;只作图形,不填整块 tab 底。 */
.tab-identity {
  /* 选中态 tab 的底是 --dl-accent-soft(比页面底更亮):最暗的两枚标识色压在上面只有
     2.66:1,低于图形阈值 3:1。故选中态把色条向一级文字色混一档 —— 色相不变、仍读作
     同一个项目色,对比度却拉回 3:1 以上。权重放在自定义属性里,供回归用例读出来枚举
     全部 8 色(屏幕上同时只可能出现两三个项目的色条)。 */
  --identity-on-accent-weight: 75%;
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: var(--dl-identity-bar-width);
  background: var(--dl-identity);
  border-start-start-radius: var(--dl-radius-md);
  border-end-start-radius: var(--dl-radius-md);
}

/* color-mix 不被支持时整条声明失效,自动回落到上面的纯标识色(降级安全)。 */
.conversation-tab[aria-selected='true'] .tab-identity {
  background: color-mix(in srgb, var(--dl-identity) var(--identity-on-accent-weight), var(--dl-text-primary));
}

/* 归属的**文字通道**(主通道):项目缩写前缀,等宽、小号、二级文字色 —— 它是可读的实义文本,
   不靠颜色,故色觉障碍下依然读得出归属(WCAG 1.4.1)。 */
.conversation-tab__mark {
  flex-shrink: 0;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-secondary);
}

.conversation-tab__label {
  flex: 1 1 auto;
  /* 标题是 tab 的**身份**,任何宽度下都不许被徽标压没 —— 实测 160px 的 tab 里
     「响应完成」/「Response complete」会把标题压成 **0 宽**(tab 内容盒只有 88px:
     72px 被起首内边距与「拆出 / 关闭」恒常预留槽吃掉,余下再减去状态槽 16px 与两道 8px 间隙,
     装不下 56–115px 的徽标),结果是滑动时看不出是哪段对话。
     3.5em(13px 字号下 ≈ 45px,约三个汉字)是「至少读得出是哪一段」的下限;更窄交给省略号。 */
  min-width: 3.5em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 「显示一个已打开的窗体」时的提醒:一次性的短脉冲,随后回落为静态选中态。
   形态取自平台规范 —— 循环闪烁(Windows UX 指南「不要闪任务栏」)与抖动(NN/g 点名的
   needy pattern)都被劝退,被认可的是「一次、短、然后让元素稳定下来」。
   WCAG 2.3.1 的硬线是 1 秒内闪光 ≤3 次,故只闪**一次**;
   时长 900ms 与页面里的 PULSE_MS 必须一致(到点由页面把 pulseKey 清空)。
   只动 opacity —— 本仓动效白名单只允许 transform / opacity。900ms 超出动效档(140–280ms),
   因为那是**微交互**档;这条是「把视线引过来」的提醒类动效,与 tab 上那颗 1.8s 呼吸灯同族。 */
.conversation-tab[data-pulsing='true']::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 var(--dl-border-width) var(--dl-accent);
  pointer-events: none;
}

/* 降级是**替换**而不是删除(W3C C39 / MDN):reduced-motion 下不做淡入淡出,
   但那条静态强调描边仍然出现 900ms —— 提示不丢,只是不动。 */
@media (prefers-reduced-motion: no-preference) {
  .conversation-tab[data-pulsing='true']::after {
    animation: tab-attention 900ms var(--dl-ease-standard) 1 both;
  }
}

@keyframes tab-attention {
  0% { opacity: 0; }
  30% { opacity: 1; }
  100% { opacity: 0; }
}

/* tab 的前导状态槽与五种状态形状。图形 16px、对齐到固定槽宽(未活动 / 活动 tab 都有)。
   形状才是区分手段,颜色只作加固(每态与其 tab 底色 ≥3:1,见断言)。 */
.tab-status {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-icon-sm);
  block-size: var(--dl-icon-sm);
  color: var(--dl-text-secondary);
  /* 「响应中」的呼吸周期:组件级常量。设计 token 的动效档(140–280ms)只覆盖微交互,
     而「状态类」慢动效是另一回事 —— 1.8s 落在 Apple HIG「每秒 ≤1 次视觉变化」的安全区间内。 */
  --tab-status-pulse: 1.8s;
}
/* 槽里只剩「正在产出」的呼吸圆点,取强调色(可操作 / 进行中的语义色)。 */
.tab-status[data-icon='dot'] { color: var(--dl-accent); }
.tab-status__dot { inline-size: var(--dl-space-2); block-size: var(--dl-space-2); border-radius: var(--dl-radius-pill); background: currentColor; }
/* 文字 Badge:底用状态色的浅底、字用状态色本身 —— 成对出现在同一语义族内(与文件状态芯片同配方)。
   等待交互 = 警告档,输出完成 = 成功档;两者都靠**文字**表意,颜色只作加固。 */
.tab-badge {
  /* 徽标是**次要**信号(状态另有 ▾ 面板每行的状态词、Agent 栏的计数徽标两处承担,
     tab 自身的 title 里也写着状态词),但**次要 ≠ 可以截断**:截短会改变语义 ——
     英文 "Response complete" 截成 "Response…" 会被读成进行态,与真值相反(WCAG 1.4.1:
     这枚徽标存在的唯一理由就是「用文字而不是图形表意」,截到只剩省略号等于这个理由落空)。
     故按 `min-content` 设下限:它**永不缩短文字**,宁可溢进右侧那条「拆出 / 关闭」恒常预留槽
     —— 那条槽在静止时本来就是空的(零重排的代价),悬停时两枚按钮才会盖上来。
     实测最小 tab(160px,内容盒 88px)下标题 45.5 仍完整、徽标也完整(合计 138.5,
     越过内容盒 50px 但仍在 tab 的 border box 之内,不会压到相邻 tab)。 */
  flex: 0 1 auto;
  min-width: min-content;
  padding: 0 var(--dl-space-1);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  white-space: nowrap;
}
.tab-badge[data-level='warning'] { color: var(--dl-warning); background: var(--dl-warning-subtle); }
.tab-badge[data-level='success'] { color: var(--dl-success); background: var(--dl-success-subtle); }
/* 「响应中」的慢速呼吸:opacity 在 1 → 0.45 之间、周期 1.8s(安全阈值:每秒不超过一次视觉变化)。
   只用 opacity(动效白名单);不做缩放 / 旋转(Apple 的降级判据把 scaling / spinning 列为应改动项)。 */
.tab-status[data-icon='dot'] .tab-status__dot { animation: tab-status-breathe var(--tab-status-pulse) var(--dl-ease-standard) infinite; }
@keyframes tab-status-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
/* 降级动效、不消除动效:reduced-motion 下退成**静态**实心 accent 圆点。 */
@media (prefers-reduced-motion: reduce) {
  .tab-status[data-icon='dot'] .tab-status__dot { animation: none; }
}

/* ＋ 与菜单钮:与 .workspace-button 同一套按钮配方(同描边、同悬停 / 按压反馈),
   但**高度走紧凑导航行档**(32×32)——它们是 tab 条这一行的行内控件,与 tab 同档。
   固定 32×32(不用 min-*):溢出计算据此预留固定宽度,断言也据此量;文字 / 图标居中。 */
.conversation-icon-button {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--workspace-nav-control-size);
  block-size: var(--workspace-nav-control-size);
  padding: 0;
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary);
  background: var(--dl-bg-elevated);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.conversation-icon-button:hover:not(:disabled) {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.conversation-icon-button:active:not(:disabled) {
  transform: translateY(var(--dl-lift-press));
}

.conversation-icon-button:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.conversation-icon-button:disabled {
  cursor: not-allowed;
  color: var(--dl-text-disabled);
  background: var(--dl-bg-sunken);
}

/* 极窄显示区降级:先藏掉 ＋ 与最小化钮(▾ 是唯一的会话恢复入口,保留);
   再窄到连 ▾ 都放不下时整行控件全部让位 —— 不能让固定宽度的按钮把区域撑出文档级横向滚动。 */
@container (max-width: 180px) {
  .conversation-icon-button:not(.conversation-menu__trigger) { display: none; }
}
@container (max-width: 100px) {
  .conversation-menu__trigger { display: none; }
}

/* 条上的整组最小化钮:复用 ＋ / 菜单钮的紧凑图标钮配方,只画一条横线 ——
   语义由 aria-label / title 承担,不给 tab 条增加文字宽度。 */
.conversation-minimize svg {
  inline-size: var(--dl-icon-md);
  block-size: var(--dl-icon-md);
}

.conversation-minimize svg path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}

/* 右侧工具簇:整组最小化 + ▾。整簇用 auto 外边距钉到会话头右缘;簇内间隙与头部行一致,
   故 measureStrip 的预留仍按「两个 32px 控件 + 两段间隙」计。 */
.conversation-heading__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  margin-inline-start: auto;
}

/* 菜单钮:caret + 绝对定位的计数徽标(徽标不进盒模型,故菜单钮恒为 32×32 —— 溢出计算据此
   预留固定宽度,不受徽标文字长短影响)。它由外层 .conversation-heading__actions 钉到右缘;
   auto 外边距只吸收剩余空间 —— 它不改变 tab 条可用宽(measureStrip 的算法不受影响),
   也不挪动紧贴 strip 的 ＋:strip 满时 auto margin 为 0。 */
.conversation-menu__trigger {
  position: relative;
}

.conversation-menu__caret {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  color: var(--dl-text-secondary);
}

.conversation-menu__caret path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}

/* 计数徽标:挂在菜单钮的**右上角内侧**。它不向右侧溢出 —— 菜单钮已经钉在会话头内容右缘,
   再外溢会在 375 视口多出 0.5–1px 的 document scrollWidth(实测 375 分屏)。
   徽标不进盒模型,故菜单钮恒为 32×32 —— 溢出计算据此预留固定宽度,不受徽标文字长短影响。 */
.conversation-menu__count {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
  min-width: var(--dl-icon-sm);
  padding: 0 var(--dl-border-width);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  line-height: var(--dl-line-snug);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 被隐藏且等待-未看懂 —— 会丢掉的信号,走警告色(与 tab 徽标同族)。 */
.conversation-menu__count[data-level='warning'] {
  background: var(--dl-warning-subtle);
  color: var(--dl-warning);
}

/* 仅「有收起」的普通计数:三级文字色 + 描边,不抢警告色的语义。 */
.conversation-menu__count[data-level='plain'] {
  background: var(--dl-bg-sunken);
  color: var(--dl-text-tertiary);
}

/* 菜单浮层:锚到会话头(最近的可定位祖先),右缘对齐会话头内容右缘(= 菜单钮右缘),左对齐
   改为锚右缘 —— 触发钮现在在头部右侧,右对齐更自然。圆角取面板 / 浮层档 xl。 */
.conversation-menu__panel {
  position: absolute;
  inset-block-start: calc(100% + var(--dl-space-1));
  inset-inline-end: var(--conversation-heading-pad);
  z-index: var(--dl-z-overlay);
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  padding: var(--dl-space-4);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  box-shadow: var(--dl-shadow-lg);
}

/* 窄于 561px:面板横向铺满会话头内容宽,否则 375 下会溢出。 */
@media (max-width: 560px) {
  .conversation-menu__panel {
    inset-inline: var(--conversation-heading-pad);
    width: auto;
  }
}

.conversation-search {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  padding-inline: var(--dl-space-3);
  min-height: var(--dl-control-height);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background: var(--dl-bg-base);
}

.conversation-search:focus-within {
  border-color: var(--dl-border-strong);
  box-shadow: var(--dl-focus-ring);
}

.conversation-search__icon {
  flex-shrink: 0;
  color: var(--dl-text-secondary);
}

.conversation-search__input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--dl-text-primary);
  font: inherit;
}

/* 焦点环只留**外层**那一圈(画在容器描边外侧的 .conversation-search:focus-within 上)。
   输入框自身是透明无框的,若再继承全局 :focus-visible 的 box-shadow,就会与容器那圈叠加成
   「双层青瓷框」;故这里显式抹掉,让输入框在聚焦时保持无自身描边(容器描边始终是中性发丝线)。 */
.conversation-search__input:focus,
.conversation-search__input:focus-visible {
  outline: none;
  box-shadow: none;
}

.conversation-search__input::placeholder {
  color: var(--dl-text-secondary);
}

.conversation-search__clear {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-icon-lg);
  height: var(--dl-icon-lg);
  margin-inline-end: calc(-1 * var(--dl-space-1));
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-md);
  border-radius: var(--dl-radius-sm);
}

.conversation-search__clear:hover {
  color: var(--dl-text-primary);
}

.conversation-search__clear:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.conversation-search__hint {
  flex-shrink: 0;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* 分类过滤:两个 aria-pressed 的切换钮(选中 = 实心强调,未选 = 描边) */
.conversation-filter {
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  padding: 0 var(--dl-space-2) var(--dl-space-2);
}
.conversation-filter__option {
  padding: var(--dl-space-1) var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  cursor: pointer;
}
.conversation-filter__option:hover { background: var(--dl-bg-hover); }
.conversation-filter__option:focus-visible { outline: var(--dl-focus-width) solid var(--dl-focus-ring); outline-offset: var(--dl-focus-offset); }
.conversation-filter__option[aria-pressed='true'] { border-color: transparent; background: var(--dl-accent); color: var(--dl-text-on-accent); }

/* 文件行:两段式,与 ▾ 里其它行同形(主行文件名 + 状态芯片,次行域内目录路径)。 */
.conversation-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  text-align: start;
  padding: var(--dl-space-2);
  border: 0;
  border-radius: var(--dl-radius-sm);
  background: transparent;
  cursor: pointer;
}
.conversation-row:hover { background: var(--dl-bg-hover); }
.conversation-row:focus-visible { outline: var(--dl-focus-width) solid var(--dl-focus-ring); outline-offset: var(--dl-focus-offset); }
.conversation-row[aria-current='true'] { background: var(--dl-accent-soft); }
.conversation-row__main { display: flex; align-items: center; gap: var(--dl-space-2); min-width: 0; }
.conversation-row__name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--dl-font-size-sm); color: var(--dl-text-primary); }
.conversation-row__path { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); color: var(--dl-text-tertiary); }

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  min-height: 0;
  max-height: min(60vh, 480px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.conversation-group__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-2); }
.conversation-group__minimize { min-height: var(--dl-target-size); padding: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.conversation-group__minimize:hover { background: var(--dl-bg-hover); }
.conversation-group__minimize:focus-visible { box-shadow: var(--dl-focus-ring); }
.conversation-group__minimize:active { background: var(--dl-accent-soft); }
.conversation-group {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
}

.conversation-group__title {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-text-tertiary);
  padding: var(--dl-space-1) var(--dl-space-1) 0;
}

/* 组头的**项目标识色点**:var(--dl-identity) 由所在 section 的 .dl-identity-N 绑定类给出。
   组头既写项目名(文字通道)又带色点(颜色通道),归属不依赖单一通道。 */
.conversation-group__dot {
  flex-shrink: 0;
  inline-size: var(--dl-identity-dot-size);
  block-size: var(--dl-identity-dot-size);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-identity);
}

.conversation-hint {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
}

.conversation-loading {
  display: grid;
  gap: var(--dl-space-4);
}

.session-item {
  flex-shrink: 0;
  width: 100%;
  min-height: var(--dl-target-size);
  padding: var(--dl-space-3);
  text-align: left;
  border: var(--dl-border-width) solid transparent;
  border-radius: var(--dl-radius-md);
  display: grid;
  gap: var(--dl-space-1);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.session-item:hover,
.hit-item:hover {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.session-item:active,
.hit-item:active {
  transform: translateY(var(--dl-lift-press));
}

.session-item:focus-visible,
.hit-item:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.session-item[aria-current='true'] {
  border-color: var(--dl-border-strong);
  border-inline-start: var(--dl-space-1) solid var(--dl-accent);
  background: var(--dl-accent-soft);
}

.session-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
}

.session-preview {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
}

.session-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  font-variant-numeric: tabular-nums;
}

.session-badge {
  padding: 0 var(--dl-space-2);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-warning-subtle);
  color: var(--dl-warning);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
}

.hit-item {
  flex-shrink: 0;
  width: 100%;
  min-height: var(--dl-target-size);
  padding: var(--dl-space-3);
  text-align: left;
  border: var(--dl-border-width) solid transparent;
  border-radius: var(--dl-radius-md);
  display: grid;
  gap: var(--dl-space-1);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.hit-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
}

.hit-snippet {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
}

.hit-reason {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
}

.conversation-menu-pop-enter-active,
.conversation-menu-pop-leave-active {
  transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard);
}

.conversation-menu-pop-enter-from,
.conversation-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--dl-space-1)));
}

@media (prefers-reduced-motion: reduce) {
  /* 重排仍然发生,只去掉让位 / 跟手的位移过渡(降级不取消功能)。 */
  .tab-slot {
    transition: none;
  }

  .add-menu-pop-enter-active,
  .add-menu-pop-leave-active {
    transition: none;
  }

  .conversation-tab:active,
  .conversation-icon-button:active:not(:disabled),
  .session-item:active,
  .hit-item:active {
    transform: none;
  }
}
</style>
