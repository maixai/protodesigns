<script setup lang="ts">
// 文件栏:输入框下方的一条,列出**当前会话**下已打开的文件。
//
// 交互语言**完全复用会话 tab 条**(用户拍板):关闭钮(悬停 / 聚焦出现)、可拖拽换位、
// 溢出时进 ▾ 菜单、roving tabindex、Delete 关闭聚焦项。差别有三:
//   ① 每个 tab 带上文件树里的状态芯片 —— 于是这条栏不只是「打开了什么」,而是「Agent 动过
//      哪些文件」的一览(芯片与文件树同源同值);
//   ② 预览槽用**斜体**表达「临时」(VS Code / Zed / JetBrains 三者一致的语义:单击预览、双击固定);
//   ③ 没有 ＋(文件不是「新建」出来的),菜单里多了「最近打开」区(关闭 ≠ 删除)。
//
// 组件是**受控的**:tabs / activePath / recent 由页面持有,组件只读并通过事件请求变更。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { FileTab } from '../data/open-files'
import type { ProjectEntryStateId } from '../contracts/generated/project-entry'
import { fileBaseName, fileTabKey } from '../data/open-files'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  tabs: FileTab[]
  // 当前**聚焦**的文件(条上的高亮 / roving tabindex 的落点)。
  activeKey: string
  // 窗口**可见**的文件集合 —— 切换按钮的 aria-pressed 就是它(多窗口期可有多个同时按下)。
  visiblePaths: readonly string[]
  // 文件的状态芯片(新建 / 已改 / 待确认)。由页面按与文件树**同一条**规则派生后传入,
  // 于是芯片在「允许确认」后即时由 pending 变 modified,不必重取列表。
  // 入参是**整个 tab**(与栏上其它信息同源),不再是单个路径。
  stateOf: (tab: FileTab) => ProjectEntryStateId
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [key: string]
  close: [key: string]
  reorder: [order: string[]]
  'open-recent': [path: string]
}>()

const { t } = useI18n()

const rootRef = ref<HTMLElement | null>(null)
const tabsRef = ref<HTMLElement | null>(null)
const menuTriggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const isMenuOpen = ref(false)

// 状态芯片文案与文件树共用一套词条;none 不渲染芯片(无变化,不占宽度)。
function chipLabel(tab: FileTab): string | null {
  const state = props.stateOf(tab)
  if (state === 'none') return null
  return t.value.workspace.entryStates[state]
}

// tab 的 title(悬停可读):文件名 · 域内路径。
// 分域之后整条只属一个项目,再标一次项目名就是重复信息(项目由侧栏当前项目给出),
// 故 title 只写域内的完整路径。**不再有打开方式** —— 打开即独占,没有预览 / 固定的区分。
function tabTitle(tab: FileTab): string {
  return `${fileBaseName(tab.path)} · ${tab.path}`
}

// 关闭钮的可访问名 = 「关闭 + 文件名」,多个关闭钮因此唯一可辨别(与会话 tab 同规则)。
function closeLabel(tab: FileTab): string {
  return t.value.workspace.fileBar.closeFile.replace('{name}', `${fileBaseName(tab.path)}`)
}

// ---- 溢出计算(与会话 tab 条同一套算法:等宽 + clamp,不出现半截 tab)----
const stripWidth = ref(0)
const tabMin = ref(140)
const tabMax = ref(220)
const tabGap = ref(4)

function measureStrip(): void {
  if (!(tabsRef.value instanceof HTMLElement)) return
  const style = getComputedStyle(tabsRef.value)
  tabGap.value = Number.parseFloat(style.columnGap) || 0
  const rootStyle = rootRef.value === null ? null : getComputedStyle(rootRef.value)
  tabMin.value = Number.parseFloat(rootStyle?.getPropertyValue('--file-tab-min') ?? '') || 140
  tabMax.value = Number.parseFloat(rootStyle?.getPropertyValue('--file-tab-max') ?? '') || 220
  // 本组的可用宽**由会话栏单向给出**:顶部行里两组共享宽度,互相读对方的实占宽会互追
  // (实测 375px 下互相挤成 0 再回弹,浏览器还报 ResizeObserver loop)。会话栏手里有行的度量,
  // 由它一次算出本组的允许宽并写进 --file-strip-width;本组只读,不反向影响它。
  const heading = rootRef.value?.closest('.conversation-heading') ?? null
  const allowance = heading instanceof HTMLElement ? Number.parseFloat(getComputedStyle(heading).getPropertyValue('--file-strip-width')) : Number.NaN
  if (Number.isFinite(allowance)) {
    stripWidth.value = Math.max(0, allowance)
    return
  }
  // 兜底:还没被会话栏算过(首帧)时给 0,随后由挂载后的几帧重试探到真值(见 onMounted)。
  stripWidth.value = 0
}

const visibleCount = computed(() => {
  const total = props.tabs.length
  if (total === 0) return 0
  if (stripWidth.value <= 0) return Math.min(total, 1)
  const fits = Math.max(1, Math.floor((stripWidth.value + tabGap.value) / (tabMin.value + tabGap.value)))
  return Math.min(total, fits)
})

const tabWidth = computed(() => {
  if (visibleCount.value === 0) return tabMin.value
  const even = (stripWidth.value - tabGap.value * (visibleCount.value - 1)) / visibleCount.value
  if (even < tabMin.value) return even
  return Math.min(tabMax.value, even)
})

// 可见 tab:从打开集里取前面若干个;**活动文件永远可见**(被顶掉时用活动项替换末位可见项)。
const visibleTabs = computed(() => {
  const list = props.tabs
  const count = visibleCount.value
  if (count >= list.length) return list
  const window = list.slice(0, count)
  const active = list.find((tab) => fileTabKey(tab) === props.activeKey)
  if (active === undefined || window.some((tab) => fileTabKey(tab) === props.activeKey)) return window
  return [...window.slice(0, count - 1), active]
})


// ---- roving tabindex ----
const focusedKey = ref('')
const tabStopKey = computed(() => {
  const list = visibleTabs.value
  if (list.length === 0) return ''
  if (list.some((tab) => fileTabKey(tab) === focusedKey.value)) return focusedKey.value
  if (list.some((tab) => fileTabKey(tab) === props.activeKey)) return props.activeKey
  return fileTabKey(list[0] as FileTab)
})

function focusTab(key: string): void {
  focusedKey.value = key
  tabsRef.value?.querySelector<HTMLElement>(`.file-tab[data-file-key="${CSS.escape(key)}"]`)?.focus()
}

function onTabsKeydown(event: KeyboardEvent): void {
  const list = visibleTabs.value
  if (list.length === 0) return
  const target = event.target
  const currentKey = target instanceof HTMLElement ? target.dataset.fileKey : undefined
  const index = list.findIndex((tab) => fileTabKey(tab) === currentKey)
  if (index < 0) return
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const tab = list[index]
    if (tab !== undefined) emit('select', fileTabKey(tab))
    return
  }
  // Delete 关闭聚焦的 tab(与文件树 / 会话 tab 同一语义)。
  if (event.key === 'Delete') {
    event.preventDefault()
    const tab = list[index]
    if (tab !== undefined) emit('close', fileTabKey(tab))
    return
  }
  // Ctrl+Shift+PageUp / PageDown:把聚焦的 tab 逐位重排(纯拖拽对键盘用户不可达)。
  if (event.ctrlKey && event.shiftKey && (event.key === 'PageUp' || event.key === 'PageDown')) {
    event.preventDefault()
    const to = event.key === 'PageUp' ? index - 1 : index + 1
    if (to < 0 || to >= list.length) return
    const ids = list.map((tab) => fileTabKey(tab))
    const moved = ids[index]
    if (moved === undefined) return
    ids.splice(index, 1)
    ids.splice(to, 0, moved)
    const movedSet = new Set(ids)
    const rest = props.tabs.map((tab) => fileTabKey(tab)).filter((key) => !movedSet.has(key))
    emit('reorder', [...ids, ...rest])
    void nextTick(() => focusTab(moved))
    return
  }
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % list.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + list.length) % list.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = list.length - 1
  else return
  event.preventDefault()
  const nextTab = list[next]
  if (nextTab !== undefined) focusTab(nextTab.path)
}

// ---- 拖拽排序(Pointer Events + setPointerCapture)----
const DRAG_THRESHOLD_PX = 4
const dragKey = ref('')
const dragIndex = ref(-1)
const dropIndex = ref(-1)
const dragOffsetX = ref(0)
let suppressClick = false
let dragStartX = 0
let dragPointerId = -1
let slotLefts: number[] = []
let slotWidth = 0

function resetDrag(): void {
  dragKey.value = ''
  dragIndex.value = -1
  dropIndex.value = -1
  dragOffsetX.value = 0
  dragPointerId = -1
  slotLefts = []
  slotWidth = 0
}

function onTabPointerDown(event: PointerEvent, index: number): void {
  suppressClick = false
  if (event.button !== 0) return
  if (visibleTabs.value.length < 2) return
  const target = event.target
  if (target instanceof Element && target.closest('.file-tab-close') !== null) return
  const slot = event.currentTarget
  if (!(slot instanceof HTMLElement)) return
  const slots = Array.from(tabsRef.value?.querySelectorAll<HTMLElement>('.file-tab-slot') ?? [])
  if (slots.length !== visibleTabs.value.length) return
  slotLefts = slots.map((element) => element.getBoundingClientRect().left)
  slotWidth = slots[index]?.getBoundingClientRect().width ?? 0
  dragStartX = event.clientX
  dragPointerId = event.pointerId
  dragIndex.value = index
  dropIndex.value = index
}

function resolveDropIndex(pointerX: number): number {
  const count = slotLefts.length
  if (count === 0) return dragIndex.value
  for (let i = 0; i < count; i += 1) {
    if (pointerX < (slotLefts[i] ?? 0) + slotWidth) return i
  }
  return count - 1
}

function onTabPointerMove(event: PointerEvent): void {
  if (dragIndex.value < 0 || event.pointerId !== dragPointerId) return
  const delta = event.clientX - dragStartX
  if (dragKey.value === '') {
    if (Math.abs(delta) < DRAG_THRESHOLD_PX) return
    const dragged = visibleTabs.value[dragIndex.value]
    const slot = event.currentTarget
    if (dragged === undefined || !(slot instanceof HTMLElement)) return
    slot.setPointerCapture(event.pointerId)
    dragKey.value = fileTabKey(dragged)
  }
  dragOffsetX.value = delta
  dropIndex.value = resolveDropIndex(event.clientX)
}

function onTabPointerUp(event: PointerEvent): void {
  if (dragIndex.value < 0 || event.pointerId !== dragPointerId) return
  const slot = event.currentTarget
  if (slot instanceof HTMLElement && slot.hasPointerCapture(event.pointerId)) slot.releasePointerCapture(event.pointerId)
  const wasDragging = dragKey.value !== ''
  const from = dragIndex.value
  const to = dropIndex.value
  resetDrag()
  if (!wasDragging) return
  suppressClick = true
  if (to < 0 || to === from) return
  const ids = visibleTabs.value.map((tab) => fileTabKey(tab))
  const moved = ids[from]
  if (moved === undefined) return
  ids.splice(from, 1)
  ids.splice(to, 0, moved)
  const movedSet = new Set(ids)
  const rest = props.tabs.map((tab) => fileTabKey(tab)).filter((key) => !movedSet.has(key))
  emit('reorder', [...ids, ...rest])
}

function cancelDrag(event?: PointerEvent): void {
  if (dragIndex.value < 0) return
  if (event !== undefined) {
    const slot = event.currentTarget
    if (slot instanceof HTMLElement && slot.hasPointerCapture(event.pointerId)) slot.releasePointerCapture(event.pointerId)
  }
  const wasDragging = dragKey.value !== ''
  resetDrag()
  if (wasDragging) suppressClick = true
}

function onDragKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || dragIndex.value < 0) return
  event.preventDefault()
  event.stopPropagation()
  cancelDrag()
}

// 拖拽结束后紧跟的那次 click 需要被吞掉(浏览器同款:拖动后台标签页不会切过去)。
function onTabClick(key: string): void {
  if (suppressClick) {
    suppressClick = false
    return
  }
  emit('select', key)
}

function slotTransform(index: number): string | undefined {
  const tab = visibleTabs.value[index]
  if (tab === undefined) return undefined
  if (dragKey.value === fileTabKey(tab)) return `translate(${dragOffsetX.value}px, var(--dl-lift-hover))`
  if (dragKey.value === '') return undefined
  const span = slotWidth + tabGap.value
  const from = dragIndex.value
  const to = dropIndex.value
  if (from < to && index > from && index <= to) return `translateX(${-span}px)`
  if (from > to && index >= to && index < from) return `translateX(${span}px)`
  return undefined
}

// ---- ▾ 菜单(disclosure:命名容器 + 原生按钮行,不用无 tabindex 的菜单项)----
function rowElements(): HTMLElement[] {
  return Array.from(panelRef.value?.querySelectorAll<HTMLElement>('[data-file-option]') ?? [])
}

function closeMenu(restoreFocus: boolean): void {
  if (!isMenuOpen.value) return
  if (panelRef.value !== null) panelRef.value.inert = true
  isMenuOpen.value = false
  if (restoreFocus) menuTriggerRef.value?.focus()
}


function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  closeMenu(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && rootRef.value?.contains(target) === true) return
  closeMenu(false)
}

// 菜单行点击:openTab 为空 = 「已打开」组(选中该 tab);否则是「最近关闭」组(按路径重新打开)。
// 菜单打开后把焦点交给首行:键盘 / 读屏用户随即能操作,Esc 也才有落点(与会话切换器打开即聚焦
// 搜索框同一套做法 —— 否则焦点留在触发钮上,面板收不到 Esc)。
watch(isMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  // 菜单打开后把焦点交给首行:键盘 / 读屏用户随即能操作,Esc 也才有落点(与会话切换器打开即聚焦
  // 搜索框同一套做法)。没有行时(真空态提示)交给面板本身 —— 它是 tabindex=-1 的可编程聚焦区。
  const first = rowElements()[0]
  if (first === undefined) panelRef.value?.focus()
  else first.focus()
})

let observer: ResizeObserver | undefined

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDragKeydown)
  measureStrip()
  if (typeof ResizeObserver !== 'undefined') {
    // 同会话栏:隔一帧再量,避免两组互为对方宽度时的同帧循环。
    observer = new ResizeObserver(() => { requestAnimationFrame(() => measureStrip()) })
    // 观察**顶部行**而不是本组件:可用宽取决于「行宽 − 对话那一组的实占宽」,对话组变宽变窄
    // 时本组件自身的盒子可能不变,只观察自己会漏掉这一半的信号。
    const heading = rootRef.value?.closest('.conversation-heading') ?? rootRef.value
    if (heading !== null) observer.observe(heading)
    // 也观察**自己**(允许宽变化时自己的盒子会变)与**对话那一条**(允许宽变大时,会话栏把
    // 自己让窄,它的宽度变化是本组重算的可靠触发 —— 单看自己不够:本组的盒子被 tabMax 顶住时
    // 不再变化,就会一直用着过时的允许宽)。
    if (rootRef.value !== null) observer.observe(rootRef.value)
    const siblings = rootRef.value?.closest('.conversation-heading')?.querySelector('.conversation-tabs')
    if (siblings instanceof HTMLElement) observer.observe(siblings)
    // 首帧时会话栏可能还没写出允许宽(两个组件挂载次序不定),故挂载后连续补量几帧。
    for (let frame = 0; frame < 3; frame += 1) requestAnimationFrame(() => measureStrip())
  }
  window.addEventListener('resize', measureStrip)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDragKeydown)
  observer?.disconnect()
  window.removeEventListener('resize', measureStrip)
})
</script>

<template>
  <div ref="rootRef" class="file-bar" @focusout="onFocusOut">
    <!-- 打开集**跨项目**共享,栏里会同时混装多个项目的文件 —— 故出处由**每个 tab 自己**声明
         (文件名之后那枚小号、弱化的项目名),不再有「栏首标一次」的前提。 -->
    <!-- 文件那一组是 **toolbar** 而不是 tablist:同一时刻可以有多个文件窗口,不存在
         「一个 tab 对应一个 tabpanel」的关系,故每项是 **aria-pressed 的切换按钮**(按下 = 其窗口可见),
         不是 tab。tab 语义留给对话那一组(它才是一对一的)。 -->
    <div ref="tabsRef" class="file-tabs" role="toolbar" :aria-label="t.workspace.fileBar.label" @keydown="onTabsKeydown">      <!-- 槽位与 tab 平级:HTML 不允许 button 套 button,关闭钮用 tab 的 aria-actions 关联。
           槽位同时是关闭钮的定位上下文(恒定预留,出现时零重排)。 -->
      <div
        v-for="(tab, index) in visibleTabs"
        :key="fileTabKey(tab)"
        class="file-tab-slot"
        role="presentation"
        :data-selected="fileTabKey(tab) === activeKey"
        :class="{ 'is-dragging': fileTabKey(tab) === dragKey }"
        :style="{ width: `${tabWidth}px`, transform: slotTransform(index) }"
        @pointerdown="onTabPointerDown($event, index)"
        @pointermove="onTabPointerMove"
        @pointerup="onTabPointerUp"
        @pointercancel="cancelDrag($event)"
      >
        <button
          :id="`file-tab-${fileTabKey(tab)}`"
          :data-file-key="fileTabKey(tab)"
          :data-file-path="tab.path"
          class="file-tab"

          :aria-pressed="visiblePaths.includes(fileTabKey(tab))"
          :tabindex="fileTabKey(tab) === tabStopKey ? 0 : -1"
          :aria-actions="`file-close-${fileTabKey(tab)}`"
          :title="tabTitle(tab)"
          @click="onTabClick(fileTabKey(tab))"
          @focus="focusedKey = fileTabKey(tab)"
        >
          <!-- 主标签 = **文件名**。分域之后整条只属一个项目,故**不再标项目** ——
               再标一次是重复信息(项目由侧栏当前项目给出),同名跨项目混排的歧义也随之消失。 -->
          <DliIcon class="file-tab__icon" name="fileText" size="sm" />
          <span class="file-tab__label">{{ fileBaseName(tab.path) }}</span>
          <span v-if="chipLabel(tab)" class="file-tab__chip" :data-state="stateOf(tab)">{{ chipLabel(tab) }}</span>
        </button>
        <button
          :id="`file-close-${fileTabKey(tab)}`"
          type="button"
          class="file-tab-close"
          tabindex="-1"
          :aria-label="closeLabel(tab)"
          @click="emit('close', fileTabKey(tab))"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
    <!-- 没有打开文件时**不占位**:顶部行是与对话 tablist 共享的窄空间,一段教学文案会把整行挤到
         溢出(实测 375px 下挤掉 63px、还让会话 tab 溢出自己的条)。「双击文件即可打开」这条提示
         改由下拉的「文件」页承担(那里空间充裕,且是「找回文件」的天然落点)。 -->
  </div>
</template>

<style scoped>
/* 本组件是**裸条**:只负责 [tab 条][▾ 菜单钮] 的排布,不做任何「面」——它被页面放进
   顶部行里的一个 flex 项(宽度由会话栏单向定额,见 measureStrip),自身不再有「面」。
   position: relative 仍留给焦点环与内部定位。 */
.file-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  /* 菜单浮层向上弹(条在面板底部,向下会被坞挤掉);横向贴条的内容右缘。
     脚本按本元素(裸条)的 clientWidth 算可用宽 —— 它已经是栏内容宽(左右内边距已让出)。 */
  --file-tab-min: 140px;
  --file-tab-max: 220px;
}

/* 文件图标:区分「这是文件」而不是对话(项目标识已随分域删除 —— 那个区分的是项目,不是类型)。 */
.file-tab__icon {
  flex: none;
  color: var(--dl-text-tertiary);
}

.file-tabs {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
  /* overflow visible:tab 的 :focus-visible 环向外扩,裁切会把环的上下两边整条抹掉。 */
  overflow: visible;
}

.file-tab-slot {
  position: relative;
  flex: 0 1 auto;
  display: flex;
  min-width: 0;
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-tab-slot.is-dragging {
  transition: none;
}

/* 单个文件 tab:与会话 tab 同一档尺寸(紧凑导航行档 32px,横向 tab 条的任何宽度都保持此档)。 */
.file-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  block-size: var(--workspace-nav-control-size);
  padding-inline-start: var(--dl-space-3);
  /* 右内边距恒常预留关闭钮的槽(= 会话 tab 的同一取值),悬停出现时零重排。 */
  padding-inline-end: var(--workspace-tab-reserved);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  font-weight: 400;
  text-align: start;
  touch-action: pan-y;
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard), background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

/* tab 上的**出处标识**:项目名首字,16px 圆角方块(与会话头 / Agent 切换器同族)。
   打开集跨项目,栏里会混装多个项目的文件,故每个 tab 都要一枚标识;完整出处(文件名 · 项目 › 路径)
   放在 tab 的 title 里,悬停一次看全。颜色走二级文字色 —— 三级色压在活动 tab 的浅强调底上只有
   3.93:1(校准装置实测),不够正文级 4.5:1。 */

/* 预览槽:斜体表达「临时的」—— 三款编辑器(VS Code / Zed / JetBrains)一致的既有语义。 */

.file-tab__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 状态芯片:与文件树的 .entry-state 同一套取值与配色(语义角色层 token)。 */
.file-tab__chip {
  flex-shrink: 0;
  padding: 0 var(--dl-space-1);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

.file-tab__chip[data-state='created'] {
  color: var(--dl-accent);
}

.file-tab__chip[data-state='modified'] {
  color: var(--dl-warning);
}

.file-tab__chip[data-state='pending'] {
  color: var(--dl-accent);
  border-color: var(--dl-accent);
  background: var(--dl-accent-soft);
}

.file-tab:hover:not([aria-pressed='true']) {
  background: var(--dl-bg-hover);
}

.file-tab:active {
  transform: translateY(var(--dl-lift-press));
}

.file-tab-slot.is-dragging .file-tab:active {
  transform: none;
}

.file-tab:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 活动 tab:青瓷浅底 + 文字提到一级 + 字重 500(两个非颜色线索:填充 + 字重)。 */
.file-tab[aria-pressed='true'] {
  background: var(--dl-accent-soft);
  color: var(--dl-text-primary);
  font-weight: 500;
}

/* 关闭钮:与会话 tab 的关闭钮同尺寸(24×24 密集行内控件档),悬停 / 聚焦出现。 */
.file-tab-close {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: var(--dl-space-1);
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-icon-lg);
  block-size: var(--dl-icon-lg);
  border-radius: var(--dl-radius-pill);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-tight);
  opacity: 0;
  transition: opacity var(--dl-duration-fast) var(--dl-ease-standard), color var(--dl-duration-fast) var(--dl-ease-standard), background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-tab-slot:hover .file-tab-close,
.file-tab-slot:focus-within .file-tab-close {
  opacity: 1;
}

.file-tab-close:hover,
.file-tab-close:focus-visible {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.file-tab-close:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 空态提示:与一行 tab 等高(32),故栏高在空 / 非空两态完全一致。
   它只是提示,不可交互 —— 教学职责由可见文案承担,不额外加图标钮。 */
.file-bar__empty {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  block-size: var(--workspace-nav-control-size);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}

/* ▾ 菜单的空态提示。 */
.file-bar__hint {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

/* ▾ 菜单钮:与会话头的 ＋ / ▾ 同配方、同档尺寸(32×32),钉在条右缘。 */
.file-bar__trigger {
  position: relative;
  margin-inline-start: auto;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--workspace-nav-control-size);
  block-size: var(--workspace-nav-control-size);
  padding: 0;
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary);
  background: var(--dl-bg-elevated);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-bar__trigger:hover:not(:disabled) {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.file-bar__trigger:active:not(:disabled) {
  transform: translateY(var(--dl-lift-press));
}

.file-bar__trigger:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.file-bar__trigger:disabled {
  cursor: not-allowed;
  color: var(--dl-text-disabled);
  background: var(--dl-bg-sunken);
}

.file-bar__caret {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  color: var(--dl-text-secondary);
}

.file-bar__caret path {
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  vector-effect: non-scaling-stroke;
}

.file-bar__count {
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

/* 浮层:锚到条(最近的可定位祖先),右缘对齐条右缘;向上弹(条在屏幕底部,向下会被输入坞挤掉)。 */
.file-bar__panel {
  position: absolute;
  inset-block-end: calc(100% + var(--dl-space-1));
  inset-inline-end: 0;
  z-index: var(--dl-z-overlay);
  width: min(360px, 92vw);
  max-height: min(50vh, 360px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  padding: var(--dl-space-4);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  box-shadow: var(--dl-shadow-lg);
}

.file-bar__group {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
}

.file-bar__group-title {
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-text-tertiary);
  padding: var(--dl-space-1) var(--dl-space-1) 0;
}

/* 菜单行 = **两段式**(label + description):主行是文件名(+状态芯片),次行是所属上下文
   (本项目只写目录路径;跨项目写「项目 › 目录路径」)。依据:VS Code 的 recent 列表项就是
   label + description = 文件 + 所属工作区 / 父路径。 */
.file-bar__row {
  flex-shrink: 0;
  width: 100%;
  min-height: var(--dl-target-size);
  padding: var(--dl-space-2) var(--dl-space-3);
  display: grid;
  gap: var(--dl-space-1);
  text-align: left;
  border: var(--dl-border-width) solid transparent;
  border-radius: var(--dl-radius-md);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-bar__row-main {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-width: 0;
}

.file-bar__row:hover {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.file-bar__row:active {
  transform: translateY(var(--dl-lift-press));
}

.file-bar__row:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.file-bar__row[aria-current='true'] {
  border-color: var(--dl-border-strong);
  border-inline-start: var(--dl-space-1) solid var(--dl-accent);
  background: var(--dl-accent-soft);
}

.file-bar__row-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
}

/* 路径属技术信息:等宽 + 二级文字色。 */
.file-bar__row-path {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.file-menu-pop-enter-active,
.file-menu-pop-leave-active {
  transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard);
}

.file-menu-pop-enter-from,
.file-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(var(--dl-space-1));
}

@media (prefers-reduced-motion: reduce) {
  .file-tab-slot {
    transition: none;
  }

  .file-tab:active,
  .file-bar__trigger:active:not(:disabled),
  .file-bar__row:active {
    transform: none;
  }
}
</style>
