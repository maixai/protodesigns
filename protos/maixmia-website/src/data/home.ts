// 首页结构性数据:全部类型来自契约生成物(src/contracts/generated/),不手写结构。
// 文案一律不在这里(在 i18n 词条里);这里只有 id、图标键与序号。
import type { ConfigKind } from '../contracts/generated/config-kind'
import type { DesktopBuild } from '../contracts/generated/desktop-build'
import type { FormFactor } from '../contracts/generated/form-factor'
import type { InstallTarget } from '../contracts/generated/install-target'
import type { MobilePlatform } from '../contracts/generated/mobile-platform'
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
type InstallTargetKey = keyof Messages['install']['targets']
type DesktopPlatformKey = keyof Messages['install']['desktop']['platforms']
type MobilePlatformKey = keyof Messages['install']['mobile']['platforms']

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

// ---- 安装引导 ----

// 三个安装目标:桌面 App / Headless / 移动 App,标签切换呈现(顺序即 Tab 顺序);
// 图标键与 formFactors / reachSurfaces 同族(monitor / server / phone)。
export const installTargets: readonly (InstallTarget & { id: InstallTargetKey; icon: string })[] = [
  { id: 'desktopApp', icon: 'monitor' },
  { id: 'headless', icon: 'server' },
  { id: 'mobileApp', icon: 'phone' },
]

// 面板左列眉标读数:目标 slug + 部署面的技术标识,不随语言变化。
export const installTargetReadings: Record<InstallTargetKey, string> = {
  desktopApp: 'desktop-app / local',
  headless: 'headless / server',
  mobileApp: 'mobile-app / waitlist',
}

// 桌面构建:平台 × 架构 / 包形态。label 是展示名(品牌 / 技术名,不随语言变化),
// minOs 是最低系统要求(技术写法);arch 是技术标识,用于等宽读数。
// 顺序即各平台分段控件内的顺序,每个平台的第一项是默认选中项。
export type DesktopBuildOption = DesktopBuild & {
  platform: DesktopPlatformKey
  label: string
}

export const desktopBuilds: readonly DesktopBuildOption[] = [
  { platform: 'macos', arch: 'apple-silicon', label: 'Apple silicon', minOs: 'macOS 14+' },
  { platform: 'macos', arch: 'intel', label: 'Intel', minOs: 'macOS 14+' },
  { platform: 'windows', arch: 'amd64', label: 'AMD64', minOs: 'Windows 10+' },
  { platform: 'windows', arch: 'arm64', label: 'ARM64', minOs: 'Windows 11' },
  { platform: 'linux', arch: 'deb', label: 'deb', minOs: 'glibc 2.31+' },
  { platform: 'linux', arch: 'rpm', label: 'rpm', minOs: 'glibc 2.31+' },
  { platform: 'linux', arch: 'appimage', label: 'AppImage', minOs: 'glibc 2.31+' },
]

// 桌面平台顺序(分段控件顺序);默认选中第一项。
export const desktopPlatformOrder: readonly DesktopPlatformKey[] = ['macos', 'windows', 'linux']

// 移动平台:均未上架,只提供等待列表入口(顺序即呈现顺序)。
export const mobilePlatforms: readonly (MobilePlatform & { id: MobilePlatformKey })[] = [
  { id: 'ios' },
  { id: 'android' },
]

// Headless 安装命令:单行、稳定 URL、不含版本号(版本号在桌面面板的版本读数)。
// 技术信息,不随语言变化。
export const HEADLESS_INSTALL_COMMAND = 'curl -fsSL https://mia.maix.ai/install.sh | sh'
// 验证 / 卸载命令(技术信息,不随语言变化)。
export const HEADLESS_VERIFY_COMMAND = 'mia --version'
export const HEADLESS_UNINSTALL_COMMAND = 'rm -f ~/.local/bin/mia'
// Headless 面板左列底部读数:安装脚本覆盖的架构(推定值,产品方确认前不得当真)。
// 刻意不重复右列已有信息(命令块里的 sh / curl、「安装位置」格的 ~/.local/bin)——
// 读数只承载右列没有的事实;技术信息,不随语言变化。
export const HEADLESS_READING = 'x86_64 · arm64'
// 当前桌面版本号:桌面面板的版本读数与事实格展示。
export const MIA_DESKTOP_VERSION = 'v1.2.0'
