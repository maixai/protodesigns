<script setup lang="ts">
// Agent 的设置 / 新建对话框:两者共用同一套身份表单。
// 创建多一步模板选择(把空白画布变成有依据的起点),设置多一段删除(危险动作。
//
// 用原生 dialog.showModal():自带焦点陷阱、Esc 与 aria-modal;top layer 内仍继承
// .dl-scope--dark 的 CSS 变量,故不 Teleport。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentConfig } from '../contracts/generated/agent-config'
import { AGENT_MODELS, DEFAULT_AGENT_MODEL } from '../data/agents'
import { useI18n } from '../i18n'

const props = defineProps<{
  open: boolean
  mode: 'create' | 'edit'
  // 编辑模式的当前 Agent;创建模式不需要。
  agent?: AgentSummary | undefined
  canDelete: boolean
  busy: boolean
  error: string
}>()
const emit = defineEmits<{
  submit: [config: AgentConfig]
  delete: []
  cancel: []
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const nameRef = ref<HTMLInputElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const confirmingDelete = ref(false)
const name = ref('')
const role = ref('')
const modelId = ref(DEFAULT_AGENT_MODEL)
const selectedTemplate = ref('')
const dialogId = `agent-editor-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const hintId = `${dialogId}-hint`

type TemplateId = 'planning' | 'research' | 'writing' | 'custom'
const templates = computed<{ id: TemplateId; label: string; hint: string }[]>(() => [
  { id: 'planning', label: t.value.workspace.agentAdmin.templatePlanning, hint: t.value.workspace.agentAdmin.templatePlanningHint },
  { id: 'research', label: t.value.workspace.agentAdmin.templateResearch, hint: t.value.workspace.agentAdmin.templateResearchHint },
  { id: 'writing', label: t.value.workspace.agentAdmin.templateWriting, hint: t.value.workspace.agentAdmin.templateWritingHint },
  { id: 'custom', label: t.value.workspace.agentAdmin.templateCustom, hint: t.value.workspace.agentAdmin.templateCustomHint },
])

const isCreate = computed(() => props.mode === 'create')
const title = computed(() => (isCreate.value ? t.value.workspace.agentAdmin.createTitle : t.value.workspace.agentAdmin.settingsTitle))
const hint = computed(() => isCreate.value ? t.value.workspace.agentAdmin.createHint : t.value.workspace.agentAdmin.settingsHint)
const canSubmit = computed(() => name.value.trim() !== '' && role.value.trim() !== '' && !props.busy)

function reset(): void {
  confirmingDelete.value = false
  selectedTemplate.value = ''
  name.value = props.agent?.name ?? ''
  role.value = props.agent?.role ?? ''
  modelId.value = props.agent?.modelId ?? DEFAULT_AGENT_MODEL
}

function applyTemplate(id: TemplateId): void {
  selectedTemplate.value = id
  if (id === 'custom') {
    name.value = ''
    role.value = ''
    return
  }
  // 模板只是界面的默认值:填进去之后仍是普通输入框,用户可以改。
  name.value = t.value.workspace.agents[id]
  role.value = t.value.workspace.agentRoles[id]
}

function finish(action: 'submit' | 'cancel' | 'delete'): void {
  if (props.busy) return
  if (action === 'submit') {
    emit('submit', { name: name.value.trim(), role: role.value.trim(), modelId: modelId.value })
    return
  }
  if (action === 'delete') {
    emit('delete')
    return
  }
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  emit('cancel')
}

// 删除是两步动作:第一次只把确认区展开并把焦点送过去,避免误触即删。
async function askDelete(): Promise<void> {
  if (!props.canDelete || props.busy) return
  confirmingDelete.value = true
  await nextTick()
  dialogRef.value?.querySelector<HTMLButtonElement>('.agent-editor__danger-submit')?.focus()
}

function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) finish('cancel')
}

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
  reset()
  dialog.showModal()
  // 初始焦点落在名称:模板只是快捷填充,确认与修改都从名称开始。
  nameRef.value?.focus()
}, { immediate: true })

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef" class="agent-editor" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="hint !== '' ? hintId : undefined"
    @cancel.prevent="finish('cancel')" @click="onBackdropClick"
  >
    <div class="agent-editor__head">
      <h2 :id="titleId" class="agent-editor__title">{{ title }}</h2>
      <span v-if="!isCreate && agent?.builtIn" class="agent-editor__badge">{{ t.workspace.agentAdmin.builtIn }}</span>
      <p v-if="hint !== ''" :id="hintId" class="agent-editor__hint">{{ hint }}</p>
    </div>

    <div class="agent-editor__body">
      <fieldset v-if="isCreate" class="agent-editor__templates">
        <legend class="agent-editor__legend">{{ t.workspace.agentAdmin.templates }}</legend>
        <div class="template-grid">
          <button
            v-for="template in templates" :key="template.id" type="button"
            class="template-card" :aria-pressed="selectedTemplate === template.id"
            @click="applyTemplate(template.id)"
          >
            <span class="template-card__label">{{ template.label }}</span>
            <span class="template-card__hint">{{ template.hint }}</span>
          </button>
        </div>
      </fieldset>

      <div class="agent-editor__fields">
        <label class="field">
          <span class="field__label">{{ t.workspace.agentAdmin.name }}</span>
          <input ref="nameRef" v-model="name" type="text" class="field__input" maxlength="40" :placeholder="t.workspace.agentAdmin.namePlaceholder" autocomplete="off">
        </label>
        <label class="field">
          <span class="field__label">{{ t.workspace.agentAdmin.role }}</span>
          <input v-model="role" type="text" class="field__input" maxlength="80" :placeholder="t.workspace.agentAdmin.rolePlaceholder" autocomplete="off">
        </label>
        <label class="field">
          <span class="field__label">{{ t.workspace.agentAdmin.model }}</span>
          <select v-model="modelId" class="field__input field__select">
            <option v-for="model in AGENT_MODELS" :key="model.id" :value="model.id">{{ model.label }}</option>
          </select>
        </label>
      </div>

      <p v-if="error !== ''" class="agent-editor__error" role="alert">{{ error }}</p>

      <section v-if="!isCreate" class="agent-editor__danger">
        <h3 class="agent-editor__danger-title">{{ t.workspace.agentAdmin.delete }}</h3>
        <p class="agent-editor__danger-body">{{ t.workspace.agentAdmin.deleteBody }}</p>
        <div v-if="!confirmingDelete" class="agent-editor__danger-row">
          <button type="button" class="danger-trigger" :disabled="!canDelete || busy" @click="askDelete">
            {{ t.workspace.agentAdmin.delete }}
          </button>
          <p v-if="!canDelete" class="agent-editor__danger-hint">{{ t.workspace.agentAdmin.lastAgent }}</p>
        </div>
        <div v-else class="agent-editor__danger-confirm">
          <p class="agent-editor__danger-question">{{ t.workspace.agentAdmin.deleteTitle.replace('{name}', agent?.name ?? '') }}</p>
          <div class="agent-editor__danger-actions">
            <button type="button" class="dl-btn dl-btn--ghost" @click="confirmingDelete = false">{{ t.workspace.agentAdmin.deleteCancel }}</button>
            <button
              type="button" class="danger-confirm agent-editor__danger-submit"
              :disabled="busy" @click="finish('delete')"
            >
              {{ busy ? t.workspace.agentAdmin.deleting : t.workspace.agentAdmin.deleteConfirm }}
            </button>
          </div>
        </div>
      </section>
    </div>

    <div class="agent-editor__actions">
      <button type="button" class="dl-btn dl-btn--ghost" :disabled="busy" @click="finish('cancel')">{{ t.workspace.agentAdmin.cancel }}</button>
      <button type="button" class="dl-btn dl-btn--primary" :disabled="!canSubmit" @click="finish('submit')">
        {{ busy ? (isCreate ? t.workspace.agentAdmin.creating : t.workspace.agentAdmin.saving) : (isCreate ? t.workspace.agentAdmin.create : t.workspace.agentAdmin.save) }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.agent-editor {
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
.agent-editor { color-scheme: dark; }
.agent-editor::backdrop { background-color: var(--dl-bg-sunken); }
.agent-editor[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); }

.agent-editor__head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-2); }
.agent-editor__title { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.agent-editor__badge { padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.agent-editor__hint { flex-basis: 100%; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.agent-editor__body { display: flex; flex-direction: column; gap: var(--dl-space-4); min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-inline-end: var(--dl-space-1); }

.agent-editor__templates { display: grid; gap: var(--dl-space-2); border: none; padding: 0; margin: 0; }
.agent-editor__legend { margin-block-end: var(--dl-space-2); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--dl-space-2); }
.template-card { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); text-align: left; }
.template-card:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.template-card[aria-pressed='true'] { border-color: var(--dl-accent); background: var(--dl-accent-soft); }
.template-card__label { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); }
.template-card__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }

.agent-editor__fields { display: grid; gap: var(--dl-space-3); }
.field { display: grid; gap: var(--dl-space-1); }
.field__label { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.field__input { inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.field__input::placeholder { color: var(--dl-text-tertiary); }
.field__input:focus-visible { border-color: var(--dl-border-strong); outline: none; box-shadow: var(--dl-focus-ring); }
.field__select { appearance: auto; }

.agent-editor__error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.agent-editor__danger { display: grid; gap: var(--dl-space-2); padding-block-start: var(--dl-space-3); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.agent-editor__danger-title { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.agent-editor__danger-body, .agent-editor__danger-hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.agent-editor__danger-hint { color: var(--dl-warning); }
.agent-editor__danger-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); }
.danger-trigger { min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-error); font-size: var(--dl-font-size-xs); }
.danger-trigger:hover:not(:disabled) { border-color: var(--dl-error); background: var(--dl-bg-hover); }
.danger-trigger:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.agent-editor__danger-confirm { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-error); border-radius: var(--dl-radius-md); }
.agent-editor__danger-question { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.agent-editor__danger-actions { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); }
.danger-confirm { min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-3); border-radius: var(--dl-radius-md); background: var(--dl-error); color: var(--dl-text-on-accent); font-size: var(--dl-font-size-sm); }
.danger-confirm:hover:not(:disabled) { outline: var(--dl-border-width) solid var(--dl-error); outline-offset: var(--dl-space-1); }
.danger-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

.agent-editor__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); }
.agent-editor__actions .dl-btn { min-block-size: var(--dl-target-size); }

/* 触屏 / 窄屏:模板卡与输入框仍保持 44 的可点高度(默认已是 44)。 */
@media (max-width: 560px) {
  .template-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
