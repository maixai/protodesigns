<script setup lang="ts">
// 文件面板:同一份内容与同一套头部控件,按 `mode` 以**两种形态**呈现 ——
//   · `floating`:**固定定位的悬浮窗体**(不占 tab),可拖动 / 可缩放,几何由窗体能力本体持有;
//   · `docked`:**停靠在区域内容区**里的一块(占一个 tab),填满内容区,几何由容器给出、不可拖动。
// 两种形态之间的转换(双击标题栏 / 头部按钮)由页面接到 windows 的 float/dock 操作上。
//
// 窗体能力(几何 / 拖动 / 缩放 / FLIP / 拆出跟手)住在共用的 use-window-frame 与 window-frame.vue
// 里 —— 本组件只留**自己的标题栏内容、内容本体与呈现业务**(并排 diff 的降级判定)。
//
// 呈现方式(调研依据写在下方各处):
//   · 默认**整个文件 + 变更标记**,而不是只看 diff 片段 —— matklad 那篇被广泛引用的分析认为
//     「在上下文里看改动」优于「只看片段」,GitHub 的 rich diff 同向;
//   · 行号旁用**形状**标记变更(新增 + / 删除 − / 修改 ~),不只靠颜色(WCAG 1.4.1 的官方反例
//     正是「红 / 黄 / 绿圆点表示状态」);
//   · 行内用**词级高亮**而不是整行染色(GitHub 自 2014 起、IntelliJ 的粒度选项都把「词」作为
//     默认粒度:整行染色会把「改了一个词」放大成「整行被改」);
//   · 折叠未变更的片段(IntelliJ 可配置保留几行上下文),长文件里只展开变更周围若干行;
//   · 三种视图:整个文件 / 统一 diff / 并排 diff;**窄于阈值时并排自动降级为统一**
//     (Reviewable 的文档明确写「窗口变窄时并排自动转为统一,反之亦然」);
//   · 换行开关:长行不横向滚动。
//
// 顶部一条分段控件切换**可用档位**,同一份内容在同一栏里就地换形态:
//   · 预览 —— 只服务**存在与文本不同的呈现**的类型:Markdown 按 Markdown 渲染(含 mermaid 图)/
//     HTML 走 sandbox iframe / 图片直接显示。**只读** —— 只读态是「看」的默认,故唯一的编辑
//     入口是「源码」档(点了切过去),不另摆第二枚「编辑」按钮。
//   · 源码 —— CodeMirror 6,可编辑、带语法高亮(语言映射见 data/file-language.ts)。
//   · 变更 —— 既有的「整个文件 / 统一 diff / 并排 diff」三段,原样保留,只是收进这一档之下。
//
// 档位命名(调研结论):业界对这条「呈现」侧的标准词是**预览**而不是「渲染」—— VS Code 的
// Markdown **Preview**、Visual Studio 的 preview window、Markdown Editor v2 的三档 Source /
// Split / Preview、GitHub 的 Preview 页签,一致用「预览」。「渲染」描述的是**过程**,「预览」
// 描述的是**这一档是什么**,故取「预览」。
//
// 档位可用性由契约的 kind 决定(并非一律三档):
//   · markdown / html / csv / json —— 有「与文本不同的呈现」,给 预览 / 源码 / 变更;
//   · image —— 有呈现、但没有可编辑的文本,给 预览(image 无源码档);
//   · text(其余代码 / .conf / .sh …)—— **没有预览档**,只有 源码 / 变更。
//     依据:VS Code 的 Custom Editor API 列举需要替代呈现的场景只有「Markdown 这类语言的
//     WYSIWYG 编辑器」「CSV / JSON / XML 这类数据文件的替代可视化呈现」「着色器 / 3D 模型这类
//     资产的预览」—— 纯文本不在其中。给它们一档只读、无高亮的纯文本,等于同时损失高亮与
//     可编辑性,是**纯亏损**(Warp 的同类需求 issue #11529 也只给 .html 这种「有可运行呈现」
//     的类型做 Rendered / Source / Split);
//   · binary —— 不呈现内容,走「无法预览」空态。
// csv / json 之所以能从 text 里分出来,是因为契约给了它们各自的 kind(见 contracts/main.tsp):
// 它们的那一份结构化呈现(表格 / 折叠树)正是预览档的价值所在,而 text 没有这份价值。
// 默认档按「有预览则预览,否则源码」派生;换文件 / 类型变化后当前档若不可用,回落到默认档。
//
// 形态依据(调研结论):业界成熟词汇是 Obsidian 的 Source / Live Preview / Reading View 三态;
// VS Code 用户在 microsoft/vscode#301686 里明确要求「在**同一个 tab** 里用一个按钮切换阅读与
// 编辑」(原话抱怨 split pane 笨重、预览入口太隐蔽)→ 单栏切换是主流诉求。本原型因此**不做**
// Live Preview / WYSIWYG,只做「源码可编辑 + 预览只读」。
//
// a11y:悬浮态是**非模态**对话框(不写 aria-modal,不圈定焦点),停靠态是内容区里的 `region`;
// 其内容区是文件栏那个 tablist 的 tabpanel(文件栏与转录区**各自**有一个 tablist 与 tabpanel,
// 互不冲突)。待确认文件的「允许 / 拒绝」与转录里的确认卡同源同动作(同一个 ConfirmationRequest、
// 同一个处理函数)。
import { computed, onMounted, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { FileKindId, FileLine } from '../contracts/generated/file-content'
import type { ProjectEntryStateId } from '../contracts/generated/project-entry'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { WindowRect } from '../contracts/generated/workspace-window'
import type { FileDisplayItem, FilePanelState } from '../data/windows'
import { buildDisplayItems } from '../data/windows'
import { enhanceMermaidDiagrams, renderMarkdown } from '../data/file-render'
import { identityClassOf } from '../data/project-identity'
import { useI18n } from '../i18n'
import { useCodeEditor } from '../composables/use-code-editor'
import { useWindowFrame } from '../composables/use-window-frame'
import WindowFrame from './window-frame.vue'
import CsvPreview from './csv-preview.vue'
import JsonPreview from './json-preview.vue'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  state: FilePanelState
  // 草稿由页面按窗体保存，最小化卸载视图不会丢掉编辑内容。
  draft: string | null
  // 该窗体的**复合 id**(file://<项目>/<相对路径>)——用作 DOM 选中钩子(遮挡判定按它选,
  // 保证同名文件跨项目时「选到的一定是那一个窗口」)。
  windowId: string
  path: string
  // 呈现模式:**floating** = 固定定位的浮窗(可拖动 / 可缩放,几何由窗体能力本体持有);
  // **docked** = 停靠在区域内容区里的一块(填满内容区、不可拖动 / 缩放,几何由容器给出)。
  // 同一份内容与同一套头部控件在两种模式下复用,故两种模式的观感一致。
  mode: 'floating' | 'docked'
  // 文件所属项目:打开集跨项目,面板上必须写清出处(路径单独不再唯一)。
  projectName: string
  projectPath: string
  // 文件在该会话里的状态芯片(与文件栏 / 文件树同源同值)—— 由页面派生后传入。
  chipState: ProjectEntryStateId
  // 只有**当前会话的**待确认请求才允许在面板里拍板 —— 跨项目打开时该条不渲染(不提供写动作)。
  canConfirm: boolean
  confirmation: ConfirmationRequest | null
  confirmationOutcome: 'allowed' | 'rejected' | null
  // 这个文件的窗口几何(由页面按 (Agent, 项目) 分域保存)。传 null = 该文件还没被摆过位置,
  // 用默认几何。窗口状态**不属于组件**:切项目 / 切文件再回来要按原样恢复,故几何存在域里。
  initialRect: WindowRect | null
  // 本窗口是否当前聚焦(视觉上加一层强调描边,便于多窗口下认出焦点在哪)。
  isFocused: boolean
  // 级联序号:同时可见的窗口依次小偏移错开,避免完全重叠(窗口管理器的惯例)。
  cascade: number
  // **拆出跟手**(视图状态,由页面在拖拽期间给出):非 null 时窗体用**默认尺寸**、左上角落在
  // 这个点(指针 − 抓取偏移已在页面算好),并在每次变化时直接改写几何(零过渡)。它只在
  // 「从 tab 条上向下拖出」这一次手势里非 null;手势结束(或撤销)即置回 null。
  followPoint?: { x: number; y: number } | null
  // **FLIP 的来源矩形**(屏幕坐标):挂载时先把窗体「退」到它,再过渡回自身落点。
  // 拆出时 = 被拖的 tab 的矩形;吸附停靠时 = 悬浮窗最后所在的矩形。reduced-motion 下整段跳过。
  flipFrom?: WindowRect | null
}>()

const emit = defineEmits<{
  'update:draft': [value: string]
  close: []
  retry: []
  resolve: [allowed: boolean]
  // 几何落定(拖动 / 缩放 / 方向键结束、双击复位)时上报;null = 已回到默认几何。
  'rect-change': [rect: WindowRect | null]
  // 在窗口内按下指针 / 聚焦它 → 页面据此置顶(「点谁谁在上」)。
  focus: []
  // 悬浮 → 停靠(双击标题栏 / 头部按钮)。带**当前几何**:页面据此把吸附过的悬浮窗矩形
  // 当作停靠面板的 FLIP 来源(非拖拽通路传 null = 不做 FLIP)。
  // 拖拽落点**不走这里** —— 拖动期间只报 drag-move / drag-end,落点由页面统一裁决。
  dock: [rect: WindowRect | null]
  // 停靠 → 悬浮(双击标题栏 / 头部按钮)。
  float: []
  // 拖动中的**指针视口坐标**:组件只报事实,顶部条 / 区域边缘 / 区域内部一律由页面裁决
  // (与拖 tab 那套手势共用页面里同一个落点解析器)。
  'drag-move': [pointer: { x: number; y: number }]
  // 拖动松手时的指针视口坐标:页面据此决定「停靠回条上 / 沿边切分 / 并入某区域 / 保持悬浮」。
  'drag-end': [pointer: { x: number; y: number }]
  // 拖动被取消(Esc / 指针被系统打断):页面据此收起任何落点预览。
  'drag-cancel': []
}>()

const { t } = useI18n()

// 并排 diff 的可用宽度下限:窄于此自动降级为统一 diff(Reviewable 的既有行为)。
const SIDE_BY_SIDE_MIN_WIDTH = 640
// 文件窗的尺寸下限:**320×200**(与对话窗不同 —— 对话窗的输入坞需要更高的下限)。
const PANEL_MIN_W = 320
const PANEL_MIN_H = 200

// 「变更」档里的三段展示方式(整个文件 / 统一 diff / 并排 diff)。
type ViewMode = 'file' | 'unified' | 'side'
const viewMode = ref<ViewMode>('file')
// 顶部档位。默认档按 kind 派生(见 defaultPane):有预览则预览,否则源码。
type Pane = 'preview' | 'source' | 'change'
const pane = ref<Pane>('preview')
const isWrap = ref(false)
const expandedFolds = ref<Set<number>>(new Set())
const canSideBySide = ref(true)

const content = computed(() => (props.state.status === 'ready' ? props.state.content : null))
const lines = computed<FileLine[]>(() => content.value?.lines ?? [])
// 图片的来源(仅 kind === image 非空):原型无后端,契约里给的是 data URL。
const contentUrl = computed(() => content.value?.contentUrl ?? '')
// 呈现类别决定「有哪些档可用」。binary 走「无法预览」空态(没有内容可呈现);
// image 只有预览档 —— 图片没有可编辑的文本,故没有源码档,也就没有「编辑」入口;
// text(代码 / .conf / .sh …)只有源码 / 变更 —— 它们没有「与文本不同的呈现」,给一档只读
// 纯文本是纯亏损(依据见文件头);csv / json 与 markdown / html 同组 —— 各自有一份结构化 /
// 可运行的呈现,故三档齐备(见下方预览档的分支)。
const kind = computed<FileKindId | null>(() => content.value?.kind ?? null)
const paneOptions = computed<Pane[]>(() => {
  if (kind.value === null || kind.value === 'binary') return []
  if (kind.value === 'image') return ['preview']
  if (kind.value === 'text') return ['source', 'change']
  return ['preview', 'source', 'change']
})
// 默认档:有预览则预览,否则源码。
const defaultPane = computed<Pane>(() => (paneOptions.value.includes('preview') ? 'preview' : 'source'))

// 编辑作用于**内存里的 source**:刷新即重置,与原型其余部分同一口径。
// 注意它**不重算「变更」档的 diff 标记** —— 那些标记来自 mock 的下发(它表达的是「相对上一次
// 改动」),编辑只是把人这台机器上的当前内容改掉;界面也不得暗示「变更已更新」。
const sourceDraft = ref('')
// 预览态的容器(标记为只读):mermaid 图在 HTML 落到 DOM 之后就地渲染。
const renderHost = ref<HTMLElement | null>(null)
const editorHost = ref<HTMLElement | null>(null)
const renderedHtml = ref('')

// 内容变了(换文件 / 重试)就复位折叠、草稿与视图 —— 这些都属于「这一次看这个文件」。
watch(() => [props.path, props.state] as const, () => {
  expandedFolds.value = new Set()
  sourceDraft.value = props.draft ?? content.value?.source ?? ''
  // 换文件 / 内容落定后回到该类型的默认档(此时才知道 kind;加载中 kind 为 null,先不动)。
  if (kind.value !== null) pane.value = defaultPane.value
  refreshRender()
}, { immediate: true })

// Markdown 渲染 + 清洗(管线与安全模型见 data/file-render.ts);其余类型不产生 HTML。
function refreshRender(): void {
  renderedHtml.value = kind.value === 'markdown' ? renderMarkdown(sourceDraft.value) : ''
}

async function enhanceCurrent(): Promise<void> {
  if (pane.value !== 'preview' || kind.value !== 'markdown') return
  const host = renderHost.value
  if (host === null) return
  await enhanceMermaidDiagrams(host, t.value.workspace.filePanel.diagramFailed)
}

onMounted(() => { void enhanceCurrent() })
// 源码态改过之后回到预览态,预览的必须是**改过之后**的内容(两态共用同一份 source)。
watch([sourceDraft, pane], () => {
  if (pane.value === 'preview') refreshRender()
})
watch(renderedHtml, () => { void enhanceCurrent() }, { flush: 'post' })

// 挂载编辑器:返回值(聚焦 / 取值等句柄)本轮不再需要,故不接;
// 「切档自动聚焦」已按无障碍取舍去掉(焦点不该被意外移动),故这里只做实例化。
useCodeEditor({
  host: editorHost,
  getText: () => sourceDraft.value,
  getLanguage: () => content.value?.language ?? 'text',
  getPath: () => props.path,
  getWrap: () => isWrap.value,
  onChange: (value) => { sourceDraft.value = value; emit('update:draft', value) },
})

// 停靠模式:填满区域内容区,不能拖动 / 缩放(几何由容器给出),标题栏双击 / 头部按钮做「还原悬浮」。
const isDocked = computed(() => props.mode === 'docked')
// 标题栏的悬停提示随模式变化:两种模式下双击的含义不同。
const headerHint = computed(() => (isDocked.value ? t.value.workspace.filePanel.headerHintDocked : t.value.workspace.filePanel.headerHint))
// 模式切换按钮的文案:悬浮时提示「停靠」,停靠时提示「悬浮」。
const placementLabel = computed(() => (isDocked.value ? t.value.workspace.filePanel.float : t.value.workspace.filePanel.dock))

// 档位的图标与文案。图标只在**宽档**用于辅助识别(窄档保留文字,见 style 里的说明),
// 故 aria-label 一律给出完整语义(图标按钮不靠图形传达含义)。预览档沿用「呈现」类图标
// (它本就是屏幕 / 呈现的语义)。
const PANE_ICON: Record<Pane, 'presentation' | 'code' | 'table'> = { preview: 'presentation', source: 'code', change: 'table' }

function paneLabel(option: Pane): string {
  if (option === 'preview') return t.value.workspace.filePanel.panePreview
  if (option === 'source') return t.value.workspace.filePanel.paneSource
  return t.value.workspace.filePanel.paneChange
}

// 悬浮 ↔ 停靠:由标题栏双击与头部按钮共同触发。两条路都是**非拖拽通路**(WCAG 2.5.7:
// 凡靠拖动手势完成的功能都要有非拖动的替代)。停靠时带上当前几何 —— 页面据此做吸附方向的 FLIP。
function togglePlacement(): void {
  if (isDocked.value) emit('float')
  else emit('dock', frame.currentWindowRect())
}

const frame = useWindowFrame({
  placement: () => props.mode,
  minWidth: PANEL_MIN_W,
  minHeight: PANEL_MIN_H,
  cascade: () => props.cascade,
  initialRect: () => props.initialRect,
  followPoint: () => props.followPoint ?? null,
  flipFrom: () => props.flipFrom ?? null,
  bodyId: 'file-panel-body',
  onTogglePlacement: togglePlacement,
  // 文件窗的默认几何要避开输入区上方那条「回到底部」钮(它只在用户上滚时才渲染,不能靠量它)。
  composerJumpReserve: true,
  // 文件不是正文:默认宽度保持 768 + 两侧 gutter,确保首屏就能用并排 diff;
  // 正文 / 输入坞仍跟随 --dl-measure(35em)。
  defaultColumnMax: () => 768,
  // 容器查询的驱动方:窗体自己的宽度决定并排 diff 是否可用。
  onRootWidth: (width) => {
    canSideBySide.value = width >= SIDE_BY_SIDE_MIN_WIDTH
  },
  on: {
    rectChange: (rect) => emit('rect-change', rect),
    dragMove: (point) => emit('drag-move', point),
    dragEnd: (point) => emit('drag-end', point),
    dragCancel: () => emit('drag-cancel'),
  },
})

// 展示项:每行,或一段被折叠的未变更行。
const items = computed<FileDisplayItem[]>(() => buildDisplayItems(lines.value, expandedFolds.value))

// 有效视图:并排不可用(面板太窄)时降级为统一 diff;用户的选择本身不变。
const effectiveView = computed<ViewMode>(() => (viewMode.value === 'side' && !canSideBySide.value ? 'unified' : viewMode.value))

const chipLabel = computed<string | null>(() => {
  if (props.chipState === 'none') return null
  return t.value.workspace.entryStates[props.chipState]
})

// 待确认:文件是由当前会话的确认请求改的(同一个 id)→ 面板内直接给「允许 / 拒绝」。
const pendingRequest = computed<ConfirmationRequest | null>(() => {
  // 跨项目的文件不给写动作:即便契约里带了 confirmationId,这里也不认(见 props.canConfirm)。
  if (!props.canConfirm) return null
  if (content.value === null || props.confirmation === null) return null
  return content.value.confirmationId === props.confirmation.id ? props.confirmation : null
})

// 行号旁的变更标记:形状而非颜色区分(+ / − / ~);缺省为空(未变更)。
const MARKER: Record<FileLine['change'], string> = { added: '+', removed: '−', modified: '~', none: '' }

function markerLabel(change: FileLine['change']): string {
  if (change === 'added') return t.value.workspace.filePanel.added
  if (change === 'removed') return t.value.workspace.filePanel.removed
  if (change === 'modified') return t.value.workspace.filePanel.modified
  return t.value.workspace.filePanel.unchanged
}

// 一段文本按词级高亮区间切成若干段(高亮段与普通段交替)。
interface Segment {
  text: string
  marked: boolean
}

function segments(line: FileLine): Segment[] {
  if (line.spans.length === 0) return [{ text: line.text, marked: false }]
  const sorted = [...line.spans].sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  let cursor = 0
  for (const span of sorted) {
    const start = Math.max(cursor, Math.min(span.start, line.text.length))
    const end = Math.max(start, Math.min(span.end, line.text.length))
    if (start > cursor) out.push({ text: line.text.slice(cursor, start), marked: false })
    if (end > start) out.push({ text: line.text.slice(start, end), marked: true })
    cursor = end
  }
  if (cursor < line.text.length) out.push({ text: line.text.slice(cursor), marked: false })
  return out
}

// 并排 diff 的两侧内容:右 = 改动后(modified / added / none),左 = 改动前(modified / removed / none)。
function sideLeft(line: FileLine): string | null {
  if (line.change === 'added') return null
  if (line.change === 'modified') return line.previous
  return line.text
}

function sideRight(line: FileLine): string | null {
  if (line.change === 'removed') return null
  return line.text
}

// 并排的右列高亮:只有 modified / added 才有意义(spans 描述的是改动后的文本)。
function sideRightSegments(line: FileLine): Segment[] {
  if (line.change === 'removed') return []
  return segments(line)
}

function sideLeftSegments(line: FileLine): Segment[] {
  if (line.change === 'modified') return [{ text: line.previous, marked: false }]
  return segments(line)
}

function expandFold(start: number): void {
  const next = new Set(expandedFolds.value)
  next.add(start)
  expandedFolds.value = next
}

function foldLabel(count: number): string {
  return t.value.workspace.filePanel.fold.replace('{count}', String(count))
}

function unchangedLabel(count: number): string {
  return t.value.workspace.filePanel.unchangedCount.replace('{count}', String(count))
}

const statAdded = computed(() => t.value.workspace.filePanel.addedStat.replace('{count}', String(content.value?.addedCount ?? 0)))
const statRemoved = computed(() => t.value.workspace.filePanel.removedStat.replace('{count}', String(content.value?.removedCount ?? 0)))
</script>

<template>
  <!-- 悬浮 ↔ 停靠共用**同一个壳**:两态的差异只体现在壳给的 dl-window--docked 修饰上
       (几何 / 拖动 / 缩放由壳按形态启停),标题栏内容与内容本体两份形态完全一致。 -->
  <WindowFrame
    class="file-panel"
    :frame="frame"
    :header-label="t.workspace.filePanel.headerLabel"
    :header-title="isDocked ? headerHint : `${headerHint} · ${t.workspace.filePanel.moveHint}`"
    :role="isDocked ? 'region' : 'dialog'"
    :aria-label="t.workspace.filePanel.label"
    :data-status="state.status"
    :data-pane="pane"
    :data-view="effectiveView"
    :data-mode="mode"
    :data-flipped="frame.hasFlipped.value ? 'true' : undefined"
    :data-default-geometry="frame.hasExplicitRect.value ? 'false' : 'true'"
    :data-focused="isFocused ? 'true' : 'false'"
    :data-window-id="windowId"
    :data-file-path="path"
    @pointerdown="emit('focus')"
  >
    <!-- 标题栏:出处(项目›路径)+ 状态芯片 + 变更统计 + 右侧工具钮。
         整块是拖拽手柄(由壳接手势),这里的按钮不算手柄。 -->
    <template #header>
      <div class="file-panel__identity" :class="isDocked ? undefined : identityClassOf(projectPath)">
        <span v-if="!isDocked" class="file-panel__project-dot" aria-hidden="true" />
        <!-- 出处(项目名)+ 路径:都属技术信息,等宽、可截断。 -->
        <span class="file-panel__project">{{ projectName }}</span>
        <span class="file-panel__project-sep" aria-hidden="true">›</span>
        <span class="file-panel__path" :title="`${projectName}/${path}`">{{ path }}</span>
        <span v-if="chipLabel" class="file-panel__chip" :data-state="chipState">{{ chipLabel }}</span>
        <span v-if="content" class="file-panel__stats" :aria-label="`${t.workspace.filePanel.addedStat.replace('{count}', String(content.addedCount))} / ${t.workspace.filePanel.removedStat.replace('{count}', String(content.removedCount))}`">
          <span class="file-panel__stat" data-kind="added">{{ statAdded }}</span>
          <span class="file-panel__stat" data-kind="removed">{{ statRemoved }}</span>
        </span>
      </div>
      <div class="file-panel__tools">
        <!-- 顶部档位:预览 | 源码 | 变更(可用档由 kind 决定,纯文本没有预览档)。
             原生按钮 + aria-pressed(键盘可达、状态可读);窄容器下按既有做法收成图标
             (可访问名由 aria-label 承担)。 -->
        <div class="file-panel__modes" role="group" :aria-label="t.workspace.filePanel.paneLabel">
          <button
            v-for="option in paneOptions"
            :key="option"
            type="button"
            class="file-panel__mode"
            :data-pane="option"
            :aria-pressed="pane === option"
            :aria-label="option === 'source' ? t.workspace.filePanel.sourceHint : paneLabel(option)"
            :title="option === 'source' ? t.workspace.filePanel.sourceHint : paneLabel(option)"
            @click="pane = option"
          >
            <DliIcon class="file-panel__mode-icon" :name="PANE_ICON[option]" size="sm" /><span class="file-panel__mode-label">{{ paneLabel(option) }}</span>
          </button>
        </div>
        <!-- 换行开关:宽档是**文字钮**,最窄档(≤559px)收成图标钮 —— 见下方 @container 的说明。
             预览档不渲染它:那一档没有「长行」这回事(呈现出来的 HTML / 图片自己排版),摆了也不
             产生任何效果,那就是一枚死控件。源码与变更两档共用它(编辑器走 lineWrapping)。
             收窄后可见文字消失,**可访问名由 aria-label 承担**(与可见文字同一条词条),
             aria-pressed 的状态语义不变,仍是原生 button(键盘可达)。 -->
        <button
          v-if="pane !== 'preview'"
          type="button"
          class="file-panel__toggle"
          :aria-pressed="isWrap"
          :aria-label="t.workspace.filePanel.wrap"
          :title="t.workspace.filePanel.wrap"
          @click="isWrap = !isWrap"
        ><DliIcon class="file-panel__toggle-icon" name="wrap" size="sm" /><span class="file-panel__toggle-label">{{ t.workspace.filePanel.wrap }}</span></button>
        <!-- 复位几何的**原生按钮**:从前这个能力只挂在「双击标题栏」上,而双击现已改指
             停靠 / 悬浮,故它必须另有一个入口;做成按钮同时补上了键盘可达(旧手势鼠标专属)。
             停靠态不渲染 —— 那时的几何由区域内容区给出,没有「默认几何」可复位。 -->
        <button v-if="!isDocked" type="button" class="file-panel__reset" :aria-label="t.workspace.filePanel.resetGeometry" :title="t.workspace.filePanel.resetGeometry" @click="frame.resetGeometry()"><DliIcon name="sync" size="sm" /></button>
        <!-- 悬浮 ↔ 停靠的**原生按钮**:标题栏双击是鼠标通路,这里给键盘 / 单指针一条等价通路
             (WCAG 2.5.7:凡靠拖动手势完成的功能都要有非拖动替代);图标纯装饰,语义由 aria-label 承担。 -->
        <button type="button" class="file-panel__placement" :aria-label="placementLabel" :title="placementLabel" @click="togglePlacement()"><DliIcon :name="isDocked ? 'window' : 'grid'" size="sm" /></button>
        <button type="button" class="file-panel__close" :aria-label="isDocked ? t.workspace.filePanel.closeTab : t.workspace.filePanel.close" @click="emit('close')"><span aria-hidden="true">✕</span></button>
      </div>
    </template>

    <!-- 待确认:面板内直接拍板,与转录里的确认卡作用于同一个确认请求(同一个处理函数)。 -->
    <div v-if="pendingRequest" class="file-panel__confirm" role="group" :aria-label="t.workspace.confirmation.title">
      <p class="file-panel__confirm-summary">{{ pendingRequest.summary }}</p>
      <template v-if="confirmationOutcome === null">
        <div class="file-panel__confirm-actions">
          <button type="button" class="dl-btn dl-btn--primary" @click="emit('resolve', true)">{{ t.workspace.confirmation.allow }}</button>
          <button type="button" class="dl-btn dl-btn--ghost" @click="emit('resolve', false)">{{ t.workspace.confirmation.reject }}</button>
        </div>
      </template>
      <p v-else class="file-panel__confirm-record" :data-outcome="confirmationOutcome">
        <span class="file-panel__confirm-mark" aria-hidden="true">{{ confirmationOutcome === 'allowed' ? '✓' : '✕' }}</span>
        <span>{{ confirmationOutcome === 'allowed' ? t.workspace.confirmation.allowed : t.workspace.confirmation.rejected }}</span>
      </p>
    </div>

    <!-- 内容区 = 文件栏那个 tablist 的 tabpanel。 -->
    <div id="file-panel-body" class="file-panel__body" role="tabpanel" :aria-labelledby="`file-tab-${path}`" :class="{ 'is-wrap': isWrap }">
      <div v-if="state.status === 'loading'" class="file-panel__state" :aria-label="t.workspace.filePanel.loading" aria-busy="true">
        <NSkeleton text :repeat="2" :animated="false" />
        <NSkeleton text :repeat="8" :animated="false" />
      </div>
      <div v-else-if="state.status === 'error'" class="file-panel__state">
        <h2>{{ t.workspace.filePanel.errorTitle }}</h2>
        <p>{{ t.workspace.filePanel.errorBody }}</p>
        <button type="button" class="workspace-button" @click="emit('retry')">{{ t.workspace.filePanel.retry }}</button>
      </div>
      <div v-else-if="state.status === 'empty'" class="file-panel__state">
        <h2>{{ t.workspace.filePanel.emptyTitle }}</h2>
        <p>{{ t.workspace.filePanel.emptyBody }}</p>
      </div>
      <!-- ---- 预览档:只服务有「与文本不同的呈现」的类型,各按自己的方式呈现,**一律只读** ---- -->
      <template v-else-if="pane === 'preview'">
        <!-- 本档**只读**,且**没有**第二枚「编辑」入口 —— 唯一的编辑入口就是标题栏档位里的
             「源码」档(带 code 图标 + 「源码 · 可编辑」提示)。依据:PatternFly 的 inline-edit
             指南把铅笔开关**内联放在 header 里**;Linear / Notion / Attio 的对照也被总结成
             「**两个并列的编辑按钮本身就是异味**,一流产品收敛成一个清晰模型」;而在只读的阅读
             视图里摆一枚实心主按钮,会把「读」这个首要动作的视觉主次整个压翻。
             另:markdown / html / image 三档**不吸顶任何工具行** —— 正文之上不再压一条色带。
             唯一的例外是 JSON:它自带「树 | 表格」与「全部展开 | 全部折叠」这几个**同档内的视图
             开关**(等同变更档那三段),故复用那条面板式工具条(.file-panel__subtools)。
             本档**只**出现 markdown / html / image / csv / json 五种 kind(text 没有预览档)。 -->
        <!-- 图片:contain(不拉伸、不裁切),src 来自契约的 contentUrl。 -->
        <div v-if="kind === 'image'" class="file-render file-render--image">
          <img class="file-render__image" :src="contentUrl" :alt="t.workspace.filePanel.imageAlt.replace('{name}', path)" />
        </div>
        <!-- Markdown:markdown-it 渲染 + DOMPurify 清洗**之后**才注入;mermaid 图在注入后就地渲染
             (动态加载 + 严格安全级 + 二次清洗,见 data/file-render.ts 的安全模型)。 -->
        <div v-else-if="kind === 'markdown'" ref="renderHost" class="file-render file-render--markdown" v-html="renderedHtml" />
        <!-- HTML:内容放进 **sandbox 的 iframe** —— script 可以跑(演示页本来就要跑),但**不给**
             allow-same-origin,源因此是不透明的:iframe 里的脚本读不到本页的 localStorage、也调不了
             同源已鉴权的接口(n8n CVE-2026-65597 正是缺了这一条)。 -->
        <iframe v-else-if="kind === 'html'" class="file-render file-render__frame" :srcdoc="sourceDraft" sandbox="allow-scripts" :title="t.workspace.filePanel.htmlPreview" />
        <!-- CSV:只读的数据表格(首行即表头 + 行号;文本列左对齐 / 数字列右对齐;超限只显前 N 行)。
             值走文本节点渲染,不经 DOMPurify 那条管线 —— 见 csv-preview.vue 的分工说明。 -->
        <CsvPreview v-else-if="kind === 'csv'" :source="sourceDraft" />
        <!-- JSON:只读的折叠树 + (根为对象数组时的)表格。工具条由本组件以插槽给出 ——
             它的类名属于本文件的 scoped 样式,写在插槽里才拿得到变更档那一套面板式工具条的视觉。 -->
        <JsonPreview v-else-if="kind === 'json'" :source="sourceDraft">
          <template #toolbar="{ view, canExpand, canTable, setView, expandAll, collapseAll }">
            <!-- 整条工具行只在**真的有工具可用**时渲染:解析失败时既没有树也没有表,
                 摆一排点了没反应的死控件是明确的假交互。 -->
            <div v-if="canExpand" class="file-panel__subtools">
              <!-- 「树 | 表格」只在数据确实是对象数组时出现(否则不渲那一枚按钮,不摆死控件)。 -->
              <div v-if="canTable" class="file-panel__views" role="group" :aria-label="t.workspace.filePanel.jsonViewLabel">
                <button type="button" class="file-panel__view" :aria-pressed="view === 'tree'" :aria-label="t.workspace.filePanel.jsonViewTree" :title="t.workspace.filePanel.jsonViewTree" @click="setView('tree')">
                  <DliIcon class="file-panel__view-icon" name="database" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.jsonViewTree }}</span>
                </button>
                <button type="button" class="file-panel__view" :aria-pressed="view === 'table'" :aria-label="t.workspace.filePanel.jsonViewTable" :title="t.workspace.filePanel.jsonViewTable" @click="setView('table')">
                  <DliIcon class="file-panel__view-icon" name="table" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.jsonViewTable }}</span>
                </button>
              </div>
              <!-- 展开控制只在树视图里出现 —— 表格视图下它对视图没有任何作用(死控件)。 -->
              <div v-if="view === 'tree'" class="file-panel__views" role="group" :aria-label="t.workspace.filePanel.jsonExpandLabel">
                <button type="button" class="file-panel__view" :aria-label="t.workspace.filePanel.jsonExpandAll" :title="t.workspace.filePanel.jsonExpandAll" @click="expandAll()">
                  <DliIcon class="file-panel__view-icon" name="arrowDown" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.jsonExpandAll }}</span>
                </button>
                <button type="button" class="file-panel__view" :aria-label="t.workspace.filePanel.jsonCollapseAll" :title="t.workspace.filePanel.jsonCollapseAll" @click="collapseAll()">
                  <DliIcon class="file-panel__view-icon" name="chevronRight" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.jsonCollapseAll }}</span>
                </button>
              </div>
            </div>
          </template>
        </JsonPreview>
      </template>
      <!-- ---- 源码档:CodeMirror 6,可编辑、带语法高亮(语言映射见 data/file-language.ts) ---- -->
      <div v-else-if="pane === 'source'" ref="editorHost" class="file-panel__editor" />
      <!-- ---- 变更档:既有的「整个文件 / 统一 diff / 并排 diff」三段原样保留,收在这一档之下 ---- -->
      <template v-else>
        <div class="file-panel__subtools">
          <div class="file-panel__views" role="group" :aria-label="t.workspace.filePanel.viewLabel">
            <button type="button" class="file-panel__view" :aria-pressed="viewMode === 'file'" :aria-label="t.workspace.filePanel.viewFile" :title="t.workspace.filePanel.viewFile" @click="viewMode = 'file'">
              <DliIcon class="file-panel__view-icon" name="fileText" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.viewFile }}</span>
            </button>
            <button type="button" class="file-panel__view" :aria-pressed="viewMode === 'unified'" :aria-label="t.workspace.filePanel.viewUnified" :title="t.workspace.filePanel.viewUnified" @click="viewMode = 'unified'">
              <DliIcon class="file-panel__view-icon" name="code" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.viewUnified }}</span>
            </button>
            <button
              type="button"
              class="file-panel__view"
              :aria-pressed="viewMode === 'side'"
              :aria-label="t.workspace.filePanel.viewSide"
              :disabled="!canSideBySide"
              :title="canSideBySide ? t.workspace.filePanel.viewSide : t.workspace.filePanel.sideUnavailable"
              @click="viewMode = 'side'"
            >
              <DliIcon class="file-panel__view-icon" name="table" size="sm" /><span class="file-panel__view-label">{{ t.workspace.filePanel.viewSide }}</span>
            </button>
          </div>
        </div>
      <!-- ---- 整个文件 / 统一 diff:一列,行号 + 变更标记 + (词级高亮的)正文 ---- -->
      <div v-if="effectiveView !== 'side'" class="file-lines">
        <template v-for="(item, index) in items" :key="index">
          <!-- 折叠段:整个文件视图下是可展开的按钮;统一 diff 下退成静态分隔(不可交互,故是 div)。 -->
          <button v-if="item.kind === 'fold' && effectiveView === 'file'" type="button" class="file-line__fold" @click="expandFold(item.start)">
            <span class="file-line__fold-mark" aria-hidden="true">⋯</span>
            <span>{{ foldLabel(item.count) }}</span>
          </button>
          <div v-else-if="item.kind === 'fold'" class="file-line__fold" data-view="unified" aria-hidden="true">
            <span class="file-line__fold-mark">⋯</span>
            <span>{{ unchangedLabel(item.count) }}</span>
          </div>
          <div v-else class="file-line" :data-change="item.line.change">
            <span class="file-line__marker" :data-change="item.line.change" :title="markerLabel(item.line.change)" aria-hidden="true">{{ MARKER[item.line.change] }}</span>
            <span class="file-line__number" aria-hidden="true">{{ item.line.number }}</span>
            <span class="file-line__text"><template v-for="(segment, part) in segments(item.line)" :key="part"><mark v-if="segment.marked" class="file-line__hl">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></span>
          </div>
        </template>
      </div>
      <!-- ---- 并排 diff:左 = 改动前,右 = 改动后 ---- -->
      <div v-else class="file-side">
        <div class="file-side__head" aria-hidden="true">
          <span>{{ t.workspace.filePanel.oldLabel }}</span>
          <span>{{ t.workspace.filePanel.newLabel }}</span>
        </div>
        <template v-for="(item, index) in items" :key="index">
          <button v-if="item.kind === 'fold'" type="button" class="file-line__fold file-side__fold" @click="expandFold(item.start)">
            <span class="file-line__fold-mark" aria-hidden="true">⋯</span>
            <span>{{ foldLabel(item.count) }}</span>
          </button>
          <!-- 未变更行整行贯通两列(并排 diff 的惯例)。 -->
          <div v-else-if="item.line.change === 'none'" class="file-side__row file-side__row--full">
            <span class="file-side__cell">{{ item.line.text }}</span>
          </div>
          <div v-else class="file-side__row">
            <span class="file-side__cell" :data-side="item.line.change === 'removed' ? 'removed' : 'plain'">
              <template v-if="sideLeft(item.line) !== null"><template v-for="(segment, part) in sideLeftSegments(item.line)" :key="part"><mark v-if="segment.marked" class="file-line__hl">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></template>
            </span>
            <span class="file-side__cell" :data-side="item.line.change === 'added' ? 'added' : 'plain'">
              <template v-if="sideRight(item.line) !== null"><template v-for="(segment, part) in sideRightSegments(item.line)" :key="part"><mark v-if="segment.marked" class="file-line__hl">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template></template></template>
            </span>
          </div>
        </template>
      </div>
      </template>
    </div>
  </WindowFrame>
</template>

<style scoped>
/* 悬浮窗体的定位 / 层序 / 容器查询 / 缩放手柄全在共用壳里(见 window-frame.vue)。
   这里只剩**文件面板自己**的头部内容与内容本体的样式。

   标题栏左内边距:文件面板的身份区与消息正文同轴(侧向 gutter),覆盖共用壳的默认值。 */
.file-panel :deep(.dl-window__meta) {
  padding-inline-start: var(--workspace-gutter);
}

.file-panel__identity {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
}

/* 悬浮标题栏与对话归属使用同一组绑定类、角色色与标准色点尺寸。 */
.file-panel__project-dot {
  flex-shrink: 0;
  inline-size: var(--dl-identity-dot-size);
  block-size: var(--dl-identity-dot-size);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-identity);
}

/* 头部出处:项目名(等宽、最小字号、三级文字色)+ 分隔符;路径紧随其后。 */
.file-panel__project {
  flex: none;
  max-inline-size: calc(10 * var(--dl-font-size-xs));
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.file-panel__project-sep {
  flex: none;
  color: var(--dl-text-tertiary);
}

.file-panel__path {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

/* 状态芯片:与文件栏 / 文件树同一套取值。 */
.file-panel__chip {
  flex-shrink: 0;
  padding: 0 var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  color: var(--dl-text-secondary);
}

.file-panel__chip[data-state='created'] {
  color: var(--dl-accent);
}

.file-panel__chip[data-state='modified'] {
  color: var(--dl-warning);
}

.file-panel__chip[data-state='pending'] {
  color: var(--dl-accent);
  border-color: var(--dl-accent);
  background: var(--dl-accent-soft);
}

.file-panel__stats {
  flex-shrink: 0;
  display: inline-flex;
  gap: var(--dl-space-2);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  font-variant-numeric: tabular-nums;
}

.file-panel__stat[data-kind='added'] {
  color: var(--dl-success);
}

.file-panel__stat[data-kind='removed'] {
  color: var(--dl-error);
}

.file-panel__tools {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--dl-space-1);
}

/* 分段控件:一组互斥取值的原生按钮 + aria-pressed(键盘可达、状态可读)。两处共用同一套样式 ——
   标题栏里的**档位**(预览 / 源码 / 变更)与内容区里的**变更三段**(整个文件 / 统一 diff /
   并排 diff)。后者住在内容区、不进标题栏的宽度预算,窄面板下才不会把标题栏控件挤进角手柄命中区。 */
.file-panel__views,
.file-panel__modes {
  display: inline-flex;
  align-items: center;
  gap: var(--dl-space-1);
  padding: var(--dl-space-1);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
}

/* 分段控件的按钮是**横排的密集行内控件**(分段控件),走「密集行内的控件」这一档(24px):
   横向排布下 WCAG 2.5.8 的间距判据天然成立,故这一档不属于「独立控件」。 */
.file-panel__view,
.file-panel__mode {
  min-block-size: var(--dl-space-6);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-panel__toggle {
  min-block-size: var(--dl-space-8);
  padding-inline: var(--dl-space-2);
  border-radius: var(--dl-radius-sm);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard);
}

.file-panel__view:hover:not(:disabled),
.file-panel__mode:hover,
.file-panel__toggle:hover {
  background: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.file-panel__view[aria-pressed='true'],
.file-panel__mode[aria-pressed='true'],
.file-panel__toggle[aria-pressed='true'] {
  background: var(--dl-accent-soft);
  color: var(--dl-text-primary);
  font-weight: 500;
}

.file-panel__view:disabled {
  color: var(--dl-text-disabled);
  cursor: not-allowed;
}

.file-panel__view:focus-visible,
.file-panel__mode:focus-visible,
.file-panel__toggle:focus-visible,
.file-panel__reset:focus-visible,
.file-panel__placement:focus-visible,
.file-panel__close:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

/* 关闭钮 / 复位几何钮 / 悬浮↔停靠钮:32px 图标钮(与头部控件同档)。 */
.file-panel__close,
.file-panel__reset,
.file-panel__placement {
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

/* 分段控件在宽面板上带文字、在窄面板上收成图标(容器查询),两种形态都凭
   aria-label / title 保留语义。「自动换行」同一条路:宽档文字钮、最窄档图标钮。 */
.file-panel__view-icon,
.file-panel__mode-icon,
.file-panel__toggle-icon {
  display: none;
  color: inherit;
}

@container (max-width: 559px) {
  .file-panel__chip,
  .file-panel__stats {
    display: none;
  }

  /* 窄面板下也收起「复位几何」:这一档标题栏已经放不下全部控件,再多一枚就会把
     「整个文件」推进左上角缩放手柄的命中区(实测 375 下该钮点不动)。此时窗体本就接近
     满屏,复位几何没有意义 —— 与同档隐去 chip / stats / 视图文字是同一条取舍。 */
  .file-panel__reset {
    display: none;
  }

  /* 标题栏的间距收一档(容器查询:窗体自身宽度,故要穿透到共用壳的标题栏上)。 */
  .file-panel :deep(.dl-window__meta) {
    gap: var(--dl-space-1);
  }

  /* ---- 最窄档把工具行**再收一档**,让每一枚控件都落在内容盒里 ----
     窗宽收到允许的最小档(320)时,标题栏的内容盒只有
       320 − 40(--workspace-gutter,≥1024 档)− 44(NE 角手柄的预留)= 236px,
     而工具行的自然宽约 254px。工具行是 flex-shrink: 0,于是溢出的那 20~30px 正好压进
     右下角 44×44 的角手柄命中区 —— 关闭钮落在窗体本地 288..320、角手柄占 276..320,
     elementFromPoint 返回的就不再是关闭钮,**点了不关**(反模式「假交互」)。
     这里收掉三处内边距并把可见文字换成图标,工具行回到 236px 以内;又因识别区是 flex: 1,
     剩余空白被它吸收,工具行**右对齐到内容盒右缘**(= 320 − 44),于是整行既避开 NE(276..320)
     也避开 NW(0..44)。左上角的 gutter 与那把 44px 预留都**不是**可以挪的东西,故不动。 */
  .file-panel__views,
  .file-panel__modes {
    padding: 0;
  }

  .file-panel__view,
  .file-panel__mode {
    padding-inline: var(--dl-space-1);
  }

  .file-panel__toggle-label {
    display: none;
  }

  .file-panel__toggle-icon {
    display: inline-flex;
  }

  .file-panel__view-label {
    display: none;
  }

  .file-panel__view-icon {
    display: inline-flex;
  }

  /* 档位在这一档**保留可见文字**(预览 / 源码 / 变更各两字):内容区里的变更三段已经收成
     图标,若这里也收成图标,同一面板里就会出现两组互相看不懂的三图标 —— 且两者的字形本就
     有重合(code / table)。文字组在最小窗宽下也放得下(实测 320 时标题栏仍有富余)。 */
}

.file-panel__close:hover,
.file-panel__reset:hover,
.file-panel__placement:hover {
  color: var(--dl-text-primary);
  background: var(--dl-bg-hover);
}

/* 待确认条:强调色左竖线 + 发丝描边,与转录里的确认卡同一族视觉语言。
   横向内边距 = 侧向 gutter(左缘再让出竖线的 4px),内容与消息正文对齐。 */
.file-panel__confirm {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-2);
  padding: var(--dl-space-3) var(--workspace-gutter) var(--dl-space-3) calc(var(--workspace-gutter) - var(--dl-space-1));
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
  border-inline-start: var(--dl-space-1) solid var(--dl-accent);
  background: var(--dl-bg-base);
}

.file-panel__confirm-summary {
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-primary);
}

.file-panel__confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--dl-space-2);
}

.file-panel__confirm-record {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  font-size: var(--dl-font-size-sm);
  color: var(--dl-text-secondary);
}

.file-panel__confirm-mark {
  font-weight: 600;
}

.file-panel__confirm-record[data-outcome='allowed'] .file-panel__confirm-mark {
  color: var(--dl-success);
}

.file-panel__confirm-record[data-outcome='rejected'] .file-panel__confirm-mark {
  color: var(--dl-error);
}

/* 内容区:**始终是一个真正的滚动容器**(overflow: auto),并在**两个轴**上都隔离滚动链 ——
   横向在「换行关闭 / 并排窄降级」之外也可能需要横向滚动,同样不该把滚动传给背后的页面。
   滚动条**不隐藏**:横向可滚动区域必须保留可见的滚动条作为「这里能横向滚」的提示(a11y)。 */
.file-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}

.file-panel__state {
  display: grid;
  gap: var(--dl-space-3);
  padding: var(--dl-space-6) var(--workspace-gutter);
  color: var(--dl-text-secondary);
}

.file-panel__state h2 {
  font-size: var(--dl-font-size-lg);
  line-height: var(--dl-line-body);
  font-weight: 500;
  color: var(--dl-text-primary);
}

.file-panel__state .workspace-button {
  justify-self: start;
}

/* ---- 档内工具行(现只服务「变更」档的三段视图)----
   它是**面板自身的工具条**,不是浮在正文上的盒子:**通栏**、底色与「面」同源、下缘一条发丝线 ——
   层级语言因此与面板其余部分一致(本设计语言的层级以发丝描边为主,不用「卡片套卡片」)。
   它同时吸顶:长行 diff 横向或纵向滚动时控件不跟着跑掉。底色必须**不透明**(与面同源),
   否则正文会从它下面透出来。 */
.file-panel__subtools {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--dl-z-sticky);
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  inline-size: 100%;
  padding: var(--dl-space-2) var(--workspace-gutter);
  background: var(--dl-bg-elevated);
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
}

/* ---- 预览档:各类型按自己的方式呈现(markdown / html / image) ---- */
.file-render {
  color: var(--dl-text-primary);
}

/* 图片:contain —— 完整看得见,不拉伸、不裁切。 */
.file-render--image {
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: 100%;
  padding: var(--dl-space-4) var(--workspace-gutter);
}

.file-render__image {
  max-inline-size: 100%;
  max-block-size: 100%;
  object-fit: contain;
}

/* HTML 预览:沙箱 iframe 撑满内容区,自己内部滚动(源是不透明的,拿不到它的内容高度)。 */
.file-render__frame {
  display: block;
  inline-size: 100%;
  block-size: 100%;
  border: 0;
  background: var(--dl-bg-elevated);
}

/* Markdown:阅读列宽 + 克制的排印。正文行高 1.7、段间距 1.5em、一律左对齐(中文排版硬约束)。 */
.file-render--markdown {
  max-inline-size: calc(var(--dl-measure) + 2 * var(--workspace-gutter));
  padding: var(--dl-space-2) var(--workspace-gutter) var(--dl-space-6);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-body);
  overflow-wrap: break-word;
}

/* 覆盖 UA 的 bold/bolder,嵌套强调也不越过设计语言的字重上限。 */
.file-render--markdown :deep(:is(h1, h2, h3, h4, h5, h6, strong, b, th, dt, caption)) {
  font-weight: 600;
}

.file-render--markdown :deep(h1),
.file-render--markdown :deep(h2),
.file-render--markdown :deep(h3) {
  margin-block: var(--dl-space-6) var(--dl-space-2);
  font-weight: 600;
  line-height: var(--dl-line-tight);
}

.file-render--markdown :deep(h1) {
  font-size: var(--dl-font-size-xl);
}

.file-render--markdown :deep(h2) {
  font-size: var(--dl-font-size-lg);
}

.file-render--markdown :deep(h3) {
  font-size: var(--dl-font-size-md);
}

.file-render--markdown :deep(p) {
  margin-block: 0 var(--dl-para-gap);
}

.file-render--markdown :deep(ul),
.file-render--markdown :deep(ol) {
  margin-block: 0 var(--dl-para-gap);
  padding-inline-start: var(--dl-space-6);
}

.file-render--markdown :deep(li) {
  margin-block-end: var(--dl-space-1);
}

.file-render--markdown :deep(a) {
  color: var(--dl-accent);
}

.file-render--markdown :deep(code) {
  padding: 0 var(--dl-space-1);
  border-radius: var(--dl-radius-sm);
  background: var(--dl-bg-sunken);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
}

.file-render--markdown :deep(pre) {
  margin-block: 0 var(--dl-para-gap);
  padding: var(--dl-space-3);
  border-radius: var(--dl-radius-md);
  background: var(--dl-bg-sunken);
  overflow: auto;
}

.file-render--markdown :deep(pre code) {
  padding: 0;
  background: none;
}

.file-render--markdown :deep(blockquote) {
  margin-block: 0 var(--dl-para-gap);
  padding-inline-start: var(--dl-space-3);
  border-inline-start: var(--dl-space-1) solid var(--dl-border-strong);
  color: var(--dl-text-secondary);
}

.file-render--markdown :deep(table) {
  margin-block: 0 var(--dl-para-gap);
  border-collapse: collapse;
  font-size: var(--dl-font-size-xs);
  font-variant-numeric: tabular-nums;
}

.file-render--markdown :deep(th),
.file-render--markdown :deep(td) {
  padding: var(--dl-space-1) var(--dl-space-3);
  border: var(--dl-border-width) solid var(--dl-border-base);
  text-align: start;
}

.file-render--markdown :deep(hr) {
  margin-block: var(--dl-space-6);
  border: 0;
  border-block-start: var(--dl-border-width) solid var(--dl-border-base);
}

.file-render--markdown :deep(img) {
  max-inline-size: 100%;
}

/* mermaid 图与它的降级:单块渲染失败只把那一块退回成代码块 + 一行说明,面板不白屏。 */
.file-render__diagram {
  display: flex;
  justify-content: center;
  margin-block: var(--dl-space-4);
}

.file-render__diagram svg {
  max-inline-size: 100%;
  block-size: auto;
}

.file-render--markdown :deep(pre.is-mermaid-failed) {
  border-inline-start: var(--dl-space-1) solid var(--dl-warning);
}

.file-render__fallback {
  margin-block: var(--dl-space-2) 0;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

/* ---- 源码档:编辑器撑满内容区(内部自己滚)----
   焦点环画在**容器**上并向内收:面板的圆角裁切会把外扩的环整条剪掉(本仓既有教训)。 */
.file-panel__editor {
  block-size: 100%;
  overflow: hidden;
}

.file-panel__editor:focus-within {
  box-shadow: inset var(--dl-focus-ring);
}

/* 语法高亮的 token 类(类名来自 data/file-language.ts 的 HighlightStyle)。CodeMirror 产出的
   span 不在 Vue 的作用域里,故必须走 :deep 才命中。颜色一律引用语义角色 token,深浅通用。 */
.file-panel__editor :deep(.cm-dl-keyword) {
  color: var(--dl-accent);
}

.file-panel__editor :deep(.cm-dl-string) {
  color: var(--dl-success);
}

.file-panel__editor :deep(.cm-dl-comment) {
  color: var(--dl-text-tertiary);
  font-style: italic;
}

.file-panel__editor :deep(.cm-dl-number) {
  color: var(--dl-highlight);
}

.file-panel__editor :deep(.cm-dl-variable) {
  color: var(--dl-text-primary);
}

.file-panel__editor :deep(.cm-dl-type) {
  color: var(--dl-info);
}

.file-panel__editor :deep(.cm-dl-property) {
  color: var(--dl-warning);
}

.file-panel__editor :deep(.cm-dl-operator) {
  color: var(--dl-text-secondary);
}

.file-panel__editor :deep(.cm-dl-heading) {
  color: var(--dl-text-primary);
  font-weight: 600;
}

.file-panel__editor :deep(.cm-dl-link) {
  color: var(--dl-accent);
}

.file-panel__editor :deep(.cm-dl-strong) {
  font-weight: 600;
}

.file-panel__editor :deep(.cm-dl-emphasis) {
  font-style: italic;
}

/* 行:最小宽度取内容宽(max-content),于是不换行时整块可横向滚动、每行不被压窄。
   横向内边距 = 侧向 gutter —— 代码左缘因此与消息正文左缘对齐(内容仍是阅读列宽)。 */
.file-lines {
  display: flex;
  flex-direction: column;
  min-inline-size: max-content;
  padding-block: var(--dl-space-2);
  padding-inline: var(--workspace-gutter);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
}

.file-line {
  display: flex;
  align-items: flex-start;
  min-block-size: calc(var(--dl-font-size-sm) * var(--dl-line-snug));
}

/* 行号旁的变更标记:形状区分(+ / − / ~),颜色只作加固。 */
.file-line__marker {
  flex: none;
  inline-size: var(--dl-icon-sm);
  text-align: center;
  color: var(--dl-text-tertiary);
  user-select: none;
}

.file-line__marker[data-change='added'] {
  color: var(--dl-success);
}

.file-line__marker[data-change='removed'] {
  color: var(--dl-error);
}

.file-line__marker[data-change='modified'] {
  color: var(--dl-warning);
}

.file-line__number {
  flex: none;
  inline-size: var(--dl-space-8);
  padding-inline-end: var(--dl-space-3);
  text-align: end;
  color: var(--dl-text-tertiary);
  user-select: none;
}

.file-line__text {
  flex: 1;
  white-space: pre;
  padding-inline-end: var(--dl-space-4);
}

/* 换行开关打开:正文按字符换行,横向不再滚动。 */
.file-panel__body.is-wrap .file-lines,
.file-panel__body.is-wrap .file-side {
  min-inline-size: 100%;
}

.file-panel__body.is-wrap .file-line__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.file-panel__body.is-wrap .file-side__cell {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 词级高亮:背景加粗一级的强调浅底 + 一条下划线;不整行染色。 */
.file-line__hl {
  background: var(--dl-accent-soft);
  color: inherit;
  border-radius: var(--dl-radius-sm);
  box-shadow: inset 0 -1px 0 var(--dl-accent);
}

/* 被删除的整行:文字划线,与「新增 / 修改」在灰度下也区分得开。 */
.file-line[data-change='removed'] .file-line__text {
  text-decoration: line-through;
  color: var(--dl-text-secondary);
}

/* 折叠行:一条可点的「展开 N 行未变更的片段」;统一 diff 下退成静态分隔(不可展开)。 */
.file-line__fold {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  inline-size: 100%;
  padding: var(--dl-space-1) var(--dl-space-4);
  color: var(--dl-text-secondary);
  font-size: var(--dl-font-size-xs);
  text-align: start;
}

.file-line__fold[data-view='unified'] {
  cursor: default;
}

.file-line__fold:not([data-view='unified']):hover {
  background: var(--dl-bg-hover);
  color: var(--dl-text-primary);
}

.file-line__fold:focus-visible {
  box-shadow: var(--dl-focus-ring);
}

.file-line__fold-mark {
  color: var(--dl-text-tertiary);
}

/* 并排 diff:两列等宽 + 一条中缝。横向内边距 = 侧向 gutter(与消息正文左缘对齐)。 */
.file-side {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-content: start;
  padding-block: var(--dl-space-2);
  padding-inline: var(--workspace-gutter);
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-sm);
  line-height: var(--dl-line-snug);
}

.file-side__head {
  display: contents;
}

.file-side__head > span {
  padding: var(--dl-space-1) var(--dl-space-4);
  font-family: var(--dl-font-sans);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
}

.file-side__row {
  display: contents;
}

.file-side__row--full > .file-side__cell {
  grid-column: 1 / -1;
}

.file-side__cell {
  min-inline-size: 0;
  padding-inline: var(--dl-space-4);
  white-space: pre;
  border-inline-start: var(--dl-border-width) solid var(--dl-border-base);
}

.file-side__cell[data-side='removed'] {
  background: color-mix(in srgb, var(--dl-error) 12%, transparent);
  text-decoration: line-through;
}

.file-side__cell[data-side='added'] {
  background: color-mix(in srgb, var(--dl-success) 12%, transparent);
}

.file-side__fold {
  grid-column: 1 / -1;
}

@media (prefers-reduced-motion: reduce) {
  .file-panel__view,
  .file-panel__mode,
  .file-panel__toggle {
    transition: none;
  }
}
</style>
