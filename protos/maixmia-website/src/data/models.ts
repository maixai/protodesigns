// 唯一模型目录:设置按能力排序,会话菜单单独保留既有选项的顺序。
// 展示名是品牌专有名词,两种语言同值;窗口大小用于输入坞的上下文计算。
import type { Messages } from '../i18n'

export type ModelTierId = 'fable' | 'opus' | 'sonnet' | 'haiku'
// 全局模型库里的渠道。名称是产品名,两种语言同值。
export type ModelProvider = 'Anthropic' | 'Bedrock' | 'Vertex'
export const PROVIDER_ORDER: readonly ModelProvider[] = ['Anthropic', 'Bedrock', 'Vertex']
// SDK 的 effort 取值;空串不在其中,表示「不写 effort」。
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']

export interface ModelOption {
  id: string
  nameKey: keyof Messages['workspace']['models']
  provider: ModelProvider
  contextWindowTokens: number
  descriptionKey: keyof Messages['workspace']['modelDescriptions']
  tier: ModelTierId
  // 该模型是否接受 SDK 的 effort 参数;不支持时 UI 禁用思考列。
  supportsEffort: boolean
}

export interface ModelGroup {
  provider: ModelProvider
  models: readonly ModelOption[]
}

const FABLE_MODEL = { id: 'claude-fable-5-1', nameKey: 'fable51', provider: 'Anthropic', contextWindowTokens: 200_000, descriptionKey: 'frontier', tier: 'fable', supportsEffort: true } satisfies ModelOption
const OPUS_MODEL = { id: 'claude-opus-5-5', nameKey: 'opus55', provider: 'Bedrock', contextWindowTokens: 200_000, descriptionKey: 'deep', tier: 'opus', supportsEffort: true } satisfies ModelOption
const SONNET_MODEL = { id: 'claude-sonnet-5-5', nameKey: 'sonnet55', provider: 'Anthropic', contextWindowTokens: 200_000, descriptionKey: 'balanced', tier: 'sonnet', supportsEffort: true } satisfies ModelOption
const SONNET_LONG_MODEL = { id: 'claude-sonnet-5-5-1m', nameKey: 'sonnet55_1m', provider: 'Vertex', contextWindowTokens: 1_000_000, descriptionKey: 'longContext', tier: 'sonnet', supportsEffort: true } satisfies ModelOption
const HAIKU_MODEL = { id: 'claude-haiku-5-5', nameKey: 'haiku55', provider: 'Bedrock', contextWindowTokens: 200_000, descriptionKey: 'fast', tier: 'haiku', supportsEffort: true } satisfies ModelOption

export const MODELS: readonly ModelOption[] = [FABLE_MODEL, OPUS_MODEL, SONNET_MODEL, SONNET_LONG_MODEL, HAIKU_MODEL]
export const SESSION_MODELS: readonly ModelOption[] = [SONNET_MODEL, OPUS_MODEL, SONNET_LONG_MODEL, HAIKU_MODEL, FABLE_MODEL]
export const DEFAULT_MODEL: ModelOption = SONNET_MODEL

// 按渠道分组,用于 select 的 optgroup:全局模型库先按渠道组织,再看具体模型。
export function groupModelsByProvider(models: readonly ModelOption[]): ModelGroup[] {
  return PROVIDER_ORDER
    .map((provider) => ({ provider, models: models.filter((model) => model.provider === provider) }))
    .filter((group) => group.models.length > 0)
}

export const TIER_DEFAULTS: Record<ModelTierId, string> = {
  fable: FABLE_MODEL.id,
  opus: OPUS_MODEL.id,
  sonnet: SONNET_MODEL.id,
  haiku: HAIKU_MODEL.id,
}

// 添加回退模型时的推荐顺序:便宜 / 快在前,能力更强的在后;默认模型与已选模型会被跳过。
// 回退链本身不限制档位,用户仍可把任意模型放进任意位置。
export const FALLBACK_PRIORITY: readonly ModelOption[] = [SONNET_MODEL, HAIKU_MODEL, OPUS_MODEL, FABLE_MODEL, SONNET_LONG_MODEL]

// 未知 id(含空串)仍回落到全局默认;调用方先处理 Agent 继承语义。
export function modelById(id: string): ModelOption {
  return MODELS.find((model) => model.id === id) ?? DEFAULT_MODEL
}
