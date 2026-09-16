// preview 站点构建配置:挂在域名根(base=/),首页为 /,protos 统一在 /p/<slug>/ 下由静态服务器映射。
// build 时资源路径不加前缀;静态服务器负责 /p/ 下各 proto 产物与 /proto/ SPA 路由的映射。
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  base: '/',
})
