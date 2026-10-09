// 类型化内存 API：演示延迟与业务失败均遵循 Result 约定。
import type { AgentId, ChatSession } from '../contracts/generated/chat-session'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { Project } from '../contracts/generated/project'
import type { ProjectEntry } from '../contracts/generated/project-entry'
import type { ProjectCandidate } from '../contracts/generated/project-candidate'
import type { AgentRuntime } from '../contracts/generated/agent-runtime'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { ConversationSearchHit } from '../contracts/generated/conversation-search-hit'
import { useI18n } from '../i18n'
import { currentRoute } from '../router'
import { delay } from '../mocks/delay'
import {
  mockAgentRuntime,
  mockAgents,
  mockCloseProject,
  mockConfirmationRequest,
  mockCreateSession,
  mockOpenProject,
  mockProjectCandidates,
  mockProjectTree,
  mockProjects,
  mockSaveResponse,
  mockSearchHits,
  mockSendMessage,
  mockSessions,
  mockTranscript,
} from '../mocks/workspace'
import type { Result } from './result'

const { t } = useI18n()

// 项目的会话列表:按 projectId 隔离,只返回归属该项目的会话。
export async function listSessions(projectId: string): Promise<Result<ChatSession[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  return { ok: true, value: mockSessions(demoState).filter((session) => session.projectId === projectId) }
}

export async function getTranscript(sessionId: string): Promise<Result<ChatMessage[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (!mockSessions(demoState).some((session) => session.id === sessionId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidSession) }
  }
  return { ok: true, value: mockTranscript(sessionId) }
}

export async function sendMessage(sessionId: string, text: string): Promise<Result<ChatMessage>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (!text.trim()) return { ok: false, error: new Error(t.value.workspace.emptyMessage) }
  if (!mockSessions(demoState).some((session) => session.id === sessionId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidSession) }
  }
  return { ok: true, value: mockSendMessage(sessionId, text.trim()) }
}

// 新会话必须归属某个项目;项目本身就挂在某个 Agent 上,故 agent 由项目反推 —— 调用方
// 只需给当前项目,不存在「归属 Agent 与归属项目对不上」的第二种可能。
export async function createSession(projectId: string): Promise<Result<ChatSession>> {
  await delay()
  if (!mockProjectTree(projectId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidProject) }
  }
  return { ok: true, value: mockCreateSession(projectId) }
}

export async function saveResponse(sessionId: string, response: ChatMessage): Promise<Result<ChatMessage>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (!mockSessions(demoState).some((session) => session.id === sessionId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidSession) }
  }
  mockSaveResponse(sessionId, response)
  return { ok: true, value: response }
}

// 列出某个 Agent 打开的项目(摘要:名称 / 路径 / 条目数;条目不随列表下发)。
export async function listProjects(agentId: AgentId): Promise<Result<Project[]>> {
  await delay()
  if (!mockAgents().some((agent) => agent.id === agentId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  }
  return { ok: true, value: mockProjects(agentId) }
}

// 取单个项目的条目树(扁平数组 + path)。目录内容随时可能变,故展开时按需取。
export async function getProjectTree(projectId: string): Promise<Result<ProjectEntry[]>> {
  await delay()
  const tree = mockProjectTree(projectId)
  if (tree === null) return { ok: false, error: new Error(t.value.workspace.invalidProject) }
  return { ok: true, value: tree }
}

// 列出 Agent Host 上检测到的候选目录(供「打开项目」选择)。演示不区分 Agent,同一份列表。
export async function listProjectCandidates(agentId: AgentId): Promise<Result<ProjectCandidate[]>> {
  await delay()
  if (!mockAgents().some((agent) => agent.id === agentId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  }
  return { ok: true, value: mockProjectCandidates() }
}

// 打开项目:按候选目录的 path 加入该 Agent 的项目列表(内存态)。
export async function openProject(agentId: AgentId, path: string): Promise<Result<Project>> {
  await delay()
  if (!mockProjectCandidates().some((candidate) => candidate.path === path)) {
    return { ok: false, error: new Error(t.value.workspace.unknownDirectory) }
  }
  return { ok: true, value: mockOpenProject(agentId, path) }
}

// 关闭项目:按 id 从列表移除(只动这一个)。
export async function closeProject(projectId: string): Promise<Result<string>> {
  await delay()
  if (!mockCloseProject(projectId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidProject) }
  }
  return { ok: true, value: projectId }
}

// 取某个 Agent 在**当前项目**下的运行遥测(状态 / 状态详情键 / 模型 / context 用量 / 时长 /
// 当前项目名与路径)。「等待确认」由**当前会话**的等待态驱动:该会话在其他项目 / 其他 Agent
// 下也在等你,但只有它成为当前会话时才让状态条说「等待确认」。演示态只在适配层读取一次并下发给
// mock —— API 对外签名仍保持与生产一致(不把 demoState 暴露成接口参数),mock 则是纯函数。
export async function getAgentRuntime(agentId: AgentId, projectId: string, sessionId: string): Promise<Result<AgentRuntime>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (!mockAgents().some((agent) => agent.id === agentId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  }
  return { ok: true, value: mockAgentRuntime(agentId, projectId, demoState, sessionId) }
}

// 取某个会话「等待交互」时 Agent 提请确认的动作;该会话不在等待态时返回失败结果。
export async function getConfirmationRequest(sessionId: string): Promise<Result<ConfirmationRequest>> {
  const demoState = currentRoute.value.demoState
  await delay()
  const request = mockConfirmationRequest(sessionId, demoState)
  if (!request) return { ok: false, error: new Error(t.value.workspace.noConfirmation) }
  return { ok: true, value: request }
}

// 会话搜索:在**当前项目**范围内匹配标题与消息正文,命中正文时给出可跳转的轮次与上下文片段。
export async function searchConversations(query: string, projectId: string): Promise<Result<ConversationSearchHit[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  return { ok: true, value: mockSearchHits(query, projectId, demoState) }
}
