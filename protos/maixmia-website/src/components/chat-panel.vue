<script setup lang="ts">
// 对话窗体:**悬浮**形态的对话窗口 —— 把条上的一段对话拆出来的落点。
//
// 它与文件面板共用**同一条窗体机制**(同一套 props / 事件:focus / close / dock / rect-change /
// dock-target,同样按窗口 id 由页面统一处理),但视觉外壳更克制:对话没有可切换的视图、
// 没有换行开关,故只有一条标题栏(拖拽手柄 + 停靠 + 关闭)。
//
// 内容本体交给 ChatSessionView(滚动容器 + 转录 + **输入坞**)—— 与停靠态的对话共用同一份,
// 于是「输入坞属于对话窗体」由结构保证:拖出 / 停靠换的只是外壳与几何,内容本体不变。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChatRuntime } from '../data/chat-runtime'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { useI18n } from '../i18n'
import ChatSessionView from './chat-session-view.vue'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  // 该窗体的会话 id(= 窗体 id,windowIdOf 对 chat 取 sessionId)。
  sessionId: string
  // 会话标题:标题栏显示它,也是拖拽 / 停靠播报里的 {name}。
  title: string
  // 该会话的运行态(草稿 / 转录 / 生成 / 遥测 / 待确认 / 粘底 —— 随会话存活,不随容器)。
  runtime: ChatRuntime
  userName: string
  assistantName: string
  isFocused: boolean
  // 是否承担全页唯一的 live region(见 workspace-page 的 liveSlot 判据)。
  isLive: boolean
  disabled: boolean
  canSend: boolean
  // 该窗体的几何(由页面按 (Agent, 项目) 分域保存);null = 还没被摆过位置,用默认几何。
  initialRect: WindowRect | null
  // 级联序号:同时可见的悬浮窗依次错开,避免完全重叠。
  cascade: number
  // 拆出跟手:非 null 时窗体用默认尺寸、左上角落在该点(每次变化直接改写几何,零过渡)。
  followPoint?: { x: number; y: number } | null
  // FLIP 的来源矩形(屏幕坐标):挂载时先「退」到它,再过渡回自身落点。reduced-motion 下跳过。
  flipFrom?: WindowRect | null
}>()

const emit = defineEmits<{
  close: []
  focus: []
  'rect-change': [rect: WindowRect | null]
  // 停靠回条上(双击标题栏 / 头部按钮 / 头部按钮的键盘通路)。带当前几何作停靠面板的 FLIP 来源。
  // 拖拽落点**不走这里** —— 拖动期间只报 drag-move / drag-end,落点由页面统一裁决。
  dock: [rect: WindowRect | null]
  // 拖动中的**指针视口坐标**:组件只报事实,顶部条 / 区域边缘 / 区域内部一律由页面裁决
  // (与拖 tab 那套手势共用页面里同一个落点解析器)。
  'drag-move': [pointer: { x: number; y: number }]
  // 拖动松手时的指针视口坐标:页面据此决定「停靠回条上 / 沿边切分 / 并入某区域 / 保持悬浮」。
  'drag-end': [pointer: { x: number; y: number }]
  // 拖动被取消(Esc / 指针被系统打断):页面据此收起任何落点预览。
  'drag-cancel': []
  // 透传内容本体的事件(输入坞 / 转录 / 确认卡)。
  send: [text: string]
  stop: []
  regenerate: []
  retry: []
  resolve: [allowed: boolean]
  'use-suggestion': [text: string]
  'update:draft': [value: string]
  'update:pinned': [value: boolean]
}>()

const { t } = useI18n()

interface PanelRect {
  x: number
  y: number
  w: number
  h: number
}

const PANEL_MIN_W = 320
// 最小高:输入坞搬进窗体之后,200 不够用了 —— 40px 标题栏 + 约 118px 输入坞(输入框 62 + 遥测条 40
// + 底部内边距 16)之后,转录区只剩 17px,等于看不见对话。320 让转录区在静置草稿下留出约 160px,
// 草稿长到 5 行(输入框自动增高的上限)时仍留约 60px。文件面板的最小高不随之变化。
const PANEL_MIN_H = 320
const PANEL_DRAG_THRESHOLD_PX = 4
const PANEL_KEY_STEP = 16
const PANEL_KEY_STEP_LARGE = 64
const PANEL_DEFAULT_HEIGHT_RATIO = 0.66
const WINDOW_CASCADE_STEP = 28
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const rootRef = ref<HTMLElement | null>(null)
const headerRef = ref<HTMLElement | null>(null)
const panelRect = ref<PanelRect | null>(null)
const isPanelDragging = ref(false)
const flipStyle = ref('')
const viewportNonce = ref(0)
const viewportMargin = ref(24)

// 自定属性解析:探针挂在工作台根上(首次渲染时 rootRef 还是 null,body 上读不到 --workspace-*)。
function resolveLength(name: string): number {
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

function topLimit(): number {
  return viewportMargin.value
}

function viewportFloor(): number {
  const box = viewportBox()
  return box.height - viewportMargin.value
}

// 默认几何:与文件面板同口径(宽度取阅读列 + 两侧 gutter、横向对齐输入框、顶边落在会话头之下、
// 底边停在输入区之上),只是内容换成转录。级联偏移按悬浮窗序号错开。
function defaultRect(): PanelRect {
  const box = viewportBox()
  const margin = viewportMargin.value
  const columnMax = resolveLength('--workspace-column-max') || 768
  const gutter = resolveLength('--workspace-gutter') || 0
  const w = Math.min(columnMax + 2 * gutter, box.width - 2 * margin)
  const composer = document.querySelector('#conversation-panel-body .composer-form')
  const composerRect = composer instanceof HTMLElement ? composer.getBoundingClientRect() : null
  const center = composerRect === null ? box.width / 2 : composerRect.left + composerRect.width / 2
  const heading = document.querySelector('.conversation-heading')
  const headingRect = heading instanceof HTMLElement ? heading.getBoundingClientRect() : null
  const y = Math.max(topLimit(), headingRect === null ? margin + (resolveLength('--dl-header-height') || 60) : headingRect.bottom + margin)
  const politeBottom = composerRect === null ? viewportFloor() : composerRect.top - margin
  const h = Math.min(PANEL_DEFAULT_HEIGHT_RATIO * box.height, Math.max(PANEL_MIN_H, Math.min(viewportFloor() - margin, politeBottom) - y))
  const cascadeOffset = WINDOW_CASCADE_STEP * Math.max(0, props.cascade)
  return clampRect({ x: center - w / 2 + cascadeOffset, y: y + cascadeOffset, w, h })
}

const effectiveRect = computed<PanelRect>(() => panelRect.value ?? defaultRect())

const panelStyle = computed<string>(() => {
  const flip = flipStyle.value === '' ? '' : `transform:${flipStyle.value}`
  const rect = effectiveRect.value
  const geometry = [`left:${rect.x}px`, `top:${rect.y}px`, `width:${rect.w}px`, `height:${rect.h}px`].join(';')
  return flip === '' ? geometry : `${geometry};${flip}`
})

function currentWindowRect(): WindowRect | null {
  const rect = panelRect.value
  if (rect === null) return null
  return { x: rect.x, y: rect.y, width: rect.w, height: rect.h }
}

function clampRectForMove(rect: PanelRect): PanelRect {
  const box = viewportBox()
  const margin = viewportMargin.value
  const top = Math.min(topLimit(), Math.max(margin, viewportFloor() - rect.h))
  const x = Math.min(Math.max(rect.x, margin), Math.max(margin, box.width - rect.w - margin))
  const maxY = Math.max(top, viewportFloor() - rect.h)
  const y = Math.min(Math.max(rect.y, top), maxY)
  return { x, y, w: rect.w, h: rect.h }
}

function clampRect(rect: PanelRect): PanelRect {
  const box = viewportBox()
  const margin = viewportMargin.value
  const maxW = Math.max(PANEL_MIN_W, box.width - 2 * margin)
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

function currentRect(): PanelRect {
  return effectiveRect.value
}

function emitRect(): void {
  const rect = panelRect.value
  emit('rect-change', rect === null ? null : { x: rect.x, y: rect.y, width: rect.w, height: rect.h })
}

// FLIP:先把窗体退到来源矩形(同帧写入、不补间),下一帧起再过渡回自身落点。只动 transform。
function playFlip(): void {
  const from = props.flipFrom ?? null
  const element = rootRef.value
  if (from === null || element === null) return
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return
  const rect = element.getBoundingClientRect()
  const dx = Math.round(from.x - rect.x)
  const dy = Math.round(from.y - rect.y)
  if (dx === 0 && dy === 0) return
  flipStyle.value = `translate(${dx}px, ${dy}px)`
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { flipStyle.value = '' })
  })
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
  if (!event.isPrimary) return
  if (event.button !== 0) return
  if (isHeaderControl(event.target)) return
  const rect = currentRect()
  dragFrom = { x: event.clientX, y: event.clientY }
  dragBase = rect
  dragPointerId = event.pointerId
  isDragPending = true
  headerRef.value?.setPointerCapture(event.pointerId)
}

function onHeaderPointerMove(event: PointerEvent): void {
  if (!isDragPending && !isPanelDragging.value) return
  if (event.pointerId !== dragPointerId || dragBase === null) return
  const dx = event.clientX - dragFrom.x
  const dy = event.clientY - dragFrom.y
  if (isDragPending) {
    if (Math.hypot(dx, dy) < PANEL_DRAG_THRESHOLD_PX) return
    isDragPending = false
    isPanelDragging.value = true
    headerRef.value?.setPointerCapture(event.pointerId)
  }
  panelRect.value = clampRectForMove({ ...dragBase, x: dragBase.x + dx, y: dragBase.y + dy })
  // 只报事实:把指针视口坐标交给页面判定落点 —— 组件不再自己裁决。
  emit('drag-move', { x: event.clientX, y: event.clientY })
}

// 拖动结束:commit=true(指针抬起)→ 先把落定几何写回(页面据此取 FLIP 来源 / 记住位置),
// 再把指针坐标交给页面统一裁决;commit=false(被取消)→ 报取消,页面收起落点预览。
function endHeaderDrag(event: PointerEvent, commit: boolean): void {
  if (event.pointerId !== dragPointerId) return
  if (headerRef.value?.hasPointerCapture(event.pointerId) === true) headerRef.value.releasePointerCapture(event.pointerId)
  const wasDragging = isPanelDragging.value
  isDragPending = false
  isPanelDragging.value = false
  dragBase = null
  dragPointerId = -1
  emitRect()
  if (!wasDragging) return
  if (commit) emit('drag-end', { x: event.clientX, y: event.clientY })
  else emit('drag-cancel')
}

function cancelHeaderDrag(): void {
  if (!isDragPending && !isPanelDragging.value) return
  if (headerRef.value?.hasPointerCapture(dragPointerId) === true) headerRef.value.releasePointerCapture(dragPointerId)
  if (dragBase !== null && isPanelDragging.value) panelRect.value = dragBase
  const wasDragging = isPanelDragging.value
  isDragPending = false
  isPanelDragging.value = false
  dragBase = null
  dragPointerId = -1
  if (wasDragging) emit('drag-cancel')
}

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
  panelRect.value = clampRectForMove({ ...rect, x: rect.x + dx, y: rect.y + dy })
  emitRect()
}

// 双击标题栏 = 停靠回条上(非拖拽通路;标题栏另有一枚等价按钮)。
function onHeaderDoubleClick(event: MouseEvent): void {
  if (isHeaderControl(event.target)) return
  emit('dock', currentWindowRect())
}

// 拖动中的 Escape:放弃本次拖动、几何回到按下时的那一份(用捕获阶段,页面的 Escape 据此让过)。
function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (!isDragPending && !isPanelDragging.value) return
  event.preventDefault()
  cancelHeaderDrag()
}

// 跟手(拆出):非 null 时用默认尺寸、左上角落在该点(零过渡);结束后把落定几何上报。
watch(() => props.followPoint ?? null, (next, previous) => {
  if (next !== null) {
    panelRect.value = clampRectForMove({ ...defaultRect(), x: next.x, y: next.y })
    return
  }
  if ((previous ?? null) !== null) emitRect()
})

function onViewportResize(): void {
  viewportMargin.value = resolveLength('--dl-space-6') || 24
  viewportNonce.value += 1
  if (panelRect.value !== null) panelRect.value = clampRect(panelRect.value)
}

onMounted(() => {
  viewportMargin.value = resolveLength('--dl-space-6') || 24
  viewportNonce.value += 1
  const follow = props.followPoint ?? null
  const stored = props.initialRect
  if (follow !== null) {
    panelRect.value = clampRectForMove({ ...defaultRect(), x: follow.x, y: follow.y })
  } else if (stored !== null) {
    panelRect.value = clampRect({ x: stored.x, y: stored.y, w: stored.width, h: stored.height })
  } else {
    panelRect.value = defaultRect()
  }
  playFlip()
  window.addEventListener('resize', onViewportResize)
  document.addEventListener('keydown', onDocumentKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportResize)
  document.removeEventListener('keydown', onDocumentKeydown, true)
})
</script>

<template>
  <section
    ref="rootRef"
    class="chat-panel"
    :class="{ 'is-moving': isPanelDragging }"
    role="dialog"
    :aria-label="t.workspace.chatWindow.label"
    :data-mode="'floating'"
    :data-session-id="sessionId"
    :data-focused="isFocused ? 'true' : 'false'"
    :style="panelStyle"
    @pointerdown="emit('focus')"
  >
    <!-- 「面」:底色 / 描边 / 圆角 / 阴影 + 滚轮隔离(与文件面板同一套浮层语言)。 -->
    <div class="chat-panel__surface">
      <!-- 标题栏 = 识别区 + 拖拽手柄(整块可拖,阈值 4px、指针捕获),双击 = 停靠回条上。 -->
      <header
        ref="headerRef"
        class="chat-panel__meta"
        :class="{ 'is-dragging': isPanelDragging }"
        tabindex="0"
        role="group"
        :aria-label="t.workspace.chatWindow.headerLabel"
        :title="t.workspace.chatWindow.headerHint"
        @pointerdown="onHeaderPointerDown"
        @pointermove="onHeaderPointerMove"
        @pointerup="endHeaderDrag($event, true)"
        @pointercancel="endHeaderDrag($event, false)"
        @lostpointercapture="endHeaderDrag($event, false)"
        @dblclick="onHeaderDoubleClick"
        @keydown="onHeaderKeydown"
      >
        <span class="chat-panel__grip" aria-hidden="true" />
        <span class="chat-panel__title" :title="title">{{ title }}</span>
        <div class="chat-panel__tools">
          <!-- 停靠回条上的**原生按钮**:拖拽之外的非拖拽通路(WCAG 2.5.7)。图标纯装饰,语义由 aria-label 承担。 -->
          <button type="button" class="chat-panel__action" :aria-label="t.workspace.chatWindow.dock" :title="t.workspace.chatWindow.dock" @click="emit('dock', currentWindowRect())"><DliIcon name="grid" size="sm" /></button>
          <button type="button" class="chat-panel__action" :aria-label="t.workspace.chatWindow.close" @click="emit('close')"><span aria-hidden="true">✕</span></button>
        </div>
      </header>
      <!-- 内容本体:滚动容器 + 转录 + 输入坞(与停靠态的对话共用同一份)。 -->
      <div class="chat-panel__body">
        <ChatSessionView
          :session-id="sessionId"
          :title="title"
          :runtime="runtime"
          :user-name="userName"
          :assistant-name="assistantName"
          :is-live="isLive"
          :disabled="disabled"
          :can-send="canSend"
          @send="emit('send', $event)"
          @stop="emit('stop')"
          @regenerate="emit('regenerate')"
          @retry="emit('retry')"
          @resolve="emit('resolve', $event)"
          @use-suggestion="emit('use-suggestion', $event)"
          @update:draft="emit('update:draft', $event)"
          @update:pinned="emit('update:pinned', $event)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 与文件面板同一套浮层语言:固定定位在视口坐标系、共用 --dl-z-overlay,前后关系由 DOM 顺序表达。 */
.chat-panel {
  position: fixed;
  z-index: var(--dl-z-overlay);
  container-type: inline-size;
  transition: transform var(--dl-duration-base) var(--dl-ease-standard);
}

.chat-panel.is-moving,
.chat-panel.is-moving * {
  transition: none;
}

.chat-panel__surface {
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
  animation: chat-panel-enter var(--dl-duration-base) var(--dl-ease-standard);
}

@keyframes chat-panel-enter {
  from { opacity: 0; transform: translateY(var(--dl-space-1)); }
  to { opacity: 1; transform: none; }
}

/* 标题栏:固定高度(一档控件高 + 上下各 4),整块是拖拽手柄;左内边距留出抓手记号。 */
.chat-panel__meta {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  block-size: calc(var(--dl-space-8) + var(--dl-space-2));
  padding: 0 var(--dl-space-2) 0 var(--dl-space-6);
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
  cursor: grab;
  touch-action: none;
}

.chat-panel__meta.is-dragging {
  cursor: grabbing;
}

.chat-panel__meta:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 克制的抓手记号:2×4 的点阵(纯装饰 —— 整个标题栏都是手柄)。 */
.chat-panel__grip {
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

.chat-panel__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

.chat-panel__tools {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
}

.chat-panel__action {
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

.chat-panel__action:hover {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.chat-panel__action:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 内容宿主:只负责占满剩余高度并让内容本体在其中纵向排布;真正的滚动容器是内容本体里的
   .transcript(阅读位置属于那段对话,不属于窗体)。 */
.chat-panel__body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
}

@media (prefers-reduced-motion: reduce) {
  .chat-panel__surface { animation-duration: 0.01ms; }
  .chat-panel { transition-duration: 0.01ms; }
}
</style>
