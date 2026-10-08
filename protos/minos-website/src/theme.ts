// Naive UI 主题映射:取值与 src/style.css 的设计 token 同源
// (映射表见 .claude/rules/design-language.md 第 ⑨ 节)。
// Naive 的 themeOverrides 需要静态颜色值,无法引用 CSS 变量,故此处重复取值
// 并在注释里标明来源 token;改 token 时两处必须同步。
// 本页为纯浅色页,只有一套浅色映射,挂在根部 provider 上。
import type { GlobalThemeOverrides } from 'naive-ui'

// 与 --dl-font-sans / --dl-font-mono 同源(系统回退栈,不引入 webfont)。
const FONT_SANS =
  "'IBM Plex Sans', 'Inter', 'Source Han Sans SC', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"
const FONT_MONO =
  "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, 'Cascadia Mono', monospace"

// 浅色映射:对应 .dl-scope 的语义角色层。
export const lightOverrides: GlobalThemeOverrides = {
  common: {
    // --dl-accent / hover / active(浅色向黑压暗派生)
    primaryColor: '#2e6f63',
    primaryColorHover: '#245a50',
    primaryColorPressed: '#24574d',
    primaryColorSuppl: '#2e6f63',
    // --dl-success / --dl-warning / --dl-error / --dl-info
    successColor: '#3f6b4f',
    warningColor: '#8a6420',
    errorColor: '#9c4038',
    infoColor: '#3d5a70',
    // --dl-bg-base / --dl-bg-elevated
    bodyColor: '#faf8f5',
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    // --dl-border-base
    borderColor: '#e8e4dc',
    dividerColor: '#e8e4dc',
    // --dl-text-primary / secondary / tertiary / disabled
    textColor1: '#221d18',
    textColor2: '#46403a',
    textColor3: '#756c63',
    textColorDisabled: '#b3aaa0',
    // --dl-radius-md / --dl-radius-sm
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    // --dl-font-size-md / --dl-font-size-sm
    fontSize: '15px',
    fontSizeSmall: '13px',
    // 字重上限 600
    fontWeightStrong: '600',
    fontFamily: FONT_SANS,
    fontFamilyMono: FONT_MONO,
  },
  Button: {
    // --dl-control-height / --dl-target-size
    heightMedium: '36px',
    heightLarge: '44px',
  },
}
