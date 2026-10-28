<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { PairingSession } from '../contracts/generated/pairing-session'
import { cancelPairing, confirmPairing, connectPairingLink, getPairingSession, requestPairingApproval, submitPairingCode, unlockIdentityVault } from '../api/workspace'
import { useI18n } from '../i18n'
import MockAgentPanel from './mock-agent-panel.vue'
import MockPasskeyStep from './mock-passkey-step.vue'
import DliIcon from './dl-icon.vue'
import './identity-flow.css'
import './pairing-flow.css'

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
const stage = ref(1)
const isOpening = ref(false)
const isBackward = ref(false)
const mockKey = ref(0)
const mockPanel = ref<InstanceType<typeof MockAgentPanel> | null>(null)
const consoleTrigger = ref<HTMLButtonElement | null>(null)
const body = ref<HTMLElement | null>(null)
const now = ref(Date.now())
const flow = computed(() => copy.value.pairingFlow)
const stages = computed(() => [
  { number: 1, label: flow.value.connect, code: 'CONNECT', title: flow.value.connectTitle, hint: flow.value.connectHint, next: flow.value.connectNext },
  { number: 2, label: flow.value.verify, code: 'VERIFY', title: flow.value.verifyTitle, hint: flow.value.verifyHint, next: flow.value.verifyNext },
  { number: 3, label: flow.value.authorize, code: 'AUTHORIZE', title: flow.value.authorizeTitle, hint: flow.value.authorizeHint, next: flow.value.authorizeNext },
  { number: 4, label: flow.value.name, code: 'NAME', title: flow.value.nameTitle, hint: flow.value.nameHint, next: '' },
])
const currentStage = computed(() => stages.value.find((item) => item.number === stage.value))
const terminalError = computed(() => pairing.value?.state === 'denied' ? copy.value.agentDenied : pairing.value?.state === 'expired' ? copy.value.expired : pairing.value?.state === 'error' ? copy.value.networkError : '')
const hasError = computed(() => error.value !== '' || terminalError.value !== '')
// 阶段切换交给标题焦点，错误只交给 alert；这里播报同一阶段内的异步进展与 console 操作反馈。
const consoleNotice = ref('')
const statusLabel = computed(() => {
  if (hasError.value) return ''
  if (isConnecting.value) return copy.value.connecting
  if (isBusy.value) return copy.value.busy
  if (consoleNotice.value !== '') return consoleNotice.value
  const state = pairing.value?.state
  if (state === 'review') return flow.value.reviewLive
  if (state === 'awaitingAgent') return copy.value.waiting
  if (state === 'complete') return copy.value.complete
  return ''
})
const ttl = computed(() => {
  if (pairing.value === null || pairing.value.state === 'complete') return '—'
  const seconds = Math.max(0, Math.ceil((Date.parse(pairing.value.expiresAt) - now.value) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})
// 原始状态串只在代码里用；telemetry 给人看，awaitingAgent 必须有可读间隔。
function stateCode(state: PairingSession['state']): string {
  return state === 'awaitingAgent' ? 'AWAITING AGENT' : state.toUpperCase()
}
const telemetryState = computed(() => {
  if (hasError.value) return pairing.value === null || pairing.value.state === 'review' ? 'ERROR' : stateCode(pairing.value.state)
  if (isConnecting.value) return 'CONNECTING'
  return stateCode(pairing.value?.state ?? 'waiting')
})
let timer: ReturnType<typeof setTimeout> | undefined
let requestVersion = 0
let isAlive = true
// 只有服务端状态推进阶段；失败保持现场，恢复入口显式回到连接阶段。
watch(() => pairing.value?.state, (state) => {
  if (state === 'review') moveToStage(2)
  else if (state === 'awaitingAgent') moveToStage(3)
  else if (state === 'complete') moveToStage(4)
})
function moveToStage(next: number): void {
  if (next !== 1) isOpening.value = false
  isBackward.value = next < stage.value
  stage.value = next
  // 上一阶段的复制 / 失败提示不得压住新阶段的播报。
  consoleNotice.value = ''
}
function focusStage(): void {
  if (!props.open || dialog.value === null) return
  if (body.value !== null) body.value.scrollTop = 0
  const selector = stage.value === 4 ? '[data-testid="pairing-name"]' : stage.value === 1 && isOpening.value && props.sessionId === '' ? '[data-testid="pairing-code-input"]' : '#pairing-stage-title'
  dialog.value.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
  isOpening.value = false
}
async function toggleConsole(open: boolean): Promise<void> {
  showMock.value = open
  await nextTick()
  if (open) dialog.value?.querySelector<HTMLElement>('#mock-agent-title')?.focus()
  else consoleTrigger.value?.focus()
}
// Passkey 面板替换主按钮后，焦点必须跟着落到新主按钮，不能回到 BODY。
async function openPasskey(): Promise<void> {
  showPasskey.value = true
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('[data-testid="mock-pairing-passkey"]')?.focus()
}
async function closePasskey(): Promise<void> {
  showPasskey.value = false
  await nextTick()
  dialog.value?.querySelector<HTMLElement>('#pairing-safety-match')?.focus()
}
async function restart(): Promise<void> {
  await toggleConsole(true)
  await mockPanel.value?.generate()
}
watch(() => props.open, (open, _previous, onCleanup) => {
  if (!open) return
  now.value = Date.now()
  // 时钟只更新 TTL，不驱动流程推进。
  const clock = setInterval(() => { now.value = Date.now() }, 1000)
  onCleanup(() => clearInterval(clock))
}, { immediate: true })
function normalizeCode(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  error.value = ''
  const raw = event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
  code.value = raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw
  event.target.value = code.value
}
function restartInvitation(): void {
  isOpening.value = false
  moveToStage(1)
  consoleNotice.value = ''
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
  if (id === undefined || !props.open || version !== requestVersion || !isAlive || !['review', 'awaitingAgent'].includes(pairing.value?.state ?? '')) return
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
  moveToStage(1)
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
  if (!result.ok) {
    if (found.ok && ['denied', 'expired', 'error'].includes(found.value.state)) accept(found.value)
    error.value = result.error.message
    return
  }
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
    moveToStage(1)
    isOpening.value = true
    mockKey.value += 1
    consoleNotice.value = ''
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
  <dialog ref="dialog" class="identity-flow pairing-flow dl-modal-scrim" :class="{ 'is-console-open': showMock, 'is-backward': isBackward }" data-testid="agent-pairing-dialog" aria-modal="true" aria-labelledby="agent-pairing-title" @keydown.stop @cancel.prevent="cancel">
    <header class="pairing-flow__header">
      <div class="pairing-flow__eyebrow" aria-hidden="true"><span>AGENT PAIRING</span><span>STEP {{ String(stage).padStart(2, '0') }} / 04 · {{ currentStage?.code }}</span></div>
      <h2 id="agent-pairing-title">{{ copy.add }}</h2>
      <ol class="identity-steps pairing-flow__steps" :aria-label="copy.add">
        <li v-for="item in stages" :key="item.number" :aria-current="stage === item.number ? 'step' : undefined" :class="{ 'is-done': item.number < stage, 'is-current': item.number === stage, 'is-error': item.number === stage && hasError }">
          <span class="pairing-flow__track" aria-hidden="true"></span>
          <span class="pairing-flow__step-caption">
            <span class="identity-mono">{{ String(item.number).padStart(2, '0') }}</span><span>{{ item.label }}</span>
            <span class="pairing-flow__step-status">
              <DliIcon v-if="item.number === stage && hasError" name="alert" size="sm" />
              <DliIcon v-else-if="item.number < stage" name="check" size="sm" />
              <span v-else-if="item.number === stage" class="pairing-flow__pulse" aria-hidden="true"></span>
              <span class="pairing-flow__sr-only">{{ item.number === stage && hasError ? flow.failed : item.number < stage ? flow.done : item.number > stage ? flow.pending : '' }}</span>
            </span>
          </span>
        </li>
      </ol>
      <div class="pairing-flow__telemetry" aria-hidden="true"><span>CHANNEL {{ sessionId !== '' ? 'ONE-TIME LINK' : 'PAIRING CODE' }}</span><span>TTL {{ ttl }}</span><span>STATE {{ telemetryState }}</span></div>
      <h3 id="pairing-stage-title" tabindex="-1">{{ currentStage?.title }}</h3>
    </header>
    <div ref="body" class="pairing-flow__body">
      <div class="pairing-flow__stage">
        <Transition name="pairing-stage" mode="out-in" @after-enter="focusStage">
          <section :key="stage" class="identity-stack pairing-flow__content" :aria-label="currentStage?.title">
            <p class="pairing-flow__intro">{{ currentStage?.hint }}</p>
            <div v-if="hasError" class="identity-stack pairing-flow__error" role="alert">
              <p class="identity-error"><DliIcon name="alert" size="sm" /> {{ error || terminalError }}</p>
              <button v-if="terminalError !== '' || (stage > 1 && error !== '')" type="button" class="identity-button" :disabled="isBusy" @click="restart">{{ flow.restart }}</button>
              <button v-else-if="pairing === null && sessionId !== '' && error !== ''" type="button" class="identity-button" :disabled="isBusy" @click="restart">{{ flow.restart }}</button>
            </div>
            <template v-if="stage === 1">
              <p v-if="rePair" class="identity-box">{{ copy.rePairHint }}</p>
              <p v-if="sessionId !== ''" class="identity-muted">{{ pairing === null && isConnecting ? flow.linkConnecting : copy.findHint }}</p>
              <form v-else class="identity-stack" @submit.prevent="findAgent">
                <label class="identity-field" for="pairing-code">{{ copy.codeLabel }}<input id="pairing-code" name="pairing-code" :value="code" data-testid="pairing-code-input" class="identity-input identity-mono" type="text" autocomplete="one-time-code" :spellcheck="false" maxlength="11" :disabled="isBusy" placeholder="XXXXX-XXXXX" :aria-invalid="error !== ''" aria-describedby="pairing-code-warning" @input="normalizeCode"></label>
                <p id="pairing-code-warning" class="identity-warning">{{ copy.codeWarning }}</p>
                <button type="submit" class="identity-button identity-button--primary" :disabled="isBusy || code.replace(/[\s-]/g, '').length !== 10">{{ copy.submitCode }}</button>
                <p v-if="isConnecting" class="identity-muted">{{ copy.connecting }}</p>
              </form>
            </template>
            <template v-if="stage === 2 && pairing !== null">
              <div class="identity-box pairing-flow__code-board">
                <div class="pairing-flow__code-label"><h4>{{ copy.safetyCode }}</h4><span>{{ flow.safetyIdentical }}</span></div>
                <p class="identity-code" data-testid="pairing-safety-code" :aria-label="`${copy.safetyCode}: ${pairing.safetyCode.split('').join(' ')}`">{{ pairing.safetyCode }}</p>
                <p class="identity-muted">{{ flow.safetyHint }}</p>
              </div>
              <p v-if="pairing.alreadyTrusted" class="identity-box">{{ copy.alreadyTrusted }}</p>
              <dl class="identity-facts pairing-flow__facts"><dt>{{ flow.agentName }}</dt><dd>{{ pairing.agentName }}</dd><dt>{{ copy.device }} / {{ copy.platform }}</dt><dd>{{ pairing.deviceName }} · {{ pairing.platform }}</dd><dt>{{ copy.expires }}</dt><dd class="identity-mono" data-testid="pairing-expires">{{ formatTime(pairing.expiresAt) }}</dd></dl>
              <template v-if="terminalError === ''">
                <template v-if="!showPasskey">
                  <label class="identity-check" for="pairing-safety-match"><input id="pairing-safety-match" name="pairing-safety-match" v-model="isSafetyMatched" type="checkbox" :disabled="isBusy">{{ copy.safetyMatch }}</label>
                  <button class="identity-button identity-button--primary" type="button" :disabled="!isSafetyMatched || isBusy" @click="openPasskey">{{ copy.confirmPasskey }}</button>
                </template>
                <template v-else>
                  <MockPasskeyStep :busy="isBusy" test-id="mock-pairing-passkey" @confirm="approve" />
                  <button type="button" class="identity-button pairing-flow__text-button" :disabled="isBusy" @click="closePasskey">{{ flow.back }}</button>
                </template>
              </template>
              <details class="pairing-flow__fingerprint"><summary>{{ copy.fingerprint }}</summary><p class="identity-mono">{{ pairing.fingerprint }}</p></details>
            </template>
            <template v-if="stage === 3 && pairing !== null">
              <div class="pairing-flow__handshake">
                <span><DliIcon name="check" />{{ copy.thisDevice }}</span>
                <span class="pairing-flow__handshake-line" aria-hidden="true"></span>
                <span><span v-if="!hasError" class="pairing-flow__pulse" aria-hidden="true"></span><DliIcon v-else name="alert" />Agent</span>
              </div>
              <p v-if="!hasError">{{ copy.waiting }}</p>
              <p class="identity-mono identity-muted">{{ flow.ttl }} · {{ ttl }}</p>
              <p class="identity-muted">{{ copy.waitingHint }}</p>
              <button v-if="!showMock" type="button" class="identity-button pairing-flow__text-button" @click="toggleConsole(true)">{{ flow.openConsole }}</button>
            </template>
            <form v-if="stage === 4 && pairing !== null" id="pairing-name-form" class="identity-stack" @submit.prevent="finish(false)">
              <ul class="pairing-flow__summary"><li v-for="label in [flow.matched, flow.passkeyConfirmed, flow.agentAllowed]" :key="label"><DliIcon name="check" size="sm" />{{ label }}</li></ul>
              <label class="identity-field" for="pairing-name">{{ copy.name }}<input id="pairing-name" name="agent-name" v-model="name" class="identity-input" maxlength="40" required :disabled="isBusy" data-testid="pairing-name"></label>
              <label class="identity-field" for="pairing-note">{{ copy.note }}<input id="pairing-note" name="agent-note" v-model="note" class="identity-input" maxlength="80" :disabled="isBusy"></label>
            </form>
            <p v-if="!hasError && currentStage?.next" class="pairing-flow__next">{{ currentStage.next }}</p>
          </section>
        </Transition>
      </div>
      <MockAgentPanel v-if="open" v-show="showMock" :key="mockKey" ref="mockPanel" id="pairing-demo-console" @collapse="toggleConsole(false)" @notice="consoleNotice = $event" @failure="error = $event" @generate="restartInvitation" @link="(id, secret) => emit('link', id, secret)" />
    </div>
    <footer class="pairing-flow__footer">
      <div class="identity-actions">
        <button v-if="stage === 4" type="submit" form="pairing-name-form" class="identity-button identity-button--primary pairing-flow__finish" :disabled="isBusy || name.trim() === ''">{{ copy.finish }}</button>
        <button v-if="stage === 4" type="button" class="identity-button" :disabled="isBusy || name.trim() === ''" @click="finish(true)">{{ copy.details }}</button>
        <button type="button" class="identity-button" :disabled="isBusy" @click="cancel">{{ copy.disconnect }}</button>
      </div>
      <button ref="consoleTrigger" type="button" class="identity-button pairing-flow__text-button" :aria-expanded="showMock" aria-controls="pairing-demo-console" @click="toggleConsole(!showMock)">{{ showMock ? flow.collapse : copy.noAgent }}</button>
    </footer>
    <p class="pairing-flow__sr-only" aria-live="polite" aria-atomic="true">{{ statusLabel }}</p>
  </dialog>
</template>
