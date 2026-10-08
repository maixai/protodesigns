<script setup lang="ts">
// 分段控件:一组互斥取值(「同一份内容的几种取值」),语义用 radiogroup / radio,
// 不用 tablist —— 避免与 feature-tabs 的 tablist 语义重复(嵌套 tablist 在
// W3C APG 中无规定行为)。
//
// 视觉语言:延续 quickstart 确立的「共享边线格」—— 容器底色即线色,
// 段间与外围都是共享的 1px 线(容器 padding 露出的一圈底色即外框);
// 圆角只圆外围一圈,内部一律直角(首末段的靠外两角减去线宽取圆)。
// 选中态双通道:底抬升(--dl-bg-elevated,深色下比 base 亮)+ 文字提到一级并加字重,
// 不只靠颜色。不用青瓷 —— 本页青瓷配额已收紧到三处(活动标签短线 / focus ring / 主 CTA)。
//
// 键盘(W3C APG radio group):←/→(↑/↓)移动并选中、循环;Home/End 跳首尾;
// roving tabindex:仅选中项为 0,其余 -1。
import { nextTick, ref } from 'vue'

export interface SegmentedOption {
  id: string
  label: string
}

const props = defineProps<{
  // 组的无障碍名称(aria-label)
  label: string
  options: readonly SegmentedOption[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [id: string]
}>()

const groupRef = ref<HTMLElement | null>(null)

function select(id: string, moveFocus: boolean): void {
  if (id === props.modelValue && !moveFocus) return
  emit('update:modelValue', id)
  if (!moveFocus) return
  // 键盘路径:选中后把焦点移到新选中项(radio group 惯例:选中即聚焦)。
  // 等 DOM 提交后再查,roving tabindex 已随选中态更新。
  void nextTick(() => {
    const buttons = groupRef.value?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    if (buttons === undefined) return
    for (const button of buttons) {
      if (button.dataset['id'] === id) {
        button.focus()
        return
      }
    }
  })
}

function onKeydown(event: KeyboardEvent): void {
  const index = props.options.findIndex((option) => option.id === props.modelValue)
  const count = props.options.length
  if (index < 0 || count === 0) return
  let next: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % count
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return
  event.preventDefault()
  const option = props.options[next]
  if (option === undefined) return
  select(option.id, true)
}
</script>

<template>
  <div
    ref="groupRef"
    class="segmented"
    role="radiogroup"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <button
      v-for="option in options"
      :key="option.id"
      class="segmented__option"
      type="button"
      role="radio"
      :data-id="option.id"
      :aria-checked="modelValue === option.id"
      :tabindex="modelValue === option.id ? 0 : -1"
      @click="select(option.id, false)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
/* 共享边线格:容器底色即线色(strong 档),padding 露出的一圈底色构成外框,
   gap 露出段间竖线 —— 不用 overflow:hidden 裁圆角(会剪掉焦点环),
   改由首末段的靠外两角取圆(半径减去线宽,与外线同心) */
.segmented {
  display: grid;
  grid-auto-flow: column;
  /* 等宽分段:1fr 在宽度收缩(fit-content)的 grid 里解析为各段同宽(按最宽项取齐) */
  grid-auto-columns: 1fr;
  gap: var(--dl-border-width);
  width: fit-content;
  max-width: 100%;
  padding: var(--dl-border-width);
  background-color: var(--dl-border-strong);
  border-radius: var(--dl-radius-md);
}

.segmented__option {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--dl-control-height);
  padding-inline: var(--dl-space-4);
  background-color: var(--dl-bg-base);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  white-space: nowrap;
  transition:
    background-color var(--dl-duration-fast) var(--dl-ease-standard),
    color var(--dl-duration-fast) var(--dl-ease-standard);
}

.segmented__option:first-child {
  border-start-start-radius: calc(var(--dl-radius-md) - var(--dl-border-width));
  border-end-start-radius: calc(var(--dl-radius-md) - var(--dl-border-width));
}

.segmented__option:last-child {
  border-start-end-radius: calc(var(--dl-radius-md) - var(--dl-border-width));
  border-end-end-radius: calc(var(--dl-radius-md) - var(--dl-border-width));
}

.segmented__option:hover {
  background-color: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

/* 选中态:底抬升 + 文字一级 + 字重 500(双通道,不只靠颜色) */
.segmented__option[aria-checked='true'] {
  background-color: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font-weight: 500;
}
</style>
