// 图版几何共享模块:标签页 5 屏共用一个 viewBox(720×520),所有坐标手写固定值,
// 不得使用随机数 —— 校准截图基线依赖这份确定性。
// 尺寸与 style.css 的 --dl-figure-width / --dl-figure-height 同步(改一处必须改另一处)。
import type { CSSProperties } from 'vue'

export const FIGURE_WIDTH = 720
export const FIGURE_HEIGHT = 520

// viewBox 坐标 → 相对图版盒的百分比,供 HTML 覆盖层标签定位。
// 标签用 HTML 而非 SVG <text>:SVG 随布局缩放,内置文字的实际字号会漂出字号阶;
// HTML 覆盖层与 SVG 缩放解耦,恒为 --dl-font-size-xs。
export function toPercent(x: number, y: number): CSSProperties {
  return {
    left: `${(x / FIGURE_WIDTH) * 100}%`,
    top: `${(y / FIGURE_HEIGHT) * 100}%`,
  }
}
