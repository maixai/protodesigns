import { computed, readonly, ref } from 'vue'
import type { AccountSession } from '../contracts/generated/account-session'
import { ACCOUNT_PROFILE } from '../mocks/console'

// 刻意仅保留内存态:刷新即重置,不写 localStorage、sessionStorage 或 cookie。
const sessionRef = ref<AccountSession>({ status: 'anonymous', profile: null })
export const session = readonly(sessionRef)
export const isAuthenticated = computed(() => sessionRef.value.status === 'authenticated')

export function signIn(): void {
  sessionRef.value = { status: 'authenticated', profile: { ...ACCOUNT_PROFILE } }
}

export function signOut(): void {
  sessionRef.value = { status: 'anonymous', profile: null }
}
