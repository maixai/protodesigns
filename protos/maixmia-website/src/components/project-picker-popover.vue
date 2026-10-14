<script setup lang="ts">
// 项目选择浮层:**锚定触发点**的一张小面板,列出当前 Agent 已打开的全部项目,让用户挑一个。
//
// 载体选型(三个触发点共用同一个组件):tab 条的 ＋(新建对话)、引导页主按钮(同一个动作)、
// 输入坞底行的归属 chip(改归属),三处都是「必须选一个项目」的场景,故语义取 **listbox 单选**,
// 不取 menu —— ARIA 作者指南指出 menu button 不能标 required、且折叠态不携带「当前值」,
// 不适合「必须选一个」的决策。容器 role="listbox"、每项 role="option" + aria-selected,
// 高亮游标用 roving tabindex(焦点真的落在选项上,Enter / Space 由原生按钮承担)。
//
// 它只管「选一个项目」这一件事:标题文案与选中之后干什么由调用方给(见 props.title / select 事件)。
//
// 交互要点(逐条对齐 APG 的 listbox 与 popover 惯例):
//   · 打开即把焦点交给高亮项 —— 始终有一个高亮项,Enter 永远有确定落点;
//   · ↓ / ↑ 在选项间移动(夹在两端,不回绕)、Home / End 到首 / 末项;
//   · Enter 接受**当前高亮项**;Esc 取消,什么都不选,并把焦点还给触发元素;
//   · **不设可见的「取消」钮**:点浮层外面、Esc、把焦点移出浮层,三者都是同一件事 —— 取消。
//     多一枚取消钮只是把同一件事再说一遍,还占掉面板底部一整行;点空白处即取消也更贴近用户的
//     思维模型(与 macOS / Windows 的菜单、以及本仓 model-menu 的处置一致);
//   · Tab 不被拦截:焦点离开浮层即由 focusout 收口取消(与 Esc 同效,只是不还焦点);
//   · 点浮层外部 = 取消(不抢走用户点向别处的焦点,故不还焦点);
//   · 定位:默认落在触发点下方,下方放不下则上翻(与 project-menu 的 measurePlacement 同思路,
//     但基准是视口而非某个滚动容器);横向夹进视口,不越出屏幕。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Project } from '../contracts/generated/project'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { identityClassOf } from '../data/project-identity'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  // 已打开的项目(按侧栏顺序 —— 顺序不重排:项目只有 2–8 个,用户靠位置记忆,
  // 「相关项置顶」会让同一个选择器每次顺序不同,反而不可预期)。
  projects: Project[]
  // 高亮项(推断出的那个项目)。不在列表里 / 空串时回落到首项。
  highlightId: string
  // 面板标题(如「在哪个项目里新建对话」)。由调用方按用途给。
  title: string
  // 触发元素在视口里的矩形(浮层据此锚定)。
  anchor: WindowRect
}>()

const emit = defineEmits<{
  select: [projectId: string]
  cancel: []
}>()

const panelRef = ref<HTMLElement | null>(null)
// 关闭后要把焦点还给的元素:打开时浮层还没挂载,故在挂载那一刻记下当时的焦点持有者
// (与 project-picker-dialog 同一套做法)。
const returnFocusRef = ref<HTMLElement | null>(null)
// 游标 = 当前高亮项(roving tabindex 的那一个)。
const focusedId = ref('')
const placement = ref<'below' | 'above'>('below')
const insetInlineStart = ref<number | null>(null)

const panelId = `project-picker-${Math.random().toString(36).slice(2)}`
const titleId = `${panelId}-title`

// 视口内边距:浮层不许贴边(几何运算是数学,不是视觉取值;与 --dl-space-2 同量级)。
const VIEW_PADDING = 8

// 触发点的统一标记(三处触发钮都带):tab 条的 ＋、引导页主按钮、输入坞底行的归属 chip。
// 浮层据此把它们与「浮层外面」区分开 —— 见 onFocusOut / onDocumentPointerDown 的说明。
const TRIGGER_SELECTOR = '[data-project-picker-trigger]'

function isTriggerElement(node: EventTarget | null): boolean {
  return node instanceof Element && node.closest(TRIGGER_SELECTOR) !== null
}

// 高亮项的回落:推断不出(区域空 / 成员跨项目 / 从引导页发起)时取首项 —— 列表里永远有游标。
const resolvedHighlightId = computed(() => {
  const found = props.projects.find((project) => project.id === props.highlightId)
  return found?.id ?? props.projects[0]?.id ?? ''
})

const panelStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (placement.value === 'below') style['top'] = `${props.anchor.y + props.anchor.height}px`
  else style['bottom'] = `${window.innerHeight - props.anchor.y}px`
  style['left'] = `${insetInlineStart.value ?? props.anchor.x}px`
  return style
})

function optionElements(): HTMLButtonElement[] {
  return Array.from(panelRef.value?.querySelectorAll<HTMLButtonElement>('.project-picker__option') ?? [])
}

function focusOption(index: number): void {
  const options = optionElements()
  const target = options[Math.max(0, Math.min(index, options.length - 1))]
  target?.focus()
}

function select(projectId: string): void {
  emit('select', projectId)
}

function cancel(restoreFocus: boolean): void {
  if (restoreFocus) returnFocusRef.value?.focus()
  emit('cancel')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    // 阻止冒泡:窄屏抽屉在 document 上也监听 Escape,不拦会让一次 Escape 同时关掉浮层与抽屉。
    event.stopPropagation()
    cancel(true)
    return
  }
  const options = optionElements()
  if (options.length === 0) return
  const current = options.findIndex((option) => option === document.activeElement)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusOption(current < 0 ? 0 : current + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusOption(current < 0 ? 0 : current - 1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    focusOption(0)
  } else if (event.key === 'End') {
    event.preventDefault()
    focusOption(options.length - 1)
  }
}

// 焦点离开浮层(走到浮层外的某个元素)即取消:Tab 走到取消钮仍在浮层内,不算离开。
// **触发点是例外**:它是同一个 disclosure 的一部分(Tab / Shift+Tab 落回触发钮时浮层不该关,
// 关闭与否由触发钮自己的 toggle 决定,见 onDocumentPointerDown 的注释)。
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && panelRef.value?.contains(next) === true) return
  if (isTriggerElement(next)) return
  cancel(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && panelRef.value?.contains(target) === true) return
  // 按在**触发钮**上不算「点浮层外面」:否则按下时先判成点外面 → 取消,紧接着触发钮自己的
  // click 又把它打开,净效果是「浮层开着时再点触发钮没反应」(aria-expanded 恒 true,实测)。
  // 让 pointerdown 放过它、把开关交给触发钮的 toggle,才是 disclosure 该有的行为。
  if (isTriggerElement(target)) return
  cancel(false)
}

// 定位与初始焦点:等一次布局落定再量 —— 高度 / 宽度必须量过才知道该不该上翻、横向要夹多少。
// 换触发点由调用方用 :key 重挂载(新实例、新样式,不与旧锚点纠缠);本函数只服务挂载这一次。
async function place(): Promise<void> {
  await nextTick()
  const panel = panelRef.value
  if (panel === null) return
  const rect = panel.getBoundingClientRect()
  const spaceBelow = window.innerHeight - (props.anchor.y + props.anchor.height)
  if (spaceBelow < rect.height && props.anchor.y > rect.height) placement.value = 'above'
  else placement.value = 'below'
  const maxLeft = window.innerWidth - rect.width - VIEW_PADDING
  insetInlineStart.value = Math.max(VIEW_PADDING, Math.min(props.anchor.x, Math.max(VIEW_PADDING, maxLeft)))
}

onMounted(async () => {
  const active = document.activeElement
  returnFocusRef.value = active instanceof HTMLElement ? active : null
  focusedId.value = resolvedHighlightId.value
  document.addEventListener('pointerdown', onDocumentPointerDown)
  await place()
  const index = props.projects.findIndex((project) => project.id === focusedId.value)
  focusOption(index < 0 ? 0 : index)
})

onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div
    ref="panelRef"
    class="project-picker"
    :class="{ 'is-above': placement === 'above' }"
    :style="panelStyle"
    @keydown="onKeydown"
    @focusout="onFocusOut"
  >
    <p :id="titleId" class="project-picker__title">{{ title }}</p>
    <!-- 选项列表:listbox 里**只放 option**(标题与取消钮都在它外面),这是 ARIA 对该角色的要求。 -->
    <div class="project-picker__list" role="listbox" :aria-labelledby="titleId">
      <button
        v-for="project in projects"
        :key="project.id"
        type="button"
        class="project-picker__option"
        :class="identityClassOf(project.path)"
        role="option"
        :data-project-id="project.id"
        :aria-selected="project.id === focusedId"
        :tabindex="project.id === focusedId ? 0 : -1"
        @focus="focusedId = project.id"
        @click="select(project.id)"
      >
        <!-- 三通道归属(与 tab / 侧栏同源):色点(颜色)+ 等宽缩写(文字,色觉障碍下唯一可用)+
             名称与项目内路径。颜色**不是唯一指示** —— 缩写与名称始终在场。 -->
        <span class="project-picker__dot" aria-hidden="true" />
        <span class="project-picker__mark" aria-hidden="true">{{ project.mark }}</span>
        <span class="project-picker__text">
          <span class="project-picker__name">{{ project.name }}</span>
          <span class="project-picker__path">{{ project.path }}</span>
        </span>
        <!-- 高亮项另给一枚对勾(形状,不只靠颜色)。 -->
        <DliIcon v-if="project.id === focusedId" name="check" size="sm" class="project-picker__check" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 浮层:锚定触发点、position: fixed(与触发元素同处视口坐标系),层序走 --dl-z-overlay。 */
.project-picker {
  position: fixed;
  z-index: var(--dl-z-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  inline-size: max-content;
  min-inline-size: 16rem;
  max-inline-size: min(22rem, calc(100vw - 2 * var(--dl-space-3)));
  /* 与触发点之间留一档间隙:下方弹出时留在上边距上,上翻时落在下边距上(见 .is-above)。 */
  margin-block-start: var(--dl-space-1);
  padding: var(--dl-space-3);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  box-shadow: var(--dl-shadow-md);
}

.project-picker.is-above {
  margin-block-start: 0;
  margin-block-end: var(--dl-space-1);
}

.project-picker__title {
  font-size: var(--dl-font-size-sm);
  font-weight: 500;
  line-height: var(--dl-line-snug);
  color: var(--dl-text-primary);
}

.project-picker__list {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
}

/* 选项:整行是可点区(独立控件档 44px 触达),内部两段式(名称 / 项目内路径)。 */
.project-picker__option {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  inline-size: 100%;
  min-block-size: var(--dl-target-size);
  padding: var(--dl-space-1) var(--dl-space-2);
  padding-inline-end: var(--dl-space-8);
  border-radius: var(--dl-radius-sm);
  text-align: start;
}

.project-picker__option:hover,
.project-picker__option:focus-visible {
  background: var(--dl-bg-hover);
}

.project-picker__option:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.project-picker__option[aria-selected='true'] {
  background: var(--dl-accent-soft);
}

.project-picker__dot {
  flex: none;
  inline-size: var(--dl-identity-dot-size);
  block-size: var(--dl-identity-dot-size);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-identity);
}

/* 项目缩写是**文字通道**(色觉障碍下唯一可用的那条),等宽、小号 —— 与 tab 上的前缀同一写法。 */
.project-picker__mark {
  flex: none;
  inline-size: 2.5em;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-tertiary);
}

.project-picker__text {
  flex: 1;
  min-inline-size: 0;
  display: grid;
  gap: 2px;
}

.project-picker__name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

.project-picker__path {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.project-picker__check {
  position: absolute;
  inset-inline-end: var(--dl-space-2);
  color: var(--dl-accent);
}
</style>
