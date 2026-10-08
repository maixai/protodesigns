<script setup lang="ts">
// 根组件:浅色 Naive 主题挂根部;.dl-scope 语义角色层挂在根容器上一次,全页生效。
// n-message-provider 提供首页轻提示与登出致意,不参与文档流。
// 原生页内锚点仍渲染首页,仅控制台路由替换主体,不渲染营销页脚。
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { lightOverrides } from './theme'
import { currentRoute } from './router'
import ConsolePage from './pages/console-page.vue'
import { useI18n } from './i18n'
import SiteHeader from './components/site-header.vue'
import SiteFooter from './components/site-footer.vue'
import HeroSection from './components/hero-section.vue'
import CompareBand from './components/compare-band.vue'
import CapabilitiesGrid from './components/capabilities-grid.vue'
import MeshSection from './components/mesh-section.vue'
import PlatformsBand from './components/platforms-band.vue'
import QuickstartSection from './components/quickstart-section.vue'

// 初始化 i18n(语言检测、<html lang> 与 <title> 同步在模块内完成)。
useI18n()
</script>

<template>
  <n-config-provider :theme-overrides="lightOverrides">
    <n-message-provider>
      <div class="dl-scope">
        <SiteHeader />
        <ConsolePage v-if="currentRoute.page === 'console'" />
        <main v-else id="main">
          <HeroSection />
          <CompareBand />
          <CapabilitiesGrid />
          <MeshSection />
          <PlatformsBand />
          <QuickstartSection />
        </main>
        <SiteFooter v-if="currentRoute.page === 'home'" />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>
