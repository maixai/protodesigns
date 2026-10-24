<script setup lang="ts">
// Agent 设置与新建共用基本 / 模型两页;模板只填身份,模型配置独立保存。
//
// 用原生 dialog.showModal():自带焦点陷阱、Esc 与 aria-modal;top layer 内仍继承
// .dl-scope--dark 的 CSS 变量,故不 Teleport。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentConfig } from '../contracts/generated/agent-config'
import type { AgentModelConfig } from '../contracts/generated/agent-model-config'
import type { ModelGateway, ModelSubscription } from '../contracts/generated/agent-model-config'
import type { GatewayProbe } from '../contracts/generated/gateway-probe'
import type { EffortLevel, ModelOption, ModelTierId } from '../data/models'
import { DEFAULT_MODEL, EFFORT_LEVELS, FALLBACK_PRIORITY, MODELS, SUBSCRIPTION_PROVIDER_LABELS, activeSubscriptionOf, defaultModelSource, modelById, modelsForSubscription, subscriptionIsReady, tierDefaultsForSource } from '../data/models'
import { connectSubscription, disconnectSubscription, probeModelGateway } from '../api/workspace'
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
  count: number
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
const isDirty = computed(() => !isCreate.value && JSON.stringify({ name: name.value.trim(), note: note.value.trim(), model: modelConfig.value }) !== baselineSerialized.value)
const isValid = computed(() => name.value.trim() !== '' && note.value.trim() !== '' && modelConfig.value.defaultModelId.trim() !== '' && !hasUnavailableSourceModels.value)
type SaveState = 'saving' | 'error' | 'saved' | 'incomplete' | 'blocked' | 'dirty' | 'clean'
const saveStateKind = computed<SaveState>(() => {
  if (props.busy) return 'saving'
  if (props.error !== '') return 'error'
  if (!isCreate.value && !isDirty.value && savedAt.value !== '') return 'saved'
  // 来源不可用时保存被拦下,页脚必须直接说明原因,不能只说「有未保存的更改」。
  if (!sourceReady.value) return 'blocked'
  if (!isValid.value) return 'incomplete'
  if (!isCreate.value) return isDirty.value ? 'dirty' : 'clean'
  return 'incomplete'
})
const saveStateLabel = computed(() => {
  const copy = t.value.workspace.agentAdmin
  if (saveStateKind.value === 'saving') return copy.saving
  if (saveStateKind.value === 'error') return copy.saveStateFailed
  if (saveStateKind.value === 'saved') return copy.savedInline
  if (saveStateKind.value === 'blocked') return copy.saveStateBlocked
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
  protocol: ModelGateway['protocol']
  authMode: ModelGateway['authMode']
  apiKeyInput: string
  apiKeyMasked: string
  apiKeySet: boolean
  discoverModels: boolean
  modelsText: string
}

const sourceBusy = ref(false)
const sourceNotice = ref('')
const editingGatewayId = ref<string | null>(null)
const gatewayDraft = ref<GatewayDraft | null>(null)
const gatewayProbe = ref<GatewayProbe | null>(null)
const gatewayProbeBusy = ref(false)
const showGatewayKey = ref(false)
const deletingGatewayId = ref('')
// 当前展开的行内操作菜单:订阅用固定键,网关用自身 id;同一时间只开一个。
const sourceMenuId = ref('')
// 菜单靠近对话框底部时向上展开,避免被滚动容器裁掉。
const sourceMenuAbove = ref(false)

const modelSource = computed(() => modelConfig.value.source)
const subscriptions = computed(() => modelSource.value.subscriptions)
const hasConnectedSubscription = computed(() => subscriptions.value.some((item) => item.connected))
const activeSubscription = computed(() => activeSubscriptionOf(modelSource.value))
const tierDefaults = computed(() => tierDefaultsForSource(modelSource.value))
const sourceReady = computed(() => {
  const source = modelSource.value
  if (source.kind === 'subscription') {
    return activeSubscription.value !== undefined && subscriptionIsReady(activeSubscription.value)
  }
  const gateway = source.gateways.find((item) => item.id === source.activeGatewayId)
  return gateway !== undefined && gateway.baseUrl.trim() !== '' && gateway.apiKeySet
})
// 保存还要求来源可用:没有订阅/API Key 时不允许把模型配置写回。
const canSubmit = computed(() => isValid.value && !props.busy && (isCreate.value || isDirty.value) && sourceReady.value)

function isSubscriptionActive(subscription: ModelSubscription): boolean {
  return modelSource.value.kind === 'subscription'
    && modelSource.value.activeSubscriptionProvider === subscription.provider
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
  const source = modelSource.value
  if (source.kind === 'subscription') {
    const subscription = activeSubscriptionOf(source)
    if (subscription === undefined || !subscriptionIsReady(subscription)) return []
    return modelsForSubscription(subscription.provider).map((model) => ({ value: model.id, label: modelOptionLabel(model) }))
  }
  const gateway = source.gateways.find((item) => item.id === source.activeGatewayId)
  if (gateway === undefined) return []
  return gateway.models.map((id) => ({ value: id, label: modelNameOf(id) }))
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

function modelCountLabel(count: number): string {
  const template = count === 1
    ? t.value.workspace.agentAdmin.gatewayModelsOne
    : t.value.workspace.agentAdmin.gatewayModels
  return template.replace('{count}', String(count))
}
function gatewayModelCount(gateway: ModelGateway): string {
  return modelCountLabel(gateway.models.length)
}
const gatewayRequestPreview = computed(() => {
  const draft = gatewayDraft.value
  if (draft === null || draft.baseUrl.trim() === '') return ''
  const base = draft.baseUrl.trim().replace(/\/+$/, '')
  // 用户常直接把带 /v1 的 base URL 粘进来,只在缺失时补版本段,避免 /v1/v1。
  const versioned = base.endsWith('/v1') ? base : `${base}/v1`
  return draft.protocol === 'anthropic' ? `${versioned}/messages` : `${versioned}/chat/completions`
})

// 探测结果只对当时的 URL / 发现模式有效:任一改变就清空,避免展示过期结果。
watch([() => gatewayDraft.value?.baseUrl, () => gatewayDraft.value?.discoverModels], () => {
  gatewayProbe.value = null
})

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
  // 默认模型在来源中才显示模型名;不在来源时只报「不可用」,避免整句被原生 select 裁掉。
  const defaultLabel = sourceModelIds.value.has(defaultModelId)
    ? `${t.value.workspace.agentAdmin.modelTierDefault} · ${compactModelLabel(defaultModelId)}`
    : `${t.value.workspace.agentAdmin.modelTierDefault} · ${t.value.workspace.agentAdmin.modelUnavailableShort}`
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

async function loginSubscription(subscription: ModelSubscription): Promise<void> {
  if (sourceBusy.value) return
  const wasConnected = subscription.connected
  sourceBusy.value = true
  const result = await connectSubscription(subscription.provider)
  sourceBusy.value = false
  if (!result.ok) return
  sourceNotice.value = ''
  // 连接只更新该服务商的状态,不隐式切换来源:切换必须由用户点「使用此订阅」。
  replaceSubscription(result.value)
  // 连接按钮会被行内菜单替换,把焦点交给新的触发钮,键盘用户不会失去位置。
  if (!wasConnected) void nextTick(() => document.getElementById(sourceMenuTriggerId(subscription.provider))?.focus())
}

async function logoutSubscription(subscription: ModelSubscription): Promise<void> {
  if (sourceBusy.value) return
  sourceBusy.value = true
  const result = await disconnectSubscription(subscription.provider)
  sourceBusy.value = false
  if (!result.ok) return
  sourceNotice.value = ''
  replaceSubscription(result.value)
}

function useSubscription(subscription: ModelSubscription): void {
  if (!subscriptionIsReady(subscription)) {
    sourceNotice.value = t.value.workspace.agentAdmin.sourceRequired
    return
  }
  sourceNotice.value = ''
  modelConfig.value = {
    ...modelConfig.value,
    source: { ...modelSource.value, kind: 'subscription', activeSubscriptionProvider: subscription.provider },
  }
}

function useGateway(id: string): void {
  const gateway = modelSource.value.gateways.find((item) => item.id === id)
  if (gateway === undefined || gateway.baseUrl.trim() === '' || !gateway.apiKeySet) {
    sourceNotice.value = t.value.workspace.agentAdmin.sourceRequired
    return
  }
  sourceNotice.value = ''
  modelConfig.value = { ...modelConfig.value, source: { ...modelSource.value, kind: 'gateway', activeGatewayId: id } }
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

function toggleSourceMenu(id: string): void {
  if (sourceMenuId.value === id) {
    closeSourceMenu(true)
    return
  }
  const trigger = document.getElementById(sourceMenuTriggerId(id))
  const boundary = trigger?.closest('.agent-editor__body')?.getBoundingClientRect()
  const rect = trigger?.getBoundingClientRect()
  // 约等于四行菜单的高度;下方放不下就翻到上方。
  const menuSpace = 220
  sourceMenuAbove.value = rect !== undefined && boundary !== undefined && boundary.bottom - rect.bottom < menuSpace
  sourceMenuId.value = id
  void nextTick(() => {
    document.getElementById(sourceMenuDomId(id))?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  })
}

function closeSourceMenu(restoreFocus = false): void {
  const id = sourceMenuId.value
  if (id === '') return
  sourceMenuId.value = ''
  if (restoreFocus) void nextTick(() => document.getElementById(sourceMenuTriggerId(id))?.focus())
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

function useSubscriptionFromMenu(subscription: ModelSubscription): void {
  useSubscription(subscription)
  closeSourceMenu(true)
}
function checkSubscriptionFromMenu(subscription: ModelSubscription): void {
  closeSourceMenu(true)
  void loginSubscription(subscription)
}
function logoutSubscriptionFromMenu(subscription: ModelSubscription): void {
  closeSourceMenu()
  void logoutSubscription(subscription).then(() => nextTick(() => document.getElementById(`${dialogId}-subscription-login-${subscription.provider}`)?.focus()))
}
function useGatewayFromMenu(id: string): void {
  useGateway(id)
  closeSourceMenu(true)
}
function editGatewayFromMenu(gateway: ModelGateway): void {
  closeSourceMenu()
  startEditGateway(gateway)
}
function deleteGatewayFromMenu(id: string): void {
  closeSourceMenu()
  deletingGatewayId.value = id
  void nextTick(() => document.getElementById(`${dialogId}-gateway-delete-${sourceDomKey(id)}`)?.focus())
}

function startAddGateway(): void {
  sourceNotice.value = ''
  editingGatewayId.value = ''
  gatewayProbe.value = null
  showGatewayKey.value = false
  gatewayDraft.value = {
    id: '', name: '', baseUrl: '', protocol: 'anthropic', authMode: 'bearer',
    apiKeyInput: '', apiKeyMasked: '', apiKeySet: false, discoverModels: true, modelsText: '',
  }
}

function startEditGateway(gateway: ModelGateway): void {
  sourceNotice.value = ''
  editingGatewayId.value = gateway.id
  gatewayProbe.value = null
  showGatewayKey.value = false
  gatewayDraft.value = {
    id: gateway.id, name: gateway.name, baseUrl: gateway.baseUrl, protocol: gateway.protocol,
    authMode: gateway.authMode, apiKeyInput: '', apiKeyMasked: gateway.apiKeyMasked,
    apiKeySet: gateway.apiKeySet, discoverModels: gateway.discoverModels, modelsText: gateway.models.join('\n'),
  }
}

function cancelGatewayEdit(): void {
  editingGatewayId.value = null
  gatewayDraft.value = null
  gatewayProbe.value = null
  sourceNotice.value = ''
}

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 3)}••••••••${key.slice(-4)}`
}

function saveGatewayDraft(): void {
  const draft = gatewayDraft.value
  if (draft === null) return
  const copy = t.value.workspace.agentAdmin
  if (draft.name.trim() === '') { sourceNotice.value = copy.gatewayNameRequired; return }
  if (draft.baseUrl.trim() === '') { sourceNotice.value = copy.gatewayUrlRequired; return }
  if (!draft.apiKeySet && draft.apiKeyInput.trim() === '') { sourceNotice.value = copy.gatewayKeyRequired; return }
  const keyInput = draft.apiKeyInput.trim()
  const gateway: ModelGateway = {
    id: draft.id === '' ? `gateway:${Date.now()}` : draft.id,
    name: draft.name.trim(),
    baseUrl: draft.baseUrl.trim(),
    protocol: draft.protocol,
    authMode: draft.authMode,
    apiKeyMasked: keyInput === '' ? draft.apiKeyMasked : maskKey(keyInput),
    apiKeySet: keyInput !== '' || draft.apiKeySet,
    discoverModels: draft.discoverModels,
    models: [...new Set(draft.modelsText.split('\n').map((line) => line.trim()).filter((line) => line !== ''))],
  }
  const gateways = draft.id === ''
    ? [...modelSource.value.gateways, gateway]
    : modelSource.value.gateways.map((item) => item.id === gateway.id ? gateway : item)
  // 保存网关只更新配置,不隐式把来源切过去;切换由用户点「使用此网关」。
  modelConfig.value = {
    ...modelConfig.value,
    source: { ...modelSource.value, gateways },
  }
  cancelGatewayEdit()
}

function deleteGateway(id: string): void {
  const remaining = modelSource.value.gateways.filter((gateway) => gateway.id !== id)
  // 删掉当前使用的网关时来源回到未配置,不自动挑一个替代网关。
  const activeGatewayId = modelSource.value.activeGatewayId === id ? '' : modelSource.value.activeGatewayId
  modelConfig.value = {
    ...modelConfig.value,
    source: { ...modelSource.value, gateways: remaining, activeGatewayId },
  }
  deletingGatewayId.value = ''
}

async function testGateway(): Promise<void> {
  const draft = gatewayDraft.value
  if (draft === null || gatewayProbeBusy.value) return
  if (draft.baseUrl.trim() === '') { sourceNotice.value = t.value.workspace.agentAdmin.gatewayUrlRequired; return }
  sourceNotice.value = ''
  gatewayProbeBusy.value = true
  gatewayProbe.value = null
  const result = await probeModelGateway(draft.baseUrl.trim(), draft.discoverModels)
  gatewayProbeBusy.value = false
  if (!result.ok) return
  gatewayProbe.value = result.value
  if (result.value.connected && result.value.models.length > 0) draft.modelsText = result.value.models.join('\n')
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
  const conversationCustom = config.defaultModelId !== defaultModelIdInSource.value || config.defaultEffortLevel !== ''
  const subagentCustom = config.subagentModelId !== '' || config.subagentEffortLevel !== ''
  return (conversationCustom ? 1 : 0) + (subagentCustom ? 1 : 0)
})
const advancedCustomCount = computed(() => (modelConfig.value.fallbackModelIds.length > 0 ? 1 : 0)
  + (modelConfig.value.autoCompactWindowTokens !== 0 ? 1 : 0)
  + (modelConfig.value.maxThinkingTokens !== 0 ? 1 : 0))

const modelSections = computed<ModelSectionOption[]>(() => [
  { id: 'source', label: t.value.workspace.agentAdmin.modelSubtabSource, count: 0 },
  { id: 'defaults', label: t.value.workspace.agentAdmin.modelSubtabDefaults, count: defaultCustomCount.value },
  { id: 'tiers', label: t.value.workspace.agentAdmin.modelSubtabTiers, count: customizedTierCount.value },
  { id: 'advanced', label: t.value.workspace.agentAdmin.modelSubtabAdvanced, count: advancedCustomCount.value },
])

// 角标数字单独读没有语义,无障碍名称里补一句「N 项自定义」。
function modelSectionAriaLabel(section: ModelSectionOption): string {
  const base = section.count === 0
    ? section.label
    : `${section.label} · ${t.value.workspace.agentAdmin.modelCustomCount.replace('{count}', String(section.count))}`
  if (section.id !== 'source' && !sourceReady.value) return `${base} · ${t.value.workspace.agentAdmin.modelSourceRequiredHint}`
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
  activeTab.value = 'basic'
  activeModelSection.value = sourceReady.value ? 'defaults' : 'source'
  sourceNotice.value = ''
  editingGatewayId.value = null
  gatewayDraft.value = null
  gatewayProbe.value = null
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
              :aria-disabled="section.id !== 'source' && !sourceReady ? 'true' : undefined"
              :data-locked="section.id !== 'source' && !sourceReady ? 'true' : undefined"
              @click="activateModelSection(section.id)"
            >
              <span>{{ section.label }}</span>
              <span v-if="section.count > 0" class="model-subtabs__count" aria-hidden="true">{{ section.count }}</span>
            </button>
          </div>
        </div>
        <!-- 来源可用但已选模型不在其中:横幅在所有分区可见,并阻止保存。 -->
        <p v-if="hasUnavailableSourceModels" class="model-source-notice" role="alert">{{ t.workspace.agentAdmin.modelUnavailable }}</p>

        <div
          v-show="activeModelSection === 'source'" :id="`${dialogId}-model-panel-source`"
          class="model-subpanel" role="tabpanel" :aria-labelledby="`${dialogId}-model-tab-source`"
        >
          <p class="model-section__hint">{{ t.workspace.agentAdmin.modelSourceHint }}</p>
          <p v-if="sourceNotice !== ''" class="model-source-notice" role="alert">{{ sourceNotice }}</p>

          <div v-if="sourceMenuId !== ''" class="source-menu__scrim" aria-hidden="true" @click.stop="closeSourceMenu()" />

          <!-- 订阅与网关共用同一种「分区标题 + 来源行」结构,不再把订阅裹进独立卡片。 -->
          <section class="source-block">
            <div class="source-block__head">
              <h3>{{ t.workspace.agentAdmin.modelSourceSubscription }}</h3>
            </div>
            <ul class="source-list">
              <li
                v-for="subscription in subscriptions" :key="subscription.provider"
                class="source-row source-row--subscription"
                :data-active="isSubscriptionActive(subscription) ? 'true' : undefined"
                :aria-current="isSubscriptionActive(subscription) ? 'true' : undefined"
              >
                <div class="source-row__main source-row__main--static">
                  <span class="source-row__radio" :data-active="isSubscriptionActive(subscription) ? 'true' : undefined" aria-hidden="true" />
                  <span class="source-row__body">
                    <span class="source-row__title">
                      {{ SUBSCRIPTION_PROVIDER_LABELS[subscription.provider] }}
                      <span v-if="isSubscriptionActive(subscription)" class="source-row__badge">{{ t.workspace.agentAdmin.gatewayCurrent }}</span>
                      <span class="source-row__status" :data-tone="subscriptionToneOf(subscription)">{{ subscriptionStatusOf(subscription) }}</span>
                    </span>
                    <span v-if="subscriptionMetaOf(subscription) !== ''" class="source-row__meta">{{ subscriptionMetaOf(subscription) }}</span>
                  </span>
                </div>
                <button
                  v-if="!subscription.connected" :id="`${dialogId}-subscription-login-${subscription.provider}`"
                  type="button" class="dl-btn dl-btn--ghost source-row__login" :disabled="sourceBusy"
                  @click="loginSubscription(subscription)"
                >{{ t.workspace.agentAdmin.subscriptionLogin }}</button>
                <div v-else class="source-row__menu-wrap">
                  <button
                    :id="sourceMenuTriggerId(subscription.provider)" type="button" class="source-row__menu-trigger"
                    aria-haspopup="menu" :aria-expanded="sourceMenuId === subscription.provider ? 'true' : 'false'"
                    :aria-controls="sourceMenuId === subscription.provider ? sourceMenuDomId(subscription.provider) : undefined"
                    :aria-label="t.workspace.agentAdmin.subscriptionActionsLabel.replace('{name}', SUBSCRIPTION_PROVIDER_LABELS[subscription.provider])"
                    @click="toggleSourceMenu(subscription.provider)"
                  ><span aria-hidden="true">⋯</span></button>
                  <div
                    v-if="sourceMenuId === subscription.provider" :id="sourceMenuDomId(subscription.provider)"
                    class="source-menu" :class="{ 'source-menu--above': sourceMenuAbove }" role="menu"
                    :aria-label="t.workspace.agentAdmin.subscriptionActionsLabel.replace('{name}', SUBSCRIPTION_PROVIDER_LABELS[subscription.provider])"
                    @keydown="onSourceMenuKeydown($event, subscription.provider)"
                  >
                    <button type="button" role="menuitem" :disabled="isSubscriptionActive(subscription) || !subscriptionIsReady(subscription)" @click="useSubscriptionFromMenu(subscription)">{{ t.workspace.agentAdmin.modelSourceUseSubscription }}</button>
                    <button type="button" role="menuitem" @click="checkSubscriptionFromMenu(subscription)">{{ t.workspace.agentAdmin.subscriptionCheck }}</button>
                    <div class="source-menu__divider" role="separator" />
                    <button type="button" role="menuitem" class="source-menu__danger" @click="logoutSubscriptionFromMenu(subscription)">{{ t.workspace.agentAdmin.subscriptionLogout }}</button>
                  </div>
                </div>
              </li>
            </ul>
            <p v-if="!hasConnectedSubscription" class="model-section__hint">{{ t.workspace.agentAdmin.subscriptionLoginHint }}</p>
          </section>

          <section class="source-block">
            <div class="source-block__head">
              <h3>{{ t.workspace.agentAdmin.gatewayTitle }}</h3>
              <button v-if="gatewayDraft === null" type="button" class="source-block__add" @click="startAddGateway">{{ t.workspace.agentAdmin.gatewayAdd }}</button>
            </div>

            <div v-if="gatewayDraft !== null" class="gateway-form">
              <button type="button" class="gateway-form__back" @click="cancelGatewayEdit">← {{ t.workspace.agentAdmin.gatewayBack }}</button>
              <h4>{{ gatewayDraft.id === '' ? t.workspace.agentAdmin.gatewayFormNew : t.workspace.agentAdmin.gatewayFormEdit }}</h4>
              <div class="gateway-form__grid">
                <label class="field">
                  <span class="field__label">{{ t.workspace.agentAdmin.gatewayName }}</span>
                  <input v-model="gatewayDraft.name" type="text" class="field__input" :placeholder="t.workspace.agentAdmin.gatewayNamePlaceholder" maxlength="40">
                </label>
                <div class="field">
                  <span class="field__label">{{ t.workspace.agentAdmin.gatewayProtocol }}</span>
                  <div class="source-segment" role="group" :aria-label="t.workspace.agentAdmin.gatewayProtocol">
                    <button type="button" :aria-pressed="gatewayDraft.protocol === 'anthropic'" @click="gatewayDraft.protocol = 'anthropic'">{{ t.workspace.agentAdmin.gatewayProtocolAnthropic }}</button>
                    <button type="button" :aria-pressed="gatewayDraft.protocol === 'openaiCompatible'" @click="gatewayDraft.protocol = 'openaiCompatible'">{{ t.workspace.agentAdmin.gatewayProtocolOpenai }}</button>
                  </div>
                </div>
              </div>
              <label class="field">
                <span class="field__label">{{ t.workspace.agentAdmin.gatewayBaseUrl }}</span>
                <input v-model="gatewayDraft.baseUrl" type="url" class="field__input gateway-form__mono" :placeholder="t.workspace.agentAdmin.gatewayBaseUrlPlaceholder" spellcheck="false">
              </label>
              <p v-if="gatewayRequestPreview !== ''" class="gateway-form__preview">{{ t.workspace.agentAdmin.gatewayRequestPreview }} <code>{{ gatewayRequestPreview }}</code></p>
              <div class="gateway-form__grid">
                <div class="field">
                  <span class="field__label">{{ t.workspace.agentAdmin.gatewayAuth }}</span>
                  <div class="source-segment" role="group" :aria-label="t.workspace.agentAdmin.gatewayAuth">
                    <button type="button" :aria-pressed="gatewayDraft.authMode === 'bearer'" @click="gatewayDraft.authMode = 'bearer'">{{ t.workspace.agentAdmin.gatewayAuthBearer }}</button>
                    <button type="button" :aria-pressed="gatewayDraft.authMode === 'apiKey'" @click="gatewayDraft.authMode = 'apiKey'">{{ t.workspace.agentAdmin.gatewayAuthKey }}</button>
                  </div>
                </div>
                <div class="field">
                  <label :for="`${dialogId}-gateway-key`" class="field__label">{{ t.workspace.agentAdmin.gatewayApiKey }}</label>
                  <div class="gateway-form__key">
                    <input :id="`${dialogId}-gateway-key`" v-model="gatewayDraft.apiKeyInput" :type="showGatewayKey ? 'text' : 'password'" class="field__input gateway-form__mono" :placeholder="t.workspace.agentAdmin.gatewayApiKeyPlaceholder" autocomplete="off" spellcheck="false">
                    <button type="button" class="gateway-form__reveal" :aria-label="showGatewayKey ? t.workspace.agentAdmin.gatewayHideKey : t.workspace.agentAdmin.gatewayShowKey" @click="showGatewayKey = !showGatewayKey">{{ showGatewayKey ? t.workspace.agentAdmin.gatewayHideKey : t.workspace.agentAdmin.gatewayShowKey }}</button>
                  </div>
                </div>
              </div>
              <p v-if="gatewayDraft.apiKeySet" class="model-section__hint">{{ t.workspace.agentAdmin.gatewayApiKeyKeep }} · <code>{{ gatewayDraft.apiKeyMasked }}</code></p>
              <label class="gateway-form__check"><input v-model="gatewayDraft.discoverModels" type="checkbox"> {{ t.workspace.agentAdmin.gatewayDiscover }}</label>
              <p class="model-section__hint">{{ t.workspace.agentAdmin.gatewayDiscoverHint }}</p>
              <label class="field">
                <span class="field__label">{{ t.workspace.agentAdmin.gatewayModelsLabel }}</span>
                <textarea v-model="gatewayDraft.modelsText" class="field__input gateway-form__models" rows="4" :placeholder="t.workspace.agentAdmin.gatewayModelsPlaceholder" spellcheck="false" />
              </label>
              <div class="gateway-form__actions">
                <button type="button" class="dl-btn dl-btn--ghost" :disabled="gatewayProbeBusy" @click="testGateway">{{ gatewayProbeBusy ? t.workspace.agentAdmin.gatewayTesting : t.workspace.agentAdmin.gatewayTest }}</button>
                <button type="button" class="dl-btn dl-btn--primary" @click="saveGatewayDraft">{{ t.workspace.agentAdmin.gatewaySave }}</button>
              </div>
              <p class="model-section__hint">{{ t.workspace.agentAdmin.gatewayProbeHint }}</p>
              <p v-if="gatewayProbe !== null" class="gateway-probe" :data-ok="gatewayProbe.connected ? 'true' : 'false'" role="status">
                {{ gatewayProbe.connected ? '✓' : '×' }} {{ gatewayProbe.message }} · <span class="gateway-form__mono">{{ gatewayProbe.latencyMs }}ms</span>
                <span v-if="gatewayProbe.models.length > 0"> · {{ modelCountLabel(gatewayProbe.models.length) }}</span>
              </p>
            </div>

            <div v-else-if="modelSource.gateways.length === 0" class="gateway-empty">
              <p class="gateway-empty__title">{{ t.workspace.agentAdmin.gatewayEmpty }}</p>
              <p class="model-section__hint">{{ t.workspace.agentAdmin.gatewayEmptyBody }}</p>
              <button type="button" class="dl-btn dl-btn--ghost" @click="startAddGateway">{{ t.workspace.agentAdmin.gatewayAdd }}</button>
            </div>

            <ul v-else class="source-list">
              <li
                v-for="gateway in modelSource.gateways" :key="gateway.id"
                class="source-row source-row--gateway"
                :data-active="modelSource.kind === 'gateway' && modelSource.activeGatewayId === gateway.id ? 'true' : undefined"
                :aria-current="modelSource.kind === 'gateway' && modelSource.activeGatewayId === gateway.id ? 'true' : undefined"
              >
                <button
                  type="button" class="source-row__main"
                  :aria-label="t.workspace.agentAdmin.gatewayOpenSettings.replace('{name}', gateway.name)"
                  @click="startEditGateway(gateway)"
                >
                  <span class="source-row__radio" :data-active="modelSource.kind === 'gateway' && modelSource.activeGatewayId === gateway.id ? 'true' : undefined" aria-hidden="true" />
                  <span class="source-row__body">
                    <span class="source-row__title">
                      {{ gateway.name }}
                      <span v-if="modelSource.kind === 'gateway' && modelSource.activeGatewayId === gateway.id" class="source-row__badge">{{ t.workspace.agentAdmin.gatewayCurrent }}</span>
                    </span>
                    <span class="source-row__meta source-row__meta--mono">{{ gateway.baseUrl }}</span>
                    <span class="source-row__meta">{{ gatewayModelCount(gateway) }} · {{ gateway.apiKeySet ? t.workspace.agentAdmin.gatewayConfigured : t.workspace.agentAdmin.gatewayUnverified }}</span>
                  </span>
                  <DliIcon name="chevronRight" size="sm" class="source-row__chevron" />
                </button>
                <div class="source-row__menu-wrap">
                  <button
                    :id="sourceMenuTriggerId(gateway.id)" type="button" class="source-row__menu-trigger"
                    aria-haspopup="menu" :aria-expanded="sourceMenuId === gateway.id ? 'true' : 'false'"
                    :aria-controls="sourceMenuId === gateway.id ? sourceMenuDomId(gateway.id) : undefined"
                    :aria-label="t.workspace.agentAdmin.gatewayActionsLabel.replace('{name}', gateway.name)"
                    @click="toggleSourceMenu(gateway.id)"
                  ><span aria-hidden="true">⋯</span></button>
                  <div
                    v-if="sourceMenuId === gateway.id" :id="sourceMenuDomId(gateway.id)"
                    class="source-menu" :class="{ 'source-menu--above': sourceMenuAbove }" role="menu" :aria-label="t.workspace.agentAdmin.gatewayActionsLabel.replace('{name}', gateway.name)"
                    @keydown="onSourceMenuKeydown($event, gateway.id)"
                  >
                    <button
                      type="button" role="menuitem"
                      :disabled="(modelSource.kind === 'gateway' && modelSource.activeGatewayId === gateway.id) || gateway.baseUrl.trim() === '' || !gateway.apiKeySet"
                      @click="useGatewayFromMenu(gateway.id)"
                    >{{ t.workspace.agentAdmin.gatewayUse }}</button>
                    <button type="button" role="menuitem" @click="editGatewayFromMenu(gateway)">{{ t.workspace.agentAdmin.gatewayEdit }}</button>
                    <div class="source-menu__divider" role="separator" />
                    <button type="button" role="menuitem" class="source-menu__danger" @click="deleteGatewayFromMenu(gateway.id)">{{ t.workspace.agentAdmin.gatewayDelete }}</button>
                  </div>
                </div>
                <div v-if="deletingGatewayId === gateway.id" class="source-row__confirm">
                  <span>{{ t.workspace.agentAdmin.gatewayDeletePrompt }}</span>
                  <button :id="`${dialogId}-gateway-delete-${sourceDomKey(gateway.id)}`" type="button" class="danger-confirm" @click="deleteGateway(gateway.id)">{{ t.workspace.agentAdmin.gatewayDeleteConfirm }}</button>
                  <button type="button" @click="deletingGatewayId = ''">{{ t.workspace.agentAdmin.gatewayCancel }}</button>
                </div>
              </li>
            </ul>
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
              <SelectField>
                <select v-model="modelConfig.defaultModelId" class="field__input field__select" :disabled="busy" :aria-label="t.workspace.agentAdmin.modelConversationLabel">
                  <option v-for="option in modelSelectOptions(modelConfig.defaultModelId)" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </SelectField>
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
              <SelectField>
                <select v-model="modelConfig.subagentModelId" class="field__input field__select" :disabled="busy" :aria-label="t.workspace.agentAdmin.modelSubagentLabel">
                  <option value="">{{ t.workspace.agentAdmin.modelSubagentInherit }}</option>
                  <option v-for="option in modelSelectOptions(modelConfig.subagentModelId)" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </SelectField>
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
                <select v-model="modelConfig.tiers[tier.id].modelId" class="field__input field__select" :disabled="busy" :aria-label="`${tier.label} · ${t.workspace.agentAdmin.modelColumn}`">
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
      <!-- 常驻状态行:无变更 / 有变更 / 保存中 / 已保存 / 失败都写在同一位置,不弹 toast。 -->
      <p v-if="!isCreate" :id="saveStateId" class="agent-editor__save-state" :data-state="saveStateKind">
        <DliIcon v-if="saveStateKind === 'saved'" name="check" size="sm" />
        <span class="agent-editor__save-label">{{ saveStateLabel }}</span>
        <time v-if="saveStateKind === 'saved'" class="agent-editor__save-time">{{ savedAt }}</time>
        <span v-if="saveStateKind === 'saved'" :key="saveScanKey" class="agent-editor__save-scan" aria-hidden="true" />
      </p>
      <!-- 结果专用 live region:只播报保存结果,不把每次 dirty 变化都读出来。
           只在对话框打开时挂载,避免关闭状态给页面多加一个 status 地标。 -->
      <span v-if="open" class="agent-editor__visually-hidden" role="status" aria-live="polite" aria-atomic="true">{{ savedAnnouncement }}</span>
      <div class="agent-editor__buttons">
        <button type="button" class="dl-btn dl-btn--ghost" :disabled="busy" @click="finish('cancel')">{{ t.workspace.agentAdmin.cancel }}</button>
        <button
          type="button" class="dl-btn dl-btn--primary agent-editor__save-button"
          :aria-disabled="!canSubmit ? 'true' : undefined" :aria-busy="busy ? 'true' : undefined"
          :aria-describedby="isCreate ? undefined : saveStateId"
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
.model-subtabs__track button[data-locked='true'] .model-subtabs__count { border-color: var(--dl-border-base); color: var(--dl-text-disabled); }
.model-subtabs__count { min-inline-size: var(--dl-space-4); padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; line-height: var(--dl-line-tight); text-align: center; }
/* 来源分区:订阅与网关共用「标题 + 行列表」,不再把订阅裹进独立卡片。 */
.source-block { display: grid; gap: var(--dl-space-2); }
.source-block + .source-block { margin-block-start: var(--dl-space-4); }
.source-block__head { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-2); }
.source-block__head h3 { color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; }
.source-block__add { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-accent); font-size: var(--dl-font-size-xs); }
.source-block__add:hover { background: var(--dl-bg-hover); }
.source-list { display: grid; margin: 0; padding: 0; border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); list-style: none; }
.source-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--dl-space-2); padding: var(--dl-space-2) var(--dl-space-3); }
.source-row + .source-row { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.source-row:first-child { border-start-start-radius: calc(var(--dl-radius-lg) - var(--dl-border-width)); border-start-end-radius: calc(var(--dl-radius-lg) - var(--dl-border-width)); }
.source-row:last-child { border-end-start-radius: calc(var(--dl-radius-lg) - var(--dl-border-width)); border-end-end-radius: calc(var(--dl-radius-lg) - var(--dl-border-width)); }
.source-row[data-active='true'] { background: var(--dl-accent-soft); }
.source-row--gateway:hover, .source-row--gateway[data-active='true']:hover { background: var(--dl-bg-hover); }
.source-row--gateway[data-active='true']:hover { background: var(--dl-accent-soft); box-shadow: inset 0 0 0 var(--dl-border-width) var(--dl-border-strong); }
.source-row__main { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--dl-space-2); min-inline-size: 0; min-block-size: var(--dl-target-size); padding-block: var(--dl-space-1); text-align: left; }
.source-row__main--static { cursor: default; }
.source-row__radio { inline-size: var(--dl-space-2); block-size: var(--dl-space-2); flex: none; border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-pill); }
.source-row__radio[data-active='true'] { border-color: var(--dl-accent); background: var(--dl-accent); box-shadow: inset 0 0 0 var(--agent-row-gap) var(--dl-bg-elevated); }
.source-row__body { display: grid; gap: var(--agent-hairline); min-inline-size: 0; }
.source-row__title { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.source-row__badge { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-weight: 400; }
.source-row__meta { min-inline-size: 0; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: break-word; }
.source-row__meta--mono { overflow: hidden; font-family: var(--dl-font-mono); text-overflow: ellipsis; white-space: nowrap; }
.source-row__chevron { color: var(--dl-text-tertiary); }
.source-row__status { display: inline-flex; flex: none; align-items: center; min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-tight); white-space: nowrap; }
.source-row__status[data-tone='ok'] { border-color: color-mix(in srgb, var(--dl-success) 35%, transparent); color: var(--dl-success); }
.source-row__status[data-tone='warning'] { border-color: color-mix(in srgb, var(--dl-warning) 35%, transparent); color: var(--dl-warning); }
.source-row__login { min-block-size: var(--dl-target-size); }
.source-row__menu-wrap { position: relative; display: flex; align-items: center; }
.source-row__menu-trigger { display: inline-grid; place-items: center; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-lg); line-height: var(--dl-line-tight); }
.source-row__menu-trigger:hover, .source-row__menu-trigger[aria-expanded='true'] { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.source-menu { position: absolute; inset-block-start: calc(100% - var(--dl-space-1)); inset-inline-end: 0; z-index: var(--dl-z-overlay); display: grid; gap: var(--agent-hairline); min-inline-size: max-content; padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); }
.source-menu--above { inset-block-start: auto; inset-block-end: calc(100% - var(--dl-space-1)); }
.source-menu button { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border-radius: var(--dl-radius-sm); text-align: left; color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); white-space: nowrap; }
.source-menu button:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.source-menu button:disabled { background: transparent; color: var(--dl-text-disabled); }
.source-menu .source-menu__danger { color: var(--dl-error); }
.source-menu .source-menu__danger:hover:not(:disabled) { background: color-mix(in srgb, var(--dl-error) 14%, transparent); color: var(--dl-error); }
.source-menu__divider { block-size: var(--dl-border-width); margin-block: var(--dl-space-1); background: var(--dl-border-base); }
.source-menu__scrim { position: fixed; inset: 0; z-index: calc(var(--dl-z-overlay) - 1); }
.source-row__confirm { display: flex; grid-column: 1 / -1; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); padding-block-start: var(--dl-space-2); border-block-start: var(--dl-border-width) solid var(--dl-border-base); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.source-row__confirm button { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.source-row__confirm button:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.source-row__confirm .danger-confirm { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); background: var(--dl-error); color: var(--dl-text-on-accent); font-size: var(--dl-font-size-xs); }
.source-row__confirm .danger-confirm:hover:not(:disabled) { background: var(--dl-error); color: var(--dl-text-on-accent); }
.gateway-empty { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-4); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.gateway-empty__title { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.gateway-form { display: grid; gap: var(--dl-space-3); padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.gateway-form__back { justify-self: start; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.gateway-form__back:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.gateway-form h4 { color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; }
.gateway-form__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--dl-space-3); }
.gateway-form__mono { font-family: var(--dl-font-mono); }
.gateway-form__preview { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); overflow-wrap: anywhere; }
.gateway-form__preview code { color: var(--dl-text-secondary); font-family: var(--dl-font-mono); }
.gateway-form__key { display: flex; gap: var(--dl-space-1); min-inline-size: 0; }
.gateway-form__key .field__input { min-inline-size: 0; }
.gateway-form__reveal { flex: none; min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.gateway-form__reveal:hover { border-color: var(--dl-border-strong); background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.gateway-form__check { display: flex; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.gateway-form__models { min-block-size: calc(6 * var(--dl-space-6)); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); resize: vertical; }
.gateway-form__actions { display: flex; justify-content: flex-end; gap: var(--dl-space-2); }
.gateway-form__actions .dl-btn { min-block-size: var(--dl-target-size); }
.gateway-probe { padding: var(--dl-space-2); border-inline-start: var(--agent-row-gap) solid var(--dl-success); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.gateway-probe[data-ok='false'] { border-inline-start-color: var(--dl-error); color: var(--dl-error); }
.source-segment { display: flex; gap: var(--dl-space-1); padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); }
.source-segment button { flex: 1 1 0; min-inline-size: 0; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-1); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); white-space: nowrap; }
.source-segment button:hover:not([aria-pressed='true']) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.source-segment button[aria-pressed='true'] { background: var(--dl-accent-soft); color: var(--dl-text-primary); }
/* 窄对话框里四个二级 tab 放不下:改为横向滚动,避免标签越出自身按钮盒。 */
@media (max-width: 560px) {
  /* 窄屏靠选中底色与实心圆点表达当前来源,角标让位给标题与状态。 */
  .source-row__badge { display: none; }
  /* 四个二级 tab 排不下时改成两行两列,所有标签完整可见,不做隐藏滚动。 */
  .model-subtabs__track { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .gateway-form__grid { grid-template-columns: minmax(0, 1fr); }
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
.agent-editor__save-state { position: relative; display: inline-flex; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-space-6); margin-inline-end: auto; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.agent-editor__save-state[data-state='dirty'],
.agent-editor__save-state[data-state='saving'],
.agent-editor__save-state[data-state='saved'] { color: var(--dl-text-secondary); }
.agent-editor__save-state[data-state='incomplete'],
.agent-editor__save-state[data-state='blocked'] { color: var(--dl-warning); }
.agent-editor__save-state[data-state='error'] { color: var(--dl-error); }
.agent-editor__save-state .dl-icon { color: var(--dl-success); }
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
.agent-editor__buttons { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); margin-inline-start: auto; }
.agent-editor__visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) {
  .agent-editor__save-scan { animation: none; opacity: 0; }
}

/* 触屏 / 窄屏:模板卡与输入框仍保持 44 的可点高度(默认已是 44)。 */
@media (max-width: 560px) {
  .template-grid, .model-row { grid-template-columns: minmax(0, 1fr); }
  /* 回退链的控制钮换到第二行,保持 44×44 的独立触达尺寸。 */
  .fallback-row { grid-template-columns: auto minmax(0, 1fr); }
  .fallback-row__actions { grid-column: 2; justify-content: flex-end; }
  /* 矩阵在窄屏压成两行:标签与思考同排,模型占满下一行;两档矩阵共用。 */
  .model-matrix__head { display: none; }
  .model-matrix__row, .model-matrix--tiers .model-matrix__row { grid-template-columns: minmax(0, 1fr) var(--agent-matrix-control); gap: var(--dl-space-2); }
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
