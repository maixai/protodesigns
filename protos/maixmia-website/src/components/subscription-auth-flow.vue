<script setup lang="ts">
// 仅呈现授权步骤与焦点,请求、取消与草稿提交均由父级管理。
import { computed, nextTick, ref, watch } from 'vue'
import type { ModelSubscription, ModelSubscriptionProviderId } from '../contracts/generated/agent-model-config'
import { SUBSCRIPTION_PROVIDER_LABELS } from '../data/models'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import SubscriptionUsage from './subscription-usage.vue'

const props = defineProps<{
  mode: 'add' | 'reauth'
  provider: ModelSubscriptionProviderId
  step: 'intro' | 'pending' | 'success' | 'cancelled' | 'error'
  subscription: ModelSubscription | null
  error: string
}>()
const emit = defineEmits<{ continue: []; cancel: []; retry: []; complete: [] }>()
const { t } = useI18n()
const copy = computed(() => t.value.workspace.agentAdmin)
const providerName = computed(() => SUBSCRIPTION_PROVIDER_LABELS[props.provider])
const introTitle = computed(() => (props.mode === 'add' ? copy.value.subscriptionAuthConnectTitle : copy.value.subscriptionAuthReauthTitle).replace('{provider}', providerName.value))
const introBody = computed(() => (props.mode === 'add' ? copy.value.subscriptionAuthIntroBody : copy.value.subscriptionAuthReauthBody).replaceAll('{provider}', providerName.value))
const securityFacts = computed(() => [copy.value.subscriptionAuthSecurityKeychain, copy.value.subscriptionAuthSecurityRevoke])
const backRef = ref<HTMLButtonElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)
const successRef = ref<HTMLHeadingElement | null>(null)
const retryRef = ref<HTMLButtonElement | null>(null)
function focusBack(): void { backRef.value?.focus() }
defineExpose({ focusBack })
watch(() => props.step, async (step): Promise<void> => {
  await nextTick()
  if (step === 'intro') focusBack()
  else if (step === 'pending') cancelRef.value?.focus()
  else if (step === 'success') successRef.value?.focus()
  else retryRef.value?.focus()
})
</script>

<template>
  <div class="gateway-form subscription-auth-flow" :data-step="step" :aria-busy="step === 'pending' ? 'true' : undefined">
    <template v-if="step === 'intro'">
      <button ref="backRef" type="button" class="gateway-form__back" @click="emit('cancel')">← {{ copy.gatewayBack }}</button>
      <h3>{{ introTitle }}</h3>
      <p>{{ introBody }}</p>
      <ul class="subscription-auth-flow__security">
        <li v-for="fact in securityFacts" :key="fact"><DliIcon name="check" size="sm" /><span>{{ fact }}</span></li>
      </ul>
      <div class="gateway-form__actions">
        <button type="button" class="dl-btn dl-btn--primary" @click="emit('continue')">{{ copy.subscriptionAuthContinue }}</button>
        <button type="button" class="dl-btn dl-btn--ghost" @click="emit('cancel')">{{ copy.gatewayCancel }}</button>
      </div>
      <p class="subscription-auth-flow__hint">{{ copy.subscriptionAuthDemoHint }}</p>
    </template>
    <template v-else-if="step === 'pending'">
      <div class="subscription-auth-flow__pending-head">
        <span class="subscription-auth-flow__spinner" aria-hidden="true" />
        <h3>{{ copy.subscriptionAuthPendingTitle }}</h3>
      </div>
      <p role="status" aria-live="polite">{{ copy.subscriptionAuthPendingBody.replace('{provider}', providerName) }}</p>
      <div class="gateway-form__actions">
        <button ref="cancelRef" type="button" class="dl-btn dl-btn--ghost" @click="emit('cancel')">{{ copy.subscriptionAuthCancel }}</button>
      </div>
    </template>
    <template v-else-if="step === 'success'">
      <div class="subscription-auth-flow__success-head">
        <DliIcon name="check" size="md" />
        <h3 ref="successRef" tabindex="-1">{{ copy.subscriptionAuthSuccessTitle }}</h3>
      </div>
      <template v-if="subscription !== null">
        <dl class="source-config__facts">
          <dt>{{ copy.subscriptionAccount }}</dt><dd>{{ subscription.account }}</dd>
          <dt>{{ copy.subscriptionPlan }}</dt><dd>{{ subscription.plan }} · {{ copy.subscriptionExpires }} <span class="source-config__facts-date">{{ subscription.expiresAt.slice(0, 10) }}</span></dd>
          <dt>{{ copy.subscriptionCredential }}</dt><dd class="gateway-form__mono">{{ subscription.credentialRef }}</dd>
          <dt>{{ copy.subscriptionUsage }}</dt><dd><SubscriptionUsage :usage="subscription.usage" compact /></dd>
        </dl>
      </template>
      <p>{{ mode === 'add' ? copy.subscriptionAuthSuccessBody : copy.subscriptionAuthReauthSuccessBody }}</p>
      <div class="gateway-form__actions">
        <button type="button" class="dl-btn dl-btn--primary" @click="emit('complete')">{{ copy.subscriptionAuthComplete }}</button>
      </div>
    </template>
    <template v-else>
      <h3>{{ step === 'cancelled' ? copy.subscriptionAuthCancelledTitle : copy.subscriptionAuthErrorTitle }}</h3>
      <p>{{ step === 'cancelled' ? copy.subscriptionAuthCancelledBody : copy.subscriptionAuthErrorBody }}</p>
      <p v-if="step === 'error' && error !== ''" role="alert" class="subscription-auth-flow__error">{{ error }}</p>
      <div class="gateway-form__actions">
        <button ref="retryRef" type="button" class="dl-btn dl-btn--primary" @click="emit('retry')">{{ step === 'cancelled' ? copy.subscriptionAuthRetry : t.workspace.retry }}</button>
        <button type="button" class="dl-btn dl-btn--ghost" @click="emit('cancel')">{{ copy.gatewayCancel }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.subscription-auth-flow { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
/* 授权说明比来源表单更紧凑:窄屏下首要动作必须留在首屏。 */
.gateway-form.subscription-auth-flow { gap: var(--dl-space-3); }
h3 { color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; line-height: var(--dl-line-body); }
.subscription-auth-flow__success-head { display: flex; align-items: center; gap: var(--dl-space-2); color: var(--dl-success); }
.subscription-auth-flow__pending-head { display: flex; align-items: center; gap: var(--dl-space-3); }
.subscription-auth-flow__success-head h3 { color: var(--dl-text-primary); }
.subscription-auth-flow__success-head h3:focus { outline: none; }
.gateway-form__back { justify-self: start; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.gateway-form__back:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.gateway-form__back:active { background: var(--dl-bg-sunken); color: var(--dl-accent-active); }
.gateway-form__actions { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); }
.dl-btn { min-block-size: var(--dl-target-size); white-space: normal; transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
button:active:not(:disabled) { transform: translateY(var(--dl-lift-press)); }
.subscription-auth-flow__security { display: grid; gap: var(--dl-space-2); padding: 0; margin: 0; list-style: none; }
.subscription-auth-flow__security li { display: flex; align-items: baseline; gap: var(--dl-space-2); }
.subscription-auth-flow__security :deep(.dl-icon) { flex: none; align-self: start; margin-block-start: var(--dl-space-1); color: var(--dl-accent); }
.subscription-auth-flow__hint { font-size: var(--dl-font-size-xs); color: var(--dl-text-tertiary); }
.subscription-auth-flow__error { color: var(--dl-error); }
.source-config__facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--dl-space-2) var(--dl-space-4); margin: 0; font-size: var(--dl-font-size-sm); }
.source-config__facts dt { color: var(--dl-text-secondary); }
.source-config__facts dd { margin: 0; color: var(--dl-text-primary); overflow-wrap: anywhere; }
.source-config__facts-date { white-space: nowrap; }
.gateway-form__mono { font-family: var(--dl-font-mono); }
.subscription-auth-flow__spinner { inline-size: var(--dl-icon-lg); block-size: var(--dl-icon-lg); border: var(--dl-border-width) solid var(--dl-border-base); border-block-start-color: var(--dl-accent); border-radius: var(--dl-radius-pill); animation: subscription-auth-spin calc(4 * var(--dl-duration-base)) linear infinite; }
@keyframes subscription-auth-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .subscription-auth-flow__spinner { animation: none; } }
@media (max-width: 560px) {
  /* 成功页在窄屏仍用两列事实表:标题、凭据与「完成」必须同屏可见。 */
  .source-config__facts { gap: var(--dl-space-1) var(--dl-space-2); font-size: var(--dl-font-size-xs); }
}
</style>
