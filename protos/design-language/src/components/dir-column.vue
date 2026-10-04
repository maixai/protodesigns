<script setup lang="ts">
// 语言容器:在此建立 CSS 变量作用域与 Naive 主题覆盖。
//
// 容器不设 :theme —— 子级 provider 自动继承根 provider 的明暗主题;
// themeOverrides 与父级深合并,因此组件库与自绘样式共用同一套取值。
import { NConfigProvider } from 'naive-ui'
import { computed } from 'vue'

import type { Direction } from '../theme/directions'
import { themeMode } from '../theme/theme-mode'

const props = defineProps<{ direction: Direction }>()

const overrides = computed(() => props.direction.naive[themeMode.value])
</script>

<template>
  <n-config-provider :theme-overrides="overrides">
    <div class="dl-scope" :data-dl-dir="props.direction.id">
      <slot />
    </div>
  </n-config-provider>
</template>

<style scoped>
/* 容器只负责建立 token 上下文,自身不产生视觉(角色层的背景 / 文字色在全局 style.css)。 */
.dl-scope {
  min-width: 0;
}
</style>
