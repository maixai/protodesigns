// 全局明暗模式:模块级响应式状态,供 App 外壳与各方向容器共享。
// 只有这一个切换入口,避免多处各持一份状态而不同步。
import { readonly, ref } from 'vue'

import type { ThemeMode } from './directions'

// 初始值跟随系统偏好 —— 一方面尊重用户设置,另一方面让校准装置能通过
// emulateMedia({ colorScheme }) 直接切到深色,无需模拟点击。
// 测试 / 无 matchMedia 的环境下回落为浅色。
const prefersDark =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false

const mode = ref<ThemeMode>(prefersDark ? 'dark' : 'light')

// 在任何组件挂载前就把初始主题写到根元素,避免首帧闪一下浅色。
if (typeof document !== 'undefined') {
  document.documentElement.dataset['theme'] = mode.value
}

// 切换明暗,并同步到根元素供 CSS 变量层(:root[data-theme='dark'])读取。
export function setThemeMode(next: ThemeMode): void {
  mode.value = next
  document.documentElement.dataset['theme'] = next
}

// 在明暗之间翻转,供顶部工具栏的切换按钮使用。
export function toggleThemeMode(): void {
  setThemeMode(mode.value === 'dark' ? 'light' : 'dark')
}

export const themeMode = readonly(mode)
