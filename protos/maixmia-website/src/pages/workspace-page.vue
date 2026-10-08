<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { ChatSession } from '../contracts/generated/chat-session'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { TranscriptState } from '../contracts/generated/transcript-state'
import { createSession, getTranscript, listSessions, saveResponse, sendMessage } from '../api/workspace'
import { useI18n } from '../i18n'
import { currentRoute, navigateTo } from '../router'

const { t, locale } = useI18n()
const sessions = ref<ChatSession[]>([])
const sessionStatus = ref<TranscriptState['status']>('loading')
const transcript = ref<TranscriptState>({ status: 'loading' })
const activeId = ref('weekly')
const draft = ref('')
const generation = ref<'idle' | 'queued' | 'streaming' | 'complete' | 'stopped'>('idle')
const hasSendError = ref(false)
const hasStopRequested = ref(false)
const isSaving = ref(false)
const isLocalePending = ref(false)
const isDrawerOpen = ref(false)
const isNarrow = ref(window.matchMedia('(max-width: 1023px)').matches)
const isPinned = ref(true)
const previousScroll = ref(0)
const log = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)
const drawer = ref<HTMLElement | null>(null)
const sidebarTrigger = ref<HTMLButtonElement | null>(null)
const fullResponse = ref<ChatMessage | null>(null)
const renderedResponse = ref<ChatMessage | null>(null)
const interval = ref<ReturnType<typeof setInterval> | undefined>(undefined)
const requestVersion = ref(0)
const isAlive = ref(true)
const narrowMedia = window.matchMedia('(max-width: 1023px)')
const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
const BOTTOM_THRESHOLD = 100
const STREAM_INTERVAL = 32
const STREAM_CHUNK = 8
const isGenerating = computed(() => generation.value === 'queued' || generation.value === 'streaming')
const isBusy = computed(() => isGenerating.value || isSaving.value)
const canSend = computed(() => draft.value.trim().length > 0 && !isBusy.value && transcript.value.status !== 'loading' && transcript.value.status !== 'error')
const activeTitle = computed(() => sessions.value.find((session) => session.id === activeId.value)?.title ?? t.value.workspace.newChat)
const statusText = computed(() => {
  if (generation.value === 'queued') return t.value.workspace.queued
  if (generation.value === 'streaming') return t.value.workspace.generating
  if (generation.value === 'stopped') return t.value.workspace.stopped
  if (generation.value === 'complete') return t.value.workspace.completed
  return ''
})

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(timestamp))
}

async function stickToBottom(): Promise<void> {
  await nextTick()
  if (!log.value) return
  // 空态从欢迎内容开始阅读，不沿用消息列表的贴底落点。
  if (transcript.value.status === 'empty') log.value.scrollTop = 0
  else if (isPinned.value) log.value.scrollTop = log.value.scrollHeight
  else return
  previousScroll.value = log.value.scrollTop
}

function onScroll(): void {
  if (!log.value) return
  const current = log.value.scrollTop
  const distance = log.value.scrollHeight - log.value.clientHeight - current
  // 向上移动立即解除粘底；只有主动返回底部才恢复。
  if (current < previousScroll.value - 1) isPinned.value = false
  else if (distance <= 1) isPinned.value = true
  previousScroll.value = current
}

function onWheel(event: WheelEvent): void {
  if (event.deltaY < 0) isPinned.value = false
}

function onLogKey(event: KeyboardEvent): void {
  if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) isPinned.value = false
}

function returnToBottom(): void {
  isPinned.value = true
  void stickToBottom()
}

async function loadWorkspace(): Promise<void> {
  if (isBusy.value) { isLocalePending.value = true; return }
  requestVersion.value += 1
  const version = requestVersion.value
  const previousTop = log.value?.scrollTop ?? 0
  sessionStatus.value = 'loading'
  const demo = currentRoute.value.demoState
  transcript.value = demo === 'error' ? { status: 'error' } : demo === 'empty' || !activeId.value ? { status: 'empty' } : { status: 'loading' }
  const [sessionResult, messagesResult] = await Promise.all([
    listSessions(),
    demo === 'normal' && activeId.value ? getTranscript(activeId.value) : Promise.resolve(null),
  ])
  if (!isAlive.value || version !== requestVersion.value) return
  if (sessionResult.ok) {
    sessions.value = sessionResult.value
    sessionStatus.value = sessions.value.length ? 'ready' : 'empty'
  } else sessionStatus.value = 'error'
  if (messagesResult) {
    transcript.value = !messagesResult.ok ? { status: 'error' } : messagesResult.value.length ? { status: 'ready', messages: messagesResult.value } : { status: 'empty' }
  }
  await nextTick()
  if (transcript.value.status === 'empty' || isPinned.value) await stickToBottom()
  else if (log.value) { log.value.scrollTop = previousTop; previousScroll.value = previousTop }
}

function retry(): void {
  isPinned.value = true
  previousScroll.value = log.value?.scrollTop ?? 0
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  else void loadWorkspace()
}

function clearGeneration(): void {
  clearInterval(interval.value)
  interval.value = undefined
  generation.value = 'idle'
  fullResponse.value = null
  renderedResponse.value = null
  hasSendError.value = false
}

async function closeDrawer(): Promise<void> {
  isDrawerOpen.value = false
  await nextTick()
  sidebarTrigger.value?.focus()
}

async function openDrawer(): Promise<void> {
  isDrawerOpen.value = true
  await nextTick()
  // 等浏览器完成 inert 与可见性更新，避免旧焦点的失焦覆盖抽屉初始焦点。
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  drawer.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}

function drawerKeyboard(event: KeyboardEvent): void {
  if (!isDrawerOpen.value) return
  if (event.key === 'Escape') { event.preventDefault(); void closeDrawer(); return }
  if (event.key !== 'Tab') return
  const buttons = Array.from(drawer.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
  const first = buttons[0]
  const last = buttons.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}

async function selectSession(session: ChatSession): Promise<void> {
  if (isBusy.value) return
  clearGeneration()
  activeId.value = session.id
  draft.value = ''
  isPinned.value = true
  if (isDrawerOpen.value) await closeDrawer()
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  else await loadWorkspace()
}

async function newConversation(): Promise<void> {
  if (isBusy.value) return
  clearGeneration()
  activeId.value = ''
  draft.value = ''
  transcript.value = { status: 'empty' }
  isPinned.value = true
  if (isDrawerOpen.value) await closeDrawer()
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  await stickToBottom()
  composer.value?.focus()
}

async function useSuggestion(text: string): Promise<void> {
  draft.value = text
  await nextTick()
  composer.value?.focus()
}

function updateResponse(body: string): void {
  if (!renderedResponse.value || transcript.value.status !== 'ready') return
  renderedResponse.value.body = body
  const message = transcript.value.messages.find((item) => item.id === renderedResponse.value?.id)
  if (message) message.body = body
  void stickToBottom()
}

async function finishResponse(isStopped: boolean): Promise<void> {
  clearInterval(interval.value)
  interval.value = undefined
  generation.value = isStopped ? 'stopped' : 'complete'
  if (!renderedResponse.value) return
  isSaving.value = true
  const saved = await saveResponse(activeId.value, { ...renderedResponse.value })
  if (!isAlive.value) return
  isSaving.value = false
  if (!saved.ok) hasSendError.value = true
  if (isLocalePending.value) {
    isLocalePending.value = false
    await loadWorkspace()
  }
}

function startStream(): void {
  if (!fullResponse.value || !renderedResponse.value) return
  generation.value = 'streaming'
  if (motionMedia.matches) {
    updateResponse(fullResponse.value.body)
    void finishResponse(false)
    return
  }
  interval.value = setInterval(() => {
    if (!fullResponse.value || !renderedResponse.value) return
    updateResponse(fullResponse.value.body.slice(0, renderedResponse.value.body.length + STREAM_CHUNK))
    if (renderedResponse.value.body.length >= fullResponse.value.body.length) void finishResponse(false)
  }, STREAM_INTERVAL)
}

async function send(): Promise<void> {
  if (!canSend.value) return
  const text = draft.value.trim()
  hasSendError.value = false
  hasStopRequested.value = false
  generation.value = 'queued'
  // 空态没有历史消息的阅读位置；首次发送恢复跟随，其余情况保留原有粘底规则。
  if (transcript.value.status === 'empty') isPinned.value = true
  else if (log.value && log.value.scrollHeight - log.value.clientHeight - log.value.scrollTop > BOTTOM_THRESHOLD) isPinned.value = false
  if (!activeId.value) {
    const created = await createSession()
    if (!isAlive.value) return
    if (!created.ok) { generation.value = 'idle'; hasSendError.value = true; return }
    activeId.value = created.value.id
    sessions.value.unshift(created.value)
  }
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  const existing = transcript.value.status === 'ready' ? transcript.value.messages : []
  const pending: ChatMessage = { id: 'pending-user', role: 'user', body: text, createdAt: new Date().toISOString() }
  transcript.value = { status: 'ready', messages: [...existing, pending] }
  draft.value = ''
  void stickToBottom()
  const result = await sendMessage(activeId.value, text)
  if (!isAlive.value) return
  if (!result.ok) {
    transcript.value = existing.length ? { status: 'ready', messages: existing } : { status: 'empty' }
    draft.value = text
    generation.value = 'idle'
    hasSendError.value = true
    return
  }
  fullResponse.value = result.value
  renderedResponse.value = { ...result.value, body: '' }
  transcript.value = { status: 'ready', messages: [...existing, { ...pending, id: `${result.value.id}-user` }, renderedResponse.value] }
  const session = sessions.value.find((item) => item.id === activeId.value)
  if (session && activeId.value.startsWith('draft-')) session.title = text
  if (hasStopRequested.value) await finishResponse(true)
  else startStream()
}

function stop(): void {
  if (generation.value === 'queued') { hasStopRequested.value = true; return }
  if (generation.value === 'streaming') void finishResponse(true)
}

function regenerate(): void {
  if (isBusy.value || !fullResponse.value) return
  updateResponse('')
  startStream()
}

function inputKeyboard(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void send()
}

function onViewportChange(): void {
  isNarrow.value = narrowMedia.matches
  if (!isNarrow.value) isDrawerOpen.value = false
}

function onMotionChange(): void {
  if (motionMedia.matches && generation.value === 'streaming' && fullResponse.value) {
    updateResponse(fullResponse.value.body)
    void finishResponse(false)
  }
}

watch(locale, () => { void loadWorkspace() })
watch(() => currentRoute.value.demoState, (demo) => {
  if (demo === 'empty') activeId.value = ''
  if (demo === 'error' && !activeId.value) activeId.value = 'weekly'
  if (!isBusy.value) clearGeneration()
  void loadWorkspace()
})

onMounted(() => {
  if (currentRoute.value.demoState === 'empty') activeId.value = ''
  void loadWorkspace()
  narrowMedia.addEventListener('change', onViewportChange)
  motionMedia.addEventListener('change', onMotionChange)
  document.addEventListener('keydown', drawerKeyboard)
})
onBeforeUnmount(() => {
  isAlive.value = false
  clearInterval(interval.value)
  narrowMedia.removeEventListener('change', onViewportChange)
  motionMedia.removeEventListener('change', onMotionChange)
  document.removeEventListener('keydown', drawerKeyboard)
})
</script>

<template>
  <main id="main" class="workspace-page dl-scope dl-scope--dark">
    <div class="workspace-layout">
      <div v-if="isDrawerOpen && isNarrow" class="workspace-backdrop" aria-hidden="true" @click="closeDrawer" />
      <aside
        id="workspace-sidebar" ref="drawer" class="workspace-sidebar" :class="{ 'is-open': isDrawerOpen }"
        :inert="isNarrow && !isDrawerOpen" :role="isNarrow && isDrawerOpen ? 'dialog' : undefined"
        :aria-modal="isNarrow && isDrawerOpen ? true : undefined" :aria-label="t.workspace.conversations"
      >
        <div class="sidebar-actions">
          <button class="workspace-button new-chat" :disabled="isBusy" @click="newConversation">
            <span aria-hidden="true">＋</span>{{ t.workspace.newChat }}
          </button>
          <button v-if="isNarrow" class="workspace-button icon-button" :aria-label="t.workspace.closeSidebar" @click="closeDrawer">×</button>
        </div>
        <h2 class="sidebar-label" aria-hidden="true">{{ t.workspace.conversations }}</h2>
        <div v-if="sessionStatus === 'loading'" class="sidebar-loading" :aria-label="t.workspace.loading"><NSkeleton text :repeat="4" :animated="false" /></div>
        <div v-else-if="sessionStatus === 'error'" class="sidebar-loading"><p>{{ t.workspace.sessionsError }}</p><button class="workspace-button" @click="loadWorkspace">{{ t.workspace.retry }}</button></div>
        <p v-else-if="sessionStatus === 'empty'" class="sidebar-label">{{ t.workspace.sessionsEmpty }}</p>
        <div v-else class="session-list">
          <button v-for="session in sessions" :key="session.id" class="session-item" :aria-current="session.id === activeId ? 'true' : undefined" :disabled="isBusy" @click="selectSession(session)">
            <span class="session-title">{{ session.title }}</span>
            <span class="session-meta"><time :datetime="session.updatedAt">{{ formatTime(session.updatedAt) }}</time><span v-if="session.id === activeId" class="session-current">{{ t.workspace.current }}</span></span>
          </button>
        </div>
      </aside>
      <section class="conversation" :inert="isNarrow && isDrawerOpen">
        <header class="conversation-heading">
          <button v-if="isNarrow" ref="sidebarTrigger" class="workspace-button icon-button" :aria-label="t.workspace.openSidebar" :aria-expanded="isDrawerOpen" aria-controls="workspace-sidebar" @click="openDrawer">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div class="heading-text"><h1>{{ t.workspace.title }}</h1><p :title="activeTitle">{{ activeTitle }}</p></div>
        </header>
        <div ref="log" class="transcript" role="log" aria-live="polite" :aria-label="t.workspace.transcript" tabindex="0" :data-state="transcript.status" @scroll="onScroll" @wheel.passive="onWheel" @keydown="onLogKey">
          <div class="transcript-inner">
            <div v-if="transcript.status === 'loading'" class="transcript-loading" :aria-label="t.workspace.loading" aria-busy="true"><p>{{ t.workspace.loading }}</p><NSkeleton text :repeat="3" :animated="false" /><NSkeleton text :repeat="5" :animated="false" /></div>
            <div v-else-if="transcript.status === 'error'" class="conversation-empty"><h2>{{ t.workspace.errorTitle }}</h2><p>{{ t.workspace.errorBody }}</p><button class="workspace-button retry-button" @click="retry">{{ t.workspace.retry }}</button></div>
            <div v-else-if="transcript.status === 'empty'" class="conversation-empty"><h2>{{ t.workspace.emptyTitle }}</h2><p>{{ t.workspace.emptyBody }}</p><div class="suggestions"><button v-for="(suggestion, key) in t.workspace.suggestions" :key="key" class="suggestion-card" @click="useSuggestion(suggestion.body)"><strong>{{ suggestion.title }}</strong><span>{{ suggestion.body }}</span></button></div></div>
            <template v-else>
              <article v-for="message in transcript.messages" :key="message.id" class="chat-message" :class="message.role" :aria-live="message.id === renderedResponse?.id && isGenerating ? 'off' : undefined" :data-message-id="message.id">
                <p class="message-role">{{ message.role === 'user' ? t.workspace.you : t.workspace.assistant }}</p>
                <div class="message-body">{{ message.body }}<span v-if="message.id === renderedResponse?.id && generation === 'streaming'" class="stream-cursor" aria-hidden="true" /></div>
                <button v-if="message.id === renderedResponse?.id && generation === 'stopped'" class="workspace-button regenerate-button" :disabled="isSaving" @click="regenerate">{{ t.workspace.regenerate }}</button>
              </article>
              <div v-if="generation === 'queued'" class="queue-indicator" aria-live="off"><span aria-hidden="true">···</span>{{ t.workspace.queued }}</div>
            </template>
          </div>
        </div>
        <div class="composer-dock">
          <div v-if="!isPinned && transcript.status === 'ready'" class="scroll-action"><button class="workspace-button" @click="returnToBottom"><span aria-hidden="true">↓</span>{{ t.workspace.backToBottom }}</button></div>
          <div class="composer-inner">
            <div class="generation-status" role="status" aria-live="polite">{{ statusText }}</div>
            <p v-if="hasSendError" class="send-error" role="alert">{{ t.workspace.sendError }}</p>
            <form class="composer-form" @submit.prevent="send">
              <div class="textarea-sizer" :data-value="(draft || t.workspace.placeholder) + ' '">
                <textarea id="workspace-composer" name="workspace-composer" ref="composer" v-model="draft" rows="1" :aria-label="t.workspace.inputLabel" :placeholder="t.workspace.placeholder" :readonly="isBusy || transcript.status === 'loading' || transcript.status === 'error'" @keydown="inputKeyboard" />
              </div>
              <button v-if="isGenerating" class="workspace-button send-button stop-button" type="button" :aria-label="t.workspace.stop" @click="stop"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" /></svg></button>
              <button v-else class="workspace-button send-button" type="submit" :aria-label="t.workspace.send" :aria-disabled="!canSend"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 11 6-6 6 6M12 5v14" /></svg></button>
            </form>
            <p class="composer-hint">{{ t.workspace.inputHint }}</p>
            <p class="demo-note">{{ t.workspace.demoNote }}</p>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.workspace-page {
  /* 组件级布局常量，不是全局设计 token；侧栏与窄屏抽屉共享同一宽度。 */
  --workspace-sidebar-width: 260px;
  height: calc(100dvh - var(--dl-header-height) - var(--dl-border-width));
  min-height: 0;
}
.workspace-layout { display: grid; grid-template-columns: var(--workspace-sidebar-width) minmax(0, 1fr); height: 100%; max-width: var(--dl-container-max); margin-inline: auto; }
.workspace-sidebar { min-height: 0; display: flex; flex-direction: column; background: var(--dl-bg-elevated); border-right: var(--dl-border-width) solid var(--dl-border-base); padding: var(--dl-space-4); gap: var(--dl-space-4); }
.workspace-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-height: var(--dl-target-size); min-width: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-button:hover, .session-item:hover, .suggestion-card:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.workspace-button:active, .session-item:active, .suggestion-card:active { transform: translateY(var(--dl-lift-press)); }
.workspace-button:focus-visible, .session-item:focus-visible, .suggestion-card:focus-visible, textarea:focus-visible, .transcript:focus-visible { box-shadow: var(--dl-focus-ring); }
.workspace-button:disabled, .workspace-button[aria-disabled='true'], .session-item:disabled { cursor: not-allowed; color: var(--dl-text-disabled); background: var(--dl-bg-sunken); transform: none; }
.sidebar-actions { display: flex; gap: var(--dl-space-2); }
.new-chat { flex: 1; justify-content: flex-start; }
.sidebar-label { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-weight: 500; }
.sidebar-loading { display: grid; gap: var(--dl-space-4); }
.session-list { overflow-y: auto; min-height: 0; display: flex; flex-direction: column; gap: var(--dl-space-2); padding: var(--dl-space-1); margin: calc(-1 * var(--dl-space-1)); }
.session-item { flex-shrink: 0; min-height: var(--dl-target-size); width: 100%; padding: var(--dl-space-3); text-align: left; border: var(--dl-border-width) solid transparent; border-radius: var(--dl-radius-md); display: grid; gap: var(--dl-space-1); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.session-item[aria-current='true'] { border-color: var(--dl-border-strong); border-left: var(--dl-space-1) solid var(--dl-accent); background: var(--dl-accent-soft); }
.session-title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--dl-font-size-sm); }
.session-meta { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.session-current { color: var(--dl-accent); }
.conversation { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.conversation-heading { display: flex; align-items: center; gap: var(--dl-space-3); padding: var(--dl-space-3) var(--dl-space-6); border-bottom: var(--dl-border-width) solid var(--dl-border-base); }
.heading-text { min-width: 0; }
.heading-text h1 { font-size: var(--dl-font-size-md); font-weight: 500; }
.heading-text p { font-size: var(--dl-font-size-xs); color: var(--dl-text-secondary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.icon-button { padding: var(--dl-space-2); flex-shrink: 0; }
.workspace-button svg { width: var(--dl-icon-md); height: var(--dl-icon-md); flex-shrink: 0; }
.workspace-button svg path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
.transcript { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; overflow-anchor: none; scrollbar-gutter: stable; }
.transcript-inner { width: 100%; max-width: calc(var(--dl-measure) + 2 * var(--dl-space-6)); margin-inline: auto; padding: var(--dl-space-8) var(--dl-space-6); display: flex; flex-direction: column; gap: var(--dl-space-8); }
.transcript-loading { display: grid; gap: var(--dl-space-6); color: var(--dl-text-secondary); }
.chat-message { min-width: 0; width: 100%; line-height: var(--dl-line-body); }
.chat-message.user { align-self: flex-end; width: fit-content; max-width: 80%; border-radius: var(--dl-radius-lg); padding: var(--dl-space-3) var(--dl-space-4); background: var(--dl-bg-hover); }
.message-role { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); margin-bottom: var(--dl-space-2); }
.assistant .message-role { color: var(--dl-accent); font-weight: 500; }
.message-body { white-space: pre-wrap; overflow-wrap: anywhere; max-width: var(--dl-measure); }
.stream-cursor { display: inline-block; vertical-align: baseline; width: var(--dl-space-2); height: var(--dl-font-size-md); margin-left: var(--dl-space-1); background: var(--dl-accent); }
.queue-indicator { display: flex; align-items: center; gap: var(--dl-space-3); color: var(--dl-text-secondary); }
.queue-indicator > span { font-size: var(--dl-font-size-2xl); letter-spacing: var(--dl-tracking-caps); }
.regenerate-button { margin-top: var(--dl-space-3); }
.conversation-empty { display: grid; gap: var(--dl-space-4); padding-block: var(--dl-space-8); }
.conversation-empty h2 { font-size: var(--dl-font-size-xl); line-height: var(--dl-line-body); font-weight: 500; }
.conversation-empty > p { color: var(--dl-text-secondary); }
.retry-button { justify-self: start; }
.suggestions { display: grid; gap: var(--dl-space-3); margin-top: var(--dl-space-4); }
.suggestion-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--dl-space-2); text-align: left; padding: var(--dl-space-4); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); min-height: var(--dl-target-size); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.suggestion-card strong { font-size: var(--dl-font-size-md); font-weight: 500; }
.suggestion-card > span:first-of-type { grid-row: 2; color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.composer-dock { flex-shrink: 0; border-top: var(--dl-border-width) solid var(--dl-border-base); background: var(--dl-bg-base); }
.composer-inner { max-width: calc(var(--dl-measure) + 2 * var(--dl-space-6)); margin-inline: auto; padding: var(--dl-space-3) var(--dl-space-6) var(--dl-space-4); }
.generation-status { min-height: calc(var(--dl-font-size-xs) * var(--dl-line-body)); margin-bottom: var(--dl-space-2); font-size: var(--dl-font-size-xs); color: var(--dl-text-secondary); }
.send-error { color: var(--dl-error); margin-bottom: var(--dl-space-2); font-size: var(--dl-font-size-sm); }
.composer-form { display: flex; align-items: flex-end; gap: var(--dl-space-2); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-lg); background: var(--dl-bg-elevated); }
.textarea-sizer { display: grid; flex: 1; min-width: 0; max-height: calc(5 * var(--dl-font-size-md) * var(--dl-line-body) + 2 * var(--dl-space-2)); overflow: hidden; }
.textarea-sizer::after { content: attr(data-value); visibility: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.textarea-sizer::after, textarea { grid-area: 1 / 1; font: inherit; line-height: var(--dl-line-body); padding: var(--dl-space-2); min-height: var(--dl-target-size); min-width: 0; border: 0; }
textarea { width: 100%; height: 100%; max-height: inherit; resize: none; color: var(--dl-text-primary); background: transparent; overflow-y: auto; border-radius: var(--dl-radius-sm); }
textarea::placeholder { color: var(--dl-text-secondary); }
textarea:hover:not(:read-only) { background: var(--dl-bg-hover); }
textarea:read-only { color: var(--dl-text-secondary); }
.send-button { flex-shrink: 0; padding: var(--dl-space-2); background: var(--dl-accent); color: var(--dl-text-on-accent); border-color: transparent; }
.send-button:hover { background: var(--dl-accent-hover); }
.stop-button svg { fill: currentColor; }
.composer-hint, .demo-note { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); margin-top: var(--dl-space-2); }
.demo-note { color: var(--dl-text-tertiary); }
.scroll-action { display: flex; justify-content: center; padding: var(--dl-space-2) var(--dl-space-4) 0; }
.workspace-backdrop { position: fixed; inset: 0; z-index: var(--dl-z-overlay); background: color-mix(in srgb, var(--dl-bg-sunken) 80%, transparent); }
@media (max-width: 1023px) {
  .workspace-layout { grid-template-columns: minmax(0, 1fr); }
  .workspace-sidebar { position: fixed; inset: 0 auto 0 0; width: min(var(--workspace-sidebar-width), calc(100% - var(--dl-space-12))); z-index: var(--dl-z-overlay); transform: translateX(-100%); visibility: hidden; transition: transform var(--dl-duration-base) var(--dl-ease-standard); }
  .workspace-sidebar.is-open { transform: translateX(0); visibility: visible; }
  .conversation-heading { padding-inline: var(--dl-space-4); }
  .transcript-inner { padding: var(--dl-space-6) var(--dl-space-4); }
  .composer-inner { padding-inline: var(--dl-space-4); }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-button:active, .session-item:active, .suggestion-card:active { transform: none; }
}
</style>
