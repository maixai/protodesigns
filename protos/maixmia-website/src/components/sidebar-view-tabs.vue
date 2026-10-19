<script setup lang="ts">
// 侧栏视图切换:低矮的文字 tab + 一条细下划线。
//
// 为什么不用分段控件 / tab 块:侧栏只有 260px 宽,值 44px 高的沉底分段会显得又粗又重,
// 还会把「标签」这件事抬高到与内容争夺注意力的位置。GitHub 的 UnderlineNav、Linear 与
// Notion 的侧栏分区都用这一档:文字本身承担导航,下划线只做一个安静的当前项标记。
//
// 语义用 tablist / tab:它切换的是同一块侧栏里的两个面板,不是一组筛选值。
import { computed } from 'vue'
import type { IconName } from '../data/icons'
import DliIcon from './dl-icon.vue'

export interface SidebarViewOption {
  id: string
  label: string
  // 可选的小计数(项目数 / 已装插件数)。它用等宽数字,承担「精确读数」的科技感,
  // 不参与点击目标之外的信息层级。
  count?: number | undefined
  // 可选的前置图标:只给「同一项目内的内容栏」这类需要一眼分辨用途的二级 tab 用。
  icon?: IconName
}

// 两种形态共用同一套 tablist 语义与键盘:
//   underline —— 侧栏顶层视图切换(低矮文字 + 一条细下划线);
//   rail      —— 项目内内容切换(26px 发丝轨道 + 滑动块 + 等宽计数)。二级控件比顶层更「内嵌」,
//                两者因此不会读成同一层导航。
const props = withDefaults(defineProps<{
  label: string
  options: readonly SidebarViewOption[]
  modelValue: string
  // 同一页面可能有多个实例;面板的 id 由它拼出,父级据此给 tabpanel 命名。
  idPrefix: string
  variant?: 'underline' | 'rail'
}>(), { variant: 'underline' })

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()

const currentIndex = computed(() => props.options.findIndex((option) => option.id === props.modelValue))

// rail 的滑动块只靠两个自定义属性驱动:序号决定位移,数量决定块宽。
const railStyle = computed<Record<string, string>>(() => ({
  '--view-tab-index': String(Math.max(0, currentIndex.value)),
  '--view-tab-count': String(Math.max(1, props.options.length)),
}))

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
  <div
    class="view-tabs" :class="{ 'view-tabs--rail': variant === 'rail' }" role="tablist" :aria-label="label"
    :style="variant === 'rail' ? railStyle : undefined" @keydown="onKeydown"
  >
    <!-- rail 的滑动块:纯装饰,tab 自身仍承担 aria-selected / 焦点。
         位移只动 transform(动效白名单),序号变化时块在两条轨道间滑过去。 -->
    <span v-if="variant === 'rail'" class="view-tabs__thumb" aria-hidden="true" />
    <button
      v-for="option in options" :id="tabId(option.id)" :key="option.id"
      type="button" role="tab" class="view-tabs__tab" :data-id="option.id"
      :aria-selected="modelValue === option.id" :aria-controls="`${idPrefix}-panel-${option.id}`"
      :tabindex="modelValue === option.id ? 0 : -1"
      @click="select(option.id, false)"
    >
      <DliIcon v-if="option.icon" :name="option.icon" size="sm" class="view-tabs__icon" />
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

/* ---- rail:项目内的内容切换(二级控件) ----
   26px 发丝轨道 + 滑动块 + 等宽计数。比顶层的下划线 tab 更「内嵌」,两级不会读成同一层导航;
   轨道底与块面之间只差一档明度,强调色只落在块的底缘(1px)与选中图标上。 */
.view-tabs--rail {
  position: relative;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  align-items: stretch;
  gap: 0;
  inline-size: 100%;
  padding: var(--dl-border-width);
  border-block-end: 0;
  border-radius: var(--dl-radius-md);
  background: var(--dl-bg-sunken);
  box-shadow: inset 0 0 0 var(--dl-border-width) var(--dl-border-base);
}

/* 滑动块:宽 = 内容宽 / tab 数;位移按自身宽度 × 序号(两个 tab 时正好半宽)。
   只动 transform,属于动效白名单。 */
.view-tabs__thumb {
  position: absolute;
  inset-block: var(--dl-border-width);
  inset-inline-start: var(--dl-border-width);
  inline-size: calc((100% - 2 * var(--dl-border-width)) / var(--view-tab-count));
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-block-end-color: var(--dl-accent);
  border-radius: var(--dl-radius-sm);
  background: var(--dl-bg-elevated);
  transform: translateX(calc(var(--view-tab-index) * 100%));
  transition: transform var(--dl-duration-base) var(--dl-ease-standard);
  pointer-events: none;
}

.view-tabs--rail .view-tabs__tab {
  position: relative;
  z-index: 1;
  justify-content: center;
  min-block-size: var(--dl-space-6);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  letter-spacing: var(--dl-tracking-normal);
  transition: color var(--dl-duration-fast) var(--dl-ease-standard), background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.view-tabs--rail .view-tabs__tab::after { display: none; }
.view-tabs--rail .view-tabs__tab:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.view-tabs--rail .view-tabs__tab[aria-selected='true'] { font-weight: 500; }
.view-tabs__icon { flex: none; color: var(--dl-text-tertiary); }
.view-tabs--rail .view-tabs__tab[aria-selected='true'] .view-tabs__icon { color: var(--dl-accent); }

@media (prefers-reduced-motion: reduce) {
  .view-tabs__tab, .view-tabs__tab::after, .view-tabs__thumb { transition: none; }
}
</style>
