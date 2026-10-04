<script setup lang="ts">
// 状态色:success / warning / error / info 及其浅底变体。
// 状态色不属于"强调色"体系,四态语义在任何方向下都要能被一眼分辨。
const SEMANTIC = [
  { name: 'success', label: '成功 / 正向' },
  { name: 'warning', label: '警告' },
  { name: 'error', label: '错误 / 危险' },
  { name: 'info', label: '信息' },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">状态色</h2>
    <p class="dl-section__note">
      状态色与强调色相互独立:强调色表达"可操作",状态色表达"结果"。
    </p>

    <div class="dl-grid semantics">
      <div v-for="item in SEMANTIC" :key="item.name" class="semantic">
        <span
          class="semantic__chip"
          :style="{ '--chip': `var(--dl-${item.name})` }"
          aria-hidden="true"
        ></span>
        <span class="semantic__label">{{ item.label }}</span>
        <code class="semantic__token">--dl-{{ item.name }}</code>
      </div>
    </div>
  </section>
</template>

<style scoped>
.semantics {
  gap: var(--dl-space-2);
}

.semantic {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
}

.semantic__chip {
  flex: none;
  width: 1.25rem;
  height: 1.25rem;
  background: var(--chip);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-sm);
}

.semantic__label {
  color: var(--dl-text-secondary);
}

.semantic__token {
  margin-left: auto;
  color: var(--dl-text-tertiary);
}
</style>
