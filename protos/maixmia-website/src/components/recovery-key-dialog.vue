<script setup lang="ts">
// 恢复密钥生成与一次性展示留在账户窗体内，通过显式返回结束流程。
import { nextTick, ref, watch } from 'vue'
import type { IdentityVault } from '../contracts/generated/identity-vault'
import type { RecoveryKeyReveal } from '../contracts/generated/recovery-key-reveal'
import { regenerateRecoveryKey } from '../api/workspace'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{ open: boolean; configured: boolean }>()
const emit = defineEmits<{ close: []; updated: [vault: IdentityVault] }>()
const { t } = useI18n()
const copy = () => t.value.workspace.settings
const heading = ref<HTMLElement | null>(null)
const step = ref<'verify' | 'reveal'>('verify')
const reveal = ref<RecoveryKeyReveal | null>(null)
const acknowledged = ref(false)
const busy = ref(false)
const error = ref('')
const feedback = ref('')

async function focusTitle(): Promise<void> {
  await nextTick()
  heading.value?.focus({ preventScroll: true })
}

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  step.value = 'verify'
  reveal.value = null
  acknowledged.value = false
  busy.value = false
  error.value = ''
  feedback.value = ''
  await focusTitle()
}, { immediate: true })

function requestClose(): void {
  if (busy.value) return
  emit('close')
}

async function confirm(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const result = await regenerateRecoveryKey()
  busy.value = false
  if (!result.ok) { error.value = result.error.message; return }
  reveal.value = result.value
  emit('updated', result.value.vault)
  step.value = 'reveal'
  await focusTitle()
}

async function copyRecovery(): Promise<void> {
  if (reveal.value === null) return
  try {
    await navigator.clipboard.writeText(reveal.value.recoveryKey)
    error.value = ''
    feedback.value = copy().copied
  } catch {
    feedback.value = ''
    error.value = t.value.workspace.security.copyFailed
  }
}

function downloadRecovery(): void {
  if (reveal.value === null) return
  const url = URL.createObjectURL(new Blob([reveal.value.recoveryKey], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = copy().recoveryFileName
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="security-task" data-recovery-key-dialog aria-labelledby="recovery-key-title">
    <header class="security-task__header">
      <button type="button" class="security-task__back" data-security-subview-back :disabled="busy" @click="requestClose">← {{ copy().backToIdentitySecurity }}</button>
      <p class="security-task__eyebrow">{{ step === 'verify' ? `1 / 2 · ${copy().verifyIdentity}` : `2 / 2 · ${copy().saveRecoveryStep}` }}</p>
    </header>
    <div class="security-task__body">
      <h3 id="recovery-key-title" ref="heading" tabindex="-1">{{ step === 'verify' ? (configured ? copy().regenerateRecoveryKey : copy().generateRecoveryKey) : copy().recoveryRevealTitle }}</h3>
      <template v-if="step === 'verify'">
        <p>{{ copy().recoveryConfirmHint }}</p><p class="security-task__muted">{{ copy().passkeyVerifyHint }}</p>
        <p v-if="configured" role="alert" class="security-task__warning"><DliIcon name="alert" size="sm" /><span>{{ copy().recoveryReplaceWarning }}</span></p>
      </template>
      <template v-else>
        <p class="security-task__muted">{{ copy().recoveryRevealHint }}</p>
        <code class="security-task__recovery-key" data-recovery-key>{{ reveal?.recoveryKey.split('-').join(' · ') }}</code>
        <p class="security-task__muted">{{ copy().recoveryChangedHint }}</p>
        <p role="alert" class="security-task__warning"><DliIcon name="alert" size="sm" /><span>{{ copy().recoveryHintOnce }}</span></p>
        <label class="security-task__acknowledge"><input v-model="acknowledged" type="checkbox" name="recovery-saved">{{ copy().recoverySaved }}</label>
      </template>
      <p v-if="error !== ''" role="alert" class="security-task__error">{{ error }}</p>
      <p v-if="feedback !== ''" role="status" class="security-task__feedback">{{ feedback }}</p>
    </div>
    <footer class="security-task__footer">
      <template v-if="step === 'verify'"><button type="button" class="security-task__secondary" :disabled="busy" @click="requestClose">{{ copy().backToIdentitySecurity }}</button><button type="button" class="security-task__primary" data-settings-recovery-confirm :disabled="busy" @click="confirm">{{ busy ? copy().busy : t.workspace.security.mockSuccess }}</button></template>
      <template v-else><button type="button" class="security-task__secondary" @click="copyRecovery">{{ copy().copy }}</button><button type="button" class="security-task__secondary" data-download-recovery @click="downloadRecovery">{{ copy().downloadTxt }}</button><button type="button" class="security-task__primary" data-recovery-finish :disabled="!acknowledged" @click="requestClose">{{ copy().finish }}</button></template>
    </footer>
  </section>
</template>

<style scoped>
.security-task { min-block-size: 100%; display: flex; flex-direction: column; gap: var(--dl-space-4); }
.security-task__header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-3); }
.security-task__eyebrow { color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.security-task__body { flex: 1; display: grid; gap: var(--dl-space-3); align-content: start; }
h3 { inline-size: fit-content; max-inline-size: 100%; font-size: var(--dl-font-size-xl); font-weight: 500; line-height: var(--dl-line-snug); }
h3:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); border-radius: var(--dl-radius-sm); }
.security-task__muted { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.security-task__warning { display: flex; align-items: flex-start; gap: var(--dl-space-2); color: var(--dl-warning); font-size: var(--dl-font-size-sm); }
.security-task__error { color: var(--dl-error); }
.security-task__recovery-key { display: block; padding: var(--dl-space-3); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-sm); overflow-wrap: anywhere; }
.security-task__acknowledge { display: flex; align-items: center; gap: var(--dl-space-3); min-block-size: var(--dl-target-size); cursor: pointer; }
.security-task__acknowledge input { inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); margin: 0; accent-color: var(--dl-accent); }
.security-task__acknowledge input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.security-task__feedback { color: var(--dl-success); }
.security-task__footer { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); padding-block-start: var(--dl-space-4); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); }
.security-task__primary { background: var(--dl-accent); color: var(--dl-text-on-accent); border-color: var(--dl-accent); }
.security-task__back { padding-inline-start: 0; border-color: transparent; }
button:hover { background: var(--dl-bg-hover); }
.security-task__primary:hover { background: var(--dl-accent-hover); }
button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
button:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); border-color: var(--dl-border-base); cursor: not-allowed; transform: none; }
.security-task__primary:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); border-color: var(--dl-border-base); }
@media (prefers-reduced-motion: reduce) { button:active { transform: none; } }
</style>
