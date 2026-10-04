<script setup lang="ts">
// 排版调教台:把每个待定要素的候选值并排渲染,让"该取多少"变成能直接看出来的判断,
// 而不是靠讨论。每个对比组都标出取值依据(无障碍标准 / CJK 实践)。
//
// 这里刻意使用**局部 CSS 变量**而不是全局 token:调教阶段的值还没定,
// 定稿后再写回 style.css 与 design-language.md。

// 同一段中文样例:用于比较行高、行宽、字号 —— 内容固定,变量才可归因。
const PARAGRAPH =
  '设计语言的调教不是凭感觉调数值。正文的行高要同时照顾中文的笔画密度与西文的升降部,行宽要让眼睛在换行时找得到下一行的开头,字号则要在信息密度与阅读舒适之间取平衡。这些都可以被量化和比较。'

// 混排样例:中英数字交界处的间距,是中文界面里最容易暴露排版功力的地方。
const MIXED =
  '渲染耗时从 128ms 降到 47ms,提升约 63%。在 macOS 与 Windows 上分别用 WebKit 与 Chromium 引擎复测。'

const LINE_HEIGHT_CANDIDATES = [
  { value: '1.5', note: 'WCAG 下限。中文正文偏紧', chosen: false },
  { value: '1.6', note: '偏紧', chosen: false },
  { value: '1.7', note: '中文正文实践中位', chosen: true },
  { value: '1.8', note: '中文长文阅读推荐', chosen: false },
] as const

const FONT_SIZE_CANDIDATES = [
  { value: '14px', note: '密集界面常见值,中文偏小', chosen: false },
  { value: '15px', note: '密集界面与中文可读性之间的折中', chosen: true },
  { value: '16px', note: '中文正文的常见下限', chosen: false },
] as const

const MEASURE_CANDIDATES = [
  { value: '26em', note: '偏窄,换行频繁', chosen: false },
  { value: '35em', note: 'CJK 推荐区间中位 ≈ 中文 33–36 字/行', chosen: true },
  { value: '44em', note: '偏宽,回行易串行', chosen: false },
] as const

const NUMERIC_ROWS = [
  { label: '首屏渲染', before: '1284.6ms', after: '97.42ms' },
  { label: '接口耗时', before: '211.08ms', after: '18.9ms' },
  { label: '包体积', before: '1111.1KB', after: '204.35KB' },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">排版调教台</h2>
    <p class="dl-section__note">
      每个要素给出候选值并排渲染。选定后再写回 token 与规范 —— 调教阶段用的是局部变量。
    </p>

    <!-- 行高 -->
    <div class="tune">
      <h3 class="tune__title">行高 line-height</h3>
      <p class="tune__basis">
        依据:WCAG 1.4.12 要求行高可被调至 1.5× 而不破版;CJK 实践中正文取 1.7 更舒适。
      </p>
      <div class="tune__grid tune__grid--2">
        <div
          v-for="item in LINE_HEIGHT_CANDIDATES"
          :key="item.value"
          class="tune__cell"
          :style="{ '--lh': item.value }"
        >
          <div class="tune__meta">
            <code>{{ item.value }}</code>
            <span class="tune__note">{{ item.note }}</span>
            <span v-if="item.chosen" class="tune__badge">已选</span>
          </div>
          <p class="tune__para">{{ PARAGRAPH }}</p>
        </div>
      </div>
    </div>

    <!-- 字号 -->
    <div class="tune">
      <h3 class="tune__title">基准字号 font-size</h3>
      <p class="tune__basis">
        依据:14px 对中文偏小(笔画密、识别成本高),16px 是中文正文的常见下限;但密集界面可下探。
      </p>
      <div class="tune__grid">
        <div
          v-for="item in FONT_SIZE_CANDIDATES"
          :key="item.value"
          class="tune__cell"
          :style="{ '--fs': item.value }"
        >
          <div class="tune__meta">
            <code>{{ item.value }}</code>
            <span class="tune__note">{{ item.note }}</span>
            <span v-if="item.chosen" class="tune__badge">已选</span>
          </div>
          <p class="tune__para">{{ PARAGRAPH }}</p>
        </div>
      </div>
    </div>

    <!-- 行宽 -->
    <div class="tune">
      <h3 class="tune__title">行宽 measure</h3>
      <p class="tune__basis">
        依据:中文是全角方块字,<code>ch</code> 是西文单位,不能直接套用 —— 按 em 计,约 35em。
      </p>
      <div class="tune__grid">
        <div
          v-for="item in MEASURE_CANDIDATES"
          :key="item.value"
          class="tune__cell"
          :style="{ '--measure': item.value }"
        >
          <div class="tune__meta">
            <code>{{ item.value }}</code>
            <span class="tune__note">{{ item.note }}</span>
            <span v-if="item.chosen" class="tune__badge">已选</span>
          </div>
          <p class="tune__para tune__para--measured">{{ PARAGRAPH }}</p>
        </div>
      </div>
    </div>

    <!-- 中西文混排 -->
    <div class="tune">
      <h3 class="tune__title">中西文混排间距</h3>
      <p class="tune__basis">
        依据:W3C《中文排版需求》建议汉字与西文之间的间距不超过 1/4 个汉字宽。
      </p>
      <div class="tune__grid tune__grid--2">
        <div class="tune__cell">
          <div class="tune__meta">
            <code>text-autospace: normal</code>
            <span class="tune__note">浏览器自动插入间距</span>
            <span class="tune__badge">已选</span>
          </div>
          <p class="tune__para tune__para--autospace">{{ MIXED }}</p>
        </div>
        <div class="tune__cell">
          <div class="tune__meta">
            <code>text-autospace: none</code>
            <span class="tune__note">不处理,中西文直接相接</span>
          </div>
          <p class="tune__para">{{ MIXED }}</p>
        </div>
      </div>
    </div>

    <!-- 数字 -->
    <div class="tune">
      <h3 class="tune__title">数字等宽 tabular-nums</h3>
      <p class="tune__basis">
        依据:表格与数据列需要数字等宽,否则数字一变列宽就跳。比例数字仅用于展示型大数字。
      </p>
      <div class="tune__grid tune__grid--2">
        <div class="tune__cell">
          <div class="tune__meta">
            <code>font-variant-numeric: tabular-nums</code>
            <span class="tune__note">列对齐稳定</span>
            <span class="tune__badge">已选</span>
          </div>
          <table class="tune__table tune__table--tabular">
            <tbody>
              <tr v-for="row in NUMERIC_ROWS" :key="row.label">
                <th scope="row">{{ row.label }}</th>
                <td>{{ row.before }}</td>
                <td>{{ row.after }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="tune__cell">
          <div class="tune__meta">
            <code>font-variant-numeric: proportional-nums</code>
            <span class="tune__note">数字宽度不一,列会跳</span>
          </div>
          <table class="tune__table tune__table--proportional">
            <tbody>
              <tr v-for="row in NUMERIC_ROWS" :key="row.label">
                <th scope="row">{{ row.label }}</th>
                <td>{{ row.before }}</td>
                <td>{{ row.after }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 段落间距 -->
    <div class="tune">
      <h3 class="tune__title">段落间距 paragraph spacing</h3>
      <p class="tune__basis">
        依据:WCAG 1.4.12 要求段间距可被调至正文的 2 倍而不破版。
      </p>
      <div class="tune__grid tune__grid--2">
        <div class="tune__cell tune__cell--para" :style="{ '--para-gap': '0.5em' }">
          <div class="tune__meta"><code>0.5em</code><span class="tune__note">偏紧,段界不清</span></div>
          <p class="tune__para">{{ PARAGRAPH }}</p>
          <p class="tune__para">{{ PARAGRAPH }}</p>
        </div>
        <div class="tune__cell tune__cell--para" :style="{ '--para-gap': '1.5em' }">
          <div class="tune__meta">
            <code>1.5em</code>
            <span class="tune__note">段界清楚,但不过分松散</span>
            <span class="tune__badge">已选</span>
          </div>
          <p class="tune__para">{{ PARAGRAPH }}</p>
          <p class="tune__para">{{ PARAGRAPH }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tune {
  margin-top: var(--dl-space-4);
  padding-top: var(--dl-space-3);
  border-top: var(--dl-border-width) solid var(--dl-border-base);
}

.tune:first-of-type {
  margin-top: var(--dl-space-3);
}

.tune__title {
  margin: 0 0 var(--dl-space-1);
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.tune__basis {
  margin: 0 0 var(--dl-space-3);
  max-width: var(--dl-measure);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
}

.tune__grid {
  display: grid;
  gap: var(--dl-space-3);
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
}

.tune__grid--2 {
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}

.tune__cell {
  min-width: 0;
  padding: var(--dl-space-3);
  background: var(--dl-panel-bg);
  backdrop-filter: var(--dl-panel-blur);
  -webkit-backdrop-filter: var(--dl-panel-blur);
  border: var(--dl-border-width) solid var(--dl-panel-border);
  border-radius: var(--dl-panel-radius);
  box-shadow: var(--dl-panel-inner), var(--dl-panel-shadow);
}

.tune__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--dl-space-2);
  margin-bottom: var(--dl-space-2);
  padding-bottom: var(--dl-space-1);
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.tune__badge {
  margin-left: auto;
  padding: 0 var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border-radius: var(--dl-radius-pill);
}

.tune__note {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.tune__para {
  margin: 0;
  /* 候选值通过局部变量注入,不污染全局 token */
  font-size: var(--fs, var(--dl-font-size-md));
  line-height: var(--lh, var(--dl-line-body));
  color: var(--dl-text-secondary);
  text-align: left;
}

.tune__para--measured {
  max-width: var(--measure, none);
}

.tune__para--autospace {
  text-autospace: normal;
}

/* 段落间距候选:用相邻段落的上边距表达 */
.tune__cell--para .tune__para + .tune__para {
  margin-top: var(--para-gap, 1em);
}

.tune__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}

.tune__table th,
.tune__table td {
  padding: var(--dl-space-2) var(--dl-space-2);
  text-align: left;
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.tune__table th {
  font-weight: var(--dl-weight-regular);
  color: var(--dl-text-primary);
}

.tune__table td {
  text-align: right;
}

.tune__table--tabular td {
  font-variant-numeric: tabular-nums;
}

.tune__table--proportional td {
  font-variant-numeric: proportional-nums;
}
</style>
