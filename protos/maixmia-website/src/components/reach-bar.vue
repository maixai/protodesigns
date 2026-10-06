<script setup lang="ts">
// 可达性事实条:深色,一排事实项 —— 交代"你能从哪些地方用到 Mia"。
import { useI18n } from '../i18n'
import { reachItems } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()
</script>

<template>
  <section class="reach dl-scope dl-scope--dark" :aria-label="t.reach.sectionLabel">
    <div class="dl-container">
      <ul class="reach__list">
        <li v-for="item in reachItems" :key="item.id" class="reach__item">
          <DlIcon :name="toIconName(item.icon)" size="sm" />
          <span>{{ t.reach.items[item.id] }}</span>
        </li>
      </ul>
    </div>
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
