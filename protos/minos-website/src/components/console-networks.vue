<script setup lang="ts">
import type { ConsoleOverview } from '../contracts/generated/console-overview'
import { identityClass, useConsoleLabels } from '../data/console'
import { useI18n } from '../i18n'
import ConsoleNetworkBadge from './console-network-badge.vue'
import CreateNetworkDialog from './create-network-dialog.vue'
defineProps<{ data: ConsoleOverview }>()
const { t } = useI18n()
const { networkName, networkLabel } = useConsoleLabels()
</script>

<template>
  <div class="c-row c-between networks-toolbar"><p class="c-secondary">{{ networkLabel(data.networks.length) }}</p><CreateNetworkDialog /></div>
  <section v-if="data.networks.length === 0" role="status"><h2>{{ t.console.common.empty }}</h2><p class="c-secondary">{{ t.console.overview.noNetworks }}</p></section>
  <ul class="networks-grid"><li v-for="network in data.networks" :key="network.id"><a class="network-card c-card c-identity-bar" :class="identityClass(network.identity)" :href="`#/console/networks/${network.id}`" :aria-label="networkName(network)"><h2><ConsoleNetworkBadge :network="network" :show-scope="true" /></h2><p class="c-small c-secondary">{{ network.owner }}</p><dl class="c-definition"><div><dt>{{ t.console.fields.prefix }}</dt><dd class="dl-mono">{{ network.ipv6Prefix }}</dd></div><div><dt>{{ t.console.fields.suffix }}</dt><dd class="dl-mono">{{ network.dnsSuffix }}</dd></div><div><dt>{{ t.console.networks.members }}</dt><dd>{{ network.memberCount }}</dd></div><div><dt>{{ t.console.networks.mappings }}</dt><dd>{{ network.ipv4Mappings.length }}</dd></div></dl><span class="c-status" :class="`c-status--${network.status}`">{{ t.console.status[network.status] }}</span></a></li></ul>
</template>

<style scoped>
.networks-toolbar { margin-block-end: var(--dl-space-4); }
.networks-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(var(--dl-space-12) * 6)), 1fr)); gap: var(--dl-space-4); }
.network-card { display: grid; gap: var(--dl-space-3); height: 100%; color: var(--dl-text-primary); text-decoration: none; min-width: var(--dl-target-size); min-height: var(--dl-target-size); }
.network-card h2 { margin: 0; font-size: var(--dl-font-size-md); }
</style>
