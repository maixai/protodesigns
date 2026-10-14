// 窗体能力本体(L1):状态 + 指针 / 键盘手势 + 视口重钳 + FLIP + 拆出跟手。
// 纯数学在 src/data/window-geometry.ts(L0),外观壳在 src/components/window-frame.vue(L2)。
//
// 一个壳管两态:同一个能力本体同时承载 `floating` / `docked`;停靠态不启用几何(不写 left/top/
// width/height)、不接拖动 / 缩放,只保留 FLIP 的 transform 通道 —— 于是停靠块由区域内容区决定尺寸。
//
// 关键取舍(踩过的坑,别再犯):
//   · resolveLength 通过向 .workspace-page 插探针元素读 CSS 自定属性,**必须缓存**:每帧插 DOM
//     不只是慢,webkit 上会让指针事件在拖拽中途丢失(实测长位移只走到 1/10);
//   · 拖动与缩放的钳制是**两条路径**(见 window-geometry 的说明),共用层不得合并;
//   · 拖动期间只走几何直写与 transform,布局属性不做过渡(动效白名单只有 transform / opacity)。

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { WindowRect } from '../contracts/generated/workspace-window'
import {
  DRAG_THRESHOLD_PX,
  KEY_STEP,
  KEY_STEP_LARGE,
  RESIZE_CORNERS,
  RESIZE_EDGES,
  applyDelta,
  clampForMove,
  clampForResize,
  defaultRect,
  fromWindowRect,
  sizeBounds,
  toWindowRect,
} from '../data/window-geometry'
import type {
  AxisDir,
  ClampContext,
  PanelRect,
  ResizeCornerSpec,
  ResizeEdge,
  ViewportBox,
} from '../data/window-geometry'
import { useI18n } from '../i18n'

export interface WindowFramePoint {
  x: number
  y: number
}

export type WindowPlacement = 'floating' | 'docked'

export interface WindowFrameOptions {
  // 当前形态。停靠态不启用几何 / 拖动 / 缩放(几何由区域内容区给出)。
  placement: () => WindowPlacement
  // 最小尺寸**按窗体配置**:不得在共用层里写死(对话窗比文件窗需要更高的下限)。
  minWidth: number
  minHeight: number
  // 级联序号:同时可见的悬浮窗依次小偏移错开。
  cascade: () => number
  // 该窗体的记忆几何(null = 还没被摆过位置)。
  initialRect: () => WindowRect | null
  // 拆出跟手:非 null 时用默认尺寸、左上角落在该点(每次变化直接改写几何,零过渡)。
  followPoint: () => WindowFramePoint | null
  // FLIP 的来源矩形(屏幕坐标):挂载时先「退」到它,再过渡回自身落点。
  flipFrom: () => WindowRect | null
  // aria-controls 指向的内容区 id。
  bodyId: string
  // 标题栏双击 / 头部按钮的语义由具体窗体给(文件在悬浮↔停靠间切换,对话只停靠)。
  onTogglePlacement: () => void
  // 「回到底部」钮的预留高度是否参与默认几何(文件窗 true;对话窗 false,保持既有默认几何)。
  composerJumpReserve?: boolean
  // 根元素宽度变化(容器查询的驱动方,如文件窗的并排降级)。
  onRootWidth?: (width: number) => void
  // 向外抛的事件(由具体窗体接到自己的 defineEmits 上)。
  on: {
    rectChange: (rect: WindowRect | null) => void
    dragMove: (point: WindowFramePoint) => void
    dragEnd: (point: WindowFramePoint) => void
    dragCancel: () => void
  }
}

// 四边的渲染描述(可访问名已解析成本地化文本)。
export interface WindowFrameEdgeHandle {
  edge: ResizeEdge
  orientation: 'vertical' | 'horizontal'
  label: string
  hint: string
  dx: AxisDir
  dy: AxisDir
}

export type WindowFrameCornerHandle = ResizeCornerSpec

export interface WindowFrameApi {
  rootRef: Ref<HTMLElement | null>
  headerRef: Ref<HTMLElement | null>
  // 几何 + FLIP 位移(一整串 cssText;停靠态只有 FLIP 位移)。
  rectStyle: ComputedRef<string>
  isDocked: ComputedRef<boolean>
  // 是否已有显式几何(复位 / 停靠态为 false)—— 供 data 属性表达「当前用的是默认几何」。
  hasExplicitRect: ComputedRef<boolean>
  isMoving: ComputedRef<boolean>
  isDragging: Ref<boolean>
  isResizing: Ref<boolean>
  // 标题栏的一整套手势(v-on 绑定对象):拖动 + 键盘平移 + 双击。
  headerHandlers: {
    pointerdown: (event: PointerEvent) => void
    pointermove: (event: PointerEvent) => void
    pointerup: (event: PointerEvent) => void
    pointercancel: (event: PointerEvent) => void
    lostpointercapture: (event: PointerEvent) => void
    dblclick: (event: MouseEvent) => void
    keydown: (event: KeyboardEvent) => void
  }
  resizeEdges: ComputedRef<WindowFrameEdgeHandle[]>
  resizeCorners: readonly ResizeCornerSpec[]
  bodyId: string
  onResizePointerDown: (event: PointerEvent, dx: AxisDir, dy: AxisDir) => void
  onResizePointerMove: (event: PointerEvent) => void
  onResizePointerUp: (event: PointerEvent) => void
  onResizeKeydown: (event: KeyboardEvent, handle: WindowFrameEdgeHandle) => void
  ariaNow: (vertical: boolean) => number
  ariaMin: (vertical: boolean) => number
  ariaMax: (vertical: boolean) => number
  currentWindowRect: () => WindowRect | null
  emitRect: () => void
  resetGeometry: () => void
}

// 探针挂在**工作台根**上(不是 rootRef 的父节点 —— 首次渲染时 rootRef 还是 null,会落到 body 上,
// 那里读不到 --workspace-* 这类定义在页面上的自定属性,长度会静默解析成 0)。
const HOST_SELECTOR = '.workspace-page'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
// 停靠区(根区域内容区)里的那个输入坞 —— 输入坞属于对话窗体,悬浮的对话窗体也会各带一个;
// 不限定范围就会命中 DOM 里第一个(可能正是某个悬浮窗的)。
const COMPOSER_SELECTOR = '#conversation-panel-body .composer-form'
// 「回到底部」钮锚在**坞顶**之上(见 chat-composer 的 .scroll-to-bottom),而坞顶未必就是卡片顶 ——
// 卡片之上还可能有一条挂耳标签带。预留高度必须按「坞顶 → 卡片顶」这段实测来算,见 measureJumpReserve。
const COMPOSER_DOCK_SELECTOR = '#conversation-panel-body .composer-dock'
const HEADING_SELECTOR = '.conversation-heading'

export function useWindowFrame(options: WindowFrameOptions): WindowFrameApi {
  const { t } = useI18n()

  const rootRef = ref<HTMLElement | null>(null)
  const headerRef = ref<HTMLElement | null>(null)
  // 显式几何(null = 用默认几何 / 停靠态不给几何)。
  const panelRect = ref<PanelRect | null>(null)
  const isDragging = ref(false)
  const isResizing = ref(false)
  // FLIP 的 transform 位移('' = 无位移)。
  const flipStyle = ref('')
  // 视口尺寸变化时自增,驱动默认几何重算(computed 里读它)。
  const viewportNonce = ref(0)
  const viewportMargin = ref(24)
  // 「回到底部」钮的预留高度:恒常预留(它只在用户上滚时才渲染,不能靠量它)。
  const jumpReserve = ref(0)

  const isDocked = computed<boolean>(() => options.placement() === 'docked')
  const hasExplicitRect = computed<boolean>(() => panelRect.value !== null)
  const isMoving = computed<boolean>(() => isDragging.value || isResizing.value)

  const resizeEdges = computed<WindowFrameEdgeHandle[]>(() =>
    RESIZE_EDGES.map((spec) => ({
      edge: spec.edge,
      orientation: spec.orientation,
      dx: spec.dx,
      dy: spec.dy,
      label: t.value.workspace.windowFrame[spec.labelKey],
      hint: t.value.workspace.windowFrame.resizeHint,
    })),
  )

  function resolveLength(name: string): number {
    const host = document.querySelector(HOST_SELECTOR) ?? document.body
    const probe = document.createElement('div')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.inlineSize = `var(${name})`
    host.appendChild(probe)
    const value = probe.getBoundingClientRect().width
    probe.remove()
    return value
  }

  function viewportBox(): ViewportBox {
    void viewportNonce.value
    return { width: window.innerWidth, height: window.innerHeight }
  }

  function clampContext(): ClampContext {
    return { box: viewportBox(), margin: viewportMargin.value, minW: options.minWidth, minH: options.minHeight }
  }

  // 「坞顶 → 卡片顶」的高度(卡片之上那条挂耳标签带)。读不到锚点时回落 0 —— 与没有那条带时同值。
  function measuredDockBand(): number {
    const dock = document.querySelector(COMPOSER_DOCK_SELECTOR)
    const card = document.querySelector(COMPOSER_SELECTOR)
    if (!(dock instanceof HTMLElement) || !(card instanceof HTMLElement)) return 0
    return Math.max(0, card.getBoundingClientRect().top - dock.getBoundingClientRect().top)
  }

  // 「回到底部」钮的预留高度:钮浮在**坞顶之上**(底边 = 坞顶 − 一档间隙,高 = 独立控件档),
  // 所以从卡片顶往上要留出「标签带 + 间隙 + 钮高 + 一档边距」。只按钮高预留会漏掉标签带 ——
  // 卡片上方的悬浮窗体就会压住那枚钮。
  function measureJumpReserve(): void {
    if (options.composerJumpReserve !== true) return
    jumpReserve.value =
      measuredDockBand() + (resolveLength('--dl-target-size') || 44) + 2 * (resolveLength('--dl-space-2') || 8)
  }

  // 默认几何:DOM 读取都留在这里,纯计算交给 window-geometry 的 defaultRect。
  function computeDefaultRect(): PanelRect {
    // 停靠态没有自有几何(尺寸由区域内容区给出)—— 不做任何 DOM 读取。
    if (isDocked.value) return { x: 0, y: 0, w: options.minWidth, h: options.minHeight }
    const box = viewportBox()
    const margin = viewportMargin.value
    const composer = document.querySelector(COMPOSER_SELECTOR)
    const composerRect = composer instanceof HTMLElement ? composer.getBoundingClientRect() : null
    const heading = document.querySelector(HEADING_SELECTOR)
    const headingRect = heading instanceof HTMLElement ? heading.getBoundingClientRect() : null
    return defaultRect({
      box,
      margin,
      columnMax: resolveLength('--workspace-column-max') || 768,
      gutter: resolveLength('--workspace-gutter') || 0,
      composer: composerRect === null ? null : { left: composerRect.left, top: composerRect.top, width: composerRect.width },
      headingBottom: headingRect === null ? null : headingRect.bottom,
      headerHeight: resolveLength('--dl-header-height') || 60,
      composerJumpReserve: options.composerJumpReserve === true ? jumpReserve.value : 0,
      cascade: options.cascade(),
      minW: options.minWidth,
      minH: options.minHeight,
    })
  }

  // 有效几何:显式几何优先,否则用默认几何。
  const effectiveRect = computed<PanelRect>(() => panelRect.value ?? computeDefaultRect())

  // 当前几何 = 有效几何(权威来源,不回读 DOM —— DOM 更新是异步的,连续按键回读会丢步)。
  function currentRect(): PanelRect {
    return effectiveRect.value
  }

  // 显式几何以**一整串 cssText** 绑定(而不是逐条属性对象):一次性整体写入,避免逐条补丁
  // 在连续调整时丢掉某一条(实测过)。层序不由这里给(见 window-frame.vue)。
  // **停靠模式不写几何**:它填满区域内容区,尺寸由容器给出。
  // FLIP 的位移与几何共用这一个通道。
  const rectStyle = computed<string>(() => {
    const flip = flipStyle.value === '' ? '' : `transform:${flipStyle.value}`
    if (isDocked.value) return flip
    const rect = effectiveRect.value
    const geometry = [`left:${rect.x}px`, `top:${rect.y}px`, `width:${rect.w}px`, `height:${rect.h}px`].join(';')
    return flip === '' ? geometry : `${geometry};${flip}`
  })

  // 当前几何(契约形状),供页面把「吸附前的悬浮矩形」当作停靠面板 FLIP 的来源。
  function currentWindowRect(): WindowRect | null {
    const rect = panelRect.value
    return rect === null ? null : toWindowRect(rect)
  }

  // 把当前几何上报给页面(由页面按分域保存)—— 只在**落定时**上报,不在拖动 / 缩放的每一帧上报。
  function emitRect(): void {
    options.on.rectChange(currentWindowRect())
  }

  // 复位几何:回到默认几何(居中 + 按级联序号错开)。把持有的几何清空即可 —— effectiveRect
  // 自动回落到 defaultRect(),同时把 null 上报给页面(否则切域再切回来会恢复成复位前的位置)。
  function resetGeometry(): void {
    panelRect.value = null
    emitRect()
  }

  // FLIP:先把窗体**退**到来源矩形(此刻不加过渡 —— 与目标状态同帧写入,浏览器不会从中途补间),
  // 下一帧起再过渡回自身落点。只动 transform,不碰任何布局属性。
  // reduced-motion 下**整段跳过**:位移是纯装饰,不做才是尊重用户偏好(状态切换照旧发生)。
  function playFlip(): void {
    const from = options.flipFrom()
    const element = rootRef.value
    if (from === null || element === null) return
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return
    const rect = element.getBoundingClientRect()
    const dx = Math.round(from.x - rect.x)
    const dy = Math.round(from.y - rect.y)
    if (dx === 0 && dy === 0) return
    flipStyle.value = `translate(${dx}px, ${dy}px)`
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flipStyle.value = ''
      })
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
    // 停靠形态没有拖拽(几何由容器给出)。
    if (isDocked.value) return
    // 标题栏里的按钮(视图切换 / 换行 / 停靠 / 关闭)不算拖拽手柄。
    if (isHeaderControl(event.target)) return
    const rect = currentRect()
    dragFrom = { x: event.clientX, y: event.clientY }
    dragBase = rect
    dragPointerId = event.pointerId
    isDragPending = true
    // 按下即捕获:此后指针移出标题栏也收得到 move / up —— 否则「一次移动就甩出标题栏」的手势
    // (快速拖动 / 自动化里的大步长移动)会静默丢事件。
    headerRef.value?.setPointerCapture(event.pointerId)
  }

  function onHeaderPointerMove(event: PointerEvent): void {
    if (!isDragPending && !isDragging.value) return
    if (event.pointerId !== dragPointerId || dragBase === null) return
    const dx = event.clientX - dragFrom.x
    const dy = event.clientY - dragFrom.y
    if (isDragPending) {
      // 越过阈值才算拖拽(轻微抖动仍是点击 / 双击)。
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      isDragPending = false
      isDragging.value = true
      headerRef.value?.setPointerCapture(event.pointerId)
    }
    // 拖动 = 纯平移:宽高取自 dragBase(拖拽开始时的那一份),全程不参与钳制的计算。
    // 直接改写几何(不挂过渡)—— 跟手阶段零过渡。
    panelRect.value = clampForMove({ ...dragBase, x: dragBase.x + dx, y: dragBase.y + dy }, clampContext())
    // 只报事实:把指针视口坐标交给页面判定落点(顶部条 / 区域边缘 / 区域内部)。
    options.on.dragMove({ x: event.clientX, y: event.clientY })
  }

  // 拖动结束:commit=true(指针抬起)→ 先把落定几何写回(页面据此取 FLIP 来源 / 记住位置),
  // 再把指针坐标交给页面统一裁决;commit=false(被取消)→ 报取消,页面收起落点预览。
  function endHeaderDrag(event: PointerEvent, commit: boolean): void {
    if (event.pointerId !== dragPointerId) return
    if (headerRef.value?.hasPointerCapture(event.pointerId) === true) headerRef.value.releasePointerCapture(event.pointerId)
    const wasDragging = isDragging.value
    isDragPending = false
    isDragging.value = false
    dragBase = null
    dragPointerId = -1
    emitRect()
    if (!wasDragging) return
    if (commit) options.on.dragEnd({ x: event.clientX, y: event.clientY })
    else options.on.dragCancel()
  }

  // 取消本次拖动(Escape / 指针被系统打断):几何回到按下时的那一份,不做任何迁移。
  function cancelHeaderDrag(): void {
    if (!isDragPending && !isDragging.value) return
    if (headerRef.value?.hasPointerCapture(dragPointerId) === true) headerRef.value.releasePointerCapture(dragPointerId)
    if (dragBase !== null && isDragging.value) panelRect.value = dragBase
    const wasDragging = isDragging.value
    isDragPending = false
    isDragging.value = false
    dragBase = null
    dragPointerId = -1
    if (wasDragging) options.on.dragCancel()
  }

  // 标题栏的方向键 = **平移**:只改位置、不改尺寸(键盘替代通路)。
  function onHeaderKeydown(event: KeyboardEvent): void {
    if (isDocked.value) return
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    let dx = 0
    let dy = 0
    if (event.key === 'ArrowLeft') dx = -step
    else if (event.key === 'ArrowRight') dx = step
    else if (event.key === 'ArrowUp') dy = -step
    else if (event.key === 'ArrowDown') dy = step
    else return
    event.preventDefault()
    const rect = currentRect()
    panelRect.value = clampForMove({ ...rect, x: rect.x + dx, y: rect.y + dy }, clampContext())
    emitRect()
  }

  function onHeaderDoubleClick(event: MouseEvent): void {
    if (isHeaderControl(event.target)) return
    // 双击标题栏 = 在两种形态之间切换(见具体窗体的语义)。头部另有等价的原生按钮,
    // 供键盘 / 单指针无障碍通路使用(WCAG 2.5.7 要求拖动类动作有非拖动的替代)。
    options.onTogglePlacement()
  }

  // 拖动中的 Escape:放弃本次拖动、几何回到按下时的那一份(不吸附、不迁移)。
  // 用**捕获阶段**监听:页面也在 document 上处理 Escape(它会关掉当前悬浮窗),捕获先于冒泡,
  // 且我们 preventDefault 后页面的处理器会据此让过(见 workspace-page 的 onFilePanelEscape)。
  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    if (!isDragPending && !isDragging.value) return
    event.preventDefault()
    cancelHeaderDrag()
  }

  // ---- 缩放:四边是可访问的分隔条(APG Window Splitter),四角是 44×44 的指针目标 ----
  let resizeBase: PanelRect | null = null
  let resizeAxisX: AxisDir = 0
  let resizeAxisY: AxisDir = 0
  let resizeFrom = { x: 0, y: 0 }
  let resizePointerId = -1

  function onResizePointerDown(event: PointerEvent, dx: AxisDir, dy: AxisDir): void {
    if (event.button !== 0) return
    const rect = currentRect()
    event.preventDefault()
    resizeBase = rect
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
    panelRect.value = clampForResize(applyDelta(resizeBase, resizeAxisX, resizeAxisY, dx, dy), clampContext())
  }

  function onResizePointerUp(event: PointerEvent): void {
    if (event.pointerId !== resizePointerId) return
    const element = event.currentTarget
    if (element instanceof HTMLElement && element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
    resizeBase = null
    resizePointerId = -1
    isResizing.value = false
    emitRect()
  }

  function onResizeKeydown(event: KeyboardEvent, handle: WindowFrameEdgeHandle): void {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    const base = currentRect()
    const context = clampContext()
    const vertical = handle.orientation === 'vertical'
    const bounds = sizeBounds(context, vertical)
    let next: PanelRect | null = null
    if (event.key === 'Home' || event.key === 'End') {
      // Home / End:到尺寸的最小 / 最大。
      const toMax = event.key === 'End'
      const size = toMax ? (vertical ? context.box.width : context.box.height) : bounds.min
      next = vertical ? { ...base, w: size } : { ...base, h: size }
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
    panelRect.value = clampForResize(next, context)
    emitRect()
  }

  // 内容区尺寸:喂给分隔条的 aria-valuenow(键盘 / 指针调整之后都要重新算)。
  function ariaNow(vertical: boolean): number {
    const rect = effectiveRect.value
    return Number((vertical ? rect.w : rect.h).toFixed(2))
  }

  function ariaMin(vertical: boolean): number {
    return sizeBounds(clampContext(), vertical).min
  }

  function ariaMax(vertical: boolean): number {
    return sizeBounds(clampContext(), vertical).max
  }

  // 视口 / 自身宽度变化 → 刷新度量并**重新钳一次**(浮动窗口最经典的缺陷就是「视口变小后
  // 窗口留在界外」),再把自身宽度交给容器查询的驱动方。
  function handleRootResize(): void {
    if (panelRect.value !== null) panelRect.value = clampForResize(panelRect.value, clampContext())
    options.onRootWidth?.(rootRef.value?.clientWidth ?? 0)
  }

  function onViewportResize(): void {
    viewportMargin.value = resolveLength('--dl-space-6') || 24
    measureJumpReserve()
    viewportNonce.value += 1
    handleRootResize()
  }

  // 跟手(拆出):非 null 时用默认尺寸、左上角落在该点(零过渡);结束后把落定几何上报。
  watch(options.followPoint, (next, previous) => {
    if (next !== null) {
      const base = panelRect.value ?? computeDefaultRect()
      panelRect.value = clampForMove({ ...base, x: next.x, y: next.y }, clampContext())
      return
    }
    if ((previous ?? null) !== null) emitRect()
  })

  let observer: ResizeObserver | undefined

  onMounted(() => {
    viewportMargin.value = resolveLength('--dl-space-6') || 24
    measureJumpReserve()
    // 挂载后再重算一次默认几何:首帧求值时页面样式可能尚未就绪,自定属性会解析成 0。
    viewportNonce.value += 1
    const follow = options.followPoint()
    const stored = options.initialRect()
    if (follow !== null) {
      // 刚从 tab 条上拆出来:用**默认尺寸**、左上角落在指针给出的点上(抓取偏移已在页面扣掉)。
      panelRect.value = clampForMove({ ...computeDefaultRect(), x: follow.x, y: follow.y }, clampContext())
    } else if (stored !== null) {
      // 该窗体在本分域里被摆过位置 → 按原样恢复(切项目 / 切文件回来是同一个位置)。
      panelRect.value = clampForResize(fromWindowRect(stored), clampContext())
    } else if (!isDocked.value) {
      // 没摆过位置的**悬浮**窗体:把挂载时算出的默认几何**锁定为显式几何**。
      // 级联偏移由层序(数组顺序)给出,而焦点会重排层序 —— 若默认几何每次渲染都重算,
      // 点一个窗口就会让其它窗口整体跳位。窗口管理器里「点谁谁在上」不该挪动别人。
      panelRect.value = computeDefaultRect()
    }
    handleRootResize()
    // FLIP 要在几何 / 尺寸落定、且元素已在 DOM 里之后量,故放在最后。
    playFlip()
    if (rootRef.value !== null && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => handleRootResize())
      observer.observe(rootRef.value)
    }
    window.addEventListener('resize', onViewportResize)
    document.addEventListener('keydown', onDocumentKeydown, true)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    window.removeEventListener('resize', onViewportResize)
    document.removeEventListener('keydown', onDocumentKeydown, true)
  })

  return {
    rootRef,
    headerRef,
    rectStyle,
    isDocked,
    hasExplicitRect,
    isMoving,
    isDragging,
    isResizing,
    headerHandlers: {
      pointerdown: onHeaderPointerDown,
      pointermove: onHeaderPointerMove,
      pointerup: (event: PointerEvent) => endHeaderDrag(event, true),
      pointercancel: (event: PointerEvent) => endHeaderDrag(event, false),
      lostpointercapture: (event: PointerEvent) => endHeaderDrag(event, false),
      dblclick: onHeaderDoubleClick,
      keydown: onHeaderKeydown,
    },
    resizeEdges,
    resizeCorners: RESIZE_CORNERS,
    bodyId: options.bodyId,
    onResizePointerDown,
    onResizePointerMove,
    onResizePointerUp,
    onResizeKeydown,
    ariaNow,
    ariaMin,
    ariaMax,
    currentWindowRect,
    emitRect,
    resetGeometry,
  }
}
