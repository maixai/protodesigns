<script setup lang="ts">
// 应用外壳:把会话引擎与各视图组件装配成一个终端形态的操作界面。
// 这里只做装配与全局键盘 / 滚动行为,业务状态全部来自 useAgentSession。
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useAgentSession } from './agent/session'
import ConsoleHeader from './components/console-header.vue'
import PromptInput from './components/prompt-input.vue'
import SessionPlaceholder from './components/session-placeholder.vue'
import StatusLine from './components/status-line.vue'
import TranscriptStream from './components/transcript-stream.vue'
import { useColorScheme } from './theme'

// 距离底部多少像素内仍算"贴近底部",此时新内容才自动滚动。
const AUTOSCROLL_THRESHOLD_PX = 80

const {
  entries,
  meta,
  state,
  isGenerating,
  pendingApproval,
  hasConversation,
  inputTokensText,
  outputTokensText,
  elapsedText,
  examplePrompts,
  revision,
  send,
  resolveApproval,
  interrupt,
  retry,
  reset,
  simulateDisconnect,
} = useAgentSession()

const { mode: themeMode, toggle: toggleTheme } = useColorScheme()

const scrollRef = ref<HTMLElement | null>(null)
const promptRef = ref<InstanceType<typeof PromptInput> | null>(null)

// 输入框等可编辑元素内的按键不参与全局快捷键,避免误触发。
function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

// 全局快捷键:Esc 中断生成(生成中才生效);审批待决时 y / n 直接决定。
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (isGenerating.value) {
      event.preventDefault()
      interrupt()
    }
    return
  }
  if (pendingApproval.value === null || isEditableTarget(event.target)) {
    return
  }
  const key = event.key.toLowerCase()
  if (key === 'y') {
    event.preventDefault()
    resolveApproval('approved')
  } else if (key === 'n') {
    event.preventDefault()
    resolveApproval('denied')
  }
}

// 新内容到达时滚到底部;用户已上滚阅读时不打扰。
watch(revision, async () => {
  await nextTick()
  const element = scrollRef.value
  if (element === null) {
    return
  }
  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
  if (isGenerating.value || distanceToBottom < AUTOSCROLL_THRESHOLD_PX) {
    element.scrollTop = element.scrollHeight
  }
})

// 生成结束(含会话重置)后把焦点交还输入框,键盘操作者可直接继续输入。
watch([isGenerating, hasConversation], async () => {
  if (isGenerating.value) {
    return
  }
  await nextTick()
  promptRef.value?.focus()
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="console"
    data-testid="console"
    :data-state="state.status"
    :data-generating="isGenerating ? 'true' : 'false'"
  >
    <ConsoleHeader
      :is-generating="isGenerating"
      :theme-mode="themeMode"
      @reset="reset"
      @disconnect="simulateDisconnect"
      @toggle-theme="toggleTheme"
    />

    <main ref="scrollRef" class="console__body">
      <div class="console__inner">
        <SessionPlaceholder
          v-if="!hasConversation"
          :state="state"
          :example-prompts="examplePrompts"
          @retry="retry"
          @use-example="send"
        />
        <TranscriptStream v-else :entries="entries" @decide="resolveApproval" />
      </div>
    </main>

    <PromptInput
      ref="promptRef"
      :disabled="isGenerating"
      :is-generating="isGenerating"
      @submit="send"
    />

    <StatusLine
      :meta="meta"
      :input-tokens-text="inputTokensText"
      :output-tokens-text="outputTokensText"
      :elapsed-text="elapsedText"
    />
  </div>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--dl-bg-base);
}

.console__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.console__inner {
  max-width: 1100px;
  min-height: 100%;
  margin: 0 auto;
  padding: 0 var(--dl-space-4);
  display: flex;
  flex-direction: column;
}
</style>
