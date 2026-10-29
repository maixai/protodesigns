<script setup lang="ts">
// 添加 Passkey 是账户窗体内的二级视图，不再创建第二层 dialog。
import { nextTick, ref, watch } from 'vue'
import type { IdentityVault } from '../contracts/generated/identity-vault'
import type { DeviceUnlockCapability } from '../contracts/generated/device-unlock-capability'
import { addPasskey } from '../api/workspace'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{ open: boolean; capability: DeviceUnlockCapability }>()
const emit = defineEmits<{ close: []; updated: [vault: IdentityVault] }>()
const { t } = useI18n()
const copy = () => t.value.workspace.settings
const heading = ref<HTMLElement | null>(null)
const step = ref<'intro' | 'verify' | 'success'>('intro')
const busy = ref(false)
const error = ref('')
const steps = ['intro', 'verify', 'success'] as const

async function focusTitle(): Promise<void> {
  await nextTick()
  heading.value?.focus({ preventScroll: true })
}

watch(() => props.open, async (isOpen) => {
  if (!isOpen) return
  step.value = 'intro'
  error.value = ''
  busy.value = false
  await focusTitle()
}, { immediate: true })

function requestClose(): void {
  if (busy.value) return
  emit('close')
}

async function create(): Promise<void> {
  if (!props.capability.prfAvailable) return
  step.value = 'verify'
  error.value = ''
  await focusTitle()
}

async function confirm(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const result = await addPasskey()
  busy.value = false
  if (!result.ok) { error.value = result.error.message; return }
  emit('updated', result.value)
  step.value = 'success'
  await focusTitle()
}
</script>

<template>
  <section class="security-task" data-add-passkey-dialog aria-labelledby="add-passkey-title">
    <header class="security-task__header">
      <button type="button" class="security-task__back" data-security-subview-back :disabled="busy" @click="requestClose">← {{ copy().backToIdentitySecurity }}</button>
      <p class="security-task__eyebrow">{{ copy().addPasskey }}</p>
    </header>
    <ol class="security-task__rail" :aria-label="copy().addPasskey">
      <li v-for="(item, index) in steps" :key="item" :data-step="item" :aria-current="step === item ? 'step' : undefined"><span>{{ String(index + 1).padStart(2, '0') }}</span><DliIcon v-if="steps.indexOf(step) > index" name="check" size="sm" /><span>{{ item === 'intro' ? copy().stepIntro : item === 'verify' ? copy().stepVerify : copy().finish }}</span></li>
    </ol>
    <div class="security-task__body">
      <h3 id="add-passkey-title" ref="heading" tabindex="-1">{{ step === 'success' ? copy().passkeyAdded : step === 'verify' ? copy().stepVerify : copy().addPasskey }}</h3>
      <DliIcon v-if="step === 'success'" name="check" size="lg" class="security-task__success" />
      <template v-if="step === 'intro'">
        <template v-if="capability.prfAvailable"><p>{{ copy().addPasskeyHint }}</p></template>
        <template v-else><p role="alert">{{ copy().prfBlocked }}</p><p class="security-task__muted">{{ copy().prfBlockedHint }}</p></template>
      </template>
      <template v-else-if="step === 'verify'"><p>{{ copy().passkeyConfirmHint }}</p><p class="security-task__muted">{{ copy().passkeyVerifyHint }}</p></template>
      <template v-else><p>{{ copy().identityUnchanged }}</p></template>
      <p v-if="error !== ''" role="alert" class="security-task__error">{{ error }}</p>
    </div>
    <footer class="security-task__footer">
      <button v-if="step !== 'success'" type="button" class="security-task__secondary" :disabled="busy" @click="requestClose">{{ copy().backToIdentitySecurity }}</button>
      <button v-if="step === 'intro' && capability.prfAvailable" type="button" class="security-task__primary" @click="create">{{ copy().createPasskey }}</button>
      <button v-else-if="step === 'verify'" type="button" class="security-task__primary" data-settings-add-passkey-confirm :disabled="busy" @click="confirm">{{ busy ? copy().busy : t.workspace.security.mockSuccess }}</button>
      <button v-else-if="step === 'success'" type="button" class="security-task__primary" @click="requestClose">{{ copy().finish }}</button>
    </footer>
  </section>
</template>

<style scoped>
.security-task { min-block-size: 100%; display: flex; flex-direction: column; gap: var(--dl-space-4); }
.security-task__header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-3); }
.security-task__eyebrow { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.security-task__rail { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2) var(--dl-space-4); margin: 0; padding: 0; list-style: none; color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.security-task__rail li { display: flex; align-items: center; gap: var(--dl-space-1); }
.security-task__rail li[aria-current='step'] { color: var(--dl-accent); }
.security-task__body { flex: 1; display: grid; gap: var(--dl-space-3); align-content: start; }
h3 { inline-size: fit-content; max-inline-size: 100%; font-size: var(--dl-font-size-xl); font-weight: 500; line-height: var(--dl-line-snug); }
h3:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); border-radius: var(--dl-radius-sm); }
.security-task__muted { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.security-task__success { color: var(--dl-success); }
.security-task__error { color: var(--dl-error); }
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
