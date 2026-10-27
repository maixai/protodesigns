<script setup lang="ts">
// 身份与安全(已配对的 Agent):只保留配对完成后仍有价值的信息。
// 配对流程里的安全码人工核对、待确认的信任记录属于「添加 Agent」阶段,不在这里重复;
// 页面结构因此收窄为 状态 → 身份密钥 → 危险操作。
import { computed, ref } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import { revokeAgent, unlockIdentityVault } from '../api/workspace'
import { useI18n } from '../i18n'
import AgentRemoveDialog from './agent-remove-dialog.vue'
import './identity-flow.css'

const props = defineProps<{ agent: AgentSummary; canDelete: boolean; busy: boolean }>()
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
// 指纹按空格分组显示成数据栅格;一次取出,避免模板里反复 split。
const fingerprintGroups = computed(() => identity.value.fingerprint.split(' ').filter((group) => group !== ''))
// 折叠态的摘要只取首两组与末组,既能认出来是哪把钥匙,又不占一整块空间。
const fingerprintPreview = computed(() => {
  const groups = fingerprintGroups.value
  if (groups.length <= 3) return groups.join(' ')
  return `${groups.slice(0, 2).join(' ')} … ${groups.slice(-1).join(' ')}`
})
const isKeyOpen = ref(false)
const removeOpen = ref(false)
const isRemoving = ref(false)
const error = ref('')
const notice = ref('')
const copyNotice = ref('')
const copyFailed = ref(false)

async function copyFingerprint(): Promise<void> {
  try {
    await navigator.clipboard.writeText(identity.value.fingerprint)
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
  <section class="security-console" data-testid="agent-identity-security">
    <!-- 状态:一眼看到「这台设备是否仍被信任」,以及对应设备的最近在线时间。 -->
    <section class="security-hero" :data-state="identity.trustState">
      <div class="security-hero__glyph" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <path d="M24 6 39 12v11c0 9-6 15-15 19-9-4-15-10-15-19V12L24 6Z" />
          <path d="M18 25a6 6 0 1 1 12 0c0 2.4-1.4 4.5-3.5 5.5V34h-5v-3.5C19.4 29.5 18 27.4 18 25Z" />
        </svg>
      </div>
      <div class="security-hero__body">
        <p class="security-hero__eyebrow">{{ copy.trustState }}</p>
        <h3 class="security-hero__title">
          <span class="security-hero__lamp" aria-hidden="true" />
          {{ copy[identity.trustState] }}
          <span v-if="agent.builtIn" class="security-chip">{{ t.workspace.agentAdmin.builtIn }}</span>
        </h3>
        <p class="security-hero__device">{{ identity.deviceName }} · {{ identity.platform }}</p>
        <p class="security-hero__seen">
          {{ copy.lastSeen }} <time data-testid="agent-last-seen">{{ formatTime(identity.lastSeenAt) }}</time>
        </p>
      </div>
    </section>

    <section v-if="identity.trustState !== 'trusted'" class="security-alert" role="alert">
      <p>{{ copy.trustWarning }}</p>
      <button type="button" class="security-button security-button--warning" data-testid="agent-re-pair" @click="emit('rePair')">{{ copy.rePair }}</button>
    </section>

    <!-- 身份密钥是低频信息:默认折叠成一行摘要,展开后才显示完整指纹与配对信息。 -->
    <section class="security-key">
      <button
        id="agent-key-toggle" type="button" class="security-key__toggle"
        :aria-expanded="isKeyOpen" aria-controls="agent-key-panel"
        data-testid="agent-key-toggle" @click="isKeyOpen = !isKeyOpen"
      >
        <span class="security-key__title">{{ copy.keySection }}</span>
        <span class="security-key__summary">
          <span>{{ copy.fingerprint }}</span>
          <span aria-hidden="true">·</span>
          <span class="identity-mono security-key__preview">{{ fingerprintPreview }}</span>
          <span aria-hidden="true">·</span>
          <span class="identity-mono">v{{ identity.keyVersion }}</span>
        </span>
        <svg class="security-key__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      <div v-if="isKeyOpen" id="agent-key-panel" class="security-key__panel">
        <div class="security-key__panel-head">
          <span class="security-key__label">{{ copy.fingerprint }}</span>
          <button type="button" class="security-button security-button--quiet" @click="copyFingerprint">{{ copy.copyFingerprint }}</button>
        </div>
        <p v-if="copyNotice !== ''" class="security-copy-feedback" :data-tone="copyFailed ? 'error' : 'ok'" role="status">{{ copyNotice }}</p>
        <p class="security-key__hint">{{ copy.keyHint }}</p>
        <ol class="security-fingerprint" :aria-label="copy.fingerprint">
          <li v-for="(group, index) in fingerprintGroups" :key="`${group}-${index}`" class="security-fingerprint__cell">
            <span class="security-fingerprint__index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="identity-mono security-fingerprint__value">{{ group }}</span>
          </li>
        </ol>
        <dl class="security-specs">
          <div class="security-specs__item">
            <dt>{{ copy.version }}</dt>
            <dd class="identity-mono">v{{ identity.keyVersion }}</dd>
          </div>
          <div class="security-specs__item">
            <dt>{{ copy.pairedAt }}</dt>
            <dd class="identity-mono" data-testid="agent-paired-at">{{ formatTime(identity.pairedAt) }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <!-- 危险操作:一个入口,两种互斥后果;默认保留数据,删除需显式选择。 -->
    <section class="security-danger">
      <header class="security-danger__head">
        <h3 class="security-danger__title">{{ copy.dangerZone }}</h3>
        <p class="security-danger__hint">{{ copy.dangerHint }}</p>
      </header>

      <div class="security-danger__action">
        <div class="security-danger__row">
          <div class="security-danger__copy">
            <h4>{{ copy.removeAgent }}</h4>
            <p>{{ copy.removeAgentHint }}</p>
          </div>
          <button
            type="button" class="security-button security-button--danger" :disabled="busy" @click="openRemove"
          >{{ copy.removeAgent }}</button>
        </div>
        <p v-if="identity.trustState === 'revoked'" class="security-danger__hint">{{ copy.reconnectHint }}</p>
      </div>
    </section>

    <AgentRemoveDialog
      :open="removeOpen" :agent="agent" :can-delete="canDelete" :busy="busy" :revoking="isRemoving" :error="error"
      @disconnect="revoke" @delete="requestDelete" @cancel="closeRemove"
    />

    <p v-if="notice !== ''" role="status" class="security-feedback security-feedback--notice">{{ notice }}</p>
  </section>
</template>

<style scoped>
/* 安全控制台的局部几何;颜色、字号、间距、圆角一律取语义 / 结构 token。 */
.security-console {
  --security-grid: color-mix(in oklab, var(--dl-accent) 4%, transparent);
  display: grid;
  gap: var(--dl-space-4);
  min-inline-size: 0;
}

/* ---- 状态卡 ---- */
.security-hero {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--dl-space-4);
  overflow: hidden;
  padding: var(--dl-space-4);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  background: var(--dl-bg-base);
}

/* 右侧渐隐的技术网格:只提供结构感,线条取强调色的极低比例。
   遮罩从 62% 才开始显影,把网格挡在文字区之外 —— 三级文字不压在纹理上。 */
.security-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(var(--security-grid) var(--dl-border-width), transparent var(--dl-border-width)),
    linear-gradient(90deg, var(--security-grid) var(--dl-border-width), transparent var(--dl-border-width));
  background-size: var(--dl-space-6) var(--dl-space-6);
  /* 渐变里的 #000 只取 alpha 通道参与遮罩,不是视觉颜色。 */
  -webkit-mask-image: linear-gradient(90deg, transparent 62%, #000);
  mask-image: linear-gradient(90deg, transparent 62%, #000);
}

.security-hero__glyph {
  position: relative;
  display: grid;
  place-items: center;
  inline-size: var(--dl-target-size);
  block-size: var(--dl-target-size);
  border: var(--dl-border-width) solid color-mix(in oklab, var(--dl-accent) 32%, transparent);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-bg-elevated);
  color: var(--dl-accent);
}

.security-hero__glyph::after {
  content: '';
  position: absolute;
  inset: calc(-1 * var(--dl-space-1));
  border: var(--dl-border-width) solid color-mix(in oklab, var(--dl-accent) 12%, transparent);
  border-radius: inherit;
}

.security-hero__glyph svg {
  inline-size: var(--dl-icon-lg);
  block-size: var(--dl-icon-lg);
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.security-hero[data-state='keyChanged'] .security-hero__glyph {
  color: var(--dl-warning);
  border-color: color-mix(in oklab, var(--dl-warning) 40%, transparent);
}

.security-hero[data-state='revoked'] .security-hero__glyph {
  color: var(--dl-error);
  border-color: color-mix(in oklab, var(--dl-error) 40%, transparent);
}

.security-hero__body {
  display: grid;
  gap: var(--dl-space-1);
  min-inline-size: 0;
}

.security-hero__eyebrow {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-tertiary);
}

.security-hero__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xl);
  font-weight: 600;
  line-height: var(--dl-line-tight);
}

.security-hero__lamp {
  inline-size: calc(var(--dl-space-1) * 1.5);
  block-size: calc(var(--dl-space-1) * 1.5);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-success);
  box-shadow: 0 0 0 var(--dl-space-1) color-mix(in oklab, var(--dl-success) 16%, transparent);
}

.security-hero[data-state='keyChanged'] .security-hero__lamp { background: var(--dl-warning); box-shadow: 0 0 0 var(--dl-space-1) color-mix(in oklab, var(--dl-warning) 16%, transparent); }
.security-hero[data-state='revoked'] .security-hero__lamp { background: var(--dl-error); box-shadow: 0 0 0 var(--dl-space-1) color-mix(in oklab, var(--dl-error) 16%, transparent); }

.security-hero__device {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
}

.security-hero__seen {
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
}

.security-chip {
  padding-inline: var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  font-weight: 400;
  line-height: var(--dl-line-snug);
}

/* ---- 信任异常 ---- */
.security-alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-3);
  padding: var(--dl-space-3) var(--dl-space-4);
  border: var(--dl-border-width) solid color-mix(in oklab, var(--dl-warning) 45%, transparent);
  border-radius: var(--dl-radius-lg);
  background: var(--dl-warning-subtle);
}

.security-alert p {
  flex: 1 1 12em;
  color: var(--dl-warning);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
}

/* ---- 身份密钥(渐进披露) ---- */
.security-key {
  min-inline-size: 0;
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background: var(--dl-bg-base);
}

.security-key__toggle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-1) var(--dl-space-3);
  inline-size: 100%;
  padding: var(--dl-space-3) var(--dl-space-4);
  border-radius: var(--dl-radius-lg);
  text-align: left;
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.security-key__toggle:hover { background: var(--dl-bg-hover); }

.security-key__toggle[aria-expanded='true'] {
  border-radius: var(--dl-radius-lg) var(--dl-radius-lg) 0 0;
}

/* 全局焦点环会把圆角收成 sm;这里恢复卡片自身的圆角。 */
.security-key__toggle:focus-visible {
  box-shadow: var(--dl-focus-ring);
  border-radius: var(--dl-radius-lg);
}

.security-key__toggle:focus-visible[aria-expanded='true'] {
  border-radius: var(--dl-radius-lg) var(--dl-radius-lg) 0 0;
}

.security-key__title {
  flex: none;
  font-size: var(--dl-font-size-md);
  font-weight: 500;
  line-height: var(--dl-line-snug);
}

.security-key__chevron {
  flex: none;
  margin-inline-start: auto;
  inline-size: var(--dl-icon-sm);
  block-size: var(--dl-icon-sm);
  color: var(--dl-text-tertiary);
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.security-key__toggle[aria-expanded='true'] .security-key__chevron {
  transform: rotate(180deg);
}

.security-key__summary {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--dl-space-1);
  min-inline-size: 0;
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
}

.security-key__preview { color: var(--dl-text-secondary); }

.security-key__panel {
  display: grid;
  gap: var(--dl-space-3);
  padding: var(--dl-space-3) var(--dl-space-4) var(--dl-space-4);
  border-block-start: var(--dl-border-width) solid var(--dl-border-subtle);
  animation: security-key-panel-enter var(--dl-duration-base) var(--dl-ease-standard);
}

.security-key__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--dl-space-2);
}

.security-key__label {
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
}

.security-key__hint {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
}

@keyframes security-key-panel-enter {
  from { opacity: 0; transform: translateY(calc(-1 * var(--dl-space-1))); }
  to { opacity: 1; transform: translateY(0); }
}

/* 复制结果贴着动作出现,不把它丢到页面底部的全局反馈里。 */
.security-copy-feedback {
  color: var(--dl-success);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
}

.security-copy-feedback[data-tone='error'] { color: var(--dl-error); }

/* ---- 指纹栅格 ---- */
.security-fingerprint {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dl-border-width);
  padding: var(--dl-border-width);
  overflow: hidden;
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background: var(--dl-border-base);
}

.security-fingerprint__cell {
  display: grid;
  gap: var(--dl-space-1);
  min-inline-size: 0;
  padding: var(--dl-space-2);
  background: var(--dl-bg-elevated);
}

.security-fingerprint__index {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-tight);
  color: var(--dl-text-tertiary);
}

.security-fingerprint__value {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-primary);
  overflow-wrap: anywhere;
}

.security-specs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dl-space-2) var(--dl-space-4);
}

.security-specs__item {
  display: grid;
  gap: var(--dl-space-1);
  min-inline-size: 0;
}

.security-specs dt {
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
}

.security-specs dd {
  margin: 0;
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
  overflow-wrap: anywhere;
}

/* ---- 危险操作 ---- */
.security-danger {
  display: grid;
  gap: var(--dl-space-3);
  padding: var(--dl-space-4);
  border: var(--dl-border-width) solid color-mix(in oklab, var(--dl-error) 34%, transparent);
  border-radius: var(--dl-radius-lg);
  background: color-mix(in oklab, var(--dl-error) 4%, var(--dl-bg-base));
}

.security-danger__head {
  display: grid;
  gap: var(--dl-space-1);
  padding-block-end: var(--dl-space-3);
  border-block-end: var(--dl-border-width) solid var(--dl-border-subtle);
}

.security-danger__title {
  color: var(--dl-error);
  font-size: var(--dl-font-size-md);
  font-weight: 500;
  line-height: var(--dl-line-snug);
}

.security-danger__hint {
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
}

.security-danger__action {
  display: grid;
  gap: var(--dl-space-3);
}

.security-danger__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--dl-space-3);
}

.security-danger__copy {
  display: grid;
  flex: 1 1 14em;
  gap: var(--dl-space-1);
  min-inline-size: 0;
}

.security-danger__copy h4 {
  font-size: var(--dl-font-size-sm);
  font-weight: 500;
  line-height: var(--dl-line-snug);
}

.security-danger__copy p {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
}

/* ---- 按钮 / 反馈 ---- */
.security-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--dl-space-2);
  min-block-size: var(--dl-target-size);
  padding-inline: var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  transition:
    background-color var(--dl-duration-fast) var(--dl-ease-standard),
    border-color var(--dl-duration-fast) var(--dl-ease-standard),
    color var(--dl-duration-fast) var(--dl-ease-standard),
    transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.security-button:hover:not(:disabled) {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.security-button:active:not(:disabled) { transform: translateY(var(--dl-lift-press)); }

.security-button:disabled {
  background: var(--dl-bg-sunken);
  color: var(--dl-text-disabled);
  cursor: not-allowed;
}

.security-button:focus-visible {
  box-shadow: var(--dl-focus-ring);
  border-radius: var(--dl-radius-md);
}

.security-button--quiet {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
}

.security-button--warning {
  color: var(--dl-warning);
  border-color: color-mix(in oklab, var(--dl-warning) 45%, transparent);
}

.security-button--warning:hover:not(:disabled) {
  background: color-mix(in oklab, var(--dl-warning) 10%, transparent);
  border-color: var(--dl-warning);
}

.security-button--danger {
  color: var(--dl-error);
  border-color: color-mix(in oklab, var(--dl-error) 45%, transparent);
}

.security-button--danger:hover:not(:disabled) {
  background: color-mix(in oklab, var(--dl-error) 10%, transparent);
  border-color: var(--dl-error);
}

.security-button--danger-solid {
  background: var(--dl-error);
  border-color: var(--dl-error);
  color: var(--dl-text-on-accent);
}

.security-button--danger-solid:hover:not(:disabled) {
  background: color-mix(in oklab, var(--dl-error), var(--dl-text-primary) 8%);
  border-color: color-mix(in oklab, var(--dl-error), var(--dl-text-primary) 8%);
}

.security-button--danger-solid:disabled {
  background: var(--dl-bg-sunken);
  border-color: transparent;
  color: var(--dl-text-disabled);
}

.security-feedback {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
}

.security-feedback--notice { color: var(--dl-success); }

/* ---- 窄屏:单列信息,指纹不挤压 ---- */
@media (max-width: 560px) {
  /* 窄屏右侧没有可依附的结构,隐藏装饰网格。 */
  .security-hero::before { display: none; }

  .security-specs {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .security-button:active:not(:disabled) { transform: none; }
}
</style>
