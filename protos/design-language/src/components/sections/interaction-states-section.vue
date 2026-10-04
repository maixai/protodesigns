<script setup lang="ts">
// 交互态矩阵:把每个状态"定格"下来并排呈现,便于比较与截图核对。
// 真实交互依然存在,这里只是不让评审依赖"把指针移上去才看得到"的反馈。
const STATES = [
  { key: 'default', usage: '静止态' },
  { key: 'hover', usage: '指针悬停' },
  { key: 'focus', usage: '键盘聚焦' },
  { key: 'active', usage: '按下' },
  { key: 'disabled', usage: '不可用' },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">交互态</h2>
    <p class="dl-section__note">
      五态缺一不可。焦点环必须可见 —— 键盘操作者靠它定位。
    </p>

    <div class="states">
      <div v-for="state in STATES" :key="state.key" class="state">
        <button
          type="button"
          class="state__btn"
          :class="`state__btn--${state.key}`"
          :disabled="state.key === 'disabled'"
        >
          主要操作
        </button>
        <code class="state__token">{{ state.key }}</code>
        <span class="state__usage">{{ state.usage }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.states {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--dl-space-3);
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dl-space-1);
  text-align: center;
}

.state__btn {
  width: 100%;
  min-height: var(--dl-control-height);
  padding: 0 var(--dl-space-3);
  font-family: inherit;
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-medium);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border: none;
  border-radius: var(--dl-radius-md);
  cursor: pointer;
}

.state__btn--hover {
  background: var(--dl-accent-hover);
}

.state__btn--focus {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.state__btn--active {
  background: var(--dl-accent-active);
}

.state__btn--disabled {
  color: var(--dl-text-disabled);
  background: var(--dl-bg-sunken);
  border: var(--dl-border-width) solid var(--dl-border-base);
  cursor: not-allowed;
}

.state__token {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.state__usage {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}
</style>
