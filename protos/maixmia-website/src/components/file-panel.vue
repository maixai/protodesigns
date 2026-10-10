<script setup lang="ts">
// 文件面板:覆盖在转录区之上的一块(不是可拖拽的浮动窗口 —— MDI 那套已被现代界面放弃;
// 「已打开未显示」由文件栏的 tab 承担,所以面板只有「显示 / 不显示」两态)。
//
// 呈现方式(调研依据写在下方各处):
//   · 默认**整个文件 + 变更标记**,而不是只看 diff 片段 —— matklad 那篇被广泛引用的分析认为
//     「在上下文里看改动」优于「只看片段」,GitHub 的 rich diff 同向;
//   · 行号旁用**形状**标记变更(新增 + / 删除 − / 修改 ~),不只靠颜色(WCAG 1.4.1 的官方反例
//     正是「红 / 黄 / 绿圆点表示状态」);
//   · 行内用**词级高亮**而不是整行染色(GitHub 自 2014 起、IntelliJ 的粒度选项都把「词」作为
//     默认粒度:整行染色会把「改了一个词」放大成「整行被改」);
//   · 折叠未变更的片段(IntelliJ 可配置保留几行上下文),长文件里只展开变更周围若干行;
//   · 三种视图:整个文件 / 统一 diff / 并排 diff;**窄于阈值时并排自动降级为统一**
//     (Reviewable 的文档明确写「窗口变窄时并排自动转为统一,反之亦然」);
//   · 换行开关:长行不横向滚动。
//
// a11y:面板是**非模态**对话框(不写 aria-modal,不圈定焦点);其内容区是文件栏那个 tablist 的
// tabpanel(文件栏与转录区**各自**有一个 tablist 与 tabpanel,互不冲突)。待确认文件的
// 「允许 / 拒绝」与转录里的确认卡同源同动作(同一个 ConfirmationRequest、同一个处理函数)。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { FileLine } from '../contracts/generated/file-content'
import type { ProjectEntryStateId } from '../contracts/generated/project-entry'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { FileDisplayItem, FilePanelState, FileWindowRect } from '../data/open-files'
import { buildDisplayItems } from '../data/open-files'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  state: FilePanelState
  path: string
  // 文件所属项目:打开集跨项目,面板上必须写清出处(路径单独不再唯一)。
  projectName: string
  // 文件在该会话里的状态芯片(与文件栏 / 文件树同源同值)—— 由页面派生后传入。
  chipState: ProjectEntryStateId
  // 只有**当前会话的**待确认请求才允许在面板里拍板 —— 跨项目打开时该条不渲染(不提供写动作)。
  canConfirm: boolean
  confirmation: ConfirmationRequest | null
  confirmationOutcome: 'allowed' | 'rejected' | null
  // 这个文件的窗口几何(由页面按 (Agent, 项目) 分域保存)。传 null = 该文件还没被摆过位置,
  // 用默认几何。窗口状态**不属于组件**:切项目 / 切文件再回来要按原样恢复,故几何存在域里。
  initialRect: FileWindowRect | null
  // 层序:多个窗口并存时谁在上。聚焦置顶由页面决定,组件只如实呈现。
  zIndex: number
  // 本窗口是否当前聚焦(视觉上加一层强调描边,便于多窗口下认出焦点在哪)。
  isFocused: boolean
  // 级联序号:同时可见的窗口依次小偏移错开,避免完全重叠(窗口管理器的惯例)。
  cascade: number
}>()

const emit = defineEmits<{
  close: []
  retry: []
  resolve: [allowed: boolean]
  // 几何落定(拖动 / 缩放 / 方向键结束、双击复位)时上报;null = 已回到默认几何。
  'rect-change': [rect: FileWindowRect | null]
  // 在窗口内按下指针 / 聚焦它 → 页面据此置顶(「点谁谁在上」)。
  focus: []
}>()

const { t } = useI18n()

// 并排 diff 的可用宽度下限:窄于此自动降级为统一 diff(Reviewable 的既有行为)。
const SIDE_BY_SIDE_MIN_WIDTH = 640

type ViewMode = 'file' | 'unified' | 'side'
const viewMode = ref<ViewMode>('file')
const isWrap = ref(false)
const expandedFolds = ref<Set<number>>(new Set())
const rootRef = ref<HTMLElement | null>(null)
const canSideBySide = ref(true)

// 内容变了(换文件 / 重试)就复位折叠与新文件的视图 —— 折叠状态属于「这一次看这个文件」。
watch(() => [props.path, props.state] as const, () => {
  expandedFolds.value = new Set()
})

const content = computed(() => (props.state.status === 'ready' ? props.state.content : null))
const lines = computed<FileLine[]>(() => content.value?.lines ?? [])

// 展示项:每行,或一段被折叠的未变更行。
const items = computed<FileDisplayItem[]>(() => buildDisplayItems(lines.value, expandedFolds.value))

// 有效视图:并排不可用(面板太窄)时降级为统一 diff;用户的选择本身不变。
const effectiveView = computed<ViewMode>(() => (viewMode.value === 'side' && !canSideBySide.value ? 'unified' : viewMode.value))

const chipLabel = computed<string | null>(() => {
  if (props.chipState === 'none') return null
  return t.value.workspace.entryStates[props.chipState]
})

// 待确认:文件是由当前会话的确认请求改的(同一个 id)→ 面板内直接给「允许 / 拒绝」。
const pendingRequest = computed<ConfirmationRequest | null>(() => {
  // 跨项目的文件不给写动作:即便契约里带了 confirmationId,这里也不认(见 props.canConfirm)。
  if (!props.canConfirm) return null
  if (content.value === null || props.confirmation === null) return null
  return content.value.confirmationId === props.confirmation.id ? props.confirmation : null
})

// 行号旁的变更标记:形状而非颜色区分(+ / − / ~);缺省为空(未变更)。
const MARKER: Record<FileLine['change'], string> = { added: '+', removed: '−', modified: '~', none: '' }

function markerLabel(change: FileLine['change']): string {
  if (change === 'added') return t.value.workspace.filePanel.added
  if (change === 'removed') return t.value.workspace.filePanel.removed
  if (change === 'modified') return t.value.workspace.filePanel.modified
  return t.value.workspace.filePanel.unchanged
}

// 一段文本按词级高亮区间切成若干段(高亮段与普通段交替)。
interface Segment {
  text: string
  marked: boolean
}

function segments(line: FileLine): Segment[] {
  if (line.spans.length === 0) return [{ text: line.text, marked: false }]
  const sorted = [...line.spans].sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  let cursor = 0
  for (const span of sorted) {
    const start = Math.max(cursor, Math.min(span.start, line.text.length))
    const end = Math.max(start, Math.min(span.end, line.text.length))
    if (start > cursor) out.push({ text: line.text.slice(cursor, start), marked: false })
    if (end > start) out.push({ text: line.text.slice(start, end), marked: true })
    cursor = end
  }
  if (cursor < line.text.length) out.push({ text: line.text.slice(cursor), marked: false })
  return out
}

// 并排 diff 的两侧内容:右 = 改动后(modified / added / none),左 = 改动前(modified / removed / none)。
function sideLeft(line: FileLine): string | null {
  if (line.change === 'added') return null
  if (line.change === 'modified') return line.previous
  return line.text
}

function sideRight(line: FileLine): string | null {
  if (line.change === 'removed') return null
  return line.text
}

// 并排的右列高亮:只有 modified / added 才有意义(spans 描述的是改动后的文本)。
function sideRightSegments(line: FileLine): Segment[] {
  if (line.change === 'removed') return []
  return segments(line)
}

function sideLeftSegments(line: FileLine): Segment[] {
  if (line.change === 'modified') return [{ text: line.previous, marked: false }]
  return segments(line)
}

function expandFold(start: number): void {
  const next = new Set(expandedFolds.value)
  next.add(start)
  expandedFolds.value = next
}

function foldLabel(count: number): string {
  return t.value.workspace.filePanel.fold.replace('{count}', String(count))
}

function unchangedLabel(count: number): string {
  return t.value.workspace.filePanel.unchangedCount.replace('{count}', String(count))
}

const statAdded = computed(() => t.value.workspace.filePanel.addedStat.replace('{count}', String(content.value?.addedCount ?? 0)))
const statRemoved = computed(() => t.value.workspace.filePanel.removedStat.replace('{count}', String(content.value?.removedCount ?? 0)))

let observer: ResizeObserver | undefined

function measureWidth(): void {
  canSideBySide.value = (rootRef.value?.clientWidth ?? 0) >= SIDE_BY_SIDE_MIN_WIDTH
  // 视口 / 面积变化后**重新钳一次**:浮动窗口最经典的缺陷就是「拖到边缘后面积变小、窗口留在界外」。
  if (panelRect.value !== null) panelRect.value = clampRect(panelRect.value)
}

// ---- 可拖动 / 可缩放(APG Window Splitter)----
//
// 几何模型:面板**浮在整个浏览器视口之上**(position: fixed),几何一律由这里的状态给出
// (不再有「CSS 默认几何 + JS 显式几何」两套)。四边钳在**视口**内(留一档外边距),视口尺寸
// 变化后重新钳一次;双击标题栏 = 恢复默认几何(默认几何按当前视口 + 输入框位置算,始终避开输入区)。
interface PanelRect {
  x: number
  y: number
  w: number
  h: number
}

const PANEL_MIN_W = 320
const PANEL_MIN_H = 200
// 拖拽阈值 / 键盘步长(Shift 大步长)—— 与 APG Window Splitter 的惯例一致。
const PANEL_DRAG_THRESHOLD_PX = 4
const PANEL_KEY_STEP = 16
const PANEL_KEY_STEP_LARGE = 64
// 默认几何占视口高度的比例(与上一版「约 2/3」同源)。
const PANEL_DEFAULT_HEIGHT_RATIO = 0.66
// 级联步长(与页面里新窗口的偏移同值:28px)。
const WINDOW_CASCADE_STEP = 28

const panelRect = ref<PanelRect | null>(null)
// 拖动 / 缩放进行中(只用于视觉与「不加过渡」的兜底)。
const isPanelDragging = ref(false)
const isPanelResizing = ref(false)
const headerRef = ref<HTMLElement | null>(null)

// 视口度量:外边距取自 --dl-space-6,视口尺寸变化时自增 nonce 驱动默认几何重算。
const viewportNonce = ref(0)
const viewportMargin = ref(24)

function resolveLength(name: string): number {
  // 探针挂在工作台根上(不是 rootRef 的父节点 —— 首次渲染时 rootRef 还是 null,会落到 body 上,
  // 那里读不到 --workspace-* 这类定义在页面上的自定属性,长度会静默解析成 0)。
  const host = document.querySelector('.workspace-page') ?? document.body
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.inlineSize = `var(${name})`
  host.appendChild(probe)
  const value = probe.getBoundingClientRect().width
  probe.remove()
  return value
}

function viewportBox(): { width: number; height: number } {
  void viewportNonce.value
  return { width: window.innerWidth, height: window.innerHeight }
}

// 默认几何:宽度取阅读列 + 两侧 gutter(与消息正文同轴),横向对齐输入框;纵向从站点头下方起,
// 底边停在**输入框上方一档外边距**——「浮动窗口长期遮住输入区」是业界明列的反模式,故默认就不遮。
function defaultRect(): PanelRect {
  const box = viewportBox()
  const margin = viewportMargin.value
  const columnMax = resolveLength('--workspace-column-max') || 768
  const gutter = resolveLength('--workspace-gutter') || 0
  const w = Math.min(columnMax + 2 * gutter, box.width - 2 * margin)
  const composer = document.querySelector('.composer-form')
  const composerRect = composer instanceof HTMLElement ? composer.getBoundingClientRect() : null
  const center = composerRect === null ? box.width / 2 : composerRect.left + composerRect.width / 2
  // 顶边:站点头之下、**且不压住对话面板的会话头(tab 条)** —— 浮动窗口盖住应用自己的导航行是硬伤。
  const heading = document.querySelector('.conversation-heading')
  const headingRect = heading instanceof HTMLElement ? heading.getBoundingClientRect() : null
  const y = Math.max(topLimit(), headingRect === null ? margin + (resolveLength('--dl-header-height') || 60) : headingRect.bottom + margin)
  // 底边:停在**输入区**之上 —— 输入区不只是输入框,还有它上方那条悬浮的「回到底部」钮
  // (它只在用户上滚时才渲染,故这里**恒常预留**它的高度 + 间隙 + 一档外边距,不靠量它)。
  // 「浮动窗口长期遮住输入区」是业界明列的反模式,故默认就不遮。
  // 默认几何:**不贴任何边界**(钳制已放开),但仍然「有礼貌」——默认不盖住输入区,且在下方留出
  // 可见余量。注意这只是**默认值**:拖动 / 缩放的钳制里已经没有那条下界了,窗口可以随时被拖到
  // 视口下缘(用户两次反馈的「下不去」正是因为默认值贴着下界 + 钳制也锁着 —— 两者都要改)。
  const politeBottom = composerRect === null ? viewportFloor() : composerRect.top - jumpReserve.value - margin
  const h = Math.min(PANEL_DEFAULT_HEIGHT_RATIO * box.height, Math.max(PANEL_MIN_H, Math.min(viewportFloor() - margin, politeBottom) - y))
  // 级联:第 n 个同时可见的窗口向右下各挪 n 档 —— 不是「记住的几何」,而是**没摆过位置的窗口**
  // 之间的相对错开(摆过的窗口走 initialRect 那条路,原样恢复)。
  const cascadeOffset = WINDOW_CASCADE_STEP * Math.max(0, props.cascade)
  return clampRect({ x: center - w / 2 + cascadeOffset, y: y + cascadeOffset, w, h })
}

// 有效几何:显式几何优先,否则用默认几何。
const effectiveRect = computed<PanelRect>(() => panelRect.value ?? defaultRect())

// 显式几何以**一整串 cssText** 绑定(而不是逐条属性对象):一次性整体写入,避免逐条补丁
// 在连续调整时丢掉某一条(实测过)。面板固定在视口坐标系里。
const panelStyle = computed<string>(() => {
  const rect = effectiveRect.value
  // 层序**叠加在浮层档之上**(--dl-z-overlay = 200):窗口之间的高低只需在浮层档内部区分,
  // 直接写 1/2/3 会把窗口压到顶栏(< 100)之下 —— 实测拖到页面顶部就点不动了。
  return [`left:${rect.x}px`, `top:${rect.y}px`, `width:${rect.w}px`, `height:${rect.h}px`, `z-index:calc(var(--dl-z-overlay) + ${props.zIndex})`].join(';')
})

// 当前几何 = 有效几何(权威来源,不回读 DOM —— DOM 更新是异步的,连续按键回读会丢步)。
function currentRect(): PanelRect {
  return effectiveRect.value
}

// 窗口的**纵向允许范围**:上边界 = 顶部行(会话头 / 标签条)的下沿,下边界 = 视口下缘。
// **不再有「输入区之上」那条下界** —— 用户两次要求「可拖到整个页面范围内的任意位置」,而下界会让
// 窗口在底部附近完全下不去(默认几何又恰好贴在那条线上,于是「只能往上拖」)。
// 输入区不被挡这件事**不再由层序保证**:输入坞已并入对话面板、回到第 1 层(应用外壳),
// 窗体(第 2 层,--dl-z-overlay + n)因此可以盖住它 —— 这正是用户要的「输入框与整个对话框
// 做在一起、能被文件窗体覆盖」。窗体的默认几何仍是「有礼貌」的(见 defaultRect 的 politeBottom),
// 但拖动 / 缩放的钳制里没有「输入区之上」那条下界,窗口可被拖到输入区那一带并盖住它。
//
// 「回到底部」钮的预留高度(恒常预留,不靠量它 —— 它只在用户上滚时才渲染)。
// **必须缓存**:resolveLength 会向页面插入探针元素并强制重排,而钳制在拖拽 / 缩放的每一帧都会调它 ——
// 每帧插一次 DOM 不只是慢,webkit 上还会让指针事件在拖拽中途丢失(实测:长位移只走到 1/10)。
// 长度常量只在挂载与视口变化时重算。
const jumpReserve = ref(60)

// 窗口的**上界** = 视口顶 + 一档外边距 —— 与其它三边同口径,**没有任何额外约束**
// (用户两次明确:允许区域是整个页面区域,含顶部)。窗体会滑到顶部 chrome 之下,这是可接受的后果。
//
// 手柄被 chrome 遮住之后靠**非鼠标通路**保证仍能抓回来(三条,都有断言):
//   ① F6 在可见窗口间循环聚焦 → 聚焦的那个可用方向键移动(见 file-panel 的标题栏方向键);
//   ② Esc 隐藏当前聚焦窗口;
//   ③ 条上 / 下拉「文件」页里该文件的切换按钮可再次显示它。
function topLimit(): number {
  return viewportMargin.value
}

function measureJumpReserve(): void {
  jumpReserve.value = (resolveLength('--dl-target-size') || 44) + 2 * (resolveLength('--dl-space-2') || 8)
}

// 视口下缘(留一档外边距)—— 窗体的下界,没有任何额外约束。
function viewportFloor(): number {
  const box = viewportBox()
  return box.height - viewportMargin.value
}

// ⚠️ 两条路径的钳制**必须分开写**:拖动只许平移(尺寸是不变量),只有缩放才改尺寸。
// 早先把两者合成一个「rect 归一化」函数,结果是「往下拖」时下边界被取 min、顶边继续下移 ⇒
// **窗口高度被压小**(用户报的缺陷)。「钳制矩形」这个说法只描述边界,**不代表要压缩盒子**。
//
// 拖动 = 纯平移:整体移动 (x, y),宽高逐值不变;触边时**整个窗口停在边界上**(把 y 夹住),
// 而不是把盒子压小。往回拖能回到原值,不会累积缩小。
function clampRectForMove(rect: PanelRect): PanelRect {
  const box = viewportBox()
  const margin = viewportMargin.value
  const top = Math.min(topLimit(), Math.max(margin, viewportFloor() - rect.h))
  const x = Math.min(Math.max(rect.x, margin), Math.max(margin, box.width - rect.w - margin))
  const maxY = Math.max(top, viewportFloor() - rect.h)
  const y = Math.min(Math.max(rect.y, top), maxY)
  return { x, y, w: rect.w, h: rect.h }
}

// 缩放才改尺寸:尺寸按 min/max 与可用宽高约束(**压小在这里是合法的**),位置随之钳进视口。
function clampRectForResize(rect: PanelRect): PanelRect {
  const box = viewportBox()
  const margin = viewportMargin.value
  const maxW = Math.max(PANEL_MIN_W, box.width - 2 * margin)
  // 高度上限 = 视口高减去上下各一档外边距(**不再与输入区挂钩**)。
  const maxH = Math.max(PANEL_MIN_H, box.height - 2 * margin)
  const minW = Math.min(PANEL_MIN_W, maxW)
  const minH = Math.min(PANEL_MIN_H, maxH)
  const w = Math.min(Math.max(rect.w, minW), maxW)
  const h = Math.min(Math.max(rect.h, minH), maxH)
  const x = Math.min(Math.max(rect.x, margin), Math.max(margin, box.width - w - margin))
  const minY = Math.min(topLimit(), Math.max(margin, viewportFloor() - h))
  const maxY = Math.max(minY, viewportFloor() - h)
  const y = Math.min(Math.max(rect.y, minY), maxY)
  return { x, y, w, h }
}

// 兼容旧调用点的别名:默认几何 / 视口变化后的重钳用**缩放语义**(尺寸可以被约束)。
function clampRect(rect: PanelRect): PanelRect {
  return clampRectForResize(rect)
}

function resetPanelGeometry(): void {
  panelRect.value = null
  emitRect()
}

// 把当前几何上报给页面(由页面按分域保存)—— 只在**落定时**上报,不在拖动 / 缩放的每一帧上报。
function emitRect(): void {
  const rect = panelRect.value
  emit('rect-change', rect === null ? null : { x: rect.x, y: rect.y, width: rect.w, height: rect.h })
}

// ---- 拖动(只认标题栏作手柄)----
let dragFrom = { x: 0, y: 0 }
let dragBase: PanelRect | null = null
let dragPointerId = -1
let isDragPending = false

function isHeaderControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button') !== null
}

function onHeaderPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return
  // 标题栏里的按钮(视图切换 / 换行 / 关闭)不算拖拽手柄。
  if (isHeaderControl(event.target)) return
  const rect = currentRect()
  if (rect === null) return
  dragFrom = { x: event.clientX, y: event.clientY }
  dragBase = rect
  dragPointerId = event.pointerId
  isDragPending = true
  // 按下即捕获:此后指针移出标题栏也收得到 move / up —— 否则「一次移动就甩出标题栏」的手势
  // (快速拖动 / 自动化里的大步长移动)会静默丢事件。标题栏内只有装饰与提示文本,捕获不会误伤按钮。
  headerRef.value?.setPointerCapture(event.pointerId)
}

function onHeaderPointerMove(event: PointerEvent): void {
  if (!isDragPending && !isPanelDragging.value) return
  if (event.pointerId !== dragPointerId || dragBase === null) return
  const dx = event.clientX - dragFrom.x
  const dy = event.clientY - dragFrom.y
  if (isDragPending) {
    // 越过阈值才算拖拽(轻微抖动仍是点击 / 双击)。
    if (Math.hypot(dx, dy) < PANEL_DRAG_THRESHOLD_PX) return
    isDragPending = false
    isPanelDragging.value = true
    headerRef.value?.setPointerCapture(event.pointerId)
  }
  // 拖动 = 纯平移:宽高取自 dragBase(拖拽开始时的那一份),全程不参与钳制的计算。
  panelRect.value = clampRectForMove({ ...dragBase, x: dragBase.x + dx, y: dragBase.y + dy })
}

function endHeaderDrag(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId) return
  if (headerRef.value?.hasPointerCapture(event.pointerId) === true) headerRef.value.releasePointerCapture(event.pointerId)
  isDragPending = false
  isPanelDragging.value = false
  dragBase = null
  dragPointerId = -1
  emitRect()
}

// 拖动期间只走 transform / 直接改几何(不加任何过渡 —— 本仓设计语言的可动效白名单只有
// transform / opacity,布局属性本就不许过渡,故这里是「跟手」的);`is-moving` 再显式关掉过渡兜底。
function onHeaderKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? PANEL_KEY_STEP_LARGE : PANEL_KEY_STEP
  let dx = 0
  let dy = 0
  if (event.key === 'ArrowLeft') dx = -step
  else if (event.key === 'ArrowRight') dx = step
  else if (event.key === 'ArrowUp') dy = -step
  else if (event.key === 'ArrowDown') dy = step
  else return
  event.preventDefault()
  const rect = currentRect()
  if (rect === null) return
  // 标题栏的方向键也是**平移**:同样只改位置、不改尺寸。
  const moved = clampRectForMove({ ...rect, x: rect.x + dx, y: rect.y + dy })
  panelRect.value = moved
  emitRect()
}

function onHeaderDoubleClick(event: MouseEvent): void {
  if (isHeaderControl(event.target)) return
  resetPanelGeometry()
}

// ---- 缩放:四边是可访问的分隔条(APG Window Splitter),四角是 44×44 的指针目标 ----
// 轴语义:左右缘 = 调宽度(aria-orientation="vertical",方向键 ←/→),上下缘 = 调高度(horizontal,↑/↓);
// Home/End 到最小 / 最大,Shift 大步长;aria-controls 指向被调整的面板内容区。
type ResizeEdge = 'e' | 'w' | 's' | 'n'
type ResizeCorner = 'ne' | 'nw' | 'se' | 'sw'

interface ResizeHandle {
  edge: ResizeEdge
  orientation: 'vertical' | 'horizontal'
  label: () => string
  // 沿各轴的伸缩方向:+1 表示「该边向外」(右下),-1 表示「该边向外」(左上,移动原点)。
  dx: -1 | 0 | 1
  dy: -1 | 0 | 1
}

const resizeHandles = computed<ResizeHandle[]>(() => [
  { edge: 'e', orientation: 'vertical', label: () => t.value.workspace.filePanel.resizeRight, dx: 1, dy: 0 },
  { edge: 'w', orientation: 'vertical', label: () => t.value.workspace.filePanel.resizeLeft, dx: -1, dy: 0 },
  { edge: 's', orientation: 'horizontal', label: () => t.value.workspace.filePanel.resizeBottom, dx: 0, dy: 1 },
  { edge: 'n', orientation: 'horizontal', label: () => t.value.workspace.filePanel.resizeTop, dx: 0, dy: -1 },
])

const resizeCorners: { corner: ResizeCorner; dx: -1 | 1; dy: -1 | 1 }[] = [
  { corner: 'ne', dx: 1, dy: -1 },
  { corner: 'nw', dx: -1, dy: -1 },
  { corner: 'se', dx: 1, dy: 1 },
  { corner: 'sw', dx: -1, dy: 1 },
]

// 把「某条边 / 某个角移动了 (dx, dy) 像素」应用到几何上。
function applyDelta(base: PanelRect, axisX: -1 | 0 | 1, axisY: -1 | 0 | 1, dx: number, dy: number): PanelRect {
  let { x, y, w, h } = base
  if (axisX === 1) w = base.w + dx
  else if (axisX === -1) {
    w = base.w - dx
    x = base.x + dx
  }
  if (axisY === 1) h = base.h + dy
  else if (axisY === -1) {
    h = base.h - dy
    y = base.y + dy
  }
  return { x, y, w, h }
}

let resizeBase: PanelRect | null = null
let resizeAxisX: -1 | 0 | 1 = 0
let resizeAxisY: -1 | 0 | 1 = 0
let resizeFrom = { x: 0, y: 0 }
let resizePointerId = -1

function onResizePointerDown(event: PointerEvent, axisX: -1 | 0 | 1, axisY: -1 | 0 | 1): void {
  if (event.button !== 0) return
  const rect = currentRect()
  if (rect === null) return
  event.preventDefault()
  resizeBase = rect
  resizeAxisX = axisX
  resizeAxisY = axisY
  resizeFrom = { x: event.clientX, y: event.clientY }
  resizePointerId = event.pointerId
  isPanelResizing.value = true
  const element = event.currentTarget
  if (element instanceof HTMLElement) element.setPointerCapture(event.pointerId)
}

function onResizePointerMove(event: PointerEvent): void {
  if (resizeBase === null || event.pointerId !== resizePointerId) return
  const dx = event.clientX - resizeFrom.x
  const dy = event.clientY - resizeFrom.y
  panelRect.value = clampRect(applyDelta(resizeBase, resizeAxisX, resizeAxisY, dx, dy))
}

function endResize(event: PointerEvent): void {
  if (event.pointerId !== resizePointerId) return
  const element = event.currentTarget
  if (element instanceof HTMLElement && element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  resizeBase = null
  resizePointerId = -1
  isPanelResizing.value = false
  emitRect()
}

function onResizeKeydown(event: KeyboardEvent, handle: ResizeHandle): void {
  const step = event.shiftKey ? PANEL_KEY_STEP_LARGE : PANEL_KEY_STEP
  const base = currentRect()
  const box = viewportBox()
  const minW = Math.min(PANEL_MIN_W, box.width - 2 * viewportMargin.value)
  const minH = Math.min(PANEL_MIN_H, box.height - 2 * viewportMargin.value)
  let next: PanelRect | null = null
  const vertical = handle.orientation === 'vertical'
  if (event.key === 'Home' || event.key === 'End') {
    // Home / End:到尺寸的最小 / 最大。
    const toMax = event.key === 'End'
    if (vertical) next = { ...base, w: toMax ? box.width : minW }
    else next = { ...base, h: toMax ? box.height : minH }
  } else if (vertical && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    // 分隔条跟着方向键走:左缘 ← 向外(变宽),右缘 → 向外(变宽)。
    const outward = handle.dx === 1 ? event.key === 'ArrowRight' : event.key === 'ArrowLeft'
    next = applyDelta(base, handle.dx, 0, outward ? step : -step, 0)
  } else if (!vertical && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    const outward = handle.dy === 1 ? event.key === 'ArrowDown' : event.key === 'ArrowUp'
    next = applyDelta(base, 0, handle.dy, 0, outward ? step : -step)
  } else {
    return
  }
  event.preventDefault()
  panelRect.value = clampRect(next)
  emitRect()
}

// 内容区尺寸:显式几何优先,否则用「默认几何下的实测量值」。它喂给分隔条的 aria-valuenow ——
// 故键盘 / 指针调整之后都要重新量一次(见 syncPanelSize 与 ResizeObserver 回调)。
const panelSize = computed<{ w: number; h: number }>(() => {
  const rect = effectiveRect.value
  return { w: rect.w, h: rect.h }
})

function ariaNow(vertical: boolean): number {
  return Number((vertical ? panelSize.value.w : panelSize.value.h).toFixed(2))
}

function ariaMin(vertical: boolean): number {
  const box = viewportBox()
  const limit = (vertical ? box.width : box.height) - 2 * viewportMargin.value
  return Math.min(vertical ? PANEL_MIN_W : PANEL_MIN_H, limit)
}

function ariaMax(vertical: boolean): number {
  const box = viewportBox()
  return Math.round(Math.max((vertical ? box.width : box.height) - 2 * viewportMargin.value, 0))
}

// 视口尺寸变化:刷新度量并**重新钳一次**(浮动窗口最经典的缺陷就是「视口变小后窗口留在界外」)。
function onViewportResize(): void {
  viewportMargin.value = resolveLength('--dl-space-6') || 24
  measureJumpReserve()
  viewportNonce.value += 1
  if (panelRect.value !== null) panelRect.value = clampRect(panelRect.value)
  measureWidth()
}

onMounted(() => {
  viewportMargin.value = resolveLength('--dl-space-6') || 24
  measureJumpReserve()
  // 挂载后再重算一次默认几何:首帧求值时页面样式可能尚未就绪,自定属性会解析成 0。
  viewportNonce.value += 1
  // 该文件在本分域里被摆过位置 → 按原样恢复(切项目 / 切文件回来是同一个位置)。
  const stored = props.initialRect
  if (stored !== null) panelRect.value = clampRect({ x: stored.x, y: stored.y, w: stored.width, h: stored.height })
  measureWidth()
  if (rootRef.value !== null && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measureWidth())
    observer.observe(rootRef.value)
  }
  window.addEventListener('resize', onViewportResize)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', onViewportResize)
})
</script>

<template>
  <section
    ref="rootRef"
    class="file-panel"
    :class="{ 'is-moving': isPanelDragging || isPanelResizing }"
    role="dialog"
    :aria-label="t.workspace.filePanel.label"
    :data-status="state.status"
    :data-view="effectiveView"
    :data-default-geometry="panelRect === null ? 'true' : 'false'"
    :style="panelStyle"
    :data-focused="isFocused ? 'true' : 'false'"
    :data-file-path="path"
    @pointerdown="emit('focus')"
  >
    <!-- 「面」这一层:底色 / 描边 / 圆角 / 阴影,并负责**吃掉滚轮** ——
         overflow: hidden + overscroll-behavior: contain 一并给出。规范细节:overscroll-behavior 只在
         滚动容器上生效,而内容不足一屏时(老引擎)没有溢出就不触发;Chrome 144 起对「不可滚动的
         滚动容器」(如 overflow: hidden)也生效,故这一层加上 contain 才能真正兜住「内容不满一屏时
         滚轮穿透到背后页面」。缩放手柄是它的**兄弟**、留在这一层之外,因此不受裁剪影响。 -->
    <div class="file-panel__surface">
    <!-- 标题栏 = 薄头 + **拖拽手柄**:整块可拖(阈值 4px、指针捕获、跟手无过渡),
         双击复位默认几何;表头的按钮不算手柄。方向键按步长移动窗口(键盘替代通路)。 -->
    <header
      ref="headerRef"
      class="file-panel__meta"
      :class="{ 'is-dragging': isPanelDragging }"
      tabindex="0"
      role="group"
      :aria-label="t.workspace.filePanel.headerLabel"
      :title="`${t.workspace.filePanel.headerHint} · ${t.workspace.filePanel.moveHint}`"
      @pointerdown="onHeaderPointerDown"
      @pointermove="onHeaderPointerMove"
      @pointerup="endHeaderDrag"
      @pointercancel="endHeaderDrag"
      @dblclick="onHeaderDoubleClick"
      @keydown="onHeaderKeydown"
    >
      <!-- 克制的抓手记号:2×4 的点阵(纯装饰,不是控件 —— 整个标题栏都是手柄)。 -->
      <span class="file-panel__grip" aria-hidden="true" />
      <div class="file-panel__identity">
        <!-- 出处(项目名)+ 路径:都属技术信息,等宽、可截断。 -->
        <span class="file-panel__project">{{ projectName }}</span>
        <span class="file-panel__project-sep" aria-hidden="true">›</span>
        <span class="file-panel__path" :title="`${projectName}/${path}`">{{ path }}</span>
        <span v-if="chipLabel" class="file-panel__chip" :data-state="chipState">{{ chipLabel }}</span>
        <span v-if="content" class="file-panel__stats" :aria-label="`${t.workspace.filePanel.addedStat.replace('{count}', String(content.addedCount))} / ${t.workspace.filePanel.removedStat.replace('{count}', String(content.removedCount))}`">
          <span class="file-panel__stat" data-kind="added">{{ statAdded }}</span>
          <span class="file-panel__stat" data-kind="removed">{{ statRemoved }}</span>
        </span>
      </div>
      <div class="file-panel__tools">
        <div class="file-panel__views" role="group" :aria-label="t.workspace.filePanel.viewLabel">
          <button type="button" class="file-panel__view" :aria-pressed="viewMode === 'file'" :aria-label="t.workspace.filePanel.viewFile" :title="t.workspace.filePanel.viewFile" @click="viewMode = 'file'">
            <DliIcon class="file-panel__view-icon" name="fileText" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.viewFile }}</span>
          </button>
          <button type="button" class="file-panel__view" :aria-pressed="viewMode === 'unified'" :aria-label="t.workspace.filePanel.viewUnified" :title="t.workspace.filePanel.viewUnified" @click="viewMode = 'unified'">
            <DliIcon class="file-panel__view-icon" name="code" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.viewUnified }}</span>
          </button>
          <button
            type="button"
            class="file-panel__view"
            :aria-pressed="viewMode === 'side'"
            :aria-label="t.workspace.filePanel.viewSide"
            :disabled="!canSideBySide"
            :title="canSideBySide ? t.workspace.filePanel.viewSide : t.workspace.filePanel.sideUnavailable"
            @click="viewMode = 'side'"
          >
            <DliIcon class="file-panel__view-icon" name="table" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.viewSide }}</span>
          </button>
        </div>
        <button type="button" class="file-panel__toggle" :aria-pressed="isWrap" :title="t.workspace.filePanel.wrap" @click="isWrap = !isWrap">{{ t.workspace.filePanel.wrap }}</button>
        <button type="button" class="file-panel__close" :aria-label="t.workspace.filePanel.close" @click="emit('close')"><span aria-hidden="true">✕</span></button>
      </div>
    </header>

    <!-- 待确认:面板内直接拍板,与转录里的确认卡作用于同一个确认请求(同一个处理函数)。 -->
    <div v-if="pendingRequest" class="file-panel__confirm" role="group" :aria-label="t.workspace.confirmation.title">
      <p class="file-panel__confirm-summary">{{ pendingRequest.summary }}</p>
      <template v-if="confirmationOutcome === null">
        <div class="file-panel__confirm-actions">
          <button type="button" class="dl-btn dl-btn--primary" @click="emit('resolve', true)">{{ t.workspace.confirmation.allow }}</button>
          <button type="button" class="dl-btn dl-btn--ghost" @click="emit('resolve', false)">{{ t.workspace.confirmation.reject }}</button>
        </div>
      </template>
      <p v-else class="file-panel__confirm-record" :data-outcome="confirmationOutcome">
        <span class="file-panel__confirm-mark" aria-hidden="true">{{ confirmationOutcome === 'allowed' ? '✓' : '✕' }}</span>
        <span>{{ confirmationOutcome === 'allowed' ? t.workspace.confirmation.allowed : t.workspace.confirmation.rejected }}</span>
      </p>
    </div>

    <!-- 内容区 = 文件栏那个 tablist 的 tabpanel。 -->
    <div id="file-panel-body" class="file-panel__body" role="tabpanel" :aria-labelledby="`file-tab-${path}`" :class="{ 'is-wrap': isWrap }">
      <div v-if="state.status === 'loading'" class="file-panel__state" :aria-label="t.workspace.filePanel.loading" aria-busy="true">
        <NSkeleton text :repeat="2" :animated="false" />
        <NSkeleton text :repeat="8" :animated="false" />
      </div>
      <div v-else-if="state.status === 'error'" class="file-panel__state">
        <h2>{{ t.workspace.filePanel.errorTitle }}</h2>
        <p>{{ t.workspace.filePanel.errorBody }}</p>
        <button type="button" class="workspace-button" @click="emit('retry')">{{ t.workspace.filePanel.retry }}</button>
      </div>
      <div v-else-if="state.status === 'empty'" class="file-panel__state">
        <h2>{{ t.workspace.filePanel.emptyTitle }}</h2>
        <p>{{ t.workspace.filePanel.emptyBody }}</p>
      </div>
      <!-- ---- 整个文件 / 统一 diff:一列,行号 + 变更标记 + (词级高亮的)正文 ---- -->
      <div v-else-if="effectiveView !== 'side'" class="file-lines">
        <template v-for="(item, index) in items" :key="index">
          <!-- 折叠段:整个文件视图下是可展开的按钮;统一 diff 下退成静态分隔(不可交互,故是 div)。 -->
          <button v-if="item.kind === 'fold' && effectiveView === 'file'" type="button" class="file-line__fold" @click="expandFold(item.start)">
            <span class="file-line__fold-mark" aria-hidden="true">⋯</span>
            <span>{{ foldLabel(item.count) }}</span>
          </button>
          <div v-else-if="item.kind === 'fold'" class="file-line__fold" data-view="unified" aria-hidden="true">
            <span class="file-line__fold-mark">⋯</span>
            <span>{{ unchangedLabel(item.count) }}</span>
          </div>
          <div v-else class="file-line" :data-change="item.line.change">
            <span class="file-line__marker" :data-change="item.line.change" :title="markerLabel(item.line.change)" aria-hidden="true">{{ MARKER[item.line.change] }}</span>
            <span class="file-line__number" aria-hidden="true">{{ item.line.number }}</span>
            <span class="file-line__text"><template v-for="(segment, part) in segments(item.line)" :key="part"><mark v-if="segment.marked" class="file-line__hl">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></span>
          </div>
        </template>
      </div>
      <!-- ---- 并排 diff:左 = 改动前,右 = 改动后 ---- -->
      <div v-else class="file-side">
        <div class="file-side__head" aria-hidden="true">
          <span>{{ t.workspace.filePanel.oldLabel }}</span>
          <span>{{ t.workspace.filePanel.newLabel }}</span>
        </div>
        <template v-for="(item, index) in items" :key="index">
          <button v-if="item.kind === 'fold'" type="button" class="file-line__fold file-side__fold" @click="expandFold(item.start)">
            <span class="file-line__fold-mark" aria-hidden="true">⋯</span>
            <span>{{ foldLabel(item.count) }}</span>
          </button>
          <!-- 未变更行整行贯通两列(并排 diff 的惯例)。 -->
          <div v-else-if="item.line.change === 'none'" class="file-side__row file-side__row--full">
            <span class="file-side__cell">{{ item.line.text }}</span>
          </div>
          <div v-else class="file-side__row">
            <span class="file-side__cell" :data-side="item.line.change === 'removed' ? 'removed' : 'plain'">
              <template v-if="sideLeft(item.line) !== null"><template v-for="(segment, part) in sideLeftSegments(item.line)" :key="part"><mark v-if="segment.marked" class="file-line__hl">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></template>
            </span>
            <span class="file-side__cell" :data-side="item.line.change === 'added' ? 'added' : 'plain'">
              <template v-if="sideRight(item.line) !== null"><template v-for="(segment, part) in sideRightSegments(item.line)" :key="part"><mark v-if="segment.marked" class="file-line__hl">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></template>
            </span>
          </div>
        </template>
      </div>
    </div>
    </div>

    <!-- 缩放手柄(APG Window Splitter)。四边是**可聚焦的分隔条**:aria-orientation 表达轴向、
         aria-valuenow/min/max 表达被调整尺寸的当前值与边界、aria-controls 指向被调整的内容区;
         方向键调整、Shift 大步长、Home/End 到最小 / 最大。四角是 44×44 的指针目标(本仓触达下限;
         Apple 建议桌面 20pt≈27px、触屏 28pt≈37px,这里取更严的 44),纯指针便利入口、不占 Tab 序。
         可见抓手可以很细:四边只有一条发丝线宽的可视暗示,角上什么都不画(完全透明)。 -->
    <button
      v-for="handle in resizeHandles"
      :key="handle.edge"
      type="button"
      class="file-panel__resize"
      :class="`file-panel__resize--${handle.edge}`"
      role="separator"
      :aria-orientation="handle.orientation"
      aria-controls="file-panel-body"
      :aria-label="handle.label()"
      :aria-valuenow="ariaNow(handle.orientation === 'vertical')"
      :aria-valuemin="ariaMin(handle.orientation === 'vertical')"
      :aria-valuemax="ariaMax(handle.orientation === 'vertical')"
      :title="t.workspace.filePanel.resizeHint"
      @keydown="onResizeKeydown($event, handle)"
      @pointerdown="onResizePointerDown($event, handle.dx, handle.dy)"
      @pointermove="onResizePointerMove"
      @pointerup="endResize"
      @pointercancel="endResize"
    />
    <span
      v-for="corner in resizeCorners"
      :key="corner.corner"
      class="file-panel__resize file-panel__resize--corner"
      :class="`file-panel__resize--${corner.corner}`"
      aria-hidden="true"
      @pointerdown="onResizePointerDown($event, corner.dx, corner.dy)"
      @pointermove="onResizePointerMove"
      @pointerup="endResize"
      @pointercancel="endResize"
    />
  </section>
</template>

<style scoped>
/* 覆盖在转录区之上:高度约转录区的 2/3,上下各留一段 —— 上方看得见更早的对话、下方看得见紧随
   其后的对话(上下文不丢)。底边离转录区底边的距离 = 内缩 + 一块「回到底部」按钮区:那条悬浮钮
   浮在输入框之上,面板必须停在它之上才不遮住它(按钮顶边距底边 = inset + 52)。
   **表面宽度 = 阅读列 + 两侧 gutter**:消息行的头像以负外边距凸进侧向 gutter,若面板只盖住
   阅读列,头像会从面板左边探出来。把面扩到含 gutter 后,面板盖住它该盖的区域;而**内容**
   仍按 gutter 内缩,与消息正文左右对齐(仍是阅读列宽)。 */
/* 浮动文件窗口:**固定定位在视口坐标系**里(几何由 JS 写 left/top/width/height),可在浏览器
   可显示区域任意位置拖动 —— 不再局限于对话面板内部。层序:浮在两块面板之上、模态 / 抽屉之下
   (抽屉在窄屏抬到 modal 档,见 workspace-page)。这一层只做定位与容器查询,「面」在下一层。 */
.file-panel {
  position: fixed;
  /* 层序由 props.zIndex 逐窗口给出(见 panelStyle)—— 多窗口时「谁在上」是状态,不是常量。 */
  z-index: var(--dl-z-overlay);
  /* 头部按**自身宽度**(容器查询)决定紧凑程度:面板窄时收成图标分段 + 去掉芯片与统计,
     于是「头部内部元素不换行」在任何宽度都成立。 */
  container-type: inline-size;
}

/* 「面」:底色 / 描边 / 圆角 / 阴影,以及**滚轮隔离**。
   滚动链是 Web 应用最常见的 UX bug 之一(MDN);横向还必须单独设 -x,否则某些浏览器会把横向
   过度滚动当成前进 / 后退手势 —— 故这里 `overscroll-behavior: contain` 一次设两轴。 */
.file-panel__surface {
  block-size: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  box-shadow: var(--dl-shadow-lg);
  overflow: hidden;
  overscroll-behavior: contain;
}

/* 拖动 / 缩放期间**不加过渡**(跟手)。本仓设计语言的可动效白名单只有 transform / opacity,
   几何属性本就不许过渡 —— 这里再显式兜一层,防止将来误加。 */
.file-panel.is-moving,
.file-panel.is-moving * {
  transition: none;
}

/* 标题栏(固定 40px = 一档控件高 32 + 上下各 4):路径等宽可截断、控件排在行尾、整块是拖拽手柄。
   固定高度 + 居中:控件比 32 略高(分段控件自带一圈内边距)时也不会把标题栏撑高,标题栏永远 40。
   左右内边距:左 = 侧向 gutter(与会话内容同轴),右 = 一枚角手柄的宽度(44)—— 让右上角的
   缩放手柄与关闭钮各占各的命中区,互不抢。 */
.file-panel__meta {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: var(--dl-space-2);
  block-size: calc(var(--dl-space-8) + var(--dl-space-2));
  padding: 0 var(--dl-target-size) 0 var(--workspace-gutter);
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
  cursor: grab;
  touch-action: none;
}

.file-panel__meta.is-dragging {
  cursor: grabbing;
}

.file-panel__meta:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 克制的抓手记号:2×4 的点阵(on the 侧向 gutter 里,不占内容位)。纯装饰 —— 整个标题栏都是手柄。 */
.file-panel__grip {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: var(--dl-space-2);
  transform: translateY(-50%);
  inline-size: var(--dl-space-2);
  block-size: var(--dl-icon-sm);
  color: var(--dl-text-tertiary);
  background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
  background-size: var(--dl-space-1) var(--dl-space-1);
  pointer-events: none;
}

.file-panel__identity {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
}

/* 头部出处:项目名(等宽、最小字号、三级文字色)+ 分隔符;路径紧随其后。 */
.file-panel__project {
  flex: none;
  max-inline-size: calc(10 * var(--dl-font-size-xs));
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.file-panel__project-sep {
  flex: none;
  color: var(--dl-text-tertiary);
}

.file-panel__path {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

/* 状态芯片:与文件栏 / 文件树同一套取值。 */
.file-panel__chip {
  flex-shrink: 0;
  padding: 0 var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

.file-panel__chip[data-state='created'] {
  color: var(--dl-accent);
}

.file-panel__chip[data-state='modified'] {
  color: var(--dl-warning);
}

.file-panel__chip[data-state='pending'] {
  color: var(--dl-accent);
  border-color: var(--dl-accent);
  background: var(--dl-accent-soft);
}

.file-panel__stats {
  flex-shrink: 0;
  display: inline-flex;
  gap: var(--dl-space-2);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  font-variant-numeric: tabular-nums;
}

.file-panel__stat[data-kind='added'] {
  color: var(--dl-success);
}

.file-panel__stat[data-kind='removed'] {
  color: var(--dl-error);
}

.file-panel__tools {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
}

/* 视图切换 = 分段控件:三个原生按钮 + aria-pressed(键盘可达、状态可读)。 */
.file-panel__views {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
  padding: var(--dl-space-1);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

/* 视图切换的按钮是**横排的密集行内控件**(分段控件),走「密集行内的控件」这一档(24px):
   横向排布下 WCAG 2.5.8 的间距判据天然成立,故这一档不属于「独立控件」。 */
.file-panel__view {
  min-block-size: var(--dl-space-6);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-panel__toggle {
  min-block-size: var(--dl-space-8);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-panel__view:hover:not(:disabled),
.file-panel__toggle:hover {
  background: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.file-panel__view[aria-pressed='true'],
.file-panel__toggle[aria-pressed='true'] {
  background: var(--dl-accent-soft);
  color: var(--dl-text-primary);
  font-weight: 500;
}

.file-panel__view:disabled {
  color: var(--dl-text-disabled);
  cursor: not-allowed;
}

.file-panel__view:focus-visible,
.file-panel__toggle:focus-visible,
.file-panel__close:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 关闭钮:32px 图标钮(与头部控件同档)。 */
.file-panel__close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--workspace-nav-control-size);
  block-size: var(--workspace-nav-control-size);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
}

/* 视图切换的分段控件在宽面板上带文字、在窄面板上收成图标(容器查询),两种形态都凭
   aria-label / title 保留语义。 */
.file-panel__view-icon {
  display: none;
  color: inherit;
}

@container (max-width: 559px) {
  .file-panel__chip,
  .file-panel__stats {
    display: none;
  }

  .file-panel__meta {
    gap: var(--dl-space-1);
  }

  .file-panel__view-label {
    display: none;
  }

  .file-panel__view-icon {
    display: inline-flex;
  }
}

.file-panel__close:hover {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

/* 待确认条:强调色左竖线 + 发丝描边,与转录里的确认卡同一族视觉语言。
   横向内边距 = 侧向 gutter(左缘再让出竖线的 4px),内容与消息正文对齐。 */
.file-panel__confirm {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  padding: var(--dl-space-3) var(--workspace-gutter) var(--dl-space-3) calc(var(--workspace-gutter) - var(--dl-space-1));
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
  border-inline-start: var(--dl-space-1) solid var(--dl-accent);
  background: var(--dl-bg-base);
}

.file-panel__confirm-summary {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

.file-panel__confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-2);
}

.file-panel__confirm-record {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}

.file-panel__confirm-mark {
  font-weight: 600;
}

.file-panel__confirm-record[data-outcome='allowed'] .file-panel__confirm-mark {
  color: var(--dl-success);
}

.file-panel__confirm-record[data-outcome='rejected'] .file-panel__confirm-mark {
  color: var(--dl-error);
}

/* 内容区:**始终是一个真正的滚动容器**(overflow: auto),并在**两个轴**上都隔离滚动链 ——
   横向在「换行关闭 / 并排窄降级」之外也可能需要横向滚动,同样不该把滚动传给背后的页面。
   滚动条**不隐藏**:横向可滚动区域必须保留可见的滚动条作为「这里能横向滚」的提示(a11y)。 */
.file-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding-block: var(--dl-space-2);
}

.file-panel__state {
  display: grid;
  gap: var(--dl-space-3);
  padding: var(--dl-space-6) var(--workspace-gutter);
  color: var(--dl-text-secondary);
}

.file-panel__state h2 {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-body);
  font-weight: 500;
  color: var(--dl-text-primary);
}

.file-panel__state .workspace-button {
  justify-self: start;
}

/* 行:最小宽度取内容宽(max-content),于是不换行时整块可横向滚动、每行不被压窄。
   横向内边距 = 侧向 gutter —— 代码左缘因此与消息正文左缘对齐(内容仍是阅读列宽)。 */
.file-lines {
  display: flex;
  flex-direction: column;
  min-inline-size: max-content;
  padding-inline: var(--workspace-gutter);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
}

.file-line {
  display: flex;
  align-items: flex-start;
  min-block-size: calc(var(--dl-font-size-sm) * var(--dl-line-snug));
}

/* 行号旁的变更标记:形状区分(+ / − / ~),颜色只作加固。 */
.file-line__marker {
  flex: none;
  inline-size: var(--dl-icon-sm);
  text-align: center;
  color: var(--dl-text-tertiary);
  user-select: none;
}

.file-line__marker[data-change='added'] {
  color: var(--dl-success);
}

.file-line__marker[data-change='removed'] {
  color: var(--dl-error);
}

.file-line__marker[data-change='modified'] {
  color: var(--dl-warning);
}

.file-line__number {
  flex: none;
  inline-size: var(--dl-space-8);
  padding-inline-end: var(--dl-space-3);
  text-align: end;
  color: var(--dl-text-tertiary);
  user-select: none;
}

.file-line__text {
  flex: 1;
  white-space: pre;
  padding-inline-end: var(--dl-space-4);
}

/* 换行开关打开:正文按字符换行,横向不再滚动。 */
.file-panel__body.is-wrap .file-lines,
.file-panel__body.is-wrap .file-side {
  min-inline-size: 100%;
}

.file-panel__body.is-wrap .file-line__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.file-panel__body.is-wrap .file-side__cell {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 词级高亮:背景加粗一级的强调浅底 + 一条下划线;不整行染色。 */
.file-line__hl {
  background: var(--dl-accent-soft);
  color: inherit;
  border-radius: var(--dl-radius-sm);
  box-shadow: inset 0 -1px 0 var(--dl-accent);
}

/* 被删除的整行:文字划线,与「新增 / 修改」在灰度下也区分得开。 */
.file-line[data-change='removed'] .file-line__text {
  text-decoration: line-through;
  color: var(--dl-text-secondary);
}

/* 折叠行:一条可点的「展开 N 行未变更的片段」;统一 diff 下退成静态分隔(不可展开)。 */
.file-line__fold {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  inline-size: 100%;
  padding: var(--dl-space-1) var(--dl-space-4);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  text-align: start;
}

.file-line__fold[data-view='unified'] {
  cursor: default;
}

.file-line__fold:not([data-view='unified']):hover {
  background: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.file-line__fold:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.file-line__fold-mark {
  color: var(--dl-text-tertiary);
}

/* 并排 diff:两列等宽 + 一条中缝。横向内边距 = 侧向 gutter(与消息正文左缘对齐)。 */
.file-side {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-content: start;
  padding-inline: var(--workspace-gutter);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
}

.file-side__head {
  display: contents;
}

.file-side__head > span {
  padding: var(--dl-space-1) var(--dl-space-4);
  font-family: var(--dl-font-sans);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
}

.file-side__row {
  display: contents;
}

.file-side__row--full > .file-side__cell {
  grid-column: 1 / -1;
}

.file-side__cell {
  min-inline-size: 0;
  padding-inline: var(--dl-space-4);
  white-space: pre;
  border-inline-start: var(--dl-border-width) solid var(--dl-border-base);
}

.file-side__cell[data-side='removed'] {
  background: color-mix(in srgb, var(--dl-error) 12%, transparent);
  text-decoration: line-through;
}

.file-side__cell[data-side='added'] {
  background: color-mix(in srgb, var(--dl-success) 12%, transparent);
}

.file-side__fold {
  grid-column: 1 / -1;
}

@media (max-width: 1023px) {
  .file-panel {
    inset-inline-start: calc(var(--dl-space-4) - var(--file-panel-shift));
    inset-inline-end: var(--dl-space-4);
  }
}

/* ---- 缩放手柄(APG Window Splitter)----
   四边是 8px 的细条(便利入口),放在面板**外侧**:于是永远不遮内容、也不遮内容区的滚动条;
   四角是 44×44 的指针目标(本仓触达下限),放在面板**内侧**的角上 —— 往外放会压到「回到底部」
   那条悬浮钮。可见抓手可以很细,故这里本体不画东西:光标 + 悬停时的一层极淡强调色就是全部暗示,
   真正的「可见抓手」是标题栏上那枚点阵。 */
.file-panel__resize {
  position: absolute;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  touch-action: none;
  border-radius: 0;
}

.file-panel__resize--e {
  inset-block: 0;
  inset-inline-start: 100%;
  inline-size: var(--dl-space-2);
  cursor: ew-resize;
}

.file-panel__resize--w {
  inset-block: 0;
  inset-inline-end: 100%;
  inline-size: var(--dl-space-2);
  cursor: ew-resize;
}

.file-panel__resize--n {
  inset-inline: 0;
  inset-block-end: 100%;
  block-size: var(--dl-space-2);
  cursor: ns-resize;
}

.file-panel__resize--s {
  inset-inline: 0;
  inset-block-start: 100%;
  block-size: var(--dl-space-2);
  cursor: ns-resize;
}

.file-panel__resize--corner {
  inline-size: var(--dl-target-size);
  block-size: var(--dl-target-size);
}

.file-panel__resize--ne {
  inset-block-start: 0;
  inset-inline-end: 0;
  cursor: nesw-resize;
}

.file-panel__resize--nw {
  inset-block-start: 0;
  inset-inline-start: 0;
  cursor: nwse-resize;
}

.file-panel__resize--se {
  inset-block-end: 0;
  inset-inline-end: 0;
  cursor: nwse-resize;
}

.file-panel__resize--sw {
  inset-block-end: 0;
  inset-inline-start: 0;
  cursor: nesw-resize;
}

/* 边条悬停 / 聚焦时给一层极淡的强调色(它就是那条「细的可见抓手」)。 */
.file-panel__resize:hover,
.file-panel__resize:focus-visible {
  background: color-mix(in srgb, var(--dl-accent) 26%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .file-panel__view,
  .file-panel__toggle {
    transition: none;
  }
}
</style>
