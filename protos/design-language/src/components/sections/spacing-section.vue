<script setup lang="ts">
// 间距与节奏:同一个卡片在不同间距档下的疏密差异,是"密度取向"最直接的体现。
const SPACES = ['1', '2', '3', '4', '6', '8', '12'] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">间距</h2>
    <p class="dl-section__note">
      灰条宽度即该档间距的实际值;疏密取向不靠单个数值,而靠整套阶梯的相对比例。
    </p>

    <div class="dl-grid spaces">
      <div v-for="step in SPACES" :key="step" class="space">
        <code class="space__token">--dl-space-{{ step }}</code>
        <span
          class="space__bar"
          :style="{ '--bar-w': `var(--dl-space-${step})` }"
          aria-hidden="true"
        ></span>
      </div>
    </div>

    <div class="rhythm">
      <div class="rhythm__card rhythm__card--tight">
        <span class="rhythm__title">紧凑卡片</span>
        <span class="rhythm__body">用 --dl-space-2 作内边距</span>
      </div>
      <div class="rhythm__card rhythm__card--loose">
        <span class="rhythm__title">宽松卡片</span>
        <span class="rhythm__body">用 --dl-space-4 作内边距</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.spaces {
  gap: var(--dl-space-1);
}

.space {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
}

.space__token {
  flex: none;
  width: 8.5em;
  color: var(--dl-text-tertiary);
}

.space__bar {
  width: var(--bar-w);
  height: 0.75rem;
  background: var(--dl-accent);
  border-radius: var(--dl-radius-sm);
}

.rhythm {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--dl-space-2);
  margin-top: var(--dl-space-3);
}

.rhythm__card {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.rhythm__card--tight {
  padding: var(--dl-space-2);
}

.rhythm__card--loose {
  padding: var(--dl-space-4);
}

.rhythm__title {
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.rhythm__body {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}
</style>
