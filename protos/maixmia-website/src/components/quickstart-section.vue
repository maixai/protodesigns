<script setup lang="ts">
// 快速开始(切换面板的最后一屏):三步概念流程(装好 Mia → 注册到平台 → 接着用)。
// 区块外壳(section / 底色 / 容器)由 feature-tabs.vue 统一提供,本组件只渲染面板内容。
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
  <div>
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
</template>

<style scoped>
/* 共享边的发丝线格:gap 取线宽、容器底色即线色,相邻格共用一条线;
   格内底不抬升(与页面同底),一律直角。
   两列:两栏布局下面板只占右栏(约 554–880px),三列会把每卡压到 200px 上下,
   中文正文折行过碎 */
.steps__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dl-border-width);
  background-color: var(--dl-border-base);
}

/* 三步两列时第二个空轨道会露出容器线色(一条成色块而非线的横带),
   故第三步通栏,空格不存在、线只在格与格之间 */
.steps__card:last-child {
  grid-column: 1 / -1;
}

.steps__card {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  padding: var(--dl-space-6);
  background-color: var(--dl-bg-base);
}

.steps__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 裸图标:描边保持 1.5px 不加粗,可见度靠颜色档 */
.steps__icon {
  display: inline-flex;
  color: var(--dl-text-tertiary);
}

/* 步骤序号:真实序号(01–03,本面板是流程,序号不是装饰) */
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

/* 面板变窄时降为 1 列:容器查询按面板实际宽度判定(容器是 feature-tabs 的 panels 层);
   单列时第三步的通栏声明无害(仅一列),线只在格与格之间 */
@container (max-width: 520px) {
  .steps__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
