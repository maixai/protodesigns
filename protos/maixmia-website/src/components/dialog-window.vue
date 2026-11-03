<script setup lang="ts">
// 模态设置窗体外观壳(L2):原生 `<dialog>` 根 + 表面材质 + 标题栏 / 导航 / 内容 / 动作区槽
// + 8 向缩放手柄。
//
// 这一层**不持有业务状态**(草稿、脏标记、保存、校验、信息架构都在业务组件里),只持有窗体状态
// (开合、矩形)与模态契约。几何 / 手势在 use-dialog-window(L1),纯数学在
// src/data/window-geometry.ts(L0)。三个业务窗体用组合的方式接入,不 extends / 不 mixins。
//
// 缩放的可发现性:静止态不在角上画任何抓手;光标 + 边带悬停 / 分隔条聚焦时沿窗体圆角轮廓
// 出现的强调是唯一提示(见样式里的 :has 规则)。
//
// 结构固定为「header → main(nav + column(content + actions))」:stacked 布局只是把 main
// 改成纵向排布,节点不重建 —— 窄屏切换时业务插槽内的组件状态不会丢。
import type { ComponentPublicInstance } from 'vue'
import { useDialogWindow } from '../composables/use-dialog-window'
import type { DialogContentTier } from '../composables/use-dialog-window'

const props = withDefaults(defineProps<{
  // 受控开合:常驻 + open prop、仅打开时 v-if 挂载两种契约都支持。
  open?: boolean
  // 内容等级:决定宽度上限,策略本身三窗体共用。
  tier: DialogContentTier
  // sidebar = 左导航 + 右正文(项目设置);stacked = 导航在上、正文在下(Agent / 账户)。
  layout?: 'stacked' | 'sidebar'
  // 缩放手柄 aria-controls 指向的内容区 id。
  bodyId: string
}>(), { open: true, layout: 'stacked' })

const emit = defineEmits<{ 'request-close': []; opened: [] }>()

const frame = useDialogWindow({
  open: () => props.open,
  tier: () => props.tier,
  onRequestClose: () => emit('request-close'),
  onOpened: () => emit('opened'),
})

// 业务确认关闭后可以主动收掉原生 dialog(父级随后卸载外壳时重复调用是安全的)。
defineExpose({ closeDialog: frame.closeDialog })

// 根元素由壳自己挂回 L1;函数 ref 同时适配元素与组件实例的类型。
function setDialog(el: Element | ComponentPublicInstance | null): void {
  frame.dialogRef.value = el instanceof HTMLDialogElement ? el : null
}
</script>

<template>
  <dialog
    :ref="setDialog"
    class="dl-dialog"
    :class="{ 'is-moving': frame.isDragging.value || frame.isResizing.value, 'is-static': !frame.canManipulate.value }"
    :style="frame.style.value"
    aria-modal="true"
    @cancel="frame.onCancel"
    @click="frame.onBackdropClick"
  >
    <div class="dl-dialog__surface">
      <header
        class="dl-dialog__header"
        :class="{ 'is-dragging': frame.isDragging.value }"
        :tabindex="frame.canManipulate.value ? 0 : -1"
        role="group"
        :aria-label="frame.headerLabel.value"
        :title="frame.canManipulate.value ? frame.headerHint.value : undefined"
        v-on="frame.headerHandlers"
      >
        <div class="dl-dialog__header-content"><slot name="header" /></div>
        <div class="dl-dialog__controls">
          <slot name="header-actions" />
        </div>
      </header>

      <div class="dl-dialog__main" :class="`dl-dialog__main--${props.layout}`">
        <div v-if="$slots.nav" class="dl-dialog__nav"><slot name="nav" /></div>
        <div class="dl-dialog__column">
          <div :id="props.bodyId" class="dl-dialog__content"><slot /></div>
          <footer v-if="$slots.actions" class="dl-dialog__actions"><slot name="actions" /></footer>
        </div>
      </div>
    </div>

    <!-- 缩放手柄(APG Window Splitter):四边可聚焦,四角为纯指针目标。
         静止态不画任何抓手 —— 缩放暗示只由光标与边带悬停 / 聚焦时的轮廓强调承担。 -->
    <template v-if="frame.canManipulate.value">
      <button
        v-for="handle in frame.resizeEdges.value"
        :key="handle.edge"
        type="button"
        class="dl-dialog__resize"
        :class="`dl-dialog__resize--${handle.edge}`"
        role="separator"
        :aria-orientation="handle.orientation"
        :aria-controls="props.bodyId"
        :aria-label="handle.label"
        :aria-valuenow="frame.ariaNow(handle.orientation === 'vertical')"
        :aria-valuemin="frame.ariaMin(handle.orientation === 'vertical')"
        :aria-valuemax="frame.ariaMax(handle.orientation === 'vertical')"
        :title="handle.hint"
        @keydown="frame.onResizeKeydown($event, handle)"
        @pointerdown="frame.onResizePointerDown($event, handle.dx, handle.dy)"
        @pointermove="frame.onResizePointerMove"
        @pointerup="frame.onResizePointerUp"
        @pointercancel="frame.onResizePointerUp"
      />
      <span
        v-for="corner in frame.resizeCorners"
        :key="corner.corner"
        class="dl-dialog__resize dl-dialog__resize--corner"
        :class="`dl-dialog__resize--${corner.corner}`"
        aria-hidden="true"
        @pointerdown="frame.onResizePointerDown($event, corner.dx, corner.dy)"
        @pointermove="frame.onResizePointerMove"
        @pointerup="frame.onResizePointerUp"
        @pointercancel="frame.onResizePointerUp"
      />
    </template>
  </dialog>
</template>

<style scoped>
/* 根 = 原生 dialog 的几何盒。必须显式清掉 UA 的 inset:0 / margin:auto / 默认 max-*,
   否则显式 left/top/width/height 会和原生居中规则打架(窗口不跟手的常见根因)。 */
.dl-dialog {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  max-inline-size: none;
  max-block-size: none;
  overflow: visible;
  box-sizing: border-box;
  /* 几何切换(拖动 / 缩放)一律瞬时完成:不对 left/top/width/height 做过渡。
     显式收窄过渡属性,避免全局 * 规则把初始的 `all` 带进来。 */
  transition: none;
}

/* 「面」:底色 / 发丝描边 / 圆角档,并负责裁切自身内容与滚轮隔离。
   缩放手柄是它的**兄弟**,因此不被这里的 overflow: hidden 裁掉。 */
.dl-dialog__surface {
  position: relative;
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  block-size: 100%;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-xl);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font: inherit;
  text-align: left;
  animation: dl-dialog-enter var(--dl-duration-base) var(--dl-ease-standard);
}

@keyframes dl-dialog-enter {
  from { opacity: 0; transform: translateY(var(--dl-space-1)); }
  to { opacity: 1; transform: none; }
}

/* 拖动 / 缩放期间不加过渡(跟手)。 */
.dl-dialog.is-moving,
.dl-dialog.is-moving * {
  transition: none;
}

/* 标题栏:整块是拖拽手柄;内容由业务槽给出(含自己的内距与发丝线),
   头部动作钮绝对定位在右侧,不参与头部的横向宽度分配。 */
.dl-dialog__header {
  position: relative;
  flex: none;
  display: flex;
  align-items: stretch;
  min-block-size: var(--dl-target-size);
  min-inline-size: 0;
  cursor: grab;
  touch-action: none;
}

.dl-dialog__header.is-dragging { cursor: grabbing; }

/* 窄屏 / 粗指针不提供窗口操作:光标与可聚焦性一并回到普通标题。 */
.dl-dialog.is-static .dl-dialog__header { cursor: default; }

/* 焦点环内收:标题栏满宽,外扩的环会被表面的 overflow: hidden 裁掉。 */
.dl-dialog__header:focus-visible {
  outline: none;
  box-shadow: inset var(--dl-focus-ring);
}

.dl-dialog__header-content {
  display: flex;
  flex: 1;
  align-items: stretch;
  min-inline-size: 0;
}

.dl-dialog__controls {
  position: absolute;
  inset-block: 0;
  inset-inline-end: var(--workspace-settings-dialog-padding);
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  /* 头部动作钮排在缩放手柄之上:四角手柄覆盖到右上角时不会吞掉按钮点击。 */
  z-index: var(--dl-z-sticky);
}

/* 主体:sidebar = 左导航 + 右列;stacked = 导航在上、列在下。节点不变,只改方向。 */
.dl-dialog__main {
  display: flex;
  flex: 1;
  min-block-size: 0;
  min-inline-size: 0;
}

.dl-dialog__main--stacked { flex-direction: column; }

.dl-dialog__nav {
  flex: none;
  min-inline-size: 0;
}

.dl-dialog__column {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.dl-dialog__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
  padding: var(--dl-space-4) var(--workspace-settings-dialog-padding);
}

/* 动作区固定在正文之外;内容由业务槽给出。 */
.dl-dialog__actions {
  position: relative;
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2);
  padding: var(--dl-space-2) var(--workspace-settings-dialog-padding);
  border-block-start: var(--dl-border-width) solid var(--dl-border-base);
}

/* 命中优先级:动作区里的可交互控件恒在缩放手柄之上。
   手柄是表面的兄弟、在 DOM 中更靠后,不抬层序就会盖住右下角按钮的命中矩形;
   用层序而不是偏移量来避让 —— 窄窗 padding 变化、错误行出现、按钮换行都不会重新重叠。 */
.dl-dialog__actions :deep(:is(button, a[href], input, select, textarea, [role='button'])) {
  position: relative;
  z-index: var(--dl-z-sticky);
}

/* ---- 缩放手柄 ----
   一律落在窗体盒**内缘**:既不被表面裁切,也不撑出 dialog 的 scrollWidth
   (外扩会让「无横向溢出」的断言误判)。四边条覆盖的 8px 与四角的 24px 都落在内容区的
   内距带里(可操作宽度下该内距不小于 24px),因此手柄不会压住输入框、下拉、开关、链接或可点行;
   动作区按钮另由上面的层序保证优先,右下角外侧角落仍可发起缩放。 */
.dl-dialog__resize {
  position: absolute;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  touch-action: none;
}

.dl-dialog__resize--e {
  inset-block: 0;
  inset-inline-end: 0;
  inline-size: var(--dl-space-2);
  cursor: ew-resize;
}

.dl-dialog__resize--w {
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: var(--dl-space-2);
  cursor: ew-resize;
}

.dl-dialog__resize--n {
  inset-inline: 0;
  inset-block-start: 0;
  block-size: var(--dl-space-2);
  cursor: ns-resize;
}

.dl-dialog__resize--s {
  inset-inline: 0;
  inset-block-end: 0;
  block-size: var(--dl-space-2);
  cursor: ns-resize;
}

/* 四角是纯指针目标:24×24 是触达下限,也正好等于可操作宽度下内容区的内距,
   于是四角不会伸进正文、压住任何可交互控件。 */
.dl-dialog__resize--corner {
  inline-size: var(--dl-space-6);
  block-size: var(--dl-space-6);
}

.dl-dialog__resize--ne { inset-block-start: 0; inset-inline-end: 0; cursor: nesw-resize; }
.dl-dialog__resize--nw { inset-block-start: 0; inset-inline-start: 0; cursor: nwse-resize; }
.dl-dialog__resize--se { inset-block-end: 0; inset-inline-end: 0; cursor: nwse-resize; }
.dl-dialog__resize--sw { inset-block-end: 0; inset-inline-start: 0; cursor: nesw-resize; }

/* 手柄自身永远不铺色块:方形底色会从表面圆角之外露出来,也会在页脚带里透出强调色。
   反馈改为给**表面的轮廓**着色 / 加焦点环 —— 它自带圆角,强调严格沿轮廓走; */
.dl-dialog:has(.dl-dialog__resize:hover) .dl-dialog__surface,
.dl-dialog:has(.dl-dialog__resize:focus-visible) .dl-dialog__surface {
  border-color: var(--dl-accent);
}

/* 键盘聚焦分隔条时用统一的焦点环,同样沿表面的圆角轮廓;收起全局给按钮的默认方环。 */
.dl-dialog:has(.dl-dialog__resize:focus-visible) .dl-dialog__surface {
  box-shadow: var(--dl-focus-ring);
}

.dl-dialog__resize:focus-visible {
  outline: none;
  border-radius: 0;
  box-shadow: none;
}

@media (prefers-reduced-motion: reduce) {
  .dl-dialog__surface { animation-duration: 0.01ms; }
}
</style>
