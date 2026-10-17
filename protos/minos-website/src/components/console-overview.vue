<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConsoleOverview, DeviceSummary, Membership, NetworkSummary } from '../contracts/generated/console-overview'
import { identityClass, useConsoleLabels } from '../data/console'
import type { IconName } from '../data/icons'
import { useI18n } from '../i18n'
import { effectiveState } from '../state/console'
import ConsoleNetworkBadge from './console-network-badge.vue'
import ConsoleAddress from './console-address.vue'
import DlIcon from './dl-icon.vue'
const props = defineProps<{ data: ConsoleOverview }>()
const { t } = useI18n()
const { networkName, tunnelLabel, membershipCoverage } = useConsoleLabels()
const selectedDeviceId = ref('')
const representative = computed(() => props.data.devices.find((device) => device.id === selectedDeviceId.value) ?? props.data.devices.reduce<DeviceSummary | undefined>((selected, device) => !selected || device.memberships.length > selected.memberships.length ? device : selected, undefined))
const DEVICE_ICONS = { linux: 'terminal', macos: 'laptop', windows: 'window', ios: 'phone', android: 'robot' } as const satisfies Record<DeviceSummary['os'], IconName>
const representativeIcon = computed<IconName>(() => representative.value ? DEVICE_ICONS[representative.value.os] : 'laptop')
const stats = computed(() => ({ deviceCount: props.data.devices.length, networkCount: props.data.networks.length, membershipCount: props.data.devices.reduce((count, device) => count + device.memberships.length, 0), onlineCount: props.data.devices.filter((device) => device.clientState === 'connected').length } satisfies ConsoleOverview['stats']))
function selectDevice(event: Event): void {
  if (event.target instanceof HTMLSelectElement) selectedDeviceId.value = event.target.value
}
function membershipLabel(device: DeviceSummary, network: NetworkSummary, membership: Membership): string {
  return `${device.name}, ${networkName(network)}, ${membership.ipv6Address}, ${t.value.console.status[effectiveState(device, membership)]}`
}
function nameFor(id: string): string {
  const network = props.data.networks.find((item) => item.id === id)
  return network ? networkName(network) : id
}
</script>

<template>
  <div>
    <div class="c-status-bar"><span class="c-tag">{{ t.console.overview.native }}</span><span>{{ t.console.overview.deviceLabel }} {{ stats.deviceCount }}</span><span>{{ t.console.overview.networkLabel }} {{ stats.networkCount }}</span><span>{{ t.console.overview.membershipLabel }} {{ stats.membershipCount }}</span><span>{{ t.console.overview.conflictLabel }} {{ data.addressSpace.unresolvedConflicts }}</span></div>
    <p class="c-small c-secondary fabric-note">{{ t.console.overview.independent }}</p>
    <section v-if="representative" class="c-section" aria-labelledby="fabric-title">
      <div class="c-row c-between"><h2 id="fabric-title">{{ t.console.overview.fabric }}</h2><label class="fabric-selector">{{ t.console.overview.selectDevice }}<select :aria-label="t.console.overview.selectDevice" :value="representative.id" @change="selectDevice"><option v-for="device in data.devices" :key="device.id" :value="device.id">{{ device.name }}</option></select></label></div>
      <div class="fabric">
        <div class="fabric-device c-card"><DlIcon :name="representativeIcon" size="lg" /><a class="c-link dl-mono" :href="`#/console/devices/${representative.id}`">{{ representative.name }}</a><p class="c-secondary">{{ tunnelLabel(representative.memberships.length) }}</p><p class="c-small c-secondary">{{ membershipCoverage(representative.memberships.length, data.networks.length) }}</p><span class="c-status" :class="`c-status--${representative.clientState}`">{{ t.console.status[representative.clientState] }}</span></div>
        <ul v-if="representative.memberships.length" class="fabric-networks"><li v-for="membership in representative.memberships" :key="membership.networkId" class="fabric-branch"><template v-for="network in data.networks.filter((item) => item.id === membership.networkId)" :key="network.id"><div class="fabric-network c-identity-bar" :class="identityClass(network.identity)"><span class="fabric-joint c-dot" aria-hidden="true" /><div><ConsoleNetworkBadge :network="network" /><span class="c-block c-small c-muted dl-mono">{{ network.ipv6Prefix }}</span></div><ConsoleAddress :address="membership.ipv6Address" :host-suffix="membership.hostSuffix" /><span class="c-status c-small" :class="`c-status--${effectiveState(representative, membership)}`">{{ t.console.status[effectiveState(representative, membership)] }}</span></div></template></li></ul><p v-else class="c-secondary">{{ t.console.overview.independent }}</p>
      </div><p class="c-small c-secondary fabric-note">{{ t.console.overview.multiplex }}</p>
    </section>
    <section class="c-section" aria-labelledby="matrix-title"><h2 id="matrix-title">{{ t.console.overview.matrix }}</h2><p class="c-small c-secondary">{{ t.console.overview.deviceLabel }} {{ stats.deviceCount }} · {{ t.console.overview.online }} {{ stats.onlineCount }}</p>
      <p v-if="data.networks.length === 0" class="c-note">{{ t.console.overview.noNetworks }}</p>
      <div v-else class="matrix-scroll c-desktop" role="region" :aria-label="t.console.overview.matrix" tabindex="0"><table class="address-matrix c-table"><caption>{{ t.console.overview.matrix }}</caption><thead><tr><th scope="col">{{ t.console.fields.device }}</th><th v-for="network in data.networks" :key="network.id" scope="col"><ConsoleNetworkBadge :network="network" /><span class="matrix-prefix c-muted dl-mono" :title="network.ipv6Prefix">{{ network.ipv6Prefix }}</span></th></tr></thead><tbody><tr v-for="device in data.devices" :key="device.id"><th scope="row"><a class="c-link dl-mono" :href="`#/console/devices/${device.id}`">{{ device.name }}</a><span class="c-block c-small">{{ t.console.status[device.clientState] }}</span></th><td v-for="network in data.networks" :key="network.id"><a v-for="membership in device.memberships.filter((item) => item.networkId === network.id)" :key="membership.networkId" :href="`#/console/devices/${device.id}`" class="matrix-membership c-link" :aria-label="membershipLabel(device, network, membership)"><span class="dl-mono">{{ membership.hostSuffix }}</span><span class="c-status c-small" :class="`c-status--${effectiveState(device, membership)}`">{{ t.console.status[effectiveState(device, membership)] }}</span></a><span v-if="!device.memberships.some((item) => item.networkId === network.id)" class="c-muted">—</span></td></tr></tbody></table></div>
      <ul class="overview-device-cards c-mobile-cards"><li v-for="device in data.devices" :key="device.id" class="c-card"><a class="c-link dl-mono" :href="`#/console/devices/${device.id}`">{{ device.name }}</a><span class="c-block c-small c-secondary">{{ t.console.status[device.clientState] }} · {{ membershipCoverage(device.memberships.length, data.networks.length) }}</span><ul class="c-list"><li v-for="membership in device.memberships" :key="membership.networkId" class="c-row c-between"><template v-for="network in data.networks.filter((item) => item.id === membership.networkId)" :key="network.id"><ConsoleNetworkBadge :network="network" /><span class="dl-mono">{{ membership.hostSuffix }}</span><span class="c-status c-small" :class="`c-status--${effectiveState(device, membership)}`">{{ t.console.status[effectiveState(device, membership)] }}</span></template></li></ul></li></ul>
    </section>
    <section class="c-section"><h2>{{ t.console.overview.addressSpace }}</h2><dl class="c-stats"><div><dt>{{ t.console.overview.prefixes }}</dt><dd>{{ data.addressSpace.networkPrefixCount }}</dd></div><div><dt>{{ t.console.overview.mappings }}</dt><dd>{{ data.addressSpace.ipv4MappingCount }}</dd></div><div><dt>{{ t.console.overview.unresolved }}</dt><dd>{{ data.addressSpace.unresolvedConflicts }}</dd></div></dl><p class="c-small c-secondary">{{ t.console.overview.allocation }}</p></section>
    <section class="c-section"><h2>{{ t.console.overview.attention }}</h2><ul class="c-list"><template v-for="device in data.devices" :key="device.id"><li v-for="membership in device.memberships.filter((item) => item.state === 'pending')" :key="membership.networkId"><a class="c-link" :href="`#/console/devices/${device.id}`">{{ device.name }} · {{ nameFor(membership.networkId) }} · {{ t.console.overview.pending }}</a></li><li v-if="device.clientVersionState === 'outdated'"><a class="c-link" :href="`#/console/devices/${device.id}`">{{ device.name }} · {{ t.console.overview.outdated }}</a></li></template><li v-for="network in data.networks.filter((item) => item.scope === 'external')" :key="network.id"><a class="c-link" :href="`#/console/networks/${network.id}`">{{ networkName(network) }} · {{ t.console.overview.external }}</a></li></ul></section>
  </div>
</template>

<style scoped>
.fabric { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 3fr); gap: var(--dl-space-8); align-items: center; }
.fabric-selector { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); font-size: var(--dl-font-size-sm); margin-block-end: var(--dl-space-3); }
select { font: inherit; min-height: var(--dl-target-size); max-width: 100%; min-width: 0; padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); }
select:hover { border-color: var(--dl-accent); }
.fabric-device { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: var(--dl-space-2); }
.fabric-device::after { content: ''; position: absolute; inset-inline-start: 100%; inset-block-start: 50%; width: var(--dl-space-8); height: var(--dl-border-width); background: var(--dl-border-strong); }
.fabric-device > .dl-icon { color: var(--dl-text-secondary); }
.fabric-networks { border-inline-start: var(--dl-border-width) solid var(--dl-border-strong); padding-block: var(--dl-space-3); }
.fabric-branch { position: relative; padding-inline-start: var(--dl-space-6); padding-block: var(--dl-space-2); }
.fabric-branch::before { content: ''; position: absolute; inset-inline-start: 0; inset-block-start: 50%; width: var(--dl-space-6); height: var(--dl-border-width); background: var(--dl-border-strong); }
.fabric-network { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) auto; gap: var(--dl-space-3); align-items: center; padding: var(--dl-space-3); background: var(--dl-bg-elevated); }
.fabric-joint { position: absolute; inset-inline-start: calc(-1 * var(--dl-space-6) - var(--dl-identity-dot-size) / 2); inset-block-start: calc(50% - var(--dl-identity-dot-size) / 2); }
.fabric-note { margin-block-start: var(--dl-space-3); }
.matrix-scroll { max-width: 100%; overflow-x: auto; padding: var(--dl-space-1); }
.matrix-scroll:focus-visible { box-shadow: var(--dl-focus-ring); }
.matrix-scroll > .address-matrix { table-layout: auto; width: max-content; min-width: 100%; }
.address-matrix th, .address-matrix td { min-width: calc(var(--dl-space-12) * 4); }
.address-matrix caption { position: absolute; width: var(--dl-border-width); height: var(--dl-border-width); overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.matrix-prefix { display: block; max-width: calc(var(--dl-space-12) * 4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: var(--dl-font-size-xs); }
.matrix-membership { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); }
@media (max-width: 1100px) { .fabric-device::after { display: none; } .fabric { grid-template-columns: minmax(0, 1fr); gap: var(--dl-space-4); } .fabric-network { grid-template-columns: minmax(0, 1fr); } }
</style>
