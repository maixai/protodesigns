<script setup lang="ts">
// 根组件:浅色 Naive 主题挂在根部;深色区块(顶栏 / Hero / 页脚等)在各自组件内
// 用嵌套 n-config-provider 挂深色映射(与父级深合并)。
import { NConfigProvider } from 'naive-ui'
import { lightOverrides } from './theme'
import { useI18n } from './i18n'
import SiteHeader from './components/site-header.vue'
import SiteFooter from './components/site-footer.vue'
import HeroSection from './components/hero-section.vue'
import ReachBar from './components/reach-bar.vue'
import FormFactorsSection from './components/form-factors-section.vue'
import AnywhereSection from './components/anywhere-section.vue'
import ShareSection from './components/share-section.vue'
import ConfigSection from './components/config-section.vue'
import QuickstartSection from './components/quickstart-section.vue'
import CtaSection from './components/cta-section.vue'

// 初始化 i18n(语言检测、<html lang> 与 <title> 同步在模块内完成)。
useI18n()
</script>

<template>
  <n-config-provider :theme-overrides="lightOverrides">
    <SiteHeader />
    <main id="main">
      <HeroSection />
      <ReachBar />
      <FormFactorsSection />
      <AnywhereSection />
      <ShareSection />
      <ConfigSection />
      <QuickstartSection />
      <CtaSection />
    </main>
    <SiteFooter />
  </n-config-provider>
</template>
