<script setup lang="ts">
// 「旧方式 → Minos」对比带:全幅横条,左侧传统网络四条痛点,右侧 Minos 对应结果,
// 逐行配对。宽屏三列(痛点 | 箭头 | 结果),窄屏单列堆叠(箭头转为向下)。
// 区块用下沉底材质带 + 淡网格,与上下区块分出节奏(层级靠发丝描边,不靠阴影)。
import { useI18n } from '../i18n'
import { legacyPains } from '../data/home'
import { toIconName } from '../data/icons'
import DlIcon from './dl-icon.vue'
import SpecHead from './spec-head.vue'

const { t } = useI18n()
</script>

<template>
  <section id="compare" class="dl-section compare dl-grid">
    <div class="dl-container">
      <SpecHead
        index="01"
        :eyebrow="t.compare.eyebrow"
        :tag="t.compare.tag"
        :title="t.compare.title"
      />

      <div class="compare__panel">
        <div class="compare__row compare__row--head">
          <span class="compare__col-title">{{ t.compare.legacyTitle }}</span>
          <span aria-hidden="true"></span>
          <span class="compare__col-title compare__col-title--accent">{{ t.compare.minosTitle }}</span>
        </div>

        <div v-for="pain in legacyPains" :key="pain.id" class="compare__row">
          <div class="compare__cell compare__cell--legacy">
            <DlIcon :name="toIconName(pain.icon)" size="sm" />
            <span>{{ t.compare.items[pain.id].pain }}</span>
          </div>
          <svg
            class="compare__arrow"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 12h15" />
            <path d="M13.5 6.5L19 12l-5.5 5.5" />
          </svg>
          <div class="compare__cell compare__cell--fixed">
            <DlIcon name="check" size="sm" />
            <span>{{ t.compare.items[pain.id].fix }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 下沉底材质带:与上下的纯净底区块交替出节奏,发丝线分隔。
   --spec-mask:spec-head 眉标的注记遮罩色须与本区块底色一致(见 spec-head.vue) */
.compare {
  --spec-mask: var(--dl-bg-sunken);
  background-color: var(--dl-bg-sunken);
  border-block: var(--dl-border-width) solid var(--dl-border-subtle);
}

.compare__panel {
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
  overflow: hidden;
}

.compare__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--dl-icon-lg) minmax(0, 1fr);
  align-items: center;
  gap: var(--dl-space-4);
  padding: var(--dl-space-4) var(--dl-space-6);
}

.compare__row + .compare__row {
  border-top: var(--dl-border-width) solid var(--dl-border-subtle);
}

.compare__row--head {
  padding-block: var(--dl-space-3);
  background-color: var(--dl-bg-sunken);
}

.compare__col-title {
  font-size: var(--dl-font-size-xs);
  font-weight: 500;
  letter-spacing: var(--dl-tracking-caps);
  text-transform: uppercase;
  color: var(--dl-text-tertiary);
}

.compare__col-title--accent {
  color: var(--dl-accent);
}

.compare__cell {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
  font-size: var(--dl-font-size-md);
  /* 窄屏会塌成单列,此时它是成句的正文而非表格单元格,故守正文行高下限。 */
  line-height: var(--dl-line-body);
}

.compare__cell--legacy {
  color: var(--dl-text-secondary);
}

.compare__cell--legacy .dl-icon {
  color: var(--dl-text-tertiary);
}

.compare__cell--fixed {
  color: var(--dl-text-primary);
  font-weight: 500;
}

.compare__cell--fixed .dl-icon {
  color: var(--dl-accent);
}

.compare__arrow {
  width: var(--dl-icon-md);
  height: var(--dl-icon-md);
  stroke-width: var(--dl-icon-stroke);
  color: var(--dl-text-tertiary);
  justify-self: center;
}

/* 窄屏:单列堆叠,箭头转为向下 */
@media (max-width: 720px) {
  .compare__row {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--dl-space-2);
  }

  .compare__row--head .compare__col-title:last-child {
    margin-top: var(--dl-space-2);
  }

  .compare__row--head > span[aria-hidden='true'] {
    display: none;
  }

  .compare__arrow {
    transform: rotate(90deg);
    justify-self: start;
    margin-inline-start: var(--dl-space-1);
  }
}
</style>
