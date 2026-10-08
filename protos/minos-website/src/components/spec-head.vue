<script setup lang="ts">
// 技术规格单式区块头:顶部发丝标尺线(两端带小刻度,入场时自左向右绘制)
// → 一行左侧「编号 · 等宽大写眉标」、右侧等宽短标签 → 下方 h2 与可选导语。
// 编号、眉标、标签、标题、导语全部由调用方经 props 传入(词条在 i18n 里)。
defineProps<{
  // 等宽区块编号,如 '01'
  index: string
  eyebrow: string
  // 右侧等宽短标签,如 '规格 · 4 项'
  tag: string
  title: string
  lede?: string
}>()
</script>

<template>
  <div class="spec-head">
    <div class="spec-head__ruler" aria-hidden="true"></div>
    <div class="spec-head__meta">
      <p class="spec-head__eyebrow dl-mono">{{ index }} · {{ eyebrow }}</p>
      <p class="spec-head__tag dl-mono">{{ tag }}</p>
    </div>
    <h2 class="dl-h2">{{ title }}</h2>
    <p v-if="lede !== undefined" class="dl-lede">{{ lede }}</p>
  </div>
</template>

<style scoped>
.spec-head {
  display: grid;
  gap: var(--dl-space-3);
  margin-bottom: calc(var(--dl-space-8) + var(--dl-space-4));
}

/* 标尺线:横贯内容容器的发丝线,两端带小刻度;
   整条用 background 渐变画出,配合 transform 做入场绘制(只对 transform 动效,
   reduced-motion 由全局规则降级)。刻度随线端一起行进,像绘图仪画出来的。 */
.spec-head__ruler {
  height: var(--dl-space-2);
  background-image:
    linear-gradient(var(--dl-border-strong), var(--dl-border-strong)),
    linear-gradient(var(--dl-border-strong), var(--dl-border-strong)),
    linear-gradient(var(--dl-border-strong), var(--dl-border-strong));
  background-repeat: no-repeat;
  background-size:
    100% var(--dl-border-width),
    var(--dl-border-width) var(--dl-space-2),
    var(--dl-border-width) var(--dl-space-2);
  background-position:
    left center,
    left center,
    right center;
  transform-origin: left center;
  animation: spec-head-ruler-in var(--dl-duration-slow) var(--dl-ease-standard) both;
}

@keyframes spec-head-ruler-in {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

.spec-head__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--dl-space-2) var(--dl-space-6);
}

.spec-head__eyebrow {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-accent);
  /* 地图注记式遮罩:与所在区块同色的不透明底,把身后的蓝图网格线遮掉,
     使 accent 小字与网格彻底解耦(网格强度不再受 accent 对比度约束)。
     底色默认 --dl-bg-base(hero / capabilities / quickstart);
     下沉底区块(compare)经 --spec-mask 覆盖为 --dl-bg-sunken。
     padding + 等量负 margin:遮罩略大于字形(呼吸),布局尺寸不变 */
  padding: var(--dl-space-1);
  margin: calc(-1 * var(--dl-space-1));
  background-color: var(--spec-mask, var(--dl-bg-base));
}

.spec-head__tag {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-label);
  /* 标签会压在区块的蓝图网格上:取次级文字色,叠到主级线像素上对比度仍达标 */
  color: var(--dl-text-secondary);
}

/* 标题与导语守正文行宽 */
.spec-head .dl-h2,
.spec-head .dl-lede {
  max-width: var(--dl-measure);
}
</style>
