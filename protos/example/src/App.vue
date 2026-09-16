<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { fetchUsers } from './api/user'
import type { User } from './api/user.types'

// 页面状态:用户列表、加载中、错误信息。
const users = ref<User[]>([])
const isLoading = ref(false)
const errorMessage = ref<string | null>(null)

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

// 首次进入页面即加载一次,展示 dummy 数据。
onMounted(() => {
  void loadUsers()
})
</script>

<template>
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
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
}

.panel {
  width: min(560px, 100%);
  padding: var(--space-6);
  background: var(--bg-elevated);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
}

.panel__title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.panel__desc {
  margin: 0 0 var(--space-5);
  font-size: var(--font-size-md);
  color: var(--text-secondary);
}

.button {
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-md);
  color: var(--text-on-primary);
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.button:hover:not(:disabled) {
  background: var(--primary-hover);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  margin: var(--space-4) 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-error);
}

.empty {
  margin: var(--space-4) 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.user-list {
  margin: var(--space-5) 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border-base);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.user-list__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-base);
}

.user-list__item:last-child {
  border-bottom: none;
}

.user-list__name {
  font-size: var(--font-size-md);
  font-weight: 500;
  color: var(--text-primary);
}

.user-list__role {
  font-size: var(--font-size-sm);
  color: var(--text-on-primary);
  background: var(--primary);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-2);
}

.user-list__email {
  margin-left: auto;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.user-list__status {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}
</style>
