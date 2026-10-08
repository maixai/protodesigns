<script setup lang="ts">
// 标签页第 03 屏:端到端加密链路。
// 两台 peer 各自持有密钥(等宽 pub 记号),旁侧用循环箭头表达定期轮换;
// 链路上只呈现密文形态(等宽串),不出现任何明文与具体协议名。
// 几何全部手写固定坐标;文字标签用 HTML 覆盖层。
import { useI18n } from '../i18n'
import { toPercent } from './figure-geometry'

const { t } = useI18n()

// 两台 peer 的方框与密钥轮换弧线(弧线在每个方框的右上内角)
const peers = [
  { x: 80, y: 200, w: 180, h: 120, hostname: 'mbp-zhao', pub: 'pub k1x9…7q2f', arc: 'M247 218A9 9 0 1 1 238 227', arrow: 'M238 227L243.2 224M238 227L243.2 230' },
  { x: 460, y: 200, w: 180, h: 120, hostname: 'nas-home', pub: 'pub 9wb2…2e8a', arc: 'M627 218A9 9 0 1 1 618 227', arrow: 'M618 227L623.2 224M618 227L623.2 230' },
] as const
</script>

<template>
  <div class="panel">
    <svg
      class="panel__svg"
      viewBox="0 0 720 520"
      width="720"
      height="520"
      role="img"
      :aria-label="t.hero.tabs.panels.encryption.diagramLabel"
    >
      <!-- 链路:实线,上面只走密文 -->
      <line class="fig-edge" x1="260" y1="260" x2="460" y2="260" vector-effect="non-scaling-stroke" />
      <!-- peer 方框 -->
      <rect
        v-for="peer in peers"
        :key="peer.hostname"
        class="fig-box"
        :x="peer.x"
        :y="peer.y"
        :width="peer.w"
        :height="peer.h"
        vector-effect="non-scaling-stroke"
      />
      <!-- 密钥轮换:循环箭头 -->
      <path
        v-for="peer in peers"
        :key="`arc-${peer.hostname}`"
        class="fig-arrowhead"
        :d="peer.arc"
        vector-effect="non-scaling-stroke"
      />
      <path
        v-for="peer in peers"
        :key="`arrow-${peer.hostname}`"
        class="fig-arrowhead"
        :d="peer.arrow"
        vector-effect="non-scaling-stroke"
      />
      <!-- 「链路上只走密文」的引出线:起笔低于密文串在最窄宽度下的下缘,
           止于标注之上,任何缩放下都不穿过文字 -->
      <line class="fig-leader" x1="360" y1="324" x2="360" y2="370" vector-effect="non-scaling-stroke" />
      <!-- 「定期轮换」的引出线(指向左侧轮换箭头) -->
      <line class="fig-leader" x1="238" y1="166" x2="238" y2="206" vector-effect="non-scaling-stroke" />
    </svg>

    <!-- 覆盖层标签:图义由 svg aria-label 承担,对辅助技术隐藏 -->
    <template v-for="peer in peers" :key="`labels-${peer.hostname}`">
      <span
        class="fig-label fig-label--center"
        :style="toPercent(peer.x + peer.w / 2, peer.y + 40)"
        aria-hidden="true"
      >
        {{ peer.hostname }}
      </span>
      <!-- 密钥记号放在方框下方:窄屏 SVG 缩小而标签字号恒定时,框内会挤不下 -->
      <span
        class="fig-label fig-label--below"
        :style="toPercent(peer.x + peer.w / 2, peer.y + peer.h + 10)"
        aria-hidden="true"
      >
        {{ peer.pub }}
      </span>
    </template>
    <!-- 链路上的密文形态(等宽串,一上一下;横向位置避开方框边缘) -->
    <span class="fig-label fig-label--above" :style="toPercent(345, 244)" aria-hidden="true">a3f1…9c</span>
    <span class="fig-label fig-label--below" :style="toPercent(390, 276)" aria-hidden="true">e80d…41</span>
    <!-- 标注 -->
    <span class="fig-label fig-label--below fig-note" :style="toPercent(360, 378)" aria-hidden="true">
      {{ t.hero.tabs.panels.encryption.labels.cipherNote }}
    </span>
    <!-- 轮换标注锚在引出线上端(--above 底对齐):标注再高也不压引出线 -->
    <span class="fig-label fig-label--above fig-note" :style="toPercent(238, 160)" aria-hidden="true">
      {{ t.hero.tabs.panels.encryption.labels.rotateNote }}
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
