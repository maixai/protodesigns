<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { ChatSession, SessionStatus } from '../contracts/generated/chat-session'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { TranscriptState } from '../contracts/generated/transcript-state'
import type { Project } from '../contracts/generated/project'
import type { ProjectEntry, ProjectEntryStateId } from '../contracts/generated/project-entry'
import type { AgentRuntime } from '../contracts/generated/agent-runtime'
import type { AppRoute } from '../contracts/generated/app-route'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { ConversationSearchHit } from '../contracts/generated/conversation-search-hit'
import type { ProjectTreeRow } from '../data/project-tree'
import type { FileTab, FileWorkspace, FilePanelState, RecentFile } from '../data/open-files'
import { buildProjectTree, directoryKey, flattenProjectTree } from '../data/project-tree'
import { emptyFileWorkspace, fileTabKey, rememberRecent } from '../data/open-files'
import { closeProject as closeProjectRequest, createSession, getAgentRuntime, getConfirmationRequest, getFileContent, getProjectTree, getTranscript, listProjects, listSessions, openProject, saveResponse, searchConversations, sendMessage } from '../api/workspace'
import { useI18n } from '../i18n'
import { session } from '../auth/session'
import { currentRoute, navigateTo } from '../router'
import AgentSelector from '../components/agent-selector.vue'
import ConfirmationCard from '../components/confirmation-card.vue'
import ConversationSwitcher from '../components/conversation-switcher.vue'
import DliIcon from '../components/dl-icon.vue'
import FileBar from '../components/file-bar.vue'
import FilePanel from '../components/file-panel.vue'
import ProjectMenu from '../components/project-menu.vue'
import ProjectPickerDialog from '../components/project-picker-dialog.vue'

const { t, locale } = useI18n()
const sessions = ref<ChatSession[]>([])
const sessionStatus = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')
const transcript = ref<TranscriptState>({ status: 'loading' })
const activeId = ref('weekly')
const draft = ref('')
const generation = ref<'idle' | 'queued' | 'streaming' | 'complete' | 'stopped'>('idle')
const hasSendError = ref(false)
const hasStopRequested = ref(false)
const isSaving = ref(false)
const isLocalePending = ref(false)
const isDrawerOpen = ref(false)
const isNarrow = ref(window.matchMedia('(max-width: 1023px)').matches)
// 对话切换器(会话头右上角的「对话 ▾」下拉)的展开态与「已看过」的会话集合。
// seenSessions 是**视图状态**(不进契约):某会话在 awaiting / completed 期间成为活动会话(含首屏 /
// 演示直达落地)即记入,故「未看过」= 需要你知道,且从未在当前演示期内被打开过。它决定 tab 上
// awaiting / completed 状态图标是否显示,也决定 ▾ 面板「等待你」组的分组。演示态切换会清空它
// (否则同一个演示态看一次后提示就不再出现,演示与断言都不可重复)。
const isSwitcherOpen = ref(false)
const seenSessions = ref<Set<string>>(new Set())
// 「打开集」是**视图状态**(不进契约):关闭只是把会话从 tab 条撤下,会话本身仍在当前项目的会话列表里
// (▾ 面板照旧列出全部,含已关闭的)。用「关闭集」表示 —— 默认空 = 全部打开(不改变现有观感),
// ＋ 新建的会话不在关闭集里 → 自动打开。刷新即重置,与原型约定一致(浏览器同构:关标签页不删网页)。
const closedIds = ref<Set<string>>(new Set())
const isPinned = ref(true)
const previousScroll = ref(0)
// 指针是否按在转录区上(拖动滚动条 / 触摸滚动)。用来把「用户的向上滚动意图」与「程序化改内容
// 导致的浏览器钳制」区分开 —— 只有前者才解除粘底。
let isPointerScrolling = false
const log = ref<HTMLElement | null>(null)
const composer = ref<HTMLTextAreaElement | null>(null)
// 悬浮输入框本体(绝对定位,多行时向上生长)与对话面板(承载 --composer-float-height 的容器)。
const composerForm = ref<HTMLElement | null>(null)
const conversationPanel = ref<HTMLElement | null>(null)
const drawer = ref<HTMLElement | null>(null)
const sidebarTrigger = ref<HTMLButtonElement | null>(null)
const fullResponse = ref<ChatMessage | null>(null)
const renderedResponse = ref<ChatMessage | null>(null)
const interval = ref<ReturnType<typeof setInterval> | undefined>(undefined)
const isAlive = ref(true)
const narrowMedia = window.matchMedia('(max-width: 1023px)')
const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
const BOTTOM_THRESHOLD = 100
const STREAM_INTERVAL = 32
const STREAM_CHUNK = 8
// 新会话的归属项目由侧栏决定;它的 Agent 由项目反推(项目挂在 Agent 上),故页面只持有
// 「当前 Agent」与「当前项目」两个选择,不存在两处对不上的可能。
const DEFAULT_AGENT_ID = 'planning' satisfies ChatSession['agent']
const selectedAgent = ref<ChatSession['agent']>(DEFAULT_AGENT_ID)
const searchQuery = ref('')
const searchHits = ref<ConversationSearchHit[]>([])
const isSearching = ref(false)
const highlightTurnId = ref<string | null>(null)
let searchVersion = 0
// ---- 运行遥测(输入框下方的单行状态条)----
const runtime = ref<AgentRuntime | null>(null)
// 时长由 elapsedSeconds 起算本地走秒(组件内 interval,卸载时清理)。
const elapsed = ref(0)
const telemetryTimer = ref<ReturnType<typeof setInterval> | undefined>(undefined)
// ---- 「等待交互」确认 ----
const confirmation = ref<ConfirmationRequest | null>(null)
const confirmationOutcome = ref<'allowed' | 'rejected' | null>(null)
// 处理确认后 Agent 的去向:允许则继续输出(输出中),拒绝则回到空闲。
const resolutionStatus = ref<'streaming' | 'idle' | null>(null)
// 处理后的后续消息(渲染在确认卡之后)。
const followUp = ref<ChatMessage | null>(null)
// 遥测 / 确认请求的版本号:防止乱序返回的旧结果覆盖新结果(见 loadTelemetry 注释)。
let telemetryVersion = 0
let confirmationVersion = 0
// ---- 项目(侧栏项目区) ----
const projects = ref<Project[]>([])
const projectsStatus = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')
const selectedProjectId = ref('')
// 项目区是**单展开**导航:展开集任意时刻至多一个成员,且那个成员必然就是当前选中项目。
// 由项目行的单控件交互维持(见 toggleProjectRow),不是「展开 / 选中两个独立状态」。
const expandedProjects = ref<Set<string>>(new Set())
const expandedDirs = ref<Set<string>>(new Set())
const projectTrees = ref<Record<string, ProjectEntry[]>>({})
const treeStatus = ref<Record<string, 'loading' | 'ready' | 'error'>>({})
const isPickerOpen = ref(false)
// ---- 文件栏与文件面板(双击文件树里的文件 → 在右侧渲染该文件)----
// 打开集 / 活动文件 / 最近打开都是**视图状态**(不进契约),且是**全局**的:跨项目、跨会话共享,
// 换项目 / 换会话都不清空。每个 tab 自带所属项目(栏里可能混装多个项目的文件),故 tab 上要
// 自己声明出处。刷新即重置。关闭 ≠ 删除 —— 关掉的文件仍在「最近打开」里,可再打开。
const fileWorkspace = ref<FileWorkspace>(emptyFileWorkspace())
const recentFiles = ref<RecentFile[]>([])
const fileContent = ref<FilePanelState>({ status: 'loading' })
// 文件内容加载的版本号:快速换文件时,乱序返回的旧内容不得覆盖新文件。
let fileVersion = 0
// 键盘在文件行上按 Enter = 钉住打开;native button 的 keydown 会再派发一次 click,
// 用这个标记把那次 click(单击语义)吞掉,避免「钉住」被随后的「预览」降级。
let suppressFileRowClick = false
// 工作台重装的版本号:项目 / 会话 / 转录 / 遥测共用一次装载,乱序返回时只认最新一次。
let workspaceVersion = 0
// 转录的接管代次:新建对话 / 发送 / 切会话 / 打开搜索命中都会推进它。
// reloadWorkspace 在**进入时**取一次票、在每次写转录前比对 —— 票旧了就不写。
// 这一层与 workspaceVersion 分工不同:workspaceVersion 挡的是「新的装载覆盖旧的装载」,
// 而用户动作(新建 / 发送)不触发新的装载,只能靠这里把在途的旧装载作废。
let transcriptVersion = 0

// 接管转录:推进代次,使所有在途的旧装载结果作废(见 reloadWorkspace 的转录段注释)。
function takeOverTranscript(): void {
  transcriptVersion += 1
}

const isGenerating = computed(() => generation.value === 'queued' || generation.value === 'streaming')
// 活动会话的**实时**状态覆盖:排队 / 流式 → streaming,完成 → completed;空闲 / 停止时回落
// 取会话自身的 status(null = 不覆盖)。其余会话的状态一律来自 mock 种子。它喂给 tab 的状态图标。
const activeStatus = computed<SessionStatus | null>(() => {
  if (generation.value === 'queued' || generation.value === 'streaming') return 'streaming'
  if (generation.value === 'complete') return 'completed'
  return null
})
const isBusy = computed(() => isGenerating.value || isSaving.value)
const canSend = computed(() => draft.value.trim().length > 0 && !isBusy.value && transcript.value.status !== 'loading' && transcript.value.status !== 'error')
const activeSession = computed(() => sessions.value.find((session) => session.id === activeId.value))
// 助手消息的作者名 = **当前会话所属 Agent** 的名字(规划 / 研究 / 写作助手),不再一律显示产品名
// 「Mia」——会话数据里的 agent 字段此前只喂给侧栏,显示层漏了它。回落值取当前侧栏 Agent
// (空态 / 尚未建立会话时无 activeSession,但那时也不渲染消息)。「Mia」作为产品名仍保留在空态
// 问候语 / 输入提示等文案里,不从全局删除。
const assistantName = computed(() => t.value.workspace.agents[activeSession.value?.agent ?? selectedAgent.value])
// 用户头像首字取自登录账户,与账户菜单里的首字头像同源(保持一致)。
const userName = computed(() => session.value.profile?.name ?? '')
const openProjectPaths = computed(() => projects.value.map((project) => project.path))
// 每个项目的可渲染行(只对有已加载树的项目);目录展开状态变了就重算。
const projectRows = computed<Record<string, ProjectTreeRow[]>>(() => {
  const rows: Record<string, ProjectTreeRow[]> = {}
  for (const project of projects.value) {
    const entries = projectTrees.value[project.id]
    if (entries === undefined) continue
    rows[project.id] = flattenProjectTree(buildProjectTree(entries), project.id, expandedDirs.value)
  }
  return rows
})
// 视觉隐藏的 h1 文字 = 当前会话标题;草稿态(尚未建立会话)回退到「新建对话」。
// Agent 身份已全交给侧栏,头部不再显示 Agent 名,故这里只留标题。
const activeTitle = computed(() => activeSession.value?.title ?? t.value.workspace.newChat)
// 遥测条状态项的状态词。客户端实时生成状态优先(排队→思考中、流式→输出中、停止/完成),
// 空闲时回落取 AgentRuntime.status(waiting 即等待确认);确认处理后的去向由本地覆盖值给出。
// 类型刻意写成 statusWords 的键集合,漏加词条会在编译期报错。
type TelemetryStatus = 'idle' | 'thinking' | 'streaming' | 'waiting' | 'stopped' | 'complete'
const statusKind = computed<TelemetryStatus>(() => {
  if (generation.value === 'queued') return 'thinking'
  if (generation.value === 'streaming') return 'streaming'
  if (generation.value === 'stopped') return 'stopped'
  if (generation.value === 'complete') return 'complete'
  if (resolutionStatus.value !== null) return resolutionStatus.value
  return runtime.value?.status ?? 'idle'
})
const statusWord = computed(() => t.value.workspace.statusWords[statusKind.value])
// 状态圆点:强调色只承担「活动指示」—— 思考中 / 输出中走强调色,等待确认走警告色,其余中性。
const statusLevel = computed<'accent' | 'warning' | 'neutral'>(() => {
  if (statusKind.value === 'thinking' || statusKind.value === 'streaming') return 'accent'
  if (statusKind.value === 'waiting') return 'warning'
  return 'neutral'
})
// 状态项恒为「状态词 · 具体动作」两段式。客户端生成状态(排队 / 输出 / 停止 / 完成)与确认
// 处理后的去向由本地状态给出动作词(见 statusActions),等待 / 空闲等来自 AgentRuntime 的状态
// 取其 statusDetail。两类状态各取各自的动作来源 —— 拿运行时那条旧动作去配客户端状态词会自相
// 矛盾(如「已生成 · 正在汇总本周项目进展」),而沉默或笼统的动作文案正是用户焦虑的来源。
const statusDetail = computed(() => {
  if (generation.value === 'queued') return t.value.workspace.statusActions.queued
  if (generation.value === 'streaming') return t.value.workspace.statusActions.streaming
  if (generation.value === 'stopped') return t.value.workspace.statusActions.stopped
  if (generation.value === 'complete') return t.value.workspace.statusActions.complete
  if (resolutionStatus.value === 'streaming') return t.value.workspace.statusActions.streaming
  if (resolutionStatus.value === 'idle') return t.value.workspace.statusActions.idle
  if (runtime.value === null) return ''
  return statusDetailText(runtime.value.statusDetail)
})
// Context 用量:百分比 + 分数;分级配色 <75% info、75–89% warning、≥90% error(状态色表达结果)。
const contextPercent = computed(() => {
  const current = runtime.value
  if (current === null || current.contextWindowTokens <= 0) return 0
  return Math.round((current.contextUsedTokens / current.contextWindowTokens) * 100)
})
const contextLevel = computed<'info' | 'warning' | 'error'>(() => {
  if (contextPercent.value >= 90) return 'error'
  if (contextPercent.value >= 75) return 'warning'
  return 'info'
})
const contextText = computed(() => {
  const current = runtime.value
  if (current === null) return ''
  return `${contextPercent.value}% (${formatTokenCount(current.contextUsedTokens)}/${formatTokenCount(current.contextWindowTokens)})`
})
// 等待确认期间受影响的条目路径(跨区域联动的对象)。
const affectedPaths = computed<string[]>(() => confirmation.value?.affectedFiles ?? [])

// 状态详情键来自契约(statusDetail: string);词条按当前语言解析,未收录的键原样回退。
// 用 Record<string, string> 承接是为了让契约的裸 string 也能索引词条,避免类型断言。
function statusDetailText(key: string): string {
  const details: Record<string, string> = t.value.workspace.statusDetails
  return details[key] ?? key
}

// token 计数的千位取整:82000 → 82K。
function formatTokenCount(value: number): string {
  return `${Math.round(value / 1000)}K`
}

// 时长格式 m:ss(语言中立、数值等宽),不显示毫秒。
function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// 文件数文案(项目行 title 与「打开项目」对话框共用)。
function formatFileCount(count: number): string {
  return t.value.workspace.fileCount.replace('{count}', String(count))
}

// 条目状态芯片的**唯一派生规则**(文件树、文件栏、文件面板共用这一条):等待确认时受影响的条目
// 显示为 pending;允许后变 modified(已改);拒绝则回到原状态。none(无变化)不渲染芯片 ——
// 芯片只承载「新建 / 已改 / 待确认」。三处共用同一条规则,芯片因此不会互相对不上。
function resolveEntryState(base: ProjectEntryStateId, path: string): ProjectEntryStateId {
  if (!affectedPaths.value.includes(path)) return base
  if (confirmationOutcome.value === 'allowed') return 'modified'
  if (confirmationOutcome.value === 'rejected') return base
  return 'pending'
}

function entryState(row: ProjectTreeRow): ProjectEntryStateId {
  return resolveEntryState(row.state, row.path)
}

function chipLabel(state: ProjectEntryStateId): string | null {
  if (state === 'none') return null
  return t.value.workspace.entryStates[state]
}

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(timestamp))
}

// 消息时间戳:日期 + 时分(UTC,与演示数据同源),随当前语言格式化。时间戳属「技术信息」,
// 样式层走等宽字体 + 等宽数字,故列宽不随数值变化跳动。
function formatMessageTime(timestamp: string): string {
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(timestamp))
}

// 头像首字:按码点取首个字符(「规划助手」→「规」、用户「林一舟」→「林」;英文名取首字母)。
// 与 agent-selector 的首字规则一致。头像纯装饰(aria-hidden),身份由可见的作者名承担。
function avatarInitial(name: string): string {
  return [...name.trim()][0] ?? ''
}

// 目录的展开 / 折叠(目录没有「激活」动作,故名称与 chevron 都只切展开)。
function isDirectoryExpanded(projectId: string, path: string): boolean {
  return expandedDirs.value.has(directoryKey(projectId, path))
}

function toggleDirectory(projectId: string, path: string): void {
  const key = directoryKey(projectId, path)
  const next = new Set(expandedDirs.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedDirs.value = next
}

// ---- 文件栏与文件面板:打开 / 关闭 / 排序 / 取内容 / 跨项目 -

const fileTabs = computed<FileTab[]>(() => fileWorkspace.value.tabs)
const activeFileKey = computed(() => fileWorkspace.value.activeKey)
// 活动文件(= 打开集里那个 tab)—— 面板的内容与出处都由它决定,与「当前项目」**解耦**。
const activeFile = computed<FileTab | null>(() => fileTabs.value.find((item) => fileTabKey(item) === activeFileKey.value) ?? null)
// 面板显示 ⟺ 有活动文件。关闭面板 = 收起活动标记(文件仍在栏上,这正是「关闭 ≠ 删除」)。
const isFilePanelOpen = computed(() => activeFile.value !== null)
// 「允许 / 拒绝」只在文件属于**当前会话的**待确认请求时出现 —— 跨项目不提供写动作。
const canConfirmActiveFile = computed(() => activeFile.value !== null && activeFile.value.projectId === selectedProjectId.value)
// ▾ 菜单的「最近打开」:跨项目;**仍然打开着**的那些不重复列(它们已在栏上)。
const recentForBar = computed<RecentFile[]>(() => recentFiles.value.filter((entry) => !fileTabs.value.some((tab) => tab.projectId === entry.projectId && tab.path === entry.path)))

// 当前项目的展示名:从项目树打开文件时作为该 tab 的出处。
const currentProjectName = computed(() => projects.value.find((project) => project.id === selectedProjectId.value)?.name ?? '')

// tab 的状态芯片:按该 tab **自己的项目**回查条目(别的项目的树没加载时为 none → 不渲染芯片)。
function entryStateOfTab(tab: FileTab): ProjectEntryStateId {
  const entry = projectTrees.value[tab.projectId]?.find((item) => item.path === tab.path)
  const base = entry?.state ?? 'none'
  // 「待确认 → 允许后变已改」这条联动只属于**当前会话**(确认请求挂在当前项目的那条会话上);
  // 其它项目的 tab 拿不到那层的上下文,只报基础状态。
  return tab.projectId === selectedProjectId.value ? resolveEntryState(base, tab.path) : base
}

function setFileWorkspace(next: FileWorkspace): void {
  fileWorkspace.value = next
}

// 取一份文件内容。版本号挡住乱序返回:快速换文件时,旧文件的响应不得盖住新文件。
// 出处由**活动文件自己**给出(跨项目),不再取「当前项目」。
async function loadFileContent(file: { projectId: string; path: string }): Promise<void> {
  fileVersion += 1
  const version = fileVersion
  const sessionId = activeId.value
  fileContent.value = { status: 'loading' }
  const result = await getFileContent(file.projectId, file.path, sessionId)
  if (!isAlive.value || version !== fileVersion) return
  // 用户可能已经切走 / 关掉了这个文件(活动文件变了就不再写)。
  const current = activeFile.value
  if (current === null || current.projectId !== file.projectId || current.path !== file.path) return
  if (!result.ok) {
    fileContent.value = { status: 'error' }
    return
  }
  // 空行数组 = 二进制 / 无可预览的文本 → 走「空态」。
  fileContent.value = result.value.lines.length === 0 ? { status: 'empty' } : { status: 'ready', content: result.value }
}

// 打开文件:kind 为 preview(单击,占临时槽,顶掉旧预览)或 pinned(双击 / Enter,独占一格)。
// 出处 = 传进来的项目(从项目树打开时是当前项目;从「最近打开」点开时是那条自己的项目)。
// 已在栏上时:预览提升为固定(原地转正,不新增 tab);已固定的只切为活动。
function openFile(projectId: string, projectName: string, path: string, kind: FileTab['kind']): void {
  const workspace = fileWorkspace.value
  const key = fileTabKey({ projectId, path })
  const existing = workspace.tabs.find((tab) => fileTabKey(tab) === key)
  let tabs = workspace.tabs
  if (existing === undefined) {
    const fresh: FileTab = { path, projectId, projectName, kind }
    if (kind === 'preview') {
      const previewIndex = workspace.tabs.findIndex((tab) => tab.kind === 'preview')
      tabs = previewIndex >= 0 ? workspace.tabs.map((tab, index) => (index === previewIndex ? fresh : tab)) : [...workspace.tabs, fresh]
    } else {
      tabs = [...workspace.tabs, fresh]
    }
  } else if (kind === 'pinned' && existing.kind === 'preview') {
    tabs = workspace.tabs.map((tab) => (fileTabKey(tab) === key ? { ...tab, kind } : tab))
  }
  setFileWorkspace({ tabs, activeKey: key })
  recentFiles.value = rememberRecent(recentFiles.value, { agentId: selectedAgent.value, projectId, projectName, path })
  // 内容由 watch(activeFile) 统一取。
}

// 从项目树打开:出处取**当前项目**。
function openFromTree(path: string, kind: FileTab['kind']): void {
  if (selectedProjectId.value === '') return
  openFile(selectedProjectId.value, currentProjectName.value, path, kind)
}

// 文件树里的文件行:单击 = 预览(键盘派生的 click 不计,由 keydown 处理)。
function onFileRowClick(row: ProjectTreeRow, event: MouseEvent): void {
  if (suppressFileRowClick) {
    suppressFileRowClick = false
    return
  }
  if (event.detail === 0) return
  openFromTree(row.path, 'preview')
}

// 双击 = 钉住(独占一格)。
function onFileRowDblClick(row: ProjectTreeRow): void {
  openFromTree(row.path, 'pinned')
}

// 键盘:焦点在文件行上按 Enter(或空格)= 钉住打开。
function onFileRowKey(event: KeyboardEvent, row: ProjectTreeRow): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  suppressFileRowClick = true
  openFromTree(row.path, 'pinned')
}

function selectFileTab(key: string): void {
  if (activeFileKey.value === key) return
  setFileWorkspace({ ...fileWorkspace.value, activeKey: key })
}

// 关闭一个文件 tab(≠ 删除):从栏上撤下,活动项落到相邻(优先右侧);一个不剩则收起面板。
// 「最近打开」不动,故关掉的文件仍能在 ▾ 菜单里找到、点回。
function closeFileTab(key: string): void {
  const workspace = fileWorkspace.value
  const index = workspace.tabs.findIndex((tab) => fileTabKey(tab) === key)
  if (index < 0) return
  const neighbor = workspace.tabs[index + 1] ?? workspace.tabs[index - 1] ?? null
  const nextActive = workspace.activeKey === key ? (neighbor === null ? '' : fileTabKey(neighbor)) : workspace.activeKey
  setFileWorkspace({ tabs: workspace.tabs.filter((tab) => fileTabKey(tab) !== key), activeKey: nextActive })
}

function reorderFileTabs(order: string[]): void {
  const byKey = new Map(fileWorkspace.value.tabs.map((tab) => [fileTabKey(tab), tab]))
  const tabs = order.flatMap((key) => {
    const tab = byKey.get(key)
    return tab === undefined ? [] : [tab]
  })
  setFileWorkspace({ ...fileWorkspace.value, tabs })
}

// 点「最近打开」里的条目:直接以**它自己的项目**打开 —— **不切换当前项目**(跨项目打开是
// 阅读动作,不该带来意外的导航)。
function openRecentFile(entry: RecentFile): void {
  if (isBusy.value) return
  openFile(entry.projectId, entry.projectName, entry.path, 'preview')
}

// 收起文件面板(Esc / 面板的关闭钮):文件留在栏上,焦点还给栏里那个 tab(键盘操作者不丢位置)。
function closeFilePanel(): void {
  const key = activeFileKey.value
  if (key === '') return
  const workspace = fileWorkspace.value
  setFileWorkspace({ ...workspace, activeKey: '' })
  void nextTick(() => {
    const tab = document.querySelector<HTMLElement>(`.file-tab[data-file-key="${CSS.escape(key)}"]`)
    tab?.focus()
  })
}

function retryFile(): void {
  const file = activeFile.value
  if (file !== null) void loadFileContent(file)
}

// 清掉正在进行的生成(切会话 / 换项目 / 演示态切换时调用),避免旧流写进新的转录。
function clearGeneration(): void {
  clearInterval(interval.value)
  interval.value = undefined
  generation.value = 'idle'
  fullResponse.value = null
  renderedResponse.value = null
  hasSendError.value = false
}

async function stickToBottom(): Promise<void> {
  await nextTick()
  if (!log.value) return
  // 空态从欢迎内容开始阅读，不沿用消息列表的贴底落点。
  if (transcript.value.status === 'empty') log.value.scrollTop = 0
  else if (isPinned.value) log.value.scrollTop = log.value.scrollHeight
  else return
  previousScroll.value = log.value.scrollTop
}

function onScroll(): void {
  if (!log.value) return
  const current = log.value.scrollTop
  const distance = log.value.scrollHeight - log.value.clientHeight - current
  // 先认「贴底」:回到距底 1px 内即恢复粘底。只有用户以指针主动上拖(拖动滚动条 / 触摸)才
  // 据此解除粘底 —— 程序化替换内容时浏览器会钳制 scrollTop 并派发 scroll 事件,那不是用户的
  // 向上滚动意图;若误判,isPinned 会永久翻假,stickToBottom 从此早退,转录再也不贴底。
  if (distance <= 1) isPinned.value = true
  else if (isPointerScrolling && current < previousScroll.value - 1) isPinned.value = false
  previousScroll.value = current
}

function onLogPointerDown(): void {
  isPointerScrolling = true
}

function onLogPointerUp(): void {
  isPointerScrolling = false
}

function onWheel(event: WheelEvent): void {
  if (event.deltaY < 0) isPinned.value = false
}

function onLogKey(event: KeyboardEvent): void {
  if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) isPinned.value = false
}

function returnToBottom(): void {
  isPinned.value = true
  void stickToBottom()
}

// 取某个项目的条目树(每项目只取一次;展开时按需触发)。树自带 loading / error 两态。
async function ensureProjectTree(projectId: string): Promise<void> {
  if (projectTrees.value[projectId] !== undefined) return
  treeStatus.value = { ...treeStatus.value, [projectId]: 'loading' }
  const result = await getProjectTree(projectId)
  if (!isAlive.value) return
  if (!result.ok) {
    treeStatus.value = { ...treeStatus.value, [projectId]: 'error' }
    return
  }
  projectTrees.value = { ...projectTrees.value, [projectId]: result.value }
  treeStatus.value = { ...treeStatus.value, [projectId]: 'ready' }
}

// 遥测时钟:由 elapsedSeconds 起算本地走秒。重设时先清旧 interval,避免叠加。
function startTelemetryClock(): void {
  clearInterval(telemetryTimer.value)
  telemetryTimer.value = undefined
  elapsed.value = runtime.value?.elapsedSeconds ?? 0
  telemetryTimer.value = setInterval(() => { elapsed.value += 1 }, 1000)
}

// 取当前 Agent 在**当前项目**下的运行遥测(状态 / 模型 / context / 时长 / 项目名与路径),
// 再取**当前会话**的确认请求。带版本号:dummy 数据的随机延迟会让「登录时的 planning 请求」与
// 「进入 waiting 后的 writing 请求」乱序返回,旧结果覆盖新结果会把状态词卡成错误的 Agent。
async function loadTelemetry(): Promise<void> {
  telemetryVersion += 1
  const version = telemetryVersion
  const result = await getAgentRuntime(selectedAgent.value, selectedProjectId.value, activeId.value)
  if (!isAlive.value || version !== telemetryVersion) return
  runtime.value = result.ok ? result.value : null
  startTelemetryClock()
  await loadConfirmation()
}

// 「等待交互」确认请求只在当前会话处于等待态时呈现 —— 遥测条、转录里的确认卡、项目树里的
// pending 芯片三者都从**当前会话**派生;别的会话在等你这件事由对话切换器的徽标表达,
// 两个区域职责分明,不再互相冒充。
async function loadConfirmation(): Promise<void> {
  confirmationVersion += 1
  const version = confirmationVersion
  confirmationOutcome.value = null
  resolutionStatus.value = null
  followUp.value = null
  const result = await getConfirmationRequest(activeId.value)
  if (!isAlive.value || version !== confirmationVersion) return
  confirmation.value = result.ok ? result.value : null
}

// 处理确认:卡片塌缩成一行留痕(不消失,审计痕迹),按选择联动项目树芯片与遥测状态,
// 并让 Agent 继续(发一条后续消息)。
async function resolveConfirmation(allowed: boolean): Promise<void> {
  if (confirmation.value === null) return
  confirmationOutcome.value = allowed ? 'allowed' : 'rejected'
  resolutionStatus.value = allowed ? 'streaming' : 'idle'
  appendFollowUp(allowed)
  await stickToBottom()
}

// 处理后的后续消息:允许 → 按新草稿继续;拒绝 → 说明改走了另一条路。
function appendFollowUp(allowed: boolean): void {
  if (transcript.value.status !== 'ready') return
  const body = allowed ? t.value.workspace.confirmation.followUpAllowed : t.value.workspace.confirmation.followUpRejected
  followUp.value = { id: `confirmation-followup-${allowed ? 'allowed' : 'rejected'}`, role: 'assistant', body, createdAt: new Date().toISOString() }
}

// 重装工作台视图:取项目列表 → 落到选中项目 → 取该项目会话与转录 → 取遥测。
// pickFirstSession=true 时把当前会话落到该项目首条(项目 / Agent 切换的语义);
// false 时保留 activeId(空态、新建对话、语言切换、重试等,activeId 为空是「有意为之」)。
// autoExpand=true 时若选中项目尚未展开过则默认展开它(只作「初次进入」的默认,之后的选中
// 不改展开态 —— 展开与选中是两个独立状态)。
async function reloadWorkspace(pickFirstSession: boolean, autoExpand = false): Promise<void> {
  if (isBusy.value) { isLocalePending.value = true; return }
  workspaceVersion += 1
  const version = workspaceVersion
  // 转录票:整段装载期间有效。用户在这期间新建 / 发送 / 切会话会推进代次,票即作废。
  const transcriptTicket = transcriptVersion
  const previousTop = log.value?.scrollTop ?? 0
  const demo = currentRoute.value.demoState

  projectsStatus.value = 'loading'
  const projectResult = await listProjects(selectedAgent.value)
  if (!isAlive.value || version !== workspaceVersion) return
  if (!projectResult.ok) { projectsStatus.value = 'error'; return }
  projects.value = projectResult.value
  projectsStatus.value = projects.value.length ? 'ready' : 'empty'
  // 保留原选中项目(如语言切换后的重载);它不在了(项目被关 / 换了 Agent)则落到首个。
  const kept = projects.value.find((project) => project.id === selectedProjectId.value)
  const project = kept ?? projects.value[0] ?? null
  selectedProjectId.value = project?.id ?? ''
  if (project === null) {
    // 没有项目可归属:清掉会话与转录,遥测也随之清空(否则状态条会继续显示上一个项目的
    // 名字 / 模型,说了假话),只留纯客户端的状态词。
    sessions.value = []
    sessionStatus.value = 'empty'
    activeId.value = ''
    transcript.value = { status: 'empty' }
    expandedProjects.value = new Set()
    runtime.value = null
    confirmation.value = null
    clearInterval(telemetryTimer.value)
    telemetryTimer.value = undefined
    return
  }
  // 单展开:自动展开时把展开集**收成只含这一个项目**(而不是追加)—— 侧栏任意时刻至多一个
  // 项目展开,且展开者必为当前选中者(见 toggleProjectRow 与其断言)。
  if (autoExpand) expandedProjects.value = new Set([project.id])
  if (expandedProjects.value.has(project.id)) void ensureProjectTree(project.id)

  sessionStatus.value = 'loading'
  const sessionResult = await listSessions(project.id)
  if (!isAlive.value || version !== workspaceVersion) return
  sessions.value = sessionResult.ok ? sessionResult.value : []
  sessionStatus.value = sessionResult.ok ? (sessions.value.length ? 'ready' : 'empty') : 'error'
  // 落到该项目首条会话:调用方要求时,或当前 activeId 非空却不属于本项目(项目 / Agent 切了)。
  // activeId 为空不会被自动填上 —— 那是空态或「刚新建、还没发消息」的有意状态。
  const belongsHere = sessions.value.some((session) => session.id === activeId.value)
  if (pickFirstSession || (activeId.value !== '' && !belongsHere)) {
    activeId.value = sessions.value[0]?.id ?? ''
  }
  // 活动会话必须在打开集里(演示态直达可能把 activeId 指到用户先前关掉的会话上)。
  if (activeId.value !== '') openSession(activeId.value)

  // 转录:写盘前逐次比对票据。票旧了(用户已新建 / 发送 / 切会话)就整段跳过 ——
  // 否则首屏那次装载的 getTranscript 会在「点开新对话之后」才返回,把上一会话的历史消息
  // 又写回转录(实测:登录后约 450ms 点「新建对话」再发一条,转录里混进了上一会话的 4 条)。
  const isTranscriptCurrent = (): boolean => isAlive.value && version === workspaceVersion && transcriptTicket === transcriptVersion
  if (isTranscriptCurrent()) {
    if (demo === 'error') transcript.value = { status: 'error' }
    else if (demo === 'empty' || activeId.value === '') transcript.value = { status: 'empty' }
    else transcript.value = { status: 'loading' }
  }
  if (transcript.value.status === 'loading' && isTranscriptCurrent()) {
    const messagesResult = await getTranscript(activeId.value)
    if (!isTranscriptCurrent()) return
    transcript.value = !messagesResult.ok ? { status: 'error' } : messagesResult.value.length ? { status: 'ready', messages: messagesResult.value } : { status: 'empty' }
  }
  await nextTick()
  if (isTranscriptCurrent()) {
    if (transcript.value.status === 'empty' || isPinned.value) await stickToBottom()
    else if (log.value) { log.value.scrollTop = previousTop; previousScroll.value = previousTop }
  }
  await loadTelemetry()
}

// 项目行**单控件**(替换上一轮照 Primer 做的 chevron / 名称两段式):整行是一个按钮 ——
// 点未展开的行 = 选中该项目 + 展开它 + 折叠其它所有项目;点已展开的行 = 折叠它(仍保持选中)。
// 单展开是导航模式(PatternFly:single-expand 适用于导航与子导航,空间受限时更适用),也消掉了
// 两段式会造出的「侧栏展开的是 B、右侧会话头却是 A」的不一致。chevron 退化为纯指示。
async function toggleProjectRow(project: Project): Promise<void> {
  if (isBusy.value) return
  if (expandedProjects.value.has(project.id)) {
    // 已展开 → 折叠,但**仍保持选中**(选中的是项目本身,不是它的展开态)。
    expandedProjects.value = new Set()
    return
  }
  // 未展开 → 展开它并折叠其它(单展开不变量);换项目时收起对话切换器。
  expandedProjects.value = new Set([project.id])
  void ensureProjectTree(project.id)
  if (project.id === selectedProjectId.value) return
  isSwitcherOpen.value = false
  clearGeneration()
  highlightTurnId.value = null
  isPinned.value = true
  selectedProjectId.value = project.id
  await reloadWorkspace(true)
}

// 关闭项目:按 id 移除(只动这一个);若关掉的是当前项目,落到剩下的首个项目。
async function onCloseProject(project: Project): Promise<void> {
  if (isBusy.value) return
  isSwitcherOpen.value = false
  const result = await closeProjectRequest(project.id)
  if (!isAlive.value || !result.ok) return
  const wasCurrent = project.id === selectedProjectId.value
  if (wasCurrent) {
    selectedProjectId.value = ''
    activeId.value = ''
  }
  await reloadWorkspace(wasCurrent, wasCurrent)
}

// 「打开项目」确认:按 path 逐个加入项目列表,并**自动选中**最后打开的一个 ——
// 用户立刻看到它的会话,符合「点项目 → 看该项目对话」的心智。
async function confirmOpenProject(paths: string[]): Promise<void> {
  isPickerOpen.value = false
  if (paths.length === 0) return
  let openedId = ''
  for (const path of paths) {
    const result = await openProject(selectedAgent.value, path)
    if (result.ok) openedId = result.value.id
  }
  if (!isAlive.value || openedId === '') return
  selectedProjectId.value = openedId
  isSwitcherOpen.value = false
  await reloadWorkspace(true, true)
}

// 项目列表出错时的重试:重装视图(保留当前选择)。
function retryProjects(): void {
  void reloadWorkspace(false)
}

async function closeDrawer(): Promise<void> {
  isDrawerOpen.value = false
  await nextTick()
  sidebarTrigger.value?.focus()
}

async function openDrawer(): Promise<void> {
  isDrawerOpen.value = true
  await nextTick()
  // 等浏览器完成 inert 与可见性更新，避免旧焦点的失焦覆盖抽屉初始焦点。
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const firstButton = drawer.value?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? null
  if (firstButton === null) return
  // 打开抽屉的同时对话区被设为 inert,浏览器可能在我们的 focus() 之后才把焦点从旧元素挪走、
  // 落回 body,把初始焦点吞掉。故重试若干帧,直到焦点确实停在首个控件上(键盘操作者不丢位置)。
  for (let attempt = 0; attempt < 8; attempt += 1) {
    firstButton.focus()
    if (document.activeElement === firstButton) return
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

function drawerKeyboard(event: KeyboardEvent): void {
  if (!isDrawerOpen.value) return
  if (event.key === 'Escape') { event.preventDefault(); void closeDrawer(); return }
  if (event.key !== 'Tab') return
  const buttons = Array.from(drawer.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
  const first = buttons[0]
  const last = buttons.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}

// 演示态对「选中已有会话」的动作:empty / error 会覆盖转录,必须回到常规态才能读到该会话
// 的真实内容;waiting 只给会话打「等待交互」标记、不改数据,故**保留**它 —— 否则点开一个
// 正在等待的会话就看不到它自己的确认卡,跨区域一致性无从演示。
function leaveDataDemoState(): boolean {
  const demo = currentRoute.value.demoState
  if (demo === 'empty' || demo === 'error') {
    navigateTo('workspace')
    return true
  }
  return false
}

// 选中会话:切转录、收起对话切换器(切换器自己也会收起,这里保证按钮触发之外的路径一致)。
// 从 ▾ 面板点一个**已关闭**的会话 = 重新打开它(视图状态)。
async function selectSession(session: ChatSession): Promise<void> {
  if (isBusy.value) return
  openSession(session.id)
  isSwitcherOpen.value = false
  takeOverTranscript()
  clearGeneration()
  highlightTurnId.value = null
  activeId.value = session.id
  draft.value = ''
  isPinned.value = true
  if (isDrawerOpen.value) await closeDrawer()
  // 离开 empty / error 演示态时由 navigateTo 触发一次重装;waiting / normal 则就地重装。
  if (!leaveDataDemoState()) await reloadWorkspace(false)
}

// 把一个会话移出「关闭集」(重新打开)。已是打开态则无副作用。
function openSession(id: string): void {
  if (!closedIds.value.has(id)) return
  const next = new Set(closedIds.value)
  next.delete(id)
  closedIds.value = next
}

// 关闭一个 tab(视图状态):会话仍在列表里。关掉活动 tab 时激活相邻的(优先右侧,没有则左侧);
// tab 条恒有 ≥1 个打开项(只剩一个时切换器不给关闭钮,故这里不会关到空)。
async function closeTab(id: string): Promise<void> {
  if (isBusy.value) return
  // 相邻项按 tab 条的**同一顺序**(最近更新倒序)在**打开集**里取。
  const ordered = [...sessions.value].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const open = ordered.filter((session) => !closedIds.value.has(session.id))
  const index = open.findIndex((session) => session.id === id)
  const neighbor = open[index + 1] ?? open[index - 1] ?? null
  const next = new Set(closedIds.value)
  next.add(id)
  closedIds.value = next
  if (id !== activeId.value) return
  if (neighbor !== null) await selectSession(neighbor)
  else activeId.value = ''
}

async function newConversation(): Promise<void> {
  if (isBusy.value) return
  isSwitcherOpen.value = false
  takeOverTranscript()
  clearGeneration()
  highlightTurnId.value = null
  activeId.value = ''
  draft.value = ''
  transcript.value = { status: 'empty' }
  isPinned.value = true
  if (isDrawerOpen.value) await closeDrawer()
  // 切回常规路由会触发一次重装;此处 activeId 已归空,重装不得把它补成历史会话
  // (reloadWorkspace 的 pickFirstSession=false 即为此)。
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  await stickToBottom()
  composer.value?.focus()
}

// 选择器只写入自己的值;换 Agent 即换项目列表,故一并重装工作台(落到新 Agent 首个项目的首条会话)。
async function onSelectAgent(agent: ChatSession['agent']): Promise<void> {
  if (selectedAgent.value === agent) return
  isSwitcherOpen.value = false
  selectedAgent.value = agent
  clearGeneration()
  highlightTurnId.value = null
  isPinned.value = true
  await reloadWorkspace(true, true)
}

// 会话搜索:在当前项目范围内筛选(空串回到会话列表)。请求带版本号,避免快速输入时旧结果覆盖新结果。
function onSearchInput(value: string): void {
  searchQuery.value = value
  void runSearch()
}

async function runSearch(): Promise<void> {
  const query = searchQuery.value.trim()
  if (!query) {
    searchVersion += 1
    searchHits.value = []
    isSearching.value = false
    return
  }
  searchVersion += 1
  const version = searchVersion
  isSearching.value = true
  const result = await searchConversations(query, selectedProjectId.value)
  if (!isAlive.value || version !== searchVersion) return
  isSearching.value = false
  searchHits.value = result.ok ? result.value : []
}

// 「清空搜索」(点搜索框里的 ×):清词 + 清掉转录里的命中高亮(这是用户明确的「收工」动作)。
function clearSearch(): void {
  searchQuery.value = ''
  highlightTurnId.value = null
  void runSearch()
}

// 面板关闭时的搜索复位:只清搜索词与命中列表,**保留**高亮 —— 点命中会关面板,此时清高亮
// 会把刚跳转并高亮的那一轮立刻抹掉。
function resetSearch(): void {
  searchQuery.value = ''
  void runSearch()
}

// 滚动到命中轮次并保持高亮:高亮是静态样式,不依赖动画(reduced-motion 下也看得见)。
async function scrollToTurn(turnId: string): Promise<void> {
  await nextTick()
  if (!log.value) return
  const target = log.value.querySelector<HTMLElement>(`[data-message-id="${turnId}"]`)
  if (!target) return
  target.scrollIntoView({ block: 'center', behavior: motionMedia.matches ? 'auto' : 'smooth' })
}

// 点击命中:按判别符 reason 分流 —— 正文命中切到该会话、定位并高亮 turnId;
// 标题命中没有可跳转的具体轮次,只切会话、不高亮。命中都落在当前项目内(搜索按项目隔离)。
async function openHit(hit: ConversationSearchHit): Promise<void> {
  if (isBusy.value) return
  // 搜索命中一个已关闭的会话 = 也把它重新打开(与面板点击同一语义)。
  openSession(hit.sessionId)
  isSwitcherOpen.value = false
  takeOverTranscript()
  clearGeneration()
  activeId.value = hit.sessionId
  draft.value = ''
  isPinned.value = true
  highlightTurnId.value = hit.reason === 'body' ? hit.turnId : null
  if (isDrawerOpen.value) await closeDrawer()
  // 与选中会话同规则:empty / error 需回常规态;waiting 保留(见 leaveDataDemoState)。
  if (!leaveDataDemoState()) await reloadWorkspace(false)
  if (hit.reason === 'body') await scrollToTurn(hit.turnId)
}

async function useSuggestion(text: string): Promise<void> {
  draft.value = text
  await nextTick()
  composer.value?.focus()
}

function updateResponse(body: string): void {
  if (!renderedResponse.value || transcript.value.status !== 'ready') return
  renderedResponse.value.body = body
  const message = transcript.value.messages.find((item) => item.id === renderedResponse.value?.id)
  if (message) message.body = body
  void stickToBottom()
}

async function finishResponse(isStopped: boolean): Promise<void> {
  clearInterval(interval.value)
  interval.value = undefined
  generation.value = isStopped ? 'stopped' : 'complete'
  if (!renderedResponse.value) return
  isSaving.value = true
  const saved = await saveResponse(activeId.value, { ...renderedResponse.value })
  if (!isAlive.value) return
  isSaving.value = false
  if (!saved.ok) hasSendError.value = true
  if (isLocalePending.value) {
    isLocalePending.value = false
    await reloadWorkspace(false)
  }
}

function startStream(): void {
  if (!fullResponse.value || !renderedResponse.value) return
  generation.value = 'streaming'
  if (motionMedia.matches) {
    updateResponse(fullResponse.value.body)
    void finishResponse(false)
    return
  }
  interval.value = setInterval(() => {
    if (!fullResponse.value || !renderedResponse.value) return
    updateResponse(fullResponse.value.body.slice(0, renderedResponse.value.body.length + STREAM_CHUNK))
    if (renderedResponse.value.body.length >= fullResponse.value.body.length) void finishResponse(false)
  }, STREAM_INTERVAL)
}

async function send(): Promise<void> {
  if (!canSend.value) return
  const text = draft.value.trim()
  // 发送即接管转录:把在途的旧装载作废,免得它的结果在本次发送之后写回来。
  takeOverTranscript()
  hasSendError.value = false
  hasStopRequested.value = false
  generation.value = 'queued'
  highlightTurnId.value = null
  // 空态没有历史消息的阅读位置；首次发送恢复跟随，其余情况保留原有粘底规则。
  if (transcript.value.status === 'empty') isPinned.value = true
  else if (log.value && log.value.scrollHeight - log.value.clientHeight - log.value.scrollTop > BOTTOM_THRESHOLD) isPinned.value = false
  if (!activeId.value) {
    // 新会话归属**当前项目**(其 Agent 由项目反推);项目为空说明还没有可归属的地方,直接失败。
    const created = await createSession(selectedProjectId.value)
    if (!isAlive.value) return
    if (!created.ok) { generation.value = 'idle'; hasSendError.value = true; return }
    activeId.value = created.value.id
    sessions.value.unshift(created.value)
    if (sessionStatus.value !== 'ready') sessionStatus.value = 'ready'
  }
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  const existing = transcript.value.status === 'ready' ? transcript.value.messages : []
  const pending: ChatMessage = { id: 'pending-user', role: 'user', body: text, createdAt: new Date().toISOString() }
  transcript.value = { status: 'ready', messages: [...existing, pending] }
  draft.value = ''
  void stickToBottom()
  const result = await sendMessage(activeId.value, text)
  if (!isAlive.value) return
  if (!result.ok) {
    transcript.value = existing.length ? { status: 'ready', messages: existing } : { status: 'empty' }
    draft.value = text
    generation.value = 'idle'
    hasSendError.value = true
    return
  }
  fullResponse.value = result.value
  renderedResponse.value = { ...result.value, body: '' }
  transcript.value = { status: 'ready', messages: [...existing, { ...pending, id: `${result.value.id}-user` }, renderedResponse.value] }
  const session = sessions.value.find((item) => item.id === activeId.value)
  if (session && activeId.value.startsWith('draft-')) session.title = text
  if (hasStopRequested.value) await finishResponse(true)
  else startStream()
}

function stop(): void {
  if (generation.value === 'queued') { hasStopRequested.value = true; return }
  if (generation.value === 'streaming') void finishResponse(true)
}

function regenerate(): void {
  if (isBusy.value || !fullResponse.value) return
  updateResponse('')
  startStream()
}

function inputKeyboard(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void send()
}

function onViewportChange(): void {
  isNarrow.value = narrowMedia.matches
  if (!isNarrow.value) isDrawerOpen.value = false
}

function onMotionChange(): void {
  if (motionMedia.matches && generation.value === 'streaming' && fullResponse.value) {
    updateResponse(fullResponse.value.body)
    void finishResponse(false)
  }
}

// 悬浮输入框的高度跟随:把测量到的输入框高度写进 --composer-float-height,转录区的底部内边距
// (= 它 + 输入框到坞顶的间隙 + 留白)与「回到底部」的纵向落点都由 --composer-inset 派生。
// 文件栏的高度**不由这里量测**:它停靠在坞的文档流最底下(.file-bar-dock),坞因此变高、
// 坞顶(转录区底边)随之被顶高,输入框锚在坞顶之上也一并上移 —— 量测它只会多此一举、
// 且量测晚一帧时输入框还停在旧位置(实测过的竞态)。多行输入向上生长时,只有这段内边距变长
// (只延长可滚动范围、不移动当前滚动位置),流内的遥测条几何不受影响。
let composerObserver: ResizeObserver | undefined

function syncComposerMetrics(): void {
  const height = composerForm.value?.offsetHeight ?? 0
  conversationPanel.value?.style.setProperty('--composer-float-height', `${height}px`)
  // 内缩随输入框长高而同步变大(坞高变化时也一样)。若转录正贴底,把视图**重新贴到底** ——
  // 否则刚长出的那一截(或刚出现的文件栏)会盖住最后一条消息(用户输入多行 / 打开文件时应当「无感」)。
  if (isPinned.value && transcript.value.status === 'ready') void stickToBottom()
}

// ⌘/Ctrl+K:全局快捷键,打开对话切换器(面板打开后由其自动聚焦搜索框)。
// 面板打开时的 Escape 由切换器自己处理(stopPropagation),不会走到抽屉的 Escape。
function onSwitcherShortcut(event: KeyboardEvent): void {
  if (event.key !== 'k' && event.key !== 'K') return
  if (!event.metaKey && !event.ctrlKey) return
  event.preventDefault()
  isSwitcherOpen.value = true
}

// Esc 收起文件面板:面板是**非模态**的覆盖层,所以不圈定焦点,关闭后把焦点还给文件栏里那个
// tab。抽屉开着时让位给抽屉 —— 一次 Escape 只关最上层:抽屉的处理器在它之前注册、且会
// preventDefault 认领这次按键,故这里看到 defaultPrevented 就直接让过(否则会同时关掉两层)。
// 文件栏的 ▾ 菜单自己处理 Esc 并阻止冒泡,故这里不必再判。
function onFilePanelEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  if (!isFilePanelOpen.value || isDrawerOpen.value) return
  closeFilePanel()
}

// 演示态把「当前会话 / 侧栏 Agent / 项目」钉到与该状态一致的一组:waiting 直达写作助手
// product-docs 的 knowledge 会话(它处于等待确认),确认交互要的正是三者同指一个项目。
// 常规态不动 Agent —— 从 waiting 回到常规时侧栏应仍停在写作助手的项目上,项目树里的芯片
// 才谈得上「回到原状态」。切换演示态时清空「已看过」的会话集合,让提示图标与前置组可重复演示。
function applyDemoState(demo: AppRoute['demoState']): void {
  seenSessions.value = new Set()
  if (demo === 'empty') { activeId.value = ''; selectedAgent.value = 'planning' }
  if (demo === 'waiting') { activeId.value = 'knowledge'; selectedAgent.value = 'writing' }
  if (demo === 'error') { activeId.value = 'weekly'; selectedAgent.value = 'planning' }
}

// 项目列表重试。
function retryWorkspace(): void {
  isPinned.value = true
  previousScroll.value = log.value?.scrollTop ?? 0
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  else void reloadWorkspace(false)
}

watch(locale, () => {
  // 项目 / 条目的名称与路径都是技术标识,不随语言变化,故只重取会话(标题本地化)与遥测。
  void reloadWorkspace(false)
})
// 活动文件(含切会话 / 换项目带来的变化)决定面板内容 —— 取内容的唯一入口。
watch(activeFile, (file) => {
  if (file === null) {
    // 收起面板:作废在途的文件读取,别让它的结果写回一个已被收起的空面板。
    fileVersion += 1
    fileContent.value = { status: 'loading' }
    return
  }
  void loadFileContent(file)
}, { immediate: true })
watch(() => currentRoute.value.demoState, (demo) => {
  applyDemoState(demo)
  if (!isBusy.value) clearGeneration()
  // pickFirstSession=false:演示态各自指定了 activeId,且「新建对话回到常规态」时 activeId
  // 为空,不能被重装补成历史会话。autoExpand=true 让新 Agent 的首个项目默认展开。
  void reloadWorkspace(false, true)
})
// 「已看过」的唯一登记点:某会话在 awaiting / completed 期间成为活动会话(含首屏 / 演示直达落地)
// 即记入。同时监听 sessions —— 状态随会话列表到达,不监听它会在列表落定前漏登记。
watch([activeId, sessions], () => {
  const current = sessions.value.find((session) => session.id === activeId.value)
  if (current === undefined) return
  if (current.status !== 'awaiting' && current.status !== 'completed') return
  if (seenSessions.value.has(current.id)) return
  const next = new Set(seenSessions.value)
  next.add(current.id)
  seenSessions.value = next
})

// 文件栏常驻后不再有「出现 / 消失」这一事件,坞高恒定 —— 故这里不再需要额外重算。

onMounted(() => {
  applyDemoState(currentRoute.value.demoState)
  void reloadWorkspace(false, true)
  narrowMedia.addEventListener('change', onViewportChange)
  motionMedia.addEventListener('change', onMotionChange)
  document.addEventListener('keydown', drawerKeyboard)
  document.addEventListener('keydown', onSwitcherShortcut)
  document.addEventListener('keydown', onFilePanelEscape)
  // 指针抬起可能落在转录区之外(拖动滚动条时鼠标划出),故在 window 上收尾。
  window.addEventListener('pointerup', onLogPointerUp)
  window.addEventListener('pointercancel', onLogPointerUp)
  // 悬浮输入簇的量测:首帧量一次(覆盖 CSS 默认值),之后由 ResizeObserver 跟随多行增长。
  syncComposerMetrics()
  if (composerForm.value !== null && typeof ResizeObserver !== 'undefined') {
    composerObserver = new ResizeObserver(() => syncComposerMetrics())
    composerObserver.observe(composerForm.value)
  }
})
onBeforeUnmount(() => {
  isAlive.value = false
  clearInterval(interval.value)
  clearInterval(telemetryTimer.value)
  composerObserver?.disconnect()
  narrowMedia.removeEventListener('change', onViewportChange)
  motionMedia.removeEventListener('change', onMotionChange)
  document.removeEventListener('keydown', drawerKeyboard)
  document.removeEventListener('keydown', onSwitcherShortcut)
  document.removeEventListener('keydown', onFilePanelEscape)
  window.removeEventListener('pointerup', onLogPointerUp)
  window.removeEventListener('pointercancel', onLogPointerUp)
})
</script>

<template>
  <main id="main" class="workspace-page dl-scope dl-scope--dark">
    <div class="workspace-layout">
      <div v-if="isDrawerOpen && isNarrow" class="workspace-backdrop" aria-hidden="true" @click="closeDrawer" />
      <aside
        id="workspace-sidebar" ref="drawer" class="workspace-sidebar" :class="{ 'is-open': isDrawerOpen }"
        :inert="isNarrow && !isDrawerOpen" :role="isNarrow && isDrawerOpen ? 'dialog' : undefined"
        :aria-modal="isNarrow && isDrawerOpen ? true : undefined" :aria-label="t.workspace.workspacePanel"
      >
        <div class="sidebar-actions">
          <!-- Agent 切换器:表达「当前在哪个 Agent 下工作」,其下项目区随之切换;新建对话的
               归属项目也由它决定(项目挂在 Agent 上)。 -->
          <AgentSelector :value="selectedAgent" :disabled="isBusy" @select="onSelectAgent" />
          <button v-if="isNarrow" class="workspace-button icon-button" :aria-label="t.workspace.closeSidebar" @click="closeDrawer">×</button>
        </div>
        <section class="workspace-projects">
          <h2 class="sidebar-label" aria-hidden="true">{{ t.workspace.projects }}</h2>
          <div class="project-scroll">
            <div v-if="projectsStatus === 'loading'" class="sidebar-loading" :aria-label="t.workspace.loading"><NSkeleton text :repeat="3" :animated="false" /></div>
            <div v-else-if="projectsStatus === 'error'" class="sidebar-loading"><p>{{ t.workspace.projectsError }}</p><button class="workspace-button" @click="retryProjects">{{ t.workspace.retry }}</button></div>
            <p v-else-if="projectsStatus === 'empty'" class="sidebar-hint">{{ t.workspace.projectsEmpty }}</p>
            <ul v-else class="project-list">
              <li v-for="project in projects" :key="project.id" class="project-item" :class="{ 'is-current': project.id === selectedProjectId }">
                <div class="project-row">
                  <!-- 项目行单控件:整行一个按钮。点未展开的行 = 选中 + 展开 + 折叠其它;点已展开的行
                       = 折叠(仍保持选中)。行内次序为 [前导记号][名称][⋯ 槽位][chevron] ——
                       chevron 移到行尾(手风琴惯例),与树行的行首 chevron 形成位置差;⋯ 是独立
                       控件,绝对定位覆盖在按钮预留的槽位上(不能嵌进按钮)。chevron 纯指示(aria-hidden,
                       随展开态旋转)。 -->
                  <button
                    type="button" class="project-row__button"
                    :aria-expanded="expandedProjects.has(project.id)"
                    :aria-current="project.id === selectedProjectId ? 'true' : undefined"
                    :aria-controls="`project-tree-${project.id}`"
                    :title="`${project.path} · ${formatFileCount(project.entryCount)}`"
                    @click="toggleProjectRow(project)"
                  >
                    <DliIcon class="project-row__mark" name="grid" size="sm" />
                    <span class="project-row__name">{{ project.name }}</span>
                    <!-- ⋯ 槽位常驻预留(不可见但占位),悬停时不产生位移。 -->
                    <span class="project-row__slot" aria-hidden="true" />
                    <svg class="tree-caret project-row__caret" :class="{ 'is-open': expandedProjects.has(project.id) }" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                  <ProjectMenu :project-name="project.name" @close="onCloseProject(project)" />
                </div>
                <!-- 树容器恒渲染(v-show 控显隐):aria-controls 的目标因此始终可解析。 -->
                <div v-show="expandedProjects.has(project.id)" :id="`project-tree-${project.id}`" class="project-tree">
                  <!-- 收纳脊线:展开项目的内容区左侧一条竖向发丝线,把「这些是它的内容」画出来。 -->
                  <span class="project-ridge" aria-hidden="true" />
                  <p v-if="(treeStatus[project.id] ?? 'loading') === 'loading'" class="tree-hint" :aria-label="t.workspace.treeLoading">{{ t.workspace.treeLoading }}</p>
                  <p v-else-if="treeStatus[project.id] === 'error'" class="tree-hint tree-hint--error">{{ t.workspace.treeError }}</p>
                  <p v-else-if="(projectRows[project.id] ?? []).length === 0" class="tree-hint">{{ t.workspace.treeEmpty }}</p>
                  <ul v-else class="entry-list">
                    <!-- 缩进每级 8px(--workspace-tree-step)。目录行是**整行一个 button**
                         (整行可点、aria-expanded 表达状态),chevron 只是行内纯指示;文件行是
                         只读展示行,靠等宽的前导槽位把标签推到与目录行同一左缘。 -->
                    <li
                      v-for="row in projectRows[project.id] ?? []" :key="row.id" class="entry-row"
                      :data-kind="row.kind" :style="{ '--workspace-tree-level': row.level }"
                    >
                      <!-- 目录行:整行 button —— 点任意位置(含最右缘)都折叠 / 展开。chevron 纯指示,
                           不加 aria-label(可访问名即目录名),展开态由 aria-expanded 表达。 -->
                      <button
                        v-if="row.expandable" type="button" class="entry-row__button"
                        :aria-expanded="isDirectoryExpanded(project.id, row.path)"
                        @click="toggleDirectory(project.id, row.path)"
                      >
                        <svg class="tree-caret" :class="{ 'is-open': isDirectoryExpanded(project.id, row.path) }" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                        <span class="entry-name">{{ row.name }}</span>
                        <span v-if="chipLabel(entryState(row))" class="entry-state" :data-state="entryState(row)">{{ chipLabel(entryState(row)) }}</span>
                      </button>
                      <!-- 文件行:整行一个 button —— 单击**预览**(占临时槽、斜体),双击**钉住**
                           (独占一格);键盘 Enter = 钉住。整行可点、悬停有反馈(与目录行同族的密集行,
                           故仍走 28px 的密集档)。前导内边距补上 chevron 槽,标签与同级目录行同左缘。 -->
                      <button
                        v-else type="button" class="entry-row__button entry-row__button--file"
                        :title="row.path"
                        @click="onFileRowClick(row, $event)"
                        @dblclick="onFileRowDblClick(row)"
                        @keydown="onFileRowKey($event, row)"
                      >
                        <span class="entry-name">{{ row.name }}</span>
                        <span v-if="chipLabel(entryState(row))" class="entry-state" :data-state="entryState(row)">{{ chipLabel(entryState(row)) }}</span>
                      </button>
                      <!-- 导引线:该行每条祖先层级各一段,铺满行高 —— 一层的所有子项(含最后一项)都被贯穿。 -->
                      <span class="entry-guides" aria-hidden="true"><span v-for="guide in row.level - 1" :key="guide" class="entry-guide" /></span>
                    </li>
                  </ul>
                </div>
              </li>
            </ul>
          </div>
          <button class="workspace-button open-project" @click="isPickerOpen = true">
            <span aria-hidden="true">＋</span><span>{{ t.workspace.openProject }}</span>
          </button>
        </section>
      </aside>
      <section class="conversation" :inert="isNarrow && isDrawerOpen">
        <header class="conversation-heading">
          <button v-if="isNarrow" ref="sidebarTrigger" class="workspace-button icon-button" :aria-label="t.workspace.openSidebar" :aria-expanded="isDrawerOpen" aria-controls="workspace-sidebar" @click="openDrawer">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <!-- 会话头 = 浏览器式 tab 条 + 常驻的溢出 / 搜索菜单钮 + ＋ 新建(都在组件内)。
               Agent 标识只由侧栏承担,头部不再有首字标记 / 副标题。 -->
          <ConversationSwitcher
            v-model:open="isSwitcherOpen"
            :sessions="sessions"
            :sessions-status="sessionStatus"
            :search-query="searchQuery"
            :search-hits="searchHits"
            :is-searching="isSearching"
            :active-id="activeId"
            :seen-sessions="seenSessions"
            :active-status="activeStatus"
            :closed-ids="closedIds"
            :format-time="formatTime"
            :active-title="activeTitle"
            :disabled="isBusy"
            @select="selectSession"
            @select-hit="openHit"
            @search-input="onSearchInput"
            @clear-search="clearSearch"
            @reset-search="resetSearch"
            @new-chat="newConversation"
            @close="closeTab"
          />
        </header>
        <!-- tabpanel 与会话头**同级**:tablist 不能是 tabpanel 的后代,否则 tab 的语义不成立。
             转录保留自己的 role="log" 与 tabindex,放进 tabpanel 内(一个角色套一个角色不冲突)。 -->
        <div ref="conversationPanel" class="conversation-panel" id="conversation-panel-body" role="tabpanel" :aria-labelledby="activeId ? `conversation-tab-${activeId}` : undefined">
          <!-- 转录区(与文件面板)单独包一层:文件面板要**精确**覆盖转录区(不含输入坞与流内区域),
               故需要一个与转录区等大的定位基准(见 .transcript-area)。 -->
          <div class="transcript-area">
          <div ref="log" class="transcript" role="log" aria-live="polite" :aria-label="t.workspace.transcript" tabindex="0" :data-state="transcript.status" @scroll="onScroll" @wheel.passive="onWheel" @keydown="onLogKey" @pointerdown="onLogPointerDown">
            <div class="transcript-inner">
              <div v-if="transcript.status === 'loading'" class="transcript-loading" :aria-label="t.workspace.loading" aria-busy="true"><p>{{ t.workspace.loading }}</p><NSkeleton text :repeat="3" :animated="false" /><NSkeleton text :repeat="5" :animated="false" /></div>
              <div v-else-if="transcript.status === 'error'" class="conversation-empty"><h2>{{ t.workspace.errorTitle }}</h2><p>{{ t.workspace.errorBody }}</p><button class="workspace-button retry-button" @click="retryWorkspace">{{ t.workspace.retry }}</button></div>
              <div v-else-if="transcript.status === 'empty'" class="conversation-empty"><h2>{{ t.workspace.emptyTitle }}</h2><p>{{ t.workspace.emptyBody }}</p><div class="suggestions"><button v-for="(suggestion, key) in t.workspace.suggestions" :key="key" class="suggestion-card" @click="useSuggestion(suggestion.body)"><strong>{{ suggestion.title }}</strong><span>{{ suggestion.body }}</span></button></div></div>
              <template v-else>
                <article v-for="message in transcript.messages" :key="message.id" class="chat-message" :class="[message.role, { 'is-highlighted': message.id === highlightTurnId }]" :aria-live="message.id === renderedResponse?.id && isGenerating ? 'off' : undefined" :data-message-id="message.id">
                  <!-- 圆形头像纯装饰:身份由下方可见的作者名给出,故 aria-hidden,避免屏幕阅读器重复朗读。 -->
                  <span class="message-avatar" aria-hidden="true">{{ message.role === 'user' ? avatarInitial(userName) : avatarInitial(assistantName) }}</span>
                  <div class="message-content">
                    <p class="message-meta">
                      <span class="message-author">{{ message.role === 'user' ? t.workspace.you : assistantName }}</span>
                      <span class="message-meta-sep" aria-hidden="true">·</span>
                      <time class="message-time" :datetime="message.createdAt">{{ formatMessageTime(message.createdAt) }}</time>
                    </p>
                    <div class="message-body">{{ message.body }}<span v-if="message.id === renderedResponse?.id && generation === 'streaming'" class="stream-cursor" aria-hidden="true" /></div>
                    <button v-if="message.id === renderedResponse?.id && generation === 'stopped'" class="workspace-button regenerate-button" :disabled="isSaving" @click="regenerate">{{ t.workspace.regenerate }}</button>
                  </div>
                </article>
                <!-- 「等待交互」确认卡:作为对话流里的一条,紧跟 Agent 最后一条消息之后。 -->
                <ConfirmationCard v-if="confirmation" :request="confirmation" :outcome="confirmationOutcome" @resolve="resolveConfirmation" />
                <!-- 处理后的 Agent 后续消息,排在确认卡留痕之后。 -->
                <article v-if="followUp" class="chat-message assistant" :data-message-id="followUp.id">
                  <span class="message-avatar" aria-hidden="true">{{ avatarInitial(assistantName) }}</span>
                  <div class="message-content">
                    <p class="message-meta">
                      <span class="message-author">{{ assistantName }}</span>
                      <span class="message-meta-sep" aria-hidden="true">·</span>
                      <time class="message-time" :datetime="followUp.createdAt">{{ formatMessageTime(followUp.createdAt) }}</time>
                    </p>
                    <div class="message-body">{{ followUp.body }}</div>
                  </div>
                </article>
                <div v-if="generation === 'queued'" class="queue-indicator" aria-live="off"><span aria-hidden="true">···</span>{{ t.workspace.queued }}</div>
              </template>
            </div>
          </div>
          <!-- 文件面板:覆盖在转录区之上(不是可拖拽的浮动窗口)。「已打开未显示」由文件栏的 tab
               承担,故它只有显示 / 不显示两态;Esc 关闭(见 onFilePanelEscape)。 -->
          <FilePanel
            v-if="isFilePanelOpen && activeFile"
            :state="fileContent"
            :path="activeFile.path"
            :project-name="activeFile.projectName"
            :chip-state="entryStateOfTab(activeFile)"
            :can-confirm="canConfirmActiveFile"
            :confirmation="confirmation"
            :confirmation-outcome="confirmationOutcome"
            @close="closeFilePanel"
            @retry="retryFile"
            @resolve="resolveConfirmation"
          />
          </div>
          <!-- 输入区(本轮重构):坞不再有独立的面(去掉底面与上边界,与转录区同色)。
               流内只留遥测条与提示行(状态信息压在滚动内容上会不可读,故不跟着悬浮);
               输入框改为**悬浮组件**,绝对定位在流内区域之上,多行时向上生长、不挤占流内区域。 -->
          <div class="composer-dock">
            <!-- 「回到底部」= **悬浮图标按钮**:绝对定位、水平居中于阅读列,浮在悬浮输入框**之上**
                 (两者不重叠,也不覆盖输入框 —— 业界把「遮住输入区」列为该模式的反例)。
                 它是独立控件,守 44×44;进 / 出只用 opacity + transform(动效白名单)。 -->
            <Transition name="scroll-to-bottom-pop">
              <button
                v-if="!isPinned && transcript.status === 'ready'"
                type="button" class="scroll-to-bottom" :aria-label="t.workspace.backToBottom" @click="returnToBottom"
              >
                <DliIcon name="arrowDown" />
              </button>
            </Transition>
            <!-- 悬浮输入框:自身抬起(elevated 底 + 发丝描边 + md 阴影 + 既有圆角)。发送不再有
                 独立按钮 —— 动作由 Enter 承担(提示行是唯一的发送提示);生成中的「停止」仍在框内。 -->
            <form ref="composerForm" class="composer-form" :title="t.workspace.inputHint" @submit.prevent="send">
              <div class="textarea-sizer" :data-value="(draft || t.workspace.placeholder) + ' '">
                <textarea id="workspace-composer" name="workspace-composer" ref="composer" v-model="draft" rows="1" :aria-label="t.workspace.inputLabel" :placeholder="t.workspace.placeholder" :readonly="isBusy || transcript.status === 'loading' || transcript.status === 'error'" @keydown="inputKeyboard" />
              </div>
              <button v-if="isGenerating" class="workspace-button send-button stop-button" type="button" :aria-label="t.workspace.stop" @click="stop"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" /></svg></button>
            </form>
            <!-- 流内区域(遥测条):留在文档流内、直接在面板底色上,几何不随输入高度变化。
                 状态信息压在滚动内容上会不可读,故它不跟着悬浮。 -->
            <div class="composer-inner">
              <p v-if="hasSendError" class="send-error" role="alert">{{ t.workspace.sendError }}</p>
              <!-- 遥测条:输入框下方的单行运行时信息,与输入框同宽、同一水平轴。只有状态项是
                   live region(状态 / 具体动作变化时播报);其余部分不做 live,避免整条太吵。 -->
              <div class="telemetry" role="group" :aria-label="t.workspace.telemetry.label">
                <div class="telemetry__status" role="status" aria-live="polite">
                  <span class="telemetry__status-head">
                    <span class="telemetry__dot" :data-level="statusLevel" aria-hidden="true" />
                    <span class="telemetry__word">{{ statusWord }}</span>
                  </span>
                  <!-- 动作文案是遥测条里第一个被收缩的项(见样式注释),窄宽度下会被省略号截断,
                       故补 title:悬停可读全文。状态词 / Context 文本另有不被裁的既有保护。 -->
                  <span v-if="statusDetail" class="telemetry__detail" :title="statusDetail">· {{ statusDetail }}</span>
                </div>
                <span v-if="runtime" class="telemetry__item telemetry__item--model"><span class="telemetry__sep" aria-hidden="true">│</span><span class="telemetry__model">{{ runtime.modelName }}</span></span>
                <span v-if="runtime" class="telemetry__item telemetry__item--context">
                  <span class="telemetry__sep" aria-hidden="true">│</span>
                  <span class="telemetry__context-text">{{ contextText }}</span>
                  <span class="telemetry__meter" role="progressbar" :aria-label="t.workspace.telemetry.context" :aria-valuenow="contextPercent" aria-valuemin="0" aria-valuemax="100"><span class="telemetry__meter-fill" :data-level="contextLevel" :style="{ width: `${contextPercent}%` }" /></span>
                </span>
                <span v-if="runtime" class="telemetry__item telemetry__item--elapsed"><span class="telemetry__sep" aria-hidden="true">│</span><span class="telemetry__elapsed">{{ formatElapsed(elapsed) }}</span></span>
                <!-- 项目项(最后一项):表达**当前项目**(CLI 运行的 cwd),不是 Agent 的某个工作区。
                     条内只显示项目名;完整路径放进 title(悬停可见)。 -->
                <span v-if="runtime" class="telemetry__item telemetry__item--workspace" :title="runtime.projectPath"><span class="telemetry__sep" aria-hidden="true">│</span><span class="telemetry__ws-name">{{ runtime.projectName }}</span></span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <!-- 文件栏(工作台级底栏·**常驻**):横跨侧栏左缘到对话面板右缘,纵向在两块面板之下 ——
           外壳网格的第三行(grid-column: 1 / -1),面与圆角沿用外壳的浮动面板语言。
           依据:Apple 的 Windows 规范把「横跨窗口宽度的底栏」当作状态栏的正当形态(Finder 即如此),
           同时告诫**不要把关键信息 / 动作只放在底栏** —— 所以它是文件导航面,而每个文件也都能从
           左侧项目树重新打开,不构成唯一入口。
           它**总是渲染**(没有打开的文件时显示教学性空态),故工作台几何恒定:首次打开文件不引起
           版面跳动,转录区几何与底部内缩都成为常量(内缩只算输入框那一段,底栏不在对话面板内)。 -->
      <div class="file-bar-dock">
        <FileBar
          :tabs="fileTabs"
          :active-key="activeFileKey"
          :current-project-id="selectedProjectId"
          :recent="recentForBar"
          :state-of="entryStateOfTab"
          :disabled="isBusy"
          @select="selectFileTab"
          @close="closeFileTab"
          @reorder="reorderFileTabs"
          @open-recent="openRecentFile"
        />
      </div>
    </div>
    <ProjectPickerDialog :open="isPickerOpen" :agent-id="selectedAgent" :open-paths="openProjectPaths" @confirm="confirmOpenProject" @cancel="isPickerOpen = false" />
  </main>
</template>

<style scoped>
.workspace-page {
  /* 组件级布局常量，不是全局设计 token；侧栏与窄屏抽屉共享同一宽度。 */
  --workspace-sidebar-width: 260px;
  /* 侧栏文件树的**行高**(密集档)。依据 design-language ⑥ 的触达尺寸规则:密集列表 / 树行是
     唯一的收窄例外,且取决于**输入方式** —— ≥1024px 的常驻侧栏面板是桌面指针环境,取 28px
     (判据圆 24px + 安全余量 4px,即相邻圆心距 28 > 24、两圆不相交);≤1023px 侧栏收成抽屉、
     进入触屏语境,回到 --dl-target-size(44px),不再享受例外(见页面底部 media query)。 */
  --workspace-tree-row-height: 28px;
  /* 项目树每级缩进:原为 --dl-space-3(12px),按用户反馈收到 8px(--dl-space-2),整体靠左起步。 */
  --workspace-tree-step: var(--dl-space-2);
  /* chevron 的**视觉占位宽度**(16px 图标 + 4px 间隙)。命中区仍是 44×44、用绝对定位挂在
     缩进列上,故「占位宽度」与「命中区」解耦 —— 缩进变浅不会牺牲指针目标。 */
  --workspace-tree-caret-slot: calc(var(--dl-icon-sm) + var(--dl-space-1));
  /* 导引线颜色:由三级文字色派生的低透明度中性线(照本仓 color-mix 风格),不新增 ramp 阶。 */
  --workspace-tree-guide: color-mix(in srgb, var(--dl-text-tertiary) 40%, transparent);
  /* 消息阅读列(正文列)上限:与 Claude.ai / ChatGPT 的 768px 对齐(ChatGPT 与 Claude.ai
     均约 768px、Perplexity 约 720px,业内共识区间 720–768px)。刻意宽于
     --dl-measure(35em,525px):chat 是短段落 + 列表的可扫读内容,不是连续中文长文。
     .transcript-inner 的内边距取 --workspace-gutter、max-width 取本值 + 2 × gutter,
     故正文列刚好封顶 768 且与 .composer-form(768)同轴 —— .message-body 自身不限宽,
     否则正文会被二次压回 525px。对话栏拆成下拉面板后阅读列不再被常驻子列挤占,
     故 1280 起即可达到此上限。 */
  --workspace-column-max: 768px;
  /* 横向 tab 条(会话头 / 文件底栏)共用的组件级自定属性。**定义在工作台根上**:文件底栏是
     侧栏与对话栏的兄弟节点(外壳网格第三行),不再是 .conversation 的后代,故这些值必须在
     三者的共同祖先上给出,两条栏才能共用同一套 tab 语言与紧凑档尺寸。
     --workspace-tab-min / -max:tab 的可用宽度区间。min 取 160px(≈10 个汉字)—— 调研里
       Firefox 的最小 tab 宽是 76px(英文 / 图标语境),中文标题取那个值会窄到不可读;max 取
       240px(浏览器常见上限)。脚本按这两个值算「能放下几个 tab」与每个 tab 的等宽宽。
     --workspace-tab-gap:tab 之间的一档间隙(圆角矩形之间要留缝,Chrome 的 tab 条同理)。
     --workspace-tab-divider:相邻非活动 tab 之间那条轻量分隔线的高度 = tab 高的一半(上下内缩、
       垂直居中),Material 3 的 inset divider 手法。
     --workspace-tab-reserved:tab 右侧为关闭钮**恒常预留**的槽宽 = 关闭钮 24 + 右侧内缩 4 + 与标题的
       间隙 4。恒常预留 → 悬停出现关闭钮时零重排。 */
  --workspace-tab-min: 160px;
  --workspace-tab-max: 240px;
  --workspace-tab-gap: var(--dl-space-1);
  --workspace-tab-divider: calc(var(--workspace-nav-control-size) / 2);
  --workspace-tab-reserved: calc(var(--dl-icon-lg) + 2 * var(--dl-space-1));
  /* 会话头 tab 条这一行的控件尺寸 = **紧凑导航行档**(32px),= 本仓设计语言的第三档触达尺寸:
     密集导航行(横向 tab 条)内的行内控件同样适用「密集行」的收窄例外,判据沿用 WCAG 2.5.8 的
     间距替代方案(相邻目标中心各画 24px 圆、两圆不相交)。横向排布下该判据天然成立:相邻 tab /
     控件的中心距 = 各自一半宽之 + 间隙,远大于 24px。因此本档**任何宽度都保持 32px** ——
     「≤1023 抽屉回到 44px」那条只针对**纵向密集行**(手指纵向落点精度低),横向 tab 条的目标
     又宽又高(≥157×32),不适用。作为对比:独立的顶栏语言钮、页面按钮仍守 --dl-target-size(44px)。
     取 32px 而非 44px 的依据:Chrome Compact Mode 正把 tab 条 / 工具栏压薄、Firefox 紧凑档 tab 条
     36px、Chrome 常态约 40px;32px 落在该区间下沿。 */
  --workspace-nav-control-size: 32px;
  /* 面板上下两条 chrome(会话 tab 栏 / 文件栏)共用的横向内边距:≥1024 为 24px、≤1023 收一档
     为 16px。定义在共同祖先上,两条栏因此**左右内容对齐**。 */
  --conversation-heading-pad: var(--dl-space-6);
  /* 头像尺寸与它到内容块的间隙;两者之和即**侧向 gutter**。头像以负外边距凸入该 gutter,
     故正文列宽度不因头像而被挤压 —— gutter 只是把阅读列两侧原有的留白从「纯空白」变成
     「结构性留白」(头像 + 间隙)。≤1023px 断点下头像降到 24px、间隙收到 8px,且不再拉负边距
     (窄宽度没有侧向留白可凸入),头像改为在行内占位(见页面底部 media query)。 */
  --workspace-avatar-size: 28px;
  --workspace-avatar-gap: var(--dl-space-3);
  --workspace-gutter: calc(var(--workspace-avatar-size) + var(--workspace-avatar-gap));
  /* 悬浮输入框:它与流内区域(遥测条 + 提示行)之间的间隙;高度默认取一档控件高,
     挂载后由 ResizeObserver 按实测覆盖。 */
  --composer-float-gap: var(--dl-space-4);
  --composer-float-height: var(--dl-target-size);
  /* 最后一条消息与悬浮输入框上缘之间的**留白**:用户要的「刚刚好的距离」——让文字亮度正常
     (见 .transcript 的淡出带起点 = 贴底静止位置)。取一档间距,可整体调大。 */
  --composer-clearance: var(--dl-space-3);
  /* 应用外壳内缩:面板从视口边缘退开 8px,16px 的面板圆角才看得见(贴边时靠视口
     的那两角等于直角,圆角无从体现)。取一档间距 token、不新增取值,左右各让出 8px。
     侧栏内边距随之由 24 收到 16:内缩 8 + 内边距 16 = 24 = --dl-chrome-gutter,
     侧栏内容(Agent 切换器、项目列表)因此仍与顶栏品牌落在同一条 24px 竖线上。 */
  --workspace-shell-inset: var(--dl-space-2);
  height: calc(100dvh - var(--dl-header-height) - var(--dl-border-width));
  min-height: 0;
}
/* 浮动面板式外壳:两侧各内缩一档、面板之间也留同宽的缝,让侧栏与对话区成为浮在同一
   底色画布上的两块面板(先例:shadcn/ReUI 的 inset app shell、Linear、ChatGPT)。 */
/* 外壳网格:两列(侧栏 / 对话)+ 两行(面板行 / 文件底栏行)。行间距与列间距、外壳内缩同值,
   故底栏与上方两块面板之间也是一条同宽的缝。 */
.workspace-layout { display: grid; grid-template-columns: var(--workspace-sidebar-width) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; height: 100%; padding: var(--workspace-shell-inset); gap: var(--workspace-shell-inset); }
/* 侧栏为一块独立圆角面板:四面发丝框 + xl 圆角,overflow 让内部滚动区与满宽分隔线
   被圆角裁切。横向 padding 由外壳 gutter(24)收到 16 —— 内缩 8 + 内边距 16 = 24,
   Agent 切换器与项目列表仍与顶栏品牌落在同一条 24px 竖线上。 */
.workspace-sidebar { min-height: 0; display: flex; flex-direction: column; background: var(--dl-bg-elevated); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); overflow: hidden; padding: var(--dl-space-4); gap: var(--dl-space-4); }
.workspace-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-height: var(--dl-target-size); min-width: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-button:hover, .suggestion-card:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.workspace-button:active, .suggestion-card:active { transform: translateY(var(--dl-lift-press)); }
.workspace-button:focus-visible, .suggestion-card:focus-visible, textarea:focus-visible, .transcript:focus-visible { box-shadow: var(--dl-focus-ring); }
.workspace-button:disabled, .workspace-button[aria-disabled='true'] { cursor: not-allowed; color: var(--dl-text-disabled); background: var(--dl-bg-sunken); transform: none; }
/* position: relative 是 AgentSelector 弹层的定位基准:弹层横向贴齐本行、纵向落在其下方。
   以整行为基准是为了让弹层始终落在侧栏面板的 overflow: hidden 边界之内 —— 触发钮的具体
   位置会随窄屏关闭按钮的有无而变化,以它为基准会把英文弹层推出面板。 */
.sidebar-actions { display: flex; gap: var(--dl-space-2); position: relative; }
/* 区块标题:文案居中,左右各一条 1px 虚线。**虚线是本设计语言里新引入的视觉装置,且是用户
   指定的区块分隔装置** —— 原语言以实线发丝分层级,此处按用户要求引入 dashed,只用于这一处
   区块标题,不扩散到别处。两侧用 ::before / ::after 作等分填充:文案长短变化时虚线自动伸缩;
   nowrap 保证窄宽度(375 / 抽屉)下不把标题挤成两行。 */
.sidebar-label { display: flex; align-items: center; gap: var(--dl-space-2); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); font-weight: 500; letter-spacing: var(--dl-tracking-label); white-space: nowrap; }
.sidebar-label::before, .sidebar-label::after { content: ''; flex: 1 1 0; min-width: 0; border-block-start: var(--dl-border-width) dashed var(--dl-border-base); }
.sidebar-hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.sidebar-loading { display: grid; gap: var(--dl-space-4); }
/* 项目区:占满侧栏剩余高度,项目列表自身滚动,底部「打开项目」常驻。
   gap 由 12 收到 8:区块标题与首个项目之间的留白是「非行高」留白,按 4/8 档收紧。 */
.workspace-projects { display: flex; flex-direction: column; gap: var(--dl-space-2); min-height: 0; flex: 1; }
.project-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.project-list { display: flex; flex-direction: column; gap: var(--dl-space-2); padding: var(--dl-space-1); margin: calc(-1 * var(--dl-space-1)); }
/* 项目行:单控件行的外壳 —— 前导记号 + 名称 + ⋯ 槽位 + chevron 合成**一个**按钮,右侧 ⋯ 是
   独立控件(不能嵌进按钮,否则是嵌套 button 的非法结构),绝对定位覆盖在按钮预留的槽位上。
   选中项目沿用会话项的选中语言(强调色左竖条 + 浅强调底);竖条位置恒常预留(未选中时透明),
   避免左右跳动。行高按 --dl-target-size(44px)、**不随文件树收窄**:它承载独立的 ⋯ 操作按钮
   (图标按钮,按触达规则不落入密集例外,仍是 44×44)。若把本行降到 32px,⋯ 命中区会溢出到相邻
   行、与邻行的 ⋯ 重叠(判据②「相邻目标不重叠」不成立);维持 44px 时行距 44 > 24,判据成立。
   44 与树行 28 的**高度差本身也是层级信号**。 */
.project-row { position: relative; display: flex; align-items: center; min-height: var(--dl-target-size); padding-inline-end: var(--dl-space-2); border-inline-start: var(--dl-space-1) solid transparent; border-radius: var(--dl-radius-sm); }
.project-item.is-current .project-row { border-inline-start-color: var(--dl-accent); background: var(--dl-accent-soft); }
/* 项目行按钮 = 前导记号 + 名称 + ⋯ 槽位 + chevron。左内边距 4px 使记号落在 [8,24],与树
   level-1 目录行的 caret 列(同为 [8,24])重合 —— 项目行因此读作树的根节点,记号列与标签列
   都与 level-1 对齐(项目名与 level-1 名称同在 28px 竖线上,树 level-1 相对项目名不缩进)。 */
.project-row__button { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--dl-space-1); padding-inline-start: var(--dl-space-1); min-height: var(--dl-target-size); text-align: left; border-radius: var(--dl-radius-sm); }
/* 前导记号:中性的「工作区」记号(grid 图标,16px)。树里没有任何图标,故这一个记号就是最强的
   区分信号。颜色走三级文字色、**不用强调色** —— 选中态已由行底色 + 左侧色条表达,再加强调色
   记号会让一行上强调色过多。 */
.project-row__mark { flex-shrink: 0; color: var(--dl-text-tertiary); }
/* 排印分级:项目行 13px / 600,树行 12px / 400 —— 名称的字号与字重是第一眼可辨的层级信号。 */
.project-row__name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--dl-font-size-sm); font-weight: 600; color: var(--dl-text-primary); }
.project-row__button[aria-current='true'] .project-row__name { color: var(--dl-accent); }
/* ⋯ 槽位:常驻预留(不可见但占位),⋯ 控件绝对定位覆盖其上 —— 悬停时整行不产生位移。 */
.project-row__slot { flex-shrink: 0; width: var(--dl-target-size); height: var(--dl-target-size); }
/* chevron 在行尾(手风琴惯例),与树行行首的 chevron 以**位置本身**作信号。 */
.project-row__caret { flex-shrink: 0; color: var(--dl-text-secondary); }
.project-row__button:focus-visible, .entry-row__button:focus-visible { box-shadow: var(--dl-focus-ring); }
.tree-caret { width: var(--dl-icon-sm); height: var(--dl-icon-sm); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.tree-caret path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
.tree-caret.is-open { transform: rotate(90deg); }
/* ⋯ 覆盖在按钮预留的槽位上:右缘 = 行右内边距(8) + chevron 列(16 + 4) —— 与按钮里
   槽位/chevron 的排布同一套取值,故 ⋯ 恒落在槽位正中。transform 会为 .project-menu 建立
   层叠上下文,把内部浮层的 z-index 困在其中;显式给本行层序,--dl-z-overlay 才能相对
   「树行的定位盒」生效(否则浮层会被 DOM 顺序在后的 .project-tree 盖住,点不中)。 */
.project-row .project-menu { position: absolute; inset-block-start: 50%; inset-inline-end: calc(var(--dl-space-2) + var(--dl-icon-sm) + var(--dl-space-1)); transform: translateY(-50%); z-index: var(--dl-z-overlay); }
/* ⋯ 按钮平时透明,行悬停 / 键盘聚焦时显现(仍可 Tab 到达,见 project-menu.vue)。 */
.project-row:hover .project-menu, .project-row:focus-within .project-menu { opacity: 1; }
/* 项目文件树:挂在项目行下方。上下各一档留白(4px):下留白把文件树贴近项目行(它是项目行的
   所属内容),上留白由 .project-list 的 8px 行间距给出 —— 满足 USWDS 的标题归属规则(标题离其
   所属内容的距离要近于离上一段内容,上方留白 ≥ 下方留白 × 1.5)。 */
.project-tree { position: relative; display: flex; flex-direction: column; padding-block: var(--dl-space-1); }
/* 收纳脊线:展开项目的内容区左侧一条竖向发丝线,从项目行下沿一直贯到该项目的树末尾,把
   「这些是它的内容」画出来。x = --workspace-tree-step(= 8px):与项目行前导记号列的左缘、树
   level-1 目录行 caret 列的左缘、以及树自身的逐级导引线(同样起于 8px)连成一条连续线索。
   纯装饰:aria-hidden 且不接收指针事件。折叠时容器 v-show 隐藏,脊线随之消失。 */
.project-ridge { position: absolute; inset-block: 0; inset-inline-start: var(--workspace-tree-step); width: var(--dl-border-width); background: var(--workspace-tree-guide); pointer-events: none; }
.tree-hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); padding: var(--dl-space-1) var(--dl-space-2); }
.tree-hint--error { color: var(--dl-error); }
.entry-list { display: flex; flex-direction: column; }
/* 条目行:行内只有一个整行控件(目录行)或一个只读展示行(文件行);缩进由子元素按
   --workspace-tree-step(8px)给出。行本身承担 position:relative,供导引线绝对定位。 */
.entry-row { position: relative; display: flex; }
/* 目录行 = **整行一个 button**:整行都是命中区(不是只有文字 / chevron 可点),aria-expanded
   表达展开态。这是密集档能成立的前提(design-language ⑥ 判据①「整行为命中区」),也是
   Primer TreeView 的原话:节点若没有「激活」动作,点它任意位置都应当展开它 —— 目录行正是
   这种节点。上一轮那个独立的 44×44 chevron 命中区已删:它在 28px 行距下会与相邻行重叠,
   直接违反判据②。chevron 退化为行内纯指示(aria-hidden)。 */
.entry-row__button { display: flex; align-items: center; gap: var(--dl-space-1); width: 100%; min-height: var(--workspace-tree-row-height); padding-inline-start: calc(var(--workspace-tree-level) * var(--workspace-tree-step)); padding-inline-end: var(--dl-space-2); text-align: left; color: var(--dl-text-secondary); border-radius: var(--dl-radius-sm); }
.entry-row__button:hover { background: var(--dl-bg-hover); }
.entry-row__button:hover .tree-caret { color: var(--dl-text-primary); }
.entry-row__button:active { background: var(--dl-bg-sunken); }
/* 导引线:该行每条祖先层级各一段(每条宽 8px),贴在该级缩进列上、铺满行高;每行都为自己
   所有祖先层各画一段,故一层的所有子项(含最后一项)都被同一条竖线贯穿,不会漏线。
   纯装饰:aria-hidden 且不接收指针事件(在整行按钮之上也不挡点击)。 */
.entry-guides { position: absolute; inset-block: 0; inset-inline-start: var(--workspace-tree-step); display: flex; pointer-events: none; }
.entry-guide { width: var(--workspace-tree-step); border-inline-start: var(--dl-border-width) solid var(--workspace-tree-guide); }
/* 文件行是**只读展示行**:非交互元素(span),不可聚焦、不可点、无悬停反馈。前导内边距等于
   目录行的「缩进 + chevron 槽」(图标 16 + 间隙 4 = --workspace-tree-caret-slot),于是同级
   「文件夹与文件」的标签左缘由同一公式给出、天然对齐 —— 不是靠给叶子补等宽空位。 */
/* 文件行是**整行 button**(本轮改动:双击 / Enter 打开该文件),左内边距在目录行的「缩进 +
   chevron 槽」之上再加一份 chevron 槽 —— 文件行没有 chevron,靠这段等宽前导把标签推到与同级
   目录行同一左缘(不是给叶子补空位,而是同一个公式)。 */
.entry-row__button--file { padding-inline-start: calc(var(--workspace-tree-level) * var(--workspace-tree-step) + var(--workspace-tree-caret-slot)); }
/* 树行的名称(目录与文件同档):12px / 400 —— 与项目行的 13px / 600 形成排印分级,
   让「项目是上下文、树行只是文件结构」一眼可辨。 */
.entry-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--dl-font-size-xs); font-weight: 400; color: var(--dl-text-primary); }
/* 状态芯片:created 走强调色、modified 走暖珀提示色、pending 走强调色描边 + 浅强调底;
   none 不渲染芯片。均为语义角色层 token。芯片是静态信息,不做悬停 / 按压反馈。 */
.entry-state { flex-shrink: 0; padding: 0 var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); color: var(--dl-text-secondary); }
.entry-state[data-state='created'] { color: var(--dl-accent); }
.entry-state[data-state='modified'] { color: var(--dl-warning); }
.entry-state[data-state='pending'] { color: var(--dl-accent); border-color: var(--dl-accent); background: var(--dl-accent-soft); }
.open-project { width: 100%; justify-content: center; flex-shrink: 0; }
/* 对话面板:外层是面板(四面发丝框 + xl 圆角),纵向分成 [会话头(tablist)| tabpanel]。
   刻意不给本面板加 overflow: hidden。子元素里的 .transcript 是可 Tab 聚焦的滚动区,
   它的 :focus-visible 焦点环是用外阴影实现的、向元素外扩张 —— 面板一旦裁切,环的左右
   两条竖边会整条消失、只剩上下两条横线,即基线 ⑦ 明令禁止的「吞焦点样式」。 */
.conversation { display: flex; flex-direction: column; min-width: 0; min-height: 0; border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated);
}
/* tabpanel:转录 + composer 这一整块。
   这里定义**内缩基准值** `--composer-inset`,并派生出淡出带的位置。同一个值喂三处
   (都落在 .transcript 上):
     ① padding-block-end —— 滚到底时最后一条消息落在输入框之上的**留白处**;
     ② scroll-padding-block-end —— 浏览器自身的**滚动定位**(键盘聚焦 / scrollIntoView /
        以及本项目「搜索正文命中 → 跳到该轮并高亮」)也不把目标落到输入框底下。
        只给 ① 只能保证「滚到底」不被盖,滚动定位仍会落到输入框下 —— 两者必须成对给,
        依据是 W3C 的 WCAG 技术 C43「用 CSS scroll-padding 解除内容遮挡」;
     ③ 遮罩的**实心色标**(淡出带起点)。
   `--composer-inset` = 转录区底边到**悬浮输入框**顶缘的距离(输入框高度 + 它与坞顶的间隙)
   + 留白。**不能只取输入框高度**:输入框并不贴着转录区底边(其下方还有遥测条 / 文件栏所在的
   坞内区间),少算这段就会让最后一行贴得比预期近。
   文件栏(常驻)的高度**不在这里再计一次** —— 它停靠在坞的文档流最底下(见 .file-bar-dock),
   坞顶 = 转录区底边因此是**常量**;输入框锚在坞顶之上,也跟着恒定。若把坞内那一段再写进内缩,
   等于重复计一次,会把最后一条消息多顶出一整个坞的高度。
   定义在共同祖先上(而非 .transcript 内),让三处引用的是同一个已解析值。 */
.conversation-panel { --composer-inset: calc(var(--composer-float-height) + var(--composer-float-gap) + var(--composer-clearance)); --composer-bleed: var(--dl-space-1); flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
/* 转录区(与文件面板)的盒子:与转录区等大,作为文件面板**精确覆盖转录区**的定位基准
   (不含输入坞与流内区域)。刻意不给它 overflow:hidden —— 转录区 :focus-visible 的焦点环是
   向外画的 box-shadow,裁切会把环的左右两条竖边整条抹掉(见 .conversation 上不出 overflow 的注释)。
   文件面板的尺寸由上下锚点算出、本就不越界,不依赖裁切兜底。 */
.transcript-area { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; }
/* 会话头 = [汉堡?][tab 条][＋][菜单钮],它自己也是 tablist 的容器行。align-items: center
   让 tab 与右端控件在同一水平轴上居中。
   高度 = 上内边距 4(--dl-space-1)+ 控件高 32(紧凑导航行档)+ 下内边距 8(--dl-space-2)= 44px。
   **下内边距就是「tab 与对话内容之间那道间隔」**——本行的 border-bottom 已去掉(不再有贴着 tab
   的横线),那条发丝分界线移到转录区自己的 border-block-start 上,于是视觉顺序是
   「tab 药丸 → 8px 间隔 → 分界线 → 对话内容」,间隔实打实存在,分界线归属内容区
   (符合 tab 规范「用边线把 tab 列表与其内容面板关联起来」)。Chrome 的设计轨迹同向:2018 起 tab
   去尖角改圆角矩形、2023 刷新让非活动 tab 更圆并带悬浮感、当前的 Desktop Glow Up 有「Detached
   Tabs」(活动 tab 从条里分离)与「>6 个 tab 自动隐藏分隔线」;而「主内容区圆角」特性正是用留缝
   把地址栏与内容分成两块面 —— 本行取的是留缝这一半(不做面的区分,见转录区注释)。
   上内边距 4px 是**焦点环的下限**:tab 的 :focus-visible 环向外扩 3px,4 > 3 才完整可见。
   position: relative 是菜单浮层的定位基准。
   --conversation-heading-pad 驱动本行的横向内边距(窄屏收一档),也被浮层的定位复用。 */
.conversation-heading { position: relative; display: flex; align-items: center; gap: var(--dl-space-3); padding: var(--dl-space-1) var(--conversation-heading-pad) var(--dl-space-2); }
.icon-button { padding: var(--dl-space-2); flex-shrink: 0; }
.workspace-button svg { width: var(--dl-icon-md); height: var(--dl-icon-md); flex-shrink: 0; }
.workspace-button svg path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
/* 转录区自己带上边界的发丝线:tab 条与会话内容之间的分界线归属**内容区**(tab 规范:用边线把
   tab 列表与其内容面板关联起来),于是头部只需留出间隔、不再画贴边的横线。
   刻意**不给转录区加下沉底色或圆角面板**:本仓踩过「面板 overflow: hidden 裁掉后代焦点环」的坑
   (见 conversation 容器上关于不出 overflow 的注释),面与面的区分留白 + 一条分界线已足够。
   底部内缩与滚动内缩成对给(见 .conversation-panel 的注释):滚到底不被悬浮输入框遮住,
   且浏览器自身的滚动定位(键盘 / scrollIntoView / 搜索命中跳转)也落在输入框之上。
   内容淡出用 mask-image(而非半透明遮罩层):它真的淡出内容本身、让背景自然透出,且不干扰
   文字选择与指针事件(Chrome 团队现代 Web 指引;shadcn/ui 2026-06 的聊天组件亦带 scroll-aware
   边缘淡出)。**淡出必须「先实心、后淡出」**:第一个色标是实心的(在 `100% - 内缩值` 处,
   = 最后一条消息贴底时的静止位置),淡出只发生在该点之后。若写成两色标(直接 #000 → transparent),
   压暗会铺满整个下半区、把可读正文逐级压暗 —— 正是用户报的「最后一行被光晕遮暗」。
   不变量:淡出带起点 == 贴底静止位置 → 最后一行静止时透明度 1.0(亮度正常),淡出只作用于
   已在输入框背后 / 即将进入的内容。淡出**收到输入框上缘为止**(而非到容器底边):输入框上缘
   以下保持不透明 —— 那一带本就被输入框盖住,且这样才能保住转录区向外的 :focus-visible 焦点环。
   遮罩盒比边框盒外扩 --composer-bleed 并 no-clip:否则 mask 会把焦点环整条抹掉(基线 ⑦ 禁止
   吞焦点样式)。已知副作用:mask 连滚动条一起淡出,淡出带很窄且落在输入框背后,故按原样保留。 */
.transcript { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; overflow-anchor: none; scrollbar-gutter: stable; border-block-start: var(--dl-border-width) solid var(--dl-border-base); padding-block-end: var(--composer-inset); scroll-padding-block-end: var(--composer-inset); mask-image: linear-gradient(to bottom, #000 calc(100% - var(--composer-bleed) - var(--composer-inset)), transparent calc(100% - var(--composer-bleed) - var(--composer-inset) + var(--composer-clearance)), #000 calc(100% - var(--composer-bleed) - var(--composer-inset) + var(--composer-clearance))); mask-repeat: no-repeat; mask-clip: no-clip; mask-size: calc(100% + 2 * var(--composer-bleed)) calc(100% + 2 * var(--composer-bleed)); mask-position: calc(-1 * var(--composer-bleed)) calc(-1 * var(--composer-bleed)); }
/* 阅读列的底部内缩改由**滚动容器** .transcript 承担(padding-block-end 与
   scroll-padding-block-end 成对在那一层);这里只保留上内边距与横向内边距,避免两层叠加。 */
/* 阅读列的横向内边距 = 侧向 gutter(--workspace-gutter):正文列封顶 768、两侧各留一档
   gutter 作结构性留白(头像凸入其中)。max-width 相应放宽到 768 + 2 × gutter,故正文列
   仍**居中在同一位置**、与 .composer-form(768)保持同轴(见页面底部的同轴断言)。 */
.transcript-inner { width: 100%; max-width: calc(var(--workspace-column-max) + 2 * var(--workspace-gutter)); margin-inline: auto; padding: var(--dl-space-8) var(--workspace-gutter) 0; display: flex; flex-direction: column; gap: var(--dl-space-8); }
.transcript-loading { display: grid; gap: var(--dl-space-6); color: var(--dl-text-secondary); }
/* 消息行 = 头像 + 内容块两栏。头像是固定尺寸的 flex 项、内容块吃满剩余宽;正文因此恒为
   阅读列宽(768),头像不挤压它 —— 头像被负外边距拉进侧向 gutter(见下)。 */
.chat-message { display: flex; align-items: flex-start; min-width: 0; width: 100%; line-height: var(--dl-line-body); }
.message-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
/* 用户侧是助手侧的**镜像**(气泡在右、头像在右)—— iMessage / WhatsApp / Slack 的既有 UX:
   左右分栏是「用户 vs 生成式 AI」的通用区分法(Cloudscape 生成式 AI 聊天规范专有一节)。 */
.chat-message.user { flex-direction: row-reverse; }
/* 圆形头像:发丝描边 + 中性面,靠**首字**区分(强调色只承担「可操作」语义,不给 Agent 上色)。
   助手侧略深(sunken)、用户侧略浅(hover),两种中性处理,不新增色相。 */
.message-avatar { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; inline-size: var(--workspace-avatar-size); block-size: var(--workspace-avatar-size); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); font-size: var(--dl-font-size-xs); font-weight: 500; color: var(--dl-text-primary); }
/* 负外边距把头像拉进阅读列两侧的 gutter(宽 = 头像 + 间隙),于是正文列宽保持 768 不变。
   助手:头像在左、凸入左 gutter;用户:镜像 —— 头像在右、凸入右 gutter。 */
.chat-message.assistant .message-avatar { margin-inline: calc(-1 * var(--workspace-gutter)) var(--workspace-avatar-gap); background: var(--dl-bg-sunken); }
.chat-message.user .message-avatar { margin-inline: var(--workspace-avatar-gap) calc(-1 * var(--workspace-gutter)); background: var(--dl-bg-hover); }
/* 用户气泡:背景 / 圆角 / 内边距落在**内容块**上(而非整行),故头像与气泡彼此独立、互不包裹。 */
.chat-message.user .message-content { align-items: flex-end; }
.chat-message.user .message-body { width: fit-content; max-width: 80%; border-radius: var(--dl-radius-lg); padding: var(--dl-space-3) var(--dl-space-4); background: var(--dl-bg-hover); }
/* 搜索命中的轮次高亮:静态描边(不做过渡 / 动画),reduced-motion 下同样可见。 */
.chat-message.is-highlighted { outline: var(--dl-border-width) solid var(--dl-accent); outline-offset: var(--dl-space-2); border-radius: var(--dl-radius-md); }
/* 作者名 + 时间戳的顶部行。身份由**可见的作者名**给出(头像纯装饰、aria-hidden,读屏不重复朗读);
   用户侧右对齐(与气泡同侧)、DOM 顺序不变。 */
.message-meta { display: flex; align-items: baseline; gap: var(--dl-space-2); margin-bottom: var(--dl-space-2); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.message-author { color: var(--dl-text-primary); font-weight: 500; }
.message-meta-sep { color: var(--dl-text-tertiary); }
/* 时间戳走等宽字体 + 等宽数字:本仓「技术信息一律走等宽」,时间戳属技术信息,且数值变化时列宽不跳动。 */
.message-time { color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; }
.message-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.stream-cursor { display: inline-block; vertical-align: baseline; width: var(--dl-space-2); height: var(--dl-font-size-md); margin-left: var(--dl-space-1); background: var(--dl-accent); }
.queue-indicator { display: flex; align-items: center; gap: var(--dl-space-3); color: var(--dl-text-secondary); }
.queue-indicator > span { font-size: var(--dl-font-size-2xl); letter-spacing: var(--dl-tracking-caps); }
.regenerate-button { margin-top: var(--dl-space-3); }
.conversation-empty { display: grid; gap: var(--dl-space-4); padding-block: var(--dl-space-8); }
.conversation-empty h2 { font-size: var(--dl-font-size-xl); line-height: var(--dl-line-body); font-weight: 500; }
.conversation-empty > p { color: var(--dl-text-secondary); }
.retry-button { justify-self: start; }
.suggestions { display: grid; gap: var(--dl-space-3); margin-top: var(--dl-space-4); }
.suggestion-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--dl-space-2); text-align: left; padding: var(--dl-space-4); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); min-height: var(--dl-target-size); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.suggestion-card strong { font-size: var(--dl-font-size-md); font-weight: 500; }
.suggestion-card > span:first-of-type { grid-row: 2; color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
/* 输入坞(本轮重构):**不再有独立的面** —— 去掉底面与上边界,与转录区同色(继承面板底色),
   即用户所说的「删掉这个区域」。它现在只是流内区域(遥测条 + 提示行)的容器 + 悬浮件的定位基准。
   提示行与遥测条留在文档流内:状态信息若压在滚动内容上会不可读,故不跟着悬浮。 */
.composer-dock { position: relative; flex-shrink: 0; }
/* 流内区域:限宽居中;上内边距为 0,让遥测条紧贴坞顶,悬浮输入框与它之间的间隔由
   --composer-float-gap 单独给出(见 .composer-form 的 inset-block-end)。 */
.composer-inner { max-width: calc(var(--workspace-column-max) + 2 * var(--dl-space-6)); margin-inline: auto; padding: 0 var(--dl-space-6) var(--dl-space-4); }
/* 遥测条:输入框下方的单行运行时信息(状态 · 模型 · Context · 时长 · 项目)。与输入框同宽
   同轴(同在 .composer-inner 的限宽列内);高度守在 28–32px,取 --dl-space-8(32px)。
   降级按遥测条「自身可用宽度」决定(容器查询),而非视口宽度 —— 遥测条住在阅读列内,可用宽
   上限 = --workspace-column-max 768 + 两侧内边距,宽视口(1280/1600)下也装不下五项。
   收缩优先级:状态的具体动作文案最先省略,其次项目名;状态词与 Context 文本永不省略。 */
.telemetry { display: flex; align-items: center; gap: var(--dl-space-2); min-height: var(--dl-space-8); margin-top: var(--dl-space-2); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); color: var(--dl-text-secondary); overflow: hidden; container-type: inline-size; }
/* 状态项用 grid:第一列 auto 承载圆点 + 状态词(never 收缩),第二列 minmax(0,1fr) 承载动作
   文案(可缩到 0)。改 grid 而非 flex 是因为 flex 容器的 min-content 会把 nowrap 的动作文案
   也算进去,导致状态项的收缩下限被动作文案撑大 —— 那样状态词反而会被挤出。grid 的 min-content
   只等于第一列(状态词),min-width: min-content 因此恰好把下限锁在「圆点 + 状态词」。
   收缩权重远高于项目项:空间不足时先吃掉动作文案,动作缩尽后才轮到项目名。 */
.telemetry__status { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; column-gap: var(--dl-space-2); flex: 0 1000 auto; min-width: min-content; }
.telemetry__status-head { display: inline-flex; align-items: center; gap: var(--dl-space-2); white-space: nowrap; }
/* 状态圆点:强调色只承担活动指示(思考中 / 输出中),等待确认走警告色,空闲 / 已停止走中性。 */
.telemetry__dot { flex-shrink: 0; width: var(--dl-space-2); height: var(--dl-space-2); border-radius: var(--dl-radius-pill); background: var(--dl-text-tertiary); }
.telemetry__dot[data-level='accent'] { background: var(--dl-accent); }
.telemetry__dot[data-level='warning'] { background: var(--dl-warning); }
.telemetry__word { flex-shrink: 0; color: var(--dl-text-primary); font-weight: 500; }
.telemetry__detail { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.telemetry__item { display: inline-flex; align-items: center; gap: var(--dl-space-2); flex-shrink: 0; white-space: nowrap; }
.telemetry__sep { color: var(--dl-text-disabled); }
.telemetry__context-text, .telemetry__elapsed { font-variant-numeric: tabular-nums; }
/* 用量条:轨道用下沉底,填充按用量分级着色(状态色表达「结果」,不用强调色)。 */
.telemetry__meter { display: inline-block; width: var(--dl-space-12); height: var(--dl-space-1); border-radius: var(--dl-radius-pill); background: var(--dl-bg-sunken); overflow: hidden; }
/* 填充比例是数据(用量分数),经内联 width 绑定;颜色始终走语义 token,分级由 data-level 决定。 */
.telemetry__meter-fill { display: block; height: 100%; border-radius: var(--dl-radius-pill); background: var(--dl-info); }
.telemetry__meter-fill[data-level='warning'] { background: var(--dl-warning); }
.telemetry__meter-fill[data-level='error'] { background: var(--dl-error); }
/* 项目项可收缩(名称省略号);收缩权重低 —— 只在动作文案已缩尽后才被压缩。
   条内不显示完整路径(路径放进该项的 title,悬停可见)。 */
.telemetry__item--workspace { flex: 0 1 auto; min-width: 0; }
.telemetry__ws-name { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* 降级按遥测条自身宽度(容器查询),逐项降低优先级;状态项与 Context 在任何宽度都不隐藏:
   1) 先隐用量条(百分比文本已承载用量);2) 再隐时长;3) 再隐模型;4) 最后隐项目项。 */
@container (max-width: 611px) { .telemetry__meter { display: none; } }
@container (max-width: 555px) { .telemetry__item--elapsed { display: none; } }
@container (max-width: 486px) { .telemetry__item--model { display: none; } }
@container (max-width: 359px) { .telemetry__item--workspace { display: none; } }
.send-error { color: var(--dl-error); margin-bottom: var(--dl-space-2); font-size: var(--dl-font-size-sm); }
/* 悬浮输入框(本轮重构):绝对定位在流内区域**之上**,自身抬起(elevated 底 + 发丝描边 +
   md 阴影 + lg 圆角),多行时向上生长 —— 它不占流内布局,故遥测条 / 提示行的几何不随输入高度变化。
   inset-inline + margin-inline:auto + max-width 让它在坞内居中、并与阅读列同宽同轴
   (与 .transcript-inner / .composer-inner 的限宽列对齐)。 */
.composer-form { position: absolute; inset-inline: var(--dl-space-6); inset-block-end: calc(100% + var(--composer-float-gap)); margin-inline: auto; max-width: var(--workspace-column-max); display: flex; align-items: flex-end; gap: var(--dl-space-2); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-md); }
/* 文件栏(停靠·整宽):坞的最后一个文档流子项 —— 于是它的底边**就是**面板内容盒的底边
   (面板无内边距,坞是它的最后一个子项),即贴住面板描边内侧。
   面:不新上填充色,取面板自身底色(--dl-bg-elevated)+ 顶边一条 --dl-border-base 发丝线
   —— 与转录区上边界同一套层级语言。
   底角同心:面板圆角 16 − 描边 1 = 15(与面板内缘同心,贴边时才不会露出直角)。
   横向内边距取 --conversation-heading-pad,栏内内容因此与会话头内容**左右对齐**。 */
/* 文件栏(工作台级底栏):外壳网格的第三行,横跨侧栏左缘到对话面板右缘 —— 面与圆角沿用外壳的
   浮动面板语言(与两块面板同族的圆角 + 发丝线)。它**不在**对话面板内部,故转录区的底部内缩
   也不再与它相干(内缩只算悬浮输入框那一段,见 .conversation-panel 的注释)。
   横向内边距取一档间距(16):与侧栏的内容左缘对齐(侧栏自身的内边距也是 16)。 */
.file-bar-dock {
  grid-column: 1 / -1;
  padding: var(--dl-space-2) var(--dl-space-4);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  background: var(--dl-bg-elevated);
}
.textarea-sizer { display: grid; flex: 1; min-width: 0; max-height: calc(5 * var(--dl-font-size-md) * var(--dl-line-body) + 2 * var(--dl-space-2)); overflow: hidden; }
.textarea-sizer::after { content: attr(data-value); visibility: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.textarea-sizer::after, textarea { grid-area: 1 / 1; font: inherit; line-height: var(--dl-line-body); padding: var(--dl-space-2); min-height: var(--dl-target-size); min-width: 0; border: 0; }
textarea { width: 100%; height: 100%; max-height: inherit; resize: none; color: var(--dl-text-primary); background: transparent; overflow-y: auto; border-radius: var(--dl-radius-sm); }
textarea::placeholder { color: var(--dl-text-secondary); }
textarea:hover:not(:read-only) { background: var(--dl-bg-hover); }
textarea:read-only { color: var(--dl-text-secondary); }
.send-button { flex-shrink: 0; padding: var(--dl-space-2); background: var(--dl-accent); color: var(--dl-text-on-accent); border-color: transparent; }
.send-button:hover { background: var(--dl-accent-hover); }
.stop-button svg { fill: currentColor; }
/* 「Enter 发送 · Shift+Enter 换行」不再占一行:那句移到 .composer-form 的 title(悬停可得)
   —— 删掉发送钮之后,这条提示是「Enter 能发送」的唯一线索,不能连同那行一起消失。 */
/* 「回到底部」悬浮图标按钮:绝对定位、水平居中于阅读列,浮在**悬浮输入框之上**
   (底边 = 坞顶边 − 间隙 − 输入框高 − 8),故不覆盖输入框、两者不重叠。坞横跨面板宽、
   .composer-inner 限宽居中,两者中心重合,故 50% + translateX(-50%) 即对齐阅读列。
   它是独立控件,取 44×44(pill 圆形),不落入紧凑导航行档。
   transform 基值承担居中(translateX(-50%)),按压 / 进出场在同一 transform 上叠加纵向位移
   (translate 属性会与 transform 分离,但白名单只认 transform,故统一写在 transform 上)。 */
.scroll-to-bottom {
  position: absolute;
  inset-block-end: calc(100% + var(--composer-inset) + var(--dl-space-2));
  inset-inline-start: 50%;
  z-index: var(--dl-z-sticky);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: var(--dl-target-size);
  block-size: var(--dl-target-size);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-pill);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  box-shadow: var(--dl-shadow-md);
  transform: translateX(-50%);
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard), background var(--dl-duration-fast) var(--dl-ease-standard);
}
.scroll-to-bottom:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.scroll-to-bottom:active { transform: translate(-50%, var(--dl-lift-press)); }
.scroll-to-bottom:focus-visible { box-shadow: var(--dl-focus-ring); }
/* 进 / 出:只动 opacity + transform(动效白名单);离场 / 入场的纵向位移叠在居中的 translateX 上。 */
.scroll-to-bottom-pop-enter-active,
.scroll-to-bottom-pop-leave-active { transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard); }
.scroll-to-bottom-pop-enter-from,
.scroll-to-bottom-pop-leave-to { opacity: 0; transform: translate(-50%, var(--dl-space-1)); }
.workspace-backdrop { position: fixed; inset: 0; z-index: var(--dl-z-overlay); background: color-mix(in srgb, var(--dl-bg-sunken) 80%, transparent); }
/* 窄屏断点沿用本页既有的 1023px:侧栏在此收成抽屉。 */
@media (max-width: 1023px) {
  /* 抽屉(触屏语境):文件树行回到 --dl-target-size(44px)。密集档是桌面指针环境下的例外,
     触屏手指落点精度低、相邻行会互相误触,故这一档不放宽(见 token 声明的依据)。 */
  .workspace-page { --workspace-tree-row-height: var(--dl-target-size);
    /* 头像降到 24px(--dl-icon-lg)、间隙收到 8px;gutter 收到一档(16px,与本节的横向内边距同值)。
       窄宽度没有侧向留白可凸入,头像改为行内占位(见下),正文列随之收窄 —— 与移动端聊天一致。 */
    --workspace-avatar-size: var(--dl-icon-lg);
    --workspace-avatar-gap: var(--dl-space-2);
    --workspace-gutter: var(--dl-space-4); }
  .workspace-layout { grid-template-columns: minmax(0, 1fr); }
  /* 窄屏头像不拉负边距:回到行内占位(助手:头像在内容之前;用户:镜像,头像在内容之后)。 */
  .chat-message.assistant .message-avatar, .chat-message.user .message-avatar { margin-inline: 0 var(--workspace-avatar-gap); }
  .chat-message.user .message-avatar { margin-inline: var(--workspace-avatar-gap) 0; }
  /* 抽屉贴视口左缘(脱离外壳内缩),只圆朝内容一侧的两角:否则左侧两角悬在视口边缘
     外、圆角显得莫名其妙。
     抽屉抬到 **modal** 档:浮动的文件面板在 overlay 档,抽屉必须在它之上 —— 否则打开抽屉时,
     那块面板会飘在遮罩与抽屉的上面。 */
  .workspace-sidebar { position: fixed; inset: 0 auto 0 0; width: min(var(--workspace-sidebar-width), calc(100% - var(--dl-space-12))); z-index: var(--dl-z-modal); border-radius: 0 var(--dl-radius-xl) var(--dl-radius-xl) 0; transform: translateX(-100%); visibility: hidden; transition: transform var(--dl-duration-base) var(--dl-ease-standard); }
  .workspace-sidebar.is-open { transform: translateX(0); visibility: visible; }
  /* 会话头的横向内边距收一档;对话切换器面板的定位(横向铺满 / 右对齐触发钮)也随之由这个
     变量驱动(见 conversation-switcher.vue)。 */
  .conversation { --conversation-heading-pad: var(--dl-space-4); }
  /* 窄屏内边距收到一档;底部内缩在 .transcript 上,与断点无关(不在这里覆盖)。 */
  .transcript-inner { padding: var(--dl-space-6) var(--workspace-gutter) 0; }
  .composer-inner { padding-inline: var(--dl-space-4); }
  /* 悬浮输入框的横向内缩同取一档,与流内区域对齐。 */
  .composer-form { inset-inline: var(--dl-space-4); }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-button:active, .suggestion-card:active { transform: none; }
}
</style>
