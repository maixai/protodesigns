<script setup lang="ts">
// 统一管理(切换面板的一屏):跨多个 Mia 统一管理模型 / 插件 / Skill(id 与图标键来自契约数据)。
// 区块外壳(section / 底色 / 容器)由 feature-tabs.vue 统一提供,本组件只渲染面板内容。
import { computed } from 'vue'
import { useI18n } from '../i18n'
import { configKinds } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'

const { t } = useI18n()

const items = computed(() =>
  configKinds.map((kind) => ({
    ...kind,
    iconName: toIconName(kind.icon),
    copy: t.value.config.items[kind.id],
  })),
)
</script>

<template>
  <div>
    <div class="dl-section-head">
      <p class="dl-eyebrow">{{ t.config.eyebrow }}</p>
      <h2 class="dl-h2">{{ t.config.title }}</h2>
      <p class="dl-lede">{{ t.config.lede }}</p>
    </div>
    <ul class="config__grid">
      <li v-for="item in items" :key="item.id" class="config__card">
        <span class="config__icon"><DlIcon :name="item.iconName" size="lg" /></span>
        <h3 class="config__title">{{ item.copy.title }}</h3>
        <p class="config__desc">{{ item.copy.desc }}</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 共享边的发丝线格:gap 取线宽、容器底色即线色,相邻格共用一条线;
   格内底不抬升(与页面同底),一律直角。
   两列:两栏布局下面板只占右栏(约 554–880px),三列会把每卡压到 200px 上下,
   中文正文折行过碎 */
.config__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dl-border-width);
  background-color: var(--dl-border-base);
}

/* 三卡两列时第二个空轨道会露出容器线色(一条成色块而非线的横带),
   故第三卡通栏,空格不存在、线只在格与格之间 */
.config__card:last-child {
  grid-column: 1 / -1;
}

.config__card {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  padding: var(--dl-space-6);
  background-color: var(--dl-bg-base);
}

/* 裸图标:描边保持 1.5px 不加粗,可见度靠颜色档 */
.config__icon {
  display: inline-flex;
  color: var(--dl-text-tertiary);
}

.config__title {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-snug);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.config__desc {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 面板变窄时降为 1 列:容器查询按面板实际宽度判定(容器是 feature-tabs 的 panels 层);
   单列时第三卡的通栏声明无害(仅一列),线只在格与格之间 */
@container (max-width: 520px) {
  .config__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
