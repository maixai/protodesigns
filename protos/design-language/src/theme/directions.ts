// 设计语言 Tungsten 青瓷 —— 已定稿的唯一语言。
//
// 探索阶段的另外两套语言(Obsidian 玄铁 / Grid 正交)与两组材质(Folio / Linen)已否决,
// 保留在 git 历史里。当前站点是这一套语言的**调教台**:先把要素调准,再写进规范。
//
// .claude/rules/design-language.md 是事实源,本文件是它的单向派生呈现。
import type { GlobalThemeOverrides } from 'naive-ui'

import type { NaiveSeed } from './naive-overrides'
import { toThemeOverrides } from './naive-overrides'

export type DirectionId = 'celadon'
export type ThemeMode = 'light' | 'dark'

export interface DirectionFact {
  readonly label: string
  readonly value: string
}

export interface Direction {
  readonly id: DirectionId
  readonly name: string
  readonly tagline: string
  readonly description: string
  readonly facts: readonly DirectionFact[]
  readonly naive: Readonly<Record<ThemeMode, GlobalThemeOverrides>>
}

const SEEDS: Readonly<Record<ThemeMode, NaiveSeed>> = {
  light: {
    primary: '#2e6f63',
    primaryHover: '#3f8a7c',
    primaryPressed: '#245a50',
    primarySuppl: '#63a79a',
    info: '#3d5a70',
    success: '#3f6b4f',
    warning: '#8a6420',
    error: '#9c4038',
    text1: '#221d18',
    text2: '#5c554d',
    text3: '#756c63',
    textDisabled: '#b3aaa0',
    placeholder: '#756c63',
    divider: '#e8e4dc',
    border: '#e8e4dc',
    body: '#faf8f5',
    card: '#ffffff',
    hover: '#f4f1ec',
    radius: '8px',
    fontSize: '15px',
    controlHeight: '36px',
    fontWeightStrong: '600',
    textOnPrimary: '#ffffff',
    panelFill: '#ffffff',
    panelBorder: '#e8e4dc',
  },
  dark: {
    primary: '#8cc7b9',
    primaryHover: '#a3d5c9',
    primaryPressed: '#6fb3a4',
    primarySuppl: '#63a79a',
    info: '#8fb0c9',
    success: '#7fb894',
    warning: '#e3b876',
    error: '#d98a80',
    text1: '#f5f1ea',
    text2: '#b5aca0',
    text3: '#8f867a',
    textDisabled: '#6b6358',
    placeholder: '#8f867a',
    divider: '#38332c',
    border: '#38332c',
    body: '#14110e',
    card: '#1c1916',
    hover: '#26221d',
    radius: '8px',
    fontSize: '15px',
    controlHeight: '36px',
    fontWeightStrong: '600',
    textOnPrimary: '#10201c',
    panelFill: '#1c1916',
    panelBorder: '#38332c',
  },
}

const META: Omit<Direction, 'naive'> = {
  id: 'celadon',
  name: 'Tungsten 青瓷',
  tagline: '克制的科技感',
  description:
    '精确、克制、几乎不用装饰来表态。暖调中性底把"纸感"带进来,青绿只用在行动点与活动态上;暖珀退到标签与提示里作点缀。科技感来自发丝描边的结构秩序与等宽字体承担的技术信息。排版按中文的阅读特性单独定值,而不是把西文的一套照搬过来。',
  facts: [
    { label: '中性色', value: '暖调 chromatic neutral(色相 35°,饱和约 8%)' },
    { label: '正文色', value: '暖近黑 #221D18,不用纯黑' },
    { label: '强调色', value: '青瓷 #2E6F63;暖珀 #8A6420 作点缀' },
    { label: '语气字体', value: '无衬线(humanist);技术信息走等宽' },
    { label: '基准字号 / 行高', value: '15px / 1.7(中文正文)' },
    { label: '行宽', value: '35em(中文按 em 计,不用 ch)' },
    { label: '数字 / 混排', value: '等宽数字 + 中西文自动间距' },
    { label: '字重上限', value: '600,不用 700' },
    { label: '层级机制', value: '发丝描边 + 极轻阴影' },
  ],
}

export const DIRECTIONS: readonly Direction[] = [
  {
    ...META,
    naive: {
      light: toThemeOverrides(SEEDS.light),
      dark: toThemeOverrides(SEEDS.dark),
    },
  },
]

// 按 id 取语言;找不到时返回 undefined。
export function findDirection(id: string): Direction | undefined {
  return DIRECTIONS.find((direction) => direction.id === id)
}

// 当前唯一语言:调教台的默认作用域。
export const CURRENT_DIRECTION: Direction = DIRECTIONS[0] as Direction
