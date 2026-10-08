// zh-CN 词条汇总:Messages 类型的唯一来源;en 必须满足同一类型,缺词条即编译报错。
import { account } from './account'
import { workspace } from './workspace'
import { anywhere } from './anywhere'
import { config } from './config'
import { footer } from './footer'
import { formFactors } from './form-factors'
import { hero } from './hero'
import { install } from './install'
import { nav } from './nav'
import { quickstart } from './quickstart'
import { reach } from './reach'
import { share } from './share'

export const zhCN = {
  meta: {
    title: 'Mia —— 你的 AI Agent,随时随地',
  },
  account,
  workspace,
  nav,
  hero,
  reach,
  formFactors,
  anywhere,
  share,
  config,
  quickstart,
  install,
  footer,
}

export type Messages = typeof zhCN
