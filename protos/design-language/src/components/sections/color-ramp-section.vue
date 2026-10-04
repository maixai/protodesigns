<script setup lang="ts">
// 色板:强调色与中性色的完整 ramp。色块背景一律通过 var() 引用真实 token,
// 因此这里没有任何字面量颜色,换方向时自动跟随。
const ACCENT_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const
const NEUTRAL_STEPS = [
  '0',
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
] as const

// 在色块上叠加的示例文字色:浅阶用深字,深阶用浅字,保证可读。
const ON_LIGHT = '--dl-neutral-900'
const ON_DARK = '--dl-neutral-0'
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">色板 ramp</h2>
    <p class="dl-section__note">
      强调色与中性色的原始色阶。语义角色层引用这里的阶,组件只允许引用角色层。
    </p>

    <div class="ramp">
      <span
        v-for="step in ACCENT_STEPS"
        :key="`accent-${step}`"
        class="ramp__chip"
        :style="{
          '--chip': `var(--dl-accent-${step})`,
          '--chip-fg': `var(${Number(step) >= 500 ? ON_DARK : ON_LIGHT})`,
        }"
      >{{ step }}</span>
    </div>

    <div class="ramp">
      <span
        v-for="step in NEUTRAL_STEPS"
        :key="`neutral-${step}`"
        class="ramp__chip"
        :style="{
          '--chip': `var(--dl-neutral-${step})`,
          '--chip-fg': `var(${Number(step) >= 500 ? ON_DARK : ON_LIGHT})`,
        }"
      >{{ step }}</span>
    </div>

    <ul class="roles">
      <li class="roles__item">
        <code>--dl-accent</code> 取 <code>accent-600</code>,hover 取 <code>accent-500</code>,
        active 取 <code>accent-700</code>
      </li>
      <li class="roles__item">
        <code>--dl-bg-elevated</code> / <code>--dl-bg-base</code> / <code>--dl-bg-sunken</code>
        分别取 <code>neutral-0</code> / <code>neutral-50</code> / <code>neutral-100</code>
      </li>
      <li class="roles__item">
        <code>--dl-border-base</code> 取 <code>neutral-200</code>,<code>--dl-border-strong</code>
        取 <code>neutral-300</code>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.ramp {
  /* 用 grid 而非 flex:flex 换行后,末行的最后一个色块会被 flex-grow 拉宽成一大块。 */
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.5rem, 1fr));
  gap: var(--dl-space-1);
  margin-bottom: var(--dl-space-2);
}

.ramp__chip {
  display: grid;
  place-items: center;
  min-height: 2.5rem;
  font-size: var(--dl-font-size-xs);
  font-weight: var(--dl-weight-strong);
  color: var(--chip-fg);
  background: var(--chip);
  border-radius: var(--dl-radius-sm);
  border: var(--dl-border-width) solid var(--dl-border-base);
}

.roles {
  margin: 0;
  padding-left: 1.2em;
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
}

.roles__item {
  margin-bottom: var(--dl-space-1);
}

code {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}
</style>
