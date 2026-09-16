// preview 入口:创建 Vue 应用并挂载路由。
// Naive UI 的主题与消息提供者由 App.vue 注入,入口不做全局注册以保留 tree-shaking。
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

createApp(App).use(router).mount('#app')
