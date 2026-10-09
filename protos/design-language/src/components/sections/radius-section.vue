<script setup lang="ts">
// 圆角:同一组形状套用不同圆角阶,圆角的"性格"直接决定界面是硬朗还是柔软。
//
// 分工按「圆角随元素尺寸走」:元素越大,圆角相对其尺寸应越大,否则满高面板上的
// 圆弧会小到近乎直角。各档因此互不重叠,而不是一个"卡片 / 面板"笼统覆盖两级。
const RADII = [
  { token: 'sm', usage: '标签 / 小控件' },
  { token: 'md', usage: '按钮 / 输入框' },
  { token: 'lg', usage: '卡片' },
  { token: 'xl', usage: '面板 / 浮层' },
  { token: 'pill', usage: '胶囊 / 头像' },
] as const

// 面板圆角候选:同一块面板尺度的样张在 12 / 16 / 20px 下的圆润度与嵌套同心度。
// 候选值是局部变量,定稿的 16px 已写回 --dl-radius-xl。
const PANEL_CANDIDATES = [
  {
    value: '12px',
    note: '现有最大档,属 card / modal;满高面板下圆弧过小,仍接近直角 —— 即本次要解决的问题本身',
    chosen: false,
  },
  {
    value: '16px',
    note: '选定值。落在业界大面板 16–24px 区间下沿,与现有 6 / 8 / 12 的 1.3–1.5 倍步进一致',
    chosen: true,
  },
  {
    value: '20px',
    note: '区间中段。圆润感更强,但相对现有阶跨度偏大,嵌套元件与外圆的同心偏差更明显',
    chosen: false,
  },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">圆角</h2>
    <p class="dl-section__note">
      圆角阶必须成套使用,不允许某个组件单独取一个阶以外的值。圆角随元素尺寸走:小控件与满高面板不共用一档。
    </p>

    <div class="radii">
      <div v-for="item in RADII" :key="item.token" class="radius">
        <div
          class="radius__shape"
          :style="{ '--shape-radius': `var(--dl-radius-${item.token})` }"
          aria-hidden="true"
        ></div>
        <code class="radius__token">--dl-radius-{{ item.token }}</code>
        <span class="radius__usage">{{ item.usage }}</span>
      </div>
    </div>

    <!-- 面板圆角:候选值并排渲染,把"该取多少"变成能直接看出来的判断 -->
    <div class="panel-tune">
      <h3 class="panel-tune__title">面板圆角 panel radius</h3>
      <p class="panel-tune__basis">
        依据:现有阶最大 12px 属 card / modal 档,用在满高面板上圆弧相对面板尺寸太小,视觉上仍接近直角。
        业界把 hero / bottom sheet / 大面板放在 16–24px。面板内嵌套元件按「内圆角 = 外圆角 −(间距 + 描边)」
        推导,否则两圈弧线不同心,缝隙会忽宽忽窄。
      </p>
      <div class="panel-tune__grid">
        <div
          v-for="item in PANEL_CANDIDATES"
          :key="item.value"
          class="panel-tune__cell"
          :style="{ '--panel-radius-candidate': item.value }"
        >
          <div class="panel-tune__meta">
            <code>{{ item.value }}</code>
            <span class="panel-tune__note">{{ item.note }}</span>
            <span v-if="item.chosen" class="panel-tune__badge">已选</span>
          </div>
          <div class="panel-tune__sample">
            <span class="panel-tune__sample-label">工作区面板</span>
            <div class="panel-tune__nested">嵌套条目</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.radii {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--dl-space-3);
}

.radius {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dl-space-1);
  text-align: center;
}

.radius__shape {
  width: 100%;
  height: 3rem;
  background: var(--dl-accent-subtle);
  border: var(--dl-border-width) solid var(--dl-accent);
  border-radius: var(--shape-radius);
}

.radius__token {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.radius__usage {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

/* 面板圆角候选对比:沿用排版调教台的写法 —— 候选值经局部变量注入,不污染全局 token。 */
.panel-tune {
  margin-top: var(--dl-space-4);
  padding-top: var(--dl-space-3);
  border-top: var(--dl-border-width) solid var(--dl-border-base);
}

.panel-tune__title {
  margin: 0 0 var(--dl-space-1);
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.panel-tune__basis {
  margin: 0 0 var(--dl-space-3);
  max-width: var(--dl-measure);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
}

.panel-tune__grid {
  display: grid;
  gap: var(--dl-space-3);
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}

.panel-tune__cell {
  min-width: 0;
  padding: var(--dl-space-3);
  background: var(--dl-panel-bg);
  backdrop-filter: var(--dl-panel-blur);
  -webkit-backdrop-filter: var(--dl-panel-blur);
  border: var(--dl-border-width) solid var(--dl-panel-border);
  border-radius: var(--dl-panel-radius);
  box-shadow: var(--dl-panel-inner), var(--dl-panel-shadow);
}

.panel-tune__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--dl-space-2);
  margin-bottom: var(--dl-space-2);
  padding-bottom: var(--dl-space-1);
  border-bottom: var(--dl-border-width) solid var(--dl-border-base);
}

.panel-tune__note {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.panel-tune__badge {
  margin-left: auto;
  padding: 0 var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border-radius: var(--dl-radius-pill);
}

/* 面板尺度的样张:抬升底色 + 发丝描边,圆角取候选值。 */
.panel-tune__sample {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  min-height: 9rem;
  padding: var(--dl-space-3);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--panel-radius-candidate);
}

.panel-tune__sample-label {
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

/* 嵌套元件:内圆角 = 外圆角 −(间距 + 描边);不足时钳到 0,不做负圆角。 */
.panel-tune__nested {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
  background: var(--dl-bg-sunken);
  border-radius: max(
    0px,
    calc(var(--panel-radius-candidate) - (var(--dl-space-3) + var(--dl-border-width)))
  );
}
</style>
