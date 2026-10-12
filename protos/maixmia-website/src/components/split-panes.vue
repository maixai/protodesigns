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
import { computed, ref } from 'vue'
import type { Surface } from '../contracts/generated/surface'
import type { WorkspaceLayout } from '../contracts/generated/workspace-layout'
import { MAX_SEPARATOR_PERCENT, MIN_SEPARATOR_PERCENT, OWN_WEIGHT, childSurfaces, separatorPercent } from '../data/windows'
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

// 子区域(按数组顺序 = 排布顺序)。
const children = computed<Surface[]>(() => childSurfaces(props.layout, props.surfaceId))
// 本区域排布子区域的方向(row 横排 / column 竖排)。
const axis = computed<Surface['axis']>(() => props.layout.surfaces.find((surface) => surface.id === props.surfaceId)?.axis ?? 'row')
// 分隔线在横向排布下是竖线(aria-orientation=vertical),纵向排布下是横线。
const separatorOrientation = computed<'vertical' | 'horizontal'>(() => (axis.value === 'row' ? 'vertical' : 'horizontal'))
// ---- 区域自身分栏项是否渲染(全仓只写这一处)----
// 区域是**混合节点**:既可能是内容区(有成员),也可能只是容器(无成员、仅容子区域)。
// 规则:渲染自身分栏项 ⟺ members.length > 0 || children.length === 0。
//   · 叶子区域被清空 → 页面已用 removeSurface 把它摘除,故叶子必有成员;
//   · 根区域是唯一可能「无成员但有子区域」的节点 —— 它只作容器,自身的会话头与内容区不渲染。
// 自身项不渲染时,它与首个子区域之间那条分隔线也不渲染(否则会出现一条没有左邻的线)。
const showSelf = computed<boolean>(() => {
  const members = props.layout.surfaces.find((surface) => surface.id === props.surfaceId)?.members.length ?? 0
  return members > 0 || children.value.length === 0
})

const rootRef = ref<HTMLElement | null>(null)

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
  dragStartPercent = separatorPercent(props.layout, props.surfaceId, index)
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
  props.resizeHandler(props.surfaceId, dragIndex, dragStartPercent + ((current - dragStartPos) / size) * 100)
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
  const current = separatorPercent(props.layout, props.surfaceId, index)
  let next: number | null = null
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = 100
  else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current + STEP_PERCENT
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = current - STEP_PERCENT
  if (next === null) return
  event.preventDefault()
  props.resizeHandler(props.surfaceId, index, next)
}
</script>

<template>
  <!-- 叶子区域:没有子区域时就是一个撑满的单格容器(不产生任何额外视觉)。
       有子区域时:自身分栏项按 showSelf 规则决定是否渲染(见脚本注释)。 -->
  <div ref="rootRef" class="split" :data-axis="axis">
    <div v-if="showSelf" class="split__item" :style="{ flexGrow: OWN_WEIGHT }">
      <slot name="pane" :surface-id="surfaceId" />
    </div>
    <template v-for="(child, index) in children" :key="child.id">
      <div
        v-if="showSelf || index > 0"
        class="split-separator"
        role="separator"
        tabindex="0"
        :aria-orientation="separatorOrientation"
        :aria-valuenow="separatorPercent(layout, surfaceId, index)"
        :aria-valuemin="MIN_SEPARATOR_PERCENT"
        :aria-valuemax="MAX_SEPARATOR_PERCENT"
        :aria-label="t.workspace.regions.resizeSeparator"
        :title="`${t.workspace.regions.resizeSeparator} · ${t.workspace.regions.resizeHint}`"
        @keydown="onSeparatorKeydown($event, index)"
        @pointerdown="onSeparatorPointerDown($event, index)"
        @pointermove="onSeparatorPointerMove"
        @pointerup="onSeparatorPointerUp"
        @pointercancel="onSeparatorPointerUp"
      />
      <div class="split__item" :style="{ flexGrow: child.weight }">
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
