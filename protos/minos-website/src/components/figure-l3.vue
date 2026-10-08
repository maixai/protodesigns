<script setup lang="ts">
// 跨层 Mesh · L3 聚焦图:子网与路由关系。
// 两个子网各含两个节点,子网内直连、跨子网的连线经 Mesh 路由直达 ——
// 路由随入网自动收敛,不用手工维护路由表。
// 几何全部手写固定坐标(确定性);子网名与网段是技术信息,不随语言变化。
import { useI18n } from '../i18n'
import { toPercent } from './figure-geometry'

const { t } = useI18n()

// 两个子网边界(发丝虚线框);网段标注拆两行(子网名 / CIDR),窄屏不越界
const subnets = [
  { x: 56, y: 88, w: 280, h: 344, name: 'subnet-a', cidr: '100.84.12.0/24' },
  { x: 384, y: 88, w: 280, h: 344, name: 'subnet-b', cidr: '100.84.20.0/24' },
] as const

const NODE_R = 6

const nodes = [
  { x: 140, y: 240 }, // a1
  { x: 220, y: 330 }, // a2
  { x: 470, y: 230 }, // b1
  { x: 580, y: 330 }, // b2
] as const

// 子网内直连 + 跨子网路由连线
const edges = [
  { x1: 140, y1: 240, x2: 220, y2: 330 }, // a1—a2(子网内)
  { x1: 470, y1: 230, x2: 580, y2: 330 }, // b1—b2(子网内)
  { x1: 140, y1: 240, x2: 470, y2: 230 }, // a1—b1(跨子网)
  { x1: 220, y1: 330, x2: 580, y2: 330 }, // a2—b2(跨子网)
] as const

const LABEL_INSET = 12
</script>

<template>
  <div class="panel">
    <svg
      class="panel__svg"
      viewBox="0 0 720 520"
      width="720"
      height="520"
      role="img"
      :aria-label="t.mesh.layers.l3.diagramLabel"
    >
      <!-- 子网边界 -->
      <rect
        v-for="subnet in subnets"
        :key="subnet.name"
        class="fig-box--dashed"
        :x="subnet.x"
        :y="subnet.y"
        :width="subnet.w"
        :height="subnet.h"
        vector-effect="non-scaling-stroke"
      />
      <!-- 连线 -->
      <line
        v-for="edge in edges"
        :key="`${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}`"
        class="fig-edge"
        :x1="edge.x1"
        :y1="edge.y1"
        :x2="edge.x2"
        :y2="edge.y2"
        vector-effect="non-scaling-stroke"
      />
      <circle
        v-for="node in nodes"
        :key="`${node.x}-${node.y}`"
        class="fig-node"
        :cx="node.x"
        :cy="node.y"
        :r="NODE_R"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <!-- 覆盖层标签:图义由 svg aria-label 承担,对辅助技术隐藏。
         子网名与网段拆两行锚在边界框内左上角:最宽等宽字宽下也不越出图版 -->
    <template v-for="subnet in subnets" :key="`labels-${subnet.name}`">
      <span
        class="fig-label fig-label--topleft fig-note"
        :style="toPercent(subnet.x + LABEL_INSET, subnet.y + 14)"
        aria-hidden="true"
      >
        {{ subnet.name }}
      </span>
      <span
        class="fig-label fig-label--topleft"
        :style="toPercent(subnet.x + LABEL_INSET, subnet.y + 58)"
        aria-hidden="true"
      >
        {{ subnet.cidr }}
      </span>
    </template>
    <!-- 「经 Mesh 路由」标注:压在 a1—b1 连线下方的中央通道 -->
    <span class="fig-label fig-label--below fig-note" :style="toPercent(360, 258)" aria-hidden="true">
      {{ t.mesh.layers.l3.labels.routed }}
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

/* SVG 以固有尺寸(720×520,来自元素属性)为上限,窄于该宽度时等比缩小,绝不放大 */
.panel__svg {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
