<script setup lang="ts">
// 描边图标:统一 1.5px 描边、不随尺寸缩放(--dl-icon-stroke),纯装饰 aria-hidden。
// 图标几何与名称收窄(toIconName)在 ../data/icons.ts。
import { computed } from 'vue'
import { ICONS } from '../data/icons'
import type { IconName, IconShape } from '../data/icons'

const props = withDefaults(defineProps<{ name: IconName; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
})

const shape = computed<IconShape>(() => ICONS[props.name])
</script>

<template>
  <svg
    class="dl-icon"
    :class="`dl-icon--${size}`"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="d in shape.paths" :key="d" :d="d" />
    <circle v-for="c in shape.circles" :key="`${c.cx}-${c.cy}`" :cx="c.cx" :cy="c.cy" :r="c.r" />
  </svg>
</template>

<style scoped>
.dl-icon {
  width: var(--dl-icon-md);
  height: var(--dl-icon-md);
  /* 描边统一 1.5px,不随尺寸缩放 */
  stroke-width: var(--dl-icon-stroke);
  flex: none;
}

.dl-icon--sm {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
}

.dl-icon--lg {
  width: var(--dl-icon-lg);
  height: var(--dl-icon-lg);
}
</style>
