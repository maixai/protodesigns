<script setup lang="ts">
// 收尾 CTA:深色区块,大字收束 + 双按钮(同 Hero)。
import { useI18n } from '../i18n'

const { t } = useI18n()
</script>

<template>
  <section class="cta dl-scope dl-scope--dark dl-section">
    <div class="dl-container cta__inner">
      <h2 class="cta__title">{{ t.cta.title }}</h2>
      <div class="cta__actions">
        <a class="dl-btn dl-btn--primary dl-btn--lg" href="#quickstart">{{ t.cta.primary }}</a>
        <a class="dl-btn dl-btn--ghost dl-btn--lg" href="#form-factors">{{ t.cta.secondary }}</a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta {
  border-top: var(--dl-border-width) solid var(--dl-border-subtle);
}

.cta__inner {
  display: grid;
  justify-items: center;
  gap: var(--dl-space-8);
  text-align: center;
}

.cta__title {
  font-size: var(--dl-font-size-3xl);
  line-height: var(--dl-line-tight);
  font-weight: 600;
  letter-spacing: var(--dl-tracking-normal);
  color: var(--dl-text-primary);
}

.cta__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--dl-space-3);
}

/* 窄屏:双按钮纵向堆叠,不破版 */
@media (max-width: 560px) {
  .cta__actions {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }
}
</style>
