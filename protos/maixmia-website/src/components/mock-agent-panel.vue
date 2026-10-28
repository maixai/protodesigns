<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PairingSession } from '../contracts/generated/pairing-session'
import { allowPairing, createMockPairingSession, denyPairing, expireMockPairing, getIdentityVault, getPairingSession } from '../api/workspace'
import { mockAgentPairingCode, mockAgentPairingSecret } from '../mocks/pairing'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const emit = defineEmits<{ generate: []; collapse: []; notice: [message: string]; failure: [message: string]; link: [sessionId: string, secret: string] }>()
const { t } = useI18n()
const copy = computed(() => t.value.workspace.security)
const mode = ref<'new' | 'existing'>('new')
const invitation = ref<PairingSession | null>(null)
const userFingerprint = ref('')
const isBusy = ref(false)
const notice = ref('')
const code = computed(() => mockAgentPairingCode(invitation.value?.id ?? ''))
const groupedCode = computed(() => `${code.value.slice(0, 5)}-${code.value.slice(5)}`)
const secret = computed(() => mockAgentPairingSecret(invitation.value?.id ?? ''))
const isLiveState = computed(() => invitation.value !== null && ['waiting', 'review', 'awaitingAgent'].includes(invitation.value.state))
// 配对成功后链接与配对码即失效；失败 / 过期态仍保留它们，原型里要靠「打开链接」演示错误回归。
const isComplete = computed(() => invitation.value?.state === 'complete')
const statusText = computed(() => {
  const state = invitation.value?.state
  return state === 'awaitingAgent' ? copy.value.agentConnected
    : state === 'complete' ? copy.value.allowed
      : state === 'denied' ? copy.value.denied
        : state === 'expired' ? copy.value.expired
          : state === 'error' ? copy.value.networkError
            : state === 'review' ? copy.value.pairingFlow.reviewConnected
              : copy.value.agentWaiting
})
const link = computed(() => {
  const params = new URLSearchParams({ pair: invitation.value?.id ?? '', secret: secret.value })
  return `${window.location.origin}${window.location.pathname}#/workspace?${params}`
})
let timer: ReturnType<typeof setTimeout> | undefined
let isAlive = true
let generation = 0
async function poll(version: number): Promise<void> {
  const id = invitation.value?.id
  if (id === undefined || !isAlive || version !== generation) return
  const result = await getPairingSession(id)
  if (!isAlive || version !== generation) return
  if (result.ok) invitation.value = result.value
  else emit('failure', result.error.message)
  if (!['complete', 'denied', 'expired', 'error'].includes(invitation.value?.state ?? '')) timer = setTimeout(() => { void poll(version) }, 600)
}
async function generate(): Promise<void> {
  if (isBusy.value) return
  isBusy.value = true
  emit('failure', '')
  notice.value = ''
  emit('notice', '')
  invitation.value = null
  userFingerprint.value = ''
  emit('generate')
  generation += 1
  const version = generation
  clearTimeout(timer)
  const [result, vault] = await Promise.all([createMockPairingSession(mode.value), getIdentityVault()])
  isBusy.value = false
  if (!isAlive || version !== generation) return
  if (!result.ok) { emit('failure', result.error.message); return }
  invitation.value = result.value
  userFingerprint.value = vault.ok ? vault.value.fingerprint : ''
  void poll(version)
}
async function respond(allow: boolean): Promise<void> {
  if (invitation.value === null || isBusy.value) return
  isBusy.value = true
  const result = allow ? await allowPairing(invitation.value.id) : await denyPairing(invitation.value.id)
  isBusy.value = false
  if (!result.ok) { emit('failure', result.error.message); return }
  invitation.value = result.value
}
async function expire(networkFailure = false): Promise<void> {
  if (invitation.value === null) return
  const result = await expireMockPairing(invitation.value.id, networkFailure)
  if (result.ok) invitation.value = result.value
  else emit('failure', result.error.message)
}
async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); notice.value = copy.value.copied }
  catch { notice.value = copy.value.copyFailed }
  emit('notice', notice.value)
}
defineExpose({ generate })
onBeforeUnmount(() => { isAlive = false; generation += 1; clearTimeout(timer) })
</script>

<template>
  <section class="identity-stack pairing-flow__console" data-testid="mock-agent-panel" :aria-label="copy.mockAgentTitle">
    <header class="pairing-flow__console-header">
      <p class="pairing-flow__eyebrow" aria-hidden="true">DEMO · AGENT SIDE</p>
      <h3 id="mock-agent-title" tabindex="-1">{{ copy.mockAgentTitle }}</h3>
      <button type="button" class="identity-button pairing-flow__text-button" :aria-label="copy.pairingFlow.collapse" @click="emit('collapse')"><DliIcon name="close" /></button>
    </header>
    <template v-if="invitation === null">
      <p class="identity-muted">{{ copy.mockAgentHint }}</p>
      <label class="identity-field" for="mock-agent-mode">{{ copy.pairingFlow.agentMode }}
        <select id="mock-agent-mode" name="mock-agent-mode" v-model="mode" class="identity-input" :disabled="isBusy"><option value="new">{{ copy.newAgent }}</option><option value="existing">{{ copy.existingAgent }}</option></select>
      </label>
      <button class="identity-button identity-button--primary" type="button" :disabled="isBusy" @click="generate">{{ isBusy ? copy.busy : copy.generate }}</button>
      <p v-if="!isBusy" class="identity-muted">{{ copy.noInvitation }}</p>
    </template>
    <template v-else>
      <p class="pairing-flow__console-status">
        <span v-if="isLiveState" class="pairing-flow__pulse" aria-hidden="true"></span>
        <DliIcon v-else-if="invitation.state === 'complete'" name="check" size="sm" class="is-success" />
        <DliIcon v-else name="alert" size="sm" />
        <span>{{ statusText }}</span>
      </p>
      <section v-if="invitation.state !== 'waiting'" class="identity-box pairing-flow__code-board"><h4>{{ copy.safetyCode }}</h4><p class="identity-code" :aria-label="`${copy.safetyCode}: ${invitation.safetyCode.split('').join(' ')}`">{{ invitation.safetyCode }}</p></section>
      <template v-if="invitation.state === 'awaitingAgent'">
        <p class="identity-muted">{{ copy.pairingFlow.demoAllow }}</p>
        <div class="identity-actions"><button type="button" class="identity-button identity-button--primary" data-testid="mock-agent-allow" :disabled="isBusy" @click="respond(true)">{{ copy.allow }}</button><button type="button" class="identity-button identity-button--danger" data-testid="mock-agent-deny" :disabled="isBusy" @click="respond(false)">{{ copy.deny }}</button></div>
        <details class="pairing-flow__fingerprint"><summary>{{ copy.userFingerprint }}</summary><p class="identity-mono">{{ userFingerprint }}</p></details>
      </template>
      <template v-if="!isComplete">
        <label class="identity-field" for="mock-agent-link">{{ copy.link }}<input id="mock-agent-link" name="mock-agent-link" :value="link" class="identity-input identity-mono" readonly data-testid="mock-agent-link"></label>
        <div class="identity-actions"><button type="button" class="identity-button" @click="copyText(link)">{{ copy.copyLink }}</button><button type="button" class="identity-button identity-button--primary" data-testid="mock-agent-open-link" @click="emit('link', invitation.id, secret)">{{ copy.openLink }}</button></div>
        <p v-if="notice !== ''">{{ notice }}</p>
        <label class="identity-field" for="mock-agent-code">{{ copy.codeLabel }}<input id="mock-agent-code" name="mock-agent-code" :value="groupedCode" class="identity-input identity-mono" data-testid="mock-agent-code" readonly></label>
        <button type="button" class="identity-button" @click="copyText(groupedCode)">{{ copy.copyCode }}</button>
      </template>
      <button v-if="!isComplete" type="button" class="identity-button" :disabled="isBusy" @click="generate">{{ isBusy ? copy.busy : copy.generate }}</button>
      <div v-if="!isComplete" class="identity-actions pairing-flow__console-tests"><button type="button" class="identity-button" :disabled="isBusy" @click="expire(false)">{{ copy.expireDemo }}</button><button type="button" class="identity-button" :disabled="isBusy" @click="expire(true)">{{ copy.networkDemo }}</button></div>
    </template>
    <p v-if="notice !== '' && invitation === null">{{ notice }}</p>
  </section>
</template>
