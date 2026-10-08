<script setup lang="ts">
// 可分享(切换面板的一屏):把部署在服务器上的 headless Mia 分享给他人一起使用。
// 右侧为分享示意卡(整页同为深色作用域后,示意卡不再需要嵌套深色作用域,
// 用 sunken 底 + 发丝描边做成仪器内的一块下沉预览格),标识为演示占位。
// 区块外壳(section / 底色 / 容器)由 feature-tabs.vue 统一提供,本组件只渲染面板内容。
import { useI18n } from '../i18n'
import { SHARED_MIA_ID, valuePropIcon } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()
</script>

<template>
  <div class="share__inner">
    <div class="dl-section-head">
      <p class="dl-eyebrow">{{ t.share.eyebrow }}</p>
      <h2 class="dl-h2">{{ t.share.title }}</h2>
      <p class="dl-lede">{{ t.share.lede }}</p>
    </div>

    <!-- 分享示意卡:仪器内的一块下沉预览格(sunken 底 + 直角) -->
    <div class="share__card" role="group" :aria-label="t.share.cardLabel">
      <div class="share__card-head">
        <span class="share__card-icon"><DlIcon :name="toIconName(valuePropIcon('share'))" /></span>
        <span class="share__card-id dl-mono">{{ SHARED_MIA_ID }}</span>
        <span class="share__card-badge">{{ t.share.cardBadge }}</span>
      </div>
      <p class="share__card-note">{{ t.share.cardNote }}</p>
    </div>
  </div>
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

/* 示意卡:sunken 下沉底(深色下经修复后比页面底更暗,见 style.css 深色作用域),
   发丝描边,直角 —— 仪器内部件一律直角,圆角只留给最外圈外框 */
.share__card {
  display: grid;
  gap: var(--dl-space-3);
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-base);
  background-color: var(--dl-bg-sunken);
}

.share__card-head {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
}

/* 裸图标:描边保持 1.5px 不加粗,可见度靠颜色档 */
.share__card-icon {
  display: inline-flex;
  color: var(--dl-text-tertiary);
}

.share__card-id {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

/* 占位徽标:青瓷配额收紧,从实底改为中性描边(二级文字色,
   sunken 底上三级文字色只有 4.41:1 不达 AA,故不用 tertiary) */
.share__card-badge {
  margin-inline-start: auto;
  padding-inline: var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-pill);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
}

.share__card-note {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 面板变窄时降为单栏:容器查询按面板实际宽度判定 —— 两栏布局的最窄情形
   (1024px 视口)下面板约 554px,头与卡片并排过挤,降为上下排;
   容器是 feature-tabs 的 panels 层 */
@container (max-width: 640px) {
  .share__inner {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
