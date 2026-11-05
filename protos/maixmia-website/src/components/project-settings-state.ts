// 统一项目设置窗体内四个配置域共用的状态快照。
// 面板持有自己的加载 / 草稿 / 保存状态,通过 `state` 事件向上报告;窗体据此渲染
// Tab 上的脏标记、底部动作区与关闭确认,不复制任何业务字段。
export type ProjectSettingsTab = 'model' | 'permissions' | 'plugins' | 'mcp'

export type ProjectPanelSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'invalid'

export interface ProjectPanelState {
  status: 'loading' | 'ready' | 'error'
  dirty: boolean
  saving: boolean
  saveState: ProjectPanelSaveState
  saveStateLabel: string
  canSave: boolean
}

// 面板尚未上报时的占位:视作加载中,保存不可用。
export const EMPTY_PANEL_STATE: ProjectPanelState = {
  status: 'loading',
  dirty: false,
  saving: false,
  saveState: 'clean',
  saveStateLabel: '',
  canSave: false,
}
