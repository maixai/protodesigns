<script setup lang="ts">
// 核心能力:四张「技术规格卡」—— 发丝框 + 等宽编号(01–04)+ 角部 registration marks
// + 标题 + 说明 + 一个极简内嵌线框 motif(几条发丝线构成的小示意图,不是图标库图标)。
// 布局:宽屏三栏(首尾两项各占两格,形成错落),平板两栏,窄屏单栏。
import { useI18n } from '../i18n'
import { capabilities } from '../data/home'
import type { Messages } from '../i18n'
import type { IconShape } from '../data/icons'
import SpecHead from './spec-head.vue'

const { t } = useI18n()

type CapabilityKey = keyof Messages['capabilities']['items']

// 线框 motif:viewBox 48×32,描边几何,全部手写固定坐标(确定性)。
const MOTIFS: Record<CapabilityKey, IconShape> = {
  // 零配置组网:三节点两两相连
  zeroConfig: {
    paths: ['M10 24L24 8', 'M24 8L38 24', 'M10 24L38 24'],
    circles: [
      { cx: 10, cy: 24, r: 2.2 },
      { cx: 24, cy: 8, r: 2.2 },
      { cx: 38, cy: 24, r: 2.2 },
    ],
  },
  // 加密直连:两节点直连,链路中段一枚加密段记号
  encryptedDirect: {
    paths: ['M12.5 16L35.5 16', 'M24 12.5L27.5 16L24 19.5L20.5 16Z'],
    circles: [
      { cx: 10, cy: 16, r: 2.2 },
      { cx: 38, cy: 16, r: 2.2 },
    ],
  },
  // 身份即边界:外部节点经边界进入,与内部节点相连
  identityBoundary: {
    paths: ['M18 7H38V25H18Z', 'M10.5 16L18 16'],
    circles: [
      { cx: 8, cy: 16, r: 2.2 },
      { cx: 28, cy: 16, r: 2.2 },
    ],
  },
  // 一处看清整张网:一张图框住整张互连的网
  visibility: {
    paths: ['M6 8H42V24H6Z', 'M17.2 16H21.8', 'M26.2 16H30.8'],
    circles: [
      { cx: 15, cy: 16, r: 2 },
      { cx: 24, cy: 16, r: 2 },
      { cx: 33, cy: 16, r: 2 },
    ],
  },
}
</script>

<template>
  <section id="capabilities" class="dl-section dl-grid dl-grid--strong">
    <div class="dl-container">
      <SpecHead
        index="02"
        :eyebrow="t.capabilities.eyebrow"
        :tag="t.capabilities.tag"
        :title="t.capabilities.title"
      />

      <ul class="bento">
        <li
          v-for="(cap, index) in capabilities"
          :key="cap.id"
          class="spec-card dl-corners"
          :class="{ 'spec-card--wide': index === 0 || index === capabilities.length - 1 }"
        >
          <div class="spec-card__top">
            <svg
              class="spec-card__motif"
              viewBox="0 0 48 32"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path v-for="d in MOTIFS[cap.id].paths" :key="d" :d="d" />
              <circle
                v-for="c in MOTIFS[cap.id].circles"
                :key="`${c.cx}-${c.cy}`"
                :cx="c.cx"
                :cy="c.cy"
                :r="c.r"
              />
            </svg>
            <span class="spec-card__num dl-mono">{{ String(index + 1).padStart(2, '0') }}</span>
          </div>
          <h3 class="spec-card__title">{{ t.capabilities.items[cap.id].title }}</h3>
          <p class="spec-card__desc">{{ t.capabilities.items[cap.id].desc }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.bento {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--dl-space-6);
}

.spec-card {
  display: grid;
  gap: var(--dl-space-3);
  align-content: start;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
  transition: border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.spec-card:hover {
  border-color: var(--dl-border-strong);
}

.spec-card--wide {
  grid-column: span 2;
}

.spec-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dl-space-3);
}

/* 线框 motif:发丝描边,三级文字色,克制不抢戏 */
.spec-card__motif {
  width: calc(var(--dl-space-12) + var(--dl-space-1));
  height: auto;
  stroke-width: var(--dl-icon-stroke);
  color: var(--dl-text-tertiary);
}

.spec-card__num {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-tertiary);
}

.spec-card__title {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-snug);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.spec-card__desc {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

@media (max-width: 1024px) {
  .bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .bento {
    grid-template-columns: minmax(0, 1fr);
  }

  .spec-card--wide {
    grid-column: auto;
  }
}
</style>
