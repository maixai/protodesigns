<script setup lang="ts">
// 会话占位视图:覆盖 connecting(连接中)/ empty(空白会话引导)/ error(连接失败)。
import type { SessionState } from '../api/agent.types'

const props = defineProps<{
  state: SessionState
  examplePrompts: readonly string[]
}>()

const emit = defineEmits<{
  retry: []
  useExample: [text: string]
}>()
</script>

<template>
  <!-- 连接中:spinner + 骨架行,不出现白屏。 -->
  <div v-if="props.state.status === 'connecting'" class="placeholder" data-testid="session-connecting">
    <div class="placeholder__connecting">
      <span class="placeholder__spinner" aria-hidden="true">◐</span>
      <span class="placeholder__connecting-text">正在连接 agent…</span>
    </div>
    <div class="placeholder__skeleton" aria-hidden="true">
      <span class="placeholder__skeleton-line"></span>
      <span class="placeholder__skeleton-line placeholder__skeleton-line--short"></span>
      <span class="placeholder__skeleton-line"></span>
    </div>
  </div>

  <!-- 连接失败:错误信息 + 重试。 -->
  <div v-else-if="props.state.status === 'error'" class="placeholder" data-testid="session-error">
    <div class="placeholder__error" role="alert">
      <span class="placeholder__error-glyph" aria-hidden="true">✗</span>
      <span class="placeholder__error-title">连接失败</span>
    </div>
    <p class="placeholder__error-message">{{ props.state.errorMessage }}</p>
    <button type="button" class="placeholder__retry" @click="emit('retry')">重试</button>
  </div>

  <!-- 空白会话:引导 + 示例指令,点击即执行。 -->
  <div v-else class="placeholder" data-testid="session-empty">
    <p class="placeholder__hint">
      <span class="placeholder__prompt" aria-hidden="true">&gt;</span>
      在下方输入指令开始,或选择一条示例:
    </p>
    <div class="placeholder__examples">
      <button
        v-for="prompt in props.examplePrompts"
        :key="prompt"
        type="button"
        class="placeholder__example"
        @click="emit('useExample', prompt)"
      >
        {{ prompt }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.placeholder {
  /* 贴住输入行的上方,像一段等待输入的终端提示,而不是悬在顶部留一大片空白。 */
  margin-top: auto;
  padding: var(--dl-space-6) var(--dl-space-2);
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
}

.placeholder__connecting {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  color: var(--dl-text-secondary);
}

.placeholder__spinner {
  display: inline-block;
  color: var(--dl-accent);
  animation: placeholder-spin 900ms linear infinite;
}

.placeholder__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
}

.placeholder__skeleton-line {
  height: var(--dl-space-3);
  border-radius: var(--dl-radius-sm);
  background: var(--dl-bg-sunken);
  animation: placeholder-pulse 1400ms ease-in-out infinite;
}

.placeholder__skeleton-line--short {
  width: 45%;
}

.placeholder__error {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
}

.placeholder__error-glyph {
  color: var(--dl-error);
}

.placeholder__error-title {
  color: var(--dl-error);
  font-weight: 600;
}

.placeholder__error-message {
  margin: 0;
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
}

.placeholder__retry {
  align-self: flex-start;
  font-family: var(--dl-font-sans);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border: none;
  border-radius: var(--dl-radius-sm);
  padding: var(--dl-space-1) var(--dl-space-4);
  cursor: pointer;
}

.placeholder__retry:hover {
  background: var(--dl-accent-hover);
}

.placeholder__retry:active {
  background: var(--dl-accent-active);
}

.placeholder__retry:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.placeholder__hint {
  margin: 0;
  display: flex;
  gap: var(--dl-space-2);
  color: var(--dl-text-secondary);
}

.placeholder__prompt {
  color: var(--dl-accent);
  font-weight: 600;
}

.placeholder__examples {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  align-items: flex-start;
}

.placeholder__example {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
  padding: var(--dl-space-2) var(--dl-space-3);
  cursor: pointer;
  text-align: left;
}

.placeholder__example:hover {
  color: var(--dl-text-primary);
  border-color: var(--dl-accent);
  background: var(--dl-accent-subtle);
}

.placeholder__example:active {
  background: var(--dl-bg-hover);
}

.placeholder__example:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

@keyframes placeholder-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes placeholder-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}
</style>
