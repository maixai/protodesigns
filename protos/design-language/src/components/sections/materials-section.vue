<script setup lang="ts">
// 材质样张:同一组元素(工具栏 + 内容卡片 + 按钮行)按当前材质渲染一遍。
// 三组并排时元素结构完全相同,差异只来自材质令牌。
//
// 刻意把两层的处理分开:工具栏走面板材质(玻璃组里就是玻璃),
// 内容卡片始终走实色表面 —— 这就是 Liquid Glass 那条"玻璃只用于导航与控件,
// 不用于内容"的原则落到 token 上的样子,也是玻璃效果不至于牺牲可读性的边界。
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">材质样张</h2>
    <p class="dl-section__note">
      工具栏(控件层)与内容卡片(内容层)故意用了不同处理:前者随材质变化,后者永远实色。
    </p>

    <div class="material">
      <!-- 控件层:随材质变化 -->
      <div class="material__toolbar">
        <span class="material__brand">工作台</span>
        <span class="material__chip">已同步</span>
      </div>

      <!-- 内容层:始终实色 -->
      <article class="material__card">
        <span class="material__kicker">内容层 · 始终实色</span>
        <h3 class="material__title">样例卡片</h3>
        <p class="material__body">
          正文落在实色表面上,不随材质变化而牺牲对比度 —— 这是玻璃效果的适用边界。
        </p>
        <div class="material__actions">
          <button type="button" class="material__btn material__btn--primary">主要操作</button>
          <button type="button" class="material__btn">次要操作</button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.material {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  /* 给玻璃留出可折射的内容:铺一层极淡的色斑,深浅两套都成立 */
  padding: var(--dl-space-3);
  border-radius: var(--dl-panel-radius);
  background:
    radial-gradient(50% 60% at 20% 0%, var(--dl-accent-subtle), transparent 70%),
    radial-gradient(40% 50% at 90% 100%, var(--dl-highlight-subtle), transparent 70%);
}

/* 控件层:面板材质 */
.material__toolbar {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  padding: var(--dl-space-2) var(--dl-space-3);
  background: var(--dl-panel-bg);
  backdrop-filter: var(--dl-panel-blur);
  -webkit-backdrop-filter: var(--dl-panel-blur);
  border: var(--dl-border-width) solid var(--dl-panel-border);
  border-radius: var(--dl-panel-radius);
  box-shadow: var(--dl-panel-inner), var(--dl-panel-shadow);
}

.material__brand {
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.material__chip {
  margin-left: auto;
  padding: 0 var(--dl-space-2);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border-radius: var(--dl-radius-sm);
}

/* 内容层:实色,不参与材质变化 */
.material__card {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  padding: var(--dl-space-3);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.material__kicker {
  font-size: var(--dl-font-size-xs);
  letter-spacing: var(--dl-tracking-label);
  color: var(--dl-text-tertiary);
}

.material__title {
  margin: 0;
  font-size: var(--dl-font-size-lg);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.material__body {
  margin: 0;
  max-width: var(--dl-measure);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.material__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-2);
  margin-top: var(--dl-space-1);
}

.material__btn {
  min-height: var(--dl-control-height);
  padding: 0 var(--dl-space-4);
  font-family: inherit;
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-medium);
  color: var(--dl-text-primary);
  background: var(--dl-bg-sunken);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  cursor: pointer;
  transition: transform var(--dl-duration-base) var(--dl-ease-standard);
}

.material__btn--primary {
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border-color: transparent;
}

/* 弹性缓动在按下时最容易被感知:液态组会回弹,其余两组是线性位移 */
.material__btn:active {
  transform: scale(0.96);
}

.material__btn:focus-visible {
  outline: var(--dl-focus-width) solid var(--dl-focus-ring);
  outline-offset: var(--dl-focus-offset);
}
</style>
