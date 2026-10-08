<script setup lang="ts">
// 跨层 Mesh · L2 聚焦图:设备与链路。
// 四台设备(传感器 / PLC / 摄像头 / 温控)各自经一条链路落到同一条链路层段上,
// 段上有数据帧穿过 —— 像接在同一台交换机上;虚线框是该链路层段的边界。
// 几何全部手写固定坐标(确定性);主机名是技术信息,不随语言变化。
import { useI18n } from '../i18n'
import { toPercent } from './figure-geometry'

const { t } = useI18n()

// 四台设备:方框 w=120 h=56,等距排开,全部落在段边界(48..700)内。
// 主机名分上下两行错位(rowA 贴方框 / rowB 高一档):最窄宽度(375px)下
// 等宽标签比方框间距宽,同一行放不下四个,错位后互不相碰
const devices = [
  { x: 72, name: 'sensor-01', labelY: 128 },
  { x: 238, name: 'plc-line-a', labelY: 88 },
  { x: 404, name: 'cam-gate-03', labelY: 128 },
  { x: 570, name: 'hvac-01', labelY: 88 },
] as const

const BOX_Y = 130
const BOX_W = 120
const BOX_H = 56
// 共享链路层段:一条横贯的发丝线,各设备垂直落入
const SEGMENT_Y = 300
</script>

<template>
  <div class="panel">
    <svg
      class="panel__svg"
      viewBox="0 0 720 520"
      width="720"
      height="520"
      role="img"
      :aria-label="t.mesh.layers.l2.diagramLabel"
    >
      <!-- 链路层段边界(发丝虚线框):顶边抬到 y=44,把错位到高一档的主机名也圈进段内 -->
      <rect class="fig-box--dashed" x="48" y="44" width="652" height="344" vector-effect="non-scaling-stroke" />
      <!-- 设备落入段内的链路 -->
      <line
        v-for="device in devices"
        :key="`drop-${device.name}`"
        class="fig-edge"
        :x1="device.x + BOX_W / 2"
        :y1="BOX_Y + BOX_H"
        :x2="device.x + BOX_W / 2"
        :y2="SEGMENT_Y"
        vector-effect="non-scaling-stroke"
      />
      <!-- 共享链路层段 + 右端行进方向记号 -->
      <line class="fig-edge" x1="60" :y1="SEGMENT_Y" x2="672" :y2="SEGMENT_Y" vector-effect="non-scaling-stroke" />
      <path
        class="fig-arrowhead"
        :d="`M672 ${SEGMENT_Y}L664 ${SEGMENT_Y - 6}M672 ${SEGMENT_Y}L664 ${SEGMENT_Y + 6}`"
        vector-effect="non-scaling-stroke"
      />
      <!-- 段上穿过的数据帧 -->
      <rect class="fig-box" x="310" y="291" width="30" height="18" vector-effect="non-scaling-stroke" />
      <!-- 设备方框 -->
      <rect
        v-for="device in devices"
        :key="device.name"
        class="fig-box"
        :x="device.x"
        :y="BOX_Y"
        :width="BOX_W"
        :height="BOX_H"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <!-- 覆盖层标签:图义由 svg aria-label 承担,对辅助技术隐藏。
         主机名两行错位(底对齐 y=128 / y=88):任何缩放下都留在段边界内、互不相碰 -->
    <span
      v-for="device in devices"
      :key="`label-${device.name}`"
      class="fig-label fig-label--above"
      :style="toPercent(device.x + BOX_W / 2, device.labelY)"
      aria-hidden="true"
    >
      {{ device.name }}
    </span>
    <!-- 数据帧与段名标注:段下线下的空白带,两者横向错开 -->
    <span class="fig-label fig-label--below" :style="toPercent(317, 326)" aria-hidden="true">frame</span>
    <span class="fig-label fig-label--below fig-note" :style="toPercent(540, 318)" aria-hidden="true">
      {{ t.mesh.layers.l2.labels.segment }}
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
