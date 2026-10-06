<script setup lang="ts">
// 两种形态:浅色区块,左右两栏 —— 桌面 App(本地工作)vs headless(后台远程)。
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
  <section id="form-factors" class="dl-scope dl-scope--light dl-section">
    <div class="dl-container">
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
  </section>
</template>

<style scoped>
.forms__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--dl-space-6);
}

.forms__card {
  display: grid;
  gap: var(--dl-space-4);
  align-content: start;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated);
  transition: border-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.forms__card:hover {
  border-color: var(--dl-border-strong);
}

.forms__top {
  display: flex;
  align-items: center;
  gap: var(--dl-space-3);
}

.forms__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-target-size);
  height: var(--dl-target-size);
  border-radius: var(--dl-radius-md);
  background-color: var(--dl-accent-soft);
  color: var(--dl-accent);
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

/* 列表记号:青瓷短横,纯装饰 */
.forms__point::before {
  content: '';
  flex: none;
  width: var(--dl-space-3);
  height: var(--dl-border-width);
  background-color: var(--dl-accent);
  transform: translateY(calc(-1 * var(--dl-space-1)));
}

@media (max-width: 720px) {
  .forms__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
