// 唯一模型目录:设置按能力排序,会话菜单单独保留既有选项的顺序。
// 展示名是品牌专有名词,两种语言同值;窗口大小用于输入坞的上下文计算。
import type { Messages } from '../i18n'
import type { ModelGateway, ModelSource, ModelSubscription, ModelSubscriptionProviderId } from '../contracts/generated/agent-model-config'

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

export function subscriptionSourceId(id: string): string {
  return `subscription:${id}`
}

export function activeSubscriptionOf(source: ModelSource): ModelSubscription | undefined {
  return source.subscriptions.find((item) => subscriptionSourceId(item.id) === source.activeSourceId)
}

export function activeGatewayOf(source: ModelSource): ModelGateway | undefined {
  return source.gateways.find((item) => item.id === source.activeSourceId)
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
  return activeSubscriptionOf(source)?.provider === 'chatgpt' ? CHATGPT_TIER_DEFAULTS : TIER_DEFAULTS
}

// 预置多个订阅以演示额度耗尽后的手动切换;用量不影响配置与保存。
export function defaultModelSource(): ModelSource {
  return {
    subscriptions: [
      {
        id: 'claude-work', provider: 'claude', label: '工作', connected: true,
        account: 'yizhou.lin@studio.example.com', plan: 'Claude Max',
        expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), status: 'ok',
        usage: { state: 'exhausted', usedPercent: 100, resetsAt: new Date(Date.now() + 5 * 3_600_000).toISOString() },
        credentialRef: 'keychain://mia/subscriptions/claude-work',
      },
      {
        id: 'claude-personal', provider: 'claude', label: '个人', connected: true,
        account: 'yizhou.personal@example.com', plan: 'Claude Pro',
        expiresAt: new Date(Date.now() + 24 * 86_400_000).toISOString(), status: 'ok',
        usage: { state: 'ok', usedPercent: 18, resetsAt: new Date(Date.now() + 4 * 3_600_000).toISOString() },
        credentialRef: 'keychain://mia/subscriptions/claude-personal',
      },
      {
        id: 'chatgpt-personal', provider: 'chatgpt', label: '个人', connected: true,
        account: 'yizhou.openai@example.com', plan: 'ChatGPT Plus',
        expiresAt: new Date(Date.now() + 18 * 86_400_000).toISOString(), status: 'ok',
        usage: { state: 'ok', usedPercent: 35, resetsAt: new Date(Date.now() + 3 * 3_600_000).toISOString() },
        credentialRef: 'keychain://mia/subscriptions/chatgpt-personal',
      },
    ],
    gateways: [
      {
        id: 'gateway:litellm', name: '公司 LiteLLM', baseUrl: 'https://llm.corp.example.com/v1/messages',
        modelsUrl: '', apiKeyMasked: 'sk-••••••••7f3a', apiKeySet: true,
        models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
      },
      {
        id: 'gateway:openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        modelsUrl: '', apiKeyMasked: 'sk-or-••••••••a91c', apiKeySet: true,
        models: ['anthropic/claude-sonnet-5'],
      },
    ],
    activeSourceId: 'subscription:claude-work',
  }
}

// 添加回退模型时的推荐顺序:便宜 / 快在前,能力更强的在后;默认模型与已选模型会被跳过。
// 回退链本身不限制档位,用户仍可把任意模型放进任意位置。
export const FALLBACK_PRIORITY: readonly ModelOption[] = [SONNET_MODEL, HAIKU_MODEL, OPUS_MODEL, FABLE_MODEL, SONNET_LONG_MODEL]

// 未知 id(含空串)仍回落到全局默认;调用方先处理 Agent 继承语义。
export function modelById(id: string): ModelOption {
  return MODELS.find((model) => model.id === id) ?? DEFAULT_MODEL
}
