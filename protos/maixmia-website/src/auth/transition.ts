import { ref } from 'vue'

// 只编排视图离场，不承载认证或身份数据。
export const authPhase = ref<'idle' | 'leaving'>('idle')
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// 等待 CSS 自身的时间轴，避免 JS 与 token 派生时长形成两份事实源。
export async function waitForMotion(element: HTMLElement | null): Promise<void> {
  if (element === null || prefersReducedMotion()) return
  await Promise.all(element.getAnimations().map(async (animation): Promise<void> => {
    try { await animation.finished } catch { /* 卸载或切换状态取消动画时，不阻塞后续生命周期。 */ }
  }))
}
