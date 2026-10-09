<script setup lang="ts">
// Agent 选择器:它现在表达的是「当前在哪个 Agent 的工作区」——与其下工作区文件区一起构成
// 侧栏,并与「新建对话」的归属合并为同一件事(新会话挂到当前 Agent)。它是**受控组件** ——
// 选中值由页面持有,组件只通过 value 读、通过 select 事件请求变更,自身不保存状态。
//
// 状态语义是「独立粘性」:选择器持有自己的值,不随切换会话变化;会话头(副行)显示的仍是
// **当前会话**的 Agent。两者刻意可以不同,互不同步。
//
// 形态是 disclosure(命名容器 + 原生按钮选项),不是 menu / listbox —— 与 language-switcher
// 同因:本仓实测 Naive UI 的 NDropdown 选项无 tabindex、键盘完全不可用,故手写键盘可达、
// 焦点可归还的披露式选择器。
//
// 触发钮占满动作行:左侧首字标识、中间当前 Agent 名、右侧展开箭头。名字必须可见 ——
// 它现在代表用户所处的 Agent 工作区,而会话头副行显示的是「当前会话」的归属,两者可以不同,
// 若这里只留标识,用户就看不到当前选的是哪个工作区。
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AgentId } from '../contracts/generated/chat-session'
import { useI18n } from '../i18n'

// disabled 可选:生成 / 保存中锁定工作区切换,避免与正在进行的生成争用同一份工作台状态。
defineProps<{ value: AgentId; disabled?: boolean }>()
const emit = defineEmits<{ select: [agent: AgentId] }>()

const { t } = useI18n()
// 三个 Agent 的固定顺序:与契约 AgentId 的取值集合一致。
const agents = ['planning', 'research', 'writing'] satisfies AgentId[]
const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)

function agentName(agent: AgentId): string {
  return t.value.workspace.agents[agent]
}

// 首字标识:按码点取首字符(如 [...「规划助手」][0] = 「规」),避免代理对被截成半个码元。
// 不新增 i18n 字段、不为三个 Agent 画图标(现有 15 个描边图标没有一个能表达规划 / 研究 / 写作)。
function agentInitial(agent: AgentId): string {
  return [...agentName(agent)][0] ?? ''
}

async function open(focusFirst: boolean): Promise<void> {
  if (isOpen.value) return
  isOpen.value = true
  if (!focusFirst) return
  await nextTick()
  popoverRef.value?.querySelector('button')?.focus()
}

function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  // 离场节点已从 vdom 摘除,直接设 inert,避免 Tab 落入正在淡出的选项。
  if (popoverRef.value !== null) popoverRef.value.inert = true
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function onTriggerClick(event: MouseEvent): void {
  if (isOpen.value) {
    close(false)
    return
  }
  // 键盘派生的 click.detail 为 0:打开后聚焦首项;指针打开不移焦点。
  void open(event.detail === 0)
}

function onSelect(agent: AgentId): void {
  emit('select', agent)
  close(true)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !isOpen.value) return
  event.preventDefault()
  // 阻止继续冒泡:窄屏抽屉在 document 上也监听 Escape(见 workspace-page 的 drawerKeyboard),
  // 冒泡到那里会让一次 Escape 同时关掉弹层与抽屉,而期望是「先关最上层」。只拦 Escape ——
  // 其余键(尤其 Tab)照常冒泡,否则抽屉的 Tab 焦点圈定会失效。
  event.stopPropagation()
  close(true)
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  close(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && rootRef.value?.contains(target) === true) return
  close(false)
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="rootRef" class="agent-selector" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      ref="triggerRef"
      type="button"
      class="agent-selector__trigger"
      :disabled="disabled"
      :aria-expanded="isOpen"
      aria-controls="agent-selector-popover"
      :aria-label="agentName(value)"
      :title="agentName(value)"
      @click="onTriggerClick"
    >
      <span class="agent-selector__mark" aria-hidden="true">{{ agentInitial(value) }}</span>
      <span class="agent-selector__name">{{ agentName(value) }}</span>
      <svg class="agent-selector__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
    <Transition name="agent-selector-pop">
      <div
        v-if="isOpen"
        id="agent-selector-popover"
        ref="popoverRef"
        class="agent-selector__popover"
        role="group"
        :aria-label="t.workspace.agentSelector"
      >
        <button
          v-for="agent in agents"
          :key="agent"
          type="button"
          class="agent-selector__option"
          :class="{ 'agent-selector__option--current': agent === value }"
          :aria-current="agent === value ? 'true' : undefined"
          @click="onSelect(agent)"
        >
          <span class="agent-selector__mark" aria-hidden="true">{{ agentInitial(agent) }}</span>
          {{ agentName(agent) }}
          <span v-if="agent === value" class="agent-selector__status">{{ t.workspace.agentSelected }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 占满动作行的剩余宽度:它独立成行(不再与「新建对话」合体),故可铺满并显示完整 Agent 名。
   刻意不设 position —— 弹层的定位基准是父级动作行(见下方弹层注释),而不是本元素。 */
.agent-selector {
  flex: 1;
  min-width: 0;
}

/* 与侧栏「新建对话」按钮同一套按钮配方(同高、同描边、同悬停 / 按压反馈),内部为
   「标识 + 当前 Agent 名 + 箭头」;名字靠 flex 收缩、单行省略,箭头推到最右。 */
.agent-selector__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-3);
  width: 100%;
  min-width: 0;
  min-height: var(--dl-target-size);
  padding: var(--dl-space-2) var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary);
  background: var(--dl-bg-elevated);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.agent-selector__trigger:hover:not(:disabled) {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

/* 当前 Agent 名:占满中段、单行省略,箭头固定在最右。 */
.agent-selector__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-align: left;
  font-size: var(--dl-font-size-sm);
}

.agent-selector__trigger:active:not(:disabled) {
  transform: translateY(var(--dl-lift-press));
}

.agent-selector__trigger:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 禁用态沿用共享的按钮配方:下沉底 + 禁用文字色,不响应悬停 / 按压。 */
.agent-selector__trigger:disabled {
  cursor: not-allowed;
  color: var(--dl-text-disabled);
  background: var(--dl-bg-sunken);
}

.agent-selector__trigger:disabled .agent-selector__mark,
.agent-selector__trigger:disabled .agent-selector__caret {
  color: var(--dl-text-disabled);
}

/* 首字标识:借会话头 .agent-mark 的形式(圆角方块 + 首字),但只用中性描边 + 下沉底,
   刻意不用强调色 —— design-language 规定强调色只承担「可操作」语义,Agent 身份不属于其中。 */
.agent-selector__mark {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-space-6);
  height: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
  background: var(--dl-bg-sunken);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  font-weight: 600;
}

/* 展开箭头:沿用共享的「1.5px 描边、不随尺寸缩放」图标规则(--dl-icon-stroke)。 */
.agent-selector__caret {
  flex-shrink: 0;
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  color: var(--dl-text-secondary);
}

.agent-selector__caret path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}

/* 弹层横向贴齐父级动作行(inset-inline: 0),而不是贴着触发钮:
   触发钮在动作行里的位置随「是否有窄屏关闭按钮」变化,若以它为基准右对齐,英文选项
   (实测约 203px)在窄屏会向左伸出侧栏面板的 overflow: hidden 边界、被裁掉约 12px。
   锚到动作行则弹层始终落在面板内,且宽度自动容纳最长的本地化 Agent 名。 */
.agent-selector__popover {
  position: absolute;
  inset-block-start: calc(100% + var(--dl-space-1));
  inset-inline: 0;
  z-index: var(--dl-z-overlay);
  display: flex;
  flex-direction: column;
  padding: var(--dl-space-1);
  background-color: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.agent-selector__option {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  min-width: var(--dl-target-size);
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
  text-align: left;
  white-space: nowrap;
}

.agent-selector__option:hover {
  background-color: var(--dl-bg-hover);
}

.agent-selector__option:active {
  transform: translateY(var(--dl-lift-press));
}

.agent-selector__option:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.agent-selector__option--current {
  font-weight: 500;
}

.agent-selector__status {
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
}

.agent-selector-pop-enter-active,
.agent-selector-pop-leave-active {
  transition:
    opacity var(--dl-duration-base) var(--dl-ease-standard),
    transform var(--dl-duration-base) var(--dl-ease-standard);
}

.agent-selector-pop-enter-from,
.agent-selector-pop-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--dl-space-1)));
}

@media (prefers-reduced-motion: reduce) {
  .agent-selector__trigger:active:not(:disabled),
  .agent-selector__option:active {
    transform: none;
  }
}
</style>
