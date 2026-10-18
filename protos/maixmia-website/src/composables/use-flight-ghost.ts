// 显示区 ↔ 底栏条目之间的「飞行幽灵」。
//
// 目的不是装饰,而是回答一个具体的空间问题:**这块内容折到哪去了 / 从哪展开出来**。
// 做法取 Material 的 container transform + FLIP 的同一套思路:拿源矩形的轮廓,平移到目标矩形
// 并缩放到目标尺寸,过程中淡出;真正的面板 / 底栏条目在起止两端即时切换,幽灵只负责「连线」。
//
// 硬约束:
//   · 只动 transform / opacity(本仓动效白名单),不碰任何布局属性;
//   · reduced-motion 下整段跳过 —— 状态切换照旧发生,目标的静态强调由调用方保留;
//   · 同一时刻只允许一个幽灵(新的一次会取消上一次,避免快速连点叠出多条轨迹);
//   · 时长 / 缓动从工作台根上的设计 token 读取,组件里不写第二套数值。
import { onBeforeUnmount } from 'vue'

export interface FlightRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FlightOptions {
  // 缺省读 --dl-duration-slow(280ms);收起可以传 --dl-duration-base 的 200ms。
  duration?: number
  easing?: string
  // 提供时用**内容快照**而不是空轮廓:显示区整体缩小到条目时,用户看到的是窗口本身在缩,
  // 而不是一个空框在飞。快照在调用方状态切换**之前**克隆好(切换后源元素已不在 DOM)。
  sourceClone?: HTMLElement | null
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const FALLBACK_DURATION = 280
const FALLBACK_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

export interface FlightGhost {
  fly: (from: FlightRect, to: FlightRect, options?: FlightOptions) => void
  cancel: () => void
}

// 从工作台根读取设计 token;量不到时回落到与 design-language 相同的值。
function readMotionTokens(): { duration: number; easing: string } {
  const host = document.querySelector<HTMLElement>('.workspace-page')
  if (host === null) return { duration: FALLBACK_DURATION, easing: FALLBACK_EASING }
  const style = getComputedStyle(host)
  const duration = Number.parseFloat(style.getPropertyValue('--dl-duration-slow')) || FALLBACK_DURATION
  const easing = style.getPropertyValue('--dl-ease-standard').trim() || FALLBACK_EASING
  return { duration, easing }
}

export function useFlightGhost(): FlightGhost {
  let animation: Animation | null = null
  let ghost: HTMLElement | null = null

  function cancel(): void {
    animation?.cancel()
    animation = null
    ghost?.remove()
    ghost = null
  }

  function fly(from: FlightRect, to: FlightRect, options: FlightOptions = {}): void {
    if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return
    if (from.width <= 1 || from.height <= 1 || to.width <= 1 || to.height <= 1) return
    cancel()
    const tokens = readMotionTokens()
    const element = document.createElement('div')
    element.className = options.sourceClone ? 'flight-ghost flight-ghost--clone' : 'flight-ghost'
    // 幽灵挂在 body 上,已脱离工作台的 .dl-scope —— 不补作用域类的话,所有 token 都解析为空:
    // 克隆会失去底色与描边,变成一块透明的「文字残影」,而不是用户看到的那个窗格在缩小。
    // 只搬作用域类(dl-scope / dl-scope--dark|light),不搬 .workspace-page 的布局规则。
    const scope = options.sourceClone?.closest<HTMLElement>('.dl-scope') ?? document.querySelector<HTMLElement>('.workspace-page.dl-scope')
    if (scope !== null) {
      for (const name of scope.classList) {
        if (name === 'dl-scope' || name.startsWith('dl-scope--')) element.classList.add(name)
      }
    }
    element.setAttribute('aria-hidden', 'true')
    element.style.left = `${from.x}px`
    element.style.top = `${from.y}px`
    element.style.width = `${from.width}px`
    element.style.height = `${from.height}px`
    if (options.sourceClone) {
      const clone = options.sourceClone
      // 临时快照不能与真实 DOM 抢 id / 区域选择器;它也不参与焦点与命中测试。
      clone.removeAttribute('id')
      clone.removeAttribute('data-surface-id')
      for (const node of Array.from(clone.querySelectorAll('[id]'))) node.removeAttribute('id')
      clone.setAttribute('aria-hidden', 'true')
      clone.inert = true
      clone.style.width = '100%'
      clone.style.height = '100%'
      clone.style.margin = '0'
      element.appendChild(clone)
    }
    document.body.appendChild(element)
    ghost = element
    const dx = to.x - from.x
    const dy = to.y - from.y
    const scaleX = to.width / from.width
    const scaleY = to.height / from.height
    const current = element.animate(
      [
        { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 0.9 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, opacity: 0 },
      ],
      {
        duration: options.duration ?? tokens.duration,
        easing: options.easing ?? tokens.easing,
        fill: 'forwards',
      },
    )
    animation = current
    current.onfinish = () => {
      element.remove()
      if (ghost === element) ghost = null
      if (animation === current) animation = null
    }
    current.oncancel = () => {
      element.remove()
      if (ghost === element) ghost = null
    }
  }

  onBeforeUnmount(cancel)
  return { fly, cancel }
}
