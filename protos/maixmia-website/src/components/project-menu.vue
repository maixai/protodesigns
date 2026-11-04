<script setup lang="ts">
// 项目行的「⋯」操作菜单:原生按钮的手写 disclosure,不用 NDropdown —— 本仓实测 NDropdown
// 的菜单项无 tabindex、键盘完全不可用(与 agent-selector 同因)。
//
// 菜单只有两个一级项:「设置」与分隔线之后的「关闭项目」。设置不再是可展开入口 ——
// 点击或 Enter 直接交给父级打开唯一的项目设置窗体(模型 / 权限在窗体内用 Tab 切换);
// 项目 MCP 是项目行上的独立入口,不重复放进本菜单。
//
// 每个项目行各挂一个实例,开合状态留在组件内部:点其它行的 ⋯ 时,本实例会因「点击落在自己
// 之外」而自行关闭,故同一时刻实际只有一个菜单打开,无需把状态提到页面。
//
// 触发钮平时不显示(见页面里 .project-row:hover / :focus-within 的规则),但仍在 DOM、
// 可被 Tab 到达 —— 键盘操作者聚焦它时同样可见。
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from '../i18n'

const props = defineProps<{ projectName: string }>()
const emit = defineEmits<{ close: []; configure: [] }>()

const { t } = useI18n()
const isOpen = ref(false)
const opensUpward = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const menuId = `project-menu-${Math.random().toString(36).slice(2)}`

function menuItems(): HTMLButtonElement[] {
  return Array.from(popoverRef.value?.querySelectorAll<HTMLButtonElement>('.project-menu__item[role="menuitem"]') ?? [])
}

// 在菜单内循环聚焦;index 已由调用方换算成「当前项 ± 1」,越界时回绕。
function focusAt(items: HTMLButtonElement[], index: number): void {
  if (items.length === 0) return
  const normalized = (index + items.length) % items.length
  items[normalized]?.focus()
}

// 等浮层实际渲染后读取高度:菜单项与分隔线不再使用固定高度。
// 只在下方不足且上方更宽裕时上翻,避免滚动容器顶部也没有空间时反而被裁。
function measurePlacement(): void {
  const trigger = triggerRef.value
  const popover = popoverRef.value
  const container = rootRef.value?.closest('.project-scroll')
  if (trigger === null || popover === null || !(container instanceof HTMLElement)) return
  const triggerRect = trigger.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const menuHeight = popover.getBoundingClientRect().height
  const below = containerRect.bottom - triggerRect.bottom
  const above = triggerRect.top - containerRect.top
  opensUpward.value = below < menuHeight && above > below
}

async function open(focus: 'first' | 'last' | null): Promise<void> {
  if (isOpen.value) return
  isOpen.value = true
  await nextTick()
  measurePlacement()
  if (focus === 'first') focusAt(menuItems(), 0)
  else if (focus === 'last') focusAt(menuItems(), -1)
}

function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function toggle(): void {
  if (isOpen.value) close(false)
  else void open(null)
}

function onKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) {
    if (event.target !== triggerRef.value) return
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      void open('first')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      void open('last')
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    // 阻止冒泡:窄屏抽屉在 document 上也监听 Escape,一次按键只关最上层的一层。
    event.stopPropagation()
    close(true)
    return
  }
  if (event.key === 'Tab') {
    // Tab / Shift+Tab 关闭整个菜单,不困住焦点。
    close(false)
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = menuItems()
  if (event.key === 'Home') { focusAt(items, 0); return }
  if (event.key === 'End') { focusAt(items, -1); return }
  const current = items.findIndex((item) => item === document.activeElement)
  focusAt(items, event.key === 'ArrowDown' ? (current < 0 ? 0 : current + 1) : (current < 0 ? -1 : current - 1))
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

// 先关菜单并把焦点还给 ⋯,再让父级开窗;窗体关闭后便能沿同一焦点链归还。
function chooseSettings(): void {
  close(true)
  emit('configure')
}

function chooseClose(): void {
  close(false)
  emit('close')
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  syncRowStacking(false)
})

// 项目行是 sticky + z-index,各自形成层叠上下文;打开时给所在行抬一层,关闭即还原。
function syncRowStacking(open: boolean): void {
  const row = rootRef.value?.closest('.project-row')
  if (row instanceof HTMLElement) row.classList.toggle('project-row--menu-open', open)
}
watch(isOpen, syncRowStacking)
</script>

<template>
  <div ref="rootRef" class="project-menu" :class="{ 'is-open': isOpen }" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      ref="triggerRef" type="button" class="project-menu__trigger"
      :aria-label="`${t.workspace.projectActions}：${props.projectName}`"
      :aria-expanded="isOpen" aria-haspopup="menu" :aria-controls="isOpen ? menuId : undefined"
      @click="toggle"
    >
      <span aria-hidden="true">⋯</span>
    </button>
    <div v-if="isOpen" :id="menuId" ref="popoverRef" class="project-menu__popover" :class="{ 'is-up': opensUpward }" role="menu" :aria-label="`${t.workspace.projectActions}：${props.projectName}`">
      <button
        type="button" class="project-menu__item"
        role="menuitem" tabindex="-1"
        :aria-label="`${t.workspace.projectSettings.settingsMenuLabel}：${props.projectName}`"
        @click="chooseSettings"
      >
        {{ t.workspace.projectSettings.settingsMenuItem }}
      </button>
      <div class="project-menu__separator" role="separator" />
      <button
        type="button" class="project-menu__item" data-tone="danger" role="menuitem" tabindex="-1"
        :aria-label="`${t.workspace.closeProject}：${props.projectName}`"
        @click="chooseClose"
      >
        {{ t.workspace.closeProject }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 平时隐藏(透明度 0),由所在行悬停 / 聚焦时显现(规则在 workspace-page 的 .project-row 里);
   用 opacity 而非 display,保证仍可 Tab 到达。打开时始终可见。 */
.project-menu {
  position: relative;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--dl-duration-fast) var(--dl-ease-standard);
}

.project-menu.is-open,
.project-menu:focus-within {
  opacity: 1;
}

/* 密集行里的次要动作:28px 命中区(纵向密集行档),悬停只提亮字形、不铺色块。
   与右侧 caret 相邻排布,两个字形之间约 16px,读作一组动作而不是两个孤立按钮。 */
.project-menu__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--dl-space-6) + var(--dl-space-1));
  height: calc(var(--dl-space-6) + var(--dl-space-1));
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-md);
  line-height: 1;
}

.project-menu__trigger:hover {
  color: var(--dl-text-primary);
}

.project-menu__trigger:focus-visible {
  outline: none;
  box-shadow: var(--dl-focus-ring);
}

/* 浮层:抬起底 + 发丝描边,层序走 --dl-z-overlay(不就地写 9999)。 */
.project-menu__popover {
  position: absolute;
  inset-block-start: calc(100% + var(--dl-space-1));
  inset-inline-end: 0;
  z-index: var(--dl-z-overlay);
  min-width: 8rem;
  padding: var(--dl-space-1);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.project-menu__popover.is-up {
  inset-block-start: auto;
  inset-block-end: calc(100% + var(--dl-space-1));
}

.project-menu__item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
  text-align: left;
  white-space: nowrap;
}

.project-menu__item[data-tone='danger'] { color: var(--dl-error); }

.project-menu__item:hover { background: var(--dl-bg-hover); }
.project-menu__item:focus-visible { box-shadow: var(--dl-focus-ring); }
.project-menu__separator { margin-block: var(--dl-space-1); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
</style>
