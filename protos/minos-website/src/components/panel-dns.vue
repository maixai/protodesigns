<script setup lang="ts">
// 标签页第 05 屏:自定义私有 DNS。
// 「名称 → 地址」解析图:第一组是主解析(大牌 + 发丝箭头 + 地址牌),下面再列两组配对;
// 名称与地址都是等宽牌,不出现具体产品名。
// 底部两条标注各带引出线:名字随设备入网自动注册 / 私有域名不外泄。
// 几何全部手写固定坐标;名称与地址是技术信息,不随语言变化。
import { useI18n } from '../i18n'
import { toPercent } from './figure-geometry'

const { t } = useI18n()

// 三组名称 → 地址配对;第一组是主解析(牌更高、箭头带标注)
const pairs = [
  { name: 'db.internal', address: '100.84.12.7', y: 96, h: 64 },
  { name: 'nas.home', address: '100.84.12.9', y: 240, h: 52 },
  { name: 'build.internal', address: '100.84.12.14', y: 352, h: 52 },
] as const

const NAME_X = 80
const NAME_W = 200
const ADDR_X = 440
const ADDR_W = 200
</script>

<template>
  <div class="panel">
    <svg
      class="panel__svg"
      viewBox="0 0 720 520"
      width="720"
      height="520"
      role="img"
      :aria-label="t.hero.tabs.panels.dns.diagramLabel"
    >
      <!-- 名称牌 / 地址牌 -->
      <rect
        v-for="pair in pairs"
        :key="`name-${pair.name}`"
        class="fig-box"
        :x="NAME_X"
        :y="pair.y"
        :width="NAME_W"
        :height="pair.h"
        vector-effect="non-scaling-stroke"
      />
      <rect
        v-for="pair in pairs"
        :key="`addr-${pair.name}`"
        class="fig-box"
        :x="ADDR_X"
        :y="pair.y"
        :width="ADDR_W"
        :height="pair.h"
        vector-effect="non-scaling-stroke"
      />
      <!-- 解析箭头:发丝线 + 箭头记号 -->
      <g v-for="pair in pairs" :key="`arrow-${pair.name}`">
        <line
          class="fig-edge"
          :x1="NAME_X + NAME_W"
          :y1="pair.y + pair.h / 2"
          :x2="ADDR_X - 8"
          :y2="pair.y + pair.h / 2"
          vector-effect="non-scaling-stroke"
        />
        <path
          class="fig-arrowhead"
          :d="`M${ADDR_X} ${pair.y + pair.h / 2}L${ADDR_X - 8} ${pair.y + pair.h / 2 - 6}M${ADDR_X} ${pair.y + pair.h / 2}L${ADDR_X - 8} ${pair.y + pair.h / 2 + 6}`"
          vector-effect="non-scaling-stroke"
        />
      </g>
      <!-- 底部标注的引出线:指向各自列的牌。
           两条标注上下错位排布(等宽字宽最宽时同基线放不下整行),
           引出线随各自标注左右微调,仍落在本列牌的横向范围内 -->
      <line class="fig-leader" x1="220" y1="404" x2="220" y2="426" vector-effect="non-scaling-stroke" />
      <line class="fig-leader" x1="528" y1="404" x2="528" y2="468" vector-effect="non-scaling-stroke" />
    </svg>

    <!-- 覆盖层标签:图义由 svg aria-label 承担,对辅助技术隐藏。
         列头锚在 y=62:最窄宽度下行盒底(62+39.3)与首行牌内标签顶(128-19.7)
         之间留有约 7 单位净空,不与首行贴死 -->
    <span class="fig-label fig-label--topleft fig-note" :style="toPercent(NAME_X, 62)" aria-hidden="true">
      {{ t.hero.tabs.panels.dns.labels.nameColumn }}
    </span>
    <span class="fig-label fig-label--topleft fig-note" :style="toPercent(ADDR_X, 62)" aria-hidden="true">
      {{ t.hero.tabs.panels.dns.labels.addressColumn }}
    </span>
    <template v-for="pair in pairs" :key="`labels-${pair.name}`">
      <span
        class="fig-label fig-label--center"
        :style="toPercent(NAME_X + NAME_W / 2, pair.y + pair.h / 2)"
        aria-hidden="true"
      >
        {{ pair.name }}
      </span>
      <span
        class="fig-label fig-label--center"
        :style="toPercent(ADDR_X + ADDR_W / 2, pair.y + pair.h / 2)"
        aria-hidden="true"
      >
        {{ pair.address }}
      </span>
    </template>
    <!-- 主解析箭头上的「解析」标注:锚在两列之间的通道(x=360),
         底缘抬到 y=106 —— 等宽字宽最宽时也不与首行名称牌内的标签相碰 -->
    <span class="fig-label fig-label--above fig-note" :style="toPercent(360, 106)" aria-hidden="true">
      {{ t.hero.tabs.panels.dns.labels.resolve }}
    </span>
    <!-- 底部两条标注:英文文案较长,等宽字宽最宽(0.6em)时同基线会重叠并越出图版,
         故上下错位一行(42 单位,375px 下折算约 16px)并各自向图版内侧收;
         任何等宽字宽下两条标注都留在图版内、行盒互不相交 -->
    <span class="fig-label fig-label--below fig-note" :style="toPercent(220, 432)" aria-hidden="true">
      {{ t.hero.tabs.panels.dns.labels.auto }}
    </span>
    <span class="fig-label fig-label--below fig-note" :style="toPercent(528, 474)" aria-hidden="true">
      {{ t.hero.tabs.panels.dns.labels.private }}
    </span>
  </div>
</template>

<style scoped>
.panel {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
}

.panel__svg {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
