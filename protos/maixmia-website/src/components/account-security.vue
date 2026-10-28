<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { IdentityVault, PasskeySummary } from '../contracts/generated/identity-vault'
import type { DeviceUnlockCapability } from '../contracts/generated/device-unlock-capability'
import type { RecoveryKeyReveal } from '../contracts/generated/recovery-key-reveal'
import { addPasskey, regenerateRecoveryKey, removePasskey } from '../api/workspace'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{ vault: IdentityVault; capability: DeviceUnlockCapability }>()
const emit = defineEmits<{ updated: [vault: IdentityVault] }>()
const { t, locale } = useI18n()
const copy = computed(() => t.value.workspace.settings)
const root = ref<HTMLElement | null>(null)
const addButton = ref<HTMLButtonElement | null>(null)
const panelHeading = ref<HTMLElement | null>(null)
const addStage = ref<'closed' | 'intro' | 'verify' | 'success'>('closed')
const recoveryStage = ref<'idle' | 'verify' | 'reveal'>('idle')
const reveal = ref<RecoveryKeyReveal | null>(null)
const busy = ref(false)
const actionError = ref('')
const notice = ref('')
const menuId = ref('')
const menuReturn = ref<HTMLButtonElement | null>(null)
const removeReturn = ref<HTMLButtonElement | null>(null)
const removeTarget = ref<PasskeySummary | null>(null)
const removeDialog = ref<HTMLDialogElement | null>(null)
const removeCancel = ref<HTMLButtonElement | null>(null)
const sortedPasskeys = computed(() => [...props.vault.passkeys].sort((a, b) =>
  Number(b.isThisDevice) - Number(a.isThisDevice)
  || Number(b.canUnlock) - Number(a.canUnlock)
  || b.lastUsedAt.localeCompare(a.lastUsedAt)
  || b.createdAt.localeCompare(a.createdAt)))
const removalBlocked = computed(() => {
  const target = removeTarget.value
  if (target === null) return false
  return target.canUnlock && !props.vault.passkeys.some((passkey) => passkey.id !== target.id && passkey.canUnlock) && !props.vault.recoveryKeyConfigured
})
const removalWarnsRecoveryOnly = computed(() => {
  const target = removeTarget.value
  if (target === null) return false
  return target.canUnlock && !props.vault.passkeys.some((passkey) => passkey.id !== target.id && passkey.canUnlock) && props.vault.recoveryKeyConfigured
})

function formatDate(value: string, includeTime: boolean): string {
  const date = new Date(value)
  if (value === '' || Number.isNaN(date.getTime())) return copy.value.notUsed
  return new Intl.DateTimeFormat(locale.value, includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date)
}
function formattedRecoveryKey(value: string): string {
  return value.split('-').join(' · ')
}
async function focusHeading(): Promise<void> {
  await nextTick()
  panelHeading.value?.focus({ preventScroll: true })
}
async function openAdd(): Promise<void> {
  actionError.value = ''
  addStage.value = 'intro'
  await focusHeading()
}
async function closeAdd(): Promise<void> {
  addStage.value = 'closed'
  await nextTick()
  addButton.value?.focus()
}
async function create(): Promise<void> {
  if (busy.value || !props.capability.prfAvailable) return
  addStage.value = 'verify'
  await focusHeading()
}
async function confirmAdd(): Promise<void> {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  const result = await addPasskey()
  busy.value = false
  if (!result.ok) { actionError.value = result.error.message; return }
  emit('updated', result.value)
  addStage.value = 'success'
  await focusHeading()
}
function openMenu(id: string, event: MouseEvent): void {
  if (menuId.value === id) { closeMenu(true); return }
  menuId.value = id
  if (event.currentTarget instanceof HTMLButtonElement) menuReturn.value = event.currentTarget
}
function closeMenu(restore = false): void {
  menuId.value = ''
  if (restore) menuReturn.value?.focus()
}
async function requestRemove(passkey: PasskeySummary): Promise<void> {
  removeReturn.value = menuReturn.value
  closeMenu()
  removeTarget.value = passkey
  await nextTick()
  removeDialog.value?.showModal()
  removeCancel.value?.focus()
}
async function closeRemove(restoreFocus = true): Promise<void> {
  removeDialog.value?.close()
  removeTarget.value = null
  await nextTick()
  if (restoreFocus) removeReturn.value?.focus()
}
function cancelRemove(): void {
  void closeRemove()
}
async function confirmRemove(): Promise<void> {
  const target = removeTarget.value
  if (target === null || removalBlocked.value || busy.value) return
  busy.value = true
  actionError.value = ''
  const result = await removePasskey(target.id)
  busy.value = false
  if (!result.ok) { actionError.value = result.error.message; await closeRemove(false); return }
  emit('updated', result.value)
  await closeRemove(false)
  notice.value = `${copy.value.passkeyRemoved}。${copy.value.removeManagerHint}`
  await nextTick()
  addButton.value?.focus()
}
async function startRecovery(): Promise<void> {
  actionError.value = ''
  recoveryStage.value = 'verify'
  await focusHeading()
}
async function cancelRecovery(): Promise<void> {
  recoveryStage.value = 'idle'
  await nextTick()
  root.value?.querySelector<HTMLButtonElement>('[data-recovery-generate]')?.focus()
}
async function confirmRecovery(): Promise<void> {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  const result = await regenerateRecoveryKey()
  busy.value = false
  if (!result.ok) { actionError.value = result.error.message; return }
  reveal.value = result.value
  emit('updated', result.value.vault)
  recoveryStage.value = 'reveal'
  await focusHeading()
}
async function finishRecovery(): Promise<void> {
  recoveryStage.value = 'idle'
  reveal.value = null
  await nextTick()
  root.value?.querySelector<HTMLButtonElement>('[data-recovery-generate]')?.focus()
}
async function copyRecovery(): Promise<void> {
  if (reveal.value === null) return
  try {
    await navigator.clipboard.writeText(reveal.value.recoveryKey)
    notice.value = copy.value.copied
  } catch {
    actionError.value = t.value.workspace.security.copyFailed
  }
}
async function copyPublicKey(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.vault.fingerprint)
    notice.value = copy.value.copied
  } catch {
    actionError.value = t.value.workspace.security.copyFailed
  }
}
function downloadRecovery(): void {
  if (reveal.value === null) return
  const url = URL.createObjectURL(new Blob([reveal.value.recoveryKey], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = copy.value.recoveryFileName
  anchor.click()
  URL.revokeObjectURL(url)
}
function onDocumentPointer(event: PointerEvent): void {
  // 点击落在任意行尾菜单内不在这里关闭：同一按钮由 click 负责 toggle，另一行的按钮负责切换。
  if (event.target instanceof Element && event.target.closest('.account-security__menu-wrap') !== null) return
  closeMenu()
}
function onMenuFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(next)) return
  closeMenu()
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && menuId.value !== '') {
    event.preventDefault()
    event.stopPropagation()
    closeMenu(true)
  }
}
watch(menuId, (value) => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  if (value !== '') document.addEventListener('pointerdown', onDocumentPointer)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  removeDialog.value?.close()
})
</script>

<template>
  <div ref="root" class="account-security" @keydown="onKeydown">
    <p v-if="actionError !== ''" role="alert">{{ actionError }}</p>
    <p v-if="notice !== ''" role="status" class="account-security__notice">{{ notice }}</p>
    <section class="account-security__section" aria-labelledby="settings-passkeys-title">
      <header class="account-security__heading">
        <h3 id="settings-passkeys-title">{{ copy.passkeysTitle }} <span class="account-security__count">{{ String(vault.passkeys.length).padStart(2, '0') }}</span></h3>
        <button ref="addButton" type="button" class="account-security__button" data-add-passkey @click="openAdd"><DliIcon name="passkey" />{{ copy.addPasskey }}</button>
      </header>
      <p class="account-security__muted">{{ copy.passkeysHint }}</p>
      <p v-if="vault.passkeys.length === 0" class="account-security__empty">{{ copy.emptyPasskeys }}</p>
      <ul v-else class="account-security__list" data-settings-passkeys>
        <li v-for="passkey in sortedPasskeys" :key="passkey.id" :data-passkey-id="passkey.id">
          <DliIcon name="passkey" />
          <div class="account-security__passkey-body">
            <div class="account-security__passkey-top"><p class="account-security__passkey-name">{{ passkey.label }}</p>
            <p class="account-security__chips">
              <span :data-unlock="passkey.canUnlock">{{ passkey.canUnlock ? copy.canUnlock : copy.loginOnly }}</span>
              <span>{{ passkey.backupEligible ? copy.synced : copy.localOnly }}</span>
              <span v-if="passkey.isThisDevice">{{ copy.currentDevice }}</span>
            </p></div>
            <p class="account-security__meta"><span>{{ copy.lastUsed }} <time :datetime="passkey.lastUsedAt || undefined">{{ formatDate(passkey.lastUsedAt, true) }}</time></span><span>{{ copy.createdAt }} <time :datetime="passkey.createdAt">{{ formatDate(passkey.createdAt, false) }}</time></span></p>
            <p v-if="!passkey.canUnlock" class="account-security__muted">{{ copy.loginOnlyHint }}</p>
          </div>
          <div class="account-security__menu-wrap" @focusout="onMenuFocusOut">
            <button type="button" class="account-security__icon-button" :aria-label="copy.passkeyActions.replace('{name}', passkey.label)" :aria-expanded="menuId === passkey.id" :aria-controls="`passkey-menu-${passkey.id}`" @click="openMenu(passkey.id, $event)">⋯</button>
            <div v-if="menuId === passkey.id" :id="`passkey-menu-${passkey.id}`" class="account-security__menu" role="group" :aria-label="copy.passkeyActions.replace('{name}', passkey.label)">
              <button type="button" class="account-security__danger" @click="requestRemove(passkey)">{{ copy.removePasskey }}</button>
            </div>
          </div>
        </li>
      </ul>
      <section v-if="addStage !== 'closed'" class="account-security__flow" data-add-passkey-flow :aria-busy="busy">
        <h4 ref="panelHeading" tabindex="-1">{{ addStage === 'success' ? copy.passkeyAdded : addStage === 'verify' ? copy.passkeyVerifyTitle : copy.addPasskey }}</h4>
        <template v-if="addStage === 'intro'">
          <p v-if="capability.prfAvailable">{{ copy.addPasskeyHint }}</p>
          <template v-else><p role="alert">{{ copy.prfBlocked }}</p><p class="account-security__muted">{{ copy.prfBlockedHint }}</p></template>
          <div class="account-security__actions"><button v-if="capability.prfAvailable" type="button" class="account-security__button" @click="create">{{ copy.createPasskey }}</button><button type="button" class="account-security__button" @click="closeAdd">{{ copy.cancel }}</button></div>
        </template>
        <template v-else-if="addStage === 'verify'">
          <p class="account-security__muted">{{ copy.passkeyVerifyHint }}</p>
          <div class="account-security__actions"><button type="button" class="account-security__button" data-settings-add-passkey-confirm :disabled="busy" @click="confirmAdd">{{ busy ? copy.busy : t.workspace.security.mockSuccess }}</button><button type="button" class="account-security__button" @click="closeAdd">{{ copy.cancel }}</button></div>
        </template>
        <template v-else><p>{{ copy.identityUnchanged }}</p><button type="button" class="account-security__button" @click="closeAdd">{{ copy.finish }}</button></template>
      </section>
    </section>

    <section class="account-security__section" aria-labelledby="settings-recovery-title">
      <header class="account-security__heading"><h3 id="settings-recovery-title">{{ copy.recoveryKey }}</h3><span class="account-security__chip">{{ vault.recoveryKeyConfigured ? copy.configured : copy.notConfigured }}</span></header>
      <p class="account-security__muted">{{ copy.recoveryHintOnce }}</p>
      <button v-if="recoveryStage === 'idle'" type="button" class="account-security__button" data-recovery-generate @click="startRecovery">{{ vault.recoveryKeyConfigured ? copy.regenerateRecoveryKey : copy.generateRecoveryKey }}</button>
      <div v-else-if="recoveryStage === 'verify'" class="account-security__flow" :aria-busy="busy">
        <h4 ref="panelHeading" tabindex="-1">{{ copy.passkeyVerifyTitle }}</h4><p class="account-security__muted">{{ copy.recoveryVerifyHint }}</p>
        <div class="account-security__actions"><button type="button" class="account-security__button" data-settings-recovery-confirm :disabled="busy" @click="confirmRecovery">{{ busy ? copy.busy : t.workspace.security.mockSuccess }}</button><button type="button" class="account-security__button" @click="cancelRecovery">{{ copy.cancel }}</button></div>
      </div>
      <section v-else class="account-security__flow" data-recovery-reveal aria-labelledby="settings-reveal-title">
        <h4 id="settings-reveal-title" ref="panelHeading" tabindex="-1">{{ copy.recoveryRevealTitle }}</h4>
        <p class="account-security__muted">{{ copy.recoveryRevealHint }}</p>
        <code class="account-security__recovery-key" data-recovery-key>{{ formattedRecoveryKey(reveal?.recoveryKey ?? '') }}</code>
        <p class="account-security__muted">{{ copy.recoveryChangedHint }}</p>
        <div class="account-security__actions"><button type="button" class="account-security__button" @click="copyRecovery">{{ copy.copy }}</button><button type="button" class="account-security__button" data-download-recovery @click="downloadRecovery">{{ copy.downloadTxt }}</button><button type="button" class="account-security__button" @click="finishRecovery">{{ copy.finish }}</button></div>
      </section>
    </section>

    <details class="account-security__details" data-public-key>
      <summary><span>{{ copy.publicKey }}</span><span class="account-security__meta">{{ vault.fingerprint.split(' ').slice(0, 3).join(' ') }} … · v{{ vault.keyVersion }}</span></summary>
      <code class="account-security__fingerprint" data-public-fingerprint>{{ vault.fingerprint }}</code>
      <button type="button" class="account-security__button" data-copy-public-key @click="copyPublicKey">{{ copy.copy }}</button>
      <p class="account-security__muted">{{ copy.publicKeyHint }}</p>
    </details>
    <details class="account-security__details">
      <summary>{{ copy.securityBoundary }}<span class="account-security__meta">{{ copy.boundarySummary }}</span></summary>
      <h4>{{ t.workspace.security.browserMode }}</h4>
      <p class="account-security__muted">{{ copy.boundaryDetail }}</p>
      <p class="account-security__muted">{{ t.workspace.security.browserBoundary }}</p>
    </details>

    <dialog v-if="removeTarget !== null" ref="removeDialog" class="account-security__confirm dl-modal-scrim" aria-modal="true" aria-labelledby="settings-remove-title" @cancel.prevent="cancelRemove" @keydown.stop>
      <h3 id="settings-remove-title">{{ copy.removePasskeyTitle }}</h3>
      <p>{{ removeTarget.label }}</p>
      <p v-if="removalBlocked" role="alert">{{ copy.lastFactorBlocked }}</p>
      <template v-else><p>{{ copy.removePasskeyHint }}</p><p v-if="removalWarnsRecoveryOnly" role="alert">{{ copy.lastPasskeyWarning }}</p></template>
      <div class="account-security__actions"><button ref="removeCancel" type="button" class="account-security__button" @click="cancelRemove">{{ copy.cancel }}</button><button v-if="!removalBlocked" type="button" class="account-security__button account-security__danger" data-remove-passkey-confirm :disabled="busy" @click="confirmRemove">{{ copy.removePasskey }}</button></div>
    </dialog>
  </div>
</template>

<style scoped>
.account-security { display: flex; flex-direction: column; gap: var(--dl-space-6); min-inline-size: 0; }
.account-security__section { display: flex; flex-direction: column; gap: var(--dl-space-3); }
.account-security__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-2); }
h3 { display: flex; align-items: center; gap: var(--dl-space-2); font-size: var(--dl-font-size-md); font-weight: 500; }
h4 { font-size: var(--dl-font-size-md); font-weight: 500; }
h4:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); border-radius: var(--dl-radius-sm); }
.account-security__count, .account-security__meta, .account-security__fingerprint, .account-security__recovery-key { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.account-security__muted, .account-security__meta { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.account-security__list { list-style: none; margin: 0; padding: 0; }
.account-security__list > li { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: flex-start; gap: var(--dl-space-3); padding-block: var(--dl-space-4); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.account-security__list > li > .dl-icon { flex: none; margin-block-start: var(--dl-space-1); color: var(--dl-text-secondary); }
.account-security__passkey-body { flex: 1; min-inline-size: 0; display: grid; gap: var(--dl-space-2); }
.account-security__passkey-name { overflow-wrap: anywhere; }
.account-security__chips { display: flex; flex-wrap: wrap; gap: var(--dl-space-1); }
.account-security__chip, .account-security__chips span { padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.account-security__chips span[data-unlock='true'] { color: var(--dl-success); }
.account-security__meta { display: flex; flex-wrap: wrap; gap: var(--dl-space-1) var(--dl-space-3); }
.account-security__menu-wrap { position: relative; flex: none; }
.account-security__menu { position: absolute; inset-inline-end: 0; inset-block-start: 100%; z-index: var(--dl-z-overlay); inline-size: max-content; max-inline-size: calc(100vw - 2 * var(--dl-space-6)); padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-md); }
button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); min-inline-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); text-align: left; }
button:hover { background: var(--dl-bg-hover); }
button:focus-visible, summary:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
button:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); cursor: not-allowed; transform: none; }
.account-security__icon-button { padding: 0; }
.account-security__danger { color: var(--dl-error); }
.account-security__flow { display: grid; gap: var(--dl-space-3); padding-block: var(--dl-space-4); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.account-security__actions { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); }
.account-security__details { border-block-start: var(--dl-border-width) solid var(--dl-border-base); padding-block: var(--dl-space-3); }
summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); border-radius: var(--dl-radius-md); cursor: pointer; }
summary::marker { color: var(--dl-text-secondary); }
.account-security__fingerprint, .account-security__recovery-key { display: block; padding: var(--dl-space-3); background: var(--dl-bg-sunken); border-radius: var(--dl-radius-md); }
.account-security__recovery-key { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.account-security__empty { padding-block: var(--dl-space-4); color: var(--dl-text-secondary); }
.account-security__notice { color: var(--dl-success); }
.account-security__confirm { inline-size: min(var(--dl-measure), calc(100vw - 2 * var(--dl-space-6))); max-block-size: calc(100dvh - 2 * var(--dl-space-6)); padding: var(--dl-space-6); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); color: var(--dl-text-primary); font: inherit; line-height: var(--dl-line-body); }
.account-security__confirm[open] { display: grid; gap: var(--dl-space-3); }
.account-security__confirm p { overflow-wrap: anywhere; }
@media (min-width: 768px) {
  .account-security__passkey-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-2) var(--dl-space-3); }
  .account-security__passkey-top .account-security__chips { flex: none; }
}
@media (prefers-reduced-motion: reduce) { button:active { transform: none; } }
</style>
