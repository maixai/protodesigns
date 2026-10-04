<script setup lang="ts">
// 调教台外壳:唯一设置 Naive 明暗主题的地方,语言容器在此之下覆盖 token。
// 外壳本身不采用语言自身的设计,保持中性,以免干扰对语言取值的判断。
import { NConfigProvider, darkTheme } from 'naive-ui'
import { computed } from 'vue'
import { RouterView } from 'vue-router'

import { themeMode, toggleThemeMode } from './theme/theme-mode'

// 明暗主题对象:浅色用 Naive 默认,深色切到 darkTheme。
const naiveTheme = computed(() => (themeMode.value === 'dark' ? darkTheme : null))
</script>

<template>
  <n-config-provider :theme="naiveTheme">
    <div class="app">
      <header class="topbar">
        <div class="topbar__brand">
          <span class="topbar__title">设计语言 · Tungsten 青瓷</span>
          <span class="topbar__note">调教台,非产品原型</span>
        </div>

        <button
          type="button"
          class="topbar__toggle"
          :aria-label="themeMode === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          @click="toggleThemeMode"
        >
          {{ themeMode === 'dark' ? '浅色' : '深色' }}
        </button>
      </header>

      <main class="app__main">
        <router-view />
      </main>
    </div>
  </n-config-provider>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 顶部工具栏:展示页自身的外壳,刻意保持中性。 */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--dl-space-4);
  flex-wrap: wrap;
  padding: var(--dl-space-3) var(--dl-space-6);
  background: var(--dl-page-bg);
  border-bottom: 1px solid var(--dl-page-border);
}

.topbar__brand {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
}

.topbar__title {
  font-size: 15px;
  font-weight: 600;
}

.topbar__note {
  font-size: 12px;
  opacity: 0.65;
}

.topbar__nav {
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  margin-left: auto;
  flex-wrap: wrap;
}

.topbar__link {
  padding: 4px 10px;
  font-size: 13px;
  color: inherit;
  text-decoration: none;
  border-radius: 6px;
  opacity: 0.75;
}

.topbar__link:hover {
  opacity: 1;
  background: var(--dl-page-hover);
}

.topbar__link:focus-visible,
.topbar__toggle:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.topbar__link.router-link-active {
  opacity: 1;
  font-weight: 600;
  background: var(--dl-page-active);
}

.topbar__toggle {
  padding: 4px 12px;
  font: inherit;
  font-size: 13px;
  color: inherit;
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 6px;
  cursor: pointer;
}

.app__main {
  flex: 1;
}
</style>
