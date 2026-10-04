<script setup lang="ts">
// 思考过程折叠区:默认收起,展开按编号列出步骤;生成中显示"已完成 N 步"。
import { ref } from 'vue'

import type { ThinkingEntry } from '../api/agent.types'
import { formatDuration } from '../agent/format'

const props = defineProps<{
  entry: ThinkingEntry
}>()

const isExpanded = ref(false)
</script>

<template>
  <div class="thinking" data-testid="thinking-block">
    <button
      type="button"
      class="thinking__header"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      <span class="thinking__glyph" aria-hidden="true">✻</span>
      <span v-if="props.entry.streaming" class="thinking__label">
        正在思考 · 已完成 {{ props.entry.completedSteps }} 步
      </span>
      <span v-else class="thinking__label">
        思考了 {{ props.entry.steps.length }} 步 · {{ formatDuration(props.entry.durationMs) }}
      </span>
      <span class="thinking__spinner" :class="{ 'thinking__spinner--idle': !props.entry.streaming }">
        <template v-if="props.entry.streaming">◐</template>
      </span>
      <span class="thinking__chevron" aria-hidden="true">{{ isExpanded ? '▾' : '▸' }}</span>
    </button>

    <ol v-if="isExpanded" class="thinking__steps">
      <li v-for="step in props.entry.steps" :key="step.index" class="thinking__step">
        <span class="thinking__index">{{ step.index }}.</span>
        <span class="thinking__text">{{ step.text }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.thinking {
  padding: var(--dl-space-1) 0;
}

.thinking__header {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  width: 100%;
  padding: var(--dl-space-1) var(--dl-space-2);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
  background: transparent;
  border: none;
  border-radius: var(--dl-radius-sm);
  cursor: pointer;
  text-align: left;
}

.thinking__header:hover {
  background: var(--dl-bg-hover);
  color: var(--dl-text-secondary);
}

.thinking__header:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.thinking__glyph {
  color: var(--dl-highlight);
}

.thinking__label {
  flex: 1;
  min-width: 0;
}

.thinking__spinner {
  display: inline-block;
  color: var(--dl-accent);
  animation: thinking-spin 900ms linear infinite;
}

.thinking__spinner--idle {
  visibility: hidden;
}

.thinking__chevron {
  color: var(--dl-text-tertiary);
}

.thinking__steps {
  margin: var(--dl-space-1) 0 var(--dl-space-2);
  padding: 0 0 0 var(--dl-space-8);
  list-style: none;
  border-left: var(--dl-border-width) solid var(--dl-border-base);
  margin-left: var(--dl-space-3);
}

.thinking__step {
  display: flex;
  gap: var(--dl-space-2);
  padding: var(--dl-space-1) 0;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

.thinking__index {
  color: var(--dl-text-tertiary);
  min-width: 1.5em;
}

@keyframes thinking-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
