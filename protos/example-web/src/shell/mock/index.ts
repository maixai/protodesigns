// 壳能力契约的浏览器实现:让原型在 Chrome 里就能演示桌面行为,供设计评审验证。
// 生产期由 src/shell/real 的 Electron 实现替换,UI 代码不感知差异。
import type {
  MenuCommandId,
  MenuGroup,
  ShellApi,
  ThemeMode,
  WindowSize,
} from '../ports'

// 菜单栏结构:分组顺序沿用桌面惯例 App / File / Edit / View / Window / Help。
const MENU_GROUPS: readonly MenuGroup[] = [
  {
    label: 'File',
    items: [
      { id: 'file.new', label: '新建', accelerator: 'CmdOrCtrl+N' },
      { id: 'file.open', label: '打开…', accelerator: 'CmdOrCtrl+O' },
      { id: 'file.save', label: '保存', accelerator: 'CmdOrCtrl+S' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { id: 'edit.undo', label: '撤销', accelerator: 'CmdOrCtrl+Z' },
      { id: 'edit.redo', label: '重做', accelerator: 'CmdOrCtrl+Shift+Z' },
    ],
  },
  {
    label: 'View',
    items: [{ id: 'view.toggle-theme', label: '切换深浅色', accelerator: 'CmdOrCtrl+T' }],
  },
  {
    label: 'Window',
    items: [
      { id: 'window.minimize', label: '最小化', accelerator: 'CmdOrCtrl+M' },
      { id: 'window.zoom', label: '缩放', accelerator: 'CmdOrCtrl+Shift+M' },
    ],
  },
  {
    label: 'Help',
    items: [{ id: 'help.docs', label: '文档', accelerator: 'F1' }],
  },
]

// 快捷键 → 菜单命令的映射:与上面的 accelerator 对应。
const ACCELERATOR_MAP: ReadonlyMap<string, MenuCommandId> = new Map([
  ['n', 'file.new'],
  ['o', 'file.open'],
  ['s', 'file.save'],
  ['z', 'edit.undo'],
  ['t', 'view.toggle-theme'],
  ['m', 'window.minimize'],
  ['F1', 'help.docs'],
])

// 创建浏览器端壳能力实现。
export function createMockShell(): ShellApi {
  // 手动切换的覆盖值:为 null 时跟随系统。用于演示"应用可以覆盖系统主题"。
  let themeOverride: ThemeMode | null = null
  const commandHandlers = new Set<(id: MenuCommandId) => void>()
  const themeHandlers = new Set<(mode: ThemeMode) => void>()
  const resizeHandlers = new Set<(size: WindowSize) => void>()

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

  // 当前生效的主题:手动覆盖优先,否则跟随系统。
  function resolveTheme(): ThemeMode {
    if (themeOverride !== null) {
      return themeOverride
    }
    return darkQuery.matches ? 'dark' : 'light'
  }

  // 通知所有主题订阅者。
  function emitTheme(): void {
    const mode = resolveTheme()
    for (const handler of themeHandlers) {
      handler(mode)
    }
  }

  // 通知所有命令订阅者。
  function emitCommand(id: MenuCommandId): void {
    for (const handler of commandHandlers) {
      handler(id)
    }
  }

  // 系统深浅色变化:仅在未手动覆盖时生效。
  function handleSystemThemeChange(): void {
    if (themeOverride === null) {
      emitTheme()
    }
  }

  // 窗口尺寸变化。
  function handleResize(): void {
    const size: WindowSize = { width: window.innerWidth, height: window.innerHeight }
    for (const handler of resizeHandlers) {
      handler(size)
    }
  }

  // 应用内快捷键:模拟桌面壳的 accelerator 行为。
  function handleKeydown(event: KeyboardEvent): void {
    const key = event.key === 'F1' ? 'F1' : event.key.toLowerCase()
    const isModifierPressed = event.metaKey || event.ctrlKey
    if (key !== 'F1' && !isModifierPressed) {
      return
    }
    const command = ACCELERATOR_MAP.get(key)
    if (command === undefined) {
      return
    }
    event.preventDefault()
    emitCommand(command)
  }

  darkQuery.addEventListener('change', handleSystemThemeChange)
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeydown)

  return {
    menu: {
      groups: () => MENU_GROUPS,
      onCommand: (handler) => {
        commandHandlers.add(handler)
        return () => commandHandlers.delete(handler)
      },
    },
    theme: {
      current: resolveTheme,
      setOverride: (mode) => {
        themeOverride = mode
        emitTheme()
      },
      onChange: (handler) => {
        themeHandlers.add(handler)
        return () => themeHandlers.delete(handler)
      },
    },
    window: {
      size: () => ({ width: window.innerWidth, height: window.innerHeight }),
      onResize: (handler) => {
        resizeHandlers.add(handler)
        return () => resizeHandlers.delete(handler)
      },
    },
  }
}
