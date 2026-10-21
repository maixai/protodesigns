<script setup lang="ts">
// 模型选择器:输入坞底行右侧的「模型 ▾」。
//
// 位置依据:Claude 把模型选择放进 composer 内右侧、主张「模型与消耗必须在发送前可见」,
// ChatGPT 放在消息框内右下角 —— 本仓底行右侧与之一致。
//
// 实现刻意**不用 Naive UI 的 NDropdown**:本仓实测它的菜单项没有 tabindex、键盘完全不可用
// (见 project-menu 的同一处置)。这里用原生 button 自己管焦点:
// 触发钮是 disclosure(aria-haspopup="menu" + aria-expanded),面板 role="menu"、项 role="menuitemradio"
// + aria-checked,方向键在项间走、Esc 关闭并把焦点还给触发钮、选中项有可见的对勾标识。
//
// 它**始终可用**(不随「生成中 / 转录加载中」禁用):选模型是给**下一轮**用的设置,不是对当前
// 转录的改动 —— 已在流式输出时换模型在 Claude / ChatGPT 里也是允许的。禁用只会在视觉上给出
// 「不可用」的错觉,而它其实随时可用。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ModelOption } from '../data/models'
import { SESSION_MODELS, modelById } from '../data/models'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  // 本会话当前选中的模型 id(空串 = 尚未选择,回落到目录默认)。
  modelId: string
}>()

const emit = defineEmits<{ select: [id: string] }>()

const { t } = useI18n()
const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)

// 当前模型 id:modelId 为空串(本会话尚未选择)时回落到目录默认 —— 选中标识与键盘落点都按
// **解析后**的 id 算,避免「显示默认模型、却没有任何一项被标为选中」。
const currentId = computed(() => modelById(props.modelId).id)

// 当前模型的展示名(品牌名两种语言同值)。
function nameOf(model: ModelOption): string {
  return t.value.workspace.models[model.nameKey]
}

// 上下文窗口的紧凑写法:200_000 → 200K、1_000_000 → 1M(等宽数字,列宽不跳动)。
function windowOf(model: ModelOption): string {
  const tokens = model.contextWindowTokens
  return tokens >= 1_000_000 ? `${Math.round(tokens / 1_000_000)}M` : `${Math.round(tokens / 1000)}K`
}

// 选项列表:聚焦第 index 项(键盘打开时落在当前项上)。
async function open(focusIndex: number | null): Promise<void> {
  if (isOpen.value) return
  isOpen.value = true
  if (focusIndex === null) return
  await nextTick()
  const options = optionElements()
  options[Math.min(focusIndex, options.length - 1)]?.focus()
}

function optionElements(): HTMLButtonElement[] {
  return Array.from(popoverRef.value?.querySelectorAll<HTMLButtonElement>('.model-menu__option') ?? [])
}

function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  // 离场节点随即从 vdom 摘除:直接设 inert,避免 Tab 落进正在淡出的选项。
  if (popoverRef.value !== null) popoverRef.value.inert = true
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function currentIndex(): number {
  const index = SESSION_MODELS.findIndex((model) => model.id === currentId.value)
  return index < 0 ? 0 : index
}

// 键盘派生的 click.detail 为 0:打开后聚焦当前项;指针打开不移焦点(disclosure 语义)。
function onTriggerClick(event: MouseEvent): void {
  if (isOpen.value) {
    close(false)
    return
  }
  void open(event.detail === 0 ? currentIndex() : null)
}

function onSelect(id: string): void {
  emit('select', id)
  close(true)
}

// 方向键在选项间走(循环),Esc 关闭并把焦点还给触发钮。
function moveFocus(step: number): void {
  const options = optionElements()
  if (options.length === 0) return
  const active = options.findIndex((option) => option === document.activeElement)
  const next = (active + step + options.length) % options.length
  options[next]?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && isOpen.value) {
    event.preventDefault()
    // 阻止冒泡:窄屏抽屉在 document 上也监听 Escape —— 不拦会让一次 Escape 同时关掉菜单与抽屉。
    event.stopPropagation()
    close(true)
    return
  }
  if (!isOpen.value) {
    // 触发钮上的 ↓ 打开并把焦点移进面板(Enter / Space 由原生 click 承担)。
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      void open(currentIndex())
    }
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveFocus(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveFocus(-1)
  }
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

defineExpose({ close })
</script>

<template>
  <div ref="rootRef" class="model-menu" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      ref="triggerRef" type="button" class="model-menu__trigger"
      :aria-label="`${t.workspace.modelMenu.label}：${nameOf(modelById(modelId))}`"
      :title="nameOf(modelById(modelId))"
      aria-haspopup="menu" :aria-expanded="isOpen"
      @click="onTriggerClick"
    >
      <span class="telemetry__model">{{ nameOf(modelById(modelId)) }}</span>
      <svg class="model-menu__caret" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
    <!-- 面板向上弹出:输入坞恒在对话视图底部,向下会跑出可视区。层序走 --dl-z-overlay。 -->
    <Transition name="model-menu-pop">
      <div
        v-if="isOpen" ref="popoverRef" class="model-menu__popover" role="menu"
        :aria-label="t.workspace.modelMenu.label"
      >
        <button
          v-for="model in SESSION_MODELS" :key="model.id" type="button" class="model-menu__option"
          role="menuitemradio" :aria-checked="model.id === currentId ? 'true' : 'false'"
          @click="onSelect(model.id)"
        >
          <span class="model-menu__option-head">
            <span class="model-menu__option-name">{{ nameOf(model) }}</span>
            <span class="model-menu__option-window">{{ t.workspace.modelMenu.window }} {{ windowOf(model) }}</span>
          </span>
          <span class="model-menu__option-desc">{{ t.workspace.modelDescriptions[model.descriptionKey] }}</span>
          <!-- 选中标识:对勾(形状,不只靠颜色)+ aria-checked。 -->
          <DliIcon v-if="model.id === currentId" name="check" size="sm" class="model-menu__check" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.model-menu { position: relative; display: inline-flex; min-width: 0; }
/* 触发钮:底行右侧的一枚**紧凑 chip**(与同行「归属项目」那枚 chip 同一套规格 —— 两者是
   这一行里相邻的、可切换的会话设定,必须看起来是一套东西)。形态依据(chip 通行最佳实践):
   · 高度取本仓密集行内控件档的下限 **24px**(胶囊),与遥测条 32 的行高留一档呼吸;
     触达 ≥24×24,正是 WCAG 2.5.8(AA)的尺寸下限;用 `min-block-size` 而非固定高,字号被
     用户放大时它是长高、不被裁(WCAG 1.4.4 / 1.4.12);
   · 一圈**发丝描边 + 圆角胶囊**把它读成「一枚标签」而非「一颗按钮」(层级以发丝描边为主);
   · 极窄卡片下名字截成省略号(全名仍在 aria-label / title 上),但 min-inline-size 保底一枚
     24 命中区,模型控件在任何宽度都不消失。 */
.model-menu__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
  min-block-size: var(--dl-space-6);
  min-inline-size: var(--dl-space-6);
  max-inline-size: 100%;
  padding-inline: var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  white-space: nowrap;
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard), border-color var(--dl-duration-fast) var(--dl-ease-standard), color var(--dl-duration-fast) var(--dl-ease-standard);
}
/* 模型名:可收缩 + 省略号(窄卡片里让位于上下文与状态,自己截字)。 */
.telemetry__model { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.model-menu__trigger:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); color: var(--dl-text-primary); }
.model-menu__trigger:active { background: var(--dl-bg-sunken); }
.model-menu__trigger[aria-expanded='true'] { color: var(--dl-text-primary); background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.model-menu__trigger:focus-visible { box-shadow: var(--dl-focus-ring); }
.model-menu__caret { width: var(--dl-icon-sm); height: var(--dl-icon-sm); flex: none; }
.model-menu__caret path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
/* 面板:抬起底 + 发丝描边,向上弹出。 */
.model-menu__popover {
  position: absolute;
  inset-block-end: calc(100% + var(--dl-space-1));
  inset-inline-end: 0;
  z-index: var(--dl-z-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  min-inline-size: 16rem;
  max-inline-size: 22rem;
  max-block-size: min(60dvh, 24rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--dl-space-1);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  box-shadow: var(--dl-shadow-md);
}
.model-menu__option {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  width: 100%;
  padding: var(--dl-space-2) var(--dl-space-3);
  padding-inline-end: var(--dl-space-8);
  border-radius: var(--dl-radius-sm);
  text-align: left;
}
.model-menu__option:hover { background: var(--dl-bg-hover); }
.model-menu__option:focus-visible { box-shadow: var(--dl-focus-ring); }
.model-menu__option-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--dl-space-2); }
.model-menu__option-name { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.model-menu__option-window { flex: none; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }
.model-menu__option-desc { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
/* 选中标识:绝对定位在右上,不占选项的排版宽度。 */
.model-menu__check { position: absolute; inset-block-start: var(--dl-space-2); inset-inline-end: var(--dl-space-2); color: var(--dl-accent); }
.model-menu-pop-enter-active, .model-menu-pop-leave-active { transition: opacity var(--dl-duration-fast) var(--dl-ease-standard), transform var(--dl-duration-fast) var(--dl-ease-standard); }
.model-menu-pop-enter-from, .model-menu-pop-leave-to { opacity: 0; transform: translateY(var(--dl-space-1)); }
@media (prefers-reduced-motion: reduce) {
  .model-menu-pop-enter-active, .model-menu-pop-leave-active { transition-duration: 0.01ms; }
}
</style>
