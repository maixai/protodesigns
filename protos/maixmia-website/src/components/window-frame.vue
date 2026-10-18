<script setup lang="ts">
// 窗体外观壳(L2):「面」+ 标题栏(槽)+ 内容(槽)+ 8 枚缩放手柄 + 右下角可见点阵抓手。
//
// 这一层**不含状态与手势**:几何 / 拖动 / 缩放 / FLIP 全在 use-window-frame(L1)。壳只负责
// 把 L1 给出的样式与处理器绑到正确的元素上,并给标题栏与内容留槽 —— 因为两个窗体的标题栏
// 差异很大(文件是 项目›路径 + 芯片 + 统计 + 视图分段 + 换行 + 复位 + 停靠 + 关闭;对话是
// 标题 + 停靠 + 关闭),槽比堆 props 更贴切。
//
// 根的类名:壳自己的 block 名是 dl-window;consumer 通过 class 透传自己的根类(file-panel /
// chat-panel)—— 页面与测试都依赖它们在根上。data-* / role / aria-label 同样走属性透传。
import type { ComponentPublicInstance } from 'vue'
import type { WindowFrameApi } from '../composables/use-window-frame'

const props = defineProps<{
  // L1 的能力本体(状态 + 处理器 + 渲染描述)。
  frame: WindowFrameApi
  // 标题栏的可访问名与悬停提示由具体窗体给(两种形态下双击的含义不同)。
  headerLabel: string
  headerTitle: string
}>()

// 根 / 标题栏元素由壳自己挂回 L1(`<script setup>` 的模板 ref 会被自动解包,故这里用**函数
// ref**:它既能被类型检查接受,也不依赖名字解析)。
function setRoot(el: Element | ComponentPublicInstance | null): void {
  props.frame.rootRef.value = el instanceof HTMLElement ? el : null
}

function setHeader(el: Element | ComponentPublicInstance | null): void {
  props.frame.headerRef.value = el instanceof HTMLElement ? el : null
}
</script>

<template>
  <section
    :ref="setRoot"
    class="dl-window"
    :class="{ 'is-moving': frame.isMoving.value, 'dl-window--docked': frame.isDocked.value }"
    :style="frame.rectStyle.value"
  >
    <!-- 「面」这一层:底色 / 描边 / 圆角 / 阴影,并负责**吃掉滚轮** ——
         overflow: hidden + overscroll-behavior: contain 一并给出。规范细节:overscroll-behavior 只在
         滚动容器上生效,而内容不足一屏时(老引擎)没有溢出就不触发;Chrome 144 起对「不可滚动的
         滚动容器」(如 overflow: hidden)也生效,故这一层加上 contain 才能真正兜住「内容不满一屏时
         滚轮穿透到背后页面」。缩放手柄是它的**兄弟**、留在这一层之外,因此不受裁剪影响。 -->
    <div class="dl-window__surface">
      <!-- 标题栏 = 薄头 + **拖拽手柄**:整块可拖(阈值 4px、指针捕获、跟手无过渡)。
           内置抓手点阵 + consumer 的识别区 / 工具钮(header 槽)。 -->
      <header
        :ref="setHeader"
        class="dl-window__meta"
        :class="{ 'is-dragging': frame.isDragging.value }"
        tabindex="0"
        role="group"
        :aria-label="props.headerLabel"
        :title="props.headerTitle"
        v-on="frame.headerHandlers"
      >
        <!-- 克制的抓手记号:2×4 的点阵(纯装饰,不是控件 —— 整个标题栏都是手柄)。 -->
        <span class="dl-window__grip" aria-hidden="true" />
        <slot name="header" />
      </header>
      <slot />
    </div>

    <!-- 缩放手柄(APG Window Splitter)。四边是**可聚焦的分隔条**:aria-orientation 表达轴向、
         aria-valuenow/min/max 表达被调整尺寸的当前值与边界、aria-controls 指向被调整的内容区;
         方向键调整、Shift 大步长、Home/End 到最小 / 最大。四角是 44×44 的指针目标(本仓触达下限;
         Apple 建议桌面 20pt≈27px、触屏 28pt≈37px,这里取更严的 44),纯指针便利入口、不占 Tab 序。
         右下角另有一枚**可见的点阵抓手**(与标题栏那枚同一套画法),其余三角保持完全透明 ——
         可见抓手可以很细,光标 + 一次极淡的悬停强调就是全部暗示,真正的视觉提示是那枚点阵。 -->
    <!-- 缩放手柄只在**悬浮**形态存在:停靠时几何由区域内容区给出,没有可调整的自由尺寸。 -->
    <template v-if="!frame.isDocked.value">
      <button
        v-for="handle in frame.resizeEdges.value"
        :key="handle.edge"
        type="button"
        class="dl-window__resize"
        :class="`dl-window__resize--${handle.edge}`"
        role="separator"
        :aria-orientation="handle.orientation"
        :aria-controls="frame.bodyId"
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
        class="dl-window__resize dl-window__resize--corner"
        :class="`dl-window__resize--${corner.corner}`"
        aria-hidden="true"
        @pointerdown="frame.onResizePointerDown($event, corner.dx, corner.dy)"
        @pointermove="frame.onResizePointerMove"
        @pointerup="frame.onResizePointerUp"
        @pointercancel="frame.onResizePointerUp"
      >
        <span v-if="corner.corner === 'se'" class="dl-window__resize-grip" aria-hidden="true" />
      </span>
    </template>
  </section>
</template>

<style scoped>
/* 悬浮窗体:**固定定位在视口坐标系**里(几何由 JS 写 left/top/width/height),可在浏览器
   可显示区域任意位置拖动。层序:浮在应用外壳之上、模态 / 抽屉之下 —— 这一层只做定位与容器查询,
   「面」在下一层。前后关系由 **DOM 顺序**(页面按数组顺序渲染,靠后者在上)决定,
   全层共用 --dl-z-overlay,**不得**逐窗写 z-index 数值。 */
.dl-window {
  position: fixed;
  z-index: var(--dl-z-overlay);
  /* 头部按**自身宽度**(容器查询)决定紧凑程度:窗体窄时收成图标分段 + 去掉次要信息,
     于是「头部内部元素不换行」在任何宽度都成立。 */
  container-type: inline-size;
  /* FLIP:拆出 / 吸附时窗体从来源矩形滑到自身落点 —— 只有 transform / opacity 有过渡(动效白名单);
     几何属性(left / top / width / height)全程没有过渡,跟手时由 .is-moving 一并关掉。
     transform-origin 取左上角:位移与缩放都以来源矩形的左上角对齐,视线才连得起来。 */
  transform-origin: top left;
  transition: transform var(--dl-duration-slow) var(--dl-ease-standard), opacity var(--dl-duration-slow) var(--dl-ease-standard);
}

/* 停靠模式:不再是浮层,而是**填满区域内容区**的一块(由页面放进转录取位里)。
   它因此不参与层序(不给 z-index)、不可拖动 / 缩放;「面」也随之为**贴边**的形态 ——
   去掉圆角 / 阴影 / 描边,只在上缘画一条分界线(与转录区自身的上边界同一套层级语言,
   于是停靠的文件与转录在内容区里读作同一块)。 */
.dl-window--docked {
  position: relative;
  inset: auto;
  z-index: auto;
  flex: 1;
  min-inline-size: 0;
  min-block-size: 0;
}

.dl-window--docked .dl-window__surface {
  border: 0;
  border-radius: 0;
  box-shadow: none;
  border-block-start: var(--dl-border-width) solid var(--dl-border-base);
}

/* 停靠态的标题栏不是拖拽手柄(几何由容器给出):光标回到默认,抓手记号也退场。 */
.dl-window--docked .dl-window__meta {
  cursor: default;
}

.dl-window--docked .dl-window__grip {
  display: none;
}

/* 「面」:底色 / 描边 / 圆角 / 阴影,以及**滚轮隔离**。
   滚动链是 Web 应用最常见的 UX bug 之一(MDN);横向还必须单独设 -x,否则某些浏览器会把横向
   过度滚动当成前进 / 后退手势 —— 故这里 `overscroll-behavior: contain` 一次设两轴。 */
.dl-window__surface {
  block-size: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  box-shadow: var(--dl-shadow-lg);
  overflow: hidden;
  overscroll-behavior: contain;
  /* 悬浮 ↔ 停靠的**状态切换动效**:两种状态住在不同的容器里(浮层 ↔ 区域内容区的流内块),
     跨容器做 FLIP 需要手工做 First/Last 两次测量,且要同步两棵 DOM 树 —— 复杂度与失败面都不小,
     故改用「入场动效」作替代:切换会让窗体重新挂载,于是这一段**纯 opacity + 极轻位移**的入场
     正好覆盖两种切换方向(动效白名单之内,不碰任何布局属性)。 */
  animation: dl-window-enter var(--dl-duration-base) var(--dl-ease-standard);
}

@keyframes dl-window-enter {
  from { opacity: 0; transform: translateY(var(--dl-space-1)); }
  to { opacity: 1; transform: none; }
}

/* 拖动 / 缩放期间**不加过渡**(跟手)。本仓设计语言的可动效白名单只有 transform / opacity,
   几何属性本就不许过渡 —— 这里再显式兜一层,防止将来误加。 */
.dl-window.is-moving,
.dl-window.is-moving * {
  transition: none;
}

/* 标题栏(固定 40px = 一档控件高 32 + 上下各 4):整块是拖拽手柄,内容由槽给出。
   左右内边距:左 = 一档默认内缩(对话窗的取值;文件窗用 :deep 覆写成侧向 gutter),
   **右 = 一枚角手柄的宽度(44)** —— 右上角的隐形 NE 手柄在 DOM 里排在面之后、会盖住
   右上角的关闭钮,必须把按钮让开。这条预留由共用壳承担,两个窗体都受益。 */
.dl-window__meta {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: var(--dl-space-2);
  block-size: calc(var(--dl-space-8) + var(--dl-space-2));
  padding: 0 var(--dl-target-size) 0 var(--dl-space-6);
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
  cursor: grab;
  touch-action: none;
}

.dl-window__meta.is-dragging {
  cursor: grabbing;
}

.dl-window__meta:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 克制的抓手记号:2×4 的点阵(纯装饰 —— 整个标题栏都是手柄)。 */
.dl-window__grip {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: var(--dl-space-2);
  transform: translateY(-50%);
  inline-size: var(--dl-space-2);
  block-size: var(--dl-icon-sm);
  color: var(--dl-text-tertiary);
  background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
  background-size: var(--dl-space-1) var(--dl-space-1);
  pointer-events: none;
}

/* ---- 缩放手柄(APG Window Splitter)----
   四边是 8px 的细条(便利入口),放在窗体**外侧**:于是永远不遮内容、也不遮内容区的滚动条;
   四角是 44×44 的指针目标(本仓触达下限),放在窗体**内侧**的角上。 */
.dl-window__resize {
  position: absolute;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  touch-action: none;
  border-radius: 0;
}

.dl-window__resize--e {
  inset-block: 0;
  inset-inline-start: 100%;
  inline-size: var(--dl-space-2);
  cursor: ew-resize;
}

.dl-window__resize--w {
  inset-block: 0;
  inset-inline-end: 100%;
  inline-size: var(--dl-space-2);
  cursor: ew-resize;
}

.dl-window__resize--n {
  inset-inline: 0;
  inset-block-end: 100%;
  block-size: var(--dl-space-2);
  cursor: ns-resize;
}

.dl-window__resize--s {
  inset-inline: 0;
  inset-block-start: 100%;
  block-size: var(--dl-space-2);
  cursor: ns-resize;
}

.dl-window__resize--corner {
  inline-size: var(--dl-target-size);
  block-size: var(--dl-target-size);
}

.dl-window__resize--ne {
  inset-block-start: 0;
  inset-inline-end: 0;
  cursor: nesw-resize;
}

.dl-window__resize--nw {
  inset-block-start: 0;
  inset-inline-start: 0;
  cursor: nwse-resize;
}

.dl-window__resize--se {
  inset-block-end: 0;
  inset-inline-end: 0;
  cursor: nwse-resize;
}

.dl-window__resize--sw {
  inset-block-end: 0;
  inset-inline-start: 0;
  cursor: nesw-resize;
}

/* 边条悬停 / 聚焦时给一层极淡的强调色(它就是那条「细的可见抓手」)。 */
.dl-window__resize:hover,
.dl-window__resize:focus-visible {
  background: color-mix(in srgb, var(--dl-accent) 26%, transparent);
}

/* 右下角那枚**可见的点阵抓手**:与标题栏抓手同一套画法(radial-gradient 点阵),
   贴在角的里侧。纯装饰 —— 命中区是它所在的 44×44 角手柄,故不接收指针。
   其余三角保持完全透明(光标 + 悬停强调已是全部暗示)。 */
.dl-window__resize-grip {
  position: absolute;
  inset-block-end: var(--dl-space-2);
  inset-inline-end: var(--dl-space-2);
  inline-size: var(--dl-space-3);
  block-size: var(--dl-space-3);
  color: var(--dl-text-tertiary);
  background-image: radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0);
  background-size: var(--dl-space-1) var(--dl-space-1);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  /* 降级:入场动效压到 0.01ms(位移与缩放去掉,状态切换照旧发生;不用 0 是为了让 transitionend
     类的收尾逻辑仍能触发)。FLIP 的 transform 过渡同理(JS 侧在 reduced-motion 下整段跳过,
     这里再兜一层)。 */
  .dl-window__surface {
    animation-duration: 0.01ms;
  }
  .dl-window {
    transition-duration: 0.01ms;
  }
}
</style>
