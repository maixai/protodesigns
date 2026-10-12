import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    // mermaid 约 1MB,是**动态** import 的(只有真的渲染到图表时才加载,见 data/file-render.ts)。
    // Vite 启动时的依赖扫描看不到动态 import,于是首次触发时会当场重新预构建并让页面**整页 reload**
    // —— 实测会让正在跑的校准用例在流式中途被打断(一次假失败)。显式列进来,启动即预构建。
    // 这是**开发期**的预构建清单,不影响产物:它在生产构建里仍是按需加载的独立 chunk。
    include: ['mermaid'],
  },
})
