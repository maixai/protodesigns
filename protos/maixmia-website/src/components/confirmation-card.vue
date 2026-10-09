<script setup lang="ts">
// 「等待交互」确认卡:作为对话流里的一条,紧跟 Agent 最后一条消息之后出现。
// 处理后塌缩成一行留痕(**不消失**,作为审计痕迹),并把焦点移到留痕上 ——
// 既不停在已被移除的两个操作按钮上,也不丢给 <body>。此后 Tab 继续走下一处。
//
// 卡片本身不抢 live:等待态由遥测条状态项那条 live region 播报(见 workspace-page),
// 这里只提供可访问名(role="group" + aria-label)与本地的展开 / 收起。
import { nextTick, ref, watch } from 'vue'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import { useI18n } from '../i18n'

// outcome 为 null 表示仍待用户拍板;非 null 表示已处理,卡片走塌缩留痕态。
const props = defineProps<{ request: ConfirmationRequest; outcome: 'allowed' | 'rejected' | null }>()
const emit = defineEmits<{ resolve: [allowed: boolean] }>()

const { t } = useI18n()
const isDetailOpen = ref(false)
const recordRef = ref<HTMLElement | null>(null)

watch(() => props.outcome, async (next) => {
  if (next === null) return
  isDetailOpen.value = false
  await nextTick()
  recordRef.value?.focus()
})
</script>

<template>
  <section
    class="confirmation-card"
    :class="{ 'is-resolved': outcome !== null }"
    :role="outcome === null ? 'group' : undefined"
    :aria-label="outcome === null ? t.workspace.confirmation.title : undefined"
  >
    <template v-if="outcome === null">
      <p class="confirmation-label">{{ t.workspace.confirmation.title }}</p>
      <p class="confirmation-summary">{{ request.summary }}</p>
      <button
        type="button"
        class="confirmation-toggle"
        :aria-expanded="isDetailOpen"
        aria-controls="confirmation-detail"
        @click="isDetailOpen = !isDetailOpen"
      >
        <span>{{ isDetailOpen ? t.workspace.confirmation.hideDetail : t.workspace.confirmation.viewDetail }}</span>
        <svg class="confirmation-toggle__caret" :class="{ 'is-open': isDetailOpen }" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <p v-show="isDetailOpen" id="confirmation-detail" class="confirmation-detail">{{ request.detail }}</p>
      <div class="confirmation-files">
        <span class="confirmation-files__label">{{ t.workspace.confirmation.affectedFiles }}</span>
        <ul class="confirmation-files__list">
          <li v-for="name in request.affectedFiles" :key="name" class="confirmation-file">{{ name }}</li>
        </ul>
      </div>
      <div class="confirmation-actions">
        <button type="button" class="dl-btn dl-btn--primary dl-btn--lg" @click="emit('resolve', true)">{{ t.workspace.confirmation.allow }}</button>
        <button type="button" class="dl-btn dl-btn--ghost dl-btn--lg" @click="emit('resolve', false)">{{ t.workspace.confirmation.reject }}</button>
      </div>
    </template>
    <p v-else ref="recordRef" class="confirmation-record" tabindex="-1" :data-outcome="outcome">
      <span class="confirmation-record__mark" aria-hidden="true">{{ outcome === 'allowed' ? '✓' : '✕' }}</span>
      <span>{{ outcome === 'allowed' ? `${t.workspace.confirmation.allowed} · ${request.summary}` : t.workspace.confirmation.rejected }}</span>
    </p>
  </section>
</template>

<style scoped>
/* 卡片落在转录流里的一条,底色取 bg-base(比面板的 bg-elevated 更沉),左侧一条强调色竖线
   标记「需要你的拍板」(强调色只承担可操作语义);层级只用发丝描边,不叠加阴影。 */
.confirmation-card {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  padding: var(--dl-space-4);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-inline-start: var(--dl-space-1) solid var(--dl-accent);
  border-radius: var(--dl-radius-lg);
  background: var(--dl-bg-base);
}

/* 处理后塌缩成一行:去掉卡片的框与底,只留那行留痕。 */
.confirmation-card.is-resolved {
  padding: 0;
  border: 0;
  background: none;
}

.confirmation-label {
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-accent);
}

.confirmation-summary {
  font-size: var(--dl-font-size-md);
  font-weight: 500;
  line-height: var(--dl-line-body);
  color: var(--dl-text-primary);
}

/* 展开 / 收起:靠左的文本型按钮,触达尺寸守住 --dl-target-size;左负边距让它与
   摘要文字左缘对齐(抵消按钮自身的内边距)。 */
.confirmation-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-height: var(--dl-target-size);
  margin-inline-start: calc(-1 * var(--dl-space-2));
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
}

.confirmation-toggle:hover {
  color: var(--dl-text-primary);
}

.confirmation-toggle:focus-visible,
.confirmation-record:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.confirmation-toggle__caret {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.confirmation-toggle__caret.is-open {
  transform: rotate(180deg);
}

.confirmation-toggle__caret path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}

.confirmation-detail {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.confirmation-files {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2);
}

.confirmation-files__label {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.confirmation-files__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-2);
}

/* 受影响文件沿用侧栏状态芯片的形态,但走等宽字体(技术文件名属技术信息)。 */
.confirmation-file {
  padding: 0 var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

.confirmation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-2);
}

/* 处理后的留痕:单行、不可交互,但可被程序化聚焦(tabindex="-1"),焦点不丢失。 */
.confirmation-record {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  border-radius: var(--dl-radius-sm);
}

.confirmation-record__mark {
  font-weight: 600;
}

.confirmation-record[data-outcome='allowed'] .confirmation-record__mark {
  color: var(--dl-success);
}

.confirmation-record[data-outcome='rejected'] .confirmation-record__mark {
  color: var(--dl-error);
}
</style>
