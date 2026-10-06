// i18n 入口:语言检测、响应式 locale 与类型安全的词条访问器。
// 约定:默认读 navigator.language(zh 开头取 zh-CN,其余回退 en),
// 不做 localStorage 持久化 —— 刷新即回到浏览器语言。
import { computed, ref, watchEffect } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { en } from './messages/en'
import { zhCN } from './messages/zh-CN'
import type { Messages } from './messages/zh-CN'

const messages = {
  'zh-CN': zhCN,
  en,
} as const

export type Locale = keyof typeof messages
export type { Messages }

// 检测浏览器语言:zh 开头 → zh-CN,否则 en。
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

// 模块级单例:整页共享同一份语言状态。
const locale = ref<Locale>(detectLocale())
const t = computed<Messages>(() => messages[locale.value])

// 语言切换时同步 <html lang> 与 <title>。
watchEffect(() => {
  document.documentElement.lang = locale.value
  document.title = t.value.meta.title
})

function setLocale(next: Locale): void {
  locale.value = next
}

export interface I18n {
  locale: Ref<Locale>
  t: ComputedRef<Messages>
  setLocale: (next: Locale) => void
}

export function useI18n(): I18n {
  return { locale, t, setLocale }
}
