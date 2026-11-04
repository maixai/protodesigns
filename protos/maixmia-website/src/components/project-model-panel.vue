<script setup lang="ts">
// 项目模型面板:只保存模型覆盖。模式开关是正文的第一个可交互元素;
// 跟随态只读呈现 Agent 的生效值,自定义态才出现来源 / 模型 / 高级三个二级标签。
// 面板挂载即加载(与权限域并行预取),切换 Tab 不卸载、不重置草稿;
// 保存由统一设置窗体的底部动作区触发。
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { ModelGateway, ModelSubscription } from '../contracts/generated/agent-model-config'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Project } from '../contracts/generated/project'
import type { ProjectModelOverrides, ProjectModelSettings } from '../contracts/generated/project-model-settings'
import { getProjectModelSettings, saveProjectModelSettings } from '../api/project-settings'
import { EFFORT_LEVELS, FALLBACK_PRIORITY, MODELS, SUBSCRIPTION_PROVIDER_LABELS, subscriptionSourceId } from '../data/models'
import type { ProjectSourceResolution } from '../data/project-model-settings'
import { completeProjectModelOverrides, hasProjectModelCustomValues, projectModelSupportsEffort, resolveProjectModelSource, validateProjectModelOverrides } from '../data/project-model-settings'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import ModelSourceContext from './model-source-context.vue'
import ProjectFollowSummary from './project-follow-summary.vue'
import type { ProjectPanelState } from './project-settings-state'
import SegmentedControl from './segmented-control.vue'
import type { SegmentedOption } from './segmented-control.vue'
import SelectField from './select-field.vue'

const props = defineProps<{ project: Project; agent: AgentSummary }>()
const emit = defineEmits<{ saved: [settings: ProjectModelSettings]; state: [state: ProjectPanelState] }>()
const { t } = useI18n()
type ModelMode = 'follow' | 'custom'
type ModelSection = 'source' | 'model' | 'advanced'
interface ModelSectionOption { id: ModelSection; label: string }
type SourceRow =
  | { id: string; kind: 'subscription'; subscription: ModelSubscription; resolution: ProjectSourceResolution }
  | { id: string; kind: 'gateway'; gateway: ModelGateway; resolution: ProjectSourceResolution }

const COMPACT_WINDOW_OPTIONS = [0, 100_000, 200_000, 400_000, 500_000, 1_000_000] as const
const MODEL_SECTION_ORDER: readonly ModelSection[] = ['source', 'model', 'advanced']
const modelSubtabsRef = ref<HTMLElement | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const isSaving = ref(false)
const saveFeedback = ref<'idle' | 'saved' | 'error'>('idle')
const saveErrorMessage = ref('')
const baselineSerialized = ref('')
let loadVersion = 0
const dialogId = `project-model-${Math.random().toString(36).slice(2)}`
const sourceErrorId = `${dialogId}-source-error`
const modelErrorId = `${dialogId}-model-error`
const effortErrorId = `${dialogId}-effort-error`
const effortHintId = `${dialogId}-effort-hint`
const fallbackErrorId = `${dialogId}-fallback-error`
const modelSectionHintId = `${dialogId}-model-section-hint`

const modelMode = ref<ModelMode>('follow')
const activeModelSection = ref<ModelSection>('source')
const retainedCustomModel = ref<ProjectModelOverrides>({})
const selectedSourceId = ref('')
const modelId = ref('')
const effortLevel = ref('')
const compactWindow = ref(0)
const alwaysThinkingEnabled = ref(false)
const fallbackModelIds = ref<string[]>([])
const isBusy = computed(() => isSaving.value || status.value !== 'ready')
const customModel = computed<ProjectModelOverrides>(() => ({
  followAgent: false, sourceId: selectedSourceId.value, modelId: modelId.value, effortLevel: effortLevel.value,
  fallbackModelIds: [...fallbackModelIds.value], autoCompactWindowTokens: compactWindow.value, alwaysThinkingEnabled: alwaysThinkingEnabled.value,
}))
const payload = computed<ProjectModelSettings>(() => {
  const retained = retainedCustomModel.value
  const model: ProjectModelOverrides = modelMode.value === 'follow'
    ? { ...retained, ...(retained.fallbackModelIds === undefined ? {} : { fallbackModelIds: [...retained.fallbackModelIds] }), followAgent: true }
    : customModel.value
  return { path: props.project.path, model }
})
const isDirty = computed(() => status.value === 'ready' && JSON.stringify(payload.value) !== baselineSerialized.value)
const modelValidation = computed(() => validateProjectModelOverrides(payload.value.model, props.agent.model))
const isValid = computed(() => modelValidation.value.isValid)
const saveState = computed<'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'invalid'>(() => {
  if (isSaving.value) return 'saving'
  if (saveFeedback.value === 'error') return 'error'
  if (!isValid.value) return 'invalid'
  if (saveFeedback.value === 'saved' && !isDirty.value) return 'saved'
  return isDirty.value ? 'dirty' : 'clean'
})
const modelModeOptions = computed<SegmentedOption[]>(() => [
  { id: 'follow', label: t.value.workspace.projectSettings.followAgent },
  { id: 'custom', label: t.value.workspace.projectSettings.custom },
])
const modelSections = computed<ModelSectionOption[]>(() => MODEL_SECTION_ORDER.map((id) => ({
  id, label: id === 'source' ? t.value.workspace.projectSettings.source : id === 'model' ? t.value.workspace.projectSettings.modelGroup : t.value.workspace.projectSettings.advanced,
})))
function displayModelName(id: string): string {
  const model = MODELS.find((item) => item.id === id)
  return model === undefined ? id : t.value.workspace.models[model.nameKey]
}
function unavailableModelLabel(id: string): string {
  return `${displayModelName(id)} · ${t.value.workspace.projectSettings.modelUnavailableShort}`
}
function subscriptionLabel(subscription: ModelSubscription): string {
  const copy = t.value.workspace.agentAdmin
  if (subscription.label === '工作') return copy.subscriptionWork
  if (subscription.label === '个人') return copy.subscriptionPersonal
  if (subscription.label === '旧账户') return copy.subscriptionLegacy
  const numbered = /^账户 (\d+)$/.exec(subscription.label)
  return numbered === null ? subscription.label : copy.subscriptionAccountNumber.replace('{number}', numbered[1] ?? '')
}
const sourceRows = computed<SourceRow[]>(() => {
  const rows: SourceRow[] = []
  for (const subscription of props.agent.model.source.subscriptions) {
    const id = subscriptionSourceId(subscription.id)
    rows.push({ id, kind: 'subscription', subscription, resolution: resolveProjectModelSource({ sourceId: id }, props.agent.model) })
  }
  for (const gateway of props.agent.model.source.gateways) rows.push({ id: gateway.id, kind: 'gateway', gateway, resolution: resolveProjectModelSource({ sourceId: gateway.id }, props.agent.model) })
  return rows
})
const selectedSourceRow = computed(() => sourceRows.value.find((row) => row.id === selectedSourceId.value))
const hasMissingSelectedSource = computed(() => selectedSourceId.value !== '' && selectedSourceRow.value === undefined)
const agentSourceRow = computed(() => sourceRows.value.find((row) => row.id === props.agent.model.source.activeSourceId))
const agentSourceLine = computed(() => t.value.workspace.projectSettings.agentSourceLine
  .replace('{value}', agentSourceRow.value === undefined ? props.agent.model.source.activeSourceId : sourceName(agentSourceRow.value)))
const agentModelLine = computed(() => t.value.workspace.projectSettings.agentModelLine
  .replace('{model}', displayModelName(props.agent.model.defaultModelId))
  .replace('{effort}', props.agent.model.defaultEffortLevel || t.value.workspace.projectSettings.effortModelDefaultValue))
function sourceName(row: SourceRow): string {
  return row.kind === 'subscription' ? `${SUBSCRIPTION_PROVIDER_LABELS[row.subscription.provider]} · ${subscriptionLabel(row.subscription)}` : row.gateway.name
}
function sourceMeta(row: SourceRow): string {
  if (row.kind === 'subscription') return row.subscription.plan
  const copy = t.value.workspace.agentAdmin
  const template = row.gateway.models.length === 1 ? copy.gatewayModelsOne : copy.gatewayModels
  return `${copy.modelSourceGateway} · ${template.replace('{count}', String(row.gateway.models.length))}`
}
function sourceStatus(row: SourceRow): string {
  const copy = t.value.workspace.agentAdmin
  if (row.kind === 'gateway') return row.resolution.issue === 'unavailable' ? copy.gatewayUnverified : copy.gatewayConfigured
  const subscription = row.subscription
  if (subscription.status === 'expired' || (Number.isFinite(Date.parse(subscription.expiresAt)) && Date.parse(subscription.expiresAt) <= Date.now())) return copy.subscriptionExpired
  if (subscription.status === 'error' || subscription.credentialRef === '') return copy.subscriptionNeedsAuth
  if (!subscription.connected) return copy.subscriptionDisconnected
  return copy.subscriptionConnected
}
function sourceUsage(row: SourceRow): string {
  if (row.kind !== 'subscription') return ''
  const usage = row.subscription.usage
  const copy = t.value.workspace.agentAdmin
  if (usage.state === 'exhausted') return copy.subscriptionUsageExhausted
  if (usage.state === 'warning') return copy.subscriptionUsageWarning
  if (usage.state === 'unknown') return copy.subscriptionUsageUnknown
  return usage.usedPercent < 0 ? '' : copy.subscriptionUsageUsed.replace('{percent}', String(usage.usedPercent))
}
function sourceUsageTone(row: SourceRow): 'neutral' | 'warning' {
  return row.kind === 'subscription' && (row.subscription.usage.state === 'warning' || row.subscription.usage.state === 'exhausted') ? 'warning' : 'neutral'
}
const selectedSourceUsage = computed(() => selectedSourceRow.value?.kind === 'subscription' ? selectedSourceRow.value.subscription.usage : null)
function sourceIssueMessage(resolution: ProjectSourceResolution): string {
  const copy = t.value.workspace.projectSettings
  if (resolution.issue === 'missing') return copy.sourceMissing.replace('{id}', resolution.id)
  if (resolution.issue === 'unavailable') return copy.sourceUnavailable
  if (resolution.issue === 'empty') return copy.sourceEmpty
  if (resolution.issue === 'incompatible') return copy.sourceIncompatible.replace('{models}', resolution.incompatibleModelIds.join(', '))
  return ''
}
function sourceRowReasonId(index: number): string { return `${dialogId}-source-reason-${index}` }
const sourceErrorMessage = computed(() => sourceIssueMessage(modelValidation.value.source))
const modelErrorMessage = computed(() => modelValidation.value.modelIssue === 'required' ? t.value.workspace.projectSettings.modelRequired : modelValidation.value.modelIssue === 'unavailable' ? t.value.workspace.projectSettings.modelUnavailable : '')
const effortErrorMessage = computed(() => modelValidation.value.effortIssue === 'invalid' ? t.value.workspace.projectSettings.effortInvalid : modelValidation.value.effortIssue === 'unsupported' ? t.value.workspace.projectSettings.effortUnsupported : '')
const fallbackErrorMessage = computed(() => modelValidation.value.fallbackIssue === 'invalid' ? t.value.workspace.projectSettings.fallbackInvalid : modelValidation.value.fallbackIssue === 'unavailable' ? t.value.workspace.projectSettings.fallbackUnavailable : '')
const firstValidationMessage = computed(() => sourceErrorMessage.value || modelErrorMessage.value || effortErrorMessage.value || fallbackErrorMessage.value)
const saveStateLabel = computed(() => {
  const copy = t.value.workspace.projectSettings
  if (saveState.value === 'saving') return copy.saving
  if (saveState.value === 'error') return saveErrorMessage.value || copy.saveError
  if (saveState.value === 'saved') return copy.saved
  if (saveState.value === 'invalid') return firstValidationMessage.value
  return saveState.value === 'dirty' ? copy.saveDirty : copy.saveClean
})
const panelState = computed<ProjectPanelState>(() => ({
  status: status.value,
  dirty: isDirty.value,
  saving: isSaving.value,
  saveState: saveState.value,
  saveStateLabel: saveStateLabel.value,
  canSave: isDirty.value && isValid.value && !isBusy.value,
}))
const sourceModelIds = computed(() => modelValidation.value.source.modelIds)
const defaultModelOptions = computed(() => modelId.value !== '' && !sourceModelIds.value.includes(modelId.value) ? [modelId.value, ...sourceModelIds.value] : sourceModelIds.value)
const isEffortUnsupported = computed(() => !projectModelSupportsEffort(modelValidation.value.modelId))
const selectedSourceName = computed(() => selectedSourceRow.value === undefined ? selectedSourceId.value : sourceName(selectedSourceRow.value))
function compactLabel(value: number): string { return value === 0 ? t.value.workspace.projectSettings.autoCompactModel : `${Math.round(value / 1000)}K` }
function applyCustomModel(model: ProjectModelOverrides): void {
  const complete = completeProjectModelOverrides(model, props.agent.model)
  selectedSourceId.value = complete.sourceId ?? ''
  modelId.value = complete.modelId ?? ''
  effortLevel.value = complete.effortLevel ?? ''
  compactWindow.value = complete.autoCompactWindowTokens ?? 0
  alwaysThinkingEnabled.value = complete.alwaysThinkingEnabled ?? false
  fallbackModelIds.value = [...(complete.fallbackModelIds ?? [])]
}
function onModelModeChange(id: string): void {
  if (isBusy.value || (id !== 'follow' && id !== 'custom') || id === modelMode.value) return
  if (id === 'follow') { retainedCustomModel.value = { ...customModel.value, followAgent: true }; modelMode.value = 'follow'; return }
  applyCustomModel(retainedCustomModel.value)
  modelMode.value = 'custom'
  activeModelSection.value = 'source'
}
function applySettings(settings: ProjectModelSettings): void {
  const retained = { ...settings.model }
  delete retained.followAgent
  retainedCustomModel.value = retained
  modelMode.value = settings.model.followAgent === true || !hasProjectModelCustomValues(settings.model) ? 'follow' : 'custom'
  activeModelSection.value = 'source'
  applyCustomModel(retained)
}
async function load(): Promise<void> {
  const version = ++loadVersion
  status.value = 'loading'
  saveFeedback.value = 'idle'
  saveErrorMessage.value = ''
  const result = await getProjectModelSettings(props.project.path)
  if (version !== loadVersion) return
  if (!result.ok) { status.value = 'error'; return }
  applySettings(result.value)
  status.value = 'ready'
  baselineSerialized.value = JSON.stringify(payload.value)
}
watch(panelState, (state) => emit('state', state), { immediate: true })
watch(() => JSON.stringify(payload.value), () => { if (isDirty.value && saveFeedback.value !== 'idle') saveFeedback.value = 'idle' })
function activateModelSection(section: ModelSection, moveFocus: boolean): void {
  activeModelSection.value = section
  if (moveFocus) void nextTick(() => modelSubtabsRef.value?.querySelector<HTMLButtonElement>(`[data-section="${section}"]`)?.focus())
}
function onModelSectionKeydown(event: KeyboardEvent): void {
  const current = MODEL_SECTION_ORDER.indexOf(activeModelSection.value)
  const next = event.key === 'ArrowRight' ? (current + 1) % MODEL_SECTION_ORDER.length
    : event.key === 'ArrowLeft' ? (current - 1 + MODEL_SECTION_ORDER.length) % MODEL_SECTION_ORDER.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? MODEL_SECTION_ORDER.length - 1 : -1
  if (next < 0) return
  event.preventDefault()
  const section = MODEL_SECTION_ORDER[next]
  if (section !== undefined) activateModelSection(section, true)
}
function fallbackOptionsFor(index: number): readonly string[] {
  const current = fallbackModelIds.value[index] ?? ''
  const options = sourceModelIds.value.filter((id) => id === current || !fallbackModelIds.value.includes(id))
  return current !== '' && !sourceModelIds.value.includes(current) ? [current, ...options] : options
}
function updateFallback(index: number, event: Event): void {
  if (event.target instanceof HTMLSelectElement) fallbackModelIds.value[index] = event.target.value
}
function addFallback(): void {
  const recommended = [...FALLBACK_PRIORITY.map((model) => model.id), ...sourceModelIds.value]
  const candidate = recommended.find((id) => sourceModelIds.value.includes(id) && id !== modelValidation.value.modelId && !fallbackModelIds.value.includes(id))
  if (candidate !== undefined && fallbackModelIds.value.length < 3) fallbackModelIds.value.push(candidate)
}
function moveFallback(index: number, delta: number): void {
  const target = index + delta
  const current = fallbackModelIds.value[index]
  const displaced = fallbackModelIds.value[target]
  if (current === undefined || displaced === undefined) return
  fallbackModelIds.value[index] = displaced
  fallbackModelIds.value[target] = current
}
function removeFallback(index: number): void { fallbackModelIds.value.splice(index, 1) }
// 保存成功返回 true;失败返回 false,由窗体把焦点送到底部保存状态。
async function save(): Promise<boolean> {
  if (!isDirty.value || !isValid.value || isSaving.value) return false
  isSaving.value = true
  saveFeedback.value = 'idle'
  saveErrorMessage.value = ''
  const result = await saveProjectModelSettings(props.project.path, payload.value, props.agent.model)
  isSaving.value = false
  if (!result.ok) {
    saveErrorMessage.value = result.error.message
    saveFeedback.value = 'error'
    return false
  }
  applySettings(result.value)
  baselineSerialized.value = JSON.stringify(payload.value)
  saveFeedback.value = 'saved'
  emit('saved', result.value)
  return true
}
onMounted(() => { void load() })
defineExpose({ save })
</script>

<template>
  <div class="project-model">
    <div v-if="status === 'loading'" class="project-config__load-state" role="status">{{ t.workspace.projectSettings.loading }}</div>
    <div v-else-if="status === 'error'" class="project-config__load-state" role="alert"><p>{{ t.workspace.projectSettings.loadError }}</p><button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.workspace.projectSettings.retry }}</button></div>
    <template v-else>
      <!-- 模式开关是正文的第一个可交互元素:说明文字放在它下方,不在上方堆叠。 -->
      <section class="project-model__mode" :aria-labelledby="`${dialogId}-mode-title`">
        <div class="project-model__mode-head">
          <h3 :id="`${dialogId}-mode-title`">{{ t.workspace.projectSettings.modelMode }}</h3>
          <SegmentedControl :model-value="modelMode" :options="modelModeOptions" :label="t.workspace.projectSettings.modelMode" @update:model-value="onModelModeChange" />
        </div>
        <p :id="modelSectionHintId" class="project-model__hint">{{ modelMode === 'follow' ? t.workspace.projectSettings.followModeHint : t.workspace.projectSettings.customModeHint }}</p>
      </section>
      <ProjectFollowSummary v-if="modelMode === 'follow'" kind="model" :agent="agent" />
      <template v-else>
        <div ref="modelSubtabsRef" class="project-model__subtabs">
          <div class="project-model__subtabs-track" role="tablist" :aria-label="t.workspace.projectSettings.modelSectionsLabel" @keydown="onModelSectionKeydown">
            <button v-for="section in modelSections" :id="`${dialogId}-model-tab-${section.id}`" :key="section.id" type="button" role="tab" :data-section="section.id" :aria-selected="activeModelSection === section.id" :aria-controls="`${dialogId}-model-panel-${section.id}`" :tabindex="activeModelSection === section.id ? 0 : -1" @click="activateModelSection(section.id, false)">{{ section.label }}</button>
          </div>
        </div>
        <div v-show="activeModelSection === 'source'" :id="`${dialogId}-model-panel-source`" class="project-model__subpanel" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-source`">
          <p class="project-model__agent-line">{{ agentSourceLine }}</p>
          <p class="project-model__hint">{{ t.workspace.projectSettings.sourceHint }}</p>
          <div class="project-model__source-list" role="radiogroup" :aria-label="t.workspace.projectSettings.source" :aria-describedby="sourceErrorMessage ? sourceErrorId : undefined">
            <label v-if="hasMissingSelectedSource" class="project-model__source-option" data-disabled="true"><input v-model="selectedSourceId" type="radio" name="project-model-source" :value="selectedSourceId" disabled :aria-describedby="sourceErrorId"><span class="project-model__source-copy"><span class="project-model__source-head"><span class="project-model__source-name"><code>{{ selectedSourceId }}</code></span><span class="project-model__source-secondary">{{ t.workspace.projectSettings.sourceMissingShort }}</span></span></span></label>
            <label v-for="(row, index) in sourceRows" :key="row.id" class="project-model__source-option" :data-disabled="row.resolution.issue !== null ? 'true' : undefined">
              <input v-model="selectedSourceId" type="radio" name="project-model-source" :value="row.id" :disabled="isBusy || row.resolution.issue !== null" :aria-describedby="row.resolution.issue === null ? undefined : sourceRowReasonId(index)">
              <span class="project-model__source-copy"><span class="project-model__source-head"><span class="project-model__source-name">{{ sourceName(row) }}</span><span class="project-model__source-secondary"><span>{{ sourceMeta(row) }}</span><span class="project-model__source-status" :data-tone="row.resolution.issue === null ? 'neutral' : 'error'">{{ sourceStatus(row) }}</span><span v-if="sourceUsage(row) !== ''" :data-tone="sourceUsageTone(row)">{{ sourceUsage(row) }}</span></span></span><span v-if="row.resolution.issue !== null" :id="sourceRowReasonId(index)" class="project-model__source-reason">{{ sourceIssueMessage(row.resolution) }}</span></span>
            </label>
          </div>
          <p v-if="sourceErrorMessage" :id="sourceErrorId" class="project-config__error" role="alert">{{ sourceErrorMessage }}</p>
        </div>
        <div v-show="activeModelSection === 'model'" :id="`${dialogId}-model-panel-model`" class="project-model__subpanel" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-model`">
          <ModelSourceContext :name="selectedSourceName" account="" :usage="selectedSourceUsage" :is-draft-changed="false" :disabled="isBusy" @change="activateModelSection('source', true)" />
          <section class="project-model__block"><div class="project-model__block-head"><h3>{{ t.workspace.projectSettings.modelGroup }}</h3><p class="project-model__agent-line">{{ agentModelLine }}</p></div><div class="project-model__block-body">
            <div class="project-model__row"><label :for="`${dialogId}-model`">{{ t.workspace.projectSettings.modelDefault }}</label><SelectField><select :id="`${dialogId}-model`" v-model="modelId" class="field__input field__select" :disabled="isBusy || sourceModelIds.length === 0" :aria-invalid="modelErrorMessage ? 'true' : undefined" :aria-describedby="modelErrorMessage ? modelErrorId : undefined"><option v-for="option in defaultModelOptions" :key="option" :value="option">{{ sourceModelIds.includes(option) ? displayModelName(option) : unavailableModelLabel(option) }} · {{ option }}</option></select></SelectField><p v-if="modelErrorMessage" :id="modelErrorId" class="project-config__error project-model__row-message" role="alert">{{ modelErrorMessage }}</p></div>
            <div class="project-model__row"><div><label :for="`${dialogId}-effort`">{{ t.workspace.projectSettings.effort }}</label><p v-if="isEffortUnsupported" :id="effortHintId" class="project-model__hint">{{ t.workspace.projectSettings.effortUnsupportedHint }}</p></div><SelectField><select :id="`${dialogId}-effort`" v-model="effortLevel" class="field__input field__select" :disabled="isBusy || sourceModelIds.length === 0" :aria-invalid="effortErrorMessage ? 'true' : undefined" :aria-describedby="effortErrorMessage ? effortErrorId : isEffortUnsupported ? effortHintId : undefined"><option value="">{{ t.workspace.projectSettings.effortModelDefaultValue }}</option><option v-for="level in EFFORT_LEVELS" :key="level" :value="level" :disabled="isEffortUnsupported">{{ level }}</option></select></SelectField><p v-if="effortErrorMessage" :id="effortErrorId" class="project-config__error project-model__row-message" role="alert">{{ effortErrorMessage }}</p></div>
          </div></section>
        </div>
        <div v-show="activeModelSection === 'advanced'" :id="`${dialogId}-model-panel-advanced`" class="project-model__subpanel" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-advanced`">
          <section class="project-model__block"><div class="project-model__block-head"><h3>{{ t.workspace.projectSettings.fallback }}</h3><p class="project-model__hint">{{ t.workspace.projectSettings.fallbackHint }}</p></div><div class="project-model__block-content">
            <ol v-if="fallbackModelIds.length > 0" class="project-model__fallback-list"><li v-for="(id, index) in fallbackModelIds" :key="`${index}-${id}`" class="project-model__fallback-row"><span>{{ index + 1 }}</span><SelectField><select :value="id" class="field__input field__select" :disabled="isBusy || sourceModelIds.length === 0" :aria-label="t.workspace.projectSettings.fallbackSelect.replace('{index}', String(index + 1))" @change="updateFallback(index, $event)"><option v-for="option in fallbackOptionsFor(index)" :key="option" :value="option" :disabled="option === modelValidation.modelId && option !== id">{{ sourceModelIds.includes(option) ? displayModelName(option) : unavailableModelLabel(option) }} · {{ option }}</option></select></SelectField><div class="project-model__row-actions"><button type="button" :disabled="isBusy || index === 0" :aria-label="t.workspace.projectSettings.fallbackMoveUp.replace('{index}', String(index + 1))" @click="moveFallback(index, -1)"><DliIcon name="chevronRight" size="sm" class="project-model__up" /></button><button type="button" :disabled="isBusy || index === fallbackModelIds.length - 1" :aria-label="t.workspace.projectSettings.fallbackMoveDown.replace('{index}', String(index + 1))" @click="moveFallback(index, 1)"><DliIcon name="chevronRight" size="sm" class="project-model__down" /></button><button type="button" :disabled="isBusy" :aria-label="t.workspace.projectSettings.fallbackRemove.replace('{index}', String(index + 1))" @click="removeFallback(index)"><span aria-hidden="true">✕</span></button></div></li></ol>
            <p v-else>{{ t.workspace.projectSettings.fallbackEmpty }}</p><div class="project-model__fallback-actions"><button type="button" class="project-model__add" :disabled="isBusy || fallbackModelIds.length >= 3 || modelValidation.source.issue !== null" @click="addFallback">＋ {{ t.workspace.projectSettings.fallbackAdd }}</button><span>{{ fallbackModelIds.length }}/3</span></div><p v-if="fallbackErrorMessage" :id="fallbackErrorId" class="project-config__error" role="alert">{{ fallbackErrorMessage }}</p>
          </div></section>
          <section class="project-model__block"><div class="project-model__block-head"><h3>{{ t.workspace.projectSettings.contextAndThinking }}</h3></div><div class="project-model__block-body">
            <div class="project-model__row"><label :for="`${dialogId}-compact`">{{ t.workspace.projectSettings.autoCompact }}</label><SelectField><select :id="`${dialogId}-compact`" v-model="compactWindow" class="field__input field__select" :disabled="isBusy"><option v-for="value in COMPACT_WINDOW_OPTIONS" :key="value" :value="value">{{ compactLabel(value) }}</option></select></SelectField></div>
            <div class="project-model__row"><label :for="`${dialogId}-thinking`">{{ t.workspace.projectSettings.alwaysThinking }}</label><SelectField><select :id="`${dialogId}-thinking`" v-model="alwaysThinkingEnabled" class="field__input field__select" :disabled="isBusy"><option :value="true">{{ t.workspace.projectSettings.enabled }}</option><option :value="false">{{ t.workspace.projectSettings.disabled }}</option></select></SelectField></div>
          </div></section>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* 面板内的断点按内容区实际宽度判定,不复用视口断点:嵌在带左栏的窗体里时两者不等。 */
.project-model { display: grid; gap: var(--dl-space-4); min-width: 0; container-type: inline-size; }
.project-model__hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.project-model__agent-line { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.project-model__mode { display: grid; gap: var(--dl-space-2); padding-block-end: var(--dl-space-3); border-block-end: var(--dl-border-width) solid var(--dl-border-subtle); }
.project-model__mode-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-2) var(--dl-space-3); }
.project-model__mode h3, .project-model__block-head h3 { font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); letter-spacing: var(--dl-tracking-label); }
.project-model__subpanel { display: grid; gap: var(--dl-space-3); min-width: 0; }
.project-model__subtabs { position: sticky; inset-block-start: calc(-1 * var(--dl-space-1)); z-index: var(--dl-z-sticky); min-inline-size: 0; padding-block: var(--dl-space-1); background: var(--dl-bg-elevated); }
.project-model__subtabs-track { display: flex; gap: var(--dl-space-1); max-inline-size: 100%; min-inline-size: 0; padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); }
.project-model__subtabs-track button { display: inline-flex; flex: 1 1 0; align-items: center; justify-content: center; min-inline-size: 0; min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-1); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); white-space: nowrap; }
.project-model__subtabs-track button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.project-model__subtabs-track button[aria-selected='true'] { background: var(--dl-accent-soft); color: var(--dl-text-primary); }
.project-model__source-list { display: grid; min-width: 0; border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.project-model__source-option { display: flex; align-items: flex-start; gap: var(--dl-space-3); min-width: 0; min-block-size: var(--dl-target-size); box-sizing: border-box; padding: var(--dl-space-2) var(--dl-space-3); }
.project-model__source-option + .project-model__source-option { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.project-model__source-option:has(input:checked) { background: var(--dl-accent-soft); }
.project-model__source-option:hover:not([data-disabled='true']) { background: var(--dl-bg-hover); }
.project-model__source-option[data-disabled='true'] { color: var(--dl-text-disabled); }
.project-model__source-option input { flex: none; inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); margin-block-start: var(--dl-space-1); accent-color: var(--dl-accent); }
.project-model__source-copy { display: grid; flex: 1; gap: var(--dl-space-1); min-width: 0; }
.project-model__source-head { display: flex; align-items: baseline; gap: var(--dl-space-3); min-width: 0; }
.project-model__source-name { min-width: 0; font-size: var(--dl-font-size-sm); font-weight: 500; overflow-wrap: anywhere; }
.project-model__source-secondary { display: flex; flex: 1; flex-wrap: wrap; align-items: baseline; justify-content: flex-end; gap: var(--dl-space-1) var(--dl-space-3); min-width: 0; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.project-model__source-status[data-tone='error'], .project-model__source-reason { color: var(--dl-error); }
.project-model__source-reason { font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.project-model__block { min-width: 0; border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.project-model__block-head { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-3); border-block-end: var(--dl-border-width) solid var(--dl-border-subtle); }
.project-model__block-body { display: grid; }
.project-model__block-content { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-3); }
.project-model__row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); align-items: center; gap: var(--dl-space-2) var(--dl-space-4); min-width: 0; padding: var(--dl-space-3); }
.project-model__row + .project-model__row { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.project-model__row label { font-size: var(--dl-font-size-sm); font-weight: 500; }
.project-model__row select, .project-model__fallback-row select { font-family: var(--dl-font-mono); }
.project-model__row-message { grid-column: 1 / -1; }
.project-model__fallback-list { display: grid; margin: 0; padding: 0; list-style: none; }
.project-model__fallback-row { display: grid; grid-template-columns: var(--dl-icon-md) minmax(0, 1fr) auto; align-items: center; gap: var(--dl-space-2); padding-block: var(--dl-space-2); }
.project-model__row-actions { display: flex; gap: var(--dl-space-1); }
.project-model__row-actions button { display: grid; place-items: center; min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); }
.project-model__row-actions button:hover:not(:disabled), .project-model__add:hover:not(:disabled) { background: var(--dl-bg-hover); }
.project-model__up { transform: rotate(-90deg); }
.project-model__down { transform: rotate(90deg); }
.project-model__fallback-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-2); }
.project-model__add { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); }
.project-model__add:disabled, .project-model__row-actions button:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
@container (max-width: 520px) {
  .project-model__source-head { flex-direction: column; gap: var(--dl-space-1); }
  .project-model__source-secondary { justify-content: flex-start; }
  .project-model__row { grid-template-columns: minmax(0, 1fr); }
  .project-model__row-message { grid-column: 1; }
  .project-model__fallback-row { grid-template-columns: var(--dl-icon-md) minmax(0, 1fr); }
  .project-model__row-actions { grid-column: 2; }
}
@container (max-width: 360px) { .project-model__subtabs-track { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
