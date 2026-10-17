<script setup lang="ts">
import { computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from '../i18n'
const props = defineProps<{ address: string; hostSuffix?: string; copyable?: boolean }>()
const { t } = useI18n()
const message = useMessage()
const prefix = computed(() => props.hostSuffix ? props.address.slice(0, -props.hostSuffix.length) : props.address)
async function copy(): Promise<void> {
  try { await navigator.clipboard.writeText(props.address); message.success(t.value.console.common.copied) }
  catch { message.error(t.value.console.common.copyFailed) }
}
</script>

<template>
  <span class="c-address"><span class="dl-mono c-address__value"><span class="c-muted">{{ prefix }}</span><strong v-if="hostSuffix">{{ hostSuffix }}</strong></span><button v-if="copyable" type="button" class="dl-btn dl-btn--ghost" :aria-label="`${t.console.common.copy}: ${address}`" @click="copy">{{ t.console.common.copy }}</button></span>
</template>

<style scoped>
.c-address { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--dl-space-2); max-width: 100%; }
.c-address__value { overflow-wrap: anywhere; min-width: 0; }
strong { font-weight: 500; color: var(--dl-text-primary); white-space: nowrap; }
</style>
