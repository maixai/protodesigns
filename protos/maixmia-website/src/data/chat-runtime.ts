// 一段对话的**运行态**:它随「会话」存活,而不随「容器」存活 —— 把这段对话从条上拖出为
// 悬浮窗体、或停靠到别的区域,这些状态一个都不丢(草稿、转录、生成阶段、遥测、待确认、粘底)。
//
// 它是**视图状态**,不进契约;其字段引用的类型全部来自契约生成物(src/contracts/generated/)。
// 页面持有 `Record<sessionId, ChatRuntime>`;所有写入都走 withRuntime(不可变写回),
// 就地改字段会漏掉重渲染。
import type { AgentRuntime } from '../contracts/generated/agent-runtime'
import type { Attachment } from '../contracts/generated/attachment'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { TranscriptState } from '../contracts/generated/transcript-state'
import type { GenerationPhase } from '../components/transcript-view.vue'

export interface ChatRuntime {
  transcript: TranscriptState
  // 输入框的草稿。**每段对话各一份** —— 切走再切回、拆出成窗体,草稿都还在。
  draft: string
  // 本轮将要随消息发出的附件(文件 / 图片 / 粘贴文本)。与草稿同一分层:每段对话各一份,
  // 随会话存活;发送成功后清空。
  attachments: Attachment[]
  // 本段对话选中的模型 id(视图状态,不进契约)。**作用域 = 本会话**:切换只影响这段对话的
  // 后续轮次与它自己的 context 上限,不扰动其它对话。空串 = 尚未选择,由 models.modelById 回落默认。
  modelId: string
  generation: GenerationPhase
  // 正在流式输出的那条(与转录里那一条是同一个 id)。
  rendered: ChatMessage | null
  // 完整回答(重新生成时从它重放)。
  full: ChatMessage | null
  isSaving: boolean
  hasSendError: boolean
  // 「停止」在排队期间被按下 —— 回答到达后直接按「已停止」收尾,不进入流式。
  hasStopRequested: boolean
  // 转录是否粘底。它是**视图级**状态(与「滚动位置属于 editor instance 而非 document」同一分层),
  // 由 ChatSessionView 读写、存在这里,故拆出 / 停靠后阅读位置不丢。
  isPinned: boolean
  confirmation: ConfirmationRequest | null
  confirmationOutcome: 'allowed' | 'rejected' | null
  // 确认处理后 Agent 的后续消息(渲染在确认卡留痕之后)。
  followUp: ChatMessage | null
  telemetry: AgentRuntime | null
  // 搜索命中跳转后要高亮 / 滚到的轮次 id。
  highlightTurnId: string | null
}

// 一份初值(转录为 loading:新会话在取到转录前先渲染骨架屏)。
export function emptyRuntime(): ChatRuntime {
  return {
    transcript: { status: 'loading' },
    draft: '',
    attachments: [],
    // 空串 = 尚未选择:显示时由 modelById 回落默认模型;一旦用户在本会话内切换,即写死具体 id。
    modelId: '',
    generation: 'idle',
    rendered: null,
    full: null,
    isSaving: false,
    hasSendError: false,
    hasStopRequested: false,
    isPinned: true,
    confirmation: null,
    confirmationOutcome: null,
    followUp: null,
    telemetry: null,
    highlightTurnId: null,
  }
}

// 读一份运行态:**只读,不写入**。未知会话回落到一份空白运行态(渲染层因此不必处处判空)。
export function runtimeOf(map: Readonly<Record<string, ChatRuntime>>, sessionId: string): ChatRuntime {
  return map[sessionId] ?? emptyRuntime()
}

// 不可变写回某个会话的运行态(其余会话原样保留)。
export function withRuntime(map: Record<string, ChatRuntime>, sessionId: string, next: ChatRuntime): Record<string, ChatRuntime> {
  return { ...map, [sessionId]: next }
}
