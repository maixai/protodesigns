<script setup lang="ts">
// 跨平台带:一排平台名(图标 + 等宽小号标签),横向铺开,窄屏自动换行。
import { useI18n } from '../i18n'
import { platforms } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()
</script>

<template>
  <section id="platforms" class="platforms" :aria-label="t.platforms.sectionLabel">
    <div class="dl-container platforms__inner">
      <span class="platforms__caption dl-mono">{{ t.platforms.caption }}</span>
      <ul class="platforms__list">
        <li v-for="platform in platforms" :key="platform.id" class="platforms__item">
          <DlIcon :name="toIconName(platform.icon)" size="sm" />
          <span class="dl-mono">{{ t.platforms.items[platform.id] }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.platforms {
  /* 抬升底材质带:卡在下沉底(对比带)与纯净底(快速开始)之间 */
  background-color: var(--dl-bg-elevated);
  border-block: var(--dl-border-width) solid var(--dl-border-subtle);
  padding-block: var(--dl-space-6);
}

.platforms__inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-3) var(--dl-space-8);
}

.platforms__caption {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-tertiary);
}

.platforms__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-3) var(--dl-space-8);
}

.platforms__item {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  white-space: nowrap;
}

.platforms__item .dl-icon {
  color: var(--dl-accent);
}
</style>
