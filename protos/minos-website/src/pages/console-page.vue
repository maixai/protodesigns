<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { session } from '../auth/session'
import { CONSOLE_NAV, useConsoleLabels } from '../data/console'
import { toIconName } from '../data/icons'
import { useI18n } from '../i18n'
import { currentRoute } from '../router'
import DlIcon from '../components/dl-icon.vue'
import ConsoleOverview from '../components/console-overview.vue'
import ConsoleDevices from '../components/console-devices.vue'
import ConsoleDeviceDetail from '../components/console-device-detail.vue'
import ConsoleNetworks from '../components/console-networks.vue'
import ConsoleNetworkDetail from '../components/console-network-detail.vue'
import ConsoleRouting from '../components/console-routing.vue'
import ConsoleState from '../components/console-state.vue'
import { consoleStore } from '../state/console'
import '../components/console.css'

const { t } = useI18n()
const { networkName, lastSeen, tunnelLabel, membershipCoverage } = useConsoleLabels()
const device = computed(() => currentRoute.value.section === 'devices' ? consoleStore.data?.devices.find((item) => item.id === currentRoute.value.detailId) : undefined)
const network = computed(() => currentRoute.value.section === 'networks' ? consoleStore.data?.networks.find((item) => item.id === currentRoute.value.detailId) : undefined)
const isMissing = computed(() => currentRoute.value.detailId !== null && !device.value && !network.value && consoleStore.status === 'ready')
const title = computed(() => isMissing.value ? t.value.console.common.notFound : device.value?.name ?? (network.value ? networkName(network.value) : t.value.console.nav[currentRoute.value.section]))
function load(): void { void consoleStore.load(currentRoute.value.demoState) }
onMounted(load)
watch(() => currentRoute.value.demoState, load)
</script>

<template>
  <div class="dl-container console-layout">
    <aside class="console-sidebar">
      <div class="console-sidebar__workspace">
        <p class="console-label">{{ t.console.workspace }}</p>
        <p class="console-sidebar__organization">{{ session.profile?.organization }}</p>
      </div>
      <nav class="console-nav" :aria-label="t.console.navigation">
        <a v-for="item in CONSOLE_NAV" :key="item.id" :href="`#/console${item.id === 'overview' ? '' : `/${item.id}`}`" class="console-nav__item" :aria-current="currentRoute.section === item.id ? 'page' : undefined">
          <DlIcon :name="toIconName(item.icon)" size="sm" />
          {{ t.console.nav[item.id] }}
        </a>
      </nav>
    </aside>
    <main id="main" class="console-content">
      <header class="console-content__header">
        <a v-if="currentRoute.detailId !== null" class="c-link" :href="`#/console/${currentRoute.section}`">← {{ t.console.common.back }} · {{ t.console.nav[currentRoute.section] }}</a>
        <p class="console-label">{{ device ? t.console.deviceDetail.eyebrow : network ? t.console.networkDetail.eyebrow : session.profile?.organization }}</p>
        <h1>{{ title }}</h1>
        <p v-if="device" class="console-content__description">{{ tunnelLabel(device.memberships.length) }} · {{ membershipCoverage(device.memberships.length, consoleStore.data?.networks.length ?? 0) }} · {{ t.console.fields.lastSeen }} {{ lastSeen(device.lastSeen) }} <span v-if="device.clientVersionState === 'outdated'" class="c-tag">{{ t.console.status.outdated }}</span></p>
        <p v-else-if="network" class="console-content__description"><span class="dl-mono">{{ network.ipv6Prefix }}</span> · {{ t.console.scope[network.scope] }} · {{ network.memberCount }} {{ t.console.networks.members }}</p>
        <p v-else class="console-content__description">{{ t.console.descriptions[currentRoute.section] }}</p>
      </header>
      <div class="console-view" :class="{ 'console-overview': currentRoute.section === 'overview' }" :data-state="consoleStore.status" :aria-busy="consoleStore.status === 'loading'">
        <ConsoleState v-if="consoleStore.status !== 'ready' && !(consoleStore.status === 'empty' && currentRoute.section === 'networks')" :status="consoleStore.status" @retry="load" />
        <section v-else-if="isMissing" role="status"><p>{{ t.console.common.notFoundDescription }}</p></section>
        <template v-else-if="consoleStore.data">
          <ConsoleOverview v-if="currentRoute.section === 'overview'" :data="consoleStore.data" />
          <ConsoleDeviceDetail v-else-if="device" :data="consoleStore.data" :device="device" />
          <ConsoleNetworkDetail v-else-if="network" :data="consoleStore.data" :network="network" />
          <ConsoleDevices v-else-if="currentRoute.section === 'devices'" :data="consoleStore.data" />
          <ConsoleNetworks v-else-if="currentRoute.section === 'networks'" :data="consoleStore.data" />
          <ConsoleRouting v-else-if="currentRoute.section === 'routing'" :data="consoleStore.data" />
          <section v-else class="console-placeholder" :aria-label="t.console.placeholders.preview">
            <DlIcon :name="toIconName(CONSOLE_NAV.find((item) => item.id === currentRoute.section)?.icon ?? 'grid')" size="lg" />
            <h2>{{ t.console.nav[currentRoute.section] }}</h2><p>{{ t.console.placeholders.later }}</p>
          </section>
        </template>
      </div>
      <p class="console-content__sample">{{ t.console.common.sample }}</p>
    </main>
  </div>
</template>

<style scoped>
.console-layout {
  display: grid; grid-template-columns: calc(var(--dl-space-12) * 4) minmax(0, 1fr);
  gap: var(--dl-space-8); min-height: calc(100dvh - var(--dl-header-height));
}
.console-sidebar { padding-block: var(--dl-space-8); border-inline-end: var(--dl-border-width) solid var(--dl-border-base); }
.console-sidebar__workspace { padding-inline-end: var(--dl-space-4); margin-block-end: var(--dl-space-6); }
.console-label { font-size: var(--dl-font-size-xs); color: var(--dl-text-secondary); }
.console-sidebar__organization { font-weight: 500; margin-block-start: var(--dl-space-1); }
.console-nav { display: flex; flex-direction: column; gap: var(--dl-space-1); padding-inline-end: var(--dl-space-4); }
.console-nav__item {
  display: flex; align-items: center; gap: var(--dl-space-3);
  min-width: var(--dl-target-size); min-height: var(--dl-target-size);
  padding: var(--dl-space-2) var(--dl-space-3);
  border-inline-start: calc(var(--dl-border-width) * 3) solid transparent;
  border-radius: var(--dl-radius-sm); text-decoration: none; color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm); white-space: nowrap;
}
.console-nav__item:hover { background-color: var(--dl-bg-hover); }
.console-nav__item:active { background-color: var(--dl-bg-active); }
.console-nav__item:focus-visible { box-shadow: var(--dl-focus-ring); }
.console-nav__item[aria-current='page'] { border-inline-start-color: var(--dl-accent); font-weight: 500; background-color: var(--dl-accent-soft); color: var(--dl-accent); }
.console-nav__item[aria-current='page']:hover { background-color: var(--dl-bg-hover); }
.console-nav__item[aria-current='page']:active { background-color: var(--dl-bg-active); }
.console-content { min-width: 0; padding-block: var(--dl-space-8); }
.console-content__header { margin-block-end: var(--dl-space-6); }
.console-content h1 { margin-block: var(--dl-space-1) var(--dl-space-2); font-size: var(--dl-font-size-2xl); font-weight: 600; line-height: var(--dl-line-body); }
.console-content__description { color: var(--dl-text-secondary); max-width: var(--dl-measure); }
.console-content__sample { margin-block-start: var(--dl-space-6); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.console-placeholder { padding: var(--dl-space-8); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background-color: var(--dl-bg-elevated); }
.console-placeholder > .dl-icon { color: var(--dl-accent); }
.console-placeholder h2 { margin-block: var(--dl-space-4) var(--dl-space-2); font-size: var(--dl-font-size-lg); font-weight: 500; }
.console-placeholder p { color: var(--dl-text-secondary); max-width: var(--dl-measure); }
@media (max-width: 767px) {
  /* 空态/占位页也保持横向导航紧凑,不把视口剩余高度分配给导航行。 */
  .console-layout { grid-template-columns: minmax(0, 1fr); gap: 0; align-content: start; }
  .console-sidebar { min-width: 0; padding-block: var(--dl-space-3); border-inline-end: none; border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
  .console-sidebar__workspace { display: none; }
  .console-nav { flex-direction: row; overflow-x: auto; padding: var(--dl-space-1); }
  .console-nav__item { flex: none; }
  .console-content { padding-block: var(--dl-space-6); }
}
</style>
