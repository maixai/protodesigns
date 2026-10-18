// 类型化内存 API：演示延迟与业务失败均遵循 Result 约定。
import type { AgentId, ChatSession } from '../contracts/generated/chat-session'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentConfig } from '../contracts/generated/agent-config'
import type { Marketplace } from '../contracts/generated/marketplace'
import type { MarketplaceConfig } from '../contracts/generated/marketplace-config'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'

import type { ChatMessage } from '../contracts/generated/chat-message'
import type { Attachment } from '../contracts/generated/attachment'
import type { Project } from '../contracts/generated/project'
import type { ProjectEntry } from '../contracts/generated/project-entry'
import type { ProjectCandidate } from '../contracts/generated/project-candidate'
import type { AgentRuntime } from '../contracts/generated/agent-runtime'
import type { AgentNotification } from '../contracts/generated/agent-notification'
import type { AgentSignal } from '../contracts/generated/agent-signal'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { ConversationSearchHit } from '../contracts/generated/conversation-search-hit'
import type { FileContent } from '../contracts/generated/file-content'
import { useI18n } from '../i18n'
import { currentRoute } from '../router'
import { delay } from '../mocks/delay'
import { mockFileContent } from '../mocks/files'
import {
  mockAgentNotifications,
  mockAgentRuntime,
  mockAgentSignals,
  mockAgentExists,
  mockAgentSummaries,
  mockCreateAgent,
  mockDeleteAgent,
  mockAddMarketplace,
  mockInstallPlugin,
  mockMarketplaces,
  mockRemoveMarketplace,
  mockSavePluginConfig,
  mockSetMarketplaceAutoUpdate,
  mockUpdateMarketplace,
  mockSetPluginEnabled,
  mockUninstallPlugin,
  mockUpdateAgent,
  mockCloseProject,
  mockConfirmationRequest,
  mockCreateSession,
  mockOpenProject,
  mockProjectCandidates,
  mockProjectIdsOf,
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

// ---- Agent 身份 ----

// 全部 Agent 的摘要(名称 / 角色 / 模型 / 是否内置)。内置 Agent 的名称与角色随语言变化,
// 故调用方在切语言后重新取一次。
export async function listAgents(): Promise<Result<AgentSummary[]>> {
  await delay()
  return { ok: true, value: mockAgentSummaries() }
}

export async function createAgent(config: AgentConfig): Promise<Result<AgentSummary>> {
  await delay()
  if (!config.name.trim()) return { ok: false, error: new Error(t.value.workspace.agentAdmin.nameRequired) }
  if (!config.role.trim()) return { ok: false, error: new Error(t.value.workspace.agentAdmin.roleRequired) }
  return { ok: true, value: mockCreateAgent(config) }
}

export async function updateAgent(agentId: AgentId, config: AgentConfig): Promise<Result<AgentSummary>> {
  await delay()
  if (!config.name.trim()) return { ok: false, error: new Error(t.value.workspace.agentAdmin.nameRequired) }
  if (!config.role.trim()) return { ok: false, error: new Error(t.value.workspace.agentAdmin.roleRequired) }
  const updated = mockUpdateAgent(agentId, config)
  if (updated === null) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  return { ok: true, value: updated }
}

// 删除 Agent:它的项目连接、对话与插件配置一并移除。至少保留一个 Agent —— 没有 Agent
// 就没有可用的工作台,故最后一个的删除请求直接失败。
export async function deleteAgent(agentId: AgentId): Promise<Result<AgentId>> {
  await delay()
  if (!mockAgentExists(agentId)) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  if (!mockDeleteAgent(agentId)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.lastAgent) }
  return { ok: true, value: agentId }
}

// ---- 插件与插件市场(按 Agent 隔离)----

// 市场与它名下的插件一起返回:归属关系由数据结构表达,调用方不需要自己拼。
export async function listMarketplaces(agentId: AgentId): Promise<Result<Marketplace[]>> {
  await delay()
  const marketplaces = mockMarketplaces(agentId)
  if (marketplaces === null) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  return { ok: true, value: marketplaces }
}

// 安装状态变化后返回**整个市场**:插件在「已安装 / 可安装」两组间移动、计数也随之一并更新。
export async function installPlugin(agentId: AgentId, marketplaceId: string, pluginId: string): Promise<Result<Marketplace>> {
  await delay()
  const marketplace = mockInstallPlugin(agentId, marketplaceId, pluginId)
  if (marketplace === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  return { ok: true, value: marketplace }
}

export async function uninstallPlugin(agentId: AgentId, marketplaceId: string, pluginId: string): Promise<Result<Marketplace>> {
  await delay()
  const marketplace = mockUninstallPlugin(agentId, marketplaceId, pluginId)
  if (marketplace === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  return { ok: true, value: marketplace }
}

export async function setPluginEnabled(agentId: AgentId, marketplaceId: string, pluginId: string, enabled: boolean): Promise<Result<Marketplace>> {
  await delay()
  const marketplace = mockSetPluginEnabled(agentId, marketplaceId, pluginId, enabled)
  if (marketplace === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  return { ok: true, value: marketplace }
}

// 自动更新属于市场:改一次,该市场下所有插件继承新的更新方式。
export async function setMarketplaceAutoUpdate(agentId: AgentId, marketplaceId: string, autoUpdate: boolean): Promise<Result<Marketplace>> {
  await delay()
  const marketplace = mockSetMarketplaceAutoUpdate(agentId, marketplaceId, autoUpdate)
  if (marketplace === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  return { ok: true, value: marketplace }
}

// 手动更新市场:仅当自动更新关闭时由界面提供。已安装插件会前进一个补丁版本。
export async function updateMarketplace(agentId: AgentId, marketplaceId: string): Promise<Result<Marketplace>> {
  await delay()
  const marketplace = mockUpdateMarketplace(agentId, marketplaceId)
  if (marketplace === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidMarketplace) }
  return { ok: true, value: marketplace }
}

// 添加 / 移除市场:两者都只影响当前 Agent 的市场副本。
export async function addMarketplace(agentId: AgentId, config: MarketplaceConfig): Promise<Result<Marketplace>> {
  await delay()
  if (!mockAgentExists(agentId)) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  if (!config.name.trim() || !config.source.trim()) return { ok: false, error: new Error(t.value.workspace.plugins.marketplaceRequired) }
  const marketplace = mockAddMarketplace(agentId, config)
  if (marketplace === null) return { ok: false, error: new Error(t.value.workspace.plugins.marketplaceExists) }
  return { ok: true, value: marketplace }
}

export async function removeMarketplace(agentId: AgentId, marketplaceId: string): Promise<Result<string>> {
  await delay()
  if (!mockRemoveMarketplace(agentId, marketplaceId)) {
    return { ok: false, error: new Error(t.value.workspace.plugins.invalidMarketplace) }
  }
  return { ok: true, value: marketplaceId }
}

// 保存插件配置:返回整个市场,插件行上的「需配置」状态随之更新。
// secret 留空 = 保持原值;必填项仍为空时返回失败。
export async function savePluginConfig(
  agentId: AgentId,
  marketplaceId: string,
  pluginId: string,
  values: readonly PluginConfigValue[],
): Promise<Result<Marketplace>> {
  await delay()
  const result = mockSavePluginConfig(agentId, marketplaceId, pluginId, values)
  if (result.status === 'missing') return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  if (result.status === 'invalid') return { ok: false, error: new Error(t.value.workspace.plugins.configRequired) }
  return { ok: true, value: result.marketplace }
}

// 某个 Agent 下的会话列表:返回它**当前已打开的全部项目**里的会话。
// 平权之后没有「当前项目」,同一个 Agent 的不同项目并行推进,故按 Agent 装载而不是按单个项目 ——
// 否则别的项目的会话根本不在列表里,会话标题 / 助手名对它们查不到,切换器的按项目分组也无从派生。
export async function listSessions(agentId: AgentId): Promise<Result<ChatSession[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  const openIds = new Set(mockProjectIdsOf(agentId))
  return { ok: true, value: mockSessions(demoState).filter((session) => openIds.has(session.projectId)) }
}

export async function getTranscript(sessionId: string): Promise<Result<ChatMessage[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (!mockSessions(demoState).some((session) => session.id === sessionId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidSession) }
  }
  return { ok: true, value: mockTranscript(sessionId) }
}

// 发送一轮消息。text 是用户敲进输入框的正文;attachments 是本轮随消息带出的附件
// (项目文件路径 / 图片名称与类型 / 粘贴文本的**全文**)—— 附件既属消息、也是「这一轮要计入
// 携带信息」的声明,故与正文一并下发,mock 会把它们挂到那一条用户消息上。
export async function sendMessage(sessionId: string, text: string, attachments: Attachment[]): Promise<Result<ChatMessage>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (!text.trim()) return { ok: false, error: new Error(t.value.workspace.emptyMessage) }
  if (!mockSessions(demoState).some((session) => session.id === sessionId)) {
    return { ok: false, error: new Error(t.value.workspace.invalidSession) }
  }
  return { ok: true, value: mockSendMessage(sessionId, text.trim(), attachments) }
}

// 新会话必须归属某个项目;项目本身就挂在某个 Agent 上,故 agent 由项目反推 —— 调用方
// 只需给出**归属项目**,不存在「归属 Agent 与归属项目对不上」的第二种可能。
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
  if (!mockAgentExists(agentId)) {
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
  if (!mockAgentExists(agentId)) {
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

// 列出 Agent 级的「需要你处理」信号:每个 Agent 名下、尚未被点开看过的「等待交互」与
// 「响应完成」会话各有多少条 —— Agent 栏据此在标签上挂 Badge(两类并存取更紧急的等待交互)。
// seenSessionIds 是调用方持有的**视图状态**(哪几段对话已经在它等待 / 完成期间被打开过);
// 它是客户端才知道的事实,故由调用方传入、在此从计数里排除 —— 与 tab 上的状态 Badge 共用
// 同一份「已看过」集合,两处不会各说各话。
export async function listAgentSignals(seenSessionIds: readonly string[]): Promise<Result<AgentSignal[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  return { ok: true, value: mockAgentSignals(demoState, seenSessionIds) }
}

export async function listAgentNotifications(seenSessionIds: readonly string[]): Promise<Result<AgentNotification[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (demoState === 'error') return { ok: false, error: new Error(t.value.workspace.notifications.error) }
  return { ok: true, value: mockAgentNotifications(demoState, seenSessionIds) }
}

// 取某个 Agent 在**该会话所属项目**下的运行遥测(状态 / 状态详情键 / 模型 / context 用量 / 时长 /
// 项目名与路径)。「等待确认」由**当前会话**的等待态驱动:该会话在其他项目 / 其他 Agent
// 下也在等你,但只有它成为当前会话时才让状态条说「等待确认」。演示态只在适配层读取一次并下发给
// mock —— API 对外签名仍保持与生产一致(不把 demoState 暴露成接口参数),mock 则是纯函数。
export async function getAgentRuntime(agentId: AgentId, projectId: string, sessionId: string): Promise<Result<AgentRuntime>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (!mockAgentExists(agentId)) {
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

// 会话搜索:在当前 Agent 已装载的全部会话里匹配标题与消息正文,命中正文时给出可跳转的轮次与上下文片段。
export async function searchConversations(query: string): Promise<Result<ConversationSearchHit[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  return { ok: true, value: mockSearchHits(query, demoState) }
}

// 取一份文件内容(供文件面板渲染)。文件在会话里的状态(新建 / 已改 / 待确认)不在这里下发 ——
// 它与文件树的芯片同源,由载体按同一条派生规则计算,避免两个事实源对不上。
// confirmationId 指向**当前会话**的确认请求:待确认文件的「允许 / 拒绝」因此与转录里的确认卡
// 作用于同一个 ConfirmationRequest。
export async function getFileContent(projectId: string, path: string, sessionId: string): Promise<Result<FileContent>> {
  const demoState = currentRoute.value.demoState
  await delay()
  // 演示态 error(与转录 / 项目列表同一套开关)让文件面板的 error 态可被直接寻址。
  if (demoState === 'error') return { ok: false, error: new Error(t.value.workspace.fileError) }
  const tree = mockProjectTree(projectId)
  if (tree === null) return { ok: false, error: new Error(t.value.workspace.invalidProject) }
  if (!tree.some((entry) => entry.path === path)) return { ok: false, error: new Error(t.value.workspace.fileNotFound) }
  const request = mockConfirmationRequest(sessionId, demoState)
  const base = mockFileContent(projectId, path)
  const confirmationId = request !== undefined && request.affectedFiles.includes(path) ? request.id : ''
  return { ok: true, value: { ...base, confirmationId } }
}
