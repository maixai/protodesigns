// en 词条汇总:必须满足 Messages 类型(以 zh-CN 为来源),缺词条即编译报错。
import type { Messages } from '../zh-CN'
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

export const en = {
  meta: {
    title: 'Mia — your AI agent, wherever you are',
  },
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
} satisfies Messages
