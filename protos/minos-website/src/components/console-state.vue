<script setup lang="ts">
import type { OverviewState } from '../contracts/generated/overview-state'
import { useI18n } from '../i18n'
defineProps<{ status: OverviewState['status'] }>()
defineEmits<{ retry: [] }>()
const { t } = useI18n()
</script>

<template>
  <div v-if="status === 'loading'" class="c-state" role="status"><p>{{ t.console.common.loading }}</p><div class="c-skeleton" aria-hidden="true"><span /><span /><span /></div></div>
  <section v-else-if="status === 'empty'" class="c-state" role="status"><h2>{{ t.console.common.empty }}</h2><p>{{ t.console.common.emptyDescription }}</p></section>
  <section v-else-if="status === 'error'" class="c-state" role="alert"><h2>{{ t.console.common.error }}</h2><p>{{ t.console.common.errorDescription }}</p><button type="button" class="dl-btn dl-btn--ghost" @click="$emit('retry')">{{ t.console.common.retry }}</button></section>
</template>

<style scoped>
.c-state { display: grid; justify-items: start; gap: var(--dl-space-3); padding-block: var(--dl-space-8); border-block: var(--dl-border-width) solid var(--dl-border-base); }
.c-state p { color: var(--dl-text-secondary); max-width: var(--dl-measure); }
.c-skeleton { display: grid; width: 100%; gap: var(--dl-space-3); }
.c-skeleton span { height: var(--dl-space-8); background: var(--dl-bg-sunken); border-radius: var(--dl-radius-sm); }
</style>
