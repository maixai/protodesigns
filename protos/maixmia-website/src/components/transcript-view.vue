<script setup lang="ts">
// 转录内容块:一段对话的**内容**渲染(四态 + 消息列表 + 确认卡 + 处理后的后续消息 + 排队指示)。
//
// 它**不含滚动容器** —— 滚动容器(.transcript)由调用方提供:区域内容里的转录要保持自己的
// 贴底 / 不抢滚动等阅读位置逻辑(那属于「区域」的状态),而悬浮的对话窗体没有输入坞、不需要那套。
// 因此同一份内容渲染被两处复用:工作台的区域内容区、拆出后的悬浮对话窗体 —— 不复制第二份。
//
// 意图边界:这里只负责「内容长什么样」;数据来自契约生成物,不在此重复定义。
import { computed } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { TranscriptState } from '../contracts/generated/transcript-state'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import { useI18n } from '../i18n'
import ConfirmationCard from './confirmation-card.vue'
import { toInitials } from './account-avatar'

// 客户端的实时生成阶段(视图状态,不进契约):由页面驱动流式输出,转录据此渲染光标 / 重生成 / 排队。
export type GenerationPhase = 'idle' | 'queued' | 'streaming' | 'complete' | 'stopped'

const props = defineProps<{
  transcript: TranscriptState
  // 用户头像首字(与账户菜单同源)与助手作者名(当前会话所属 Agent)。
  userName: string
  assistantName: string
  generation: GenerationPhase
  // 正在流式输出的那条消息 id;null = 没有(静态转录 / 悬浮窗里的历史对话)。
  streamingId: string | null
  // 搜索命中跳转后要高亮的轮次 id。
  highlightTurnId: string | null
  confirmation: ConfirmationRequest | null
  confirmationOutcome: 'allowed' | 'rejected' | null
  // 确认处理后 Agent 的后续消息(渲染在确认卡留痕之后)。
  followUp: ChatMessage | null
  isSaving: boolean
}>()

const emit = defineEmits<{
  retry: []
  resolve: [allowed: boolean]
  regenerate: []
}>()

const { t, locale } = useI18n()

const isGenerating = computed(() => props.generation === 'queued' || props.generation === 'streaming')

// 消息时间戳:日期 + 时分(UTC,与演示数据同源),随当前语言格式化;样式走等宽数字,列宽不跳动。
function formatMessageTime(timestamp: string): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(timestamp))
}
</script>

<template>
  <div class="transcript-inner">
    <div v-if="transcript.status === 'loading'" class="transcript-loading" :aria-label="t.workspace.loading" aria-busy="true">
      <p>{{ t.workspace.loading }}</p>
      <NSkeleton text :repeat="3" :animated="false" />
      <NSkeleton text :repeat="5" :animated="false" />
    </div>
    <div v-else-if="transcript.status === 'error'" class="conversation-empty">
      <h2>{{ t.workspace.errorTitle }}</h2>
      <p>{{ t.workspace.errorBody }}</p>
      <button class="workspace-button retry-button" @click="emit('retry')">{{ t.workspace.retry }}</button>
    </div>
    <div v-else-if="transcript.status === 'empty'" class="conversation-empty">
      <h2>{{ t.workspace.emptyTitle.replace('{name}', userName) }}</h2>
      <p>{{ t.workspace.emptyBody }}</p>
    </div>
    <template v-else>
      <article
        v-for="message in transcript.messages" :key="message.id" class="chat-message"
        :class="[message.role, { 'is-highlighted': message.id === highlightTurnId }]"
        :aria-live="message.id === streamingId && isGenerating ? 'off' : undefined"
        :data-message-id="message.id"
      >
        <!-- 圆形头像纯装饰:身份由下方可见的作者名给出,故 aria-hidden,避免屏幕阅读器重复朗读。 -->
        <span class="message-avatar" aria-hidden="true">{{ message.role === 'user' ? toInitials(userName) : toInitials(assistantName) }}</span>
        <div class="message-content">
          <p class="message-meta">
            <span class="message-author">{{ message.role === 'user' ? userName : assistantName }}</span>
            <span class="message-meta-sep" aria-hidden="true">·</span>
            <time class="message-time" :datetime="message.createdAt">{{ formatMessageTime(message.createdAt) }}</time>
          </p>
          <div class="message-body">{{ message.body }}<span v-if="message.id === streamingId && generation === 'streaming'" class="stream-cursor" aria-hidden="true" /></div>
          <button v-if="message.id === streamingId && generation === 'stopped'" class="workspace-button regenerate-button" :disabled="isSaving" @click="emit('regenerate')">{{ t.workspace.regenerate }}</button>
        </div>
      </article>
      <!-- 「等待交互」确认卡:作为对话流里的一条,紧跟 Agent 最后一条消息之后。 -->
      <ConfirmationCard v-if="confirmation" :request="confirmation" :outcome="confirmationOutcome" @resolve="emit('resolve', $event)" />
      <!-- 处理后的 Agent 后续消息,排在确认卡留痕之后。 -->
      <article v-if="followUp" class="chat-message assistant" :data-message-id="followUp.id">
        <span class="message-avatar" aria-hidden="true">{{ toInitials(assistantName) }}</span>
        <div class="message-content">
          <p class="message-meta">
            <span class="message-author">{{ assistantName }}</span>
            <span class="message-meta-sep" aria-hidden="true">·</span>
            <time class="message-time" :datetime="followUp.createdAt">{{ formatMessageTime(followUp.createdAt) }}</time>
          </p>
          <div class="message-body">{{ followUp.body }}</div>
        </div>
      </article>
      <div v-if="generation === 'queued'" class="queue-indicator" aria-live="off"><span aria-hidden="true">···</span>{{ t.workspace.queued }}</div>
    </template>
  </div>
</template>

<style scoped>
/* 阅读列:宽度上限 = --workspace-column-max(会话转录列 48em)+ 两侧 gutter,横向内边距 = 侧向 gutter
   (正文两侧各留一档 gutter 作结构性留白,头像凸入其中)。max-width 与 .composer-form 同轴。 */
.transcript-inner { width: 100%; max-width: calc(var(--workspace-column-max) + 2 * var(--workspace-gutter)); margin-inline: auto; padding: var(--dl-space-8) var(--workspace-gutter) 0; display: flex; flex-direction: column; gap: var(--dl-space-8); }
.transcript-loading { display: grid; gap: var(--dl-space-6); color: var(--dl-text-secondary); }
/* 消息行 = 头像 + 内容块两栏。头像是固定尺寸的 flex 项、内容块吃满剩余宽;正文因此恒为
   会话转录列宽(48em),头像不挤压它 —— 头像被负外边距拉进侧向 gutter(见下)。 */
.chat-message { display: flex; align-items: flex-start; min-width: 0; width: 100%; line-height: var(--dl-line-body); }
.message-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
/* 用户侧是助手侧的**镜像**(气泡在右、头像在右)—— iMessage / WhatsApp / Slack 的既有 UX。 */
.chat-message.user { flex-direction: row-reverse; }
/* 圆形头像:发丝描边 + 中性面,靠**首字**区分(强调色只承担「可操作」语义,不给 Agent 上色)。 */
.message-avatar { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; inline-size: var(--workspace-avatar-size); block-size: var(--workspace-avatar-size); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); font-size: var(--dl-font-size-xs); font-weight: 500; color: var(--dl-text-primary); }
/* 负外边距把头像拉进阅读列两侧的 gutter(宽 = 头像 + 间隙),于是正文列宽保持 48em 不变。 */
.chat-message.assistant .message-avatar { margin-inline: calc(-1 * var(--workspace-gutter)) var(--workspace-avatar-gap); background: var(--dl-bg-sunken); }
.chat-message.user .message-avatar { margin-inline: var(--workspace-avatar-gap) calc(-1 * var(--workspace-gutter)); background: var(--dl-bg-hover); }
/* 用户气泡:背景 / 圆角 / 内边距落在**内容块**上(而非整行),故头像与气泡彼此独立、互不包裹。 */
.chat-message.user .message-content { align-items: flex-end; }
.chat-message.user .message-body { width: fit-content; max-width: 80%; border-radius: var(--dl-radius-lg); padding: var(--dl-space-3) var(--dl-space-4); background: var(--dl-bg-hover); }
/* 搜索命中的轮次高亮:静态描边(不做过渡 / 动画),reduced-motion 下同样可见。 */
.chat-message.is-highlighted { outline: var(--dl-border-width) solid var(--dl-accent); outline-offset: var(--dl-space-2); border-radius: var(--dl-radius-md); }
/* 作者名 + 时间戳的顶部行。身份由**可见的作者名**给出。 */
.message-meta { display: flex; flex-wrap: wrap; max-inline-size: 100%; align-items: baseline; gap: var(--dl-space-2); margin-bottom: var(--dl-space-2); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.message-author { overflow-wrap: anywhere; min-inline-size: 0; color: var(--dl-text-primary); font-weight: 500; }
.message-meta-sep { color: var(--dl-text-tertiary); }
/* 时间戳走等宽字体 + 等宽数字:本仓「技术信息一律走等宽」。 */
.message-time { color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; }
.message-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.stream-cursor { display: inline-block; vertical-align: baseline; width: var(--dl-space-2); height: var(--dl-font-size-md); margin-left: var(--dl-space-1); background: var(--dl-accent); }
.queue-indicator { display: flex; align-items: center; gap: var(--dl-space-3); color: var(--dl-text-secondary); }
.queue-indicator > span { font-size: var(--dl-font-size-2xl); letter-spacing: var(--dl-tracking-caps); }
.regenerate-button { margin-top: var(--dl-space-3); }
.conversation-empty { display: grid; gap: var(--dl-space-4); padding-block: var(--dl-space-8); }
.conversation-empty h2 { font-size: var(--dl-font-size-xl); line-height: var(--dl-line-body); font-weight: 500; }
.conversation-empty > p { color: var(--dl-text-secondary); }
.retry-button { justify-self: start; }
/* 转录里的按钮沿用工作台既有按钮配方(与页面里的 .workspace-button 同值)——它们渲染在
   本组件里,拿不到页面那份 scoped 规则,故在此补一份最小集(基础 / 悬停 / 按压 / 禁用 / 焦点)。 */
.workspace-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-height: var(--dl-target-size); min-width: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-button:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.workspace-button:active { transform: translateY(var(--dl-lift-press)); }
.workspace-button:focus-visible { box-shadow: var(--dl-focus-ring); }
.workspace-button:disabled, .workspace-button[aria-disabled='true'] { cursor: not-allowed; color: var(--dl-text-disabled); background: var(--dl-bg-sunken); transform: none; }
/* 窄屏:头像降到 24px、间隙收到 8px、内边距收一档,头像不拉负边距(没有侧向留白可凸入)。 */
@media (max-width: 1023px) {
  .transcript-inner { padding: var(--dl-space-6) var(--workspace-gutter) 0; }
  .chat-message.assistant .message-avatar { margin-inline: 0 var(--workspace-avatar-gap); }
  .chat-message.user .message-avatar { margin-inline: var(--workspace-avatar-gap) 0; }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-button:active { transform: none; }
}
</style>
