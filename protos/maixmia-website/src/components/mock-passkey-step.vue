<script setup lang="ts">
import { useI18n } from '../i18n'
defineProps<{ busy: boolean; testId?: string }>()
const emit = defineEmits<{ confirm: [] }>()
const { t } = useI18n()
</script>
<template>
  <section class="identity-box" :aria-label="t.workspace.security.mockPasskey">
    <h3>{{ t.workspace.security.mockPasskey }}</h3>
    <p class="identity-muted">{{ t.workspace.security.demo }} · {{ t.workspace.security.mockHint }}</p>
    <button type="button" class="identity-button identity-button--primary" :data-testid="testId" :disabled="busy" @click="emit('confirm')">{{ busy ? t.workspace.security.busy : t.workspace.security.mockSuccess }}</button>
  </section>
</template>
