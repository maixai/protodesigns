<script setup lang="ts">
// 根组件:整页深色(固定节奏,不响应 prefers-color-scheme),根部 provider 与顶栏
// 都挂深色映射 —— 顶栏「登录」的轻提示也因此落在深色上下文里。
// 顶栏与页脚在各自组件内挂深色作用域,首屏分栏区由本骨架统一挂深色作用域。
// n-message-provider 挂根部:顶栏「登录」的轻提示经 useMessage 调用;消息容器
// Teleport 到 body(渲染为 Fragment,不引入包裹节点),不参与文档流、不影响 sticky。
//
// 首屏分栏(home-split):≥1024 为左右两栏 —— 左 2 / 右 3,左栏(Hero + 可达条,
// 主张)柔:辉光 + 大字 + 疏;右栏(标签切换面板,证据)硬:结构线格 + 等宽字 + 密。
// 两栏同底(整页 --dl-bg-base,右栏不设任何栏级背景),区分靠性格差而不是颜色差;
// 中间一条内嵌式发丝分隔线(上下各留端点,不贯通全高)。<1024 退回纵向堆叠
// (Hero → 可达条 → 切换面板)。右栏是切换式(一次只显示一个面板),整块约一屏高,
// 左栏无需 sticky。各区块组件不再自带作用域与容器,由本骨架统一提供。
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { darkOverrides } from './theme'
import { useI18n } from './i18n'
import SiteHeader from './components/site-header.vue'
import SiteFooter from './components/site-footer.vue'
import HeroSection from './components/hero-section.vue'
import ReachBar from './components/reach-bar.vue'
import FeatureTabs from './components/feature-tabs.vue'
import InstallSection from './components/install-section.vue'

// 初始化 i18n(语言检测、<html lang> 与 <title> 同步在模块内完成)。
useI18n()
</script>

<template>
  <n-config-provider :theme-overrides="darkOverrides">
    <n-message-provider>
      <SiteHeader />
      <main id="main">
        <div class="home-split dl-scope dl-scope--dark">
          <!-- 两栏分隔线:内嵌式(上下各留端点),纯装饰 -->
          <div class="home-split__divider" aria-hidden="true" />
          <div class="home-split__left">
            <div class="home-split__column-inner">
              <HeroSection />
              <ReachBar />
            </div>
          </div>
          <div class="home-split__right">
            <div class="home-split__column-inner">
              <FeatureTabs />
            </div>
          </div>
        </div>
        <!-- 安装引导:独立区块(不并入 FeatureTabs,避免嵌套 tablist);
             自带深色作用域与容器,结构见 install-section.vue -->
        <InstallSection />
      </main>
      <SiteFooter />
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
/* 两栏(≥1024):网格四列 [gutter][左 2fr][右 3fr][gutter]。
   gutter 与 .dl-container 同源(max(24px, (100% - 容器上限)/2)),
   内容总宽 = min(1520px, 100% - 48px),1280 下左栏约 493px / 右栏约 739px。
   整栏同底:底色由 .home-split 上的深色作用域直接铺到视口边缘,不再需要
   独立的背景层;内容层只占中间两列。 */
@media (min-width: 1024px) {
  .home-split {
    display: grid;
    grid-template-columns:
      minmax(var(--dl-space-6), calc((100% - var(--dl-container-max)) / 2))
      minmax(0, 2fr)
      minmax(0, 3fr)
      minmax(var(--dl-space-6), calc((100% - var(--dl-container-max)) / 2));
  }

  /* 内嵌式分隔线:钉在左右栏边界(左栏右缘),上下各留出与区块纵向节奏同源的
     端点(80px),不贯通全高 —— "线有端点"本身是被设计过的信号。
     线色用 base 档(对页面底约 1.50:1),弱于右栏仪器外框的 strong 档,
     让层级关系可读:页内分隔 < 区块外框。 */
  .home-split__divider {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    width: var(--dl-border-width);
    margin-block: calc(var(--dl-space-12) + var(--dl-space-8));
    background-color: var(--dl-border-base);
  }

  .home-split__left {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    /* 与分隔线之间留一口气;底部留白与右栏 .dl-section 的下留白同距 */
    padding-inline-end: var(--dl-space-8);
    padding-block-end: calc(var(--dl-space-12) + var(--dl-space-8));
  }

  .home-split__right {
    grid-column: 3;
    grid-row: 1;
    min-width: 0;
    padding-inline-start: var(--dl-space-8);
  }

  /* 两栏模式下居中与限宽由网格列承担,内层包装不再参与布局 */
  .home-split__column-inner {
    display: contents;
  }

  /* Hero 撑满左栏剩余高度并垂直居中,可达条自然压到左栏底部 */
  .home-split__left .hero {
    flex: 1;
    display: flex;
    align-items: center;
    padding-block: var(--dl-space-12);
  }
}

/* 纵向堆叠(<1024):分隔线退场,左右块纵向排列,底色仍由 .home-split
   满幅铺到视口边缘;内层包装回到 .dl-container 形态(居中 + 限宽 + gutter) */
@media (max-width: 1023px) {
  .home-split__divider {
    display: none;
  }

  .home-split__column-inner {
    width: min(calc(100% - 2 * var(--dl-space-6)), var(--dl-container-max));
    margin-inline: auto;
  }
}
</style>
