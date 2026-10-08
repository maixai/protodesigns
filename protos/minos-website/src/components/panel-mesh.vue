<script setup lang="ts">
// 标签页第 01 屏:点对点网状互联。
// 9 个 peer 节点自然散布(不是围绕中心的环形),同一半径、同一套描边、无填充强调
// —— 没有任何节点享有视觉特权。连线 many-to-many 且度数大致均衡(每节点 2-3 条实线);
// B—E 是一条失效链路(极淡 + 叉号),B—I—E 是绕行备用路径(虚线);
// 三组并行直连流(不同节点对、方向不一)用 SMIL 流动点表达,reduced-motion 下不渲染
// (SMIL 不吃 CSS 降级,故在组件层判断后移除)。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from '../i18n'
import { toPercent } from './figure-geometry'

const { t } = useI18n()

interface MeshNode {
  x: number
  y: number
}

const NODE_R = 6

const nodes: readonly MeshNode[] = [
  { x: 120, y: 120 }, // A
  { x: 300, y: 80 }, // B
  { x: 520, y: 110 }, // C
  { x: 650, y: 240 }, // D
  { x: 560, y: 400 }, // E
  { x: 330, y: 450 }, // F
  { x: 120, y: 400 }, // G
  { x: 60, y: 250 }, // H
  { x: 450, y: 280 }, // I(内部节点,但度数与其他节点一致,不是枢纽)
]

interface MeshEdge {
  x1: number
  y1: number
  x2: number
  y2: number
  kind: 'solid' | 'dashed' | 'failed'
}

const edges: readonly MeshEdge[] = [
  // 外圈与跨边直连(实线,度数均衡)
  { x1: 120, y1: 120, x2: 300, y2: 80, kind: 'solid' },
  { x1: 300, y1: 80, x2: 520, y2: 110, kind: 'solid' },
  { x1: 520, y1: 110, x2: 650, y2: 240, kind: 'solid' },
  { x1: 650, y1: 240, x2: 560, y2: 400, kind: 'solid' },
  { x1: 560, y1: 400, x2: 330, y2: 450, kind: 'solid' },
  { x1: 330, y1: 450, x2: 120, y2: 400, kind: 'solid' },
  { x1: 120, y1: 400, x2: 60, y2: 250, kind: 'solid' },
  { x1: 60, y1: 250, x2: 120, y2: 120, kind: 'solid' },
  { x1: 120, y1: 120, x2: 450, y2: 280, kind: 'solid' },
  { x1: 520, y1: 110, x2: 330, y2: 450, kind: 'solid' },
  { x1: 650, y1: 240, x2: 450, y2: 280, kind: 'solid' },
  // 失效链路(极淡)+ 绕行备用路径(虚线,经 I 中转)
  { x1: 300, y1: 80, x2: 560, y2: 400, kind: 'failed' },
  { x1: 300, y1: 80, x2: 450, y2: 280, kind: 'dashed' },
  { x1: 450, y1: 280, x2: 560, y2: 400, kind: 'dashed' },
]

// 三组并行直连流:C→F、G→H、D→I(不同节点对,方向不一)
const flows = [
  { path: 'M520 110L330 450', dur: '6s', begin: '0s' },
  { path: 'M120 400L60 250', dur: '5s', begin: '-2s' },
  { path: 'M650 240L450 280', dur: '7s', begin: '-4s' },
] as const

// 主机名标签:技术信息,不随语言变化;落位方向按周边连线避让。
// 横向锚点按最窄宽度(375px,图版约 0.382 倍)与最宽等宽字宽(0.6em)预留跨度:
// 标签字号恒定,缩得越小相对图版越宽,两端不得越出图版。
// edge-fra-02 放在节点上方而非右侧:右侧锚点在 0.6em 字宽下会越出图版右缘。
const LABEL_GAP = 6
const labels = [
  { x: 120, y: 120 - NODE_R - LABEL_GAP, text: 'edge-sfo-01', place: 'above' },
  { x: 520, y: 110 - NODE_R - LABEL_GAP, text: 'edge-fra-02', place: 'above' },
  { x: 560, y: 400 + NODE_R + LABEL_GAP, text: 'nas-home', place: 'below' },
  { x: 150, y: 400 + NODE_R + LABEL_GAP, text: 'build-runner-03', place: 'below' },
] as const

// SMIL 不受 CSS prefers-reduced-motion 降级规则约束,故在组件层读媒体查询,
// 降级时直接不渲染流动点(拓扑本体仍然完整)。
const reduceMotion = ref(false)
let motionQuery: MediaQueryList | undefined

function onMotionChange(event: MediaQueryListEvent): void {
  reduceMotion.value = event.matches
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduceMotion.value = motionQuery.matches
  motionQuery.addEventListener('change', onMotionChange)
})

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', onMotionChange)
})
</script>

<template>
  <div class="panel">
    <svg
      class="panel__svg"
      viewBox="0 0 720 520"
      width="720"
      height="520"
      role="img"
      :aria-label="t.hero.tabs.panels.mesh.diagramLabel"
    >
      <line
        v-for="edge in edges"
        :key="`${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}`"
        class="fig-edge"
        :class="{
          'fig-edge--dashed': edge.kind === 'dashed',
          'fig-edge--failed': edge.kind === 'failed',
        }"
        :x1="edge.x1"
        :y1="edge.y1"
        :x2="edge.x2"
        :y2="edge.y2"
        vector-effect="non-scaling-stroke"
      />
      <!-- 失效链路的叉号:位于 B—E 中点 -->
      <path class="fig-cross" d="M424 234L436 246M424 246L436 234" vector-effect="non-scaling-stroke" />
      <!-- 流动点:仅非降级动效时渲染 -->
      <template v-if="!reduceMotion">
        <circle v-for="flow in flows" :key="flow.path" class="fig-flow" r="2.5">
          <animateMotion :dur="flow.dur" :begin="flow.begin" repeatCount="indefinite" :path="flow.path" />
        </circle>
      </template>
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
    <!-- 主机名标签:HTML 覆盖层;拓扑语义已由 svg 的 aria-label 承担,对辅助技术隐藏 -->
    <span
      v-for="label in labels"
      :key="label.text"
      class="fig-label"
      :class="`fig-label--${label.place}`"
      :style="toPercent(label.x, label.y)"
      aria-hidden="true"
    >
      {{ label.text }}
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
