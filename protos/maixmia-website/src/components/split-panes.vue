<script setup lang="ts">
// 区域树的分栏渲染:按 surfaces 的 parentId 邻接表**递归**展开 —— 一个区域先渲染它自己的内容区,
// 再沿它的 axis 渲染它的各个子区域,两者之间夹一条分隔线。
//
// 本组件只管**几何**:谁挨着谁、各占多少比例、分隔线怎么调。区域里显示文件还是对话、要不要输入坞,
// 由页面经 #pane 作用域插槽给出(surfaceId 作为插槽参数),故分栏逻辑与内容类型无关。
//
// 区域是**混合节点**(契约的扁平平面上没有「容器 / 叶子」之分):一个区域既持有自己的 tab 组,
// 又可以沿 axis 容纳子区域。于是 items = [自身内容, ...子区域],各自按权重分配空间。
//
// 分隔线是 APG **Window Splitter**:role="separator" + aria-valuenow/min/max(百分比)+
// aria-orientation,可聚焦、方向键调一步、Home/End 到极值。命中区取本仓密集档 24px ——
// 它是一个**结构性内联控件**(不是独立的功能按钮):24px 已满足 WCAG 2.5.8 的最小目标尺寸
// (另一维是整块区域的长度,远大于 24),故无需动用「间距替代方案」。
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Surface } from '../contracts/generated/surface'
import type { WorkspaceLayout } from '../contracts/generated/workspace-layout'
import { MIN_SEPARATOR_PERCENT, OWN_WEIGHT, separatorPercent, visibleChildSurfaces, visibleMemberWindows } from '../data/windows'
import { useI18n } from '../i18n'

// 分隔线每次按键调整的幅度(百分点)。Home / End 直接到极值(见 setSeparatorPercent 的边界)。
const STEP_PERCENT = 5

// #pane 作用域插槽的参数形状(页面按 surfaceId 渲染那一块区域的内容)。
// 显式声明而不靠推断:本组件**递归引用自己**并把插槽原样透传给下一层,
// 让编译器从用法推断插槽类型会形成「自己依赖自己」的环。
type PaneSlot = { surfaceId: string }
defineSlots<{ pane: (props: PaneSlot) => unknown }>()

const props = defineProps<{
  layout: WorkspaceLayout
  surfaceId: string
  // 调分隔线的落点:交给页面写回布局(组件自身不持有状态)。
  resizeHandler: (parentId: string, index: number, percent: number) => void
}>()

const { t } = useI18n()

// 子区域(按数组顺序 = 排布顺序)。**被整块最小化的显示区不参与渲染与空间分配** ——
// 它仍在区域树里(parentId / axis / weight 原样保留),恢复时原位置重新出现。
const children = computed<Surface[]>(() => visibleChildSurfaces(props.layout, props.surfaceId))
// 本区域排布子区域的方向(row 横排 / column 竖排)。
const axis = computed<Surface['axis']>(() => props.layout.surfaces.find((surface) => surface.id === props.surfaceId)?.axis ?? 'row')
// 分隔线在横向排布下是竖线(aria-orientation=vertical),纵向排布下是横线。
const separatorOrientation = computed<'vertical' | 'horizontal'>(() => (axis.value === 'row' ? 'vertical' : 'horizontal'))
// ---- 区域自身分栏项是否渲染(全仓只写这一处)----
// 区域是**混合节点**:既可能是内容区(有成员),也可能只是容器(无成员、仅容子区域)。
// 规则:渲染自身分栏项 ⟺ **有可见成员** || **没有可见子区域**。
//   · 「可见成员」而不是「members.length」:页签被整组收进底栏后,成员仍在数组里但不可见;
//     此时若还有可见子区域,自身内容区不该占位(否则根区域会显示一张创建会话引导页,
//     把本应让给右侧子区域的空间又占回去 —— 实测的左侧最小化 bug);
//   · 叶子区域被清空 → 页面已用 removeSurface 把它摘除,故叶子必有可见成员或整块被隐藏;
//   · 根区域是唯一可能「无可见成员、但有可见子区域」的节点 —— 它只作容器,自身内容区不渲染。
// 自身项不渲染时,它与首个子区域之间那条分隔线也不渲染(否则会出现一条没有左邻的线)。
const showSelf = computed<boolean>(() => {
  return visibleMemberWindows(props.layout, props.surfaceId).length > 0 || children.value.length === 0
})

// ---- 窄容器降级与最小可读宽度 ----
// 横向分栏在窄容器里会把正文列压到几个字一行(实测 375 双栏正文只剩 86px)。
// 规则:任一栏分不到 320px,就把这块区域改为**纵向堆叠**,两栏都拿到完整宽度;
// 宽容器里则把分隔线夹在像素下限上,避免拖到 10% 时出现不可读的窄条。
const MIN_PANE_WIDTH = 320
// 与 `.split-separator` 的 `flex-basis`(--dl-space-6)一致。
const SEPARATOR_SIZE = 24
const rootRef = ref<HTMLElement | null>(null)
const rootWidth = ref(0)
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const root = rootRef.value
  if (root === null) return
  rootWidth.value = root.getBoundingClientRect().width
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry !== undefined) rootWidth.value = entry.contentRect.width
  })
  resizeObserver.observe(root)
})
onBeforeUnmount(() => { resizeObserver?.disconnect() })

// 分栏项 = [自身内容(若渲染), ...子区域],与模板的排布顺序一致。
const itemWeights = computed<number[]>(() => {
  const weights = children.value.map((child) => child.weight)
  return showSelf.value ? [OWN_WEIGHT, ...weights] : weights
})
const separatorCount = computed(() => Math.max(0, itemWeights.value.length - 1))
const totalWeight = computed(() => itemWeights.value.reduce((sum, weight) => sum + weight, 0) || 1)
const availableWidth = computed(() => Math.max(0, rootWidth.value - separatorCount.value * SEPARATOR_SIZE))
// 任一相邻对放不下两个 320px 的栏,或当前权重下**任一栏**分不到 320px → 纵向堆叠。
// 第二条必须按当前权重逐栏判:窗口从宽缩窄时,存储的百分比可能仍是宽屏下的 25%,
// 只按 50/50 估算会漏掉 243px / 182px 这种「缩窄后才出现」的窄栏。
const shouldStack = computed<boolean>(() => {
  if (axis.value !== 'row' || rootWidth.value <= 0) return false
  const weights = itemWeights.value
  if (weights.length * MIN_PANE_WIDTH + separatorCount.value * SEPARATOR_SIZE > rootWidth.value) return true
  const available = availableWidth.value
  return weights.some((weight) => (available * weight) / totalWeight.value < MIN_PANE_WIDTH)
})
const renderAxis = computed<Surface['axis']>(() => (shouldStack.value ? 'column' : axis.value))
// 分隔线可调范围:左右两栏都不得窄于 MIN_PANE_WIDTH。按当前权重算出这一对的可用宽度,
// 再把百分比下限夹到 10–50 之间(上限对称)。
function separatorMinPercent(index: number): number {
  if (rootWidth.value <= 0) return MIN_SEPARATOR_PERCENT
  const weights = itemWeights.value
  const pairWeight = (weights[index] ?? 0) + (weights[index + 1] ?? 0)
  if (pairWeight <= 0) return MIN_SEPARATOR_PERCENT
  const pairWidth = (availableWidth.value * pairWeight) / totalWeight.value
  if (pairWidth <= 0) return MIN_SEPARATOR_PERCENT
  return Math.min(50, Math.max(MIN_SEPARATOR_PERCENT, Math.ceil((MIN_PANE_WIDTH / pairWidth) * 100)))
}

// ---- 指针拖分隔线 ----
let dragIndex = -1
let dragPointerId = -1
let dragStartPos = 0
let dragStartPercent = 50

function onSeparatorPointerDown(event: PointerEvent, index: number): void {
  if (event.button !== 0) return
  dragIndex = index
  dragPointerId = event.pointerId
  dragStartPos = axis.value === 'row' ? event.clientX : event.clientY
  dragStartPercent = Math.min(100 - separatorMinPercent(index), Math.max(separatorMinPercent(index), separatorPercent(props.layout, props.surfaceId, index)))
  const element = event.currentTarget
  if (element instanceof HTMLElement) element.setPointerCapture(event.pointerId)
}

function onSeparatorPointerMove(event: PointerEvent): void {
  if (dragIndex < 0 || event.pointerId !== dragPointerId) return
  const container = rootRef.value
  if (container === null) return
  const rect = container.getBoundingClientRect()
  const size = axis.value === 'row' ? rect.width : rect.height
  if (size <= 0) return
  const current = axis.value === 'row' ? event.clientX : event.clientY
  const min = separatorMinPercent(dragIndex)
  const next = dragStartPercent + ((current - dragStartPos) / size) * 100
  props.resizeHandler(props.surfaceId, dragIndex, Math.min(100 - min, Math.max(min, next)))
}

function onSeparatorPointerUp(event: PointerEvent): void {
  if (event.pointerId !== dragPointerId) return
  dragIndex = -1
  dragPointerId = -1
}

// ---- 键盘调分隔线(APG Window Splitter)----
// 值 = 分隔线**左侧**那一项占两侧之和的百分比。右 / 下方向键把分隔线往右 / 下推(左侧变大),
// 左 / 上方向键相反;Home 到最小、End 到最大。
function onSeparatorKeydown(event: KeyboardEvent, index: number): void {
  const min = separatorMinPercent(index)
  const max = 100 - min
  const current = Math.min(max, Math.max(min, separatorPercent(props.layout, props.surfaceId, index)))
  let next: number | null = null
  if (event.key === 'Home') next = min
  else if (event.key === 'End') next = max
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current + STEP_PERCENT
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = current - STEP_PERCENT
  if (next === null) return
  event.preventDefault()
  props.resizeHandler(props.surfaceId, index, Math.min(max, Math.max(min, next)))
}
</script>

<template>
  <!-- 叶子区域:没有子区域时就是一个撑满的单格容器(不产生任何额外视觉)。
       有子区域时:自身分栏项按 showSelf 规则决定是否渲染(见脚本注释)。 -->
  <div ref="rootRef" class="split" :class="{ 'split--stacked': shouldStack }" :data-axis="renderAxis">
    <div v-if="showSelf" class="split__item" :style="{ flexGrow: shouldStack ? 1 : OWN_WEIGHT }">
      <slot name="pane" :surface-id="surfaceId" />
    </div>
    <template v-for="(child, index) in children" :key="child.id">
      <div
        v-if="!shouldStack && (showSelf || index > 0)"
        class="split-separator"
        role="separator"
        tabindex="0"
        :aria-orientation="separatorOrientation"
        :aria-valuenow="separatorPercent(layout, surfaceId, index)"
        :aria-valuemin="separatorMinPercent(index)"
        :aria-valuemax="100 - separatorMinPercent(index)"
        :aria-label="t.workspace.regions.resizeSeparator"
        :title="`${t.workspace.regions.resizeSeparator} · ${t.workspace.regions.resizeHint}`"
        @keydown="onSeparatorKeydown($event, index)"
        @pointerdown="onSeparatorPointerDown($event, index)"
        @pointermove="onSeparatorPointerMove"
        @pointerup="onSeparatorPointerUp"
        @pointercancel="onSeparatorPointerUp"
      />
      <div class="split__item" :style="{ flexGrow: shouldStack ? 1 : child.weight }">
        <SplitPanes :layout="layout" :surface-id="child.id" :resize-handler="resizeHandler">
          <template #pane="{ surfaceId }: PaneSlot"><slot name="pane" :surface-id="surfaceId" /></template>
        </SplitPanes>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 分栏容器:flex 一行 / 一列,子项按权重分配。它占满父项(可能就是页面外壳网格的那一格)。 */
.split {
  display: flex;
  min-width: 0;
  min-height: 0;
}

.split[data-axis='row'] {
  flex-direction: row;
}

.split[data-axis='column'] {
  flex-direction: column;
}

/* 分栏项:用 grid 的单格承载内容 —— 被插槽放进来的那一块会**自动撑满**这一格,
   不必给内容本身写任何尺寸规则(内容由页面渲染,拿不到本组件的 scoped 作用域)。 */
.split__item {
  display: grid;
  flex: 0 1 0;
  min-width: 0;
  min-height: 0;
}

/* 纵向堆叠是窄容器的降级形态:两栏都要有**可用的高度**(标题 + 输入坞 + 至少 4–6 行转录),
   整块区域在高度不足时纵向滚动,而不是把每栏压到只剩输入坞。 */
.split--stacked { overflow-y: auto; overscroll-behavior: contain; row-gap: var(--dl-space-2); }
.split--stacked > .split__item { min-block-size: 420px; }

/* 分隔线:整条命中区 24px(密集档),视觉上只在正中画一条发丝线;线平时克制、悬停 / 聚焦提色。 */
.split-separator {
  position: relative;
  flex: 0 0 var(--dl-space-6);
  align-self: stretch;
  touch-action: none;
  cursor: col-resize;
}

.split[data-axis='column'] > .split-separator {
  cursor: row-resize;
}

.split-separator::before {
  content: '';
  position: absolute;
  background: var(--dl-border-base);
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.split[data-axis='row'] > .split-separator::before {
  inset-block: 0;
  inset-inline-start: calc(50% - var(--dl-border-width) / 2);
  inline-size: var(--dl-border-width);
}

.split[data-axis='column'] > .split-separator::before {
  inset-inline: 0;
  inset-block-start: calc(50% - var(--dl-border-width) / 2);
  block-size: var(--dl-border-width);
}

.split-separator:hover::before {
  background: var(--dl-border-strong);
}

/* 焦点环画成**内阴影**而不是本仓默认的外扩环:分隔线是 24px 宽的窄条,而紧邻它的两块区域
   各自带不透明底色、且在 DOM 里排在本条**之后** —— 外扩环的右半边会被后画的那块区域盖掉,
   焦点指示就只剩一半(基线明令禁止「吞焦点样式」)。内阴影与 `--dl-focus-ring` 同源(同一档
   颜色与宽度),只是收在 24px 命中区之内,任何层序下都完整可见,也不会与相邻区域重叠。 */
.split-separator:focus-visible {
  outline: none;
  box-shadow: inset var(--dl-focus-ring);
  border-radius: var(--dl-radius-sm);
}

.split-separator:focus-visible::before {
  background: var(--dl-accent);
}

@media (prefers-reduced-motion: reduce) {
  .split-separator::before {
    transition: none;
  }
}
</style>
