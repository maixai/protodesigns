<script setup lang="ts">
// 原生 dialog.showModal() 自带焦点陷阱、Esc 关闭与 aria-modal 语义。
// top layer 内仍继承 DOM 祖先的 CSS 变量,因此直接使用深色作用域的 token;
// 不用 Teleport 到 body 的 n-modal,避免脱离 .dl-scope--dark 后重复映射主题。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../i18n'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const dialogId = `confirm-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const bodyId = `${dialogId}-body`

watch(() => props.open, async (isOpen): Promise<void> => {
  await nextTick()
  const dialog = dialogRef.value
  if (dialog === null) return
  if (!isOpen) {
    if (dialog.open) dialog.close()
    return
  }
  const active = document.activeElement
  returnFocusRef.value = active instanceof HTMLElement ? active : null
  dialog.showModal()
  // 不预选 Yes:初始焦点固定在取消上。
  cancelRef.value?.focus()
}, { immediate: true })

function finish(confirmed: boolean): void {
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  if (confirmed) emit('confirm')
  else emit('cancel')
}

function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  // dialog 内留白仍属于内容区,只有边界外的遮罩点击才取消。
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) finish(false)
}

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef"
    class="confirm-dialog"
    :aria-labelledby="titleId"
    :aria-describedby="bodyId"
    @cancel.prevent="finish(false)"
    @click="onBackdropClick"
  >
    <h2 :id="titleId" class="confirm-dialog__title">{{ t.account.confirmTitle }}</h2>
    <p :id="bodyId" class="confirm-dialog__body">{{ t.account.confirmBody }}</p>
    <div class="confirm-dialog__actions">
      <button ref="cancelRef" autofocus type="button" class="dl-btn dl-btn--ghost" @click="finish(false)">
        {{ t.account.cancel }}
      </button>
      <button type="button" class="dl-btn dl-btn--ghost" @click="finish(true)">
        {{ t.account.confirmAction }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.confirm-dialog {
  width: min(var(--dl-measure), calc(100% - 2 * var(--dl-space-6)));
  max-height: calc(100% - 2 * var(--dl-space-6));
  margin: auto;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font: inherit;
  text-align: left;
}

.confirm-dialog::backdrop {
  background-color: var(--dl-bg-sunken);
}

.confirm-dialog__title {
  font-size: var(--dl-font-size-xl);
  font-weight: 600;
  line-height: var(--dl-line-body);
}

.confirm-dialog__body {
  margin-block: var(--dl-space-4) var(--dl-space-6);
  color: var(--dl-text-secondary);
}

.confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--dl-space-3);
}

.confirm-dialog__actions .dl-btn {
  min-width: var(--dl-target-size);
  min-height: var(--dl-target-size);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}
</style>
