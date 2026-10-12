<script setup lang="ts">
// 对话窗体:**悬浮**形态的对话窗口 —— 把条上的一段对话拆出来的落点。
//
// 它与文件面板共用**同一条窗体机制**(同一个 use-window-frame 能力本体 + window-frame 外观壳,
// 同一套 props / 事件:focus / close / dock / rect-change,同样按窗口 id 由页面统一处理),
// 但视觉外壳更克制:对话没有可切换的视图、没有换行开关,故标题栏只有「标题 + 停靠 + 关闭」。
// 缩放手柄由共用壳给出 —— 于是悬浮的对话窗**和文件窗一样**可拖边缘 / 角调整大小、键盘可调。
//
// 内容本体交给 ChatSessionView(滚动容器 + 转录 + **输入坞**)—— 与停靠态的对话共用同一份,
// 于是「输入坞属于对话窗体」由结构保证:拖出 / 停靠换的只是外壳与几何,内容本体不变。
import { computed } from 'vue'
import type { ChatRuntime } from '../data/chat-runtime'
import type { WindowRect } from '../contracts/generated/workspace-window'
import { useI18n } from '../i18n'
import { useWindowFrame } from '../composables/use-window-frame'
import WindowFrame from './window-frame.vue'
import ChatSessionView from './chat-session-view.vue'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  // 该窗体的会话 id(= 窗体 id,windowIdOf 对 chat 取 sessionId)。
  sessionId: string
  // 会话标题:标题栏显示它,也是拖拽 / 停靠播报里的 {name}。
  title: string
  // 该会话的运行态(草稿 / 转录 / 生成 / 遥测 / 待确认 / 粘底 —— 随会话存活,不随容器)。
  runtime: ChatRuntime
  userName: string
  assistantName: string
  isFocused: boolean
  // 是否承担全页唯一的 live region(见 workspace-page 的 liveSlot 判据)。
  isLive: boolean
  disabled: boolean
  canSend: boolean
  // 该窗体的几何(由页面按 (Agent, 项目) 分域保存);null = 还没被摆过位置,用默认几何。
  initialRect: WindowRect | null
  // 级联序号:同时可见的悬浮窗依次错开,避免完全重叠。
  cascade: number
  // 拆出跟手:非 null 时窗体用默认尺寸、左上角落在该点(每次变化直接改写几何,零过渡)。
  followPoint?: { x: number; y: number } | null
  // FLIP 的来源矩形(屏幕坐标):挂载时先「退」到它,再过渡回自身落点。reduced-motion 下跳过。
  flipFrom?: WindowRect | null
}>()

const emit = defineEmits<{
  close: []
  focus: []
  'rect-change': [rect: WindowRect | null]
  // 停靠回条上(双击标题栏 / 头部按钮 / 头部按钮的键盘通路)。带当前几何作停靠面板的 FLIP 来源。
  // 拖拽落点**不走这里** —— 拖动期间只报 drag-move / drag-end,落点由页面统一裁决。
  dock: [rect: WindowRect | null]
  // 拖动中的**指针视口坐标**:组件只报事实,顶部条 / 区域边缘 / 区域内部一律由页面裁决
  // (与拖 tab 那套手势共用页面里同一个落点解析器)。
  'drag-move': [pointer: { x: number; y: number }]
  // 拖动松手时的指针视口坐标:页面据此决定「停靠回条上 / 沿边切分 / 并入某区域 / 保持悬浮」。
  'drag-end': [pointer: { x: number; y: number }]
  // 拖动被取消(Esc / 指针被系统打断):页面据此收起任何落点预览。
  'drag-cancel': []
  // 透传内容本体的事件(输入坞 / 转录 / 确认卡)。
  send: [text: string]
  stop: []
  regenerate: []
  retry: []
  resolve: [allowed: boolean]
  'use-suggestion': [text: string]
  'update:draft': [value: string]
  'update:pinned': [value: boolean]
}>()

const { t } = useI18n()

// 对话窗的尺寸下限 **320×320**:输入坞搬进窗体之后 200 不够用了 —— 40px 标题栏 + 约 118px 输入坞
// (输入框 62 + 遥测条 40 + 底部内边距 16)之后,转录区只剩 17px,等于看不见对话。320 让转录区在
// 静置草稿下留出约 160px,草稿长到 5 行(输入框自动增高的上限)时仍留约 60px。
// 文件窗的最小高**不随之变化**(它没有输入坞)。
const PANEL_MIN_W = 320
const PANEL_MIN_H = 320

// 双击标题栏 / 头部按钮 = 停靠回条上(非拖拽通路)。对话只有这一个方向 —— 它没有「悬浮」按钮,
// 因为它的悬浮形态总是由「拆出」产生,不存在「从停靠原地浮起」这个动作。
function dockBack(): void {
  emit('dock', frame.currentWindowRect())
}

const frame = useWindowFrame({
  placement: () => 'floating',
  minWidth: PANEL_MIN_W,
  minHeight: PANEL_MIN_H,
  cascade: () => props.cascade,
  initialRect: () => props.initialRect,
  followPoint: () => props.followPoint ?? null,
  flipFrom: () => props.flipFrom ?? null,
  bodyId: 'chat-panel-body',
  onTogglePlacement: dockBack,
  on: {
    rectChange: (rect) => emit('rect-change', rect),
    dragMove: (point) => emit('drag-move', point),
    dragEnd: (point) => emit('drag-end', point),
    dragCancel: () => emit('drag-cancel'),
  },
})

const headerHint = computed(() => t.value.workspace.chatWindow.headerHint)
</script>

<template>
  <WindowFrame
    class="chat-panel"
    :frame="frame"
    :header-label="t.workspace.chatWindow.headerLabel"
    :header-title="headerHint"
    role="dialog"
    :aria-label="t.workspace.chatWindow.label"
    data-mode="floating"
    :data-session-id="sessionId"
    :data-focused="isFocused ? 'true' : 'false'"
    @pointerdown="emit('focus')"
  >
    <!-- 标题栏 = 会话标题 + 工具钮。整块是拖拽手柄(由壳接手势),按钮不算手柄。 -->
    <template #header>
      <span class="chat-panel__title" :title="title">{{ title }}</span>
      <div class="chat-panel__tools">
        <!-- 停靠回条上的**原生按钮**:拖拽之外的非拖拽通路(WCAG 2.5.7)。图标纯装饰,语义由 aria-label 承担。 -->
        <button type="button" class="chat-panel__action" :aria-label="t.workspace.chatWindow.dock" :title="t.workspace.chatWindow.dock" @click="dockBack()"><DliIcon name="grid" size="sm" /></button>
        <button type="button" class="chat-panel__action" :aria-label="t.workspace.chatWindow.close" @click="emit('close')"><span aria-hidden="true">✕</span></button>
      </div>
    </template>

    <!-- 内容本体:滚动容器 + 转录 + 输入坞(与停靠态的对话共用同一份)。id 是缩放手柄
         aria-controls 的目标。 -->
    <div id="chat-panel-body" class="chat-panel__body">
      <ChatSessionView
        :session-id="sessionId"
        :title="title"
        :runtime="runtime"
        :user-name="userName"
        :assistant-name="assistantName"
        :is-live="isLive"
        :disabled="disabled"
        :can-send="canSend"
        @send="emit('send', $event)"
        @stop="emit('stop')"
        @regenerate="emit('regenerate')"
        @retry="emit('retry')"
        @resolve="emit('resolve', $event)"
        @use-suggestion="emit('use-suggestion', $event)"
        @update:draft="emit('update:draft', $event)"
        @update:pinned="emit('update:pinned', $event)"
      />
    </div>
  </WindowFrame>
</template>

<style scoped>
/* 定位 / 层序 / 容器查询 / 「面」/ 标题栏 / 缩放手柄全在共用壳里(见 window-frame.vue)。
   这里只剩**对话窗体自己**的标题栏内容与内容宿主样式。 */

.chat-panel__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

.chat-panel__tools {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
}

.chat-panel__action {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--workspace-nav-control-size);
  block-size: var(--workspace-nav-control-size);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-tertiary);
  font-size: var(--dl-font-size-xs);
}

.chat-panel__action:hover {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

.chat-panel__action:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 内容宿主:只负责占满剩余高度并让内容本体在其中纵向排布;真正的滚动容器是内容本体里的
   .transcript(阅读位置属于那段对话,不属于窗体)。 */
.chat-panel__body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
}
</style>
