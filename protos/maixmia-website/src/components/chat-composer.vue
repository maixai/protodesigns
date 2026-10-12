<script setup lang="ts">
// 对话输入坞:某一段对话的输入框 + 停止钮 + 错误行 + 遥测条 + 「回到底部」。
//
// 它**属于对话窗体本身**(不再属于某个区域),故随窗体走:一段对话被拆出成悬浮窗体、
// 或停靠回条上,输入坞都在它旁边,草稿也一直跟着(runtime.draft 是唯一事实源)。
//
// 文本以 runtime.draft 为单一事实源(v-model 回写外层),不依赖 DOM 存活 —— IME 组字期间
// 输入事件会被 inputKeyboard 里的 isComposing 排除,组合结束才提交。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ChatRuntime } from '../data/chat-runtime'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  sessionId: string
  // 会话标题:输入框的可访问名据此生成(读屏要能分辨「在给哪段对话打字」)。
  title: string
  runtime: ChatRuntime
  // 生成 / 保存中(输入框只读,不给改草稿的错觉)。
  disabled: boolean
  canSend: boolean
  isGenerating: boolean
  // 是否承担全页唯一的**状态播报**(见 workspace-page 的 liveSlot 判据):多对话视图并存时
  // 只有 live 那一个的遥测状态项是 live region,避免多个 polite 区域互相打断。
  isLive: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
  'update:draft': [value: string]
  'back-to-bottom': []
}>()

const { t } = useI18n()

// 输入框的 id / name **按会话唯一** —— 同一 id 不得在 DOM 里出现两次(多区域 / 多窗体同屏时)。
const composerId = computed(() => `workspace-composer-${props.sessionId}`)
// 带会话名的可访问名;无标题(理论上不出现 —— 新会话也有「新建对话」标题)时回落到通用名。
const ariaLabel = computed(() => (props.title === '' ? t.value.workspace.inputLabel : t.value.workspace.inputLabelOf.replace('{name}', props.title)))
const isReadOnly = computed(() => props.disabled || props.runtime.transcript.status === 'loading' || props.runtime.transcript.status === 'error')
// 「回到底部」只在「转录已就绪且用户已上滚」时出现(空 / 加载 / 错误态没有「底部」可言)。
const showBackToBottom = computed(() => !props.runtime.isPinned && props.runtime.transcript.status === 'ready')

function onInput(event: Event): void {
  const target = event.target
  if (target instanceof HTMLTextAreaElement) emit('update:draft', target.value)
}

// Enter 发送、Shift+Enter 换行;组字中(IME)不发送。
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  if (props.canSend) emit('send', props.runtime.draft)
}

function submit(): void {
  if (props.canSend) emit('send', props.runtime.draft)
}

// ---- 遥测条 ----
// 状态词:客户端实时生成状态优先(排队→思考中、流式→输出中、停止 / 完成),空闲时回落取
// AgentRuntime.status(含等待确认);确认处理后的去向由 confirmationOutcome 派生。
type TelemetryStatus = 'idle' | 'thinking' | 'streaming' | 'waiting' | 'stopped' | 'complete'

const resolutionStatus = computed<'streaming' | 'idle' | null>(() => {
  if (props.runtime.confirmationOutcome === 'allowed') return 'streaming'
  if (props.runtime.confirmationOutcome === 'rejected') return 'idle'
  return null
})
const statusKind = computed<TelemetryStatus>(() => {
  const phase = props.runtime.generation
  if (phase === 'queued') return 'thinking'
  if (phase === 'streaming') return 'streaming'
  if (phase === 'stopped') return 'stopped'
  if (phase === 'complete') return 'complete'
  if (resolutionStatus.value !== null) return resolutionStatus.value
  return props.runtime.telemetry?.status ?? 'idle'
})
const statusWord = computed(() => t.value.workspace.statusWords[statusKind.value])
// 状态圆点:强调色只承担「活动指示」—— 思考中 / 输出中走强调色,等待确认走警告色,其余中性。
const statusLevel = computed<'accent' | 'warning' | 'neutral'>(() => {
  if (statusKind.value === 'thinking' || statusKind.value === 'streaming') return 'accent'
  if (statusKind.value === 'waiting') return 'warning'
  return 'neutral'
})
// 状态项恒为「状态词 · 具体动作」两段式:客户端状态用本地动作词,等待 / 空闲取 AgentRuntime.statusDetail。
const statusDetail = computed(() => {
  const phase = props.runtime.generation
  if (phase === 'queued') return t.value.workspace.statusActions.queued
  if (phase === 'streaming') return t.value.workspace.statusActions.streaming
  if (phase === 'stopped') return t.value.workspace.statusActions.stopped
  if (phase === 'complete') return t.value.workspace.statusActions.complete
  if (resolutionStatus.value === 'streaming') return t.value.workspace.statusActions.streaming
  if (resolutionStatus.value === 'idle') return t.value.workspace.statusActions.idle
  const current = props.runtime.telemetry
  if (current === null) return ''
  const details: Record<string, string> = t.value.workspace.statusDetails
  return details[current.statusDetail] ?? current.statusDetail
})
// Context 用量:百分比 + 分数;分级配色 <75% info、75–89% warning、≥90% error(状态色表达结果)。
const contextPercent = computed(() => {
  const current = props.runtime.telemetry
  if (current === null || current.contextWindowTokens <= 0) return 0
  return Math.round((current.contextUsedTokens / current.contextWindowTokens) * 100)
})
const contextLevel = computed<'info' | 'warning' | 'error'>(() => {
  if (contextPercent.value >= 90) return 'error'
  if (contextPercent.value >= 75) return 'warning'
  return 'info'
})
const contextText = computed(() => {
  const current = props.runtime.telemetry
  if (current === null) return ''
  return `${contextPercent.value}% (${formatTokenCount(current.contextUsedTokens)}/${formatTokenCount(current.contextWindowTokens)})`
})

// token 计数的千位取整:82000 → 82K。
function formatTokenCount(value: number): string {
  return `${Math.round(value / 1000)}K`
}

// ---- 时长秒表 ----
// 由遥测给出的起算秒本地走秒(它只在有遥测时显示)。组件卸载时清理。
const elapsed = ref(0)
let clock: ReturnType<typeof setInterval> | undefined

watch(() => props.runtime.telemetry, (current) => {
  clearInterval(clock)
  clock = undefined
  if (current === null) return
  elapsed.value = current.elapsedSeconds
  clock = setInterval(() => { elapsed.value += 1 }, 1000)
}, { immediate: true })

onBeforeUnmount(() => { clearInterval(clock) })

// 时长格式 m:ss(语言中立、数值等宽),不显示毫秒。
function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
  <div class="composer-dock">
    <!-- 「回到底部」= 悬浮图标按钮:绝对定位、水平居中于阅读列,浮在坞顶**之上**(不覆盖坞)。
         进 / 出只用 opacity + transform(动效白名单);它是独立控件,守 44×44。 -->
    <Transition name="scroll-to-bottom-pop">
      <button
        v-if="showBackToBottom"
        type="button" class="scroll-to-bottom" :aria-label="t.workspace.backToBottom" @click="emit('back-to-bottom')"
      >
        <DliIcon name="arrowDown" />
      </button>
    </Transition>
    <!-- 输入框:坞内的**流内**首位元素(发送由 Enter 承担,生成中的「停止」仍在框内)。 -->
    <form class="composer-form" :title="t.workspace.inputHint" @submit.prevent="submit">
      <div class="textarea-sizer" :data-value="(runtime.draft || t.workspace.placeholder) + ' '">
        <textarea
          :id="composerId" :name="composerId" class="composer-textarea" :value="runtime.draft" rows="1"
          :aria-label="ariaLabel" :placeholder="t.workspace.placeholder" :readonly="isReadOnly"
          @input="onInput" @keydown="onKeydown"
        />
      </div>
      <button v-if="isGenerating" class="workspace-button send-button stop-button" type="button" :aria-label="t.workspace.stop" @click="emit('stop')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" /></svg></button>
    </form>
    <!-- 流内区域(遥测条):留在文档流内、直接在面板底色上,几何不随输入高度变化。 -->
    <div class="composer-inner">
      <p v-if="runtime.hasSendError" class="send-error" role="alert">{{ t.workspace.sendError }}</p>
      <!-- 遥测条:只有状态项是 live region(状态 / 具体动作变化时播报);其余部分不做 live,避免整条太吵。 -->
      <div class="telemetry" role="group" :aria-label="t.workspace.telemetry.label">
        <div class="telemetry__status" :role="isLive ? 'status' : undefined" :aria-live="isLive ? 'polite' : undefined">
          <span class="telemetry__status-head">
            <span class="telemetry__dot" :data-level="statusLevel" aria-hidden="true" />
            <span class="telemetry__word">{{ statusWord }}</span>
          </span>
          <span v-if="statusDetail" class="telemetry__detail" :title="statusDetail">· {{ statusDetail }}</span>
        </div>
        <span v-if="runtime.telemetry" class="telemetry__item telemetry__item--model"><span class="telemetry__sep" aria-hidden="true">│</span><span class="telemetry__model">{{ runtime.telemetry.modelName }}</span></span>
        <span v-if="runtime.telemetry" class="telemetry__item telemetry__item--context">
          <span class="telemetry__sep" aria-hidden="true">│</span>
          <span class="telemetry__context-text">{{ contextText }}</span>
          <span class="telemetry__meter" role="progressbar" :aria-label="t.workspace.telemetry.context" :aria-valuenow="contextPercent" aria-valuemin="0" aria-valuemax="100"><span class="telemetry__meter-fill" :data-level="contextLevel" :style="{ width: `${contextPercent}%` }" /></span>
        </span>
        <span v-if="runtime.telemetry" class="telemetry__item telemetry__item--elapsed"><span class="telemetry__sep" aria-hidden="true">│</span><span class="telemetry__elapsed">{{ formatElapsed(elapsed) }}</span></span>
        <span v-if="runtime.telemetry" class="telemetry__item telemetry__item--workspace" :title="runtime.telemetry.projectPath"><span class="telemetry__sep" aria-hidden="true">│</span><span class="telemetry__ws-name">{{ runtime.telemetry.projectName }}</span></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 坞没有独立的面(与转录区同色,继承面板底色);横向内缩统一由本容器给出,坞内的输入框与
   遥测条因此共用同一条阅读列。它是面板 / 窗体里的**流内**元素,不设 z-index(属应用外壳那一层,
   悬浮的文件窗体可以盖住它 —— 用户要的「输入框与整个对话框做在一起,能被文件窗体覆盖」)。 */
.composer-dock { position: relative; flex-shrink: 0; padding-inline: var(--dl-space-6); }
/* 坞内的流内区块(遥测条所在):限宽居中,与输入框同一条阅读列;底部留一档内边距。 */
.composer-inner { max-width: var(--workspace-column-max); margin-inline: auto; padding-block-end: var(--dl-space-4); }
/* 遥测条:输入框下方的单行运行时信息(状态 · 模型 · Context · 时长 · 项目)。降级按遥测条
   **自身可用宽度**(容器查询)决定,而非视口宽度 —— 它住在阅读列内,宽视口也装不下五项。 */
.telemetry { display: flex; align-items: center; gap: var(--dl-space-2); min-height: var(--dl-space-8); margin-top: var(--dl-space-2); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); color: var(--dl-text-secondary); overflow: hidden; container-type: inline-size; }
.telemetry__status { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: var(--dl-space-2); flex: 0 1000 auto; min-width: min-content; }
.telemetry__status-head { display: inline-flex; align-items: center; gap: var(--dl-space-2); white-space: nowrap; }
.telemetry__dot { flex-shrink: 0; width: var(--dl-space-2); height: var(--dl-space-2); border-radius: var(--dl-radius-pill); background: var(--dl-text-tertiary); }
.telemetry__dot[data-level='accent'] { background: var(--dl-accent); }
.telemetry__dot[data-level='warning'] { background: var(--dl-warning); }
.telemetry__word { flex-shrink: 0; color: var(--dl-text-primary); font-weight: 500; }
.telemetry__detail { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.telemetry__item { display: inline-flex; align-items: center; gap: var(--dl-space-2); flex-shrink: 0; white-space: nowrap; }
.telemetry__sep { color: var(--dl-text-disabled); }
.telemetry__context-text, .telemetry__elapsed { font-variant-numeric: tabular-nums; }
.telemetry__meter { display: inline-block; width: var(--dl-space-12); height: var(--dl-space-1); border-radius: var(--dl-radius-pill); background: var(--dl-bg-sunken); overflow: hidden; }
.telemetry__meter-fill { display: block; height: 100%; border-radius: var(--dl-radius-pill); background: var(--dl-info); }
.telemetry__meter-fill[data-level='warning'] { background: var(--dl-warning); }
.telemetry__meter-fill[data-level='error'] { background: var(--dl-error); }
.telemetry__item--workspace { flex: 0 1 auto; min-width: 0; }
.telemetry__ws-name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* 降级按遥测条自身宽度(容器查询),逐项降低优先级;状态项与 Context 在任何宽度都不隐藏。 */
@container (max-width: 611px) { .telemetry__meter { display: none; } }
@container (max-width: 555px) { .telemetry__item--elapsed { display: none; } }
@container (max-width: 486px) { .telemetry__item--model { display: none; } }
@container (max-width: 359px) { .telemetry__item--workspace { display: none; } }
.send-error { color: var(--dl-error); margin-bottom: var(--dl-space-2); font-size: var(--dl-font-size-sm); }
/* 输入框:坞内的流内首位元素,自身仍抬起(elevated 底 + 发丝描边 + md 阴影 + lg 圆角);
   margin-inline:auto + max-width 让它与阅读列同宽同轴。多行时向下长高、把坞顶推高。 */
.composer-form { margin-inline: auto; max-width: var(--workspace-column-max); display: flex; align-items: flex-end; gap: var(--dl-space-2); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-md); }
.textarea-sizer { display: grid; flex: 1; min-width: 0; max-height: calc(5 * var(--dl-font-size-md) * var(--dl-line-body) + 2 * var(--dl-space-2)); overflow: hidden; }
.textarea-sizer::after { content: attr(data-value); visibility: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.textarea-sizer::after, textarea { grid-area: 1 / 1; font: inherit; line-height: var(--dl-line-body); padding: var(--dl-space-2); min-height: var(--dl-target-size); min-width: 0; border: 0; }
textarea { width: 100%; height: 100%; max-height: inherit; resize: none; color: var(--dl-text-primary); background: transparent; overflow-y: auto; overscroll-behavior: contain; border-radius: var(--dl-radius-sm); }
textarea::placeholder { color: var(--dl-text-secondary); }
textarea:hover:not(:read-only) { background: var(--dl-bg-hover); }
textarea:read-only { color: var(--dl-text-secondary); }
/* 焦点环画在**输入框的可见边界**上(即 .composer-form 那圈描边),而不是 textarea 自身:
   textarea 是无边框的,且被 .textarea-sizer 的 overflow:hidden 裁切 —— 而全局 `:focus-visible`
   给的是**外扩** 3px 的环,画在它身上会整条被裁掉(实测只剩四个圆角处逃出的小楔形,
   聚焦 / 未聚焦两图的强差异像素仅 327 个,四条边的中点全无变化),键盘用户因此看不出
   哪个输入框被聚焦。这与「搜索框只由容器承担焦点环」是同一条既有做法
   (见 conversation-switcher 的 .conversation-search:focus-within)。 */
.composer-form:focus-within {
  border-color: var(--dl-border-strong);
  box-shadow: var(--dl-shadow-md), var(--dl-focus-ring);
}
/* 输入框自身不再画环(它继承全局 :focus-visible),否则会与容器那圈叠成「双层青瓷框」。 */
textarea:focus,
textarea:focus-visible { outline: none; box-shadow: none; }
/* 停止钮:沿用工作台既有按钮配方的最小集(它渲染在本组件里,拿不到页面那份 scoped 规则)。 */
.workspace-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-height: var(--dl-target-size); min-width: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-button:focus-visible { box-shadow: var(--dl-focus-ring); }
.workspace-button:active { transform: translateY(var(--dl-lift-press)); }
.workspace-button:disabled { cursor: not-allowed; color: var(--dl-text-disabled); background: var(--dl-bg-sunken); transform: none; }
.send-button { flex-shrink: 0; padding: var(--dl-space-2); background: var(--dl-accent); color: var(--dl-text-on-accent); border-color: transparent; }
.send-button:hover { background: var(--dl-accent-hover); }
.stop-button svg { fill: currentColor; }
.workspace-button svg { width: var(--dl-icon-md); height: var(--dl-icon-md); flex-shrink: 0; }
/* 「回到底部」:坞内**唯一**仍绝对定位的悬浮件 —— 锚在坞顶之上(底边 = 坞顶边 − 一档间隙),
   浮在转录区下缘那一带上,**不覆盖坞**。44×44 独立控件,不落入紧凑导航行档。 */
.scroll-to-bottom {
  position: absolute;
  inset-block-end: calc(100% + var(--dl-space-2));
  inset-inline-start: 50%;
  z-index: var(--dl-z-sticky);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-target-size);
  block-size: var(--dl-target-size);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  box-shadow: var(--dl-shadow-md);
  transform: translateX(-50%);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard), background var(--dl-duration-fast) var(--dl-ease-standard);
}
.scroll-to-bottom:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.scroll-to-bottom:active { transform: translate(-50%, var(--dl-lift-press)); }
.scroll-to-bottom:focus-visible { box-shadow: var(--dl-focus-ring); }
.scroll-to-bottom-pop-enter-active,
.scroll-to-bottom-pop-leave-active { transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard); }
.scroll-to-bottom-pop-enter-from,
.scroll-to-bottom-pop-leave-to { opacity: 0; transform: translate(-50%, var(--dl-space-1)); }
/* 窄屏:坞的横向内缩收一档。 */
@media (max-width: 1023px) {
  .composer-dock { padding-inline: var(--dl-space-4); }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-button:active { transform: none; }
}
</style>
