<script setup lang="ts">
// unified diff 视图:行号(旧/新)+ 标记 + 内容,新增行绿底、删除行红底、上下文行中性。
// 自带折叠控件:展开 / 收起 diff 行。
import { computed, ref } from 'vue'

import type { DiffBlock } from '../api/agent.types'

const props = defineProps<{
  block: DiffBlock
}>()

const isExpanded = ref(true)

// 统计新增 / 删除行数,显示在折叠头右侧。
const addedCount = computed<number>(
  () => props.block.lines.filter((line) => line.kind === 'added').length,
)
const removedCount = computed<number>(
  () => props.block.lines.filter((line) => line.kind === 'removed').length,
)

// 标记列:新增 +、删除 -、上下文留空。
function signOf(kind: DiffBlock['lines'][number]['kind']): string {
  if (kind === 'added') {
    return '+'
  }
  if (kind === 'removed') {
    return '-'
  }
  return ' '
}
</script>

<template>
  <div class="diff" data-testid="diff-view">
    <button
      type="button"
      class="diff__header"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      <span class="diff__chevron" aria-hidden="true">{{ isExpanded ? '▾' : '▸' }}</span>
      <span class="diff__title">diff · {{ props.block.file }}</span>
      <span class="diff__stat">
        <span class="diff__stat-add">+{{ addedCount }}</span>
        <span class="diff__stat-del">−{{ removedCount }}</span>
      </span>
    </button>

    <div v-if="isExpanded" class="diff__body">
      <div
        v-for="(line, index) in props.block.lines"
        :key="index"
        class="diff__line"
        :class="`diff__line--${line.kind}`"
      >
        <span class="diff__no">{{ line.oldLine ?? '' }}</span>
        <span class="diff__no">{{ line.newLine ?? '' }}</span>
        <span class="diff__sign" aria-hidden="true">{{ signOf(line.kind) }}</span>
        <span class="diff__text">{{ line.text }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff {
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
  overflow: hidden;
  background: var(--dl-bg-base);
}

.diff__header {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  width: 100%;
  padding: var(--dl-space-1) var(--dl-space-2);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
  background: var(--dl-bg-sunken);
  border: none;
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
  cursor: pointer;
  text-align: left;
}

.diff__header:hover {
  color: var(--dl-text-primary);
}

.diff__header:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: calc(-1 * var(--dl-focus-width));
}

.diff__chevron {
  color: var(--dl-text-tertiary);
}

.diff__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.diff__stat {
  display: flex;
  gap: var(--dl-space-2);
}

.diff__stat-add {
  color: var(--dl-success);
}

.diff__stat-del {
  color: var(--dl-error);
}

.diff__body {
  overflow-x: auto;
}

.diff__line {
  display: grid;
  grid-template-columns: 3em 3em 1.5em 1fr;
  align-items: baseline;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  min-width: max-content;
}

.diff__line--added {
  background: var(--dl-success-subtle);
}

.diff__line--removed {
  background: var(--dl-error-subtle);
}

.diff__no {
  padding: 0 var(--dl-space-2);
  text-align: right;
  color: var(--dl-text-tertiary);
  user-select: none;
}

.diff__sign {
  text-align: center;
  user-select: none;
}

.diff__line--added .diff__sign {
  color: var(--dl-success);
}

.diff__line--removed .diff__sign {
  color: var(--dl-error);
}

.diff__text {
  padding-right: var(--dl-space-3);
  color: var(--dl-text-primary);
  white-space: pre;
}
</style>
