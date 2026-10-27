<script setup lang="ts">
// 移除 Agent 的独立确认框:破坏性动作单独成 modal(alertdialog),不与设置页内容混在一起。
// 两种互斥后果用单选:默认「仅断开连接」,删除必须显式选择后再点红色按钮。
// 原生 dialog.showModal() 自带焦点陷阱、Esc 与 aria-modal;初始焦点落在最安全的选项上。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import { useI18n } from '../i18n'
import MockPasskeyStep from './mock-passkey-step.vue'
import './identity-flow.css'

const props = defineProps<{
  open: boolean
  agent: AgentSummary
  canDelete: boolean
  busy: boolean
  revoking: boolean
  error: string
}>()
const emit = defineEmits<{ disconnect: []; delete: []; cancel: [] }>()
const { t } = useI18n()
const copy = computed(() => t.value.workspace.security)

type RemoveMode = 'keep' | 'delete'
const dialogRef = ref<HTMLDialogElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const mode = ref<RemoveMode>('keep')
const stage = ref<'choose' | 'passkey'>('choose')
const dialogId = `agent-remove-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const descriptionId = `${dialogId}-description`

function focusInitial(): void {
  const dialog = dialogRef.value
  if (dialog === null) return
  // 最安全的选择优先:保留数据;若已断开(只有删除)则把焦点放到取消上。
  const safe = dialog.querySelector<HTMLInputElement>('input[type="radio"][value="keep"]:not(:disabled)')
  const fallback = dialog.querySelector<HTMLButtonElement>('[data-testid="agent-remove-cancel"]')
  ;(safe ?? fallback)?.focus()
}

watch(() => props.open, async (isOpen): Promise<void> => {
  await nextTick()
  const dialog = dialogRef.value
  if (dialog === null) return
  if (!isOpen) {
    if (dialog.open) dialog.close()
    if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
    return
  }
  const active = document.activeElement
  returnFocusRef.value = active instanceof HTMLElement ? active : null
  mode.value = props.agent.identity.trustState === 'revoked' ? 'delete' : 'keep'
  stage.value = 'choose'
  // 等选择面板真正渲染后再 showModal / 聚焦;否则从 Passkey 阶段重开时会聚焦到即将移除的节点。
  await nextTick()
  if (!dialog.open) dialog.showModal()
  focusInitial()
}, { immediate: true })

function close(): void {
  if (props.busy || props.revoking) return
  dialogRef.value?.close()
  emit('cancel')
}

function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
}

async function startDisconnect(): Promise<void> {
  if (props.busy || props.revoking) return
  stage.value = 'passkey'
  await nextTick()
  dialogRef.value?.querySelector<HTMLButtonElement>('[data-testid="mock-revoke-passkey"]')?.focus()
}

onBeforeUnmount(() => {
  dialogRef.value?.close()
})
</script>

<template>
  <dialog
    ref="dialogRef" class="remove-dialog dl-modal-scrim" role="alertdialog" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="descriptionId"
    data-testid="agent-remove-dialog" @keydown.stop @cancel.prevent="close" @click="onBackdropClick"
  >
    <div v-if="stage === 'choose'" class="remove-dialog__body">
      <h2 :id="titleId" class="remove-dialog__title">{{ copy.removeTitle.replace('{name}', agent.name) }}</h2>
      <p :id="descriptionId" class="remove-dialog__description">{{ copy.removeAgentHint }}</p>

      <fieldset class="remove-dialog__modes">
        <legend class="remove-dialog__legend">{{ copy.removeModeLabel }}</legend>
        <label v-if="agent.identity.trustState !== 'revoked'" class="remove-dialog__mode" :data-selected="mode === 'keep'">
          <input v-model="mode" type="radio" name="agent-remove-mode" value="keep">
          <span class="remove-dialog__mode-body">
            <span class="remove-dialog__mode-title">{{ copy.removeKeep }}</span>
            <span class="remove-dialog__mode-hint">{{ copy.removeKeepHint }}</span>
          </span>
        </label>
        <label class="remove-dialog__mode" data-tone="danger" :data-selected="mode === 'delete'" :data-disabled="!canDelete">
          <input v-model="mode" type="radio" name="agent-remove-mode" value="delete" :disabled="!canDelete">
          <span class="remove-dialog__mode-body">
            <span class="remove-dialog__mode-title">{{ copy.removeDelete }}</span>
            <span class="remove-dialog__mode-hint">{{ t.workspace.agentAdmin.deleteBody }}</span>
          </span>
        </label>
      </fieldset>

      <p v-if="!canDelete" class="remove-dialog__note">{{ copy.removeLastAgent }}</p>

      <div class="remove-dialog__actions">
        <button type="button" class="remove-dialog__button" data-testid="agent-remove-cancel" :disabled="busy || revoking" @click="close">{{ copy.removeCancel }}</button>
        <button
          v-if="mode === 'keep'" type="button"
          class="remove-dialog__button remove-dialog__button--danger" :disabled="busy || revoking" @click="startDisconnect"
        >{{ copy.removeDisconnect }}</button>
        <button
          v-else type="button"
          class="remove-dialog__button remove-dialog__button--danger-solid" :disabled="!canDelete || busy || revoking" @click="emit('delete')"
        >
          {{ busy ? t.workspace.agentAdmin.deleting : copy.removeDelete }}
        </button>
      </div>
    </div>

    <div v-else class="remove-dialog__body">
      <h2 :id="titleId" class="remove-dialog__title">{{ copy.removeDisconnectTitle.replace('{name}', agent.name) }}</h2>
      <p :id="descriptionId" class="remove-dialog__description">{{ copy.removeKeepHint }}</p>
      <MockPasskeyStep :busy="revoking" test-id="mock-revoke-passkey" @confirm="emit('disconnect')" />
      <p v-if="error !== ''" role="alert" class="remove-dialog__error">{{ error }}</p>
      <div class="remove-dialog__actions">
        <button type="button" class="remove-dialog__button" data-testid="agent-remove-cancel" :disabled="revoking" @click="close">{{ copy.removeCancel }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
/* 破坏性确认框:与设置页一致的面板材质,宽度收在 30em 左右,避免跨屏。 */
.remove-dialog {
  width: min(calc(var(--dl-measure) * 6 / 7), calc(100% - 2 * var(--dl-space-4)));
  max-block-size: calc(100dvh - 2 * var(--dl-space-6));
  margin: auto;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-xl);
  background-color: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  color-scheme: dark;
  font: inherit;
  text-align: left;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.remove-dialog[open] { display: block; }

.remove-dialog__body {
  display: grid;
  gap: var(--dl-space-4);
}

.remove-dialog__title {
  font-size: var(--dl-font-size-xl);
  font-weight: 600;
  line-height: var(--dl-line-snug);
}

.remove-dialog__description {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
}

.remove-dialog__modes {
  display: grid;
  gap: var(--dl-space-2);
  margin: 0;
  padding: 0;
  border: 0;
  min-inline-size: 0;
}

.remove-dialog__legend {
  margin-block-end: var(--dl-space-1);
  padding: 0;
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
}

.remove-dialog__mode {
  display: flex;
  align-items: flex-start;
  gap: var(--dl-space-3);
  min-block-size: var(--dl-target-size);
  padding: var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  cursor: pointer;
  transition:
    background-color var(--dl-duration-fast) var(--dl-ease-standard),
    border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.remove-dialog__mode:hover {
  border-color: var(--dl-border-strong);
  background: var(--dl-bg-hover);
}

.remove-dialog__mode[data-selected='true'] {
  border-color: var(--dl-accent);
  background: var(--dl-accent-soft);
}

.remove-dialog__mode[data-selected='true'][data-tone='danger'] {
  border-color: var(--dl-error);
  background: color-mix(in oklab, var(--dl-error) 8%, transparent);
}

.remove-dialog__mode[data-tone='danger'] input { accent-color: var(--dl-error); }

.remove-dialog__mode[data-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.6;
}

.remove-dialog__mode[data-disabled='true']:hover {
  border-color: var(--dl-border-base);
  background: transparent;
}

.remove-dialog__mode input {
  flex: none;
  inline-size: var(--dl-icon-md);
  block-size: var(--dl-icon-md);
  margin: 0;
  margin-block-start: var(--dl-space-1);
  accent-color: var(--dl-accent);
}

.remove-dialog__mode input:focus-visible {
  box-shadow: var(--dl-focus-ring);
  border-radius: var(--dl-radius-pill);
}

.remove-dialog__mode-body {
  display: grid;
  gap: var(--dl-space-1);
  min-inline-size: 0;
}

.remove-dialog__mode-title {
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
  font-weight: 500;
  line-height: var(--dl-line-snug);
}

.remove-dialog__mode-hint {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
}

.remove-dialog__note {
  color: var(--dl-warning);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
}

.remove-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--dl-space-2);
}

.remove-dialog__button {
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
    color var(--dl-duration-fast) var(--dl-ease-standard);
}

.remove-dialog__button:hover:not(:disabled) {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.remove-dialog__button:focus-visible {
  box-shadow: var(--dl-focus-ring);
  border-radius: var(--dl-radius-md);
}

.remove-dialog__button:disabled {
  background: var(--dl-bg-sunken);
  color: var(--dl-text-disabled);
  cursor: not-allowed;
}

.remove-dialog__button--danger {
  color: var(--dl-error);
  border-color: color-mix(in oklab, var(--dl-error) 45%, transparent);
}

.remove-dialog__button--danger:hover:not(:disabled) {
  background: color-mix(in oklab, var(--dl-error) 10%, transparent);
  border-color: var(--dl-error);
}

.remove-dialog__button--danger-solid {
  background: var(--dl-error);
  border-color: var(--dl-error);
  color: var(--dl-text-on-accent);
}

.remove-dialog__button--danger-solid:hover:not(:disabled) {
  background: color-mix(in oklab, var(--dl-error), var(--dl-text-primary) 8%);
  border-color: color-mix(in oklab, var(--dl-error), var(--dl-text-primary) 8%);
}

.remove-dialog__button--danger-solid:disabled {
  background: var(--dl-bg-sunken);
  border-color: transparent;
  color: var(--dl-text-disabled);
}

.remove-dialog__error {
  color: var(--dl-error);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
}

@media (prefers-reduced-motion: reduce) {
  .remove-dialog__button { transition: none; }
}
</style>
