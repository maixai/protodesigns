// 继承 Agent 与项目自有权限的内存仓库;项目模式可覆盖,项目规则只追加。
import type { AgentPermissions, PermissionRule, PermissionRuleKindId, PermissionModeId } from '../contracts/generated/agent-permissions'
import type { ProjectPermissionGroup } from '../contracts/generated/project-permission-group'

function rule(id: string, kind: PermissionRuleKindId, pattern: string, ownerId: string, scope: 'agent' | 'project' = 'agent'): PermissionRule {
  return { id, kind, pattern, scope, ownerId }
}

const agentStore = new Map<string, AgentPermissions>([
  ['planning', {
    agentId: 'planning', defaultMode: 'auto',
    rules: [
      rule('planning-deny-env', 'deny', 'Read(./.env)', 'planning'),
      rule('planning-deny-rm', 'deny', 'Bash(rm:*)', 'planning'),
      rule('planning-ask-push', 'ask', 'Bash(git push:*)', 'planning'),
      rule('planning-ask-fetch', 'ask', 'WebFetch(domain:*)', 'planning'),
      rule('planning-allow-read', 'allow', 'Read(./**)', 'planning'),
      rule('planning-allow-test', 'allow', 'Bash(pnpm test:*)', 'planning'),
      rule('planning-allow-issues', 'allow', 'mcp__github__list_issues', 'planning'),
    ],
  }],
  ['research', {
    agentId: 'research', defaultMode: 'auto',
    rules: [
      rule('research-deny-write', 'deny', 'Write(./**)', 'research'),
      rule('research-ask-fetch', 'ask', 'WebFetch(domain:*)', 'research'),
      rule('research-allow-search', 'allow', 'mcp__brave-search__brave_web_search', 'research'),
    ],
  }],
  ['writing', {
    agentId: 'writing', defaultMode: 'auto',
    rules: [
      rule('writing-deny-secret', 'deny', 'Read(./.env)', 'writing'),
      rule('writing-ask-publish', 'ask', 'Bash(pnpm publish:*)', 'writing'),
      rule('writing-allow-docs', 'allow', 'Edit(./docs/**)', 'writing'),
    ],
  }],
])

const projectStore = new Map<string, ProjectPermissionGroup>([
  ['~/work/weekly-report', {
    path: '~/work/weekly-report', followAgent: false, modeOverride: 'dontAsk',
    rules: [
      rule('weekly-deny-prod', 'deny', 'Bash(pnpm deploy:production)', '~/work/weekly-report', 'project'),
      rule('weekly-ask-publish', 'ask', 'Bash(git push:*)', '~/work/weekly-report', 'project'),
      rule('weekly-allow-reports', 'allow', 'Edit(./reports/**)', '~/work/weekly-report', 'project'),
      rule('weekly-allow-preview', 'allow', 'Bash(pnpm preview:*)', '~/work/weekly-report', 'project'),
    ],
  }],
  ['~/work/knowledge-base', { path: '~/work/knowledge-base', followAgent: true, modeOverride: null, rules: [] }],
  ['~/work/user-research', {
    path: '~/work/user-research', followAgent: false, modeOverride: null,
    rules: [
      rule('research-project-deny-raw', 'deny', 'Read(./interviews/raw/**)', '~/work/user-research', 'project'),
      rule('research-project-ask-export', 'ask', 'Bash(pnpm export:*)', '~/work/user-research', 'project'),
    ],
  }],
  ['~/work/benchmarks', { path: '~/work/benchmarks', followAgent: true, modeOverride: null, rules: [] }],
  ['~/work/product-docs', { path: '~/work/product-docs', followAgent: true, modeOverride: null, rules: [] }],
  ['~/work/changelog', { path: '~/work/changelog', followAgent: true, modeOverride: null, rules: [] }],
])

function cloneAgent(value: AgentPermissions): AgentPermissions {
  return structuredClone(value)
}

function cloneProject(value: ProjectPermissionGroup): ProjectPermissionGroup {
  return structuredClone(value)
}

function ensureAgent(agentId: string): AgentPermissions {
  const existing = agentStore.get(agentId)
  if (existing !== undefined) return existing
  const created: AgentPermissions = { agentId, defaultMode: 'auto', rules: [] }
  agentStore.set(agentId, created)
  return created
}

function ensureProject(path: string): ProjectPermissionGroup {
  const existing = projectStore.get(path)
  if (existing !== undefined) return existing
  const created: ProjectPermissionGroup = { path, followAgent: true, modeOverride: null, rules: [] }
  projectStore.set(path, created)
  return created
}

export function mockGetAgentPermissions(agentId: string): AgentPermissions {
  return cloneAgent(ensureAgent(agentId))
}

export function mockSaveAgentPermissions(agentId: string, value: AgentPermissions): AgentPermissions {
  agentStore.set(agentId, cloneAgent(value))
  return mockGetAgentPermissions(agentId)
}

export function mockSetAgentPermissionMode(agentId: string, mode: PermissionModeId): AgentPermissions {
  const current = ensureAgent(agentId)
  current.defaultMode = mode
  return cloneAgent(current)
}

let generatedRuleId = 0

export function mockAddAgentPermissionRule(agentId: string, kind: PermissionRuleKindId, pattern: string): AgentPermissions {
  const current = ensureAgent(agentId)
  generatedRuleId += 1
  current.rules.push(rule(`${agentId}-${kind}-generated-${generatedRuleId}`, kind, pattern, agentId))
  return cloneAgent(current)
}

export function mockRemoveAgentPermissionRule(agentId: string, ruleId: string): AgentPermissions {
  const current = ensureAgent(agentId)
  current.rules = current.rules.filter((item) => item.id !== ruleId)
  return cloneAgent(current)
}

export function mockListProjectPermissionGroup(path: string): ProjectPermissionGroup {
  return cloneProject(ensureProject(path))
}

export function mockSaveProjectPermissionGroup(path: string, value: ProjectPermissionGroup): ProjectPermissionGroup {
  projectStore.set(path, cloneProject(value))
  return mockListProjectPermissionGroup(path)
}

export function mockSetProjectPermissionMode(path: string, mode: PermissionModeId | null): ProjectPermissionGroup {
  const current = ensureProject(path)
  current.modeOverride = mode
  return cloneProject(current)
}

export function mockAddProjectPermissionRule(path: string, kind: PermissionRuleKindId, pattern: string): ProjectPermissionGroup {
  const current = ensureProject(path)
  generatedRuleId += 1
  current.rules.push(rule(`project-${kind}-generated-${generatedRuleId}`, kind, pattern, path, 'project'))
  return cloneProject(current)
}

export function mockRemoveProjectPermissionRule(path: string, ruleId: string): ProjectPermissionGroup {
  const current = ensureProject(path)
  current.rules = current.rules.filter((item) => item.id !== ruleId)
  return cloneProject(current)
}
