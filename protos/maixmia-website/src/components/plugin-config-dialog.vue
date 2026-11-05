<script setup lang="ts">
// 所有插件共用同一个安装审查窗;必填配置只是窗体内的条件区块。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Plugin } from '../contracts/generated/plugin'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'
import { installConfigDraft, pluginConfigValues, validatePluginConfig } from './agent-plugin-config'
import type { PluginConfigIssue } from './agent-plugin-config'
import PluginConfigFields from './plugin-config-fields.vue'
import { useI18n } from '../i18n'

const props = defineProps<{ plugin: Plugin; marketplaceName: string; agentName: string; scopeText?: string; busy: boolean; error: string }>()
const emit = defineEmits<{ cancel: []; submit: [values: readonly PluginConfigValue[]] }>()
const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)
const drafts = ref<Record<string, string>>(installConfigDraft(props.plugin.config))
const errors = ref<Record<string, string>>({})
const hasConfig = computed(() => props.plugin.config.length > 0)
const dialogId = `plugin-install-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const scopeId = `${dialogId}-scope`
const formPrefix = `${dialogId}-field`

function requestClose(): void {
  if (!props.busy) emit('cancel')
}
function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialogRef.value) requestClose()
}
function issueMessage(issue: PluginConfigIssue): string {
  if (issue.kind === 'number') return t.value.workspace.plugins.configNumberInvalid
  if (issue.kind === 'choice') return t.value.workspace.plugins.configChoiceInvalid
  return t.value.workspace.plugins.configRequired
}
function updateValue(key: string, value: string): void {
  drafts.value[key] = value
  const next = { ...errors.value }
  delete next[key]
  errors.value = next
}
async function focusField(key: string): Promise<void> {
  await nextTick()
  const control = [...(dialogRef.value?.querySelectorAll<HTMLElement>('[data-config-control]') ?? [])]
    .find((element) => element.dataset['configKey'] === key)
  control?.focus({ preventScroll: true })
  control?.scrollIntoView({ block: 'nearest' })
}
async function submit(): Promise<void> {
  if (props.busy) return
  if (!hasConfig.value) {
    emit('submit', [])
    return
  }
  const issues = validatePluginConfig(props.plugin.config, drafts.value, 'install', () => false)
  if (issues.length > 0) {
    errors.value = Object.fromEntries(issues.map((issue) => [issue.key, issueMessage(issue)]))
    const first = issues[0]
    if (first !== undefined) await focusField(first.key)
    return
  }
  errors.value = {}
  emit('submit', pluginConfigValues(props.plugin.config, drafts.value, 'install'))
}

onMounted(async () => {
  const dialog = dialogRef.value
  if (dialog === null) return
  dialog.showModal()
  await nextTick()
  if (hasConfig.value) dialog.querySelector<HTMLElement>('[data-config-control]')?.focus({ preventScroll: true })
  else cancelRef.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  if (dialogRef.value?.open === true) dialogRef.value.close()
})
</script>

<template>
  <dialog
    ref="dialogRef" class="plugin-config-dialog dl-modal-scrim" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="scopeId"
    @cancel.prevent.stop="requestClose" @keydown.esc.stop @click="onBackdropClick"
  >
    <section class="plugin-config-dialog__surface">
      <header class="plugin-config-dialog__header">
        <p class="plugin-config-dialog__eyebrow">{{ t.workspace.plugins.confirmInstallTitle }}</p>
        <h3 :id="titleId" class="plugin-config-dialog__title">{{ plugin.name }}</h3>
        <p class="plugin-config-dialog__meta"><span>v{{ plugin.version }}</span><span aria-hidden="true">·</span><span>{{ marketplaceName }}</span><span aria-hidden="true">·</span><span>{{ plugin.publisher }}</span></p>
      </header>
      <form class="plugin-config-dialog__form" @submit.prevent="submit">
        <div class="plugin-config-dialog__body">
          <p class="plugin-config-dialog__description">{{ plugin.description }}</p>
          <p :id="scopeId" class="plugin-config-dialog__scope">{{ scopeText || t.workspace.plugins.confirmInstallScope.replace('{name}', agentName) }}</p>
          <section v-if="hasConfig" class="plugin-config-dialog__section" :aria-labelledby="`${dialogId}-fields`">
            <h4 :id="`${dialogId}-fields`" class="plugin-config-dialog__section-title">{{ t.workspace.plugins.installFieldsTitle }}</h4>
            <PluginConfigFields
              :fields="plugin.config" :values="drafts" :errors="errors" :secret-set="{}"
              mode="install" :form-prefix="formPrefix" :busy="busy" @update="updateValue"
            />
          </section>
          <p v-if="error" class="plugin-config-dialog__error" role="alert">{{ error }}</p>
        </div>
        <footer class="plugin-config-dialog__footer">
          <button ref="cancelRef" type="button" class="plugin-config-dialog__action" :disabled="busy" @click="requestClose">{{ t.workspace.plugins.cancel }}</button>
          <button type="submit" class="plugin-config-dialog__action plugin-config-dialog__action--primary" :disabled="busy">{{ busy ? t.workspace.plugins.installing : t.workspace.plugins.install }}</button>
        </footer>
      </form>
    </section>
  </dialog>
</template>

<style scoped>
.plugin-config-dialog { inline-size: min(var(--workspace-dialog-width-compact), calc(100vw - 2 * var(--workspace-dialog-margin))); max-inline-size: none; max-block-size: var(--workspace-dialog-viewport-max-height); margin: auto; padding: 0; border: 0; background: transparent; overflow: visible; color: var(--dl-text-primary); }
.plugin-config-dialog__surface { display: flex; flex-direction: column; max-block-size: var(--workspace-dialog-viewport-max-height); overflow: hidden; border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); }
.plugin-config-dialog__header { flex: none; display: grid; gap: var(--dl-space-1); padding: var(--dl-space-4) var(--workspace-settings-dialog-padding); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.plugin-config-dialog__eyebrow { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); font-weight: 500; letter-spacing: var(--dl-tracking-label); }
.plugin-config-dialog__title { font-size: var(--dl-font-size-lg); font-weight: 500; line-height: var(--dl-line-snug); overflow-wrap: anywhere; }
.plugin-config-dialog__meta { display: flex; flex-wrap: wrap; gap: var(--dl-space-1); color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.plugin-config-dialog__form { display: flex; flex: 1; flex-direction: column; min-block-size: 0; }
.plugin-config-dialog__body { display: grid; flex: 1; gap: var(--dl-space-4); min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-4) var(--workspace-settings-dialog-padding); }
.plugin-config-dialog__description, .plugin-config-dialog__scope { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.plugin-config-dialog__section { display: grid; gap: var(--dl-space-2); min-inline-size: 0; }
.plugin-config-dialog__section-title { padding-block-end: var(--dl-space-2); border-block-end: var(--dl-border-width) solid var(--dl-border-base); color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-weight: 500; letter-spacing: var(--dl-tracking-caps); line-height: var(--dl-line-snug); text-transform: uppercase; }
.plugin-config-dialog__error { padding: var(--dl-space-2); border: var(--dl-border-width) solid color-mix(in srgb, var(--dl-error) 35%, transparent); border-radius: var(--dl-radius-md); background: color-mix(in srgb, var(--dl-error) 8%, transparent); color: var(--dl-error); font-size: var(--dl-font-size-xs); }
.plugin-config-dialog__footer { flex: none; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--dl-space-2); padding: var(--dl-space-2) var(--workspace-settings-dialog-padding); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.plugin-config-dialog__action { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); }
.plugin-config-dialog__action--primary { border-color: var(--dl-accent); background: var(--dl-accent); color: var(--dl-text-on-accent); }
.plugin-config-dialog__action:hover:not(:disabled) { background: var(--dl-bg-hover); }
.plugin-config-dialog__action--primary:hover:not(:disabled) { background: var(--dl-accent-hover); }
.plugin-config-dialog__action:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.plugin-config-dialog__action:active:not(:disabled) { background: var(--dl-bg-sunken); }
.plugin-config-dialog__action--primary:active:not(:disabled) { background: var(--dl-accent-active); }
.plugin-config-dialog__action:disabled { border-color: var(--dl-border-base); background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
</style>
