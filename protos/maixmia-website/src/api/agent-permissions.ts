// 继承 Agent 与项目自有权限 API;模式即时生效,项目规则按 path 独立增删。
import type { AgentPermissions, PermissionModeId, PermissionRule, PermissionRuleKindId } from '../contracts/generated/agent-permissions'
import type { ProjectPermissionGroup } from '../contracts/generated/project-permission-group'
import { useI18n } from '../i18n'
import {
  mockAddAgentPermissionRule, mockAddProjectPermissionRule, mockGetAgentPermissions,
  mockListProjectPermissionGroup, mockRemoveAgentPermissionRule, mockRemoveProjectPermissionRule,
  mockSaveAgentPermissions, mockSaveProjectPermissionGroup,
  mockSetAgentPermissionMode, mockSetProjectPermissionMode,
} from '../mocks/agent-permissions'
import { delay } from '../mocks/delay'
import { currentRoute } from '../router'
import type { Result } from './result'

const { t } = useI18n()

function unavailableError(): Error | null {
  return currentRoute.value.demoState === 'error' ? new Error(t.value.workspace.permissions.loadError) : null
}

function validateRule(pattern: string, existing: readonly PermissionRule[]): Error | null {
  const copy = t.value.workspace.permissions
  const trimmed = pattern.trim()
  if (trimmed === '') return new Error(copy.requiredRule)
  if (/[\r\n]/.test(trimmed)) return new Error(copy.invalidRule)
  const duplicate = existing.some((item) => item.pattern === trimmed)
  return duplicate ? new Error(copy.duplicateRule) : null
}

export async function getAgentPermissions(agentId: string): Promise<Result<AgentPermissions>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockGetAgentPermissions(agentId) }
}

function validateRules(rules: readonly PermissionRule[]): Error | null {
  const patterns = new Set<string>()
  for (const rule of rules) {
    const invalid = validateRule(rule.pattern, [...patterns].map((pattern) => ({ ...rule, pattern })))
    if (invalid !== null) return invalid
    patterns.add(rule.pattern.trim())
  }
  return null
}

function isMode(value: string): value is PermissionModeId {
  return value === 'default' || value === 'dontAsk' || value === 'auto' || value === 'bypassPermissions'
}

export async function saveAgentPermissions(agentId: string, value: AgentPermissions): Promise<Result<AgentPermissions>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  if (value.agentId !== agentId || !isMode(value.defaultMode)) return { ok: false, error: new Error(t.value.workspace.permissions.saveError) }
  const invalid = validateRules(value.rules)
  if (invalid !== null) return { ok: false, error: invalid }
  return { ok: true, value: mockSaveAgentPermissions(agentId, value) }
}

export async function setAgentPermissionMode(agentId: string, mode: PermissionModeId): Promise<Result<AgentPermissions>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockSetAgentPermissionMode(agentId, mode) }
}

export async function addAgentPermissionRule(agentId: string, kind: PermissionRuleKindId, pattern: string): Promise<Result<AgentPermissions>> {
  await delay()
  const unavailable = unavailableError()
  if (unavailable !== null) return { ok: false, error: unavailable }
  const invalid = validateRule(pattern, mockGetAgentPermissions(agentId).rules)
  if (invalid !== null) return { ok: false, error: invalid }
  return { ok: true, value: mockAddAgentPermissionRule(agentId, kind, pattern.trim()) }
}

export async function removeAgentPermissionRule(agentId: string, ruleId: string): Promise<Result<AgentPermissions>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockRemoveAgentPermissionRule(agentId, ruleId) }
}

export async function listProjectPermissionGroup(path: string): Promise<Result<ProjectPermissionGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockListProjectPermissionGroup(path) }
}

export async function saveProjectPermissionGroup(path: string, value: ProjectPermissionGroup): Promise<Result<ProjectPermissionGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  if (value.path !== path || (value.modeOverride !== null && !isMode(value.modeOverride))) {
    return { ok: false, error: new Error(t.value.workspace.permissions.saveError) }
  }
  const invalid = validateRules(value.rules)
  if (invalid !== null) return { ok: false, error: invalid }
  return { ok: true, value: mockSaveProjectPermissionGroup(path, value) }
}

export async function setProjectPermissionMode(path: string, mode: PermissionModeId | null): Promise<Result<ProjectPermissionGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockSetProjectPermissionMode(path, mode) }
}

export async function addProjectPermissionRule(path: string, kind: PermissionRuleKindId, pattern: string): Promise<Result<ProjectPermissionGroup>> {
  await delay()
  const unavailable = unavailableError()
  if (unavailable !== null) return { ok: false, error: unavailable }
  const invalid = validateRule(pattern, mockListProjectPermissionGroup(path).rules)
  if (invalid !== null) return { ok: false, error: invalid }
  return { ok: true, value: mockAddProjectPermissionRule(path, kind, pattern.trim()) }
}

export async function removeProjectPermissionRule(path: string, ruleId: string): Promise<Result<ProjectPermissionGroup>> {
  await delay()
  const error = unavailableError()
  if (error !== null) return { ok: false, error }
  return { ok: true, value: mockRemoveProjectPermissionRule(path, ruleId) }
}
