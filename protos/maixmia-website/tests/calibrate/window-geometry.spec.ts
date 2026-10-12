// 窗体几何的**纯函数**断言(不经过 UI,也不碰 DOM):两条钳制路径、四角 / 四边的 delta、
// 尺寸边界、以及默认几何对输入坞的避让。两个引擎上结果一致。
//
// 覆盖的设计要点:
//   ① 「拖动只平移、缩放才改尺寸」是不可合并的两条路径(历史上合并过,导致往下拖压小高度);
//   ② 四角 delta 的 x / y 原点移动(NW / NE / SW 拖的是原点,不只是尺寸);
//   ③ 最小 / 最大边界按**窗体自己的**配置走(对话窗 320×320、文件窗 320×200);
//   ④ 默认几何避开输入坞(与输入坞同轴、底边停在它上方一档外边距)。
import { expect, test } from '@playwright/test'
import {
  CASCADE_STEP,
  DEFAULT_HEIGHT_RATIO,
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
} from '../../src/data/window-geometry'
import type { ClampContext, PanelRect } from '../../src/data/window-geometry'

const BOX = { width: 1280, height: 900 }
const MARGIN = 24
// 文件窗的尺寸下限。
const CONTEXT: ClampContext = { box: BOX, margin: MARGIN, minW: 320, minH: 200 }
// 对话窗的尺寸下限(输入坞搬进窗体后需要更高)。
const CHAT_CONTEXT: ClampContext = { ...CONTEXT, minH: 320 }

function rect(x: number, y: number, w: number, h: number): PanelRect {
  return { x, y, w, h }
}

test('契约几何 ↔ 组件几何:字段名一一对应,可往返', () => {
  const value = rect(10, 20, 300, 400)
  expect(toWindowRect(value)).toEqual({ x: 10, y: 20, width: 300, height: 400 })
  expect(fromWindowRect({ x: 10, y: 20, width: 300, height: 400 })).toEqual(value)
})

test('拖动钳制 = 纯平移:尺寸是不变量,触边时整个盒子停在边界上而不是被压小', () => {
  // 触右 / 下缘:整盒停在边界上,宽高一个像素都不变。
  const bottomRight = clampForMove(rect(5000, 5000, 800, 600), CONTEXT)
  expect(bottomRight).toEqual(rect(BOX.width - 800 - MARGIN, BOX.height - 600 - MARGIN, 800, 600))

  // 触左 / 上缘。
  const topLeft = clampForMove(rect(-999, -999, 400, 300), CONTEXT)
  expect(topLeft).toEqual(rect(MARGIN, MARGIN, 400, 300))

  // **回归点**:垂直方向「往下拖」不得把高度压小 —— 这正是两条路径合并后踩的坑。
  const pushedDown = clampForMove(rect(300, 5000, 500, 300), CONTEXT)
  expect(pushedDown.h, '往下拖后高度原样').toBe(300)
  expect(pushedDown.y, '整盒停在边界上').toBe(BOX.height - 300 - MARGIN)
  expect(pushedDown.w, '横向未参与,宽也不变').toBe(500)

  // 规模大于可用区域时不会翻转坐标(边界取 max)。
  const oversized = clampForMove(rect(0, 0, 2000, 1500), CONTEXT)
  expect(oversized.w).toBe(2000)
  expect(oversized.h).toBe(1500)
  expect(oversized.x).toBe(MARGIN)
  expect(oversized.y).toBe(MARGIN)
})

test('缩放钳制 = 可压小:尺寸按 min / max 夹住(下限由窗体自己的配置给),位置随之钳进视口', () => {
  // 放大到超过视口 → 夹到「视口 − 两侧外边距」,位置随之被钳进内边距。
  const huge = clampForResize(rect(0, 0, 5000, 5000), CONTEXT)
  expect(huge).toEqual(rect(MARGIN, MARGIN, BOX.width - 2 * MARGIN, BOX.height - 2 * MARGIN))

  // 压到比下限还小 → 抬到最小尺寸(**压小在缩放这条路径上是合法的**)。
  const tiny = clampForResize(rect(100, 100, 10, 10), CONTEXT)
  expect(tiny).toEqual(rect(100, 100, 320, 200))

  // 同一份输入在不同下限下结果不同:对话窗要求 320 高。
  expect(clampForResize(rect(100, 100, 10, 10), CHAT_CONTEXT).h).toBe(320)
  expect(clampForResize(rect(100, 100, 10, 10), CHAT_CONTEXT).w).toBe(320)

  // 视口比下限还窄时下限优先(宽度取 320);高度仍按可用范围夹。
  const squeezed = clampForResize(rect(0, 0, 800, 800), { box: { width: 300, height: 300 }, margin: MARGIN, minW: 320, minH: 200 })
  expect(squeezed.w).toBe(320)
  expect(squeezed.h).toBe(300 - 2 * MARGIN)
})

test('四角 / 四边的 delta:向外为正,移动原点的那一侧连 x / y 一起挪', () => {
  const base = rect(100, 200, 400, 300)

  // SE(右 +1 / 下 +1):只改尺寸,原点不动。
  expect(applyDelta(base, 1, 1, 40, 20)).toEqual(rect(100, 200, 440, 320))

  // NW(左 −1 / 上 −1):x 与 w 同时变、y 与 h 同时变 —— 右下角(锚点)保持不动。
  const nw = applyDelta(base, -1, -1, 40, 20)
  expect(nw).toEqual(rect(140, 220, 360, 280))
  expect(nw.x + nw.w, 'NW 拖后右下角不动').toBe(base.x + base.w)
  expect(nw.y + nw.h, 'NW 拖后右下角不动').toBe(base.y + base.h)

  // NE / SW:各只在一轴上移动原点。
  expect(applyDelta(base, 1, -1, 40, 20)).toEqual(rect(100, 220, 440, 280))
  expect(applyDelta(base, -1, 1, 40, 20)).toEqual(rect(140, 200, 360, 320))

  // 单边手柄:另一轴的位移被完全忽略。
  expect(applyDelta(base, 1, 0, 40, 999)).toEqual(rect(100, 200, 440, 300))
  expect(applyDelta(base, 0, -1, 999, 20)).toEqual(rect(100, 220, 400, 280))
  // 零位移是恒等变换。
  expect(applyDelta(base, 1, 1, 0, 0)).toEqual(base)
})

test('手柄描述表:四边各带轴向与伸缩方向,四角各带两轴符号;键盘步长 16 / 64', () => {
  expect(RESIZE_EDGES.map((spec) => spec.edge)).toEqual(['e', 'w', 's', 'n'])
  expect(RESIZE_EDGES.filter((spec) => spec.orientation === 'vertical').map((spec) => spec.edge)).toEqual(['e', 'w'])
  expect(RESIZE_EDGES.filter((spec) => spec.orientation === 'horizontal').map((spec) => spec.edge)).toEqual(['s', 'n'])
  // 左右缘只动宽度,上下缘只动高度。
  for (const spec of RESIZE_EDGES) {
    if (spec.orientation === 'vertical') expect(spec.dy).toBe(0)
    else expect(spec.dx).toBe(0)
    expect(Math.abs(spec.dx) + Math.abs(spec.dy), '恰在一个轴上有方向').toBe(1)
  }
  // 四角:两轴各带一个非零符号。
  expect(RESIZE_CORNERS.map((spec) => spec.corner)).toEqual(['ne', 'nw', 'se', 'sw'])
  for (const spec of RESIZE_CORNERS) {
    expect(Math.abs(spec.dx)).toBe(1)
    expect(Math.abs(spec.dy)).toBe(1)
  }
  expect(KEY_STEP).toBe(16)
  expect(KEY_STEP_LARGE).toBe(64)
  expect(CASCADE_STEP).toBe(28)
  expect(DEFAULT_HEIGHT_RATIO).toBeCloseTo(0.66, 5)
})

test('分隔条的尺寸边界:min 取窗体下限(必要时跟视口缩),max 取可用范围', () => {
  expect(sizeBounds(CONTEXT, true)).toEqual({ min: 320, max: BOX.width - 2 * MARGIN })
  expect(sizeBounds(CONTEXT, false)).toEqual({ min: 200, max: BOX.height - 2 * MARGIN })
  // 对话窗更高的下限只在高度这一轴上生效。
  expect(sizeBounds(CHAT_CONTEXT, true).min).toBe(320)
  expect(sizeBounds(CHAT_CONTEXT, false).min).toBe(320)
  // 视口小于下限时 min 跟着视口缩,max 与它持平(不会给出颠倒的区间)。
  const small = sizeBounds({ box: { width: 300, height: 300 }, margin: MARGIN, minW: 320, minH: 320 }, true)
  expect(small).toEqual({ min: 300 - 2 * MARGIN, max: 300 - 2 * MARGIN })
})

test('默认几何:与输入坞同轴、顶边在标题行之下、底边停在输入坞上方(预留回到底部钮)', () => {
  const composer = { left: 140, top: 700, width: 800 }
  const input = {
    box: BOX,
    margin: MARGIN,
    columnMax: 768,
    gutter: 40,
    composer,
    headingBottom: 140,
    headerHeight: 60,
    composerJumpReserve: 76,
    cascade: 0,
    minW: 320,
    minH: 200,
  }
  const placed = defaultRect(input)
  console.log(`[window geometry] 默认几何 ${JSON.stringify(placed)}`)
  // 宽度 = 阅读列 + 两侧 gutter(与消息正文同轴)。
  expect(placed.w).toBe(Math.min(768 + 2 * 40, BOX.width - 2 * MARGIN))
  // 横向对齐输入坞中心。
  expect(placed.x + placed.w / 2).toBeCloseTo(composer.left + composer.width / 2, 0)
  // 顶边在标题行(session heading)之下,不会被页头 chrome 盖住。
  expect(placed.y).toBe(140 + MARGIN)
  // 底边 = 输入坞顶 − 「回到底部」钮预留 − 一档外边距(默认就不遮输入区)。
  expect(placed.y + placed.h).toBeCloseTo(composer.top - input.composerJumpReserve - MARGIN, 1)

  // 预留高度是真的在起作用:不预留时(对话窗)窗口会一路压到输入坞上。
  const withoutReserve = defaultRect({ ...input, composerJumpReserve: 0 })
  expect(withoutReserve.y + withoutReserve.h, '不预留则更靠下').toBeGreaterThan(placed.y + placed.h)
})

test('默认几何:级联只错开没摆过位置的窗口;无输入坞时不与输入区挂钩', () => {
  const base = {
    box: BOX,
    margin: MARGIN,
    columnMax: 768,
    gutter: 40,
    composer: null,
    headingBottom: 140,
    headerHeight: 60,
    composerJumpReserve: 0,
    cascade: 0,
    minW: 320,
    minH: 200,
  }
  const first = defaultRect(base)
  const third = defaultRect({ ...base, cascade: 2 })
  // 级联偏移 = 28 × 序号,横向纵向同时错开。
  expect(third.x - first.x).toBe(CASCADE_STEP * 2)
  expect(third.y - first.y).toBe(CASCADE_STEP * 2)
  // 没有输入坞时高度只受「视口比例」约束(不与输入区挂钩)。
  expect(first.h).toBeCloseTo(DEFAULT_HEIGHT_RATIO * BOX.height, 5)
  expect(first.y + first.h).toBeLessThanOrEqual(BOX.height - MARGIN + 0.001)
  // 无输入坞时横向居中于视口中线。
  expect(first.x + first.w / 2).toBeCloseTo(BOX.width / 2, 0)
})
