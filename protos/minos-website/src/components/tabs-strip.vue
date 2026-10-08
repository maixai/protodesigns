<script setup lang="ts">
// 通用 underline 标签条:Hero 主视觉与「跨层 Mesh」层选择器共用。
// 行为约定(校准基线依赖,勿破坏):
//   - 完全用户驱动,不自动播放(WCAG 2.2.2 建议自动轮播默认关闭);
//   - W3C APG tabs pattern:tablist 有 aria-label;tab 带 aria-selected / aria-controls;
//     roving tabindex(仅选中 tab 为 0,其余 -1);←/→ 循环切换,Home/End 跳首尾;
//     自动激活,切换后焦点留在 tab 上,不移进 panel;
//   - 活动指示 = 表头发丝线下的青瓷短线:位置与宽度由活动 tab 实测写入 CSS 变量
//     (等宽单元格在窄屏溢出滚动时百分比无法对齐单元格,故统一实测),
//     切换时只 transition transform;文字档差(选中 500 / 未选 400)作第二通道;
//   - 窄屏标签条横向溢出:溢出端挂渐隐遮罩作「还有内容」的可见暗示,并恢复细滚动条;
//     鼠标纵向滚轮在标签条上映射为横向滚动(触控板双指横滑原生可用,不拦截);
//     窗口 / 字号 / 语言变化后经 ResizeObserver 补正活动标签的横向对齐与短线位置。
//
// 面板由调用方渲染:id 约定为 `${idPrefix}-panel-${tab.id}`,与 tab 的 aria-controls
// 对应;非活动面板应保留占位(visibility)并加 inert。
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface TabDef {
  id: string
  label: string
}

const props = defineProps<{
  tabs: readonly TabDef[]
  activeIndex: number
  // tablist 的 aria-label
  label: string
  // tab 的 id 前缀:tab 为 `${idPrefix}-tab-${id}`,面板应对应为 `${idPrefix}-panel-${id}`
  idPrefix: string
}>()

const emit = defineEmits<{
  activate: [index: number]
}>()

const tablistRef = ref<HTMLElement | null>(null)

// 青瓷短线的位置与宽度:实测活动 tab 写入 CSS 变量,切换时只 transition transform。
// 等宽单元格在标签条未溢出时可用百分比定位,但窄屏溢出滚动时百分比对的是
// 夹紧后的 padding box 而非滚动内容,会对不上单元格 —— 故统一走实测。
function measureIndicator(): void {
  const el = tablistRef.value
  if (el === null) return
  const tab = el.querySelectorAll<HTMLElement>('[role="tab"]')[props.activeIndex]
  if (tab === undefined) return
  el.style.setProperty('--indicator-x', `${tab.offsetLeft}px`)
  el.style.setProperty('--indicator-w', `${tab.offsetWidth}px`)
}

function activate(index: number): void {
  emit('activate', index)
  // 窄屏下标签栏可横向滚动:激活态变化时把活动标签对齐进可视区。
  // block:'nearest' 只在标签纵向不可见时才纵向补滚(正常切换时标签栏已在视口内,
  // 不会引发页面纵向滚动);横向对齐作用于标签栏自身的滚动条,与页面滚动互不干扰。
  // tab 元素与激活态无关(全部常驻 DOM),无需等渲染提交即可滚动。
  tablistRef.value
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    [index]?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
}

// 键盘操作后把焦点移到目标 tab(焦点不进入 panel)。
function focusTab(index: number): void {
  tablistRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus()
}

function onTablistKeydown(event: KeyboardEvent): void {
  const count = props.tabs.length
  let next: number | null = null
  if (event.key === 'ArrowRight') next = (props.activeIndex + 1) % count
  else if (event.key === 'ArrowLeft') next = (props.activeIndex - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  activate(next)
  focusTab(next)
}

// 激活态由调用方持有:变化后重测短线。
watch(
  () => props.activeIndex,
  () => {
    measureIndicator()
  },
)

// 窄屏标签条的横向滚动状态:溢出端渐隐遮罩由这两个布尔驱动(见 CSS)。
const canScrollStart = ref(false)
const canScrollEnd = ref(false)

function updateScrollState(): void {
  const el = tablistRef.value
  if (el === null) return
  canScrollStart.value = el.scrollLeft > 1
  canScrollEnd.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
}

// 横向对齐当前活动标签:只写 scrollLeft,不用 scrollIntoView —— 这是 resize 后的
// 补正路径,标签条此刻未必在视口内,scrollIntoView 的纵向分量会拽动页面。
function alignActiveTab(): void {
  const el = tablistRef.value
  if (el === null) return
  const tab = el.querySelectorAll<HTMLElement>('[role="tab"]')[props.activeIndex]
  if (tab === undefined) return
  // gutter 与 CSS 的 scroll-padding-inline 同源:从计算样式取,不在 JS 里复制取值
  const gutter = Number.parseFloat(getComputedStyle(el).scrollPaddingInlineStart) || 0
  const tabStart = tab.offsetLeft
  const tabEnd = tabStart + tab.offsetWidth
  if (tabStart < el.scrollLeft + gutter) {
    el.scrollLeft = tabStart - gutter
  } else if (tabEnd > el.scrollLeft + el.clientWidth - gutter) {
    el.scrollLeft = tabEnd - el.clientWidth + gutter
  }
}

// 鼠标滚轮在横向溢出的标签条上映射为横向滚动(Chrome 下纵向滚轮默认只滚页面,
// 鼠标用户因此够不到末项);触控板双指横滑(deltaX 为主)原生可用,不拦截;
// 滚到边界即放行,页面照常纵向滚动。
function onTablistWheel(event: WheelEvent): void {
  const el = tablistRef.value
  if (el === null) return
  if (el.scrollWidth <= el.clientWidth) return
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  const maxScrollLeft = el.scrollWidth - el.clientWidth
  const next = Math.min(Math.max(el.scrollLeft + event.deltaY, 0), maxScrollLeft)
  if (next === el.scrollLeft) return
  event.preventDefault()
  el.scrollLeft = next
}

// 语言切换会改变各标签宽度但未必改变标签条整体尺寸(窄屏标签条已满幅),
// ResizeObserver 观察不到这种情形,故显式 watch 标签文案,渲染提交后重测短线。
watch(
  () => props.tabs,
  async () => {
    await nextTick()
    measureIndicator()
  },
)

// 窗口尺寸 / 字号变化会改变标签条宽度:补正活动标签的横向对齐,
// 重测青瓷短线位置,并刷新溢出端遮罩。只观察标签条自身,回调内不写尺寸,
// 不会触发观察循环。
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  measureIndicator()
  updateScrollState()
  resizeObserver = new ResizeObserver(() => {
    measureIndicator()
    alignActiveTab()
    updateScrollState()
  })
  if (tablistRef.value !== null) resizeObserver.observe(tablistRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <!-- 贯通发丝线画在组件下缘(满幅),标签组压在线的上方;
       标签条自身可横向滚动并挂溢出遮罩,故发丝线与遮罩分层(遮罩不吃线) -->
  <div class="tabs-strip">
    <div
      ref="tablistRef"
      class="tabs-strip__tablist"
      :class="{
        'tabs-strip__tablist--overflow-start': canScrollStart,
        'tabs-strip__tablist--overflow-end': canScrollEnd,
      }"
      role="tablist"
      :aria-label="label"
      @keydown="onTablistKeydown"
      @scroll.passive="updateScrollState"
      @wheel="onTablistWheel"
    >
      <!-- 青瓷短线:纯装饰(aria-hidden),位置 / 宽度由 JS 实测写入
           --indicator-x / --indicator-w,切换时纯 transform 平移 -->
      <span class="tabs-strip__indicator" aria-hidden="true" />
      <button
        v-for="(tab, index) in tabs"
        :id="`${idPrefix}-tab-${tab.id}`"
        :key="tab.id"
        class="tabs-strip__tab"
        type="button"
        role="tab"
        :aria-selected="activeIndex === index"
        :aria-controls="`${idPrefix}-panel-${tab.id}`"
        :tabindex="activeIndex === index ? 0 : -1"
        @click="activate(index)"
      >
        {{ tab.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.tabs-strip {
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

/* 表头线标签栏(underline tabs):等宽单元格、整组水平居中;
   装不下时 clamp 到容器宽并退化为左起可滚动 —— justify-content: safe center
   是关键:普通 center 配合 overflow 时溢出部分会挂在起始边外侧,导致第一项
   永远滚不到;safe 在溢出时回退为 start 对齐 */
.tabs-strip__tablist {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  /* 等宽单元格:1fr 在宽度收缩(fit-content)的 grid 里解析为各列同宽(按最宽
     标签取齐) */
  grid-auto-columns: 1fr;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  overflow-x: auto;
  justify-content: safe center;
  scrollbar-width: none;
  /* 实测写入短线的初始值:挂载测量前短线不可见(宽度 0),不会出现错位闪烁 */
  --indicator-x: 0px;
  --indicator-w: 0px;
  /* 激活对齐(scrollIntoView / alignActiveTab)时保留的横向 gutter */
  scroll-padding-inline: var(--dl-space-2);
}

.tabs-strip__tablist::-webkit-scrollbar {
  display: none;
}

/* 青瓷短线:宽度 / 位置由 JS 实测写入(见 measureIndicator),切换时纯 transform 平移;
   向下探出 1px,骑在表头线上 —— 对页面底约 5.6:1,远高于非文本组件 3:1 的下限 */
.tabs-strip__indicator {
  position: absolute;
  inset-block-end: calc(-1 * var(--dl-border-width));
  inset-inline-start: 0;
  width: var(--indicator-w);
  /* 2px:由发丝线宽派生的一档加粗,不新增结构 token */
  block-size: calc(var(--dl-border-width) * 2);
  background-color: var(--dl-accent);
  transform: translateX(var(--indicator-x));
  transition:
    transform var(--dl-duration-base) var(--dl-ease-standard),
    background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

/* 活动标签 hover:短线随之提亮一档(与主按钮 hover 同源) */
.tabs-strip__tablist:has(.tabs-strip__tab[aria-selected='true']:hover)
  .tabs-strip__indicator {
  background-color: var(--dl-accent-hover);
}

.tabs-strip__tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-3);
  font-size: var(--dl-font-size-md);
  color: var(--dl-text-secondary);
  white-space: nowrap;
  transition: color var(--dl-duration-base) var(--dl-ease-standard);
}

.tabs-strip__tab:hover {
  color: var(--dl-text-primary);
}

/* 活动标签:文字提到一级 + 字重 500,与下方青瓷短线构成双通道(位置 + 字档),
   不只靠颜色区分 */
.tabs-strip__tab[aria-selected='true'] {
  color: var(--dl-text-primary);
  font-weight: 500;
}

/* 窄屏:标签条保持表头线形态(等宽格 clamp 到容器宽后左起可滚动),
   挂溢出端渐隐遮罩并恢复细滚动条 */
@media (max-width: 720px) {
  .tabs-strip__tablist {
    overscroll-behavior-x: contain;
    /* 恢复细滚动条:鼠标可拖拽,其存在本身也是常驻的「可横向滚动」暗示。
       滑块颜色用 --dl-text-disabled(弱化前景):border 档在 4px 高度上
       与页面底对比过低,实际上看不见,起不到暗示与拖拽落点的作用 */
    scrollbar-width: thin;
    scrollbar-color: var(--dl-text-disabled) transparent;
  }

  .tabs-strip__tablist::-webkit-scrollbar {
    display: block;
    height: var(--dl-space-1);
  }

  .tabs-strip__tablist::-webkit-scrollbar-thumb {
    background-color: var(--dl-text-disabled);
    border-radius: var(--dl-radius-pill);
  }

  .tabs-strip__tablist::-webkit-scrollbar-track {
    background-color: transparent;
  }

  /* 溢出端渐隐遮罩:由 JS 按 scrollLeft / 可滚余量切换类名(见 updateScrollState)。
     渐变里的 #000 只取 alpha 通道参与遮罩,不是视觉颜色 */
  .tabs-strip__tablist--overflow-end {
    -webkit-mask-image: linear-gradient(
      to right,
      #000 calc(100% - var(--dl-space-8)),
      transparent
    );
    mask-image: linear-gradient(to right, #000 calc(100% - var(--dl-space-8)), transparent);
  }

  .tabs-strip__tablist--overflow-start {
    -webkit-mask-image: linear-gradient(
      to left,
      #000 calc(100% - var(--dl-space-8)),
      transparent
    );
    mask-image: linear-gradient(to left, #000 calc(100% - var(--dl-space-8)), transparent);
  }

  .tabs-strip__tablist--overflow-start.tabs-strip__tablist--overflow-end {
    -webkit-mask-image: linear-gradient(
      to right,
      transparent,
      #000 var(--dl-space-8),
      #000 calc(100% - var(--dl-space-8)),
      transparent
    );
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 var(--dl-space-8),
      #000 calc(100% - var(--dl-space-8)),
      transparent
    );
  }
}
</style>
