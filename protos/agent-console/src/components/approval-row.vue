<script setup lang="ts">
// 内联审批行:危险操作执行前阻塞,提供可点击的批准 / 拒绝按钮(也支持键盘 y / n)。
import type { ApprovalDecision, ApprovalEntry } from '../api/agent.types'

const props = defineProps<{
  entry: ApprovalEntry
}>()

const emit = defineEmits<{
  decide: [decision: ApprovalDecision]
}>()
</script>

<template>
  <div class="approval" data-testid="approval-row">
    <div class="approval__head">
      <span class="approval__glyph" aria-hidden="true">⚠</span>
      <span class="approval__title">需要确认:</span>
      <span class="approval__command">{{ props.entry.command }}</span>
    </div>
    <p class="approval__prompt">{{ props.entry.prompt }}</p>

    <div v-if="props.entry.decision === null" class="approval__actions">
      <button
        type="button"
        class="approval__button approval__button--approve"
        @click="emit('decide', 'approved')"
      >
        [y] 批准
      </button>
      <button
        type="button"
        class="approval__button approval__button--deny"
        @click="emit('decide', 'denied')"
      >
        [n] 拒绝
      </button>
    </div>
    <div v-else class="approval__result">
      <span
        class="approval__decision"
        :class="props.entry.decision === 'approved' ? 'approval__decision--approved' : 'approval__decision--denied'"
      >
        {{ props.entry.decision === 'approved' ? '已批准' : '已拒绝' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.approval {
  margin: var(--dl-space-2) 0;
  padding: var(--dl-space-2) var(--dl-space-3);
  background: var(--dl-warning-subtle);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-left: var(--dl-border-width) solid var(--dl-warning);
  border-radius: var(--dl-radius-sm);
}

.approval__head {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
}

.approval__glyph {
  color: var(--dl-warning);
}

.approval__title {
  color: var(--dl-warning);
  font-weight: 600;
}

.approval__command {
  color: var(--dl-text-primary);
  overflow-wrap: anywhere;
}

.approval__prompt {
  margin: var(--dl-space-1) 0 0;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

.approval__actions {
  display: flex;
  gap: var(--dl-space-2);
  margin-top: var(--dl-space-2);
}

.approval__button {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  padding: var(--dl-space-1) var(--dl-space-3);
  border-radius: var(--dl-radius-sm);
  border: var(--dl-border-width) solid var(--dl-border-base);
  cursor: pointer;
}

.approval__button--approve {
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border-color: var(--dl-accent);
}

.approval__button--approve:hover {
  background: var(--dl-accent-hover);
  border-color: var(--dl-accent-hover);
}

.approval__button--approve:active {
  background: var(--dl-accent-active);
  border-color: var(--dl-accent-active);
}

.approval__button--deny {
  color: var(--dl-text-secondary);
  background: var(--dl-bg-elevated);
}

.approval__button--deny:hover {
  color: var(--dl-error);
  border-color: var(--dl-error);
  background: var(--dl-bg-hover);
}

.approval__button:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.approval__result {
  margin-top: var(--dl-space-2);
}

.approval__decision {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  padding: var(--dl-space-1) var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
}

.approval__decision--approved {
  color: var(--dl-success);
}

.approval__decision--denied {
  color: var(--dl-error);
}
</style>
