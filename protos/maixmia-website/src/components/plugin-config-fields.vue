<script setup lang="ts">
// 五种插件配置字段的共享渲染:安装期与详情页只通过 mode 区分 secret 语义。
import { NInput, NSwitch } from 'naive-ui'
import type { PluginConfigSchema } from '../contracts/generated/plugin'
import { useI18n } from '../i18n'
import SelectField from './select-field.vue'

const props = defineProps<{
  fields: readonly PluginConfigSchema[]
  values: Record<string, string>
  errors: Record<string, string>
  secretSet: Record<string, boolean>
  mode: 'install' | 'detail'
  formPrefix: string
  busy: boolean
}>()
const emit = defineEmits<{ update: [key: string, value: string] }>()
const { t } = useI18n()

function controlId(field: PluginConfigSchema): string {
  return `${props.formPrefix}-${field.key}`
}
function descriptionId(field: PluginConfigSchema): string {
  return `${controlId(field)}-desc`
}
function errorId(field: PluginConfigSchema): string {
  return `${controlId(field)}-error`
}
function describedBy(field: PluginConfigSchema): string {
  return [descriptionId(field), ...(props.errors[field.key] === undefined ? [] : [errorId(field)])].join(' ')
}
function inputProps(field: PluginConfigSchema): Record<string, string | boolean> {
  return {
    id: controlId(field),
    'aria-describedby': describedBy(field),
    'aria-required': field.required,
    'aria-invalid': props.errors[field.key] === undefined ? 'false' : 'true',
    'data-config-control': '',
    'data-config-key': field.key,
    autocomplete: 'off',
    spellcheck: false,
    ...(field.type === 'number' ? { inputmode: 'decimal' } : {}),
  }
}
function secretPlaceholder(field: PluginConfigSchema): string {
  if (props.mode === 'detail' && props.secretSet[field.key] === true) return t.value.workspace.plugins.secretSetPlaceholder
  return t.value.workspace.plugins.secretPlaceholder
}
function updateChoice(field: PluginConfigSchema, event: Event): void {
  if (event.target instanceof HTMLSelectElement) emit('update', field.key, event.target.value)
}
</script>

<template>
  <div
    v-for="field in fields" :key="field.key" class="plugin-field"
    :class="{ 'plugin-field--switch': field.type === 'boolean' }" :data-type="field.type"
  >
    <div class="plugin-field-copy">
      <div class="plugin-field-head">
        <label :id="`${controlId(field)}-label`" :for="controlId(field)">{{ field.label }}</label>
        <span v-if="field.required" class="plugin-required">{{ t.workspace.plugins.required }}</span>
      </div>
      <p :id="descriptionId(field)">{{ field.description }}</p>
    </div>
    <NSwitch
      v-if="field.type === 'boolean'" :id="controlId(field)" class="plugin-switch"
      :value="values[field.key] === 'true'" :disabled="busy"
      :aria-labelledby="`${controlId(field)}-label`" :aria-describedby="describedBy(field)"
      :data-config-control="''" :data-config-key="field.key"
      @update:value="(value: boolean) => emit('update', field.key, String(value))"
    />
    <SelectField v-else-if="field.type === 'choice'">
      <select
        :id="controlId(field)" class="plugin-choice" :value="values[field.key] ?? ''" :disabled="busy"
        :aria-describedby="describedBy(field)" :aria-required="field.required"
        :aria-invalid="errors[field.key] === undefined ? 'false' : 'true'"
        :data-config-control="''" :data-config-key="field.key" @change="updateChoice(field, $event)"
      >
        <option value="">{{ t.workspace.plugins.choicePlaceholder }}</option>
        <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
      </select>
    </SelectField>
    <NInput
      v-else :value="values[field.key] ?? ''" :type="field.type === 'secret' ? 'password' : 'text'"
      :disabled="busy" :placeholder="field.type === 'secret' ? secretPlaceholder(field) : ''"
      :input-props="inputProps(field)"
      @update:value="(value: string) => emit('update', field.key, value)"
    />
    <p v-if="errors[field.key] !== undefined" :id="errorId(field)" class="plugin-field-error" role="alert">{{ errors[field.key] }}</p>
  </div>
</template>

<style scoped>
.plugin-field { display: grid; gap: var(--dl-space-2); min-inline-size: 0; }
.plugin-field-copy { display: grid; gap: var(--dl-space-1); min-inline-size: 0; }
.plugin-field-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--dl-space-1); }
.plugin-field-head label { color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); font-weight: 500; }
.plugin-field p { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-required, .plugin-field .plugin-field-error { color: var(--dl-warning); }
.plugin-field .plugin-field-error { color: var(--dl-error); }
.plugin-field--switch { grid-template-columns: minmax(0, 1fr) auto; align-items: start; column-gap: var(--dl-space-3); }
.plugin-field--switch .plugin-switch { justify-self: end; }
.plugin-field--switch .plugin-field-error { grid-column: 1 / -1; }
.plugin-switch { min-inline-size: var(--dl-space-8); min-block-size: var(--dl-space-6); justify-self: start; }
.plugin-switch:focus-visible { box-shadow: var(--dl-focus-ring); }
.plugin-field :deep(.n-input) { min-inline-size: 0; }
.plugin-field :deep(.n-input__input-el) { min-block-size: var(--dl-target-size); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.plugin-choice { inline-size: 100%; min-inline-size: 0; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font: inherit; font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-choice:hover:not(:disabled) { border-color: var(--dl-border-strong); }
.plugin-choice:focus-visible { outline: none; border-color: var(--dl-focus-border); box-shadow: var(--dl-focus-halo); }
.plugin-choice:active:not(:disabled) { border-color: var(--dl-accent); }
.plugin-choice:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.plugin-choice[aria-invalid='true'] { border-color: var(--dl-error); }
@media (max-width: 1023px) {
  .plugin-switch { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
}
</style>
