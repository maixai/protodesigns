// en 词条汇总:必须满足 Messages 类型(以 zh-CN 为来源),缺词条即编译报错。
import type { Messages } from '../zh-CN'
import { capabilities } from './capabilities'
import { compare } from './compare'
import { footer } from './footer'
import { hero } from './hero'
import { mesh } from './mesh'
import { nav } from './nav'
import { platforms } from './platforms'
import { quickstart } from './quickstart'

export const en = {
  meta: {
    title: 'Minos — every device you own, on one private network',
  },
  nav,
  hero,
  compare,
  capabilities,
  mesh,
  platforms,
  quickstart,
  footer,
} satisfies Messages
