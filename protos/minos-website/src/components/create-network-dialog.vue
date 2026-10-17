<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useI18n } from '../i18n'
import { consoleStore } from '../state/console'
const { t } = useI18n()
const message = useMessage()
const dialogRef = ref<HTMLDialogElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const nameRef = ref<HTMLInputElement | null>(null)
const name = ref('')
const dnsSuffix = ref('')
const isDnsCustomized = ref(false)
const isInvalid = ref(false)
const isValid = computed(() => name.value.trim().length > 0 && dnsSuffix.value.split('.').length > 1 && dnsSuffix.value.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))
watch(name, () => {
  if (isDnsCustomized.value) return
  const slug = name.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/g, '')
  dnsSuffix.value = `${slug || `network-${(consoleStore.data?.networks.length ?? 0) + 1}`}.minos`
})
function open(): void {
  name.value = ''
  dnsSuffix.value = ''
  isDnsCustomized.value = false
  isInvalid.value = false
  dialogRef.value?.showModal()
  nameRef.value?.focus()
}
function close(): void { dialogRef.value?.close(); triggerRef.value?.focus() }
function onCancel(event: Event): void { event.preventDefault(); close() }
function trapFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const controls = Array.from(dialogRef.value?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)') ?? [])
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
function confirm(): void {
  if (!isValid.value) return
  const network = consoleStore.createNetwork({ name: name.value, scope: 'workspace', dnsSuffix: dnsSuffix.value })
  if (!network) { isInvalid.value = true; return }
  close()
  message.success(t.value.console.createDialog.success)
}
onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <button ref="triggerRef" type="button" class="dl-btn dl-btn--primary" @click="open">{{ t.console.createDialog.title }}</button>
  <dialog ref="dialogRef" class="create-dialog" aria-labelledby="create-network-title" @cancel="onCancel" @keydown="trapFocus"><form @submit.prevent="confirm">
    <h2 id="create-network-title">{{ t.console.createDialog.title }}</h2><p class="c-secondary">{{ t.console.createDialog.allocation }}</p>
    <label class="create-field">{{ t.console.createDialog.name }}<input ref="nameRef" v-model="name" type="text" maxlength="100" required :aria-label="t.console.createDialog.name" /></label>
    <label class="create-field">{{ t.console.createDialog.scope }}<select :aria-label="t.console.createDialog.scope" disabled><option>{{ t.console.scope.workspace }}</option></select></label>
    <label class="create-field">{{ t.console.createDialog.dns }}<input v-model="dnsSuffix" type="text" maxlength="253" required :aria-label="t.console.createDialog.dns" @input="isDnsCustomized = true" /></label>
    <div class="create-preview"><p class="c-small c-secondary">{{ t.console.createDialog.prefix }}</p><output class="dl-mono" :aria-label="t.console.createDialog.prefix">{{ consoleStore.previewNetworkPrefix }}</output></div>
    <p v-if="isInvalid" role="alert">{{ t.console.createDialog.invalid }}</p>
    <div class="c-row"><button type="button" class="dl-btn dl-btn--ghost" @click="close">{{ t.console.common.cancel }}</button><button type="submit" class="dl-btn dl-btn--primary" :disabled="!isValid">{{ t.console.createDialog.confirm }}</button></div>
  </form></dialog>
</template>

<style scoped>
.create-dialog { width: min(var(--dl-measure), calc(100% - var(--dl-space-12))); max-height: calc(100dvh - var(--dl-space-12)); overflow: auto; padding: var(--dl-space-6); border: none; border-radius: var(--dl-radius-lg); color: var(--dl-text-primary); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); text-align: left; }
.create-dialog::backdrop { background: color-mix(in srgb, var(--dl-text-primary) 45%, transparent); }
form { display: grid; gap: var(--dl-space-4); }
.create-field { display: grid; gap: var(--dl-space-2); }
input, select { font: inherit; width: 100%; min-width: 0; min-height: var(--dl-target-size); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); color: var(--dl-text-primary); }
input:hover { border-color: var(--dl-accent); }
input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
select:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-secondary); }
option { background: var(--dl-bg-elevated); color: var(--dl-text-primary); }
.create-preview { padding-block: var(--dl-space-3); border-block: var(--dl-border-width) solid var(--dl-border-base); overflow-wrap: anywhere; }
</style>
