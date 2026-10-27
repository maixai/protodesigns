import type { AgentIdentity } from '../contracts/generated/agent-summary'
import type { IdentityVault } from '../contracts/generated/identity-vault'

// 全部为可辨识的演示数据,不生成真实私钥、PRF 输出或密码学指纹。
export const DEMO_RECOVERY_KEY = 'MIA-DEMO-RECOVERY-2026'
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
    { id: 'passkey-mac', label: 'iCloud 钥匙串 · MacBook Pro', createdAt: '2026-10-01T08:00:00Z', lastUsedAt: '', prfSupported: true, isThisDevice: true },
    { id: 'passkey-phone', label: 'Google 密码管理工具 · Pixel', createdAt: '2026-10-05T08:00:00Z', lastUsedAt: '2026-10-22T08:00:00Z', prfSupported: true, isThisDevice: false },
  ], recoveryKeyConfigured: true, lastUnlockedAt: '',
}
// 与异步读取使用同一内存实体；首帧只读取状态，不复制第二份锁定事实。
export function readIdentityVaultState(): IdentityVault['state'] { return vault.state }
export function mockIdentityVault(): IdentityVault {
  return { ...vault, passkeys: vault.passkeys.map((passkey) => ({ ...passkey })) }
}
export function mockUnlockIdentity(): IdentityVault {
  vault.state = 'unlocked'
  vault.lastUnlockedAt = new Date().toISOString()
  const thisDevice = vault.passkeys.find((passkey) => passkey.isThisDevice)
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
