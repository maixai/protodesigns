<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { IdentityVault } from '../contracts/generated/identity-vault'
import { useI18n } from '../i18n'
import { DEMO_RECOVERY_KEY } from '../mocks/identity'
import './identity-gate.css'

const props = defineProps<{
  vault: IdentityVault | null
  view: 'loading' | 'gate' | 'success' | 'error' | 'exiting'
  isBusy: boolean
  error: string
}>()
const emit = defineEmits<{
  passkey: []
  recovery: [secret: string]
  reset: []
  retry: []
  back: []
  'sign-out': []
}>()
const { t } = useI18n()
const copy = computed(() => t.value.workspace.security)
const mode = ref<'idle' | 'passkey' | 'recovery' | 'reset'>('idle')
const secret = ref('')
const isAcknowledged = ref(false)
const heading = ref<HTMLHeadingElement | null>(null)
const resetConfirm = ref<HTMLButtonElement | null>(null)
watch(isAcknowledged, async (isChecked) => {
  if (!isChecked) return
  await nextTick()
  // 短视口确认后将下一步带入滚动区，不移动键盘焦点。
  resetConfirm.value?.scrollIntoView({ block: 'nearest' })
})
const state = computed(() => props.view === 'exiting' ? 'success' : props.view === 'gate' ? mode.value : props.view)
const glyph = computed(() => state.value === 'success' ? 'check' : state.value === 'error' || state.value === 'reset' ? 'warning' : state.value === 'recovery' ? 'key' : state.value === 'passkey' ? 'fingerprint' : 'identity')
const isEntering = ref(true)
const isTransitioning = ref(false)
function retireState(element: Element): void {
  isTransitioning.value = true
  // 退场节点不再可操作；焦点暂存 modal，enter 完成后交给新标题。
  element.closest('dialog')?.focus({ preventScroll: true })
  element.setAttribute('inert', '')
  element.setAttribute('aria-hidden', 'true')
}
function enteredState(): void {
  isTransitioning.value = false
  void focusHeading()
}
const title = computed(() => {
  switch (state.value) {
    case 'loading': return copy.value.loading
    case 'passkey': return copy.value.gate.passkeyTitle
    case 'recovery': return copy.value.recovery
    case 'reset': return copy.value.reset
    case 'success': return copy.value.gate.successTitle
    case 'error': return copy.value.gate.errorTitle
    default: return copy.value.unlockTitle
  }
})
const description = computed(() => {
  switch (state.value) {
    case 'loading': return copy.value.gate.loadingHint
    case 'passkey': return copy.value.gate.passkeyHint
    case 'recovery': return copy.value.gate.recoveryHint
    case 'reset': return copy.value.gate.resetHint
    case 'success': return copy.value.gate.successHint
    case 'error': return copy.value.unavailable
    default: return props.vault?.passkeys.length === 0 ? copy.value.noPasskeys : copy.value.gate.unlockHint
  }
})
const footer = computed(() => copy.value.gate.footer
  .replace('{count}', props.vault === null ? '—' : String(props.vault.passkeys.length))
  .replace('{version}', props.vault === null ? '—' : String(props.vault.keyVersion)))
const fingerprint = computed(() => props.vault?.fingerprint.split(' ').slice(0, 5).join(' ') ?? '—')

function selectMode(next: typeof mode.value): void {
  if (props.isBusy || isTransitioning.value) return
  mode.value = next
  secret.value = ''
  isAcknowledged.value = false
  emit('back')
}
async function focusHeading(): Promise<void> {
  await nextTick()
  heading.value?.focus({ preventScroll: true })
  heading.value?.closest('.identity-gate__body')?.scrollTo({ top: 0 })
}
// 状态标题只在 enter 完成后接收焦点，不聚焦即将退场的节点。
watch(() => props.isBusy, async (isBusy) => {
  if (!isBusy) return
  await nextTick()
  // 全部控件暂时禁用时，浏览器会把焦点退回 body；仍将键盘留在安全步骤内。
  heading.value?.focus({ preventScroll: true })
})
onMounted(focusHeading)
</script>

<template>
  <div class="identity-gate__surface" :class="{ 'is-entering': isEntering, 'is-exiting': view === 'exiting' }" :data-state="view === 'exiting' ? 'exiting' : state">
    <div class="identity-gate__atmosphere" aria-hidden="true"><span /></div>
    <header class="identity-gate__header">
      <div class="identity-gate__brand" aria-label="Mia Identity">
        <span class="identity-gate__wordmark">Mia</span><span class="identity-gate__brand-dot" aria-hidden="true" />
        <span class="identity-gate__brand-label">IDENTITY</span>
      </div>
      <button class="identity-gate__text-button" type="button" :disabled="isBusy || state === 'success'" @click="emit('sign-out')">{{ copy.signOut }}</button>
    </header>

    <div class="identity-gate__body">
      <section class="identity-gate__content" :aria-busy="isBusy || view === 'loading'">
        <div class="identity-gate__hero" :class="{ 'is-loading': view === 'loading' || isBusy, 'is-verifying': isBusy, 'is-warning': glyph === 'warning' }" aria-hidden="true">
          <Transition name="gate-glyph">
          <svg :key="glyph" viewBox="0 0 48 48" fill="none" class="identity-gate__glyph" :class="{ 'is-success': glyph === 'check' }">
            <path v-if="glyph === 'check'" d="m12 25 8 8 17-18" />
            <g v-else-if="glyph === 'warning'"><path d="M24 13v15M24 34v1" /><circle cx="24" cy="24" r="18" /></g>
            <g v-else-if="glyph === 'key'"><circle cx="17" cy="18" r="9" /><circle cx="17" cy="18" r="2" /><path d="m23.5 24.5 15 15M31 32l5-5M35 36l5-5" /></g>
            <g v-else>
              <path d="M8 23v-2a16 16 0 0 1 32 0v5M12 32c2-4 2-7 2-11a10 10 0 0 1 20 0v8M19 37c4-5 5-10 5-16M8 30l-2 5M25 41c5-6 7-12 7-17" />
              <path d="M17 29c1-3 1-5 1-8a6 6 0 0 1 12 0M14 37l-2 3M37 32c-1 4-3 7-5 10" />
              <path v-if="mode !== 'passkey'" d="M35 10h9M40 10v4M44 10v3" />
            </g>
          </svg>
          </Transition>
        </div>
        <p class="identity-gate__eyebrow">{{ copy.gate.eyebrow }}</p>
        <div class="identity-gate__stage" aria-live="polite" aria-atomic="true">
        <Transition name="gate-state" mode="out-in" @before-leave="retireState" @after-enter="enteredState">
        <div :key="state" class="identity-gate__state" :class="{ 'is-initial': state === 'loading' }" :inert="isTransitioning">
        <div class="identity-gate__intro">
          <h2 id="identity-vault-title" ref="heading" tabindex="-1">{{ title }}</h2>
          <p id="identity-gate-description" :role="view === 'error' ? 'alert' : undefined">{{ description }}</p>
        </div>

        <div v-if="state === 'idle'" class="identity-gate__actions">
          <button type="button" class="identity-gate__primary" :disabled="isBusy || vault?.passkeys.length === 0" @click="selectMode('passkey')">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12v-1a8 8 0 0 1 16 0v3M7 16c1-2 1-4 1-5a4 4 0 0 1 8 0v3c0 3-1 5-2 7M12 11c0 5-1 7-3 10M4 17l-1 3M20 18l-1 3" /></svg>
            <span>{{ copy.passkeyUnlock }}</span>
            <svg class="identity-gate__arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
          </button>
          <ul class="identity-gate__trust" :aria-label="copy.gate.trustLabel">
            <li>{{ copy.gate.trustDevice }}</li><li>{{ copy.gate.trustLocal }}</li><li>{{ copy.gate.trustPrivate }}</li>
          </ul>
          <div class="identity-gate__secondary">
            <button type="button" class="identity-gate__text-button" @click="selectMode('recovery')">{{ copy.recovery }}</button>
            <span aria-hidden="true" />
            <button type="button" class="identity-gate__text-button" @click="selectMode('reset')">{{ copy.gate.help }}</button>
          </div>
        </div>

        <div v-else-if="state === 'passkey'" class="identity-gate__actions">
          <p class="identity-gate__demo"><span>{{ copy.demo }}</span>{{ copy.gate.demoHint }}</p>
          <button type="button" class="identity-gate__primary" data-testid="mock-passkey-unlock" :disabled="isBusy || isTransitioning" @click="emit('passkey')">{{ isBusy ? copy.gate.verifying : copy.gate.startVerification }}</button>
          <div class="identity-gate__progress" :class="{ 'is-busy': isBusy }" aria-hidden="true"><span /></div>
          <button type="button" class="identity-gate__text-button identity-gate__back" :disabled="isBusy || isTransitioning" @click="selectMode('idle')">{{ copy.cancel }}</button>
        </div>

        <form v-else-if="state === 'recovery'" class="identity-gate__actions" @submit.prevent="emit('recovery', secret)">
          <label class="identity-gate__field" for="identity-recovery-key">{{ copy.recoveryLabel }}
            <input id="identity-recovery-key" v-model="secret" class="identity-gate__input" name="recovery-key" data-testid="recovery-key-input" type="text" autocomplete="off" autocapitalize="off" :spellcheck="false" :disabled="isBusy || isTransitioning" :aria-invalid="error !== ''" :aria-describedby="error !== '' ? 'identity-gate-key-hint identity-gate-error' : 'identity-gate-key-hint'" @input="emit('back')">
          </label>
          <p id="identity-gate-key-hint" class="identity-gate__key-hint">{{ copy.recoveryHint }}<code>{{ DEMO_RECOVERY_KEY }}</code></p>
          <button class="identity-gate__primary" type="submit" :disabled="isBusy || secret.trim() === ''">{{ isBusy ? copy.unlocking : copy.unlock }}</button>
          <button class="identity-gate__text-button identity-gate__back" type="button" :disabled="isBusy || isTransitioning" @click="selectMode('idle')">{{ copy.gate.back }}</button>
        </form>

        <div v-else-if="state === 'reset'" class="identity-gate__actions">
          <ul class="identity-gate__consequences"><li>{{ copy.gate.resetAgents }}</li><li>{{ copy.gate.resetHistory }}</li><li>{{ copy.gate.resetIrreversible }}</li></ul>
          <label class="identity-gate__acknowledge" for="identity-reset-acknowledge"><input id="identity-reset-acknowledge" v-model="isAcknowledged" name="reset-acknowledge" type="checkbox" :disabled="isBusy || isTransitioning">{{ copy.gate.acknowledge }}</label>
          <button ref="resetConfirm" type="button" class="identity-gate__danger" data-testid="reset-identity-confirm" :disabled="isBusy || !isAcknowledged" @click="emit('reset')">{{ isBusy ? copy.busy : copy.resetConfirm }}</button>
          <button class="identity-gate__text-button identity-gate__back" type="button" :disabled="isBusy || isTransitioning" @click="selectMode('idle')">{{ copy.gate.back }}</button>
        </div>

        <div v-else-if="state === 'error'" class="identity-gate__actions">
          <button type="button" class="identity-gate__primary" @click="emit('retry')">{{ copy.retry }}</button>
          <button type="button" class="identity-gate__text-button identity-gate__back" @click="emit('sign-out')">{{ copy.signOut }}</button>
        </div>
        </div>
        </Transition>
        </div>
        <p v-if="error !== ''" id="identity-gate-error" class="identity-gate__error" role="alert">{{ error }}</p>
        <p v-if="isBusy" class="identity-gate__status" role="status">{{ mode === 'passkey' ? copy.gate.verifying : copy.busy }}</p>
      </section>
    </div>

    <footer class="identity-gate__footer" @animationend.self="isEntering = false">
      <span>{{ footer }}</span>
      <span v-if="vault !== null" class="identity-gate__fingerprint" :title="vault.fingerprint">{{ fingerprint }}…</span>
      <span>Ed25519 · AES-256-GCM</span>
    </footer>
  </div>
</template>
