<script setup lang="ts">
// 转录流:自上而下累积;用户输入回显为 `> 指令`,agent 动作以工具行 / 折叠思考 / 审批插入。
import type { ApprovalDecision, TranscriptEntry } from '../api/agent.types'
import ApprovalRow from './approval-row.vue'
import ThinkingBlock from './thinking-block.vue'
import ToolRow from './tool-row.vue'

const props = defineProps<{
  entries: readonly TranscriptEntry[]
}>()

const emit = defineEmits<{
  decide: [decision: ApprovalDecision]
}>()

// 列表 key:工具行用自身 id,其余按序号 + 种类(流只追加,不重排)。
function entryKey(entry: TranscriptEntry, index: number): string {
  return entry.kind === 'tool' ? entry.id : `${String(index)}-${entry.kind}`
}
</script>

<template>
  <div class="stream" data-testid="transcript">
    <template v-for="(entry, index) in props.entries" :key="entryKey(entry, index)">
      <div v-if="entry.kind === 'user'" class="stream__user" data-testid="user-echo">
        <span class="stream__prompt" aria-hidden="true">&gt;</span>
        <span class="stream__user-text">{{ entry.text }}</span>
      </div>

      <p
        v-else-if="entry.kind === 'assistant'"
        class="stream__assistant"
        data-testid="assistant-text"
        :data-streaming="entry.streaming ? 'true' : 'false'"
      >
        <span class="stream__assistant-text">{{ entry.text }}</span>
        <span v-if="entry.streaming" class="stream__caret" aria-hidden="true"></span>
        <span v-if="entry.interrupted" class="stream__interrupted">已中断</span>
      </p>

      <ThinkingBlock v-else-if="entry.kind === 'thinking'" :entry="entry" />

      <ToolRow v-else-if="entry.kind === 'tool'" :entry="entry" />

      <ApprovalRow v-else-if="entry.kind === 'approval'" :entry="entry" @decide="emit('decide', $event)" />
    </template>
  </div>
</template>

<style scoped>
.stream {
  display: flex;
  flex-direction: column;
  padding: var(--dl-space-2) 0 var(--dl-space-4);
}

.stream__user {
  display: flex;
  gap: var(--dl-space-2);
  padding: var(--dl-space-1) var(--dl-space-2);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  margin-top: var(--dl-space-2);
}

.stream__prompt {
  color: var(--dl-accent);
  font-weight: 600;
  flex-shrink: 0;
}

.stream__user-text {
  color: var(--dl-text-primary);
  overflow-wrap: anywhere;
}

.stream__assistant {
  margin: 0;
  padding: var(--dl-space-1) var(--dl-space-2);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-primary);
  overflow-wrap: anywhere;
}

.stream__caret {
  display: inline-block;
  width: 0.5em;
  height: 1em;
  margin-left: var(--dl-space-1);
  vertical-align: text-bottom;
  background: var(--dl-accent);
  animation: stream-blink 1000ms steps(2, start) infinite;
}

.stream__interrupted {
  margin-left: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-warning);
  white-space: nowrap;
}

@keyframes stream-blink {
  to {
    opacity: 0;
  }
}
</style>
