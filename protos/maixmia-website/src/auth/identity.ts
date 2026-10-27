import { ref } from 'vue'

// 账户 disclosure 与工作台内原生对话框之间的轻量动作桥;不承载或持久化密钥。
export const identityAction = ref<'security' | 'lock' | ''>('')
export function requestIdentitySecurity(): void { identityAction.value = 'security' }
export function requestIdentityLock(): void { identityAction.value = 'lock' }
