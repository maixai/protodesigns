// Naive UI 主题映射:取值与 src/style.css 的设计 token 同源
// (映射表见 .claude/rules/design-language.md 第 ⑨ 节)。
// Naive 的 themeOverrides 需要静态颜色值,无法引用 CSS 变量,故此处重复取值
// 并在注释里标明来源 token;改 token 时两处必须同步。
// 本页深浅分段共存:浅色映射挂根 provider,深色区块(顶栏 / Hero / 页脚)
// 用嵌套 n-config-provider 挂 darkOverrides(与父级深合并)。
import type { GlobalThemeOverrides } from 'naive-ui'

// 与 --dl-font-sans / --dl-font-mono 同源(系统回退栈,不引入 webfont)。
const FONT_SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"
const FONT_MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Cascadia Mono', monospace"

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

// 深色映射:对应 .dl-scope--dark 的语义角色层(反转中性 ramp + 提亮强调色)。
export const darkOverrides: GlobalThemeOverrides = {
  common: {
    // --dl-accent 深色 / hover(向白提亮派生)/ active(取 accent-500 深色阶)
    primaryColor: '#8cc7b9',
    primaryColorHover: '#a3d2c6',
    primaryColorPressed: '#6fb3a4',
    primaryColorSuppl: '#8cc7b9',
    successColor: '#7fb894',
    warningColor: '#e3b876',
    errorColor: '#d98a80',
    infoColor: '#8fb0c9',
    bodyColor: '#14110e',
    cardColor: '#1c1916',
    modalColor: '#1c1916',
    popoverColor: '#26221d',
    borderColor: '#38332c',
    dividerColor: '#38332c',
    textColor1: '#f5f1ea',
    textColor2: '#d6cfc4',
    textColor3: '#b5aca0',
    textColorDisabled: '#6b6358',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    fontSize: '15px',
    fontSizeSmall: '13px',
    fontWeightStrong: '600',
    fontFamily: FONT_SANS,
    fontFamilyMono: FONT_MONO,
  },
  Button: {
    heightMedium: '36px',
    heightLarge: '44px',
  },
}
