<script setup lang="ts">
// 插件配置弹层:渲染插件 manifest 声明的配置项(文本 / 密钥 / 开关)。
//
// 密钥永不回显:表单里留空 = 保持已保存的值,isSet 用占位文案表达。必填项为空时在本地
// 先拦一次(接口还会再校验),失败不清空用户已输入的内容。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Plugin } from '../contracts/generated/plugin'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'
import { useI18n } from '../i18n'

const props = defineProps<{
  open: boolean
  plugin: Plugin | undefined
  marketplaceId: string
  busy: boolean
  error: string
}>()
const emit = defineEmits<{
  submit: [values: PluginConfigValue[]]
  cancel: []
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const drafts = ref<Record<string, string>>({})
const localError = ref('')
const dialogId = `plugin-config-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const hintId = `${dialogId}-hint`

const errorText = computed(() => localError.value !== '' ? localError.value : props.error)
const scopeLabel = computed(() => (props.plugin === undefined
  ? ''
  : t.value.workspace.plugins.scopeLabel[props.plugin.scope]))

function reset(): void {
  const next: Record<string, string> = {}
  for (const field of props.plugin?.config ?? []) {
    // 密钥一律从空开始:真实值不回显,留空即保持。
    next[field.key] = field.type === 'secret' ? '' : field.value
  }
  drafts.value = next
  localError.value = ''
}

function secretPlaceholder(isSet: boolean): string {
  return isSet ? t.value.workspace.plugins.secretSetPlaceholder : t.value.workspace.plugins.secretPlaceholder
}

function toggleLabel(value: string | undefined): string {
  return value === 'true' ? t.value.workspace.plugins.enabled : t.value.workspace.plugins.disabled
}

function finish(): void {
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  emit('cancel')
}

function submit(): void {
  const plugin = props.plugin
  if (plugin === undefined || props.busy) return
  const values: PluginConfigValue[] = []
  let invalid = false
  for (const field of plugin.config) {
    const raw = drafts.value[field.key] ?? ''
    if (field.type === 'boolean') {
      values.push({ key: field.key, value: raw === 'true' ? 'true' : 'false' })
      continue
    }
    if (field.type === 'secret') {
      // 空 secret = 保持已保存值;从未保存过且必填才算缺失。
      if (raw !== '') values.push({ key: field.key, value: raw })
      else if (field.required && !field.isSet) invalid = true
      continue
    }
    if (field.required && raw.trim() === '') invalid = true
    values.push({ key: field.key, value: raw })
  }
  if (invalid) {
    localError.value = t.value.workspace.plugins.configRequired
    return
  }
  emit('submit', values)
}

function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) finish()
}

watch(drafts, () => { localError.value = '' }, { deep: true })

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
  reset()
  dialog.showModal()
  bodyRef.value?.querySelector<HTMLInputElement>('input')?.focus()
}, { immediate: true })

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef" class="config" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="hintId"
    @cancel.prevent="finish" @click="onBackdropClick"
  >
    <div class="config__head">
      <h2 :id="titleId" class="config__title">{{ t.workspace.plugins.configureTitle.replace('{name}', plugin?.name ?? '') }}</h2>
      <p :id="hintId" class="config__hint">{{ t.workspace.plugins.configureHint }}</p>
      <p v-if="plugin" class="config__identity">
        <code>{{ plugin.id }}@{{ marketplaceId }}</code>
        <span class="config__scope">{{ scopeLabel }}</span>
      </p>
    </div>

    <form ref="bodyRef" class="config__body" @submit.prevent="submit">
      <div v-for="field in plugin?.config ?? []" :key="field.key" class="field" :data-type="field.type">
        <div class="field__label-row">
          <label class="field__label" :for="`${dialogId}-${field.key}`">{{ field.label }}</label>
          <span v-if="field.required" class="field__required">{{ t.workspace.plugins.required }}</span>
        </div>
        <p :id="`${dialogId}-${field.key}-desc`" class="field__description">{{ field.description }}</p>

        <label v-if="field.type === 'boolean'" class="field__check">
          <input
            :id="`${dialogId}-${field.key}`" v-model="drafts[field.key]" type="checkbox"
            true-value="true" false-value="false"
            :aria-describedby="`${dialogId}-${field.key}-desc`"
          >
          <span>{{ toggleLabel(drafts[field.key]) }}</span>
        </label>
        <input
          v-else :id="`${dialogId}-${field.key}`" v-model="drafts[field.key]"
          :type="field.type === 'secret' ? 'password' : 'text'"
          class="field__input" :placeholder="field.type === 'secret' ? secretPlaceholder(field.isSet) : ''"
          :aria-describedby="`${dialogId}-${field.key}-desc`"
          autocomplete="off" spellcheck="false"
        >
      </div>

      <p v-if="errorText !== ''" class="config__error" role="alert">{{ errorText }}</p>

      <div class="config__actions">
        <button type="button" class="dl-btn dl-btn--ghost" :disabled="busy" @click="finish">{{ t.workspace.plugins.cancel }}</button>
        <button type="submit" class="dl-btn dl-btn--primary" :disabled="busy">
          {{ busy ? t.workspace.plugins.saving : t.workspace.plugins.save }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.config {
  width: min(500px, calc(100% - 2 * var(--dl-space-6)));
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
.config { color-scheme: dark; }
.config::backdrop { background-color: var(--dl-bg-sunken); }
.config[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); }

.config__head { display: grid; gap: var(--dl-space-1); }
.config__title { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.config__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.config__identity { display: flex; align-items: center; gap: var(--dl-space-2); color: var(--dl-text-tertiary); }
.config__identity code { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.config__scope { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); letter-spacing: var(--dl-tracking-caps); }

.config__body { display: flex; flex-direction: column; gap: var(--dl-space-4); min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-inline-end: var(--dl-space-1); }
.field { display: grid; gap: var(--dl-space-1); }
.field__label-row { display: flex; align-items: baseline; gap: var(--dl-space-2); }
.field__label { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.field__required { color: var(--dl-warning); font-size: var(--dl-font-size-xs); }
.field__description { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.field__input { inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.field__input::placeholder { color: var(--dl-text-tertiary); }
.field__input:focus-visible { border-color: var(--dl-border-strong); outline: none; box-shadow: var(--dl-focus-ring); }
.field__check { display: inline-flex; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.field__check input { inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); accent-color: var(--dl-accent); }
.field__check input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }

.config__error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.config__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); }
.config__actions .dl-btn { min-block-size: var(--dl-target-size); }
</style>
