<script setup lang="ts">
// 工具调用行:⏺ 工具名(参数摘要) + 状态标记;点击展开完整参数与结果。
// 运行中显示旋转指示,成功 / 失败用颜色与文字区分。
import { ref } from 'vue'

import type { ToolEntry } from '../api/agent.types'
import DiffView from './diff-view.vue'

const props = defineProps<{
  entry: ToolEntry
}>()

const isExpanded = ref(false)
</script>

<template>
  <div class="tool" data-testid="tool-row" :data-tool-name="props.entry.name">
    <button
      type="button"
      class="tool__header"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      <span class="tool__glyph" :class="`tool__glyph--${props.entry.status}`" aria-hidden="true">⏺</span>
      <span class="tool__name">{{ props.entry.name }}</span>
      <span class="tool__args">({{ props.entry.argSummary }})</span>

      <span v-if="props.entry.status === 'running'" class="tool__status tool__status--running">
        <span class="tool__spinner" aria-hidden="true">◐</span>
        运行中
      </span>
      <span v-else-if="props.entry.status === 'success'" class="tool__status tool__status--success">
        <span aria-hidden="true">✓</span>
        完成
      </span>
      <span v-else class="tool__status tool__status--failure">
        <span aria-hidden="true">✗</span>
        失败<template v-if="props.entry.exitCode !== null"> · 退出码 {{ props.entry.exitCode }}</template>
      </span>

      <span class="tool__chevron" aria-hidden="true">{{ isExpanded ? '▾' : '▸' }}</span>
    </button>

    <div v-if="isExpanded" class="tool__detail" data-testid="tool-detail">
      <div class="tool__section">
        <span class="tool__label">参数</span>
        <pre class="tool__block">{{ props.entry.args }}</pre>
      </div>

      <div v-if="props.entry.diff !== null" class="tool__section">
        <span class="tool__label">改动</span>
        <DiffView :block="props.entry.diff" />
      </div>

      <div v-if="props.entry.result !== null" class="tool__section">
        <span class="tool__label">结果</span>
        <pre class="tool__block" :class="{ 'tool__block--failure': props.entry.status === 'failure' }">{{ props.entry.result }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool {
  padding: var(--dl-space-1) 0;
}

.tool__header {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  width: 100%;
  padding: var(--dl-space-1) var(--dl-space-2);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  background: transparent;
  border: none;
  border-radius: var(--dl-radius-sm);
  cursor: pointer;
  text-align: left;
}

.tool__header:hover {
  background: var(--dl-bg-hover);
}

.tool__header:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.tool__glyph {
  flex-shrink: 0;
}

.tool__glyph--running {
  color: var(--dl-accent);
}

.tool__glyph--success {
  color: var(--dl-success);
}

.tool__glyph--failure {
  color: var(--dl-error);
}

.tool__name {
  color: var(--dl-text-primary);
  font-weight: 600;
}

.tool__args {
  color: var(--dl-text-secondary);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tool__status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
  font-size: var(--dl-font-size-xs);
  white-space: nowrap;
}

.tool__status--running {
  color: var(--dl-accent);
}

.tool__status--success {
  color: var(--dl-success);
}

.tool__status--failure {
  color: var(--dl-error);
}

.tool__spinner {
  display: inline-block;
  animation: tool-spin 900ms linear infinite;
}

.tool__chevron {
  color: var(--dl-text-tertiary);
  flex-shrink: 0;
}

.tool__detail {
  margin: var(--dl-space-1) 0 var(--dl-space-2);
  padding-left: var(--dl-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
}

.tool__section {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
}

.tool__label {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.tool__block {
  margin: 0;
  padding: var(--dl-space-2) var(--dl-space-3);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
  background: var(--dl-bg-sunken);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
  overflow-x: auto;
}

.tool__block--failure {
  color: var(--dl-error);
}

@keyframes tool-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
