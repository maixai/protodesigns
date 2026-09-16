// preview 路由:history 模式挂在域名根(base=/),首页为 /;详情页 URL 为 /proto/<slug>/,
// 由 ProtoPage 内 iframe 加载 /p/<slug>/(protos 统一在 /p/ 下)。
import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './pages/HomePage.vue'
import ProtoPage from './pages/ProtoPage.vue'

export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/proto/:slug', name: 'proto', component: ProtoPage },
  ],
})
