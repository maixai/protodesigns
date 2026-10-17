<script setup lang="ts">
import { computed } from 'vue'
import type { ConsoleOverview, DeviceSummary } from '../contracts/generated/console-overview'
import { useI18n } from '../i18n'
import { consoleStore, effectiveState } from '../state/console'
import ConsoleAddress from './console-address.vue'
import ConsoleNetworkBadge from './console-network-badge.vue'
import ConsoleRouteTable from './console-route-table.vue'
import JoinNetworkDialog from './join-network-dialog.vue'
const props = defineProps<{ data: ConsoleOverview; device: DeviceSummary }>()
const { t } = useI18n()
const routes = computed(() => props.data.routes.filter((route) => route.networkId === null || props.device.memberships.some((item) => item.networkId === route.networkId)))
const zones = computed(() => props.data.dnsZones.filter((zone) => props.device.memberships.some((item) => item.networkId === zone.networkId)))
</script>

<template>
  <div class="device-detail">
    <div class="c-row c-between"><div class="c-row"><span>{{ t.console.deviceDetail.client }}</span><button type="button" class="client-switch dl-btn dl-btn--ghost" role="switch" :aria-checked="device.clientState === 'connected'" :aria-label="t.console.deviceDetail.client" @click="consoleStore.toggleClient(device.id)"><span class="c-status" :class="`c-status--${device.clientState}`">{{ t.console.status[device.clientState] }}</span></button></div><JoinNetworkDialog :key="device.id" :device-id="device.id" /></div>
    <p class="c-small c-secondary">{{ t.console.deviceDetail.perDevice }}</p>
    <p v-if="device.clientState === 'disconnected'" class="c-note">{{ t.console.deviceDetail.offline }}</p>
    <section class="c-section" aria-labelledby="memberships-title"><h2 id="memberships-title">{{ t.console.deviceDetail.memberships }}</h2>
      <table class="c-table c-responsive-table membership-table"><thead><tr><th scope="col">{{ t.console.fields.network }}</th><th scope="col">{{ t.console.fields.ipv6 }}</th><th scope="col">{{ t.console.fields.ipv4 }}</th><th scope="col">{{ t.console.fields.role }}</th><th scope="col">{{ t.console.fields.status }}</th><th scope="col">{{ t.console.fields.latency }}</th><th scope="col">{{ t.console.fields.actions }}</th></tr></thead><tbody><tr v-for="membership in device.memberships" :key="membership.networkId" :data-network-id="membership.networkId"><td :data-label="t.console.fields.network"><template v-for="network in data.networks.filter((item) => item.id === membership.networkId)" :key="network.id"><a class="c-link" :href="`#/console/networks/${network.id}`"><ConsoleNetworkBadge :network="network" :show-scope="true" /></a></template></td><td :data-label="t.console.fields.ipv6"><ConsoleAddress :address="membership.ipv6Address" :host-suffix="membership.hostSuffix" :copyable="true" /></td><td :data-label="t.console.fields.ipv4">{{ t.console.ipv4Compat[membership.ipv4Compat] }}</td><td :data-label="t.console.fields.role">{{ t.console.roles[membership.role] }}</td><td :data-label="t.console.fields.status"><span class="c-status" :class="`c-status--${effectiveState(device, membership)}`">{{ t.console.status[effectiveState(device, membership)] }}</span><small v-if="device.clientState === 'disconnected'" class="c-block c-muted">{{ t.console.status[membership.state] }}</small></td><td :data-label="t.console.fields.latency" class="dl-mono">{{ device.clientState === 'disconnected' || membership.state !== 'active' || membership.latencyMs === null ? '—' : `${membership.latencyMs} ms` }}</td><td :data-label="t.console.fields.actions"><button v-if="membership.state === 'active' || membership.state === 'paused'" type="button" class="dl-btn dl-btn--ghost" :title="membership.state === 'paused' ? t.console.deviceDetail.resumeHint : t.console.deviceDetail.pauseHint" @click="consoleStore.toggleMembership(device.id, membership.networkId)">{{ membership.state === 'paused' ? t.console.deviceDetail.resume : t.console.deviceDetail.pause }}</button><button v-else-if="membership.state === 'pending' && data.networks.some((network) => network.id === membership.networkId && network.scope === 'workspace')" type="button" class="dl-btn dl-btn--ghost" @click="consoleStore.authorizeMembership(device.id, membership.networkId)">{{ t.console.deviceDetail.authorize }}</button><span v-else>—</span></td></tr></tbody></table>
    </section>
    <section class="c-section"><h2>{{ t.console.deviceDetail.routes }}</h2><p class="c-note">{{ t.console.routing.split }}</p><ConsoleRouteTable :routes="routes" :device="device" /><ul class="c-list"><li v-for="zone in zones" :key="zone.networkId"><p class="dl-mono">{{ zone.suffix }}</p><p class="dl-mono c-small c-muted">{{ zone.reverseZone }}</p></li></ul></section>
    <section class="c-section"><h2>{{ t.console.deviceDetail.compatibility }}</h2><ul class="c-list"><li v-for="membership in device.memberships" :key="membership.networkId" class="c-row"><template v-for="network in data.networks.filter((item) => item.id === membership.networkId)" :key="network.id"><ConsoleNetworkBadge :network="network" /><span>{{ t.console.ipv4Compat[membership.ipv4Compat] }}</span></template></li></ul><p class="c-secondary">{{ t.console.deviceDetail.compatibilityDescription }}</p></section>
  </div>
</template>

<style scoped>
.membership-table thead th:nth-child(2) { width: 26%; }
</style>
