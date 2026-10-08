<script setup lang="ts">
// Hero:全页唯一的 h1。刻意不放任何主视觉 —— 纯文字构成,靠字阶与留白承担份量。
// 背景使用全页唯一一处氛围辉光(--dl-glow,仅在深色作用域有值)。
// 区块外壳(深浅作用域 / 居中容器 / 两栏布局)由 app.vue 的分栏骨架统一提供,
// 本组件只渲染内容;深色作用域在骨架的左栏上,--dl-glow 经继承生效。
import { useI18n } from '../i18n'

const { t } = useI18n()
</script>

<template>
  <section class="hero">
    <div class="hero__pitch">
      <p class="hero__eyebrow dl-mono">{{ t.hero.eyebrow }}</p>
      <h1 class="hero__title">{{ t.hero.title }}</h1>
      <p class="hero__subtitle">{{ t.hero.subtitle }}</p>
    </div>
  </section>
</template>

<style scoped>
.hero {
  background-image: var(--dl-glow);
  background-repeat: no-repeat;
  /* 无主视觉时,份量全落在字阶与上下留白上:留白给足,首屏才不显得单薄。
     (两栏模式下 padding 由骨架接管,见 app.vue。) */
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

/* 两栏模式的中等宽度(1024–1279):左栏内容宽约 360–460px,
   标题降一阶(2xl)—— 37px 时中文标题(约 11.5em)会挤出一个难看的两行折,
   29px 在该宽度区间内一行放得下。≥1280 恢复 3xl,窄屏堆叠模式不受影响。 */
@media (min-width: 1024px) and (max-width: 1279px) {
  .hero__title {
    font-size: var(--dl-font-size-2xl);
  }
}
</style>
