<script setup lang="ts">
// 基本页按可编辑字段、身份事实、危险操作排列；异常信任提示优先出现在首屏。
// 表单由父层插槽提供，身份动作不会重新创建或重置父层草稿。
import { computed, ref } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import { revokeAgent, unlockIdentityVault } from '../api/workspace'
import { useI18n } from '../i18n'
import AgentRemoveDialog from './agent-remove-dialog.vue'
import DliIcon from './dl-icon.vue'
import './identity-flow.css'

const props = defineProps<{ agent: AgentSummary; canDelete: boolean; busy: boolean; initiallyExpanded: boolean }>()
const emit = defineEmits<{ updated: [agent: AgentSummary]; rePair: []; delete: [] }>()
const { t, locale } = useI18n()
const copy = computed(() => t.value.workspace.security)

function formatTime(value: string, empty = '—'): string {
  if (value === '') return empty
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return empty
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const identity = computed(() => props.agent.identity)
// 普通打开保持折叠，深链在组件挂载时展开；后续手动折叠不被属性覆盖。
const isExpanded = ref(props.initiallyExpanded)
// 危险区始终独立从折叠态开始，不随身份深链或身份披露联动。
const isDangerExpanded = ref(false)
const identitySummary = computed(() => `${copy.value.identityGroup} · ${copy.value[identity.value.trustState]} · ${identity.value.deviceName} · ${identity.value.platform}`)
const removeOpen = ref(false)
const isRemoving = ref(false)
const error = ref('')
const notice = ref('')
const copyNotice = ref('')
const copyFailed = ref(false)

async function copyPublicKey(): Promise<void> {
  try {
    await navigator.clipboard.writeText(identity.value.publicKey)
    copyFailed.value = false
    copyNotice.value = copy.value.copied
  } catch {
    copyFailed.value = true
    copyNotice.value = copy.value.copyFailed
  }
}

async function revoke(): Promise<void> {
  if (isRemoving.value) return
  isRemoving.value = true
  error.value = ''
  const unlocked = await unlockIdentityVault('passkey', '')
  if (!unlocked.ok) {
    error.value = unlocked.error.message
    isRemoving.value = false
    return
  }
  const result = await revokeAgent(props.agent.id)
  isRemoving.value = false
  if (!result.ok) {
    error.value = result.error.message
    return
  }
  removeOpen.value = false
  emit('updated', result.value)
  notice.value = copy.value.revoked
}

function openRemove(): void {
  if (props.busy) return
  error.value = ''
  removeOpen.value = true
}

function closeRemove(): void {
  if (isRemoving.value || props.busy) return
  removeOpen.value = false
}

// 删除由父层执行；确认框先关闭，失败时由设置页显示错误。
function requestDelete(): void {
  removeOpen.value = false
  emit('delete')
}
</script>

<template>
  <div class="security-console" data-testid="agent-identity-security">
    <section v-if="identity.trustState !== 'trusted'" class="security-alert" role="alert">
      <p><strong>{{ copy[identity.trustState] }}</strong> · {{ copy.trustWarning }}</p>
      <button type="button" class="security-button security-button--warning" data-testid="agent-re-pair" :disabled="busy" @click="emit('rePair')">{{ copy.rePair }}</button>
    </section>

    <slot />

    <section class="security-identity" aria-labelledby="agent-identity-heading">
      <h3 id="agent-identity-heading" class="security-heading">
        <button
          type="button" class="security-disclosure" data-testid="agent-identity-toggle"
          :data-state="identity.trustState" :aria-expanded="isExpanded" aria-controls="agent-identity-facts"
          :aria-label="identitySummary" :title="identitySummary" @click="isExpanded = !isExpanded"
        >
          <span class="security-trust-mark" aria-hidden="true" />
          <span class="security-disclosure__state">{{ copy[identity.trustState] }}</span>
          <span class="security-disclosure__device">{{ identity.deviceName }}</span>
          <span class="security-disclosure__platform">{{ identity.platform }}</span>
          <svg class="security-disclosure__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </h3>
      <dl v-show="isExpanded" id="agent-identity-facts" class="security-facts" :aria-label="copy.identityGroup">
        <div>
          <dt id="agent-trust-label">{{ copy.trustState }}</dt>
          <dd :data-state="identity.trustState">
            <span id="agent-identity-status" class="security-trust-state" role="group" tabindex="-1" aria-labelledby="agent-trust-label agent-trust-value">
              <span class="security-trust-mark" aria-hidden="true" />
              <span id="agent-trust-value">{{ copy[identity.trustState] }}</span>
            </span>
          </dd>
        </div>
        <div><dt>{{ copy.device }}</dt><dd>{{ identity.deviceName }}</dd></div>
        <div><dt>{{ copy.platform }}</dt><dd>{{ identity.platform }}</dd></div>
        <div><dt>{{ copy.lastSeen }}</dt><dd><time data-testid="agent-last-seen" :datetime="identity.lastSeenAt || undefined">{{ formatTime(identity.lastSeenAt) }}</time></dd></div>
        <div data-public-key>
          <dt>{{ copy.keySection }}</dt>
          <dd class="security-public-key">
            <div class="security-public-key__line">
              <code class="security-public-key__value" data-public-key-value :title="identity.publicKey">{{ identity.publicKey }}</code>
              <button type="button" class="security-button security-button--copy" data-copy-public-key :aria-label="copy.copyPublicKey" :title="copy.copyPublicKey" :disabled="busy" @click="copyPublicKey"><DliIcon name="copy" size="sm" /></button>
            </div>
            <p v-if="copyNotice !== ''" class="security-copy-feedback" :data-tone="copyFailed ? 'error' : 'ok'" role="status">{{ copyNotice }}</p>
          </dd>
        </div>
        <div><dt>{{ copy.version }}</dt><dd><code>v{{ identity.keyVersion }}</code></dd></div>
        <div><dt>{{ copy.pairedAt }}</dt><dd><time data-testid="agent-paired-at" :datetime="identity.pairedAt || undefined">{{ formatTime(identity.pairedAt) }}</time></dd></div>
      </dl>
    </section>

    <!-- 危险操作与表单、只读事实明确分隔；一个入口，两种互斥后果。 -->
    <section class="security-danger" aria-labelledby="agent-danger-heading">
      <h3 id="agent-danger-heading" class="security-heading">
        <button
          type="button" class="security-disclosure security-disclosure--danger" data-testid="agent-danger-toggle"
          :aria-expanded="isDangerExpanded" aria-controls="agent-danger-panel" @click="isDangerExpanded = !isDangerExpanded"
        >
          <span class="security-disclosure__state">{{ copy.dangerZone }}</span>
          <span class="security-danger__immediate">{{ t.workspace.agentAdmin.immediate }}</span>
          <svg class="security-disclosure__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </h3>
      <div v-show="isDangerExpanded" id="agent-danger-panel" class="security-danger__content">
        <p class="security-danger__hint">{{ copy.dangerHint }}</p>
        <div class="security-danger__action">
          <div class="security-danger__row">
            <div class="security-danger__copy">
              <h4>{{ copy.removeAgent }}</h4>
              <p>{{ copy.removeAgentHint }}</p>
            </div>
            <button type="button" class="security-button security-button--danger" :disabled="busy" @click="openRemove">{{ copy.removeAgent }}</button>
          </div>
          <p v-if="identity.trustState === 'revoked'" class="security-danger__hint">{{ copy.reconnectHint }}</p>
        </div>
      </div>
    </section>

    <AgentRemoveDialog
      :open="removeOpen" :agent="agent" :can-delete="canDelete" :busy="busy" :revoking="isRemoving" :error="error"
      @disconnect="revoke" @delete="requestDelete" @cancel="closeRemove"
    />
    <p v-if="notice !== ''" role="status" class="security-feedback">{{ notice }}</p>
  </div>
</template>

<style scoped>
.security-console { display: grid; gap: var(--dl-space-6); min-inline-size: 0; line-height: var(--dl-line-body); }
.security-identity { display: grid; gap: var(--dl-space-3); min-inline-size: 0; scroll-margin-block-start: var(--dl-space-1); }
.security-heading { margin: 0; font-size: var(--dl-font-size-md); font-weight: 500; line-height: var(--dl-line-body); }

/* 折叠摘要整行可点；状态文字不收缩，窄屏的平台信息由完整标题与展开事实补足。 */
.security-disclosure { display: flex; align-items: center; gap: var(--dl-space-3); inline-size: 100%; min-inline-size: 0; min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-4); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-raised); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 400; line-height: var(--dl-line-body); text-align: left; white-space: nowrap; transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.security-disclosure:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.security-disclosure:active { transform: translateY(var(--dl-lift-press)); }
.security-disclosure:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.security-disclosure__state { flex: none; font-weight: 500; }
.security-disclosure__device { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
.security-disclosure__platform { flex: 0 1 auto; min-inline-size: 0; max-inline-size: 40%; overflow: hidden; text-overflow: ellipsis; color: var(--dl-text-secondary); }
.security-disclosure__chevron { flex: none; inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); color: var(--dl-text-secondary); stroke: currentColor; stroke-width: var(--dl-icon-stroke); stroke-linecap: round; stroke-linejoin: round; transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.security-disclosure[aria-expanded='true'] .security-disclosure__chevron { transform: rotate(180deg); }

/* 与账户窗体共用标签 / 值对齐范式；长值可换行，只有公钥单行省略。 */
.security-facts { display: grid; grid-template-columns: fit-content(40%) minmax(0, 1fr); column-gap: var(--dl-space-3); margin: 0; padding-inline: var(--dl-space-4); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-raised); }
.security-facts > div { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: baseline; padding-block: var(--dl-space-2); }
.security-facts > div + div { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.security-facts dt { min-inline-size: 0; color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); overflow-wrap: anywhere; }
.security-facts dd { display: flex; align-items: center; gap: var(--dl-space-2); min-inline-size: 0; min-block-size: var(--dl-target-size); margin: 0; font-size: var(--dl-font-size-sm); overflow-wrap: anywhere; border-radius: var(--dl-radius-sm); }
.security-facts code { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.security-trust-state { display: flex; align-items: center; gap: var(--dl-space-2); min-inline-size: 0; border-radius: var(--dl-radius-sm); }
.security-trust-state:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.security-trust-mark { flex: none; inline-size: var(--dl-space-2); block-size: var(--dl-space-2); border-radius: var(--dl-radius-pill); background: var(--dl-success); }
[data-state='keyChanged'] .security-trust-mark { background: var(--dl-warning); }
[data-state='revoked'] .security-trust-mark { background: var(--dl-error); }
.security-facts .security-public-key { display: grid; gap: var(--dl-space-1); }
.security-public-key__line { display: flex; align-items: center; gap: var(--dl-space-2); min-inline-size: 0; }
.security-public-key__value { flex: 1; min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.security-copy-feedback { color: var(--dl-success); font-size: var(--dl-font-size-xs); }
.security-copy-feedback[data-tone='error'] { color: var(--dl-error); }

.security-alert { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-3); padding: var(--dl-space-3) var(--dl-space-4); border: var(--dl-border-width) solid var(--dl-warning); border-radius: var(--dl-radius-lg); background: var(--dl-warning-subtle); }
.security-alert p { flex: 1 1 12em; color: var(--dl-warning); font-size: var(--dl-font-size-sm); }
.security-alert strong { font-weight: 500; }

/* 危险披露沿用身份区的开合反馈，以标题色与描边保留危险语义。 */
.security-danger { display: grid; gap: var(--dl-space-4); padding-block-start: var(--dl-space-6); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.security-disclosure--danger { color: var(--dl-error); border-color: color-mix(in oklab, var(--dl-error) 45%, var(--dl-border-base)); }
.security-disclosure--danger:hover { border-color: var(--dl-error); }
.security-danger__content { display: grid; gap: var(--dl-space-3); }
.security-danger__action { display: grid; gap: var(--dl-space-2); }
.security-danger__immediate { flex: 1; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-weight: 400; }
.security-danger__hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.security-danger__row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-3); }
.security-danger__copy { display: grid; flex: 1 1 14em; gap: var(--dl-space-1); min-inline-size: 0; }
.security-danger__copy h4 { font-size: var(--dl-font-size-sm); font-weight: 500; }
.security-danger__copy p { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }

.security-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); min-inline-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.security-button:hover:not(:disabled) { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.security-button:active:not(:disabled) { transform: translateY(var(--dl-lift-press)); }
.security-button:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.security-button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.security-button--copy { flex: none; padding: 0; border-color: transparent; color: var(--dl-text-secondary); }
.security-button--warning { color: var(--dl-warning); border-color: var(--dl-warning); }
.security-button--danger { color: var(--dl-error); border-color: var(--dl-error); }
.security-button--danger:hover:not(:disabled) { background: color-mix(in oklab, var(--dl-error) 10%, var(--dl-bg-elevated)); border-color: var(--dl-error); }
.security-feedback { color: var(--dl-success); font-size: var(--dl-font-size-xs); }

@media (max-width: 560px) {
  .security-disclosure__platform { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .security-button:active:not(:disabled), .security-disclosure:active { transform: none; }
  .security-disclosure__chevron { transition: none; }
}
</style>
