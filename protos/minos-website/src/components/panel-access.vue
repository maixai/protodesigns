<script setup lang="ts">
// 标签页第 02 屏:零信任访问控制。
// 三段式:请求方(设备 + 身份)→ 策略判定 → 资源;每个资源各套一个发丝虚线的微边界。
// 一条实线放行到已授权资源(nas.home),一条虚线 + 叉号拒绝到未授权资源(printer.home);
// db.internal 不在本次请求路径上,安静地待在自己的边界里。
// 几何全部手写固定坐标(确定性);文字标签用 HTML 覆盖层。
import { useI18n } from '../i18n'
import { toPercent } from './figure-geometry'

const { t } = useI18n()

// 方框:x / y / 宽 / 高(viewBox 720×520 坐标系)
// 请求方框高 136:内容三行等宽标签按 44 单位行距排(见下方注释),
// 框中心仍对齐 y=260,与策略判定框及连线保持同轴;
// 左缘 x=40 与右侧资源列的右缘(680)相对图版等距
const boxes = {
  requester: { x: 40, y: 192, w: 200, h: 136 },
  policy: { x: 300, y: 212, w: 120, h: 96 },
} as const

// 三个资源:实线框 + 各自的虚线微边界(比资源框大一圈)。
// labelDx:等宽标签在最宽字宽(0.6em)下会宽于方框,居中会越出图版右缘,
// 向左微调使任何等宽字宽下标签都留在图版内
const resources = [
  { x: 540, y: 76, w: 140, h: 72, name: 'db.internal', labelDx: 0 },
  { x: 540, y: 224, w: 140, h: 72, name: 'nas.home', labelDx: 0 },
  { x: 540, y: 372, w: 140, h: 72, name: 'printer.home', labelDx: -8 },
] as const

const boundaries = [
  { x: 528, y: 64, w: 164, h: 96 },
  { x: 528, y: 212, w: 164, h: 96 },
  { x: 528, y: 360, w: 164, h: 96 },
] as const

// HTML 覆盖层标签。身份与主机名是技术信息,不随语言变化。
// 内缩取 8 单位:等宽字宽最宽(0.6em)时 zhao@minos 一行约 72px,
// 375px 下须同时留在请求方框内、且不与策略判定标注相碰
const LABEL_INSET = 8
</script>

<template>
  <div class="panel">
    <svg
      class="panel__svg"
      viewBox="0 0 720 520"
      width="720"
      height="520"
      role="img"
      :aria-label="t.hero.tabs.panels.access.diagramLabel"
    >
      <!-- 微边界(虚线,每个资源各一个) -->
      <rect
        v-for="boundary in boundaries"
        :key="`b-${boundary.y}`"
        class="fig-box--dashed"
        :x="boundary.x"
        :y="boundary.y"
        :width="boundary.w"
        :height="boundary.h"
        vector-effect="non-scaling-stroke"
      />
      <!-- 请求方 / 策略判定 / 资源方框 -->
      <rect
        class="fig-box"
        :x="boxes.requester.x"
        :y="boxes.requester.y"
        :width="boxes.requester.w"
        :height="boxes.requester.h"
        vector-effect="non-scaling-stroke"
      />
      <rect
        class="fig-box"
        :x="boxes.policy.x"
        :y="boxes.policy.y"
        :width="boxes.policy.w"
        :height="boxes.policy.h"
        vector-effect="non-scaling-stroke"
      />
      <rect
        v-for="resource in resources"
        :key="resource.name"
        class="fig-box"
        :x="resource.x"
        :y="resource.y"
        :width="resource.w"
        :height="resource.h"
        vector-effect="non-scaling-stroke"
      />
      <!-- 请求方 → 策略判定(实线 + 箭头) -->
      <line class="fig-edge" x1="240" y1="260" x2="300" y2="260" vector-effect="non-scaling-stroke" />
      <path class="fig-arrowhead" d="M300 260L292 254M300 260L292 266" vector-effect="non-scaling-stroke" />
      <!-- 放行:策略判定 → nas.home(实线 + 箭头) -->
      <line class="fig-edge" x1="420" y1="260" x2="520" y2="260" vector-effect="non-scaling-stroke" />
      <path class="fig-arrowhead" d="M520 260L512 254M520 260L512 266" vector-effect="non-scaling-stroke" />
      <!-- 拒绝:策略判定 → printer.home(虚线,叉号止于边界之外) -->
      <line
        class="fig-edge fig-edge--dashed"
        x1="420"
        y1="296"
        x2="512"
        y2="384"
        vector-effect="non-scaling-stroke"
      />
      <path class="fig-cross" d="M518 390L530 402M518 402L530 390" vector-effect="non-scaling-stroke" />
      <!-- 「放行」标注的引出线:从上缘空白带竖直落到放行连线,
           途经 x=480 一线在任何缩放下都不与方框、边界或其它文字相碰 -->
      <line class="fig-leader" x1="480" y1="62" x2="480" y2="252" vector-effect="non-scaling-stroke" />
      <!-- 「拒绝」标注的引出线:从叉号下方竖直落到下缘空白带。
           取 x=484 而非与标注同轴的 488:最宽等宽字宽(0.6em)下 printer.home
           标签左缘会逼近这条线,内收 4 单位保证两种字宽状态下都有 ≥1px 净空 -->
      <line class="fig-leader" x1="484" y1="410" x2="484" y2="466" vector-effect="non-scaling-stroke" />
    </svg>

    <!-- 覆盖层标签:图义由 svg aria-label 承担,对辅助技术隐藏。
         请求方三行文字:行距取 44 viewBox 单位 —— 最窄宽度(375px,缩放≈0.382)下
         折算约 16.8px,大于 15px 的恒定行盒(12px × 1.25),行间始终留有可见净空,
         任何缩放下行盒互不相交、也不越出方框(44×2 + 39.3 ≈ 127 < 内高 136-6) -->
    <span
      class="fig-label fig-label--topleft fig-note"
      :style="toPercent(boxes.requester.x + LABEL_INSET, boxes.requester.y + 6)"
      aria-hidden="true"
    >
      {{ t.hero.tabs.panels.access.labels.requester }}
    </span>
    <span
      class="fig-label fig-label--topleft"
      :style="toPercent(boxes.requester.x + LABEL_INSET, boxes.requester.y + 50)"
      aria-hidden="true"
    >
      zhao@minos
    </span>
    <span
      class="fig-label fig-label--topleft"
      :style="toPercent(boxes.requester.x + LABEL_INSET, boxes.requester.y + 94)"
      aria-hidden="true"
    >
      mbp-zhao
    </span>
    <span
      class="fig-label fig-label--center fig-note"
      :style="toPercent(boxes.policy.x + boxes.policy.w / 2, boxes.policy.y + boxes.policy.h / 2)"
      aria-hidden="true"
    >
      {{ t.hero.tabs.panels.access.labels.policy }}
    </span>
    <span
      v-for="resource in resources"
      :key="`label-${resource.name}`"
      class="fig-label fig-label--center"
      :style="toPercent(resource.x + resource.w / 2 + resource.labelDx, resource.y + resource.h / 2)"
      aria-hidden="true"
    >
      {{ resource.name }}
    </span>
    <!-- 放行 / 拒绝标注:置于图版上缘与下缘的空白带。图版缩小时标注字号恒定,
         只有这两条横贯全宽的空白带在任何宽度下都放得下整行文字 -->
    <span class="fig-label fig-label--above fig-note" :style="toPercent(480, 56)" aria-hidden="true">
      {{ t.hero.tabs.panels.access.labels.allowNote }}
    </span>
    <span class="fig-label fig-label--below fig-note" :style="toPercent(484, 472)" aria-hidden="true">
      {{ t.hero.tabs.panels.access.labels.denyNote }}
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
