<script setup lang="ts">
// 对话窗体的**内容本体**:滚动容器 + 转录 + 输入坞。
//
// 停靠(区域内容区)与悬浮(对话窗体)两处**共用同一份** —— 这是「输入框属于窗体」的机械保证:
// 一段对话被拆出 / 停靠时,窗体换的是外壳与几何,内容本体同一个,输入坞因此天然跟随。
//
// 它自己持有滚动容器与「粘底」逻辑(isPinned 存在 runtime 里,属于**视图级**状态:
// 与 VS Code 把 zoom / 滚动位置放在 editor instance 而非 document 同一分层)。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChatRuntime } from '../data/chat-runtime'
import { useI18n } from '../i18n'
import ChatComposer from './chat-composer.vue'
import TranscriptView from './transcript-view.vue'

const props = defineProps<{
  sessionId: string
  title: string
  runtime: ChatRuntime
  userName: string
  assistantName: string
  // 是否承担**全页唯一**的 live region(见 workspace-page 的 liveSlot 判据)。
  isLive: boolean
  disabled: boolean
  canSend: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
  regenerate: []
  retry: []
  resolve: [allowed: boolean]
  'update:draft': [value: string]
  'update:pinned': [value: boolean]
}>()

const { t } = useI18n()
const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')

const logRef = ref<HTMLElement | null>(null)
// 指针是否按在滚动容器上(拖动滚动条 / 触摸滚动)。用来把「用户的向上滚动意图」与「程序化改内容
// 导致的浏览器钳制」区分开 —— 只有前者才解除粘底。
let isPointerScrolling = false
let previousScroll = 0
// 已处理过的高亮轮次:滚动跳转只做一次(highlightTurnId 本身保留,高亮框继续可见)。
let consumedHighlight = ''

function setPinned(next: boolean): void {
  if (props.runtime.isPinned !== next) emit('update:pinned', next)
}

async function stickToBottom(): Promise<void> {
  await nextTick()
  const element = logRef.value
  if (element === null) return
  // 空态从欢迎内容开始阅读,不沿用消息列表的贴底落点。
  if (props.runtime.transcript.status === 'empty') element.scrollTop = 0
  else if (props.runtime.isPinned) element.scrollTop = element.scrollHeight
  else return
  previousScroll = element.scrollTop
}

function onScroll(): void {
  const element = logRef.value
  if (element === null) return
  const current = element.scrollTop
  const distance = element.scrollHeight - element.clientHeight - current
  // 贴底判定只在**有内容可读**时有效:转录切到 loading 骨架时内容会短暂变矮、距离天然为 0 ——
  // 那不是「用户滚到了底部」,据此恢复粘底会让一次**后台**重装把用户的阅读位置抢走
  // (实测:手动上滚锁位后按 Enter 发送,后台那次装载落地时转录被弹回底部)。
  if (props.runtime.transcript.status !== 'loading' && distance <= 1) setPinned(true)
  else if (isPointerScrolling && current < previousScroll - 1) setPinned(false)
  previousScroll = current
}

function onWheel(event: WheelEvent): void {
  if (event.deltaY < 0) setPinned(false)
}

function onLogKey(event: KeyboardEvent): void {
  if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) setPinned(false)
}

function onPointerDown(): void {
  isPointerScrolling = true
}

function onPointerUp(): void {
  isPointerScrolling = false
}

function returnToBottom(): void {
  setPinned(true)
  void stickToBottom()
}

// 转录 / 确认 / 后续消息变化:按粘底规则跟随(只在 isPinned 时滚到底)。
watch(() => props.runtime.transcript, () => { void stickToBottom() })
watch(() => props.runtime.confirmation, () => { void stickToBottom() })
watch(() => props.runtime.confirmationOutcome, () => { void stickToBottom() })
watch(() => props.runtime.followUp, () => { void stickToBottom() })

// 搜索命中跳转:转录就绪后把目标轮次滚到视野中央(高亮由 TranscriptView 按 highlightTurnId 渲染)。
watch(() => [props.runtime.highlightTurnId, props.runtime.transcript.status] as const, () => {
  const turnId = props.runtime.highlightTurnId
  if (turnId === null || turnId === '' || props.runtime.transcript.status !== 'ready') return
  if (consumedHighlight === turnId) return
  consumedHighlight = turnId
  void (async () => {
    await nextTick()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const target = logRef.value?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(turnId)}"]`)
    target?.scrollIntoView({ block: 'center', behavior: motionMedia.matches ? 'auto' : 'smooth' })
  })()
}, { immediate: true })

onMounted(() => {
  // 指针抬起可能落在滚动容器之外(拖动滚动条时鼠标划出),故在 window 上收尾 —— 每个视图各自登记。
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  void stickToBottom()
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
})

const isGenerating = computed(() => props.runtime.generation === 'queued' || props.runtime.generation === 'streaming')
</script>

<template>
  <div class="chat-session-view">
    <!-- 全页 `role="log"` 恰为 1:只有 isLive 的那一个视图带 log + aria-live,
         其余对话视图用中性的 role="group" + aria-label,避免第二个播报通道互相打断。 -->
    <div
      ref="logRef"
      class="transcript"
      :role="isLive ? 'log' : 'group'"
      :aria-live="isLive ? 'polite' : undefined"
      :aria-label="t.workspace.transcript"
      tabindex="0"
      :data-state="runtime.transcript.status"
      @scroll="onScroll"
      @wheel.passive="onWheel"
      @keydown="onLogKey"
      @pointerdown="onPointerDown"
    >
      <TranscriptView
        :transcript="runtime.transcript"
        :user-name="userName"
        :assistant-name="assistantName"
        :generation="runtime.generation"
        :streaming-id="runtime.rendered?.id ?? null"
        :highlight-turn-id="runtime.highlightTurnId"
        :confirmation="runtime.confirmation"
        :confirmation-outcome="runtime.confirmationOutcome"
        :follow-up="runtime.followUp"
        :is-saving="runtime.isSaving"
        @retry="emit('retry')"
        @resolve="emit('resolve', $event)"
        @regenerate="emit('regenerate')"
      />
    </div>
    <ChatComposer
      :session-id="sessionId"
      :title="title"
      :runtime="runtime"
      :disabled="disabled"
      :can-send="canSend"
      :is-generating="isGenerating"
      :is-live="isLive"
      @send="emit('send', $event)"
      @stop="emit('stop')"
      @update:draft="emit('update:draft', $event)"
      @back-to-bottom="returnToBottom"
    />
  </div>
</template>

<style scoped>
/* 内容本体:纵向 [转录(flex:1)| 输入坞(flex-shrink:0)],填满宿主(区域内容区 / 悬浮窗体)。 */
.chat-session-view { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
/* 滚动容器:承载阅读位置(贴底 / 不抢滚动 / 搜索命中跳转)。刻意不设 mask(整条边缘淡出已删)。
   底部内缩成对给 padding-block-end 与 scroll-padding-block-end:前者管「滚到底」,后者管浏览器
   自身的滚动定位(键盘聚焦 / scrollIntoView / 命中跳转)—— 依据是 WCAG 技术 C43。 */
.transcript {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  scrollbar-gutter: stable;
  border-block-start: var(--dl-border-width) solid var(--dl-border-base);
  padding-block-end: var(--dl-space-4);
  scroll-padding-block-end: var(--dl-space-4);
}
.transcript:focus-visible { box-shadow: var(--dl-focus-ring); }
</style>
