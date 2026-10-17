<script setup lang="ts">
import type { ConsoleOverview } from '../contracts/generated/console-overview'
import { useConsoleLabels } from '../data/console'
import { useI18n } from '../i18n'
import ConsoleNetworkBadge from './console-network-badge.vue'
import ConsoleRouteTable from './console-route-table.vue'
const props = defineProps<{ data: ConsoleOverview }>()
const { t } = useI18n()
const { networkName } = useConsoleLabels()
function nameFor(id: string): string {
  const network = props.data.networks.find((item) => item.id === id)
  return network ? networkName(network) : id
}
</script>

<template>
  <div class="routing-page">
    <div class="c-status-bar"><span>{{ t.console.overview.prefixes }} {{ data.addressSpace.networkPrefixCount }}</span><span>{{ t.console.overview.mappings }} {{ data.addressSpace.ipv4MappingCount }}</span><span>{{ t.console.overview.unresolved }} {{ data.addressSpace.unresolvedConflicts }}</span></div>
    <section class="c-section"><h2>{{ t.console.routing.registry }}</h2><table class="c-table c-responsive-table prefix-registry"><thead><tr><th scope="col">{{ t.console.fields.network }}</th><th scope="col">{{ t.console.fields.prefix }}</th><th scope="col">{{ t.console.fields.reverse }}</th><th scope="col">{{ t.console.fields.allocated }}</th><th scope="col">{{ t.console.fields.scope }}</th></tr></thead><tbody><tr v-for="network in data.networks" :key="network.id"><th scope="row" :data-label="t.console.fields.network"><a class="c-link" :href="`#/console/networks/${network.id}`"><ConsoleNetworkBadge :network="network" /></a></th><td :data-label="t.console.fields.prefix" class="dl-mono">{{ network.ipv6Prefix }}</td><td :data-label="t.console.fields.reverse" class="dl-mono">{{ network.reverseZone }}</td><td :data-label="t.console.fields.allocated" class="dl-mono">{{ network.memberCount }}</td><td :data-label="t.console.fields.scope">{{ t.console.scope[network.scope] }}</td></tr></tbody></table></section>
    <section class="c-section"><h2>{{ t.console.routing.mappings }}</h2><table class="c-table c-responsive-table"><thead><tr><th scope="col">{{ t.console.fields.network }}</th><th scope="col">{{ t.console.fields.source }}</th><th scope="col">{{ t.console.fields.mapped }}</th><th scope="col">{{ t.console.fields.status }}</th></tr></thead><tbody><template v-for="network in data.networks" :key="network.id"><tr v-for="mapping in network.ipv4Mappings" :key="mapping.ipv6Prefix"><th scope="row" :data-label="t.console.fields.network"><ConsoleNetworkBadge :network="network" /></th><td :data-label="t.console.fields.source" class="dl-mono">{{ mapping.ipv4Cidr }}</td><td :data-label="t.console.fields.mapped" class="dl-mono">{{ mapping.ipv6Prefix }}</td><td :data-label="t.console.fields.status"><span class="c-status" :class="`c-status--${network.status}`">{{ t.console.status[network.status] }}</span></td></tr></template></tbody></table></section>
    <section class="c-section"><ConsoleRouteTable :routes="data.routes" /><p class="c-note">{{ t.console.routing.split }}</p></section>
    <section class="c-section" aria-labelledby="conflicts-title"><div class="c-row c-between"><h2 id="conflicts-title">{{ t.console.routing.conflicts }}</h2><span>{{ t.console.routing.unresolved }} {{ data.addressSpace.unresolvedConflicts }}</span></div><ul class="c-stack"><li v-for="conflict in data.conflicts" :key="conflict.id" class="c-note"><h3 class="c-row"><span class="c-status" :class="`c-status--${conflict.state === 'pending' ? 'conflict' : 'resolved'}`">{{ t.console.status[conflict.state] }}</span><span>{{ conflict.kind === 'ipv4Overlap' ? t.console.routing.overlap : t.console.routing.custom }}</span></h3><p>{{ conflict.networkIds.map(nameFor).join(' / ') }} · {{ t.console.routing.imported }}: <span class="dl-mono">{{ conflict.ipv4Cidrs.join(' / ') }}</span></p><p>{{ t.console.routing.mappedTo }}: <span class="dl-mono">{{ conflict.mappings.join(' / ') }}</span></p></li></ul></section>
    <section class="c-section"><h2>{{ t.console.routing.dns }}</h2><table class="c-table c-responsive-table"><thead><tr><th scope="col">{{ t.console.fields.network }}</th><th scope="col">{{ t.console.fields.suffix }}</th><th scope="col">{{ t.console.fields.reverse }}</th><th scope="col">{{ t.console.fields.resolver }}</th></tr></thead><tbody><tr v-for="zone in data.dnsZones" :key="zone.networkId"><th scope="row" :data-label="t.console.fields.network">{{ nameFor(zone.networkId) }}</th><td :data-label="t.console.fields.suffix" class="dl-mono">{{ zone.suffix }}</td><td :data-label="t.console.fields.reverse" class="dl-mono">{{ zone.reverseZone }}</td><td :data-label="t.console.fields.resolver" class="dl-mono">{{ zone.resolver }}</td></tr></tbody></table></section>
  </div>
</template>
