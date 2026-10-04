<script setup lang="ts">
// token 展示基元:色卡 / 数值卡,把某个 token 的实际取值摊开给人看。
// 色卡背景通过 var() 引用真实 token,因此换方向时自动跟随,不需要传具体颜色。
import { computed } from 'vue'

const props = defineProps<{
  /** token 名,如 --dl-accent-600 */
  name: string
  /** 展示用途的一句说明 */
  usage: string
  /** 色卡引用的 token 变量名;不传则渲染为纯文字卡 */
  swatchVar?: string
  /** 文字色 token:色块上的文字用它保证对比度 */
  textVar?: string
}>()

// 内联样式只放 var() 引用,不放任何字面量视觉值。
const swatchStyle = computed(() =>
  props.swatchVar === undefined
    ? undefined
    : {
        '--swatch-color': `var(${props.swatchVar})`,
        '--swatch-text': `var(${props.textVar ?? '--dl-text-primary'})`,
      },
)
</script>

<template>
  <div class="swatch">
    <div v-if="swatchStyle" class="swatch__chip" :style="swatchStyle" aria-hidden="true">Aa</div>
    <div class="swatch__meta">
      <code class="swatch__name">{{ name }}</code>
      <span class="swatch__usage">{{ usage }}</span>
    </div>
  </div>
</template>

<style scoped>
.swatch {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  min-width: 0;
}

.swatch__chip {
  flex: none;
  display: grid;
  place-items: center;
  width: 3rem;
  height: 2rem;
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--swatch-text);
  background: var(--swatch-color);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
}

.swatch__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.swatch__name {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  overflow-wrap: anywhere;
}

.swatch__usage {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}
</style>
