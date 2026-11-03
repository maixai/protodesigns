// 模态设置窗体能力本体(L1):窗体状态(开合 / 矩形)+ 指针与键盘手势 +
// 视口重钳 + 模态契约(showModal / Esc 分层 / 还焦)。
//
// 与悬浮窗体的 use-window-frame 分开:设置窗体没有停靠、级联、FLIP 与输入坞落点策略,
// 只有「居中默认几何 + 拖动 / 缩放」。纯数学仍在
// src/data/window-geometry.ts(L0),外观壳在 src/components/dialog-window.vue(L2)。
//
// 关键取舍:
//   · 几何由 JS 直写 `<dialog>` 的 left/top/width/height,并在 showModal 之前先写入一次 ——
//     否则原生 UA 的 inset:0 / margin:auto 会让首帧闪在错误位置;
//   · 几何切换一律瞬时完成,不碰布局属性做过渡;
//   · 业务是否允许关闭由 onRequestClose 决定 —— 本层只负责把 Esc / 背板请求交出去。

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import {
  DIALOG_HEIGHT_RATIO,
  KEY_STEP,
  KEY_STEP_LARGE,
  RESIZE_CORNERS,
  RESIZE_EDGES,
  applyDelta,
  clampDialogRect,
  clampForMove,
  defaultDialogRect,
  sizeBounds,
} from '../data/window-geometry'
import type {
  AxisDir,
  DialogSizePolicy,
  PanelRect,
  ResizeCornerSpec,
  ResizeEdge,
  ViewportBox,
} from '../data/window-geometry'
import { useI18n } from '../i18n'

// 内容等级:宽度上限由声明决定,尺寸策略本身只有一份。
export type DialogContentTier = 'compact' | 'regular' | 'wide'

// 窄屏阈值:≤ 768 或粗指针环境退化为近满屏固定 sheet,不提供拖拽 / 缩放。
export const DIALOG_NARROW_MAX_WIDTH = 768
export const DIALOG_NARROW_QUERY = `(max-width: ${DIALOG_NARROW_MAX_WIDTH}px)`
export const DIALOG_COARSE_POINTER_QUERY = '(pointer: coarse)'

// 在没有 CSS 自定属性可读时(如单元测试环境)的回退值;数值与 style.css 的 token 同源。
const FALLBACK_WIDTHS: Record<DialogContentTier, number> = { compact: 560, regular: 720, wide: 1120 }
const FALLBACK_SIZE = {
  maxHeight: 900,
  minWidth: 320,
  minHeight: 320,
  margin: 16,
}

// 拖动阈值:轻微抖动仍算点击,超过阈值才开始拖动。
const DRAG_THRESHOLD_PX = 4

export interface DialogWindowOptions {
  // 受控开合;常驻 + open prop 与仅打开时 v-if 挂载两种契约都支持。
  open: () => boolean
  tier: () => DialogContentTier
  // 用户请求关闭(Esc / 背板)。业务据此决定能否关闭(脏草稿确认、busy 阻塞、子流程)。
  onRequestClose: () => void
  // showModal 之后触发;业务在这里设置初始焦点。
  onOpened?: () => void
}

export interface DialogWindowEdgeHandle {
  edge: ResizeEdge
  orientation: 'vertical' | 'horizontal'
  label: string
  hint: string
  dx: AxisDir
  dy: AxisDir
}

export interface DialogWindowApi {
  dialogRef: Ref<HTMLDialogElement | null>
  // 几何内联样式(声明式兜底);首次 showModal 前还会直接写一次,避免首帧闪烁。
  style: ComputedRef<string>
  isDragging: Ref<boolean>
  isResizing: Ref<boolean>
  // 窄屏 / 粗指针:没有拖拽与缩放。
  canManipulate: ComputedRef<boolean>
  headerHandlers: {
    pointerdown: (event: PointerEvent) => void
    pointermove: (event: PointerEvent) => void
    pointerup: (event: PointerEvent) => void
    pointercancel: (event: PointerEvent) => void
    lostpointercapture: (event: PointerEvent) => void
    keydown: (event: KeyboardEvent) => void
  }
  resizeEdges: ComputedRef<DialogWindowEdgeHandle[]>
  resizeCorners: readonly ResizeCornerSpec[]
  onResizePointerDown: (event: PointerEvent, dx: AxisDir, dy: AxisDir) => void
  onResizePointerMove: (event: PointerEvent) => void
  onResizePointerUp: (event: PointerEvent) => void
  onResizeKeydown: (event: KeyboardEvent, handle: DialogWindowEdgeHandle) => void
  ariaNow: (vertical: boolean) => number
  ariaMin: (vertical: boolean) => number
  ariaMax: (vertical: boolean) => number
  // 业务确认可以关闭后调用:关闭原生 dialog 并还焦(父级可能随后卸载,重复调用安全)。
  closeDialog: () => void
  headerLabel: ComputedRef<string>
  headerHint: ComputedRef<string>
  onCancel: (event: Event) => void
  onBackdropClick: (event: MouseEvent) => void
}

interface SizeMetrics {
  widths: Record<DialogContentTier, number>
  maxHeight: number
  minWidth: number
  minHeight: number
  margin: number
}

function mediaMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

function readLength(name: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function readMetrics(): SizeMetrics {
  return {
    widths: {
      compact: readLength('--workspace-dialog-width-compact', FALLBACK_WIDTHS.compact),
      regular: readLength('--workspace-dialog-width-regular', FALLBACK_WIDTHS.regular),
      wide: readLength('--workspace-dialog-width-wide', FALLBACK_WIDTHS.wide),
    },
    maxHeight: readLength('--workspace-dialog-max-height', FALLBACK_SIZE.maxHeight),
    minWidth: readLength('--workspace-dialog-min-width', FALLBACK_SIZE.minWidth),
    minHeight: readLength('--workspace-dialog-min-height', FALLBACK_SIZE.minHeight),
    margin: readLength('--workspace-dialog-margin', FALLBACK_SIZE.margin),
  }
}

function viewportBox(): ViewportBox {
  return { width: window.innerWidth, height: window.innerHeight }
}

export function useDialogWindow(options: DialogWindowOptions): DialogWindowApi {
  const { t } = useI18n()

  const dialogRef = ref<HTMLDialogElement | null>(null)
  const rect = ref<PanelRect | null>(null)
  // 用户是否亲手调过尺寸 / 位置:没有的话,视口变化时按尺寸策略重算默认几何(高度随 dvh 变化)。
  const hasCustomGeometry = ref(false)
  const isDragging = ref(false)
  const isResizing = ref(false)
  const isNarrow = ref(false)
  const metrics = ref<SizeMetrics>(readMetrics())

  const canManipulate = computed<boolean>(() => !isNarrow.value)

  const headerLabel = computed<string>(() => t.value.workspace.windowFrame.dialogHeaderLabel)
  const headerHint = computed<string>(() => t.value.workspace.windowFrame.dialogHeaderHint)

  const resizeEdges = computed<DialogWindowEdgeHandle[]>(() =>
    RESIZE_EDGES.map((spec) => ({
      edge: spec.edge,
      orientation: spec.orientation,
      label: t.value.workspace.windowFrame[spec.labelKey],
      hint: t.value.workspace.windowFrame.resizeHint,
      dx: spec.dx,
      dy: spec.dy,
    })),
  )

  function currentPolicy(): DialogSizePolicy {
    return {
      box: viewportBox(),
      margin: metrics.value.margin,
      // 窄屏 / 粗指针退化为近满屏固定 sheet:不再套用内容等级上限。
      maxWidth: isNarrow.value ? Number.POSITIVE_INFINITY : metrics.value.widths[options.tier()],
      maxHeight: metrics.value.maxHeight,
      minWidth: metrics.value.minWidth,
      minHeight: metrics.value.minHeight,
      heightRatio: DIALOG_HEIGHT_RATIO,
    }
  }

  function applyRect(next: PanelRect): void {
    rect.value = next
    const element = dialogRef.value
    if (element === null) return
    // showModal 之前先直写一次,避免原生 UA 的居中式兜底闪一帧。
    element.style.left = `${next.x}px`
    element.style.top = `${next.y}px`
    element.style.width = `${next.w}px`
    element.style.height = `${next.h}px`
  }

  const style = computed<string>(() => {
    const value = rect.value
    if (value === null) return ''
    return `left:${value.x}px;top:${value.y}px;width:${value.w}px;height:${value.h}px`
  })

  function syncNarrow(): boolean {
    isNarrow.value = window.innerWidth <= DIALOG_NARROW_MAX_WIDTH || mediaMatches(DIALOG_COARSE_POINTER_QUERY)
    return isNarrow.value
  }

  // 默认几何:三个窗体共用同一策略,差异只在内容等级。
  function resetToDefault(): void {
    applyRect(defaultDialogRect(currentPolicy()))
  }

  // ---- 模态契约 ----
  let returnFocus: HTMLElement | null = null
  let escapeCancelledDrag = false

  function closeModal(): void {
    const dialog = dialogRef.value
    if (dialog?.open === true) dialog.close()
    if (returnFocus?.isConnected === true) returnFocus.focus()
    returnFocus = null
  }

  async function openModal(): Promise<void> {
    const dialog = dialogRef.value
    if (dialog === null) return
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    syncNarrow()
    hasCustomGeometry.value = false
    resetToDefault()
    if (!dialog.open) dialog.showModal()
    await nextTick()
    options.onOpened?.()
  }

  watch(() => options.open(), async (isOpen) => {
    if (isOpen) await openModal()
    else closeModal()
  }, { immediate: true })

  // ---- 拖动(只认标题栏)----
  let dragFrom = { x: 0, y: 0 }
  let dragBase: PanelRect | null = null
  let dragPointerId = -1
  let isDragPending = false

  function isHeaderControl(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('button, a, input, select, textarea') !== null
  }

  function onHeaderPointerDown(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0 || !canManipulate.value) return
    if (isHeaderControl(event.target)) return
    const base = rect.value
    if (base === null) return
    dragFrom = { x: event.clientX, y: event.clientY }
    dragBase = base
    dragPointerId = event.pointerId
    isDragPending = true
    const header = event.currentTarget
    if (header instanceof HTMLElement) header.setPointerCapture(event.pointerId)
  }

  function onHeaderPointerMove(event: PointerEvent): void {
    if (!isDragPending && !isDragging.value) return
    if (event.pointerId !== dragPointerId || dragBase === null) return
    const dx = event.clientX - dragFrom.x
    const dy = event.clientY - dragFrom.y
    if (isDragPending) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      isDragPending = false
      isDragging.value = true
      hasCustomGeometry.value = true
    }
    applyRect(clampForMove(
      { x: dragBase.x + dx, y: dragBase.y + dy, w: dragBase.w, h: dragBase.h },
      { box: viewportBox(), margin: metrics.value.margin, minW: metrics.value.minWidth, minH: metrics.value.minHeight },
    ))
  }

  function endHeaderDrag(event: PointerEvent): void {
    if (event.pointerId !== dragPointerId) return
    const header = event.currentTarget
    if (header instanceof HTMLElement && header.hasPointerCapture(event.pointerId)) header.releasePointerCapture(event.pointerId)
    isDragPending = false
    isDragging.value = false
    dragBase = null
    dragPointerId = -1
  }

  function cancelHeaderDrag(): void {
    if (!isDragPending && !isDragging.value) return
    if (dragBase !== null && isDragging.value) applyRect(dragBase)
    isDragPending = false
    isDragging.value = false
    dragBase = null
    dragPointerId = -1
  }

  function onHeaderKeydown(event: KeyboardEvent): void {
    if (!canManipulate.value || isHeaderControl(event.target)) return
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    let dx = 0
    let dy = 0
    if (event.key === 'ArrowLeft') dx = -step
    else if (event.key === 'ArrowRight') dx = step
    else if (event.key === 'ArrowUp') dy = -step
    else if (event.key === 'ArrowDown') dy = step
    else return
    event.preventDefault()
    const base = rect.value
    if (base === null) return
    hasCustomGeometry.value = true
    applyRect(clampForMove(
      { ...base, x: base.x + dx, y: base.y + dy },
      { box: viewportBox(), margin: metrics.value.margin, minW: metrics.value.minWidth, minH: metrics.value.minHeight },
    ))
  }

  // 拖动中的 Escape 取消拖动,而不是关闭窗体。用捕获阶段先于 dialog 的 cancel 默认动作。
  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    if (!isDragPending && !isDragging.value) return
    event.preventDefault()
    escapeCancelledDrag = true
    cancelHeaderDrag()
  }

  // ---- 缩放:四边是可访问的分隔条,四角是 24×24 的纯指针目标(无可视抓手) ----
  let resizeBase: PanelRect | null = null
  let resizeAxisX: AxisDir = 0
  let resizeAxisY: AxisDir = 0
  let resizeFrom = { x: 0, y: 0 }
  let resizePointerId = -1

  function onResizePointerDown(event: PointerEvent, dx: AxisDir, dy: AxisDir): void {
    if (event.button !== 0 || !canManipulate.value) return
    const base = rect.value
    if (base === null) return
    event.preventDefault()
    resizeBase = base
    resizeAxisX = dx
    resizeAxisY = dy
    resizeFrom = { x: event.clientX, y: event.clientY }
    resizePointerId = event.pointerId
    isResizing.value = true
    const element = event.currentTarget
    if (element instanceof HTMLElement) element.setPointerCapture(event.pointerId)
  }

  function onResizePointerMove(event: PointerEvent): void {
    if (resizeBase === null || event.pointerId !== resizePointerId) return
    const dx = event.clientX - resizeFrom.x
    const dy = event.clientY - resizeFrom.y
    hasCustomGeometry.value = true
    applyRect(clampDialogRect(applyDelta(resizeBase, resizeAxisX, resizeAxisY, dx, dy), currentPolicy()))
  }

  function onResizePointerUp(event: PointerEvent): void {
    if (event.pointerId !== resizePointerId) return
    const element = event.currentTarget
    if (element instanceof HTMLElement && element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    resizeBase = null
    resizePointerId = -1
    isResizing.value = false
  }

  function onResizeKeydown(event: KeyboardEvent, handle: DialogWindowEdgeHandle): void {
    if (!canManipulate.value) return
    const base = rect.value
    if (base === null) return
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    const policy = currentPolicy()
    const vertical = handle.orientation === 'vertical'
    const bounds = sizeBounds({ box: policy.box, margin: policy.margin, minW: policy.minWidth, minH: policy.minHeight }, vertical)
    let next: PanelRect | null = null
    if (event.key === 'Home' || event.key === 'End') {
      const toMax = event.key === 'End'
      const size = toMax ? (vertical ? policy.box.width : policy.box.height) : bounds.min
      next = vertical ? { ...base, w: size } : { ...base, h: size }
    } else if (vertical && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      const outward = handle.dx === 1 ? event.key === 'ArrowRight' : event.key === 'ArrowLeft'
      next = applyDelta(base, handle.dx, 0, outward ? step : -step, 0)
    } else if (!vertical && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const outward = handle.dy === 1 ? event.key === 'ArrowDown' : event.key === 'ArrowUp'
      next = applyDelta(base, 0, handle.dy, 0, outward ? step : -step)
    } else {
      return
    }
    event.preventDefault()
    hasCustomGeometry.value = true
    applyRect(clampDialogRect(next, policy))
  }

  function sizeNow(vertical: boolean): number {
    const value = rect.value
    if (value === null) return 0
    return Number((vertical ? value.w : value.h).toFixed(2))
  }

  function ariaNow(vertical: boolean): number {
    return sizeNow(vertical)
  }

  function ariaMin(vertical: boolean): number {
    const policy = currentPolicy()
    return sizeBounds({ box: policy.box, margin: policy.margin, minW: policy.minWidth, minH: policy.minHeight }, vertical).min
  }

  function ariaMax(vertical: boolean): number {
    const policy = currentPolicy()
    return sizeBounds({ box: policy.box, margin: policy.margin, minW: policy.minWidth, minH: policy.minHeight }, vertical).max
  }

  // ---- 视口变化 ----
  function onViewportChange(): void {
    metrics.value = readMetrics()
    const narrow = syncNarrow()
    if (rect.value === null) return
    if (narrow) {
      // 窄屏一律回到近满屏固定 sheet:不保留拖拽 / 缩放状态。
      hasCustomGeometry.value = false
      resetToDefault()
      return
    }
    // 没被用户调整过时,默认几何随视口重算(高度用 dvh 语义);调整过才只做钳制。
    if (!hasCustomGeometry.value) resetToDefault()
    else applyRect(clampDialogRect(rect.value, currentPolicy()))
  }

  // 原生 cancel:只响应窗体自身的 Esc;嵌套确认层的 cancel 会冒泡到这里,必须让过。
  function onCancel(event: Event): void {
    const dialog = dialogRef.value
    if (dialog === null || event.target !== dialog) return
    event.preventDefault()
    if (escapeCancelledDrag) {
      escapeCancelledDrag = false
      return
    }
    if (isDragging.value || isDragPending) {
      cancelHeaderDrag()
      return
    }
    options.onRequestClose()
  }

  function onBackdropClick(event: MouseEvent): void {
    const dialog = dialogRef.value
    if (dialog === null || event.target !== dialog) return
    const bounds = dialog.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      options.onRequestClose()
    }
  }

  function onViewportResize(): void {
    onViewportChange()
  }

  // 媒体查询变化(粗指针 / 窄屏阈值)不保证都会触发 window.resize,单独监听。
  const mediaQueries: MediaQueryList[] = []

  onMounted(() => {
    metrics.value = readMetrics()
    syncNarrow()
    // v-if 挂载(open 恒为 true)时,watch 的 immediate 早于 DOM 就绪,这里补开一次。
    if (options.open() && dialogRef.value?.open !== true) void openModal()
    else if (rect.value !== null) applyRect(rect.value)
    window.addEventListener('resize', onViewportResize)
    document.addEventListener('keydown', onDocumentKeydown, true)
    if (typeof window.matchMedia === 'function') {
      for (const query of [DIALOG_NARROW_QUERY, DIALOG_COARSE_POINTER_QUERY]) {
        const list = window.matchMedia(query)
        list.addEventListener('change', onViewportResize)
        mediaQueries.push(list)
      }
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onViewportResize)
    document.removeEventListener('keydown', onDocumentKeydown, true)
    for (const list of mediaQueries) list.removeEventListener('change', onViewportResize)
    closeModal()
  })

  return {
    dialogRef,
    style,
    isDragging,
    isResizing,
    canManipulate,
    headerHandlers: {
      pointerdown: onHeaderPointerDown,
      pointermove: onHeaderPointerMove,
      pointerup: endHeaderDrag,
      pointercancel: endHeaderDrag,
      lostpointercapture: endHeaderDrag,
      keydown: onHeaderKeydown,
    },
    resizeEdges,
    resizeCorners: RESIZE_CORNERS,
    onResizePointerDown,
    onResizePointerMove,
    onResizePointerUp,
    onResizeKeydown,
    ariaNow,
    ariaMin,
    ariaMax,
    closeDialog: closeModal,
    headerLabel,
    headerHint,
    onCancel,
    onBackdropClick,
  }
}
