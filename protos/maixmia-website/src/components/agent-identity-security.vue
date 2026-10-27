<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import { revokeAgent, unlockIdentityVault } from '../api/workspace'
import { useI18n } from '../i18n'
import MockPasskeyStep from './mock-passkey-step.vue'
import './identity-flow.css'

const props = defineProps<{ agent: AgentSummary }>()
const emit = defineEmits<{ updated: [agent: AgentSummary]; rePair: [] }>()
const { t, locale } = useI18n()
const copy = computed(() => t.value.workspace.security)
function formatTime(value: string, empty = '—'): string {
  if (value === '') return empty
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return empty
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const identity = computed(() => props.agent.identity)
const showCode = ref(false)
const isVerified = ref(false)
const revokeStep = ref<'closed' | 'confirm' | 'passkey'>('closed')
const isBusy = ref(false)
const error = ref('')
const notice = ref('')
async function copyFingerprint(): Promise<void> {
  try { await navigator.clipboard.writeText(identity.value.fingerprint); notice.value = copy.value.copied }
  catch { notice.value = copy.value.copyFailed }
}
async function revoke(): Promise<void> {
  if (isBusy.value) return
  isBusy.value = true
  error.value = ''
  const unlocked = await unlockIdentityVault('passkey', '')
  if (!unlocked.ok) { error.value = unlocked.error.message; isBusy.value = false; return }
  const result = await revokeAgent(props.agent.id)
  isBusy.value = false
  if (!result.ok) { error.value = result.error.message; return }
  revokeStep.value = 'closed'
  emit('updated', result.value)
  notice.value = copy.value.revoked
}
</script>

<template>
  <section class="identity-stack" data-testid="agent-identity-security">
    <div class="identity-actions"><h3>{{ copy[identity.trustState] }}</h3><span v-if="agent.builtIn" class="identity-muted">{{ t.workspace.agentAdmin.builtIn }}</span></div>
    <section v-if="identity.trustState !== 'trusted'" class="identity-box" role="alert"><p class="identity-warning">{{ copy.trustWarning }}</p><button type="button" class="identity-button" data-testid="agent-re-pair" @click="emit('rePair')">{{ copy.rePair }}</button></section>
    <dl class="identity-facts">
      <dt>{{ copy.fingerprint }}</dt><dd class="identity-mono">{{ identity.fingerprint }}</dd>
      <dt>{{ copy.device }} / {{ copy.platform }}</dt><dd>{{ identity.deviceName }} · {{ identity.platform }}</dd>
      <dt>{{ copy.pairedAt }}</dt><dd class="identity-mono" data-testid="agent-paired-at">{{ formatTime(identity.pairedAt) }}</dd>
      <dt>{{ copy.lastSeen }}</dt><dd class="identity-mono" data-testid="agent-last-seen">{{ formatTime(identity.lastSeenAt) }}</dd>
      <dt>{{ copy.version }}</dt><dd class="identity-mono">{{ identity.keyVersion }}</dd>
    </dl>
    <button type="button" class="identity-button" @click="copyFingerprint">{{ copy.copyFingerprint }}</button>
    <section class="identity-box"><h3>{{ copy.trustRecord }}</h3><dl class="identity-facts"><dt>{{ copy.recordId }}</dt><dd class="identity-mono">{{ identity.trustRecordId }}</dd><dt>{{ copy.logIndex }}</dt><dd class="identity-mono">#{{ identity.trustLogIndex }}</dd><dt>{{ copy.hash }}</dt><dd class="identity-mono">{{ identity.trustRecordHash }}</dd></dl><p>{{ copy.signed }}</p><p class="identity-muted">{{ copy.simulatedRecord }}</p></section>
    <section class="identity-box"><h3>{{ copy.safetyCode }}</h3><p class="identity-code" :aria-label="`${copy.safetyCode}: ${identity.safetyCode.split('').join(' ')}`">{{ identity.safetyCode }}</p><button type="button" class="identity-button" :aria-expanded="showCode" @click="showCode = !showCode">{{ copy.verify }}</button><template v-if="showCode"><p class="identity-code">{{ identity.safetyCode }}</p><label class="identity-check" for="agent-safety-verified"><input id="agent-safety-verified" name="agent-safety-verified" v-model="isVerified" type="checkbox">{{ copy.compared }}</label><p v-if="isVerified" role="status">{{ copy.verified }}</p></template></section>
    <section class="identity-box"><h3>{{ copy.browserMode }}</h3><p class="identity-muted">{{ copy.browserBoundary }}</p></section>
    <section v-if="identity.trustState !== 'revoked'" class="identity-stack">
      <button type="button" class="identity-button identity-button--danger" :disabled="isBusy" @click="revokeStep = 'confirm'">{{ copy.revoke }}</button>
      <section v-if="revokeStep !== 'closed'" class="identity-box"><p>{{ copy.revokeHint }}</p><div class="identity-actions"><button type="button" class="identity-button" :disabled="isBusy" @click="revokeStep = 'closed'">{{ copy.cancel }}</button><button v-if="revokeStep === 'confirm'" type="button" class="identity-button identity-button--danger" @click="revokeStep = 'passkey'">{{ copy.revokeConfirm }}</button></div><MockPasskeyStep v-if="revokeStep === 'passkey'" :busy="isBusy" test-id="mock-revoke-passkey" @confirm="revoke" /></section>
    </section>
    <p v-else>{{ copy.reconnectHint }}</p>
    <p v-if="error !== ''" role="alert" class="identity-error">{{ error }}</p><p v-if="notice !== ''" role="status">{{ notice }}</p>
  </section>
</template>
