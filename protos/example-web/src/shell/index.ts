// 壳能力装配点:UI 层只从这里取 shell,不关心背后是 mock 还是真实实现。
//
// 原型期固定装配 mock(可在 Chrome 里演示桌面行为);
// 生产期改为装配 createElectronShell(),UI 代码零改动。
import { createMockShell } from './mock'
import type { ShellApi } from './ports'

export const shell: ShellApi = createMockShell()

export type { MenuCommandId, MenuGroup, MenuItem, ShellApi, ThemeMode, Unsubscribe, WindowSize } from './ports'
