<script setup lang="ts">
import type { ConsoleOverview } from '../contracts/generated/console-overview'
import { useConsoleLabels } from '../data/console'
import { useI18n } from '../i18n'
import { effectiveState } from '../state/console'
import ConsoleNetworkBadge from './console-network-badge.vue'
defineProps<{ data: ConsoleOverview }>()
const { t } = useI18n()
const { lastSeen } = useConsoleLabels()
</script>

<template>
  <table class="c-table c-responsive-table devices-table"><caption>{{ t.console.devices.title }}</caption><thead><tr><th scope="col">{{ t.console.fields.device }}</th><th scope="col">{{ t.console.fields.client }}</th><th scope="col">{{ t.console.fields.memberships }}</th><th scope="col">{{ t.console.fields.lastSeen }}</th></tr></thead><tbody><tr v-for="device in data.devices" :key="device.id"><th scope="row" :data-label="t.console.fields.device"><a class="c-link dl-mono" :href="`#/console/devices/${device.id}`">{{ device.name }}</a><span class="c-block c-small">{{ device.os }}</span></th><td :data-label="t.console.fields.client"><div><span class="c-status" :class="`c-status--${device.clientState}`">{{ t.console.status[device.clientState] }}</span><span class="c-block dl-mono">{{ device.clientVersion }}</span><span v-if="device.clientVersionState === 'outdated'" class="c-tag">{{ t.console.status.outdated }}</span></div></td><td :data-label="t.console.fields.memberships"><ul class="c-stack"><li v-for="membership in device.memberships" :key="membership.networkId" class="c-tag"><template v-for="network in data.networks.filter((item) => item.id === membership.networkId)" :key="network.id"><ConsoleNetworkBadge :network="network" /><span class="dl-mono">{{ membership.hostSuffix }}</span><span class="c-small">{{ t.console.status[effectiveState(device, membership)] }}</span></template></li></ul></td><td :data-label="t.console.fields.lastSeen"><time :datetime="device.lastSeen">{{ lastSeen(device.lastSeen) }}</time></td></tr></tbody></table>
</template>
