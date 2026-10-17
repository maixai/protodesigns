<script setup lang="ts">
import type { DeviceSummary, RouteEntry } from '../contracts/generated/console-overview'
import { useI18n } from '../i18n'
import { effectiveState } from '../state/console'
defineProps<{ routes: RouteEntry[]; device?: DeviceSummary }>()
const { t } = useI18n()
function rowState(route: RouteEntry, device?: DeviceSummary): RouteEntry['state'] | 'offline' | 'pending' | 'conflict' {
  if (!device || route.networkId === null) return route.state
  if (device.clientState === 'disconnected') return 'offline'
  const membership = device.memberships.find((item) => item.networkId === route.networkId)
  return membership ? effectiveState(device, membership) : route.state
}
</script>

<template>
  <table class="c-table c-responsive-table"><caption>{{ t.console.routing.ledger }}</caption><thead><tr><th scope="col">{{ t.console.fields.destination }}</th><th scope="col">{{ t.console.fields.family }}</th><th scope="col">{{ t.console.fields.gateway }}</th><th scope="col">{{ t.console.fields.priority }}</th><th scope="col">{{ t.console.fields.status }}</th></tr></thead>
    <tbody><tr v-for="route in routes" :key="route.id"><td :data-label="t.console.fields.destination"><span class="dl-mono">{{ route.destination }}</span><small v-if="route.sourceCidr" class="c-block c-muted dl-mono">← {{ route.sourceCidr }}</small></td><td :data-label="t.console.fields.family">{{ route.family === 'ipv6' ? 'IPv6' : 'IPv4 / NAT64' }}</td><td :data-label="t.console.fields.gateway" class="dl-mono">{{ route.gateway === 'local' ? t.console.routing.local : route.gateway }}</td><td :data-label="t.console.fields.priority" class="dl-mono">{{ route.priority }}</td><td :data-label="t.console.fields.status"><span class="c-status" :class="`c-status--${rowState(route, device)}`">{{ t.console.status[rowState(route, device)] }}</span></td></tr></tbody>
  </table>
</template>
