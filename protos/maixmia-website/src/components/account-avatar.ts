import { readonly, ref } from 'vue'
import type { Result } from '../api/result'

// 中文 / CJK 名取姓名首字;拉丁名取前两个词的首字母大写;空串返回空串。
// 按 Unicode 码点拆分,避免把扩展汉字的代理对截断。
export function toInitials(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return ''
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(trimmed)) {
    return Array.from(trimmed)[0] ?? ''
  }
  return trimmed.split(/\s+/u).slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '').join('').toUpperCase()
}

const ACCEPTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const ACCOUNT_AVATAR_ACCEPT = ACCEPTED_AVATAR_TYPES.join(',')
export const ACCOUNT_AVATAR_MAX_BYTES = 5 * 1024 * 1024

export type AvatarReadError = 'type' | 'size' | 'read'

// 头像只存在本次页面会话的内存中;不写账户契约,也不做任何持久化。
const accountAvatarRef = ref<string | null>(null)
export const accountAvatar = readonly(accountAvatarRef)

export function replaceAccountAvatar(dataUrl: string): void {
  accountAvatarRef.value = dataUrl
}

export function resetAccountAvatar(): void {
  accountAvatarRef.value = null
}

function readAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      resolve(typeof reader.result === 'string' ? reader.result : null)
    }, { once: true })
    reader.addEventListener('error', () => resolve(null), { once: true })
    reader.addEventListener('abort', () => resolve(null), { once: true })
    reader.readAsDataURL(file)
  })
}

function canDecodeImage(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(true), { once: true })
    image.addEventListener('error', () => resolve(false), { once: true })
    image.src = dataUrl
  })
}

// 用 Data URL 而非对象 URL,替换与登出时无需额外回收;解码失败不会覆盖原头像。
export async function readAccountAvatar(file: File): Promise<Result<string, AvatarReadError>> {
  if (!ACCEPTED_AVATAR_TYPES.some((type) => type === file.type)) return { ok: false, error: 'type' }
  if (file.size > ACCOUNT_AVATAR_MAX_BYTES) return { ok: false, error: 'size' }
  const dataUrl = await readAsDataUrl(file)
  if (dataUrl === null || !await canDecodeImage(dataUrl)) return { ok: false, error: 'read' }
  return { ok: true, value: dataUrl }
}
