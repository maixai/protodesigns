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
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

// 会话列表的异步四态与页面里的 sessionStatus 同型;这里只用它决定菜单内的占位渲染。
type SessionsStatus = 'loading' | 'ready' | 'empty' | 'error'

// disabled 可选:生成 / 保存中锁定切换,避免与正在进行的生成争用同一份工作台状态。
const props = defineProps<{
  sessions: ChatSession[]
  sessionsStatus: SessionsStatus
  searchQuery: string
  searchHits: ConversationSearchHit[]
  isSearching: boolean
  activeId: string
  // 已「打开过」的会话集合(视图状态,不进契约):某会话在 awaiting / completed 期间成为活动
  // 会话即记入 —— 这两个状态需要一个「已看过」的信号来收起它的提示图标。菜单「等待你」组同用。
  seenSessions: Set<string>
  // 活动会话的**实时**状态:排队 / 流式时页面给 streaming、完成时给 completed;null 表示回落取
  // 会话自身的 status。其余会话的状态一律来自 mock 种子(页面不干预)。
  activeStatus: SessionStatus | null
  // 已**关闭**的会话集合(视图状态,不进契约):关闭只是把会话从 tab 条撤下,会话本身仍在列表里,
  // 可从 ▾ 面板重新打开(浏览器同构:关标签页不删网页)。默认空 = 全部打开。
  closedIds: Set<string>
  // 行内时间戳的格式化(随当前语言),由页面传入,避免两处各写一份日期格式。
  formatTime: (timestamp: string) => string
  // 视觉隐藏的 h1 文字 = 活动会话标题(整页不能因可见标题改由 tab 承担而丢掉 h1)。
  activeTitle: string
  open: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [session: ChatSession]
  'select-hit': [hit: ConversationSearchHit]
  'search-input': [value: string]
  'clear-search': []
  'reset-search': []
  'new-chat': []
  close: [id: string]
  'update:open': [open: boolean]
}>()

const { t } = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const tabsRef = ref<HTMLElement | null>(null)
const menuTriggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)

// 全部会话按**最近更新**倒序:tab 条与菜单共用这一份顺序,tab 不因等待状态跳位。
const orderedSessions = computed(() => [...props.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
// 「打开集」= 会话列表里未关闭的那些。tab 条只渲染打开集;▾ 面板照旧列出**全部**(含已关闭)。
const openSessions = computed(() => orderedSessions.value.filter((session) => !props.closedIds.has(session.id)))

// ---- tab 条的顺序(视图状态,不进契约)----
// manualOrder 记录用户在 tab 条上拖出 / 用快捷键排好的顺序。它**只作用于 tab 条(打开集)**;
// ▾ 面板列表仍按最近更新排序 —— 面板是「索引」(把全部会话按时间排出来便于查找),tab 条是「条」
// (用户手动排好的顺序不该被新活动冲掉,浏览器同款:空闲标签页不因活动时间变化而跳位)。
// 新出现(不在 manualOrder 里)的会话按最近更新排在手动顺序**之前** —— 新建 / 刚发消息的会话
// 因此仍排在最前,与「按最近更新」的默认观感一致。
const manualOrder = ref<string[]>([])
const tabSessions = computed(() => {
  const open = openSessions.value
  const byId = new Map(open.map((session) => [session.id, session]))
  const ordered = manualOrder.value.flatMap((id) => {
    const session = byId.get(id)
    return session === undefined ? [] : [session]
  })
  const known = new Set(ordered.map((session) => session.id))
  return [...open.filter((session) => !known.has(session.id)), ...ordered]
})

// 只剩一个打开项时不给关闭钮(浏览器同款:条上恒有 ≥1 个,不会出现空条)。
const canClose = computed(() => openSessions.value.length > 1)

// 「需要徽标 / 需要前置」的唯一判定:该会话在等待交互,且用户在它等待期间还没打开过它。
function isAwaitingUnseen(session: ChatSession): boolean {
  return session.status === 'awaiting' && !props.seenSessions.has(session.id)
}

// ---- tab 状态图标 ----
// 五个状态各一种**形状**(绝不只靠颜色 —— WCAG 1.4.1 的官方反例正是「红 / 黄 / 绿圆点表示状态」;
// 通过版本是「符号 + 颜色作辅助」):
//   new       sparkles 图形;streaming 实心圆点(CSS);awaiting  choiceCard 图形;
//   completed check 图形;   idle      空心圆环(CSS)。
// 实心点 / 空心环是「活动 / 静默」同族的两极,三个图形(sparkles / choiceCard / check)互不相似,
// 灰度下也能区分。颜色只作加固,且每个都 ≥3:1(WCAG 1.4.11 非文字对比,见断言)。
type TabIcon = 'sparkles' | 'dot' | 'choiceCard' | 'check' | 'ring'
const STATUS_ICON: Record<SessionStatus, TabIcon> = {
  new: 'sparkles',
  streaming: 'dot',
  awaiting: 'choiceCard',
  completed: 'check',
  idle: 'ring',
}

// 有效状态:活动会话若正被实时生成覆盖则用覆盖值,否则取会话自身的 status。
function effectiveStatus(session: ChatSession): SessionStatus {
  if (session.id === props.activeId && props.activeStatus !== null) return props.activeStatus
  return session.status
}

// awaiting / completed 是「需要你知道」的两态:看过之后图标不再显示(与菜单「等待你」组同一套
// 「已看过」判定);活动会话本身即在被看,故一律视为已看过。其余三态恒定显示。
function tabIcon(session: ChatSession): TabIcon | null {
  const status = effectiveStatus(session)
  if ((status === 'awaiting' || status === 'completed') && (session.id === props.activeId || props.seenSessions.has(session.id))) return null
  return STATUS_ICON[status]
}

// tab 的 title(鼠标悬停可读)= 标题 + 状态词。状态信息另由遥测条的 live region 与 ▾ 面板的文字
// 承担,故 tab 的**可访问名**(来自可见标签文字)不变,不影响既有按名字定位的断言。
function tabTitle(session: ChatSession): string {
  return `${session.title} · ${t.value.workspace.sessionStatus[effectiveStatus(session)]}`
}

const awaitingSessions = computed(() => orderedSessions.value.filter(isAwaitingUnseen))
// 菜单「本项目」组与「等待你」组不重复:已看过(或本就不等待)的会话落在这组。
const projectSessions = computed(() => orderedSessions.value.filter((session) => !isAwaitingUnseen(session)))

// ---- 溢出计算(简单、确定、可断言)----
// 调研:Telerik TabStrip 与 SAP Fiori 的 tabsOverflowMode 默认都是「超出部分收进末尾的『更多』
// 菜单」;Firefox 最小 tab 宽 76px(英文 / 图标语境),中文标题需要更宽,故 min 取 160(≈10 个汉字)。
// tab 等宽 + clamp 是把「不出现半截 tab」做成长度确定性保证的手段(CSS 表达不出「先按内容宽、
// 不够再收缩截断」,这是已知的 CSS 局限)。strip 由 ResizeObserver 观察会话头可用宽度重算。
const stripWidth = ref(0)
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
  // 预留:＋ 与菜单钮(各一个紧凑档尺寸)+ 两段间隙;窄屏还有汉堡钮与它的那段间隙。
  const reserved = target * 2 + gap * 2 + (isNarrow ? target + gap : 0)
  const contentWidth = heading.clientWidth - padStart - padEnd
  stripWidth.value = Math.max(0, contentWidth - reserved)
}

const visibleCount = computed(() => {
  const total = tabSessions.value.length
  if (total === 0) return 0
  if (stripWidth.value <= 0) return Math.min(total, 1)
  // n 个 tab 加 n-1 段间隙要装进 stripWidth:宽度 ≥ tabMin 时最多能放几个。
  const fits = Math.max(1, Math.floor((stripWidth.value + tabGap.value) / (tabMin.value + tabGap.value)))
  return Math.min(total, fits)
})

const tabWidth = computed(() => {
  if (visibleCount.value === 0) return tabMin.value
  // 等宽 = clamp((可用宽 − 间隙总宽) / 可见数, min, max);但当可用宽连 min 都放不下时(even < min),
  // 取 even —— 否则 tab 会宽过 strip、溢出条盒。min 是「目标」而非硬下限。
  const even = (stripWidth.value - tabGap.value * (visibleCount.value - 1)) / visibleCount.value
  if (even < tabMin.value) return even
  return Math.min(tabMax.value, even)
})

// 可见 tab:从**打开集**里取最近的前 visibleCount 条;**活动会话永远可见** —— 不在窗口内时用
// 活动 tab 顶掉最后一个可见项(被顶掉的进菜单)。可见顺序因此不严格等于时间序,这是有先例的
// 既定行为(Telerik 文档与实现范例都强调活动 tab 不能藏进「更多」)。
const visibleTabs = computed(() => {
  const list = tabSessions.value
  const count = visibleCount.value
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
  // from the tab list」)。不劫持 Ctrl/Cmd+W —— 那是浏览器的快捷键。
  if (event.key === 'Delete') {
    event.preventDefault()
    const session = tabs[index]
    if (session !== undefined && canClose.value) emit('close', session.id)
    return
  }
  // Ctrl+Shift+PageUp / PageDown:把聚焦的 tab 逐位左 / 右移。Chrome 与 Firefox 都用这一对
  // 快捷键做标签页重排(Firefox 另有 Ctrl+Home/End),纯拖拽对键盘用户不可达,故必须给这条通路。
  if (event.ctrlKey && event.shiftKey && (event.key === 'PageUp' || event.key === 'PageDown')) {
    event.preventDefault()
    moveTab(index, event.key === 'PageUp' ? index - 1 : index + 1)
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

// ---- tab 拖拽排序(Pointer Events + setPointerCapture)----
// 只用 transform 表达位移(动效白名单),不动任何布局属性;落点由「指针 x 落在哪个可见槽位的
// 区间」判定,并**钳到可见范围内** —— 条上被溢出隐藏的 tab 不参与本次拖拽(它们不在屏幕里,
// 拖过去也看不见落点)。顺序写入手动顺序(视图状态),见 tabSessions 注释。
const DRAG_THRESHOLD_PX = 4
const dragId = ref('')
const dragIndex = ref(-1)
const dropIndex = ref(-1)
const dragOffsetX = ref(0)
// 重排结果的 aria-live 播报文本(拖拽 / 快捷键都写它)—— 移动了却没有反馈,读屏用户完全感知不到。
const announcement = ref('')
// 「拖拽结束后紧跟的那一次 click」需要被抑制,否则会误切会话(浏览器同款:拖动后台标签页
// 不会切过去)。每次新的 pointerdown 复位;click 处理器消费后也复位。
let suppressClick = false
let dragStartX = 0
let dragPointerId = -1
// 拖拽开始时各可见槽位的左缘与等宽(落点判定基准)。transform 不影响已记录的左缘 —— 判定稳定。
let slotLefts: number[] = []
let slotWidth = 0

function resetDrag(): void {
  dragId.value = ''
  dragIndex.value = -1
  dropIndex.value = -1
  dragOffsetX.value = 0
  dragPointerId = -1
  slotLefts = []
  slotWidth = 0
}

function onTabPointerDown(event: PointerEvent, index: number): void {
  suppressClick = false
  if (event.button !== 0) return
  if (visibleTabs.value.length < 2) return
  // 关闭钮上按下不启动拖拽(点它是「关闭」,不是「拖动」)。
  const target = event.target
  if (target instanceof Element && target.closest('.tab-close') !== null) return
  const slot = event.currentTarget
  if (!(slot instanceof HTMLElement)) return
  const slots = Array.from(tabsRef.value?.querySelectorAll<HTMLElement>('.tab-slot') ?? [])
  if (slots.length !== visibleTabs.value.length) return
  slotLefts = slots.map((element) => element.getBoundingClientRect().left)
  slotWidth = slots[index]?.getBoundingClientRect().width ?? 0
  dragStartX = event.clientX
  dragPointerId = event.pointerId
  dragIndex.value = index
  dropIndex.value = index
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
  const delta = event.clientX - dragStartX
  // 移动超过阈值才判定为拖拽;否则仍是点击选中(浏览器同款:轻微抖动不该变成拖动)。
  if (dragId.value === '') {
    if (Math.abs(delta) < DRAG_THRESHOLD_PX) return
    const dragged = visibleTabs.value[dragIndex.value]
    const slot = event.currentTarget
    if (dragged === undefined || !(slot instanceof HTMLElement)) return
    // 确认是拖拽,此刻才捕获指针 —— 此后指针移出 tab 也收得到 move / up。
    slot.setPointerCapture(event.pointerId)
    dragId.value = dragged.id
  }
  dragOffsetX.value = delta
  dropIndex.value = resolveDropIndex(event.clientX)
}

function onTabPointerUp(event: PointerEvent): void {
  if (dragIndex.value < 0 || event.pointerId !== dragPointerId) return
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
  cancelDrag()
}

// 把可见段按 [from, to] 重排,隐藏项保持原相对顺序接在其后;写入手动顺序。
function commitReorder(from: number, to: number): void {
  const ids = visibleTabs.value.map((session) => session.id)
  const moved = ids[from]
  if (moved === undefined) return
  ids.splice(from, 1)
  ids.splice(to, 0, moved)
  const movedSet = new Set(ids)
  const rest = tabSessions.value.map((session) => session.id).filter((id) => !movedSet.has(id))
  manualOrder.value = [...ids, ...rest]
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

function announce(title: string, index: number, total: number): void {
  // 先清空再设置:连续两次相同文本不会重新触发播报。
  announcement.value = ''
  void nextTick(() => {
    announcement.value = t.value.workspace.tabMoved
      .replace('{title}', title)
      .replace('{index}', String(index + 1))
      .replace('{total}', String(total))
  })
}

// 拖拽结束后紧跟的 click 需要被吞掉(不改活动会话);其余情况正常选中。
function onTabClick(session: ChatSession): void {
  if (suppressClick) {
    suppressClick = false
    return
  }
  emit('select', session)
}

// 槽位的位移:被拖的跟随指针(轻微抬升),其余让位(让出 / 让入一格)。只用 transform。
function slotTransform(index: number): string | undefined {
  const tab = visibleTabs.value[index]
  if (tab === undefined) return undefined
  if (dragId.value === tab.id) return `translate(${dragOffsetX.value}px, var(--dl-lift-hover))`
  if (dragId.value === '') return undefined
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
  else requestOpen(true)
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
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  close(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
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
    observer = new ResizeObserver(() => measureStrip())
    observer.observe(heading)
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
        :class="{ 'is-dragging': tab.id === dragId }"
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
          :aria-selected="tab.id === activeId"
          :tabindex="tab.id === tabStopId ? 0 : -1"
          :aria-actions="canClose ? `conversation-close-${tab.id}` : undefined"
          aria-controls="conversation-panel-body"
          :title="tabTitle(tab)"
          @click="onTabClick(tab)"
          @focus="focusedTabId = tab.id"
        >
          <!-- 前导状态槽:固定 16px,未活动 / 活动 tab 都有。槽宽恒定,故「已看过」后隐藏图形时
               标签不位移。状态形状见脚本里 STATUS_ICON 的注释。 -->
          <span class="tab-status" :data-status="effectiveStatus(tab)" :data-icon="tabIcon(tab) ?? 'none'" aria-hidden="true">
            <DliIcon v-if="tabIcon(tab) === 'sparkles'" class="tab-status__glyph" name="sparkles" size="sm" />
            <DliIcon v-else-if="tabIcon(tab) === 'choiceCard'" class="tab-status__glyph" name="choiceCard" size="sm" />
            <DliIcon v-else-if="tabIcon(tab) === 'check'" class="tab-status__glyph" name="check" size="sm" />
            <span v-else-if="tabIcon(tab) === 'dot'" class="tab-status__dot" />
            <span v-else-if="tabIcon(tab) === 'ring'" class="tab-status__ring" />
          </span>
          <span class="conversation-tab__label">{{ tab.title }}</span>
        </button>
        <!-- 关闭钮:很小很轻(24×24),不进 Tab 顺序(tabindex=-1),但仍是可访问的
             (aria-actions 由 tab 指向它 + 自有 aria-label)。只剩一个打开项时不渲染。 -->
        <button
          v-if="canClose"
          :id="`conversation-close-${tab.id}`"
          type="button"
          class="tab-close"
          tabindex="-1"
          :aria-label="closeLabel(tab.title)"
          @click="emit('close', tab.id)"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
    <button class="conversation-icon-button" :disabled="disabled" :aria-label="t.workspace.newChat" @click="emit('new-chat')"><span aria-hidden="true">＋</span></button>
    <button
      ref="menuTriggerRef"
      type="button"
      class="conversation-icon-button conversation-menu__trigger"
      :aria-expanded="open"
      aria-controls="conversation-panel"
      :aria-label="menuTriggerLabel"
      @click="togglePanel"
    >
      <svg class="conversation-menu__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      <span v-if="menuBadge" class="conversation-menu__count" :data-level="menuBadge.level" aria-hidden="true">{{ menuBadge.text }}</span>
    </button>
    <!-- 视觉隐藏的 h1:可见标题改由 tab 承担,而 tab 是 widget 不是标题,整页不能因此丢掉 h1
         (否则侧栏的 h2/h3 会成为大纲起点)。 -->
    <h1 class="conversation-tabs__title">{{ activeTitle }}</h1>
    <!-- tab 重排的 aria-live 播报(拖拽 / Ctrl+Shift+PageUp/Down 都会写它)。只挂 aria-live,
         不加 role="status" —— 整页的状态区归遥测条独占,这里只是补一条读屏反馈。 -->
    <span class="conversation-tabs__live" aria-live="polite">{{ announcement }}</span>
    <Transition name="conversation-menu-pop">
      <div
        v-if="open"
        id="conversation-panel"
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
            :value="searchQuery"
            :aria-label="t.workspace.searchConversations"
            :placeholder="t.workspace.searchPlaceholder"
            autocomplete="off"
            @input="onSearchInput"
          >
          <button v-if="searchQuery" type="button" class="conversation-search__clear" :aria-label="t.workspace.clearSearch" @click="emit('clear-search')">×</button>
          <kbd v-else class="conversation-search__hint" aria-hidden="true">{{ shortcutHint }}</kbd>
        </div>
        <div class="conversation-list">
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
              <section v-if="projectSessions.length > 0" class="conversation-group">
                <h2 class="conversation-group__title">{{ groupTitle(t.workspace.projectGroup, projectSessions.length) }}</h2>
                <button
                  v-for="session in projectSessions"
                  :key="session.id"
                  type="button"
                  class="session-item"
                  data-conversation-option
                  :aria-current="session.id === activeId ? 'true' : undefined"
                  @click="onSelect(session)"
                >
                  <span class="session-title">{{ session.title }}</span>
                  <span v-if="session.preview" class="session-preview">{{ session.preview }}</span>
                  <span class="session-meta"><time :datetime="session.updatedAt">{{ formatTime(session.updatedAt) }}</time><span v-if="session.id === activeId" class="session-current">{{ t.workspace.current }}</span></span>
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
  /* 纵向留手势:横向拖动交给指针事件(重排),纵向仍可滚动页面。 */
  touch-action: pan-y;
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

.tab-slot:hover .tab-close,
.tab-slot:focus-within .tab-close {
  opacity: 1;
}

.tab-close:hover,
.tab-close:focus-visible {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.tab-close:focus-visible {
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

.conversation-tab__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
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
.tab-status__glyph { color: inherit; }
/* 颜色:每态一档语义 token —— 活动指示走强调色、等待交互走警告色、完成走成功色、
   新会话走二级文字色、空闲走三级文字色。 */
.tab-status[data-icon='sparkles'] { color: var(--dl-text-secondary); }
.tab-status[data-icon='dot'] { color: var(--dl-accent); }
.tab-status[data-icon='choiceCard'] { color: var(--dl-warning); }
.tab-status[data-icon='check'] { color: var(--dl-success); }
.tab-status[data-icon='ring'] { color: var(--dl-text-tertiary); }
/* 「响应中」= 实心圆点(CSS 画,不用图形);「等待对话」= 空心圆环。二者是同族两极。 */
.tab-status__dot { inline-size: var(--dl-space-2); block-size: var(--dl-space-2); border-radius: var(--dl-radius-pill); background: currentColor; }
.tab-status__ring { inline-size: var(--dl-space-3); block-size: var(--dl-space-3); border: var(--dl-border-width) solid currentColor; border-radius: var(--dl-radius-pill); }
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

/* 菜单钮:caret + 绝对定位的计数徽标(徽标不进盒模型,故菜单钮恒为 32×32 —— 溢出计算据此
   预留固定宽度,不受徽标文字长短影响)。
   `margin-inline-start: auto` 把菜单钮**钉到会话头右缘**(Salt 的 space-between 工具区;
   SAP Fiori:头部按钮一律右对齐)。auto 外边距只吸收剩余空间 —— 它不改变 tab 条可用宽
   (measureStrip 的算法不受影响),也不挪动紧贴 strip 的 ＋:strip 满时 auto margin 为 0。
   空出的那段宁可留白:它是「右侧留给后续放东西」的位置,不塞 spacer。 */
.conversation-menu__trigger {
  position: relative;
  margin-inline-start: auto;
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

/* 计数徽标:挂在菜单钮的**右上角内侧**,只向右侧溢出一点、不向上越出头部的上边缘
   (头部上内边距只有一档 4px,旧值 inset-block-start:-4px 会把徽标顶到头部上边缘)。
   徽标不进盒模型,故菜单钮恒为 32×32 —— 溢出计算据此预留固定宽度,不受徽标文字长短影响。 */
.conversation-menu__count {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: calc(-1 * var(--dl-space-1));
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

/* 视觉隐藏的 h1 与 aria-live 播报:对辅助技术可读,但不产生可见布局(标准 clip 方案)。 */
.conversation-tabs__title,
.conversation-tabs__live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
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

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  min-height: 0;
  max-height: min(60vh, 480px);
  overflow-y: auto;
}

.conversation-group {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
}

.conversation-group__title {
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-text-tertiary);
  padding: var(--dl-space-1) var(--dl-space-1) 0;
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

.session-current {
  color: var(--dl-accent);
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

  .conversation-tab:active,
  .conversation-icon-button:active:not(:disabled),
  .session-item:active,
  .hit-item:active {
    transform: none;
  }
}
</style>
