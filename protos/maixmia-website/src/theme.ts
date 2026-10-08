// Naive UI 主题映射:取值与 src/style.css 的设计 token 同源
// (映射表见 .claude/rules/design-language.md 第 ⑨ 节)。
// Naive 的 themeOverrides 需要静态颜色值,无法引用 CSS 变量,故此处重复取值
// 并在注释里标明来源 token;改 token 时两处必须同步。
// 本页整体深色(固定节奏,不响应系统偏好):根部 provider 与顶栏都挂 darkOverrides,
// 登录轻提示等浮层由根部 provider 渲染,故一并走深色。
// lightOverrides 保留为浅色作用域(.dl-scope--light)的配对映射,当前页面无组件使用。
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
  // 登录轻提示:message 容器由根部 n-message-provider 渲染(浅色上下文)。
  // Naive 默认 fontSize 14px / padding 10px 20px 均不在设计 token 阶内,显式对齐;
  // 阴影默认是冷黑 boxShadow2(rgba(0,0,0,.12/.08/.05)),对齐到暖调 --dl-shadow-md。
  Message: {
    // --dl-font-size-sm
    fontSize: '13px',
    // --dl-space-3 / --dl-space-4
    padding: '12px 16px',
    // --dl-radius-md
    borderRadius: '8px',
    // --dl-radius-sm
    closeBorderRadius: '6px',
    // --dl-shadow-md(浅色)
    boxShadow: '0 2px 8px rgba(52, 43, 33, 0.07)',
    boxShadowInfo: '0 2px 8px rgba(52, 43, 33, 0.07)',
    boxShadowSuccess: '0 2px 8px rgba(52, 43, 33, 0.07)',
    boxShadowError: '0 2px 8px rgba(52, 43, 33, 0.07)',
    boxShadowWarning: '0 2px 8px rgba(52, 43, 33, 0.07)',
    boxShadowLoading: '0 2px 8px rgba(52, 43, 33, 0.07)',
    // 已知偏离留档:message 容器的 z-index 是 Naive 内建字面量 6000
    // (写死在 message 的 CSSr 样式里,不是主题变量),无法经 themeOverrides
    // 映射到 --dl-z-toast(400);按规范不用 !important 硬压,登记为已知偏离。
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
  // 登录轻提示等浮层:整页深色,故浮层也走深色映射(根部 provider 已改挂本映射)。
  // 背景与文字取自 Naive 的 popoverColor / textColor2(深色下即 #26221d / #d6cfc4),
  // 无需另设;此处只把尺寸与阴影对齐到设计 token。
  Message: {
    // --dl-font-size-sm
    fontSize: '13px',
    // --dl-space-3 / --dl-space-4
    padding: '12px 16px',
    // --dl-radius-md
    borderRadius: '8px',
    // --dl-radius-sm
    closeBorderRadius: '6px',
    // --dl-shadow-md(深色取值见 style.css)
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    boxShadowInfo: '0 2px 8px rgba(0, 0, 0, 0.2)',
    boxShadowSuccess: '0 2px 8px rgba(0, 0, 0, 0.2)',
    boxShadowError: '0 2px 8px rgba(0, 0, 0, 0.2)',
    boxShadowWarning: '0 2px 8px rgba(0, 0, 0, 0.2)',
    boxShadowLoading: '0 2px 8px rgba(0, 0, 0, 0.2)',
  },
}
