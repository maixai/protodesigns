<script setup lang="ts">
// 原生 select 的箭头由浏览器绘制,位置贴边且无法用 token 控制;这里去掉原生外观,
// 用统一描边的 chevron 内缩 12px,让下拉在视觉上留出呼吸,也与全站图标同源。
import DliIcon from './dl-icon.vue'
</script>

<template>
  <span class="select-field">
    <slot />
    <DliIcon name="chevronDown" size="sm" class="select-field__caret" />
  </span>
</template>

<style scoped>
.select-field {
  position: relative;
  display: block;
  min-inline-size: 0;
}

.select-field :deep(select) {
  appearance: none;
  padding-inline-end: var(--dl-space-8);
}

.select-field:focus-within .select-field__caret {
  color: var(--dl-text-secondary);
}

.select-field__caret {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: var(--dl-space-3);
  transform: translateY(-50%);
  color: var(--dl-text-tertiary);
  pointer-events: none;
  transition: color var(--dl-duration-fast) var(--dl-ease-standard);
}
</style>
