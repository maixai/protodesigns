<script setup lang="ts">
// 统一管理:深色区块,跨多个 Mia 统一管理模型 / 插件 / Skill(id 与图标键来自契约数据)。
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { configKinds } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()

const items = computed(() =>
  configKinds.map((kind) => ({
    ...kind,
    iconName: toIconName(kind.icon),
    copy: t.value.config.items[kind.id],
  })),
)
</script>

<template>
  <section id="config" class="dl-scope dl-scope--dark dl-section">
    <div class="dl-container">
      <div class="dl-section-head">
        <p class="dl-eyebrow">{{ t.config.eyebrow }}</p>
        <h2 class="dl-h2">{{ t.config.title }}</h2>
        <p class="dl-lede">{{ t.config.lede }}</p>
      </div>
      <ul class="config__grid">
        <li v-for="item in items" :key="item.id" class="config__card">
          <span class="config__icon"><DlIcon :name="item.iconName" size="lg" /></span>
          <h3 class="config__title">{{ item.copy.title }}</h3>
          <p class="config__desc">{{ item.copy.desc }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.config__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dl-space-6);
}

.config__card {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
  transition: border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.config__card:hover {
  border-color: var(--dl-border-strong);
}

.config__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-target-size);
  height: var(--dl-target-size);
  border-radius: var(--dl-radius-md);
  background-color: var(--dl-accent-soft);
  color: var(--dl-accent);
}

.config__title {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-snug);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.config__desc {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

@media (max-width: 720px) {
  .config__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
