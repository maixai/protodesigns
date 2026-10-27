<script setup lang="ts">
// 深色壳覆盖异步路由间隙；首页离场不影响共用 sticky 顶栏。
import { defineAsyncComponent } from 'vue'
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { darkOverrides } from './theme'
import { useI18n } from './i18n'
import { currentRoute } from './router'
import { authPhase } from './auth/transition'
import SiteHeader from './components/site-header.vue'
import HomePage from './pages/home-page.vue'

// 工作台**按路由懒加载**:它带着整套编辑器与渲染器(CodeMirror / markdown-it / DOMPurify,
// 见 file-panel),静态 import 会让营销首页也下载它们 —— 实测主 chunk 从 391 kB 涨到 1121 kB
// (gzip 127 → 395 kB),而首页一个字节都用不上。拆包后这些依赖只随工作台那条路由加载。
// mermaid 另有一层(它更重且只在渲染 mermaid 图时才需要,故在 file-render 里按需 import)。
const WorkspacePage = defineAsyncComponent(() => import('./pages/workspace-page.vue'))

// 初始化 i18n(语言检测、<html lang> 与 <title> 同步在模块内完成)。
useI18n()
</script>

<template>
  <n-config-provider :theme-overrides="darkOverrides">
    <n-message-provider>
      <div class="app-shell dl-scope dl-scope--dark">
        <SiteHeader />
        <div v-if="currentRoute.page === 'home'" class="auth-home" :class="{ 'is-leaving': authPhase === 'leaving' }" :inert="authPhase === 'leaving'">
          <HomePage />
        </div>
        <WorkspacePage v-else />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.app-shell { min-block-size: 100dvh; background: var(--dl-bg-base); }
.auth-home.is-leaving { animation: auth-home-leave calc(var(--dl-duration-fast) + (var(--dl-duration-base) - var(--dl-duration-fast)) / 3) var(--dl-ease-standard) both; }
@keyframes auth-home-leave { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .auth-home.is-leaving { animation-duration: 0.01ms; }
}
</style>
