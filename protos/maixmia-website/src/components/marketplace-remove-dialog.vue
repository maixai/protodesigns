<script setup lang="ts">
// 「移除市场」确认:删除市场会连带卸载它名下的插件,必须先把影响说清楚。
// 用原生 dialog.showModal();初始焦点固定在「保留」,不让破坏性动作成为默认。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { PluginInstallScopeId } from '../contracts/generated/installed-plugin'
import { useI18n } from '../i18n'

const props = defineProps<{
  open: boolean
  marketplaceName: string
  installedCount: number
  busy: boolean
  error: string
  // 移除只影响这次注册所在的作用域。
  scope: PluginInstallScopeId
  ownerName: string
}>()
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const dialogId = `marketplace-remove-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const bodyId = `${dialogId}-body`
const body = computed(() => {
  const template = props.scope === 'agent'
    ? t.value.workspace.plugins.removeBodyAgent
    : t.value.workspace.plugins.removeBodyProject
  return template
    .replace('{name}', props.ownerName)
    .replace('{count}', String(props.installedCount))
})

function finish(confirmed: boolean): void {
  if (props.busy) return
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  if (confirmed) emit('confirm')
  else emit('cancel')
}

function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) finish(false)
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
  dialog.showModal()
  cancelRef.value?.focus()
}, { immediate: true })

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef" class="market-remove" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="bodyId"
    @cancel.prevent="finish(false)" @click="onBackdropClick"
  >
    <h2 :id="titleId" class="market-remove__title">{{ t.workspace.plugins.removeTitle.replace('{name}', marketplaceName) }}</h2>
    <p :id="bodyId" class="market-remove__body">{{ body }}</p>
    <p v-if="error !== ''" class="market-remove__error" role="alert">{{ error }}</p>
    <div class="market-remove__actions">
      <button ref="cancelRef" type="button" class="dl-btn dl-btn--ghost" :disabled="busy" @click="finish(false)">{{ t.workspace.plugins.removeCancel }}</button>
      <button type="button" class="market-remove__confirm" :disabled="busy" @click="finish(true)">
        {{ busy ? t.workspace.plugins.removing : t.workspace.plugins.removeConfirm }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.market-remove {
  width: min(460px, calc(100% - 2 * var(--dl-space-6)));
  max-height: calc(100% - 2 * var(--dl-space-6));
  margin: auto;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-xl);
  background-color: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font: inherit;
  text-align: left;
}
.market-remove::backdrop { background-color: var(--dl-bg-sunken); }
.market-remove__title { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.market-remove__body { margin-block: var(--dl-space-3) var(--dl-space-6); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.market-remove__error { margin-block-end: var(--dl-space-4); color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.market-remove__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); }
.market-remove__actions .dl-btn { min-block-size: var(--dl-target-size); }
.market-remove__confirm { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border-radius: var(--dl-radius-md); background: var(--dl-error); color: var(--dl-text-on-accent); font-size: var(--dl-font-size-sm); }
.market-remove__confirm:hover:not(:disabled) { outline: var(--dl-border-width) solid var(--dl-error); outline-offset: var(--dl-space-1); }
.market-remove__confirm:disabled { opacity: 0.6; cursor: not-allowed; }
.market-remove__confirm:focus-visible { box-shadow: var(--dl-focus-ring); }
</style>
