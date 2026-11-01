<script setup lang="ts">
// 三个项目配置窗体共用的单列外壳:项目身份、滚动正文与唯一底部动作区。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Project } from '../contracts/generated/project'

const props = defineProps<{ open: boolean; title: string; scopeHint: string; project: Project; busy: boolean }>()
const emit = defineEmits<{ close: [] }>()
const dialogRef = ref<HTMLDialogElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const dialogId = `project-config-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const hintId = `${dialogId}-hint`

function finishClose(): void {
  if (props.busy) return
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  emit('close')
}
function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) finishClose()
}
watch(() => props.open, async (isOpen) => {
  await nextTick()
  const dialog = dialogRef.value
  if (dialog === null) return
  if (!isOpen) { if (dialog.open) dialog.close(); return }
  const active = document.activeElement
  returnFocusRef.value = active instanceof HTMLElement ? active : null
  dialog.showModal()
  dialog.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')?.focus()
}, { immediate: true })
onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog ref="dialogRef" class="project-settings project-config dl-modal-scrim" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="hintId" @cancel.prevent="finishClose" @click="onBackdropClick">
    <header class="project-config__head">
      <div class="project-config__heading">
        <span class="project-config__mark" aria-hidden="true">{{ project.mark }}</span>
        <div class="project-config__identity">
          <h2 :id="titleId" class="project-config__title">{{ title }} · {{ project.name }}</h2>
          <code class="project-config__path">{{ project.path }}</code>
        </div>
      </div>
      <p :id="hintId" class="project-config__scope">{{ scopeHint }}</p>
    </header>
    <div class="project-config__body"><slot /></div>
    <footer class="project-config__actions"><slot name="footer" :close="finishClose" /></footer>
  </dialog>
</template>

<style scoped>
.project-config { width: min(var(--workspace-settings-dialog-width), calc(100% - 2 * var(--dl-space-4))); block-size: min(var(--workspace-settings-dialog-max-height), calc(100dvh - 2 * var(--dl-space-4))); max-block-size: min(var(--workspace-settings-dialog-max-height), calc(100dvh - 2 * var(--dl-space-4))); margin: auto; box-sizing: border-box; padding: var(--workspace-settings-dialog-padding); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); color: var(--dl-text-primary); color-scheme: dark; font: inherit; text-align: left; }
.project-config[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); }
.project-config__head, .project-config__actions { flex-shrink: 0; }
.project-config__heading { display: flex; align-items: center; gap: var(--dl-space-3); min-width: 0; }
.project-config__mark { display: grid; place-items: center; flex: none; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-raised); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.project-config__identity { min-width: 0; }
.project-config__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.project-config__path { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.project-config__scope { margin-block-start: var(--dl-space-3); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.project-config__body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-1); scrollbar-width: thin; scrollbar-color: var(--dl-border-strong) transparent; }
.project-config__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--dl-space-3); }
.project-config :deep(.project-config__save-state) { flex: 1 1 0; min-width: 0; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); overflow-wrap: anywhere; }
.project-config :deep(.project-config__save-state[data-state='dirty']), .project-config :deep(.project-config__save-state[data-state='saving']) { color: var(--dl-text-secondary); }
.project-config :deep(.project-config__save-state[data-state='saved']) { color: var(--dl-success); }
.project-config :deep(.project-config__save-state[data-state='error']), .project-config :deep(.project-config__save-state[data-state='invalid']) { color: var(--dl-error); }
.project-config :deep(.project-config__buttons) { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); }
.project-config :deep(.project-config__buttons .dl-btn) { min-block-size: var(--dl-target-size); }
.project-config :deep(.project-config__load-state) { display: grid; justify-items: start; gap: var(--dl-space-3); min-height: calc(var(--dl-space-12) * 4); align-content: center; color: var(--dl-text-secondary); }
.project-config :deep(.project-config__error) { color: var(--dl-error); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.project-config :deep(.field__input) { inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.project-config :deep(.field__input:focus-visible) { border-color: var(--dl-focus-border); outline: none; box-shadow: var(--dl-focus-halo); }
.project-config :deep(.field__input:disabled) { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.project-config :deep(.field__select) { appearance: none; min-inline-size: 0; max-inline-size: 100%; padding-inline-end: var(--dl-space-8); }
.project-config button:focus-visible, .project-config :deep(button:focus-visible), .project-config :deep(input:focus-visible), .project-config :deep(select:focus-visible) { outline: none; box-shadow: var(--dl-focus-ring); }
@media (max-width: 767px) {
  .project-config :deep(.project-config__save-state) { flex-basis: 100%; }
  .project-config :deep(.project-config__buttons) { width: 100%; justify-content: flex-end; }
}
</style>
