<script setup lang="ts">
// 「添加市场」弹层:填写 marketplace.json 的来源与注册作用域。
//
// 作用域用三张单选项展示,并直接写出会写入哪个 settings 文件 —— 这是 user / project / local
// 三个层级的差别所在,不能只给三个缩写。自动更新用原生复选框(不是开关):它在添加时是
// 一次性声明,和插件行里的启用开关不是同一种控件。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { MarketplaceConfig } from '../contracts/generated/marketplace-config'
import type { PluginScopeId } from '../contracts/generated/plugin'
import { useI18n } from '../i18n'

const props = defineProps<{
  open: boolean
  busy: boolean
  error: string
}>()
const emit = defineEmits<{
  submit: [config: MarketplaceConfig]
  cancel: []
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const sourceRef = ref<HTMLInputElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const source = ref('')
const name = ref('')
const scope = ref<PluginScopeId>('user')
const autoUpdate = ref(false)
const dialogId = `marketplace-add-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const hintId = `${dialogId}-hint`

const scopeOptions = computed(() => (['user', 'project', 'local'] as const).map((id) => ({
  id,
  label: t.value.workspace.plugins.scopeLabel[id],
  hint: t.value.workspace.plugins.scopeHint[id],
})))
const canSubmit = computed(() => source.value.trim() !== '' && name.value.trim() !== '' && !props.busy)

function reset(): void {
  source.value = ''
  name.value = ''
  scope.value = 'user'
  autoUpdate.value = false
}

function finish(): void {
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  emit('cancel')
}

function submit(): void {
  if (!canSubmit.value) return
  emit('submit', {
    name: name.value.trim(),
    source: source.value.trim(),
    scope: scope.value,
    autoUpdate: autoUpdate.value,
  })
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
  reset()
  dialog.showModal()
  sourceRef.value?.focus()
}, { immediate: true })

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef" class="market-add" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="hintId"
    @cancel.prevent="finish" @click="onBackdropClick"
  >
    <div class="market-add__head">
      <h2 :id="titleId" class="market-add__title">{{ t.workspace.plugins.addMarketplaceTitle }}</h2>
      <p :id="hintId" class="market-add__hint">{{ t.workspace.plugins.addMarketplaceHint }}</p>
    </div>

    <form class="market-add__body" @submit.prevent="submit">
      <label class="field">
        <span class="field__label">{{ t.workspace.plugins.source }}</span>
        <input
          ref="sourceRef" v-model="source" type="text" class="field__input"
          :placeholder="t.workspace.plugins.sourcePlaceholder" autocomplete="off" spellcheck="false"
        >
      </label>
      <label class="field">
        <span class="field__label">{{ t.workspace.plugins.name }}</span>
        <input
          v-model="name" type="text" class="field__input"
          :placeholder="t.workspace.plugins.namePlaceholder" autocomplete="off"
        >
      </label>

      <fieldset class="market-add__scopes">
        <legend class="field__label">{{ t.workspace.plugins.marketplaceScope }}</legend>
        <label v-for="option in scopeOptions" :key="option.id" class="scope-option" :data-checked="scope === option.id ? 'true' : undefined">
          <input v-model="scope" type="radio" name="marketplace-scope" :value="option.id">
          <span class="scope-option__body">
            <span class="scope-option__label">{{ option.label }}</span>
            <span class="scope-option__hint">{{ option.hint }}</span>
          </span>
        </label>
      </fieldset>

      <label class="market-add__check">
        <input v-model="autoUpdate" type="checkbox">
        <span class="market-add__check-body">
          <span class="market-add__check-label">{{ t.workspace.plugins.marketplaceAutoUpdate }}</span>
          <span class="market-add__check-hint">{{ t.workspace.plugins.marketplaceAutoUpdateHint }}</span>
        </span>
      </label>

      <p v-if="error !== ''" class="market-add__error" role="alert">{{ error }}</p>

      <div class="market-add__actions">
        <button type="button" class="dl-btn dl-btn--ghost" :disabled="busy" @click="finish">{{ t.workspace.plugins.cancel }}</button>
        <button type="submit" class="dl-btn dl-btn--primary" :disabled="!canSubmit">
          {{ busy ? t.workspace.plugins.adding : t.workspace.plugins.add }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.market-add {
  width: min(520px, calc(100% - 2 * var(--dl-space-6)));
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
.market-add { color-scheme: dark; }
.market-add::backdrop { background-color: var(--dl-bg-sunken); }
.market-add[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); }

.market-add__head { display: grid; gap: var(--dl-space-1); }
.market-add__title { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.market-add__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.market-add__body { display: flex; flex-direction: column; gap: var(--dl-space-4); min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-inline-end: var(--dl-space-1); }
.field { display: grid; gap: var(--dl-space-1); }
.field__label { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.field__input { inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.field__input::placeholder { color: var(--dl-text-tertiary); }
.field__input:focus-visible { border-color: var(--dl-border-strong); outline: none; box-shadow: var(--dl-focus-ring); }

.market-add__scopes { display: grid; gap: var(--dl-space-2); border: none; margin: 0; padding: 0; }
.scope-option { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--dl-space-2); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); }
.scope-option[data-checked='true'] { border-color: var(--dl-accent); background: var(--dl-accent-soft); }
.scope-option input { inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); margin-block-start: var(--dl-border-width); accent-color: var(--dl-accent); }
.scope-option__body { display: grid; gap: var(--dl-space-1); min-width: 0; }
.scope-option__label { color: var(--dl-text-primary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); letter-spacing: var(--dl-tracking-caps); }
.scope-option__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.scope-option:focus-within { box-shadow: var(--dl-focus-ring); }

.market-add__check { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--dl-space-2); }
.market-add__check input { inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); margin-block-start: var(--dl-border-width); accent-color: var(--dl-accent); }
.market-add__check-body { display: grid; gap: var(--dl-space-1); }
.market-add__check-label { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.market-add__check-hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.market-add__check input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }

.market-add__error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.market-add__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); }
.market-add__actions .dl-btn { min-block-size: var(--dl-target-size); }
</style>
