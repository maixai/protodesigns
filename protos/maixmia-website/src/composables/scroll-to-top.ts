// 回到页面顶部:hash 路由只接管 #/ 前缀,裸 #top 不会触发滚动,故显式滚动。
// 尊重 reduced-motion:降级时不使用平滑滚动。
export function scrollToPageTop(): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
}
