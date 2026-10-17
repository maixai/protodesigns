<script setup lang="ts">
import type { NetworkSummary } from '../contracts/generated/console-overview'
import { identityClass, useConsoleLabels } from '../data/console'
import { useI18n } from '../i18n'
defineProps<{ network: NetworkSummary; showScope?: boolean }>()
const { networkName } = useConsoleLabels()
const { t } = useI18n()
</script>

<template>
  <span class="c-network-badge" :class="identityClass(network.identity)"><span class="c-dot" aria-hidden="true" /><span>{{ networkName(network) }}</span><span v-if="showScope" class="c-tag">{{ t.console.scope[network.scope] }}</span></span>
</template>

<style scoped>
.c-network-badge { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); }
</style>
