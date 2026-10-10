<script setup lang="ts">
// Agent 栏:工作台底栏那一整条,把「当前在哪个 Agent 下工作」表达成一条标签条,
// 并在 **Agent 级**聚合「需要你处理」的信号(未看过的等待交互 / 响应完成)。
//
// 为什么搬到这条底栏:Agent 是「在哪个域里工作」的选择,它决定侧栏的项目列表、顶部标签条上
// 的对话与文件、以及新会话的归属 —— 它是一个**应用级的上下文开关**,不是侧栏里的一个字段。
// 放进整宽底栏后它与侧栏解耦,侧栏只剩项目区(项目才属于当前 Agent)。
//
// 键盘与形态复用会话 tab 条(roving tabindex、←/→、Home/End、Enter/Space、放不下进 ▾ 菜单),
// 只有两处刻意的差别:
//   ① 当前项用**描边**表达(青瓷描边 + 一级文字 + 字重 500),**不铺填充底** —— 底栏本身就是一块
//      带底色的面板,标签若再填一层浅底会在面板上叠出第二个面;
//   ② 标签上多一枚 **Agent 级 Badge**:该 Agent 名下还有未看过的等待交互 / 响应完成会话时挂上,
//      两类并存取更紧急的一档(等待交互 > 响应完成),数量 > 1 时追加计数。
//
// 溢出菜单是**手写的 disclosure**(命名容器 + 原生按钮选项),不是 Naive UI 的 NDropdown ——
// 本仓实测后者的选项无 tabindex、键盘完全不可用。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AgentId } from '../contracts/generated/chat-session'
import type { AgentSignal } from '../contracts/generated/agent-signal'
import { useI18n } from '../i18n'

const props = defineProps<{
  // 当前选中的 Agent(受控:组件只读,变更走 select 事件)。
  value: AgentId
  // 三个 Agent 的固定顺序(与契约 AgentId 的取值集合一致);由页面给出,顺序的单一来源仍在页面。
  agents: readonly AgentId[]
  // 每个 Agent 的「需要你处理」计数(已排除看过的那部分);页面从 listAgentSignals 取。
  signals: readonly AgentSignal[]
}>()

const emit = defineEmits<{ select: [agent: AgentId] }>()

const { t } = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const stripRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const isMenuOpen = ref(false)

function agentName(agent: AgentId): string {
  return t.value.workspace.agents[agent]
}

// ---- Agent 级 Badge ----
// 两类信号并存时取更紧急的一档(等待交互 > 响应完成);文案与配色**全部复用**既有取值 ——
// 状态词取 sessionStatus(与 tab 上的 Badge 同一套词),配色取 --dl-warning / --dl-success 那一对。
// 数量 > 1 时在状态词后追加计数:一枚 Badge 同时说清「是什么」与「有几条」。
interface AgentBadge {
  level: 'warning' | 'success'
  word: string
  count: number
}

function badgeOf(agent: AgentId): AgentBadge | null {
  const signal = props.signals.find((item) => item.agentId === agent)
  if (signal === undefined) return null
  if (signal.awaiting > 0) return { level: 'warning', word: t.value.workspace.sessionStatus.awaiting, count: signal.awaiting }
  if (signal.completed > 0) return { level: 'success', word: t.value.workspace.sessionStatus.completed, count: signal.completed }
  return null
}

// ---- 溢出计算(复用会话 tab 条的算法:等宽 + clamp,不出现半截标签)----
// 三个 Agent 在宽屏恒全可见;窄屏放不下时,末尾的收进右侧 ▾ 菜单。可用宽由 ResizeObserver 观察。
const stripWidth = ref(0)
const tabMin = ref(200)
const tabMax = ref(268)
const tabGap = ref(4)
const triggerSize = ref(32)

// 读一遍本组用的取值(CSS 变量定义在 .workspace-page 上,故从根元素继承下来读)。
function measure(): void {
  const root = rootRef.value
  if (!(root instanceof HTMLElement)) return
  const style = getComputedStyle(root)
  tabMin.value = Number.parseFloat(style.getPropertyValue('--agent-tab-min')) || 200
  tabMax.value = Number.parseFloat(style.getPropertyValue('--agent-tab-max')) || 268
  triggerSize.value = Number.parseFloat(style.getPropertyValue('--workspace-nav-control-size')) || 32
  const stripStyle = stripRef.value === null ? null : getComputedStyle(stripRef.value)
  tabGap.value = stripStyle === null ? 4 : Number.parseFloat(stripStyle.columnGap) || 0
  stripWidth.value = root.clientWidth
}

const visibleCount = computed(() => {
  const total = props.agents.length
  if (total === 0) return 0
  // 首帧还没量到宽:先全显,避免闪一下再收起来。
  if (stripWidth.value <= 0) return total
  // 判「放得下」按**最长的那一档**算(tabMax),不是按下限 —— 标签定宽,若只证明「≥下限也放得下」
  // 就留着,标签会被压到比内容窄,中文名还看得见、英文(Agent 名 + 状态词都更长)就会被截。
  // 用上限判,则每个可见标签至少拿得到上限宽(或更宽),两种语言的内容都装得下。
  const need = tabMax.value * total + tabGap.value * (total - 1)
  if (need <= stripWidth.value) return total
  const usable = stripWidth.value - (triggerSize.value + tabGap.value)
  const fits = Math.max(1, Math.floor((usable + tabGap.value) / (tabMax.value + tabGap.value)))
  return Math.min(total, fits)
})

const agentWidth = computed(() => {
  const count = visibleCount.value
  if (count === 0) return tabMin.value
  const usable = stripWidth.value - (visibleCount.value < props.agents.length ? triggerSize.value + tabGap.value : 0)
  const even = (usable - tabGap.value * (count - 1)) / count
  return Math.max(tabMin.value, Math.min(tabMax.value, even))
})

// 可见标签:取前 visibleCount 个;**当前 Agent 永远可见** —— 不在窗口内时用它顶掉末位可见项
// (被顶掉的进菜单)。与会话 tab 条同一条规则:当前项不能藏进「更多」。
const visibleAgents = computed(() => {
  const list = props.agents
  const count = visibleCount.value
  if (count >= list.length) return list
  const window = list.slice(0, count)
  if (window.includes(props.value)) return window
  return [...window.slice(0, count - 1), props.value]
})

const hiddenAgents = computed(() => props.agents.filter((agent) => !visibleAgents.value.includes(agent)))

// ---- roving tabindex(WAI-ARIA APG Tabs)----
// 恰一个标签 tabindex="0"(跟焦点走,默认 = 当前 Agent),aria-selected="true" 仅当前那一个。
const focusedAgent = ref<AgentId | ''>('')
const tabStop = computed<AgentId | ''>(() => {
  const list = visibleAgents.value
  if (list.length === 0) return ''
  if (list.includes(focusedAgent.value as AgentId)) return focusedAgent.value as AgentId
  if (list.includes(props.value)) return props.value
  return list[0] ?? ''
})

function focusAgent(agent: AgentId): void {
  focusedAgent.value = agent
  stripRef.value?.querySelector<HTMLElement>(`.agent-bar__tab[data-agent="${agent}"]`)?.focus()
}

// ←/→ 只移动焦点并回绕,**不切换 Agent**;Enter / Space 才激活。手动激活是硬要求:
// 每次切换都要重取项目 / 会话 / 转录,自动激活会让按住方向键连拉一串请求。
function onStripKeydown(event: KeyboardEvent): void {
  const list = visibleAgents.value
  if (list.length === 0) return
  const target = event.target
  const current = target instanceof HTMLElement ? target.dataset.agent : undefined
  const index = list.findIndex((agent) => agent === current)
  if (index < 0) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const agent = list[index]
    if (agent !== undefined) emit('select', agent)
    return
  }
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % list.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + list.length) % list.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = list.length - 1
  else return
  event.preventDefault()
  const nextAgent = list[next]
  if (nextAgent !== undefined) focusAgent(nextAgent)
}

function select(agent: AgentId): void {
  emit('select', agent)
  close(true)
}

// ---- 溢出菜单(disclosure)----
function close(restoreFocus: boolean): void {
  if (!isMenuOpen.value) return
  // 离场节点已从 vdom 摘除,直接设 inert,避免 Tab 落入正在淡出的选项。
  if (panelRef.value !== null) panelRef.value.inert = true
  isMenuOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function onTriggerClick(event: MouseEvent): void {
  if (isMenuOpen.value) {
    close(false)
    return
  }
  isMenuOpen.value = true
  // 键盘派生的 click(detail = 0)打开后聚焦首项;指针打开不移焦点。
  if (event.detail === 0) void nextTick(() => panelRef.value?.querySelector('button')?.focus())
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !isMenuOpen.value) return
  event.preventDefault()
  // 阻止冒泡:窄屏抽屉在 document 上也监听 Escape,冒泡过去会让一次按键同时关掉两层。
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

let observer: ResizeObserver | undefined

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  measure()
  if (rootRef.value !== null && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    observer.observe(rootRef.value)
  }
  window.addEventListener('resize', measure)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div ref="rootRef" class="agent-bar" @focusout="onFocusOut" @keydown="onKeydown">
    <div ref="stripRef" class="agent-bar__strip" role="tablist" :aria-label="t.workspace.agentSelector" @keydown="onStripKeydown">
      <button
        v-for="agent in visibleAgents"
        :key="agent"
        type="button"
        role="tab"
        class="agent-bar__tab"
        :data-agent="agent"
        :aria-selected="agent === value"
        :tabindex="agent === tabStop ? 0 : -1"
        :style="{ width: `${agentWidth}px` }"
        @click="emit('select', agent)"
        @focus="focusedAgent = agent"
      >
        <span class="agent-bar__name">{{ agentName(agent) }}</span>
        <span v-if="badgeOf(agent)" class="agent-bar__badge" :data-level="badgeOf(agent)?.level">
          {{ badgeOf(agent)?.word }}<span v-if="(badgeOf(agent)?.count ?? 0) > 1" class="agent-bar__badge-count">{{ badgeOf(agent)?.count }}</span>
        </span>
      </button>
    </div>
    <button
      v-if="hiddenAgents.length > 0"
      ref="triggerRef"
      type="button"
      class="agent-bar__trigger"
      :aria-expanded="isMenuOpen"
      aria-controls="agent-bar-panel"
      :aria-label="`${t.workspace.agentBar.menu},${t.workspace.agentBar.collapsed.replace('{count}', String(hiddenAgents.length))}`"
      @click="onTriggerClick"
    >
      <svg class="agent-bar__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      <span class="agent-bar__count" aria-hidden="true">{{ hiddenAgents.length }}</span>
    </button>
    <Transition name="agent-bar-pop">
      <div v-if="isMenuOpen" id="agent-bar-panel" ref="panelRef" class="agent-bar__panel" role="group" :aria-label="t.workspace.agentBar.menu">
        <button
          v-for="agent in hiddenAgents"
          :key="agent"
          type="button"
          class="agent-bar__option"
          :class="{ 'agent-bar__option--current': agent === value }"
          :aria-current="agent === value ? 'true' : undefined"
          @click="select(agent)"
        >
          <span class="agent-bar__name">{{ agentName(agent) }}</span>
          <span v-if="badgeOf(agent)" class="agent-bar__badge" :data-level="badgeOf(agent)?.level">
            {{ badgeOf(agent)?.word }}<span v-if="(badgeOf(agent)?.count ?? 0) > 1" class="agent-bar__badge-count">{{ badgeOf(agent)?.count }}</span>
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 条:标签条 + 右端溢出钮。横向排布、垂直居中;宽度吃满所在的面(底栏的内容宽)。 */
.agent-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  width: 100%;
  min-width: 0;
  /* 本组自己的尺寸档:标签的最小 / 最大宽与间隙(溢出计算按它们算「能放几个」)。
     上限取 268 而非更小:英文的「Agent 名 + 状态词」是最宽的一档(如
     planning agent + Response complete),下限若压到内容宽以下,英文名的结尾会被省略掉;
     上限是「内容装得下」的下界,故判「放得下」也按它算。 */
  --agent-tab-min: 200px;
  --agent-tab-max: 268px;
}

.agent-bar__strip {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
}

/* 单个标签:圆角矩形的**描边**标签(不铺填充底)。高走紧凑导航行档(32)—— 它是横向密集行
   内的控件,判据沿用 WCAG 2.5.8 的间距替代方案(横排下中心距天然远大于 24)。
   标签定宽(见 agentWidth):名称左对齐、Badge 推到右缘 —— 名称的位置因此恒定,状态出现 /
   消失都不会让它横移(定宽的那段空处就是 Badge 的预留槽)。 */
.agent-bar__tab {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  block-size: var(--workspace-nav-control-size);
  padding-inline: var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background: transparent;
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  font-weight: 400;
  text-align: start;
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard), border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.agent-bar__tab:hover:not([aria-selected='true']) {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.agent-bar__tab:active {
  transform: translateY(var(--dl-lift-press));
}

.agent-bar__tab:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 当前项:**只换描边**(青瓷色)+ 文字提到一级 + 字重 500 —— 三个非填充线索,
   底栏的面因此不被第二层浅底盖住(与会话 tab 的「填充 + 字重」刻意不同,那是为了区分两者
   分别是「切换 Agent」与「切换对话」两件事)。 */
.agent-bar__tab[aria-selected='true'] {
  border-color: var(--dl-accent);
  color: var(--dl-text-primary);
  font-weight: 500;
}

/* 名称:吃满标签剩余宽(定宽标签里它占左边、Badge 靠右),单行省略;定宽 + 左对齐使名称位置
   恒定,状态出现 / 消失不会横移它。 */
.agent-bar__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Agent 级 Badge:底用状态色的浅底、字用状态色本身(与 tab 上的状态 Badge 同一配方)。
   等待交互 = 警告档,响应完成 = 成功档;文字自带语义,颜色只作加固。 */
.agent-bar__badge {
  flex: none;
  padding: 0 var(--dl-space-1);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  white-space: nowrap;
}

.agent-bar__badge[data-level='warning'] {
  color: var(--dl-warning);
  background: var(--dl-warning-subtle);
}

.agent-bar__badge[data-level='success'] {
  color: var(--dl-success);
  background: var(--dl-success-subtle);
}

/* 计数与状态词之间留一点缝,避免「响应完成2」读成一个连写的词。 */
.agent-bar__badge-count {
  margin-inline-start: var(--dl-space-1);
  font-variant-numeric: tabular-nums;
}

/* 溢出钮:与标签同高同族(描边 + 紧凑导航行档),右端常驻的入口;计数徽标是纯数字,不抢状态词。 */
.agent-bar__trigger {
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--workspace-nav-control-size);
  block-size: var(--workspace-nav-control-size);
  padding: 0;
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary);
  background: transparent;
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard), border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.agent-bar__trigger:hover {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.agent-bar__trigger:active {
  transform: translateY(var(--dl-lift-press));
}

.agent-bar__trigger:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.agent-bar__caret {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  color: var(--dl-text-secondary);
}

.agent-bar__caret path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}

/* 收起计数:挂在溢出钮的右上角内侧(与文件栏 / 会话菜单同一手法),不进盒模型,故钮恒为 32×32。 */
.agent-bar__count {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: calc(-1 * var(--dl-space-1));
  min-width: var(--dl-icon-sm);
  padding: 0 var(--dl-border-width);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-bg-sunken);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  line-height: var(--dl-line-snug);
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* 菜单浮层:锚到本条(最近的可定位祖先),右缘对齐条右缘;向上弹 —— 底栏在屏幕底部,
   向下会被视口裁掉。**向上留两档**(--dl-space-3)而不是一档:本条住在带内边距的底栏面板里,
   一档的间距会让浮层底边落进面板顶边之内(实测压住 4px);两档把浮层整个抬到面板之上。
   宽度按内容,但钳在视口内(窄屏不越界)。 */
.agent-bar__panel {
  position: absolute;
  inset-block-end: calc(100% + var(--dl-space-3));
  inset-inline-end: 0;
  z-index: var(--dl-z-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  padding: var(--dl-space-1);
  max-width: min(320px, calc(100vw - 2 * var(--dl-space-4)));
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  box-shadow: var(--dl-shadow-lg);
}

.agent-bar__option {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-width: var(--dl-target-size);
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
  text-align: left;
  white-space: nowrap;
}

.agent-bar__option:hover {
  background: var(--dl-bg-hover);
}

.agent-bar__option:active {
  transform: translateY(var(--dl-lift-press));
}

.agent-bar__option:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.agent-bar__option--current {
  font-weight: 500;
}

.agent-bar-pop-enter-active,
.agent-bar-pop-leave-active {
  transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard);
}

.agent-bar-pop-enter-from,
.agent-bar-pop-leave-to {
  opacity: 0;
  transform: translateY(var(--dl-space-1));
}

@media (prefers-reduced-motion: reduce) {
  .agent-bar__tab:active,
  .agent-bar__trigger:active,
  .agent-bar__option:active {
    transform: none;
  }
}
</style>
