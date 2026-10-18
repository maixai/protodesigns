<script setup lang="ts">
// 行内「⋯」操作菜单:插件行与市场头共用。
//
// 用原生 disclosure 手写,不用 NDropdown —— 本仓实测 NDropdown 的菜单项无 tabindex、
// 键盘完全不可用。实现与 project-menu 同范式:Esc 归还焦点、点外部 / 焦点移出即关、
// 下方空间不足时向上弹。动作从 items 传入,避免为「配置 / 卸载 / 移除市场」各写一遍。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

export interface RowAction {
  id: string
  label: string
  tone?: 'danger'
}

const props = defineProps<{
  label: string
  items: readonly RowAction[]
}>()
const emit = defineEmits<{ select: [id: string] }>()

const isOpen = ref(false)
const opensUpward = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuHeight = computed(() => props.items.length * 44 + 8)

function measurePlacement(): void {
  const trigger = triggerRef.value
  const container = rootRef.value?.closest('.plugins-pane__scroll')
  if (trigger === null || !(container instanceof HTMLElement)) return
  const triggerRect = trigger.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  opensUpward.value = containerRect.bottom - triggerRect.bottom < menuHeight.value
}

async function toggle(): Promise<void> {
  if (isOpen.value) {
    close(true)
    return
  }
  measurePlacement()
  isOpen.value = true
  await nextTick()
  menuRef.value?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
}

function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function choose(id: string): void {
  close(true)
  emit('select', id)
}

function onKeydown(event: KeyboardEvent): void {
  if (!isOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
  const items = Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
  if (items.length === 0) return
  const index = items.findIndex((item) => item === document.activeElement)
  event.preventDefault()
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
    : event.key === 'ArrowDown' ? (index + 1) % items.length
      : (index - 1 + items.length) % items.length
  items[next]?.focus()
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
  <div ref="rootRef" class="row-menu" :class="{ 'is-open': isOpen }" @focusout="onFocusOut" @keydown="onKeydown">
    <button
      ref="triggerRef" type="button" class="row-menu__trigger"
      :aria-label="label" :aria-expanded="isOpen" aria-haspopup="menu"
      @click="toggle"
    >
      <span aria-hidden="true">⋯</span>
    </button>
    <div
      v-if="isOpen" ref="menuRef" class="row-menu__popover"
      :class="{ 'is-up': opensUpward }" role="menu" :aria-label="label"
    >
      <button
        v-for="item in items" :key="item.id" type="button" class="row-menu__item"
        :data-tone="item.tone" role="menuitem"
        @click="choose(item.id)"
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.row-menu { position: relative; display: inline-flex; }
.row-menu__trigger { display: grid; place-items: center; inline-size: var(--dl-space-6); block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-md); line-height: 1; }
.row-menu__trigger:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.row-menu__trigger:focus-visible { box-shadow: var(--dl-focus-ring); }
.row-menu__trigger[aria-expanded='true'] { background: var(--dl-bg-hover); color: var(--dl-text-primary); }

.row-menu__popover { position: absolute; inset-block-start: calc(100% + var(--dl-space-1)); inset-inline-end: 0; z-index: var(--dl-z-overlay); min-inline-size: 8rem; padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-md); }
.row-menu__popover.is-up { inset-block-start: auto; inset-block-end: calc(100% + var(--dl-space-1)); }
.row-menu__item { display: flex; align-items: center; inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); text-align: left; white-space: nowrap; }
.row-menu__item:hover { background: var(--dl-bg-hover); }
.row-menu__item[data-tone='danger'] { color: var(--dl-error); }
.row-menu__item:focus-visible { box-shadow: var(--dl-focus-ring); }

@media (max-width: 1023px) {
  .row-menu__trigger { inline-size: var(--dl-target-size); block-size: var(--dl-target-size); }
}
</style>
