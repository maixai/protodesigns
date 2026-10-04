<script setup lang="ts">
// Naive UI 映射层:设计语言落到 Vue 侧是两层 —— CSS 变量管自绘样式,
// themeOverrides 管组件库。这张表是两层之间的对应关系,改名或新增 token 时同步维护。
const MAPPING = [
  { token: '--dl-accent', naive: 'common.primaryColor' },
  { token: '--dl-accent-hover', naive: 'common.primaryColorHover' },
  { token: '--dl-accent-active', naive: 'common.primaryColorPressed' },
  { token: '--dl-success', naive: 'common.successColor' },
  { token: '--dl-warning', naive: 'common.warningColor' },
  { token: '--dl-error', naive: 'common.errorColor' },
  { token: '--dl-info', naive: 'common.infoColor' },
  { token: '--dl-bg-base', naive: 'common.bodyColor' },
  { token: '--dl-bg-elevated', naive: 'common.cardColor' },
  { token: '--dl-border-base', naive: 'common.borderColor' },
  { token: '--dl-text-primary', naive: 'common.textColor1' },
  { token: '--dl-text-secondary', naive: 'common.textColor2' },
  { token: '--dl-text-tertiary', naive: 'common.textColor3' },
  { token: '--dl-text-disabled', naive: 'common.textColorDisabled' },
  { token: '--dl-radius-md', naive: 'common.borderRadius' },
  { token: '--dl-font-size-md', naive: 'common.fontSize' },
  { token: '--dl-weight-strong', naive: 'common.fontWeightStrong' },
  { token: '--dl-control-height', naive: 'Button.height* / Input.height*' },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">Naive UI 映射</h2>
    <p class="dl-section__note">
      映射本身不含设计判断,只做搬运;设计值全部来自 token。映射函数见
      <code>src/theme/naive-overrides.ts</code>。
    </p>

    <div class="dl-grid mapping">
      <div v-for="row in MAPPING" :key="row.token" class="mapping__row">
        <code class="mapping__token">{{ row.token }}</code>
        <span class="mapping__arrow" aria-hidden="true">→</span>
        <code class="mapping__naive">{{ row.naive }}</code>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mapping {
  gap: var(--dl-space-1);
}

.mapping__row {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  padding-bottom: var(--dl-space-1);
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.mapping__token {
  flex: none;
  width: 11.5em;
  color: var(--dl-text-secondary);
}

.mapping__arrow {
  flex: none;
  color: var(--dl-text-tertiary);
}

.mapping__naive {
  color: var(--dl-text-tertiary);
  overflow-wrap: anywhere;
}

code {
  font-size: var(--dl-font-size-xs);
}
</style>
