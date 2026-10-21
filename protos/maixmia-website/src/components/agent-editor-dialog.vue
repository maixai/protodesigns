<script setup lang="ts">
// Agent 设置与新建共用基本 / 模型两页;模板只填身份,模型配置独立保存。
//
// 用原生 dialog.showModal():自带焦点陷阱、Esc 与 aria-modal;top layer 内仍继承
// .dl-scope--dark 的 CSS 变量,故不 Teleport。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentConfig } from '../contracts/generated/agent-config'
import type { AgentModelConfig } from '../contracts/generated/agent-model-config'
import type { EffortLevel, ModelOption, ModelTierId } from '../data/models'
import { DEFAULT_MODEL, EFFORT_LEVELS, FALLBACK_PRIORITY, MODELS, TIER_DEFAULTS, groupModelsByProvider, modelById } from '../data/models'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import SelectField from './select-field.vue'

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
type ModelSection = 'defaults' | 'tiers' | 'advanced'
const MODEL_SECTIONS = ['defaults', 'tiers', 'advanced'] as const

interface ModelSectionOption {
  id: ModelSection
  label: string
  count: number
}

const dialogRef = ref<HTMLDialogElement | null>(null)
const nameRef = ref<HTMLInputElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const confirmingDelete = ref(false)
const name = ref('')
const note = ref('')
const modelConfig = ref<AgentModelConfig>(defaultModelConfig())
const activeTab = ref<'basic' | 'model'>('basic')
// 模型页内的三个并列分区;同一时刻只显示一个,避免展开后纵向过长。
const activeModelSection = ref<ModelSection>('defaults')
const bodyRef = ref<HTMLElement | null>(null)
const basicTabRef = ref<HTMLButtonElement | null>(null)
const modelTabRef = ref<HTMLButtonElement | null>(null)
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
const canSubmit = computed(() => name.value.trim() !== '' && note.value.trim() !== '' && modelConfig.value.defaultModelId.trim() !== '' && !props.busy)
const isModelDefault = computed(() => modelConfig.value.defaultModelId === DEFAULT_MODEL.id
  && modelConfig.value.defaultEffortLevel === ''
  && modelConfig.value.subagentModelId === ''
  && modelConfig.value.subagentEffortLevel === ''
  && Object.values(modelConfig.value.tiers).every((tier) => tier.modelId === '' && tier.effortLevel === DEFAULT_TIER_EFFORT)
  && modelConfig.value.fallbackModelIds.length === 0
  && modelConfig.value.autoCompactWindowTokens === 0
  && modelConfig.value.maxThinkingTokens === 0)
const tiers = computed(() => [
  { id: 'fable', label: t.value.workspace.agentAdmin.modelTierFable, note: t.value.workspace.agentAdmin.modelTierFableNote },
  { id: 'opus', label: t.value.workspace.agentAdmin.modelTierOpus, note: t.value.workspace.agentAdmin.modelTierOpusNote },
  { id: 'sonnet', label: t.value.workspace.agentAdmin.modelTierSonnet, note: t.value.workspace.agentAdmin.modelTierSonnetNote },
  { id: 'haiku', label: t.value.workspace.agentAdmin.modelTierHaiku, note: t.value.workspace.agentAdmin.modelTierHaikuNote },
] satisfies { id: ModelTierId; label: string; note: string }[])

const DEFAULT_TIER_EFFORT: EffortLevel = 'high'
const TIER_IDS = ['fable', 'opus', 'sonnet', 'haiku'] as const
const COMPACT_WINDOW_OPTIONS = [0, 100_000, 200_000, 500_000, 1_000_000] as const
const THINKING_BUDGET_OPTIONS = [0, 8_192, 16_384, 32_768, 65_536] as const

// 默认值:主对话 effort 空 = 模型默认;子 Agent effort 空 = 跟随对话;
// 档位 effort 默认 high(不再默认「跟随对话」)。
function defaultModelConfig(): AgentModelConfig {
  return {
    defaultModelId: DEFAULT_MODEL.id,
    defaultEffortLevel: '',
    subagentModelId: '',
    subagentEffortLevel: '',
    tiers: {
      fable: { modelId: '', effortLevel: DEFAULT_TIER_EFFORT },
      opus: { modelId: '', effortLevel: DEFAULT_TIER_EFFORT },
      sonnet: { modelId: '', effortLevel: DEFAULT_TIER_EFFORT },
      haiku: { modelId: '', effortLevel: DEFAULT_TIER_EFFORT },
    },
    fallbackModelIds: [],
    autoCompactWindowTokens: 0,
    maxThinkingTokens: 0,
  }
}

function resetModels(): void {
  if (!props.busy) modelConfig.value = defaultModelConfig()
}

// 深拷贝:档位是嵌套对象、回退是数组,避免对话框与列表共享引用。
function cloneModelConfig(config: AgentModelConfig): AgentModelConfig {
  return {
    ...config,
    tiers: {
      fable: { ...config.tiers.fable },
      opus: { ...config.tiers.opus },
      sonnet: { ...config.tiers.sonnet },
      haiku: { ...config.tiers.haiku },
    },
    fallbackModelIds: [...config.fallbackModelIds],
  }
}

function modelNameOf(id: string): string {
  return t.value.workspace.models[modelById(id).nameKey]
}

// 模型选项同时显示渠道:全局模型库按渠道管理,Agent 配置需要看到模型从哪来。
function modelOptionLabel(model: ModelOption): string {
  return `${modelNameOf(model.id)} · ${model.provider}`
}

// 模型详情(ID / 窗口 / 说明)进 hover tooltip,不占版面。
function modelTitleOf(id: string): string {
  const model = modelById(id)
  return `${model.provider} · ${t.value.workspace.modelDescriptions[model.descriptionKey]} · ${model.id} · ${t.value.workspace.agentAdmin.modelWindow.replace('{window}', windowOf(model))}`
}

function tokenLabel(tokens: number): string {
  return tokens >= 1_000_000 ? `${Math.round(tokens / 1_000_000)}M` : `${Math.round(tokens / 1000)}K`
}

const compactWindowLabel = tokenLabel
// 思考预算按 1024 的整数倍展示(8K / 16K / 32K / 64K),避免 32768 被四舍五入成「33K」。
function thinkingBudgetLabel(tokens: number): string {
  return `${Math.round(tokens / 1024)}K`
}

function tierModelOf(tierId: ModelTierId): string {
  return modelConfig.value.tiers[tierId].modelId || TIER_DEFAULTS[tierId]
}

// 档位模型下拉去掉「跟随默认」前缀:第一项直接显示内置默认模型名,其余项排除它,
// 避免同一个模型名在下拉里出现两次;显式选了内置默认的旧数据在 reset() 里归一到空串。
function tierModelOptions(tierId: ModelTierId): readonly ModelOption[] {
  return MODELS.filter((model) => model.id !== TIER_DEFAULTS[tierId])
}

function supportsEffortOf(modelId: string): boolean {
  return modelById(modelId).supportsEffort
}

function effortAriaLabel(label: string): string {
  return `${label} · ${t.value.workspace.agentAdmin.modelEffortLabel}`
}

// 分区角标只报「改过几项」:默认模型按两行计,档位按四档计,高级按三组配置计。
const customizedTierCount = computed(() => Object.values(modelConfig.value.tiers).filter((tier) => tier.modelId !== '' || tier.effortLevel !== DEFAULT_TIER_EFFORT).length)
const defaultCustomCount = computed(() => {
  const config = modelConfig.value
  const conversationCustom = config.defaultModelId !== DEFAULT_MODEL.id || config.defaultEffortLevel !== ''
  const subagentCustom = config.subagentModelId !== '' || config.subagentEffortLevel !== ''
  return (conversationCustom ? 1 : 0) + (subagentCustom ? 1 : 0)
})
const advancedCustomCount = computed(() => (modelConfig.value.fallbackModelIds.length > 0 ? 1 : 0)
  + (modelConfig.value.autoCompactWindowTokens !== 0 ? 1 : 0)
  + (modelConfig.value.maxThinkingTokens !== 0 ? 1 : 0))

const modelSections = computed<ModelSectionOption[]>(() => [
  { id: 'defaults', label: t.value.workspace.agentAdmin.modelSubtabDefaults, count: defaultCustomCount.value },
  { id: 'tiers', label: t.value.workspace.agentAdmin.modelSubtabTiers, count: customizedTierCount.value },
  { id: 'advanced', label: t.value.workspace.agentAdmin.modelSubtabAdvanced, count: advancedCustomCount.value },
])

// 角标数字单独读没有语义,无障碍名称里补一句「N 项自定义」。
function modelSectionAriaLabel(section: ModelSectionOption): string {
  if (section.count === 0) return section.label
  return `${section.label} · ${t.value.workspace.agentAdmin.modelCustomCount.replace('{count}', String(section.count))}`
}

// 默认模型不能出现在回退链里:TS SDK 的 fallbackModel 等于 model 会在启动时抛错。
// 改默认模型时同步剔除,避免留下一个保存必失败的状态。
watch(() => modelConfig.value.defaultModelId, (id) => {
  if (modelConfig.value.fallbackModelIds.includes(id)) {
    modelConfig.value = { ...modelConfig.value, fallbackModelIds: modelConfig.value.fallbackModelIds.filter((item) => item !== id) }
  }
})

const fallbackCount = computed(() => modelConfig.value.fallbackModelIds.length)

// 第 index 个槽位可选的模型:包含自己当前值,去掉默认模型与其它槽位已选值,避免重复。
function fallbackOptionsFor(index: number): readonly ModelOption[] {
  const current = modelConfig.value.fallbackModelIds[index] ?? ''
  const selectedElsewhere = new Set(modelConfig.value.fallbackModelIds.filter((_, itemIndex) => itemIndex !== index))
  return MODELS.filter((model) => model.id === current
    || (model.id !== modelConfig.value.defaultModelId && !selectedElsewhere.has(model.id)))
}

function addFallback(): void {
  if (fallbackCount.value >= 3) return
  const used = new Set([modelConfig.value.defaultModelId, ...modelConfig.value.fallbackModelIds])
  const next = FALLBACK_PRIORITY.find((model) => !used.has(model.id))
  if (next === undefined) return
  modelConfig.value = { ...modelConfig.value, fallbackModelIds: [...modelConfig.value.fallbackModelIds, next.id] }
}

function updateFallback(index: number, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  const next = [...modelConfig.value.fallbackModelIds]
  next[index] = target.value
  modelConfig.value = { ...modelConfig.value, fallbackModelIds: next }
}

function moveFallback(index: number, delta: number): void {
  const target = index + delta
  const list = modelConfig.value.fallbackModelIds
  if (target < 0 || target >= list.length) return
  const next = [...list]
  const moved = next[index]
  const replaced = next[target]
  if (moved === undefined || replaced === undefined) return
  next[index] = replaced
  next[target] = moved
  modelConfig.value = { ...modelConfig.value, fallbackModelIds: next }
}

function removeFallback(index: number): void {
  modelConfig.value = { ...modelConfig.value, fallbackModelIds: modelConfig.value.fallbackModelIds.filter((_, itemIndex) => itemIndex !== index) }
}

function windowOf(model: ModelOption): string {
  const tokens = model.contextWindowTokens
  return tokens >= 1_000_000 ? `${Math.round(tokens / 1_000_000)}M` : `${Math.round(tokens / 1000)}K`
}

async function activateTab(tab: 'basic' | 'model', focus = false): Promise<void> {
  activeTab.value = tab
  await nextTick()
  if (bodyRef.value !== null) bodyRef.value.scrollTop = 0
  if (focus) (tab === 'basic' ? basicTabRef.value : modelTabRef.value)?.focus()
}

function onTabKeydown(event: KeyboardEvent): void {
  const tab = event.key === 'Home' ? 'basic' : event.key === 'End' ? 'model'
    : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? (activeTab.value === 'basic' ? 'model' : 'basic') : null
  if (tab === null) return
  event.preventDefault()
  void activateTab(tab, true)
}

// 模型分区切换:滚动回顶部,键盘切换时把焦点送到目标 tab。
async function activateModelSection(section: ModelSection, focus = false): Promise<void> {
  activeModelSection.value = section
  await nextTick()
  if (bodyRef.value !== null) bodyRef.value.scrollTop = 0
  if (focus) document.getElementById(`${dialogId}-model-tab-${section}`)?.focus()
}

function onModelSectionKeydown(event: KeyboardEvent): void {
  const current = MODEL_SECTIONS.indexOf(activeModelSection.value)
  const last = MODEL_SECTIONS.length - 1
  const next = event.key === 'ArrowRight' ? (current + 1) % MODEL_SECTIONS.length
    : event.key === 'ArrowLeft' ? (current - 1 + MODEL_SECTIONS.length) % MODEL_SECTIONS.length
      : event.key === 'Home' ? 0
        : event.key === 'End' ? last
          : -1
  if (next < 0) return
  event.preventDefault()
  const section = MODEL_SECTIONS[next]
  if (section === undefined) return
  void activateModelSection(section, true)
}

function reset(): void {
  confirmingDelete.value = false
  selectedTemplate.value = ''
  name.value = props.agent?.name ?? ''
  note.value = props.agent?.note ?? ''
  const saved = props.agent?.model
  const model = saved === undefined ? defaultModelConfig() : cloneModelConfig(saved)
  // 旧数据归一:显式等于内置默认的档位模型折叠回空串;空 / 非法 effort 回到 high。
  for (const id of TIER_IDS) {
    const tier = model.tiers[id]
    const effort = (EFFORT_LEVELS as readonly string[]).includes(tier.effortLevel) ? tier.effortLevel : DEFAULT_TIER_EFFORT
    model.tiers[id] = {
      modelId: tier.modelId === TIER_DEFAULTS[id] ? '' : tier.modelId,
      effortLevel: effort,
    }
  }
  // 旧数据或外部写入可能把默认模型放进回退链;打开时就地修正,保证「保存」永远可提交。
  modelConfig.value = { ...model, fallbackModelIds: model.fallbackModelIds.filter((id) => id !== model.defaultModelId) }
  activeTab.value = 'basic'
  activeModelSection.value = 'defaults'
  if (bodyRef.value !== null) bodyRef.value.scrollTop = 0
}

function applyTemplate(id: TemplateId): void {
  selectedTemplate.value = id
  if (id === 'custom') {
    name.value = ''
    note.value = ''
    return
  }
  // 模板只是界面的默认值:填进去之后仍是普通输入框,用户可以改。
  name.value = t.value.workspace.agents[id]
  note.value = t.value.workspace.agentNotes[id]
}

function finish(action: 'submit' | 'cancel' | 'delete'): void {
  if (props.busy) return
  if (action === 'submit') {
    emit('submit', { name: name.value.trim(), note: note.value.trim(), model: cloneModelConfig(modelConfig.value) })
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
  await nextTick()
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

    <div class="agent-editor__tabbar">
      <div class="agent-editor__tabs" role="tablist" :aria-label="t.workspace.agentAdmin.tabsLabel" @keydown="onTabKeydown">
        <button
          :id="`${dialogId}-tab-basic`" ref="basicTabRef" type="button" role="tab"
          :aria-selected="activeTab === 'basic'" :aria-controls="`${dialogId}-panel-basic`"
          :tabindex="activeTab === 'basic' ? 0 : -1" @click="activateTab('basic')"
        >{{ t.workspace.agentAdmin.tabBasic }}</button>
        <button
          :id="`${dialogId}-tab-model`" ref="modelTabRef" type="button" role="tab"
          :aria-selected="activeTab === 'model'" :aria-controls="`${dialogId}-panel-model`"
          :tabindex="activeTab === 'model' ? 0 : -1" @click="activateTab('model')"
        >{{ t.workspace.agentAdmin.tabModel }}</button>
      </div>
      <!-- 恢复默认只在模型配置非默认时出现:默认状态下不占视野,也不制造「有东西要修」的错觉。 -->
      <button
        v-if="activeTab === 'model' && !isModelDefault" type="button" class="agent-editor__reset"
        :disabled="busy" @click="resetModels"
      >{{ t.workspace.agentAdmin.modelReset }}</button>
    </div>

    <div ref="bodyRef" class="agent-editor__body">
      <div
        v-show="activeTab === 'basic'" :id="`${dialogId}-panel-basic`" class="agent-editor__panel"
        role="tabpanel" :aria-labelledby="`${dialogId}-tab-basic`" tabindex="0"
      >
      <fieldset v-if="isCreate" class="agent-editor__templates">
        <legend class="agent-editor__legend">{{ t.workspace.agentAdmin.templates }}</legend>
        <div class="template-grid">
          <button
            v-for="template in templates" :key="template.id" type="button"
            class="template-card" :aria-pressed="selectedTemplate === template.id"
            :disabled="busy" @click="applyTemplate(template.id)"
          >
            <span class="template-card__label">{{ template.label }}</span>
            <span class="template-card__hint">{{ template.hint }}</span>
          </button>
        </div>
      </fieldset>

      <div class="agent-editor__fields">
        <label class="field">
          <span class="field__label">{{ t.workspace.agentAdmin.name }}</span>
          <input ref="nameRef" v-model="name" :disabled="busy" required type="text" class="field__input" maxlength="40" :placeholder="t.workspace.agentAdmin.namePlaceholder" autocomplete="off">
        </label>
        <label class="field">
          <span class="field__label">{{ t.workspace.agentAdmin.note }}</span>
          <input v-model="note" :disabled="busy" required type="text" class="field__input" maxlength="80" :placeholder="t.workspace.agentAdmin.notePlaceholder" autocomplete="off">
        </label>
      </div>

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
            <button type="button" class="dl-btn dl-btn--ghost" :disabled="busy" @click="confirmingDelete = false">{{ t.workspace.agentAdmin.deleteCancel }}</button>
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

      <div
        v-show="activeTab === 'model'" :id="`${dialogId}-panel-model`" class="agent-editor__panel agent-editor__panel--model"
        role="tabpanel" :aria-labelledby="`${dialogId}-tab-model`" tabindex="0"
      >
        <!-- 二级分区用分段控件而不是第二层下划线 tab:视觉权重低于主 tab,滚动时吸顶。 -->
        <div class="model-subtabs">
          <div
            class="model-subtabs__track" role="tablist"
            :aria-label="t.workspace.agentAdmin.modelSubtabsLabel" @keydown="onModelSectionKeydown"
          >
            <button
              v-for="section in modelSections" :key="section.id"
              :id="`${dialogId}-model-tab-${section.id}`" type="button" role="tab"
              :aria-selected="activeModelSection === section.id"
              :aria-controls="`${dialogId}-model-panel-${section.id}`"
              :tabindex="activeModelSection === section.id ? 0 : -1"
              :aria-label="modelSectionAriaLabel(section)"
              @click="activateModelSection(section.id)"
            >
              <span>{{ section.label }}</span>
              <span v-if="section.count > 0" class="model-subtabs__count" aria-hidden="true">{{ section.count }}</span>
            </button>
          </div>
        </div>

        <div
          v-show="activeModelSection === 'defaults'" :id="`${dialogId}-model-panel-defaults`"
          class="model-subpanel" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-defaults`"
        >
          <p class="model-section__hint">{{ t.workspace.agentAdmin.modelDefaultHint }}</p>
          <div class="model-matrix">
            <div class="model-matrix__head" aria-hidden="true">
              <span>{{ t.workspace.agentAdmin.modelScopeLabel }}</span>
              <span>{{ t.workspace.agentAdmin.modelColumn }}</span>
              <span>{{ t.workspace.agentAdmin.modelEffortLabel }}</span>
            </div>
            <div class="model-matrix__row">
              <span class="model-matrix__label">{{ t.workspace.agentAdmin.modelConversationLabel }}</span>
              <SelectField>
                <select
                  v-model="modelConfig.defaultModelId" class="field__input field__select" :disabled="busy"
                  :title="modelTitleOf(modelConfig.defaultModelId)"
                  :aria-label="t.workspace.agentAdmin.modelConversationLabel"
                >
                  <optgroup v-for="group in groupModelsByProvider(MODELS)" :key="group.provider" :label="group.provider">
                    <option v-for="model in group.models" :key="model.id" :value="model.id">{{ modelOptionLabel(model) }}</option>
                  </optgroup>
                </select>
              </SelectField>
              <SelectField>
                <select
                  v-model="modelConfig.defaultEffortLevel" class="field__input field__select model-effort-select" :disabled="busy || !supportsEffortOf(modelConfig.defaultModelId)"
                  :aria-label="effortAriaLabel(t.workspace.agentAdmin.modelConversationLabel)"
                  :title="!supportsEffortOf(modelConfig.defaultModelId) ? t.workspace.agentAdmin.modelEffortUnsupported : undefined"
                >
                  <option value="">{{ t.workspace.agentAdmin.modelEffortDefault }}</option>
                  <option v-for="level in EFFORT_LEVELS" :key="level" :value="level">{{ level }}</option>
                </select>
              </SelectField>
            </div>
            <div class="model-matrix__row">
              <span class="model-matrix__label">{{ t.workspace.agentAdmin.modelSubagentLabel }}</span>
              <SelectField>
                <select
                  v-model="modelConfig.subagentModelId" class="field__input field__select" :disabled="busy"
                  :title="modelTitleOf(modelConfig.subagentModelId || modelConfig.defaultModelId)"
                  :aria-label="t.workspace.agentAdmin.modelSubagentLabel"
                >
                  <option value="">{{ t.workspace.agentAdmin.modelSubagentInherit }}</option>
                  <optgroup v-for="group in groupModelsByProvider(MODELS)" :key="group.provider" :label="group.provider">
                    <option v-for="model in group.models" :key="model.id" :value="model.id">{{ modelOptionLabel(model) }}</option>
                  </optgroup>
                </select>
              </SelectField>
              <SelectField>
                <select
                  v-model="modelConfig.subagentEffortLevel" class="field__input field__select model-effort-select" :disabled="busy || !supportsEffortOf(modelConfig.subagentModelId || modelConfig.defaultModelId)"
                  :aria-label="effortAriaLabel(t.workspace.agentAdmin.modelSubagentLabel)"
                  :title="!supportsEffortOf(modelConfig.subagentModelId || modelConfig.defaultModelId) ? t.workspace.agentAdmin.modelEffortUnsupported : undefined"
                >
                  <option value="">{{ t.workspace.agentAdmin.modelEffortInherit }}</option>
                  <option v-for="level in EFFORT_LEVELS" :key="level" :value="level">{{ level }}</option>
                </select>
              </SelectField>
            </div>
          </div>
        </div>

        <div
          v-show="activeModelSection === 'tiers'" :id="`${dialogId}-model-panel-tiers`"
          class="model-subpanel" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-tiers`"
        >
          <p class="model-section__hint">{{ t.workspace.agentAdmin.modelTierHint }}</p>
          <div class="model-matrix model-matrix--tiers">
            <div class="model-matrix__head" aria-hidden="true">
              <span>{{ t.workspace.agentAdmin.modelTierColumn }}</span>
              <span>{{ t.workspace.agentAdmin.modelTierNoteLabel }}</span>
              <span>{{ t.workspace.agentAdmin.modelColumn }}</span>
              <span>{{ t.workspace.agentAdmin.modelEffortLabel }}</span>
            </div>
            <div v-for="tier in tiers" :key="tier.id" class="model-matrix__row">
              <div class="model-matrix__tier-info">
                <span class="model-matrix__tier">{{ tier.label }}</span>
                <span class="model-matrix__note">{{ tier.note }}</span>
              </div>
              <SelectField>
                <select
                  v-model="modelConfig.tiers[tier.id].modelId" class="field__input field__select" :disabled="busy"
                  :title="modelTitleOf(tierModelOf(tier.id))"
                  :aria-label="`${tier.label} · ${t.workspace.agentAdmin.modelColumn}`"
                >
                  <option value="">{{ modelOptionLabel(modelById(TIER_DEFAULTS[tier.id])) }}</option>
                  <optgroup v-for="group in groupModelsByProvider(tierModelOptions(tier.id))" :key="group.provider" :label="group.provider">
                    <option v-for="model in group.models" :key="model.id" :value="model.id">{{ modelOptionLabel(model) }}</option>
                  </optgroup>
                </select>
              </SelectField>
              <SelectField>
                <select
                  v-model="modelConfig.tiers[tier.id].effortLevel" class="field__input field__select model-effort-select" :disabled="busy || !supportsEffortOf(tierModelOf(tier.id))"
                  :aria-label="`${tier.label} · ${t.workspace.agentAdmin.modelEffortLabel}`"
                  :title="!supportsEffortOf(tierModelOf(tier.id)) ? t.workspace.agentAdmin.modelEffortUnsupported : undefined"
                >
                  <option v-for="level in EFFORT_LEVELS" :key="level" :value="level">{{ level }}</option>
                </select>
              </SelectField>
            </div>
          </div>
        </div>

        <div
          v-show="activeModelSection === 'advanced'" :id="`${dialogId}-model-panel-advanced`"
          class="model-subpanel model-subpanel--advanced" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-advanced`"
        >
          <section class="model-block">
            <div class="model-block__head">
              <h4 :id="`${dialogId}-fallback-title`" class="model-row__label">{{ t.workspace.agentAdmin.modelFallbackLabel }}</h4>
              <p class="model-section__hint">{{ t.workspace.agentAdmin.modelFallbackHint }}</p>
            </div>
            <div class="model-block__body">
              <ol
                v-if="fallbackCount > 0" :aria-labelledby="`${dialogId}-fallback-title`"
                class="fallback-chain__list"
              >
                <li v-for="(id, index) in modelConfig.fallbackModelIds" :key="id" class="fallback-row">
                  <span class="fallback-row__order" aria-hidden="true">{{ index + 1 }}</span>
                  <SelectField>
                    <select
                      :value="id" class="field__input field__select" :disabled="busy"
                      :aria-label="t.workspace.agentAdmin.modelFallbackSelect.replace('{index}', String(index + 1))"
                      @change="updateFallback(index, $event)"
                    >
                      <optgroup v-for="group in groupModelsByProvider(fallbackOptionsFor(index))" :key="group.provider" :label="group.provider">
                        <option v-for="model in group.models" :key="model.id" :value="model.id">{{ modelOptionLabel(model) }}</option>
                      </optgroup>
                    </select>
                  </SelectField>
                  <div class="fallback-row__actions">
                    <button
                      type="button" class="fallback-row__action"
                      :disabled="busy || index === 0"
                      :aria-label="t.workspace.agentAdmin.modelFallbackMoveUp.replace('{index}', String(index + 1))"
                      @click="moveFallback(index, -1)"
                    >
                      <DliIcon name="chevronRight" size="sm" class="fallback-row__caret fallback-row__caret--up" />
                    </button>
                    <button
                      type="button" class="fallback-row__action"
                      :disabled="busy || index === fallbackCount - 1"
                      :aria-label="t.workspace.agentAdmin.modelFallbackMoveDown.replace('{index}', String(index + 1))"
                      @click="moveFallback(index, 1)"
                    >
                      <DliIcon name="chevronRight" size="sm" class="fallback-row__caret fallback-row__caret--down" />
                    </button>
                    <button
                      type="button" class="fallback-row__action"
                      :disabled="busy"
                      :aria-label="t.workspace.agentAdmin.modelFallbackRemove.replace('{index}', String(index + 1))"
                      @click="removeFallback(index)"
                    >
                      <span aria-hidden="true">✕</span>
                    </button>
                  </div>
                </li>
              </ol>
              <p v-else class="fallback-chain__empty">{{ t.workspace.agentAdmin.modelFallbackEmpty }}</p>
              <div class="fallback-chain__actions">
                <button type="button" class="fallback-add" :disabled="fallbackCount >= 3 || busy" @click="addFallback">
                  <span aria-hidden="true">+</span> {{ t.workspace.agentAdmin.modelFallbackAdd }}
                </button>
                <span class="fallback-chain__count" aria-hidden="true">{{ fallbackCount }}/3</span>
              </div>
            </div>
          </section>

          <section class="model-block">
            <div class="model-block__head">
              <h4 class="model-row__label">{{ t.workspace.agentAdmin.modelContextTitle }}</h4>
            </div>
            <div class="model-block__body model-block__body--rows">
              <div class="model-row">
                <div class="model-row__info">
                  <label :id="`${dialogId}-compact-label`" :for="`${dialogId}-compact`" class="model-row__label">{{ t.workspace.agentAdmin.modelAutoCompactLabel }}</label>
                  <p :id="`${dialogId}-compact-hint`" class="model-section__hint">{{ t.workspace.agentAdmin.modelAutoCompactHint }}</p>
                </div>
                <SelectField>
                  <select
                    :id="`${dialogId}-compact`" v-model="modelConfig.autoCompactWindowTokens" class="field__input field__select" :disabled="busy"
                    :aria-labelledby="`${dialogId}-compact-label`" :aria-describedby="`${dialogId}-compact-hint`"
                  >
                    <option v-for="value in COMPACT_WINDOW_OPTIONS" :key="value" :value="value">{{ value === 0 ? t.workspace.agentAdmin.modelAutoCompactFollow : compactWindowLabel(value) }}</option>
                  </select>
                </SelectField>
              </div>
              <div class="model-row">
                <div class="model-row__info">
                  <label :id="`${dialogId}-budget-label`" :for="`${dialogId}-budget`" class="model-row__label">{{ t.workspace.agentAdmin.modelThinkingBudgetLabel }}</label>
                  <p :id="`${dialogId}-budget-hint`" class="model-section__hint">{{ t.workspace.agentAdmin.modelThinkingBudgetHint }}</p>
                </div>
                <SelectField>
                  <select
                    :id="`${dialogId}-budget`" v-model="modelConfig.maxThinkingTokens" class="field__input field__select" :disabled="busy"
                    :aria-labelledby="`${dialogId}-budget-label`" :aria-describedby="`${dialogId}-budget-hint`"
                  >
                    <option v-for="value in THINKING_BUDGET_OPTIONS" :key="value" :value="value">{{ value === 0 ? t.workspace.agentAdmin.modelThinkingBudgetAuto : thinkingBudgetLabel(value) }}</option>
                  </select>
                </SelectField>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <p v-if="error !== ''" class="agent-editor__error" role="alert">{{ error }}</p>
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
  width: min(720px, calc(100% - 2 * var(--dl-space-6)));
  max-height: calc(100dvh - 2 * var(--dl-space-6));
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

.agent-editor__head, .agent-editor__tabbar, .agent-editor__error, .agent-editor__actions { flex-shrink: 0; }
.agent-editor__tabbar { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-4); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.agent-editor__tabs { display: flex; gap: var(--dl-space-6); min-inline-size: 0; }
.agent-editor__tabs button { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-block-end: var(--dl-border-width) solid transparent; color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.agent-editor__tabs button[aria-selected='true'] { color: var(--dl-text-primary); border-block-end-color: var(--dl-accent); }
.agent-editor__tabs button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); }
/* 恢复默认是模型页的低频动作:只在非默认时出现,Tab 条右端的小字链,不占内容视野。 */
.agent-editor__reset { flex: none; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-md); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.agent-editor__reset:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.agent-editor__reset:disabled { background: transparent; color: var(--dl-text-disabled); cursor: not-allowed; }
.agent-editor__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-1); scrollbar-width: thin; scrollbar-color: var(--dl-border-strong) transparent; }
.agent-editor__body::-webkit-scrollbar { width: var(--dl-space-1); }
.agent-editor__body::-webkit-scrollbar-thumb { background: var(--dl-border-strong); border-radius: var(--dl-radius-pill); }
.agent-editor__body::-webkit-scrollbar-track { background: transparent; }
.agent-editor__panel { display: grid; gap: var(--dl-space-6); min-inline-size: 0; }
.agent-editor__panel--model { gap: var(--dl-space-3); }
/* 二级分区:分段控件而非第二层下划线 tab,视觉权重低于主 tab;滚动时吸顶。
   吸顶偏移吃到 body 的 4px 内边距,避免滚动内容从上方缝隙透出半行。 */
.model-subtabs { position: sticky; inset-block-start: calc(-1 * var(--dl-space-1)); z-index: var(--dl-z-sticky); padding-block: var(--dl-space-1); background: var(--dl-bg-elevated); }
.model-subtabs__track { display: flex; gap: var(--dl-space-1); padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); }
.model-subtabs__track button { display: inline-flex; flex: 1 1 0; align-items: center; justify-content: center; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-1); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; }
.model-subtabs__track button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.model-subtabs__track button[aria-selected='true'] { background: var(--dl-accent-soft); color: var(--dl-text-primary); }
.model-subtabs__count { min-inline-size: var(--dl-space-4); padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; line-height: var(--dl-line-tight); text-align: center; }
.model-subpanel { display: grid; gap: var(--dl-space-3); min-inline-size: 0; }
.agent-editor__panel:focus-visible, button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
button:active:not(:disabled) { transform: translateY(var(--dl-lift-press)); }
button:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.model-section__hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
/* 配置矩阵:默认模型与任务档位共用同一套列(范围/档位 + 模型 + 思考),减少视觉语法。 */
.model-matrix { border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.model-matrix__head, .model-matrix__row { display: grid; grid-template-columns: 140px minmax(0, 1fr) 132px; align-items: center; gap: var(--dl-space-3); padding: var(--dl-space-2) var(--dl-space-3); }
.model-matrix__head { border-block-end: var(--dl-border-width) solid var(--dl-border-subtle); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.model-matrix__row + .model-matrix__row { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.model-matrix__label { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-body); }
.model-matrix__row .field__select { min-inline-size: 0; }
.model-matrix--tiers .model-matrix__head, .model-matrix--tiers .model-matrix__row { grid-template-columns: 80px 140px minmax(0, 1fr) 132px; }
/* 桌面端让档位与说明直接占两列;窄屏再包成一行。 */
.model-matrix__tier-info { display: contents; }
.model-matrix__tier { color: var(--dl-text-primary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-weight: 500; letter-spacing: var(--dl-tracking-label); }
.model-matrix__note { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.model-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); align-items: center; gap: var(--dl-space-4); min-inline-size: 0; padding: var(--dl-space-2) var(--dl-space-3); }
.model-row + .model-row { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
/* 档位名与一句话用途同排:两行信息在 720px 对话框里会多占四行高度,同排后仍可读。 */
.model-row__info { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-1) var(--dl-space-2); }
.model-row__label { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-body); }
.model-row__info .model-section__hint { color: var(--dl-text-tertiary); }
/* 高级区的每个配置块是一张独立圆角卡片:共同区域表达亲和性,块内发丝分隔,块之间留大间距。 */
.model-block { border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.model-block__head { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-3); border-block-end: var(--dl-border-width) solid var(--dl-border-subtle); }
.model-block__body { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-3); }
.model-block__body--rows { gap: 0; padding: 0; }
.model-block__body--rows .model-row { padding: var(--dl-space-3); }
.model-block__body--rows .model-row + .model-row { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.fallback-chain__list { margin: 0; padding: 0; list-style: none; }
.fallback-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--dl-space-2); padding: var(--dl-space-2) 0; }
.fallback-row + .fallback-row { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.fallback-row__order { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; text-align: end; }
.fallback-row__actions { display: flex; gap: var(--dl-space-1); }
.fallback-row__action { display: inline-grid; place-items: center; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); border-radius: var(--dl-radius-md); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-md); }
.fallback-row__action:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
/* 边界处的上移 / 下移不可用:保持透明底,只降文字色,避免看起来像一枚被按下的实心按钮。 */
.fallback-row__action:disabled { background: transparent; color: var(--dl-text-disabled); cursor: not-allowed; }
.fallback-row__caret--up { transform: rotate(-90deg); }
.fallback-row__caret--down { transform: rotate(90deg); }
.fallback-chain__empty { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.fallback-chain__actions { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-2); }
.fallback-add { display: inline-flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.fallback-add:hover:not(:disabled) { border-color: var(--dl-border-strong); background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.fallback-add:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.fallback-chain__count { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }

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
.field__input:hover:not(:disabled) { border-color: var(--dl-border-strong); }
.field__input:active:not(:disabled) { border-color: var(--dl-accent); }
.field__input:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.field__select { appearance: none; min-inline-size: 0; max-inline-size: 100%; padding-inline-end: var(--dl-space-8); }
/* 思考强度是 SDK 原始值(low/medium/high/xhigh/max),用等宽字保留技术感。 */
.model-effort-select { font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; }

.agent-editor__error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.agent-editor__danger { display: grid; gap: var(--dl-space-2); padding-block-start: var(--dl-space-3); border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.agent-editor__danger-title { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.agent-editor__danger-body, .agent-editor__danger-hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.agent-editor__danger-hint { color: var(--dl-warning); }
.agent-editor__danger-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); }
.danger-trigger { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-error); font-size: var(--dl-font-size-xs); }
.danger-trigger:hover:not(:disabled) { border-color: var(--dl-error); background: var(--dl-bg-hover); }
.danger-trigger:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.agent-editor__danger-confirm { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-error); border-radius: var(--dl-radius-md); }
.agent-editor__danger-question { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.agent-editor__danger-actions { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); }
.danger-confirm { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border-radius: var(--dl-radius-md); background: var(--dl-error); color: var(--dl-text-on-accent); font-size: var(--dl-font-size-sm); }
.danger-confirm:hover:not(:disabled) { outline: var(--dl-border-width) solid var(--dl-error); outline-offset: var(--dl-space-1); }
.danger-confirm:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }

.agent-editor__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); }
.agent-editor__actions .dl-btn { min-block-size: var(--dl-target-size); }

/* 触屏 / 窄屏:模板卡与输入框仍保持 44 的可点高度(默认已是 44)。 */
@media (max-width: 560px) {
  .template-grid, .model-row { grid-template-columns: minmax(0, 1fr); }
  /* 回退链的控制钮换到第二行,保持 44×44 的独立触达尺寸。 */
  .fallback-row { grid-template-columns: auto minmax(0, 1fr); }
  .fallback-row__actions { grid-column: 2; justify-content: flex-end; }
  /* 矩阵在窄屏压成两行:标签与思考同排,模型占满下一行;两档矩阵共用。 */
  .model-matrix__head { display: none; }
  .model-matrix__row, .model-matrix--tiers .model-matrix__row { grid-template-columns: minmax(0, 1fr) 132px; gap: var(--dl-space-2); }
  .model-matrix__label { grid-column: 1; grid-row: 1; }
  .model-matrix--tiers .model-matrix__tier-info { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-1) var(--dl-space-2); grid-column: 1; grid-row: 1; }
  /* 默认矩阵:标签 span + 两个 select 包裹层。 */
  .model-matrix:not(.model-matrix--tiers) .model-matrix__row > .select-field:nth-of-type(2) { grid-column: 1 / -1; grid-row: 2; }
  .model-matrix:not(.model-matrix--tiers) .model-matrix__row > .select-field:nth-of-type(3) { grid-column: 2; grid-row: 1; }
  /* 档位矩阵:tier-info div + 两个 select 包裹层。 */
  .model-matrix--tiers .model-matrix__row > .select-field:nth-of-type(1) { grid-column: 1 / -1; grid-row: 2; }
  .model-matrix--tiers .model-matrix__row > .select-field:nth-of-type(2) { grid-column: 2; grid-row: 1; }
}
</style>
