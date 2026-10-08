<script setup lang="ts">
// Hero:全页唯一的 h1。整区铺加强版蓝图网格(科技感的结构层);
// 宽屏(≥1080px)左文右图双栏,右侧标签页图版对齐内容容器右缘;
// 窄屏上下堆叠,图版等比缩小、不放大。
// 主视觉 5 屏标签页在 ./hero-tabs.vue(underline 标签栏与无障碍约定见该文件)。
import { useMessage } from 'naive-ui'
import { useI18n } from '../i18n'
import HeroTabs from './hero-tabs.vue'

const { t } = useI18n()
const message = useMessage()

function onDocs(): void {
  message.info(t.value.hero.docsHint)
}
</script>

<template>
  <section class="hero dl-grid dl-grid--strong">
    <div class="dl-container hero__layout">
      <div class="hero__pitch">
        <p class="hero__eyebrow dl-mono">{{ t.hero.eyebrow }}</p>
        <h1 class="hero__title">{{ t.hero.title }}</h1>
        <p class="hero__subtitle">{{ t.hero.subtitle }}</p>
        <div class="hero__ctas">
          <a class="dl-btn dl-btn--primary dl-btn--lg" href="#quickstart">
            {{ t.hero.primaryCta }}
          </a>
          <button class="dl-btn dl-btn--ghost dl-btn--lg" type="button" @click="onDocs">
            {{ t.hero.secondaryCta }}
          </button>
        </div>
      </div>

      <HeroTabs class="hero__tabs" />
    </div>
  </section>
</template>

<style scoped>
.hero {
  padding-block: calc(var(--dl-space-12) * 2);
}

.hero__layout {
  display: grid;
  /* minmax(0, …):把列轨道的 min-content 贡献压到 0 —— 标签条(overflow-x:auto
     + nowrap 标签)与图版自身的 min-content 会把 auto 轨道撑出视口 */
  grid-template-columns: minmax(0, 1fr);
  gap: var(--dl-space-12);
}

.hero__pitch {
  display: grid;
  gap: var(--dl-space-4);
  /* 正文行宽守 --dl-measure(中文按 em 计) */
  max-width: var(--dl-measure);
}

.hero__eyebrow {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-accent);
  /* 地图注记式遮罩:与区块底色(--dl-bg-base)同色的不透明底,把身后的
     加强网格线遮掉,使 accent 小字与网格彻底解耦。
     padding + 等量负 margin:遮罩略大于字形,布局尺寸不变 */
  padding: var(--dl-space-1);
  margin: calc(-1 * var(--dl-space-1));
  background-color: var(--dl-bg-base);
}

.hero__title {
  font-size: var(--dl-font-size-3xl);
  line-height: var(--dl-line-tight);
  font-weight: 600;
  letter-spacing: var(--dl-tracking-normal);
  color: var(--dl-text-primary);
  /* 换行均衡:中文可逐字断行,自然断点在部分宽度会留下两三个字的短行;
     balance 让两行长度接近。一行能放下时不生效,窄屏行数不变 */
  text-wrap: balance;
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

/* 双栏断点取 1080px:再往窄,图版会挤到文字上;再往宽,则白白闲置横向空间。
   网格双栏由较高一栏决定 hero 高度,不需要固定 min-height 撑死区。 */
@media (min-width: 1080px) {
  .hero__layout {
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    align-items: center;
    gap: var(--dl-space-8);
  }

  /* 图版贴内容容器右缘(与顶栏内容右缘对齐) */
  .hero__tabs {
    justify-self: end;
  }
}

/* 窄屏:双 CTA 纵向堆叠,不破版 */
@media (max-width: 560px) {
  .hero__ctas {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
