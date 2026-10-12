// 窗体几何的**纯模型**:只做数学,不读 DOM、不引 Vue —— 故可被单元断言直接引用
// (tests/calibrate/window-geometry.spec.ts)。窗体能力本体(状态 + 指针 / 键盘手势)在
// src/composables/use-window-frame.ts,外观壳在 src/components/window-frame.vue。
//
// 坐标一律是**视口坐标系**(悬浮窗体 position: fixed),单位 px。「几何 px 运算是数学,
// 不是 magic number」—— 这里出现的数字都是计算,不是视觉取值,视觉取值一律走 design token。
//
// 分层意图(为什么这么切):
//   · 本模块 = 纯函数模型(L0),可被测试直接驱动,不含任何副作用;
//   · use-window-frame = 能力本体(L1),持状态、接手势、管视口重钳与 FLIP;
//   · window-frame.vue = 外观壳(L2),给标题栏与内容留槽,自己管 8 枚缩放手柄;
//   · file-panel / chat-panel = 具体窗体(L3),只留各自的标题栏内容与内容本体。
// 业界两条路是「包装组件」(react-rnd:手柄与渲染都由库管)与「headless」(dnd-kit:只给
// 状态与事件处理器,渲染归你)。本仓有强设计语言(手柄是视觉件、必须走 token),且两个
// 窗体的标题栏差异很大,故取两者之间:能力本体与外观壳分开,壳给标题栏与内容留槽。

import type { WindowRect } from '../contracts/generated/workspace-window'

// 组件内的几何表示(短字段名):x/y 是左上角,w/h 是宽高。
export interface PanelRect {
  x: number
  y: number
  w: number
  h: number
}

// 视口尺寸(或任意可用区域的尺寸)。
export interface ViewportBox {
  width: number
  height: number
}

// 钳制所需的全部输入:视口、外边距、以及**该窗体自己的**尺寸下限。
// 最小尺寸按窗体配置传入(minW / minH),不得写死在共用层里 —— 对话窗体需要更高的下限
// (输入坞搬进窗体后,200 高会让转录区只剩 17px)。
export interface ClampContext {
  box: ViewportBox
  margin: number
  minW: number
  minH: number
}

// ---- 常量(与 APG Window Splitter 的惯例同源)----

// 拖动阈值:轻微抖动仍算点击 / 双击。
export const DRAG_THRESHOLD_PX = 4
// 键盘步长与 Shift 大步长。
export const KEY_STEP = 16
export const KEY_STEP_LARGE = 64
// 级联步长:同时可见的窗体依次小偏移错开,避免完全重叠(窗口管理器的惯例)。
export const CASCADE_STEP = 28
// 默认几何占视口高度的比例。
export const DEFAULT_HEIGHT_RATIO = 0.66

// ---- 轴向与手柄描述表 ----

// 某条边 / 某个角沿各轴的伸缩方向:+1 = 该边向外(右 / 下),-1 = 该边向外(左 / 上,移动原点),0 = 不参与。
export type AxisDir = -1 | 0 | 1

export type ResizeEdge = 'e' | 'w' | 's' | 'n'
export type ResizeCorner = 'ne' | 'nw' | 'se' | 'sw'

// 四边(可聚焦的分隔条):orientation 表达「这条边调的是宽还是高」。
export interface ResizeEdgeSpec {
  edge: ResizeEdge
  orientation: 'vertical' | 'horizontal'
  // 可访问名的词条键(共用分组 workspace.windowFrame)。
  labelKey: 'resizeRight' | 'resizeLeft' | 'resizeBottom' | 'resizeTop'
  dx: AxisDir
  dy: AxisDir
}

// 四角(44×44 的纯指针目标,不占 Tab 序;键盘通路由四条边承担)。
export interface ResizeCornerSpec {
  corner: ResizeCorner
  dx: -1 | 1
  dy: -1 | 1
}

export const RESIZE_EDGES: readonly ResizeEdgeSpec[] = [
  { edge: 'e', orientation: 'vertical', labelKey: 'resizeRight', dx: 1, dy: 0 },
  { edge: 'w', orientation: 'vertical', labelKey: 'resizeLeft', dx: -1, dy: 0 },
  { edge: 's', orientation: 'horizontal', labelKey: 'resizeBottom', dx: 0, dy: 1 },
  { edge: 'n', orientation: 'horizontal', labelKey: 'resizeTop', dx: 0, dy: -1 },
]

export const RESIZE_CORNERS: readonly ResizeCornerSpec[] = [
  { corner: 'ne', dx: 1, dy: -1 },
  { corner: 'nw', dx: -1, dy: -1 },
  { corner: 'se', dx: 1, dy: 1 },
  { corner: 'sw', dx: -1, dy: 1 },
]

// ---- 契约几何 ↔ 组件几何 ----

export function toWindowRect(rect: PanelRect): WindowRect {
  return { x: rect.x, y: rect.y, width: rect.w, height: rect.h }
}

export function fromWindowRect(rect: WindowRect): PanelRect {
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
}

// ---- 尺寸变换 ----

// 把「某条边 / 某个角移动了 (dx, dy) 像素」应用到几何上。
// axisX / axisY 取该手柄的伸缩方向:向外为正。移动原点的那一侧(左 / 上)连 x / y 一起挪,
// 于是拖 NW 角时 x 与 w 同时变。
export function applyDelta(base: PanelRect, axisX: AxisDir, axisY: AxisDir, dx: number, dy: number): PanelRect {
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

// ⚠️ 两条路径的钳制**必须分开写**:拖动只许平移(尺寸是不变量),只有缩放才改尺寸。
// 早先把两者合成一个「rect 归一化」函数,结果是「往下拖」时下边界被取 min、顶边继续下移 ⇒
// **窗口高度被压小**(用户报的缺陷)。「钳制矩形」这个说法只描述边界,**不代表要压缩盒子**。
//
// 拖动 = 纯平移:整体移动 (x, y),宽高逐值不变;触边时**整个窗口停在边界上**(把 y 夹住),
// 而不是把盒子压小。往回拖能回到原值,不会累积缩小。
export function clampForMove(rect: PanelRect, context: ClampContext): PanelRect {
  const { box, margin } = context
  const floor = box.height - margin
  const top = Math.min(margin, Math.max(margin, floor - rect.h))
  const x = Math.min(Math.max(rect.x, margin), Math.max(margin, box.width - rect.w - margin))
  const maxY = Math.max(top, floor - rect.h)
  const y = Math.min(Math.max(rect.y, top), maxY)
  return { x, y, w: rect.w, h: rect.h }
}

// 缩放才改尺寸:尺寸按 min/max 与可用宽高约束(**压小在这里是合法的**),位置随之钳进视口。
// 「默认几何算出后」与「视口变化后重钳」走的都是这一条(尺寸可以被约束)。
export function clampForResize(rect: PanelRect, context: ClampContext): PanelRect {
  const { box, margin, minW: rawMinW, minH: rawMinH } = context
  const maxW = Math.max(rawMinW, box.width - 2 * margin)
  // 高度上限 = 视口高减去上下各一档外边距。
  const maxH = Math.max(rawMinH, box.height - 2 * margin)
  const minW = Math.min(rawMinW, maxW)
  const minH = Math.min(rawMinH, maxH)
  const w = Math.min(Math.max(rect.w, minW), maxW)
  const h = Math.min(Math.max(rect.h, minH), maxH)
  const x = Math.min(Math.max(rect.x, margin), Math.max(margin, box.width - w - margin))
  const minY = Math.min(margin, Math.max(margin, box.height - margin - h))
  const maxY = Math.max(minY, box.height - margin - h)
  const y = Math.min(Math.max(rect.y, minY), maxY)
  return { x, y, w, h }
}

// 被调整轴上的尺寸边界(喂给分隔条的 aria-valuemin / valuemax)。
export function sizeBounds(context: ClampContext, vertical: boolean): { min: number; max: number } {
  const extent = vertical ? context.box.width : context.box.height
  const limit = extent - 2 * context.margin
  const raw = vertical ? context.minW : context.minH
  return { min: Math.min(raw, limit), max: Math.round(Math.max(limit, 0)) }
}

// ---- 默认几何(纯计算部分;DOM 读取留在 L1)----

// 默认几何的输入度量。composer 是**停靠区里的输入坞**矩形(politeBottom 的基准),
// headingBottom 是会话头下沿;两者读不到时传 null,由本函数回落到视口中线 / 页头高度。
export interface DefaultGeometryInput {
  box: ViewportBox
  margin: number
  columnMax: number
  gutter: number
  composer: { left: number; top: number; width: number } | null
  headingBottom: number | null
  headerHeight: number
  // 「回到底部」钮的预留高度:文件窗恒常预留(它只在用户上滚时才渲染,不能靠量);
  // 对话窗传 0,保持它既有的默认几何。
  composerJumpReserve: number
  cascade: number
  minW: number
  minH: number
}

// 默认几何:宽度取阅读列 + 两侧 gutter(与消息正文同轴),横向对齐输入框;纵向从标题行下方起,
// 底边停在**输入区上方一档外边距**——「浮动窗口长期遮住输入区」是业界明列的反模式,故默认就不遮。
// 注意这只是**默认值**:拖动 / 缩放的钳制里没有「输入区之上」那条下界,窗口可被拖到视口下缘。
export function defaultRect(input: DefaultGeometryInput): PanelRect {
  const { box, margin, columnMax, gutter, composer, headingBottom, headerHeight, composerJumpReserve, cascade, minW, minH } = input
  const w = Math.min(columnMax + 2 * gutter, box.width - 2 * margin)
  const center = composer === null ? box.width / 2 : composer.left + composer.width / 2
  const floor = box.height - margin
  // 顶边:标题行之下 —— 浮动窗口盖住应用自己的导航行是硬伤。
  const y = Math.max(margin, headingBottom === null ? margin + headerHeight : headingBottom + margin)
  const politeBottom = composer === null ? floor : composer.top - composerJumpReserve - margin
  const h = Math.min(DEFAULT_HEIGHT_RATIO * box.height, Math.max(minH, Math.min(floor - margin, politeBottom) - y))
  // 级联:第 n 个同时可见的窗口向右下各挪 n 档 —— 只对**没摆过位置**的窗口生效。
  const cascadeOffset = CASCADE_STEP * Math.max(0, cascade)
  return clampForResize({ x: center - w / 2 + cascadeOffset, y: y + cascadeOffset, w, h }, { box, margin, minW, minH })
}
