<script setup lang="ts">
// 跨层 Mesh · L7 聚焦图:应用与服务流量视图(不是物理拓扑)。
// 四行流量:HTTP 代理 / SOCKS 代理 / 端口映射 / 反向端口映射,
// 每行从左侧入口(客户端或监听端口)指向右侧服务;行中标注该行的功能名。
// 几何全部手写固定坐标(确定性);主机名与端口是技术信息,不随语言变化。
import { useI18n } from '../i18n'
import { toPercent } from './figure-geometry'

const { t } = useI18n()

const NODE_R = 5

// 左侧入口:客户端名走 i18n,监听端口 / 服务记号是技术信息(不随语言变化)
type LeftEntry =
  | { kind: 'i18n'; key: 'browser' | 'dbClient' }
  | { kind: 'tech'; text: string }

interface L7Row {
  key: 'httpProxy' | 'socksProxy' | 'portMap' | 'reverseMap'
  y: number
  left: LeftEntry
  // 右侧服务名(技术信息);反向映射行没有服务名,只有暴露出的端口
  rightName?: string
  rightPort: string
  // 右侧标注的水平微调(等宽字宽最宽(0.6em)时让长主机名留在图版内)
  dx: number
}

// 四行流量:左端入口 → 右端服务
const rows: readonly L7Row[] = [
  { key: 'httpProxy', y: 92, left: { kind: 'i18n', key: 'browser' }, rightName: 'nas.home', rightPort: ':8080', dx: 0 },
  { key: 'socksProxy', y: 218, left: { kind: 'i18n', key: 'dbClient' }, rightName: 'db.internal', rightPort: ':5432', dx: -12 },
  { key: 'portMap', y: 344, left: { kind: 'tech', text: ':8443' }, rightName: 'build.internal', rightPort: ':443', dx: -44 },
  { key: 'reverseMap', y: 470, left: { kind: 'tech', text: 'ci:5000' }, rightPort: ':9000', dx: 0 },
]

function leftText(row: L7Row): string {
  return row.left.kind === 'i18n' ? t.value.mesh.layers.l7.labels[row.left.key] : row.left.text
}

const LEFT_X = 96
const RIGHT_X = 624
</script>

<template>
  <div class="panel">
    <svg
      class="panel__svg"
      viewBox="0 0 720 520"
      width="720"
      height="520"
      role="img"
      :aria-label="t.mesh.layers.l7.diagramLabel"
    >
      <g v-for="row in rows" :key="row.key">
        <!-- 流量线 + 右向箭头 -->
        <line
          class="fig-edge"
          :x1="LEFT_X"
          :y1="row.y"
          :x2="RIGHT_X - 8"
          :y2="row.y"
          vector-effect="non-scaling-stroke"
        />
        <path
          class="fig-arrowhead"
          :d="`M${RIGHT_X} ${row.y}L${RIGHT_X - 8} ${row.y - 6}M${RIGHT_X} ${row.y}L${RIGHT_X - 8} ${row.y + 6}`"
          vector-effect="non-scaling-stroke"
        />
        <!-- 两端节点 -->
        <circle class="fig-node" :cx="LEFT_X" :cy="row.y" :r="NODE_R" vector-effect="non-scaling-stroke" />
        <circle class="fig-node" :cx="RIGHT_X" :cy="row.y" :r="NODE_R" vector-effect="non-scaling-stroke" />
      </g>
    </svg>

    <!-- 覆盖层标签:图义由 svg aria-label 承担,对辅助技术隐藏。
         左侧入口名锚在左节点上方;右侧服务名与端口拆两行锚在右节点上方
         (两行等宽小字,任何缩放下都留在图版内、不与上一行标注相碰);
         行中功能名锚在流量线上方的中央通道 -->
    <template v-for="row in rows" :key="`labels-${row.key}`">
      <span class="fig-label fig-label--above" :style="toPercent(LEFT_X, row.y - 16)" aria-hidden="true">
        {{ leftText(row) }}
      </span>
      <span
        v-if="row.rightName !== undefined"
        class="fig-label fig-label--above"
        :style="toPercent(RIGHT_X + row.dx, row.y - 55)"
        aria-hidden="true"
      >
        {{ row.rightName }}
      </span>
      <span
        class="fig-label fig-label--above"
        :style="toPercent(RIGHT_X + row.dx, row.y - 16)"
        aria-hidden="true"
      >
        {{ row.rightPort }}
      </span>
      <span class="fig-label fig-label--above fig-note" :style="toPercent(340, row.y - 16)" aria-hidden="true">
        {{ t.mesh.layers.l7.labels[row.key] }}
      </span>
    </template>
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
