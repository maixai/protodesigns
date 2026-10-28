// 类型化内存 API：演示延迟与业务失败均遵循 Result 约定。
import type { AgentId, ChatSession } from '../contracts/generated/chat-session'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentConfig } from '../contracts/generated/agent-config'
import type { ModelSource, ModelSubscription, ModelSubscriptionProviderId } from '../contracts/generated/agent-model-config'
import type { GatewayProbe } from '../contracts/generated/gateway-probe'
import type { MarketplaceBinding } from '../contracts/generated/marketplace-binding'
import type { InstalledPlugin, PluginInstallScopeId } from '../contracts/generated/installed-plugin'
import type { MarketplaceConfig } from '../contracts/generated/marketplace-config'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'

import type { ChatMessage } from '../contracts/generated/chat-message'
import type { Attachment } from '../contracts/generated/attachment'
import type { Project } from '../contracts/generated/project'
import type { Skill } from '../contracts/generated/skill'
import type { ProjectEntry } from '../contracts/generated/project-entry'
import type { ProjectCandidate } from '../contracts/generated/project-candidate'
import type { AgentRuntime } from '../contracts/generated/agent-runtime'
import type { AgentNotification } from '../contracts/generated/agent-notification'
import type { SystemNotification } from '../contracts/generated/system-notification'
import type { AgentSignal } from '../contracts/generated/agent-signal'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { ConversationSearchHit } from '../contracts/generated/conversation-search-hit'
import type { FileContent } from '../contracts/generated/file-content'
import { useI18n } from '../i18n'
import { currentRoute } from '../router'
import { delay } from '../mocks/delay'
import { EFFORT_LEVELS, activeGatewayOf, activeSubscriptionOf, modelsForSubscription, subscriptionIsReady, tierDefaultsForSource } from '../data/models'
import { mockFileContent } from '../mocks/files'
import {
  mockAgentNotifications,
  mockSystemNotifications,
  mockAgentRuntime,
  mockAgentSignals,
  mockAgentExists,
  mockAgentSummaries,
  mockConnectSubscription,
  mockCheckSubscription,
  mockReauthorizeSubscription,
  mockCreateAgent,
  mockDeleteAgent,
  mockProbeModelGateway,
  mockAddMarketplace,
  mockInstallPlugin,
  mockInstalledPlugins,
  mockMarketplaceBindings,
  mockRemoveMarketplace,
  mockSavePluginConfig,
  mockSetMarketplaceAutoUpdate,
  mockUpdateInstalledPlugin,
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
  mockProjectSkills,
  mockProjects,
  mockSaveResponse,
  mockSearchHits,
  mockSendMessage,
  mockSessions,
  mockTranscript,
} from '../mocks/workspace'
import type { Result } from './result'

import type { IdentityVault } from '../contracts/generated/identity-vault'
import type { DeviceUnlockCapability } from '../contracts/generated/device-unlock-capability'
import type { RecoveryKeyReveal } from '../contracts/generated/recovery-key-reveal'
import type { PairingSession } from '../contracts/generated/pairing-session'
import { readRecoveryKey, mockIdentityVault, mockUnlockIdentity, mockLockIdentity, mockResetIdentity, mockDeviceUnlockCapability, mockAddPasskey, mockRemovePasskey, mockRegenerateRecoveryKey } from '../mocks/identity'
import { mockInvalidateAgentTrust } from '../mocks/workspace'
import { mockReadPairing, mockCreatePairing, mockConnectPairingLink, mockSubmitPairingCode, mockRequestPairingApproval, mockAllowPairing, mockCancelPairing, mockConfirmPairing, mockRevokeAgent, mockExpirePairing } from '../mocks/pairing'

const { t } = useI18n()

export async function getIdentityVault(): Promise<Result<IdentityVault>> {
  await delay()
  return { ok: true, value: mockIdentityVault() }
}
export async function getDeviceUnlockCapability(): Promise<Result<DeviceUnlockCapability>> {
  await delay()
  return { ok: true, value: mockDeviceUnlockCapability() }
}
export async function addPasskey(): Promise<Result<IdentityVault>> {
  await delay(600)
  return { ok: true, value: mockAddPasskey() }
}
export async function removePasskey(id: string): Promise<Result<IdentityVault>> {
  await delay()
  const result = mockRemovePasskey(id)
  return result instanceof Error ? { ok: false, error: result } : { ok: true, value: result }
}
export async function regenerateRecoveryKey(): Promise<Result<RecoveryKeyReveal>> {
  await delay(600)
  return { ok: true, value: mockRegenerateRecoveryKey() }
}
export async function unlockIdentityVault(method: 'passkey' | 'recoveryKey', secret: string): Promise<Result<IdentityVault>> {
  await delay(750)
  const vault = mockIdentityVault()
  if (method === 'passkey' && !vault.passkeys.some((passkey) => passkey.canUnlock && passkey.prfSupported)) {
    return { ok: false, error: new Error(t.value.workspace.security.gate.prfUnsupported) }
  }
  if (method === 'recoveryKey' && (!vault.recoveryKeyConfigured || secret.trim() !== readRecoveryKey())) {
    return { ok: false, error: new Error(t.value.workspace.security.recoveryError) }
  }
  return { ok: true, value: mockUnlockIdentity() }
}
export async function lockIdentityVault(): Promise<Result<IdentityVault>> {
  await delay()
  return { ok: true, value: mockLockIdentity() }
}
export async function resetIdentity(): Promise<Result<IdentityVault>> {
  await delay()
  mockInvalidateAgentTrust()
  return { ok: true, value: mockResetIdentity() }
}
export async function createMockPairingSession(mode: 'new' | 'existing'): Promise<Result<PairingSession>> {
  await delay()
  return { ok: true, value: mockCreatePairing(mode) }
}
export async function getPairingSession(sessionId: string): Promise<Result<PairingSession>> {
  await delay()
  return mockReadPairing(sessionId)
}
export async function connectPairingLink(sessionId: string, secret: string): Promise<Result<PairingSession>> {
  await delay(900)
  return mockConnectPairingLink(sessionId, secret)
}
export async function submitPairingCode(sessionId: string, code: string): Promise<Result<PairingSession>> {
  await delay(900)
  return mockSubmitPairingCode(sessionId, code)
}
export async function requestPairingApproval(sessionId: string): Promise<Result<PairingSession>> {
  await delay(900)
  return mockRequestPairingApproval(sessionId)
}
export async function confirmPairing(sessionId: string, displayName: string, note: string): Promise<Result<AgentSummary>> {
  await delay()
  return mockConfirmPairing(sessionId, displayName, note)
}
export async function cancelPairing(sessionId: string): Promise<Result<PairingSession>> {
  await delay()
  return mockCancelPairing(sessionId)
}
export async function allowPairing(sessionId: string): Promise<Result<PairingSession>> {
  await delay()
  return mockAllowPairing(sessionId, true)
}
export async function denyPairing(sessionId: string): Promise<Result<PairingSession>> {
  await delay()
  return mockAllowPairing(sessionId, false)
}
export async function revokeAgent(agentId: AgentId): Promise<Result<AgentSummary>> {
  await delay()
  if (mockIdentityVault().state !== 'unlocked') return { ok: false, error: new Error(t.value.workspace.security.lockedError) }
  return mockRevokeAgent(agentId)
}
// 演示面板专用故障注入,不代表生产 API。
export async function expireMockPairing(sessionId: string, networkFailure = false): Promise<Result<PairingSession>> {
  await delay()
  return mockExpirePairing(sessionId, networkFailure)
}

// ---- Agent 身份 ----

// 全部 Agent 的摘要(名称 / 备注 / 模型 / 是否内置)。内置 Agent 的名称与备注随语言变化,
// 故调用方在切语言后重新取一次。
export async function listAgents(): Promise<Result<AgentSummary[]>> {
  await delay()
  return { ok: true, value: mockAgentSummaries() }
}

// 回退链约束与 Claude Code / TS SDK 对齐:最多 3 个、不可重复、不能包含主模型。
function invalidFallback(config: AgentConfig): boolean {
  const fallback = config.model.fallbackModelIds
  return fallback.length > 3
    || new Set(fallback).size !== fallback.length
    || fallback.includes(config.model.defaultModelId)
}

// 模型来源可用:当前订阅已连接且未过期,或当前 API 渠道存在且填了地址与密钥。
// 测试连接成功不是解锁条件 —— 离线 / 内网网关仍然应该允许配置模型。
function sourceReady(source: ModelSource): boolean {
  const subscription = activeSubscriptionOf(source)
  if (subscription !== undefined) return subscriptionIsReady(subscription)
  const gateway = activeGatewayOf(source)
  return gateway !== undefined && gateway.baseUrl.trim() !== '' && gateway.apiKeySet
}

// 当前来源提供的模型集合:订阅按服务商给目录,API 渠道给它自己的模型列表。
function sourceModelIds(source: ModelSource): Set<string> {
  const subscription = activeSubscriptionOf(source)
  if (subscription !== undefined) {
    return new Set(modelsForSubscription(subscription.provider).map((model) => model.id))
  }
  return new Set(activeGatewayOf(source)?.models ?? [])
}

// 已配置的模型必须来自当前来源;切换来源后残留的旧模型视为无效,阻止写回。
// 空串档位会解析到该来源的内置默认模型,同样纳入校验。
const TIER_IDS = ['fable', 'opus', 'sonnet', 'haiku'] as const
function invalidSourceModels(config: AgentConfig): boolean {
  const available = sourceModelIds(config.model.source)
  const defaults = tierDefaultsForSource(config.model.source)
  const ids = [
    config.model.defaultModelId,
    config.model.subagentModelId,
    ...config.model.fallbackModelIds,
    ...TIER_IDS.map((tierId) => config.model.tiers[tierId].modelId || defaults[tierId]),
  ]
  return ids.some((id) => id !== '' && !available.has(id))
}

const EFFORT_VALUES = new Set<string>(['', ...EFFORT_LEVELS])

// 思考强度:主对话、子 Agent 默认、每个档位都必须是 SDK 接受的值或空串。
function invalidEffort(config: AgentConfig): boolean {
  const levels = [
    config.model.defaultEffortLevel,
    config.model.subagentEffortLevel,
    ...Object.values(config.model.tiers).map((tier) => tier.effortLevel),
  ]
  return levels.some((level) => !EFFORT_VALUES.has(level))
}

// 自动压缩窗口:0 = 跟随模型;否则官方范围是 100K–1M tokens。
function invalidCompactWindow(tokens: number): boolean {
  return tokens !== 0 && (tokens < 100_000 || tokens > 1_000_000)
}

// 思考预算:0 = 自动;固定值不得低于官方下限 1024 tokens。
function invalidThinkingBudget(tokens: number): boolean {
  return tokens !== 0 && tokens < 1024
}

export async function createAgent(config: AgentConfig): Promise<Result<AgentSummary>> {
  await delay()
  if (!config.name.trim()) return { ok: false, error: new Error(t.value.workspace.agentAdmin.nameRequired) }
  if (!sourceReady(config.model.source)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.sourceRequired) }
  if (config.model.defaultModelId.trim() === '') return { ok: false, error: new Error(t.value.workspace.agentAdmin.modelRequired) }
  if (invalidSourceModels(config)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.modelUnavailable) }
  if (invalidFallback(config)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.fallbackInvalid) }
  if (invalidEffort(config)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.effortInvalid) }
  if (invalidCompactWindow(config.model.autoCompactWindowTokens)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.compactWindowInvalid) }
  if (invalidThinkingBudget(config.model.maxThinkingTokens)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.thinkingBudgetInvalid) }
  return { ok: true, value: mockCreateAgent(config) }
}

export async function updateAgent(agentId: AgentId, config: AgentConfig): Promise<Result<AgentSummary>> {
  await delay()
  if (!config.name.trim()) return { ok: false, error: new Error(t.value.workspace.agentAdmin.nameRequired) }
  if (!sourceReady(config.model.source)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.sourceRequired) }
  if (config.model.defaultModelId.trim() === '') return { ok: false, error: new Error(t.value.workspace.agentAdmin.modelRequired) }
  if (invalidSourceModels(config)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.modelUnavailable) }
  if (invalidFallback(config)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.fallbackInvalid) }
  if (invalidEffort(config)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.effortInvalid) }
  if (invalidCompactWindow(config.model.autoCompactWindowTokens)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.compactWindowInvalid) }
  if (invalidThinkingBudget(config.model.maxThinkingTokens)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.thinkingBudgetInvalid) }
  const updated = mockUpdateAgent(agentId, config)
  if (updated === null) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  return { ok: true, value: updated }
}

// 模拟浏览器授权往返;凭据只以系统钥匙串引用返回,不向界面暴露 token。
export async function authorizeSubscription(provider: ModelSubscriptionProviderId, existing: ModelSubscription[]): Promise<Result<ModelSubscription>> {
  await delay(1200)
  return { ok: true, value: mockConnectSubscription(provider, existing) }
}

export async function checkSubscription(subscription: ModelSubscription): Promise<Result<ModelSubscription>> {
  await delay()
  return { ok: true, value: mockCheckSubscription(subscription) }
}

export async function reauthorizeSubscription(subscription: ModelSubscription): Promise<Result<ModelSubscription>> {
  await delay(1200)
  return { ok: true, value: mockReauthorizeSubscription(subscription) }
}

// 网关探测:一次请求同时验证凭据/地址并取回模型列表。
// 成功只代表列表可取,不代表每个模型都能完成对话。
export async function probeModelGateway(baseUrl: string, modelsUrl: string): Promise<Result<GatewayProbe>> {
  await delay()
  return { ok: true, value: mockProbeModelGateway(baseUrl, modelsUrl) }
}

// 删除 Agent:它的项目连接、对话与插件配置一并移除。至少保留一个 Agent —— 没有 Agent
// 就没有可用的工作台,故最后一个的删除请求直接失败。
export async function deleteAgent(agentId: AgentId): Promise<Result<AgentId>> {
  await delay()
  if (!mockAgentExists(agentId)) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  if (!mockDeleteAgent(agentId)) return { ok: false, error: new Error(t.value.workspace.agentAdmin.lastAgent) }
  return { ok: true, value: agentId }
}

// ---- 插件与插件市场 ----
//
// 插件与市场都按作用域隔离:Agent 的会话配置 / 项目的 settings 各自注册市场、各自启停插件。
// 市场目录(来源与插件元数据)可以共享,但自动更新与安装态属于这次注册。

export async function listMarketplaceBindings(scope: PluginInstallScopeId, ownerId: string): Promise<Result<MarketplaceBinding[]>> {
  await delay()
  const bindings = mockMarketplaceBindings(scope, ownerId)
  if (bindings === null) {
    return { ok: false, error: new Error(scope === 'agent' ? t.value.workspace.invalidAgent : t.value.workspace.invalidProject) }
  }
  return { ok: true, value: bindings }
}

export async function addMarketplace(scope: PluginInstallScopeId, ownerId: string, config: MarketplaceConfig): Promise<Result<MarketplaceBinding>> {
  await delay()
  if (!config.name.trim() || !config.source.trim()) return { ok: false, error: new Error(t.value.workspace.plugins.marketplaceRequired) }
  const binding = mockAddMarketplace(scope, ownerId, config)
  if (binding === null) return { ok: false, error: new Error(t.value.workspace.plugins.marketplaceExists) }
  return { ok: true, value: binding }
}

export async function removeMarketplace(scope: PluginInstallScopeId, ownerId: string, marketplaceId: string): Promise<Result<string>> {
  await delay()
  if (!mockRemoveMarketplace(scope, ownerId, marketplaceId)) {
    return { ok: false, error: new Error(t.value.workspace.plugins.invalidMarketplace) }
  }
  return { ok: true, value: marketplaceId }
}

// 自动更新属于**这次注册**:只影响当前 Agent / 项目的已装插件。
export async function setMarketplaceAutoUpdate(
  scope: PluginInstallScopeId,
  ownerId: string,
  marketplaceId: string,
  autoUpdate: boolean,
): Promise<Result<MarketplaceBinding>> {
  await delay()
  const binding = mockSetMarketplaceAutoUpdate(scope, ownerId, marketplaceId, autoUpdate)
  if (binding === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidMarketplace) }
  return { ok: true, value: binding }
}

// 手动更新市场:仅当自动更新关闭时由界面提供。共享目录的补丁版本 +1,当前作用域随之更新。
export async function updateMarketplace(
  scope: PluginInstallScopeId,
  ownerId: string,
  marketplaceId: string,
): Promise<Result<MarketplaceBinding>> {
  await delay()
  const binding = mockUpdateMarketplace(scope, ownerId, marketplaceId)
  if (binding === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidMarketplace) }
  return { ok: true, value: binding }
}

// 某个 Agent / 项目里的已安装插件。scope 决定归属,ownerId 是 Agent id 或项目路径。
export async function listInstalledPlugins(scope: PluginInstallScopeId, ownerId: string): Promise<Result<InstalledPlugin[]>> {
  await delay()
  const installed = mockInstalledPlugins(scope, ownerId)
  if (installed === null) {
    return { ok: false, error: new Error(scope === 'agent' ? t.value.workspace.invalidAgent : t.value.workspace.invalidProject) }
  }
  return { ok: true, value: installed }
}

export async function installPlugin(scope: PluginInstallScopeId, ownerId: string, marketplaceId: string, pluginId: string): Promise<Result<InstalledPlugin>> {
  await delay()
  const installed = mockInstallPlugin(scope, ownerId, marketplaceId, pluginId)
  if (installed === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  return { ok: true, value: installed }
}

export async function uninstallPlugin(scope: PluginInstallScopeId, ownerId: string, marketplaceId: string, pluginId: string): Promise<Result<string>> {
  await delay()
  if (!mockUninstallPlugin(scope, ownerId, marketplaceId, pluginId)) {
    return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  }
  return { ok: true, value: pluginId }
}

export async function setPluginEnabled(scope: PluginInstallScopeId, ownerId: string, marketplaceId: string, pluginId: string, enabled: boolean): Promise<Result<InstalledPlugin>> {
  await delay()
  const installed = mockSetPluginEnabled(scope, ownerId, marketplaceId, pluginId, enabled)
  if (installed === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  return { ok: true, value: installed }
}

// 单个插件的手动更新:只更新这一份安装,不改变市场策略。
export async function updateInstalledPlugin(
  scope: PluginInstallScopeId,
  ownerId: string,
  marketplaceId: string,
  pluginId: string,
): Promise<Result<InstalledPlugin>> {
  await delay()
  const installed = mockUpdateInstalledPlugin(scope, ownerId, marketplaceId, pluginId)
  if (installed === null) return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  return { ok: true, value: installed }
}

// 保存插件配置:secret 留空 = 保持原值;必填项仍为空时返回失败。
export async function savePluginConfig(
  scope: PluginInstallScopeId,
  ownerId: string,
  marketplaceId: string,
  pluginId: string,
  values: readonly PluginConfigValue[],
): Promise<Result<InstalledPlugin>> {
  await delay()
  const result = mockSavePluginConfig(scope, ownerId, marketplaceId, pluginId, values)
  if (result.status === 'missing') return { ok: false, error: new Error(t.value.workspace.plugins.invalidPlugin) }
  if (result.status === 'invalid') return { ok: false, error: new Error(t.value.workspace.plugins.configRequired) }
  return { ok: true, value: result.installed }
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

// 可用 Skill = 项目目录 + 当前 Agent 已启用插件,演示失败仍走 Result。
export async function listProjectSkills(projectId: string): Promise<Result<Skill[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (demoState === 'error') return { ok: false, error: new Error(t.value.workspace.skills.error) }
  if (mockProjectTree(projectId) === null) return { ok: false, error: new Error(t.value.workspace.invalidProject) }
  return { ok: true, value: mockProjectSkills(projectId) }
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

export async function listSystemNotifications(seenIds: readonly string[]): Promise<Result<SystemNotification[]>> {
  const demoState = currentRoute.value.demoState
  await delay()
  if (demoState === 'error') return { ok: false, error: new Error(t.value.workspace.notifications.error) }
  return { ok: true, value: mockSystemNotifications(demoState, seenIds) }
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
