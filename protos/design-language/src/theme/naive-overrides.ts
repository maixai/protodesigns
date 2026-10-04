// token → Naive UI GlobalThemeOverrides 的映射层。
//
// 设计语言落到 Vue 侧分两层:CSS 变量管自绘样式,themeOverrides 管组件库。
// 本文件只做"结构性映射",不含任何设计判断 —— 设计值全部由 directions.ts 的 seed 提供,
// 因此换方向 / 换主题时这里零改动。
import type { GlobalThemeOverrides } from 'naive-ui'

// 一个设计方向在某一主题下的取值种子:字段名对应设计语义,不直接对应 Naive 的键名。
export interface NaiveSeed {
  readonly primary: string
  readonly primaryHover: string
  readonly primaryPressed: string
  readonly primarySuppl: string
  readonly info: string
  readonly success: string
  readonly warning: string
  readonly error: string
  readonly text1: string
  readonly text2: string
  readonly text3: string
  readonly textDisabled: string
  readonly placeholder: string
  readonly divider: string
  readonly border: string
  readonly body: string
  readonly card: string
  readonly hover: string
  readonly radius: string
  readonly fontSize: string
  readonly controlHeight: string
  readonly fontWeightStrong: string
  // 主色按钮上的文字色:深色主题下主色可能反白(如石墨方向),必须显式指定。
  readonly textOnPrimary: string
  // 面板填充色与描边。玻璃材质下这里传半透明色,组件库的卡片 / 输入框才会跟着变透。
  readonly panelFill: string
  readonly panelBorder: string
}

// 与 style.css 的 --dl-font-sans 保持一致;组件库需要字面量而非 var()。
const FONT_FAMILY =
  "'Inter', 'Inter Variable', 'Source Han Sans SC', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

// 把设计种子映射为 Naive UI 的主题覆盖对象。
export function toThemeOverrides(seed: NaiveSeed): GlobalThemeOverrides {
  return {
    common: {
      primaryColor: seed.primary,
      primaryColorHover: seed.primaryHover,
      primaryColorPressed: seed.primaryPressed,
      primaryColorSuppl: seed.primarySuppl,
      infoColor: seed.info,
      successColor: seed.success,
      warningColor: seed.warning,
      errorColor: seed.error,
      textColorBase: seed.text1,
      textColor1: seed.text1,
      textColor2: seed.text2,
      textColor3: seed.text3,
      textColorDisabled: seed.textDisabled,
      placeholderColor: seed.placeholder,
      dividerColor: seed.divider,
      borderColor: seed.border,
      bodyColor: seed.body,
      cardColor: seed.card,
      hoverColor: seed.hover,
      borderRadius: seed.radius,
      fontSize: seed.fontSize,
      fontWeightStrong: seed.fontWeightStrong,
      fontFamily: FONT_FAMILY,
    },
    Button: {
      textColorPrimary: seed.textOnPrimary,
      textColorHoverPrimary: seed.textOnPrimary,
      textColorPressedPrimary: seed.textOnPrimary,
      textColorFocusPrimary: seed.textOnPrimary,
      textColorDisabledPrimary: seed.textOnPrimary,
      borderRadiusTiny: seed.radius,
      borderRadiusSmall: seed.radius,
      borderRadiusMedium: seed.radius,
      borderRadiusLarge: seed.radius,
      heightTiny: seed.controlHeight,
      heightSmall: seed.controlHeight,
      heightMedium: seed.controlHeight,
      heightLarge: seed.controlHeight,
    },
    Input: {
      color: seed.panelFill,
      border: `1px solid ${seed.panelBorder}`,
      borderRadius: seed.radius,
      heightTiny: seed.controlHeight,
      heightSmall: seed.controlHeight,
      heightMedium: seed.controlHeight,
      heightLarge: seed.controlHeight,
    },
    Card: {
      color: seed.panelFill,
      borderColor: seed.panelBorder,
      borderRadius: seed.radius,
    },
  }
}
