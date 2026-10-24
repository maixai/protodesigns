// 唯一模型目录:设置按能力排序,会话菜单单独保留既有选项的顺序。
// 展示名是品牌专有名词,两种语言同值;窗口大小用于输入坞的上下文计算。
import type { Messages } from '../i18n'
import type { ModelSource, ModelSubscription, ModelSubscriptionProviderId } from '../contracts/generated/agent-model-config'

export type ModelTierId = 'fable' | 'opus' | 'sonnet' | 'haiku'
// 全局模型库里的渠道。名称是产品名,两种语言同值。
export type ModelProvider = 'Anthropic' | 'Bedrock' | 'Vertex' | 'OpenAI'
export const PROVIDER_ORDER: readonly ModelProvider[] = ['Anthropic', 'Bedrock', 'Vertex', 'OpenAI']
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
// ChatGPT 订阅提供的模型。演示用:思考强度按 Claude SDK 的 effort 语义不适用,故关闭。
const GPT_MODEL = { id: 'gpt-5.5', nameKey: 'gpt55', provider: 'OpenAI', contextWindowTokens: 400_000, descriptionKey: 'frontier', tier: 'opus', supportsEffort: false } satisfies ModelOption
const GPT_MINI_MODEL = { id: 'gpt-5.5-mini', nameKey: 'gpt55Mini', provider: 'OpenAI', contextWindowTokens: 400_000, descriptionKey: 'balanced', tier: 'haiku', supportsEffort: false } satisfies ModelOption

export const MODELS: readonly ModelOption[] = [FABLE_MODEL, OPUS_MODEL, SONNET_MODEL, SONNET_LONG_MODEL, HAIKU_MODEL, GPT_MODEL, GPT_MINI_MODEL]
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

// 订阅服务商与展示名。品牌名两种语言同值。
export const SUBSCRIPTION_PROVIDER_LABELS: Record<ModelSubscriptionProviderId, string> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
}

// 某个订阅能提供的模型:Claude 订阅给 Claude 目录,ChatGPT 订阅给 OpenAI 目录。
export function modelsForSubscription(provider: ModelSubscriptionProviderId): readonly ModelOption[] {
  return MODELS.filter((model) => provider === 'chatgpt'
    ? model.provider === 'OpenAI'
    : model.provider !== 'OpenAI')
}

export function activeSubscriptionOf(source: ModelSource): ModelSubscription | undefined {
  return source.subscriptions.find((item) => item.provider === source.activeSubscriptionProvider)
}

// 订阅可用:已连接、未过期;expiresAt 缺失或不可解析时不判过期。
export function subscriptionIsReady(subscription: ModelSubscription): boolean {
  if (!subscription.connected || subscription.status === 'expired') return false
  const expiresAt = Date.parse(subscription.expiresAt)
  return !Number.isFinite(expiresAt) || expiresAt > Date.now()
}

// ChatGPT 订阅的档位默认值:能力最强的模型承担前三档,快速档用 mini。
const CHATGPT_TIER_DEFAULTS: Record<ModelTierId, string> = {
  fable: GPT_MODEL.id,
  opus: GPT_MODEL.id,
  sonnet: GPT_MODEL.id,
  haiku: GPT_MINI_MODEL.id,
}

// 当前来源下,空串档位会解析到的内置模型。
export function tierDefaultsForSource(source: ModelSource): Record<ModelTierId, string> {
  if (source.kind === 'subscription' && source.activeSubscriptionProvider === 'chatgpt') {
    return CHATGPT_TIER_DEFAULTS
  }
  return TIER_DEFAULTS
}

// 新建 Agent 的默认来源:两个订阅各保留一份配置,默认启用 Claude;另预置两个 API Key 示例。
// 真实实现应由各服务商官方 CLI / SDK 的本地登录态与用户配置提供。
export function defaultModelSource(): ModelSource {
  return {
    kind: 'subscription',
    subscriptions: [
      {
        provider: 'claude', connected: true, account: 'linyizhou@example.com',
        plan: 'Claude Max', expiresAt: '2026-12-31T00:00:00Z', status: 'ok',
      },
      {
        provider: 'chatgpt', connected: false, account: '',
        plan: '', expiresAt: '', status: 'unchecked',
      },
    ],
    activeSubscriptionProvider: 'claude',
    gateways: [
      {
        id: 'gateway:litellm', name: '公司 LiteLLM', baseUrl: 'https://llm.corp.example.com',
        protocol: 'anthropic', authMode: 'bearer', apiKeyMasked: 'sk-••••••••7f3a', apiKeySet: true,
        discoverModels: true, models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
      },
      {
        id: 'gateway:openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1',
        protocol: 'openaiCompatible', authMode: 'bearer', apiKeyMasked: 'sk-or-••••••••a91c', apiKeySet: true,
        discoverModels: false, models: ['anthropic/claude-sonnet-5'],
      },
    ],
    activeGatewayId: 'gateway:litellm',
  }
}

// 添加回退模型时的推荐顺序:便宜 / 快在前,能力更强的在后;默认模型与已选模型会被跳过。
// 回退链本身不限制档位,用户仍可把任意模型放进任意位置。
export const FALLBACK_PRIORITY: readonly ModelOption[] = [SONNET_MODEL, HAIKU_MODEL, OPUS_MODEL, FABLE_MODEL, SONNET_LONG_MODEL]

// 未知 id(含空串)仍回落到全局默认;调用方先处理 Agent 继承语义。
export function modelById(id: string): ModelOption {
  return MODELS.find((model) => model.id === id) ?? DEFAULT_MODEL
}
