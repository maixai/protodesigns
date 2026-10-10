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
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { FileTab, RecentFile } from '../data/open-files'
import type { ProjectEntryStateId } from '../contracts/generated/project-entry'
import { fileBaseName, fileDirName, fileTabKey } from '../data/open-files'
import { useI18n } from '../i18n'

const props = defineProps<{
  tabs: FileTab[]
  // 活动 tab 的键(项目 + 路径)—— 打开集跨项目,单靠路径不再唯一。
  activeKey: string
  // 当前**正在看的**项目 id:只用于把「最近打开」分组呈现(本项目 / 其它项目),
  // 不再是这条栏的作用域(打开集本身跨项目共享)。
  currentProjectId: string
  // 最近打开过、当前**未**打开的条目(跨项目,新的在前)—— ▾ 菜单按项目分组呈现。
  recent: RecentFile[]
  // 文件的状态芯片(新建 / 已改 / 待确认)。由页面按与文件树**同一条**规则派生后传入,
  // 于是芯片在「允许确认」后即时由 pending 变 modified,不必重取列表。
  // 入参是**整个 tab**(打开集跨项目,状态要按 tab 自己的项目去查),不再是单个路径。
  stateOf: (tab: FileTab) => ProjectEntryStateId
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [key: string]
  close: [key: string]
  reorder: [order: string[]]
  'open-recent': [entry: RecentFile]
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

// tab 的 title(悬停可读):项目 · 路径 · 打开方式。打开集跨项目,故项目名必须进 title。
function tabTitle(tab: FileTab): string {
  const how = tab.kind === 'preview' ? t.value.workspace.fileBar.previewTag : t.value.workspace.fileBar.pinnedTag
  return `${tab.projectName} · ${tab.path} · ${how}`
}

// ---- ▾ 菜单:最近打开按项目分组(先「本项目」再「其它项目」)----
// 依据:VS Code 把「最近工作区」与「最近文件」分组呈现,条目用 label + description 两段表达
// (名字 + 所属上下文);同一项目内的条目省掉重复的项目前缀,只留路径。
const currentProjectRecent = computed(() => props.recent.filter((entry) => entry.projectId === props.currentProjectId))
const otherProjectRecent = computed(() => props.recent.filter((entry) => entry.projectId !== props.currentProjectId))

// 次行(description)一律「项目 › 目录路径」—— 打开集跨项目,出处在每一行都要写清楚;
// 根目录下的文件省略目录段,只留项目名。
function recentDescription(entry: RecentFile): string {
  const dir = fileDirName(entry.path)
  return `${entry.projectName} › ${dir === '' ? '/' : dir}`
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
  // 预留:菜单钮(紧凑导航行档)+ 两段间隙。本组件是**裸条**(内边距由外面那条底栏给),
  // 故它自己的 clientWidth 已是可用内容宽。
  const control = Number.parseFloat(rootStyle?.getPropertyValue('--workspace-nav-control-size') ?? '') || 32
  stripWidth.value = Math.max(0, (rootRef.value?.clientWidth ?? 0) - control - tabGap.value * 2)
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

const visibleKeys = computed(() => new Set(visibleTabs.value.map((tab) => fileTabKey(tab))))
const hiddenTabs = computed(() => props.tabs.filter((tab) => !visibleKeys.value.has(fileTabKey(tab))))
const menuBadge = computed(() => (hiddenTabs.value.length > 0 ? String(hiddenTabs.value.length) : null))

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

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (!isMenuOpen.value) return
    event.preventDefault()
    event.stopPropagation()
    closeMenu(true)
    return
  }
  const rows = rowElements()
  if (rows.length === 0) return
  const index = rows.findIndex((row) => row === document.activeElement)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (index === -1) rows[0]?.focus()
    else rows[Math.min(index + 1, rows.length - 1)]?.focus()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (index <= 0) menuTriggerRef.value?.focus()
    else rows[index - 1]?.focus()
  } else if (event.key === 'Home') {
    event.preventDefault()
    rows[0]?.focus()
  } else if (event.key === 'End') {
    event.preventDefault()
    rows.at(-1)?.focus()
  }
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

// 被溢出收起的 tab(属于本项目)与其目录路径。
function hiddenDir(path: string): string {
  const dir = fileDirName(path)
  return dir === '' ? '/' : dir
}

function onSelectRow(key: string, entry: RecentFile | null): void {
  closeMenu(false)
  if (entry === null) emit('select', key)
  else emit('open-recent', entry)
}

let observer: ResizeObserver | undefined

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDragKeydown)
  measureStrip()
  if (rootRef.value !== null && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measureStrip())
    observer.observe(rootRef.value)
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
    <div ref="tabsRef" class="file-tabs" role="tablist" :aria-label="t.workspace.fileBar.label" @keydown="onTabsKeydown">      <!-- 槽位与 tab 平级:HTML 不允许 button 套 button,关闭钮用 tab 的 aria-actions 关联。
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
          :data-file-project="tab.projectId"
          role="tab"
          class="file-tab"
          :class="{ 'is-preview': tab.kind === 'preview' }"
          :aria-selected="fileTabKey(tab) === activeKey"
          :tabindex="fileTabKey(tab) === tabStopKey ? 0 : -1"
          :aria-controls="activeKey ? 'file-panel-body' : undefined"
          :aria-actions="`file-close-${fileTabKey(tab)}`"
          :title="tabTitle(tab)"
          @click="onTabClick(fileTabKey(tab))"
          @focus="focusedKey = fileTabKey(tab)"
        >
          <span class="file-tab__label">{{ fileBaseName(tab.path) }}</span>
          <!-- 出处:项目名小号、弱化地跟在文件名之后(打开集跨项目,tab 必须自己声明出处)。 -->
          <span class="file-tab__project">{{ tab.projectName }}</span>
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
    <!-- 空态:这条栏**常驻**(不再「无文件就不渲染」),空的时候正好承担「把这个手势告诉用户」
         的职责。它占的纵向高度与一行 tab 相同(32),故栏高在空 / 非空两态**完全一致** ——
         这也是常驻带来的实质好处:首次打开文件不会引起转录区几何跳动。 -->
    <p v-if="tabs.length === 0" class="file-bar__empty">{{ t.workspace.fileBar.empty }}</p>
    <!-- ▾ 常驻菜单钮:溢出项的入口 + 「最近打开」的入口(不因当前无溢出 / 无 tab 而消失,
         否则入口会跳位;它也是常驻之后「关掉全部文件仍能找回历史」的通道)。 -->
    <button
      ref="menuTriggerRef"
      type="button"
      class="file-bar__trigger"
      :aria-expanded="isMenuOpen"
      aria-controls="file-bar-panel"
      :aria-label="t.workspace.fileBar.menu"
      :disabled="disabled"
      @click="isMenuOpen = !isMenuOpen"
    >
      <svg class="file-bar__caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      <span v-if="menuBadge" class="file-bar__count" aria-hidden="true">{{ menuBadge }}</span>
    </button>
    <Transition name="file-menu-pop">
      <div v-if="isMenuOpen" id="file-bar-panel" ref="panelRef" class="file-bar__panel" role="dialog" :aria-label="t.workspace.fileBar.menu" @keydown="onMenuKeydown">
        <p v-if="hiddenTabs.length === 0 && recent.length === 0" class="file-bar__hint">{{ t.workspace.fileBar.menuEmpty }}</p>
        <!-- 被溢出收起的 tab:次行一律「项目 › 目录路径」(打开集跨项目,出处在每行都要写清)。 -->
        <section v-if="hiddenTabs.length > 0" class="file-bar__group">
          <h2 class="file-bar__group-title">{{ t.workspace.fileBar.hiddenCount.replace('{count}', String(hiddenTabs.length)) }}</h2>
          <button v-for="tab in hiddenTabs" :key="fileTabKey(tab)" type="button" class="file-bar__row" data-file-option :aria-current="fileTabKey(tab) === activeKey ? 'true' : undefined" @click="onSelectRow(fileTabKey(tab), null)">
            <span class="file-bar__row-main">
              <span class="file-bar__row-name">{{ fileBaseName(tab.path) }}</span>
              <span v-if="chipLabel(tab)" class="file-tab__chip" :data-state="stateOf(tab)">{{ chipLabel(tab) }}</span>
            </span>
            <span class="file-bar__row-path">{{ tab.projectName }} › {{ hiddenDir(tab.path) }}</span>
          </button>
        </section>
        <!-- 最近打开:先「本项目」再「其它项目」(依据:VS Code 的最近工作区 / 最近文件分组)。
             行一律**两段式**(label + description):主行 = 文件名,次行 = 「项目 › 目录路径」。 -->
        <section v-if="currentProjectRecent.length > 0" class="file-bar__group">
          <h2 class="file-bar__group-title">{{ t.workspace.fileBar.recentCurrent }}</h2>
          <button v-for="entry in currentProjectRecent" :key="`${entry.projectId}-${entry.path}`" type="button" class="file-bar__row" data-file-option @click="onSelectRow(entry.path, entry)">
            <span class="file-bar__row-main"><span class="file-bar__row-name">{{ fileBaseName(entry.path) }}</span></span>
            <span class="file-bar__row-path">{{ recentDescription(entry) }}</span>
          </button>
        </section>
        <section v-if="otherProjectRecent.length > 0" class="file-bar__group">
          <h2 class="file-bar__group-title">{{ t.workspace.fileBar.recentOther }}</h2>
          <button v-for="entry in otherProjectRecent" :key="`${entry.projectId}-${entry.path}`" type="button" class="file-bar__row" data-file-option @click="onSelectRow(entry.path, entry)">
            <span class="file-bar__row-main"><span class="file-bar__row-name">{{ fileBaseName(entry.path) }}</span></span>
            <span class="file-bar__row-path">{{ recentDescription(entry) }}</span>
          </button>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 本组件是**裸条**:只负责 [tab 条][▾ 菜单钮] 的排布,不做任何「面」——它被页面放进
   .file-bar-dock(面板底部那条整宽、贴底的停靠栏),栏的底色 / 顶边发丝线 / 底角同心圆角 /
   横向内边距都由那一层给。position: relative 是 ▾ 菜单浮层的定位基准。 */
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

/* tab 上的**出处**:项目名小号、弱化地跟在文件名之后。打开集跨项目,栏里会混装多个项目的
   文件,故每个 tab 必须自己声明出处(它同时进 tab 的 title,悬停可见完整「项目 · 路径」)。 */
.file-tab__project {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  /* 二级文字色而非三级:三级色压在**活动 tab 的浅强调底**上只有 3.93:1(校准装置实测),
     不到正文级 4.5:1;二级色在两种 tab 底色上都富余。 */
  color: var(--dl-text-secondary);
}

/* 预览槽:斜体表达「临时的」—— 三款编辑器(VS Code / Zed / JetBrains)一致的既有语义。 */
.file-tab.is-preview .file-tab__label {
  font-style: italic;
}

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

.file-tab:hover:not([aria-selected='true']) {
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
.file-tab[aria-selected='true'] {
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
