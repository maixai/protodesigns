<script setup lang="ts">
// 快速开始:浅色区块,三步概念流程(装好 Mia → 注册到平台 → 接着用)。
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { onboardingSteps } from '../data/home'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()

const steps = computed(() =>
  onboardingSteps.map((step) => ({
    ...step,
    copy: t.value.quickstart.items[step.icon],
  })),
)
</script>

<template>
  <section id="quickstart" class="dl-scope dl-scope--light dl-section">
    <div class="dl-container">
      <div class="dl-section-head">
        <p class="dl-eyebrow">{{ t.quickstart.eyebrow }}</p>
        <h2 class="dl-h2">{{ t.quickstart.title }}</h2>
      </div>
      <ol class="steps__grid">
        <li v-for="step in steps" :key="step.order" class="steps__card">
          <div class="steps__top">
            <span class="steps__icon"><DlIcon :name="step.icon" size="lg" /></span>
            <span class="steps__order dl-mono">{{ String(step.order).padStart(2, '0') }}</span>
          </div>
          <h3 class="steps__title">{{ step.copy.title }}</h3>
          <p class="steps__desc">{{ step.copy.desc }}</p>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.steps__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dl-space-6);
}

.steps__card {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
  transition: border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.steps__card:hover {
  border-color: var(--dl-border-strong);
}

.steps__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.steps__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-target-size);
  height: var(--dl-target-size);
  border-radius: var(--dl-radius-md);
  background-color: var(--dl-accent-soft);
  color: var(--dl-accent);
}

.steps__order {
  font-size: var(--dl-font-size-xl);
  color: var(--dl-text-tertiary);
}

.steps__title {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-snug);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.steps__desc {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

@media (max-width: 720px) {
  .steps__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
