<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import type { Membership } from '../contracts/generated/console-overview'
import { useConsoleLabels } from '../data/console'
import { useI18n } from '../i18n'
import { addressFor, consoleStore, hostSuffixFor } from '../state/console'
const props = defineProps<{ deviceId?: string; networkId?: string }>()
const { t } = useI18n()
const { networkName } = useConsoleLabels()
const message = useMessage()
const dialogRef = ref<HTMLDialogElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const selectedDeviceId = ref('')
const selectedNetworkId = ref('')
const role = ref<Membership['role']>('member')
const title = computed(() => props.networkId ? t.value.console.networkDetail.add : t.value.console.joinDialog.title)
const devices = computed(() => consoleStore.data?.devices.filter((device) => !props.networkId || !device.memberships.some((item) => item.networkId === props.networkId)) ?? [])
const device = computed(() => consoleStore.data?.devices.find((item) => item.id === (props.deviceId ?? selectedDeviceId.value)))
const networks = computed(() => consoleStore.data?.networks.filter((network) => (!props.networkId || network.id === props.networkId) && !device.value?.memberships.some((item) => item.networkId === network.id)) ?? [])
const hasJoinableNetworks = computed(() => networks.value.some((network) => network.scope === 'workspace'))
const network = computed(() => networks.value.find((item) => item.id === selectedNetworkId.value && item.scope === 'workspace'))
const preview = computed(() => device.value && network.value ? addressFor(network.value, hostSuffixFor(device.value)) : '—')
watch(networks, () => {
  if (!networks.value.some((item) => item.id === selectedNetworkId.value)) selectedNetworkId.value = networks.value.find((item) => item.scope === 'workspace')?.id ?? ''
})
function open(): void {
  selectedDeviceId.value = props.deviceId ?? devices.value[0]?.id ?? ''
  selectedNetworkId.value = networks.value.find((item) => item.scope === 'workspace')?.id ?? ''
  role.value = 'member'
  dialogRef.value?.showModal()
  dialogRef.value?.querySelector<HTMLSelectElement>('select')?.focus()
  if (!device.value || !network.value) dialogRef.value?.querySelector<HTMLButtonElement>('button')?.focus()
}
function close(): void { dialogRef.value?.close(); triggerRef.value?.focus() }
function onCancel(event: Event): void { event.preventDefault(); close() }
function trapFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  const controls = Array.from(dialogRef.value?.querySelectorAll<HTMLElement>('select:not(:disabled), button:not(:disabled)') ?? [])
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
function confirm(): void {
  if (!device.value || !network.value) return
  if (!consoleStore.joinNetwork(device.value.id, network.value.id, role.value)) return
  close()
  message.success(t.value.console.joinDialog.success)
}
onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <button ref="triggerRef" type="button" class="dl-btn dl-btn--primary" @click="open">{{ networkId ? t.console.networkDetail.add : t.console.deviceDetail.join }}</button>
  <dialog ref="dialogRef" class="join-dialog" :aria-labelledby="`join-title-${deviceId ?? networkId}`" @cancel="onCancel" @keydown="trapFocus">
    <form @submit.prevent="confirm"><h2 :id="`join-title-${deviceId ?? networkId}`">{{ title }}</h2><p class="c-secondary">{{ t.console.joinDialog.description }}</p><p class="c-small c-secondary">{{ device?.name }} · {{ t.console.joinDialog.deviceOnly }}</p>
      <label v-if="!deviceId" class="join-field">{{ t.console.joinDialog.device }}<select v-model="selectedDeviceId" :aria-label="t.console.joinDialog.device" :disabled="devices.length === 0"><option v-for="item in devices" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label class="join-field">{{ t.console.joinDialog.network }}<select v-model="selectedNetworkId" :aria-label="t.console.joinDialog.network" :disabled="!hasJoinableNetworks || !!networkId"><option v-for="item in networks" :key="item.id" :value="item.id" :disabled="item.scope === 'external'">{{ networkName(item) }}{{ item.scope === 'external' ? ` · ${t.console.overview.external}` : '' }}</option></select></label>
      <label class="join-field">{{ t.console.joinDialog.role }}<select v-model="role" :aria-label="t.console.joinDialog.role"><option value="member">{{ t.console.roles.member }}</option><option value="subnetRouter">{{ t.console.roles.subnetRouter }}</option><option value="exitNode">{{ t.console.roles.exitNode }}</option></select></label>
      <p v-if="!device || !network" class="c-note">{{ networkId ? t.console.joinDialog.noDevices : t.console.joinDialog.unavailable }}</p>
      <div class="join-preview"><p class="c-small c-secondary">{{ t.console.joinDialog.preview }}</p><output class="dl-mono">{{ preview }}</output></div>
      <div class="c-row"><button type="button" class="dl-btn dl-btn--ghost" @click="close">{{ t.console.common.cancel }}</button><button type="submit" class="dl-btn dl-btn--primary" :disabled="!device || !network">{{ t.console.joinDialog.confirm }}</button></div>
    </form>
  </dialog>
</template>

<style scoped>
.join-dialog { width: min(var(--dl-measure), calc(100% - var(--dl-space-12))); max-height: calc(100dvh - var(--dl-space-12)); padding: var(--dl-space-6); overflow: auto; border: none; border-radius: var(--dl-radius-lg); color: var(--dl-text-primary); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); text-align: left; }
.join-dialog::backdrop { background: color-mix(in srgb, var(--dl-text-primary) 45%, transparent); }
form { display: grid; gap: var(--dl-space-4); }
.join-field { display: grid; gap: var(--dl-space-2); }
select { max-width: 100%; width: 100%; min-height: var(--dl-target-size); padding: var(--dl-space-2); font: inherit; color: var(--dl-text-primary); background: var(--dl-bg-elevated); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); }
option { color: var(--dl-text-primary); background: var(--dl-bg-elevated); }
select:hover { border-color: var(--dl-accent); }
select:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-secondary); }
.join-preview { padding-block: var(--dl-space-3); border-block: var(--dl-border-width) solid var(--dl-border-base); overflow-wrap: anywhere; }
</style>
