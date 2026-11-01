// 项目模型覆盖的单一解析层:窗体与保存 API 共用,确保候选、继承值与提交校验一致。
// 项目只引用 Agent 已配置的来源;这里不读取也不返回账户、凭据或来源名称快照。
import type { AgentModelConfig, ModelSource } from '../contracts/generated/agent-model-config'
import type { ProjectModelOverrides } from '../contracts/generated/project-model-settings'
import { EFFORT_LEVELS, MODELS, modelsForSubscription, subscriptionIsReady, subscriptionSourceId, tierDefaultsForSource } from './models'

export type ProjectSourceIssue = 'missing' | 'unavailable' | 'empty' | 'incompatible'
export type ProjectDefaultModelIssue = 'required' | 'unavailable'
export type ProjectEffortIssue = 'invalid' | 'unsupported'
export type ProjectFallbackIssue = 'invalid' | 'unavailable'

export interface ProjectSourceResolution {
  id: string
  modelIds: readonly string[]
  issue: ProjectSourceIssue | null
  incompatibleModelIds: readonly string[]
}

export interface ProjectModelValidation {
  source: ProjectSourceResolution
  modelId: string
  effortLevel: string
  fallbackModelIds: readonly string[]
  modelIssue: ProjectDefaultModelIssue | null
  effortIssue: ProjectEffortIssue | null
  fallbackIssue: ProjectFallbackIssue | null
  isValid: boolean
}

function subscriptionIsUsable(source: ModelSource, id: string): boolean {
  const subscription = source.subscriptions.find((item) => subscriptionSourceId(item.id) === id)
  return subscription !== undefined && subscriptionIsReady(subscription) && subscription.status !== 'error' && subscription.credentialRef !== ''
}

// 未知网关模型不猜测能力:只有目录明确声明支持 effort 的模型才允许项目提供非空 effort。
export function projectModelSupportsEffort(id: string): boolean {
  return MODELS.find((model) => model.id === id)?.supportsEffort ?? false
}

// 解析项目自定义模式的来源;跟随模式始终解析 Agent 当前来源。Agent 的档位与子 Agent 引用也必须能在
// 有效来源中解析,否则该来源不可作为项目来源,不能在启动时静默退回内置目录。
export function resolveProjectModelSource(overrides: ProjectModelOverrides, config: AgentModelConfig): ProjectSourceResolution {
  const id = overrides.followAgent === true ? config.source.activeSourceId : overrides.sourceId ?? config.source.activeSourceId
  const subscription = config.source.subscriptions.find((item) => subscriptionSourceId(item.id) === id)
  const gateway = config.source.gateways.find((item) => item.id === id)
  if (subscription === undefined && gateway === undefined) return { id, modelIds: [], issue: 'missing', incompatibleModelIds: [] }

  const isReady = subscription !== undefined
    ? subscriptionIsUsable(config.source, id)
    : gateway !== undefined && gateway.baseUrl.trim() !== '' && gateway.apiKeySet
  if (!isReady) return { id, modelIds: [], issue: 'unavailable', incompatibleModelIds: [] }

  const modelIds = subscription !== undefined
    ? modelsForSubscription(subscription.provider).map((model) => model.id)
    : gateway?.models ?? []
  if (modelIds.length === 0) return { id, modelIds, issue: 'empty', incompatibleModelIds: [] }

  const available = new Set(modelIds)
  const sourceAtSelection: ModelSource = { ...config.source, activeSourceId: id }
  const tierDefaults = tierDefaultsForSource(sourceAtSelection)
  const references = [
    config.subagentModelId,
    config.tiers.fable.modelId || tierDefaults.fable,
    config.tiers.opus.modelId || tierDefaults.opus,
    config.tiers.sonnet.modelId || tierDefaults.sonnet,
    config.tiers.haiku.modelId || tierDefaults.haiku,
  ].filter((modelId) => modelId !== '')
  const incompatibleModelIds = [...new Set(references.filter((modelId) => !available.has(modelId)))]
  return {
    id,
    modelIds,
    issue: incompatibleModelIds.length > 0 ? 'incompatible' : null,
    incompatibleModelIds,
  }
}

// 旧数据没有模式字段:存在任一覆盖键就按自定义解释,空对象才是跟随。
export function hasProjectModelCustomValues(overrides: ProjectModelOverrides): boolean {
  return Object.keys(overrides).some((key) => key !== 'followAgent')
}

// 自定义是整套显式配置。保留旧的部分覆盖,只给缺失键播种;Agent 没有对应的持续扩展思考字段,
// 因此该开关默认关闭,不从 maxThinkingTokens 猜测另一种思考机制的取值。
export function completeProjectModelOverrides(overrides: ProjectModelOverrides, config: AgentModelConfig): ProjectModelOverrides {
  return {
    followAgent: false,
    sourceId: overrides.sourceId ?? config.source.activeSourceId,
    modelId: overrides.modelId ?? config.defaultModelId,
    effortLevel: overrides.effortLevel ?? config.defaultEffortLevel,
    fallbackModelIds: [...(overrides.fallbackModelIds ?? config.fallbackModelIds)],
    autoCompactWindowTokens: overrides.autoCompactWindowTokens ?? config.autoCompactWindowTokens,
    alwaysThinkingEnabled: overrides.alwaysThinkingEnabled ?? false,
  }
}

export function validateProjectModelOverrides(overrides: ProjectModelOverrides, config: AgentModelConfig): ProjectModelValidation {
  // 跟随模式下保留值不生效,不能因旧自定义来源或模型已失效而阻止保存。
  if (overrides.followAgent === true) {
    return {
      source: resolveProjectModelSource({ followAgent: true }, config),
      modelId: config.defaultModelId,
      effortLevel: config.defaultEffortLevel,
      fallbackModelIds: config.fallbackModelIds,
      modelIssue: null,
      effortIssue: null,
      fallbackIssue: null,
      isValid: true,
    }
  }

  const source = resolveProjectModelSource(overrides, config)
  const modelId = overrides.modelId ?? config.defaultModelId
  const effortLevel = overrides.effortLevel ?? config.defaultEffortLevel
  const fallbackModelIds = overrides.fallbackModelIds ?? config.fallbackModelIds
  const available = new Set(source.modelIds)

  const modelIssue: ProjectDefaultModelIssue | null = modelId.trim() === ''
    ? 'required'
    : source.issue === null && !available.has(modelId) ? 'unavailable' : null
  const effortIssue: ProjectEffortIssue | null = effortLevel !== '' && !EFFORT_LEVELS.some((level) => level === effortLevel)
    ? 'invalid'
    : source.issue === null && effortLevel !== '' && !projectModelSupportsEffort(modelId) ? 'unsupported' : null
  const hasInvalidFallbackShape = fallbackModelIds.length > 3
    || new Set(fallbackModelIds).size !== fallbackModelIds.length
    || fallbackModelIds.includes(modelId)
  const fallbackIssue: ProjectFallbackIssue | null = hasInvalidFallbackShape
    ? 'invalid'
    : source.issue === null && fallbackModelIds.some((id) => !available.has(id)) ? 'unavailable' : null

  return {
    source,
    modelId,
    effortLevel,
    fallbackModelIds,
    modelIssue,
    effortIssue,
    fallbackIssue,
    isValid: source.issue === null && modelIssue === null && effortIssue === null && fallbackIssue === null,
  }
}
