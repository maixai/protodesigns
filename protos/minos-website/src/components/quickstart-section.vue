<script setup lang="ts">
// 快速开始:三步(序号 + 标题 + 说明 + 等宽终端命令块)。
// 命令来自 src/data/home.ts(技术信息,不随语言变化),标题与说明在 i18n 词条里。
import { useI18n } from '../i18n'
import { setupSteps } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'
import SpecHead from './spec-head.vue'

const { t } = useI18n()
</script>

<template>
  <section id="quickstart" class="dl-section dl-grid">
    <div class="dl-container">
      <SpecHead
        index="04"
        :eyebrow="t.quickstart.eyebrow"
        :tag="t.quickstart.tag"
        :title="t.quickstart.title"
      />

      <ol class="steps">
        <li v-for="step in setupSteps" :key="step.order" class="steps__card">
          <div class="steps__top">
            <span class="steps__icon"><DlIcon :name="toIconName(step.icon)" size="lg" /></span>
            <span class="steps__order dl-mono">{{ String(step.order).padStart(2, '0') }}</span>
          </div>
          <h3 class="steps__title">{{ t.quickstart.items[step.icon].title }}</h3>
          <p class="steps__desc">{{ t.quickstart.items[step.icon].desc }}</p>
          <div class="steps__term">
            <code class="steps__cmd dl-mono">$ {{ step.command }}</code>
            <code v-for="line in step.output" :key="line" class="steps__out dl-mono">{{ line }}</code>
          </div>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dl-space-6);
}

.steps__card {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
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

/* 终端命令块:等宽、下沉底、发丝描边;底端对齐让三张卡的命令块齐平 */
.steps__term {
  margin-top: auto;
  display: grid;
  gap: var(--dl-space-1);
  padding: var(--dl-space-3) var(--dl-space-4);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background-color: var(--dl-bg-sunken);
  overflow-x: auto;
}

.steps__cmd {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-primary);
  white-space: nowrap;
}

.steps__out {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-tertiary);
  white-space: nowrap;
}

@media (max-width: 960px) {
  .steps {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
