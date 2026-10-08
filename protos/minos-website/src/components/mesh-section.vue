<script setup lang="ts">
// 跨层 Mesh:L2 / L3 / L7 可切换的分层视图 —— 不把三层硬塞进一张图。
// 层选择器复用 tabs-strip.vue(与 Hero 主视觉同一套 W3C APG tabs 语义与键盘行为:
// roving tabindex、←/→ 循环、Home/End、自动激活、焦点留在标签上);
// 每层一张聚焦图 + 图例 + 映射到该层的能力清单(逐条)。
// 三个 panel 叠在同一 grid 单元格:容器高度 = 最高 panel,切换时整节高度不跳动;
// 非活动 panel 用 visibility 保留占位并加 inert(不可 Tab、不被读屏播报)。
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import { useI18n } from '../i18n'
import { meshLayers } from '../data/home'
import type { MeshLayer } from '../contracts/generated/mesh-layer'
import SpecHead from './spec-head.vue'
import TabsStrip from './tabs-strip.vue'
import FigureL2 from './figure-l2.vue'
import FigureL3 from './figure-l3.vue'
import FigureL7 from './figure-l7.vue'

const { t } = useI18n()

type LayerId = MeshLayer['id']

const FIGURES: Record<LayerId, Component> = {
  l2: FigureL2,
  l3: FigureL3,
  l7: FigureL7,
}

// 当前层;默认 L2。
const activeIndex = ref(0)

// 层选择器数据:随语言变化(新数组身份触发 tabs-strip 重测短线)。
const tabDefs = computed(() =>
  meshLayers.map((layer) => ({ id: layer.id, label: t.value.mesh.layers[layer.id].tab })),
)

// ---- 图例:每层的线型含义不同,按层组装(线型种类与 Hero 同源:实线 / 虚线)----
type LegendKind = 'solid' | 'dashed'

interface LegendItem {
  kind: LegendKind
  label: string
}

function legendFor(id: LayerId): LegendItem[] {
  const legends = t.value.mesh.layers
  switch (id) {
    case 'l2':
      return [
        { kind: 'solid', label: legends.l2.legend.link },
        { kind: 'dashed', label: legends.l2.legend.segment },
      ]
    case 'l3':
      return [
        { kind: 'solid', label: legends.l3.legend.route },
        { kind: 'dashed', label: legends.l3.legend.subnet },
      ]
    case 'l7':
      return [{ kind: 'solid', label: legends.l7.legend.flow }]
  }
}

function activate(index: number): void {
  activeIndex.value = index
}
</script>

<template>
  <section id="mesh" class="dl-section dl-grid">
    <div class="dl-container">
      <SpecHead
        index="03"
        :eyebrow="t.mesh.eyebrow"
        :tag="t.mesh.tag"
        :title="t.mesh.title"
        :lede="t.mesh.lede"
      />

      <TabsStrip
        :tabs="tabDefs"
        :active-index="activeIndex"
        :label="t.mesh.selectorLabel"
        id-prefix="mesh-layer"
        @activate="activate"
      />

      <!-- 分层视图:三个 panel 叠放,容器高度 = 最高 panel,切换不跳动 -->
      <div class="mesh-stack">
        <div
          v-for="(layer, index) in meshLayers"
          :id="`mesh-layer-panel-${layer.id}`"
          :key="layer.id"
          class="mesh-panel"
          :class="{ 'mesh-panel--active': activeIndex === index }"
          role="tabpanel"
          tabindex="0"
          :aria-labelledby="`mesh-layer-tab-${layer.id}`"
          :inert="activeIndex !== index"
        >
          <!-- 聚焦图版图:与区块同色的不透明画布面,层级靠发丝边框与角标 -->
          <div class="mesh-plate dl-corners">
            <div class="mesh-plate__figure dl-grid">
              <component :is="FIGURES[layer.id]" />
            </div>
            <div class="mesh-plate__foot">
              <ul class="mesh-plate__legend">
                <li v-for="item in legendFor(layer.id)" :key="item.kind" class="mesh-plate__legend-item">
                  <svg
                    class="mesh-plate__swatch"
                    viewBox="0 0 24 12"
                    width="24"
                    height="12"
                    aria-hidden="true"
                  >
                    <line
                      x1="0"
                      y1="6"
                      x2="24"
                      y2="6"
                      :class="{
                        'fig-edge': item.kind === 'solid',
                        'fig-edge fig-edge--dashed': item.kind === 'dashed',
                      }"
                      vector-effect="non-scaling-stroke"
                    />
                  </svg>
                  <span>{{ item.label }}</span>
                </li>
              </ul>
              <span class="mesh-plate__note dl-mono">{{ t.mesh.layers[layer.id].note }}</span>
            </div>
          </div>

          <!-- 该层的说明与能力清单(逐条) -->
          <div class="mesh-side">
            <h3 class="mesh-side__title">{{ t.mesh.layers[layer.id].title }}</h3>
            <p class="mesh-side__blurb">{{ t.mesh.layers[layer.id].blurb }}</p>
            <ul class="mesh-caps">
              <li v-for="capId in layer.capabilities" :key="capId" class="mesh-caps__item">
                <span class="mesh-caps__marker" aria-hidden="true" />
                <div class="mesh-caps__body">
                  <h4 class="mesh-caps__title">{{ t.mesh.capabilities[capId].title }}</h4>
                  <p class="mesh-caps__desc">{{ t.mesh.capabilities[capId].desc }}</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 三个 panel 叠在同一 grid 单元格:容器高度自动等于最高 panel,切换无跳动,不写死高度 */
.mesh-stack {
  display: grid;
  margin-top: var(--dl-space-6);
}

.mesh-panel {
  grid-area: 1 / 1;
  min-width: 0;
  display: grid;
  gap: var(--dl-space-6);
  align-content: start;
  align-items: start;
  /* 切换动效:淡入淡出 + 极小位移,只动 transform / opacity;
     visibility 同步过渡:隐藏侧淡出完成后才置 hidden,显示侧立即占位渐显 */
  opacity: 0;
  visibility: hidden;
  transform: translateY(var(--dl-space-3));
  transition:
    opacity var(--dl-duration-base) var(--dl-ease-standard),
    transform var(--dl-duration-base) var(--dl-ease-standard),
    visibility var(--dl-duration-base) var(--dl-ease-standard);
}

.mesh-panel--active {
  opacity: 1;
  visibility: visible;
  transform: none;
}

/* 图版:与区块同色的不透明画布面(--dl-bg-base),网络图与身后页面网格解耦;
   宽度以图版固有尺寸为上限,不得随视口无上界放大 */
.mesh-plate {
  width: 100%;
  max-width: calc(var(--dl-figure-width) + var(--dl-space-6) * 2 + var(--dl-border-width) * 2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-base);
  padding: var(--dl-space-6);
  display: grid;
  gap: var(--dl-space-4);
}

/* 图版内再铺一层淡网格:图纸上的图 */
.mesh-plate__figure {
  border: var(--dl-border-width) solid var(--dl-border-subtle);
  border-radius: var(--dl-radius-md);
}

.mesh-plate__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--dl-space-2) var(--dl-space-6);
  /* 等宽注记的宽度随字体度量变化,可能把这一行从 1 行挤成 2 行、进而改变图版高度;
     按最坏情况(图例一行 snug + 注记一行 body + 行距)预留两行高度,
     注记折行与否图版高度都不变 —— 布局不依赖等宽字体的精确宽度 */
  min-block-size: calc(
    var(--dl-font-size-xs) * var(--dl-line-snug) +
    var(--dl-font-size-xs) * var(--dl-line-body) +
    var(--dl-space-2)
  );
}

.mesh-plate__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2) var(--dl-space-4);
}

.mesh-plate__legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
  white-space: nowrap;
}

.mesh-plate__note {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-text-tertiary);
  /* 规格注记是短记号,永不自身折行;其宽度变化由 .mesh-plate__foot 的预留高度吸收 */
  white-space: nowrap;
}

/* 侧栏:层标题 + 一句说明 + 能力清单 */
.mesh-side {
  display: grid;
  gap: var(--dl-space-4);
  align-content: start;
}

.mesh-side__title {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-snug);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.mesh-side__blurb {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
  max-width: var(--dl-measure);
}

.mesh-caps {
  display: grid;
}

.mesh-caps__item {
  display: flex;
  align-items: baseline;
  gap: var(--dl-space-3);
  padding-block: var(--dl-space-3);
}

.mesh-caps__item + .mesh-caps__item {
  border-top: var(--dl-border-width) solid var(--dl-border-subtle);
}

/* 能力条目标记:一小段青瓷刻度(长度走间距阶,粗细由发丝线宽派生一档加粗,不新增 token) */
.mesh-caps__marker {
  flex: none;
  width: var(--dl-space-3);
  block-size: calc(var(--dl-border-width) * 2);
  background-color: var(--dl-accent);
}

.mesh-caps__body {
  display: grid;
  gap: var(--dl-space-1);
}

.mesh-caps__title {
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-snug);
  font-weight: 500;
  color: var(--dl-text-primary);
}

.mesh-caps__desc {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 宽屏:图版 7 / 侧栏 5 双栏(与 Hero 同比例);窄屏单列堆叠 */
@media (min-width: 1080px) {
  .mesh-panel {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: var(--dl-space-8);
  }
}
</style>
