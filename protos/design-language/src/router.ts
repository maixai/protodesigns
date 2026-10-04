// 路由:青瓷已定稿,站点收敛为单一语言的调教台。
//
// 用 hash 模式:产物会挂在聚合预览站的子路径(/p/design-language/)下,
// 未来也可能被桌面壳以 file:// 加载,history 模式在这两种情形下都会失效。
import { createRouter, createWebHashHistory } from 'vue-router'

import TuningPage from './pages/tuning-page.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'tuning', component: TuningPage },
    // 未匹配的路径统一回到调教台,避免空白画面。
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
