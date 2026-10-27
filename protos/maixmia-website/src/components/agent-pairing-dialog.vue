<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { PairingSession } from '../contracts/generated/pairing-session'
import { cancelPairing, confirmPairing, connectPairingLink, getPairingSession, requestPairingApproval, submitPairingCode, unlockIdentityVault } from '../api/workspace'
import { useI18n } from '../i18n'
import MockAgentPanel from './mock-agent-panel.vue'
import MockPasskeyStep from './mock-passkey-step.vue'
import './identity-flow.css'

const props = defineProps<{ open: boolean; sessionId: string; linkSecret: string; rePair: boolean }>()
const emit = defineEmits<{ cancel: []; manual: []; added: [agent: AgentSummary, details: boolean]; link: [id: string, secret: string] }>()
const { t, locale } = useI18n()
const copy = computed(() => t.value.workspace.security)
function formatTime(value: string, empty = '—'): string {
  if (value === '') return empty
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return empty
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const dialog = ref<HTMLDialogElement | null>(null)
const returnFocus = ref<HTMLElement | null>(null)
const pairing = ref<PairingSession | null>(null)
const code = ref('')
const isBusy = ref(false)
const isConnecting = ref(false)
const error = ref('')
const name = ref('')
const note = ref('')
const isSafetyMatched = ref(false)
const showPasskey = ref(false)
const showMock = ref(false)
const step = computed(() => pairing.value?.state === 'complete' ? 3 : pairing.value !== null && ['review', 'awaitingAgent'].includes(pairing.value.state) ? 2 : 1)
const statusLabel = computed(() => isConnecting.value ? copy.value.connecting : pairing.value?.state === 'awaitingAgent' ? copy.value.waiting : step.value === 3 ? copy.value.complete : step.value === 2 ? copy.value.stepReview : copy.value.stepFind)
const terminalError = computed(() => pairing.value?.state === 'denied' ? copy.value.agentDenied : pairing.value?.state === 'expired' ? copy.value.expired : pairing.value?.state === 'error' ? copy.value.networkError : '')
let timer: ReturnType<typeof setTimeout> | undefined
let requestVersion = 0
let isAlive = true
watch(() => pairing.value?.state, async (state, previous) => {
  if (state === previous || (state !== 'review' && state !== 'complete')) return
  await nextTick()
  if (dialog.value === null || !props.open) return
  dialog.value.scrollTop = 0
  const target = state === 'complete' ? dialog.value.querySelector<HTMLElement>('[data-testid="pairing-name"]') : dialog.value.querySelector<HTMLElement>('#agent-pairing-title')
  target?.focus({ preventScroll: true })
})
function normalizeCode(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  error.value = ''
  const raw = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
  code.value = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw
  event.target.value = code.value
}
function restartInvitation(): void {
  requestVersion += 1
  clearTimeout(timer)
  error.value = ''
  pairing.value = null
  code.value = ''
  isBusy.value = false
  isConnecting.value = false
  isSafetyMatched.value = false
  showPasskey.value = false
  emit('manual')
}
function accept(session: PairingSession): void {
  const previousState = pairing.value?.state
  pairing.value = session
  // 只在首次进入完成步骤时预填,后续轮询不得覆盖用户已经编辑的名称。
  if (session.state === 'complete' && previousState !== 'complete') name.value = session.agentName
}
async function poll(version: number): Promise<void> {
  const id = pairing.value?.id
  if (id === undefined || !props.open || version !== requestVersion || !isAlive) return
  const result = await getPairingSession(id)
  if (!props.open || version !== requestVersion || !isAlive) return
  if (!result.ok) { error.value = result.error.message; return }
  accept(result.value)
  if (result.value.state === 'review' || result.value.state === 'awaitingAgent') timer = setTimeout(() => { void poll(version) }, 600)
}
async function findAgent(): Promise<void> {
  if (isBusy.value || code.value.replace(/[\s-]/g, '').length !== 10) return
  requestVersion += 1
  const version = requestVersion
  clearTimeout(timer)
  isBusy.value = true
  isConnecting.value = true
  error.value = ''
  pairing.value = null
  const result = await submitPairingCode('', code.value)
  if (!props.open || version !== requestVersion || !isAlive) return
  isBusy.value = false
  isConnecting.value = false
  if (!result.ok) { error.value = result.error.message; return }
  accept(result.value)
  void poll(version)
}
async function connectLink(): Promise<void> {
  if (props.sessionId === '') return
  requestVersion += 1
  const version = requestVersion
  clearTimeout(timer)
  isBusy.value = true
  isConnecting.value = true
  error.value = ''
  pairing.value = null
  isSafetyMatched.value = false
  showPasskey.value = false
  const found = await getPairingSession(props.sessionId)
  if (!props.open || version !== requestVersion || !isAlive) return
  const result = found.ok ? await connectPairingLink(props.sessionId, props.linkSecret) : found
  if (!props.open || version !== requestVersion || !isAlive) return
  isBusy.value = false
  isConnecting.value = false
  if (!result.ok) { error.value = result.error.message; return }
  accept(result.value)
  void poll(version)
}
async function approve(): Promise<void> {
  if (!isSafetyMatched.value || pairing.value === null || isBusy.value) return
  isBusy.value = true
  error.value = ''
  // Web 端确认接管轮询,作废在途的 review 读取,避免并行轮询链。
  requestVersion += 1
  const version = requestVersion
  clearTimeout(timer)
  const verified = await unlockIdentityVault('passkey', '')
  if (!props.open || version !== requestVersion || !isAlive) return
  if (!verified.ok) { error.value = verified.error.message; isBusy.value = false; return }
  const result = await requestPairingApproval(pairing.value.id)
  if (!props.open || version !== requestVersion || !isAlive) return
  isBusy.value = false
  if (!result.ok) { error.value = result.error.message; return }
  showPasskey.value = false
  accept(result.value)
  clearTimeout(timer)
  void poll(version)
}
async function finish(details: boolean): Promise<void> {
  if (pairing.value === null || isBusy.value) return
  isBusy.value = true
  error.value = ''
  const result = await confirmPairing(pairing.value.id, name.value, note.value)
  isBusy.value = false
  if (!isAlive || !props.open) return
  if (!result.ok) { error.value = result.error.message; return }
  emit('added', result.value, details)
}
async function cancel(): Promise<void> {
  requestVersion += 1
  clearTimeout(timer)
  const id = pairing.value?.id ?? (props.sessionId || undefined)
  isBusy.value = true
  if (id !== undefined) await cancelPairing(id)
  isBusy.value = false
  if (!isAlive) return
  dialog.value?.close()
  if (returnFocus.value?.isConnected) returnFocus.value.focus()
  emit('cancel')
}
watch(() => [props.open, props.sessionId, props.linkSecret], async () => {
  await nextTick()
  if (!isAlive) return
  if (!props.open) { requestVersion += 1; clearTimeout(timer); showMock.value = false; dialog.value?.close(); return }
  if (dialog.value?.open === false) {
    returnFocus.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
    pairing.value = null
    code.value = ''
    name.value = ''
    note.value = ''
    error.value = ''
    showPasskey.value = false
    isSafetyMatched.value = false
    showMock.value = false
    isBusy.value = false
    isConnecting.value = false
    await nextTick()
    dialog.value.showModal()
    dialog.value.querySelector<HTMLElement>('[data-testid="pairing-code-input"]')?.focus()
  }
  if (props.sessionId !== '') await connectLink()
}, { immediate: true })
onBeforeUnmount(() => { isAlive = false; requestVersion += 1; clearTimeout(timer); dialog.value?.close() })
</script>

<template>
  <dialog ref="dialog" class="identity-flow" data-testid="agent-pairing-dialog" aria-modal="true" aria-labelledby="agent-pairing-title" @keydown.stop @cancel.prevent="cancel">
    <div class="identity-stack">
      <h2 id="agent-pairing-title" tabindex="-1">{{ copy.add }}</h2>
      <p v-if="rePair" class="identity-muted">{{ copy.rePairHint }}</p>
      <ol class="identity-steps" :aria-label="copy.add"><li :aria-current="step === 1 ? 'step' : undefined">{{ copy.stepFind }}</li><li :aria-current="step === 2 ? 'step' : undefined">{{ copy.stepReview }}</li><li :aria-current="step === 3 ? 'step' : undefined">{{ copy.stepComplete }}</li></ol>
      <p aria-live="polite" aria-atomic="true">{{ statusLabel }}</p>
      <p v-if="pairing === null" class="identity-muted">{{ copy.findHint }}</p>
      <form v-if="pairing === null && sessionId === '' && !isConnecting" class="identity-stack" @submit.prevent="findAgent">
        <h3>{{ copy.manualTitle }}</h3><p>{{ copy.manualHint }}</p>
        <label class="identity-field" for="pairing-code">{{ copy.codeLabel }}<input id="pairing-code" name="pairing-code" :value="code" data-testid="pairing-code-input" class="identity-input identity-mono" type="text" autocomplete="one-time-code" :spellcheck="false" maxlength="11" :disabled="isBusy" placeholder="XXXXX-XXXXX" @input="normalizeCode"></label>
        <p class="identity-warning">{{ copy.codeWarning }}</p>
        <button type="submit" class="identity-button identity-button--primary" :disabled="isBusy || code.replace(/[\s-]/g, '').length !== 10">{{ copy.submitCode }}</button>
      </form>
      <template v-if="pairing !== null && terminalError === ''">
        <section v-if="step === 2" class="identity-stack">
          <p v-if="pairing.alreadyTrusted" class="identity-box">{{ copy.alreadyTrusted }}</p>
          <h3>{{ pairing.agentName }}</h3>
          <dl class="identity-facts"><dt>{{ copy.device }} / {{ copy.platform }}</dt><dd>{{ pairing.deviceName }} · {{ pairing.platform }}</dd><dt>{{ copy.fingerprint }}</dt><dd class="identity-mono">{{ pairing.fingerprint }}</dd><dt>{{ copy.expires }}</dt><dd class="identity-mono" data-testid="pairing-expires">{{ formatTime(pairing.expiresAt) }}</dd></dl>
          <div class="identity-box"><h3>{{ copy.safetyCode }}</h3><p class="identity-code" data-testid="pairing-safety-code" :aria-label="`${copy.safetyCode}: ${pairing.safetyCode.split('').join(' ')}`">{{ pairing.safetyCode }}</p></div>
          <template v-if="pairing.state === 'review'">
            <label class="identity-check" for="pairing-safety-match"><input id="pairing-safety-match" name="pairing-safety-match" v-model="isSafetyMatched" type="checkbox" :disabled="isBusy">{{ copy.safetyMatch }}</label>
            <button class="identity-button identity-button--primary" type="button" :disabled="!isSafetyMatched || isBusy" @click="showPasskey = true">{{ copy.confirmPasskey }}</button>
            <MockPasskeyStep v-if="showPasskey" :busy="isBusy" test-id="mock-pairing-passkey" @confirm="approve" />
          </template>
          <p v-else class="identity-muted">{{ copy.waitingHint }}</p>
        </section>
        <form v-if="step === 3" class="identity-stack" @submit.prevent="finish(false)">
          <p>{{ copy.completeHint }}</p>
          <label class="identity-field" for="pairing-name">{{ copy.name }}<input id="pairing-name" name="agent-name" v-model="name" class="identity-input" maxlength="40" required :disabled="isBusy" data-testid="pairing-name"></label>
          <label class="identity-field" for="pairing-note">{{ copy.note }}<input id="pairing-note" name="agent-note" v-model="note" class="identity-input" maxlength="80" :disabled="isBusy"></label>
          <div class="identity-actions"><button type="submit" class="identity-button identity-button--primary" :disabled="isBusy || name.trim() === ''">{{ copy.finish }}</button><button type="button" class="identity-button" :disabled="isBusy || name.trim() === ''" @click="finish(true)">{{ copy.details }}</button></div>
        </form>
      </template>
      <div v-if="error !== '' || terminalError !== ''" class="identity-stack" role="alert"><p class="identity-error">{{ error || terminalError }}</p><button v-if="pairing === null && sessionId !== ''" type="button" class="identity-button" :disabled="isBusy" @click="connectLink">{{ copy.retry }}</button></div>
      <p v-if="isBusy && !isConnecting" role="status">{{ copy.busy }}</p>
      <button type="button" class="identity-button" :disabled="isBusy" @click="cancel">{{ copy.disconnect }}</button>
      <button type="button" class="identity-button" :aria-expanded="showMock" @click="showMock = !showMock">{{ copy.noAgent }}</button>
      <MockAgentPanel v-if="showMock" @generate="restartInvitation" @link="(id, secret) => emit('link', id, secret)" />
    </div>
  </dialog>
</template>
