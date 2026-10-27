// 演示结构与内存数据；展示文案从当前语言词条组装，刷新即重置。
import type { AgentId, ChatSession, SessionStatus } from '../contracts/generated/chat-session'
import type { AgentSummary, AgentIdentity } from '../contracts/generated/agent-summary'
import { mockAgentIdentity } from './identity'
import type { AgentConfig } from '../contracts/generated/agent-config'
import type { AgentModelConfig } from '../contracts/generated/agent-model-config'
import type { ModelSubscription, ModelSubscriptionProviderId } from '../contracts/generated/agent-model-config'
import type { GatewayProbe } from '../contracts/generated/gateway-probe'
import type { PluginComponentId } from '../contracts/generated/plugin'
import type { InstalledPlugin, PluginConfigTypeId } from '../contracts/generated/installed-plugin'
import type { Marketplace, PluginTrustId } from '../contracts/generated/marketplace'
import type { MarketplaceBinding } from '../contracts/generated/marketplace-binding'
import type { PluginConfigField } from '../contracts/generated/installed-plugin'
import type { MarketplaceConfig } from '../contracts/generated/marketplace-config'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'
import type { ChatMessage } from '../contracts/generated/chat-message'
import type { Attachment } from '../contracts/generated/attachment'
import type { AgentNotification } from '../contracts/generated/agent-notification'
import type { SystemNotification } from '../contracts/generated/system-notification'
import type { AgentSignal } from '../contracts/generated/agent-signal'
import type { Project } from '../contracts/generated/project'
import type { Skill } from '../contracts/generated/skill'
import type { ProjectEntry } from '../contracts/generated/project-entry'
import type { ProjectCandidate } from '../contracts/generated/project-candidate'
import type { AgentRuntime } from '../contracts/generated/agent-runtime'
import type { ConfirmationRequest } from '../contracts/generated/confirmation-request'
import type { ConversationSearchHit } from '../contracts/generated/conversation-search-hit'
import type { AppRoute } from '../contracts/generated/app-route'
import type { Messages } from '../i18n'
import { useI18n } from '../i18n'
import { DEFAULT_MODEL, defaultModelSource, modelById, subscriptionIsReady } from '../data/models'

const { t } = useI18n()

// ---- Agent 身份 ----
//
// Agent 可以在运行时新建 / 删除,故身份表是可变数组,而不是编译期常量。
// 内置 Agent 的名称与备注按当前语言解析(切语言时由 API 重新取一次);用户创建或改过的
// Agent 存最终文案 —— 用户输入的内容不该被界面语言改写。
interface AgentSeed {
  id: AgentId
  name?: string
  note?: string
  nameKey?: keyof Messages['workspace']['agents']
  noteKey?: keyof Messages['workspace']['agentNotes']
  model: AgentModelConfig
  builtIn: boolean
  identity: AgentIdentity
}

// 模型来源:默认用已连接的 Claude 订阅;网关配置同时保留,便于在对话框里显式切换。
// 订阅与网关在运行时互斥,同一时刻只有 kind 指向的那个来源生效。
export function defaultAgentModelConfig(): AgentModelConfig {
  return {
    source: defaultModelSource(),
    defaultModelId: DEFAULT_MODEL.id,
    defaultEffortLevel: '',
    subagentModelId: '',
    subagentEffortLevel: '',
    tiers: {
      fable: { modelId: '', effortLevel: 'high' },
      opus: { modelId: '', effortLevel: 'high' },
      sonnet: { modelId: '', effortLevel: 'high' },
      haiku: { modelId: '', effortLevel: 'high' },
    },
    fallbackModelIds: [],
    autoCompactWindowTokens: 0,
    maxThinkingTokens: 0,
  }
}

// 档位是嵌套对象、回退是数组、来源含网关列表:读写都深拷贝,避免列表与对话框共享引用。
function cloneModelConfig(config: AgentModelConfig): AgentModelConfig {
  return {
    ...config,
    source: {
      ...config.source,
      subscriptions: config.source.subscriptions.map((subscription) => ({ ...subscription, usage: { ...subscription.usage } })),
      gateways: config.source.gateways.map((gateway) => ({ ...gateway, models: [...gateway.models] })),
    },
    tiers: {
      fable: { ...config.tiers.fable },
      opus: { ...config.tiers.opus },
      sonnet: { ...config.tiers.sonnet },
      haiku: { ...config.tiers.haiku },
    },
    fallbackModelIds: [...config.fallbackModelIds],
  }
}

// 新订阅使用独立的演示身份与钥匙串引用,不执行真实 OAuth。
const SUBSCRIPTION_PLANS: Record<ModelSubscriptionProviderId, string> = {
  claude: 'Claude Max',
  chatgpt: 'ChatGPT Plus',
}

let subscriptionSequence = 0

export function mockConnectSubscription(provider: ModelSubscriptionProviderId, existing: ModelSubscription[]): ModelSubscription {
  const providerSubscriptions = existing.filter((item) => item.provider === provider)
  const labels = new Set(providerSubscriptions.map((item) => item.label))
  let accountNumber = providerSubscriptions.length + 1
  // 删除账户后数量会回退,仍须跳过保留实例已占用的名称。
  while (labels.has(`账户 ${accountNumber}`)) accountNumber += 1
  subscriptionSequence += 1
  while (existing.some((item) => item.id === `${provider}-account-${subscriptionSequence}`)) subscriptionSequence += 1
  const id = `${provider}-account-${subscriptionSequence}`
  return {
    id, provider,
    label: `账户 ${accountNumber}`,
    connected: true,
    account: `yizhou.${provider}.${subscriptionSequence}@example.com`,
    plan: SUBSCRIPTION_PLANS[provider],
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    status: 'ok',
    usage: { state: 'ok', usedPercent: 5 + subscriptionSequence % 26, resetsAt: new Date(Date.now() + 5 * 3_600_000).toISOString() },
    credentialRef: `keychain://mia/subscriptions/${id}`,
  }
}

// 检查不会替换账户身份,也不会绕过过期或失效的授权;正常检查仅小幅增加用量。
export function mockCheckSubscription(subscription: ModelSubscription): ModelSubscription {
  if (!subscriptionIsReady(subscription) || subscription.status === 'error' || subscription.credentialRef === '') {
    return { ...subscription, connected: false, status: subscription.status === 'expired' ? 'expired' : 'error', credentialRef: '', usage: { state: 'unknown', usedPercent: -1, resetsAt: '' } }
  }
  const usedPercent = subscription.usage.usedPercent < 0 ? -1 : Math.min(100, subscription.usage.usedPercent + 2)
  return {
    ...subscription, connected: true, status: 'ok',
    usage: { ...subscription.usage, usedPercent, state: usedPercent < 0 ? 'unknown' : usedPercent >= 100 ? 'exhausted' : usedPercent >= 80 ? 'warning' : 'ok' },
  }
}

// 重新授权只更新同一个实例的凭据,不会额外创建来源或重置真实已知的额度。
export function mockReauthorizeSubscription(subscription: ModelSubscription): ModelSubscription {
  return {
    ...subscription, connected: true, status: 'ok',
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    credentialRef: `keychain://mia/subscriptions/${subscription.id}`,
    usage: subscription.usage.state === 'unknown'
      ? { state: 'ok', usedPercent: 8, resetsAt: new Date(Date.now() + 5 * 3_600_000).toISOString() }
      : { ...subscription.usage },
  }
}

// 网关探测:合法地址返回成功并带回模型列表;地址含 invalid 时模拟 401。
export function mockProbeModelGateway(baseUrl: string, modelsUrl: string): GatewayProbe {
  const latencyMs = 120 + Math.floor(Math.random() * 300)
  if (baseUrl.toLowerCase().includes('invalid')) {
    return { connected: false, models: [], latencyMs, statusCode: 401, message: t.value.workspace.agentAdmin.probeUnauthorized }
  }
  if (modelsUrl !== '' && !/^https?:\/\//i.test(modelsUrl)) {
    return { connected: false, models: [], latencyMs, statusCode: 0, message: t.value.workspace.agentAdmin.probeFailed }
  }
  return { connected: true, models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], latencyMs, statusCode: 200, message: t.value.workspace.agentAdmin.probeSuccess }
}

const agentStore: AgentSeed[] = [
  { id: 'planning', nameKey: 'planning', noteKey: 'planning', model: defaultAgentModelConfig(), builtIn: true, identity: mockAgentIdentity('planning') },
  { id: 'research', nameKey: 'research', noteKey: 'research', model: defaultAgentModelConfig(), builtIn: true, identity: mockAgentIdentity('research', '研究工作站', 'Ubuntu 24.04 · Mia Headless') },
  {
    id: 'writing',
    identity: mockAgentIdentity('writing', '写作笔记本', 'Windows 11 · Mia Desktop'),
    nameKey: 'writing',
    noteKey: 'writing',
    // 写作助手刻意给一组非默认值,让「档位映射 / 思考强度 / 回退 / 自动压缩」都有实物可看。
    model: {
      source: defaultModelSource(),
      defaultModelId: 'claude-opus-5-5',
      defaultEffortLevel: 'high',
      subagentModelId: 'claude-sonnet-5-5',
      subagentEffortLevel: 'medium',
      tiers: {
        fable: { modelId: '', effortLevel: 'high' },
        opus: { modelId: '', effortLevel: 'high' },
        sonnet: { modelId: 'claude-sonnet-5-5-1m', effortLevel: 'high' },
        haiku: { modelId: '', effortLevel: 'low' },
      },
      fallbackModelIds: ['claude-sonnet-5-5', 'claude-haiku-5-5'],
      autoCompactWindowTokens: 500_000,
      maxThinkingTokens: 0,
    },
    builtIn: true,
  },
]
let agentSequence = 0

function summaryOf(seed: AgentSeed): AgentSummary {
  return {
    id: seed.id,
    name: seed.nameKey !== undefined ? t.value.workspace.agents[seed.nameKey] : (seed.name ?? ''),
    note: seed.noteKey !== undefined ? t.value.workspace.agentNotes[seed.noteKey] : (seed.note ?? ''),
    model: cloneModelConfig(seed.model),
    builtIn: seed.builtIn,
    identity: { ...seed.identity },
  }
}

export function mockAgentIds(): AgentId[] {
  return agentStore.map((seed) => seed.id)
}

export function mockAgentSummaries(): AgentSummary[] {
  return agentStore.map(summaryOf)
}

export function mockAgentExists(agentId: AgentId): boolean {
  return agentStore.some((seed) => seed.id === agentId)
}

export function mockCreateAgent(config: AgentConfig): AgentSummary {
  agentSequence += 1
  const seed: AgentSeed = {
    id: `agent-${agentSequence}`,
    name: config.name.trim(),
    note: config.note.trim(),
    model: cloneModelConfig(config.model),
    builtIn: false,
    identity: mockAgentIdentity(`agent-${agentSequence}`),
  }
  agentStore.push(seed)
  // 新 Agent 从干净的工作台开始:没有项目,也没有安装任何插件。
  projectStore.set(seed.id, [])
  return summaryOf(seed)
}

export function mockUpdateAgent(agentId: AgentId, config: AgentConfig): AgentSummary | null {
  const seed = agentStore.find((item) => item.id === agentId)
  if (seed === undefined) return null
  seed.name = config.name.trim()
  seed.note = config.note.trim()
  seed.model = cloneModelConfig(config.model)
  // 用户改过之后就是自定义文案,不再跟随界面语言。
  delete seed.nameKey
  delete seed.noteKey
  return summaryOf(seed)
}

export function mockSetAgentIdentity(agentId: AgentId, identity: AgentIdentity): AgentSummary | null {
  const seed = agentStore.find((item) => item.id === agentId)
  if (seed === undefined) return null
  seed.identity = { ...identity }
  return summaryOf(seed)
}

export function mockInvalidateAgentTrust(): void {
  for (const seed of agentStore) seed.identity = { ...seed.identity, trustState: 'keyChanged' }
}

export function mockDeleteAgent(agentId: AgentId): boolean {
  // 至少保留一个 Agent:没有 Agent 就没有可用的工作台。
  if (agentStore.length <= 1) return false
  const index = agentStore.findIndex((seed) => seed.id === agentId)
  if (index < 0) return false
  agentStore.splice(index, 1)
  projectStore.delete(agentId)
  // 该 Agent 的插件安装态与配置一并移除;项目级插件不受影响。
  pluginStates.delete(`agent:${agentId}`)
  pluginConfigValues.delete(`agent:${agentId}`)
  // 该 Agent 名下本轮新建的会话一并移除;预置会话由 mockSessions 按「Agent 是否还在」过滤。
  for (let cursor = extraSessions.length - 1; cursor >= 0; cursor -= 1) {
    if (extraSessions[cursor]?.agent === agentId) extraSessions.splice(cursor, 1)
  }
  return true
}

// ---- 插件与插件市场 ----
//
// 市场目录是共享缓存;注册与安装态按作用域隔离:
//   agent:<agentId>   该 Agent 的会话配置(程序化选项;优先级高于项目)
//   project:<path>    打开该项目的所有 Agent 生效(.claude/settings.json)
// 绑定记录各作用域注册了哪些市场、是否自动更新。插件身份是 plugin@marketplace ——
// 不同市场可以有同名插件。
interface ConfigFieldSeed {
  key: string
  label: string
  description: string
  type: PluginConfigTypeId
  required: boolean
  defaultValue: string
}

interface PluginSeed {
  id: string
  name: string
  description: string
  publisher: string
  version: string
  icon: string
  components: PluginComponentId[]
  skills?: Pick<Skill, 'name' | 'description'>[]
  config: ConfigFieldSeed[]
}

interface MarketplaceSeed {
  id: string
  name: string
  source: string
  trust: PluginTrustId
  // 官方市场默认自动更新开、第三方默认关(与 Claude Code 的默认策略一致)。
  // 这是**新建绑定**时的默认值;已有绑定的策略由 MarketplaceBindingState 单独保存。
  defaultAutoUpdate: boolean
  lastUpdated: string
  plugins: PluginSeed[]
}

const marketplaceCatalog: MarketplaceSeed[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Plugins',
    source: 'github.com/anthropics/claude-plugins',
    trust: 'trusted',
    defaultAutoUpdate: true,
    lastUpdated: '2026-10-18T07:20:00Z',
    plugins: [
      {
        id: 'code-review',
        name: 'Code Review',
        description: 'Reviews diffs for correctness, security, and regressions before you ship.',
        publisher: 'Anthropic',
        version: '1.4.2',
        icon: 'code',
        components: ['skill', 'command'],
        skills: [{ name: 'review-diff', description: '检查改动中的正确性、安全问题与回归风险' }],
        config: [
          { key: 'githubToken', label: 'GitHub token', description: 'Used to read pull requests and post review comments.', type: 'secret', required: false, defaultValue: '' },
        ],
      },
      {
        id: 'test-runner',
        name: 'Test Runner',
        description: 'Runs the right test suite, reads failures, and proposes the smallest fix.',
        publisher: 'Anthropic',
        version: '2.1.0',
        icon: 'sliders',
        components: ['command', 'hook'],
        config: [
          { key: 'command', label: 'Test command', description: 'Command to run in the project root.', type: 'text', required: true, defaultValue: 'pnpm test' },
        ],
      },
      {
        id: 'data-analysis',
        name: 'Data Analysis',
        description: 'Profiles CSV and JSON files, then drafts the analysis in a notebook.',
        publisher: 'Anthropic',
        version: '1.2.0',
        icon: 'database',
        components: ['skill', 'mcp'],
        skills: [{ name: 'profile-dataset', description: '检查数据字段、缺失值与异常分布' }],
        config: [
          { key: 'workspaceDir', label: 'Workspace directory', description: 'Where analysis notebooks are written.', type: 'text', required: false, defaultValue: '~/work' },
        ],
      },
      {
        id: 'docs-writer',
        name: 'Docs Writer',
        description: "Drafts and revises documentation in the product's established voice.",
        publisher: 'Anthropic',
        version: '1.0.5',
        icon: 'fileText',
        components: ['skill', 'agent'],
        skills: [{ name: 'revise-doc', description: '按产品文风修订文档并核对术语' }],
        config: [
          { key: 'styleGuide', label: 'Style guide path', description: 'Optional path to the documentation style guide.', type: 'text', required: false, defaultValue: '' },
        ],
      },
    ],
  },
  {
    id: 'community',
    name: 'Community Registry',
    source: 'github.com/claude-community/plugins',
    trust: 'community',
    defaultAutoUpdate: false,
    lastUpdated: '2026-10-15T18:05:00Z',
    plugins: [
      {
        id: 'browser-tools',
        name: 'Browser Tools',
        description: 'Drives a headless browser to verify layouts and capture evidence.',
        publisher: 'Chromium Labs',
        version: '0.8.1',
        icon: 'window',
        components: ['mcp', 'command'],
        config: [
          { key: 'headless', label: 'Headless mode', description: 'Run the browser without a visible window.', type: 'boolean', required: false, defaultValue: 'true' },
          { key: 'endpoint', label: 'DevTools endpoint', description: 'Optional remote debugging endpoint.', type: 'text', required: false, defaultValue: '' },
        ],
      },
      {
        id: 'notion-sync',
        name: 'Notion Sync',
        description: 'Syncs project notes with Notion databases in both directions.',
        publisher: 'Northwind',
        version: '1.1.3',
        icon: 'sync',
        components: ['mcp'],
        config: [
          { key: 'token', label: 'Integration token', description: 'Notion integration token with database access.', type: 'secret', required: true, defaultValue: '' },
          { key: 'databaseId', label: 'Database ID', description: 'Target Notion database.', type: 'text', required: true, defaultValue: '' },
        ],
      },
      {
        id: 'security-audit',
        name: 'Security Audit',
        description: 'Scans dependencies and code paths for common vulnerability classes.',
        publisher: 'Redline Security',
        version: '0.6.4',
        icon: 'badge',
        components: ['skill', 'agent', 'hook'],
        skills: [{ name: 'scan-dependencies', description: '扫描依赖漏洞并整理可执行的升级建议' }],
        config: [
          { key: 'severityThreshold', label: 'Severity threshold', description: 'Lowest severity that fails the check.', type: 'text', required: false, defaultValue: 'high' },
        ],
      },
    ],
  },
  {
    id: 'studio',
    name: 'Studio Nine',
    source: 'git.studio-nine.dev/claude-marketplace',
    trust: 'community',
    defaultAutoUpdate: false,
    lastUpdated: '2026-09-30T11:40:00Z',
    plugins: [
      {
        id: 'figma-bridge',
        name: 'Figma Bridge',
        description: 'Exports frames and design tokens from Figma into the project.',
        publisher: 'Studio Nine',
        version: '0.9.0',
        icon: 'image',
        components: ['mcp', 'command'],
        config: [
          { key: 'accessToken', label: 'Figma access token', description: 'Personal access token with file read scope.', type: 'secret', required: true, defaultValue: '' },
          { key: 'fileKey', label: 'File key', description: 'Figma file to export from.', type: 'text', required: true, defaultValue: '' },
        ],
      },
    ],
  },
]

// 可被「添加市场」解析到的已知来源:输入这个 source 时会带上它的插件目录;
// 其它 source 也能添加,但市场暂时是空的(真实环境要等首次同步)。
const extraMarketplaceCatalog: MarketplaceSeed[] = [
  {
    id: 'mia-labs',
    name: 'Mia Labs',
    source: 'github.com/maixai/agent-plugins',
    trust: 'trusted',
    defaultAutoUpdate: true,
    lastUpdated: '2026-10-17T09:10:00Z',
    plugins: [
      {
        id: 'release-notes',
        name: 'Release Notes',
        description: 'Collects merged changes and drafts release notes by audience.',
        publisher: 'Mia Labs',
        version: '1.0.1',
        icon: 'fileText',
        components: ['skill', 'command'],
        skills: [{ name: 'draft-release', description: '按目标读者整理本次发布的重点' }],
        config: [],
      },
      {
        id: 'design-tokens',
        name: 'Design Tokens',
        description: 'Exports design tokens into CSS variables and a TypeScript map.',
        publisher: 'Mia Labs',
        version: '0.4.2',
        icon: 'table',
        components: ['mcp'],
        config: [
          { key: 'outputDir', label: 'Output directory', description: 'Where generated token files are written.', type: 'text', required: false, defaultValue: 'tokens' },
        ],
      },
      {
        id: 'changelog-builder',
        name: 'Changelog Builder',
        description: 'Turns merged pull requests into a grouped changelog entry.',
        publisher: 'Mia Labs',
        version: '1.2.0',
        icon: 'fileText',
        components: ['skill', 'command'],
        skills: [{ name: 'build-entry', description: '把合并记录归类为变更日志条目' }],
        config: [],
      },
      {
        id: 'api-contract',
        name: 'API Contract',
        description: 'Checks request and response shapes against the published schema.',
        publisher: 'Mia Labs',
        version: '0.7.3',
        icon: 'code',
        components: ['command', 'hook'],
        config: [],
      },
      {
        id: 'screenshot-diff',
        name: 'Screenshot Diff',
        description: 'Captures pages and highlights pixel changes between builds.',
        publisher: 'Mia Labs',
        version: '0.5.0',
        icon: 'image',
        components: ['mcp'],
        config: [],
      },
      {
        id: 'copy-review',
        name: 'Copy Review',
        description: 'Checks interface copy for tone, clarity, and consistency.',
        publisher: 'Mia Labs',
        version: '1.0.4',
        icon: 'fileText',
        components: ['skill', 'agent'],
        skills: [{ name: 'review-copy', description: '检查界面文案的语气、清晰度与一致性' }],
        config: [],
      },
      {
        id: 'dependency-audit',
        name: 'Dependency Audit',
        description: 'Flags outdated and vulnerable dependencies with upgrade paths.',
        publisher: 'Mia Labs',
        version: '0.9.1',
        icon: 'badge',
        components: ['agent', 'hook'],
        config: [],
      },
      {
        id: 'docs-sync',
        name: 'Docs Sync',
        description: 'Keeps generated reference pages in sync with source comments.',
        publisher: 'Mia Labs',
        version: '1.1.0',
        icon: 'sync',
        components: ['mcp'],
        config: [],
      },
    ],
  },
]

function clonePluginSeed(plugin: PluginSeed): PluginSeed {
  return {
    ...plugin,
    components: [...plugin.components],
    config: plugin.config.map((field) => ({ ...field })),
    ...(plugin.skills === undefined ? {} : { skills: plugin.skills.map((skill) => ({ ...skill })) }),
  }
}

function cloneMarketplaceSeed(seed: MarketplaceSeed): MarketplaceSeed {
  return { ...seed, plugins: seed.plugins.map(clonePluginSeed) }
}

// 全局市场表:添加 / 移除 / 更新都改这一份(对应一台机器一份 known_marketplaces.json)。
const marketplaceStore: MarketplaceSeed[] = marketplaceCatalog.map(cloneMarketplaceSeed)
let marketplaceSequence = 0

// 每个 Agent / 项目各自注册哪些市场、是否自动更新。市场目录是共享缓存,
// 绑定状态按作用域隔离 —— 同一来源可以在多个 Agent 里各自设置策略与安装。
interface MarketplaceBindingState {
  autoUpdate: boolean
}
const marketplaceBindings = new Map<string, Map<string, MarketplaceBindingState>>()

interface ScopedPluginState {
  enabled: boolean
  installedVersion: string
}

type InstallScope = InstalledPlugin['scope']

// scopeKey: agent:<agentId> / project:<projectPath>
function scopeKey(scope: InstallScope, ownerId: string): string {
  return `${scope}:${ownerId}`
}

function pluginKey(marketplaceId: string, pluginId: string): string {
  return `${pluginId}@${marketplaceId}`
}

const pluginStates = new Map<string, Map<string, ScopedPluginState>>()
const pluginConfigValues = new Map<string, Map<string, Map<string, string>>>()

function stateMap(scope: InstallScope, ownerId: string): Map<string, ScopedPluginState> {
  const key = scopeKey(scope, ownerId)
  const existing = pluginStates.get(key)
  if (existing !== undefined) return existing
  const created = new Map<string, ScopedPluginState>()
  pluginStates.set(key, created)
  return created
}

function configMap(scope: InstallScope, ownerId: string): Map<string, Map<string, string>> {
  const key = scopeKey(scope, ownerId)
  const existing = pluginConfigValues.get(key)
  if (existing !== undefined) return existing
  const created = new Map<string, Map<string, string>>()
  pluginConfigValues.set(key, created)
  return created
}

function bindingMap(scope: InstallScope, ownerId: string): Map<string, MarketplaceBindingState> {
  const key = scopeKey(scope, ownerId)
  const existing = marketplaceBindings.get(key)
  if (existing !== undefined) return existing
  const created = new Map<string, MarketplaceBindingState>()
  marketplaceBindings.set(key, created)
  return created
}

// 预置安装:演示 Agent 级与项目级并存,以及同一插件在两层都出现(Agent 优先)。
const INSTALL_SEEDS: { scope: InstallScope; ownerId: string; plugins: { marketplaceId: string; pluginId: string; enabled: boolean; installedVersion?: string }[] }[] = [
  { scope: 'agent', ownerId: 'planning', plugins: [
    { marketplaceId: 'anthropic', pluginId: 'code-review', enabled: true },
    { marketplaceId: 'anthropic', pluginId: 'data-analysis', enabled: true },
  ] },
  { scope: 'agent', ownerId: 'research', plugins: [
    { marketplaceId: 'community', pluginId: 'browser-tools', enabled: true, installedVersion: '0.8.0' },
    { marketplaceId: 'community', pluginId: 'notion-sync', enabled: false },
  ] },
  { scope: 'agent', ownerId: 'writing', plugins: [
    { marketplaceId: 'anthropic', pluginId: 'docs-writer', enabled: true },
    { marketplaceId: 'studio', pluginId: 'figma-bridge', enabled: true },
  ] },
  { scope: 'project', ownerId: '~/work/weekly-report', plugins: [
    { marketplaceId: 'anthropic', pluginId: 'test-runner', enabled: true },
  ] },
  { scope: 'project', ownerId: '~/work/product-docs', plugins: [
    { marketplaceId: 'anthropic', pluginId: 'docs-writer', enabled: true },
  ] },
  { scope: 'project', ownerId: '~/work/user-research', plugins: [
    { marketplaceId: 'community', pluginId: 'security-audit', enabled: true },
  ] },
]

for (const seed of INSTALL_SEEDS) {
  const states = stateMap(seed.scope, seed.ownerId)
  for (const item of seed.plugins) {
    const available = pluginSeedOf(item.marketplaceId, item.pluginId)?.version ?? '0.0.0'
    states.set(pluginKey(item.marketplaceId, item.pluginId), {
      enabled: item.enabled,
      installedVersion: item.installedVersion ?? available,
    })
  }
}

// 预置每个 Agent / 项目注册的市场。未指定 autoUpdate 时用目录的默认策略。
const MARKETPLACE_BINDING_SEEDS: {
  scope: InstallScope
  ownerId: string
  marketplaces: { id: string; autoUpdate?: boolean }[]
}[] = [
  { scope: 'agent', ownerId: 'planning', marketplaces: [{ id: 'anthropic' }, { id: 'community' }] },
  { scope: 'agent', ownerId: 'research', marketplaces: [{ id: 'anthropic' }, { id: 'community' }] },
  { scope: 'agent', ownerId: 'writing', marketplaces: [{ id: 'anthropic' }, { id: 'studio' }] },
  { scope: 'project', ownerId: '~/work/weekly-report', marketplaces: [{ id: 'anthropic' }] },
  { scope: 'project', ownerId: '~/work/product-docs', marketplaces: [{ id: 'anthropic' }] },
  { scope: 'project', ownerId: '~/work/user-research', marketplaces: [{ id: 'community' }] },
]

for (const seed of MARKETPLACE_BINDING_SEEDS) {
  const bindings = bindingMap(seed.scope, seed.ownerId)
  for (const item of seed.marketplaces) {
    const catalog = marketplaceSeedOf(item.id)
    if (catalog === undefined) continue
    bindings.set(item.id, { autoUpdate: item.autoUpdate ?? catalog.defaultAutoUpdate })
  }
}

// 配置值种子:键为 scopeKey -> pluginKey -> 字段 key。
function seedConfig(scope: InstallScope, ownerId: string, marketplaceId: string, pluginId: string, values: Record<string, string>): void {
  const map = configMap(scope, ownerId)
  map.set(pluginKey(marketplaceId, pluginId), new Map(Object.entries(values)))
}
seedConfig('agent', 'planning', 'anthropic', 'data-analysis', { workspaceDir: '~/work/weekly-report' })
seedConfig('agent', 'research', 'community', 'browser-tools', { headless: 'true' })
seedConfig('agent', 'research', 'community', 'notion-sync', { databaseId: '8f2c4a71-3d1e-4b0a-9f52-7c6d1e90ab34' })
seedConfig('agent', 'writing', 'anthropic', 'docs-writer', { styleGuide: 'docs/style-guide.md' })
seedConfig('agent', 'writing', 'studio', 'figma-bridge', { accessToken: 'figd_demo_secret', fileKey: 'FK-9C2E71' })
seedConfig('project', '~/work/user-research', 'community', 'security-audit', { severityThreshold: 'medium' })

const SECRET_MASK = '••••••••'

function marketplaceSeedOf(marketplaceId: string): MarketplaceSeed | undefined {
  return marketplaceStore.find((item) => item.id === marketplaceId)
}

function pluginSeedOf(marketplaceId: string, pluginId: string): PluginSeed | undefined {
  return marketplaceSeedOf(marketplaceId)?.plugins.find((item) => item.id === pluginId)
}

// 当前作用域中从某市场安装的插件数(移除时的风险提示)。
function installedCountOf(scope: InstallScope, ownerId: string, marketplaceId: string): number {
  const states = pluginStates.get(scopeKey(scope, ownerId))
  if (states === undefined) return 0
  const suffix = `@${marketplaceId}`
  let count = 0
  for (const key of states.keys()) {
    if (key.endsWith(suffix)) count += 1
  }
  return count
}

// 市场目录:来源与插件元数据,不含任何作用域状态。
function marketplaceOf(seed: MarketplaceSeed): Marketplace {
  return {
    id: seed.id,
    name: seed.name,
    source: seed.source,
    trust: seed.trust,
    plugins: seed.plugins.map((plugin) => ({
      id: plugin.id,
      marketplaceId: seed.id,
      name: plugin.name,
      description: plugin.description,
      publisher: plugin.publisher,
      version: plugin.version,
      icon: plugin.icon,
      components: [...plugin.components],
    })),
  }
}

// 某个作用域的市场注册:策略与安装计数来自该作用域,目录本身共享。
function bindingOf(scope: InstallScope, ownerId: string, seed: MarketplaceSeed): MarketplaceBinding {
  const state = marketplaceBindings.get(scopeKey(scope, ownerId))?.get(seed.id)
  return {
    marketplace: marketplaceOf(seed),
    autoUpdate: state?.autoUpdate ?? seed.defaultAutoUpdate,
    lastUpdated: seed.lastUpdated,
    installedCount: installedCountOf(scope, ownerId, seed.id),
  }
}

function configOf(scope: InstallScope, ownerId: string, marketplaceId: string, plugin: PluginSeed): PluginConfigField[] {
  const stored = pluginConfigValues.get(scopeKey(scope, ownerId))?.get(pluginKey(marketplaceId, plugin.id))
  return plugin.config.map((field) => {
    const raw = stored?.get(field.key) ?? field.defaultValue
    // 只回契约字段:种子里的 defaultValue 不外泄,配置值在安装后由 value / isSet 表达。
    if (field.type === 'secret') {
      return { key: field.key, label: field.label, description: field.description, type: field.type, required: field.required, value: raw === '' ? '' : SECRET_MASK, isSet: raw !== '' }
    }
    return { key: field.key, label: field.label, description: field.description, type: field.type, required: field.required, value: raw, isSet: field.type === 'boolean' ? true : raw !== '' }
  })
}

function installedPluginOf(scope: InstallScope, ownerId: string, marketplaceId: string, plugin: PluginSeed): InstalledPlugin {
  const state = stateMap(scope, ownerId).get(pluginKey(marketplaceId, plugin.id))
  return {
    plugin: {
      id: plugin.id,
      marketplaceId,
      name: plugin.name,
      description: plugin.description,
      publisher: plugin.publisher,
      version: plugin.version,
      icon: plugin.icon,
      components: [...plugin.components],
    },
    enabled: state?.enabled ?? false,
    scope,
    marketplaceName: marketplaceSeedOf(marketplaceId)?.name ?? marketplaceId,
    installedVersion: state?.installedVersion ?? plugin.version,
    config: configOf(scope, ownerId, marketplaceId, plugin),
  }
}

function isValidOwner(scope: InstallScope, ownerId: string): boolean {
  if (ownerId === '') return false
  return scope === 'agent' ? mockAgentExists(ownerId) : true
}

// 某个 Agent / 项目注册的市场。目录共享,绑定与策略按作用域隔离。
export function mockMarketplaceBindings(scope: InstallScope, ownerId: string): MarketplaceBinding[] | null {
  if (!isValidOwner(scope, ownerId)) return null
  const bindings = marketplaceBindings.get(scopeKey(scope, ownerId))
  if (bindings === undefined) return []
  const result: MarketplaceBinding[] = []
  for (const marketplaceId of bindings.keys()) {
    const seed = marketplaceSeedOf(marketplaceId)
    if (seed !== undefined) result.push(bindingOf(scope, ownerId, seed))
  }
  return result
}

export function mockInstalledPlugins(scope: InstallScope, ownerId: string): InstalledPlugin[] | null {
  if (!isValidOwner(scope, ownerId)) return null
  const states = pluginStates.get(scopeKey(scope, ownerId))
  if (states === undefined) return []
  const result: InstalledPlugin[] = []
  for (const key of states.keys()) {
    const at = key.lastIndexOf('@')
    if (at < 0) continue
    const pluginId = key.slice(0, at)
    const marketplaceId = key.slice(at + 1)
    const plugin = pluginSeedOf(marketplaceId, pluginId)
    if (plugin === undefined) continue
    result.push(installedPluginOf(scope, ownerId, marketplaceId, plugin))
  }
  return result.sort((a, b) => a.plugin.name.localeCompare(b.plugin.name))
}

export function mockInstallPlugin(scope: InstallScope, ownerId: string, marketplaceId: string, pluginId: string): InstalledPlugin | null {
  if (!isValidOwner(scope, ownerId)) return null
  const plugin = pluginSeedOf(marketplaceId, pluginId)
  if (plugin === undefined) return null
  stateMap(scope, ownerId).set(pluginKey(marketplaceId, pluginId), { enabled: true, installedVersion: plugin.version })
  return installedPluginOf(scope, ownerId, marketplaceId, plugin)
}

export function mockUninstallPlugin(scope: InstallScope, ownerId: string, marketplaceId: string, pluginId: string): boolean {
  if (!isValidOwner(scope, ownerId)) return false
  const states = pluginStates.get(scopeKey(scope, ownerId))
  if (states === undefined) return false
  const removed = states.delete(pluginKey(marketplaceId, pluginId))
  pluginConfigValues.get(scopeKey(scope, ownerId))?.delete(pluginKey(marketplaceId, pluginId))
  return removed
}

export function mockSetPluginEnabled(scope: InstallScope, ownerId: string, marketplaceId: string, pluginId: string, enabled: boolean): InstalledPlugin | null {
  if (!isValidOwner(scope, ownerId)) return null
  const plugin = pluginSeedOf(marketplaceId, pluginId)
  const state = stateMap(scope, ownerId).get(pluginKey(marketplaceId, pluginId))
  if (plugin === undefined || state === undefined) return null
  state.enabled = enabled
  return installedPluginOf(scope, ownerId, marketplaceId, plugin)
}

export type SavePluginConfigResult =
  | { status: 'ok'; installed: InstalledPlugin }
  | { status: 'missing' }
  | { status: 'invalid' }

// 保存插件配置:secret 的空值表示「保持原值」;必填项缺失时不提交任何改动。
export function mockSavePluginConfig(
  scope: InstallScope,
  ownerId: string,
  marketplaceId: string,
  pluginId: string,
  values: readonly PluginConfigValue[],
): SavePluginConfigResult {
  const plugin = pluginSeedOf(marketplaceId, pluginId)
  const state = pluginStates.get(scopeKey(scope, ownerId))?.get(pluginKey(marketplaceId, pluginId))
  if (plugin === undefined || state === undefined) return { status: 'missing' }

  const configs = configMap(scope, ownerId)
  const key = pluginKey(marketplaceId, pluginId)
  const current = configs.get(key) ?? new Map<string, string>()
  const next = new Map(current)
  for (const item of values) {
    const field = plugin.config.find((entry) => entry.key === item.key)
    if (field === undefined) continue
    // 空 secret = 保持已保存的值(界面永远不回显真实密钥)。
    if (field.type === 'secret' && item.value === '') continue
    next.set(item.key, item.value)
  }
  for (const field of plugin.config) {
    if (!field.required || field.type === 'boolean') continue
    const raw = next.get(field.key) ?? field.defaultValue
    if (raw === '') return { status: 'invalid' }
  }
  configs.set(key, next)
  return { status: 'ok', installed: installedPluginOf(scope, ownerId, marketplaceId, plugin) }
}

// 自动更新属于**这次注册**,不是目录级策略:只影响当前 Agent / 项目的已装插件。
export function mockSetMarketplaceAutoUpdate(scope: InstallScope, ownerId: string, marketplaceId: string, autoUpdate: boolean): MarketplaceBinding | null {
  if (!isValidOwner(scope, ownerId)) return null
  const seed = marketplaceSeedOf(marketplaceId)
  const state = marketplaceBindings.get(scopeKey(scope, ownerId))?.get(marketplaceId)
  if (seed === undefined || state === undefined) return null
  state.autoUpdate = autoUpdate
  // 打开自动更新时立刻把在途更新补上(与后台刷新的结果一致)。
  if (autoUpdate) applyInstalledVersions(scope, ownerId, marketplaceId)
  return bindingOf(scope, ownerId, seed)
}

// 单个插件的手动更新:只把这一份安装带到市场当前版本。
export function mockUpdateInstalledPlugin(scope: InstallScope, ownerId: string, marketplaceId: string, pluginId: string): InstalledPlugin | null {
  const plugin = pluginSeedOf(marketplaceId, pluginId)
  const state = pluginStates.get(scopeKey(scope, ownerId))?.get(pluginKey(marketplaceId, pluginId))
  if (plugin === undefined || state === undefined) return null
  state.installedVersion = plugin.version
  return installedPluginOf(scope, ownerId, marketplaceId, plugin)
}

// 手动更新:刷新共享目录的插件补丁版本,并把**当前作用域**的副本带到新版本。
function bumpPatch(version: string): string {
  const parts = version.split('.')
  const patch = Number(parts[2] ?? Number.NaN)
  if (parts.length !== 3 || !Number.isFinite(patch)) return version
  return `${parts[0]}.${parts[1]}.${patch + 1}`
}

export function mockUpdateMarketplace(scope: InstallScope, ownerId: string, marketplaceId: string): MarketplaceBinding | null {
  if (!isValidOwner(scope, ownerId)) return null
  const seed = marketplaceSeedOf(marketplaceId)
  if (seed === undefined) return null
  if (marketplaceBindings.get(scopeKey(scope, ownerId))?.has(marketplaceId) !== true) return null
  for (const plugin of seed.plugins) plugin.version = bumpPatch(plugin.version)
  // 更新目录后把当前作用域的已装副本对齐(其它 Agent / 项目仍保留旧版本,直到它们自己更新)。
  applyInstalledVersions(scope, ownerId, marketplaceId)
  seed.lastUpdated = new Date().toISOString()
  return bindingOf(scope, ownerId, seed)
}

// 把某个作用域中从该市场安装的副本对齐到目录当前版本。
function applyInstalledVersions(scope: InstallScope, ownerId: string, marketplaceId: string): void {
  const seed = marketplaceSeedOf(marketplaceId)
  const states = pluginStates.get(scopeKey(scope, ownerId))
  if (seed === undefined || states === undefined) return
  const suffix = `@${marketplaceId}`
  for (const [key, state] of states) {
    if (!key.endsWith(suffix)) continue
    const pluginId = key.slice(0, key.lastIndexOf('@'))
    const plugin = seed.plugins.find((item) => item.id === pluginId)
    if (plugin !== undefined) state.installedVersion = plugin.version
  }
}

// 给某个 Agent / 项目添加市场:同一 source 复用共享目录,绑定状态互相独立。
export function mockAddMarketplace(scope: InstallScope, ownerId: string, config: MarketplaceConfig): MarketplaceBinding | null {
  if (!isValidOwner(scope, ownerId)) return null
  const name = config.name.trim()
  const source = config.source.trim()
  if (name === '' || source === '') return null
  const bindings = bindingMap(scope, ownerId)
  if ([...bindings.keys()].some((id) => {
    const existing = marketplaceSeedOf(id)
    return existing !== undefined && (existing.name === name || existing.source === source)
  })) return null
  let seed = marketplaceStore.find((item) => item.source === source)
  if (seed === undefined) {
    marketplaceSequence += 1
    const known = [...marketplaceCatalog, ...extraMarketplaceCatalog].find((item) => item.source === source)
    seed = known === undefined
      ? {
          id: `marketplace-${marketplaceSequence}`,
          name,
          source,
          trust: 'community',
          defaultAutoUpdate: config.autoUpdate,
          lastUpdated: new Date().toISOString(),
          plugins: [],
        }
      : {
          ...cloneMarketplaceSeed(known),
          id: `marketplace-${marketplaceSequence}`,
          name,
          lastUpdated: new Date().toISOString(),
        }
    marketplaceStore.push(seed)
  }
  bindings.set(seed.id, { autoUpdate: config.autoUpdate })
  return bindingOf(scope, ownerId, seed)
}

// 移除某个作用域注册的市场:只卸载该作用域中它名下的插件,共享目录留给其它 Agent / 项目。
export function mockRemoveMarketplace(scope: InstallScope, ownerId: string, marketplaceId: string): boolean {
  if (!isValidOwner(scope, ownerId)) return false
  const bindings = marketplaceBindings.get(scopeKey(scope, ownerId))
  if (bindings === undefined || !bindings.delete(marketplaceId)) return false
  const states = pluginStates.get(scopeKey(scope, ownerId))
  if (states !== undefined) {
    const suffix = `@${marketplaceId}`
    for (const key of [...states.keys()]) {
      if (key.endsWith(suffix)) states.delete(key)
    }
  }
  const configs = pluginConfigValues.get(scopeKey(scope, ownerId))
  if (configs !== undefined) {
    const suffix = `@${marketplaceId}`
    for (const key of [...configs.keys()]) {
      if (key.endsWith(suffix)) configs.delete(key)
    }
  }
  return true
}

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
  // 写作助手的第三个会话,**响应完成且未看过**:Agent 栏的 Badge 要能演示「两类信号并存时
  // 取更紧急的一档」—— 只有同一 Agent 下既有一条未看过的「等待交互」(quarterly) 又有一条
  // 未看过的「响应完成」(本条),「等待交互 > 响应完成」这条优先级才谈得上被验证。
  { id: 'release', title: 'release', preview: 'release', agent: 'writing', projectId: 'product-docs', updatedAt: '2026-10-06T05:20:00Z', status: 'completed' },
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
  release: [
    { id: 'release-1', role: 'user', body: 'releaseUser', createdAt: '2026-10-06T05:19:00Z' },
    { id: 'release-2', role: 'assistant', body: 'releaseAssistant', createdAt: '2026-10-06T05:20:00Z' },
  ],
} satisfies Record<string, (Omit<ChatMessage, 'attachments'> & { body: keyof Messages['workspace']['messages'] })[]>

const responsePool: (keyof Messages['workspace']['responses'])[] = ['first', 'second', 'third']
const extraSessions: ChatSession[] = []
// 本轮生成改变会话状态，供后台 Agent 的运行摘要与完成通知使用。
const liveSessionStatuses = new Map<string, SessionStatus>()
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
  ].filter((session) => mockAgentExists(session.agent)).map((session) => ({ ...session, status: liveSessionStatuses.get(session.id) ?? session.status }))
}

// Agent 级的「需要你处理」信号:每个 Agent 名下、**未看过**的「等待交互」与「响应完成」
// 各有多少条。计数跨该 Agent 的**全部项目**(信号的粒度是 Agent,不是项目 —— 侧栏切项目
// 不该让别的项目里等你的那条消失);已看过的会话由调用方传入的 id 集合排除。
export function mockAgentSignals(demoState: AppRoute['demoState'], seenSessionIds: readonly string[]): AgentSignal[] {
  const seen = new Set(seenSessionIds)
  const sessions = mockSessions(demoState)
  return agentStore.map((seed) => {
    const agentId = seed.id
    const mine = sessions.filter((session) => session.agent === agentId && !seen.has(session.id))
    return {
      agentId,
      running: mine.filter((session) => session.status === 'streaming').length,
      awaiting: mine.filter((session) => session.status === 'awaiting').length,
      completed: mine.filter((session) => session.status === 'completed').length,
    }
  })
}

// 通知只保留尚未看过的等待与完成，等待优先，同档按更新时间倒序。
export function mockAgentNotifications(demoState: AppRoute['demoState'], seenSessionIds: readonly string[]): AgentNotification[] {
  const seen = new Set(seenSessionIds)
  return mockSessions(demoState)
    .filter((session) => !seen.has(session.id) && (session.status === 'awaiting' || session.status === 'completed'))
    .map((session) => ({ id: `notice:${session.id}`, agentId: session.agent, projectId: session.projectId, sessionId: session.id, title: session.title, status: session.status, updatedAt: session.updatedAt }))
    .sort((a, b) => Number(b.status === 'awaiting') - Number(a.status === 'awaiting') || b.updatedAt.localeCompare(a.updatedAt))
}

// 系统通知独立于会话，展开不改变已读状态；仅按显式传入的已读集合过滤。
export function mockSystemNotifications(demoState: AppRoute['demoState'], seenIds: readonly string[]): SystemNotification[] {
  if (demoState === 'empty') return []
  const items = t.value.workspace.notifications.systemItems
  const notices: SystemNotification[] = [
    { id: 'notice:system:connection', kind: 'connection', severity: 'warning', ...items.connection, createdAt: '2026-10-08T09:45:00Z' },
    { id: 'notice:system:update', kind: 'update', severity: 'info', ...items.update, createdAt: '2026-10-08T06:10:00Z' },
    { id: 'notice:system:storage', kind: 'storage', severity: 'warning', ...items.storage, createdAt: '2026-10-07T18:20:00Z' },
    { id: 'notice:system:security', kind: 'security', severity: 'info', ...items.security, createdAt: '2026-10-06T21:14:00Z' },
  ]
  const seen = new Set(seenIds)
  return notices.filter((item) => !seen.has(item.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function mockTranscript(sessionId: string): ChatMessage[] {
  const key = sessionSeeds.find((session) => session.id === sessionId)?.title
  // 预置消息不带附件(attachments: []);带附件的是本次会话里用户发出去的那些(见 extraMessages)。
  const initial: ChatMessage[] = key ? messageSeeds[key].map((message) => ({ ...message, body: t.value.workspace.messages[message.body], attachments: [] })) : []
  const extra = (extraMessages.get(sessionId) ?? []).map((message) => {
    // 部分正文保持原文；完成及重新生成完成的应答按当前语言组装。
    const responseKey = message.body === responseBodies.get(message.id) ? translatedReplies.get(message.id) : undefined
    return { ...message, body: responseKey ? t.value.workspace.responses[responseKey] : message.body }
  })
  return [...initial, ...extra]
}

// 新建会话的归属规则:归属项目由调用方(页面按「能推断就推断」的规则定出)决定后传入 ——
// 项目本身就已挂在某个 Agent 上,故 agent 由项目反推,调用方不必重复传、也就没有两处对不上的风险。
export function mockCreateSession(projectId: string): ChatSession {
  sequence.session += 1
  const session: ChatSession = { id: `draft-${sequence.session}`, title: '', preview: '', agent: projectAgent(projectId), projectId, updatedAt: '2026-10-08T10:00:00Z', status: 'new' }
  extraSessions.unshift(session)
  extraMessages.set(session.id, [])
  return { ...session, title: t.value.workspace.newChat }
}

// 用户发出一条消息:正文 + 本轮附件一并挂在那条用户消息上(附件是「这一轮带出去的携带信息」的
// 规范化留痕;粘贴文本的**全文**就在 attachments[].content 里,不因芯片折叠而丢失)。
export function mockSendMessage(sessionId: string, text: string, attachments: Attachment[]): ChatMessage {
  sequence.message += 1
  liveSessionStatuses.set(sessionId, 'streaming')
  const turn = turns.get(sessionId) ?? 0
  turns.set(sessionId, turn + 1)
  const responseKey = responsePool[turn % responsePool.length] ?? 'first'
  const createdAt = new Date(Date.UTC(2026, 9, 8, 10, sequence.message)).toISOString()
  const user: ChatMessage = { id: `user-${sequence.message}`, role: 'user', body: text, createdAt, attachments: attachments.map((attachment) => ({ ...attachment })) }
  const response: ChatMessage = { id: `response-${sequence.message}`, role: 'assistant', body: t.value.workspace.responses[responseKey], createdAt, attachments: [] }
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
  liveSessionStatuses.set(sessionId, 'completed')
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
  // 项目缩写(2–4 字符):tab 标题前缀用它承担归属的**文字通道**(色觉障碍下唯一可用的通道)。
  mark: string
  path: string
  entries: ProjectEntry[]
}

// 每个 Agent 打开的项目。打开 / 关闭会就地改动本表(内存态,刷新即重置)。
// 用 Map 而不是 Record:Agent 可以在运行时新建 / 删除,键集合是动态的。
const projectStore = new Map<AgentId, ProjectSeed[]>([
  ['planning', [
    {
      id: 'weekly-report',
      mark: 'WR',
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
        // 渲染样张目录:这四份是**演示用的样本文件**,用来让文件面板的三种视图各有用武之地 ——
        // HTML 走 sandbox iframe、shell 与 apacheconf 走 legacy-modes 高亮、render-check 是
        // 刻意含注入尝试的 Markdown(见 mocks/files.ts 的注释)。真实项目里它们会各自归位。
        { id: 'wr-examples', path: 'examples', kind: 'directory', state: 'none' },
        { id: 'wr-example-html', path: 'examples/report.html', kind: 'file', state: 'none' },
        { id: 'wr-example-sh', path: 'examples/run-weekly.sh', kind: 'file', state: 'none' },
        { id: 'wr-example-conf', path: 'examples/apache.conf', kind: 'file', state: 'none' },
        { id: 'wr-example-md', path: 'examples/render-check.md', kind: 'file', state: 'none' },
        // 数据文件样本:JSON 树 / JSON 表格 / 非法 JSON 降级 / CSV 行数上限降级各一份
        // (见 mocks/files.ts 的注释)。挂在既有项目树下,故从这里就能点到。
        { id: 'wr-example-schedule', path: 'examples/schedule.json', kind: 'file', state: 'none' },
        { id: 'wr-example-config', path: 'examples/config.json', kind: 'file', state: 'none' },
        { id: 'wr-example-broken', path: 'examples/broken.json', kind: 'file', state: 'none' },
        { id: 'wr-example-export', path: 'examples/large-export.csv', kind: 'file', state: 'none' },
        { id: 'wr-example-ragged', path: 'examples/ragged.csv', kind: 'file', state: 'none' },
        { id: 'wr-readme', path: 'README.md', kind: 'file', state: 'modified' },
        { id: 'wr-progress', path: 'progress.csv', kind: 'file', state: 'modified' },
        { id: 'wr-gitignore', path: '.gitignore', kind: 'file', state: 'none' },
      ],
    },
    {
      id: 'knowledge-base',
      mark: 'KB',
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
  ]],
  ['research', [
    {
      id: 'user-research',
      mark: 'UR',
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
      mark: 'BM',
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
  ]],
  ['writing', [
    {
      id: 'product-docs',
      mark: 'PD',
      name: 'product-docs',
      path: '~/work/product-docs',
      // knowledge / quarterly 两个「等待交互」会话的确认请求各受影响一个文件:
      // release-notes.md(knowledge)与 release-plan.csv(quarterly),等待期间其芯片变 pending。
      entries: [
        { id: 'pd-assets', path: 'assets', kind: 'directory', state: 'none' },
        { id: 'pd-logo', path: 'assets/logo.svg', kind: 'file', state: 'none' },
        { id: 'pd-deck', path: 'assets/release-deck.pdf', kind: 'file', state: 'none' },
        { id: 'pd-drafts', path: 'drafts', kind: 'directory', state: 'none' },
        { id: 'pd-drafts-v2', path: 'drafts/v2', kind: 'directory', state: 'none' },
        { id: 'pd-drafts-notes', path: 'drafts/v2/notes.md', kind: 'file', state: 'modified' },
        { id: 'pd-plan', path: 'release-plan.csv', kind: 'file', state: 'modified' },
        { id: 'pd-release', path: 'release-notes.md', kind: 'file', state: 'created' },
      ],
    },
    {
      id: 'changelog',
      mark: 'CL',
      name: 'changelog',
      path: '~/work/changelog',
      entries: [
        { id: 'cl-entries', path: 'entries', kind: 'directory', state: 'none' },
        { id: 'cl-10', path: 'entries/1.0.md', kind: 'file', state: 'none' },
        { id: 'cl-unreleased', path: 'entries/unreleased.md', kind: 'file', state: 'modified' },
        { id: 'cl-readme', path: 'README.md', kind: 'file', state: 'none' },
      ],
    },
  ]],
])

// 项目级 Skill 来自项目 .claude/skills;新打开的目录没有预置项目 Skill。
const PROJECT_SKILL_SEEDS: Record<string, Pick<Skill, 'command' | 'description'>[]> = {
  'weekly-report': [
    { command: 'weekly-status', description: '汇总本周进展、阻塞项与下一步负责人' },
    { command: 'release-check', description: '核对发布前的验证、通知与回退准备' },
    { command: 'incident-review', description: '按时间线梳理故障影响与改进项' },
  ],
  'knowledge-base': [
    { command: 'kb-ingest', description: '整理新文档的来源、负责人和知识库索引' },
    { command: 'doc-lint', description: '检查文档链接、标题结构与过期内容' },
  ],
  'user-research': [
    { command: 'interview-synthesis', description: '从访谈原话归纳观察、假设与反例' },
    { command: 'segment-analysis', description: '对比用户分群的任务与需求差异' },
  ],
  benchmarks: [
    { command: 'bench-run', description: '执行基准套件并记录环境与结果' },
    { command: 'perf-triage', description: '定位性能回退并整理复测路径' },
  ],
  'product-docs': [
    { command: 'release-notes', description: '按模块整理发布说明与验证方式' },
    { command: 'voice-check', description: '核对产品术语、语气与表达一致性' },
  ],
  changelog: [
    { command: 'changelog-entry', description: '把本次改动整理为分类变更条目' },
    { command: 'version-bump', description: '检查版本号、变更范围与发布记录' },
  ],
}

export function mockProjectSkills(projectId: string): Skill[] {
  const owner = [...projectStore.entries()].find(([, projects]) => projects.some((project) => project.id === projectId))
  if (owner === undefined) return []
  const projectSkills: Skill[] = (PROJECT_SKILL_SEEDS[projectId] ?? []).map((seed) => ({
    ...seed, id: `${projectId}:${seed.command}`, name: seed.command, scope: 'project', sourceName: '',
  }))
  // 插件在 Agent 层装载且 Skill 带命名空间;刻意不采用 project-scope plugin 安装记录。
  const states = pluginStates.get(scopeKey('agent', owner[0]))
  const pluginSkills = new Map<string, Skill>()
  for (const marketplace of marketplaceStore) {
    for (const plugin of marketplace.plugins) {
      if (states?.get(pluginKey(marketplace.id, plugin.id))?.enabled !== true) continue
      for (const seed of plugin.skills ?? []) {
        const command = `${plugin.id}:${seed.name}`
        if (pluginSkills.has(command)) continue
        pluginSkills.set(command, {
          ...seed, id: `agent:${owner[0]}:${command}`, command, scope: 'agentPlugin', sourceName: plugin.name,
        })
      }
    }
  }
  return [
    ...projectSkills.sort((a, b) => a.command.localeCompare(b.command)),
    ...[...pluginSkills.values()].sort((a, b) => a.command.localeCompare(b.command)),
  ]
}

// 关闭会移除 projectStore 的条目,故另留独立种子快照供重新打开同目录时恢复。
const projectSeeds = [...projectStore.values()].flat().map((project) => ({
  ...project,
  entries: project.entries.map((entry) => ({ ...entry })),
}))

// Agent Host 上检测到的候选目录(供「打开项目」列表渲染与搜索),含 git / 非 git 两类。
// fileCount 是**打开前**检测到的文件数(readdir 的粗计数),与已打开项目树里的**条目数**
// (Project.entryCount = ProjectSeed.entries.length)概念不同;但演示里两者指同一批内容,
// 口径必须一致(否则会出现「候选说 9 个、打开后 13 条」的观感矛盾),故对应同一目录的候选项
// 一律与该项目对齐:weekly-report 23 = entries.length,product-docs 8 = entries.length,
// knowledge-base 5 = entries.length。其余候选(api-server / design-tokens / notes / scratch)
// 尚未打开,没有可对齐的项目,保持各自的检测值。
const projectCandidates: ProjectCandidate[] = [
  { path: '~/work/weekly-report', name: 'weekly-report', fileCount: 23, isGitRepo: true },
  { path: '~/work/knowledge-base', name: 'knowledge-base', fileCount: 5, isGitRepo: false },
  { path: '~/work/product-docs', name: 'product-docs', fileCount: 8, isGitRepo: true },
  { path: '~/work/api-server', name: 'api-server', fileCount: 42, isGitRepo: true },
  { path: '~/work/design-tokens', name: 'design-tokens', fileCount: 18, isGitRepo: true },
  { path: '~/Documents/notes', name: 'notes', fileCount: 7, isGitRepo: false },
  { path: '~/work/scratch', name: 'scratch', fileCount: 3, isGitRepo: false },
]

// 由项目 id 反推它挂在哪个 Agent 上。找不到时回退第一个 Agent(正常路径不会发生:
// API 层在调用前已校验项目存在)。
function projectAgent(projectId: string): AgentId {
  for (const [agentId, projects] of projectStore) {
    if (projects.some((project) => project.id === projectId)) return agentId
  }
  return agentStore[0]?.id ?? 'planning'
}

// 读写项目表:读走只读回退(未知 Agent 得到空列表),写之前确保该 Agent 有一格。
function projectsFor(agentId: AgentId): ProjectSeed[] {
  const existing = projectStore.get(agentId)
  if (existing !== undefined) return existing
  const created: ProjectSeed[] = []
  projectStore.set(agentId, created)
  return created
}

// 项目列表是**摘要**:只给名称 / 路径 / 条目数,entries 留空 —— 树由「取项目树」按需加载。
export function mockProjects(agentId: AgentId): Project[] {
  return (projectStore.get(agentId) ?? []).map((project) => ({
    id: project.id,
    name: project.name,
    mark: project.mark,
    path: project.path,
    entryCount: project.entries.length,
    entries: [],
  }))
}

// 某个 Agent 当前打开的全部项目 id —— 会话装载按它取「这个 Agent 名下所有已打开项目的会话」。
export function mockProjectIdsOf(agentId: AgentId): string[] {
  return (projectStore.get(agentId) ?? []).map((project) => project.id)
}

// 打开单个项目的条目树(扁平数组)。项目不存在时返回 null,由 API 层转成失败结果。
export function mockProjectTree(projectId: string): ProjectEntry[] | null {
  for (const projects of projectStore.values()) {
    const project = projects.find((item) => item.id === projectId)
    if (project) return project.entries.map((entry) => ({ ...entry }))
  }
  return null
}

// 候选目录的**已知缩写**:已列在候选表里的目录预先给好 2–4 字符的缩写,打开后不再现算,
// 保证候选与打开后的 tab 前缀一致(与标识色按 path 取号同一思路:候选阶段就定得下来)。
const PROJECT_MARKS: Record<string, string> = {
  'weekly-report': 'WR',
  'knowledge-base': 'KB',
  'product-docs': 'PD',
  'api-server': 'AS',
  'design-tokens': 'DT',
  notes: 'NT',
  scratch: 'SC',
}

// 未知目录名的缩写回退:取各段首字母(最多 3 个),够短且确定。
function markFor(name: string): string {
  const known = PROJECT_MARKS[name]
  if (known !== undefined) return known
  const letters = name.split(/[^a-zA-Z0-9]+/).filter((part) => part !== '').map((part) => part[0]?.toUpperCase() ?? '')
  return letters.slice(0, 3).join('') || name.slice(0, 2).toUpperCase()
}

export function mockProjectCandidates(): ProjectCandidate[] {
  return projectCandidates.map((candidate) => ({ ...candidate }))
}

// 打开项目:按候选目录的 path 新建一个项目并加入该 Agent 的列表。
// 已知目录恢复原种子条目树;真正的新目录才生成确定的样例内容(真实场景由宿主读取磁盘)。
export function mockOpenProject(agentId: AgentId, path: string): Project {
  const candidate = projectCandidates.find((item) => item.path === path)
  const name = candidate?.name ?? path.split('/').at(-1) ?? path
  const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const seed = projectSeeds.find((item) => item.path === path) ?? projectSeeds.find((item) => item.name === name)
  const entries: ProjectEntry[] = seed?.entries.map((entry) => ({ ...entry })) ?? [
    { id: `${slug}-src`, path: 'src', kind: 'directory', state: 'none' },
    { id: `${slug}-index`, path: 'src/index.ts', kind: 'file', state: 'none' },
    { id: `${slug}-readme`, path: 'README.md', kind: 'file', state: 'none' },
  ]
  const list = projectsFor(agentId)
  const project: ProjectSeed = { id: `${slug}-opened-${list.length}`, name, mark: markFor(name), path, entries }
  list.push(project)
  return { id: project.id, name: project.name, mark: project.mark, path: project.path, entryCount: project.entries.length, entries: [] }
}

// 关闭项目:按 id 从它所属 Agent 的列表里移除(只动这一个,不牵连其它项目)。
export function mockCloseProject(projectId: string): boolean {
  for (const projects of projectStore.values()) {
    const index = projects.findIndex((project) => project.id === projectId)
    if (index >= 0) {
      projects.splice(index, 1)
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
  planning: { status: 'thinking', statusDetail: 'summarizing', modelName: 'Claude Sonnet 5.5', contextUsedTokens: 82000, contextWindowTokens: 200000, elapsedSeconds: 42 },
  research: { status: 'streaming', statusDetail: 'draftingOutline', modelName: 'Claude Sonnet 5.5', contextUsedTokens: 156000, contextWindowTokens: 200000, elapsedSeconds: 65 },
  writing: { status: 'streaming', statusDetail: 'revisingRelease', modelName: 'Claude Opus 5.5', contextUsedTokens: 186000, contextWindowTokens: 200000, elapsedSeconds: 88 },
}
// 自定义 Agent 没有专属遥测种子时用这一份:状态与用量从零开始,不像内置 Agent 那样预设进度。
const DEFAULT_RUNTIME: Omit<AgentRuntime, 'agentId' | 'projectName' | 'projectPath'> = { status: 'idle', statusDetail: '', modelName: t.value.workspace.models[DEFAULT_MODEL.nameKey], contextUsedTokens: 0, contextWindowTokens: 200000, elapsedSeconds: 0 }

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

// 遥测条最后一项表达**该会话所属的项目**(CLI 的 cwd)。项目不存在时回落空串。
// 运行态是否报 waiting 由**当前会话**是否处于 awaiting 决定 —— 会话与项目各管一段:
// 「正在看的这段对话在等你」才该让输入框上方的状态条说等待确认;别的会话在等你,
// 由对话切换器的图标 / 菜单表达(两个区域职责分明,不互相冒充)。
export function mockAgentRuntime(agentId: AgentId, projectId: string, demoState: AppRoute['demoState'], sessionId: string): AgentRuntime {
  const seed = runtimeSeeds[agentId] ?? DEFAULT_RUNTIME
  const agent = agentStore.find((item) => item.id === agentId)
  const project = (projectStore.get(agentId) ?? []).find((item) => item.id === projectId)
  const base: AgentRuntime = {
    agentId,
    ...seed,
    // 模型名取该 Agent 的当前配置:在设置里改模型后,遥测条随之变化,而不是各说各的。
    modelName: t.value.workspace.models[modelById(agent?.model.defaultModelId ?? DEFAULT_MODEL.id).nameKey],
    projectName: project?.name ?? '',
    projectPath: project?.path ?? '',
  }
  // 还没有任何消息的对话**没有运行态**:它不该报「思考中」、不该有已用 context 与计时 ——
  // 否则一段刚建的空对话会显示某个别的会话口吻的「正在汇总本周项目进展」和一个在走的秒表。
  if (mockTranscript(sessionId).length === 0) {
    return { ...base, status: 'idle', statusDetail: '', contextUsedTokens: 0, elapsedSeconds: 0 }
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

// 会话搜索:在**当前 Agent 已装载的全部会话**范围内同时匹配标题与消息正文,顺序与会话列表一致。
// 平权之后没有「当前项目」,搜索不再按单个项目收窄 —— 多项目并行时,用户要找的那段对话
// 可能在任何已打开的项目里。命中理由由判别联合的 reason 表达 —— 正文命中带具体轮次 id
// (可跳转并高亮),标题命中没有轮次可跳。两种理由互斥,不用空串等魔法值编码。
export function mockSearchHits(query: string, demoState: AppRoute['demoState']): ConversationSearchHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const hits: ConversationSearchHit[] = []
  for (const session of mockSessions(demoState)) {
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

// 开发期给校准测试一个读取「页面实际在使用的那份 mock 状态」的入口。
// HMR 会给模块 URL 追加 ?t= 时间戳,测试里再 import('/src/mocks/workspace.ts')
// 可能落到另一个模块实例,读不到页面刚写入的消息;桥接保证读写的是同一份内存状态。
if (import.meta.env.DEV) {
  const host = globalThis as typeof globalThis & { __maixmiaMock?: { mockTranscript: typeof mockTranscript } }
  host.__maixmiaMock = { mockTranscript }
}
