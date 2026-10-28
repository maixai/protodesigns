<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { IdentityVault } from '../contracts/generated/identity-vault'
import type { DeviceUnlockCapability } from '../contracts/generated/device-unlock-capability'
import { getDeviceUnlockCapability, getIdentityVault, lockIdentityVault, resetIdentity, unlockIdentityVault } from '../api/workspace'
import { identityAction } from '../auth/identity'
import { readIdentityVaultState } from '../mocks/identity'
import { waitForMotion } from '../auth/transition'
import { signOut } from '../auth/session'
import { useI18n } from '../i18n'
import IdentityGatePanel from './identity-gate-panel.vue'
import './identity-flow.css'

const emit = defineEmits<{ reset: []; unlocked: []; locked: []; revealing: []; announce: [text: string] }>()
const { t, locale } = useI18n()
const copy = computed(() => t.value.workspace.security)
function formatTime(value: string, empty = '—'): string {
  if (value === '') return empty
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return empty
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const dialog = ref<HTMLDialogElement | null>(null)
const vault = ref<IdentityVault | null>(null)
const capability = ref<DeviceUnlockCapability | null>(null)
// 区分「首次进入/刷新后的锁定」与用户主动点「锁定控制台」，后者要在 Gate 文案里说明。
const lockedByUser = ref(false)
const shouldOpenInitially = readIdentityVaultState() !== 'unlocked'
const view = ref<'loading' | 'gate' | 'security' | 'closed' | 'error' | 'success' | 'exiting'>('loading')
const method = ref<'choice' | 'reset'>('choice')
const SUCCESS_HOLD_MS = 700
let successTimer: ReturnType<typeof setTimeout> | undefined
const isBusy = ref(false)
const error = ref('')
const showStrict = ref(false)
const returnFocus = ref<HTMLElement | null>(null)
let isAlive = true
const isGate = computed(() => view.value !== 'security')
async function load(): Promise<void> {
  view.value = 'loading'
  error.value = ''
  const [result, capabilityResult] = await Promise.all([getIdentityVault(), getDeviceUnlockCapability()])
  if (!isAlive) return
  if (!result.ok || !capabilityResult.ok || result.value.state === 'unavailable') { view.value = 'error'; return }
  vault.value = result.value
  capability.value = capabilityResult.value
  view.value = result.value.state === 'locked' ? 'gate' : 'closed'
  if (view.value === 'closed') emit('unlocked')
}
watch(view, async (next) => {
  await nextTick()
  if (!isAlive) return
  if (next === 'closed') { dialog.value?.close(); if (returnFocus.value?.isConnected) returnFocus.value.focus(); return }
  if (next === 'loading' && !shouldOpenInitially && dialog.value?.open === false) return
  if (dialog.value?.open === false) {
    returnFocus.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.value.showModal()
    dialog.value.querySelector<HTMLElement>('#identity-vault-title')?.focus({ preventScroll: true })
    dialog.value.scrollTop = 0
  }
}, { immediate: true })
watch(identityAction, async (action) => {
  if (action === '') return
  identityAction.value = ''
  if (action === 'lock') { await lock(); return }
  method.value = 'choice'
  showStrict.value = false
  error.value = ''
  view.value = vault.value?.state === 'unlocked' ? 'security' : 'gate'
})
function finishGate(): void {
  view.value = 'success'
  // 成功反馈先于工作台与潜在配对弹窗，避免两个安全步骤叠在一起。
  clearTimeout(successTimer)
  successTimer = setTimeout(() => { void exitGate() }, SUCCESS_HOLD_MS)
}
async function exitGate(): Promise<void> {
  if (!isAlive) return
  view.value = 'exiting'
  emit('revealing')
  await nextTick()
  await waitForMotion(dialog.value?.querySelector<HTMLElement>('.identity-gate__surface') ?? null)
  if (!isAlive) return
  // 先撤销 modal，再交接焦点；不让原生 close 的焦点恢复覆盖工作台。
  view.value = 'closed'
  returnFocus.value = null
  dialog.value?.close()
  await nextTick()
  if (isAlive) emit('unlocked')
}
async function unlock(methodId: 'passkey' | 'recoveryKey', secret = ''): Promise<void> {
  if (isBusy.value || view.value !== 'gate') return
  isBusy.value = true
  error.value = ''
  const result = await unlockIdentityVault(methodId, secret)
  isBusy.value = false
  if (!isAlive) return
  if (!result.ok) { error.value = result.error.message; return }
  vault.value = result.value
  lockedByUser.value = false
  method.value = 'choice'
  finishGate()
}
async function lock(): Promise<void> {
  const result = await lockIdentityVault()
  if (!isAlive) return
  if (!result.ok) { error.value = result.error.message; return }
  vault.value = result.value
  const capabilityResult = await getDeviceUnlockCapability()
  if (capabilityResult.ok) capability.value = capabilityResult.value
  method.value = 'choice'
  error.value = ''
  view.value = 'gate'
  lockedByUser.value = true
  emit('locked')
}
async function reset(): Promise<void> {
  if (isBusy.value) return
  isBusy.value = true
  const result = await resetIdentity()
  isBusy.value = false
  if (!isAlive) return
  if (!result.ok) { error.value = result.error.message; return }
  vault.value = result.value
  lockedByUser.value = false
  method.value = 'choice'
  error.value = ''
  emit('reset')
  if (isGate.value) finishGate()
  else { view.value = 'closed'; emit('unlocked') }
  emit('announce', copy.value.resetDone)
}
function close(): void { if (!isGate.value && !isBusy.value) view.value = 'closed' }
function trapGateFocus(event: KeyboardEvent): void {
  if (!isGate.value || event.key !== 'Tab') return
  const controls = dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')
  const first = controls?.[0]
  const last = controls?.[controls.length - 1]
  if (first === undefined || last === undefined) { event.preventDefault(); return }
  // 原生 modal 隔离页面；额外闭合 Tab 循环，避免焦点绕到浏览器工具栏。
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
function selectMethod(next: 'reset'): void {
  method.value = next
  error.value = ''
  void nextTick(() => dialog.value?.querySelector<HTMLElement>('[data-step-focus], [data-testid="mock-passkey-unlock"]')?.focus())
}
onMounted(() => { void load() })
onBeforeUnmount(() => { isAlive = false; clearTimeout(successTimer); dialog.value?.close() })
</script>

<template>
  <dialog ref="dialog" tabindex="-1" :class="isGate ? 'identity-gate' : 'identity-flow dl-modal-scrim'" data-testid="identity-vault-dialog" aria-modal="true" aria-labelledby="identity-vault-title" :aria-describedby="isGate ? 'identity-gate-description' : undefined" @keydown.stop="trapGateFocus" @cancel.prevent="close">
    <IdentityGatePanel v-if="view === 'loading' || view === 'gate' || view === 'success' || view === 'exiting' || view === 'error'" :vault="vault" :capability="capability" :locked-by-user="lockedByUser" :view="view" :is-busy="isBusy" :error="error" @passkey="unlock('passkey')" @recovery="unlock('recoveryKey', $event)" @reset="reset" @retry="load" @back="error = ''" @sign-out="signOut" />
    <div v-else-if="view === 'security'" class="identity-stack">
      <h2 id="identity-vault-title" tabindex="-1">{{ copy.title }}</h2>
      <template v-if="vault !== null">
        <dl class="identity-facts">
          <dt>{{ copy.fingerprint }}</dt><dd class="identity-mono">{{ vault.fingerprint }}</dd>
          <dt>{{ copy.version }}</dt><dd class="identity-mono">{{ vault.keyVersion }}</dd>
        </dl>
        <section class="identity-stack">
          <h3>{{ copy.passkeys }}</h3>
          <p v-if="vault.passkeys.length === 0">{{ copy.noPasskeys }}</p>
          <article v-for="passkey in vault.passkeys" :key="passkey.id" class="identity-box">
            <h3>{{ passkey.label }}</h3>
            <p class="identity-muted">{{ copy.source }}: {{ passkey.label.split(' · ')[0] }} · {{ passkey.prfSupported ? copy.prf : copy.noPrf }} · {{ passkey.isThisDevice ? copy.thisDevice : copy.otherDevice }}</p>
            <p class="identity-muted">{{ copy.lastUsed }}: <span class="identity-mono" data-testid="passkey-last-used">{{ formatTime(passkey.lastUsedAt, copy.notUsed) }}</span></p>
          </article>
        </section>
        <p>{{ vault.recoveryKeyConfigured ? copy.recoveryConfigured : copy.recoveryMissing }}</p>
        <section class="identity-box"><h3>{{ copy.browserMode }}</h3><p class="identity-muted">{{ copy.browserBoundary }}</p><button type="button" class="identity-button" :aria-expanded="showStrict" @click="showStrict = !showStrict">{{ copy.strict }}</button><p v-if="showStrict" role="status">{{ copy.strictHint }}</p></section>
        <div class="identity-actions">
          <button type="button" class="identity-button" :disabled="isBusy" @click="lock">{{ copy.lock }}</button>
          <button type="button" class="identity-button identity-button--danger" :disabled="isBusy" @click="selectMethod('reset')">{{ copy.reset }}</button>
          <button type="button" class="identity-button" :disabled="isBusy" @click="close">{{ copy.close }}</button>
        </div>
      </template>
      <section v-if="method === 'reset'" class="identity-box">
        <h3>{{ copy.reset }}</h3><p class="identity-warning">{{ copy.resetHint }}</p>
        <div class="identity-actions">
          <button type="button" data-step-focus class="identity-button" :disabled="isBusy" @click="method = 'choice'">{{ copy.cancel }}</button>
          <button type="button" data-testid="reset-identity-confirm" class="identity-button identity-button--danger" :disabled="isBusy" @click="reset">{{ isBusy ? copy.busy : copy.resetConfirm }}</button>
        </div>
      </section>
      <p v-if="error !== ''" role="alert" class="identity-error">{{ error }}</p>
      <p v-if="isBusy" role="status">{{ copy.unlocking }}</p>
    </div>
  </dialog>
</template>
