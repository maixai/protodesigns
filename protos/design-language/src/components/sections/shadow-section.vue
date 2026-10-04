<script setup lang="ts">
// 阴影与层级:层级靠什么建立,是三个方向最根本的分歧之一。
// 边框派、阴影派与对比派在这里会呈现出完全不同的观感。
const LEVELS = [
  { token: 'xs', usage: '贴身抬起(输入框聚焦)' },
  { token: 'md', usage: '卡片' },
  { token: 'lg', usage: '浮层 / 弹窗' },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">阴影与层级</h2>
    <p class="dl-section__note">
      层级机制应当唯一:要么靠边框,要么靠阴影,要么靠颜色对比。三者混用会让层级失效。
    </p>

    <div class="levels">
      <div v-for="item in LEVELS" :key="item.token" class="level">
        <div
          class="level__box"
          :style="{ '--box-shadow': `var(--dl-shadow-${item.token})` }"
          aria-hidden="true"
        ></div>
        <code class="level__token">--dl-shadow-{{ item.token }}</code>
        <span class="level__usage">{{ item.usage }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.levels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--dl-space-4);
  padding: var(--dl-space-2) 0;
}

.level {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dl-space-1);
  text-align: center;
}

.level__box {
  width: 100%;
  height: 3rem;
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  box-shadow: var(--box-shadow);
}

.level__token {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.level__usage {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}
</style>
