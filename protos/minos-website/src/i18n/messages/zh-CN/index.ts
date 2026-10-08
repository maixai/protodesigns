// zh-CN 词条汇总:Messages 类型的唯一来源;en 必须满足同一类型,缺词条即编译报错。
import { account } from './account'
import { consoleMessages } from './console'
import { capabilities } from './capabilities'
import { compare } from './compare'
import { footer } from './footer'
import { hero } from './hero'
import { mesh } from './mesh'
import { nav } from './nav'
import { platforms } from './platforms'
import { quickstart } from './quickstart'

export const zhCN = {
  meta: {
    title: 'Minos —— 把每一台设备,放进同一张私有网络',
  },
  nav,
  account,
  console: consoleMessages,
  hero,
  compare,
  capabilities,
  mesh,
  platforms,
  quickstart,
  footer,
}

export type Messages = typeof zhCN
