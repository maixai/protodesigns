<script setup lang="ts">
// 一段对话的**归属标识**:色点 + 项目名。它是「这份内容属于谁」的权威位置(对话标题栏),
// 因此改归属的入口也落在这里 —— 而不是另找一个地方放按钮。
//
// 两种形态:
//   · 会话**还没有任何消息** → 渲染成按钮(带 caret 与 hover / focus 反馈),点开项目选择浮层;
//   · 已经有消息 → 退化成纯文字,**不露入口**(归属一旦跟着第一条消息发出去就冻结)。
// 依据:归属露在那里却不能改就是死控件(本仓明令禁止);而把它做成「永远可点的下拉」又会
// 让用户以为对话可以随意换地方 —— 规则只有一条:第一条消息发出前可改,之后冻结。
//
// 颜色不是唯一指示:色点旁边始终有项目名(文字通道),按钮另有可访问名说明「点它可以改」。
import { computed } from 'vue'
import type { Project } from '../contracts/generated/project'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { badgeMapOf } from '../data/project-identity'
import { viewportRectOf } from '../data/viewport-rect'
import { useI18n } from '../i18n'

const props = defineProps<{
  projectId: string
  // 已打开的项目:从这里回查归属标识(名称 / 路径 / 标识色绑定类)。
  projects: Project[]
  // 空对话(还没有消息)才可改归属。
  canReassign: boolean
  // 项目选择浮层是否正由本控件打开(供 aria-expanded)。
  pickerOpen: boolean
}>()

const emit = defineEmits<{ open: [origin: WindowRect] }>()

const { t } = useI18n()
const badge = computed(() => badgeMapOf(props.projects).get(props.projectId))
const name = computed(() => badge.value?.name ?? props.projectId)
const description = computed(() => badge.value?.path ?? props.projectId)
const changeLabel = computed(() => t.value.workspace.reassignProjectLabel.replace('{name}', name.value))

function open(event: MouseEvent): void {
  emit('open', viewportRectOf(event.currentTarget instanceof Element ? event.currentTarget : null))
}
</script>

<template>
  <button
    v-if="canReassign"
    type="button"
    class="chat-project is-action"
    :class="badge?.identityClass"
    aria-haspopup="listbox"
    :aria-expanded="pickerOpen"
    :aria-label="changeLabel"
    :title="`${description} · ${changeLabel}`"
    data-project-picker-trigger
    @click="open"
  >
    <span v-if="badge" class="chat-project__dot" aria-hidden="true" />
    <span class="chat-project__name">{{ name }}</span>
    <svg class="chat-project__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  </button>
  <span v-else class="chat-project" :class="badge?.identityClass" :title="description">
    <span v-if="badge" class="chat-project__dot" aria-hidden="true" />
    <span class="chat-project__name">{{ name }}</span>
  </span>
</template>

<style scoped>
/* 标识本身只作图形与文字的并置:色点走 var(--dl-identity)(由外层 .dl-identity-N 绑定类选号),
   名称走二级文字色(它是补充信息,标题才是主信息)。 */
.chat-project {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
  max-inline-size: 40%;
  min-block-size: var(--dl-control-height);
  padding-inline: var(--dl-space-1);
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-secondary);
}

.chat-project.is-action {
  cursor: pointer;
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.chat-project.is-action:hover {
  background: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.chat-project.is-action:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.chat-project.is-action[aria-expanded='true'] {
  background: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.chat-project__dot {
  flex-shrink: 0;
  inline-size: var(--dl-identity-dot-size);
  block-size: var(--dl-identity-dot-size);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-identity);
}

.chat-project__name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-xs);
}

.chat-project__caret {
  flex-shrink: 0;
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
}

.chat-project__caret path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}
</style>
