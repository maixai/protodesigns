// 原型挂在聚合预览站 /p/maixmia-website/ 子路径下,未来可能由 file:// 套壳,
// 因此使用 hash 路由。不用 vue-router:首页已有 #quickstart 等裸片段深链,
// hash 模式路由器会把它们误判为 /quickstart 路径并重定向,破坏首页。
// 只有 #/ 开头参与路由,其余 hash 保留浏览器原生锚点语义;首页不写路由 hash。
import { readonly, ref, watch } from 'vue'
import { isAuthenticated } from './auth/session'
import type { AppRoute } from './contracts/generated/app-route'

function parseHash(hash: string): AppRoute {
  const [path = '', query = ''] = hash.slice(1).split('?')
  if (!hash.startsWith('#/') || path !== '/workspace') {
    return { page: 'home', demoState: 'normal' }
  }
  const demo = new URLSearchParams(query).get('s')
  return { page: 'workspace', demoState: demo === 'empty' || demo === 'error' || demo === 'waiting' ? demo : 'normal' }
}

function clearHash(): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

function guardedRoute(): AppRoute {
  const route = parseHash(window.location.hash)
  if (route.page === 'workspace' && !isAuthenticated.value) {
    // replaceState 不留下受保护路由的历史条目,且不触发 hashchange。
    clearHash()
    return { page: 'home', demoState: 'normal' }
  }
  return route
}

const routeRef = ref<AppRoute>(guardedRoute())
export const currentRoute = readonly(routeRef)

function syncRoute(): void {
  const previousPage = routeRef.value.page
  routeRef.value = guardedRoute()
  if (routeRef.value.page === 'workspace' && previousPage !== 'workspace') {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
}

window.addEventListener('hashchange', syncRoute)
const stopAuthWatch = watch(isAuthenticated, syncRoute, { flush: 'sync' })

export function navigateTo(page: AppRoute['page'], demoState: AppRoute['demoState'] = 'normal'): void {
  if (page === 'home') {
    clearHash()
  } else {
    window.location.hash = `#/workspace${demoState === 'normal' ? '' : `?s=${demoState}`}`
  }
  syncRoute()
}

// 开发期热替换移除旧监听与守卫,防止一份导航被旧模块重复处理。
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener('hashchange', syncRoute)
  stopAuthWatch()
})
