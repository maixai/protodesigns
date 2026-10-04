<script setup lang="ts">
// 顶部标题栏:品牌标识与会话级操作(新建会话 / 重连演示 / 深浅色切换)。
import type { ThemeMode } from '../theme'

const props = defineProps<{
  isGenerating: boolean
  themeMode: ThemeMode
}>()

const emit = defineEmits<{
  reset: []
  disconnect: []
  toggleTheme: []
}>()

// 生成中禁用"新建会话",避免把进行中的会话清空。
function handleReset(): void {
  if (!props.isGenerating) {
    emit('reset')
  }
}

// 重连演示:先进入连接中,再以失败结束,便于查看 error 态与重试路径。
function handleDisconnect(): void {
  if (!props.isGenerating) {
    emit('disconnect')
  }
}
</script>

<template>
  <header class="header">
    <div class="header__inner">
      <div class="header__brand">
        <span class="header__mark" aria-hidden="true">◈</span>
        <span class="header__name">青瓷-agent</span>
        <span class="header__tag">终端会话</span>
      </div>
      <div class="header__actions">
        <button
          type="button"
          class="header__button"
          :disabled="isGenerating"
          @click="handleReset"
        >
          新建会话
        </button>
        <button
          type="button"
          class="header__button"
          :disabled="isGenerating"
          title="模拟一次连接失败,用于查看失败态与重试"
          @click="handleDisconnect"
        >
          重连
        </button>
        <button
          type="button"
          class="header__button"
          :aria-label="themeMode === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          @click="emit('toggleTheme')"
        >
          {{ themeMode === 'dark' ? '浅色' : '深色' }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.header {
  flex-shrink: 0;
  background: var(--dl-bg-sunken);
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.header__inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--dl-space-2) var(--dl-space-4);
  display: flex;
  align-items: center;
  gap: var(--dl-space-4);
}

.header__brand {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  min-width: 0;
}

.header__mark {
  color: var(--dl-accent);
  font-size: var(--dl-font-size-sm);
}

.header__name {
  font-family: var(--dl-font-sans);
  font-size: var(--dl-font-size-sm);
  font-weight: 600;
  color: var(--dl-text-primary);
  white-space: nowrap;
}

.header__tag {
  font-family: var(--dl-font-sans);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
  white-space: nowrap;
}

.header__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
}

.header__button {
  font-family: var(--dl-font-sans);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
  padding: var(--dl-space-1) var(--dl-space-3);
  cursor: pointer;
  white-space: nowrap;
}

.header__button:hover:not(:disabled) {
  background: var(--dl-bg-hover);
  color: var(--dl-text-primary);
  border-color: var(--dl-border-strong);
}

.header__button:active:not(:disabled) {
  background: var(--dl-bg-sunken);
}

.header__button:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.header__button:disabled {
  color: var(--dl-text-disabled);
  cursor: not-allowed;
}

/* 窄窗口:收起副标题并收紧间距,避免按钮把标题栏撑破。 */
@media (max-width: 560px) {
  .header__tag {
    display: none;
  }

  .header__inner {
    gap: var(--dl-space-2);
    padding-left: var(--dl-space-3);
    padding-right: var(--dl-space-3);
  }

  .header__actions {
    gap: var(--dl-space-1);
  }

  .header__button {
    padding-left: var(--dl-space-2);
    padding-right: var(--dl-space-2);
  }
}
</style>
