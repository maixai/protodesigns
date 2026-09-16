<script setup lang="ts">
// 根组件:注入 Naive UI 全局主题覆盖与消息提供者,再渲染路由视图。
// 站点仅保留亮色主题,墨绿 + stone 映射固定来自 lightThemeOverrides。
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { RouterView } from 'vue-router'
import { lightThemeOverrides } from './theme'
import './styles/tokens.css'
</script>

<template>
  <n-config-provider :theme-overrides="lightThemeOverrides">
    <n-message-provider>
      <RouterView />
    </n-message-provider>
  </n-config-provider>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: var(--line-height-body);
  color: var(--text-primary);
  background-color: var(--bg-base);
}
</style>
