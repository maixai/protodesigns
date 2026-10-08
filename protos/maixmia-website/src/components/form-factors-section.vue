<script setup lang="ts">
// 两种形态(切换面板的第一屏):左右两栏 —— 桌面 App(本地工作)vs headless(后台远程)。
// 区块外壳(section / 底色 / 容器)由 feature-tabs.vue 统一提供,本组件只渲染面板内容。
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { formFactors } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()

const items = computed(() =>
  formFactors.map((factor) => ({
    ...factor,
    iconName: toIconName(factor.icon),
    copy: t.value.formFactors.items[factor.id],
  })),
)
</script>

<template>
  <div>
    <div class="dl-section-head">
      <p class="dl-eyebrow">{{ t.formFactors.eyebrow }}</p>
      <h2 class="dl-h2">{{ t.formFactors.title }}</h2>
    </div>
    <ul class="forms__grid">
      <li v-for="item in items" :key="item.id" class="forms__card">
        <div class="forms__top">
          <span class="forms__icon"><DlIcon :name="item.iconName" size="lg" /></span>
          <h3 class="forms__title">{{ item.copy.title }}</h3>
        </div>
        <p class="forms__desc">{{ item.copy.desc }}</p>
        <ul class="forms__points">
          <li v-for="point in item.copy.points" :key="point" class="forms__point">
            {{ point }}
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 共享边的发丝线格:gap 取线宽、容器底色即线色,相邻格共用一条线;
   格内底不抬升(与页面同底),一律直角。降为单列时格子纵向堆叠,
   线自然只出现在格与格之间,不会产生悬空的半截线 */
.forms__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dl-border-width);
  background-color: var(--dl-border-base);
}

.forms__card {
  display: grid;
  gap: var(--dl-space-4);
  align-content: start;
  padding: var(--dl-space-6);
  background-color: var(--dl-bg-base);
}

.forms__top {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
}

/* 裸图标:去掉底色方块容器;描边保持 --dl-icon-stroke(1.5px)不加粗,
   可见度靠颜色档(三级文字色)而不是加粗 */
.forms__icon {
  display: inline-flex;
  color: var(--dl-text-tertiary);
}

.forms__title {
  font-size: var(--dl-font-size-xl);
  line-height: var(--dl-line-snug);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.forms__desc {
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.forms__points {
  display: grid;
  gap: var(--dl-space-2);
}

.forms__point {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 列表记号:无彩短横(青瓷配额收紧,记号降为三级文字色),纯装饰 */
.forms__point::before {
  content: '';
  flex: none;
  width: var(--dl-space-3);
  height: var(--dl-border-width);
  background-color: var(--dl-text-tertiary);
  transform: translateY(calc(-1 * var(--dl-space-1)));
}

/* 面板变窄时降为 1 列:容器查询按面板实际宽度判定(两栏布局下面板只占右栏,
   视口媒体查询无法表达;容器是 feature-tabs 的 panels 层) */
@container (max-width: 520px) {
  .forms__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
