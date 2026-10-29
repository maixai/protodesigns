<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { AgentId, ChatSession, SessionStatus } from '../contracts/generated/chat-session'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentConfig } from '../contracts/generated/agent-config'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { Attachment } from '../contracts/generated/attachment'
import type { TranscriptState } from '../contracts/generated/transcript-state'
import type { Project } from '../contracts/generated/project'
import type { Skill } from '../contracts/generated/skill'
import type { ProjectEntry, ProjectEntryStateId } from '../contracts/generated/project-entry'
import type { AgentNotification } from '../contracts/generated/agent-notification'
import type { SystemNotification } from '../contracts/generated/system-notification'
import type { AppRoute } from '../contracts/generated/app-route'
import type { ConversationSearchHit } from '../contracts/generated/conversation-search-hit'
import type { ProjectTreeRow } from '../data/project-tree'
import type { Surface } from '../contracts/generated/surface'
import type { WorkspaceLayout } from '../contracts/generated/workspace-layout'
import type { WindowRect, WorkspaceWindow } from '../contracts/generated/workspace-window'
import type { FileTab, FilePanelState, WorkspaceMap } from '../data/windows'
import type { ChatRuntime } from '../data/chat-runtime'
import type { ChatTab } from '../data/windows'
import type { ProjectBadge } from '../data/project-identity'
import { buildProjectTree, directoryKey, flattenProjectTree } from '../data/project-tree'
import { badgeMapOf, identityClassOf } from '../data/project-identity'
import { emptyRuntime, runtimeOf, withRuntime } from '../data/chat-runtime'
import { FILE_DRAG_TYPE, MAX_ATTACHMENTS, toFileAttachment } from '../data/attachments'
import { MAIN_SURFACE, activateTab, agentDomainKey, blurSurface, closeGroup, groupOfWindow, isMinimizedWindow, minimizeGroup, minimizeSurface as minimizeSurfaceOp, minimizedGroupsOf, restoreAreaGroup, restoreGroup, visibleMemberWindows, visibleChildSurfaces, childSurfaces, closeTab as closeSurfaceTab, dockWindow, dropWindows, emptyWorkspace, fileBaseName, fileWindowId, floatWindow, floatingWindowsIntersecting, focusWindow, focusedWindow, hideWindow, hideWindows, layoutOf, layoutViolations, memberWindows, openFloating, openTab, reassignChatWindow, removeSurface, reorderChatMembers, reorderFileMembers, rootSurface, seedChatWindow, setSeparatorPercent, setWindowRect, surfaceOf, surfaceOwning, visibleWindows, windowIdOf, windowPath, withLayout, withSurfaceSplit } from '../data/windows'
import { closeProject as closeProjectRequest, createSession, deleteAgent, getAgentRuntime, getConfirmationRequest, getFileContent, getProjectTree, getTranscript, listAgentNotifications, listSystemNotifications, listAgents, listProjects, listProjectSkills, listSessions, openProject, saveResponse, searchConversations, sendMessage, updateAgent } from '../api/workspace'
import { useI18n } from '../i18n'
import { accountName as userName } from '../auth/session'
import { currentRoute, navigateTo } from '../router'
import { useFlightGhost } from '../composables/use-flight-ghost'
import type { FlightRect } from '../composables/use-flight-ghost'
import AgentContextSwitcher from '../components/agent-context-switcher.vue'
import AgentEditorDialog from '../components/agent-editor-dialog.vue'
import AgentPairingDialog from '../components/agent-pairing-dialog.vue'
import IdentityVaultDialog from '../components/identity-vault-dialog.vue'
import { readIdentityVaultState } from '../mocks/identity'
import AgentPlugins from '../components/agent-plugins.vue'
import type { SidebarViewOption } from '../components/sidebar-view-tabs.vue'
import SidebarViewTabs from '../components/sidebar-view-tabs.vue'
import WorkspaceDock from '../components/workspace-dock.vue'
import ChatPanel from '../components/chat-panel.vue'
import ChatSessionView from '../components/chat-session-view.vue'
import ConversationSwitcher from '../components/conversation-switcher.vue'
import FileBar from '../components/file-bar.vue'
import FilePanel from '../components/file-panel.vue'
import FilePickerPopover from '../components/file-picker-popover.vue'
import ProjectMenu from '../components/project-menu.vue'
import ProjectPickerDialog from '../components/project-picker-dialog.vue'
import ProjectPickerPopover from '../components/project-picker-popover.vue'
import SplitPanes from '../components/split-panes.vue'
import TranscriptView from '../components/transcript-view.vue'
import WorkspaceOnboarding from '../components/workspace-onboarding.vue'

const { t, locale } = useI18n()
const sessions = ref<ChatSession[]>([])
const sessionStatus = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')
// ---- 对话运行态:按**会话**分桶 ----
// 页级「当前会话」概念已消失:内容区显示哪段对话由**区域的活动成员**唯一决定,输入坞属于
// 对话窗体本身,故随窗体走。运行态(转录 / 草稿 / 生成 / 遥测 / 待确认 / 粘底)存在这张表里,
// 一段对话被拆出 / 停靠时一个字段都不丢。所有写入都走 patchRuntime(不可变)。
const chatRuntimes = ref<Record<string, ChatRuntime>>({})
// 装载落点:演示态 / 首屏指定的、装载后要**激活成区域活动成员**的对话 id('' = 不激活任何成员)。
// 它取代了原 activeId 的「装载目标」职责,但**没有**「输入坞绑谁」的职责 —— 那只由窗体决定。
const landingSessionId = ref('weekly')
const isLocalePending = ref(false)
const isDrawerOpen = ref(false)
const isNarrow = ref(window.matchMedia('(max-width: 1023px)').matches)
// 对话切换器的展开态:整页至多一个区域的菜单打开(`openMenuSurfaceId` = 那个区域的 id,空串 =
// 都合着)。每块区域功能完全一样(各有自己的 ＋ / 菜单钮 / 菜单浮层),故展开态按区域收窄,
// 但同一时刻只允许一个 —— 打开一个即收起别的。seenSessions 是视图状态:某会话在 awaiting /
// completed 期间**成为某个区域的活动成员**即记入 —— 它决定 tab 上状态图标是否显示,
// 也决定 ▾ 面板「等待你」组的分组。演示态切换会清空它(演示与断言才可重复)。
const openMenuSurfaceId = ref('')
// 全页唯一的 aria-live「tab 重排」播报通道的文字(拖拽 / Ctrl+Shift+PageUp/Down 后由本页写它)。
// 它从会话头搬到了页面级:空区域消失后根区域可能根本没有会话头,挂在那里的 live region 会一起消失。
const tabAnnounce = ref('')
const seenSessions = ref<Set<string>>(new Set())
const agentNotifications = ref<AgentNotification[]>([])
const systemNotifications = ref<SystemNotification[]>([])
const seenSystemNotices = ref<Set<string>>(new Set())
// 通知跨 Agent 展示，项目名称与身份色需来自全部 Agent，而非当前侧栏的一部分。
const notificationProjects = ref<Project[]>([])
const notificationsStatus = ref<'loading' | 'ready' | 'error'>('loading')
let notificationVersion = 0
const pageRoot = ref<HTMLElement | null>(null)
const isIdentityCovered = ref(readIdentityVaultState() !== 'unlocked')
const drawer = ref<HTMLElement | null>(null)
const sidebarTrigger = ref<HTMLButtonElement | null>(null)
const isAlive = ref(true)
const narrowMedia = window.matchMedia('(max-width: 1023px)')
const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
// 流式节奏:6 字 / 80ms ≈ 75 字每秒(与真实模型输出的时间尺度一致,也让演示可看)。
const STREAM_INTERVAL = 80
const STREAM_CHUNK = 6
// 页面只持有「当前 Agent」:新会话的归属项目由「能推断就推断、推断不出让用户选」的规则决定(见 projectForNewChat)。
// Agent 身份来自数据层(可新建 / 改名 / 删除),不再是一份写死的 id 清单。
const DEFAULT_AGENT_ID: AgentId = 'planning'
const agents = ref<AgentSummary[]>([])
const agentsStatus = ref<'loading' | 'ready' | 'error'>('loading')
const selectedAgent = ref<AgentId>(DEFAULT_AGENT_ID)
const currentAgent = computed<AgentSummary | undefined>(() => agents.value.find((agent) => agent.id === selectedAgent.value))
const searchQuery = ref('')
const searchHits = ref<ConversationSearchHit[]>([])
const isSearching = ref(false)
let searchVersion = 0
// ---- 项目(侧栏项目区) ----
// 平权之后**没有「当前项目」**:多个项目可以同时展开,tab 区与悬浮层也混装不同项目的窗口。
const projects = ref<Project[]>([])
const projectsStatus = ref<'loading' | 'ready' | 'empty' | 'error'>('loading')
// 侧栏顶层视图:项目文件与当前 Agent 的插件平级。
const sidebarView = ref('projects')
const agentPluginCount = ref<number | undefined>(undefined)
const sidebarViewOptions = computed<SidebarViewOption[]>(() => [{
  id: 'projects',
  label: t.value.workspace.sidebarViews.projects,
  // 只在列表已就绪时给读数;加载中不先报一个假的 0。
  count: projectsStatus.value === 'ready' ? projects.value.length : undefined,
}, {
  id: 'plugins', label: t.value.workspace.plugins.pluginsTitle, count: agentPluginCount.value,
}])
// Agent 设置与添加流程分离,配对只在身份已解锁后进入。
const isAgentEditorOpen = ref(false)
const agentEditorFocusSecurity = ref(false)
const isIdentityUnlocked = ref(false)
const isPairingOpen = ref(false)
const pairingSessionId = ref('')
const pairingLinkSecret = ref('')
const agentEditorBusy = ref(false)
const agentEditorError = ref('')
// 编辑保存成功后递增:对话框据此重置脏状态基线并显示「已保存」。新建成功后仍关闭。
const agentEditorSavedToken = ref(0)
// 展开集是**真正的集合**:点一行只 toggle 它自己,不动别人(不再是「单值覆盖」)。
const expandedProjects = ref<Set<string>>(new Set())
const expandedDirs = ref<Set<string>>(new Set())
const projectTrees = ref<Record<string, ProjectEntry[]>>({})
const treeStatus = ref<Record<string, 'loading' | 'ready' | 'error'>>({})
const projectSkills = ref<Record<string, Skill[]>>({})
const skillStatus = ref<Record<string, 'loading' | 'ready' | 'error'>>({})
const skillVersions = new Map<string, number>()
const isPickerOpen = ref(false)
// 项目选择浮层的**请求**:null = 没开。两种用途共用一个浮层 —— 新建对话时选归属、
// 空对话时改归属(浮层本身只管「选一个项目」,标题与选中后的动作由这里给)。
type ProjectPickerRequest =
  | { kind: 'new-chat'; surfaceId: string }
  | { kind: 'reassign'; sessionId: string }
const projectPicker = ref<ProjectPickerRequest | null>(null)
// 浮层的锚点 = 触发元素在视口里的矩形(由触发它的那个组件在点击时量好交上来)。
const projectPickerAnchor = ref<WindowRect>({ x: 0, y: 0, width: 0, height: 0 })
// 文件选择浮层的**请求**:哪个区域的「文件 +」打开、锚在哪。null = 没开。
// 它由页面持有(而不是 FileBar):浮层要跨出区域面板、定位于视口;且一次只能有一个。
type FilePickerRequest = { surfaceId: string; anchor: WindowRect }
const filePicker = ref<FilePickerRequest | null>(null)
// ---- 区域与窗体(按 **Agent** 分域保存,刷新即重置)----
const workspaceMap = ref<WorkspaceMap>(emptyWorkspace())
const domainKey = computed(() => agentDomainKey(selectedAgent.value))
const layout = computed<WorkspaceLayout>(() => layoutOf(workspaceMap.value, domainKey.value))
const rootId = computed<string>(() => rootSurface(layout.value)?.id ?? MAIN_SURFACE)
// 文件内容按**复合窗体 id**(项目 + 路径)各存一份:同名文件在不同项目是不同内容、也是不同窗体。
const fileContents = ref<Record<string, FilePanelState>>({})
const fileDrafts = ref<Record<string, string>>({})
const fileVersions = new Map<string, number>()
// 每会话的在途请求版本号:乱序返回的旧结果不得覆盖新结果。
const transcriptVersions = new Map<string, number>()
const telemetryVersions = new Map<string, number>()
const confirmationVersions = new Map<string, number>()
// 每个会话各自的流式定时器(Send / 重新生成各持一个),卸载时全部清理。
const streamTimers = new Map<string, ReturnType<typeof setInterval>>()
// 已取过遥测的会话(避免可见对话反复重取;装载 / 切语言时显式刷新落点会话)。
const telemetryLoaded = new Set<string>()
// 工作台重装的版本号:项目 / 会话 / 转录共用一次装载,乱序返回时只认最新一次。
let workspaceVersion = 0
// 显式用户导航的版本号:reloadWorkspace 在途时用户若已经点了某个会话 / 底栏条目,
// 落地后不得再用旧落点把活动项抢回去(实测切 Agent 后立刻从底栏恢复会被重置)。
let userNavigationVersion = 0

// ---- 区域 / 窗体的视图投影 ----
// 区域成员窗体(按 tab 顺序)。
function tabWindowsOf(surfaceId: string): WorkspaceWindow[] {
  return visibleMemberWindows(layout.value, surfaceId)
}
function fileTabsOf(surfaceId: string): FileTab[] {
  return tabWindowsOf(surfaceId).flatMap((win) => (win.content.kind === 'file' ? [win.content] : []))
}
// 某区域的对话顺序(区域成员里的对话 id,按成员顺序)—— 会话头 tab 条的唯一顺序来源。
function chatOrderOf(surfaceId: string): string[] {
  return tabWindowsOf(surfaceId).filter((win) => win.content.kind === 'chat').map((win) => win.id)
}
// 可见窗体(**数组顺序 = 层序**)。停靠的对话成员不在其中(它是「条上的一项」。
const openWindows = computed<WorkspaceWindow[]>(() => visibleWindows(layout.value).filter((win) => !(win.content.kind === 'chat' && win.placement === 'docked')))
const floatingWindows = computed<WorkspaceWindow[]>(() => openWindows.value.filter((win) => win.placement === 'floating'))
// 占据「区域内容区」的那一个停靠成员:区域 activeId 指向它、且它是停靠。
function activeMemberOf(surface: Surface): WorkspaceWindow | null {
  if (surface.activeId === '' || isMinimizedWindow(layout.value, surface.activeId)) return null
  const win = layout.value.windows.find((item) => item.id === surface.activeId)
  if (win === undefined || win.placement !== 'docked') return null
  return win
}
// 区域内容区要显示的那个**文件**窗体(非文件 / 无活动成员时 null)。
function activeFileWindow(surfaceId: string): WorkspaceWindow | null {
  const surface = surfaceOf(layout.value, surfaceId)
  const win = surface === undefined ? null : activeMemberOf(surface)
  return win !== null && win.content.kind === 'file' ? win : null
}
function activeFilePath(surfaceId: string): string {
  const win = activeFileWindow(surfaceId)
  return win === null ? '' : windowPath(win)
}
// 区域内容区要显示的那段**对话** id(非对话 / 无活动成员时为空串)。
function activeChatOf(surfaceId: string): string {
  const surface = surfaceOf(layout.value, surfaceId)
  const win = surface === undefined ? null : activeMemberOf(surface)
  return win !== null && win.content.kind === 'chat' ? win.content.sessionId : ''
}
// 该活动对话**窗体自己**的归属项目(停靠态标题栏的归属标识读它 —— 与 tab 一样,归属由窗体带)。
function activeChatProjectOf(surfaceId: string): string {
  const surface = surfaceOf(layout.value, surfaceId)
  const win = surface === undefined ? null : activeMemberOf(surface)
  return win !== null && win.content.kind === 'chat' ? win.content.projectId : ''
}
// 切换器的会话列表要**隐去**的那些会话:本区域**正在显示**的那段对话(activeChatOf)∪ 任何
// **可见的悬浮对话**(floatingChatIds)。已被打开、正摆在眼前的对话不该再作为「可切换项」列出 ——
// 与文件侧 recentForBar 的既有语义一致(可见的窗口不进下拉列表)。
//
// 判据只写在这一处。**刻意只隐去「正在显示的那段」,而不是所有有 tab 的成员**:本仓把项目的每个
// 会话都装载成根区域的成员(见 syncChatMembers),按「有 tab」过滤会把列表清空(默认 6 条会话全是
// 成员);且「把已在别的区域开着的一段对话搬进本区域」这条路径(见 dockWindow 的移动语义)要求它
// 仍能在本区域的切换器里被选中。被**隐藏**的会话(关掉的 tab、收起的浮窗)不在此列 —— 那是它们的
// 恢复路径,必须留在列表里。
function switcherExcludedSessionIds(surfaceId: string): readonly string[] {
  const ids = new Set(floatingChatIds.value)
  const active = activeChatOf(surfaceId)
  if (active !== '') ids.add(active)
  return Array.from(ids)
}
// ---- 全页唯一的 live region:哪一个是 `role="log"` ----
// 不变量:任何布局下 document 里 `role="log"` 的数量恰为 1(除非根区域正显示文件这种
// 「没有任何对话视图」的不可达分支,那时为 0)。多区域并存时按**整页**算,不能按区域各自算。
//   ① 焦点窗体是对话窗 → 它就是 live;② 否则根区域的活动成员是对话窗 → 它就是 live;
//   ③ 否则根区域的**空位占位**就是 live;④ 都没有 → 没有 log。
const liveSessionId = computed<string>(() => {
  // 只认**真正的焦点**(layout.focus),不用 focusedWindow 的「最上层」回落 —— 回落会把一个
  // 并未显示的停靠对话当成 live。且焦点对话必须在**渲染中**(悬浮的,或作为某区域的活动成员);
  // 只是条上的一项(既非活动成员、又非悬浮)时它没有视图,不能占用全页唯一的 log 名额。
  const focused = layout.value.windows.find((win) => win.id === layout.value.focus && win.visible)
  if (focused !== undefined && focused.content.kind === 'chat' && isChatViewRendered(focused)) return focused.content.sessionId
  const root = surfaceOf(layout.value, rootId.value)
  const win = root === undefined ? null : activeMemberOf(root)
  return win !== null && win.content.kind === 'chat' ? win.content.sessionId : ''
})
// 一段对话此刻是否**有视图**在渲染:悬浮窗总有;停靠对话只有作为某区域的活动成员时才有
// (其余只是条上的一项,内容区不显示它)。
function isChatViewRendered(win: WorkspaceWindow): boolean {
  if (isMinimizedWindow(layout.value, win.id)) return false
  if (win.placement === 'floating') return win.visible
  return layout.value.surfaces.some((surface) => surface.activeId === win.id)
}
// 根区域的空位占位是 live(仅当全页没有别的对话视图时)。
const livePlaceholderSurfaceId = computed<string>(() => {
  if (liveSessionId.value !== '') return ''
  const root = surfaceOf(layout.value, rootId.value)
  const win = root === undefined ? null : activeMemberOf(root)
  return win === null ? rootId.value : ''
})
// 每块区域的 tabpanel / 菜单浮层 id:同一页里 id 必须唯一(根区域沿用切分前的 id)。
function panelIdOf(surfaceId: string): string {
  return surfaceId === rootId.value ? 'conversation-panel-body' : `conversation-panel-body-${surfaceId}`
}
function menuPanelIdOf(surfaceId: string): string {
  return surfaceId === rootId.value ? 'conversation-panel' : `conversation-panel-${surfaceId}`
}
// 根区域 = 「主区域」:只用来挂两件**结构性**的东西 —— 窄屏抽屉的汉堡钮、悬浮窗拖到顶部条上的
// 落点提示。＋ / 菜单 / 菜单浮层现在是**每块区域各一份**(每块区域功能完全一样),不再走这里。
function isPrimarySurface(surfaceId: string): boolean {
  return surfaceId === rootId.value
}
// 每块区域的 tabpanel 的可访问名:指向**它自己**那张活动对话 tab(没有则无)。
function tabpanelLabelIdOf(surfaceId: string): string | undefined {
  const id = activeChatOf(surfaceId)
  return id === '' ? undefined : `conversation-tab-${id}`
}
// 视觉隐藏的 h1 文字 = 该区域活动成员的标题(对话取会话标题、文件取文件名;无活动成员回退 newChat)。
function regionTitleOf(surfaceId: string): string {
  const surface = surfaceOf(layout.value, surfaceId)
  const win = surface === undefined ? null : activeMemberOf(surface)
  if (win === null) return t.value.workspace.newChat
  if (win.content.kind === 'chat') return sessionTitleOf(win.content.sessionId)
  return fileBaseName(win.content.path)
}
// **焦点区域** = 当前焦点窗体所在的那块区域(layout.focus 决定);无焦点或焦点是悬浮窗(不属于
// 任何区域)时回落到根区域。⌘/Ctrl+K 与 h1 都以它为准 —— 两者都只作用于「用户此刻在用的那块」。
const focusedSurfaceId = computed<string>(() => {
  const windowId = layout.value.focus
  if (windowId !== '') {
    const owner = surfaceOwning(layout.value, windowId)
    if (owner !== undefined) return owner.id
  }
  return rootId.value
})
// 全页唯一的 h1 文字 = **焦点区域**活动成员的标题(对话取会话标题、文件取文件名;无活动成员回退
// newChat)。h1 住在页面级而不是某个区域的会话头里:空区域消失后根区域可能根本没有会话头,
// 住在里面的地标会一起消失 —— 那样整页 h1 数就不再恒为 1。
const pageTitle = computed<string>(() => {
  // 引导页状态下 h1 应当就是那张页面的标题,否则读屏用户听到的页面标题(「新建对话」)与
  // 屏幕上的大标题(「这里还没有打开的窗口」)对不上。
  if (isGuideSurface(rootId.value)) return t.value.workspace.onboarding.title
  return regionTitleOf(focusedSurfaceId.value)
})
// 引导页判据:某区域**没有可见成员、也没有可见子区域** —— 它没有任何东西可显示。
// 只有根区域会走到这里(非根空区域已被摘除 / 整块最小化隐藏);全部页签收进底栏后,
// 根区域同样回到创建会话的引导 —— 底栏是恢复入口,引导是新建入口,两者不混。
// 引导页不是转录,故**不**给它 role="log"(全页 role="log" 恰为 1 的不变量在此退化为 0)。
// **装载期除外**:此时还不知道本项目有没有会话,直接显示「这里还没有打开的窗口」会先闪一下
// 引导页再换成会话 —— 与既有的「装载期显示加载骨架而不是空态问候语」是同一条纪律。
function isGuideSurface(surfaceId: string): boolean {
  if (workspaceLoading.value) return false
  const surface = surfaceOf(layout.value, surfaceId)
  if (surface === undefined) return false
  return visibleMemberWindows(layout.value, surfaceId).length === 0
    && visibleChildSurfaces(layout.value, surfaceId).length === 0
}
function sessionTitleOf(sessionId: string): string {
  return sessions.value.find((item) => item.id === sessionId)?.title ?? t.value.workspace.newChat
}
// 助手消息的作者名 = **该会话所属 Agent** 的名字(每段对话各取自己的;悬浮窗与停靠视图各取各的)。
function assistantNameOf(sessionId: string): string {
  const found = sessions.value.find((item) => item.id === sessionId)
  const agentId = found?.agent ?? selectedAgent.value
  return agents.value.find((agent) => agent.id === agentId)?.name ?? currentAgent.value?.name ?? ''
}
// 会话 tab 的状态徽标:该会话运行态的实时生成态优先(排队 / 流式 → streaming、完成 → completed)。
function sessionStatusOf(session: ChatSession): SessionStatus | null {
  const phase = runtimeFor(session.id).generation
  if (phase === 'queued' || phase === 'streaming') return 'streaming'
  if (phase === 'complete') return 'completed'
  return null
}
function chatSessionIdOf(win: WorkspaceWindow): string {
  return win.content.kind === 'chat' ? win.content.sessionId : ''
}

// ---- 运行态读写 ----
function runtimeFor(sessionId: string): ChatRuntime {
  return runtimeOf(chatRuntimes.value, sessionId)
}
function patchRuntime(sessionId: string, patch: (current: ChatRuntime) => ChatRuntime): void {
  chatRuntimes.value = withRuntime(chatRuntimes.value, sessionId, patch(runtimeFor(sessionId)))
}
function updateDraft(sessionId: string, value: string): void {
  patchRuntime(sessionId, (current) => ({ ...current, draft: value }))
}
// 附件增删:都是**本会话**运行态的一部分(随会话存活);上限在这里兜底(输入坞也拦一次)。
function addAttachments(sessionId: string, list: Attachment[]): void {
  if (list.length === 0) return
  patchRuntime(sessionId, (current) => {
    const room = MAX_ATTACHMENTS - current.attachments.length
    if (room <= 0) return current
    return { ...current, attachments: [...current.attachments, ...list.slice(0, room)] }
  })
}
function removeAttachment(sessionId: string, id: string): void {
  patchRuntime(sessionId, (current) => ({ ...current, attachments: current.attachments.filter((item) => item.id !== id) }))
}
// 切换模型:**作用域 = 本会话** —— 只写这段对话的 modelId,别的对话的遥测与 context 上限不受影响。
function selectModel(sessionId: string, id: string): void {
  patchRuntime(sessionId, (current) => ({ ...current, modelId: id }))
}
function updatePinned(sessionId: string, value: boolean): void {
  patchRuntime(sessionId, (current) => ({ ...current, isPinned: value }))
}
// 某会话是否正在生成 / 保存(输入坞的只读与「停止」显隐、会话 tab 的锁定都看它)。
function isGeneratingOf(sessionId: string): boolean {
  const phase = runtimeFor(sessionId).generation
  return phase === 'queued' || phase === 'streaming'
}
function isBusyOf(sessionId: string): boolean {
  const current = runtimeFor(sessionId)
  return isGeneratingOf(sessionId) || current.isSaving
}
function canSendOf(sessionId: string): boolean {
  const current = runtimeFor(sessionId)
  return current.draft.trim().length > 0 && !isBusyOf(sessionId) && current.transcript.status !== 'loading' && current.transcript.status !== 'error'
}
// 页级「忙碌」= **任一**会话在生成 / 保存 —— 只守护关项目 / 关 tab 等破坏性动作，不阻挡切 Agent。
const isBusy = computed(() => Object.values(chatRuntimes.value).some((current) => current.generation === 'queued' || current.generation === 'streaming' || current.isSaving))
// 工作台是否仍在装载(项目 / 会话列表未落定)。装载期区域还没有活动成员,内容区显示空位占位 ——
// 此时它显示的是**加载骨架**而不是空态问候语,首屏因此不会先闪一下「欢迎」再换成会话
// (与「转录位」的语义一致:它先加载、再落定)。演示态 ?s=empty 装载完成后落点是空,才显示问候语。
const workspaceLoading = computed(() => projectsStatus.value === 'loading' || sessionStatus.value === 'loading')
// 一个文件面板 / 文件芯片要看的确认请求来源:优先「live 的那段对话」,否则任一有确认的会话。
// 文件不属于任何会话,但它显示的待确认操作来自某段对话的运行时 —— 这一处的映射是刻意的派生,
// 不构成「当前会话」概念的回潮(输入坞仍只随窗体走)。
const primaryChatId = computed<string>(() => liveSessionId.value)
const primaryRuntime = computed<ChatRuntime>(() => runtimeFor(primaryChatId.value))
const affectedPaths = computed<string[]>(() => primaryRuntime.value.confirmation?.affectedFiles ?? [])
const confirmationOutcome = computed<'allowed' | 'rejected' | null>(() => primaryRuntime.value.confirmationOutcome)
function confirmationOwnerId(): string {
  const current = primaryChatId.value
  if (current !== '' && runtimeFor(current).confirmation !== null) return current
  const found = Object.entries(chatRuntimes.value).find(([, item]) => item.confirmation !== null)
  return found?.[0] ?? ''
}
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

// 条目状态芯片的**唯一派生规则**(文件树、文件栏、文件面板共用):等待确认时受影响的条目
// 显示为 pending;允许后变 modified(已改);拒绝则回到原状态。none(无变化)不渲染芯片。
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
  // 通知需要精确到分钟:同一天的两条系统通知只显示日期会分不出先后。
  // 固定 UTC 与 24 小时制,演示数据不随本机时区与语言的小时制漂移。
  return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(timestamp))
}
// 文件数文案(项目行 title 与「打开项目」对话框共用)。
function formatFileCount(count: number): string {
  return t.value.workspace.fileCount.replace('{count}', String(count))
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
// 布局不变量的 **DEV 期守卫**:页面里所有布局写回都汇到 patchLayout(commitLayout 也经它),
// 故这条断言放在这一处即可 —— 新布局若违反已声明的不变量(data/windows 的 layoutViolations),
// 立刻 console.error 一条含「是哪条不变量」的可读信息。目的:让「同一个窗体属于两块区域」
// 这类缺陷在开发期就暴露,而不是等用户看出「同一个对话在两块区域各有一枚 tab」。
// 只在开发构建生效(import.meta.env.DEV),生产不带这段;写回前先过守卫,再落值。
function assertInvariants(next: WorkspaceLayout): WorkspaceLayout {
  if (import.meta.env.DEV) {
    // 除布局自身的不变量外,再带上「已打开项目集合」校验窗体的项目归属(不变量⑨):
    // 拦「项目关了、窗口还留着」这类漂移 —— 侧栏里已没有入口,却还占着一枚 tab。
    const violations = layoutViolations(next, projects.value.map((project) => project.id))
    if (violations.length > 0) console.error(`[layout-invariant] ${violations.join('; ')}`)
  }
  return next
}
// 当前分域上的不可变更新(其余分域原样保留)。
function patchLayout(next: (current: WorkspaceLayout) => WorkspaceLayout): void {
  workspaceMap.value = withLayout(workspaceMap.value, domainKey.value, assertInvariants(next(layout.value)))
}
// ---- 区域生命周期:成员被摘空的区域移除 ----
// 不变量:非根区域必有成员(要么是内容区,要么已被摘除);只有根区域可以「无成员」——它退化成
// 子区域的容器(自身的会话头与内容区都不渲染)。凡把某区域成员摘空的动作(关 tab / 拆出 / 切分)
// 之后都要过一遍这里。removeSurface 会把被摘区域的成员与子区域托付给父区域、并把它的子区域改挂到
// 父区域名下;根区域不可删(parentId === null 时 removeSurface 原样返回)。
function pruneEmptySurfaces(current: WorkspaceLayout): WorkspaceLayout {
  let next = current
  let removed = true
  while (removed) {
    removed = false
    for (const surface of next.surfaces) {
      if (surface.parentId === null) continue
      // 整块显示区被收起时它仍在树里,只是不渲染 —— 不要把它当空区域摘掉。
      if (surface.minimized) continue
      // 它有被最小化的子显示区时也不能摘:子区域要留在原父节点下,恢复才能回到原位。
      if (childSurfaces(next, surface.id).some((child) => child.minimized)) continue
      // 「空」按**可见成员**算:只剩被最小化成员的区域同样应该让出空间给兄弟区域。
      // 有子区域时不能摘 —— 它是容器,摘掉会把子树的层级结构一起改掉。
      const isEmpty = visibleMemberWindows(next, surface.id).length === 0
        && childSurfaces(next, surface.id).length === 0
      if (!isEmpty) continue
      // 区域可能还有被最小化的成员:先把挂在它名下的组改挂到父区域。
      // removeSurface 会丢弃挂在被删区域上的组,不改挂会把用户收起的页面一并弄丢。
      const parentId = surface.parentId
      const rehomed = next.groups.map((group) => group.surfaceId === surface.id ? { ...group, surfaceId: parentId } : group)
      const before = next.surfaces.length
      next = removeSurface({ ...next, groups: rehomed }, surface.id)
      if (next.surfaces.length < before) {
        removed = true
        break
      }
    }
  }
  return next
}
// 摘空即移除,并**播报一条**(区域消失对读屏用户是重要变化)。
function pruneAndAnnounce(current: WorkspaceLayout): WorkspaceLayout {
  const next = pruneEmptySurfaces(current)
  if (next.surfaces.length < current.surfaces.length) announcePlacement(t.value.workspace.regions.regionClosed)
  return next
}
// 所有会改变区域成员的写入都经这里:改完再过一遍 prune。
function commitLayout(mutate: (current: WorkspaceLayout) => WorkspaceLayout): void {
  patchLayout((current) => pruneAndAnnounce(mutate(current)))
}
// 项目的展示名 / 标识(按窗体的 projectId 回查)—— tab 前缀、悬浮窗标题栏、文件面板出处都读它。
const projectBadges = computed<Map<string, ProjectBadge>>(() => badgeMapOf(projects.value))
function projectBadgeOf(projectId: string): ProjectBadge | undefined {
  return projectBadges.value.get(projectId)
}
function projectNameOf(projectId: string): string {
  return projectBadgeOf(projectId)?.name ?? projectId
}
// 项目的绝对路径:输入坞底行项目项的可访问补充(悬停可见),与名称同源。
function projectPathOf(projectId: string): string {
  return projectBadgeOf(projectId)?.path ?? ''
}
// 路径的状态芯片:按**该文件所属项目**的树回查条目(不再是「当前项目」)。
function entryStateOfPath(projectId: string, path: string): ProjectEntryStateId {
  const entry = projectTrees.value[projectId]?.find((item) => item.path === path)
  return resolveEntryState(entry?.state ?? 'none', path)
}
function entryStateOfTab(tab: FileTab | null): ProjectEntryStateId {
  return tab === null ? 'none' : entryStateOfPath(tab.projectId, tab.path)
}
// 某个窗体若是文件窗,取它的 FileTab 视图(否则 null)。
function fileContentOf(win: WorkspaceWindow | null): FileTab | null {
  return win !== null && win.content.kind === 'file' ? win.content : null
}

// 取某个项目的条目树(每项目只取一次;展开时按需触发)。树自带 loading / error 两态。
// force = 重试:文件选择浮层里的「加载失败 · 重试」用它重新发起一次请求。
async function ensureProjectTree(projectId: string, force = false): Promise<void> {
  if (!force && projectTrees.value[projectId] !== undefined) return
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
// Skills 与文件树分开加载;请求版本防止重试或切域后的旧结果覆盖新清单。
async function ensureProjectSkills(projectId: string, force = false): Promise<void> {
  if (!force && (projectSkills.value[projectId] !== undefined || skillStatus.value[projectId] === 'loading')) return
  const version = (skillVersions.get(projectId) ?? 0) + 1
  const agentId = selectedAgent.value
  const demoState = currentRoute.value.demoState
  skillVersions.set(projectId, version)
  skillStatus.value = { ...skillStatus.value, [projectId]: 'loading' }
  const result = await listProjectSkills(projectId)
  if (!isAlive.value || skillVersions.get(projectId) !== version || selectedAgent.value !== agentId
    || currentRoute.value.demoState !== demoState || !projects.value.some((project) => project.id === projectId)) return
  skillStatus.value = { ...skillStatus.value, [projectId]: result.ok ? 'ready' : 'error' }
  if (result.ok) projectSkills.value = { ...projectSkills.value, [projectId]: result.value }
}
function retryProjectSkills(projectId: string): void {
  void ensureProjectSkills(projectId, true)
}
function skillsOf(projectId: string): readonly Skill[] {
  return projectSkills.value[projectId] ?? []
}
function skillStatusOf(projectId: string): 'loading' | 'ready' | 'error' {
  return skillStatus.value[projectId] ?? 'loading'
}

// ---- 文件内容 ----
// 缓存键 = **复合窗体 id**(项目 + 路径):同名文件在不同项目是不同内容、也是不同窗体。
async function loadFileContent(content: FileTab): Promise<void> {
  const key = windowIdOf(content)
  const version = (fileVersions.get(key) ?? 0) + 1
  fileVersions.set(key, version)
  // 确认请求按**会话**查:文件不属于任何会话,取 live 的那段对话(见 primaryChatId 注释)。
  const sessionId = primaryChatId.value
  fileContents.value = { ...fileContents.value, [key]: { status: 'loading' } }
  const result = await getFileContent(content.projectId, content.path, sessionId)
  if (!isAlive.value || version !== (fileVersions.get(key) ?? 0)) return
  // 该窗体已经不在布局里(被关掉了)时丢弃结果;项目归属由复合键自带,不再需要「当前项目」比对。
  if (!layout.value.windows.some((win) => win.id === key)) return
  const next: FilePanelState = !result.ok
    ? { status: 'error' }
    // 「无法预览」由契约的 kind 判定(而不是 lines 为空):图片同样没有变更行,但它**要**渲染。
    : (result.value.kind === 'binary' ? { status: 'empty' } : { status: 'ready', content: result.value })
  fileContents.value = { ...fileContents.value, [key]: next }
}
function contentOf(windowId: string): FilePanelState {
  return fileContents.value[windowId] ?? { status: 'loading' }
}
// 打开一个文件:单击 / 双击 / Enter 三条入口都走这里,行为一致(打开**悬浮**窗体)。
// 若它此前正停靠在某块区域里,这一次点击会把它从成员里摘走 —— 那块区域若因此被摘空,
// 随之后被移除(commitLayout)。
// ---- 「显示某个窗体」的唯一规则(所有入口共用:文件树 / 最近关闭 / 后续任何来源)----
//
// 身份按**内容**而非视图:一个内容只有一份窗体(`data/windows` 的 windowIdOf),它要么停靠在
// 某块区域的 tab 条上、要么悬浮。于是「显示它」只有三种落法:
//   · 已在某区域的成员里 → 把**那块区域**切到它这一项并置顶聚焦。**不重新开一个悬浮窗** ——
//     那会把它从 tab 条上拽走、连几何一起重置(用户报的缺陷:停靠后再点树里的同一个文件,
//     它会变成悬浮窗并从条上消失);
//   · 悬浮中 → 置顶聚焦(不新建、不移动);
//   · 都不是(首次打开,或它的 tab 曾被告关闭)→ 交给调用方给的 fallback。
//
// 业界依据:VS Code 把 reveal 做成一等动词(`TreeView.reveal` / `WebviewPanel.reveal`,与 open 并列),
// 是「一个 open 入口 + 一个 reveal 语义」而不是每个入口各写一遍;而「点已打开项却又开一份」
// 在 VS Code / IntelliJ / Zed 都是被反复公开抱怨的缺陷。VS Code 的 `workbench.editor.revealIfOpen`
// 默认关,是为了不破坏「同文件并排对照」的工作流 —— 本原型没有这个诉求,故复用总是优先于新建。
//
// ---- 「显示某个**停靠**窗体」之前:让遮挡的悬浮窗体让位 ----
//
// 本仓是**两层**结构:应用外壳(区域 / 停靠面板)在第 1 层,悬浮窗体在第 2 层(--dl-z-overlay)
// —— 停靠窗体无论怎么激活都在悬浮窗体**之下**,所以「把要显示的那个抬上来」在层序上不可能,
// 只能让浮层让位。业界同理:
//   · VS Code 的浮动窗口**默认并非 always-on-top**(要在标题栏显式点 Set Always on Top 才置顶),
//     默认它只是普通窗口、会被主窗口盖住(官方文档 User interface → Floating windows);
//   · 它的 issue #173696「Switch focus to the File window when you open/show a File」正是
//     「点它就是**显示并聚焦**它」;
//   · macOS 的窗口层级(NSWindow.Level)里普通文档窗口在 level 0、utility 浮层在 level 3 ——
//     普通窗口**永远抬不到浮层之上**,真实产品的做法都是「浮层让位」。
// 故:显示一个**停靠**窗体时,把**几何上与目标区域显示区相交**的悬浮窗体收起(visible = false)。
// 只收相交的 —— 屏幕上别处、不相交的浮窗一动不动;一个都不相交时**不写布局**。
// 收起只改 visible,不动 placement / rect / view,故 layoutViolations 恒为空;被收起的浮窗可由
// 「文件」列表 / 最近关闭那条既有路径重新打开(openFloating 会把 visible 置回真)。
//
// 适用面 = 所有「显式显示某个**停靠**窗体」的动作(侧栏文件点击 / 双击 / Enter、最近关闭、
// 文件栏下拉、点区域 tab 条上的文件 tab、点对话 tab)。目标本身是**悬浮**窗体时不适用 ——
// 那条路是「置顶它」(focusWindow),已有的行为正确。

// 某区域**显示区**的矩形(视口坐标):区域的内容面板 —— 悬浮窗体压住它即构成遮挡。
// 量不到(该区域不在渲染中)返回 null,调用方据此安全降级(宁可少做,不可乱收)。
function displayBoxOf(surfaceId: string): WindowRect | null {
  const panel = document.querySelector<HTMLElement>(`.conversation[data-surface-id="${CSS.escape(surfaceId)}"] .conversation-panel`)
  if (panel === null) return null
  const rect = panel.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

// 某悬浮窗体此刻的**实测几何**(视口坐标):几何以 DOM 为准 —— 布局里的 win.rect 在「还没摆过位置」
// 时是 {0,0,0,0},而真实几何由窗体组件按视口算出。量不到(该窗体没有渲染)返回 null。
// 坐标与布局数据同为视口坐标系,可直接比较。
// 选中钩子按**复合窗体 id**(data-window-id)—— 同名文件跨项目混装时,裸路径会同时命中多个面板,
// 复合 id 才能保证「选到的一定是那一个窗口」。
function measuredWindowRect(id: string): WindowRect | null {
  const element = document.querySelector<HTMLElement>(`.file-panel[data-window-id="${CSS.escape(id)}"], .chat-panel[data-window-id="${CSS.escape(id)}"]`)
  if (element === null) return null
  const rect = element.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

// 「收起了几个遮挡的窗口」的播报文案({count} 由载体替换)。
function occludedMessage(count: number): string {
  return t.value.workspace.fileBar.occludedAnnounce.replace('{count}', String(count))
}

// 让挡住某区域显示区的悬浮窗体让位;返回收起个数(0 = 没有遮挡、未写布局)。
// 只负责收与回答个数 —— 播报由调用方经页面**既有**的 role="status" 通道(.workspace-live /
// announcePlacement)发出,不新造第二条 live region。
function uncoverSurface(surfaceId: string): number {
  const box = displayBoxOf(surfaceId)
  if (box === null) return 0
  const ids = floatingWindowsIntersecting(layout.value, box, measuredWindowRect)
  if (ids.length === 0) return 0
  patchLayout((current) => hideWindows(current, ids))
  return ids.length
}

// **停靠之后**的收尾:让还盖着那块区域的**其它**悬浮窗体让位,并把「已停靠 X」与「收起了几个
// 遮挡的」合成**一条**播报(announcePlacement 是后写覆盖先写的单通道,分两次调用会丢前一条)。
//
// 必须在**停靠写回之后**调用:刚停靠的那个窗体此刻已不是 floating,故不会被它自己收掉;
// 而另一个正好盖着该区域的浮窗会被收起 —— 否则用户「把窗体停靠过去」这个动作看起来失败了
// (内容被盖住),与「点侧栏显示被盖住的窗体」是同一类缺陷,只是入口不同。
function afterDock(surfaceId: string, message: string): void {
  const hidden = uncoverSurface(surfaceId)
  announcePlacement(hidden > 0 ? `${message} ${occludedMessage(hidden)}` : message)
}

function revealWindow(id: string, fallback: (current: WorkspaceLayout) => WorkspaceLayout): void {
  restoreWindowGroup(id)
  const owner = surfaceOwning(layout.value, id)
  if (owner !== undefined) {
    // 先让遮挡的悬浮窗体让位,再把这枚 tab 切到活动位(两层结构下停靠窗体抬不过浮层)。
    const hidden = uncoverSurface(owner.id)
    patchLayout((current) => activateTab(current, owner.id, id))
    pulseWindow(id)
    const reveal = t.value.workspace.fileBar.revealAnnounce.replace('{name}', windowLabel(id))
    // 两条信息合成一次播报:announcePlacement 是「后写覆盖先写」的单通道,分两次调用会丢掉前一条。
    announcePlacement(hidden > 0 ? `${reveal} ${occludedMessage(hidden)}` : reveal)
    return
  }
  const existing = layout.value.windows.find((item) => item.id === id)
  if (existing !== undefined && existing.placement === 'floating' && existing.visible) {
    patchLayout((current) => focusWindow(current, id))
    return
  }
  commitLayout(fallback)
  pulseWindow(id)
}

// 提醒动效的落点:被「显示」的那个窗体的 tab 会短暂脉冲一次(见 .conversation-tab / .file-tab
// 的 [data-pulsing])。**一次性、不回环** —— 循环闪烁被 Windows UX 指南(「不要闪任务栏」)与
// NN/g 的「needy patterns」双双列为反模式;被认可的是「一次、短、随后回落为静态选中态」。
// 它只是冗余强化:信息由「区域切到了那一项」与 role=status 的播报承担(WCAG:不得只靠动效传递信息)。
const pulseWindowId = ref('')
let pulseTimer: ReturnType<typeof setTimeout> | undefined
const PULSE_MS = 900
function pulseWindow(id: string): void {
  clearTimeout(pulseTimer)
  pulseWindowId.value = id
  pulseTimer = setTimeout(() => { pulseWindowId.value = '' }, PULSE_MS)
}

// ---- 收起 / 恢复的空间连线 ----
// 面板与底栏条目在起止两端即时切换;飞行幽灵只回答「折到哪去了 / 从哪展开」。
// 目标条目在落地后做一次静态强调(不依赖动效也能看见落点)。
const flight = useFlightGhost()
const pulseGroupId = ref('')
let groupPulseTimer: ReturnType<typeof setTimeout> | undefined
function pulseDockGroup(groupId: string): void {
  clearTimeout(groupPulseTimer)
  pulseGroupId.value = ''
  void nextTick(() => {
    pulseGroupId.value = groupId
    groupPulseTimer = setTimeout(() => { pulseGroupId.value = '' }, PULSE_MS)
  })
}
function flightRectOf(selector: string | null): FlightRect | null {
  if (selector === null) return null
  const element = document.querySelector<HTMLElement>(selector)
  if (element === null) return null
  const rect = element.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
function surfaceFlightSelector(surfaceId: string): string {
  return `.conversation[data-surface-id="${CSS.escape(surfaceId)}"]`
}
function chipFlightSelector(groupId: string): string {
  return `.workspace-dock__chip[data-group-id="${CSS.escape(groupId)}"]`
}
function tabFlightSelector(windowId: string): string | null {
  const win = layout.value.windows.find((item) => item.id === windowId)
  if (win?.content.kind === 'chat') return `.conversation-tab[data-tab-id="${CSS.escape(win.content.sessionId)}"]`
  if (win?.content.kind === 'file') return `.file-tab[data-file-key="${CSS.escape(windowId)}"]`
  return null
}
// 目标元素要等布局落定后再量;下一次绘制前完成,避免幽灵从旧几何出发。
function afterNextPaint(callback: () => void): void {
  void nextTick(() => { requestAnimationFrame(() => { callback() }) })
}
// 显示区恢复:让**真实面板**从底栏条目方向放大回原位(窗体的 enlarge 观感)。
// 只动 transform / opacity;reduced-motion 下跳过,状态切换照旧。
function playSurfaceEntrance(element: HTMLElement, from: FlightRect): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const rect = element.getBoundingClientRect()
  if (rect.width <= 1 || rect.height <= 1) return
  const host = document.querySelector<HTMLElement>('.workspace-page')
  const style = host === null ? null : getComputedStyle(host)
  const duration = Number.parseFloat(style?.getPropertyValue('--dl-duration-slow') ?? '') || 280
  const easing = style?.getPropertyValue('--dl-ease-standard').trim() || 'cubic-bezier(0.2, 0, 0, 1)'
  const dx = from.x - rect.x
  const dy = from.y - rect.y
  element.style.transformOrigin = 'top left'
  const animation = element.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(0.86)`, opacity: 0.55 },
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
    ],
    { duration, easing },
  )
  animation.onfinish = () => {
    element.style.transformOrigin = ''
    animation.cancel()
  }
}

// 文件树里点一个文件 = 「显示它」:已有 tab 就切过去,没有才开一个悬浮窗。
// 窗体身份按**复合键**(项目 + 路径)—— 同名文件在不同项目是**两份不同的窗体**,互不顶掉。
function openFile(projectId: string, path: string): void {
  revealWindow(fileWindowId(projectId, path), (current) => openFloating(current, { kind: 'file', projectId, path }, { x: 0, y: 0, width: 0, height: 0 }))
}
function openFromTree(projectId: string, row: ProjectTreeRow): void {
  openFile(projectId, row.path)
}
function onFileRowClick(projectId: string, row: ProjectTreeRow, event: MouseEvent): void {
  if (event.detail === 0) return
  openFromTree(projectId, row)
}
function onFileRowDblClick(projectId: string, row: ProjectTreeRow): void {
  openFromTree(projectId, row)
}
function onFileRowKey(projectId: string, event: KeyboardEvent, row: ProjectTreeRow): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  openFromTree(projectId, row)
}
// ---- 把侧栏文件加入对话(两条通路,WCAG 2.5.7 要求拖拽之外必须另有点击通路)----
// 拖源:文件行带上**自定义 MIME 类型**(值为路径),对话坞据此与「外部文件拖入」区分 ——
// 只有带它的拖拽才被接管,外部文件拖入保持浏览器默认行为。
function onFileRowDragStart(row: ProjectTreeRow, event: DragEvent): void {
  const data = event.dataTransfer
  if (data === null) return
  data.setData(FILE_DRAG_TYPE, row.path)
  data.effectAllowed = 'copy'
}
// 「加入当前对话」的**目标会话** = 焦点区域的活动对话;焦点不在任何对话上时回落到 live 的那段。
// 与拖拽落到某张卡片上同义:拖拽的落点由**指针**决定,点击的落点由**焦点区域**决定。
const attachTargetSessionId = computed<string>(() => {
  const active = activeChatOf(focusedSurfaceId.value)
  return active !== '' ? active : liveSessionId.value
})
// 非拖拽通路:点文件行那枚「加入当前对话」按钮 = 把该文件加成目标会话的附件。
function onAddFileToConversation(row: ProjectTreeRow): void {
  const sessionId = attachTargetSessionId.value
  if (sessionId === '') return
  const attachment = toFileAttachment(row.path, row.name)
  addAttachments(sessionId, [attachment])
  announcePlacement(t.value.workspace.composer.added.replace('{name}', attachment.name))
}
// 区域的归属反推(不变量③:一个窗体至多属于一个区域);找不到则退回根区域。
function ownerSurfaceIdOf(current: WorkspaceLayout, windowId: string): string {
  return surfaceOwning(current, windowId)?.id ?? rootId.value
}
function selectFileTab(id: string): void {
  // 点 tab 条上的文件 tab = 显示它:先让遮挡的浮窗让位,再把它切到活动位。
  const hidden = uncoverSurface(ownerSurfaceIdOf(layout.value, id))
  patchLayout((current) => activateTab(current, ownerSurfaceIdOf(current, id), id))
  if (hidden > 0) announcePlacement(occludedMessage(hidden))
}
// 关闭一个文件 tab(≠ 删除):从条上撤下并隐藏其窗口;活动位交给**相邻成员**(closeTab 的统一规则)。
// 摘空的那块区域随之后被移除(见 commitLayout)。
function closeFileTab(id: string): void {
  commitLayout((current) => closeSurfaceTab(current, ownerSurfaceIdOf(current, id), id))
}
function reorderFileTabs(surfaceId: string, order: string[]): void {
  patchLayout((current) => reorderFileMembers(current, surfaceId, order))
}
// 条上对话重排:写回区域成员的对话部分(顺序由**成员**单一持有)。
function reorderChatTabs(surfaceId: string, order: string[]): void {
  patchLayout((current) => reorderChatMembers(current, surfaceId, order))
}
// 「最近关闭」的复原(关闭 ≠ 删除):走与文件树**同一条** reveal 规则 —— 它已经在某块区域的
// 条上时切过去(而不是把它从原区域搬到点它的那块区域),只有它确实不在任何条上时才停靠回来。
function openRecentFile(surfaceId: string, windowId: string): void {
  if (isBusy.value) return
  revealWindow(windowId, (current) => {
    const win = current.windows.find((item) => item.id === windowId)
    if (win === undefined) return current
    if (win.placement === 'floating') return openFloating(current, win.content, win.rect)
    const surface = surfaceOf(current, surfaceId)
    return dockWindow(current, windowId, surfaceId, surface?.members.length ?? 0)
  })
}
function focusFileWindow(id: string): void {
  patchLayout((current) => focusWindow(current, id))
}
// 关掉一个**窗口**(Esc / 窗口的关闭钮):标签留在条上,再点一次即恢复显示。
function closeFileWindow(id: string): void {
  patchLayout((current) => hideWindow(current, id))
  void nextTick(() => {
    const tab = document.querySelector<HTMLElement>(`.file-tab[data-file-key="${CSS.escape(id)}"]`)
    tab?.focus()
  })
}
// F6:在多个可见窗口之间循环焦点。
function cycleFileWindow(): void {
  const list = openWindows.value
  if (list.length < 2) return
  const currentIndex = list.findIndex((win) => win.id === focusedWindowId.value)
  const next = list[(currentIndex + 1) % list.length]
  if (next !== undefined) focusFileWindow(next.id)
}
function onFileRectChange(id: string, rect: WindowRect | null): void {
  patchLayout((current) => setWindowRect(current, id, rect))
}
function retryFile(id: string): void {
  const content = fileContentOf(layout.value.windows.find((win) => win.id === id) ?? null)
  if (content !== null) void loadFileContent(content)
}

// ---- 悬浮 ↔ 停靠 ----
const placementAnnounce = ref('')
function announcePlacement(message: string): void {
  // 先清空再设置:连续两次相同文本也要能重新触发播报。
  placementAnnounce.value = ''
  void nextTick(() => { placementAnnounce.value = message })
}
const dockFlip = ref<{ id: string; rect: WindowRect } | null>(null)
// 悬浮 → 停靠:加入**根区域**成员末尾并成为 activeId;记忆的 rect 原样留着。
function dockFileWindow(id: string, from: WindowRect | null = null): void {
  dockFlip.value = from === null ? null : { id, rect: from }
  const targetSurface = rootId.value
  patchLayout((current) => {
    const surface = surfaceOf(current, targetSurface)
    return dockWindow(current, id, targetSurface, surface?.members.length ?? 0)
  })
  afterDock(targetSurface, t.value.workspace.filePanel.dockedAnnounce.replace('{name}', windowLabel(id)))
  // 停靠落点:目标 tab 做一次静态强调,与窗体飞入的 FLIP 一起回答「沉到哪去了」。
  pulseWindow(id)
  if (from !== null) {
    void nextTick(() => {
      requestAnimationFrame(() => {
        if (dockFlip.value?.id === id) dockFlip.value = null
      })
    })
  }
}
// 停靠 → 悬浮:移出所有区域成员,回到**记忆的上次悬浮矩形**的浮层并置顶聚焦。
// 移出会让原区域可能被摘空 → 经 commitLayout 判「摘空即移除」。
function floatFileWindow(id: string): void {
  commitLayout((current) => {
    const win = current.windows.find((item) => item.id === id)
    if (win === undefined) return current
    return focusWindow(floatWindow(current, id, win.rect), id)
  })
  announcePlacement(t.value.workspace.filePanel.floatedAnnounce.replace('{name}', windowLabel(id)))
}
// ---- 向下拖出 tab → 悬浮窗体(松手前都可逆)----
const tearId = ref('')
const tearFollow = ref<{ x: number; y: number } | null>(null)
const tearOrigin = ref<WindowRect | null>(null)
let tearSnapshot: WorkspaceLayout | null = null
let tearSnapshotDomain = ''
const popFlip = ref<{ key: string; origin: WindowRect } | null>(null)
function flipFromOf(id: string): WindowRect | null {
  if (id === tearId.value) return tearOrigin.value
  if (popFlip.value?.key === id) return popFlip.value.origin
  return null
}
// 窗体的展示名(播报 / 落点提示里的 {name}):文件取路径末段,对话取会话标题。
function windowLabel(id: string): string {
  const content = layout.value.windows.find((item) => item.id === id)?.content
  if (content === undefined) return id
  if (content.kind === 'chat') return sessionTitleOf(content.sessionId)
  return fileBaseName(content.path)
}
function onTearOut(detail: { key: string; point: { x: number; y: number }; origin: WindowRect }): void {
  if (tearSnapshot === null) {
    tearSnapshot = layout.value
    tearSnapshotDomain = domainKey.value
  }
  tearOriginSurfaceId = surfaceOwning(layout.value, detail.key)?.id ?? ''
  tearId.value = detail.key
  tearOrigin.value = detail.origin
  tearFollow.value = detail.point
  patchLayout((current) => focusWindow(floatWindow(current, detail.key, { x: 0, y: 0, width: 0, height: 0 }), detail.key))
  announcePlacement(t.value.workspace.fileBar.tearOut.replace('{name}', windowLabel(detail.key)))
}
function onTearMove(detail: { point: { x: number; y: number }; pointer: { x: number; y: number } }): void {
  tearFollow.value = detail.point
  const target = surfaceAtPoint(detail.pointer.x, detail.pointer.y)
  if (target === null) {
    clearDropIntent()
    return
  }
  resolveDropIntent(target, detail.pointer.x, detail.pointer.y)
}
function onTearCancel(): void {
  const snapshot = tearSnapshot
  const snapshotDomain = tearSnapshotDomain
  const name = tearId.value
  tearId.value = ''
  tearFollow.value = null
  tearOrigin.value = null
  tearSnapshot = null
  tearSnapshotDomain = ''
  tearOriginSurfaceId = ''
  clearDropIntent()
  if (snapshot !== null && snapshotDomain === domainKey.value) {
    void nextTick(() => {
      workspaceMap.value = withLayout(workspaceMap.value, snapshotDomain, assertInvariants(snapshot))
    })
  }
  if (name !== '') announcePlacement(t.value.workspace.fileBar.tearAttach.replace('{name}', windowLabel(name)))
}
function onTearEnd(): void {
  const key = tearId.value
  const split = splitPreview.value
  const mergeId = mergeSurfaceId.value
  tearId.value = ''
  tearFollow.value = null
  tearOrigin.value = null
  tearSnapshot = null
  tearSnapshotDomain = ''
  tearOriginSurfaceId = ''
  clearDropIntent()
  // 「保持悬浮」也要过一遍 prune:拆出会把该 tab 从它原来的区域摘掉,若那块区域因此被摘空,
  // 它就应该随这次落定被移除(根区域除外)。
  if (key === '') return
  if (split !== null) {
    commitLayout((current) => withSurfaceSplit(current, split.surfaceId, split.axis, key))
    announcePlacement(t.value.workspace.regions.splitAnnounce.replace('{name}', windowLabel(key)))
    return
  }
  if (mergeId === '') {
    commitLayout((current) => current)
    return
  }
  commitLayout((current) => {
    const surface = surfaceOf(current, mergeId)
    return surface === undefined ? current : dockWindow(current, key, mergeId, surface.members.length)
  })
  afterDock(mergeId, t.value.workspace.regions.mergeAnnounce.replace('{name}', windowLabel(key)))
}
// ---- 落点解析:拖 tab 与拖悬浮窗体落到**同一套**语义上 ----
// 落点表(两种手势共用):
//   · 顶部 tab 条(会话头)→ 停靠回条上;
//   · 某区域**边缘带**(右 / 下)→ 沿该边切分出子区域,被拖的窗体落进新区域;
//   · 某区域**内部**(非来源区域)→ 并入该区域(停靠成 tab);
//   · 都不是 → 保持悬浮(写回几何)。
// 判定**收敛到本页一处**:悬浮壳只上报指针视口坐标(drag-move / drag-end),顶部条的判定也归本页
// (组件不再自己判定),两类手势因此必然同源。
const splitPreview = ref<{ surfaceId: string; axis: Surface['axis']; rect: WindowRect } | null>(null)
const mergeSurfaceId = ref('')
let tearOriginSurfaceId = ''
// 命中带:区域**短边**的 20%,并夹在 [44px, 短边 × 1/3]。
// 依据:VS Code 单 tab 命中带 10%、整块 30%,而它的 10% 被公开记为可访问性问题;业界无标准值,
// 故取偏宽比例 + 44px 像素下限(窄区域也触发得了),并用 1/3 上界保证区域内仍留得出「内部」区。
const SPLIT_BAND_RATIO = 0.2
const SPLIT_BAND_MIN_PX = 44
const SPLIT_BAND_MAX_RATIO = 1 / 3
function edgeBand(rect: WindowRect): number {
  const short = Math.min(rect.width, rect.height)
  return Math.min(Math.max(short * SPLIT_BAND_RATIO, SPLIT_BAND_MIN_PX), short * SPLIT_BAND_MAX_RATIO)
}
function surfaceAtPoint(x: number, y: number): { surfaceId: string; rect: WindowRect } | null {
  let best: { surfaceId: string; rect: WindowRect } | null = null
  for (const element of Array.from(document.querySelectorAll<HTMLElement>('.conversation[data-surface-id]'))) {
    const rect = element.getBoundingClientRect()
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
    const surfaceId = element.dataset['surfaceId']
    if (surfaceId === undefined) continue
    if (best === null || rect.width * rect.height < best.rect.width * best.rect.height) {
      best = { surfaceId, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
    }
  }
  return best
}
function clearDropIntent(): void {
  splitPreview.value = null
  mergeSurfaceId.value = ''
}
function resolveDropIntent(target: { surfaceId: string; rect: WindowRect }, x: number, y: number): void {
  const { rect } = target
  const band = edgeBand(rect)
  const fromRight = rect.x + rect.width - x
  const fromBottom = rect.y + rect.height - y
  const nearRight = rect.width > 0 && fromRight <= band
  const nearBottom = rect.height > 0 && fromBottom <= band
  if (nearRight || nearBottom) {
    const axis: Surface['axis'] = nearRight && (!nearBottom || fromRight <= fromBottom) ? 'row' : 'column'
    const unchanged = splitPreview.value?.surfaceId === target.surfaceId && splitPreview.value.axis === axis
    mergeSurfaceId.value = ''
    splitPreview.value = { surfaceId: target.surfaceId, axis, rect }
    if (!unchanged) announcePlacement(t.value.workspace.regions[axis === 'row' ? 'splitRight' : 'splitBottom'])
    return
  }
  splitPreview.value = null
  if (target.surfaceId === tearOriginSurfaceId) {
    mergeSurfaceId.value = ''
    return
  }
  if (mergeSurfaceId.value === target.surfaceId) return
  mergeSurfaceId.value = target.surfaceId
  announcePlacement(t.value.workspace.regions.mergeHint)
}
// 顶部 tab 条 = 根区域的会话头那一行 —— 悬浮窗体拖到它上面松手即停靠回条上。根区域无成员时
// 它自己的会话头不渲染 → 取不到矩形 → 不构成落点(那时也没有「条」可停靠)。
function dockStripRect(): WindowRect | null {
  const heading = document.querySelector<HTMLElement>(`.conversation[data-surface-id="${CSS.escape(rootId.value)}"] .conversation-heading`)
  if (heading === null) return null
  const rect = heading.getBoundingClientRect()
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
function insideRect(rect: WindowRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}
const splitPreviewStyle = computed<Record<string, string>>(() => {
  const preview = splitPreview.value
  if (preview === null) return {}
  const { rect, axis } = preview
  const band = edgeBand(rect)
  return axis === 'row'
    ? { left: `${rect.x + rect.width - band}px`, top: `${rect.y}px`, width: `${band}px`, height: `${rect.height}px` }
    : { left: `${rect.x}px`, top: `${rect.y + rect.height - band}px`, width: `${rect.width}px`, height: `${band}px` }
})
function onRegionResize(parentId: string, index: number, percent: number): void {
  patchLayout((current) => setSeparatorPercent(current, parentId, index, percent))
}
// 键盘拆出(WCAG 2.5.7 的非拖拽通路):落点用默认几何,FLIP 从该 tab 的矩形滑出去。
function popOutTab(key: string, origin: WindowRect): void {
  popFlip.value = { key, origin }
  patchLayout((current) => focusWindow(floatWindow(current, key, { x: 0, y: 0, width: 0, height: 0 }), key))
  announcePlacement(t.value.workspace.fileBar.tearOut.replace('{name}', windowLabel(key)))
  void nextTick(() => {
    requestAnimationFrame(() => {
      if (popFlip.value?.key === key) popFlip.value = null
      // 标题栏是共用窗体壳(WindowFrame)里的一块,两类窗体共用它的类名;按**复合窗体 id** 选中
      // (data-window-id),保证同名文件跨项目时选到的一定是那一个窗口。
      const meta = document.querySelector<HTMLElement>(`[data-window-id="${CSS.escape(key)}"] .dl-window__meta`)
      meta?.focus()
    })
  })
}
// ---- 悬浮窗体拖动:组件只报指针坐标,落点由本页裁决(与拖 tab 同一个解析器)----
const dockTargetId = ref('')
const isDockTarget = computed(() => dockTargetId.value !== '')
const dockHintText = computed(() => {
  const win = layout.value.windows.find((item) => item.id === dockTargetId.value)
  return win !== undefined && win.content.kind === 'chat' ? t.value.workspace.chatWindow.dockHint : t.value.workspace.fileBar.dockHint
})
function setDockTarget(id: string, active: boolean): void {
  dockTargetId.value = active ? id : ''
  if (active) announcePlacement(t.value.workspace.fileBar.dockTarget.replace('{name}', windowLabel(id)))
}
// 悬浮窗体的「来源区域」:拖动开始时它**正落在**哪块区域上。来源在**首次拖 move** 时按指针位置
// 定一次(那一刻指针还在窗体标题栏上,即窗体当前所处的位置)。有了它,「在某区域内拖动 = 移动窗口」
// 与「拖进**别的**区域内部 = 并入」才能区分开 —— 否则悬浮窗压在区域上时的任何一次拖动都会被判成
// 「并入」,移动窗口就无从谈起(悬浮窗几乎总是压在某个区域上)。
let windowDragOriginSet = false
function onWindowDragMove(id: string, pointer: { x: number; y: number }): void {
  if (!windowDragOriginSet) {
    windowDragOriginSet = true
    tearOriginSurfaceId = surfaceAtPoint(pointer.x, pointer.y)?.surfaceId ?? ''
  }
  const strip = dockStripRect()
  if (strip !== null && insideRect(strip, pointer.x, pointer.y)) {
    // 顶部条优先于区域落点:会话头本身就是根区域的一部分,不先判它就只会被判成「并入根区域」。
    clearDropIntent()
    setDockTarget(id, true)
    return
  }
  setDockTarget(id, false)
  const target = surfaceAtPoint(pointer.x, pointer.y)
  if (target === null) {
    clearDropIntent()
    return
  }
  resolveDropIntent(target, pointer.x, pointer.y)
}
function onWindowDragCancel(id: string): void {
  windowDragOriginSet = false
  tearOriginSurfaceId = ''
  setDockTarget(id, false)
  clearDropIntent()
}
function onWindowDragEnd(id: string, pointer: { x: number; y: number }): void {
  const strip = dockStripRect()
  const inStrip = strip !== null && insideRect(strip, pointer.x, pointer.y)
  const split = splitPreview.value
  const mergeId = mergeSurfaceId.value
  windowDragOriginSet = false
  tearOriginSurfaceId = ''
  setDockTarget(id, false)
  clearDropIntent()
  if (inStrip) {
    // 停靠回条上(根区域):几何已由组件在 drag-end 之前经 rect-change 写回,这里取它作 FLIP 来源。
    dockFileWindow(id, layout.value.windows.find((win) => win.id === id)?.rect ?? null)
    return
  }
  if (split !== null) {
    commitLayout((current) => withSurfaceSplit(current, split.surfaceId, split.axis, id))
    announcePlacement(t.value.workspace.regions.splitAnnounce.replace('{name}', windowLabel(id)))
    return
  }
  if (mergeId !== '') {
    commitLayout((current) => {
      const surface = surfaceOf(current, mergeId)
      return surface === undefined ? current : dockWindow(current, id, mergeId, surface.members.length)
    })
    afterDock(mergeId, t.value.workspace.regions.mergeAnnounce.replace('{name}', windowLabel(id)))
    return
  }
  // 都不是 → 保持悬浮:几何已写回当前分域(组件在 drag-end 之前先 emitRect)。
}

// 侧栏触发钮住在「按区域渲染」的那段模板里,故用函数式 ref 接住当前那一个。
function bindSidebarTrigger(element: Element | ComponentPublicInstance | null): void {
  sidebarTrigger.value = element instanceof HTMLButtonElement ? element : null
}
// 聚焦某段对话的输入框(**按 id 取**:多区域 / 多窗体下 id 唯一,不受挂载次序影响)。
function focusComposer(sessionId: string): void {
  document.getElementById(`workspace-composer-${sessionId}`)?.focus()
}

// ---- 转录装载 ----
async function loadTranscript(sessionId: string): Promise<void> {
  const version = (transcriptVersions.get(sessionId) ?? 0) + 1
  transcriptVersions.set(sessionId, version)
  const demo = currentRoute.value.demoState
  // 演示态 error 只覆盖**装载落点**那段对话(与旧「当前会话」的 error 演示同义)。
  if (demo === 'error' && sessionId === landingSessionId.value) {
    patchRuntime(sessionId, (current) => ({ ...current, transcript: { status: 'error' } }))
    return
  }
  patchRuntime(sessionId, (current) => ({ ...current, transcript: { status: 'loading' } }))
  const result = await getTranscript(sessionId)
  if (!isAlive.value || version !== (transcriptVersions.get(sessionId) ?? 0)) return
  const next: TranscriptState = !result.ok
    ? { status: 'error' }
    : (result.value.length ? { status: 'ready', messages: result.value } : { status: 'empty' })
  // **不动 isPinned**:它是用户驱动的阅读位置(上滚 / 回到底部 / 滚到底),而本函数也会被
  // 后台重装调用(reloadWorkspace / ensureRuntime)。把它强制置回「粘底」会让用户刚上滚出来的
  // 「回到底部」按钮在装载落地那一刻凭空消失(实测在满负载下偶发)。需要重新粘底的是
  // **用户显式动作**(重试 / 发送),由调用方自己置位。首屏由 emptyRuntime() 的初值 true 承担。
  patchRuntime(sessionId, (current) => ({ ...current, transcript: next }))
}
// 新建一段对话的运行态(转录空态 + 可选初稿)。
function seedRuntime(sessionId: string, draft: string): void {
  chatRuntimes.value = withRuntime(chatRuntimes.value, sessionId, { ...emptyRuntime(), transcript: { status: 'empty' }, draft })
}
// 可见对话(区域活动成员 + 悬浮窗体)各取一份转录;已有则不再重取。
async function ensureRuntime(sessionId: string): Promise<void> {
  if (chatRuntimes.value[sessionId] === undefined) {
    chatRuntimes.value = withRuntime(chatRuntimes.value, sessionId, emptyRuntime())
    await loadTranscript(sessionId)
  }
  if (sessions.value.some((item) => item.id === sessionId)) await ensureTelemetry(sessionId)
}
const activeChatIds = computed<string[]>(() => layout.value.surfaces.flatMap((surface) => {
  const win = activeMemberOf(surface)
  return win !== null && win.content.kind === 'chat' ? [win.content.sessionId] : []
}))
const floatingChatIds = computed<string[]>(() => floatingWindows.value.flatMap((win) => (win.content.kind === 'chat' ? [win.content.sessionId] : [])))
const visibleChatIds = computed<string[]>(() => Array.from(new Set([...activeChatIds.value, ...floatingChatIds.value])))

// ---- 遥测与确认(按会话)----
async function ensureTelemetry(sessionId: string): Promise<void> {
  if (telemetryLoaded.has(sessionId)) return
  const found = sessions.value.find((item) => item.id === sessionId)
  if (found === undefined) return
  telemetryLoaded.add(sessionId)
  await loadTelemetry(sessionId)
}
async function loadTelemetry(sessionId: string): Promise<void> {
  const found = sessions.value.find((item) => item.id === sessionId)
  if (found === undefined) return
  telemetryVersionFor(sessionId)
  const version = telemetryVersions.get(sessionId) ?? 0
  const result = await getAgentRuntime(found.agent, found.projectId, sessionId)
  if (!isAlive.value || version !== (telemetryVersions.get(sessionId) ?? 0)) return
  patchRuntime(sessionId, (current) => ({ ...current, telemetry: result.ok ? result.value : null }))
  await loadConfirmation(sessionId)
}
function telemetryVersionFor(sessionId: string): void {
  telemetryVersions.set(sessionId, (telemetryVersions.get(sessionId) ?? 0) + 1)
}
// 「等待交互」确认请求只在**该段对话**处于等待态时呈现 —— 转录里的确认卡、文件面板的确认区、
// 项目树里的 pending 芯片都从它派生。
async function loadConfirmation(sessionId: string): Promise<void> {
  confirmationVersions.set(sessionId, (confirmationVersions.get(sessionId) ?? 0) + 1)
  const version = confirmationVersions.get(sessionId) ?? 0
  const result = await getConfirmationRequest(sessionId)
  if (!isAlive.value || version !== (confirmationVersions.get(sessionId) ?? 0)) return
  patchRuntime(sessionId, (current) => {
    const next = result.ok ? result.value : null
    // 取回的是**同一个**确认请求时,不重置已处理的结果:装载 / 遥测刷新都会重取确认请求,
    // 而它们与用户的「允许 / 拒绝」点击是赛跑的 —— 早先无条件清空 confirmationOutcome / followUp
    // 的写法会把刚塌缩的留痕凭空抹掉(实测 8 次里复现 1 次,留痕整条消失)。
    // 换了一个请求(会话重新进入等待态)才重置成待处理态。
    if (next !== null && current.confirmation?.id === next.id) return { ...current, confirmation: next }
    return { ...current, confirmation: next, confirmationOutcome: null, followUp: null }
  })
}
// 处理确认:卡片塌缩成一行留痕,并追加一段后续消息。
function resolveConfirmation(sessionId: string, allowed: boolean): void {
  if (sessionId === '' || runtimeFor(sessionId).confirmation === null) return
  const body = allowed ? t.value.workspace.confirmation.followUpAllowed : t.value.workspace.confirmation.followUpRejected
  const followUp: ChatMessage = { id: `confirmation-followup-${allowed ? 'allowed' : 'rejected'}`, role: 'assistant', body, createdAt: new Date().toISOString(), attachments: [] }
  patchRuntime(sessionId, (current) => ({ ...current, confirmationOutcome: allowed ? 'allowed' : 'rejected', followUp }))
}
// 文件面板里的确认动作:落到**持有该确认请求**的那段对话上(与转录里的确认卡同一个请求)。
function resolveFileConfirmation(allowed: boolean): void {
  resolveConfirmation(confirmationOwnerId(), allowed)
}

// ---- 生成 ----
function takeOverTranscript(sessionId: string): void {
  transcriptVersions.set(sessionId, (transcriptVersions.get(sessionId) ?? 0) + 1)
}
function clearStreamTimer(sessionId: string): void {
  const timer = streamTimers.get(sessionId)
  if (timer !== undefined) {
    clearInterval(timer)
    streamTimers.delete(sessionId)
  }
}
function updateResponse(sessionId: string, body: string): void {
  const current = runtimeFor(sessionId)
  if (current.rendered === null || current.transcript.status !== 'ready') return
  const rendered: ChatMessage = { ...current.rendered, body }
  const messages = current.transcript.messages.map((message) => (message.id === current.rendered?.id ? { ...message, body } : message))
  patchRuntime(sessionId, (state) => ({ ...state, rendered, transcript: { status: 'ready', messages } }))
}
async function finishResponse(sessionId: string, isStopped: boolean): Promise<void> {
  clearStreamTimer(sessionId)
  patchRuntime(sessionId, (current) => ({ ...current, generation: isStopped ? 'stopped' : 'complete' }))
  const current = runtimeFor(sessionId)
  if (current.rendered === null) return
  patchRuntime(sessionId, (state) => ({ ...state, isSaving: true }))
  const saved = await saveResponse(sessionId, { ...current.rendered })
  if (!isAlive.value) return
  patchRuntime(sessionId, (state) => ({ ...state, isSaving: false, hasSendError: state.hasSendError || !saved.ok }))
  if (isLocalePending.value) {
    isLocalePending.value = false
    await reloadWorkspace(false)
  }
}
function startStream(sessionId: string): void {
  const current = runtimeFor(sessionId)
  if (current.full === null || current.rendered === null) return
  patchRuntime(sessionId, (state) => ({ ...state, generation: 'streaming' }))
  if (motionMedia.matches) {
    updateResponse(sessionId, current.full.body)
    void finishResponse(sessionId, false)
    return
  }
  clearStreamTimer(sessionId)
  streamTimers.set(sessionId, setInterval(() => {
    const now = runtimeFor(sessionId)
    if (now.full === null || now.rendered === null) return
    updateResponse(sessionId, now.full.body.slice(0, now.rendered.body.length + STREAM_CHUNK))
    if (now.rendered.body.length >= now.full.body.length) void finishResponse(sessionId, false)
  }, STREAM_INTERVAL))
}
async function send(sessionId: string, text: string): Promise<void> {
  const trimmed = text.trim()
  if (trimmed === '' || isBusyOf(sessionId)) return
  const current = runtimeFor(sessionId)
  if (current.transcript.status === 'loading' || current.transcript.status === 'error') return
  // 本轮带出去的附件(含粘贴文本的**全文**):发送即随消息出去,发送成功后从草稿里清空。
  const outgoing = current.attachments.map((attachment) => ({ ...attachment }))
  seenSessions.value = new Set([...seenSessions.value].filter((id) => id !== sessionId))
  // 发送即接管转录:把在途的旧装载作废,免得它的结果在本次发送之后写回来。
  takeOverTranscript(sessionId)
  const existing = current.transcript.status === 'ready' ? current.transcript.messages : []
  const pending: ChatMessage = { id: 'pending-user', role: 'user', body: trimmed, createdAt: new Date().toISOString(), attachments: outgoing }
  patchRuntime(sessionId, (state) => ({
    ...state,
    hasSendError: false,
    hasStopRequested: false,
    generation: 'queued',
    highlightTurnId: null,
    // 空态没有历史消息的阅读位置 → 恢复跟随;否则保留既有的粘底状态(用户上滚过就不抢)。
    isPinned: state.transcript.status === 'empty' ? true : state.isPinned,
    draft: '',
    attachments: [],
    transcript: { status: 'ready', messages: [...existing, pending] },
  }))
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  const result = await sendMessage(sessionId, trimmed, outgoing)
  if (!isAlive.value) return
  if (!result.ok) {
    // 发送失败:把文本与附件退回草稿,转录回到发送前。
    patchRuntime(sessionId, (state) => ({ ...state, transcript: existing.length ? { status: 'ready', messages: existing } : { status: 'empty' }, draft: trimmed, attachments: outgoing, generation: 'idle', hasSendError: true }))
    return
  }
  const full = result.value
  const rendered: ChatMessage = { ...full, body: '' }
  patchRuntime(sessionId, (state) => ({ ...state, full, rendered, transcript: { status: 'ready', messages: [...existing, { ...pending, id: `${full.id}-user` }, rendered] } }))
  const found = sessions.value.find((item) => item.id === sessionId)
  if (found !== undefined && sessionId.startsWith('draft-')) found.title = trimmed
  if (runtimeFor(sessionId).hasStopRequested) await finishResponse(sessionId, true)
  else startStream(sessionId)
}
function stop(sessionId: string): void {
  const current = runtimeFor(sessionId)
  if (current.generation === 'queued') {
    patchRuntime(sessionId, (state) => ({ ...state, hasStopRequested: true }))
    return
  }
  if (current.generation === 'streaming') void finishResponse(sessionId, true)
}
function regenerate(sessionId: string): void {
  const current = runtimeFor(sessionId)
  if (isBusyOf(sessionId) || current.full === null) return
  seenSessions.value = new Set([...seenSessions.value].filter((id) => id !== sessionId))
  updateResponse(sessionId, '')
  startStream(sessionId)
}
// 转录 error 态的重试:演示态下先回常规路由(与旧「重试」同义),否则就地重取该会话的转录。
function retrySession(sessionId: string): void {
  if (currentRoute.value.demoState !== 'normal') {
    navigateTo('workspace')
    return
  }
  takeOverTranscript(sessionId)
  // 重试是**用户显式动作**:重取转录后回到粘底(与发送同一语义)。
  patchRuntime(sessionId, (state) => ({ ...state, isPinned: true }))
  void loadTranscript(sessionId)
}
// 清掉所有会话正在进行的生成(切演示态时调用,避免旧流写进新的转录)。
function resetGenerations(): void {
  for (const [id, timer] of streamTimers) {
    clearInterval(timer)
    streamTimers.delete(id)
  }
  const next: Record<string, ChatRuntime> = {}
  for (const [id, current] of Object.entries(chatRuntimes.value)) {
    next[id] = current.generation === 'idle' ? current : { ...current, generation: 'idle', rendered: null, full: null, hasStopRequested: false }
  }
  chatRuntimes.value = next
}

// ---- 装载与重装 ----
// 让一段对话成为**指定区域**的活动成员(已在 → 只激活;被关掉过 → 补回;被拆出为悬浮 → 只置顶;
// 已在**别的**区域开着 → 由 dockWindow 的**移动**语义搬过来)。
// 经 commitLayout(而非 patchLayout):搬走一段对话可能把原区域摘空,而「摘空即移除」是页面既定的
// 区域生命周期规则 —— 走过一遍 prune,那块空区域才会随这次搬运一起消失(根区域除外)。
// 入参是**内容**(而非裸会话 id):窗体身份是复合键,内容自带 projectId,不必再去「当前项目」反查。
function activateChatContent(surfaceId: string, content: ChatTab): void {
  commitLayout((current) => activateChatContentAt(current, surfaceId, content))
}
function activateChatContentAt(current: WorkspaceLayout, surfaceId: string, content: ChatTab): WorkspaceLayout {
  const id = windowIdOf(content)
  const win = current.windows.find((item) => item.id === id)
  if (win !== undefined && win.placement === 'floating') return focusWindow(current, id)
  const surface = surfaceOf(current, surfaceId)
  if (surface === undefined) return current
  if (surface.members.includes(id) && win?.visible === true) return activateTab(current, surfaceId, id)
  const base = win === undefined ? seedChatWindow(current, surfaceId, content, 0) : current
  return dockWindow(base, id, surfaceId, 0)
}
// 会话 → 窗体内容(复合键的组成)。会话本身带 projectId,故归属永不丢失。
function chatTabOf(session: ChatSession): ChatTab {
  return { kind: 'chat', projectId: session.projectId, sessionId: session.id }
}
// 保证一段对话是**指定区域**的成员(不改变它是否活动)。
// 新语义下仍然安全:它自带 `surface.members.includes(id)` 早退 —— 已是**本区域**成员时
// 一个字段都不动(不会把自己搬走再搬回来)。只有「窗体存在于别处(别的区域 / 悬浮)」时才会落到
// dockWindow;那是移动,不产生重复成员(不变量③)。同样经 commitLayout 兜住「搬空来源区域」。
function ensureChatMemberContent(surfaceId: string, content: ChatTab): void {
  commitLayout((current) => {
    const id = windowIdOf(content)
    const win = current.windows.find((item) => item.id === id)
    if (win !== undefined && win.placement === 'floating') return current
    const surface = surfaceOf(current, surfaceId)
    if (surface === undefined || surface.members.includes(id)) return current
    const base = win === undefined ? seedChatWindow(current, surfaceId, content, surface.members.length) : current
    return dockWindow(base, id, surfaceId, surface.members.length)
  })
}
// 装载落点对齐:根区域显示落地那段对话(根区域正显示**文件**时不动它 —— 装载不该抢走用户在看的文件)。
function reconcileLanding(): void {
  const surfaceId = rootId.value
  const surface = surfaceOf(layout.value, surfaceId)
  const win = surface === undefined ? null : activeMemberOf(surface)
  const landing = landingSessionId.value
  if (landing === '') {
    if (win !== null && win.content.kind === 'chat') patchLayout((current) => blurSurface(current, surfaceId))
    return
  }
  const found = sessions.value.find((item) => item.id === landing)
  if (found === undefined) return
  const content = chatTabOf(found)
  const id = windowIdOf(content)
  // 落点那段对话**已被用户关掉**时不再把它拉回来:关 tab 只把窗体的 visible 置假(关闭 ≠ 删除,
  // 几何与层序要留着),而本函数会被每一次重载调用(切语言 / 重试 / 演示态)——
  // 不加这道闸,一次与用户无关的重载就会把刚关掉的对话连草稿一起放回条上,
  // 甚至把「所有 tab 都关掉 → 引导页」那个状态静默顶掉。
  // 窗体**还不存在**(首屏:补成员是异步的 watcher)时照常放行,故首屏落点不受影响。
  const landingWin = layout.value.windows.find((item) => item.id === id)
  if (isMinimizedWindow(layout.value, id) || (landingWin !== undefined && !landingWin.visible)) return
  // 落点那段对话**已属于别的区域**时也不动它:本函数只负责「根区域该显示哪段对话」,不该把
  // 用户刚搬进别处(切换器选择 / 拖拽)的那段拽回根区域。归属就是根区域时照常走既有逻辑。
  const landingOwner = surfaceOwning(layout.value, id)
  if (landingOwner !== undefined && landingOwner.id !== surfaceId) return
  if (win === null || win.content.kind === 'chat') {
    activateChatContent(surfaceId, content)
    return
  }
  ensureChatMemberContent(surfaceId, content)
}
// 离开当前分域**之前**:把根区域的内容区交回给一段对话(它不该停在一个文件上 —— 回到本域时
// 应看到对话,而不是上次打开的文件)。已在对话上则不动;优先落到装载那段对话,否则取首个对话成员。
// 这是「切域」这一动作的收尾,与「装载落点」无关,故不写在 reloadWorkspace 里。
function showConversation(): void {
  const surfaceId = rootId.value
  const surface = surfaceOf(layout.value, surfaceId)
  const win = surface === undefined ? null : activeMemberOf(surface)
  if (win !== null && win.content.kind === 'chat') return
  const chats = visibleMemberWindows(layout.value, surfaceId).flatMap((item) => (item.content.kind === 'chat' ? [item.content] : []))
  const target = chats.find((item) => item.sessionId === landingSessionId.value) ?? chats[0]
  if (target === undefined) return
  activateChatContent(surfaceId, target)
}
// 重装工作台视图:取项目列表 → 取该 Agent 全部已打开项目的会话 → 对齐落点 → 刷新落点的转录 / 遥测。
// 平权之后**没有「当前项目」**:不再「落到选中项目」,而是装载整个 Agent 的会话(跨它已打开的项目)。
async function reloadWorkspace(pickFirstSession: boolean, autoExpand = false, force = false): Promise<void> {
  // 一个 Agent 都没有时没有可装载的工作台(正常路径不会发生:mock 至少保留一个)。
  if (selectedAgent.value === '') {
    projects.value = []
    projectsStatus.value = 'empty'
    sessions.value = []
    sessionStatus.value = 'empty'
    return
  }
  if (isBusy.value && !force) { isLocalePending.value = true; return }
  workspaceVersion += 1
  const version = workspaceVersion
  const navigationAtStart = userNavigationVersion
  projectsStatus.value = 'loading'
  const projectResult = await listProjects(selectedAgent.value)
  if (!isAlive.value || version !== workspaceVersion) return
  if (!projectResult.ok) { projectsStatus.value = 'error'; return }
  projects.value = projectResult.value
  projectsStatus.value = projects.value.length ? 'ready' : 'empty'
  // 多项目同时展开:自动展开时**只补首个项目**,不收起用户已经展开的其它项目(单展开已废除)。
  const openIds = projects.value.map((project) => project.id)
  projectSkills.value = Object.fromEntries(Object.entries(projectSkills.value).filter(([id]) => openIds.includes(id)))
  skillStatus.value = Object.fromEntries(Object.entries(skillStatus.value).filter(([id]) => openIds.includes(id)))
  for (const id of openIds) void ensureProjectSkills(id)
  const expanded = new Set([...expandedProjects.value].filter((id) => openIds.includes(id)))
  if (autoExpand && expanded.size === 0) {
    const first = openIds[0]
    if (first !== undefined) expanded.add(first)
  }
  expandedProjects.value = expanded
  for (const id of expanded) void ensureProjectTree(id)
  if (projects.value.length === 0) {
    sessions.value = []
    sessionStatus.value = 'empty'
    landingSessionId.value = ''
    return
  }
  sessionStatus.value = 'loading'
  const sessionResult = await listSessions(selectedAgent.value)
  if (!isAlive.value || version !== workspaceVersion) return
  sessions.value = sessionResult.ok ? sessionResult.value : []
  sessionStatus.value = sessionResult.ok ? (sessions.value.length ? 'ready' : 'empty') : 'error'
  // 落到首条:调用方要求时,或落点非空却不属于本 Agent 的会话集(换了 Agent)。
  // 只有在**这次装载期间用户没有显式导航**时才重置落点 —— 否则会把用户刚选的会话抢回去。
  if (navigationAtStart === userNavigationVersion) {
    const belongsHere = sessions.value.some((item) => item.id === landingSessionId.value)
    if (pickFirstSession || (landingSessionId.value !== '' && !belongsHere)) landingSessionId.value = sessions.value[0]?.id ?? ''
    reconcileLanding()
  }
  // 转录:只刷新落点会话(其余可见对话各由 visibleChatIds 的 watcher 按需取)。
  // 正在生成的会话由客户端持有 —— 刷新会把它打断,故跳过(草稿 / 转录在这条路径上都不会丢)。
  const landing = landingSessionId.value
  if (landing !== '') {
    const phase = runtimeFor(landing).generation
    if (phase === 'idle' || phase === 'complete' || phase === 'stopped') await loadTranscript(landing)
    telemetryLoaded.delete(landing)
    await ensureTelemetry(landing)
  }
}

// 项目行**单控件**:整行一个按钮。点击 = **toggle 它自己的展开态**,不动别的项目
// (单展开 + 选中语义已废除 —— 平权之后没有「当前项目」)。
async function toggleProjectRow(project: Project): Promise<void> {
  const next = new Set(expandedProjects.value)
  if (next.has(project.id)) {
    next.delete(project.id)
  } else {
    next.add(project.id)
    void ensureProjectTree(project.id)
  }
  expandedProjects.value = next
}
// 关闭项目:一并关掉它在 tab 区与悬浮层的**所有**窗口,并把「已关闭项目 X」与「关闭了 N 个窗口」
// **合成一条**播报(announcePlacement 是「后写覆盖先写」的单通道,分两次调用会丢前一条)。
// 目标是不留下「侧栏里没有入口、却还占着 tab」的孤儿窗口 —— 那正是 layoutViolations ⑨ 要拦的状态。
async function onCloseProject(project: Project): Promise<void> {
  if (isBusy.value) return
  openMenuSurfaceId.value = ''
  const result = await closeProjectRequest(project.id)
  if (!isAlive.value || !result.ok) return
  const domain = domainKey.value
  const current = layoutOf(workspaceMap.value, domain)
  const doomed = current.windows.filter((win) => win.content.projectId === project.id).map((win) => win.id)
  if (doomed.length > 0) {
    const next = pruneEmptySurfaces(dropWindows(current, doomed))
    workspaceMap.value = withLayout(workspaceMap.value, domain, assertInvariants(next))
  }
  announcePlacement(t.value.workspace.closedProject.replace('{name}', project.name).replace('{count}', String(doomed.length)))
  await reloadWorkspace(false)
}
async function confirmOpenProject(paths: string[]): Promise<void> {
  isPickerOpen.value = false
  if (paths.length === 0) return
  let openedId = ''
  const openedIds: string[] = []
  for (const path of paths) {
    const result = await openProject(selectedAgent.value, path)
    if (result.ok) {
      openedId = result.value.id
      openedIds.push(openedId)
    }
  }
  if (!isAlive.value || openedId === '') return
  openMenuSurfaceId.value = ''
  // 新打开的项目**自动展开**,但**不收起**用户已经展开的其它项目。
  expandedProjects.value = new Set([...expandedProjects.value, ...openedIds])
  await reloadWorkspace(false)
}
function retryProjects(): void {
  void reloadWorkspace(false)
}

// ---- Agent 身份与插件 ----
// Agent 列表是工作台身份的单一来源:切换器、设置对话框与通知分组都从它取名称 / 备注。
async function loadAgents(): Promise<void> {
  agentsStatus.value = 'loading'
  const result = await listAgents()
  if (!isAlive.value) return
  if (!result.ok) { agentsStatus.value = 'error'; return }
  agents.value = result.value
  agentsStatus.value = 'ready'
  // 当前 Agent 可能已被删除(或首次装载时不存在):回退到列表里的第一个。
  if (!agents.value.some((agent) => agent.id === selectedAgent.value)) {
    selectedAgent.value = agents.value[0]?.id ?? ''
  }
}
function retryAgents(): void {
  void loadAgents().then(() => { if (selectedAgent.value !== '') void reloadWorkspace(false, true) })
}

function openAgentSettings(): void {
  agentEditorFocusSecurity.value = false
  agentEditorError.value = ''
  isAgentEditorOpen.value = true
}
function clearPairingHash(): void {
  const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  query.delete('pair')
  query.delete('secret')
  const suffix = query.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/workspace${suffix === '' ? '' : `?${suffix}`}`)
}
function resetPairingInvite(): void {
  clearPairingHash()
  pairingSessionId.value = ''
  pairingLinkSecret.value = ''
}
function openAgentCreate(): void {
  isAgentEditorOpen.value = false
  resetPairingInvite()
  isPairingOpen.value = true
}
function openAgentRePair(): void {
  // 设置保持打开,上层配对取消后由原生 dialog 将焦点交回重新配对按钮。
  resetPairingInvite()
  isPairingOpen.value = true
}
function closePairing(): void {
  isPairingOpen.value = false
  clearPairingHash()
}
function syncPairingHash(): void {
  if (!isIdentityUnlocked.value) return
  const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const id = query.get('pair') ?? ''
  if (id === '') return
  if (!isPairingOpen.value) isAgentEditorOpen.value = false
  pairingSessionId.value = id
  pairingLinkSecret.value = query.get('secret') ?? ''
  isPairingOpen.value = true
}
function onPairingLink(id: string, secret: string): void {
  const query = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  query.set('pair', id)
  query.set('secret', secret)
  const hash = `#/workspace?${query}`
  if (window.location.hash === hash) syncPairingHash()
  else window.location.hash = hash
}
async function onIdentityUnlocked(): Promise<void> {
  isIdentityCovered.value = false
  isIdentityUnlocked.value = true
  syncPairingHash()
  await nextTick()
  if (!isPairingOpen.value) pageRoot.value?.focus({ preventScroll: true })
}
function onIdentityLocked(): void {
  isIdentityCovered.value = true
  isIdentityUnlocked.value = false
  isAgentEditorOpen.value = false
  closePairing()
}
function onAgentIdentityUpdated(summary: AgentSummary): void {
  agents.value = agents.value.map((agent) => agent.id === summary.id ? summary : agent)
}
async function onAgentPaired(summary: AgentSummary, details: boolean): Promise<void> {
  isAgentEditorOpen.value = false
  agents.value = [...agents.value.filter((agent) => agent.id !== summary.id), summary]
  closePairing()
  announcePlacement(t.value.workspace.agentAdmin.created.replace('{name}', summary.name))
  await onSelectAgent(summary.id)
  if (details) {
    agentEditorFocusSecurity.value = true
    agentEditorError.value = ''
    await nextTick()
    isAgentEditorOpen.value = true
  }
}
async function onSubmitAgent(config: AgentConfig): Promise<void> {
  if (agentEditorBusy.value) return
  agentEditorBusy.value = true
  agentEditorError.value = ''
  const result = await updateAgent(selectedAgent.value, config)
  agentEditorBusy.value = false
  if (!isAlive.value) return
  if (!result.ok) { agentEditorError.value = result.error.message; return }
  const summary = result.value
  agents.value = agents.value.map((agent) => (agent.id === summary.id ? summary : agent))
  // 保存是 Apply 语义:不关闭对话框,让用户继续配置其它项;由对话框内联状态提示结果。
  agentEditorSavedToken.value += 1
  // 模型可能改了:刷新可见会话的遥测,让状态条里的模型名与设置一致。
  for (const id of visibleChatIds.value) {
    telemetryLoaded.delete(id)
    void ensureTelemetry(id)
  }
}
async function onDeleteAgent(): Promise<void> {
  if (agentEditorBusy.value) return
  const target = currentAgent.value
  if (target === undefined) return
  agentEditorBusy.value = true
  agentEditorError.value = ''
  const result = await deleteAgent(target.id)
  agentEditorBusy.value = false
  if (!isAlive.value) return
  if (!result.ok) { agentEditorError.value = result.error.message; return }
  agents.value = agents.value.filter((agent) => agent.id !== target.id)
  isAgentEditorOpen.value = false
  announcePlacement(t.value.workspace.agentAdmin.deleted.replace('{name}', target.name))
  if (selectedAgent.value === target.id) {
    const next = agents.value[0]
    if (next !== undefined) await onSelectAgent(next.id)
  }
}
async function closeDrawer(): Promise<void> {
  isDrawerOpen.value = false
  await nextTick()
  sidebarTrigger.value?.focus()
}
async function openDrawer(): Promise<void> {
  isDrawerOpen.value = true
  await nextTick()
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const firstButton = drawer.value?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? null
  if (firstButton === null) return
  for (let attempt = 0; attempt < 8; attempt += 1) {
    firstButton.focus()
    if (document.activeElement === firstButton) return
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}
function drawerFocusables(): HTMLElement[] {
  // 两个顶层面板用 v-show 保留状态:隐藏控件不能成为焦点边界,配置页输入框也必须圈在抽屉里。
  const elements = Array.from(drawer.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]') ?? [])
  return elements.filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0
    && getComputedStyle(element).visibility !== 'hidden' && element.closest('[inert]') === null)
}
function drawerKeyboard(event: KeyboardEvent): void {
  if (!isDrawerOpen.value) return
  // 有原生 dialog 打开时,Esc 与焦点陷阱归最上层 dialog:抽屉不能抢走这次 Escape,
  // 否则一次按键会同时关掉弹层与抽屉(实测)。
  if (document.querySelector('dialog[open]') !== null) return
  if (event.key === 'Escape') { event.preventDefault(); void closeDrawer(); return }
  if (event.key !== 'Tab') return
  const controls = drawerFocusables()
  const first = controls[0]
  const last = controls.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
// 演示态对「选中已有会话」的动作:empty / error 会覆盖转录,必须回到常规态才能读到真实内容。
function leaveDataDemoState(): boolean {
  const demo = currentRoute.value.demoState
  if (demo === 'empty' || demo === 'error') {
    navigateTo('workspace')
    return true
  }
  return false
}
// 菜单开合:整页**至多一个区域**的菜单打开 —— 打开一个即收起别的(展开态按区域收窄,
// 但同一时刻只允许一个,免得两个浮层同时压在界面上)。
function onMenuOpen(surfaceId: string, open: boolean): void {
  // ▾ 菜单与文件选择浮层互斥:菜单一旦打开,文件浮层让位(两者都锚在标题行,叠加会互相遮挡)。
  if (open) closeFilePicker()
  openMenuSurfaceId.value = open ? surfaceId : ''
}
// tab 重排的 aria-live 播报:先清空再设置,连续两次相同文本也能重新触发。通道是全页唯一的那条,
// 由本页持有(组件把文本报上来)。
function onTabAnnounce(text: string): void {
  tabAnnounce.value = ''
  void nextTick(() => { tabAnnounce.value = text })
}
// 选中会话:把该对话作为**它所在那块区域**的活动成员,收起对话切换器。**不动草稿** ——
// 每段对话的草稿各自独立,切走再切回必须原样还在(本需求的核心不变量)。
async function selectSession(surfaceId: string, target: ChatSession): Promise<void> {
  userNavigationVersion += 1
  openMenuSurfaceId.value = ''
  landingSessionId.value = target.id
  const restoredSurface = restoreWindowGroup(windowIdOf(chatTabOf(target)))
  if (restoredSurface !== '') surfaceId = restoredSurface
  // 点对话 tab = 显示它:先让遮挡这块区域的浮窗让位。目标本身是**悬浮**窗体时不适用 ——
  // 那条路是「置顶它」,收起会把它自己也收掉。窗体身份是复合键(项目 + 会话)。
  const targetWin = layout.value.windows.find((item) => item.id === windowIdOf(chatTabOf(target)))
  const hidden = targetWin === undefined || targetWin.placement !== 'floating' ? uncoverSurface(surfaceId) : 0
  activateChatContent(surfaceId, chatTabOf(target))
  if (hidden > 0) announcePlacement(occludedMessage(hidden))
  if (isDrawerOpen.value) await closeDrawer()
  if (!leaveDataDemoState()) await reloadWorkspace(false)
}
// 显式打开最小化成员时先恢复其组，返回原区域，绝不把它搬到发起区域。
function restoreWindowGroup(id: string): string {
  const group = groupOfWindow(layout.value, id)
  if (group === undefined) return ''
  restoreDockGroup(group.id, id)
  return surfaceOwning(layout.value, id)?.id ?? rootId.value
}
function focusRestoredTab(id: string, surfaceId: string): void {
  void nextTick(() => {
    const win = layout.value.windows.find((item) => item.id === id)
    const chatId = win?.content.kind === 'chat' ? win.content.sessionId : ''
    const tab = document.querySelector<HTMLElement>(`.conversation-tab[data-tab-id="${CSS.escape(chatId)}"], .file-tab[data-file-key="${CSS.escape(id)}"]`)
    if (tab !== null) { tab.focus(); return }
    document.getElementById(panelIdOf(surfaceId))?.focus()
  })
}
function minimizableProjectsOf(surfaceId: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const win of tabWindowsOf(surfaceId)) {
    const projectId = win.content.projectId
    counts[projectId] = (counts[projectId] ?? 0) + 1
  }
  return counts
}
// 当前活动 tab 的归属项目:tab 条上的整组最小化钮按它决定「收哪一组」。
function minimizeProject(surfaceId: string, projectId: string): void {
  const visible = visibleMemberWindows(layout.value, surfaceId)
  const memberIds = visible.filter((win) => win.content.projectId === projectId).map((win) => win.id)
  if (memberIds.length === 0) return
  // 该项目的页签就是这块区域仅剩的可见内容 → 收起的是整块显示区。
  // 根区域例外:它不会被 minimized(否则整页没有可渲染的区域),项目组仍按组逐个收,
  // 全部收起后由「全部最小化」空态承接;条上的最小化钮仍按整区收起。
  const surface = surfaceOf(layout.value, surfaceId)
  if (memberIds.length === visible.length && surface !== undefined && surface.parentId !== null) {
    minimizeSurface(surfaceId)
    return
  }
  const name = projectNameOf(projectId)
  const lastActiveId = surfaceOf(layout.value, surfaceId)?.activeId ?? ''
  const sourceWindowId = memberIds.includes(lastActiveId) ? lastActiveId : (memberIds.at(-1) ?? '')
  const source = flightRectOf(tabFlightSelector(sourceWindowId))
  patchLayout((current) => minimizeGroup(current, { surfaceId, projectId, name, memberIds, lastActiveId, isSurface: false }))
  openMenuSurfaceId.value = ''
  announcePlacement(t.value.workspace.dock.minimizedAnnounce.replace('{name}', name).replace('{count}', String(memberIds.length)))
  const groupId = `group:${surfaceId}:${projectId}`
  afterNextPaint(() => {
    const target = flightRectOf(chipFlightSelector(groupId))
    if (source !== null && target !== null) flight.fly(source, target)
    pulseDockGroup(groupId)
  })
  void nextTick(() => document.querySelector<HTMLButtonElement>(`[data-group-menu="${CSS.escape(groupId)}"]`)?.focus())
}
// 收起整块显示区:区域树位置 / 权重不动,只置 minimized;渲染层跳过它,兄弟区域吃满空间。
// 底栏条目按「整块显示区」恢复,不会把成员搬进兄弟区域。
function minimizeSurface(surfaceId: string): void {
  const surface = surfaceOf(layout.value, surfaceId)
  if (surface === undefined) return
  const members = memberWindows(layout.value, surfaceId)
  const active = members.find((win) => win.id === surface.activeId) ?? members[0]
  if (active === undefined) return
  const name = projectNameOf(active.content.projectId)
  const sourceElement = document.querySelector<HTMLElement>(surfaceFlightSelector(surfaceId))
  const source = sourceElement === null ? null : (() => {
    const rect = sourceElement.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })()
  // 状态切换后源面板就不在 DOM 里了,快照必须**切换前**克隆。
  const sourceClone = sourceElement === null ? null : sourceElement.cloneNode(true) as HTMLElement
  // 根区域不能被标记 minimized(它必须留在树里承载引导页),故这里按项目拆成**普通组**,
  // 与 minimizeProject 的既有分流一致。单项目时底栏仍只有一条(标签 / 数量不变);
  // 多项目时每个项目一条,恢复入口与项目标签对得上。若继续为根区域建 isSurface 组,
  // 组快照会在该区域新增成员后落后于 surface.members,违反「整区组必须覆盖全部成员」
  // 的不变量(DEV 下稳定报 [layout-invariant])。
  const isRoot = surface.parentId === null
  const groupId = isRoot
    ? `group:${surfaceId}:${active.content.projectId}`
    : `group:${surfaceId}:surface`
  patchLayout((current) => {
    if (!isRoot) return minimizeSurfaceOp(current, { surfaceId, projectId: active.content.projectId, name, lastActiveId: active.id })
    const projectIds = [...new Set(members.map((win) => win.content.projectId))]
    return projectIds.reduce((next, projectId) => {
      const ids = members.filter((win) => win.content.projectId === projectId).map((win) => win.id)
      return minimizeGroup(next, {
        surfaceId,
        projectId,
        name: projectNameOf(projectId),
        memberIds: ids,
        lastActiveId: ids.includes(surface.activeId) ? surface.activeId : (ids.at(-1) ?? ''),
        isSurface: false,
        // 这些组由「最小化这个显示区」产生;恢复时若来源区域已有新内容(收起后新建的对话),
        // 要切出一块新区域与它并排,而不是把新旧内容并进同一个 tab 区(见 restoreAreaGroup)。
        isArea: true,
      })
    }, current)
  })
  openMenuSurfaceId.value = ''
  announcePlacement(t.value.workspace.dock.minimizedAnnounce.replace('{name}', name).replace('{count}', String(members.length)))
  // 收起的区域若本来持有焦点(典型:左侧根区),把焦点交给仍可见的下一块区域的 active 成员 ——
  // 否则全页 h1 会落回根区域并读成「新建对话」,与屏幕上剩下的右侧区域对不上。
  if (layout.value.focus === '') {
    const fallback = layout.value.surfaces.find((item) => !item.minimized && item.activeId !== '' && !isMinimizedWindow(layout.value, item.activeId))
    if (fallback !== undefined) patchLayout((current) => focusWindow(current, fallback.activeId))
  }
  afterNextPaint(() => {
    const target = flightRectOf(chipFlightSelector(groupId))
    if (source !== null && target !== null) flight.fly(source, target, { sourceClone })
    pulseDockGroup(groupId)
  })
  void nextTick(() => document.querySelector<HTMLButtonElement>(`.workspace-dock__menu[data-group-menu="${CSS.escape(groupId)}"]`)?.focus())
}
function restoreDockGroup(groupId: string, memberId = ''): void {
  userNavigationVersion += 1
  const group = layout.value.groups.find((item) => item.id === groupId)
  if (group === undefined) return
  const source = flightRectOf(chipFlightSelector(groupId))
  // 恢复前该区域**自身没有任何可见成员**:面板此刻没有内容态(根区域还可能带着可见兄弟区)。
  // 这种「从无到有」的恢复应演成窗体放大;仍有可见成员的项目组则飞向它的 tab。
  const hadNoVisibleMembers = visibleMemberWindows(layout.value, group.surfaceId).length === 0
  patchLayout((current) => group.isArea && !group.isSurface ? restoreAreaGroup(current, groupId) : restoreGroup(current, groupId))
  const surfaceId = surfaceOwning(layout.value, memberId || group.memberIds[0] || '')?.id ?? rootId.value
  if (memberId !== '' && group.memberIds.includes(memberId)) patchLayout((current) => activateTab(current, surfaceId, memberId))
  const activeId = surfaceOf(layout.value, surfaceId)?.activeId ?? ''
  // 恢复是**用户显式动作**:把装载落点同步到恢复出来的对话,免得切 Agent 后仍在途的
  // reloadWorkspace 用旧落点把活动项抢回 weekly(实测底栏成员恢复后又被重置)。
  const activeWin = layout.value.windows.find((win) => win.id === activeId)
  if (activeWin?.content.kind === 'chat') landingSessionId.value = activeWin.content.sessionId
  uncoverSurface(surfaceId)
  announcePlacement(t.value.workspace.dock.restoredAnnounce.replace('{name}', group.name).replace('{count}', String(group.memberIds.length)))
  afterNextPaint(() => {
    if (group.isSurface || group.isArea || hadNoVisibleMembers) {
      const surfaceElement = document.querySelector<HTMLElement>(surfaceFlightSelector(surfaceId))
      if (surfaceElement !== null && source !== null) playSurfaceEntrance(surfaceElement, source)
    } else {
      const target = flightRectOf(tabFlightSelector(activeId)) ?? flightRectOf(surfaceFlightSelector(surfaceId))
      if (source !== null && target !== null) flight.fly(source, target)
    }
    if (activeId !== '') pulseWindow(activeId)
  })
  focusRestoredTab(activeId, surfaceId)
}
function closeDockGroup(groupId: string): void {
  if (isBusy.value) return
  const group = layout.value.groups.find((item) => item.id === groupId)
  if (group === undefined) return
  patchLayout((current) => pruneEmptySurfaces(closeGroup(current, groupId)))
  announcePlacement(t.value.workspace.dock.closedGroupAnnounce.replace('{name}', group.name))
  void nextTick(() => document.querySelector<HTMLButtonElement>('.workspace-dock__settings-trigger')?.focus())
}
async function openNotification(item: AgentNotification): Promise<void> {
  userNavigationVersion += 1
  if (selectedAgent.value !== item.agentId) await onSelectAgent(item.agentId, item.sessionId)
  else if (sessionStatus.value === 'loading') await reloadWorkspace(false, false, true)
  if (!isAlive.value || selectedAgent.value !== item.agentId) return
  const target = sessions.value.find((session) => session.id === item.sessionId)
  if (target === undefined) return
  const id = windowIdOf(chatTabOf(target))
  const surfaceId = restoreWindowGroup(id) || surfaceOwning(layout.value, id)?.id || rootId.value
  landingSessionId.value = item.sessionId
  activateChatContent(surfaceId, chatTabOf(target))
  await ensureRuntime(target.id)
  if (isDrawerOpen.value) await closeDrawer()
  // 会话装载期间若已重新进入底栏，不用迟到的回焦打断通知 Tab 或已读操作。
  if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.workspace-dock') !== null) return
  focusRestoredTab(id, surfaceId)
}

// ---- 项目选择浮层:触发规则与两种用途 ----
// 新建对话**归谁**(用户已确认的规则,平权之后没有「当前项目」):
//   ① 该 Agent 已打开 **≥2 个项目** → 一律弹出浮层让用户选(高亮推断出的那个,回车一步直达);
//   ② 恰好 1 个 → 直接用,不弹(弹一个只有一项的列表是纯打扰);
//   ③ 0 个 → 直接打开项目选择对话框,先完成建对话的前置步骤。
// 推断出的那个 = **发起区域的活动成员所属项目**:用「你此刻正看着的那个项目」做预选是合法的
// 上下文推断;而用「全局上次用的项目」做静默默认,正是 Jira 被用户抱怨的失败模式
// (默认已提交、焦点不在归属字段 → 经常建错)。推断不出(区域空 / 成员跨项目 / 从引导页发起)时
// 浮层高亮首项 —— 列表里永远有游标,Enter 永远有确定落点。
function inferredProjectForNewChat(surfaceId: string): string {
  const surface = surfaceOf(layout.value, surfaceId)
  const win = surface === undefined ? null : activeMemberOf(surface)
  return win === null ? '' : win.content.projectId
}
function openProjectPicker(request: ProjectPickerRequest, origin: WindowRect): void {
  // 两种浮层互斥:项目选择浮层打开时,文件选择浮层让位(否则两层浮层叠在同一处)。
  closeFilePicker()
  projectPickerAnchor.value = origin
  projectPicker.value = request
}
function closeProjectPicker(): void {
  projectPicker.value = null
}

// ---- 文件分组的 ＋ 与文件选择浮层 ----
// 打开文件选择浮层。触发点是 ＋ 菜单里的「打开文件」——浮层以 ＋ 为锚点,一次只存在一个。
function openFilePicker(surfaceId: string, origin: WindowRect): void {
  if (isBusy.value) return
  closeProjectPicker()
  openMenuSurfaceId.value = ''
  filePicker.value = { surfaceId, anchor: origin }
  // 浮层要按项目列出文件树:把还没取过的树一次性触发加载(已取过的不会重复请求)。
  for (const project of projects.value) void ensureProjectTree(project.id)
}
function closeFilePicker(): void {
  filePicker.value = null
}
function retryProjectTree(projectId: string): void {
  void ensureProjectTree(projectId, true)
}
function openProjectFromPicker(): void {
  closeFilePicker()
  isPickerOpen.value = true
}
// 选中一个文件 = 在这个区域里打开它。复用**显示**规则:已停靠在别的区域 → 切过去;
// 正悬浮 → 置顶;都没有 → 作为本区域的 tab 打开(而不是再开一个悬浮窗)。
function chooseFile(projectId: string, path: string): void {
  const request = filePicker.value
  if (request === null) return
  const surfaceId = request.surfaceId
  closeFilePicker()
  if (isBusy.value) return
  const id = fileWindowId(projectId, path)
  revealWindow(id, (current) => openTab(current, surfaceId, { kind: 'file', projectId, path }))
  announcePlacement(t.value.workspace.filePicker.opened.replace('{name}', fileBaseName(path)))
  // 焦点落到刚打开的 tab;若它被显示在别的区域,那条规则已经把焦点带过去,这里只是兜住
  // 「tab 条上确实渲染了它」的情况。
  const owner = surfaceOwning(layout.value, id)
  if (owner !== undefined) focusRestoredTab(id, owner.id)
}
// 浮层开着时新打开 / 关闭项目:把新出现的项目树补上,已加载的项目不受影响。
watch(projects, (list) => {
  if (filePicker.value === null) return
  for (const project of list) void ensureProjectTree(project.id)
})
// 浮层的标题(按用途给):新建问「在哪个项目里新建」,改归属问「移到哪个项目」。
const projectPickerTitle = computed(() => {
  const request = projectPicker.value
  if (request === null) return ''
  return request.kind === 'new-chat' ? t.value.workspace.newChatProject : t.value.workspace.reassignProject
})
// 高亮项:新建 → 发起区域的活动成员所属项目;改归属 → 该会话**当前**所属项目(改之前它在哪)。
const projectPickerHighlightId = computed(() => {
  const request = projectPicker.value
  if (request === null) return ''
  if (request.kind === 'reassign') return sessions.value.find((item) => item.id === request.sessionId)?.projectId ?? ''
  return inferredProjectForNewChat(request.surfaceId)
})
// 这个触发点此刻是否开着浮层(供触发钮的 aria-expanded)。
function newChatPickerOpenFor(surfaceId: string): boolean {
  const request = projectPicker.value
  return request !== null && request.kind === 'new-chat' && request.surfaceId === surfaceId
}
function reassignPickerOpenFor(sessionId: string): boolean {
  const request = projectPicker.value
  return request !== null && request.kind === 'reassign' && request.sessionId === sessionId
}
// 浮层的身份键:**换触发点 = 换一个浮层实例**(挂载即带新锚点渲染,不与旧锚点纠缠;
// 同一个触发点开关则复用 / 卸载同一实例)。没有它,「开着时点另一个触发钮」会去改一个**已挂载**
// 面板的锚点 —— 实测此时 Chromium 对 position: fixed 元素的位置更新要下一帧才落到布局上,
// 读几何会拿到旧锚点。换键重挂载既避开这一族时序问题,也让「一个浮层只服务一个触发点」显式化。
const projectPickerKey = computed(() => {
  const request = projectPicker.value
  if (request === null) return ''
  return request.kind === 'new-chat' ? `new:${request.surfaceId}` : `reassign:${request.sessionId}`
})
// 浮层里选定一个项目:先收浮层,再按用途分流(新建 / 改归属)。
function chooseProject(projectId: string): void {
  const request = projectPicker.value
  closeProjectPicker()
  if (request === null) return
  if (request.kind === 'new-chat') {
    void createChatInProject(request.surfaceId, projectId)
    return
  }
  reassignSession(request.sessionId, projectId)
}
// 归属钮被按下:浮层锚到它上面。**开着时再点它 = 关闭**(toggle)——
// 触发钮是 disclosure(带 aria-expanded),开着状态下再点必须收起,否则那枚属性就成了谎话。
function toggleReassignPicker(sessionId: string, origin: WindowRect): void {
  if (reassignPickerOpenFor(sessionId)) {
    closeProjectPicker()
    return
  }
  openProjectPicker({ kind: 'reassign', sessionId }, origin)
}
async function newConversation(surfaceId: string, origin: WindowRect): Promise<void> {
  // 触发钮是 disclosure:浮层正开着时再点它 = **关闭**。这一步必须在最前 ——
  // 浮层本身把「按在触发钮上」排除在「点浮层外面」之外(见 project-picker-popover),
  // 于是开关只剩这一处裁决;不在这里 toggle,第二次点击就成了空操作。
  if (newChatPickerOpenFor(surfaceId)) {
    closeProjectPicker()
    return
  }
  if (isBusy.value) return
  openMenuSurfaceId.value = ''
  const only = projects.value[0]
  if (only === undefined) {
    // 没有归属项目时,主按钮与 tab 栏 ＋ 都明确转为「打开项目」的可见路径。
    isPickerOpen.value = true
    return
  }
  // 只有一个已打开项目 → 直接归它,不弹选择。
  if (projects.value.length === 1) {
    await createChatInProject(surfaceId, only.id)
    return
  }
  // 多个已打开项目 → 让用户拍板(浮层贴着发起它的那枚钮弹出)。
  openProjectPicker({ kind: 'new-chat', surfaceId }, origin)
}
// 在指定项目的**发起区域**建一段会话(浮层选完与「唯一项目直接建」两条路共用)。
// 创建后的落点不变:仍落在发起的那块区域 —— 归属与落点是两件事。
async function createChatInProject(surfaceId: string, projectId: string): Promise<void> {
  userNavigationVersion += 1
  closeProjectPicker()
  const created = await createSession(projectId)
  if (!isAlive.value || !created.ok) return
  sessions.value.unshift(created.value)
  seedRuntime(created.value.id, '')
  if (sessionStatus.value !== 'ready') sessionStatus.value = 'ready'
  patchLayout((current) => activateChatContentAt(current, surfaceId, chatTabOf(created.value)))
  landingSessionId.value = created.value.id
  if (currentRoute.value.demoState !== 'normal') navigateTo('workspace')
  await nextTick()
  focusComposer(created.value.id)
}
// 「这一段对话还没有第一条消息」的**单点派生**:转录处于空态即还没有消息。归属钮渲不渲染
// (UI)与改归属的写入守卫(reassignSession)都读它,不在两处各写一遍判断。
// 注意区分 loading:加载中/出错都不算「空」—— 那时也的确无处可改。
function canReassignProject(sessionId: string): boolean {
  return runtimeFor(sessionId).transcript.status === 'empty'
}
// 归属不变量(DEV):**有消息的会话,其 projectId 不得被改**。与 assertInvariants 同一套写法 ——
// 只在开发构建生效,命中即 console.error 一条可读信息并**拒绝**这次写入,免得将来别处绕过去。
function canWriteProjectId(sessionId: string): boolean {
  if (!import.meta.env.DEV) return true
  if (canReassignProject(sessionId)) return true
  console.error(`[session-invariant] 会话 ${sessionId} 已有消息,归属不得更改`)
  return false
}
// 改归属:把一段**空对话**换到另一个项目。会话的 projectId 与**窗体的复合键**必须一起换 ——
// 窗体身份 chat://<项目>/<会话> 里编着归属,只改一边会让 tab 条(成员里的 id)与 sessions
// (按复合键回查会话)各查各的,那枚 tab 直接消失。故这是「改会话 + 同名窗体改名」一对动作。
function reassignSession(sessionId: string, projectId: string): void {
  const session = sessions.value.find((item) => item.id === sessionId)
  if (session === undefined || session.projectId === projectId) return
  if (!canWriteProjectId(sessionId)) return
  const windowId = windowIdOf(chatTabOf(session))
  sessions.value = sessions.value.map((item) => (item.id === sessionId ? { ...item, projectId } : item))
  patchLayout((current) => reassignChatWindow(current, windowId, projectId))
  // 遥测条最后一项写的是**该会话所属项目**(CLI 的 cwd):归属一变它必须跟着变,
  // 否则「已把 X 移到 Y」这句话与界面上的项目名会对不上。重取一次即按新项目解析。
  void loadTelemetry(sessionId)
  announcePlacement(t.value.workspace.reassignDone.replace('{title}', session.title).replace('{project}', projectNameOf(projectId)))
}
// 选择器只写入自己的值;换 Agent 即换项目列表与会话,故一并重装。
async function onSelectAgent(agent: ChatSession['agent'], targetSessionId = ''): Promise<void> {
  if (selectedAgent.value === agent) return
  closeFilePicker()
  openMenuSurfaceId.value = ''
  clearHighlights()
  // 离开当前分域前先把内容区交回对话(域键是 Agent,故这一步必须在改 selectedAgent **之前**)。
  showConversation()
  // 清掉旧域列表，避免 domain watcher 把旧 Agent 的成员补进新域。
  sessions.value = []
  projectSkills.value = {}
  skillStatus.value = {}
  selectedAgent.value = agent
  // 顶层插件面板按 Agent 重建,加载完成前不沿用上一位的计数。
  agentPluginCount.value = undefined
  if (targetSessionId !== '') landingSessionId.value = targetSessionId
  await reloadWorkspace(targetSessionId === '', true, true)
}
// 会话搜索:在当前 Agent 已装载的全部会话里筛选(跨它已打开的项目)。请求带版本号,避免旧结果覆盖新结果。
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
  const result = await searchConversations(query)
  if (!isAlive.value || version !== searchVersion) return
  isSearching.value = false
  searchHits.value = result.ok ? result.value : []
}
// 清空所有会话的搜索命中高亮(用户明确的「收工」动作 / 切域时的复位)。
function clearHighlights(): void {
  const next: Record<string, ChatRuntime> = {}
  let changed = false
  for (const [id, current] of Object.entries(chatRuntimes.value)) {
    if (current.highlightTurnId === null) {
      next[id] = current
      continue
    }
    next[id] = { ...current, highlightTurnId: null }
    changed = true
  }
  if (changed) chatRuntimes.value = next
}
function clearSearch(): void {
  searchQuery.value = ''
  clearHighlights()
  void runSearch()
}
// 面板关闭时的搜索复位:只清搜索词与命中列表,**保留**高亮(点命中会关面板,清高亮会把刚跳转的那轮抹掉)。
function resetSearch(): void {
  searchQuery.value = ''
  void runSearch()
}
// 点击命中:切到该会话、定位并高亮 turnId(标题命中没有具体轮次,不跳转)。
async function openHit(hit: ConversationSearchHit): Promise<void> {
  if (isBusy.value) return
  userNavigationVersion += 1
  openMenuSurfaceId.value = ''
  landingSessionId.value = hit.sessionId
  const found = sessions.value.find((item) => item.id === hit.sessionId)
  if (found !== undefined) {
    const surfaceId = restoreWindowGroup(windowIdOf(chatTabOf(found))) || rootId.value
    activateChatContent(surfaceId, chatTabOf(found))
  }
  patchRuntime(hit.sessionId, (current) => ({ ...current, highlightTurnId: hit.reason === 'body' ? hit.turnId : null }))
  if (isDrawerOpen.value) await closeDrawer()
  if (!leaveDataDemoState()) await reloadWorkspace(false)
}
// 关闭一个对话 tab:相邻成员接管内容区(closeTab 的统一规则),会话仍在列表里。
// 摘空的那块区域随后被移除(根区域除外 —— 它退化成引导页,见 commitLayout)。
async function closeChatTab(surfaceId: string, id: string): Promise<void> {
  if (isBusy.value) return
  commitLayout((current) => closeSurfaceTab(current, surfaceId, id))
  if (isDrawerOpen.value) await closeDrawer()
}

// ---- 键盘 / 指针全局处理 ----
function onViewportChange(): void {
  isNarrow.value = narrowMedia.matches
  if (!isNarrow.value) isDrawerOpen.value = false
}
function onMotionChange(): void {
  if (!motionMedia.matches) return
  for (const [id, current] of Object.entries(chatRuntimes.value)) {
    if (current.generation === 'streaming' && current.full !== null) {
      updateResponse(id, current.full.body)
      void finishResponse(id, false)
    }
  }
}
// ⌘/Ctrl+K:全局快捷键,打开**当前聚焦区域**的对话切换器(没有焦点区域时回落到根区域)。
function onSwitcherShortcut(event: KeyboardEvent): void {
  if (event.key !== 'k' && event.key !== 'K') return
  if (!event.metaKey && !event.ctrlKey) return
  event.preventDefault()
  openMenuSurfaceId.value = focusedSurfaceId.value
}
// Esc 收起**悬浮**窗体(非模态覆盖层,不圈定焦点)。
function onFilePanelEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  if (!isFilePanelOpen.value || isDrawerOpen.value) return
  const target = focusedFloatingId.value
  if (target !== '') closeFileWindow(target)
}
function onFileWindowCycle(event: KeyboardEvent): void {
  if (event.key !== 'F6' || event.defaultPrevented) return
  if (openWindows.value.length < 2) return
  event.preventDefault()
  cycleFileWindow()
}
// 当前聚焦的窗体 id;没有可见窗体时为空(F6 / Esc 的落点)。
const focusedWindowId = computed(() => focusedWindow(layout.value)?.id ?? '')
const focusedFloatingId = computed(() => {
  const win = focusedWindow(layout.value)
  return win !== undefined && win.placement === 'floating' ? win.id : ''
})
const isFilePanelOpen = computed(() => openWindows.value.length > 0)
const visibleFilePaths = computed<readonly string[]>(() => openWindows.value.map((win) => win.id))
const recentForBar = computed<readonly string[]>(() => layout.value.recent.filter((id) => !visibleFilePaths.value.includes(id) && !layout.value.surfaces.some((surface) => surface.members.includes(id))))

// ---- 横滑后退的第二层防护 ----
function guardHorizontalSwipe(event: WheelEvent): void {
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
  let node: Element | null = event.target instanceof Element ? event.target : null
  while (node !== null) {
    if (node.scrollWidth > node.clientWidth) {
      const overflowX = getComputedStyle(node).overflowX
      if (overflowX === 'auto' || overflowX === 'scroll') {
        const atStart = node.scrollLeft <= 0
        const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1
        const hasRoom = event.deltaX > 0 ? !atEnd : !atStart
        if (hasRoom) return
      }
    }
    node = node.parentElement
  }
  event.preventDefault()
}
const SWIPE_GUARD_ATTR = 'swipeGuard'
function insideContainingScroller(target: EventTarget | null): boolean {
  let node: Element | null = target instanceof Element ? target : null
  while (node !== null && node !== document.documentElement) {
    const style = getComputedStyle(node)
    const scrollable = style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'scroll'
    const contained = style.overscrollBehaviorX === 'contain' || style.overscrollBehaviorX === 'none'
      || style.overscrollBehaviorY === 'contain' || style.overscrollBehaviorY === 'none'
    if (scrollable && contained) return true
    node = node.parentElement
  }
  return false
}
let isSwipeGuardArmed = false
function armSwipeGuard(armed: boolean): void {
  if (armed === isSwipeGuardArmed) return
  isSwipeGuardArmed = armed
  if (armed) pageRoot.value?.addEventListener('wheel', guardHorizontalSwipe, { passive: false })
  else pageRoot.value?.removeEventListener('wheel', guardHorizontalSwipe)
  if (pageRoot.value !== null) pageRoot.value.dataset[SWIPE_GUARD_ATTR] = armed ? 'armed' : 'idle'
}
function syncSwipeGuard(event: Event): void {
  armSwipeGuard(!insideContainingScroller(event.target))
}

// 演示态把「落点 / 侧栏 Agent」钉到与该状态一致的一组;切换演示态时清空「已看过」集合。
function applyDemoState(demo: AppRoute['demoState']): void {
  seenSessions.value = new Set()
  seenSystemNotices.value = new Set()
  // Agent 可能已被删除:演示态只在目标 Agent 仍存在时切换(首次装载时列表为空,直接采用默认)。
  const pickAgent = (agentId: AgentId): void => {
    if (agents.value.length === 0 || agents.value.some((agent) => agent.id === agentId)) selectedAgent.value = agentId
  }
  if (demo === 'empty') { landingSessionId.value = ''; pickAgent('planning') }
  if (demo === 'waiting') { landingSessionId.value = 'knowledge'; pickAgent('writing') }
  if (demo === 'error') { landingSessionId.value = 'weekly'; pickAgent('planning') }
}


watch(locale, () => {
  // 项目 / 条目的名称与路径都是技术标识,不随语言变化;但内置 Agent 的名称与备注会变,
  // 故先重取 Agent 列表,再重取会话(标题本地化)、转录与遥测。
  void loadAgents().then(() => { if (selectedAgent.value !== '') void reloadWorkspace(false) })
})
// 需要(预)取内容的文件窗体:所有文件类窗体里,可见的、或是区域成员的。键是**复合窗体 id**。
const contentPaths = computed<string[]>(() => layout.value.windows.flatMap((win) => {
  if (win.content.kind !== 'file') return []
  const listed = layout.value.surfaces.some((surface) => surface.members.includes(win.id))
  return win.visible || listed ? [win.id] : []
}))
watch(() => contentPaths.value.slice().sort().join('\n'), () => {
  const ids = new Set(contentPaths.value)
  for (const key of Object.keys(fileContents.value)) {
    if (ids.has(key)) continue
    const next = { ...fileContents.value }
    delete next[key]
    fileContents.value = next
    fileVersions.delete(key)
  }
  for (const id of ids) {
    if (fileContents.value[id] !== undefined) continue
    const content = fileContentOf(layout.value.windows.find((win) => win.id === id) ?? null)
    if (content !== null) void loadFileContent(content)
  }
}, { immediate: true })
// 可见对话各取一份运行态(转录 + 遥测);新出现的会话在这里首次装载。
watch(() => visibleChatIds.value.slice().sort().join('\n'), () => {
  for (const id of visibleChatIds.value) void ensureRuntime(id)
}, { immediate: true })
// 会话列表到达后才能取遥测(它需要会话的 Agent / 项目)。
watch(sessions, () => {
  for (const id of visibleChatIds.value) void ensureTelemetry(id)
})
// Agent 设置可能改变已启用插件;关闭后刷新派生清单,不改动插件管理本身。
watch(isAgentEditorOpen, (isOpen) => {
  if (!isOpen) for (const project of projects.value) void ensureProjectSkills(project.id, true)
})
watch(() => currentRoute.value.demoState, (demo) => {
  projectSkills.value = {}
  skillStatus.value = {}
  applyDemoState(demo)
  if (!isBusy.value) resetGenerations()
  void reloadWorkspace(false, true)
})
// 装载期**增量**补齐对话成员(不重算已有成员的相对顺序):补到根区域。
// 来源是**当前 Agent 已装载的全部会话**(跨它已打开的项目)—— 多项目并行时,别的项目的会话
// 也要作为 tab 出现在同一张表上,归属由各自的复合键承担。
function syncChatMembers(): void {
  const contents = sessions.value.filter((session) => session.agent === selectedAgent.value).map((session) => chatTabOf(session))
  const domain = domainKey.value
  const current = layoutOf(workspaceMap.value, domain)
  const targetSurface = rootId.value
  let next = current
  contents.forEach((content, index) => {
    const id = windowIdOf(content)
    if (next.windows.some((win) => win.id === id)) return
    const later = new Set(contents.slice(index + 1).map((item) => windowIdOf(item)))
    const members = surfaceOf(next, targetSurface)?.members ?? []
    const at = members.findIndex((member) => later.has(member))
    next = seedChatWindow(next, targetSurface, content, at < 0 ? members.length : at)
  })
  if (next !== current) workspaceMap.value = withLayout(workspaceMap.value, domain, assertInvariants(next))
}
watch([sessions, domainKey], () => { syncChatMembers() })
// 「已看过」的唯一登记点:某会话在 awaiting / completed 期间成为**某个区域的活动成员**即记入。
watch([layout, sessions, chatRuntimes], () => {
  const next = new Set(seenSessions.value)
  let changed = false
  for (const surface of layout.value.surfaces) {
    const win = activeMemberOf(surface)
    if (win === null) continue
    const content = win.content
    if (content.kind !== 'chat') continue
    const found = sessions.value.find((item) => item.id === content.sessionId)
    if (found === undefined) continue
    const status = sessionStatusOf(found) ?? found.status
    if (status !== 'awaiting' && status !== 'completed') continue
    if (next.has(found.id)) continue
    next.add(found.id)
    changed = true
  }
  if (changed) seenSessions.value = next
})
watch([sessions, seenSessions, seenSystemNotices, locale, () => Object.entries(chatRuntimes.value).map(([id, runtime]) => `${id}:${runtime.generation}:${runtime.isSaving}`).join('|')], () => { void loadNotifications() })
function markSystemNoticeRead(id: string): void {
  seenSystemNotices.value = new Set([...seenSystemNotices.value, id])
}
function markAllNotificationsRead(): void {
  // 「全部已读」是全局动作:两类通知一起清空,不随当前 Tab 变化。
  seenSessions.value = new Set([...seenSessions.value, ...agentNotifications.value.map((item) => item.sessionId)])
  seenSystemNotices.value = new Set([...seenSystemNotices.value, ...systemNotifications.value.map((item) => item.id)])
}
function retryNotifications(): void {
  notificationsStatus.value = 'loading'
  if (!leaveDataDemoState()) void loadNotifications()
}
async function loadNotifications(): Promise<void> {
  notificationVersion += 1
  const version = notificationVersion
  if (agentNotifications.value.length === 0 && systemNotifications.value.length === 0) notificationsStatus.value = 'loading'
  const [agentResult, systemResult, projectResults] = await Promise.all([
    listAgentNotifications([...seenSessions.value]),
    listSystemNotifications([...seenSystemNotices.value]),
    Promise.all(agents.value.map((agent) => listProjects(agent.id))),
  ])
  if (!isAlive.value || version !== notificationVersion) return
  if (!agentResult.ok || !systemResult.ok) {
    notificationsStatus.value = 'error'
    return
  }
  agentNotifications.value = agentResult.value
  systemNotifications.value = systemResult.value
  notificationProjects.value = projectResults.flatMap((result) => result.ok ? result.value : [])
  notificationsStatus.value = 'ready'
}

onMounted(() => {
  applyDemoState(currentRoute.value.demoState)
  window.addEventListener('hashchange', syncPairingHash)
  // 先取 Agent 身份(它决定工作台属于谁),再装载工作台。
  void loadAgents().then(() => {
    if (selectedAgent.value === '') return
    void reloadWorkspace(false, true)
  })
  narrowMedia.addEventListener('change', onViewportChange)
  motionMedia.addEventListener('change', onMotionChange)
  document.addEventListener('keydown', drawerKeyboard)
  document.addEventListener('keydown', onSwitcherShortcut)
  document.addEventListener('keydown', onFilePanelEscape)
  document.addEventListener('keydown', onFileWindowCycle)
  document.documentElement.classList.add('is-workspace')
  armSwipeGuard(true)
  pageRoot.value?.addEventListener('pointerover', syncSwipeGuard)
})
onBeforeUnmount(() => {
  isAlive.value = false
  window.removeEventListener('hashchange', syncPairingHash)
  for (const timer of streamTimers.values()) clearInterval(timer)
  streamTimers.clear()
  clearTimeout(pulseTimer)
  clearTimeout(groupPulseTimer)
  narrowMedia.removeEventListener('change', onViewportChange)
  motionMedia.removeEventListener('change', onMotionChange)
  document.removeEventListener('keydown', drawerKeyboard)
  document.removeEventListener('keydown', onSwitcherShortcut)
  document.removeEventListener('keydown', onFilePanelEscape)
  document.removeEventListener('keydown', onFileWindowCycle)
  document.documentElement.classList.remove('is-workspace')
  pageRoot.value?.removeEventListener('pointerover', syncSwipeGuard)
  armSwipeGuard(false)
})
</script>

<template>
  <main id="main" ref="pageRoot" tabindex="-1" class="workspace-page dl-scope dl-scope--dark" :class="{ 'is-identity-covered': isIdentityCovered }">
    <!-- 全页唯一的 h1(视觉隐藏):可见标题由 tab 承担,而 tab 是 widget 不是标题,整页不能因此
         丢掉 h1(否则侧栏的 h2 会成为大纲起点)。它住在**页面级**:空区域消失后根区域可能根本
         没有会话头,住在会话头里的地标会跟着一起消失 —— 那样整页 h1 数就不再恒为 1。 -->
    <h1 class="workspace-h1">{{ pageTitle }}</h1>
    <div class="workspace-layout">
      <div v-if="isDrawerOpen && isNarrow" class="workspace-backdrop" aria-hidden="true" @click="closeDrawer" />
      <aside
        id="workspace-sidebar" ref="drawer" class="workspace-sidebar" :class="{ 'is-open': isDrawerOpen }"
        :inert="isNarrow && !isDrawerOpen" :role="isNarrow && isDrawerOpen ? 'dialog' : undefined"
        :aria-modal="isNarrow && isDrawerOpen ? true : undefined" :aria-label="t.workspace.workspacePanel"
      >
        <!-- 侧栏顶部 = Agent 身份区(标记 + 名称 + 备注)、它的设置齿轮与抽屉关闭钮。
             添加 Agent 的入口在身份菜单底部 —— 与「切换身份」同处一个动作组,不额外占一行。 -->
        <div class="sidebar-head">
          <AgentContextSwitcher
            v-if="agents.length > 0"
            :value="selectedAgent" :agents="agents" variant="sidebar"
            @select="onSelectAgent" @create="openAgentCreate" @settings="openAgentSettings"
          />
          <div v-else class="sidebar-agent-state">
            <p v-if="agentsStatus === 'error'">{{ t.workspace.agentAdmin.loadError }}</p>
            <NSkeleton v-else text :repeat="1" :animated="false" />
            <button v-if="agentsStatus === 'error'" class="workspace-button" @click="retryAgents">{{ t.workspace.retry }}</button>
          </div>
          <button v-if="isNarrow" class="workspace-button icon-button sidebar-close" :aria-label="t.workspace.closeSidebar" @click="closeDrawer">×</button>
        </div>
        <section class="workspace-projects">
          <SidebarViewTabs
            id-prefix="sidebar-view" v-model="sidebarView"
            :options="sidebarViewOptions" :label="t.workspace.sidebarViews.label"
          />
          <div
            v-show="sidebarView === 'projects'" id="sidebar-view-panel-projects"
            role="tabpanel" aria-labelledby="sidebar-view-tab-projects" class="sidebar-view-panel"
          >
          <div class="project-scroll">
            <div v-if="projectsStatus === 'loading'" class="sidebar-loading" :aria-label="t.workspace.loading"><NSkeleton text :repeat="3" :animated="false" /></div>
            <div v-else-if="projectsStatus === 'error'" class="sidebar-loading"><p>{{ t.workspace.projectsError }}</p><button class="workspace-button" @click="retryProjects">{{ t.workspace.retry }}</button></div>
            <p v-else-if="projectsStatus === 'empty'" class="sidebar-hint">{{ t.workspace.projectsEmpty }}</p>
            <ul v-else class="project-list">
              <li v-for="project in projects" :key="project.id" class="project-item" :class="identityClassOf(project.path)">
                <div class="project-row">
                  <button
                    type="button" class="project-row__button"
                    :aria-expanded="expandedProjects.has(project.id)"
                    :aria-controls="`project-tree-${project.id}`"
                    :title="`${project.name} · ${project.path} · ${formatFileCount(project.entryCount)}`"
                    @click="toggleProjectRow(project)"
                  >
                    <!-- 项目行 = **色点 + 名称**:色点承担归属的第二通道(颜色),名称是主通道(文字)。
                         多项目同时展开时不再有「被选中」的项目,故不再有 aria-current。 -->
                    <span class="project-dot" aria-hidden="true" />
                    <span class="project-row__name">{{ project.name }}</span>
                    <span class="project-row__slot" aria-hidden="true" />
                    <svg class="tree-caret project-row__caret" :class="{ 'is-open': expandedProjects.has(project.id) }" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                  <ProjectMenu :project-name="project.name" @close="onCloseProject(project)" />
                </div>
                <div v-show="expandedProjects.has(project.id)" :id="`project-tree-${project.id}`" class="project-tree">
                  <span class="project-ridge" aria-hidden="true" />
                    <p v-if="(treeStatus[project.id] ?? 'loading') === 'loading'" class="tree-hint" :aria-label="t.workspace.treeLoading">{{ t.workspace.treeLoading }}</p>
                    <p v-else-if="treeStatus[project.id] === 'error'" class="tree-hint tree-hint--error">{{ t.workspace.treeError }}</p>
                    <p v-else-if="(projectRows[project.id] ?? []).length === 0" class="tree-hint">{{ t.workspace.treeEmpty }}</p>
                    <ul v-else class="entry-list">
                      <li
                        v-for="row in projectRows[project.id] ?? []" :key="row.id" class="entry-row"
                        :data-kind="row.kind" :style="{ '--workspace-tree-level': row.level }"
                      >
                        <button
                          v-if="row.expandable" type="button" class="entry-row__button"
                          :aria-expanded="isDirectoryExpanded(project.id, row.path)"
                          @click="toggleDirectory(project.id, row.path)"
                        >
                          <svg class="tree-caret" :class="{ 'is-open': isDirectoryExpanded(project.id, row.path) }" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                          <span class="entry-name">{{ row.name }}</span>
                          <span v-if="chipLabel(entryState(row))" class="entry-state" :data-state="entryState(row)">{{ chipLabel(entryState(row)) }}</span>
                        </button>
                        <button
                          v-else type="button" class="entry-row__button entry-row__button--file"
                          :title="row.path" draggable="true"
                          @click="onFileRowClick(project.id, row, $event)"
                          @dblclick="onFileRowDblClick(project.id, row)"
                          @keydown="onFileRowKey(project.id, $event, row)"
                          @dragstart="onFileRowDragStart(row, $event)"
                        >
                          <span class="entry-name">{{ row.name }}</span>
                          <span v-if="chipLabel(entryState(row))" class="entry-state" :data-state="entryState(row)">{{ chipLabel(entryState(row)) }}</span>
                        </button>
                        <!-- 拖拽之外的非拖拽通路(WCAG 2.5.7):把该文件加入焦点区域的活动对话。
                             它与文件行那枚按钮是**兄弟**而非嵌套 —— 嵌套 button 是非法 HTML。 -->
                        <button
                          v-if="!row.expandable" type="button" class="entry-row__add"
                          :aria-label="t.workspace.addFileToConversation.replace('{name}', row.name)"
                          @click="onAddFileToConversation(row)"
                        >
                          <span aria-hidden="true">＋</span>
                        </button>
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
          </div>
          <div
            v-show="sidebarView === 'plugins'" id="sidebar-view-panel-plugins"
            role="tabpanel" aria-labelledby="sidebar-view-tab-plugins" class="sidebar-view-panel plugins-pane"
          >
            <div class="plugins-pane__scroll">
              <AgentPlugins
                v-if="selectedAgent !== ''" :key="selectedAgent"
                :agent-id="selectedAgent" :agent-name="currentAgent?.name ?? ''"
                @count="agentPluginCount = $event" @announce="announcePlacement"
              />
            </div>
          </div>
        </section>
      </aside>
      <!-- 区域层:区域树在这里递归落成 DOM —— 每块区域一个 pane,区域之间是可拖 / 可键盘操作的
           分隔线。pane 里显示什么由本页经 #pane 插槽给出:页面持有全部状态,组件只管几何。 -->
      <SplitPanes :layout="layout" :surface-id="rootId" :resize-handler="onRegionResize">
        <template #pane="{ surfaceId }">
          <!-- 引导页:根区域既无成员又无子区域 —— 右侧整块没有任何东西可显示。它不是转录,
               故不给 role="log"(全页 role="log" 恰为 1 的不变量在此退化为 0)。
               窄屏在它之上再给一枚侧栏触发钮:那枚钮原本住在会话头里,而引导页没有会话头,
               缺了它在窄屏就打不开侧栏。 -->
          <div v-if="isGuideSurface(surfaceId)" class="guide-shell">
            <button v-if="isNarrow && isPrimarySurface(surfaceId)" :ref="bindSidebarTrigger" class="workspace-button icon-button guide-shell__trigger" :aria-label="t.workspace.openSidebar" :aria-expanded="isDrawerOpen" aria-controls="workspace-sidebar" @click="openDrawer">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <WorkspaceOnboarding
              class="guide-shell__body"
              :has-projects="projects.length > 0"
              :new-chat-picker-open="newChatPickerOpenFor(surfaceId)"
              @new-chat="newConversation(surfaceId, $event)"
            />
          </div>
          <section
            v-else
            class="conversation"
            :data-surface-id="surfaceId"
            :class="{ 'is-merge-target': mergeSurfaceId === surfaceId, 'is-split-target': splitPreview?.surfaceId === surfaceId }"
            :inert="isNarrow && isDrawerOpen"
          >
            <header class="conversation-heading" :class="{ 'is-drop-target': isDockTarget && isPrimarySurface(surfaceId) }">
              <!-- 侧栏触发钮**每块区域各一份**(与 ＋ / 菜单同一条纪律:每块区域功能完全一样)。
                   之前只挂在根区域那份会话头上 —— 现在根区域可能是容器或引导页(没有会话头),
                   只挂在那里会让窄屏彻底失去侧栏入口。 -->
              <button v-if="isNarrow && isPrimarySurface(surfaceId)" :ref="bindSidebarTrigger" class="workspace-button icon-button" :aria-label="t.workspace.openSidebar" :aria-expanded="isDrawerOpen" aria-controls="workspace-sidebar" @click="openDrawer">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <ConversationSwitcher
                :open="openMenuSurfaceId === surfaceId"
                :panel-id="panelIdOf(surfaceId)"
                :menu-panel-id="menuPanelIdOf(surfaceId)"
                :sessions="sessions"
                :sessions-status="sessionStatus"
                :projects="projects"
                :minimizable-project-counts="minimizableProjectsOf(surfaceId)"
                @minimize-project="minimizeProject(surfaceId, $event)"
                @minimize-surface="minimizeSurface(surfaceId)"
                :excluded-session-ids="switcherExcludedSessionIds(surfaceId)"
                :search-query="searchQuery"
                :search-hits="searchHits"
                :is-searching="isSearching"
                :active-id="activeChatOf(surfaceId)"
                :seen-sessions="seenSessions"
                :status-of="sessionStatusOf"
                :order="chatOrderOf(surfaceId)"
                :pulse-key="pulseWindowId"
                :format-time="formatTime"
                :disabled="isBusy"
                :files="fileTabsOf(surfaceId)"
                :active-file-path="focusedWindowId"
                :visible-file-paths="visibleFilePaths"
                :file-state-of="entryStateOfTab"
                :recent-files="recentForBar"
                @update:open="onMenuOpen(surfaceId, $event)"
                @select="selectSession(surfaceId, $event)"
                @select-hit="openHit"
                @search-input="onSearchInput"
                @clear-search="clearSearch"
                @reset-search="resetSearch"
                @new-chat="newConversation(surfaceId, $event)"
                @open-file-picker="openFilePicker(surfaceId, $event)"
                @close="closeChatTab(surfaceId, $event)"
                @reorder="reorderChatTabs(surfaceId, $event)"
                @announce="onTabAnnounce"
                @select-file="selectFileTab"
                @close-file="closeFileTab"
                @open-recent-file="openRecentFile(surfaceId, $event)"
                @tear-pop="popOutTab"
                @tear-out="onTearOut"
                @tear-move="onTearMove"
                @tear-cancel="onTearCancel"
                @tear-end="onTearEnd"
              >
                <FileBar
                  :tabs="fileTabsOf(surfaceId)"
                  :projects="projects"
                  :active-key="focusedWindowId"
                  :pulse-key="pulseWindowId"
                  :visible-paths="visibleFilePaths"
                  :state-of="entryStateOfTab"
                  :disabled="isBusy"
                  @select="selectFileTab"
                  @close="closeFileTab"
                  @reorder="reorderFileTabs(surfaceId, $event)"
                  @tear-pop="popOutTab"
                  @tear-out="onTearOut"
                  @tear-move="onTearMove"
                  @tear-cancel="onTearCancel"
                  @tear-end="onTearEnd"
                />
              </ConversationSwitcher>
              <Transition name="dock-hint">
                <p v-if="isDockTarget && isPrimarySurface(surfaceId)" class="conversation-heading__dock-hint" aria-hidden="true">{{ dockHintText }}</p>
              </Transition>
            </header>
            <div class="conversation-panel" :id="panelIdOf(surfaceId)" tabindex="-1" role="tabpanel" :aria-labelledby="tabpanelLabelIdOf(surfaceId)">
              <div class="transcript-area">
                <!-- 停靠的对话**没有标题栏**:tab 条下方直接就是转录区。归属由 tab 自己承担
                     (3px 项目色条 + 等宽缩写),改归属的入口搬进了输入坞底行(空对话时项目名
                     升格为控件)—— 这一行只是页面级的纯信息面包屑,与 tab 逐字重复且不承担导航,
                     已删除。悬浮对话窗的标题栏**保留**:那是窗口外壳(要用来拖动),且悬浮窗没有
                     tab 条,标题栏是它唯一的身份载体。 -->
                <!-- 区域内容区**同一时刻只显示一件东西**:区域活动成员是文件 → 文件面板;
                     是对话 → 对话窗体(滚动容器 + 转录 + **它自己的输入坞**);没有活动成员 →
                     空位占位(转录位的空态,不含输入坞 —— 没有窗体就没有输入框)。 -->
                <FilePanel
                  v-if="activeFileWindow(surfaceId)"
                  :key="`docked:${activeFileWindow(surfaceId)?.id}`"
                  mode="docked"
                  :window-id="activeFileWindow(surfaceId)?.id ?? ''"
                  :state="contentOf(activeFileWindow(surfaceId)?.id ?? '')"
                  :draft="fileDrafts[activeFileWindow(surfaceId)?.id ?? ''] ?? null"
                  @update:draft="fileDrafts[activeFileWindow(surfaceId)?.id ?? ''] = $event"
                  :path="activeFilePath(surfaceId)"
                  :project-name="projectNameOf(activeFileWindow(surfaceId)?.content.projectId ?? '')"
                  :project-path="projectPathOf(activeFileWindow(surfaceId)?.content.projectId ?? '')"
                  :chip-state="entryStateOfTab(fileContentOf(activeFileWindow(surfaceId)))"
                  :can-confirm="true"
                  :is-focused="activeFileWindow(surfaceId)?.id === focusedWindowId"
                  :cascade="0"
                  :confirmation="primaryRuntime.confirmation"
                  :confirmation-outcome="confirmationOutcome"
                  :initial-rect="null"
                  :flip-from="dockFlip?.id === activeFileWindow(surfaceId)?.id ? (dockFlip?.rect ?? null) : null"
                  @close="closeFileTab(activeFileWindow(surfaceId)?.id ?? '')"
                  @focus="focusFileWindow(activeFileWindow(surfaceId)?.id ?? '')"
                  @retry="retryFile(activeFileWindow(surfaceId)?.id ?? '')"
                  @resolve="resolveFileConfirmation"
                  @rect-change="onFileRectChange(activeFileWindow(surfaceId)?.id ?? '', $event)"
                  @float="floatFileWindow(activeFileWindow(surfaceId)?.id ?? '')"
                />
                <ChatSessionView
                  v-else-if="activeChatOf(surfaceId) !== ''"
                  :key="`chat:${activeChatOf(surfaceId)}`"
                  :session-id="activeChatOf(surfaceId)"
                  :title="sessionTitleOf(activeChatOf(surfaceId))"
                  :default-model-id="currentAgent?.model.defaultModelId ?? ''"
                  :runtime="runtimeFor(activeChatOf(surfaceId))"
                  :skills="skillsOf(activeChatProjectOf(surfaceId))" :skills-status="skillStatusOf(activeChatProjectOf(surfaceId))"
                  @retry-skills="retryProjectSkills(activeChatProjectOf(surfaceId))"
                  :user-name="userName"
                  :assistant-name="assistantNameOf(activeChatOf(surfaceId))"
                  :is-live="activeChatOf(surfaceId) === liveSessionId"
                  :disabled="isBusyOf(activeChatOf(surfaceId))"
                  :can-send="canSendOf(activeChatOf(surfaceId))"
                  :project-name="projectNameOf(activeChatProjectOf(surfaceId))"
                  :project-path="projectPathOf(activeChatProjectOf(surfaceId))"
                  :can-reassign="canReassignProject(activeChatOf(surfaceId))"
                  :reassign-picker-open="reassignPickerOpenFor(activeChatOf(surfaceId))"
                  @send="send(activeChatOf(surfaceId), $event)"
                  @stop="stop(activeChatOf(surfaceId))"
                  @regenerate="regenerate(activeChatOf(surfaceId))"
                  @retry="retrySession(activeChatOf(surfaceId))"
                  @resolve="resolveConfirmation(activeChatOf(surfaceId), $event)"
                  @update:draft="updateDraft(activeChatOf(surfaceId), $event)"
                  @update:pinned="updatePinned(activeChatOf(surfaceId), $event)"
                  @add-attachments="addAttachments(activeChatOf(surfaceId), $event)"
                  @remove-attachment="removeAttachment(activeChatOf(surfaceId), $event)"
                  @update:model="selectModel(activeChatOf(surfaceId), $event)"
                  @reassign="toggleReassignPicker(activeChatOf(surfaceId), $event)"
                  @announce="announcePlacement"
                />
                <!-- 空位占位:这块区域的「转录位」,但没有绑定会话 —— 它沿用同一套 role / data-state
                     契约,只是**不含输入坞**。全页 role="log" 仍恰为 1(见 livePlaceholderSurfaceId)。 -->
                <div
                  v-else
                  class="transcript transcript--placeholder"
                  :role="surfaceId === livePlaceholderSurfaceId ? 'log' : 'group'"
                  :aria-live="surfaceId === livePlaceholderSurfaceId ? 'polite' : undefined"
                  :aria-label="t.workspace.transcript"
                  tabindex="0"
                  :data-state="workspaceLoading ? 'loading' : 'empty'"
                >
                  <TranscriptView
                    :transcript="workspaceLoading ? { status: 'loading' } : { status: 'empty' }"
                    :user-name="userName"
                    :assistant-name="assistantNameOf('')"
                    :generation="'idle'"
                    :streaming-id="null"
                    :highlight-turn-id="null"
                    :confirmation="null"
                    :confirmation-outcome="null"
                    :follow-up="null"
                    :is-saving="false"
                  />
                </div>
              </div>
            </div>
          </section>
        </template>
      </SplitPanes>
      <!-- 悬浮窗体:每个悬浮窗体一份,position: fixed 覆盖在视口之上。层序由**数组顺序**表达。
           文件与对话是同一套窗体机制的两种内容:按内容类型分流到文件面板 / 对话窗体。 -->
      <template v-for="(win, index) in floatingWindows" :key="win.id">
        <FilePanel
          v-if="win.content.kind === 'file'"
          mode="floating"
          :window-id="win.id"
          :state="contentOf(win.id)"
          :draft="fileDrafts[win.id] ?? null"
          @update:draft="fileDrafts[win.id] = $event"
          :path="windowPath(win)"
          :project-name="projectNameOf(win.content.projectId)"
          :project-path="projectPathOf(win.content.projectId)"
          :chip-state="entryStateOfTab(fileContentOf(win))"
          :can-confirm="true"
          :is-focused="win.id === focusedWindowId"
          :cascade="index"
          :confirmation="primaryRuntime.confirmation"
          :confirmation-outcome="confirmationOutcome"
          :initial-rect="win.rect.width > 0 ? win.rect : null"
          :follow-point="win.id === tearId ? tearFollow : null"
          :flip-from="flipFromOf(win.id)"
          @close="closeFileWindow(win.id)"
          @focus="focusFileWindow(win.id)"
          @retry="retryFile(win.id)"
          @resolve="resolveFileConfirmation"
          @rect-change="onFileRectChange(win.id, $event)"
          @dock="dockFileWindow(win.id, $event)"
          @drag-move="onWindowDragMove(win.id, $event)"
          @drag-end="onWindowDragEnd(win.id, $event)"
          @drag-cancel="onWindowDragCancel(win.id)"
        />
        <ChatPanel
          v-else
          :window-id="win.id"
          :session-id="chatSessionIdOf(win)"
          :project-id="win.content.projectId"
          :projects="projects"
          :can-reassign="canReassignProject(chatSessionIdOf(win))"
          :reassign-picker-open="reassignPickerOpenFor(chatSessionIdOf(win))"
          :title="windowLabel(win.id)"
          :default-model-id="currentAgent?.model.defaultModelId ?? ''"
          :runtime="runtimeFor(chatSessionIdOf(win))"
          :skills="skillsOf(win.content.projectId)" :skills-status="skillStatusOf(win.content.projectId)"
          @retry-skills="retryProjectSkills(win.content.projectId)"
          :user-name="userName"
          :assistant-name="assistantNameOf(chatSessionIdOf(win))"
          :is-focused="win.id === focusedWindowId"
          :is-live="chatSessionIdOf(win) === liveSessionId"
          :disabled="isBusyOf(chatSessionIdOf(win))"
          :can-send="canSendOf(chatSessionIdOf(win))"
          :initial-rect="win.rect.width > 0 ? win.rect : null"
          :cascade="index"
          :follow-point="win.id === tearId ? tearFollow : null"
          :flip-from="flipFromOf(win.id)"
          @close="closeFileWindow(win.id)"
          @focus="focusFileWindow(win.id)"
          @rect-change="onFileRectChange(win.id, $event)"
          @dock="dockFileWindow(win.id, $event)"
          @drag-move="onWindowDragMove(win.id, $event)"
          @drag-end="onWindowDragEnd(win.id, $event)"
          @drag-cancel="onWindowDragCancel(win.id)"
          @send="send(chatSessionIdOf(win), $event)"
          @stop="stop(chatSessionIdOf(win))"
          @regenerate="regenerate(chatSessionIdOf(win))"
          @retry="retrySession(chatSessionIdOf(win))"
          @resolve="resolveConfirmation(chatSessionIdOf(win), $event)"
          @update:draft="updateDraft(chatSessionIdOf(win), $event)"
          @update:pinned="updatePinned(chatSessionIdOf(win), $event)"
          @add-attachments="addAttachments(chatSessionIdOf(win), $event)"
          @remove-attachment="removeAttachment(chatSessionIdOf(win), $event)"
          @update:model="selectModel(chatSessionIdOf(win), $event)"
          @reassign="toggleReassignPicker(chatSessionIdOf(win), $event)"
          @announce="announcePlacement"
        />
      </template>
      <!-- 落点预览:半透明带 + 落点区域整体描边高亮(见 .conversation.is-split-target)。
           进场只动 opacity / transform,时长 ≤ --dl-duration-fast。 -->
      <Transition name="split-preview">
        <div v-if="splitPreview" class="split-preview" aria-hidden="true" :style="splitPreviewStyle" />
      </Transition>
      <WorkspaceDock :groups="minimizedGroupsOf(layout)" :windows="layout.windows" :sessions="sessions" :status-of="sessionStatusOf" :projects="notificationProjects" :agents="agents" :agent-id="selectedAgent" :notifications="agentNotifications" :system-notifications="systemNotifications" :notifications-status="notificationsStatus" :seen-sessions="seenSessions" :disabled="isBusy" :format-time="formatTime" :pulse-key="pulseGroupId" @restore="restoreDockGroup" @close="closeDockGroup" @notification="openNotification" @retry="retryNotifications" @mark-system-read="markSystemNoticeRead" @mark-all-read="markAllNotificationsRead" />
    </div>
    <IdentityVaultDialog @revealing="isIdentityCovered = false" @unlocked="onIdentityUnlocked" @locked="onIdentityLocked" @reset="loadAgents" @announce="announcePlacement" />
    <AgentPairingDialog :open="isPairingOpen" :session-id="pairingSessionId" :link-secret="pairingLinkSecret" :re-pair="isAgentEditorOpen" @manual="resetPairingInvite" @cancel="closePairing" @added="onAgentPaired" @link="onPairingLink" />
    <ProjectPickerDialog :open="isPickerOpen" :agent-id="selectedAgent" :open-paths="openProjectPaths" @confirm="confirmOpenProject" @cancel="isPickerOpen = false" />
    <AgentEditorDialog
      :open="isAgentEditorOpen" :focus-security="agentEditorFocusSecurity"
      :agent="currentAgent"
      :can-delete="agents.length > 1" :busy="agentEditorBusy" :error="agentEditorError" :saved-token="agentEditorSavedToken"
      @submit="onSubmitAgent" @delete="onDeleteAgent" @cancel="isAgentEditorOpen = false"
      @identity-updated="onAgentIdentityUpdated" @re-pair="openAgentRePair"
    />
    <!-- 项目选择浮层(两种用途共用):新建对话时选归属(该 Agent 打开了多个项目才弹),
         以及空对话时改归属。它挂在页面级、position: fixed,锚点是触发元素交上来的视口矩形
         —— 触发点有三处(tab 条的 ＋、引导页主按钮、对话标题栏的归属钮),它自己不认触发点。 -->
    <ProjectPickerPopover
      v-if="projectPicker !== null"
      :key="projectPickerKey"
      :projects="projects"
      :highlight-id="projectPickerHighlightId"
      :title="projectPickerTitle"
      :anchor="projectPickerAnchor"
      @select="chooseProject"
      @cancel="closeProjectPicker"
    />
    <!-- 文件选择浮层:文件分组段的 ＋ 打开。挂在页面级、position: fixed —— 它要跨出区域面板
         (区域有 container-type,会成为 fixed 后代的包含块),且一次只允许存在一个。 -->
    <FilePickerPopover
      v-if="filePicker !== null"
      :key="filePicker.surfaceId"
      :projects="projects"
      :project-trees="projectTrees"
      :tree-status="treeStatus"
      :state-of="entryStateOfPath"
      :anchor="filePicker.anchor"
      @select="chooseFile"
      @cancel="closeFilePicker"
      @retry="retryProjectTree"
      @open-project="openProjectFromPicker"
    />
    <!-- 全页两条礼貌播报通道(各一条):tab 重排(aria-live,只挂属性不加 role=status)与
         区域 / 窗体变化(role=status)。它们都住在页面级 —— 与 h1 同理,不能住在某个区域的会话头里。 -->
    <span class="workspace-tab-live" aria-live="polite">{{ tabAnnounce }}</span>
    <span class="workspace-live" role="status" aria-live="polite">{{ placementAnnounce }}</span>
  </main>
</template>

<style scoped>
/* 入场 surface 可透明，但底下的工作内容在退出开始前不可见；不建立 fixed 包含块。 */
.workspace-page.is-identity-covered > :not(dialog) { visibility: hidden; }
.workspace-page:focus { outline: none; }
.workspace-page {
  --dl-header-height-current: 0px;
  /* 组件级布局常量，不是全局设计 token；侧栏与窄屏抽屉共享同一宽度。 */
  --workspace-sidebar-width: 300px;
  /* 侧栏文件树的**行高**(密集档)。依据 design-language ⑥ 的触达尺寸规则:密集列表 / 树行是
     唯一的收窄例外,且取决于**输入方式** —— ≥1024px 的常驻侧栏面板是桌面指针环境,取 28px
     (判据圆 24px + 安全余量 4px,即相邻圆心距 28 > 24、两圆不相交);≤1023px 侧栏收成抽屉、
     进入触屏语境,回到 --dl-target-size(44px),不再享受例外(见页面底部 media query)。 */
  --workspace-tree-row-height: 28px;
  /* 项目树每级缩进:8px(--dl-space-2),整体靠左起步。 */
  --workspace-tree-step: var(--dl-space-2);
  /* chevron 的**视觉占位宽度**(16px 图标 + 4px 间隙)。命中区仍是 44×44、用绝对定位挂在
     缩进列上,故「占位宽度」与「命中区」解耦。 */
  --workspace-tree-caret-slot: calc(var(--dl-icon-sm) + var(--dl-space-1));
  /* 导引线颜色:由三级文字色派生的低透明度中性线,不新增 ramp 阶。 */
  --workspace-tree-guide: color-mix(in srgb, var(--dl-text-tertiary) 40%, transparent);
  /* 会话转录列上限:48em(720px)。这是 AI 对话产品的通行区间下沿(Claude.ai / ChatGPT ≈768,
     Perplexity ≈720),适合短消息流与代码 / 表格;长文正文仍用 --dl-measure(35em)。
     例外条款见 design-language.md ⑤「会话转录例外」。 */
  --workspace-column-max: 48em;
  /* 横向 tab 条(会话头 / 文件栏)共用的组件级自定属性。**定义在工作台根上**:文件栏是侧栏与
     对话面板的兄弟节点,故这些值必须在共同祖先上给出,两条栏才能共用同一套 tab 语言与紧凑档尺寸。 */
  --workspace-tab-min: 160px;
  --workspace-tab-max: 240px;
  --workspace-tab-gap: var(--dl-space-1);
  --workspace-tab-divider: calc(var(--workspace-nav-control-size) / 2);
  --workspace-tab-reserved: calc(2 * var(--dl-icon-lg) + 3 * var(--dl-space-1));
  /* 会话头 tab 条这一行的控件尺寸 = **紧凑导航行档**(32px),= 本仓设计语言的第三档触达尺寸:
     密集导航行(横向 tab 条)内的行内控件适用「密集行」的收窄例外。 */
  --workspace-nav-control-size: 32px;
  /* 面板上下两条 chrome(会话 tab 栏 / 文件栏)共用的横向内边距:≥1024 为 24px、≤1023 收一档为 16px。 */
  --conversation-heading-pad: var(--dl-space-6);
  /* 头像尺寸与它到内容块的间隙;两者之和即**侧向 gutter**。 */
  --workspace-avatar-size: 28px;
  --workspace-avatar-gap: var(--dl-space-3);
  --workspace-gutter: calc(var(--workspace-avatar-size) + var(--workspace-avatar-gap));
  /* 应用外壳内缩:面板从视口边缘退开 8px,16px 的面板圆角才看得见。 */
  --workspace-shell-inset: var(--dl-space-2);
  /* 工作台没有整站顶栏，页面与悬浮窗共用零顶栏高度。 */
  height: calc(100dvh - var(--dl-header-height-current));
  min-height: 0;
}
/* 外壳网格:两列(侧栏 / 对话)+ 两行(面板行 / 最小化栏行)。 */
.workspace-layout { display: grid; grid-template-columns: var(--workspace-sidebar-width) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; height: 100%; padding: var(--workspace-shell-inset); gap: var(--workspace-shell-inset); }
/* 侧栏为一块独立圆角面板:四面发丝框 + xl 圆角,overflow 让内部滚动区与满宽分隔线被圆角裁切。 */
.workspace-sidebar { min-height: 0; display: flex; flex-direction: column; background: var(--dl-bg-elevated); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); overflow: visible; padding: var(--dl-space-4); gap: var(--dl-space-4); }
.workspace-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--dl-space-2); min-height: var(--dl-target-size); min-width: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-button:hover { background: var(--dl-bg-hover); border-color: var(--dl-border-strong); }
.workspace-button:active { transform: translateY(var(--dl-lift-press)); }
.workspace-button:focus-visible { box-shadow: var(--dl-focus-ring); }
.workspace-button:disabled, .workspace-button[aria-disabled='true'] { cursor: not-allowed; color: var(--dl-text-disabled); background: var(--dl-bg-sunken); transform: none; }
/* 侧栏头部:Agent 选择器占满,窄屏抽屉里右侧并排一枚关闭钮。 */
.sidebar-head { display: flex; align-items: center; gap: var(--dl-space-2); flex: none; }
.sidebar-close { flex: none; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); padding: 0; font-size: var(--dl-font-size-lg); }
/* 侧栏视图面板:项目 / 插件共用一块可伸缩的区域。 */
.plugins-pane__scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-1); margin: calc(-1 * var(--dl-space-1)); }
.sidebar-view-panel { display: flex; flex-direction: column; gap: var(--dl-space-2); min-height: 0; flex: 1; }
/* Agent 列表加载中 / 失败时占据身份区的位置。 */
.sidebar-agent-state { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.sidebar-hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.sidebar-loading { display: grid; gap: var(--dl-space-4); }
.workspace-projects { display: flex; flex-direction: column; gap: var(--dl-space-2); min-height: 0; flex: 1; }
.project-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; }
.project-list { display: flex; flex-direction: column; gap: var(--dl-space-2); padding: var(--dl-space-1); margin: calc(-1 * var(--dl-space-1)); }
/* 项目之间留**可读的分隔**:发丝线 + 间距(不只靠缩进)。首项之上不画线。 */
.project-item + .project-item { border-block-start: var(--dl-border-width) solid var(--dl-border-base); padding-block-start: var(--dl-space-2); }
/* 项目行**粘性吸附**:滚动时项目名吸在侧栏滚动容器顶部,直到它的子树滚出(它的 .project-item 里)。
   sticky 需要不透明的底,否则下方的文件行会从背后透出来;层序走 --dl-z-sticky(不就地写数值)。
   祖先 .project-scroll 有 overflow-y:auto;.workspace-sidebar 现为 overflow:visible(让侧栏头部的
   Agent 浮层不被裁切)—— sticky 相对滚动容器定位,注意别被裁:行本身不超出滚动容器,故不受影响。 */
.project-row { position: sticky; inset-block-start: 0; z-index: var(--dl-z-sticky); display: flex; align-items: center; min-height: var(--dl-target-size); padding-inline-end: var(--dl-space-2); background: var(--dl-bg-elevated); border-radius: var(--dl-radius-sm); }
/* 菜单打开的项目行必须压在其它 sticky 项目行之上:每个 .project-row 都因 sticky + z-index
   形成自己的层叠上下文,菜单的 --dl-z-overlay 只在行内有效,越不过 DOM 更靠后的同级行。
   类由 ProjectMenu 在开合时挂到所在行;只抬高这一行,其余行仍按 --dl-z-sticky 叠放。 */
.project-row--menu-open { z-index: calc(var(--dl-z-sticky) + 1); }
.project-row__button { flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--dl-space-2); padding-inline-start: var(--dl-space-1); min-height: var(--dl-target-size); text-align: left; border-radius: var(--dl-radius-sm); }
/* 项目色点:归属的**颜色通道**(第二通道)。只作图形,不填整块区域、不作文字色 ——
   var(--dl-identity) 由所在元素的 .dl-identity-N 绑定类给出(见 style.css 与 design-language ④)。 */
.project-dot { flex-shrink: 0; inline-size: var(--dl-identity-dot-size); block-size: var(--dl-identity-dot-size); border-radius: var(--dl-radius-pill); background: var(--dl-identity); }
.project-row__name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--dl-font-size-sm); font-weight: 600; color: var(--dl-text-primary); }
.project-row__slot { flex-shrink: 0; width: var(--dl-target-size); height: var(--dl-target-size); }
.project-row__caret { flex-shrink: 0; color: var(--dl-text-secondary); }
.project-row__button:focus-visible, .entry-row__button:focus-visible { box-shadow: var(--dl-focus-ring); }
.tree-caret { width: var(--dl-icon-sm); height: var(--dl-icon-sm); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.tree-caret path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
.tree-caret.is-open { transform: rotate(90deg); }
.project-row .project-menu { position: absolute; inset-block-start: 50%; inset-inline-end: calc(var(--dl-space-2) + var(--dl-icon-sm) + var(--dl-space-1)); transform: translateY(-50%); z-index: var(--dl-z-overlay); }
.project-row:hover .project-menu, .project-row:focus-within .project-menu { opacity: 1; }
.project-tree { position: relative; display: flex; flex-direction: column; padding-block: var(--dl-space-1); }
.project-ridge { position: absolute; inset-block: 0; inset-inline-start: var(--workspace-tree-step); width: var(--dl-border-width); background: var(--workspace-tree-guide); pointer-events: none; }
.tree-hint { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); padding: var(--dl-space-1) var(--dl-space-2); }
.tree-hint--error { color: var(--dl-error); }
.entry-list { display: flex; flex-direction: column; }
.entry-row { position: relative; display: flex; }
.entry-row__button { display: flex; align-items: center; gap: var(--dl-space-1); width: 100%; min-width: 0; min-height: var(--workspace-tree-row-height); padding-inline-start: calc(var(--workspace-tree-level) * var(--workspace-tree-step)); padding-inline-end: var(--dl-space-2); text-align: left; color: var(--dl-text-secondary); border-radius: var(--dl-radius-sm); }
.entry-row__button:hover { background: var(--dl-bg-hover); }
.entry-row__button:hover .tree-caret { color: var(--dl-text-primary); }
.entry-row__button:active { background: var(--dl-bg-sunken); }
/* 文件行的「加入当前对话」按钮:密集行(树行)的行内控件 —— 与项目行的 ⋯ 同一处置:
   **绝对定位浮在行的右端**,故行按钮仍是**整行宽**(密集行的「整行为命中区」判据不破),
   它自己平时透明、行悬停 / 行内聚焦时显现,但始终可 Tab 到达。命中区 24×24(第三档)。
   行按钮的右侧内边距为它预留位置,文件名与状态芯片不会被盖住。 */
.entry-row__add { position: absolute; inset-block-start: 50%; inset-inline-end: var(--dl-space-1); transform: translateY(-50%); display: inline-flex; align-items: center; justify-content: center; inline-size: var(--dl-space-6); block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-sm); line-height: 1; opacity: 0; transition: opacity var(--dl-duration-fast) var(--dl-ease-standard); }
.entry-row:hover .entry-row__add, .entry-row__add:focus-visible { opacity: 1; }
/* 无 hover 的输入方式(触屏 / 手写笔)下**常驻可见**:这枚钮承载的是 WCAG 2.5.7 要求的
   非拖拽通路,默认透明会让它在触屏上等于不存在 —— hover 只是指针场景的省空间手段,不是前提。 */
@media (hover: none) {
  .entry-row__add { opacity: 1; }
}
.entry-row__add:hover { background: var(--dl-bg-hover); color: var(--dl-accent); }
.entry-row__add:focus-visible { box-shadow: var(--dl-focus-ring); }
.entry-guides { position: absolute; inset-block: 0; inset-inline-start: var(--workspace-tree-step); display: flex; pointer-events: none; }
.entry-guide { width: var(--workspace-tree-step); border-inline-start: var(--dl-border-width) solid var(--workspace-tree-guide); }
/* 文件行是**整行 button**:左内边距在目录行的「缩进 + chevron 槽」之上再加一份 chevron 槽;
   右内边距为绝对定位的「加入当前对话」钮预留位置(24 + 4),文件名与芯片因此不落到它下面。 */
.entry-row__button--file { padding-inline-start: calc(var(--workspace-tree-level) * var(--workspace-tree-step) + var(--workspace-tree-caret-slot)); padding-inline-end: calc(var(--dl-space-6) + var(--dl-space-1)); }
.entry-name { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--dl-font-size-xs); font-weight: 400; color: var(--dl-text-primary); }
.entry-state { flex-shrink: 0; padding: 0 var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); color: var(--dl-text-secondary); }
.entry-state[data-state='created'] { color: var(--dl-accent); }
.entry-state[data-state='modified'] { color: var(--dl-warning); }
.entry-state[data-state='pending'] { color: var(--dl-accent); border-color: var(--dl-accent); background: var(--dl-accent-soft); }
.open-project { width: 100%; justify-content: center; flex-shrink: 0; }
/* 对话面板:外层是面板(四面发丝框 + xl 圆角),纵向分成 [会话头(tablist)| tabpanel]。
   刻意不给本面板加 overflow: hidden —— 子元素的 :focus-visible 焦点环是向外画的 box-shadow,
   裁切会把环的竖边整条抹掉(基线 ⑦ 禁止吞焦点样式)。 */
.conversation { display: flex; flex-direction: column; min-width: 0; min-height: 0; border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); container-type: inline-size; }
/* 极窄显示区(375 分屏 / 分隔线拖到极值)降级:藏掉侧栏触发钮,避免一个 44px 控件
   把会话头撑出区域。非根区域本来就不挂这枚钮(见模板),根区域在 <100px 时也不再挂。 */
@container (max-width: 100px) {
  .conversation-heading > .workspace-button.icon-button { display: none; }
}
/* 引导页外壳:窄屏在引导页之上再放一枚侧栏触发钮(引导页没有会话头,而那枚钮原本住在会话头里);
   其余情况它只是一层撑满的透明容器,让引导页照常填满这一格。 */
.guide-shell { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
/* 「全部最小化」不再有独立空态:根区域没有可见成员时回到创建会话的引导(见 isGuideSurface),
   底栏是恢复入口。 */
.guide-shell__trigger { align-self: flex-start; margin-block-end: var(--dl-space-2); }
.guide-shell__body { flex: 1; min-height: 0; }
/* 落点区域整体描边高亮(并入 / 切分同一族手法):让「松手落到这块区域」一眼可见。
   细分意图由落点预览带(半透明 accent 带)承担 —— 切分那条带只压在该边。 */
.conversation.is-merge-target,
.conversation.is-split-target { box-shadow: var(--dl-focus-ring); }
/* 落点预览:半透明 accent 带,压在被切区域的边缘上(切出方向的宽度 = 命中带)。
   进场只动 opacity,时长取动效白名单那一档。 */
.split-preview {
  position: fixed;
  z-index: var(--dl-z-toast);
  pointer-events: none;
  background: color-mix(in srgb, var(--dl-accent) 18%, transparent);
  border: var(--dl-border-width) solid var(--dl-accent);
  border-radius: var(--dl-radius-md);
}
.split-preview-enter-active,
.split-preview-leave-active { transition: opacity var(--dl-duration-fast) var(--dl-ease-standard); }
.split-preview-enter-from,
.split-preview-leave-to { opacity: 0; }
/* tabpanel:内容区(转录位 / 文件面板 / 对话窗体)这一整块。 */
.conversation-panel { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
/* 内容区的定位基准:与「转录位」等大 —— 停靠的文件面板精确覆盖这一块(不含任何输入坞,
   输入坞现在住在对话窗体内)。纵向流:[内容本体];停靠的对话没有标题栏(tab 条下方直接是
   转录区,见模板里的说明),故对话形态下这一块从顶到底都是内容本体。 */
.transcript-area { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
/* 会话头 = [汉堡?][tab 条][文件组][＋][菜单钮]。 */
.conversation-heading { position: relative; display: flex; align-items: center; gap: var(--dl-space-3); padding: var(--dl-space-1) var(--conversation-heading-pad) var(--dl-space-2); }
.conversation-heading.is-drop-target { border-radius: var(--dl-radius-md); box-shadow: var(--dl-focus-ring); }
.conversation-heading__dock-hint {
  position: absolute;
  inset-block-start: calc(100% + var(--dl-space-2));
  inset-inline-start: 50%;
  transform: translateX(-50%);
  z-index: var(--dl-z-toast);
  max-inline-size: calc(100% - 2 * var(--dl-space-4));
  padding: var(--dl-space-2) var(--dl-space-3);
  border-radius: var(--dl-radius-md);
  background: var(--dl-accent);
  color: var(--dl-text-on-accent);
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-snug);
  text-align: center;
  box-shadow: var(--dl-shadow-md);
  pointer-events: none;
}
.dock-hint-enter-active,
.dock-hint-leave-active { transition: opacity var(--dl-duration-fast) var(--dl-ease-standard), transform var(--dl-duration-fast) var(--dl-ease-standard); }
.dock-hint-enter-from,
.dock-hint-leave-to { opacity: 0; transform: translate(-50%, calc(-1 * var(--dl-space-1))); }
.icon-button { padding: var(--dl-space-2); flex-shrink: 0; }
.workspace-button svg { width: var(--dl-icon-md); height: var(--dl-icon-md); flex-shrink: 0; }
.workspace-button svg path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
/* 空位占位:这块区域的「转录位」,但没有绑定会话(没有窗体就没有输入框)。它沿用与真实转录
   同名的滚动容器样式,只是内容恒为空态。底部内缩 / 滚动内缩与真实转录同口径(WCAG C43)。 */
.transcript--placeholder { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; overflow-anchor: none; scrollbar-gutter: stable; border-block-start: var(--dl-border-width) solid var(--dl-border-base); padding-block-end: var(--dl-space-4); scroll-padding-block-end: var(--dl-space-4); }
.transcript--placeholder:focus-visible { box-shadow: var(--dl-focus-ring); }
/* 三层 z 模型:第 1 层(最底)应用外壳(站点顶栏 / 侧栏 / 对话窗体含**其自带的输入坞** / Agent 栏)
   一律不设 z-index;第 2 层文件窗体(可覆盖上述全部)取 calc(--dl-z-overlay + n);模态再压窗体。
   输入坞已随对话窗体回到第 1 层,故这里不写 z-index —— 文件窗体可以盖住它。 */
.workspace-backdrop { position: fixed; inset: 0; z-index: var(--dl-z-overlay); background: color-mix(in srgb, var(--dl-bg-sunken) 80%, transparent); }
@media (max-width: 1023px) {
  .workspace-page { --workspace-tree-row-height: var(--dl-target-size);
    --workspace-avatar-size: var(--dl-icon-lg);
    --workspace-avatar-gap: var(--dl-space-2);
    --workspace-gutter: var(--dl-space-4); }
  /* 抽屉 = 触屏语境:纵向密集行的收窄例外不再适用(手指纵向落点精度低),「加入当前对话」钮
     随行一起回到 44×44;行按钮的右侧内边距同步让出这一档。 */
  .entry-row__add { inset-inline-end: 0; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); }
  .entry-row__button--file { padding-inline-end: var(--dl-target-size); }
  .workspace-layout { grid-template-columns: minmax(0, 1fr); }
  /* 抽屉贴视口左缘(脱离外壳内缩),只圆朝内容一侧的两角;抬到 **modal** 档(浮动的文件面板在
     overlay 档,抽屉必须在它之上)。 */
  .workspace-sidebar { position: fixed; inset: 0 auto 0 0; width: min(var(--workspace-sidebar-width), calc(100% - var(--dl-space-12))); z-index: var(--dl-z-modal); border-radius: 0 var(--dl-radius-xl) var(--dl-radius-xl) 0; transform: translateX(-100%); visibility: hidden; transition: transform var(--dl-duration-base) var(--dl-ease-standard); }
  .workspace-sidebar.is-open { transform: translateX(0); visibility: visible; }
  .conversation { --conversation-heading-pad: var(--dl-space-4); }
}
@media (prefers-reduced-motion: reduce) {
  .workspace-button:active { transform: none; }
  .dock-hint-enter-active, .dock-hint-leave-active { transition-duration: 0.01ms; }
}
/* 视觉隐藏的 h1 与两条礼貌播报通道(标准 clip 方案):对辅助技术可读,但不产生可见布局。 */
.workspace-h1,
.workspace-tab-live,
.workspace-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
