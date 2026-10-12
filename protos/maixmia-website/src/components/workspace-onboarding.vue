<script setup lang="ts">
// 引导页:根区域既无成员又无子区域时,右侧整块没有任何东西可显示 —— 这里给一张克制起点页。
//
// 与「空位占位」不是一回事:那个是「这块区域只是没有活动成员」(仍有一块区域在那里),
// 这个是「整个右侧什么都没有」,故文案与结构都独立,不复用 emptyTitle / emptyBody。
//
// 形制:**块居中、块内左对齐**(沿用本仓安装区重做的纪律):整块在区域里居中,内部文字与
// 控件一律左对齐。科技感由发丝描边 + 等宽技术记号承担,不用插画 / 不用渐变 / 不加发光。
//
// 它不是转录,故**不给** role="log" —— 全页 role="log" 恰为 1 的不变量在引导页状态下退化为 0
// (此时全页没有任何转录视图),判据见 workspace-page 的 liveSessionId。
import { useI18n } from '../i18n'

const emit = defineEmits<{
  // 主按钮 = 与每块区域 tab 条上的 ＋ 同一个动作(新建一段会话 + 把根区域恢复成一块带 tab 的区域)。
  'new-chat': []
  // 建议卡:建一段新会话并把该文案填进它的草稿(页面已有 startFromSuggestion 可复用)。
  'use-suggestion': [text: string]
}>()

const { t } = useI18n()
</script>

<template>
  <section class="onboarding">
    <div class="onboarding__block">
      <!-- 等宽技术记号:本设计语言的科技感来自等宽字体承担的技术信息,不是装饰图形。 -->
      <p class="onboarding__mark" aria-hidden="true">{{ t.workspace.onboarding.mark }}</p>
      <h2 class="onboarding__title">{{ t.workspace.onboarding.title }}</h2>
      <p class="onboarding__body">{{ t.workspace.onboarding.body }}</p>
      <!-- 唯一的主行动:与每块区域 tab 条上的 ＋ 同一个动作。大号档(44px 触达)因为它落在
           触屏可及的区域里,且是这个状态的唯一主按钮。 -->
      <button type="button" class="dl-btn dl-btn--primary dl-btn--lg onboarding__primary" @click="emit('new-chat')">
        <span aria-hidden="true">＋</span>{{ t.workspace.newChat }}
      </button>
      <!-- 建议卡是**次级入口**:形制上明显弱于主按钮(描边卡、非填充),层级一目了然。 -->
      <ul class="onboarding__suggestions">
        <li v-for="(suggestion, key) in t.workspace.suggestions" :key="key">
          <button type="button" class="onboarding__card" @click="emit('use-suggestion', suggestion.body)">
            <strong>{{ suggestion.title }}</strong>
            <span>{{ suggestion.body }}</span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
/* 整块在区域里居中:纵向可滚(矮视口下不裁切内容)。高度由容器给(grid 拉伸 / 外层 flex:1),
   这里不写 block-size —— 写了会在外层 flex 布局下被解析成 100% 而撑出容器。 */
.onboarding {
  display: grid;
  place-content: center;
  min-height: 0;
  padding: var(--dl-space-8) var(--dl-space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  background: var(--dl-bg-elevated);
}

/* 块内左对齐:标题 / 说明 / 主按钮 / 建议卡共用一条左缘。宽度按中文行宽 token 给(em,不用 ch)。 */
.onboarding__block {
  display: grid;
  justify-items: start;
  gap: var(--dl-space-4);
  inline-size: 100%;
  max-inline-size: calc(var(--dl-measure) + var(--dl-space-12));
}

.onboarding__mark {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  letter-spacing: var(--dl-tracking-caps);
  color: var(--dl-text-tertiary);
}

.onboarding__title {
  font-size: var(--dl-font-size-2xl);
  line-height: var(--dl-line-tight);
  font-weight: 600;
  color: var(--dl-text-primary);
}

.onboarding__body {
  font-size: var(--dl-font-size-md);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

/* 主按钮:唯一的主行动,与其它控件拉开一档纵向间距。 */
.onboarding__primary {
  margin-block-start: var(--dl-space-2);
}

/* 建议卡组:主按钮之下,次级入口。 */
.onboarding__suggestions {
  display: grid;
  gap: var(--dl-space-3);
  inline-size: 100%;
  margin-block-start: var(--dl-space-2);
}

.onboarding__card {
  display: grid;
  gap: var(--dl-space-1);
  inline-size: 100%;
  text-align: left;
  padding: var(--dl-space-4);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background: var(--dl-bg-base);
  min-height: var(--dl-target-size);
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard), border-color var(--dl-duration-fast) var(--dl-ease-standard), transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.onboarding__card strong {
  font-size: var(--dl-font-size-md);
  font-weight: 500;
  color: var(--dl-text-primary);
}

.onboarding__card > span {
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  color: var(--dl-text-secondary);
}

.onboarding__card:hover {
  background: var(--dl-bg-hover);
  border-color: var(--dl-border-strong);
}

.onboarding__card:active {
  transform: translateY(var(--dl-lift-press));
}

@media (prefers-reduced-motion: reduce) {
  .onboarding__card:active {
    transform: none;
  }
}
</style>
