<script setup lang="ts">
// 特性切换面板:原五个独立区块(两种形态 / 随时随地 / 可分享 / 统一管理 / 快速开始)
// 合并为一个标签切换区块 —— 表头线标签栏(underline tabs)+ 叠层面板,整体是一个
// 被方角外框框住的「仪器」。区块外壳(深浅作用域 / 居中容器 / 两栏布局)由 app.vue
// 的分栏骨架统一提供,本组件只管标签栏与面板;两栏模式下它构成右栏,五个面板组件
// 只渲染内容。整页同底(深色),右栏的性格由结构线格与等宽字承担,不靠栏级底色。
//
// 交互约定(W3C APG tabs pattern,完全用户驱动,不自动播放):
//   - 五个 panel 叠在同一 grid 单元格,容器高度 = 最高 panel,切换不跳动。
//     取舍留档:这是刻意决定,代价是短面板底部留白 —— 评审已认定为可接受代价;
//   - 非活动 panel 用 visibility(不是 display:none)保留占位,并加 inert
//     使其不可 Tab、不被读屏播报;
//   - roving tabindex:仅选中 tab 为 0,其余 -1;←/→ 循环切换,Home/End 跳首尾;
//     采用自动激活(面板即时可用),切换后焦点留在 tab 上,不移进 panel;
//   - panel 设 tabindex="0":面板内没有任何可聚焦元素时,APG 要求 panel 自身
//     可聚焦,否则键盘用户无法进入面板正文;
//   - 活动指示 = 表头线下的青瓷短线(几何位置 + 文字档差双通道,不只靠颜色):
//     短线的位置与宽度由活动 tab 实测写入 CSS 变量(等宽单元格在窄屏溢出滚动时
//     百分比无法对齐单元格,故统一实测),切换时只 transition transform;
//   - 窄屏标签条横向溢出可用性:溢出端挂渐隐遮罩作"还有内容"的可见暗示,并恢复
//     细滚动条(鼠标可拖拽,本身也是常驻暗示);鼠标纵向滚轮在标签条上映射为横向
//     滚动(触控板双指横滑原生可用,不拦截);窗口 / 字号 / 语言变化后经
//     ResizeObserver 补正活动标签的横向对齐与短线位置(只动横向,不引发页面纵向滚动);
//   - 用户主动切换(tab 点击 / 键盘 / 触屏滑动)会以 replace 方式同步地址栏 hash
//     为当前 panel 的锚点 id,使复制链接 / 刷新后所见与当前面板一致;
//     标签切换是视图状态而非导航,不堆历史记录。页内锚点链接仍走 push 语义;
//   - 深链锚点的 id 归属:公开锚点 id(#form-factors … #quickstart)挂在一组位于
//     区块顶部的锚点 span 上,而不是 panel 上。原生片段滚动(初始加载 / 地址栏
//     回车 —— 包括 URL 完全相同时的再导航,这条路径不派发 hashchange、JS 无感知
//     —— / 后退前进)的落点因此就是整个区块顶部,与组件的补滚目标一致,
//     标签栏不会被滚到 sticky 顶栏背后;panel 另用内部 id(panel-*)维持
//     aria-controls 关联。Hero 双按钮与页脚 NAVIGATE 的链接依赖公开锚点 id;
//   - 触屏支持左右滑动切换(只认 touch 指针,不劫持纵向滚动)。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Component } from 'vue'
import { useI18n } from '../i18n'
import FormFactorsPanel from './form-factors-section.vue'
import AnywherePanel from './anywhere-section.vue'
import SharePanel from './share-section.vue'
import ConfigPanel from './config-section.vue'
import QuickstartPanel from './quickstart-section.vue'

const { t } = useI18n()

interface FeatureTab {
  id: string
  label: string
  component: Component
}

// 锚点定义:tabs 计算属性与初始深链接管(模块级,见下)共用,避免两处字面量漂移。
const tabAnchors = [
  { id: 'form-factors', component: FormFactorsPanel },
  { id: 'anywhere', component: AnywherePanel },
  { id: 'share', component: SharePanel },
  { id: 'config', component: ConfigPanel },
  { id: 'quickstart', component: QuickstartPanel },
] as const

// 标签顺序即面板顺序;id 兼作公开锚点(深链)、tab ↔ tabpanel 的 ARIA 关联键
// (tabpanel 的 DOM id 为 panel-<id>,见模板)与状态行锚点读数的来源。
const tabs = computed<FeatureTab[]>(() => {
  const labels: Record<(typeof tabAnchors)[number]['id'], string> = {
    'form-factors': t.value.nav.formFactors,
    anywhere: t.value.nav.anywhere,
    share: t.value.nav.share,
    config: t.value.nav.config,
    quickstart: t.value.nav.quickstart,
  }
  return tabAnchors.map((anchor) => ({ ...anchor, label: labels[anchor.id] }))
})

// 初始深链接管:浏览器原生片段滚动会在 load 时滚向锚点,且它发生在 Vue 挂载之后,
// 挂载时的补滚盖不过它。故在模块求值时(早于 load)先把匹配锚点的 hash 摘下存起,
// 让原生滚动找不到目标;挂载后由组件自行激活 + 落位,再经 setHashSilently 恢复
// 地址栏 hash(直接 replaceState 会再次触发片段滚动)。
const pendingAnchor =
  tabAnchors.find((anchor) => anchor.id === window.location.hash.slice(1))?.id ?? null
if (pendingAnchor !== null) {
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

const activeIndex = ref(0)
const sectionRef = ref<HTMLElement | null>(null)
const tablistRef = ref<HTMLElement | null>(null)

// 活动 tab 的锚点 id:状态行的等宽读数(#<slug>)与 hash 同步目标同源 ——
// 读数就是当前地址栏 hash 的值,是真实技术信息而非装饰。
const activeAnchorId = computed(() => tabs.value[activeIndex.value]?.id ?? '')

// 青瓷短线的位置与宽度:实测活动 tab 写入 CSS 变量,切换时只 transition transform。
// 等宽单元格在标签条未溢出时可用百分比定位,但窄屏溢出滚动时百分比对的是
// 夹紧后的 padding box 而非滚动内容,会对不上单元格 —— 故统一走实测。
function measureIndicator(): void {
  const el = tablistRef.value
  if (el === null) return
  const tab = el.querySelectorAll<HTMLElement>('[role="tab"]')[activeIndex.value]
  if (tab === undefined) return
  el.style.setProperty('--indicator-x', `${tab.offsetLeft}px`)
  el.style.setProperty('--indicator-w', `${tab.offsetWidth}px`)
}

function activate(index: number): void {
  activeIndex.value = index
  measureIndicator()
  // 窄屏下标签栏可横向滚动:激活态变化时把活动标签对齐进可视区。
  // block:'nearest' 只在标签纵向不可见时才纵向补滚(正常切换时标签栏已在视口内,
  // 不会引发页面纵向滚动);横向对齐作用于标签栏自身的滚动条,与页面滚动互不干扰。
  // tab 元素与激活态无关(全部常驻 DOM),无需等渲染提交即可滚动。
  tablistRef.value
    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    [index]?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
}

// 用户主动切换(tab 点击 / 键盘 / 触屏滑动)的统一入口:激活之外同步地址栏 hash,
// 使「当前面板」与 URL 一致(复制链接 / 刷新后所见一致)。
// 用 replace 而非 push:标签切换是视图状态而非导航,不应每点一次堆一条历史记录;
// 页内锚点链接(Hero 按钮 / 页脚 NAVIGATE)仍走 onDocumentClick 的 push 语义。
// 必须经 setHashSilently 写 hash —— 直接写 location.hash 会触发浏览器原生片段滚动
// 并派发 hashchange 引发二次落位。
function selectTab(index: number): void {
  activate(index)
  const id = tabs.value[index]?.id
  if (id === undefined) return
  if (window.location.hash !== `#${id}`) setHashSilently(id, 'replace')
}

// 深链落位:滚动目标是整个区块(section 顶部,含标签栏),与公开锚点 span 的位置一致。
// section 经 .dl-section 的 scroll-margin-top 避开 sticky 顶栏。
function scrollSectionIntoView(): void {
  sectionRef.value?.scrollIntoView()
}

// 同步地址栏 hash 而不触发片段滚动:pushState / replaceState 带片段会按 HTML 规范
// 执行 "navigate to a fragment" 滚动,且该滚动是异步任务(不在调用内同步发生)。
// 故先摘下所有锚点 span 的 id,调用后在下一个任务再还原 —— 异步滚动任务按 FIFO
// 先于我们的 setTimeout 回调执行,此时片段找不到目标,滚动落空。
function setHashSilently(id: string, mode: 'push' | 'replace'): void {
  const anchors = Array.from(
    sectionRef.value?.querySelectorAll<HTMLElement>('.feature-tabs__anchor') ?? [],
  )
  for (const anchor of anchors) anchor.removeAttribute('id')
  if (mode === 'push') history.pushState(null, '', `#${id}`)
  else history.replaceState(null, '', `#${id}`)
  setTimeout(() => {
    for (const [anchorIndex, anchor] of anchors.entries()) {
      const anchorId = tabs.value[anchorIndex]?.id
      if (anchorId !== undefined) anchor.setAttribute('id', anchorId)
    }
  }, 0)
}

// 键盘操作后把焦点移到目标 tab(焦点不进入 panel)。
function focusTab(index: number): void {
  tablistRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus()
}

function onTablistKeydown(event: KeyboardEvent): void {
  const count = tabs.value.length
  let next: number | null = null
  if (event.key === 'ArrowRight') next = (activeIndex.value + 1) % count
  else if (event.key === 'ArrowLeft') next = (activeIndex.value - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  selectTab(next)
  focusTab(next)
}

// hash 直达:#<锚点 id> 激活对应面板并滚动到位。
// (初始加载不走这里 —— 初始深链在模块级接管,见文件顶部 pendingAnchor。)
function syncFromHash(): void {
  const id = window.location.hash.slice(1)
  const index = tabs.value.findIndex((tab) => tab.id === id)
  if (index < 0) return
  activate(index)
  // 同源文档片段导航(地址栏手改 hash)会先派发 hashchange,随后做原生片段滚动
  // (目标是区块顶部的锚点 span,与本组件补滚目标一致);原生滚动是异步任务,
  // 把补滚推迟到下一个任务执行,作为最终落位的兜底纠正。
  setTimeout(() => scrollSectionIntoView(), 0)
}

function onHashChange(): void {
  syncFromHash()
}

// 拦截指向面板锚点的页内链接(Hero 双按钮 / 页脚 NAVIGATE):preventDefault 阻止
// 浏览器原生锚点滚动,自行激活 + 落位 + 同步地址栏。原生行为经 pushState 保留
// (地址栏出现 hash、产生历史记录,后退可用)。修饰键组合(新开标签页等)不拦截。
function onDocumentClick(event: MouseEvent): void {
  if (event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  if (!(event.target instanceof Element)) return
  const anchor = event.target.closest('a[href^="#"]')
  if (anchor === null) return
  const id = anchor.getAttribute('href')?.slice(1) ?? ''
  const index = tabs.value.findIndex((tab) => tab.id === id)
  if (index < 0) return
  event.preventDefault()
  activate(index)
  setHashSilently(id, 'push')
  scrollSectionIntoView()
}

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
  const tab = el.querySelectorAll<HTMLElement>('[role="tab"]')[activeIndex.value]
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
// ResizeObserver 观察不到这种情形,故显式 watch 文案源,渲染提交后重测短线。
watch(tabs, async () => {
  await nextTick()
  measureIndicator()
})

// 窗口尺寸 / 字号 / 语言变化会改变标签条宽度:补正活动标签的横向对齐(m2),
// 重测青瓷短线位置,并刷新溢出端遮罩。只观察标签条自身,回调内不写尺寸,
// 不会触发观察循环。
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  // 初始深链:hash 已在模块级摘下,这里完成激活 + 落位 + 恢复地址栏。
  if (pendingAnchor !== null) {
    const index = tabs.value.findIndex((tab) => tab.id === pendingAnchor)
    if (index >= 0) {
      activate(index)
      scrollSectionIntoView()
      setHashSilently(pendingAnchor, 'replace')
    }
  }
  measureIndicator()
  updateScrollState()
  resizeObserver = new ResizeObserver(() => {
    measureIndicator()
    alignActiveTab()
    updateScrollState()
  })
  if (tablistRef.value !== null) resizeObserver.observe(tablistRef.value)
  window.addEventListener('hashchange', onHashChange)
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('hashchange', onHashChange)
  document.removeEventListener('click', onDocumentClick)
})

// 触屏滑动切换:横向位移超过阈值且明显大于纵向位移才翻屏,不 preventDefault,
// 不干扰面板内的纵向滚动与文本选择。
const SWIPE_THRESHOLD_PX = 48
let swipeStartX = 0
let swipeStartY = 0
let swiping = false

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType !== 'touch') return
  swipeStartX = event.clientX
  swipeStartY = event.clientY
  swiping = true
}

function onPointerUp(event: PointerEvent): void {
  if (!swiping) return
  swiping = false
  const dx = event.clientX - swipeStartX
  const dy = event.clientY - swipeStartY
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return
  const next = activeIndex.value + (dx < 0 ? 1 : -1)
  if (next >= 0 && next < tabs.value.length) selectTab(next)
}

function onPointerCancel(): void {
  swiping = false
}
</script>

<template>
  <section ref="sectionRef" class="feature-tabs dl-section" :aria-label="t.nav.features">
    <!-- 公开深链锚点:id 挂在这组位于区块顶部的 span 上(不挂在 panel 上),
         使任何路径的原生片段滚动都落在整个区块顶部 —— 见文件顶部注释。
         纯定位用途,无尺寸、不可聚焦、aria-hidden -->
    <span
      v-for="tab in tabs"
      :id="tab.id"
      :key="`anchor-${tab.id}`"
      class="feature-tabs__anchor"
      aria-hidden="true"
    />
    <!-- 仪器外框:方角矩形,只圆外围一圈,内部线格一律直角 -->
    <div class="feature-tabs__frame">
      <!-- 表头:五个标签一行 + 贯通横线。这条线同时是下方面板内容的起始线
           (一条线干三件事:分区 / 活动定位的基准 / 连接内容) -->
      <div class="feature-tabs__head">
        <div
          ref="tablistRef"
          class="feature-tabs__tablist"
          :class="{
            'feature-tabs__tablist--overflow-start': canScrollStart,
            'feature-tabs__tablist--overflow-end': canScrollEnd,
          }"
          role="tablist"
          :aria-label="t.nav.features"
          @keydown="onTablistKeydown"
          @scroll.passive="updateScrollState"
          @wheel="onTablistWheel"
        >
          <!-- 青瓷短线:纯装饰(aria-hidden),位置 / 宽度由 JS 实测写入
               --indicator-x / --indicator-w,切换时纯 transform 平移 -->
          <span class="feature-tabs__indicator" aria-hidden="true" />
          <button
            v-for="(tab, index) in tabs"
            :id="`feature-tab-${tab.id}`"
            :key="tab.id"
            class="feature-tabs__tab"
            type="button"
            role="tab"
            :aria-selected="activeIndex === index"
            :aria-controls="`panel-${tab.id}`"
            :tabindex="activeIndex === index ? 0 : -1"
            @click="selectTab(index)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <!-- 状态行:右对齐的锚点读数,等宽字承载真实技术信息 —— 它就是当前地址栏
           hash 的值(与 tabAnchors / setHashSilently 同源),随切换更新。
           对读屏冗余(aria-selected 已表达选中态),故 aria-hidden -->
      <div class="feature-tabs__status" aria-hidden="true">
        <span class="dl-mono feature-tabs__slug">#{{ activeAnchorId }}</span>
      </div>

      <div
        class="feature-tabs__panels"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointercancel="onPointerCancel"
      >
        <div
          v-for="(tab, index) in tabs"
          :id="`panel-${tab.id}`"
          :key="tab.id"
          class="feature-tabs__panel"
          :class="{ 'feature-tabs__panel--active': activeIndex === index }"
          role="tabpanel"
          tabindex="0"
          :aria-labelledby="`feature-tab-${tab.id}`"
          :inert="activeIndex !== index"
        >
          <component :is="tab.component" />
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.feature-tabs {
  /* 公开锚点 span 的定位上下文(见模板注释) */
  position: relative;
}

/* 公开深链锚点:钉在区块顶部;scroll-margin 与 .dl-section 同源,原生片段滚动
   落位后区块顶部避开 sticky 顶栏 */
.feature-tabs__anchor {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
  scroll-margin-top: calc(var(--dl-header-height) + var(--dl-space-4));
}

/* 仪器外框:方角矩形,1px strong 档描边(对页面底约 1.95:1,低于非文本组件 3:1
   的建议值,登记为已知偏离 —— 深色下面阶差物理上无法更大,层级由线承担);
   圆角只圆外围这一圈,内部线格一律直角;不叠阴影(层级只由描边承担)。
   格内底不抬升,与页面同底。 */
.feature-tabs__frame {
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-lg);
}

/* 表头:贯通横线画在表头容器的下缘(满幅),标签组压在线的上方;
   线同时是面板内容的起始线 */
.feature-tabs__head {
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

/* 表头线标签栏(underline tabs):等宽单元格、整组水平居中;
   装不下时 clamp 到容器宽并退化为左起可滚动 —— justify-content: safe center
   是关键:普通 center 配合 overflow 时溢出部分会挂在起始边外侧,导致第一项
   永远滚不到;safe 在溢出时回退为 start 对齐 */
.feature-tabs__tablist {
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

.feature-tabs__tablist::-webkit-scrollbar {
  display: none;
}

/* 青瓷短线:全组件三处青瓷配额之一(另两处是 focus ring 与主 CTA)。
   宽度 / 位置由 JS 实测写入(见 measureIndicator),切换时纯 transform 平移;
   向下探出 1px,骑在表头线上 —— 对页面底约 9.8:1、对表头线约 6.5:1,
   远高于非文本组件 3:1 的下限 */
.feature-tabs__indicator {
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
.feature-tabs__tablist:has(.feature-tabs__tab[aria-selected='true']:hover)
  .feature-tabs__indicator {
  background-color: var(--dl-accent-hover);
}

.feature-tabs__tab {
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

.feature-tabs__tab:hover {
  color: var(--dl-text-primary);
}

/* 活动标签:文字提到一级 + 字重 500,与下方青瓷短线构成双通道(位置 + 字档),
   不只靠颜色区分 */
.feature-tabs__tab[aria-selected='true'] {
  color: var(--dl-text-primary);
  font-weight: 500;
}

/* 两栏最窄区间(1024–1279):右栏内容约 504px,英文五标签等宽条约 520px,
   收紧标签横向 padding 一档使标签条不溢出为横向滚动(可滚动态的溢出暗示
   只在 ≤720px 挂,此区间溢出会静默裁掉末项) */
@media (min-width: 1024px) and (max-width: 1279px) {
  .feature-tabs__tab {
    padding-inline: var(--dl-space-2);
  }
}

/* 状态行:表头线与面板内容之间的仪器读数 */
.feature-tabs__status {
  display: flex;
  justify-content: flex-end;
  padding-block: var(--dl-space-2);
}

.feature-tabs__slug {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
}

/* 五个 panel 叠在同一 grid 单元格:容器高度自动等于最高 panel,切换无跳动,不写死高度。
   inline-size 容器查询上下文:面板内容的两栏变单栏断点按面板实际宽度判定
   (两栏布局下面板只占右栏,视口媒体查询无法表达),见各面板组件 */
.feature-tabs__panels {
  display: grid;
  container-type: inline-size;
  margin-top: var(--dl-space-4);
}

.feature-tabs__panel {
  grid-area: 1 / 1;
  min-width: 0;
  /* 切换动效:淡入淡出 + 极小位移,只动 transform / opacity;
     visibility 同步过渡:隐藏侧淡出完成后才置 hidden,显示侧立即占位渐显 */
  opacity: 0;
  visibility: hidden;
  transform: translateY(var(--dl-space-3));
  transition:
    opacity var(--dl-duration-base) var(--dl-ease-standard),
    transform var(--dl-duration-base) var(--dl-ease-standard),
    visibility var(--dl-duration-base) var(--dl-ease-standard);
}

.feature-tabs__panel--active {
  opacity: 1;
  visibility: visible;
  transform: none;
}

/* 窄屏:标签条保持表头线形态(等宽格 clamp 到容器宽后左起可滚动),
   挂溢出端渐隐遮罩并恢复细滚动条;外框 padding 收一档,给面板内容让出行宽 */
@media (max-width: 720px) {
  .feature-tabs__frame {
    padding-inline: var(--dl-space-4);
  }

  .feature-tabs__tablist {
    overscroll-behavior-x: contain;
    /* 恢复细滚动条:鼠标可拖拽,其存在本身也是常驻的「可横向滚动」暗示。
       滑块颜色用 --dl-text-disabled(弱化前景):border 档在 4px 高度上
       与页面底对比过低,实际上看不见,起不到暗示与拖拽落点的作用 */
    scrollbar-width: thin;
    scrollbar-color: var(--dl-text-disabled) transparent;
  }

  .feature-tabs__tablist::-webkit-scrollbar {
    display: block;
    height: var(--dl-space-1);
  }

  .feature-tabs__tablist::-webkit-scrollbar-thumb {
    background-color: var(--dl-text-disabled);
    border-radius: var(--dl-radius-pill);
  }

  .feature-tabs__tablist::-webkit-scrollbar-track {
    background-color: transparent;
  }

  /* 溢出端渐隐遮罩:由 JS 按 scrollLeft / 可滚余量切换类名(见 updateScrollState)。
     渐变里的 #000 只取 alpha 通道参与遮罩,不是视觉颜色 */
  .feature-tabs__tablist--overflow-end {
    -webkit-mask-image: linear-gradient(
      to right,
      #000 calc(100% - var(--dl-space-8)),
      transparent
    );
    mask-image: linear-gradient(to right, #000 calc(100% - var(--dl-space-8)), transparent);
  }

  .feature-tabs__tablist--overflow-start {
    -webkit-mask-image: linear-gradient(
      to left,
      #000 calc(100% - var(--dl-space-8)),
      transparent
    );
    mask-image: linear-gradient(to left, #000 calc(100% - var(--dl-space-8)), transparent);
  }

  .feature-tabs__tablist--overflow-start.feature-tabs__tablist--overflow-end {
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
