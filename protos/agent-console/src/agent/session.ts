// 会话引擎:驱动一次"脚本化"的 agent 运行,产出转录流、状态行数据与会话四态。
//
// 设计要点:
//   - 所有内容都挂在 Vue 响应式容器上,组件只读渲染,不反向修改;
//   - 每轮生成持有一个 RunContext,Esc 中断时置 aborted 并立刻打断当前 await;
//   - 审批是一个真正阻塞的 await:未作出决定前,该轮后续内容一字节都不会产生。
import { computed, ref, type ComputedRef, type Ref } from 'vue'

import type {
  ApprovalDecision,
  ApprovalEntry,
  AssistantEntry,
  SessionMeta,
  SessionState,
  ThinkingEntry,
  ToolEntry,
  ToolName,
  TranscriptEntry,
  UserEntry,
} from '../api/agent.types'
import { delay } from '../mocks/delay'
import { estimateTokens, formatDuration, formatTokens } from './format'
import {
  APPROVAL_COMMAND,
  APPROVAL_PROMPT,
  CONNECT_ERROR_MESSAGE,
  EDIT_RESULT,
  EXAMPLE_PROMPTS,
  GREP_RESULT,
  MODEL_NAME,
  PUSH_RESULT,
  READ_RESULT,
  TEST_FAIL_RESULT,
  TEXT_AFTER_APPROVE,
  TEXT_AFTER_DENY,
  TEXT_AFTER_EDIT,
  TEXT_BEFORE_APPROVAL,
  THEME_DIFF,
  THINKING_STEPS,
  WORKING_DIR,
} from './script'

// 中断信号:每轮生成私有;Esc 中断时抛出,终止该轮后续所有节拍。
class AbortedError extends Error {
  constructor() {
    super('generation aborted')
    this.name = 'AbortedError'
  }
}

// 一轮生成的上下文。
interface RunContext {
  // 是否已被中断。
  aborted: boolean
  // 审批等待的解决函数;interrupt 时以 null 唤醒,表示"被中断"而非作出决定。
  resolveApproval: ((decision: ApprovalDecision | null) => void) | null
  // 本轮开始时间,用于状态行耗时。
  startedAt: number
  // 进行中的延时拒绝函数,让 Esc 能立刻打断长延时,而不是等延时自然结束。
  rejectSleep: (() => void) | null
}

// 单次工具调用的脚本参数。
interface ToolSpec {
  name: ToolName
  argSummary: string
  args: string
  result?: string
  diff?: ToolEntry['diff']
  exitCode?: number
  fail?: boolean
}

// 会话对外暴露的接口:状态 + 动作。
export interface AgentSessionApi {
  readonly entries: Ref<TranscriptEntry[]>
  readonly meta: Ref<SessionMeta>
  readonly state: Ref<SessionState>
  readonly isGenerating: Ref<boolean>
  readonly pendingApproval: ComputedRef<ApprovalEntry | null>
  readonly hasConversation: ComputedRef<boolean>
  readonly inputTokensText: ComputedRef<string>
  readonly outputTokensText: ComputedRef<string>
  readonly elapsedText: ComputedRef<string>
  readonly examplePrompts: readonly string[]
  // 每次内容变化自增,供视图做"滚到底部"。
  readonly revision: Ref<number>
  send(text: string): void
  resolveApproval(decision: ApprovalDecision): void
  interrupt(): void
  retry(): void
  reset(): void
  simulateDisconnect(): void
}

// 流式吐字的节拍:每 40ms 吐 1–3 个字符。
const STREAM_TICK_MS = 40
const STREAM_MIN_CHARS = 1
const STREAM_MAX_CHARS = 3
// 各节拍的时长(毫秒):数值经过压缩,让一次完整会话在十秒内跑完。
const THINK_STEP_MS = 320
const TOOL_FAST_MS = 560
const TOOL_SLOW_MS = 900
const CONNECT_MS = 700
const DISCONNECT_MS = 600

export function useAgentSession(): AgentSessionApi {
  const entries = ref<TranscriptEntry[]>([])
  const meta = ref<SessionMeta>({
    modelName: MODEL_NAME,
    cwd: WORKING_DIR,
    inputTokens: 0,
    outputTokens: 0,
    elapsedMs: 0,
  })
  const state = ref<SessionState>({ status: 'connecting', errorMessage: null })
  const isGenerating = ref(false)
  const revision = ref(0)

  let ctx: RunContext | null = null
  let tickerId: number | null = null
  let toolSeq = 0

  // 通知视图内容已变化(驱动重渲染与滚动)。
  function touch(): void {
    revision.value += 1
  }

  // 追加一条条目,返回它在响应式数组里的代理(后续就地修改才会触发更新)。
  function pushEntry(entry: TranscriptEntry): TranscriptEntry {
    entries.value.push(entry)
    const live = entries.value[entries.value.length - 1]
    if (live === undefined) {
      throw new Error('appendEntry: 转录流追加失败')
    }
    return live
  }

  function pushUser(text: string): UserEntry {
    const live = pushEntry({ kind: 'user', text })
    if (live.kind !== 'user') {
      throw new Error('appendEntry: 期望 user 条目')
    }
    return live
  }

  function pushAssistant(text: string, streaming: boolean): AssistantEntry {
    const live = pushEntry({ kind: 'assistant', text, streaming, interrupted: false })
    if (live.kind !== 'assistant') {
      throw new Error('appendEntry: 期望 assistant 条目')
    }
    return live
  }

  function pushThinking(): ThinkingEntry {
    const live = pushEntry({
      kind: 'thinking',
      steps: [],
      durationMs: 0,
      completedSteps: 0,
      streaming: true,
    })
    if (live.kind !== 'thinking') {
      throw new Error('appendEntry: 期望 thinking 条目')
    }
    return live
  }

  function pushTool(spec: ToolSpec): ToolEntry {
    toolSeq += 1
    const live = pushEntry({
      kind: 'tool',
      id: `tool-${toolSeq}`,
      name: spec.name,
      argSummary: spec.argSummary,
      args: spec.args,
      status: 'running',
      result: null,
      diff: null,
      exitCode: null,
    })
    if (live.kind !== 'tool') {
      throw new Error('appendEntry: 期望 tool 条目')
    }
    return live
  }

  function pushApproval(command: string, prompt: string): ApprovalEntry {
    const live = pushEntry({ kind: 'approval', command, prompt, decision: null })
    if (live.kind !== 'approval') {
      throw new Error('appendEntry: 期望 approval 条目')
    }
    return live
  }

  // 可被 Esc 打断的延时。
  function nap(current: RunContext, ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (current.aborted) {
        reject(new AbortedError())
        return
      }
      const timer = window.setTimeout(() => {
        current.rejectSleep = null
        if (current.aborted) {
          reject(new AbortedError())
        } else {
          resolve()
        }
      }, ms)
      current.rejectSleep = () => {
        window.clearTimeout(timer)
        reject(new AbortedError())
      }
    })
  }

  // 逐字流式吐出一段 agent 文本。
  async function playAssistant(current: RunContext, text: string): Promise<void> {
    const entry = pushAssistant('', true)
    touch()
    let index = 0
    while (index < text.length) {
      const size =
        STREAM_MIN_CHARS + Math.floor(Math.random() * (STREAM_MAX_CHARS - STREAM_MIN_CHARS + 1))
      const chunk = text.slice(index, index + size)
      entry.text += chunk
      index += size
      meta.value.outputTokens += estimateTokens(chunk)
      touch()
      await nap(current, STREAM_TICK_MS)
    }
    entry.streaming = false
    touch()
  }

  // 思考过程:逐条吐出编号步骤,结束后写入真实耗时。
  async function playThinking(current: RunContext): Promise<void> {
    const entry = pushThinking()
    touch()
    const startedAt = performance.now()
    for (const step of THINKING_STEPS) {
      await nap(current, THINK_STEP_MS)
      entry.steps.push(step)
      entry.completedSteps = entry.steps.length
      touch()
    }
    entry.streaming = false
    entry.durationMs = Math.round(performance.now() - startedAt)
    touch()
  }

  // 一次工具调用:先以"运行中"出现,延时后落到成功 / 失败并写入结果。
  async function playTool(current: RunContext, spec: ToolSpec): Promise<ToolEntry> {
    const entry = pushTool(spec)
    touch()
    await nap(current, spec.fail === true ? TOOL_SLOW_MS : TOOL_FAST_MS)
    entry.status = spec.fail === true ? 'failure' : 'success'
    entry.result = spec.result ?? null
    entry.diff = spec.diff ?? null
    entry.exitCode = spec.exitCode ?? null
    meta.value.outputTokens += estimateTokens(spec.argSummary)
    if (spec.result !== undefined) {
      meta.value.outputTokens += estimateTokens(spec.result)
    }
    touch()
    return entry
  }

  // 内联审批:真正阻塞,直到用户按 y / n 或被 Esc 中断。
  async function playApproval(
    current: RunContext,
    command: string,
    prompt: string,
  ): Promise<ApprovalDecision> {
    const entry = pushApproval(command, prompt)
    touch()
    // 等待用户决定期间暂停计时:人工思考时间不该算进本轮耗时。
    const pausedAt = performance.now()
    stopTicker()
    const decision = await new Promise<ApprovalDecision | null>((resolve) => {
      current.resolveApproval = resolve
    })
    // 恢复计时:把等待时长补偿进起点,让 elapsed 保持连续。
    current.startedAt += performance.now() - pausedAt
    startTicker(current)
    current.resolveApproval = null
    if (decision === null) {
      throw new AbortedError()
    }
    entry.decision = decision
    touch()
    return decision
  }

  // 脚本主体:一次完整的 agent 运行。
  async function runScript(current: RunContext, prompt: string): Promise<void> {
    pushUser(prompt)
    meta.value.inputTokens += estimateTokens(prompt)
    touch()

    await playThinking(current)

    await playTool(current, {
      name: 'Read',
      argSummary: 'src/theme.ts',
      args: 'src/theme.ts',
      result: READ_RESULT,
    })
    await playTool(current, {
      name: 'Grep',
      argSummary: '"accent" src/',
      args: 'pattern: "accent"\npath: src/',
      result: GREP_RESULT,
    })
    await playTool(current, {
      name: 'Edit',
      argSummary: 'src/theme.ts',
      args: 'src/theme.ts',
      result: EDIT_RESULT,
      diff: THEME_DIFF,
    })

    await playAssistant(current, TEXT_AFTER_EDIT)

    // 一次失败的调用:测试非零退出(与本次改动无关的既有差异)。
    await playTool(current, {
      name: 'Bash',
      argSummary: 'pnpm test',
      args: 'pnpm test',
      result: TEST_FAIL_RESULT,
      exitCode: 1,
      fail: true,
    })

    await playAssistant(current, TEXT_BEFORE_APPROVAL)

    // 危险操作前阻塞,等待用户确认。
    const decision = await playApproval(current, APPROVAL_COMMAND, APPROVAL_PROMPT)
    pushUser(decision === 'approved' ? 'y' : 'n')
    touch()

    if (decision === 'approved') {
      await playTool(current, {
        name: 'Bash',
        argSummary: 'git push origin main',
        args: 'git push origin main',
        result: PUSH_RESULT,
      })
      await playAssistant(current, TEXT_AFTER_APPROVE)
    } else {
      await playAssistant(current, TEXT_AFTER_DENY)
    }
  }

  // 中断收尾:保留已生成内容,标记被中断的条目,解除悬空的审批。
  function markInterrupted(): void {
    for (const entry of entries.value) {
      if (entry.kind === 'assistant' && entry.streaming) {
        entry.streaming = false
        entry.interrupted = true
      }
      if (entry.kind === 'thinking' && entry.streaming) {
        entry.streaming = false
      }
      if (entry.kind === 'approval' && entry.decision === null) {
        entry.decision = 'denied'
      }
      if (entry.kind === 'tool' && entry.status === 'running') {
        entry.status = 'failure'
        entry.result = '已中断'
        entry.exitCode = entry.exitCode ?? null
      }
    }
    touch()
  }

  function startTicker(current: RunContext): void {
    stopTicker()
    tickerId = window.setInterval(() => {
      meta.value.elapsedMs = Math.round(performance.now() - current.startedAt)
    }, 100)
  }

  function stopTicker(): void {
    if (tickerId !== null) {
      window.clearInterval(tickerId)
      tickerId = null
    }
  }

  async function startRun(prompt: string): Promise<void> {
    const current: RunContext = {
      aborted: false,
      resolveApproval: null,
      startedAt: performance.now(),
      rejectSleep: null,
    }
    ctx = current
    isGenerating.value = true
    meta.value.elapsedMs = 0
    startTicker(current)
    try {
      await runScript(current, prompt)
    } catch (error) {
      if (!(error instanceof AbortedError)) {
        if (error instanceof Error) {
          console.error('agent run failed:', error.message)
        } else {
          console.error('agent run failed: unknown error')
        }
      }
    } finally {
      if (current.aborted) {
        markInterrupted()
      }
      isGenerating.value = false
      stopTicker()
      meta.value.elapsedMs = Math.round(performance.now() - current.startedAt)
      if (ctx === current) {
        ctx = null
      }
    }
  }

  async function connect(): Promise<void> {
    state.value = { status: 'connecting', errorMessage: null }
    await delay(CONNECT_MS)
    state.value = { status: 'ready', errorMessage: null }
  }

  const pendingApproval = computed<ApprovalEntry | null>(() => {
    for (const entry of entries.value) {
      if (entry.kind === 'approval' && entry.decision === null) {
        return entry
      }
    }
    return null
  })

  const hasConversation = computed<boolean>(() => entries.value.length > 0)
  const inputTokensText = computed<string>(() => formatTokens(meta.value.inputTokens))
  const outputTokensText = computed<string>(() => formatTokens(meta.value.outputTokens))
  const elapsedText = computed<string>(() => formatDuration(meta.value.elapsedMs))

  function send(text: string): void {
    const trimmed = text.trim()
    if (trimmed.length === 0 || isGenerating.value || state.value.status !== 'ready') {
      return
    }
    void startRun(trimmed)
  }

  function resolveApproval(decision: ApprovalDecision): void {
    const current = ctx
    if (current?.resolveApproval !== null && current?.resolveApproval !== undefined) {
      current.resolveApproval(decision)
    }
  }

  function interrupt(): void {
    const current = ctx
    if (current === null || current.aborted) {
      return
    }
    current.aborted = true
    current.rejectSleep?.()
    current.resolveApproval?.(null)
  }

  function retry(): void {
    void connect()
  }

  function reset(): void {
    interrupt()
    entries.value = []
    toolSeq = 0
    meta.value = {
      modelName: MODEL_NAME,
      cwd: WORKING_DIR,
      inputTokens: 0,
      outputTokens: 0,
      elapsedMs: 0,
    }
    state.value = { status: 'ready', errorMessage: null }
    touch()
  }

  function simulateDisconnect(): void {
    interrupt()
    state.value = { status: 'connecting', errorMessage: null }
    window.setTimeout(() => {
      state.value = { status: 'error', errorMessage: CONNECT_ERROR_MESSAGE }
    }, DISCONNECT_MS)
  }

  // 首次进入:模拟一次连接握手。
  void connect()

  return {
    entries,
    meta,
    state,
    isGenerating,
    pendingApproval,
    hasConversation,
    inputTokensText,
    outputTokensText,
    elapsedText,
    examplePrompts: EXAMPLE_PROMPTS,
    revision,
    send,
    resolveApproval,
    interrupt,
    retry,
    reset,
    simulateDisconnect,
  }
}
