<script setup lang="ts">
import { computed } from 'vue'
import type { ConsoleOverview, NetworkSummary } from '../contracts/generated/console-overview'
import { useI18n } from '../i18n'
import { effectiveState } from '../state/console'
import ConsoleAddress from './console-address.vue'
import ConsoleRouteTable from './console-route-table.vue'
import JoinNetworkDialog from './join-network-dialog.vue'
const props = defineProps<{ data: ConsoleOverview; network: NetworkSummary }>()
const { t } = useI18n()
const members = computed(() => props.data.devices.filter((device) => device.memberships.some((item) => item.networkId === props.network.id)))
const routes = computed(() => props.data.routes.filter((route) => route.networkId === props.network.id))
const zone = computed(() => props.data.dnsZones.find((item) => item.networkId === props.network.id))
</script>

<template>
  <div class="network-detail">
    <p v-if="network.scope === 'external'" class="c-note external-readonly">{{ t.console.networkDetail.readOnly }}</p><div v-else class="c-row c-between"><span class="c-small c-secondary">{{ network.owner }}</span><JoinNetworkDialog :key="network.id" :network-id="network.id" /></div>
    <section class="c-section"><h2>{{ t.console.networkDetail.addressPlan }}</h2><dl class="c-definition"><div><dt>{{ t.console.fields.prefix }}</dt><dd class="dl-mono">{{ network.ipv6Prefix }}</dd></div><div><dt>{{ t.console.fields.reverse }}</dt><dd class="dl-mono">{{ network.reverseZone }}</dd></div><div><dt>{{ t.console.fields.allocated }}</dt><dd class="dl-mono">{{ members.length }} / {{ t.console.networkDetail.capacity }}</dd></div></dl><h3 class="mapping-title">{{ t.console.networkDetail.mappings }}</h3><ul class="c-list"><li v-for="mapping in network.ipv4Mappings" :key="mapping.ipv6Prefix" class="dl-mono">{{ mapping.ipv4Cidr }} → {{ mapping.ipv6Prefix }}</li></ul></section>
    <section class="c-section"><h2>{{ t.console.networkDetail.members }}</h2><p class="c-small c-secondary">{{ t.console.networkDetail.membersDescription }}</p><table class="c-table c-responsive-table"><thead><tr><th scope="col">{{ t.console.fields.device }}</th><th scope="col">{{ t.console.fields.ipv6 }}</th><th scope="col">{{ t.console.fields.role }}</th><th scope="col">{{ t.console.fields.status }}</th><th scope="col">{{ t.console.fields.latency }}</th></tr></thead><tbody><template v-for="device in members" :key="device.id"><tr v-for="membership in device.memberships.filter((item) => item.networkId === network.id)" :key="membership.networkId"><th scope="row" :data-label="t.console.fields.device"><a class="c-link dl-mono" :href="`#/console/devices/${device.id}`">{{ device.name }}</a></th><td :data-label="t.console.fields.ipv6"><ConsoleAddress :address="membership.ipv6Address" :host-suffix="membership.hostSuffix" /></td><td :data-label="t.console.fields.role">{{ t.console.roles[membership.role] }}</td><td :data-label="t.console.fields.status"><span class="c-status" :class="`c-status--${effectiveState(device, membership)}`">{{ t.console.status[effectiveState(device, membership)] }}</span></td><td :data-label="t.console.fields.latency" class="dl-mono">{{ device.clientState === 'disconnected' || membership.state !== 'active' || membership.latencyMs === null ? '—' : `${membership.latencyMs} ms` }}</td></tr></template></tbody></table></section>
    <section v-if="zone" class="c-section"><h2>{{ t.console.networkDetail.dns }}</h2><dl class="c-definition"><div><dt>{{ t.console.fields.suffix }}</dt><dd class="dl-mono">{{ zone.suffix }}</dd></div><div><dt>{{ t.console.fields.reverse }}</dt><dd class="dl-mono">{{ zone.reverseZone }}</dd></div><div><dt>{{ t.console.fields.resolver }}</dt><dd class="dl-mono">{{ zone.resolver }}</dd></div></dl></section>
    <section class="c-section"><h2>{{ t.console.networkDetail.routes }}</h2><ConsoleRouteTable :routes="routes" /></section>
  </div>
</template>

<style scoped>
.mapping-title { margin-block-start: var(--dl-space-6); }
</style>
