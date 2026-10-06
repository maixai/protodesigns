<script setup lang="ts">
// 分享:浅色区块,把部署在服务器上的 headless Mia 分享给他人一起使用。
// 右侧为深色分享示意卡(深色作用域嵌套在浅色区块内),标识为演示占位。
import { useI18n } from '../i18n'
import { SHARED_MIA_ID, valuePropIcon } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()
</script>

<template>
  <section id="share" class="dl-scope dl-scope--light dl-section">
    <div class="dl-container share__inner">
      <div class="dl-section-head">
        <p class="dl-eyebrow">{{ t.share.eyebrow }}</p>
        <h2 class="dl-h2">{{ t.share.title }}</h2>
        <p class="dl-lede">{{ t.share.lede }}</p>
      </div>

      <!-- 分享示意卡:深色作用域嵌套在浅色区块里 -->
      <div class="share__card dl-scope dl-scope--dark" role="group" :aria-label="t.share.cardLabel">
        <div class="share__card-head">
          <span class="share__card-icon"><DlIcon :name="toIconName(valuePropIcon('share'))" /></span>
          <span class="share__card-id dl-mono">{{ SHARED_MIA_ID }}</span>
          <span class="share__card-badge">{{ t.share.cardBadge }}</span>
        </div>
        <p class="share__card-note">{{ t.share.cardNote }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.share__inner {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--dl-space-8);
}

/* 区块头在本区块内占左栏,去掉全局的底部留白,让两栏垂直居中 */
.share__inner .dl-section-head {
  margin-bottom: 0;
}

.share__card {
  display: grid;
  gap: var(--dl-space-3);
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
}

.share__card-head {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
}

.share__card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-control-height);
  height: var(--dl-control-height);
  border-radius: var(--dl-radius-md);
  background-color: var(--dl-accent-soft);
  color: var(--dl-accent);
}

.share__card-id {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

.share__card-badge {
  margin-inline-start: auto;
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-pill);
  background-color: var(--dl-accent);
  color: var(--dl-text-on-accent);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
}

.share__card-note {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

@media (max-width: 900px) {
  .share__inner {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
