<script setup lang="ts">
// 输入行:终端提示符 + 单行输入。Enter 发送;生成中禁用输入并就近显示 esc 中断提示。
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  disabled: boolean
  isGenerating: boolean
}>()

const emit = defineEmits<{
  submit: [text: string]
}>()

const draft = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// Enter 发送(不带修饰键)。
function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') {
    return
  }
  event.preventDefault()
  submit()
}

function submit(): void {
  const text = draft.value.trim()
  if (text.length === 0 || props.disabled) {
    return
  }
  emit('submit', text)
  draft.value = ''
}

// 输入恢复可用时把焦点交还给输入框,方便键盘操作者直接继续。
watch(
  () => props.disabled,
  async (disabled) => {
    if (!disabled) {
      await nextTick()
      inputRef.value?.focus()
    }
  },
)

onMounted(() => {
  inputRef.value?.focus()
})

// 供父组件在会话重置等时机把焦点交还输入框。
defineExpose({
  focus: (): void => {
    inputRef.value?.focus()
  },
})
</script>

<template>
  <div class="prompt">
    <div class="prompt__inner">
      <div class="prompt__field" :class="{ 'prompt__field--busy': props.isGenerating }">
        <span class="prompt__sign" aria-hidden="true">&gt;</span>
        <input
          ref="inputRef"
          v-model="draft"
          class="prompt__input"
          type="text"
          id="agent-prompt"
          name="agent-prompt"
          autocomplete="off"
          data-testid="prompt-input"
          :disabled="props.disabled"
          :placeholder="props.isGenerating ? '生成中…' : '输入指令,enter 发送'"
          aria-label="向 agent 输入指令"
          @keydown="handleKeydown"
        />
        <span v-if="props.isGenerating" class="prompt__interrupt">
          <span class="prompt__spinner" aria-hidden="true">◐</span>
          esc 中断
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prompt {
  flex-shrink: 0;
  background: var(--dl-bg-elevated);
  border-top: var(--dl-border-width) solid var(--dl-border-base);
}

.prompt__inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--dl-space-2) var(--dl-space-4);
}

.prompt__field {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  padding: var(--dl-space-1) var(--dl-space-3);
  background: var(--dl-bg-base);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
}

.prompt__field:focus-within {
  border-color: var(--dl-border-strong);
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.prompt__field--busy {
  background: var(--dl-bg-sunken);
}

.prompt__sign {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-accent);
  font-weight: 600;
}

.prompt__input {
  flex: 1;
  min-width: 0;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-primary);
  background: transparent;
  border: none;
  padding: var(--dl-space-1) 0;
}

.prompt__input::placeholder {
  color: var(--dl-text-tertiary);
}

.prompt__input:disabled {
  color: var(--dl-text-disabled);
  cursor: not-allowed;
}

.prompt__input:focus {
  outline: none;
}

.prompt__interrupt {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
  white-space: nowrap;
}

.prompt__spinner {
  display: inline-block;
  color: var(--dl-accent);
  animation: prompt-spin 900ms linear infinite;
}

@keyframes prompt-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
