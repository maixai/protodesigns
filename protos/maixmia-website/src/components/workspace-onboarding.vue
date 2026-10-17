<script setup lang="ts">
// 引导页:根区域既无成员又无子区域时,右侧整块没有任何东西可显示 —— 这里给一张克制起点页。
//
// 与「空位占位」不是一回事:那个是「这块区域只是没有活动成员」(仍有一块区域在那里),
// 这个是「整个右侧什么都没有」,故文案与结构都独立,不复用 emptyTitle / emptyBody。
//
// 形制:**块居中、块内左对齐**(沿用本仓安装区重做的纪律):整块在区域里居中,内部文字与
// 控件一律左对齐。只留标题 / 说明 / 一枚主按钮 —— 不再有建议卡,起点页只把用户推向
// 「新建对话」这一个动作,不用插画 / 不用渐变 / 不加发光。
//
// 它不是转录,故**不给** role="log" —— 全页 role="log" 恰为 1 的不变量在引导页状态下退化为 0
// (此时全页没有任何转录视图),判据见 workspace-page 的 liveSessionId。
import { ref } from 'vue'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { viewportRectOf } from '../data/viewport-rect'
import { useI18n } from '../i18n'

defineProps<{
  // 主按钮触发的「项目选择浮层」是否正开着(该 Agent 打开了多个项目、且从这里发起时才可能开)。
  newChatPickerOpen: boolean
  // 零项目先引导打开目录,不显示无法执行的「新建对话」。
  hasProjects: boolean
}>()

const emit = defineEmits<{
  // 主按钮 = 与每块区域 tab 条上的 ＋ 同一个动作(新建一段会话 + 把根区域恢复成一块带 tab 的区域)。
  // 带上按钮在视口里的矩形:多项目时页面据此把项目选择浮层锚到这个触发点上。
  'new-chat': [origin: WindowRect]
}>()

const { t } = useI18n()
const primaryRef = ref<HTMLButtonElement | null>(null)
</script>

<template>
  <section class="onboarding">
    <div class="onboarding__block">
      <h2 class="onboarding__title">{{ t.workspace.onboarding.title }}</h2>
      <p class="onboarding__body">{{ hasProjects ? t.workspace.onboarding.body : t.workspace.newChatNeedProject }}</p>
      <!-- 唯一的主行动:与每块区域 tab 条上的 ＋ 同一个动作。大号档(44px 触达)因为它落在
           触屏可及的区域里,且是这个状态的唯一主按钮。与 ＋ 一样带 disclosure 属性 ——
           多项目时它也是项目选择浮层的锚点;data-project-picker-trigger 让浮层认出「这是触发钮」,
           于是开着时再点它是**关闭**(toggle),而不是「先判成点外面、又被 click 打开」的空操作
           (开关由页面统一裁决 —— 本按钮与 ＋ 走同一个 emit,无需自己持有状态)。 -->
      <button
        ref="primaryRef"
        type="button"
        class="dl-btn dl-btn--primary dl-btn--lg onboarding__primary"
        :aria-haspopup="hasProjects ? 'listbox' : 'dialog'"
        :aria-expanded="hasProjects ? newChatPickerOpen : undefined"
        data-project-picker-trigger
        @click="emit('new-chat', viewportRectOf(primaryRef))"
      >
        <span aria-hidden="true">＋</span>{{ hasProjects ? t.workspace.newChat : t.workspace.openProject }}
      </button>
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

/* 块内左对齐:标题 / 说明 / 主按钮共用一条左缘。宽度按中文行宽 token 给(em,不用 ch)。 */
.onboarding__block {
  display: grid;
  justify-items: start;
  gap: var(--dl-space-4);
  inline-size: 100%;
  max-inline-size: calc(var(--dl-measure) + var(--dl-space-12));
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

/* 主按钮:唯一的主行动,与说明拉开一档纵向间距。 */
.onboarding__primary {
  margin-block-start: var(--dl-space-2);
}
</style>
