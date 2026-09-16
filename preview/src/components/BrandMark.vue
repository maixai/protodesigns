<script setup lang="ts">
// 原型画框占位 mark:外框 + 内容块,22×22 viewBox,颜色跟随 currentColor。
// 尺寸通过 size prop 控制(默认 22),供 hero 等场景放大使用。
defineOptions({ name: 'BrandMark' })

interface BrandMarkProps {
  /** 渲染尺寸(px),默认 22 */
  size?: number
}

const props = withDefaults(defineProps<BrandMarkProps>(), {
  size: 22,
})
</script>

<template>
  <span class="brand-mark">
    <svg
      class="brand-mark__svg"
      :width="props.size"
      :height="props.size"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="2.5" width="17" height="17" rx="3.5" stroke="currentColor" stroke-width="1.6" fill="none" />
      <rect x="7" y="7" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.85" />
    </svg>
  </span>
</template>

<style scoped>
/* 根 span 包裹,inline-flex 让 svg 参与行内布局且不产生行高偏差 */
.brand-mark {
  display: inline-flex;
  line-height: 0;
}
</style>
