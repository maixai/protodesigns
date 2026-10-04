<script setup lang="ts">
// 深浅并排:右侧用 data-dl-theme='dark' 局部强制深色。
// 它的意义在于证明"组件不感知主题" —— 深色只是把中性 ramp 反转、强调色提亮,
// 角色层与组件代码一行都不用改。
//
// 需要方向 id 才能重建作用域,因此这是少数几个拿到方向信息的区块之一。
defineProps<{ directionId: string }>()
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">深浅主题</h2>
    <p class="dl-section__note">
      两侧内容完全相同,只有主题不同。顶部工具栏可切换全局主题。
    </p>

    <div class="themes">
      <div class="themes__pane dl-scope" :data-dl-dir="directionId">
        <span class="themes__tag">跟随全局</span>
        <div class="card">
          <span class="card__title">样例卡片</span>
          <span class="card__body">正文与次级文字在两种主题下都必须可读。</span>
          <button type="button" class="card__btn">主要操作</button>
        </div>
      </div>

      <div class="themes__pane dl-scope" :data-dl-dir="directionId" data-dl-theme="dark">
        <span class="themes__tag">深色(局部强制)</span>
        <div class="card">
          <span class="card__title">样例卡片</span>
          <span class="card__body">正文与次级文字在两种主题下都必须可读。</span>
          <button type="button" class="card__btn">主要操作</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.themes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--dl-space-2);
}

.themes__pane {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  padding: var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

.themes__tag {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.card {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  padding: var(--dl-space-3);
  background: var(--dl-bg-elevated);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  box-shadow: var(--dl-shadow-md);
}

.card__title {
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-strong);
  color: var(--dl-text-primary);
}

.card__body {
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.card__btn {
  align-self: flex-start;
  margin-top: var(--dl-space-1);
  min-height: var(--dl-control-height);
  padding: 0 var(--dl-space-3);
  font-family: inherit;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border: none;
  border-radius: var(--dl-radius-md);
  cursor: pointer;
}
</style>
