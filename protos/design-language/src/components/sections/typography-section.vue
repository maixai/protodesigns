<script setup lang="ts">
// 字体阶:每档按真实字号渲染,直视字阶比例带来的节奏差异。
// lg 及以上是标题级字号,走各语言自己的语气字体(Folio 为衬线),否则看不出差异。
const STEPS = [
  { token: 'xs', usage: '辅助说明 / 标签', isDisplay: false },
  { token: 'sm', usage: '次级文字', isDisplay: false },
  { token: 'md', usage: '正文', isDisplay: false },
  { token: 'lg', usage: '小标题', isDisplay: true },
  { token: 'xl', usage: '区块标题', isDisplay: true },
  { token: '2xl', usage: '页面标题', isDisplay: true },
  { token: '3xl', usage: '展示字号', isDisplay: true },
] as const

const SAMPLE = '设计语言先行,再谈实现细节'
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">字体阶</h2>
    <p class="dl-section__note">
      字号、行高与字重均取自 token;字阶比例决定整个界面的节奏感。
    </p>

    <div class="dl-stack">
      <div v-for="step in STEPS" :key="step.token" class="type-row">
        <code class="type-row__token">--dl-font-size-{{ step.token }}</code>
        <span
          class="type-row__sample"
          :class="{ 'type-row__sample--display': step.isDisplay }"
          :style="{ '--sample-size': `var(--dl-font-size-${step.token})` }"
        >{{ SAMPLE }}</span>
        <span class="type-row__usage">{{ step.usage }}</span>
      </div>
    </div>

    <p class="weights">
      <span class="weights__item" :style="{ '--w': 'var(--dl-weight-regular)' }">Regular 常规</span>
      <span class="weights__item" :style="{ '--w': 'var(--dl-weight-medium)' }">Medium 中等</span>
      <span class="weights__item" :style="{ '--w': 'var(--dl-weight-strong)' }">Strong 强调</span>
    </p>
  </section>
</template>

<style scoped>
.type-row {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-3);
  flex-wrap: wrap;
  padding-bottom: var(--dl-space-2);
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.type-row__token {
  flex: none;
  width: 12em;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.type-row__sample {
  font-size: var(--sample-size);
  line-height: var(--dl-line-tight);
  color: var(--dl-text-primary);
}

.type-row__sample--display {
  font-family: var(--dl-font-display);
}

.type-row__usage {
  margin-left: auto;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.weights {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-4);
  margin: var(--dl-space-3) 0 0;
}

.weights__item {
  font-size: var(--dl-font-size-sm);
  font-weight: var(--w);
  color: var(--dl-text-secondary);
}

code {
  font-size: var(--dl-font-size-xs);
}
</style>
