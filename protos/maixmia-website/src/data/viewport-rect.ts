// 锚定浮层用的一件小事:量出**触发元素**在视口坐标系里的矩形。
//
// 项目选择浮层挂在页面级(position: fixed),它要知道「从哪个触发点弹出来的」才能贴上去 ——
// 触发点有三个(tab 条的 ＋、引导页主按钮、输入坞底行的归属 chip),它们住在不同组件里,
// 故统一由触发组件在点击时量一次矩形交上来,不把 DOM 元素本身传来传去。
//
// 坐标口径与窗体几何一致:视口坐标系、单位 px(见 data/window-geometry.ts 的分层说明)。
// 量不到(元素未渲染 / 已卸载)时给零矩形 —— 浮层照样可用、可键盘操作,只是不贴触发点。
import type { WindowRect } from '../contracts/generated/workspace-window'

export function viewportRectOf(element: Element | null): WindowRect {
  const rect = element?.getBoundingClientRect()
  if (rect === undefined) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
