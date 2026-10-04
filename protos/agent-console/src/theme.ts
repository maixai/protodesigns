// 深浅色方案:跟随系统 prefers-color-scheme,并允许应用层手动覆盖。
// token 层(style.css)只认 :root[data-theme='dark'],所以这里负责把结果写到根元素。
import { ref, type Ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

export interface ColorSchemeApi {
  readonly mode: Ref<ThemeMode>
  toggle(): void
}

export function useColorScheme(): ColorSchemeApi {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  const mode = ref<ThemeMode>(query.matches ? 'dark' : 'light')
  // 是否已被手动覆盖;覆盖后不再跟随系统变化。
  let isOverridden = false

  function apply(next: ThemeMode): void {
    mode.value = next
    document.documentElement.dataset['theme'] = next
  }

  function handleSystemChange(event: MediaQueryListEvent): void {
    if (!isOverridden) {
      apply(event.matches ? 'dark' : 'light')
    }
  }

  function toggle(): void {
    isOverridden = true
    apply(mode.value === 'dark' ? 'light' : 'dark')
  }

  apply(mode.value)
  query.addEventListener('change', handleSystemChange)

  return { mode, toggle }
}
