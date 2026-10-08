<script setup lang="ts">
// 根部保留深色 provider 与消息上下文;共用顶栏不包额外节点,保证 sticky。
// 首页页面组件使用 Fragment,拆页不改变首页的 DOM 布局层级。
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { darkOverrides } from './theme'
import { useI18n } from './i18n'
import { currentRoute } from './router'
import SiteHeader from './components/site-header.vue'
import HomePage from './pages/home-page.vue'
import WorkspacePage from './pages/workspace-page.vue'

// 初始化 i18n(语言检测、<html lang> 与 <title> 同步在模块内完成)。
useI18n()
</script>

<template>
  <n-config-provider :theme-overrides="darkOverrides">
    <n-message-provider>
      <SiteHeader />
      <HomePage v-if="currentRoute.page === 'home'" />
      <WorkspacePage v-else />
    </n-message-provider>
  </n-config-provider>
</template>
