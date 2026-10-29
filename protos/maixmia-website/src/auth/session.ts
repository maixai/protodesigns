import { computed, readonly, ref } from 'vue'
import type { AccountSession } from '../contracts/generated/account-session'
import { ACCOUNT_PROFILE } from '../mocks/account'
import { mockLockIdentity } from '../mocks/identity'
import { resetAccountAvatar } from '../components/account-avatar'
import type { Result } from '../api/result'

// 刻意仅保留内存态:刷新即重置,不写 localStorage、sessionStorage 或 cookie。
const sessionRef = ref<AccountSession>({ status: 'anonymous', profile: null })
export const session = readonly(sessionRef)
export const isAuthenticated = computed(() => sessionRef.value.status === 'authenticated')

// 昵称与头像共享登录生命周期；所有呈现点只读这一份解析后的姓名。
export const ACCOUNT_NICKNAME_MAX_LENGTH = 32
const nicknameOverride = ref('')
export const accountName = computed(() => nicknameOverride.value || sessionRef.value.profile?.name || '')

export function updateAccountNickname(value: string): Result<void, 'length' | 'anonymous'> {
  const nickname = value.trim()
  if (!isAuthenticated.value) return { ok: false, error: 'anonymous' }
  if (Array.from(nickname).length > ACCOUNT_NICKNAME_MAX_LENGTH) return { ok: false, error: 'length' }
  nicknameOverride.value = nickname
  return { ok: true, value: undefined }
}

// 登录流程刻意省略,同步切换,不模拟延迟。
export function signIn(): void {
  sessionRef.value = { status: 'authenticated', profile: { ...ACCOUNT_PROFILE } }
}

export function signOut(): void {
  mockLockIdentity()
  resetAccountAvatar()
  nicknameOverride.value = ''
  sessionRef.value = { status: 'anonymous', profile: null }
}
