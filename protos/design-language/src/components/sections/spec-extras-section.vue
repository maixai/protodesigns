<script setup lang="ts">
// 补充规范:图标、文本截断、层级阶梯、组件配方。
// 这四项此前只存在于口头约定里,没有实物可核对 —— 评审时无从判定对错。

const ICON_SIZES = [
  { token: 'sm', value: '16px', usage: '行内 / 表格' },
  { token: 'md', value: '20px', usage: '按钮 / 工具栏' },
  { token: 'lg', value: '24px', usage: '独立操作 / 空态' },
] as const

const CLAMPS = [
  { className: 'dl-truncate', label: '单行截断', usage: '表格单元格、列表标题' },
  { className: 'dl-clamp-2', label: '两行截断', usage: '卡片摘要' },
  { className: 'dl-clamp-3', label: '三行截断', usage: '较长的描述' },
] as const

const CLAMP_SAMPLE =
  '这是一段刻意写长的样例文案,用来观察截断行为:中文没有词间空格,断行位置由浏览器按字决定,而末尾的省略号必须出现在视觉边界上。'

const Z_LAYERS = [
  { token: '--dl-z-toast', value: '400', usage: '全局通知' },
  { token: '--dl-z-modal', value: '300', usage: '对话框 / 抽屉' },
  { token: '--dl-z-overlay', value: '200', usage: '下拉 / 气泡 / 遮罩' },
  { token: '--dl-z-sticky', value: '100', usage: '吸顶工具栏' },
  { token: '--dl-z-base', value: '0', usage: '正常内容' },
] as const

// 组件配方:每个组件的每个状态引用哪个 token —— 这是开发最需要的一张表。
interface RecipeRow {
  readonly component: string
  readonly base: string
  readonly hover: string
  readonly disabled: string
}

const RECIPES: readonly RecipeRow[] = [
  {
    component: '主按钮',
    base: 'bg --dl-accent / 文字 --dl-text-on-accent',
    hover: 'bg --dl-accent-hover',
    disabled: 'bg --dl-bg-sunken / 文字 --dl-text-disabled',
  },
  {
    component: '次按钮',
    base: 'bg --dl-bg-elevated / 描边 --dl-border-base',
    hover: 'bg --dl-bg-hover',
    disabled: '文字 --dl-text-disabled',
  },
  {
    component: '输入框',
    base: 'bg --dl-bg-elevated / 描边 --dl-border-base',
    hover: '描边 --dl-border-strong',
    disabled: 'bg --dl-bg-sunken / 文字 --dl-text-disabled',
  },
  {
    component: '卡片',
    base: 'bg --dl-bg-elevated / 阴影 --dl-shadow-md',
    hover: '描边 --dl-border-strong',
    disabled: '—(卡片本身不可禁用)',
  },
  {
    component: '标签 / 徽标',
    base: 'bg --dl-accent / 文字 --dl-text-on-accent',
    hover: 'bg --dl-accent-hover',
    disabled: 'bg --dl-bg-sunken',
  },
]
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">补充规范</h2>
    <p class="dl-section__note">
      图标、截断、层级与组件配方 —— 这四项此前没有实物,现在各有可核对的形态。
    </p>

    <!-- 图标 -->
    <div class="extra">
      <h3 class="extra__title">图标尺寸与描边</h3>
      <p class="extra__basis">
        描边宽度不随尺寸缩放,否则小图标会显得比大图标更重。图标按钮必须带
        <code>aria-label</code>,不能只靠图形传达含义。
      </p>
      <div class="icons">
        <div v-for="size in ICON_SIZES" :key="size.token" class="icons__item">
          <svg
            class="icons__glyph"
            :style="{ '--glyph-size': `var(--dl-icon-${size.token})` }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <code>--dl-icon-{{ size.token }}</code>
          <span class="icons__usage">{{ size.usage }}</span>
        </div>
      </div>
    </div>

    <!-- 文本截断 -->
    <div class="extra">
      <h3 class="extra__title">文本截断</h3>
      <p class="extra__basis">
        按"内容是否必须完整可见"选,而不是按视觉长短选。截断会丢信息的位置一律不截。
      </p>
      <div class="clamps">
        <div v-for="clamp in CLAMPS" :key="clamp.className" class="clamps__item">
          <div class="clamps__meta">
            <code>.{{ clamp.className }}</code>
            <span class="clamps__usage">{{ clamp.usage }}</span>
          </div>
          <p class="clamps__text" :class="clamp.className">{{ CLAMP_SAMPLE }}</p>
        </div>
      </div>
    </div>

    <!-- 层级阶梯 -->
    <div class="extra">
      <h3 class="extra__title">层级阶梯 z-index</h3>
      <p class="extra__basis">
        全站只有这五档。就地写 <code>9999</code> 会让"谁压谁"变成不可推理的问题。
      </p>
      <div class="layers">
        <div v-for="layer in Z_LAYERS" :key="layer.token" class="layers__row">
          <code class="layers__token">{{ layer.token }}</code>
          <span class="layers__bar" :style="{ '--layer-w': `calc(${layer.value} / 8 * 1%)` }"></span>
          <span class="layers__value">{{ layer.value }}</span>
          <span class="layers__usage">{{ layer.usage }}</span>
        </div>
      </div>
    </div>

    <!-- 组件配方 -->
    <div class="extra">
      <h3 class="extra__title">组件配方</h3>
      <p class="extra__basis">
        开发最需要的一张表:每个组件、每个状态该引用哪个 token。缺了它,实现者只能猜。
      </p>
      <div class="recipes">
        <table class="recipes__table">
          <thead>
            <tr>
              <th scope="col">组件</th>
              <th scope="col">默认</th>
              <th scope="col">hover</th>
              <th scope="col">禁用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in RECIPES" :key="row.component">
              <th scope="row">{{ row.component }}</th>
              <td>{{ row.base }}</td>
              <td>{{ row.hover }}</td>
              <td>{{ row.disabled }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.extra {
  margin-top: var(--dl-space-4);
  padding-top: var(--dl-space-3);
  border-top: var(--dl-border-width) solid var(--dl-border-base);
}

.extra:first-of-type {
  margin-top: var(--dl-space-3);
}

.extra__title {
  margin: 0 0 var(--dl-space-1);
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.extra__basis {
  margin: 0 0 var(--dl-space-3);
  max-width: var(--dl-measure);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
}

/* 图标 */
.icons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-6);
}

.icons__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dl-space-1);
}

.icons__glyph {
  width: var(--glyph-size);
  height: var(--glyph-size);
  stroke-width: var(--dl-icon-stroke);
  color: var(--dl-accent);
}

.icons__usage {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* 截断 */
.clamps {
  display: grid;
  gap: var(--dl-space-3);
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
}

.clamps__item {
  min-width: 0;
}

.clamps__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--dl-space-2);
  margin-bottom: var(--dl-space-1);
}

.clamps__usage {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.clamps__text {
  margin: 0;
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 层级 */
.layers {
  display: grid;
  gap: var(--dl-space-1);
}

.layers__row {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
}

.layers__token {
  flex: none;
  width: 11em;
  color: var(--dl-text-secondary);
}

.layers__bar {
  flex: none;
  /* 最小可见宽度:0 层不能被画成"不存在" */
  width: max(2px, var(--layer-w));
  height: 0.5rem;
  background: var(--dl-accent);
  border-radius: var(--dl-radius-sm);
}

.layers__value {
  flex: none;
  width: 2.5em;
  color: var(--dl-text-tertiary);
}

.layers__usage {
  color: var(--dl-text-tertiary);
}

/* 配方表 */
.recipes {
  overflow-x: auto;
}

.recipes__table {
  width: 100%;
  min-width: 32rem;
  border-collapse: collapse;
  font-size: var(--dl-font-size-xs);
}

.recipes__table th,
.recipes__table td {
  padding: var(--dl-space-2);
  text-align: left;
  vertical-align: top;
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.recipes__table thead th {
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
  border-bottom-color: var(--dl-border-strong);
}

.recipes__table tbody th {
  font-weight: var(--dl-weight-medium);
  color: var(--dl-text-primary);
  white-space: nowrap;
}

.recipes__table td {
  color: var(--dl-text-secondary);
}
</style>
