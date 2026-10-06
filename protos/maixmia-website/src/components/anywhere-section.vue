<script setup lang="ts">
// 随时随地:深色区块,两个子面板 —— 多端续接 + 通知(需要你拍板时找到你)。
// 面板图标来自契约 ValueProp;通知渠道 chips 来自契约 NoticeChannel。
import { useI18n } from '../i18n'
import { noticeChannels, valuePropIcon } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()
</script>

<template>
  <section id="anywhere" class="dl-scope dl-scope--dark dl-section">
    <div class="dl-container">
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
  </section>
</template>

<style scoped>
.anywhere__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dl-space-6);
}

.anywhere__panel {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
  transition: border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.anywhere__panel:hover {
  border-color: var(--dl-border-strong);
}

.anywhere__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-target-size);
  height: var(--dl-target-size);
  border-radius: var(--dl-radius-md);
  background-color: var(--dl-accent-soft);
  color: var(--dl-accent);
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

.anywhere__channel .dl-icon {
  color: var(--dl-accent);
}

@media (max-width: 720px) {
  .anywhere__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
