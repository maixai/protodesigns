<script setup lang="ts">
// 文件栏:输入框下方的一条,列出**当前会话**下已打开的文件。
//
// 交互语言**完全复用会话 tab 条**(用户拍板):关闭钮(悬停 / 聚焦出现)、可拖拽换位、
// 溢出时进 ▾ 菜单、roving tabindex、Delete 关闭聚焦项。差别有三:
//   ① 每个 tab 带上文件树里的状态芯片 —— 于是这条栏不只是「打开了什么」,而是「Agent 动过
//      哪些文件」的一览(芯片与文件树同源同值);
//   ② 预览槽用**斜体**表达「临时」(VS Code / Zed / JetBrains 三者一致的语义:单击预览、双击固定);
//   ③ 没有 ＋(文件不是「新建」出来的),菜单里多了「最近打开」区(关闭 ≠ 删除)。
//
// 组件是**受控的**:tabs / activePath / recent 由页面持有,组件只读并通过事件请求变更。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { FileTab } from '../data/windows'
import type { ProjectEntryStateId } from '../contracts/generated/project-entry'
import type { Project } from '../contracts/generated/project'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { fileBaseName, fileTabKey } from '../data/windows'
import { badgeMapOf } from '../data/project-identity'
import type { ProjectBadge } from '../data/project-identity'
import { TEAR_OUT_KEYSHORTCUTS, isTearOutShortcut } from '../data/shortcuts'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

// 拆出为悬浮窗体时交给页面的那一组几何:point = 窗体左上角应落到的点(已扣掉抓取偏移),
// origin = 被拖的那个 tab 在屏幕上的矩形(FLIP 的来源)。页面按 windowId 处理,与内容无关。
interface TabTearDetail {
  key: string
  point: { x: number; y: number }
  origin: WindowRect
}

const props = defineProps<{
  tabs: FileTab[]
  // 当前 Agent 已打开的全部项目 —— 用于解析每个文件 tab 的**归属标识**(项目缩写 + 标识色)。
  // 打开集跨项目,故出处必须由**每个 tab 自己**声明,不能靠在栏首标一次。
  projects: Project[]
  // 当前**聚焦**的文件(条上的高亮 / roving tabindex 的落点)。
  activeKey: string
  // 「显示一个已打开的窗体」时的提醒落点:与它同 key 的 tab 会短暂脉冲一次(见下方动画)。
  // 由页面持有并在一拍后清空 —— 组件不持有这个状态,它只负责把这一帧画出来。
  pulseKey?: string
  // 窗口**可见**的文件集合 —— 切换按钮的 aria-pressed 就是它(多窗口期可有多个同时按下)。
  visiblePaths: readonly string[]
  // 文件的状态芯片(新建 / 已改 / 待确认)。由页面按与文件树**同一条**规则派生后传入,
  // 于是芯片在「允许确认」后即时由 pending 变 modified,不必重取列表。
  // 入参是**整个 tab**(与栏上其它信息同源),不再是单个路径。
  stateOf: (tab: FileTab) => ProjectEntryStateId
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [key: string]
  close: [key: string]
  reorder: [order: string[]]
  'open-recent': [path: string]
  // 非拖拽通路(WCAG 2.5.7):tab 上那枚按钮把该文件拆出为悬浮窗体。origin = 该 tab 的屏幕矩形,
  // 供窗体做 FLIP 的来源(与鼠标拖出同一套结果)。
  'tear-pop': [key: string, origin: WindowRect]
  // 向下拖出:out = 判定为拆出(该 tab 从条上摘掉、内容成为悬浮窗体);move = 跟手位置;
  // cancel = 指针回到条内,撤销拆出;end = 本次拖拽收尾(松手 / 取消)。
  'tear-out': [detail: TabTearDetail]
  // point = 窗体左上角该落到的点(跟手用);pointer = 指针的视口坐标(落点判定用 —— 两者差一个抓取偏移)。
  'tear-move': [detail: { point: { x: number; y: number }; pointer: { x: number; y: number } }]
  'tear-cancel': []
  'tear-end': []
}>()

const { t } = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const tabsRef = ref<HTMLElement | null>(null)
const menuTriggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const isMenuOpen = ref(false)

// 状态芯片文案与文件树共用一套词条;none 不渲染芯片(无变化,不占宽度)。
function chipLabel(tab: FileTab): string | null {
  const state = props.stateOf(tab)
  if (state === 'none') return null
  return t.value.workspace.entryStates[state]
}

// ---- 归属标识(项目 → 缩写 / 名称 / 标识色绑定类) ----
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

// tab 的 title(悬停可读):文件名 · **项目名** · 项目内路径。
// 打开集**跨项目**共享,同名文件可能来自不同项目,故出处必须写全 —— 这正是归属的悬停补充通道。
function tabTitle(tab: FileTab): string {
  return `${fileBaseName(tab.path)} · ${projectNameOf(tab.projectId)} · ${tab.path}`
}

// 关闭钮的可访问名 = 「关闭 + 文件名」,多个关闭钮因此唯一可辨别(与会话 tab 同规则)。
function closeLabel(tab: FileTab): string {
  return t.value.workspace.fileBar.closeFile.replace('{name}', `${fileBaseName(tab.path)}`)
}

// 「拆出」按钮的可访问名 = 「拆出 + 文件名」。它是拖拽之外的非拖拽通路(WCAG 2.5.7),
// 故必须是一个真按钮(指针可点、Enter 可触发)。
function popLabel(tab: FileTab): string {
  return t.value.workspace.fileBar.popOut.replace('{name}', `${fileBaseName(tab.path)}`)
}

// 悬停 title:中英双语 + 快捷键(按钮已不在 Tab 序,快捷键是它的键盘通路)。
function popTitle(tab: FileTab): string {
  return t.value.workspace.fileBar.popOutTitle.replaceAll('{name}', `${fileBaseName(tab.path)}`)
}

// 「拆出」按钮的点击:把该 tab 的屏幕矩形一并交给页面(窗体 FLIP 的来源)。
function emitPop(tab: FileTab): void {
  const slot = tabsRef.value?.querySelector<HTMLElement>(`.file-tab[data-file-key="${CSS.escape(fileTabKey(tab))}"]`)?.closest('.file-tab-slot') ?? null
  const rect = slot instanceof HTMLElement ? slot.getBoundingClientRect() : null
  emit('tear-pop', fileTabKey(tab), rect === null
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
}

function onTabPop(event: MouseEvent, tab: FileTab): void {
  const slot = event.currentTarget instanceof Element ? event.currentTarget.closest('.file-tab-slot') : null
  const rect = slot instanceof HTMLElement ? slot.getBoundingClientRect() : null
  emit('tear-pop', fileTabKey(tab), rect === null
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
}

// ---- 溢出计算(与会话 tab 条同一套算法:等宽 + clamp,不出现半截 tab)----
const stripWidth = ref(0)
const tabMin = ref(140)
const tabMax = ref(220)
const tabGap = ref(4)

function measureStrip(): void {
  if (!(tabsRef.value instanceof HTMLElement)) return
  const style = getComputedStyle(tabsRef.value)
  tabGap.value = Number.parseFloat(style.columnGap) || 0
  const rootStyle = rootRef.value === null ? null : getComputedStyle(rootRef.value)
  tabMin.value = Number.parseFloat(rootStyle?.getPropertyValue('--file-tab-min') ?? '') || 140
  tabMax.value = Number.parseFloat(rootStyle?.getPropertyValue('--file-tab-max') ?? '') || 220
  // 本组的可用宽**由会话栏单向给出**:顶部行里两组共享宽度,互相读对方的实占宽会互追
  // (实测 375px 下互相挤成 0 再回弹,浏览器还报 ResizeObserver loop)。会话栏手里有行的度量,
  // 由它一次算出本组的允许宽并写进 --file-strip-width;本组只读,不反向影响它。
  const heading = rootRef.value?.closest('.conversation-heading') ?? null
  const allowance = heading instanceof HTMLElement ? Number.parseFloat(getComputedStyle(heading).getPropertyValue('--file-strip-width')) : Number.NaN
  if (Number.isFinite(allowance)) {
    stripWidth.value = Math.max(0, allowance)
    return
  }
  // 兜底:还没被会话栏算过(首帧)时给 0,随后由挂载后的几帧重试探到真值(见 onMounted)。
  stripWidth.value = 0
}

const visibleCount = computed(() => {
  const total = props.tabs.length
  if (total === 0) return 0
  if (stripWidth.value <= 0) return Math.min(total, 1)
  const fits = Math.max(1, Math.floor((stripWidth.value + tabGap.value) / (tabMin.value + tabGap.value)))
  return Math.min(total, fits)
})

const tabWidth = computed(() => {
  if (visibleCount.value === 0) return tabMin.value
  const even = (stripWidth.value - tabGap.value * (visibleCount.value - 1)) / visibleCount.value
  if (even < tabMin.value) return even
  return Math.min(tabMax.value, even)
})

// 可见 tab:从打开集里取前面若干个;**活动文件永远可见**(被顶掉时用活动项替换末位可见项)。
const visibleTabs = computed(() => {
  const list = props.tabs
  const count = visibleCount.value
  if (count >= list.length) return list
  const window = list.slice(0, count)
  const active = list.find((tab) => fileTabKey(tab) === props.activeKey)
  if (active === undefined || window.some((tab) => fileTabKey(tab) === props.activeKey)) return window
  return [...window.slice(0, count - 1), active]
})


// ---- roving tabindex ----
const focusedKey = ref('')
const tabStopKey = computed(() => {
  const list = visibleTabs.value
  if (list.length === 0) return ''
  if (list.some((tab) => fileTabKey(tab) === focusedKey.value)) return focusedKey.value
  if (list.some((tab) => fileTabKey(tab) === props.activeKey)) return props.activeKey
  return fileTabKey(list[0] as FileTab)
})

function focusTab(key: string): void {
  focusedKey.value = key
  tabsRef.value?.querySelector<HTMLElement>(`.file-tab[data-file-key="${CSS.escape(key)}"]`)?.focus()
}

function onTabsKeydown(event: KeyboardEvent): void {
  const list = visibleTabs.value
  if (list.length === 0) return
  const target = event.target
  const currentKey = target instanceof HTMLElement ? target.dataset.fileKey : undefined
  const index = list.findIndex((tab) => fileTabKey(tab) === currentKey)
  if (index < 0) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const tab = list[index]
    if (tab !== undefined) emit('select', fileTabKey(tab))
    return
  }
  // Delete 关闭聚焦的 tab(与文件树 / 会话 tab 同一语义)。
  if (event.key === 'Delete') {
    event.preventDefault()
    const tab = list[index]
    if (tab !== undefined) emit('close', fileTabKey(tab))
    return
  }
  // Ctrl+Shift+PageUp / PageDown:把聚焦的 tab 逐位重排(纯拖拽对键盘用户不可达)。
  if (event.ctrlKey && event.shiftKey && (event.key === 'PageUp' || event.key === 'PageDown')) {
    event.preventDefault()
    const to = event.key === 'PageUp' ? index - 1 : index + 1
    if (to < 0 || to >= list.length) return
    const ids = list.map((tab) => fileTabKey(tab))
    const moved = ids[index]
    if (moved === undefined) return
    ids.splice(index, 1)
    ids.splice(to, 0, moved)
    const movedSet = new Set(ids)
    const rest = props.tabs.map((tab) => fileTabKey(tab)).filter((key) => !movedSet.has(key))
    emit('reorder', [...ids, ...rest])
    void nextTick(() => focusTab(moved))
    return
  }
  // Ctrl/Cmd+Shift+M:把**聚焦的 tab** 拆出为悬浮窗体(其「拆出」钮已移出 Tab 序,这里是它的
  // 键盘等价通路;WCAG 2.5.7 只要求存在非拖拽入口,不要求它落在 Tab 序里)。
  if (isTearOutShortcut(event)) {
    event.preventDefault()
    const tab = list[index]
    if (tab !== undefined) emitPop(tab)
    return
  }
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % list.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + list.length) % list.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = list.length - 1
  else return
  event.preventDefault()
  const nextTab = list[next]
  if (nextTab !== undefined) focusTab(nextTab.path)
}

// ---- 拖拽:横向重排 + 向下拆出(两种手势共用同一次按下)----
// 越过 DRAG_THRESHOLD_PX 后**先定轴向再锁定**,之后不再改 —— 拖到一半改向不会在两种手势之间
// 来回跳,也就不会互相误触发。横向 = 重排(既有);向下 = 把该 tab 拆出为悬浮窗体。
// 纵向那一支的元素会被从条上摘掉(收不到后续指针事件),故它在确认拆出时把 move / up 改挂到
// document —— 这正是 Pointer Events 的既定做法。全程用 Pointer Events,不用 HTML5 drag-and-drop
// (后者在拖动期间抑制键盘事件,Esc 取消会失效)。
const DRAG_THRESHOLD_PX = 4
// 越过 tab 条**下沿**这么多 → 判定为拆出;回到下沿以内这么多 → 撤销。两值之差构成迟滞带:
// 在下沿附近微动不会反复拆出 / 收回,松手前始终可逆。
const TEAR_DROP_DISTANCE = 24
const TEAR_REATTACH_DISTANCE = 12
const dragKey = ref('')
const dragIndex = ref(-1)
const dropIndex = ref(-1)
const dragOffsetX = ref(0)
let suppressClick = false
let dragAxis: 'none' | 'x' | 'y' = 'none'
let dragStartX = 0
let dragStartY = 0
let dragPointerId = -1
let dragSlot: HTMLElement | null = null
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
  dragKey.value = ''
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
  const target = event.target
  // 关闭钮 / 拆出钮上按下不启动拖拽(它们各有自己的动作)。
  if (target instanceof Element && (target.closest('.file-tab-close') !== null || target.closest('.file-tab-pop') !== null)) return
  const slot = event.currentTarget
  if (!(slot instanceof HTMLElement)) return
  const slots = Array.from(tabsRef.value?.querySelectorAll<HTMLElement>('.file-tab-slot') ?? [])
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
  // 拆出的判定基准:tab 条的**下沿**(拖过它 24px 即拆出)、按下点相对本 tab 左上角的偏移
  // (窗体初始位置据此算,否则会瞬移)、以及本 tab 的屏幕矩形(FLIP 的来源)。
  const strip = tabsRef.value?.getBoundingClientRect()
  stripBottom = strip?.bottom ?? rect.bottom
  grabOffsetX = event.clientX - rect.left
  grabOffsetY = event.clientY - rect.top
  dragOrigin = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

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
    // 移动超过阈值才判定为拖拽;否则仍是点击(浏览器同款:轻微抖动不该变成拖动)。
    if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    const dragged = visibleTabs.value[dragIndex.value]
    const slot = event.currentTarget
    if (dragged === undefined || !(slot instanceof HTMLElement)) return
    dragKey.value = fileTabKey(dragged)
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
    key: dragKey.value,
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
  const wasDragging = dragKey.value !== ''
  const from = dragIndex.value
  const to = dropIndex.value
  resetDrag()
  if (!wasDragging) return
  suppressClick = true
  if (to < 0 || to === from) return
  const ids = visibleTabs.value.map((tab) => fileTabKey(tab))
  const moved = ids[from]
  if (moved === undefined) return
  ids.splice(from, 1)
  ids.splice(to, 0, moved)
  const movedSet = new Set(ids)
  const rest = props.tabs.map((tab) => fileTabKey(tab)).filter((key) => !movedSet.has(key))
  emit('reorder', [...ids, ...rest])
}

function cancelDrag(event?: PointerEvent): void {
  if (dragIndex.value < 0) return
  // 纵向手势的取消走 onTearPointerCancel(它会撤销拆出并收尾)。
  if (dragAxis === 'y') return
  if (event !== undefined) {
    const slot = event.currentTarget
    if (slot instanceof HTMLElement && slot.hasPointerCapture(event.pointerId)) slot.releasePointerCapture(event.pointerId)
  }
  const wasDragging = dragKey.value !== ''
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

// 拖拽结束后紧跟的那次 click 需要被吞掉(浏览器同款:拖动后台标签页不会切过去)。
function onTabClick(key: string): void {
  if (suppressClick) {
    suppressClick = false
    return
  }
  emit('select', key)
}

// **双击 tab = 把该 tab 表示的页面拆出为悬浮窗体**:与 tab 上那枚拆出钮、快捷键
// Ctrl/Cmd+Shift+M 走**同一条**通路(同一个 tear-pop、同一份来源矩形),只是多了一条指针入口。
// 单击仍然照常选中(双击的第一次单击就是选中),不去加延迟判定躲开它 —— Obsidian / VS Code
// 的 tab 双击同样是「升级 / 拆出」语义,后触发的拆出覆盖前一次选中是正常顺序。
// 原有的非拖拽通路(拆出钮 + 快捷键)一条不动:WCAG 2.5.7 要求的是「存在等价通路」,不是「只有一条」。
function onTabDblClick(event: MouseEvent, tab: FileTab): void {
  onTabPop(event, tab)
}

function slotTransform(index: number): string | undefined {
  const tab = visibleTabs.value[index]
  if (tab === undefined) return undefined
  if (dragKey.value === fileTabKey(tab)) return `translate(${dragOffsetX.value}px, var(--dl-lift-hover))`
  if (dragKey.value === '') return undefined
  const span = slotWidth + tabGap.value
  const from = dragIndex.value
  const to = dropIndex.value
  if (from < to && index > from && index <= to) return `translateX(${-span}px)`
  if (from > to && index >= to && index < from) return `translateX(${span}px)`
  return undefined
}

// ---- ▾ 菜单(disclosure:命名容器 + 原生按钮行,不用无 tabindex 的菜单项)----
function rowElements(): HTMLElement[] {
  return Array.from(panelRef.value?.querySelectorAll<HTMLElement>('[data-file-option]') ?? [])
}

function closeMenu(restoreFocus: boolean): void {
  if (!isMenuOpen.value) return
  if (panelRef.value !== null) panelRef.value.inert = true
  isMenuOpen.value = false
  if (restoreFocus) menuTriggerRef.value?.focus()
}


function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  closeMenu(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && rootRef.value?.contains(target) === true) return
  closeMenu(false)
}

// 菜单行点击:openTab 为空 = 「已打开」组(选中该 tab);否则是「最近关闭」组(按路径重新打开)。
// 菜单打开后把焦点交给首行:键盘 / 读屏用户随即能操作,Esc 也才有落点(与会话切换器打开即聚焦
// 搜索框同一套做法 —— 否则焦点留在触发钮上,面板收不到 Esc)。
watch(isMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  // 菜单打开后把焦点交给首行:键盘 / 读屏用户随即能操作,Esc 也才有落点(与会话切换器打开即聚焦
  // 搜索框同一套做法)。没有行时(真空态提示)交给面板本身 —— 它是 tabindex=-1 的可编程聚焦区。
  const first = rowElements()[0]
  if (first === undefined) panelRef.value?.focus()
  else first.focus()
})

let observer: ResizeObserver | undefined

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDragKeydown)
  measureStrip()
  if (typeof ResizeObserver !== 'undefined') {
    // 同会话栏:隔一帧再量,避免两组互为对方宽度时的同帧循环。
    observer = new ResizeObserver(() => { requestAnimationFrame(() => measureStrip()) })
    // 观察**顶部行**而不是本组件:可用宽取决于「行宽 − 对话那一组的实占宽」,对话组变宽变窄
    // 时本组件自身的盒子可能不变,只观察自己会漏掉这一半的信号。
    const heading = rootRef.value?.closest('.conversation-heading') ?? rootRef.value
    if (heading !== null) observer.observe(heading)
    // 也观察**自己**(允许宽变化时自己的盒子会变)与**对话那一条**(允许宽变大时,会话栏把
    // 自己让窄,它的宽度变化是本组重算的可靠触发 —— 单看自己不够:本组的盒子被 tabMax 顶住时
    // 不再变化,就会一直用着过时的允许宽)。
    if (rootRef.value !== null) observer.observe(rootRef.value)
    const siblings = rootRef.value?.closest('.conversation-heading')?.querySelector('.conversation-tabs')
    if (siblings instanceof HTMLElement) observer.observe(siblings)
    // 首帧时会话栏可能还没写出允许宽(两个组件挂载次序不定),故挂载后连续补量几帧。
    for (let frame = 0; frame < 3; frame += 1) requestAnimationFrame(() => measureStrip())
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
  <div ref="rootRef" class="file-bar" @focusout="onFocusOut">
    <!-- 打开集**跨项目**共享,栏里会同时混装多个项目的文件 —— 故出处由**每个 tab 自己**声明
         (文件名之后那枚小号、弱化的项目名),不再有「栏首标一次」的前提。 -->
    <!-- 文件那一组是 **toolbar** 而不是 tablist:同一时刻可以有多个文件窗口,不存在
         「一个 tab 对应一个 tabpanel」的关系,故每项是 **aria-pressed 的切换按钮**(按下 = 其窗口可见),
         不是 tab。tab 语义留给对话那一组(它才是一对一的)。 -->
    <div ref="tabsRef" class="file-tabs" role="toolbar" :aria-label="t.workspace.fileBar.label" @keydown="onTabsKeydown">      <!-- 槽位与 tab 平级:HTML 不允许 button 套 button,关闭钮用 tab 的 aria-actions 关联。
           槽位同时是关闭钮的定位上下文(恒定预留,出现时零重排)。 -->
      <div
        v-for="(tab, index) in visibleTabs"
        :key="fileTabKey(tab)"
        class="file-tab-slot"
        role="presentation"
        :data-selected="fileTabKey(tab) === activeKey"
        :class="{ 'is-dragging': fileTabKey(tab) === dragKey }"
        :style="{ width: `${tabWidth}px`, transform: slotTransform(index) }"
        @pointerdown="onTabPointerDown($event, index)"
        @pointermove="onTabPointerMove"
        @pointerup="onTabPointerUp"
        @pointercancel="cancelDrag($event)"
      >
        <button
          :id="`file-tab-${fileTabKey(tab)}`"
          :data-file-key="fileTabKey(tab)"
          :data-file-path="tab.path"
          class="file-tab"
          :class="identityClassOfProject(tab.projectId)"
          :data-pulsing="fileTabKey(tab) === pulseKey ? 'true' : undefined"

          :aria-pressed="visiblePaths.includes(fileTabKey(tab))"
          :tabindex="fileTabKey(tab) === tabStopKey ? 0 : -1"
          :aria-actions="`file-close-${fileTabKey(tab)} file-pop-${fileTabKey(tab)}`"
          :title="tabTitle(tab)"
          @click="onTabClick(fileTabKey(tab))"
          @dblclick="onTabDblClick($event, tab)"
          @focus="focusedKey = fileTabKey(tab)"
        >
          <!-- 归属的**颜色通道**:贴左缘、通高的一条 3px 标识色条(只作图形,不填整块 tab 底)。 -->
          <span v-if="markOf(tab.projectId)" class="file-tab__identity" aria-hidden="true" />
          <DliIcon class="file-tab__icon" name="fileText" size="sm" />
          <!-- 归属的**文字通道**(主通道):项目缩写前缀(如「WR」),与文件名并列显示。
               打开集跨项目,同名文件必须能一眼分辨来自哪个项目;文字不依赖颜色,故色觉障碍下仍读得出。 -->
          <span v-if="markOf(tab.projectId)" class="file-tab__mark" aria-hidden="true">{{ markOf(tab.projectId) }}</span>
          <span class="file-tab__label">{{ fileBaseName(tab.path) }}</span>
          <span v-if="chipLabel(tab)" class="file-tab__chip" :data-state="stateOf(tab)">{{ chipLabel(tab) }}</span>
        </button>
        <!-- 「拆出」钮:拖拽之外的非拖拽通路(WCAG 2.5.7 —— 凡靠拖动手势完成的功能都要有
             非拖动的等价入口)。它是**真按钮**(指针可点、Enter 可触发),图标纯装饰,
             语义由 aria-label / title 承担;与关闭钮并排、同在悬停 / 聚焦时显现。
             它**不在 Tab 序里**(tabindex=-1):键盘通路改由快捷键 Ctrl/Cmd+Shift+M 承担
             (在 tab 条上按即把当前聚焦的 tab 拆出),故 tab 条上少一个重复的逐项停靠点。
             title 为中英双语,悬停即可读到快捷键(见 aria-keyshortcuts)。 -->
        <button
          :id="`file-pop-${fileTabKey(tab)}`"
          type="button"
          class="file-tab-pop"
          tabindex="-1"
          :aria-keyshortcuts="TEAR_OUT_KEYSHORTCUTS"
          :aria-label="popLabel(tab)"
          :title="popTitle(tab)"
          @click="onTabPop($event, tab)"
        >
          <DliIcon name="window" size="sm" />
        </button>
        <button
          :id="`file-close-${fileTabKey(tab)}`"
          type="button"
          class="file-tab-close"
          tabindex="-1"
          :aria-label="closeLabel(tab)"
          @click="emit('close', fileTabKey(tab))"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
    <!-- 没有打开文件时**不占位**:顶部行是与对话 tablist 共享的窄空间,一段教学文案会把整行挤到
         溢出(实测 375px 下挤掉 63px、还让会话 tab 溢出自己的条)。「双击文件即可打开」这条提示
         改由下拉的「文件」页承担(那里空间充裕,且是「找回文件」的天然落点)。 -->
  </div>
</template>

<style scoped>
/* 本组件是**裸条**:只负责 [tab 条][▾ 菜单钮] 的排布,不做任何「面」——它被页面放进
   顶部行里的一个 flex 项(宽度由会话栏单向定额,见 measureStrip),自身不再有「面」。
   position: relative 仍留给焦点环与内部定位。 */
.file-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  /* 菜单浮层向上弹(条在面板底部,向下会被坞挤掉);横向贴条的内容右缘。
     脚本按本元素(裸条)的 clientWidth 算可用宽 —— 它已经是栏内容宽(左右内边距已让出)。 */
  --file-tab-min: 140px;
  --file-tab-max: 220px;
  /* 文件 tab 右侧为**两枚**行内控件(拆出 / 关闭)恒常预留的槽宽 = 24 + 4 + 24 + 4 + 4。
     恒常预留 → 悬停时两钮显现不产生任何重排(与会话 tab 的关闭钮同一条规矩)。 */
  --file-tab-reserved: calc(2 * var(--dl-icon-lg) + 3 * var(--dl-space-1));
}

/* 文件图标:区分「这是文件」而不是对话。 */
.file-tab__icon {
  flex: none;
  color: var(--dl-text-tertiary);
}

/* 归属的**颜色通道**:贴左缘、通高的一条 3px 标识色条。var(--dl-identity) 由 tab 上的
   .dl-identity-N 绑定类给出;只作图形,不填整块 tab 底。 */
.file-tab__identity {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: var(--dl-identity-bar-width);
  background: var(--dl-identity);
  border-start-start-radius: var(--dl-radius-md);
  border-end-start-radius: var(--dl-radius-md);
}

/* 归属的**文字通道**(主通道):项目缩写前缀,等宽、小号、三级文字色。 */
.file-tab__mark {
  flex-shrink: 0;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-tertiary);
}

.file-tabs {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  /* overflow visible:tab 的 :focus-visible 环向外扩,裁切会把环的上下两边整条抹掉。 */
  overflow: visible;
}

.file-tab-slot {
  position: relative;
  flex: 0 1 auto;
  display: flex;
  min-width: 0;
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-tab-slot.is-dragging {
  transition: none;
}

/* 单个文件 tab:与会话 tab 同一档尺寸(紧凑导航行档 32px,横向 tab 条的任何宽度都保持此档)。 */
.file-tab {
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
  /* 右内边距恒常预留**两枚**行内控件(拆出 / 关闭)的槽,悬停显现时零重排。 */
  padding-inline-end: var(--file-tab-reserved);
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

/* tab 上的**出处标识**:项目名首字,16px 圆角方块(与会话头 / Agent 切换器同族)。
   打开集跨项目,栏里会混装多个项目的文件,故每个 tab 都要一枚标识;完整出处(文件名 · 项目 › 路径)
   放在 tab 的 title 里,悬停一次看全。颜色走二级文字色 —— 三级色压在活动 tab 的浅强调底上只有
   3.93:1(校准装置实测),不够正文级 4.5:1。 */

/* 预览槽:斜体表达「临时的」—— 三款编辑器(VS Code / Zed / JetBrains)一致的既有语义。 */

.file-tab__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 状态芯片:与文件树的 .entry-state 同一套取值与配色(语义角色层 token)。 */
.file-tab__chip {
  flex-shrink: 0;
  padding: 0 var(--dl-space-1);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

.file-tab__chip[data-state='created'] {
  color: var(--dl-accent);
}

.file-tab__chip[data-state='modified'] {
  color: var(--dl-warning);
}

.file-tab__chip[data-state='pending'] {
  color: var(--dl-accent);
  border-color: var(--dl-accent);
  background: var(--dl-accent-soft);
}

.file-tab:hover:not([aria-pressed='true']) {
  background: var(--dl-bg-hover);
}

.file-tab:active {
  transform: translateY(var(--dl-lift-press));
}

.file-tab-slot.is-dragging .file-tab:active {
  transform: none;
}

.file-tab:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 活动 tab:青瓷浅底 + 文字提到一级 + 字重 500(两个非颜色线索:填充 + 字重)。 */
.file-tab[aria-pressed='true'] {
  background: var(--dl-accent-soft);
  color: var(--dl-text-primary);
  font-weight: 500;
}

/* 「拆出」钮:与关闭钮同尺寸(24×24 密集行内控件档)、同显现规则,排在关闭钮**左侧**
   (关闭钮是行尾那一枚,拆出钮让开一个图标宽 + 一档间隙)。它是拖拽之外的非拖拽通路,
   但**不进 Tab 顺序**(tabindex=-1)——键盘通路改由快捷键 Ctrl/Cmd+Shift+M 承担,
   WCAG 2.5.7 要求的是「存在非拖拽入口」,不要求在 Tab 序里。图标走三级文字色,悬停 / 聚焦提到一级。 */
.file-tab-pop {
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

.file-tab-slot:hover .file-tab-pop,
.file-tab-slot:focus-within .file-tab-pop {
  opacity: 1;
}

.file-tab-pop:hover,
.file-tab-pop:focus-visible {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.file-tab-pop:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 关闭钮:与会话 tab 的关闭钮同尺寸(24×24 密集行内控件档),悬停 / 聚焦出现。 */
.file-tab-close {
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

.file-tab-slot:hover .file-tab-close,
.file-tab-slot:focus-within .file-tab-close {
  opacity: 1;
}

.file-tab-close:hover,
.file-tab-close:focus-visible {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.file-tab-close:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 极窄容器(375 档):文件名是这一枚 tab 的**身份**,任何装饰都不能把它挤成 0 宽。
   故按以下顺序让位:状态芯片(次要,文件树 / 面板里仍有)→ 文件图标(与文件类型重复)→
   「拆出」钮的恒常预留(它已移出 Tab 序,键盘通路是快捷键;窄屏不 hover 也看不见它)。
   关闭钮保留 —— 它是 touch 语境下唯一可见的关闭入口。 */
@container (max-width: 560px) {
  .file-bar {
    --file-tab-reserved: calc(var(--dl-icon-lg) + 2 * var(--dl-space-1));
  }

  .file-tab__icon,
  .file-tab__chip,
  .file-tab-pop {
    display: none;
  }
}

/* 空态提示:与一行 tab 等高(32),故栏高在空 / 非空两态完全一致。
   它只是提示,不可交互 —— 教学职责由可见文案承担,不额外加图标钮。 */
.file-bar__empty {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  block-size: var(--workspace-nav-control-size);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}

/* ▾ 菜单的空态提示。 */
.file-bar__hint {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

/* ▾ 菜单钮:与会话头的 ＋ / ▾ 同配方、同档尺寸(32×32),钉在条右缘。 */
.file-bar__trigger {
  position: relative;
  margin-inline-start: auto;
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
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-bar__trigger:hover:not(:disabled) {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.file-bar__trigger:active:not(:disabled) {
  transform: translateY(var(--dl-lift-press));
}

.file-bar__trigger:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.file-bar__trigger:disabled {
  cursor: not-allowed;
  color: var(--dl-text-disabled);
  background: var(--dl-bg-sunken);
}

.file-bar__caret {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  color: var(--dl-text-secondary);
}

.file-bar__caret path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}

.file-bar__count {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: calc(-1 * var(--dl-space-1));
  min-width: var(--dl-icon-sm);
  padding: 0 var(--dl-border-width);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-bg-sunken);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  line-height: var(--dl-line-snug);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 浮层:锚到条(最近的可定位祖先),右缘对齐条右缘;向上弹(条在屏幕底部,向下会被输入坞挤掉)。 */
.file-bar__panel {
  position: absolute;
  inset-block-end: calc(100% + var(--dl-space-1));
  inset-inline-end: 0;
  z-index: var(--dl-z-overlay);
  width: min(360px, 92vw);
  max-height: min(50vh, 360px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  padding: var(--dl-space-4);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  box-shadow: var(--dl-shadow-lg);
}

.file-bar__group {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
}

.file-bar__group-title {
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-text-tertiary);
  padding: var(--dl-space-1) var(--dl-space-1) 0;
}

/* 菜单行 = **两段式**(label + description):主行是文件名(+状态芯片),次行是所属上下文
   (本项目只写目录路径;跨项目写「项目 › 目录路径」)。依据:VS Code 的 recent 列表项就是
   label + description = 文件 + 所属工作区 / 父路径。 */
.file-bar__row {
  flex-shrink: 0;
  width: 100%;
  min-height: var(--dl-target-size);
  padding: var(--dl-space-2) var(--dl-space-3);
  display: grid;
  gap: var(--dl-space-1);
  text-align: left;
  border: var(--dl-border-width) solid transparent;
  border-radius: var(--dl-radius-md);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-bar__row-main {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-width: 0;
}

.file-bar__row:hover {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.file-bar__row:active {
  transform: translateY(var(--dl-lift-press));
}

.file-bar__row:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.file-bar__row[aria-current='true'] {
  border-color: var(--dl-border-strong);
  border-inline-start: var(--dl-space-1) solid var(--dl-accent);
  background: var(--dl-accent-soft);
}

.file-bar__row-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
}

/* 路径属技术信息:等宽 + 二级文字色。 */
.file-bar__row-path {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.file-menu-pop-enter-active,
.file-menu-pop-leave-active {
  transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard);
}

.file-menu-pop-enter-from,
.file-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(var(--dl-space-1));
}

@media (prefers-reduced-motion: reduce) {
  .file-tab-slot {
    transition: none;
  }

  .file-tab-pop,
  .file-tab-close {
    transition: none;
  }

  .file-tab:active,
  .file-bar__trigger:active:not(:disabled),
  .file-bar__row:active {
    transform: none;
  }
}

/* 「显示一个已打开的窗体」时的提醒(与 conversation-switcher 同款、同一套依据):
   一次性短脉冲,随后回落为静态选中态;只动 opacity(本仓动效白名单)。
   WCAG 2.3.1 硬线 1 秒内闪光 ≤3 次 → 只闪一次;900ms 与页面的 PULSE_MS 必须一致。 */
.file-tab[data-pulsing='true']::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 var(--dl-border-width) var(--dl-accent);
  pointer-events: none;
}

/* 降级是**替换**而非删除:reduced-motion 下不做淡入淡出,那条静态强调描边仍出现 900ms。 */
@media (prefers-reduced-motion: no-preference) {
  .file-tab[data-pulsing='true']::after {
    animation: file-tab-attention 900ms var(--dl-ease-standard) 1 both;
  }
}

@keyframes file-tab-attention {
  0% { opacity: 0; }
  30% { opacity: 1; }
  100% { opacity: 0; }
}
</style>
