<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { PairingSession } from '../contracts/generated/pairing-session'
import { allowPairing, createMockPairingSession, denyPairing, expireMockPairing, getIdentityVault, getPairingSession } from '../api/workspace'
import { mockAgentPairingCode, mockAgentPairingSecret } from '../mocks/pairing'
import { useI18n } from '../i18n'

const emit = defineEmits<{ generate: []; link: [sessionId: string, secret: string] }>()
const { t } = useI18n()
const copy = computed(() => t.value.workspace.security)
const mode = ref<'new' | 'existing'>('new')
const invitation = ref<PairingSession | null>(null)
const userFingerprint = ref('')
const isBusy = ref(false)
const error = ref('')
const notice = ref('')
const code = computed(() => mockAgentPairingCode(invitation.value?.id ?? ''))
const groupedCode = computed(() => `${code.value.slice(0, 5)}-${code.value.slice(5)}`)
const secret = computed(() => mockAgentPairingSecret(invitation.value?.id ?? ''))
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
  else error.value = result.error.message
  if (!['complete', 'denied', 'expired', 'error'].includes(invitation.value?.state ?? '')) timer = setTimeout(() => { void poll(version) }, 600)
}
async function generate(): Promise<void> {
  if (isBusy.value) return
  isBusy.value = true
  error.value = ''
  notice.value = ''
  invitation.value = null
  userFingerprint.value = ''
  emit('generate')
  generation += 1
  const version = generation
  clearTimeout(timer)
  const [result, vault] = await Promise.all([createMockPairingSession(mode.value), getIdentityVault()])
  isBusy.value = false
  if (!isAlive || version !== generation) return
  if (!result.ok) { error.value = result.error.message; return }
  invitation.value = result.value
  userFingerprint.value = vault.ok ? vault.value.fingerprint : ''
  void poll(version)
}
async function respond(allow: boolean): Promise<void> {
  if (invitation.value === null || isBusy.value) return
  isBusy.value = true
  const result = allow ? await allowPairing(invitation.value.id) : await denyPairing(invitation.value.id)
  isBusy.value = false
  if (!result.ok) { error.value = result.error.message; return }
  invitation.value = result.value
}
async function expire(networkFailure = false): Promise<void> {
  if (invitation.value === null) return
  const result = await expireMockPairing(invitation.value.id, networkFailure)
  if (result.ok) invitation.value = result.value
  else error.value = result.error.message
}
async function copyText(text: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); notice.value = copy.value.copied }
  catch { notice.value = copy.value.copyFailed }
}
onBeforeUnmount(() => { isAlive = false; generation += 1; clearTimeout(timer) })
</script>

<template>
  <section class="identity-stack identity-demo" data-testid="mock-agent-panel" :aria-label="copy.mockAgentTitle">
    <h3>{{ copy.mockAgentTitle }}</h3>
    <p class="identity-muted">{{ copy.mockAgentHint }}</p>
    <label class="identity-field" for="mock-agent-mode">{{ copy.demo }}
      <select id="mock-agent-mode" name="mock-agent-mode" v-model="mode" class="identity-input" :disabled="isBusy"><option value="new">{{ copy.newAgent }}</option><option value="existing">{{ copy.existingAgent }}</option></select>
    </label>
    <button class="identity-button" type="button" :disabled="isBusy" @click="generate">{{ isBusy ? copy.busy : copy.generate }}</button>
    <p v-if="invitation === null && !isBusy" class="identity-muted">{{ copy.noInvitation }}</p>
    <template v-if="invitation !== null">
      <label class="identity-field" for="mock-agent-link">{{ copy.link }}<input id="mock-agent-link" name="mock-agent-link" :value="link" class="identity-input identity-mono" readonly data-testid="mock-agent-link"></label>
      <div class="identity-actions"><button type="button" class="identity-button" @click="copyText(link)">{{ copy.copyLink }}</button><button type="button" class="identity-button identity-button--primary" data-testid="mock-agent-open-link" @click="emit('link', invitation.id, secret)">{{ copy.openLink }}</button></div>
      <div class="identity-qr" aria-hidden="true">▦</div><p class="identity-muted">{{ copy.qr }}</p>
      <label class="identity-field" for="mock-agent-code">{{ copy.codeLabel }}<input id="mock-agent-code" name="mock-agent-code" :value="groupedCode" class="identity-input identity-mono" data-testid="mock-agent-code" readonly></label>
      <button type="button" class="identity-button" @click="copyText(groupedCode)">{{ copy.copyCode }}</button>
      <p aria-live="polite">{{ invitation.state === 'awaitingAgent' ? copy.agentConnected : invitation.state === 'complete' ? copy.allowed : invitation.state === 'denied' ? copy.denied : invitation.state === 'expired' ? copy.expired : invitation.state === 'error' ? copy.networkError : copy.agentWaiting }}</p>
      <template v-if="invitation.state === 'awaitingAgent'">
        <p class="identity-muted">{{ copy.userFingerprint }}</p><p class="identity-mono">{{ userFingerprint }}</p>
        <div class="identity-actions"><button type="button" class="identity-button identity-button--primary" data-testid="mock-agent-allow" :disabled="isBusy" @click="respond(true)">{{ copy.allow }}</button><button type="button" class="identity-button identity-button--danger" data-testid="mock-agent-deny" :disabled="isBusy" @click="respond(false)">{{ copy.deny }}</button></div>
      </template>
      <section class="identity-box"><h3>{{ copy.safetyCode }}</h3><p class="identity-code" :aria-label="`${copy.safetyCode}: ${invitation.safetyCode.split('').join(' ')}`">{{ invitation.safetyCode }}</p></section>
      <div class="identity-actions"><button type="button" class="identity-button" :disabled="isBusy" @click="expire(false)">{{ copy.expireDemo }}</button><button type="button" class="identity-button" :disabled="isBusy" @click="expire(true)">{{ copy.networkDemo }}</button></div>
    </template>
    <p v-if="error !== ''" role="alert" class="identity-error">{{ error }}</p><p v-if="notice !== ''" role="status">{{ notice }}</p>
  </section>
</template>
