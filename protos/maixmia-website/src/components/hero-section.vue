<script setup lang="ts">
// Hero:深色区块,全页唯一的 h1。
// 刻意不放任何主视觉 —— 纯文字构成,靠字阶与留白承担份量。
// 背景使用全页唯一一处氛围辉光(--dl-glow,仅在深色作用域有值)。
import { useI18n } from '../i18n'

const { t } = useI18n()
</script>

<template>
  <section class="hero dl-scope dl-scope--dark">
    <div class="dl-container">
      <div class="hero__pitch">
        <p class="hero__eyebrow dl-mono">{{ t.hero.eyebrow }}</p>
        <h1 class="hero__title">{{ t.hero.title }}</h1>
        <p class="hero__subtitle">{{ t.hero.subtitle }}</p>
        <div class="hero__ctas">
          <a class="dl-btn dl-btn--primary dl-btn--lg" href="#quickstart">
            {{ t.hero.primaryCta }}
          </a>
          <a class="dl-btn dl-btn--ghost dl-btn--lg" href="#form-factors">
            {{ t.hero.secondaryCta }}
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  background-image: var(--dl-glow);
  background-repeat: no-repeat;
  /* 无主视觉时,份量全落在字阶与上下留白上:留白给足,首屏才不显得单薄。 */
  padding-block: calc(var(--dl-space-12) * 2);
}

.hero__pitch {
  display: grid;
  gap: var(--dl-space-4);
  /* 正文行宽守 --dl-measure(中文按 em 计);标题另行放宽,不受此限。 */
  max-width: var(--dl-measure);
}

.hero__eyebrow {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-accent);
}

.hero__title {
  /* 标题是展示文字而非正文,可越过 --dl-measure 的正文行宽约束,
     但仍要收住,避免超宽屏下拖成一条长线。 */
  max-width: 15em;
  font-size: var(--dl-font-size-3xl);
  line-height: var(--dl-line-tight);
  font-weight: 600;
  letter-spacing: var(--dl-tracking-normal);
  color: var(--dl-text-primary);
}

.hero__subtitle {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.hero__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-3);
  margin-top: var(--dl-space-2);
}

/* 窄屏:双 CTA 纵向堆叠,不破版 */
@media (max-width: 560px) {
  .hero__ctas {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
