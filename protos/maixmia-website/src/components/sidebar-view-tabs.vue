<script setup lang="ts">
// 侧栏视图切换:低矮的文字 tab + 一条细下划线。
//
// 为什么不用分段控件 / tab 块:侧栏只有 260px 宽,值 44px 高的沉底分段会显得又粗又重,
// 还会把「标签」这件事抬高到与内容争夺注意力的位置。GitHub 的 UnderlineNav、Linear 与
// Notion 的侧栏分区都用这一档:文字本身承担导航,下划线只做一个安静的当前项标记。
//
// 语义用 tablist / tab:它切换的是同一块侧栏里的两个面板,不是一组筛选值。
import { computed } from 'vue'

export interface SidebarViewOption {
  id: string
  label: string
  // 可选的小计数(项目数 / 已装插件数)。它用等宽数字,承担「精确读数」的科技感,
  // 不参与点击目标之外的信息层级。
  count?: number | undefined
}

const props = defineProps<{
  label: string
  options: readonly SidebarViewOption[]
  modelValue: string
  // 同一页面可能有多个实例;面板的 id 由它拼出,父级据此给 tabpanel 命名。
  idPrefix: string
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()

const currentIndex = computed(() => props.options.findIndex((option) => option.id === props.modelValue))

function tabId(id: string): string {
  return `${props.idPrefix}-tab-${id}`
}

function select(id: string, moveFocus: boolean): void {
  if (id !== props.modelValue) emit('update:modelValue', id)
  if (!moveFocus) return
  // 键盘路径:选中即聚焦(APG tabs 的惯例),roving tabindex 已在下一帧更新。
  void Promise.resolve().then(() => {
    document.getElementById(tabId(id))?.focus()
  })
}

function onKeydown(event: KeyboardEvent): void {
  const count = props.options.length
  if (count === 0) return
  const index = currentIndex.value < 0 ? 0 : currentIndex.value
  let next: number | null = null
  if (event.key === 'ArrowRight') next = (index + 1) % count
  else if (event.key === 'ArrowLeft') next = (index - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  const option = props.options[next]
  if (option !== undefined) select(option.id, true)
}
</script>

<template>
  <div class="view-tabs" role="tablist" :aria-label="label" @keydown="onKeydown">
    <button
      v-for="option in options" :id="tabId(option.id)" :key="option.id"
      type="button" role="tab" class="view-tabs__tab" :data-id="option.id"
      :aria-selected="modelValue === option.id" :aria-controls="`${idPrefix}-panel-${option.id}`"
      :tabindex="modelValue === option.id ? 0 : -1"
      @click="select(option.id, false)"
    >
      <span class="view-tabs__label">{{ option.label }}</span>
      <span class="view-tabs__count" :data-empty="option.count === undefined ? 'true' : undefined">{{ option.count ?? '' }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 行高 28:比正文行还矮一档 —— 它是一条「读数 + 切换」的细带,不是一块控件。
   两个 tab 各自是一枚足够宽的目标,中心距远大于 24,WCAG 2.5.8 的间距判据天然成立。 */
.view-tabs { display: flex; align-items: stretch; gap: var(--dl-space-4); flex: none; border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.view-tabs__tab { position: relative; display: inline-flex; align-items: center; gap: var(--dl-space-1); min-block-size: calc(var(--dl-space-6) + var(--dl-space-1)); padding: 0; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); letter-spacing: var(--dl-tracking-label); white-space: nowrap; border-radius: var(--dl-radius-sm); transition: color var(--dl-duration-fast) var(--dl-ease-standard); }
/* 计数用等宽数字:数值变化时 tab 宽度不跳动,也把「技术读数」这一层气质带进来。 */
.view-tabs__count { min-inline-size: 1ch; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }
.view-tabs__tab[aria-selected='true'] .view-tabs__count { min-inline-size: 1ch; color: var(--dl-text-secondary); }
/* 当前项:文字提级 + 500 字重 + 一条青瓷细线(三个通道,不只靠颜色)。
   下划线只动 transform(动效白名单),从中间展开。 */
.view-tabs__tab::after { content: ''; position: absolute; inset-inline: 0; inset-block-end: calc(-1 * var(--dl-border-width)); block-size: var(--dl-border-width); background: var(--dl-accent); transform: scaleX(0); transform-origin: center; transition: transform var(--dl-duration-base) var(--dl-ease-standard); }
.view-tabs__tab:hover { color: var(--dl-text-primary); }
.view-tabs__tab[aria-selected='true'] { color: var(--dl-text-primary); font-weight: 500; }
.view-tabs__tab[aria-selected='true']::after { transform: scaleX(1); }
.view-tabs__tab:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
@media (prefers-reduced-motion: reduce) {
  .view-tabs__tab, .view-tabs__tab::after { transition: none; }
}
</style>
