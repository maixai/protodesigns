<script setup lang="ts">
// Agent 设置与新建共用基本 / 模型两页;模板只填身份,模型配置独立保存。
//
// 用原生 dialog.showModal():自带焦点陷阱、Esc 与 aria-modal;top layer 内仍继承
// .dl-scope--dark 的 CSS 变量,故不 Teleport。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentConfig } from '../contracts/generated/agent-config'
import type { AgentModelConfig } from '../contracts/generated/agent-model-config'
import type { ModelGateway, ModelSource, ModelSubscription, ModelSubscriptionProviderId } from '../contracts/generated/agent-model-config'
import type { GatewayProbe } from '../contracts/generated/gateway-probe'
import type { EffortLevel, ModelOption, ModelTierId } from '../data/models'
import { DEFAULT_MODEL, EFFORT_LEVELS, FALLBACK_PRIORITY, MODELS, SUBSCRIPTION_PROVIDER_LABELS, defaultModelSource, modelById, modelsForSubscription, subscriptionIsReady, subscriptionSourceId, tierDefaultsForSource } from '../data/models'
import { connectSubscription, probeModelGateway } from '../api/workspace'
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
  // 编辑保存成功的信号:父组件每次保存成功递增,对话框据此重置基线并提示。
  savedToken: number
}>()
const emit = defineEmits<{
  submit: [config: AgentConfig]
  delete: []
  cancel: []
}>()

const { t, locale } = useI18n()
type ModelSection = 'source' | 'defaults' | 'tiers' | 'advanced'
const MODEL_SECTIONS = ['source', 'defaults', 'tiers', 'advanced'] as const

interface ModelSectionOption {
  id: ModelSection
  label: string
}

interface SelectOption {
  value: string
  label: string
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
const saveStateId = `${dialogId}-save-state`

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
// 脏状态:当前规范化草稿与服务端基线比较。用户改回原值会重新变干净;新建模式不套用。
const baselineSerialized = ref('')
const savedAt = ref('')
const savedAnnouncement = ref('')
const seenSavedToken = ref(props.savedToken)
const saveScanKey = ref(0)
const isDirty = computed(() => !isCreate.value && (gatewayDraftDirty.value || JSON.stringify({ name: name.value.trim(), note: note.value.trim(), model: modelConfig.value }) !== baselineSerialized.value))
const isValid = computed(() => name.value.trim() !== '' && note.value.trim() !== '' && modelConfig.value.defaultModelId.trim() !== '' && !hasUnavailableSourceModels.value && gatewayDraftValid.value)
type SaveState = 'saving' | 'error' | 'saved' | 'incomplete' | 'blocked' | 'attention' | 'dirty' | 'clean'
const saveStateKind = computed<SaveState>(() => {
  if (props.busy) return 'saving'
  if (props.error !== '') return 'error'
  if (!isCreate.value && !isDirty.value && savedAt.value !== '') return 'saved'
  // 来源不可用时保存被拦下,页脚必须直接说明原因,不能只说「有未保存的更改」。
  if (!sourceReady.value) return 'blocked'
  // 有模型不在当前来源时,页脚给出一句轻量原因;具体位置由 tab 上的警示图标指出。
  if (hasUnavailableSourceModels.value) return 'attention'
  if (!isValid.value) return 'incomplete'
  if (!isCreate.value) return isDirty.value ? 'dirty' : 'clean'
  return 'incomplete'
})
const saveStateLabel = computed(() => {
  const copy = t.value.workspace.agentAdmin
  if (saveStateKind.value === 'saving') return copy.saving
  if (saveStateKind.value === 'error') return copy.saveStateFailed
  if (saveStateKind.value === 'saved') return copy.savedInline
  if (saveStateKind.value === 'blocked') return activeSource.value === undefined ? copy.saveStateNoSource : copy.saveStateBlocked
  if (saveStateKind.value === 'attention') return copy.saveStateNeedsModels
  if (saveStateKind.value === 'incomplete') return copy.saveStateIncomplete
  if (saveStateKind.value === 'dirty') return copy.saveStateDirty
  return copy.saveStateClean
})
function formatSavedAt(): string {
  return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())
}
const isModelDefault = computed(() => modelConfig.value.defaultModelId === defaultModelIdInSource.value
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

// ---- 模型来源 ----
interface GatewayDraft {
  id: string
  name: string
  baseUrl: string
  modelsUrl: string
  apiKeyInput: string
  apiKeyMasked: string
  apiKeySet: boolean
  modelsText: string
}

// 网关表单是 Agent 配置的一部分:与底部「保存」共用同一次提交,不再有局部保存按钮。
const gatewayDraftBaseline = ref('')
function serializeGatewayDraft(draft: GatewayDraft): string {
  return JSON.stringify({
    name: draft.name.trim(), baseUrl: draft.baseUrl.trim(), modelsUrl: draft.modelsUrl.trim(), apiKeyInput: draft.apiKeyInput.trim(),
    apiKeySet: draft.apiKeySet, apiKeyMasked: draft.apiKeyMasked,
    modelsText: draft.modelsText,
  })
}
const gatewayDraftDirty = computed(() => gatewayDraft.value !== null && serializeGatewayDraft(gatewayDraft.value) !== gatewayDraftBaseline.value)
function gatewayDraftError(draft: GatewayDraft): string {
  const copy = t.value.workspace.agentAdmin
  if (draft.name.trim() === '') return copy.gatewayNameRequired
  if (draft.baseUrl.trim() === '') return copy.gatewayUrlRequired
  if (!draft.apiKeySet && draft.apiKeyInput.trim() === '') return copy.gatewayKeyRequired
  return ''
}
const gatewayDraftValid = computed(() => gatewayDraft.value === null || gatewayDraftError(gatewayDraft.value) === '')

const sourceBusy = ref(false)
const sourceNotice = ref('')
const editingGatewayId = ref<string | null>(null)
const gatewayDraft = ref<GatewayDraft | null>(null)
const gatewayProbe = ref<GatewayProbe | null>(null)
const gatewayProbeBusy = ref(false)
const probeAnnouncement = ref('')
const probeScanKey = ref(0)
const PROBE_SUCCESS_DURATION_MS = 5_000
let probeTimer: ReturnType<typeof setTimeout> | undefined
let probeRequestId = 0

function clearSourceCheck(): void {
  clearTimeout(probeTimer)
  probeTimer = undefined
  probeRequestId += 1
  gatewayProbe.value = null
  subscriptionCheckNotice.value = ''
  gatewayProbeBusy.value = false
  probeAnnouncement.value = ''
}
const showGatewayKey = ref(false)
const gatewayModelsRef = ref<HTMLTextAreaElement | null>(null)
const isModelsUrlEditing = ref(false)
const modelsUrlDraft = ref('')
const modelsUrlInputRef = ref<HTMLInputElement | null>(null)
const modelsUrlEditRef = ref<HTMLButtonElement | null>(null)
const gatewayModels = computed(() => modelsFromText(gatewayDraft.value?.modelsText ?? ''))
const isSavedGatewayKey = computed(() => gatewayDraft.value?.apiKeySet === true && gatewayDraft.value.apiKeyInput.trim() === '')
const gatewayKeyPlaceholder = computed(() => isSavedGatewayKey.value
  ? t.value.workspace.agentAdmin.gatewayApiKeyKeepPlaceholder.replace('{masked}', gatewayDraft.value?.apiKeyMasked ?? '')
  : t.value.workspace.agentAdmin.gatewayApiKeyPlaceholder)
// 高度由实际行高、padding 与边框测量得出;CSS 将其约束在 3–8 行。
async function resizeGatewayModels(): Promise<void> {
  await nextTick()
  const textarea = gatewayModelsRef.value
  if (textarea === null || textarea.clientWidth === 0) return
  const style = getComputedStyle(textarea)
  textarea.style.blockSize = 'auto'
  textarea.style.blockSize = `${textarea.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`
}

watch([() => gatewayDraft.value?.modelsText, gatewayModelsRef, activeTab, activeModelSection], () => {
  void resizeGatewayModels()
}, { flush: 'post' })

// 窗口变窄时长 ID 会折行,宽度变化后重新测量,高度变化本身不触发循环。
watch(gatewayModelsRef, (textarea, _previous, onCleanup) => {
  if (textarea === null) return
  let previousWidth = 0
  const observer = new ResizeObserver(() => {
    if (textarea.clientWidth === previousWidth) return
    previousWidth = textarea.clientWidth
    void resizeGatewayModels()
  })
  observer.observe(textarea)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })

async function startModelsUrlEdit(): Promise<void> {
  if (props.busy) return
  modelsUrlDraft.value = effectiveModelsUrl.value
  isModelsUrlEditing.value = true
  await nextTick()
  modelsUrlInputRef.value?.focus()
  modelsUrlInputRef.value?.select()
}

async function cancelModelsUrlEdit(): Promise<void> {
  isModelsUrlEditing.value = false
  modelsUrlDraft.value = ''
  await nextTick()
  modelsUrlEditRef.value?.focus()
}

async function saveModelsUrl(): Promise<void> {
  if (props.busy || gatewayDraft.value === null) return
  const url = modelsUrlDraft.value.trim()
  // 空值与当前惯用地址都归一为空串,继续跟随请求地址推导。
  gatewayDraft.value.modelsUrl = url === '' || url === gatewayModelsEndpoint.value ? '' : url
  await cancelModelsUrlEdit()
}

function onModelsUrlKeydown(event: KeyboardEvent): void {
  if (!isModelsUrlEditing.value || event.isComposing) return
  if (event.key !== 'Escape' && event.key !== 'Enter') return
  if (event.key === 'Enter' && event.target !== modelsUrlInputRef.value) return
  // 阻止 Esc 关闭外层 dialog,输入框 Enter 提交 URL,按钮保留各自的键盘动作。
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Escape') void cancelModelsUrlEdit()
  else void saveModelsUrl()
}
const deletingGatewayId = ref('')
const removingSubscriptionProvider = ref<ModelSubscriptionProviderId | ''>('')
// 订阅的配置页:展示账户事实,并可检查连接或移除来源。
const editingSubscriptionProvider = ref<ModelSubscriptionProviderId | ''>('')
const subscriptionCheckNotice = ref('')
const subscriptionCheckOk = ref(true)
const hasSourceCheck = computed(() => gatewayProbe.value !== null || subscriptionCheckNotice.value !== '')
const sourceCheckOk = computed(() => gatewayProbe.value?.connected ?? subscriptionCheckOk.value)

// 两类来源只占同一个反馈槽:新的结果接管计时器,成功限时,失败保留。
function publishSourceCheck(isOk: boolean, announcement: string): void {
  clearTimeout(probeTimer)
  probeTimer = undefined
  probeAnnouncement.value = announcement
  if (!isOk) return
  probeScanKey.value += 1
  probeTimer = setTimeout(clearSourceCheck, PROBE_SUCCESS_DURATION_MS)
}
// 从来源列表进入子视图后,返回时焦点应回到打开它的 ⋯。
const gatewayReturnFocusId = ref('')
// 当前展开的行内操作菜单:订阅用固定键,网关用自身 id;同一时间只开一个。
const sourceMenuId = ref('')
// 菜单用 fixed 定位并按视口夹取:既不被 dialog 的滚动容器裁切,也不会盖住首项。
const sourceMenuPosition = ref({ top: '-9999px', left: '-9999px' })
let sourceMenuScrollTarget: HTMLElement | null = null

const modelSource = computed(() => modelConfig.value.source)
const subscriptions = computed(() => modelSource.value.subscriptions)
const tierDefaults = computed(() => tierDefaultsForSource(modelSource.value))

// 从多行文本解析模型 id:去空行、去首尾空格、保序去重。
function modelsFromText(text: string): string[] {
  return [...new Set(text.split('\n').map((line) => line.trim()).filter((line) => line !== ''))]
}

// 把表单草稿转成来源对象。id 由调用方给出:保存时生成真实 id,预览时用固定占位。
function gatewayFromDraft(draft: GatewayDraft, id: string): ModelGateway {
  const keyInput = draft.apiKeyInput.trim()
  return {
    id,
    name: draft.name.trim(),
    baseUrl: draft.baseUrl.trim(),
    modelsUrl: draft.modelsUrl.trim(),
    apiKeyMasked: keyInput === '' ? draft.apiKeyMasked : maskKey(keyInput),
    apiKeySet: keyInput !== '' || draft.apiKeySet,
    models: modelsFromText(draft.modelsText),
  }
}

// 保存校验必须以表单草稿为准:编辑中的来源还没写回 modelConfig,
// 否则补全地址 / 密钥后,底部「保存」仍按旧状态判定为不可用。
const DRAFT_GATEWAY_ID = 'gateway:draft'
const gatewayDraftAsGateway = computed<ModelGateway | null>(() => {
  const draft = gatewayDraft.value
  if (draft === null) return null
  return gatewayFromDraft(draft, draft.id === '' ? DRAFT_GATEWAY_ID : draft.id)
})
const effectiveModelSource = computed<ModelSource>(() => {
  const source = modelSource.value
  const draftGateway = gatewayDraftAsGateway.value
  if (draftGateway === null) return source
  const exists = source.gateways.some((item) => item.id === draftGateway.id)
  const gateways = exists
    ? source.gateways.map((item) => item.id === draftGateway.id ? draftGateway : item)
    : [...source.gateways, draftGateway]
  // 没有任何来源时,新建的草稿就是唯一候选;与 applyGatewayDraft 的自动启用规则一致。
  const activeSourceId = source.activeSourceId === '' && draftGateway.id === DRAFT_GATEWAY_ID
    ? draftGateway.id
    : source.activeSourceId
  return { ...source, gateways, activeSourceId }
})

// 订阅与 API 渠道都是「来源」:合并成一份列表,用 activeSourceId 选出运行时启用项。
type SourceRow =
  | { id: string; type: 'subscription'; subscription: ModelSubscription }
  | { id: string; type: 'gateway'; gateway: ModelGateway }
const ADD_SOURCE_MENU = 'add-source'
const activeSourceId = computed(() => effectiveModelSource.value.activeSourceId)
const allSources = computed<SourceRow[]>(() => {
  const rows: SourceRow[] = []
  const source = effectiveModelSource.value
  for (const subscription of source.subscriptions) {
    rows.push({ id: subscriptionSourceId(subscription.provider), type: 'subscription', subscription })
  }
  for (const gateway of source.gateways) {
    rows.push({ id: gateway.id, type: 'gateway', gateway })
  }
  return rows
})
const activeSource = computed(() => allSources.value.find((row) => row.id === activeSourceId.value))
function sourceRowReady(row: SourceRow): boolean {
  if (row.type === 'subscription') return subscriptionIsReady(row.subscription)
  return row.gateway.baseUrl.trim() !== '' && row.gateway.apiKeySet
}
const sourceReady = computed(() => activeSource.value !== undefined && sourceRowReady(activeSource.value))
// 保存还要求来源可用:没有可用来源时不允许把模型配置写回。
const canSubmit = computed(() => isValid.value && !props.busy && (isCreate.value || isDirty.value) && sourceReady.value)

function sourceName(row: SourceRow): string {
  if (row.type === 'subscription') {
    return t.value.workspace.agentAdmin.subscriptionSourceTitle.replace('{provider}', SUBSCRIPTION_PROVIDER_LABELS[row.subscription.provider])
  }
  return row.gateway.name
}
function sourceUseLabel(row: SourceRow): string {
  return t.value.workspace.agentAdmin.sourceUseLabel.replace('{name}', sourceName(row))
}
function sourceActionsLabel(row: SourceRow): string {
  return t.value.workspace.agentAdmin.sourceActionsLabel.replace('{name}', sourceName(row))
}
function isSourceActive(row: SourceRow): boolean {
  return activeSourceId.value === row.id
}
const editingSubscription = computed(() => editingSubscriptionProvider.value === ''
  ? undefined
  : subscriptions.value.find((item) => item.provider === editingSubscriptionProvider.value))
function providerTitle(provider: ModelSubscriptionProviderId): string {
  return t.value.workspace.agentAdmin.subscriptionSourceTitle.replace('{provider}', SUBSCRIPTION_PROVIDER_LABELS[provider])
}
function sourceStatusOf(row: SourceRow): string {
  if (row.type === 'subscription') return subscriptionStatusOf(row.subscription)
  return row.gateway.apiKeySet ? t.value.workspace.agentAdmin.gatewayConfigured : t.value.workspace.agentAdmin.gatewayUnverified
}
function sourceToneOf(row: SourceRow): string {
  if (row.type === 'subscription') return subscriptionToneOf(row.subscription)
  return row.gateway.baseUrl.trim() !== '' && row.gateway.apiKeySet ? 'ok' : 'muted'
}
function subscriptionStatusOf(subscription: ModelSubscription): string {
  if (!subscription.connected) return t.value.workspace.agentAdmin.subscriptionDisconnected
  return subscriptionIsReady(subscription)
    ? t.value.workspace.agentAdmin.subscriptionConnected
    : t.value.workspace.agentAdmin.subscriptionExpired
}
function subscriptionToneOf(subscription: ModelSubscription): string {
  if (!subscription.connected) return 'muted'
  return subscriptionIsReady(subscription) ? 'ok' : 'warning'
}
// 一行说完账户事实:套餐 · 账户 · 到期日。
function subscriptionMetaOf(subscription: ModelSubscription): string {
  if (!subscription.connected) return ''
  const expires = subscription.expiresAt.slice(0, 10)
  return `${subscription.plan} · ${subscription.account} · ${t.value.workspace.agentAdmin.subscriptionExpires} ${expires}`
}
const sourceModels = computed<SelectOption[]>(() => {
  const row = activeSource.value
  if (row === undefined) return []
  if (row.type === 'subscription') {
    if (!subscriptionIsReady(row.subscription)) return []
    return modelsForSubscription(row.subscription.provider).map((model) => ({ value: model.id, label: modelOptionLabel(model) }))
  }
  return row.gateway.models.map((id) => ({ value: id, label: modelNameOf(id) }))
})
// 当前来源的「未自定义」默认模型:内置默认在来源中就用它,否则退回来源第一项。
const defaultModelIdInSource = computed(() => sourceModels.value.some((option) => option.value === DEFAULT_MODEL.id)
  ? DEFAULT_MODEL.id
  : (sourceModels.value[0]?.value ?? ''))
// 已配置的模型必须存在于当前来源;切换来源后残留的旧模型会阻止保存并给出提示。
const sourceModelIds = computed(() => new Set(sourceModels.value.map((option) => option.value)))
const configuredModelIds = computed(() => {
  const config = modelConfig.value
  const ids = [config.defaultModelId, config.subagentModelId, ...config.fallbackModelIds]
  // 空串档位会解析到当前来源的内置默认模型,同样必须存在。
  for (const tierId of TIER_IDS) ids.push(config.tiers[tierId].modelId || tierDefaults.value[tierId])
  return ids.filter((id) => id !== '')
})
const hasUnavailableSourceModels = computed(() => sourceReady.value
  && configuredModelIds.value.some((id) => !sourceModelIds.value.has(id)))
// 只在对应分区提示:默认模型 / 子 Agent,以及四档映射。
const unavailableDefaultModels = computed(() => sourceReady.value
  && [modelConfig.value.defaultModelId, modelConfig.value.subagentModelId]
    .filter((id) => id !== '')
    .some((id) => !sourceModelIds.value.has(id)))
const unavailableTierModels = computed(() => sourceReady.value
  && TIER_IDS.some((tierId) => !sourceModelIds.value.has(modelConfig.value.tiers[tierId].modelId || tierDefaults.value[tierId])))
const defaultModelUnavailable = computed(() => sourceReady.value
  && sceneSafeModelUnavailable(modelConfig.value.defaultModelId))
const subagentModelUnavailable = computed(() => sourceReady.value
  && sceneSafeModelUnavailable(modelConfig.value.subagentModelId))
function sceneSafeModelUnavailable(id: string): boolean {
  return id !== '' && !sourceModelIds.value.has(id)
}
function tierModelUnavailable(tierId: ModelTierId): boolean {
  if (!sourceReady.value) return false
  return !sourceModelIds.value.has(modelConfig.value.tiers[tierId].modelId || tierDefaults.value[tierId])
}
function sectionNeedsAttention(section: ModelSection): boolean {
  if (section === 'defaults') return unavailableDefaultModels.value
  if (section === 'tiers') return unavailableTierModels.value
  return false
}

function modelCountLabel(count: number): string {
  const template = count === 1
    ? t.value.workspace.agentAdmin.gatewayModelsOne
    : t.value.workspace.agentAdmin.gatewayModels
  return template.replace('{count}', String(count))
}
function gatewayModelCount(gateway: ModelGateway): string {
  return modelCountLabel(gateway.models.length)
}

// 离开订阅子视图时清除反馈,并阻止未完成的检查把旧结果带到其它页面。
watch([activeTab, activeModelSection], () => {
  if (editingSubscriptionProvider.value !== '') clearSourceCheck()
})

// 探测结果只对当时的地址 / 密钥 / 模型列表端点有效:任一改变就清空。
watch([() => gatewayDraft.value?.baseUrl, () => gatewayDraft.value?.apiKeyInput, () => gatewayDraft.value?.modelsUrl], clearSourceCheck)

watch(sourceReady, (ready) => {
  if (!ready && activeModelSection.value !== 'source') activeModelSection.value = 'source'
})

const DEFAULT_TIER_EFFORT: EffortLevel = 'high'
const TIER_IDS = ['fable', 'opus', 'sonnet', 'haiku'] as const
const COMPACT_WINDOW_OPTIONS = [0, 100_000, 200_000, 500_000, 1_000_000] as const
const THINKING_BUDGET_OPTIONS = [0, 8_192, 16_384, 32_768, 65_536] as const

// 默认值:主对话 effort 空 = 模型默认;子 Agent effort 空 = 跟随对话;
// 档位 effort 默认 high(不再默认「跟随对话」)。
function defaultModelConfig(): AgentModelConfig {
  return {
    source: defaultModelSource(),
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
  if (props.busy) return
  // 只重置模型选择,保留来源(订阅状态与已配置的网关),也不重新灌入演示网关。
  modelConfig.value = {
    ...defaultModelConfig(),
    source: modelSource.value,
    defaultModelId: defaultModelIdInSource.value,
  }
}

// 深拷贝:档位是嵌套对象、回退是数组,避免对话框与列表共享引用。
function cloneModelConfig(config: AgentModelConfig): AgentModelConfig {
  return {
    ...config,
    source: {
      ...config.source,
      subscriptions: config.source.subscriptions.map((subscription) => ({ ...subscription })),
      gateways: config.source.gateways.map((gateway) => ({ ...gateway, models: [...gateway.models] })),
    },
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
  const model = MODELS.find((item) => item.id === id)
  return model === undefined ? id : t.value.workspace.models[model.nameKey]
}

// 不可用值会出现在原生 select 的关闭态里,而原生 select 不会省略:
// 统一去掉「Claude」品牌前缀 + 用短后缀,保证「不可用」本身不被裁掉。
function compactModelLabel(id: string): string {
  const name = modelNameOf(id).replace(/^Claude /, '')
  return sourceModelIds.value.has(id)
    ? name
    : `${name} · ${t.value.workspace.agentAdmin.modelUnavailableShort}`
}

// 模型选项同时显示渠道:全局模型库按渠道管理,Agent 配置需要看到模型从哪来。
function modelOptionLabel(model: ModelOption): string {
  return `${modelNameOf(model.id)} · ${model.provider}`
}

// 模型详情(ID / 窗口 / 说明)进 hover tooltip,不占版面。
function tokenLabel(tokens: number): string {
  return tokens >= 1_000_000 ? `${Math.round(tokens / 1_000_000)}M` : `${Math.round(tokens / 1000)}K`
}

const compactWindowLabel = tokenLabel
// 思考预算按 1024 的整数倍展示(8K / 16K / 32K / 64K),避免 32768 被四舍五入成「33K」。
function thinkingBudgetLabel(tokens: number): string {
  return `${Math.round(tokens / 1024)}K`
}

function tierModelOf(tierId: ModelTierId): string {
  return modelConfig.value.tiers[tierId].modelId || tierDefaults.value[tierId]
}

// 档位模型下拉去掉「跟随默认」前缀:第一项直接显示内置默认模型名,其余项排除它,
// 避免同一个模型名在下拉里出现两次;显式选了内置默认的旧数据在 reset() 里归一到空串。
// 模型选项来自当前来源:订阅给内置目录,网关给网关的模型列表;自定义值仍可输入。
function tierModelOptions(tierId: ModelTierId): readonly SelectOption[] {
  return sourceModels.value
    .filter((option) => option.value !== tierDefaults.value[tierId])
    .map((option) => ({ value: option.value, label: compactModelLabel(option.value) }))
}

function tierModelSelectOptions(tierId: ModelTierId): SelectOption[] {
  const options = tierModelOptions(tierId)
  const current = modelConfig.value.tiers[tierId].modelId
  // 默认项直接给出解析到的模型名,四个档位不再共用同一句模糊的「内置默认」。
  const defaultModelId = tierDefaults.value[tierId]
  // 默认项直接显示解析到的模型名;「内置默认」前缀对用户没有信息价值。
  const defaultLabel = compactModelLabel(defaultModelId)
  const base: SelectOption[] = [{ value: '', label: defaultLabel }, ...options]
  return current !== '' && !options.some((option) => option.value === current)
    ? [{ value: current, label: compactModelLabel(current) }, ...base]
    : base
}

// 当前模型在切换来源后可能不在新列表里:保留它作为一项,避免 select 显示空白。
function modelSelectOptions(current: string): SelectOption[] {
  if (current === '' || sourceModels.value.some((option) => option.value === current)) return sourceModels.value
  return [{ value: current, label: compactModelLabel(current) }, ...sourceModels.value]
}

// ---- 来源操作 ----
function replaceSubscription(next: ModelSubscription): void {
  const subscriptions = modelSource.value.subscriptions.map((item) => item.provider === next.provider ? next : item)
  modelConfig.value = { ...modelConfig.value, source: { ...modelSource.value, subscriptions } }
}

function hasSubscription(provider: ModelSubscriptionProviderId): boolean {
  return subscriptions.value.some((item) => item.provider === provider)
}

// 添加订阅:连接成功后追加来源。只有完全没有来源时才自动启用它,否则保留用户当前的选择。
async function addSubscription(provider: ModelSubscriptionProviderId): Promise<void> {
  closeSourceMenu()
  if (sourceBusy.value || hasSubscription(provider)) return
  sourceBusy.value = true
  const result = await connectSubscription(provider)
  sourceBusy.value = false
  if (!result.ok) return
  sourceNotice.value = ''
  const id = subscriptionSourceId(provider)
  const activeSourceId = modelSource.value.activeSourceId
  modelConfig.value = {
    ...modelConfig.value,
    source: {
      ...modelSource.value,
      subscriptions: [...modelSource.value.subscriptions, result.value],
      activeSourceId: activeSourceId === '' ? id : activeSourceId,
    },
  }
  void nextTick(() => document.getElementById(sourceMenuTriggerId(id))?.focus())
}

// 检查连接只刷新凭据状态,不改变当前启用的来源。
async function checkSubscription(subscription: ModelSubscription): Promise<void> {
  if (sourceBusy.value) return
  clearSourceCheck()
  const requestId = probeRequestId
  sourceBusy.value = true
  const result = await connectSubscription(subscription.provider)
  sourceBusy.value = false
  if (requestId !== probeRequestId || !props.open) return
  if (!result.ok) {
    subscriptionCheckOk.value = false
    subscriptionCheckNotice.value = t.value.workspace.agentAdmin.sourceCheckFailed
    publishSourceCheck(false, subscriptionCheckNotice.value)
    return
  }
  sourceNotice.value = ''
  replaceSubscription(result.value)
  subscriptionCheckOk.value = true
  subscriptionCheckNotice.value = t.value.workspace.agentAdmin.sourceCheckSuccess
  publishSourceCheck(true, subscriptionCheckNotice.value)
}

function useSource(row: SourceRow): void {
  if (row.type === 'subscription' && !subscriptionIsReady(row.subscription)) {
    sourceNotice.value = t.value.workspace.agentAdmin.sourceRequired
    return
  }
  if (row.type === 'gateway' && (row.gateway.baseUrl.trim() === '' || !row.gateway.apiKeySet)) {
    sourceNotice.value = t.value.workspace.agentAdmin.sourceRequired
    return
  }
  sourceNotice.value = ''
  modelConfig.value = { ...modelConfig.value, source: { ...modelSource.value, activeSourceId: row.id } }
}

// ---- 行内操作菜单 ----
// 用原生按钮 + 自管 disclosure,不用组件库下拉:菜单项的键盘可达性必须自己保证。
function sourceDomKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-')
}
function sourceMenuDomId(id: string): string {
  return `${dialogId}-source-menu-${sourceDomKey(id)}`
}
function sourceMenuTriggerId(id: string): string {
  return `${sourceMenuDomId(id)}-trigger`
}

function closeSourceMenu(restoreFocus = false): void {
  const id = sourceMenuId.value
  if (id === '') return
  sourceMenuId.value = ''
  sourceMenuScrollTarget?.removeEventListener('scroll', onSourceMenuContextChange)
  sourceMenuScrollTarget = null
  window.removeEventListener('resize', onSourceMenuContextChange)
  if (restoreFocus) void nextTick(() => document.getElementById(sourceMenuTriggerId(id))?.focus())
}

function onSourceMenuContextChange(): void {
  closeSourceMenu()
}

function toggleSourceMenu(id: string): void {
  if (sourceMenuId.value === id) {
    closeSourceMenu(true)
    return
  }
  sourceMenuId.value = id
  void nextTick(() => {
    const trigger = document.getElementById(sourceMenuTriggerId(id))
    const menu = document.getElementById(sourceMenuDomId(id))
    if (trigger === null || menu === null) return
    const rect = trigger.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const margin = 8
    // 先尝试向下;放不下再翻到上方,最后夹取到视口内(菜单本身可滚动)。
    let top = rect.bottom + 4
    if (top + menuRect.height > window.innerHeight - margin) top = rect.top - menuRect.height - 4
    top = Math.max(margin, Math.min(top, window.innerHeight - menuRect.height - margin))
    const left = Math.max(margin, Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - margin))
    sourceMenuPosition.value = { top: `${top}px`, left: `${left}px` }
    const scrollParent = trigger.closest('.agent-editor__body')
    if (scrollParent instanceof HTMLElement) {
      sourceMenuScrollTarget = scrollParent
      scrollParent.addEventListener('scroll', onSourceMenuContextChange, { passive: true })
    }
    window.addEventListener('resize', onSourceMenuContextChange)
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  })
}

// 菜单内用方向键在菜单项间移动;Esc / Tab 收起并把焦点还给触发钮。
function onSourceMenuKeydown(event: KeyboardEvent, id: string): void {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    closeSourceMenu(true)
    return
  }
  const menu = document.getElementById(sourceMenuDomId(id))
  if (menu === null) return
  const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
  if (items.length === 0) return
  const index = items.findIndex((item) => item === document.activeElement)
  const nextIndex = event.key === 'ArrowDown' ? (index + 1) % items.length
    : event.key === 'ArrowUp' ? (index <= 0 ? items.length - 1 : index - 1)
      : event.key === 'Home' ? 0
        : event.key === 'End' ? items.length - 1
          : -1
  if (nextIndex < 0) return
  event.preventDefault()
  items[nextIndex]?.focus()
}

function editSubscriptionFromMenu(provider: ModelSubscriptionProviderId): void {
  closeSourceMenu()
  clearSourceCheck()
  editingSubscriptionProvider.value = provider
  enterSourceSubview()
}
function removeSubscriptionFromMenu(provider: ModelSubscriptionProviderId): void {
  closeSourceMenu()
  removingSubscriptionProvider.value = provider
  void nextTick(() => document.getElementById(`${dialogId}-subscription-remove-${provider}`)?.focus())
}
function addSubscriptionFromMenu(provider: ModelSubscriptionProviderId): void {
  void addSubscription(provider)
}
function addApiFromMenu(): void {
  closeSourceMenu()
  gatewayReturnFocusId.value = sourceMenuTriggerId(ADD_SOURCE_MENU)
  startAddGateway()
  enterSourceSubview()
}
function editGatewayFromMenu(gateway: ModelGateway): void {
  closeSourceMenu()
  gatewayReturnFocusId.value = sourceMenuTriggerId(gateway.id)
  startEditGateway(gateway)
  enterSourceSubview()
}
function deleteGatewayFromMenu(id: string): void {
  closeSourceMenu()
  deletingGatewayId.value = id
  void nextTick(() => document.getElementById(`${dialogId}-gateway-delete-${sourceDomKey(id)}`)?.focus())
}

function removeSubscription(provider: ModelSubscriptionProviderId): void {
  const id = subscriptionSourceId(provider)
  const subscriptions = modelSource.value.subscriptions.filter((item) => item.provider !== provider)
  const activeSourceId = modelSource.value.activeSourceId === id ? '' : modelSource.value.activeSourceId
  modelConfig.value = { ...modelConfig.value, source: { ...modelSource.value, subscriptions, activeSourceId } }
  removingSubscriptionProvider.value = ''
  clearSourceCheck()
  editingSubscriptionProvider.value = ''
  // 删到空列表时回到顶部,保证空状态的行动按钮可见。
  if (subscriptions.length === 0 && modelSource.value.gateways.length === 0 && bodyRef.value !== null) bodyRef.value.scrollTop = 0
  void nextTick(() => document.getElementById(sourceMenuTriggerId(ADD_SOURCE_MENU))?.focus())
}

function closeSubscriptionConfig(): void {
  const provider = editingSubscriptionProvider.value
  editingSubscriptionProvider.value = ''
  clearSourceCheck()
  if (provider === '') return
  void nextTick(() => document.getElementById(sourceMenuTriggerId(subscriptionSourceId(provider)))?.focus())
}

// 进入配置子视图:滚回顶部,避免 sticky 子 tab 盖住「返回来源」;焦点落到返回按钮。
function enterSourceSubview(): void {
  void nextTick(() => {
    if (bodyRef.value !== null) bodyRef.value.scrollTop = 0
    document.getElementById(`${dialogId}-source-back`)?.focus()
  })
}

function cancelSubscriptionRemoval(): void {
  removingSubscriptionProvider.value = ''
  void nextTick(() => document.getElementById(`${dialogId}-source-remove-trigger`)?.focus())
}

// 在配置页移除来源:走与行内菜单相同的两步确认。
function askRemoveFromConfig(): void {
  const provider = editingSubscriptionProvider.value
  if (provider === '') return
  removingSubscriptionProvider.value = provider
}

function startAddGateway(): void {
  sourceNotice.value = ''
  editingGatewayId.value = ''
  clearSourceCheck()
  showGatewayKey.value = false
  isModelsUrlEditing.value = false
  modelsUrlDraft.value = ''
  gatewayDraft.value = {
    id: '', name: '', baseUrl: '', modelsUrl: '',
    apiKeyInput: '', apiKeyMasked: '', apiKeySet: false, modelsText: '',
  }
  gatewayDraftBaseline.value = serializeGatewayDraft(gatewayDraft.value)
}

function startEditGateway(gateway: ModelGateway): void {
  sourceNotice.value = ''
  editingGatewayId.value = gateway.id
  clearSourceCheck()
  showGatewayKey.value = false
  isModelsUrlEditing.value = false
  modelsUrlDraft.value = ''
  gatewayDraft.value = {
    id: gateway.id, name: gateway.name, baseUrl: gateway.baseUrl, modelsUrl: gateway.modelsUrl, apiKeyInput: '', apiKeyMasked: gateway.apiKeyMasked,
    apiKeySet: gateway.apiKeySet, modelsText: gateway.models.join('\n'),
  }
  gatewayDraftBaseline.value = serializeGatewayDraft(gatewayDraft.value)
}

// 返回列表:有改动且合法时先写回内存中的 Agent 配置,再由底部「保存」统一提交。
function cancelGatewayEdit(): void {
  if (gatewayDraft.value !== null && gatewayDraftDirty.value && !applyGatewayDraft()) return
  editingGatewayId.value = null
  gatewayDraft.value = null
  clearSourceCheck()
  sourceNotice.value = ''
  // 表单退回列表后,把焦点交还给打开它的 ⋯(新建时是「添加来源」)。
  const target = gatewayReturnFocusId.value === '' ? sourceMenuTriggerId(ADD_SOURCE_MENU) : gatewayReturnFocusId.value
  void nextTick(() => document.getElementById(target)?.focus())
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 3)}••••••••${key.slice(-4)}`
}

function applyGatewayDraft(): boolean {
  const draft = gatewayDraft.value
  if (draft === null) return true
  const error = gatewayDraftError(draft)
  if (error !== '') { sourceNotice.value = error; return false }
  const isNew = draft.id === ''
  const gateway = gatewayFromDraft(draft, isNew ? `gateway:${Date.now()}` : draft.id)
  const gateways = isNew
    ? [...modelSource.value.gateways, gateway]
    : modelSource.value.gateways.map((item) => item.id === gateway.id ? gateway : item)
  // 改动先落到内存配置;只有完全没有可用来源时才自动启用新建渠道。
  const activeSourceId = isNew && modelSource.value.activeSourceId === ''
    ? gateway.id
    : modelSource.value.activeSourceId
  modelConfig.value = { ...modelConfig.value, source: { ...modelSource.value, gateways, activeSourceId } }
  gatewayDraftBaseline.value = serializeGatewayDraft(draft)
  sourceNotice.value = ''
  return true
}

// 提交时把表单写回配置并收起表单,真正的持久化仍由对话框底部「保存」完成。
function commitGatewayDraft(): boolean {
  if (!applyGatewayDraft()) return false
  editingGatewayId.value = null
  gatewayDraft.value = null
  clearSourceCheck()
  return true
}

function deleteGateway(id: string): void {
  const remaining = modelSource.value.gateways.filter((gateway) => gateway.id !== id)
  // 删掉当前来源时回到未配置,不自动挑一个替代来源。
  const activeSourceId = modelSource.value.activeSourceId === id ? '' : modelSource.value.activeSourceId
  modelConfig.value = {
    ...modelConfig.value,
    source: { ...modelSource.value, gateways: remaining, activeSourceId },
  }
  deletingGatewayId.value = ''
  if (remaining.length === 0 && modelSource.value.subscriptions.length === 0 && bodyRef.value !== null) bodyRef.value.scrollTop = 0
  void nextTick(() => document.getElementById(sourceMenuTriggerId(ADD_SOURCE_MENU))?.focus())
}

// 模型列表端点从完整请求地址推导:主流协议都把列表放在同一版本段的 /models 下。
// 例:/v1/messages → /v1/models,/api/v1/chat/completions → /api/v1/models。
// 推导失败时不猜测,由用户手动填写模型。
const MODEL_ENDPOINT_SUFFIXES = ['/chat/completions', '/messages', '/responses', '/completions'] as const
function modelsEndpointFor(requestUrl: string): string {
  const trimmed = requestUrl.trim()
  if (trimmed === '') return ''
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
  const path = url.pathname.replace(/\/+$/, '')
  if (/\/models$/i.test(path)) {
    url.pathname = path
    url.search = ''
    url.hash = ''
    return url.toString()
  }
  const suffix = MODEL_ENDPOINT_SUFFIXES.find((item) => path.toLowerCase().endsWith(item))
  const basePath = suffix === undefined ? path : path.slice(0, -suffix.length)
  url.pathname = `${basePath === '' ? '/v1' : basePath}/models`
  url.search = ''
  url.hash = ''
  return url.toString()
}

const gatewayModelsEndpoint = computed(() => modelsEndpointFor(gatewayDraft.value?.baseUrl ?? ''))
const effectiveModelsUrl = computed(() => gatewayDraft.value?.modelsUrl.trim() || gatewayModelsEndpoint.value)
const gatewayModelsHint = computed(() => {
  const copy = t.value.workspace.agentAdmin
  if (effectiveModelsUrl.value === '') return copy.gatewayModelsHintManual
  const template = gatewayDraft.value?.modelsUrl.trim() ? copy.gatewayModelsHintCustom : copy.gatewayModelsHint
  return template.replace('{url}', effectiveModelsUrl.value)
})
const gatewayRefreshTitle = computed(() => {
  const copy = t.value.workspace.agentAdmin
  return effectiveModelsUrl.value === ''
    ? copy.gatewayRefreshHint
    : `${copy.gatewayRefreshHint} · GET ${effectiveModelsUrl.value}`
})

async function testGateway(): Promise<void> {
  const draft = gatewayDraft.value
  if (draft === null || gatewayProbeBusy.value) return
  if (draft.baseUrl.trim() === '') { sourceNotice.value = t.value.workspace.agentAdmin.gatewayUrlRequired; return }
  if (effectiveModelsUrl.value === '') { sourceNotice.value = t.value.workspace.agentAdmin.gatewayUrlRequired; return }
  clearSourceCheck()
  const requestId = probeRequestId
  sourceNotice.value = ''
  gatewayProbeBusy.value = true
  const result = await probeModelGateway(draft.baseUrl.trim(), effectiveModelsUrl.value)
  // 编辑、关闭或切换来源后,不让旧请求把结果写回新草稿。
  if (requestId !== probeRequestId || !props.open) return
  gatewayProbeBusy.value = false
  if (!result.ok) return
  gatewayProbe.value = result.value
  const probe = result.value
  publishSourceCheck(probe.connected, `${probe.message} · ${probe.latencyMs}ms${probe.models.length > 0 ? ` · ${modelCountLabel(probe.models.length)}` : ''}`)
  if (!probe.connected) return
  if (probe.models.length > 0) draft.modelsText = probe.models.join('\n')
}

function supportsEffortOf(modelId: string): boolean {
  return modelById(modelId).supportsEffort
}

function effortAriaLabel(label: string): string {
  return `${label} · ${t.value.workspace.agentAdmin.modelEffortLabel}`
}

// 分区角标只报「改过几项」:默认模型按两行计,档位按四档计,高级按三组配置计。
const modelSections = computed<ModelSectionOption[]>(() => [
  { id: 'source', label: t.value.workspace.agentAdmin.modelSubtabSource },
  { id: 'defaults', label: t.value.workspace.agentAdmin.modelSubtabDefaults },
  { id: 'tiers', label: t.value.workspace.agentAdmin.modelSubtabTiers },
  { id: 'advanced', label: t.value.workspace.agentAdmin.modelSubtabAdvanced },
])

function modelSectionAriaLabel(section: ModelSectionOption): string {
  const base = section.label
  if (section.id !== 'source' && !sourceReady.value) return `${base} · ${t.value.workspace.agentAdmin.modelSourceRequiredHint}`
  if (sectionNeedsAttention(section.id)) return `${base} · ${t.value.workspace.agentAdmin.modelNeedsAttention}`
  return base
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
// 切来源后旧值可能不在新列表里 —— 仍保留为一项并标注,避免下拉变空白。
function fallbackOptionsFor(index: number): readonly SelectOption[] {
  const current = modelConfig.value.fallbackModelIds[index] ?? ''
  const selectedElsewhere = new Set(modelConfig.value.fallbackModelIds.filter((_, itemIndex) => itemIndex !== index))
  const options = sourceModels.value.filter((option) => option.value !== ''
    && (option.value === current || (option.value !== modelConfig.value.defaultModelId && !selectedElsewhere.has(option.value))))
  const compactOptions = options.map((option) => ({ value: option.value, label: compactModelLabel(option.value) }))
  if (current === '' || options.some((option) => option.value === current)) return compactOptions
  return [{ value: current, label: compactModelLabel(current) }, ...compactOptions]
}

function addFallback(): void {
  if (fallbackCount.value >= 3) return
  const used = new Set([modelConfig.value.defaultModelId, ...modelConfig.value.fallbackModelIds])
  const next = FALLBACK_PRIORITY.map((model) => model.id).find((id) => !used.has(id) && sourceModels.value.some((option) => option.value === id))
    ?? sourceModels.value.find((option) => option.value !== '' && !used.has(option.value))?.value
  if (next === undefined) return
  modelConfig.value = { ...modelConfig.value, fallbackModelIds: [...modelConfig.value.fallbackModelIds, next] }
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

// 模型分区切换:来源未配置时,后三个分区显示禁用外观并引导回来源页;
// 滚动回顶部,键盘切换时把焦点送到目标 tab。
async function activateModelSection(section: ModelSection, focus = false): Promise<void> {
  if (section !== 'source' && !sourceReady.value) {
    sourceNotice.value = t.value.workspace.agentAdmin.modelSourceRequiredHint
    activeModelSection.value = 'source'
    await nextTick()
    // 锁定的分区无法进入:焦点无条件落到来源 tab,键盘用户不会停在不可用项上。
    document.getElementById(`${dialogId}-model-tab-source`)?.focus()
    return
  }
  sourceNotice.value = ''
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
      modelId: tier.modelId === tierDefaults.value[id] ? '' : tier.modelId,
      effortLevel: effort,
    }
  }
  // 旧数据或外部写入可能把默认模型放进回退链;打开时就地修正,保证「保存」永远可提交。
  modelConfig.value = { ...model, fallbackModelIds: model.fallbackModelIds.filter((id) => id !== model.defaultModelId) }
  // 编辑设置默认落在「模型 → 模型来源」:来源是后续默认模型 / 档位 / 高级配置的前提。
  // 新建仍从基本页开始,先填模板与身份。
  activeTab.value = isCreate.value ? 'basic' : 'model'
  activeModelSection.value = 'source'
  sourceNotice.value = ''
  editingGatewayId.value = null
  gatewayDraft.value = null
  isModelsUrlEditing.value = false
  modelsUrlDraft.value = ''
  clearSourceCheck()
  editingSubscriptionProvider.value = ''
  removingSubscriptionProvider.value = ''
  deletingGatewayId.value = ''
  subscriptionCheckNotice.value = ''
  subscriptionCheckOk.value = true
  gatewayReturnFocusId.value = ''
  closeSourceMenu()
  if (bodyRef.value !== null) bodyRef.value.scrollTop = 0
  // 打开时冻结基线:之后父组件刷新 Agent 也不会在用户编辑中静默改回表单。
  baselineSerialized.value = JSON.stringify({ name: name.value.trim(), note: note.value.trim(), model: modelConfig.value })
  savedAt.value = ''
  savedAnnouncement.value = ''
  seenSavedToken.value = props.savedToken
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
    // 表单草稿属于本次保存:先写回配置,再统一校验来源与模型。
    if (gatewayDraft.value !== null && !commitGatewayDraft()) return
    // 先给出失败原因,再判断是否可提交:来源缺失与模型不属于来源都要有可见反馈。
    if (!sourceReady.value) {
      void activateModelSection('source')
      // activateModelSection 会清空来源提示,故在其后写入。
      sourceNotice.value = t.value.workspace.agentAdmin.sourceRequired
      return
    }
    if (hasUnavailableSourceModels.value) return
    if (!canSubmit.value) return
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

// 父组件保存成功:把基线推进到刚提交的值,并显示常驻的 inline 状态。
watch(() => props.savedToken, (token) => {
  if (token === seenSavedToken.value) return
  seenSavedToken.value = token
  if (isCreate.value) return
  baselineSerialized.value = JSON.stringify({ name: name.value.trim(), note: note.value.trim(), model: modelConfig.value })
  savedAt.value = formatSavedAt()
  savedAnnouncement.value = t.value.workspace.agentAdmin.savedInline
  saveScanKey.value += 1
})
// 下一次编辑立即让成功提示让位给「有未保存的更改」,不用计时器。
watch(isDirty, (dirty) => {
  if (!dirty) return
  savedAt.value = ''
  savedAnnouncement.value = ''
})

watch(() => props.open, async (isOpen): Promise<void> => {
  await nextTick()
  const dialog = dialogRef.value
  if (dialog === null) return
  if (!isOpen) {
    clearSourceCheck()
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

onBeforeUnmount(() => {
  clearSourceCheck()
  closeSourceMenu()
  dialogRef.value?.close()
})
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
              :aria-disabled="section.id !== 'source' && !sourceReady ? 'true' : undefined"
              :data-locked="section.id !== 'source' && !sourceReady ? 'true' : undefined"
              @click="activateModelSection(section.id)"
            >
              <span>{{ section.label }}</span>
              <span v-if="sectionNeedsAttention(section.id)" class="model-subtabs__warn" :title="t.workspace.agentAdmin.modelNeedsAttention" aria-hidden="true">
                <DliIcon name="alert" size="sm" />
              </span>
            </button>
          </div>
        </div>

        <div
          v-show="activeModelSection === 'source'" :id="`${dialogId}-model-panel-source`"
          class="model-subpanel" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-source`"
        >
          <p v-if="sourceNotice !== ''" class="model-source-notice" role="alert">{{ sourceNotice }}</p>

          <div v-if="sourceMenuId !== ''" class="source-menu__scrim" aria-hidden="true" @click.stop="closeSourceMenu()" />

          <!-- 所有来源统一成一列:订阅与 API 渠道只是来源类型不同。 -->
          <section class="source-block">
            <div v-if="editingSubscription !== undefined" class="gateway-form">
              <button :id="`${dialogId}-source-back`" type="button" class="gateway-form__back" @click="closeSubscriptionConfig">← {{ t.workspace.agentAdmin.gatewayBack }}</button>
              <h3>{{ providerTitle(editingSubscription.provider) }}</h3>
              <dl class="source-config__facts">
                <dt>{{ t.workspace.agentAdmin.subscriptionAccount }}</dt>
                <dd>{{ editingSubscription.account }}</dd>
                <dt>{{ t.workspace.agentAdmin.subscriptionPlan }}</dt>
                <dd>{{ editingSubscription.plan }}</dd>
                <dt>{{ t.workspace.agentAdmin.subscriptionExpires }}</dt>
                <dd>{{ editingSubscription.expiresAt.slice(0, 10) }}</dd>
                <dt>{{ t.workspace.agentAdmin.sourceStatusLabel }}</dt>
                <dd>{{ subscriptionStatusOf(editingSubscription) }}</dd>
              </dl>
              <p class="model-section__hint">{{ t.workspace.agentAdmin.subscriptionConfigHint }}</p>
              <div class="gateway-form__actions">
                <button type="button" class="dl-btn dl-btn--ghost" :disabled="sourceBusy" @click="checkSubscription(editingSubscription)">{{ t.workspace.agentAdmin.subscriptionCheck }}</button>
                <button :id="`${dialogId}-source-remove-trigger`" type="button" class="dl-btn dl-btn--ghost source-config__danger" @click="askRemoveFromConfig">{{ t.workspace.agentAdmin.sourceRemove }}</button>
              </div>
              <div v-if="removingSubscriptionProvider === editingSubscription.provider" class="source-row__confirm">
                <span>{{ t.workspace.agentAdmin.sourceRemovePrompt }}</span>
                <button :id="`${dialogId}-subscription-remove-${editingSubscription.provider}`" type="button" class="danger-confirm" @click="removeSubscription(editingSubscription.provider)">{{ t.workspace.agentAdmin.sourceRemove }}</button>
                <button type="button" @click="cancelSubscriptionRemoval">{{ t.workspace.agentAdmin.gatewayCancel }}</button>
              </div>
            </div>

            <div v-else-if="gatewayDraft !== null" class="gateway-form">
              <button :id="`${dialogId}-source-back`" type="button" class="gateway-form__back" @click="cancelGatewayEdit">← {{ t.workspace.agentAdmin.gatewayBack }}</button>
              <h3>{{ gatewayDraft.id === '' ? t.workspace.agentAdmin.gatewayFormNew : t.workspace.agentAdmin.gatewayFormEdit }}</h3>
              <section class="gateway-form__group" :aria-labelledby="`${dialogId}-gateway-connection-title`">
                <h4 :id="`${dialogId}-gateway-connection-title`" class="gateway-form__group-title">{{ t.workspace.agentAdmin.gatewayConnectionGroup }}</h4>
                <label class="field">
                  <span class="field__label">{{ t.workspace.agentAdmin.gatewayName }}</span>
                  <input :id="`${dialogId}-gateway-name`" v-model="gatewayDraft.name" type="text" class="field__input" :placeholder="t.workspace.agentAdmin.gatewayNamePlaceholder" maxlength="40">
                </label>
                <label class="field">
                  <span class="field__label">{{ t.workspace.agentAdmin.gatewayBaseUrl }}</span>
                  <input v-model="gatewayDraft.baseUrl" type="url" class="field__input gateway-form__mono" :placeholder="t.workspace.agentAdmin.gatewayBaseUrlPlaceholder" spellcheck="false">
                </label>
                <div class="field">
                  <div class="gateway-form__label-row">
                    <label :for="`${dialogId}-gateway-key`" class="field__label">{{ t.workspace.agentAdmin.gatewayApiKey }}</label>
                    <span v-if="isSavedGatewayKey" class="gateway-form__badge" data-tone="ok">{{ t.workspace.agentAdmin.gatewayKeySaved }}</span>
                  </div>
                  <div class="gateway-form__key">
                    <input :id="`${dialogId}-gateway-key`" v-model="gatewayDraft.apiKeyInput" :type="showGatewayKey ? 'text' : 'password'" class="field__input gateway-form__mono" :placeholder="gatewayKeyPlaceholder" :aria-describedby="gatewayDraft.apiKeySet ? `${dialogId}-gateway-key-keep` : undefined" autocomplete="off" spellcheck="false">
                    <button
                      type="button" class="gateway-form__reveal"
                      :aria-label="showGatewayKey ? t.workspace.agentAdmin.gatewayHideKey : t.workspace.agentAdmin.gatewayShowKey"
                      :title="showGatewayKey ? t.workspace.agentAdmin.gatewayHideKey : t.workspace.agentAdmin.gatewayShowKey"
                      :aria-controls="`${dialogId}-gateway-key`"
                      @click="showGatewayKey = !showGatewayKey"
                    >
                      <DliIcon :name="showGatewayKey ? 'eyeOff' : 'eye'" size="sm" />
                    </button>
                  </div>
                  <span v-if="gatewayDraft.apiKeySet" :id="`${dialogId}-gateway-key-keep`" class="agent-editor__visually-hidden">{{ t.workspace.agentAdmin.gatewayApiKeyKeep }}</span>
                </div>
              </section>
              <section class="gateway-form__group gateway-form__group--models" :aria-labelledby="`${dialogId}-gateway-models-title`">
                <div class="gateway-form__models-head">
                  <div class="gateway-form__label-row">
                    <h4 :id="`${dialogId}-gateway-models-title`" class="gateway-form__group-title">{{ t.workspace.agentAdmin.gatewayModelsGroup }}</h4>
                    <span class="gateway-form__badge gateway-form__mono" :aria-label="modelCountLabel(gatewayModels.length)">{{ gatewayModels.length }}</span>
                  </div>
                  <span :id="`${dialogId}-gateway-models-helper`" class="gateway-form__models-helper">{{ t.workspace.agentAdmin.gatewayModelsHelper }}</span>
                </div>
                <textarea
                  ref="gatewayModelsRef" v-model="gatewayDraft.modelsText" class="field__input gateway-form__models"
                  :aria-labelledby="`${dialogId}-gateway-models-title`" :aria-describedby="`${dialogId}-gateway-models-helper`"
                  :aria-busy="gatewayProbeBusy ? 'true' : 'false'" :placeholder="t.workspace.agentAdmin.gatewayModelsPlaceholder"
                  :disabled="busy" rows="3" spellcheck="false" @input="resizeGatewayModels"
                />
                <div class="gateway-form__discovery" role="group" :aria-label="t.workspace.agentAdmin.gatewayModelsApi" :title="gatewayModelsHint" @keydown="onModelsUrlKeydown">
                  <div class="gateway-form__discovery-summary">
                    <input
                      v-if="isModelsUrlEditing"
                      :id="`${dialogId}-gateway-models-api`" ref="modelsUrlInputRef" v-model="modelsUrlDraft"
                      type="text" inputmode="url" class="field__input gateway-form__mono gateway-form__endpoint-input"
                      :aria-label="t.workspace.agentAdmin.gatewayModelsApi" :aria-describedby="`${dialogId}-gateway-models-hint`"
                      :disabled="busy" spellcheck="false"
                    >
                    <code
                      v-else class="gateway-form__endpoint"
                      :title="`${effectiveModelsUrl || t.workspace.agentAdmin.gatewayModelsNoUrl} · ${t.workspace.agentAdmin.gatewayModelsMethodHint}`"
                    >{{ effectiveModelsUrl || t.workspace.agentAdmin.gatewayModelsNoUrl }}</code>
                    <div class="gateway-form__url-actions">
                      <template v-if="isModelsUrlEditing">
                        <button
                          type="button" class="gateway-form__url-action gateway-form__url-action--save" :disabled="busy"
                          :aria-label="t.workspace.agentAdmin.gatewayModelsSaveApi" :title="t.workspace.agentAdmin.gatewayModelsSaveApi"
                          @click="saveModelsUrl"
                        ><DliIcon name="check" size="sm" /></button>
                        <button
                          type="button" class="gateway-form__url-action" :disabled="busy"
                          :aria-label="t.workspace.agentAdmin.gatewayModelsCancelEdit" :title="t.workspace.agentAdmin.gatewayModelsCancelEdit"
                          @click="cancelModelsUrlEdit"
                        ><DliIcon name="close" size="sm" /></button>
                      </template>
                      <button
                        v-else :id="`${dialogId}-gateway-models-edit`" ref="modelsUrlEditRef" type="button"
                        class="gateway-form__url-action" :disabled="busy"
                        :aria-label="t.workspace.agentAdmin.gatewayModelsEditApi" :title="t.workspace.agentAdmin.gatewayModelsEditApi"
                        @click="startModelsUrlEdit"
                      ><DliIcon name="pencil" size="sm" /></button>
                    </div>
                    <!-- 刷新是模型列表的整体动作:放在底栏右端。编辑端点时保持占位但不可见,
                         使 URL 读写态同宽,切换不跳动;此时也不可聚焦。 -->
                    <button
                      type="button" class="gateway-form__refresh"
                      :data-hidden="isModelsUrlEditing ? 'true' : undefined"
                      :disabled="busy || gatewayProbeBusy || effectiveModelsUrl === '' || isModelsUrlEditing"
                      :data-busy="gatewayProbeBusy ? 'true' : undefined"
                      :aria-label="t.workspace.agentAdmin.gatewayRefreshModels"
                      :title="gatewayRefreshTitle"
                      @click="testGateway"
                    >
                      <DliIcon name="sync" size="sm" />
                      {{ t.workspace.agentAdmin.gatewayRefresh }}
                    </button>
                  </div>
                  <span :id="`${dialogId}-gateway-models-hint`" class="agent-editor__visually-hidden">{{ t.workspace.agentAdmin.gatewayModelsMethodHint }}</span>
                </div>
              </section>
            </div>

            <template v-else>
              <div class="source-block__head">
                <h3>{{ t.workspace.agentAdmin.sourceListTitle }}</h3>
                <div class="source-add-wrap">
                  <button
                    :id="sourceMenuTriggerId(ADD_SOURCE_MENU)" type="button" class="source-block__add"
                    aria-haspopup="menu" :aria-expanded="sourceMenuId === ADD_SOURCE_MENU ? 'true' : 'false'"
                    :aria-controls="sourceMenuId === ADD_SOURCE_MENU ? sourceMenuDomId(ADD_SOURCE_MENU) : undefined"
                    :aria-label="t.workspace.agentAdmin.sourceAddLabel"
                    @click="toggleSourceMenu(ADD_SOURCE_MENU)"
                  ><span aria-hidden="true">＋</span> {{ t.workspace.agentAdmin.sourceAdd }}</button>
                  <div
                    v-if="sourceMenuId === ADD_SOURCE_MENU" :id="sourceMenuDomId(ADD_SOURCE_MENU)"
                    class="source-menu source-menu--types" role="menu" :style="sourceMenuPosition"
                    :aria-label="t.workspace.agentAdmin.sourceAddLabel"
                    @keydown="onSourceMenuKeydown($event, ADD_SOURCE_MENU)"
                  >
                    <button type="button" role="menuitem" class="source-type" :disabled="hasSubscription('claude')" @click="addSubscriptionFromMenu('claude')">
                      <span class="source-type__name">{{ t.workspace.agentAdmin.sourceTypeClaude }}</span>
                      <span class="source-type__hint">{{ hasSubscription('claude') ? t.workspace.agentAdmin.sourceAdded : t.workspace.agentAdmin.sourceTypeClaudeHint }}</span>
                    </button>
                    <button type="button" role="menuitem" class="source-type" :disabled="hasSubscription('chatgpt')" @click="addSubscriptionFromMenu('chatgpt')">
                      <span class="source-type__name">{{ t.workspace.agentAdmin.sourceTypeChatgpt }}</span>
                      <span class="source-type__hint">{{ hasSubscription('chatgpt') ? t.workspace.agentAdmin.sourceAdded : t.workspace.agentAdmin.sourceTypeChatgptHint }}</span>
                    </button>
                    <div class="source-menu__divider" role="separator" />
                    <button type="button" role="menuitem" class="source-type" @click="addApiFromMenu">
                      <span class="source-type__name">{{ t.workspace.agentAdmin.sourceTypeApi }}</span>
                      <span class="source-type__hint">{{ t.workspace.agentAdmin.sourceTypeApiHint }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="allSources.length === 0" class="gateway-empty">
                <div class="gateway-empty__head">
                  <p class="gateway-empty__title">{{ t.workspace.agentAdmin.sourceEmpty }}</p>
                  <button
                    type="button" class="dl-btn dl-btn--ghost"
                    aria-haspopup="menu" :aria-expanded="sourceMenuId === ADD_SOURCE_MENU ? 'true' : 'false'"
                    :aria-controls="sourceMenuId === ADD_SOURCE_MENU ? sourceMenuDomId(ADD_SOURCE_MENU) : undefined"
                    @click="toggleSourceMenu(ADD_SOURCE_MENU)"
                  >{{ t.workspace.agentAdmin.sourceAdd }}</button>
                </div>
                <p class="model-section__hint">{{ t.workspace.agentAdmin.sourceEmptyBody }}</p>
              </div>

              <ul v-else class="source-list">
                <li
                  v-for="row in allSources" :key="row.id"
                  class="source-row" :class="`source-row--${row.type}`"
                  :data-active="isSourceActive(row) ? 'true' : undefined"
                  :aria-current="isSourceActive(row) ? 'true' : undefined"
                >
                  <button
                    type="button" class="source-row__main"
                    :aria-pressed="isSourceActive(row)" :aria-label="sourceUseLabel(row)"
                    :disabled="sourceBusy" @click="useSource(row)"
                  >
                    <span class="source-row__radio" :data-active="isSourceActive(row) ? 'true' : undefined" aria-hidden="true" />
                    <span class="source-row__body">
                      <span class="source-row__title">
                        {{ sourceName(row) }}
                        <span v-if="isSourceActive(row)" class="source-row__badge">{{ t.workspace.agentAdmin.gatewayCurrent }}</span>
                        <span class="source-row__status" :data-tone="sourceToneOf(row)">{{ sourceStatusOf(row) }}</span>
                      </span>
                      <template v-if="row.type === 'subscription'">
                        <span v-if="subscriptionMetaOf(row.subscription) !== ''" class="source-row__meta">{{ subscriptionMetaOf(row.subscription) }}</span>
                      </template>
                      <template v-else>
                        <span class="source-row__meta source-row__meta--mono">{{ row.gateway.baseUrl }}</span>
                        <span class="source-row__meta">{{ gatewayModelCount(row.gateway) }}</span>
                      </template>
                    </span>
                  </button>

                  <div class="source-row__menu-wrap">
                    <button
                      :id="sourceMenuTriggerId(row.id)" type="button" class="source-row__menu-trigger"
                      aria-haspopup="menu" :aria-expanded="sourceMenuId === row.id ? 'true' : 'false'"
                      :aria-controls="sourceMenuId === row.id ? sourceMenuDomId(row.id) : undefined"
                      :aria-label="sourceActionsLabel(row)"
                      @click="toggleSourceMenu(row.id)"
                    ><span aria-hidden="true">⋯</span></button>
                    <div
                      v-if="sourceMenuId === row.id" :id="sourceMenuDomId(row.id)"
                      class="source-menu" role="menu" :style="sourceMenuPosition" :aria-label="sourceActionsLabel(row)"
                      @keydown="onSourceMenuKeydown($event, row.id)"
                    >
                      <template v-if="row.type === 'subscription'">
                        <button type="button" role="menuitem" @click="editSubscriptionFromMenu(row.subscription.provider)">{{ t.workspace.agentAdmin.sourceEditConfig }}</button>
                        <div class="source-menu__divider" role="separator" />
                        <button type="button" role="menuitem" class="source-menu__danger" @click="removeSubscriptionFromMenu(row.subscription.provider)">{{ t.workspace.agentAdmin.sourceRemove }}</button>
                      </template>
                      <template v-else>
                        <button type="button" role="menuitem" @click="editGatewayFromMenu(row.gateway)">{{ t.workspace.agentAdmin.sourceEditConfig }}</button>
                        <div class="source-menu__divider" role="separator" />
                        <button type="button" role="menuitem" class="source-menu__danger" @click="deleteGatewayFromMenu(row.gateway.id)">{{ t.workspace.agentAdmin.gatewayDelete }}</button>
                      </template>
                    </div>
                  </div>

                  <div v-if="row.type === 'gateway' && deletingGatewayId === row.gateway.id" class="source-row__confirm">
                    <span>{{ t.workspace.agentAdmin.gatewayDeletePrompt }}</span>
                    <button :id="`${dialogId}-gateway-delete-${sourceDomKey(row.gateway.id)}`" type="button" class="danger-confirm" @click="deleteGateway(row.gateway.id)">{{ t.workspace.agentAdmin.gatewayDeleteConfirm }}</button>
                    <button type="button" @click="deletingGatewayId = ''">{{ t.workspace.agentAdmin.gatewayCancel }}</button>
                  </div>
                  <div v-else-if="row.type === 'subscription' && removingSubscriptionProvider === row.subscription.provider" class="source-row__confirm">
                    <span>{{ t.workspace.agentAdmin.sourceRemovePrompt }}</span>
                    <button :id="`${dialogId}-subscription-remove-${row.subscription.provider}`" type="button" class="danger-confirm" @click="removeSubscription(row.subscription.provider)">{{ t.workspace.agentAdmin.sourceRemove }}</button>
                    <button type="button" @click="cancelSubscriptionRemoval">{{ t.workspace.agentAdmin.gatewayCancel }}</button>
                  </div>
                </li>
              </ul>
            </template>
          </section>
        </div>

        <div
          v-show="activeModelSection === 'defaults'" :id="`${dialogId}-model-panel-defaults`"
          class="model-subpanel" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-defaults`"
        >
          <p class="model-section__hint">{{ t.workspace.agentAdmin.modelDefaultHint }}</p>
          <p v-if="sourceModels.length === 0" class="model-section__hint model-section__hint--warning">{{ t.workspace.agentAdmin.modelSourceEmpty }}</p>
          <div class="model-matrix">
            <div class="model-matrix__head" aria-hidden="true">
              <span>{{ t.workspace.agentAdmin.modelScopeLabel }}</span>
              <span>{{ t.workspace.agentAdmin.modelColumn }}</span>
              <span>{{ t.workspace.agentAdmin.modelEffortLabel }}</span>
            </div>
            <div class="model-matrix__row">
              <span class="model-matrix__label">{{ t.workspace.agentAdmin.modelConversationLabel }}</span>
              <span class="model-matrix__field-label">{{ t.workspace.agentAdmin.modelColumn }}</span>
              <SelectField>
                <select v-model="modelConfig.defaultModelId" class="field__input field__select" :disabled="busy" :aria-label="t.workspace.agentAdmin.modelConversationLabel" :aria-invalid="defaultModelUnavailable ? 'true' : undefined">
                  <option v-for="option in modelSelectOptions(modelConfig.defaultModelId)" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </SelectField>
              <span class="model-matrix__field-label">{{ t.workspace.agentAdmin.modelEffortLabel }}</span>
              <SelectField>
                <select
                  v-model="modelConfig.defaultEffortLevel" class="field__input field__select model-effort-select"
                  :disabled="busy || !supportsEffortOf(modelConfig.defaultModelId)"
                  :aria-label="effortAriaLabel(t.workspace.agentAdmin.modelConversationLabel)"
                >
                  <option value="">{{ t.workspace.agentAdmin.modelEffortDefault }}</option>
                  <option v-for="level in EFFORT_LEVELS" :key="level" :value="level">{{ level }}</option>
                </select>
              </SelectField>
            </div>
            <div class="model-matrix__row">
              <span class="model-matrix__label">{{ t.workspace.agentAdmin.modelSubagentLabel }}</span>
              <span class="model-matrix__field-label">{{ t.workspace.agentAdmin.modelColumn }}</span>
              <SelectField>
                <select v-model="modelConfig.subagentModelId" class="field__input field__select" :disabled="busy" :aria-label="t.workspace.agentAdmin.modelSubagentLabel" :aria-invalid="subagentModelUnavailable ? 'true' : undefined">
                  <option value="">{{ t.workspace.agentAdmin.modelSubagentInherit }}</option>
                  <option v-for="option in modelSelectOptions(modelConfig.subagentModelId)" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </SelectField>
              <span class="model-matrix__field-label">{{ t.workspace.agentAdmin.modelEffortLabel }}</span>
              <SelectField>
                <select
                  v-model="modelConfig.subagentEffortLevel" class="field__input field__select model-effort-select"
                  :disabled="busy || !supportsEffortOf(modelConfig.subagentModelId || modelConfig.defaultModelId)"
                  :aria-label="effortAriaLabel(t.workspace.agentAdmin.modelSubagentLabel)"
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
          <p v-if="sourceModels.length === 0" class="model-section__hint model-section__hint--warning">{{ t.workspace.agentAdmin.modelSourceEmpty }}</p>
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
                <select v-model="modelConfig.tiers[tier.id].modelId" class="field__input field__select" :disabled="busy" :aria-label="`${tier.label} · ${t.workspace.agentAdmin.modelColumn}`" :aria-invalid="tierModelUnavailable(tier.id) ? 'true' : undefined">
                  <option v-for="option in tierModelSelectOptions(tier.id)" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </SelectField>
              <SelectField>
                <select
                  v-model="modelConfig.tiers[tier.id].effortLevel" class="field__input field__select model-effort-select"
                  :disabled="busy || !supportsEffortOf(tierModelOf(tier.id))"
                  :aria-label="`${tier.label} · ${t.workspace.agentAdmin.modelEffortLabel}`"
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
              <h3 :id="`${dialogId}-fallback-title`" class="model-row__label">{{ t.workspace.agentAdmin.modelFallbackLabel }}</h3>
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
                      <option v-for="option in fallbackOptionsFor(index)" :key="option.value" :value="option.value">{{ option.label }}</option>
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
              <h3 class="model-row__label">{{ t.workspace.agentAdmin.modelContextTitle }}</h3>
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

    <p v-if="error !== ''" class="agent-editor__error" role="alert" aria-atomic="true">{{ error }}</p>
    <div class="agent-editor__actions">
      <!-- 探测与保存共用底部状态槽,不撑高滚动内容;成功探测短暂优先,失败保留。 -->
      <p v-if="!isCreate || hasSourceCheck" :id="saveStateId" class="agent-editor__save-state" :data-state="hasSourceCheck ? (sourceCheckOk ? 'probe-ok' : 'probe-fail') : saveStateKind">
        <template v-if="hasSourceCheck">
          <DliIcon v-if="sourceCheckOk" name="check" size="sm" />
          <span v-else class="agent-editor__probe-fail-icon" aria-hidden="true">×</span>
          <span class="agent-editor__save-label">
            {{ gatewayProbe?.message ?? subscriptionCheckNotice }}
            <span v-if="gatewayProbe !== null" class="agent-editor__probe-meta"><span class="gateway-form__mono">{{ gatewayProbe.latencyMs }}ms</span><span v-if="gatewayProbe.models.length > 0"> · {{ modelCountLabel(gatewayProbe.models.length) }}</span></span>
          </span>
          <span v-if="sourceCheckOk" :key="`probe-${probeScanKey}`" class="agent-editor__save-scan" aria-hidden="true" />
        </template>
        <template v-else>
          <DliIcon v-if="saveStateKind === 'saved'" name="check" size="sm" />
          <span class="agent-editor__save-label">{{ saveStateLabel }}</span>
          <time v-if="saveStateKind === 'saved'" class="agent-editor__save-time">{{ savedAt }}</time>
          <span v-if="saveStateKind === 'saved'" :key="saveScanKey" class="agent-editor__save-scan" aria-hidden="true" />
        </template>
      </p>
      <!-- 结果专用 live region:只播报保存结果,不把每次 dirty 变化都读出来。
           只在对话框打开时挂载,避免关闭状态给页面多加一个 status 地标。 -->
      <span v-if="open" class="agent-editor__visually-hidden" role="status" aria-live="polite" aria-atomic="true">{{ savedAnnouncement }}</span>
      <span v-if="open" class="agent-editor__visually-hidden" role="status" aria-live="polite" aria-atomic="true">{{ probeAnnouncement }}</span>
      <span v-if="hasUnavailableSourceModels" class="agent-editor__visually-hidden" role="status" aria-live="polite">{{ t.workspace.agentAdmin.modelNeedsAttention }}</span>
      <div class="agent-editor__buttons">
        <button type="button" class="dl-btn dl-btn--ghost" :disabled="busy" @click="finish('cancel')">{{ t.workspace.agentAdmin.cancel }}</button>
        <button
          type="button" class="dl-btn dl-btn--primary agent-editor__save-button"
          :aria-disabled="!canSubmit ? 'true' : undefined" :aria-busy="busy ? 'true' : undefined"
          :aria-describedby="!isCreate || hasSourceCheck ? saveStateId : undefined"
          @click="finish('submit')"
        >
          {{ busy ? (isCreate ? t.workspace.agentAdmin.creating : t.workspace.agentAdmin.saving) : (isCreate ? t.workspace.agentAdmin.create : t.workspace.agentAdmin.save) }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.agent-editor {
  /* 面板内部的结构常量:只在来源/模型分区用,避免散落字面量。 */
  --agent-hairline: var(--dl-border-width);
  --agent-emphasis-width: calc(var(--dl-border-width) * 2);
  --agent-row-gap: calc(var(--dl-border-width) * 2);
  --agent-matrix-tier: 80px;
  --agent-matrix-label: 140px;
  --agent-matrix-control: 132px;
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
.agent-editor__body { min-width: 0; min-inline-size: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-1); scrollbar-width: thin; scrollbar-color: var(--dl-border-strong) transparent; }
.agent-editor__body::-webkit-scrollbar { width: var(--dl-space-1); }
.agent-editor__body::-webkit-scrollbar-thumb { background: var(--dl-border-strong); border-radius: var(--dl-radius-pill); }
.agent-editor__body::-webkit-scrollbar-track { background: transparent; }
.agent-editor__panel { display: grid; gap: var(--dl-space-6); min-inline-size: 0; }
.agent-editor__panel--model { gap: var(--dl-space-3); }
/* 二级分区:分段控件而非第二层下划线 tab,视觉权重低于主 tab;滚动时吸顶。
   吸顶偏移吃到 body 的 4px 内边距,避免滚动内容从上方缝隙透出半行。 */
.model-subtabs { min-inline-size: 0; position: sticky; inset-block-start: calc(-1 * var(--dl-space-1)); z-index: var(--dl-z-sticky); padding-block: var(--dl-space-1); background: var(--dl-bg-elevated); }
.model-subtabs__track { min-inline-size: 0; max-inline-size: 100%; display: flex; gap: var(--dl-space-1); padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); }
.model-subtabs__track button { display: inline-flex; flex: 1 1 0; align-items: center; justify-content: center; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-1); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; }
.model-subtabs__track button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.model-subtabs__track button[aria-selected='true'] { background: var(--dl-accent-soft); color: var(--dl-text-primary); }
.model-subtabs__track button[data-locked='true'] { color: var(--dl-text-disabled); cursor: not-allowed; }
.model-subtabs__track button[data-locked='true']:hover { background: transparent; color: var(--dl-text-disabled); }
.model-subtabs__warn { display: inline-flex; align-items: center; color: var(--dl-warning); }
.model-matrix select[aria-invalid='true'] { border-color: color-mix(in srgb, var(--dl-warning) 55%, transparent); }
/* 来源分区:订阅与网关共用「标题 + 行列表」,不再把订阅裹进独立卡片。 */
.source-block { display: grid; gap: var(--dl-space-2); }
.source-block + .source-block { margin-block-start: var(--dl-space-4); }
.source-block__head { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-2); }
.source-block__head h3 { color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; }
.source-add-wrap { position: relative; }
.source-block__add { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-accent); font-size: var(--dl-font-size-xs); }
.source-block__add:hover { background: var(--dl-bg-hover); }
.source-list { display: grid; margin: 0; padding: 0; border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); list-style: none; }
.source-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--dl-space-2); padding: var(--dl-space-2) var(--dl-space-3); }
.source-row + .source-row { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.source-row:first-child { border-start-start-radius: calc(var(--dl-radius-lg) - var(--dl-border-width)); border-start-end-radius: calc(var(--dl-radius-lg) - var(--dl-border-width)); }
.source-row:last-child { border-end-start-radius: calc(var(--dl-radius-lg) - var(--dl-border-width)); border-end-end-radius: calc(var(--dl-radius-lg) - var(--dl-border-width)); }
.source-row[data-active='true'] { background: var(--dl-accent-soft); }
.source-row:hover { background: var(--dl-bg-hover); }
.source-row[data-active='true']:hover { background: var(--dl-accent-soft); box-shadow: inset 0 0 0 var(--dl-border-width) var(--dl-border-strong); }
.source-row__main { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--dl-space-2); min-inline-size: 0; min-block-size: var(--dl-target-size); padding-block: var(--dl-space-1); text-align: left; }
.source-row__radio { inline-size: var(--dl-space-2); block-size: var(--dl-space-2); flex: none; border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-pill); }
.source-row__radio[data-active='true'] { border-color: var(--dl-accent); background: var(--dl-accent); box-shadow: inset 0 0 0 var(--agent-row-gap) var(--dl-bg-elevated); }
.source-row__body { display: grid; gap: var(--agent-hairline); min-inline-size: 0; }
.source-row__title { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.source-row__badge { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-weight: 400; }
.source-row__meta { min-inline-size: 0; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: break-word; }
.source-row__meta--mono { overflow: hidden; font-family: var(--dl-font-mono); text-overflow: ellipsis; white-space: nowrap; }
.source-row__status { display: inline-flex; flex: none; align-items: center; min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-tight); white-space: nowrap; }
.source-row__status[data-tone='ok'] { border-color: color-mix(in srgb, var(--dl-success) 35%, transparent); color: var(--dl-success); }
.source-row__status[data-tone='warning'] { border-color: color-mix(in srgb, var(--dl-warning) 35%, transparent); color: var(--dl-warning); }
.source-row__login { min-block-size: var(--dl-target-size); }
.source-row__menu-wrap { position: relative; display: flex; align-items: center; }
.source-row__menu-trigger { display: inline-grid; place-items: center; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-lg); line-height: var(--dl-line-tight); }
.source-row__menu-trigger:hover, .source-row__menu-trigger[aria-expanded='true'] { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.source-menu { position: fixed; z-index: var(--dl-z-overlay); display: grid; max-block-size: calc(100dvh - 2 * var(--dl-space-4)); overflow-y: auto; gap: var(--agent-hairline); min-inline-size: max-content; max-inline-size: calc(100vw - 2 * var(--dl-space-2)); padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); }
.source-menu button { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border-radius: var(--dl-radius-sm); text-align: left; color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); white-space: nowrap; }
.source-menu button:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.source-menu button:disabled { background: transparent; color: var(--dl-text-disabled); }
.source-menu .source-menu__danger { color: var(--dl-error); }
.source-menu .source-menu__danger:hover:not(:disabled) { background: color-mix(in srgb, var(--dl-error) 14%, transparent); color: var(--dl-error); }
.source-menu--types { min-inline-size: min(260px, 70vw); }
.source-menu .source-type { display: grid; gap: var(--agent-hairline); min-block-size: auto; padding-block: var(--dl-space-2); text-align: left; white-space: normal; }
.source-type__name { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.source-type__hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.source-menu .source-type:disabled .source-type__name, .source-menu .source-type:disabled .source-type__hint { color: var(--dl-text-disabled); }
.source-menu__divider { block-size: var(--dl-border-width); margin-block: var(--dl-space-1); background: var(--dl-border-base); }
.source-menu__scrim { position: fixed; inset: 0; z-index: calc(var(--dl-z-overlay) - 1); }
.source-row__confirm { display: flex; grid-column: 1 / -1; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); padding-block-start: var(--dl-space-2); border-block-start: var(--dl-border-width) solid var(--dl-border-base); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.source-row__confirm button { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.source-row__confirm button:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.source-row__confirm .danger-confirm { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); background: var(--dl-error); color: var(--dl-text-on-accent); font-size: var(--dl-font-size-xs); }
.source-row__confirm .danger-confirm:hover:not(:disabled) { background: var(--dl-error); color: var(--dl-text-on-accent); }
.gateway-empty { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-4); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.gateway-empty__head .dl-btn { min-block-size: var(--dl-target-size); }
.gateway-empty__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-2); }
.gateway-empty__title { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.gateway-form { display: grid; min-inline-size: 0; gap: var(--dl-space-4); padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.gateway-form__back { justify-self: start; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.gateway-form__back:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.gateway-form h3 { color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; }
.gateway-form__mono { font-family: var(--dl-font-mono); }
.gateway-form__preview { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); overflow-wrap: anywhere; }
.gateway-form__preview code { color: var(--dl-text-secondary); font-family: var(--dl-font-mono); }
.gateway-form__key { position: relative; min-inline-size: 0; }
.gateway-form__key .field__input { min-inline-size: 0; min-block-size: var(--dl-target-size); padding-inline-end: var(--dl-space-12); }
.gateway-form__reveal { position: absolute; inset-block-start: 0; inset-inline-end: 0; display: grid; place-items: center; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); }
.gateway-form__reveal:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.gateway-form .field__input { min-block-size: var(--dl-target-size); }
.gateway-form__models-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-1) var(--dl-space-2); min-inline-size: 0; }
.gateway-form__refresh { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: var(--dl-space-1); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.gateway-form__refresh:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.gateway-form__refresh:disabled { color: var(--dl-text-disabled); }
/* 编辑端点时刷新按钮只占位、不可见也不可点:URL 读写态同宽,切换不产生横向跳动。 */
.gateway-form__refresh[data-hidden='true'] { visibility: hidden; pointer-events: none; }
.gateway-form__refresh[data-busy='true'] :deep(.dl-icon) { animation: gateway-refresh-spin calc(4 * var(--dl-duration-base)) linear infinite; }
@keyframes gateway-refresh-spin { to { transform: rotate(360deg); } }
.gateway-form__group { display: grid; min-inline-size: 0; gap: var(--dl-space-2); }
.gateway-form__group--models { gap: var(--dl-space-1); padding-block-start: var(--dl-space-6); border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.gateway-form__group-title { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); font-weight: 500; letter-spacing: var(--dl-tracking-label); }
.gateway-form__label-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1) var(--dl-space-2); min-inline-size: 0; }
.gateway-form__badge { flex: none; padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; font-variant-numeric: tabular-nums; }
.gateway-form__badge[data-tone='ok'] { border-color: color-mix(in srgb, var(--dl-success) 35%, transparent); color: var(--dl-success); }
.gateway-form__badge:hover { background: var(--dl-bg-hover); }
.gateway-form .gateway-form__models { box-sizing: border-box; inline-size: 100%; min-inline-size: 0; min-block-size: calc(3 * var(--dl-font-size-sm) * var(--dl-line-snug) + 2 * var(--dl-space-3) + 2 * var(--dl-border-width)); max-block-size: calc(8 * var(--dl-font-size-sm) * var(--dl-line-snug) + 2 * var(--dl-space-3) + 2 * var(--dl-border-width)); padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-snug); resize: none; overflow-y: auto; }
.gateway-form__models-helper { min-inline-size: 0; margin-inline-start: auto; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); text-align: end; overflow-wrap: anywhere; }
.gateway-form__discovery { min-inline-size: 0; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.gateway-form__discovery-summary { display: flex; align-items: center; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--dl-target-size); }
.gateway-form__endpoint, .gateway-form .gateway-form__endpoint-input { box-sizing: border-box; flex: 1 1 0; inline-size: 0; min-inline-size: 0; block-size: var(--dl-target-size); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.gateway-form__endpoint { padding: 0; border: 0; background: none; color: var(--dl-text-tertiary); overflow: hidden; line-height: var(--dl-target-size); text-overflow: ellipsis; white-space: nowrap; }
.gateway-form__discovery-summary:hover .gateway-form__endpoint { color: var(--dl-text-secondary); }
.gateway-form .gateway-form__endpoint-input { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-secondary); }
/* 两态预留同宽操作区,增加取消按钮也不挤动 URL。 */
.gateway-form__url-actions { display: flex; flex: none; justify-content: flex-end; gap: var(--dl-space-1); inline-size: calc(2 * var(--dl-target-size) + var(--dl-space-1)); }
.gateway-form__url-action { display: grid; place-items: center; flex: none; inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding: 0; border-radius: var(--dl-radius-md); color: var(--dl-text-tertiary); }
.gateway-form__url-action:hover:not(:disabled), .gateway-form__url-action:focus-visible { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.gateway-form__url-action--save { color: var(--dl-accent); }
.gateway-form__url-action--save:hover:not(:disabled), .gateway-form__url-action--save:focus-visible { color: var(--dl-accent-hover); }
.gateway-form__url-action:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.gateway-form__endpoint-input:hover:not(:disabled) { border-color: var(--dl-border-strong); }
.gateway-form__endpoint-input:focus-visible { border-color: var(--dl-border-strong); outline: none; box-shadow: var(--dl-focus-ring); }
.gateway-form__endpoint-input:active:not(:disabled) { border-color: var(--dl-accent); }
.gateway-form__endpoint-input:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.source-config__facts { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--dl-space-2) var(--dl-space-4); margin: 0; font-size: var(--dl-font-size-sm); }
.source-config__facts dt { color: var(--dl-text-secondary); }
.source-config__facts dd { margin: 0; color: var(--dl-text-primary); overflow-wrap: anywhere; }
.source-config__danger { color: var(--dl-error); }
/* 窄对话框里四个二级 tab 放不下:改为横向滚动,避免标签越出自身按钮盒。 */
@media (max-width: 560px) {
  /* 窄屏靠选中底色与实心圆点表达当前来源,角标让位给标题与状态。 */
  .source-row__badge { display: none; }
  /* 四个二级 tab 排不下时改成两行两列,所有标签完整可见,不做隐藏滚动。 */
  .model-subtabs__track { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
}
.model-subpanel { display: grid; gap: var(--dl-space-3); min-inline-size: 0; }
.agent-editor__panel:focus-visible, button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
button:active:not(:disabled) { transform: translateY(var(--dl-lift-press)); }
button:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.model-section__hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.model-section__hint--warning { color: var(--dl-warning); }
/* 配置矩阵:默认模型与任务档位共用同一套列(范围/档位 + 模型 + 思考),减少视觉语法。 */
.model-matrix { border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.model-matrix__head, .model-matrix__row { display: grid; grid-template-columns: var(--agent-matrix-label) minmax(0, 1fr) var(--agent-matrix-control); align-items: center; gap: var(--dl-space-3); padding: var(--dl-space-2) var(--dl-space-3); }
.model-matrix__head { border-block-end: var(--dl-border-width) solid var(--dl-border-subtle); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.model-matrix__row + .model-matrix__row { border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.model-matrix__field-label { display: none; }
.model-matrix__label { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-body); }
.model-matrix__row .field__select { min-inline-size: 0; }
.model-matrix--tiers .model-matrix__head, .model-matrix--tiers .model-matrix__row { grid-template-columns: var(--agent-matrix-tier) var(--agent-matrix-label) minmax(0, 1fr) var(--agent-matrix-control); }
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

.agent-editor__error { border-inline-start: var(--agent-emphasis-width) solid var(--dl-error); padding-inline-start: var(--dl-space-2); color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

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

.agent-editor__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--dl-space-2); }
.agent-editor__actions .dl-btn { min-block-size: var(--dl-target-size); }
/* 状态行是「当前保存状态」的常驻指示,不进 Tab 顺序,也不抢焦点。 */
.agent-editor__save-state { overflow-wrap: anywhere; position: relative; display: inline-flex; flex: 1 1 0; min-inline-size: 0; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-space-6); margin-inline-end: auto; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.agent-editor__save-state[data-state='dirty'],
.agent-editor__save-state[data-state='saving'],
.agent-editor__save-state[data-state='saved'],
.agent-editor__save-state[data-state='probe-ok'] { color: var(--dl-text-secondary); }
.agent-editor__save-state[data-state='incomplete'],
.agent-editor__save-state[data-state='blocked'],
.agent-editor__save-state[data-state='attention'] { color: var(--dl-warning); }
.agent-editor__save-state[data-state='error'],
.agent-editor__save-state[data-state='probe-fail'] { color: var(--dl-error); }
.agent-editor__save-state[data-state='saved'] .dl-icon,
.agent-editor__save-state[data-state='probe-ok'] .dl-icon { color: var(--dl-success); }
/* 探测结果仍留在按钮撑起的同一行,窄屏允许元信息在状态槽内换行。 */
.agent-editor__save-state[data-state^='probe-'] { flex: 1 1 0; min-inline-size: 0; gap: var(--dl-space-1); }
.agent-editor__save-state[data-state^='probe-'] .dl-icon { flex: none; }
.agent-editor__probe-fail-icon { flex: none; color: var(--dl-error); }
.agent-editor__probe-meta { display: inline-block; margin-inline-start: var(--dl-space-1); white-space: nowrap; }
.agent-editor__save-label { min-inline-size: 0; overflow-wrap: anywhere; }
.agent-editor__save-time { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; }
/* 保存成功时 1px 强调色细线从左扫过一次:动效只碰 transform / opacity。 */
.agent-editor__save-scan { position: absolute; inset-block-end: 0; inset-inline: 0; block-size: var(--dl-border-width); background: var(--dl-accent); transform-origin: left center; animation: agent-save-scan var(--dl-duration-slow) var(--dl-ease-standard) both; }
@keyframes agent-save-scan {
  from { opacity: 0.9; transform: scaleX(0); }
  to { opacity: 0; transform: scaleX(1); }
}
.agent-editor__save-button { min-inline-size: 7em; }
/* 保存按钮禁用态保留青瓷色相:深青瓷面 + 低饱和文字 + 发丝青瓷描边。
   不切到中性 sunken(深色下会变成一块近黑),也不响应 hover / active。 */
.agent-editor__save-button[aria-disabled='true'],
.agent-editor__save-button[aria-disabled='true']:hover,
.agent-editor__save-button[aria-disabled='true']:active {
  background-color: color-mix(in srgb, var(--dl-accent) 22%, var(--dl-bg-elevated));
  border-color: color-mix(in srgb, var(--dl-accent) 22%, transparent);
  color: color-mix(in srgb, var(--dl-accent) 30%, color-mix(in srgb, var(--dl-text-secondary) 65%, var(--dl-text-tertiary)));
  transform: none;
}
.agent-editor__buttons { display: flex; flex-shrink: 0; flex-wrap: wrap; gap: var(--dl-space-2); margin-inline-start: auto; }
.agent-editor__visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) {
  .agent-editor__save-scan { animation: none; opacity: 0; }
  .gateway-form__refresh[data-busy='true'] :deep(.dl-icon) { animation: none; }
}

/* 触屏 / 窄屏:模板卡与输入框仍保持 44 的可点高度(默认已是 44)。 */
@media (max-width: 560px) {
  .template-grid, .model-row { grid-template-columns: minmax(0, 1fr); }
  .agent-editor__buttons .dl-btn { min-inline-size: var(--dl-target-size); padding-inline: var(--dl-space-2); white-space: nowrap; }
  /* 回退链的控制钮换到第二行,保持 44×44 的独立触达尺寸。 */
  .fallback-row { grid-template-columns: auto minmax(0, 1fr); }
  .fallback-row__actions { grid-column: 2; justify-content: flex-end; }
  /* 矩阵在窄屏压成两行:标签与思考同排,模型占满下一行;两档矩阵共用。 */
  .model-matrix__head { display: none; }
  .model-matrix__row, .model-matrix--tiers .model-matrix__row { grid-template-columns: minmax(0, 1fr) var(--agent-matrix-control); gap: var(--dl-space-2); }
  .model-matrix__label { grid-column: 1; grid-row: 1; }
  .model-matrix--tiers .model-matrix__tier-info { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-1) var(--dl-space-2); grid-column: 1; grid-row: 1; }
  /* 档位矩阵:tier-info div + 两个 select 包裹层。 */
  .model-matrix--tiers .model-matrix__row > .select-field:nth-of-type(1) { grid-column: 1 / -1; grid-row: 2; }
  .model-matrix--tiers .model-matrix__row > .select-field:nth-of-type(2) { grid-column: 2; grid-row: 1; }
  /* 默认矩阵在窄屏改为单列,并给两个控件补可见列名,避免标签指向错误的控件。 */
  .model-matrix:not(.model-matrix--tiers) .model-matrix__row { grid-template-columns: minmax(0, 1fr); }
  .model-matrix:not(.model-matrix--tiers) .model-matrix__label,
  .model-matrix:not(.model-matrix--tiers) .model-matrix__field-label,
  .model-matrix:not(.model-matrix--tiers) .select-field { grid-column: 1; grid-row: auto; }
  .model-matrix:not(.model-matrix--tiers) .model-matrix__field-label { display: block; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
}
</style>
