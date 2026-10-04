<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import { fetchUsers } from './api/user'
import type { User } from './api/user.types'
import { shell } from './shell'
import type { MenuCommandId, MenuGroup, ThemeMode } from './shell'

// 页面状态:用户列表、加载中、错误信息。
const users = ref<User[]>([])
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

// 壳能力状态:菜单结构、当前主题、窗口尺寸、最近一次菜单命令。
const menuGroups = ref<readonly MenuGroup[]>(shell.menu.groups())
const themeMode = ref<ThemeMode>(shell.theme.current())
const windowSize = ref(shell.window.size())
const lastCommand = ref<string>('（尚未触发）')

// 取消订阅函数集合:组件卸载时统一清理,避免监听泄漏。
const unsubscribers: Array<() => void> = []

// 把主题写到根元素上,供 CSS token 切换深浅两套值。
function applyTheme(mode: ThemeMode): void {
  themeMode.value = mode
  document.documentElement.dataset['theme'] = mode
}

// 触发一次模拟请求,将 dummy 用户数据渲染到页面;按钮与首次进入都会调用。
async function loadUsers(): Promise<void> {
  isLoading.value = true
  errorMessage.value = null
  try {
    const result = await fetchUsers()
    if (result.ok) {
      users.value = result.value
    } else {
      errorMessage.value = result.error.message
    }
  } catch (error) {
    if (error instanceof Error) {
      errorMessage.value = error.message
    } else {
      errorMessage.value = '加载用户时发生未知错误'
    }
  } finally {
    isLoading.value = false
  }
}

// 处理菜单命令:桌面壳会从菜单栏与快捷键两个入口派发同一套命令 id。
function handleCommand(id: MenuCommandId): void {
  lastCommand.value = id
  if (id === 'view.toggle-theme') {
    shell.theme.setOverride(themeMode.value === 'dark' ? 'light' : 'dark')
  }
}

// 首次进入:应用主题、订阅壳事件、加载一次 dummy 数据。
onMounted(() => {
  applyTheme(themeMode.value)
  unsubscribers.push(shell.theme.onChange(applyTheme))
  unsubscribers.push(shell.window.onResize((size) => {
    windowSize.value = size
  }))
  unsubscribers.push(shell.menu.onCommand(handleCommand))
  void loadUsers()
})

// 卸载时清理订阅。
onUnmounted(() => {
  for (const unsubscribe of unsubscribers) {
    unsubscribe()
  }
  unsubscribers.length = 0
})
</script>

<template>
  <div class="shell">
    <!-- 壳能力演示:菜单栏。生产期由桌面壳提供原生菜单,此处 mock 可在浏览器里演示。 -->
    <nav class="menubar" aria-label="应用菜单">
      <span class="menubar__brand">示例原型</span>
      <ul v-for="group in menuGroups" :key="group.label" class="menubar__group">
        <li class="menubar__group-label">{{ group.label }}</li>
        <li v-for="item in group.items" :key="item.id">
          <button
            type="button"
            class="menubar__item"
            :title="item.accelerator"
            @click="handleCommand(item.id)"
          >
            {{ item.label }}
          </button>
        </li>
      </ul>
    </nav>

    <main class="page">
      <section class="panel">
        <h1 class="panel__title">示例原型</h1>
        <p class="panel__desc">点击按钮加载内置 dummy 用户数据,验证 typed API 层。</p>

        <button
          type="button"
          class="button"
          :disabled="isLoading"
          @click="loadUsers"
        >
          {{ isLoading ? '加载中…' : '加载用户' }}
        </button>

        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

        <ul v-if="users.length > 0" class="user-list">
          <li v-for="user in users" :key="user.id" class="user-list__item">
            <span class="user-list__name">{{ user.name }}</span>
            <span class="user-list__role">{{ user.role }}</span>
            <span class="user-list__email">{{ user.email }}</span>
            <span class="user-list__status">{{ user.active ? '启用' : '停用' }}</span>
          </li>
        </ul>
        <p v-else-if="!isLoading && !errorMessage" class="empty">
          暂无数据,点击按钮加载。
        </p>
      </section>
    </main>

    <!-- 壳能力演示:状态栏。展示跟随系统的主题与实时窗口尺寸。 -->
    <footer class="statusbar">
      <span>主题:{{ themeMode === 'dark' ? '深色' : '浅色' }}</span>
      <span>窗口:{{ windowSize.width }} × {{ windowSize.height }}</span>
      <span>最近命令:{{ lastCommand }}</span>
    </footer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--dl-bg-base);
}

/* 菜单栏:桌面端的固定分组入口,浏览器里以模拟条呈现。 */
.menubar {
  display: flex;
  align-items: center;
  gap: var(--dl-space-4);
  padding: var(--dl-space-2) var(--dl-space-4);
  background: var(--dl-bg-sunken);
  border-bottom: 1px solid var(--dl-border-base);
  overflow-x: auto;
}

.menubar__brand {
  font-size: var(--dl-font-size-sm);
  font-weight: 600;
  color: var(--dl-text-primary);
  white-space: nowrap;
}

.menubar__group {
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  /* 窄窗口下横向滚动,不让菜单文字换行 */
  flex-shrink: 0;
}

.menubar__group-label {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-tertiary);
  padding: 0 var(--dl-space-1);
  white-space: nowrap;
}

.menubar__item {
  padding: var(--dl-space-1) var(--dl-space-2);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--dl-radius-sm);
  cursor: pointer;
  white-space: nowrap;
}

.menubar__item:hover {
  background: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
}

.menubar__item:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.page {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dl-space-6);
}

.panel {
  width: min(560px, 100%);
  padding: var(--dl-space-6);
  background: var(--dl-bg-elevated);
  border: 1px solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.panel__title {
  margin: 0 0 var(--dl-space-2);
  font-size: var(--dl-font-size-xl);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.panel__desc {
  margin: 0 0 var(--dl-space-6);
  font-size: var(--dl-font-size-md);
  color: var(--dl-text-secondary);
}

.button {
  padding: var(--dl-space-2) var(--dl-space-4);
  font-size: var(--dl-font-size-md);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border: none;
  border-radius: var(--dl-radius-sm);
  cursor: pointer;
}

.button:hover:not(:disabled) {
  background: var(--dl-accent-hover);
}

.button:active:not(:disabled) {
  background: var(--dl-accent-active);
}

.button:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  margin: var(--dl-space-4) 0 0;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-error);
}

.empty {
  margin: var(--dl-space-4) 0 0;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-tertiary);
}

.user-list {
  margin: var(--dl-space-6) 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  overflow: hidden;
}

.user-list__item {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  padding: var(--dl-space-3) var(--dl-space-4);
  border-bottom: 1px solid var(--dl-border-base);
}

.user-list__item:last-child {
  border-bottom: none;
}

.user-list__name {
  font-size: var(--dl-font-size-md);
  font-weight: 500;
  color: var(--dl-text-primary);
  white-space: nowrap;
}

.user-list__role {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border-radius: var(--dl-radius-sm);
  padding: 0 var(--dl-space-2);
  white-space: nowrap;
}

.user-list__email {
  margin-left: auto;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  overflow-wrap: anywhere;
}

.user-list__status {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-tertiary);
  white-space: nowrap;
}

/* 窄窗口:邮箱换到第二行,避免姓名与状态被挤压换行或裁切。 */
@media (max-width: 560px) {
  .user-list__item {
    flex-wrap: wrap;
  }

  .user-list__email {
    flex: 1 0 100%;
    margin-left: 0;
    order: 9;
  }
}

/* 状态栏:展示壳能力状态,供评审核对主题跟随与窗口尺寸。 */
.statusbar {
  display: flex;
  gap: var(--dl-space-4);
  padding: var(--dl-space-2) var(--dl-space-4);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  background: var(--dl-bg-sunken);
  border-top: 1px solid var(--dl-border-base);
}
</style>
