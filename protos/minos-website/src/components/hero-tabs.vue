<script setup lang="ts">
// Hero 主视觉:5 屏标签页,共用一个「图版」外框 —— 等宽编号(01 / 05 …)、标题、
// 一句说明、图例与关键数值标注都在框内;框体四角有 registration marks(.dl-corners)。
// 五屏是同一主题下的并列视图而非序列,按 W3C APG 属 tabs;完全用户驱动,不自动播放
// (WCAG 2.2.2 与 Section 508 均建议自动轮播默认关闭,且轮播内容容易被用户错过)。
//
// 行为约定(校准基线依赖,勿破坏):
//   - 页面加载后默认停在 01 屏;所有面板几何与文案确定(无随机数);
//   - 五个 panel 叠在同一 grid 单元格,容器高度 = 最高 panel,切换时整页高度不跳动;
//   - 非活动 panel 用 visibility(不是 display:none)保留占位,并加 inert
//     使其不可 Tab、不被读屏播报;
//   - 切换动效只允许 transform / opacity(见底部样式),走 token 时长与缓动;
//     reduced-motion 由全局规则降级为瞬切。
//
// 标签条(underline tabs、roving tabindex、键盘行为、青瓷短线实测定位、窄屏溢出
// 滚动)已提炼为 ./tabs-strip.vue,与「跨层 Mesh」层选择器共用;
// tab / panel 的 id 前缀为 hero(hero-tab-* / hero-panel-*)。
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import { useI18n } from '../i18n'
import TabsStrip from './tabs-strip.vue'
import PanelMesh from './panel-mesh.vue'
import PanelAccess from './panel-access.vue'
import PanelEncryption from './panel-encryption.vue'
import PanelEnvironments from './panel-environments.vue'
import PanelDns from './panel-dns.vue'

const { t } = useI18n()

type PanelId = 'mesh' | 'access' | 'encryption' | 'environments' | 'dns'

interface PanelDef {
  id: PanelId
  component: Component
}

const panels: readonly PanelDef[] = [
  { id: 'mesh', component: PanelMesh },
  { id: 'access', component: PanelAccess },
  { id: 'encryption', component: PanelEncryption },
  { id: 'environments', component: PanelEnvironments },
  { id: 'dns', component: PanelDns },
]

const PANEL_COUNT = panels.length

// 当前屏序号;默认 0(01 屏)。
const activeIndex = ref(0)

// 标签条数据:随语言变化(新数组身份触发 tabs-strip 重测短线)。
const tabDefs = computed(() =>
  panels.map((panel) => ({ id: panel.id, label: t.value.hero.tabs.panels[panel.id].tab })),
)

function meta(id: PanelId) {
  return t.value.hero.tabs.panels[id]
}

// 等宽编号:'01 / 05'。
function counterFor(index: number): string {
  return `${String(index + 1).padStart(2, '0')} / ${String(PANEL_COUNT).padStart(2, '0')}`
}

// ---- 图例:每屏的线型含义不同,由外壳按屏组装(线型种类是固定的三档)----
type LegendKind = 'solid' | 'dashed' | 'failed'

interface LegendItem {
  kind: LegendKind
  label: string
}

function legendFor(id: PanelId): LegendItem[] {
  const legends = t.value.hero.tabs.panels
  switch (id) {
    case 'mesh':
      return [
        { kind: 'solid', label: legends.mesh.legend.direct },
        { kind: 'dashed', label: legends.mesh.legend.backup },
        { kind: 'failed', label: legends.mesh.legend.failed },
      ]
    case 'access':
      return [
        { kind: 'solid', label: legends.access.legend.allow },
        { kind: 'dashed', label: legends.access.legend.deny },
      ]
    case 'encryption':
      return [{ kind: 'solid', label: legends.encryption.legend.cipher }]
    case 'environments':
      return [
        { kind: 'solid', label: legends.environments.legend.link },
        { kind: 'dashed', label: legends.environments.legend.boundary },
      ]
    case 'dns':
      return [{ kind: 'solid', label: legends.dns.legend.resolve }]
  }
}

function activate(index: number): void {
  activeIndex.value = index
}
</script>

<template>
  <div class="hero-tabs">
    <TabsStrip
      :tabs="tabDefs"
      :active-index="activeIndex"
      :label="t.hero.tabs.label"
      id-prefix="hero"
      @activate="activate"
    />

    <!-- 图版:与区块同色的不透明画布面(制图纸,不是浮在页面上的白卡片),
         边界由发丝边框与角部 registration marks 承担;不透明是故意的 ——
         网络图本身由发丝线构成,与身后的页面网格同屏会互相干扰。
         五个 panel 叠在同一 grid 单元格:容器高度 = 最高 panel,切换不跳动 -->
    <div class="hero-plate dl-corners">
      <div class="hero-plate__stack">
        <div
          v-for="(panel, index) in panels"
          :id="`hero-panel-${panel.id}`"
          :key="panel.id"
          class="hero-plate__body"
          :class="{ 'hero-plate__body--active': activeIndex === index }"
          role="tabpanel"
          tabindex="0"
          :aria-labelledby="`hero-tab-${panel.id}`"
          :inert="activeIndex !== index"
        >
          <div class="hero-plate__head">
            <span class="hero-plate__counter dl-mono">{{ counterFor(index) }}</span>
            <span class="hero-plate__title">{{ meta(panel.id).title }}</span>
          </div>
          <p class="hero-plate__blurb">{{ meta(panel.id).blurb }}</p>
          <div class="hero-plate__figure dl-grid">
            <component :is="panel.component" />
          </div>
          <!-- 图例与规格标注:图例每屏不同,由外壳按屏组装 -->
          <div class="hero-plate__foot">
            <ul class="hero-plate__legend">
              <li v-for="item in legendFor(panel.id)" :key="item.kind" class="hero-plate__legend-item">
                <svg
                  class="hero-plate__swatch"
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
                      'fig-edge fig-edge--failed': item.kind === 'failed',
                    }"
                    vector-effect="non-scaling-stroke"
                  />
                  <path
                    v-if="item.kind === 'failed'"
                    class="fig-cross"
                    d="M9 3L15 9M9 9L15 3"
                    vector-effect="non-scaling-stroke"
                  />
                </svg>
                <span>{{ item.label }}</span>
              </li>
            </ul>
            <span class="hero-plate__note dl-mono">{{ meta(panel.id).note }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 组件宽度以图版固有尺寸为上限(SVG 720 + 内边距 + 边框),不得随视口无上界放大 */
.hero-tabs {
  width: 100%;
  max-width: calc(var(--dl-figure-width) + var(--dl-space-6) * 2 + var(--dl-border-width) * 2);
}

/* 图版:与区块同色的不透明画布面(--dl-bg-base),不是浮在页面上的白卡片;
   层级只靠发丝边框与角标,不叠阴影 */
.hero-plate {
  margin-top: var(--dl-space-4);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-base);
  padding: var(--dl-space-6);
}

/* 五个 panel 叠在同一 grid 单元格:容器高度自动等于最高 panel,切换无跳动,不写死高度 */
.hero-plate__stack {
  display: grid;
}

.hero-plate__body {
  grid-area: 1 / 1;
  min-width: 0;
  display: grid;
  gap: var(--dl-space-4);
  align-content: start;
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

.hero-plate__body--active {
  opacity: 1;
  visibility: visible;
  transform: none;
}

.hero-plate__head {
  display: flex;
  /* 居中对齐,不用 baseline:baseline 对齐的行高取决于字体 ascent/descent,
     等宽编号换字体度量时行高会漂(两个单项行盒已由 line-height 固定,居中即稳定) */
  align-items: center;
  gap: var(--dl-space-3);
}

.hero-plate__counter {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-tertiary);
  /* 编号是一个整体记号,窄屏下也不得从斜线处折开 */
  white-space: nowrap;
  flex: none;
}

.hero-plate__title {
  font-size: var(--dl-font-size-md);
  font-weight: 600;
  line-height: var(--dl-line-snug);
  color: var(--dl-text-primary);
}

.hero-plate__blurb {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
  max-width: var(--dl-measure);
}

/* 图版内再铺一层淡网格:图纸上的图 */
.hero-plate__figure {
  border: var(--dl-border-width) solid var(--dl-border-subtle);
  border-radius: var(--dl-radius-md);
}

.hero-plate__foot {
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

.hero-plate__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-2) var(--dl-space-4);
}

.hero-plate__legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
  white-space: nowrap;
}

.hero-plate__note {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-text-tertiary);
  /* 规格注记是短记号,永不自身折行;其宽度变化由 .hero-plate__foot 的预留高度吸收 */
  white-space: nowrap;
}
</style>
