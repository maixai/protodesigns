import type { AgentIdentity } from '../contracts/generated/agent-summary'
import type { IdentityVault, UnlockMethodId } from '../contracts/generated/identity-vault'
import type { DeviceUnlockCapability } from '../contracts/generated/device-unlock-capability'
import type { RecoveryKeyReveal } from '../contracts/generated/recovery-key-reveal'

// 全部为可辨识的演示数据，不生成真实私钥、PRF 输出或密码学指纹。
export const DEMO_RECOVERY_KEY = 'MIA-DEMO-RECOVERY-2026'
let recoveryKey = DEMO_RECOVERY_KEY
let recoveryGeneration = 0

function syncUnlockMethods(): void {
  const methods: UnlockMethodId[] = []
  if (vault.passkeys.some((passkey) => passkey.canUnlock)) methods.push('passkey')
  if (vault.recoveryKeyConfigured) methods.push('recoveryKey')
  vault.unlockMethods = methods
}

export function mockFingerprint(seed: string): string {
  return `DEMO ${Array.from({ length: 8 }, (_, index) => ((seed.charCodeAt(index % seed.length) + index * 173) % 65536).toString(16).padStart(4, '0').toUpperCase()).join(' ')}`
}
export function mockAgentIdentity(seed: string, deviceName = '个人 MacBook Pro', platform = 'macOS · Mia Desktop'): AgentIdentity {
  return {
    publicKey: `mock-public-key:${seed}`, fingerprint: mockFingerprint(seed), trustState: 'trusted',
    pairedAt: '2026-10-20T09:30:00Z', lastSeenAt: new Date().toISOString(), deviceName, platform,
    keyVersion: 1, trustRecordId: `trust-${seed}`, trustLogIndex: seed === 'planning' ? 1042 : seed === 'research' ? 1043 : seed === 'writing' ? 1044 : 0,
    trustRecordHash: `mock-sha256:${seed.padEnd(64, '0').slice(0, 64)}`, safetyCode: '428 916',
  }
}
const vault: IdentityVault = {
  state: 'locked', publicKey: 'mock-user-public-key:v1', fingerprint: mockFingerprint('user-v1'), keyVersion: 1,
  passkeys: [
    { id: 'passkey-mac', label: 'iCloud 钥匙串 · MacBook Pro', createdAt: '2026-10-01T08:00:00Z', lastUsedAt: '', prfSupported: true, canUnlock: true, backupEligible: true, isThisDevice: true },
    { id: 'passkey-phone', label: 'Google 密码管理工具 · Pixel', createdAt: '2026-10-05T08:00:00Z', lastUsedAt: '2026-10-22T08:00:00Z', prfSupported: true, canUnlock: true, backupEligible: true, isThisDevice: false },
    { id: 'passkey-work', label: 'Chrome · 工作电脑', createdAt: '2026-10-12T08:00:00Z', lastUsedAt: '', prfSupported: false, canUnlock: false, backupEligible: false, isThisDevice: false },
  ], unlockMethods: ['passkey', 'recoveryKey'], recoveryKeyConfigured: true, lastUnlockedAt: '',
}
// 与异步读取使用同一内存实体；首帧只读取状态，不复制第二份锁定事实。
export function readIdentityVaultState(): IdentityVault['state'] { return vault.state }
export function readRecoveryKey(): string { return recoveryKey }
export function mockIdentityVault(): IdentityVault {
  return { ...vault, passkeys: vault.passkeys.map((passkey) => ({ ...passkey })), unlockMethods: [...vault.unlockMethods] }
}
export function mockDeviceUnlockCapability(): DeviceUnlockCapability {
  return {
    prfAvailable: true,
    localPasskeyCount: vault.passkeys.filter((passkey) => passkey.canUnlock && passkey.isThisDevice).length,
    canUseRecoveryKey: vault.recoveryKeyConfigured,
    canRequestDeviceTransfer: false,
  }
}
export function mockUnlockIdentity(): IdentityVault {
  vault.state = 'unlocked'
  vault.lastUnlockedAt = new Date().toISOString()
  const thisDevice = vault.passkeys.find((passkey) => passkey.isThisDevice && passkey.canUnlock)
  if (thisDevice !== undefined) thisDevice.lastUsedAt = vault.lastUnlockedAt
  return mockIdentityVault()
}
export function mockLockIdentity(): IdentityVault {
  vault.state = 'locked'
  return mockIdentityVault()
}
export function mockResetIdentity(): IdentityVault {
  vault.keyVersion += 1
  vault.publicKey = `mock-user-public-key:v${vault.keyVersion}`
  vault.fingerprint = mockFingerprint(`user-v${vault.keyVersion}`)
  return mockUnlockIdentity()
}
export function mockAddPasskey(): IdentityVault {
  const sequence = vault.passkeys.filter((passkey) => passkey.label.startsWith('1Password · 本机')).length
  const label = sequence === 0 ? '1Password · 本机' : `1Password · 本机 ${sequence + 1}`
  vault.passkeys.push({
    id: `passkey-1password-${Date.now()}-${sequence}`, label, createdAt: new Date().toISOString(), lastUsedAt: '',
    prfSupported: true, canUnlock: true, backupEligible: true, isThisDevice: true,
  })
  syncUnlockMethods()
  return mockIdentityVault()
}
export function mockRemovePasskey(id: string): IdentityVault | Error {
  const target = vault.passkeys.find((passkey) => passkey.id === id)
  if (target === undefined) return new Error('Passkey not found')
  const remaining = vault.passkeys.filter((passkey) => passkey.id !== id)
  if (target.canUnlock && !remaining.some((passkey) => passkey.canUnlock) && !vault.recoveryKeyConfigured) {
    return new Error('At least one unlock method is required')
  }
  vault.passkeys = remaining
  syncUnlockMethods()
  return mockIdentityVault()
}
export function mockRegenerateRecoveryKey(): RecoveryKeyReveal {
  recoveryGeneration += 1
  recoveryKey = `MIA-DEMO-RECOVERY-2026-${String(recoveryGeneration).padStart(2, '0')}`
  vault.recoveryKeyConfigured = true
  syncUnlockMethods()
  return { recoveryKey, generatedAt: new Date().toISOString(), vault: mockIdentityVault() }
}
