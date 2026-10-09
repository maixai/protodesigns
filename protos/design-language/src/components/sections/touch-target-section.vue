<script setup lang="ts">
// 触达尺寸:指针目标的下限。密集列表 / 树行是这条规则唯一的收窄例外 ——
// 桌面端把 44px 行高套到侧栏树行上会把侧栏撑得很空(VS Code 的树行约 22px)。
//
// 例外成立的前提是「整行可点 + 相邻目标不重叠」,而不是放松目标尺寸本身:
// 相邻两行各自中心画一个 24px 直径的圆,两圆不相交(WCAG 2.5.8 的间距替代方案)。
// 该例外只适用于列表 / 树行,独立的主要控件(按钮、输入框、图标按钮)仍按 44px。
import { onMounted, ref } from 'vue'

type TreeKind = 'folder' | 'file'

/** 行上的状态标记:null 表示该行没有状态(目录行)。 */
type TreeStatus = 'changed' | 'conflict'

interface TreeRow {
  readonly label: string
  readonly kind: TreeKind
  readonly depth: 0 | 1 | 2
  readonly status: TreeStatus | null
}

// 同一份内容在两档密度下渲染:三层缩进 + 两行带状态标记的条目。
const TREE_ROWS: readonly TreeRow[] = [
  { label: 'src', kind: 'folder', depth: 0, status: null },
  { label: 'components', kind: 'folder', depth: 1, status: null },
  { label: 'site-header.vue', kind: 'file', depth: 2, status: 'changed' },
  { label: 'pages', kind: 'folder', depth: 1, status: null },
  { label: 'workspace-page.vue', kind: 'file', depth: 2, status: 'conflict' },
]

const STATUS_LABEL: Readonly<Record<TreeStatus, string>> = {
  changed: '有改动',
  conflict: '有冲突',
}

type TierKey = 'comfort' | 'dense'

interface Tier {
  readonly key: TierKey
  readonly name: string
  readonly spec: string
  readonly usage: string
  readonly treeClass: string
}

const TIERS: readonly Tier[] = [
  {
    key: 'comfort',
    name: '触屏 / 独立控件档',
    spec: '44px',
    usage: '触屏与 ≤1023px 侧栏抽屉;独立的按钮 / 输入框 / 图标按钮同理',
    treeClass: 'tree--comfort',
  },
  {
    key: 'dense',
    name: '桌面密集列表 / 树行档',
    spec: '28px',
    usage: '仅桌面指针环境;整行可点,相邻圆心距 28px > 24px',
    treeClass: 'tree--dense',
  },
]

// 选中态:整行可点 —— 点在哪一列都能选中,这正是"整行为命中区"的证明。
const selected = ref<string | null>(null)

// ---- 第三档:横向密集导航行(tab 条)及其行内控件 ----
// 与纵向树行同属「密集行」收窄例外,但判据在**横排**下天然成立:相邻目标中心距 = 各自一半宽之和 +
// 间隙,远大于 24px。故这一档的任何宽度都保持 32px,不套用「≤1023 回到 44px」(那条只针对纵向密集行)。
interface NavTab {
  readonly id: string
  readonly label: string
}

const NAV_TABS: readonly NavTab[] = [
  { id: 'weekly', label: '把项目周报整理成行动清单' },
  { id: 'roadmap', label: '梳理下季度路线图' },
  { id: 'incident', label: '复盘线上故障处理' },
]

const selectedNavTab = ref('weekly')

// 实测行高:挂载后由浏览器算出的真实值,与声明的规格并排呈现,供目视核对。
const measured = ref<Partial<Record<TierKey, string>>>({})

// 第三档的实测尺寸与相邻目标最小中心距(横排判据的度量对象)。
const measuredNav = ref<{ tab: string; control: string; close: string; gap: string }>({ tab: '', control: '', close: '', gap: '' })

// 读取某一档首行的实际渲染高度;取不到时返回空串,由模板隐藏该徽标。
function readRowHeight(tier: Tier): string {
  const row = document.querySelector(`.${tier.treeClass} .tree__row`)
  if (!(row instanceof HTMLElement)) return ''
  return `${row.getBoundingClientRect().height.toFixed(1)}px`
}

// 量第三档的实物:tab / ＋ / 关闭钮的尺寸与相邻目标(同一行内)的最小中心距。
function measureNav(): void {
  const row = document.querySelector('.nav-row')
  if (!(row instanceof HTMLElement)) return
  const rectOf = (element: Element | null): DOMRect | null => (element instanceof HTMLElement ? element.getBoundingClientRect() : null)
  const size = (rect: DOMRect | null): string => (rect === null ? '' : `${rect.width.toFixed(0)}×${rect.height.toFixed(0)}`)
  const tabRect = rectOf(row.querySelector('.nav-tab'))
  const controlRect = rectOf(row.querySelector('.nav-control'))
  const closeRect = rectOf(row.querySelector('.nav-close'))
  const targets = [...row.querySelectorAll<HTMLElement>('.nav-slot'), row.querySelector<HTMLElement>('.nav-control')].filter(
    (element): element is HTMLElement => element !== null,
  )
  const rects = targets.map((element) => element.getBoundingClientRect())
  let minGap = Number.POSITIVE_INFINITY
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i]
      const b = rects[j]
      if (a === undefined || b === undefined) continue
      // 只比同一行的目标(换行后不同行的目标不算相邻)。
      if (Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) > 1) continue
      minGap = Math.min(minGap, Math.hypot(b.left + b.width / 2 - (a.left + a.width / 2), 0))
    }
  }
  measuredNav.value = {
    tab: size(tabRect),
    control: size(controlRect),
    close: size(closeRect),
    gap: Number.isFinite(minGap) ? `${minGap.toFixed(1)}px` : '',
  }
}

onMounted(() => {
  const next: Partial<Record<TierKey, string>> = {}
  for (const tier of TIERS) next[tier.key] = readRowHeight(tier)
  measured.value = next
  measureNav()
})

// 判据的两档示意:密集档成立,低于 24px 的行高则两圆相交。
const CASES = [
  {
    key: 'pass',
    verdict: '不相交',
    detail: '圆心距 28px ≥ 24px',
    pass: true,
  },
  {
    key: 'fail',
    verdict: '相交 4px',
    detail: '圆心距 20px < 24px',
    pass: false,
  },
] as const

// 判据数值:全部写全,便于机械核对。
const FACTS = [
  { key: '纵向密集行行高', value: '28px' },
  { key: '横向导航行控件', value: '32px' },
  { key: 'tab 上的关闭钮', value: '24px' },
  { key: '最小目标尺寸', value: '24px' },
  { key: '圆的直径', value: '24px' },
  { key: '纵向相邻圆心距', value: '28px' },
  { key: '纵向安全余量', value: '4px' },
] as const

interface RulePair {
  readonly title: string
  readonly doText: string
  readonly dontText: string
}

const RULES: readonly RulePair[] = [
  {
    title: '桌面纵向密集列表 / 树行',
    doText: '行高降到 ≥24×24,并让整行成为命中区;行距 28px 时圆心距 28px > 24px,判据成立',
    dontText: '把 44px 硬套到桌面密集行,侧栏被撑得很空,一屏放不下几个条目',
  },
  {
    title: '横向密集导航行(tab 条)',
    doText: 'tab 与行内控件取 32px、tab 上的关闭钮取 24px;横排中心距天然 ≫24px,任何宽度都保持这一档',
    dontText: '给横向 tab 条套「≤1023 回到 44px」—— 那条只针对纵向密集行(手指纵向落点精度低)',
  },
  {
    title: '触屏与抽屉(≤1023px)',
    doText: '保持 44px —— 手指落点精度远低于指针,这一档不放宽',
    dontText: '在触屏 / 抽屉里用 28px,相邻行会互相误触',
  },
  {
    title: '命中区与视觉行高一致',
    doText: '可点区 = 视觉行高,整行(图标、文字、空白)都接收点击',
    dontText: '看着 28px、可点区只有文字那 18px,是"视觉合规、实际不达标"',
  },
]
</script>

<template>
  <section class="dl-section target">
    <h2 class="dl-section__title">触达尺寸</h2>
    <p class="dl-section__note">
      指针目标的下限。密集列表 / 树行是唯一的收窄例外:桌面端可降到 ≥24×24,
      但必须整行可点、且相邻目标不重叠;触屏与抽屉里仍保持 44px。
    </p>

    <!-- 两档并排:同一棵树的两种行高 -->
    <div class="tiers">
      <div v-for="tier in TIERS" :key="tier.key" class="tier">
        <div class="tier__head">
          <span class="tier__name">{{ tier.name }}</span>
          <code class="tier__spec">行高 {{ tier.spec }}</code>
          <span v-if="measured[tier.key]" class="tier__measured">实测 {{ measured[tier.key] }}</span>
        </div>
        <p class="tier__usage">{{ tier.usage }}</p>

        <ul class="tree" :class="tier.treeClass">
          <li v-for="row in TREE_ROWS" :key="row.label">
            <button
              type="button"
              class="tree__row"
              :class="{ 'tree__row--selected': selected === row.label }"
              :style="{ '--row-depth': row.depth }"
              :aria-pressed="selected === row.label"
              @click="selected = selected === row.label ? null : row.label"
            >
              <svg
                class="tree__glyph"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  v-if="row.kind === 'folder'"
                  d="M3.5 6.75A1.75 1.75 0 0 1 5.25 5h3.9l1.8 2.1h7.8A1.75 1.75 0 0 1 20.5 8.85v7.4A1.75 1.75 0 0 1 18.75 18H5.25A1.75 1.75 0 0 1 3.5 16.25z"
                />
                <template v-else>
                  <path d="M7 3.5h6.5L18.5 8.5v12H7z" />
                  <path d="M13.5 3.5V8.5H18.5" />
                </template>
              </svg>
              <span class="tree__label dl-truncate">{{ row.label }}</span>
              <span
                v-if="row.status"
                class="tree__badge"
                :class="`tree__badge--${row.status}`"
              >
                {{ STATUS_LABEL[row.status] }}
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- 第三档:横向密集导航行(tab 条)及其行内控件 —— 判据在横排下天然成立 -->
    <div class="nav-tier">
      <div class="tier__head">
        <span class="tier__name">横向密集导航行档</span>
        <code class="tier__spec">行内控件 32px / tab 上的关闭钮 24px</code>
        <span v-if="measuredNav.tab" class="tier__measured">
          实测 tab {{ measuredNav.tab }} · ＋ {{ measuredNav.control }} · 关闭钮 {{ measuredNav.close }}
        </span>
      </div>
      <p class="tier__usage">
        横向 tab 条及其行内控件(＋ / 菜单钮);tab 上的关闭钮取 24px。横排的间距判据天然成立,
        故这一档**任何宽度都保持 32px**,不按断点抬回 44px。
      </p>
      <div class="nav-row" role="tablist" aria-label="紧凑导航行示例">
        <div v-for="tab in NAV_TABS" :key="tab.id" class="nav-slot" role="presentation">
          <button
            type="button"
            role="tab"
            class="nav-tab"
            :aria-selected="selectedNavTab === tab.id"
            :tabindex="selectedNavTab === tab.id ? 0 : -1"
            @click="selectedNavTab = tab.id"
          >
            <span class="nav-tab__label dl-truncate">{{ tab.label }}</span>
          </button>
          <button type="button" class="nav-close" tabindex="-1" :aria-label="`关闭 ${tab.label}`">✕</button>
        </div>
        <button type="button" class="nav-control" aria-label="新建对话">＋</button>
      </div>
      <p v-if="measuredNav.gap" class="nav-note">
        实测相邻目标最小中心距 <span class="dl-numeric">{{ measuredNav.gap }}</span> ≥ 24px ⇒ 两圆不相交,判据成立。
      </p>
    </div>

    <!-- 判据:相邻目标中心 24px 圆不相交 -->
    <div class="criterion">
      <h3 class="criterion__title">判据:相邻目标中心 24px 圆不相交</h3>
      <p class="criterion__basis">
        依据 WCAG 2.5.8 的间距替代方案:相邻两个目标各自中心画一个 24px 直径的圆,两圆不相交即为达标。
        **纵向**密集行:行距 28px、无间隙时圆心距即 28px,28 &gt; 24,余量 4px;行高降到 24px 以下则两圆相交、不达标。
        **横向**密集导航行(tab 条):中心距 = 各自一半宽之和 + 间隙,远大于 24px,判据**天然成立**,
        故不必为判据抬高尺寸(任何宽度都保持 32px)。该例外只适用于密集行与密集行内的控件;
        按钮、输入框、图标按钮等独立控件仍按 44px。
      </p>

      <div class="cases">
        <div v-for="item in CASES" :key="item.key" class="case" :class="`case--${item.key}`">
          <div class="case__diagram" aria-hidden="true">
            <div class="case__span"></div>
            <div class="case__rows">
              <div class="case__row"><span class="case__circle"></span></div>
              <div class="case__row"><span class="case__circle"></span></div>
            </div>
          </div>
          <p class="case__caption">
            <span class="case__verdict" :class="`case__verdict--${item.pass ? 'pass' : 'fail'}`">
              {{ item.verdict }}
            </span>
            <span class="case__detail">{{ item.detail }}</span>
          </p>
        </div>
      </div>

      <!-- 横排判据示意:两个相邻目标并排,各自中心一个 24px 圆;中心距 = 各自一半宽之和 + 间隙 -->
      <div class="hcase">
        <div class="hcase__row" aria-hidden="true">
          <span class="hcase__target"><span class="hcase__circle"></span></span>
          <span class="hcase__gap"><span class="hcase__gap-line" /></span>
          <span class="hcase__target"><span class="hcase__circle"></span></span>
        </div>
        <p class="case__caption">
          <span class="case__verdict case__verdict--pass">不相交</span>
          <span class="case__detail">横排:中心距 = 各自一半宽之和 + 间隙 ≫ 24px(天然成立)</span>
        </p>
      </div>

      <ul class="facts">
        <li v-for="fact in FACTS" :key="fact.key" class="facts__item">
          <span class="facts__key">{{ fact.key }}</span>
          <span class="facts__value dl-numeric">{{ fact.value }}</span>
        </li>
      </ul>
    </div>

    <!-- Do / Don't -->
    <div class="criterion">
      <h3 class="criterion__title">do / don't</h3>
      <div class="dl-grid rules">
        <article v-for="rule in RULES" :key="rule.title" class="rule">
          <h4 class="rule__title">{{ rule.title }}</h4>
          <div class="rule__row">
            <div class="rule__cell">
              <span class="rule__tag rule__tag--do">Do</span>
              <span class="dl-demo-box">{{ rule.doText }}</span>
            </div>
            <div class="rule__cell">
              <span class="rule__tag rule__tag--dont">Don't</span>
              <span class="dl-demo-box">{{ rule.dontText }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 例外边界的两个提案值:尚未定稿进全局 token,先以局部变量承载,定稿后回写。
   24px = WCAG 2.5.8 的最小目标尺寸;28px = 桌面密集行高(24px 圆 + 4px 安全余量)。
   反例值 20px 低于 24px 下限,仅用于展示"两圆相交"的失败情形,不是可用取值。 */
.target {
  --target-min: 24px;
  --target-dense-row: 28px;
  --target-too-tight: 20px;
  /* 第三档:横向密集导航行(tab 条)的行内控件与 tab 上的关闭钮。 */
  --target-nav-control: 32px;
  --target-nav-close: 24px;
}

/* 两档并排 */
.tiers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: var(--dl-space-3);
}

.tier {
  min-width: 0;
  padding: var(--dl-space-3);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.tier__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--dl-space-2);
}

.tier__name {
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.tier__spec {
  color: var(--dl-text-secondary);
}

.tier__measured {
  margin-left: auto;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.tier__usage {
  margin: var(--dl-space-1) 0 var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
}

/* 树 / 列表行。密集档行与行之间不留间隙 —— 圆心距才严格等于行高 28px。 */
.tree {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tree--comfort {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
}

.tree--dense {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tree__row {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  /* 整行为命中区:行内没有接收点击的子元素,命中范围 = 整行 */
  width: 100%;
  height: var(--row-h);
  padding-left: calc(var(--dl-space-2) + var(--dl-space-4) * var(--row-depth));
  padding-right: var(--dl-space-2);
  font-family: inherit;
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
  text-align: left;
  background: transparent;
  border: none;
  border-radius: var(--dl-radius-sm);
  cursor: pointer;
  transition: background var(--dl-duration-fast) var(--dl-ease-standard);
}

.tree--comfort .tree__row {
  --row-h: var(--dl-target-size);
}

.tree--dense .tree__row {
  --row-h: var(--target-dense-row);
}

.tree__row:hover {
  background: var(--dl-bg-hover);
}

.tree__row:active {
  background: var(--dl-bg-sunken);
}

.tree__row:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: calc(var(--dl-focus-offset) * -1);
}

.tree__row--selected {
  background: var(--dl-accent-subtle);
  color: var(--dl-text-primary);
}

.tree__glyph {
  flex: none;
  width: var(--glyph-size);
  height: var(--glyph-size);
  stroke-width: var(--dl-icon-stroke);
  color: var(--dl-text-tertiary);
}

.tree--comfort .tree__glyph {
  --glyph-size: var(--dl-icon-md);
}

.tree--dense .tree__glyph {
  --glyph-size: var(--dl-icon-sm);
}

.tree__label {
  flex: 1;
  min-width: 0;
}

.tree__badge {
  flex: none;
  padding: 0 var(--dl-space-1);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  border-radius: var(--dl-radius-sm);
}

.tree__badge--changed {
  color: var(--dl-warning);
  background: var(--dl-warning-subtle);
}

.tree__badge--conflict {
  color: var(--dl-error);
  background: var(--dl-error-subtle);
}

/* 判据与 do / don't 两个子块,沿用"补充规范"的分隔写法 */
.criterion {
  margin-top: var(--dl-space-4);
  padding-top: var(--dl-space-3);
  border-top: var(--dl-border-width) solid var(--dl-border-base);
}

.criterion__title {
  margin: 0 0 var(--dl-space-1);
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.criterion__basis {
  margin: 0 0 var(--dl-space-3);
  max-width: var(--dl-measure);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
}

/* 判据示意:两行叠放,各有一个 24px 圆;左侧竖线标出圆心距 */
.cases {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--dl-space-3);
}

.case {
  min-width: 0;
}

.case--pass {
  --case-row: var(--target-dense-row);
}

.case--fail {
  --case-row: var(--target-too-tight);
}

.case__diagram {
  position: relative;
  padding: var(--dl-space-2);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.case__rows {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.case__row {
  display: flex;
  align-items: center;
  justify-content: center;
  height: var(--case-row);
}

.case__circle {
  /* 命中区圆是判据的度量对象:外径必须正好是 24px,故把描边算进尺寸里 */
  box-sizing: border-box;
  width: var(--target-min);
  height: var(--target-min);
  background: var(--dl-accent-subtle);
  border: var(--dl-border-width) dashed var(--dl-accent);
  border-radius: var(--dl-radius-pill);
}

.case--fail .case__circle {
  background: var(--dl-error-subtle);
  border-color: var(--dl-error);
}

/* 圆心距标注线:从上一行圆心到下一行圆心 */
.case__span {
  position: absolute;
  left: var(--dl-space-2);
  top: calc(var(--dl-space-2) + var(--case-row) / 2);
  width: var(--dl-border-width);
  height: var(--case-row);
  background: var(--dl-border-strong);
}

.case__span::before,
.case__span::after {
  content: '';
  position: absolute;
  left: calc(var(--dl-space-2) * -1);
  width: var(--dl-space-3);
  height: var(--dl-border-width);
  background: var(--dl-border-strong);
}

.case__span::before {
  top: 0;
}

.case__span::after {
  bottom: 0;
}

.case__caption {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--dl-space-1);
  margin: var(--dl-space-2) 0 0;
  font-size: var(--dl-font-size-xs);
}

.case__verdict {
  font-weight: var(--dl-weight-strong);
}

.case__verdict--pass {
  color: var(--dl-success);
}

.case__verdict--fail {
  color: var(--dl-error);
}

.case__detail {
  color: var(--dl-text-tertiary);
}

/* 判据数值 */
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--dl-space-2);
  margin: var(--dl-space-3) 0 0;
  padding: 0;
  list-style: none;
}

.facts__item {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  padding: var(--dl-space-2);
  background: var(--dl-bg-sunken);
  border-radius: var(--dl-radius-sm);
}

.facts__key {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.facts__value {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

/* do / don't:与独立区块同一套语气与排版 */
.rules {
  gap: var(--dl-space-3);
}

.rule {
  margin: 0;
}

.rule__title {
  margin: 0 0 var(--dl-space-1);
  font-size: var(--dl-font-size-xs);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-secondary);
}

.rule__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
  gap: var(--dl-space-2);
}

.rule__cell {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  min-width: 0;
}

.rule__tag {
  align-self: flex-start;
  font-size: var(--dl-font-size-xs);
  font-weight: var(--dl-weight-strong);
  letter-spacing: var(--dl-tracking-label);
}

.rule__tag--do {
  color: var(--dl-success);
}

.rule__tag--dont {
  color: var(--dl-error);
}

/* ---- 第三档:横向密集导航行(tab 条)及其行内控件 ---- */
.nav-tier {
  margin-top: var(--dl-space-3);
  padding: var(--dl-space-3);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.nav-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--dl-space-1);
}

/* 槽位承担关闭钮的定位上下文(关闭钮绝对定位,出现时不改变 tab 宽度)。 */
.nav-slot {
  position: relative;
  display: flex;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  inline-size: 11rem;
  block-size: var(--target-nav-control);
  padding-inline-start: var(--dl-space-3);
  /* 恒常预留关闭钮的槽(关闭钮宽 + 两档内缩),悬停出现时零重排。 */
  padding-inline-end: calc(var(--target-nav-close) + 2 * var(--dl-space-1));
  border-radius: var(--dl-radius-md);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
  text-align: start;
  transition: background var(--dl-duration-fast) var(--dl-ease-standard);
}

.nav-tab:hover {
  background: var(--dl-bg-hover);
}

.nav-tab[aria-selected='true'] {
  background: var(--dl-accent-subtle);
  color: var(--dl-text-primary);
  font-weight: var(--dl-weight-strong);
}

.nav-tab:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}

.nav-tab__label {
  flex: 1;
  min-width: 0;
}

.nav-close {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: var(--dl-space-1);
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--target-nav-close);
  block-size: var(--target-nav-close);
  border-radius: var(--dl-radius-pill);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-tight);
}

.nav-slot:hover .nav-close {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.nav-control {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--target-nav-control);
  block-size: var(--target-nav-control);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary);
  background: var(--dl-bg-elevated);
  font-size: var(--dl-font-size-sm);
}

.nav-note {
  margin: var(--dl-space-2) 0 0;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* 横排判据示意:两个相邻目标并排,各自中心一个 24px 圆。 */
.hcase {
  margin-top: var(--dl-space-3);
}

.hcase__row {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--dl-space-2);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.hcase__target {
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: 4rem;
  block-size: var(--target-nav-control);
  background: var(--dl-bg-sunken);
  border-radius: var(--dl-radius-sm);
}

.hcase__circle {
  box-sizing: border-box;
  inline-size: var(--target-min);
  block-size: var(--target-min);
  background: var(--dl-accent-subtle);
  border: var(--dl-border-width) dashed var(--dl-accent);
  border-radius: var(--dl-radius-pill);
}

.hcase__gap {
  display: flex;
  align-items: center;
  justify-content: center;
  inline-size: 2rem;
}

.hcase__gap-line {
  inline-size: 100%;
  border-block-start: var(--dl-border-width) solid var(--dl-border-strong);
}
</style>
