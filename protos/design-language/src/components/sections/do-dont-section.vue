<script setup lang="ts">
// do / don't 对照:每一组左侧是符合设计语言的做法,右侧是必须避免的反例。
// 反例样式集中定义在全局 style.css 的 .dl-anti-* 命名空间下,与正例严格区分。
interface AntiPair {
  readonly title: string
  readonly doText: string
  readonly dontText: string
  /** don't 侧使用的反例类名;为空表示只做文字对照 */
  readonly antiClass: string
}

const PAIRS: readonly AntiPair[] = [
  {
    title: '正文对比度',
    doText: '正文用 --dl-text-primary 或 --dl-text-secondary,对比度 ≥ 4.5:1',
    dontText: '把 --dl-text-disabled 当正文用,读起来吃力',
    antiClass: 'dl-anti-lowcontrast',
  },
  {
    title: '中性色带暖调',
    doText: '中性色锚定暖色相、低饱和,界面读起来有纸感',
    dontText: '用纯灰,界面立刻变冷,像"没配过色"',
    antiClass: 'dl-anti-puregray',
  },
  {
    title: '正文不用纯黑',
    doText: '正文用暖近黑,长文阅读不刺眼',
    dontText: '纯黑正文压在纯白底上,对比过硬',
    antiClass: 'dl-anti-hardcontrast',
  },
  {
    title: '层级只建立一次',
    doText: '按方向选定的那一种机制建层级:边框、阴影或颜色对比',
    dontText: '边框、阴影、渐变同时堆上去,层级反而消失',
    antiClass: 'dl-anti-stacked',
  },
  {
    title: '视觉值走 token',
    doText: '颜色、圆角、间距全部引用 var(--dl-*)',
    dontText: '组件里写死 hex 与 px,换方向时纹丝不动',
    antiClass: 'dl-anti-hardcoded',
  },
  {
    title: '圆角成体系',
    doText: '同一方向只用同一套圆角阶',
    dontText: '四个角各写各的,视觉上立刻散架',
    antiClass: 'dl-anti-mixed-radius',
  },
  {
    title: '克制用色',
    doText: '强调色只用于真正的行动点与选中态',
    dontText: '霓虹渐变铺满,主次全无',
    antiClass: 'dl-anti-gradient',
  },
]
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">do / don't</h2>
    <p class="dl-section__note">反例同样构成规范的一部分,它们会被写进 rules 的禁用值清单。</p>

    <div class="dl-grid pairs">
      <article v-for="pair in PAIRS" :key="pair.title" class="pair">
        <h3 class="pair__title">{{ pair.title }}</h3>
        <div class="pair__row">
          <div class="pair__cell">
            <span class="pair__tag pair__tag--do">Do</span>
            <span class="dl-demo-box">{{ pair.doText }}</span>
          </div>
          <div class="pair__cell">
            <span class="pair__tag pair__tag--dont">Don't</span>
            <span class="dl-demo-box" :class="pair.antiClass">{{ pair.dontText }}</span>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.pairs {
  gap: var(--dl-space-3);
}

.pair {
  margin: 0;
}

.pair__title {
  margin: 0 0 var(--dl-space-1);
  font-size: var(--dl-font-size-xs);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-secondary);
}

.pair__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--dl-space-2);
}

.pair__cell {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  min-width: 0;
}

.pair__tag {
  align-self: flex-start;
  font-size: var(--dl-font-size-xs);
  font-weight: var(--dl-weight-strong);
  letter-spacing: var(--dl-tracking-label);
}

.pair__tag--do {
  color: var(--dl-success);
}

.pair__tag--dont {
  color: var(--dl-error);
}
</style>
