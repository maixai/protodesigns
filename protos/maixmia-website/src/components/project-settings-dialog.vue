<script setup lang="ts">
// 项目设置:项目级插件对打开该项目的所有 Agent 生效(对应 .claude/settings.json)。
//
// 项目级插件与市场都在这里:插件按所属市场分组,市场卡片头管来源、自动更新与移除。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Project } from '../contracts/generated/project'
import { useI18n } from '../i18n'
import PluginManager from './plugin-manager.vue'

const props = defineProps<{
  open: boolean
  project: Project | undefined
}>()
const emit = defineEmits<{ cancel: [] }>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const dialogId = `project-settings-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const hintId = `${dialogId}-hint`

function finish(): void {
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  emit('cancel')
}

function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) finish()
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
}, { immediate: true })

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef" class="project-settings" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="hintId"
    @cancel.prevent="finish" @click="onBackdropClick"
  >
    <div class="project-settings__head">
      <h2 :id="titleId" class="project-settings__title">{{ t.workspace.projectSettings.title }}</h2>
      <p class="project-settings__project">{{ project?.name ?? '' }}</p>
      <p :id="hintId" class="project-settings__path">{{ project?.path ?? '' }}</p>
    </div>

    <div class="project-settings__body">
      <PluginManager
        v-if="open && project" scope="project"
        :owner-id="project.path" :owner-name="project.name"
      />
    </div>

    <div class="project-settings__actions">
      <button type="button" class="dl-btn dl-btn--ghost" @click="finish">{{ t.workspace.plugins.done }}</button>
    </div>
  </dialog>
</template>

<style scoped>
.project-settings {
  width: min(620px, calc(100% - 2 * var(--dl-space-6)));
  max-height: calc(100% - 2 * var(--dl-space-6));
  margin: auto;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-xl);
  background-color: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font: inherit;
  text-align: left;
  color-scheme: dark;
}
.project-settings::backdrop { background-color: var(--dl-bg-sunken); }
.project-settings[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); }

.project-settings__head { display: grid; gap: var(--dl-space-1); }
.project-settings__title { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.project-settings__project { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.project-settings__path { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.project-settings__body { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-inline-end: var(--dl-space-1); }
.project-settings__actions { display: flex; justify-content: flex-end; flex: none; }
.project-settings__actions .dl-btn { min-block-size: var(--dl-target-size); }
</style>
