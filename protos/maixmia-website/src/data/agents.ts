// Agent 可选的模型:模型名是产品专有名词,不随界面语言翻译。
// 契约里的 modelId 用它做取值集合的展示侧映射;未知 id 原样显示,避免静默吞掉配置。
export const AGENT_MODELS = [
  { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4', label: 'Claude Haiku 4' },
] as const

export const DEFAULT_AGENT_MODEL = 'claude-sonnet-4-5'

export function modelLabelOf(modelId: string): string {
  return AGENT_MODELS.find((model) => model.id === modelId)?.label ?? modelId
}
