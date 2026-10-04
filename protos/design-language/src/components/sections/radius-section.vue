<script setup lang="ts">
// 圆角:同一组形状套用不同圆角阶,圆角的"性格"直接决定界面是硬朗还是柔软。
const RADII = [
  { token: 'sm', usage: '标签 / 小控件' },
  { token: 'md', usage: '按钮 / 输入框' },
  { token: 'lg', usage: '卡片 / 面板' },
  { token: 'pill', usage: '胶囊 / 头像' },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">圆角</h2>
    <p class="dl-section__note">
      圆角阶必须成套使用,不允许某个组件单独取一个阶以外的值。
    </p>

    <div class="radii">
      <div v-for="item in RADII" :key="item.token" class="radius">
        <div
          class="radius__shape"
          :style="{ '--shape-radius': `var(--dl-radius-${item.token})` }"
          aria-hidden="true"
        ></div>
        <code class="radius__token">--dl-radius-{{ item.token }}</code>
        <span class="radius__usage">{{ item.usage }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.radii {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--dl-space-3);
}

.radius {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dl-space-1);
  text-align: center;
}

.radius__shape {
  width: 100%;
  height: 3rem;
  background: var(--dl-accent-subtle);
  border: var(--dl-border-width) solid var(--dl-accent);
  border-radius: var(--shape-radius);
}

.radius__token {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.radius__usage {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}
</style>
