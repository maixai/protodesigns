<script setup lang="ts">
// 标签页第 04 屏:跨环境统一组网。
// 四个环境各用发丝虚线边界框圈出(云 VPC / 自建机房 / 家庭网络 / 移动设备),
// 环境内各 1-2 个节点;所有连线穿过边界框 —— 环境不同,但网络是同一张平面网络。
// 中央通道用引出线标注「同一张网络」。几何全部手写固定坐标;环境名经 i18n。
import { useI18n } from '../i18n'
import { toPercent } from './figure-geometry'

const { t } = useI18n()

// 四个环境的虚线边界框(2×2 排布,中央留出通道放标注)
const environments = [
  { x: 48, y: 56, w: 272, h: 176, nameKey: 'vpc' },
  { x: 400, y: 56, w: 272, h: 176, nameKey: 'dc' },
  { x: 48, y: 288, w: 272, h: 176, nameKey: 'home' },
  { x: 400, y: 288, w: 272, h: 176, nameKey: 'mobile' },
] as const

interface EnvNode {
  x: number
  y: number
}

const NODE_R = 6

const nodes: readonly EnvNode[] = [
  { x: 120, y: 140 }, // v1 云 VPC
  { x: 240, y: 168 }, // v2 云 VPC
  { x: 520, y: 148 }, // r1 自建机房
  { x: 600, y: 180 }, // r2 自建机房
  { x: 160, y: 376 }, // h1 家庭网络
  { x: 540, y: 364 }, // m1 移动设备
]

// 连线大量穿过边界框:同一张平面网络,无中心、无网关节点
const edges = [
  { x1: 120, y1: 140, x2: 240, y2: 168 }, // v1—v2(环境内)
  { x1: 120, y1: 140, x2: 520, y2: 148 }, // v1—r1(跨边界)
  { x1: 240, y1: 168, x2: 160, y2: 376 }, // v2—h1(跨边界)
  { x1: 120, y1: 140, x2: 160, y2: 376 }, // v1—h1(跨边界)
  { x1: 520, y1: 148, x2: 600, y2: 180 }, // r1—r2(环境内)
  { x1: 520, y1: 148, x2: 540, y2: 364 }, // r1—m1(跨边界)
  { x1: 600, y1: 180, x2: 540, y2: 364 }, // r2—m1(跨边界)
  { x1: 160, y1: 376, x2: 540, y2: 364 }, // h1—m1(跨边界)
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
      :aria-label="t.hero.tabs.panels.environments.diagramLabel"
    >
      <!-- 环境边界(发丝虚线框) -->
      <rect
        v-for="env in environments"
        :key="env.nameKey"
        class="fig-box--dashed"
        :x="env.x"
        :y="env.y"
        :width="env.w"
        :height="env.h"
        vector-effect="non-scaling-stroke"
      />
      <!-- 跨边界直连 -->
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
      <!-- 「同一张网络」引出线:指向 v1—r1 这条横跨两个环境的连线 -->
      <line class="fig-leader" x1="360" y1="152" x2="360" y2="236" vector-effect="non-scaling-stroke" />
      <!-- 「无需公网 IP · 无需开端口」引出线:走两列边界框之间的纵向通道,
           窄屏下也不会与边界框或连线相碰;止于标注上方 4 单位处,不穿字 -->
      <line class="fig-leader" x1="360" y1="462" x2="360" y2="470" vector-effect="non-scaling-stroke" />
    </svg>

    <!-- 环境名:等宽标注在各边界框左上角 -->
    <span
      v-for="env in environments"
      :key="`label-${env.nameKey}`"
      class="fig-label fig-label--topleft fig-note"
      :style="toPercent(env.x + LABEL_INSET, env.y + LABEL_INSET)"
      aria-hidden="true"
    >
      {{ t.hero.tabs.panels.environments.labels[env.nameKey] }}
    </span>
    <!-- 中央通道标注;底部标注锚在图版下缘空白带(y=474),
         最窄宽度下行盒底(474+39.3)距图版底仍有约 6.7 单位净空 -->
    <span class="fig-label fig-label--below fig-note" :style="toPercent(360, 244)" aria-hidden="true">
      {{ t.hero.tabs.panels.environments.labels.sameNet }}
    </span>
    <span class="fig-label fig-label--below fig-note" :style="toPercent(360, 474)" aria-hidden="true">
      {{ t.hero.tabs.panels.environments.labels.noPublicIp }}
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
