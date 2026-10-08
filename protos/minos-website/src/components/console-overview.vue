<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { getConsoleOverview } from '../api/console'
import type { OverviewState } from '../contracts/generated/overview-state'
import { useI18n } from '../i18n'
import { currentRoute } from '../router'
import DlIcon from './dl-icon.vue'

const { t, locale } = useI18n()
const state = ref<OverviewState>({ status: 'loading' })
const requestId = ref(0)
const STAT_KEYS = ['networkCount', 'machineCount', 'onlineCount'] satisfies readonly (keyof Extract<OverviewState, { status: 'ready' }>['data']['stats'])[]

async function load(): Promise<void> {
  const id = ++requestId.value
  state.value = { status: 'loading' }
  const result = await getConsoleOverview(currentRoute.value.demoState)
  // 快速切换 URL 或离开页面时,过期请求不能覆盖最新视图。
  if (id !== requestId.value) return
  if (!result.ok) { state.value = { status: 'error' }; return }
  if (result.value.networks.length === 0 && result.value.machines.length === 0) {
    state.value = { status: 'empty' }
    return
  }
  state.value = { status: 'ready', data: result.value }
}

function lastSeen(value: string): string {
  // 固定 UTC,避免机器时区改变 dummy 内容与截图;语言仍跟随界面。
  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'zh-CN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC', timeZoneName: 'short',
  }).format(new Date(value))
}

watch(() => currentRoute.value.demoState, () => { void load() }, { immediate: true })
onBeforeUnmount(() => { requestId.value += 1 })
</script>

<template>
  <div class="console-overview" :aria-busy="state.status === 'loading'" :data-state="state.status">
    <div v-if="state.status === 'loading'" class="overview-state overview-state--loading" role="status">
      <DlIcon name="grid" size="lg" />
      <p>{{ t.console.loading }}</p>
      <div class="overview-skeleton" aria-hidden="true"><span /><span /><span /></div>
    </div>
    <section v-else-if="state.status === 'empty'" class="overview-state" role="status">
      <DlIcon name="globe" size="lg" />
      <h2>{{ t.console.emptyTitle }}</h2>
      <p>{{ t.console.emptyDescription }}</p>
    </section>
    <section v-else-if="state.status === 'error'" class="overview-state" role="alert">
      <DlIcon name="list" size="lg" />
      <h2>{{ t.console.errorTitle }}</h2>
      <p>{{ t.console.errorDescription }}</p>
      <button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.console.retry }}</button>
    </section>
    <template v-else>
      <dl class="overview-stats">
        <div v-for="key in STAT_KEYS" :key="key" class="overview-stat">
          <dt>{{ t.console.stats[key] }}</dt>
          <dd class="dl-mono">{{ state.data.stats[key] }}</dd>
        </div>
      </dl>
      <section class="overview-section" aria-labelledby="console-networks-title">
        <h2 id="console-networks-title">{{ t.console.networks }}</h2>
        <ul class="network-list">
          <li v-for="network in state.data.networks" :key="network.name" class="overview-card network-card">
            <h3 class="dl-mono">{{ network.name }}</h3>
            <dl class="network-details">
              <div><dt>{{ t.console.fields.cidr }}</dt><dd class="dl-mono">{{ network.cidr }}</dd></div>
              <div><dt>{{ t.console.fields.machineCount }}</dt><dd class="dl-mono">{{ network.machineCount }}</dd></div>
              <div><dt>{{ t.console.fields.status }}</dt><dd class="overview-status" :class="`overview-status--${network.status}`">{{ t.console.status[network.status] }}</dd></div>
            </dl>
          </li>
        </ul>
      </section>
      <section class="overview-section" aria-labelledby="console-machines-title">
        <h2 id="console-machines-title">{{ t.console.machines }}</h2>
        <ul class="machine-list">
          <li v-for="machine in state.data.machines" :key="machine.hostname" class="overview-card machine-card">
            <div class="machine-card__header"><DlIcon :name="machine.os === 'linux' ? 'terminal' : machine.os === 'macos' ? 'laptop' : 'window'" size="sm" /><h3 class="dl-mono">{{ machine.hostname }}</h3></div>
            <dl class="machine-details">
              <div><dt>{{ t.console.fields.ip }}</dt><dd class="dl-mono">{{ machine.ip }}</dd></div>
              <div><dt>{{ t.console.fields.os }}</dt><dd>{{ t.console.os[machine.os] }}</dd></div>
              <div><dt>{{ t.console.fields.status }}</dt><dd class="overview-status" :class="`overview-status--${machine.status}`">{{ t.console.status[machine.status] }}</dd></div>
              <div><dt>{{ t.console.fields.latencyMs }}</dt><dd class="dl-mono">{{ machine.latencyMs === null ? t.console.unavailable : `${machine.latencyMs} ${t.console.latencyUnit}` }}</dd></div>
              <div class="machine-details__seen"><dt>{{ t.console.fields.lastSeen }}</dt><dd><time :datetime="machine.lastSeen">{{ lastSeen(machine.lastSeen) }}</time></dd></div>
            </dl>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.overview-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--dl-space-3); }
.overview-stat, .overview-card, .overview-state { border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background-color: var(--dl-bg-elevated); }
.overview-stat { padding: var(--dl-space-4); }
.overview-stat dt { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.overview-stat dd { margin-block-start: var(--dl-space-2); font-size: var(--dl-font-size-2xl); line-height: var(--dl-line-body); font-weight: 500; }
.overview-section { margin-block-start: var(--dl-space-8); }
.overview-section h2, .overview-state h2 { font-size: var(--dl-font-size-lg); font-weight: 500; line-height: var(--dl-line-body); }
.overview-section > h2 { margin-block-end: var(--dl-space-3); }
.network-list { display: flex; flex-direction: column; gap: var(--dl-space-2); }
.overview-card { padding: var(--dl-space-4); min-width: 0; }
.overview-card h3 { font-weight: 500; font-size: var(--dl-font-size-sm); overflow-wrap: anywhere; }
.network-card { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-items: center; gap: var(--dl-space-4); }
.network-details { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: var(--dl-space-3); }
.network-details dt, .machine-details dt { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.network-details dd, .machine-details dd { font-size: var(--dl-font-size-sm); margin-block-start: var(--dl-space-1); overflow-wrap: anywhere; }
.overview-status { color: var(--dl-text-secondary); }
.overview-status--active, .overview-status--online { color: var(--dl-success); }
.overview-status--paused { color: var(--dl-warning); }
.machine-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18em), 1fr)); gap: var(--dl-space-3); }
.machine-card__header { display: flex; align-items: center; gap: var(--dl-space-2); color: var(--dl-text-primary); }
.machine-card__header > .dl-icon { color: var(--dl-text-secondary); }
.machine-details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--dl-space-3); margin-block-start: var(--dl-space-4); }
.machine-details__seen { grid-column: 1 / -1; }
.overview-state { padding: var(--dl-space-8); display: flex; flex-direction: column; align-items: flex-start; gap: var(--dl-space-3); }
.overview-state > .dl-icon { color: var(--dl-accent); }
.overview-state p { max-width: var(--dl-measure); color: var(--dl-text-secondary); }
.overview-state .dl-btn { min-height: var(--dl-target-size); min-width: var(--dl-target-size); }
.overview-state .dl-btn:focus-visible { box-shadow: var(--dl-focus-ring); }
.overview-state .dl-btn:active { background-color: var(--dl-bg-active); }
.overview-skeleton { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; gap: var(--dl-space-3); margin-block-start: var(--dl-space-3); }
.overview-skeleton span { height: calc(var(--dl-space-12) * 2); border-radius: var(--dl-radius-md); background-color: var(--dl-bg-sunken); }
@media (max-width: 1100px) { .network-card { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 559px) {
  .overview-stats { gap: var(--dl-space-2); }
  .overview-stat { padding: var(--dl-space-3); }
  .network-details { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
  .network-details > div:last-child { grid-column: 1 / -1; }
}
</style>
