import { readonly, ref, watch } from 'vue'
import { isAuthenticated } from './auth/session'
import type { AppRoute, ConsoleSection } from './contracts/generated/app-route'
import { CONSOLE_NAV } from './data/console'

// 不用 vue-router:首页的 #quickstart / #top 等是浏览器原生锚点,
// hash 模式路由器会将它们误判为路径,无匹配时让首页消失。
// 仅 #/ 开头参与路由,其他 hash 保留浏览器原生滚动语义。
function parseHash(hash: string): AppRoute {
  const [path = '', query = ''] = hash.slice(1).split('?')
  if (!hash.startsWith('#/') || !path.startsWith('/console')) {
    return { page: 'home', section: 'overview', demoState: 'normal' }
  }
  const subpath = path.slice('/console'.length).replace(/^\//, '')
  const section = CONSOLE_NAV.find((item) => item.id === subpath)?.id ?? 'overview'
  const demo = new URLSearchParams(query).get('s')
  return { page: 'console', section, demoState: demo === 'empty' || demo === 'error' ? demo : 'normal' }
}

function guardedRoute(): AppRoute {
  const route = parseHash(window.location.hash)
  if (route.page === 'console' && !isAuthenticated.value) {
    // replaceState 不留下受保护路由的历史条目,且不触发 hashchange。
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`)
    return { page: 'home', section: 'overview', demoState: 'normal' }
  }
  return route
}

const routeRef = ref<AppRoute>(guardedRoute())
export const currentRoute = readonly(routeRef)

function syncRoute(): void {
  routeRef.value = guardedRoute()
}

window.addEventListener('hashchange', syncRoute)
const stopSessionWatch = watch(isAuthenticated, syncRoute, { flush: 'sync' })

export function navigateTo(page: AppRoute['page'], section: ConsoleSection = 'overview'): void {
  const hash = page === 'home' ? '#/' : `#/console${section === 'overview' ? '' : `/${section}`}`
  window.location.hash = hash
  syncRoute()
  window.scrollTo({ top: 0, behavior: 'instant' })
}

// 开发期热替换移除旧监听,防止一份导航被旧模块重复处理。
if (import.meta.hot) import.meta.hot.dispose(() => {
  stopSessionWatch()
  window.removeEventListener('hashchange', syncRoute)
})
