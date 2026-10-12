// 工作台的键盘快捷键判定(与 aria-keyshortcuts / title 里的写法保持单一来源)。
//
// 「拆出为悬浮窗口」的快捷键:Ctrl/Cmd+Shift+M。它承担 tab 上那枚「拆出」钮的键盘通路 ——
// 该钮已移出 Tab 序(见 conversation-switcher / file-bar 的注释),WCAG 2.5.7 要求的是
// 「非拖拽入口」,不要求它落在 Tab 序里。
//
// 为什么是这一组:与既有快捷键都不冲突(⌘/Ctrl+K 开会话菜单、Delete 关 tab、
// Ctrl+Shift+PageUp/PageDown 重排 tab、Escape 取消 / 收窗、F6 窗口循环),且不是
// Chromium / WebKit 桌面版的保留组合(m 取「Move out / 拆出」之意)。
export function isTearOutShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'm' || event.key === 'M')
}

// 与 isTearOutShortcut 配套的展示写法(aria-keyshortcuts 用 + 连接键名;面向人的简写
// 「Ctrl/Cmd+Shift+M」在 i18n 词条里 —— 它是随语言展示的文案,不放在这里)。
export const TEAR_OUT_KEYSHORTCUTS = 'Control+Shift+M Meta+Shift+M'
