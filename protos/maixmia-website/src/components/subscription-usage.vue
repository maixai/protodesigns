<script setup lang="ts">
// 列表与配置页共用用量语义;原生 progress 直接绑定业务比例,无需行内视觉样式。
import { computed } from 'vue'
import type { SubscriptionUsage } from '../contracts/generated/agent-model-config'
import { useI18n } from '../i18n'

const props = defineProps<{ usage: SubscriptionUsage }>()
const { t, locale } = useI18n()
const isKnown = computed(() => props.usage.state !== 'unknown' && props.usage.usedPercent >= 0)
const percent = computed(() => Math.max(0, Math.min(100, props.usage.usedPercent)))
const stateLabel = computed(() => {
  const copy = t.value.workspace.agentAdmin
  if (!isKnown.value) return copy.subscriptionUsageUnknown
  if (props.usage.state === 'exhausted') return copy.subscriptionUsageExhausted
  if (props.usage.state === 'warning') return copy.subscriptionUsageWarning
  return copy.subscriptionUsage
})
const usageLabel = computed(() => {
  const copy = t.value.workspace.agentAdmin
  if (!isKnown.value) return copy.subscriptionUsageUnknown
  const used = copy.subscriptionUsageUsed.replace('{percent}', String(percent.value))
  const reset = Date.parse(props.usage.resetsAt)
  if (!Number.isFinite(reset)) return `${used} · ${copy.subscriptionResetUnknown}`
  const hours = Math.max(0, Math.ceil((reset - Date.now()) / 3_600_000))
  const relative = new Intl.RelativeTimeFormat(locale.value, { numeric: 'always' }).format(hours, 'hour')
  return `${used} · ${copy.subscriptionResetsIn.replace('{time}', relative)}`
})
</script>

<template>
  <span class="subscription-usage" :data-state="usage.state">
    <progress v-if="isKnown" class="subscription-usage__bar" :value="percent" max="100" :aria-label="stateLabel" />
    <span class="subscription-usage__text">{{ usageLabel }}<template v-if="usage.state === 'warning' || usage.state === 'exhausted'"> · {{ stateLabel }}</template></span>
  </span>
</template>

<style scoped>
.subscription-usage { display: grid; min-inline-size: 0; gap: var(--dl-space-1); padding-block-start: var(--dl-space-1); color: var(--dl-success); }
.subscription-usage[data-state='warning'] { color: var(--dl-warning); }
.subscription-usage[data-state='exhausted'] { color: var(--dl-error); }
.subscription-usage[data-state='unknown'] { color: var(--dl-text-secondary); }
.subscription-usage__bar { appearance: none; display: block; inline-size: 100%; min-inline-size: 0; block-size: var(--dl-space-1); border: 0; border-radius: var(--dl-radius-pill); overflow: hidden; background: var(--dl-bg-sunken); color: inherit; }
.subscription-usage__bar::-webkit-progress-bar { border-radius: var(--dl-radius-pill); background: var(--dl-bg-sunken); }
.subscription-usage__bar::-webkit-progress-value { border-radius: var(--dl-radius-pill); background: currentColor; }
.subscription-usage__bar::-moz-progress-bar { border-radius: var(--dl-radius-pill); background: currentColor; }
.subscription-usage__text { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
</style>
