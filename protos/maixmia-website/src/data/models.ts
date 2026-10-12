// 可选模型目录:输入坞底行的「模型 ▾」下拉据此渲染,会话的模型选择据此解析。
//
// 依据:Claude 把模型选择器放进 composer 内右侧,并主张「模型与消耗必须在发送前可见」;
// ChatGPT 放在消息框内右下角 —— 本仓的底行右侧与之一致。目录只描述「有哪些模型、各自多大窗口」,
// 展示名与一句话说明走 i18n 词条(名称是品牌名,两种语言同值),故这里不 hardcode 展示文案。
import type { Messages } from '../i18n'

export interface ModelOption {
  id: string
  // 展示名的 i18n 键(modelNameKey);品牌名两种语言同值,但仍走词条以免散落。
  nameKey: keyof Messages['workspace']['models']
  // Context 窗口(两处口径须知:遥测只报「用了多少」,窗口大小由**本会话选中的模型**决定)。
  contextWindowTokens: number
  descriptionKey: keyof Messages['workspace']['modelDescriptions']
}

// 模型目录。名称沿用 mock 里已有的同一族模型名(Claude Sonnet 4.5 / Claude Opus 4.1),
// 不新造产品名;第三项是同一模型的长上下文配置(1M),它让「切换后 context 百分比按新窗口重算」
// 这条可被机械验证 —— 若全部模型都是 200K,切换模型就看不出窗口差异。
export const MODELS = [
  { id: 'claude-sonnet-4-5', nameKey: 'sonnet45', contextWindowTokens: 200_000, descriptionKey: 'balanced' },
  { id: 'claude-opus-4-1', nameKey: 'opus41', contextWindowTokens: 200_000, descriptionKey: 'deep' },
  { id: 'claude-sonnet-4-5-1m', nameKey: 'sonnet45_1m', contextWindowTokens: 1_000_000, descriptionKey: 'longContext' },
] as const satisfies readonly ModelOption[]

// 默认模型:每段对话的初始选择。用户在**本会话**内切换后只影响这一段(作用域 = 本会话)。
export const DEFAULT_MODEL: ModelOption = MODELS[0]

// 按 id 取模型;未知 id(含空串 —— 「本会话尚未选择」)回落到默认模型。
export function modelById(id: string): ModelOption {
  return MODELS.find((model) => model.id === id) ?? DEFAULT_MODEL
}
