// 演示结构与内存数据；展示文案从当前语言词条组装，刷新即重置。
import type { AgentId, ChatSession, SessionStatus } from '../contracts/generated/chat-session'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { Agent } from '../contracts/generated/agent'
import type { Project } from '../contracts/generated/project'
import type { ProjectEntry } from '../contracts/generated/project-entry'
import type { ProjectCandidate } from '../contracts/generated/project-candidate'
import type { AgentRuntime } from '../contracts/generated/agent-runtime'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { ConversationSearchHit } from '../contracts/generated/conversation-search-hit'
import type { AppRoute } from '../contracts/generated/app-route'
import type { Messages } from '../i18n'
import { useI18n } from '../i18n'

const { t } = useI18n()
const AGENT_IDS = ['planning', 'research', 'writing'] satisfies AgentId[]

// 每条预置会话归属一个 Agent 与一个项目:会话头据此显示 Agent 名,对话切换器按项目隔离。
// preview 是会话列表的次要行。projectId 指向下面 projectStore 里的项目。
// 种子给出**常规态**下的基础状态,让 tab 上的四种状态在默认项目(weekly-report)里都能被看到:
// streaming(活动会话 weekly)、completed(roadmap,未看过时显示对勾)、idle(incident / hiring,空心环)、
// new(budget,sparkles)。刻意**不**在常规态新增「等待交互」的会话 —— 它会改变既有「等待语义同源」
// 不变量的前提(那条断言在常规态期望 0 个等待项);awaiting 由演示态 ?s=waiting 派生(见 sessionStatusFor)。
const sessionSeeds = [
  { id: 'weekly', title: 'weekly', preview: 'weekly', agent: 'planning', projectId: 'weekly-report', updatedAt: '2026-10-08T09:30:00Z', status: 'streaming' },
  { id: 'roadmap', title: 'roadmap', preview: 'roadmap', agent: 'planning', projectId: 'weekly-report', updatedAt: '2026-10-08T07:10:00Z', status: 'completed' },
  { id: 'incident', title: 'incident', preview: 'incident', agent: 'planning', projectId: 'weekly-report', updatedAt: '2026-10-07T08:40:00Z', status: 'idle' },
  { id: 'budget', title: 'budget', preview: 'budget', agent: 'planning', projectId: 'weekly-report', updatedAt: '2026-10-06T09:20:00Z', status: 'new' },
  { id: 'launch', title: 'launch', preview: 'launch', agent: 'planning', projectId: 'weekly-report', updatedAt: '2026-10-06T03:10:00Z', status: 'completed' },
  { id: 'hiring', title: 'hiring', preview: 'hiring', agent: 'planning', projectId: 'weekly-report', updatedAt: '2026-10-05T10:30:00Z', status: 'idle' },
  { id: 'research', title: 'research', preview: 'research', agent: 'research', projectId: 'user-research', updatedAt: '2026-10-07T07:20:00Z', status: 'streaming' },
  { id: 'knowledge', title: 'knowledge', preview: 'knowledge', agent: 'writing', projectId: 'product-docs', updatedAt: '2026-10-05T08:00:00Z', status: 'streaming' },
  // 第二个「等待交互」会话,与 knowledge 同属 product-docs:演示「别的会话在等你」这枚徽标
  // 与菜单里置顶的「等待你」分组时,落地可见的 knowledge 已被视为打开过,靠这条未打开的会话才成立。
  { id: 'quarterly', title: 'quarterly', preview: 'quarterly', agent: 'writing', projectId: 'product-docs', updatedAt: '2026-10-07T02:15:00Z', status: 'idle' },
] satisfies (ChatSession & {
  title: keyof Messages['workspace']['sessions']
  preview: keyof Messages['workspace']['previews']
})[]

const messageSeeds = {
  weekly: [
    { id: 'weekly-1', role: 'user', body: 'weeklyUser1', createdAt: '2026-10-08T09:25:00Z' },
    { id: 'weekly-2', role: 'assistant', body: 'weeklyAssistant1', createdAt: '2026-10-08T09:26:00Z' },
    { id: 'weekly-3', role: 'user', body: 'weeklyUser2', createdAt: '2026-10-08T09:29:00Z' },
    { id: 'weekly-4', role: 'assistant', body: 'weeklyAssistant2', createdAt: '2026-10-08T09:30:00Z' },
  ],
  roadmap: [
    { id: 'roadmap-1', role: 'user', body: 'roadmapUser', createdAt: '2026-10-08T07:09:00Z' },
    { id: 'roadmap-2', role: 'assistant', body: 'roadmapAssistant', createdAt: '2026-10-08T07:10:00Z' },
  ],
  incident: [
    { id: 'incident-1', role: 'user', body: 'incidentUser', createdAt: '2026-10-07T08:39:00Z' },
    { id: 'incident-2', role: 'assistant', body: 'incidentAssistant', createdAt: '2026-10-07T08:40:00Z' },
  ],
  budget: [
    { id: 'budget-1', role: 'user', body: 'budgetUser', createdAt: '2026-10-06T09:19:00Z' },
    { id: 'budget-2', role: 'assistant', body: 'budgetAssistant', createdAt: '2026-10-06T09:20:00Z' },
  ],
  hiring: [
    { id: 'hiring-1', role: 'user', body: 'hiringUser', createdAt: '2026-10-05T10:29:00Z' },
    { id: 'hiring-2', role: 'assistant', body: 'hiringAssistant', createdAt: '2026-10-05T10:30:00Z' },
  ],
  research: [
    { id: 'research-1', role: 'user', body: 'researchUser', createdAt: '2026-10-07T07:19:00Z' },
    { id: 'research-2', role: 'assistant', body: 'researchAssistant', createdAt: '2026-10-07T07:20:00Z' },
  ],
  launch: [
    { id: 'launch-1', role: 'user', body: 'launchUser', createdAt: '2026-10-06T03:09:00Z' },
    { id: 'launch-2', role: 'assistant', body: 'launchAssistant', createdAt: '2026-10-06T03:10:00Z' },
  ],
  knowledge: [
    { id: 'knowledge-1', role: 'user', body: 'knowledgeUser', createdAt: '2026-10-05T07:59:00Z' },
    { id: 'knowledge-2', role: 'assistant', body: 'knowledgeAssistant', createdAt: '2026-10-05T08:00:00Z' },
  ],
  quarterly: [
    { id: 'quarterly-1', role: 'user', body: 'quarterlyUser', createdAt: '2026-10-07T02:14:00Z' },
    { id: 'quarterly-2', role: 'assistant', body: 'quarterlyAssistant', createdAt: '2026-10-07T02:15:00Z' },
  ],
} satisfies Record<string, (ChatMessage & { body: keyof Messages['workspace']['messages'] })[]>

const responsePool: (keyof Messages['workspace']['responses'])[] = ['first', 'second', 'third']
const extraSessions: ChatSession[] = []
const extraMessages = new Map<string, ChatMessage[]>()
const translatedReplies = new Map<string, keyof Messages['workspace']['responses']>()
const responseBodies = new Map<string, string>()
const turns = new Map<string, number>()
const sequence = { session: 0, message: 0 }

// 全部预置会话(不按项目过滤);项目维度的过滤在 API 层完成。
// status 由种子基础值 + 演示态派生(见 sessionStatusFor),是「等待交互」的单一事实源之一
// —— 会话列表、确认请求、项目树 pending 芯片三处都从它派生,不会各自为政。
export function mockSessions(demoState: AppRoute['demoState']): ChatSession[] {
  return [
    ...extraSessions.map((session) => ({ ...session, title: session.title || t.value.workspace.newChat })),
    ...sessionSeeds.map((session) => ({
      ...session,
      title: t.value.workspace.sessions[session.title],
      preview: t.value.workspace.previews[session.preview],
      status: sessionStatusFor(session.id, session.status, demoState),
    })),
  ]
}

export function mockTranscript(sessionId: string): ChatMessage[] {
  const key = sessionSeeds.find((session) => session.id === sessionId)?.title
  const initial: ChatMessage[] = key ? messageSeeds[key].map((message) => ({ ...message, body: t.value.workspace.messages[message.body] })) : []
  const extra = (extraMessages.get(sessionId) ?? []).map((message) => {
    // 部分正文保持原文；完成及重新生成完成的应答按当前语言组装。
    const responseKey = message.body === responseBodies.get(message.id) ? translatedReplies.get(message.id) : undefined
    return { ...message, body: responseKey ? t.value.workspace.responses[responseKey] : message.body }
  })
  return [...initial, ...extra]
}

// 新建会话的归属规则:归属项目由调用方(侧栏当前项目)决定后传入 —— 项目本身就已挂在某个
// Agent 上,故 agent 由项目反推,调用方不必重复传、也就没有两处对不上的风险。
export function mockCreateSession(projectId: string): ChatSession {
  sequence.session += 1
  const session: ChatSession = { id: `draft-${sequence.session}`, title: '', preview: '', agent: projectAgent(projectId), projectId, updatedAt: '2026-10-08T10:00:00Z', status: 'new' }
  extraSessions.unshift(session)
  extraMessages.set(session.id, [])
  return { ...session, title: t.value.workspace.newChat }
}

export function mockSendMessage(sessionId: string, text: string): ChatMessage {
  sequence.message += 1
  const turn = turns.get(sessionId) ?? 0
  turns.set(sessionId, turn + 1)
  const responseKey = responsePool[turn % responsePool.length] ?? 'first'
  const createdAt = new Date(Date.UTC(2026, 9, 8, 10, sequence.message)).toISOString()
  const user: ChatMessage = { id: `user-${sequence.message}`, role: 'user', body: text, createdAt }
  const response: ChatMessage = { id: `response-${sequence.message}`, role: 'assistant', body: t.value.workspace.responses[responseKey], createdAt }
  extraMessages.set(sessionId, [...(extraMessages.get(sessionId) ?? []), user, { ...response, body: '' }])
  translatedReplies.set(response.id, responseKey)
  responseBodies.set(response.id, response.body)
  const session = extraSessions.find((item) => item.id === sessionId)
  if (session) {
    session.title ||= text
    session.updatedAt = createdAt
  }
  return response
}

export function mockSaveResponse(sessionId: string, response: ChatMessage): void {
  const messages = extraMessages.get(sessionId) ?? []
  const existing = messages.find((message) => message.id === response.id)
  if (existing) existing.body = response.body
}

// ---- Agent 与项目 ----

// 项目种子:项目是 Agent Host 上的一个目录(即 CLI 运行的 cwd)。名称 / 路径 / 条目路径
// 都是技术标识,不随语言变化,故留在数据层,不进 i18n。
// entries 是扁平数组 + path(见契约注释):层级由载体按 path 推导。
interface ProjectSeed {
  id: string
  name: string
  path: string
  entries: ProjectEntry[]
}

// 每个 Agent 打开的项目。打开 / 关闭会就地改动本表(内存态,刷新即重置)。
const projectStore: Record<AgentId, ProjectSeed[]> = {
  planning: [
    {
      id: 'weekly-report',
      name: 'weekly-report',
      path: '~/work/weekly-report',
      // 五层深树(src → components → layout → header → index.ts),用于演示与断言密集档的
      // 逐层缩进 / 导引线 / 深缩进下的省略号;同时含 created 与 modified —— 用于演示状态芯片。
      // path 用产品源码风格,贴近真实项目结构。
      entries: [
        { id: 'wr-src', path: 'src', kind: 'directory', state: 'none' },
        { id: 'wr-utils', path: 'src/utils', kind: 'directory', state: 'none' },
        { id: 'wr-format', path: 'src/utils/format.ts', kind: 'file', state: 'modified' },
        { id: 'wr-components', path: 'src/components', kind: 'directory', state: 'none' },
        { id: 'wr-layout', path: 'src/components/layout', kind: 'directory', state: 'none' },
        { id: 'wr-header', path: 'src/components/layout/header', kind: 'directory', state: 'none' },
        { id: 'wr-header-index', path: 'src/components/layout/header/index.ts', kind: 'file', state: 'modified' },
        { id: 'wr-main', path: 'src/main.ts', kind: 'file', state: 'created' },
        { id: 'wr-notes', path: 'notes', kind: 'directory', state: 'none' },
        { id: 'wr-week-40', path: 'notes/2026-W40.md', kind: 'file', state: 'created' },
        { id: 'wr-readme', path: 'README.md', kind: 'file', state: 'modified' },
        { id: 'wr-progress', path: 'progress.csv', kind: 'file', state: 'modified' },
        { id: 'wr-gitignore', path: '.gitignore', kind: 'file', state: 'none' },
      ],
    },
    {
      id: 'knowledge-base',
      name: 'knowledge-base',
      path: '~/work/knowledge-base',
      // 该项目初始没有会话,用于演示对话栏的空态。
      entries: [
        { id: 'kb-docs', path: 'docs', kind: 'directory', state: 'none' },
        { id: 'kb-onboarding', path: 'docs/onboarding', kind: 'directory', state: 'none' },
        { id: 'kb-first-week', path: 'docs/onboarding/first-week.md', kind: 'file', state: 'none' },
        { id: 'kb-index', path: 'docs/index.md', kind: 'file', state: 'modified' },
        { id: 'kb-faq', path: 'faq.md', kind: 'file', state: 'none' },
      ],
    },
  ],
  research: [
    {
      id: 'user-research',
      name: 'user-research',
      path: '~/work/user-research',
      entries: [
        { id: 'ur-interviews', path: 'interviews', kind: 'directory', state: 'none' },
        { id: 'ur-raw', path: 'interviews/raw', kind: 'directory', state: 'none' },
        { id: 'ur-03', path: 'interviews/raw/03.md', kind: 'file', state: 'modified' },
        { id: 'ur-guide', path: 'interviews/guide.md', kind: 'file', state: 'created' },
        { id: 'ur-segments', path: 'analysis/segments.csv', kind: 'file', state: 'modified' },
        { id: 'ur-analysis', path: 'analysis', kind: 'directory', state: 'none' },
      ],
    },
    {
      id: 'benchmarks',
      name: 'benchmarks',
      path: '~/work/benchmarks',
      entries: [
        { id: 'bm-suites', path: 'suites', kind: 'directory', state: 'none' },
        { id: 'bm-latency', path: 'suites/latency.ts', kind: 'file', state: 'none' },
        { id: 'bm-results', path: 'results', kind: 'directory', state: 'none' },
        { id: 'bm-q3', path: 'results/2026-Q3.csv', kind: 'file', state: 'none' },
        { id: 'bm-readme', path: 'README.md', kind: 'file', state: 'none' },
      ],
    },
  ],
  writing: [
    {
      id: 'product-docs',
      name: 'product-docs',
      path: '~/work/product-docs',
      // knowledge / quarterly 两个「等待交互」会话的确认请求各受影响一个文件:
      // release-notes.md(knowledge)与 release-plan.csv(quarterly),等待期间其芯片变 pending。
      entries: [
        { id: 'pd-assets', path: 'assets', kind: 'directory', state: 'none' },
        { id: 'pd-keyart', path: 'assets/key-art.png', kind: 'file', state: 'none' },
        { id: 'pd-drafts', path: 'drafts', kind: 'directory', state: 'none' },
        { id: 'pd-drafts-v2', path: 'drafts/v2', kind: 'directory', state: 'none' },
        { id: 'pd-drafts-notes', path: 'drafts/v2/notes.md', kind: 'file', state: 'modified' },
        { id: 'pd-plan', path: 'release-plan.csv', kind: 'file', state: 'modified' },
        { id: 'pd-release', path: 'release-notes.md', kind: 'file', state: 'created' },
      ],
    },
    {
      id: 'changelog',
      name: 'changelog',
      path: '~/work/changelog',
      entries: [
        { id: 'cl-entries', path: 'entries', kind: 'directory', state: 'none' },
        { id: 'cl-10', path: 'entries/1.0.md', kind: 'file', state: 'none' },
        { id: 'cl-unreleased', path: 'entries/unreleased.md', kind: 'file', state: 'modified' },
        { id: 'cl-readme', path: 'README.md', kind: 'file', state: 'none' },
      ],
    },
  ],
}

// Agent Host 上检测到的候选目录(供「打开项目」列表渲染与搜索),含 git / 非 git 两类。
// fileCount 是**打开前**检测到的文件数(readdir 的粗计数),与已打开项目树里的**条目数**
// (Project.entryCount = ProjectSeed.entries.length)概念不同;但演示里两者指同一批内容,
// 口径必须一致(否则会出现「候选说 9 个、打开后 13 条」的观感矛盾),故对应同一目录的候选项
// 一律与该项目对齐:weekly-report 13 = entries.length,product-docs 7 = entries.length,
// knowledge-base 5 = entries.length。其余候选(api-server / design-tokens / notes / scratch)
// 尚未打开,没有可对齐的项目,保持各自的检测值。
const projectCandidates: ProjectCandidate[] = [
  { path: '~/work/weekly-report', name: 'weekly-report', fileCount: 13, isGitRepo: true },
  { path: '~/work/knowledge-base', name: 'knowledge-base', fileCount: 5, isGitRepo: false },
  { path: '~/work/product-docs', name: 'product-docs', fileCount: 7, isGitRepo: true },
  { path: '~/work/api-server', name: 'api-server', fileCount: 42, isGitRepo: true },
  { path: '~/work/design-tokens', name: 'design-tokens', fileCount: 18, isGitRepo: true },
  { path: '~/Documents/notes', name: 'notes', fileCount: 7, isGitRepo: false },
  { path: '~/work/scratch', name: 'scratch', fileCount: 3, isGitRepo: false },
]

// 由项目 id 反推它挂在哪个 Agent 上。找不到时回退第一个 Agent(正常路径不会发生:
// API 层在调用前已校验项目存在)。
function projectAgent(projectId: string): AgentId {
  for (const agentId of AGENT_IDS) {
    if (projectStore[agentId].some((project) => project.id === projectId)) return agentId
  }
  return 'planning'
}

// 项目列表是**摘要**:只给名称 / 路径 / 条目数,entries 留空 —— 树由「取项目树」按需加载。
export function mockProjects(agentId: AgentId): Project[] {
  return projectStore[agentId].map((project) => ({
    id: project.id,
    name: project.name,
    path: project.path,
    entryCount: project.entries.length,
    entries: [],
  }))
}

export function mockAgents(): Agent[] {
  return AGENT_IDS.map((id) => ({ id, projects: mockProjects(id) }))
}

// 打开单个项目的条目树(扁平数组)。项目不存在时返回 null,由 API 层转成失败结果。
export function mockProjectTree(projectId: string): ProjectEntry[] | null {
  for (const agentId of AGENT_IDS) {
    const project = projectStore[agentId].find((item) => item.id === projectId)
    if (project) return project.entries.map((entry) => ({ ...entry }))
  }
  return null
}

export function mockProjectCandidates(): ProjectCandidate[] {
  return projectCandidates.map((candidate) => ({ ...candidate }))
}

// 打开项目:按候选目录的 path 新建一个项目并加入该 Agent 的列表。
// 新项目的条目树按下发目录名生成一份确定的样例内容(真实场景由宿主读取磁盘)。
export function mockOpenProject(agentId: AgentId, path: string): Project {
  const candidate = projectCandidates.find((item) => item.path === path)
  const name = candidate?.name ?? path.split('/').at(-1) ?? path
  const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const entries: ProjectEntry[] = [
    { id: `${slug}-src`, path: 'src', kind: 'directory', state: 'none' },
    { id: `${slug}-index`, path: 'src/index.ts', kind: 'file', state: 'none' },
    { id: `${slug}-readme`, path: 'README.md', kind: 'file', state: 'none' },
  ]
  const project: ProjectSeed = { id: `${slug}-opened-${projectStore[agentId].length}`, name, path, entries }
  projectStore[agentId].push(project)
  return { id: project.id, name: project.name, path: project.path, entryCount: project.entries.length, entries: [] }
}

// 关闭项目:按 id 从它所属 Agent 的列表里移除(只动这一个,不牵连其它项目)。
export function mockCloseProject(projectId: string): boolean {
  for (const agentId of AGENT_IDS) {
    const index = projectStore[agentId].findIndex((project) => project.id === projectId)
    if (index >= 0) {
      projectStore[agentId].splice(index, 1)
      return true
    }
  }
  return false
}

// ---- 运行遥测与「等待交互」确认 ----

// statusDetail 是 i18n 的键(不是已翻译的文案),载体按当前语言解析。
type RuntimeSeed = Omit<AgentRuntime, 'agentId' | 'statusDetail' | 'projectName' | 'projectPath'> & {
  statusDetail: keyof Messages['workspace']['statusDetails']
}

// 三个 Agent 各一种**常态**状态 —— 这里不写死 waiting:waiting 只在「当前会话在等待交互」
// 时由 mockAgentRuntime 派生出(见 isAwaitingSession)。若在此写死一个 waiting,运行态与
// 确认请求就成了两个事实源,必然对不上。写作助手的常态给非确认类的状态与具体动作。
// context 用量刻意取 41% / 78% / 93% 三档:它们分别落在遥测条用量条的三级配色
// (info / warning / error)上,让「分级配色」可被机械断言。
const runtimeSeeds: Record<AgentId, RuntimeSeed> = {
  planning: { status: 'thinking', statusDetail: 'summarizing', modelName: 'Claude Sonnet 4.5', contextUsedTokens: 82000, contextWindowTokens: 200000, elapsedSeconds: 42 },
  research: { status: 'streaming', statusDetail: 'draftingOutline', modelName: 'Claude Sonnet 4.5', contextUsedTokens: 156000, contextWindowTokens: 200000, elapsedSeconds: 65 },
  writing: { status: 'streaming', statusDetail: 'revisingRelease', modelName: 'Claude Opus 4.1', contextUsedTokens: 186000, contextWindowTokens: 200000, elapsedSeconds: 88 },
}

// 「等待交互」的单一事实源:演示态为 waiting(与 ?s=empty / ?s=error 同一套开关)时,
// 这两个写作用户会话在等你拍板。会话列表的 status、确认请求、AgentRuntime 的 waiting 状态、
// 项目树里的 pending 芯片,全部由这一个谓词派生 —— 任一演示态下都不可能只出现其一。
const AWAITING_SESSION_IDS = ['knowledge', 'quarterly'] as const

// 会话状态的派生:种子给基础状态;演示态 waiting 时,两个写作用户会话被派生为 awaiting。
// 这是 status 字段的唯一计算点 —— mockSessions 与 isAwaitingSession 都从这里取。
function sessionStatusFor(sessionId: string, base: SessionStatus, demoState: AppRoute['demoState']): SessionStatus {
  if (demoState === 'waiting' && AWAITING_SESSION_IDS.some((id) => id === sessionId)) return 'awaiting'
  return base
}

// 「是否在等待交互」= 该会话此刻的状态为 awaiting。保留这层读取,让运行遥测 / 确认请求
// 与状态字段同源(不各自判断演示态)。
function isAwaitingSession(sessionId: string, demoState: AppRoute['demoState']): boolean {
  const seed = sessionSeeds.find((session) => session.id === sessionId)
  if (seed === undefined) return false
  return sessionStatusFor(sessionId, seed.status, demoState) === 'awaiting'
}

// 每个「等待交互」会话各有自己的确认请求与受影响文件(相对其项目根的路径);只此一处。
const confirmationSeeds: Record<(typeof AWAITING_SESSION_IDS)[number], { entryPath: string; summaryKey: 'summary' | 'quarterlySummary'; detailKey: 'detail' | 'quarterlyDetail' }> = {
  knowledge: { entryPath: 'release-notes.md', summaryKey: 'summary', detailKey: 'detail' },
  quarterly: { entryPath: 'release-plan.csv', summaryKey: 'quarterlySummary', detailKey: 'quarterlyDetail' },
}

// 遥测条最后一项表达**当前项目**(CLI 的 cwd)。项目不存在(未选项目)时回落空串。
// 运行态是否报 waiting 由**当前会话**是否处于 awaiting 决定 —— 会话与项目各管一段:
// 「正在看的这段对话在等你」才该让输入框上方的状态条说等待确认;别的会话在等你,
// 由对话切换器的图标 / 菜单表达(两个区域职责分明,不互相冒充)。
export function mockAgentRuntime(agentId: AgentId, projectId: string, demoState: AppRoute['demoState'], sessionId: string): AgentRuntime {
  const seed = runtimeSeeds[agentId]
  const project = projectStore[agentId].find((item) => item.id === projectId)
  const base: AgentRuntime = {
    agentId,
    ...seed,
    projectName: project?.name ?? '',
    projectPath: project?.path ?? '',
  }
  // 当前会话不在等待交互时一律不报 waiting;在等待时才覆盖状态并给出对应的具体动作。
  if (!isAwaitingSession(sessionId, demoState)) return base
  return { ...base, status: 'waiting', statusDetail: 'awaitingConfirm' }
}

// 只有处于等待交互的会话有确认请求;其余返回 undefined,由 API 层转成失败结果。
export function mockConfirmationRequest(sessionId: string, demoState: AppRoute['demoState']): ConfirmationRequest | undefined {
  if (demoState !== 'waiting') return undefined
  const awaitingId = AWAITING_SESSION_IDS.find((id) => id === sessionId)
  if (awaitingId === undefined) return undefined
  const seed = confirmationSeeds[awaitingId]
  return {
    id: `confirm-${awaitingId}`,
    summary: t.value.workspace.confirmation[seed.summaryKey],
    detail: t.value.workspace.confirmation[seed.detailKey],
    affectedFiles: [seed.entryPath],
  }
}

// ---- 会话搜索 ----

// 片段半径:命中处左右各保留的字符数(中文按字计,无需分词)。
const SNIPPET_RADIUS = 24

// 在正文里截取命中处的上下文片段:压平空白、命中词两侧各留一段,越出边界处加省略号。
function excerpt(body: string, needle: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  const index = flat.toLowerCase().indexOf(needle)
  if (index < 0) return flat.slice(0, SNIPPET_RADIUS * 2)
  const start = Math.max(0, index - SNIPPET_RADIUS)
  const end = Math.min(flat.length, index + needle.length + SNIPPET_RADIUS)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

// 会话搜索:在**当前项目**范围内同时匹配标题与消息正文,顺序与会话列表一致。
// 命中理由由判别联合的 reason 表达 —— 正文命中带具体轮次 id(可跳转并高亮),
// 标题命中没有轮次可跳。两种理由互斥,不用空串等魔法值编码。
export function mockSearchHits(query: string, projectId: string, demoState: AppRoute['demoState']): ConversationSearchHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const hits: ConversationSearchHit[] = []
  for (const session of mockSessions(demoState)) {
    if (session.projectId !== projectId) continue
    const message = mockTranscript(session.id).find((item) => item.body.toLowerCase().includes(needle))
    if (message) {
      hits.push({ reason: 'body', sessionId: session.id, title: session.title, snippet: excerpt(message.body, needle), turnId: message.id })
    } else if (session.title.toLowerCase().includes(needle)) {
      // 标题命中没有可截取的上下文片段:不再拿标题充当 snippet(那会让结果项里标题上下各出现
      // 一行)。判别联合里 snippet 只是正文变体的字段,这里自然不带。
      hits.push({ reason: 'title', sessionId: session.id, title: session.title })
    }
  }
  return hits
}
