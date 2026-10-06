// 首页结构性数据:全部类型来自契约生成物(src/contracts/generated/),不手写结构。
// 文案一律不在这里(在 i18n 词条里);这里只有 id、图标键与序号。
import type { ConfigKind } from '../contracts/generated/config-kind'
import type { FormFactor } from '../contracts/generated/form-factor'
import type { NoticeChannel } from '../contracts/generated/notice-channel'
import type { OnboardingStep } from '../contracts/generated/onboarding-step'
import type { ReachSurface } from '../contracts/generated/reach-surface'
import type { ValueProp } from '../contracts/generated/value-prop'
import type { Messages } from '../i18n'

// 词条键:条目按契约 id 索引到 i18n 词条,缺词条即编译报错。
type FormFactorKey = keyof Messages['formFactors']['items']
type ReachKey = keyof Messages['reach']['items']
type NoticeKey = keyof Messages['anywhere']['channels']
type ConfigKindKey = keyof Messages['config']['items']
type StepKey = keyof Messages['quickstart']['items']

// 两种形态:桌面 App(本地)与 headless(后台远程)。
export const formFactors: readonly (FormFactor & { id: FormFactorKey })[] = [
  { id: 'desktopApp', icon: 'monitor' },
  { id: 'headless', icon: 'server' },
]

// 可达面:桌面 App / 浏览器 / 移动 App。
export const reachSurfaces: readonly (ReachSurface & { id: Exclude<ReachKey, 'headless'> })[] = [
  { id: 'desktopApp', icon: 'monitor' },
  { id: 'browser', icon: 'window' },
  { id: 'mobileApp', icon: 'phone' },
]

// 可达性事实条:两种形态 + 其余可达面(桌面 App 不重复),顺序即呈现顺序。
export const reachItems: readonly { id: ReachKey; icon: string }[] = [
  ...formFactors.map((factor) => ({ id: factor.id, icon: factor.icon })),
  ...reachSurfaces
    .filter((surface) => surface.id !== 'desktopApp')
    .map((surface) => ({ id: surface.id, icon: surface.icon })),
]

// 通知渠道:浏览器 / 移动 App。
export const noticeChannels: readonly (NoticeChannel & { id: NoticeKey })[] = [
  { id: 'browser', icon: 'window' },
  { id: 'mobileApp', icon: 'phone' },
]

// 统一管理的配置类别:模型 / 插件 / Skill。
export const configKinds: readonly (ConfigKind & { id: ConfigKindKey })[] = [
  { id: 'models', icon: 'chip' },
  { id: 'plugins', icon: 'plug' },
  { id: 'skills', icon: 'sparkles' },
]

// 四块核心价值:随时随地 / 通知 / 分享 / 统一管理(区块图标按键查询)。
export const valueProps: readonly ValueProp[] = [
  { id: 'anywhere', icon: 'sync' },
  { id: 'notify', icon: 'bell' },
  { id: 'share', icon: 'share' },
  { id: 'config', icon: 'sliders' },
]

// 按核心价值 id 查图标键;契约保证 id 取值集合,找不到时回退 grid(不应发生)。
export function valuePropIcon(id: ValueProp['id']): string {
  return valueProps.find((prop) => prop.id === id)?.icon ?? 'grid'
}

// 快速开始三步:概念流程,序号 + 图标键。
export const onboardingSteps: readonly (OnboardingStep & { icon: StepKey })[] = [
  { order: 1, icon: 'download' },
  { order: 2, icon: 'badge' },
  { order: 3, icon: 'sync' },
]

// 占位:分享卡里的 headless Mia 标识为演示用占位,不代表真实实例。
export const SHARED_MIA_ID = 'mia-team-9b07'
