<script setup lang="ts">
// 方向总览:名称、性格描述与关键差异点。这是唯一需要拿到方向元数据的区块,
// 其余区块完全靠 token 驱动,因此对方向一无所知 —— 这正是"组件只消费 token"的体现。
import type { Direction } from '../../theme/directions'

defineProps<{ direction: Direction }>()
</script>

<template>
  <section class="dl-section">
    <h2 class="overview__name">{{ direction.name }}</h2>
    <p class="overview__tagline">{{ direction.tagline }}</p>
    <p class="overview__desc">{{ direction.description }}</p>
    <dl class="overview__facts">
      <div v-for="fact in direction.facts" :key="fact.label" class="overview__fact">
        <dt class="overview__label">{{ fact.label }}</dt>
        <dd class="overview__value">{{ fact.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
/* 语言名用大字号 + 该语言自己的语气字体渲染 —— 这是"衬线 vs 无衬线"这类
   根本差异唯一能被一眼看到的地方,不要把它压成区块小标题。 */
.overview__name {
  margin: 0;
  font-family: var(--dl-font-display);
  font-size: var(--dl-font-size-2xl);
  font-weight: var(--dl-weight-strong);
  line-height: var(--dl-line-tight);
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-text-primary);
}

.overview__tagline {
  margin: var(--dl-space-1) 0 var(--dl-space-3);
  font-size: var(--dl-font-size-sm);
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-accent);
}

.overview__desc {
  margin: 0 0 var(--dl-space-3);
  max-width: var(--dl-measure);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.overview__facts {
  display: grid;
  gap: var(--dl-space-1);
  margin: 0;
}

.overview__fact {
  display: flex;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
}

.overview__label {
  flex: none;
  width: 8.5em;
  color: var(--dl-text-tertiary);
}

.overview__value {
  margin: 0;
  color: var(--dl-text-secondary);
}
</style>
