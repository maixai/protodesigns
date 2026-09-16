// Naive UI 主题覆盖:把墨绿 + stone 设计 token 集中映射到组件。
// 组件内部不再散落 hardcode 视觉值;自定义样式所需的 CSS 变量在 styles/tokens.css 定义。
import type { GlobalThemeOverrides } from 'naive-ui'

// 亮色主题覆盖:墨绿强调色 + stone 中性色,与 tokens.css 保持一致。
export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#3F6B5D',
    primaryColorHover: '#4F8070',
    primaryColorPressed: '#294638',
    primaryColorSuppl: '#6A9C87',
    infoColor: '#3E6B8F',
    successColor: '#3F6B5D',
    warningColor: '#B88A4A',
    errorColor: '#B85C5C',
    textColorBase: '#57534E',
    textColor1: '#1C1917',
    textColor2: '#57534E',
    textColor3: '#A8A29E',
    textColorDisabled: '#D6D3D1',
    placeholderColor: '#A8A29E',
    dividerColor: '#E7E5E4',
    borderColor: '#E7E5E4',
    bodyColor: '#FAFAF9',
    cardColor: '#FFFFFF',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily:
      'Inter, "Inter Variable", "Source Han Sans SC", "Noto Sans SC", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    fontWeight: '400',
    fontWeightStrong: '600',
  },
}
