<script setup lang="ts">
// 随时随地(切换面板的一屏):两个子面板 —— 多端续接 + 通知(需要你拍板时找到你)。
// 面板图标来自契约 ValueProp;通知渠道 chips 来自契约 NoticeChannel。
// 区块外壳(section / 底色 / 容器)由 feature-tabs.vue 统一提供,本组件只渲染面板内容。
import { useI18n } from '../i18n'
import { noticeChannels, valuePropIcon } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()
</script>

<template>
  <div>
    <div class="dl-section-head">
      <p class="dl-eyebrow">{{ t.anywhere.eyebrow }}</p>
      <h2 class="dl-h2">{{ t.anywhere.title }}</h2>
      <p class="dl-lede">{{ t.anywhere.lede }}</p>
    </div>
    <div class="anywhere__grid">
      <div class="anywhere__panel">
        <span class="anywhere__icon"><DlIcon :name="toIconName(valuePropIcon('anywhere'))" size="lg" /></span>
        <h3 class="anywhere__title">{{ t.anywhere.panels.anywhere.title }}</h3>
        <p class="anywhere__desc">{{ t.anywhere.panels.anywhere.desc }}</p>
      </div>
      <div class="anywhere__panel">
        <span class="anywhere__icon"><DlIcon :name="toIconName(valuePropIcon('notify'))" size="lg" /></span>
        <h3 class="anywhere__title">{{ t.anywhere.panels.notify.title }}</h3>
        <p class="anywhere__desc">{{ t.anywhere.panels.notify.desc }}</p>
        <div class="anywhere__channels" role="group" :aria-label="t.anywhere.channelsLabel">
          <span class="anywhere__channels-label">{{ t.anywhere.channelsLabel }}</span>
          <span
            v-for="channel in noticeChannels"
            :key="channel.id"
            class="anywhere__channel"
          >
            <DlIcon :name="toIconName(channel.icon)" size="sm" />
            {{ t.anywhere.channels[channel.id] }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 共享边的发丝线格:gap 取线宽、容器底色即线色,相邻格共用一条线;
   格内底不抬升(与页面同底),一律直角 */
.anywhere__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dl-border-width);
  background-color: var(--dl-border-base);
}

.anywhere__panel {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  padding: var(--dl-space-6);
  background-color: var(--dl-bg-base);
}

/* 裸图标:描边保持 1.5px 不加粗,可见度靠颜色档 */
.anywhere__icon {
  display: inline-flex;
  color: var(--dl-text-tertiary);
}

.anywhere__title {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-snug);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.anywhere__desc {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.anywhere__channels {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2);
  margin-top: var(--dl-space-2);
  padding-top: var(--dl-space-3);
  border-top: var(--dl-border-width) solid var(--dl-border-subtle);
}

.anywhere__channels-label {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
  margin-inline-end: var(--dl-space-2);
}

.anywhere__channel {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  padding: var(--dl-space-1) var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

/* 渠道 chip 图标:青瓷配额收紧,降为三级文字色 */
.anywhere__channel .dl-icon {
  color: var(--dl-text-tertiary);
}

/* 面板变窄时降为 1 列:容器查询按面板实际宽度判定(容器是 feature-tabs 的 panels 层);
   单列时线只在格与格之间,无悬空半截线 */
@container (max-width: 520px) {
  .anywhere__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
