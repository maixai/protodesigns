// 壳能力契约:桌面端(以及未来其他宿主)提供的、浏览器原生不具备的能力。
//
// 这是"接口 + 双实现"的原型支点:
//   - 原型期装配 src/shell/mock(纯浏览器实现,可在 Chrome 里演示这些行为);
//   - 生产期改装配 src/shell/real(Electron IPC),**UI 代码零改动**。
//
// 仅 targets 含 desktop 的原型需要本目录。

// 主题模式:跟随系统深浅色。
export type ThemeMode = 'light' | 'dark'

// 菜单命令 id:菜单栏与快捷键共用同一套命令标识。
export type MenuCommandId =
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'edit.undo'
  | 'edit.redo'
  | 'view.toggle-theme'
  | 'window.minimize'
  | 'window.zoom'
  | 'help.docs'

// 单个菜单项。
export interface MenuItem {
  readonly id: MenuCommandId
  readonly label: string
  readonly accelerator: string
}

// 菜单分组:分组名沿用桌面惯例的固定顺序。
export interface MenuGroup {
  readonly label: string
  readonly items: readonly MenuItem[]
}

// 窗口尺寸。
export interface WindowSize {
  readonly width: number
  readonly height: number
}

// 取消订阅函数:调用后停止接收事件。
export type Unsubscribe = () => void

// 壳能力总接口。
export interface ShellApi {
  readonly menu: {
    // 返回菜单栏结构(分组与菜单项)。
    groups(): readonly MenuGroup[]
    // 订阅菜单命令(含快捷键触发的命令)。
    onCommand(handler: (id: MenuCommandId) => void): Unsubscribe
  }
  readonly theme: {
    // 当前主题模式(跟随系统,除非被应用层覆盖)。
    current(): ThemeMode
    // 覆盖主题;传 null 表示恢复跟随系统。
    setOverride(mode: ThemeMode | null): void
    // 订阅主题变化。
    onChange(handler: (mode: ThemeMode) => void): Unsubscribe
  }
  readonly window: {
    // 当前窗口尺寸。
    size(): WindowSize
    // 订阅窗口尺寸变化。
    onResize(handler: (size: WindowSize) => void): Unsubscribe
  }
}
