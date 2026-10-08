<script setup lang="ts">
// 可达性事实条:一排事实项 —— 交代"你能从哪些地方用到 Mia"。
// 区块外壳(深浅作用域 / 居中容器 / 两栏布局)由 app.vue 的分栏骨架统一提供,
// 本组件只渲染内容;两栏模式下它压在左栏(深色)底部。
import { useI18n } from '../i18n'
import { reachItems } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()
</script>

<template>
  <section class="reach" :aria-label="t.reach.sectionLabel">
    <ul class="reach__list">
      <li v-for="item in reachItems" :key="item.id" class="reach__item">
        <DlIcon :name="toIconName(item.icon)" size="sm" />
        <span>{{ t.reach.items[item.id] }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.reach {
  border-top: var(--dl-border-width) solid var(--dl-border-subtle);
  padding-block: var(--dl-space-6);
}

.reach__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--dl-space-3) var(--dl-space-8);
}

.reach__item {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  white-space: nowrap;
}

.reach__item .dl-icon {
  color: var(--dl-accent);
}
</style>
