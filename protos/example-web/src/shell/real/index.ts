// 壳能力的生产实现占位:桌面壳(Electron)接入后在此用 IPC 实现 ShellApi。
//
// 原型期不引用本文件 —— src/shell/index.ts 只装配 mock 实现。
// 切换到生产实现时,只改 src/shell/index.ts 的装配处,UI 代码零改动。
import type { ShellApi } from '../ports'

// 创建 Electron 壳实现。
// 生产期改为:contextBridge 暴露的 window.electronAPI → ipcRenderer.invoke 调用主进程。
export function createElectronShell(): ShellApi {
  throw new Error('尚未接入 Electron 壳:生产期用 ipcRenderer.invoke 实现 ShellApi')
}
