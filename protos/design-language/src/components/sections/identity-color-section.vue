<script setup lang="ts">
// 标识色 identity:多项目并行时标记"这段内容属于哪个项目"的一组色相。
//
// 为什么单开一组:中性阶没有色相、强调色只承担"可操作"、状态色表达"结果",
// 三者都不能拿来当归属标记。侧栏同时展开多个项目时,右侧 tab 与悬浮窗里会同时
// 出现不同项目的对话与文件,需要一眼看出归属 —— 于是有了这一组。
//
// 定位(与强调色的分工,采购自 .claude/rules/design-language.md ④「标识色」):
//   强调色(青瓷)仍是**全站唯一的高饱和色相**,只用于行动点与选中态;
//   标识色统一压到强调色彩度的约 3/4,且只出现在容器边缘的细图形上(色条 / 色点 / 描边)。
//
// 8 个色相在环上均布(相邻 ≥36°),整体避开强调色色相 ±25°;彩度取齐(Lab C* 相近),
// 明度成阶梯(浅色 34→55、深色 45→71)—— 去色后仍是一组分得开的灰阶。
//
// 本组件只引用 var(--dl-identity):选第几号色由绑定类 .dl-identity-N 承担,
// 组件里不出现任何 ramp 阶。
import { onMounted, reactive, ref } from 'vue'

defineProps<{ directionId: string }>()

const STEPS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

// 8 个色相的中文定位名 —— 只为样张可读,编号本身不承载语义(色号由使用方分配)。
const HUE_LABELS = ['蓝', '靛', '紫', '藕', '绛', '陶', '橄榄', '苔'] as const

// 使用规则:可机械核对的正向约定。
const RULES = [
  '只作图形:色条(贴左缘、通高)、色点、描边。不做文字填充,也不填充整块区域。',
  '对比度按图形阈值断言(≥3:1,WCAG 1.4.11),不是文字的 4.5:1。',
  '与状态色同现时靠"彩度 + 出现形式"拉开:标识色在容器边缘的细图形上,状态色在内容里且必带图标或文字。',
  '色号不承载含义,由使用方把项目映射到色号;刷新即重置。',
] as const

// 禁用值:与展示页既有 do / don't 同一套排布。
interface AntiPair {
  readonly title: string
  readonly doText: string
  readonly dontText: string
  readonly antiClass: string
}

const ANTI_PAIRS: readonly AntiPair[] = [
  {
    title: '出现形式',
    doText: '标识色只作容器边缘的细图形:色条、色点、描边',
    dontText: '拿标识色填充整块 tab / 整行 —— 它会跟强调色争夺"可操作"的语义',
    antiClass: 'dl-anti-identity-fill',
  },
  {
    title: '不作文字色',
    doText: '文字一律用 --dl-text-primary / -secondary,标识色只做旁边的记号',
    dontText: '把标识色当文字色 —— 低彩度色相当正文,可读性与语义双失',
    antiClass: 'dl-anti-identity-text',
  },
]

// 实物样张的数据:写实的项目名与缩写。
interface Project {
  readonly key: string
  readonly abbr: string
  readonly name: string
  readonly meta: string
}

const TABS: readonly Project[] = [
  { key: '1', abbr: 'WR', name: 'weekly-report', meta: '周报' },
  { key: '3', abbr: 'PD', name: 'product-docs', meta: '产品文档' },
  { key: '5', abbr: 'AG', name: 'api-gateway', meta: '接口网关' },
  { key: '7', abbr: 'DT', name: 'design-tokens', meta: '设计令牌' },
]

const SIDEBAR: readonly Project[] = [
  { key: '2', abbr: 'BS', name: 'billing-service', meta: '3 个会话' },
  { key: '3', abbr: 'PD', name: 'product-docs', meta: '2 个会话' },
  { key: '6', abbr: 'OF', name: 'onboarding-flow', meta: '1 个会话' },
  { key: '8', abbr: 'DQ', name: 'data-quality', meta: '4 个会话' },
]

const FLOATY = { key: '6', name: 'design-tokens', meta: '2 个文件' } as const

// 明度阶梯的读数:不写字面值,直接从渲染结果反算 L*,取值一改读数就跟着变。
const lightPane = ref<HTMLElement | null>(null)
const darkPane = ref<HTMLElement | null>(null)
const spreads = reactive({ light: '', dark: '' })

// sRGB 相对亮度(WCAG 定义)。
function relativeLuminance(rgb: readonly [number, number, number]): number {
  const channel = (raw: number): number => {
    const scaled = raw / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
}

// 解析 getComputedStyle 返回的 rgb()/rgba() 字面量。
function parseRgb(value: string): readonly [number, number, number] | null {
  const match = /rgba?\(([^)]+)\)/.exec(value)
  const body = match?.[1]
  if (body === undefined) return null
  const parts = body.split(',').map((part) => Number.parseFloat(part))
  const [r, g, b] = parts
  if (r === undefined || g === undefined || b === undefined) return null
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null
  return [r, g, b]
}

// CIE L*:0 = 黑,100 = 白。
function toLStar(rgb: readonly [number, number, number]): number {
  const y = relativeLuminance(rgb)
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y
}

// 读一格色板里的 8 个 L*,返回"最小 → 最大(跨度)"。
function readSpread(pane: HTMLElement | null): string {
  if (pane === null) return ''
  const fills = Array.from(pane.querySelectorAll('.ramp__fill'))
  if (fills.length === 0) return ''
  const values = fills.map((fill) => {
    const rgb = parseRgb(getComputedStyle(fill).backgroundColor)
    return rgb === null ? 0 : toLStar(rgb)
  })
  const min = Math.min(...values)
  const max = Math.max(...values)
  return `${min.toFixed(0)} → ${max.toFixed(0)}(跨度 ${(max - min).toFixed(0)})`
}

onMounted(() => {
  spreads.light = readSpread(lightPane.value)
  spreads.dark = readSpread(darkPane.value)
})
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">标识色 identity</h2>
    <p class="dl-section__note">
      多项目并行时用来标记归属的一组色相。只作图形(色条 / 色点 / 描边),不作文字填充;
      强调色仍是全站唯一的高饱和色相,标识色整体更闷,退到它之后。
    </p>

    <!-- 色板:深浅并排。两侧用 data-dl-theme 局部锁死主题,与全局切换无关。 -->
    <div class="boards">
      <div
        ref="lightPane"
        class="board dl-scope"
        :data-dl-dir="directionId"
        data-dl-theme="light"
      >
        <span class="board__tag">浅色</span>
        <div class="ramp">
          <span
            v-for="(step, index) in STEPS"
            :key="`light-${step}`"
            class="ramp__chip"
            :class="`dl-identity-${step}`"
          >
            <span class="ramp__fill" aria-hidden="true"></span>
            <code class="ramp__name">{{ HUE_LABELS[index] }} · {{ step }}</code>
          </span>
        </div>
        <div class="ramp ramp--gray">
          <span
            v-for="step in STEPS"
            :key="`light-gray-${step}`"
            class="ramp__chip"
            :class="`dl-identity-${step}`"
          >
            <span class="ramp__fill" aria-hidden="true"></span>
          </span>
        </div>
        <p class="board__reading">去色后 L* {{ spreads.light }}</p>
      </div>

      <div
        ref="darkPane"
        class="board dl-scope"
        :data-dl-dir="directionId"
        data-dl-theme="dark"
      >
        <span class="board__tag">深色</span>
        <div class="ramp">
          <span
            v-for="(step, index) in STEPS"
            :key="`dark-${step}`"
            class="ramp__chip"
            :class="`dl-identity-${step}`"
          >
            <span class="ramp__fill" aria-hidden="true"></span>
            <code class="ramp__name">{{ HUE_LABELS[index] }} · {{ step }}</code>
          </span>
        </div>
        <div class="ramp ramp--gray">
          <span
            v-for="step in STEPS"
            :key="`dark-gray-${step}`"
            class="ramp__chip"
            :class="`dl-identity-${step}`"
          >
            <span class="ramp__fill" aria-hidden="true"></span>
          </span>
        </div>
        <p class="board__reading">去色后 L* {{ spreads.dark }}</p>
      </div>
    </div>

    <!-- 与强调色的并排:同一底色、同样大小,谁的彩度高一眼可判。 -->
    <div class="ident">
      <h3 class="ident__title">与强调色的关系</h3>
      <p class="ident__basis">
        依据:强调色是唯一承担"可操作"语义的色相,必须比任何一个标识色抢眼。
        判据是 Lab 彩度 C* —— 标识色统一压到强调色的约 3/4(HSL 饱和度不是判据:
        深蓝要拉到 41% 才够 C*=17,只看 HSL 会误判)。
      </p>
      <div class="boards">
        <div class="board dl-scope" :data-dl-dir="directionId" data-dl-theme="light">
          <span class="board__tag">浅色</span>
          <div class="vs">
            <span class="vs__item vs__item--accent">
              <span class="vs__fill vs__fill--accent" aria-hidden="true"></span>
              <code class="vs__label">accent</code>
            </span>
            <span
              v-for="(step, index) in STEPS"
              :key="`vs-light-${step}`"
              class="vs__item"
              :class="`dl-identity-${step}`"
            >
              <span class="vs__fill" aria-hidden="true"></span>
              <code class="vs__label">{{ HUE_LABELS[index] }}</code>
            </span>
          </div>
        </div>
        <div class="board dl-scope" :data-dl-dir="directionId" data-dl-theme="dark">
          <span class="board__tag">深色</span>
          <div class="vs">
            <span class="vs__item vs__item--accent">
              <span class="vs__fill vs__fill--accent" aria-hidden="true"></span>
              <code class="vs__label">accent</code>
            </span>
            <span
              v-for="(step, index) in STEPS"
              :key="`vs-dark-${step}`"
              class="vs__item"
              :class="`dl-identity-${step}`"
            >
              <span class="vs__fill" aria-hidden="true"></span>
              <code class="vs__label">{{ HUE_LABELS[index] }}</code>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 实物样张:标识色真正落地的地方。 -->
    <div class="ident">
      <h3 class="ident__title">实物样张</h3>
      <p class="ident__basis">
        三类真实出现形态:tab 条(色条 + 缩写 + 标题)、侧栏项目行(色点 + 名称)、
        悬浮窗标题栏(色 + 项目名)。三者都只在容器边缘放一个细记号。
      </p>

      <div class="samples">
        <div class="sample">
          <span class="sample__cap">tab 条 · 多项目并排</span>
          <div class="tabs">
            <span
              v-for="(project, index) in TABS"
              :key="project.name"
              class="tab"
              :class="[`dl-identity-${project.key}`, { 'tab--active': index === 0 }]"
            >
              <span class="tab__bar" aria-hidden="true"></span>
              <code class="tab__abbr">{{ project.abbr }}</code>
              <span class="tab__title">{{ project.name }}</span>
            </span>
          </div>
        </div>

        <div class="sample">
          <span class="sample__cap">侧栏项目行 · 色点 + 名称</span>
          <ul class="projlist">
            <li
              v-for="project in SIDEBAR"
              :key="project.name"
              class="proj"
              :class="`dl-identity-${project.key}`"
            >
              <span class="proj__dot" aria-hidden="true"></span>
              <span class="proj__name">{{ project.name }}</span>
              <span class="proj__meta">{{ project.meta }}</span>
            </li>
          </ul>
        </div>

        <div class="sample">
          <span class="sample__cap">悬浮窗标题栏 · 色 + 项目名</span>
          <div class="floaty" :class="`dl-identity-${FLOATY.key}`">
            <div class="floaty__bar">
              <span class="floaty__mark" aria-hidden="true"></span>
              <span class="floaty__name">{{ FLOATY.name }}</span>
              <span class="floaty__meta">{{ FLOATY.meta }}</span>
            </div>
            <p class="floaty__body">
              把 <code>theme.ts</code> 里的色阶抽成 token 后,组件里就再没有 hex 了。
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- 使用规则与禁用值。 -->
    <div class="ident">
      <h3 class="ident__title">使用规则</h3>
      <ul class="rules">
        <li v-for="rule in RULES" :key="rule" class="rules__item">{{ rule }}</li>
      </ul>

      <div class="dl-grid pairs">
        <article v-for="pair in ANTI_PAIRS" :key="pair.title" class="pair">
          <h4 class="pair__title">{{ pair.title }}</h4>
          <div class="pair__row">
            <div class="pair__cell">
              <span class="pair__tag pair__tag--do">Do</span>
              <span class="dl-demo-box">{{ pair.doText }}</span>
            </div>
            <div class="pair__cell">
              <span class="pair__tag pair__tag--dont">Don't</span>
              <span class="dl-demo-box" :class="pair.antiClass">{{ pair.dontText }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 色板与并排:两块主题面板并排。 */
.boards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--dl-space-3);
}

.board {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  padding: var(--dl-space-3);
  background: var(--dl-bg-base);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-lg);
}

.board__tag {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.board__reading {
  margin: 0;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* 色板:固定 4 列 —— 8 个色号排成两行,与 4 号一档的色相分布对得上。 */
.ramp {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--dl-space-2);
}

/* 去色预览:同一组色块抽掉色相,只剩明度阶梯。 */
.ramp--gray {
  filter: grayscale(1);
}

.ramp__chip {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  min-width: 0;
}

.ramp__fill {
  display: block;
  height: var(--dl-space-6);
  background: var(--dl-identity);
  border-radius: var(--dl-radius-sm);
}

.ramp__name {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* 与强调色并排:9 格等宽,强调色在最前。 */
.vs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--dl-space-2);
}

.vs__item {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  min-width: 0;
}

.vs__fill {
  display: block;
  height: var(--dl-space-6);
  background: var(--dl-identity);
  border-radius: var(--dl-radius-sm);
}

.vs__fill--accent {
  background: var(--dl-accent);
}

.vs__label {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* --- 实物样张 --- */
.ident {
  margin-top: var(--dl-space-4);
  padding-top: var(--dl-space-3);
  border-top: var(--dl-border-width) solid var(--dl-border-base);
}

.ident__title {
  margin: 0 0 var(--dl-space-1);
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.ident__basis {
  margin: 0 0 var(--dl-space-3);
  max-width: var(--dl-measure);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
}

.samples {
  display: grid;
  gap: var(--dl-space-3);
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
}

.sample {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  min-width: 0;
}

.sample__cap {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* tab 条 */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-1);
}

.tab {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-width: 0;
  padding: var(--dl-space-1) var(--dl-space-2) var(--dl-space-1) 0;
  overflow: hidden;
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.tab--active {
  border-color: var(--dl-border-strong);
}

/* 色条:贴左缘通高。圆角由容器裁切,与容器同心。 */
.tab__bar {
  flex: none;
  align-self: stretch;
  width: var(--dl-identity-bar-width);
  background: var(--dl-identity);
}

.tab__abbr {
  flex: none;
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-tertiary);
}

.tab__title {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

/* 侧栏项目行 */
.projlist {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.proj {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  /* 密集行:行距 28px(触达尺寸的密集行档,见 design-language.md ⑥) */
  min-height: 1.75rem;
  padding: 0 var(--dl-space-3);
}

.proj + .proj {
  border-top: var(--dl-border-width) solid var(--dl-border-base);
}

.proj__dot {
  flex: none;
  width: var(--dl-identity-dot-size);
  height: var(--dl-identity-dot-size);
  background: var(--dl-identity);
  border-radius: var(--dl-radius-pill);
}

.proj__name {
  min-width: 0;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-primary);
}

.proj__meta {
  margin-left: auto;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* 悬浮窗 */
.floaty {
  overflow: hidden;
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  box-shadow: var(--dl-shadow-md);
}

.floaty__bar {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  padding: var(--dl-space-2) var(--dl-space-3);
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.floaty__mark {
  flex: none;
  width: var(--dl-identity-bar-width);
  height: var(--dl-space-4);
  background: var(--dl-identity);
  border-radius: var(--dl-radius-pill);
}

.floaty__name {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

.floaty__meta {
  margin-left: auto;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.floaty__body {
  margin: 0;
  padding: var(--dl-space-3);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* --- 使用规则 --- */
.rules {
  margin: 0 0 var(--dl-space-3);
  padding-left: 1.2em;
  max-width: var(--dl-measure);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.rules__item {
  margin-bottom: var(--dl-space-1);
}

.pairs {
  gap: var(--dl-space-3);
}

.pair {
  margin: 0;
}

.pair__title {
  margin: 0 0 var(--dl-space-1);
  font-size: var(--dl-font-size-xs);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-secondary);
}

.pair__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--dl-space-2);
}

.pair__cell {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  min-width: 0;
}

.pair__tag {
  align-self: flex-start;
  font-size: var(--dl-font-size-xs);
  font-weight: var(--dl-weight-strong);
  letter-spacing: var(--dl-tracking-label);
}

.pair__tag--do {
  color: var(--dl-success);
}

.pair__tag--dont {
  color: var(--dl-error);
}

code {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}
</style>
