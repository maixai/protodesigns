import type { PairingSession } from '../contracts/generated/pairing-session'
import type { AgentSummary, AgentId } from '../contracts/generated/agent-summary'
import type { Result } from '../api/result'
import { useI18n } from '../i18n'
import { mockAgentIdentity, mockIdentityVault } from './identity'
import { defaultAgentModelConfig, mockAgentSummaries, mockCreateAgent, mockSetAgentIdentity, mockUpdateAgent } from './workspace'

const { t } = useI18n()
const sessions = new Map<string, PairingSession>()
const codes = new Map<string, string>()
const secrets = new Map<string, string>()
const used = new Set<string>()
const attempts = new Map<string, number>()
let sequence = 0
let logIndex = 1045

// 仅演示 32-byte 秘密的形态,不是安全随机数或真实密钥;秘密不进入 PairingSession。
function demoSecret(): string {
  return Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}
export function mockCreatePairing(mode: 'new' | 'existing'): PairingSession {
  sequence += 1
  attempts.delete('manual')
  const id = `pair-${sequence}-${Date.now().toString(36)}`
  const existing = mode === 'existing' ? mockAgentSummaries().find((agent) => agent.id === 'research') : undefined
  const session: PairingSession = {
    id, method: 'link', state: 'waiting', agentName: existing?.name ?? '我的 Mia Agent',
    deviceName: existing?.identity.deviceName ?? '个人工作站', platform: existing?.identity.platform ?? 'Linux · Mia Headless',
    fingerprint: existing?.identity.fingerprint ?? mockAgentIdentity(id).fingerprint,
    safetyCode: `${String(421000 + sequence).slice(0, 3)} ${String(916000 + sequence).slice(-3)}`,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), errorCode: '',
    alreadyTrusted: existing?.identity.trustState === 'trusted',
  }
  sessions.set(id, session)
  codes.set(id, `MIA${String(sequence).padStart(7, '0')}`)
  secrets.set(id, demoSecret())
  return { ...session }
}
// 这两个演示专用读取器仅由「模拟 Agent 端」导入;Web API 不返回秘密或配对码。
export function mockAgentPairingCode(id: string): string { return codes.get(id) ?? '' }
export function mockAgentPairingSecret(id: string): string { return secrets.get(id) ?? '' }
export function mockReadPairing(id: string): Result<PairingSession> {
  const session = sessions.get(id)
  if (session === undefined) return { ok: false, error: new Error(t.value.workspace.security.expired) }
  if (!['complete', 'denied', 'error'].includes(session.state) && Date.parse(session.expiresAt) <= Date.now()) {
    session.state = 'expired'
    session.errorCode = 'expired'
  }
  return { ok: true, value: { ...session } }
}
function usable(id: string): Result<PairingSession> {
  const result = mockReadPairing(id)
  if (!result.ok) return result
  const copy = t.value.workspace.security
  if (used.has(id)) return { ok: false, error: new Error(copy.used) }
  if (result.value.state === 'expired') return { ok: false, error: new Error(copy.expired) }
  if (result.value.state === 'denied') return { ok: false, error: new Error(copy.agentDenied) }
  if (result.value.state === 'error') return { ok: false, error: new Error(copy.networkError) }
  return result
}
function patch(id: string, changes: Partial<PairingSession>): Result<PairingSession> {
  const result = mockReadPairing(id)
  if (!result.ok) return result
  const session = { ...result.value, ...changes }
  sessions.set(id, session)
  return { ok: true, value: { ...session } }
}
export function mockConnectPairingLink(id: string, secret: string): Result<PairingSession> {
  const result = usable(id)
  if (!result.ok) return result
  if (secret === '' || secrets.get(id) !== secret) return { ok: false, error: new Error(t.value.workspace.security.secretError) }
  if (result.value.state !== 'waiting' && result.value.state !== 'review') return { ok: false, error: new Error(t.value.workspace.security.invalidState) }
  return patch(id, { method: 'link', state: 'review' })
}
export function mockSubmitPairingCode(sessionId: string, code: string): Result<PairingSession> {
  // 真实实现必须拆成 lookupId + 本地 PAKE,不可将整串配对码发给平台;这里仅是同页内存模拟。
  const normalized = code.replace(/[\s-]/g, '').toUpperCase()
  const copy = t.value.workspace.security
  const key = sessionId || 'manual'
  const count = (attempts.get(key) ?? 0) + 1
  attempts.set(key, count)
  if (count > 5) return { ok: false, error: new Error(copy.tooMany) }
  if (!/^[A-Z0-9]{10}$/.test(normalized)) return { ok: false, error: new Error(copy.invalidCode) }
  const id = [...codes].find(([id, value]) => value === normalized && (sessionId === '' || sessionId === id))?.[0]
  if (id === undefined) return { ok: false, error: new Error(copy.notFound) }
  const result = usable(id)
  if (!result.ok) return result
  if (result.value.state !== 'waiting' && result.value.state !== 'review') return { ok: false, error: new Error(copy.invalidState) }
  return patch(id, { method: 'code', state: 'review' })
}
export function mockRequestPairingApproval(id: string): Result<PairingSession> {
  if (mockIdentityVault().state !== 'unlocked') return { ok: false, error: new Error(t.value.workspace.security.lockedError) }
  const result = usable(id)
  if (!result.ok) return result
  if (result.value.state !== 'review') return { ok: false, error: new Error(t.value.workspace.security.invalidState) }
  return patch(id, { state: 'awaitingAgent' })
}
export function mockAllowPairing(id: string, isAllowed: boolean): Result<PairingSession> {
  const result = usable(id)
  if (!result.ok) return result
  if (result.value.state !== 'awaitingAgent') return { ok: false, error: new Error(t.value.workspace.security.invalidState) }
  return patch(id, { state: isAllowed ? 'complete' : 'denied', errorCode: isAllowed ? '' : 'agentDenied' })
}
export function mockCancelPairing(id: string): Result<PairingSession> {
  return patch(id, { state: 'denied', errorCode: 'cancelled' })
}
export function mockExpirePairing(id: string, networkFailure = false): Result<PairingSession> {
  return patch(id, { state: networkFailure ? 'error' : 'expired', errorCode: networkFailure ? 'networkError' : 'expired', expiresAt: new Date(Date.now() - 1).toISOString() })
}
export function mockConfirmPairing(id: string, displayName: string, note: string): Result<AgentSummary> {
  const copy = t.value.workspace.security
  if (mockIdentityVault().state !== 'unlocked') return { ok: false, error: new Error(copy.lockedError) }
  const result = mockReadPairing(id)
  if (!result.ok) return result
  if (used.has(id)) return { ok: false, error: new Error(copy.used) }
  if (result.value.state !== 'complete') return { ok: false, error: new Error(copy.invalidState) }
  if (displayName.trim() === '') return { ok: false, error: new Error(t.value.workspace.agentAdmin.nameRequired) }
  const session = result.value
  const existing = mockAgentSummaries().find((agent) => agent.identity.fingerprint === session.fingerprint)
  const config = { name: displayName, note, avatarUrl: existing?.avatarUrl ?? '', model: existing?.model ?? defaultAgentModelConfig() }
  const agent = existing === undefined ? mockCreateAgent(config) : mockUpdateAgent(existing.id, config)
  if (agent === null) return { ok: false, error: new Error(copy.invalidState) }
  logIndex += 1
  const identity = {
    ...mockAgentIdentity(id, session.deviceName, session.platform),
    publicKey: existing?.identity.publicKey ?? `mock-public-key:${id}`,
    fingerprint: session.fingerprint, safetyCode: session.safetyCode, pairedAt: new Date().toISOString(),
    keyVersion: existing?.identity.keyVersion ?? 1, trustLogIndex: logIndex,
    trustRecordId: `trust-${logIndex}`, trustRecordHash: `mock-sha256:${demoSecret()}`,
  }
  const updated = mockSetAgentIdentity(agent.id, identity)
  if (updated === null) return { ok: false, error: new Error(copy.invalidState) }
  used.add(id)
  return { ok: true, value: updated }
}
export function mockRevokeAgent(agentId: AgentId): Result<AgentSummary> {
  const agent = mockAgentSummaries().find((item) => item.id === agentId)
  if (agent === undefined) return { ok: false, error: new Error(t.value.workspace.invalidAgent) }
  const updated = mockSetAgentIdentity(agentId, { ...agent.identity, trustState: 'revoked' })
  return updated === null ? { ok: false, error: new Error(t.value.workspace.invalidAgent) } : { ok: true, value: updated }
}
