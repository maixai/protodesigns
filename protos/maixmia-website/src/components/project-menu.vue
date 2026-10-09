<script setup lang="ts">
// 项目行的「⋯」操作菜单:原生按钮的手写 disclosure,不用 NDropdown —— 本仓实测 NDropdown
// 的菜单项无 tabindex、键盘完全不可用(与 language-switcher / agent-selector 同因)。
//
// 每个项目行各挂一个实例,开合状态留在组件内部:点其它行的 ⋯ 时,本实例会因「点击落在自己
// 之外」而自行关闭,故同一时刻实际只有一个菜单打开,无需把状态提到页面。
//
// 触发钮平时不显示(见页面里 .project-row:hover / :focus-within 的规则),但仍在 DOM、
// 可被 Tab 到达 —— 键盘操作者聚焦它时同样可见。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../i18n'

defineProps<{ projectName: string }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const isOpen = ref(false)
// 浮层默认落在触发钮下方;若所在滚动容器(项目列表)下方空间不足(如列表最后一行),
// 改为向上弹出,避免被容器的 overflow 裁掉。开合时实测一次,不做滚动跟随(菜单项只有一条)。
const opensUpward = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
// 浮层高度的估计值(一条菜单项的触达尺寸 + 内边距),只用于「下方是否放得下」的判断。
const MENU_HEIGHT = 60

function measurePlacement(): void {
  const trigger = triggerRef.value
  const container = rootRef.value?.closest('.project-scroll')
  if (trigger === null || !(container instanceof HTMLElement)) return
  const triggerRect = trigger.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  opensUpward.value = containerRect.bottom - triggerRect.bottom < MENU_HEIGHT
}

function toggle(event: MouseEvent): void {
  if (isOpen.value) {
    close(false)
    return
  }
  measurePlacement()
  isOpen.value = true
  // 指针打开时把焦点留在触发钮(Oprim 的 disclosure 语义):Esc 之后的归还目标始终明确。
  if (event.detail === 0) return
  triggerRef.value?.focus()
}

function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !isOpen.value) return
  event.preventDefault()
  // 阻止冒泡:窄屏抽屉在 document 上也监听 Escape(见 workspace-page 的 drawerKeyboard),
  // 冒泡到那里会让一次 Escape 同时关掉菜单与抽屉,而期望是「先关最上层」。
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

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div ref="rootRef" class="project-menu" :class="{ 'is-open': isOpen }" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      ref="triggerRef" type="button" class="project-menu__trigger"
      :aria-label="`${t.workspace.projectActions}：${projectName}`"
      :aria-expanded="isOpen" aria-haspopup="menu"
      @click="toggle"
    >
      <span aria-hidden="true">⋯</span>
    </button>
    <div v-if="isOpen" class="project-menu__popover" :class="{ 'is-up': opensUpward }" role="menu">
      <button type="button" class="project-menu__item" role="menuitem" @click="close(false); emit('close')">
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

.project-menu__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-target-size);
  height: var(--dl-target-size);
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-md);
  line-height: 1;
}

.project-menu__trigger:hover {
  background: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.project-menu__trigger:focus-visible {
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

/* 下方空间不足时向上弹出(见脚本里的 measurePlacement)。 */
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

.project-menu__item:hover {
  background: var(--dl-bg-hover);
}

.project-menu__item:focus-visible {
  box-shadow: var(--dl-focus-ring);
}
</style>
