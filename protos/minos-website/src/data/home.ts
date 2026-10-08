// 首页结构性数据:全部类型来自契约生成物(src/contracts/generated/),不手写结构。
// 文案一律不在这里(在 i18n 词条里);这里只有 id、图标键、序号与终端命令
// (命令是技术信息,不随语言变化)。
import type { Capability } from '../contracts/generated/capability'
import type { LegacyPain } from '../contracts/generated/legacy-pain'
import type { MeshLayer } from '../contracts/generated/mesh-layer'
import type { Platform } from '../contracts/generated/platform'
import type { SetupStep } from '../contracts/generated/setup-step'
import type { Messages } from '../i18n'

// 词条键:条目按契约 id / 图标键索引到 i18n 词条,缺词条即编译报错。
type CapabilityKey = keyof Messages['capabilities']['items']
type LegacyPainKey = keyof Messages['compare']['items']
type PlatformKey = keyof Messages['platforms']['items']
type MeshLayerKey = keyof Messages['mesh']['layers']
type StepKey = keyof Messages['quickstart']['items']

// 四项核心能力:零配置组网 / 加密直连 / 身份即边界 / 一处看清整张网。
export const capabilities: readonly (Capability & { id: CapabilityKey })[] = [
  { id: 'zeroConfig', icon: 'mesh' },
  { id: 'encryptedDirect', icon: 'lock' },
  { id: 'identityBoundary', icon: 'badge' },
  { id: 'visibility', icon: 'eye' },
]

// 旧方式四条痛点:顺序即对比带的呈现顺序;右侧结果与之痛按 id 配对。
export const legacyPains: readonly (LegacyPain & { id: LegacyPainKey })[] = [
  { id: 'publicIp', icon: 'globe' },
  { id: 'portForward', icon: 'forward' },
  { id: 'manualRoutes', icon: 'list' },
  { id: 'staticKeys', icon: 'key' },
]

// 支持平台:桌面三系统 + 移动两系统 + 容器 + 路由器 + IoT 设备。
export const platforms: readonly (Platform & { id: PlatformKey })[] = [
  { id: 'linux', icon: 'terminal' },
  { id: 'macos', icon: 'laptop' },
  { id: 'windows', icon: 'window' },
  { id: 'ios', icon: 'phone' },
  { id: 'android', icon: 'robot' },
  { id: 'container', icon: 'box' },
  { id: 'router', icon: 'router' },
  { id: 'iotDevice', icon: 'chip' },
]

// 跨层 Mesh 三层:能力按契约 MeshCapabilityId 映射到各层,文案在 i18n 按 id 索引。
export const meshLayers: readonly (MeshLayer & { id: MeshLayerKey })[] = [
  { id: 'l2', capabilities: ['frameForwarding', 'sameSegment', 'iotIndustrial'] },
  { id: 'l3', capabilities: ['packetForwarding', 'subnetRouting'] },
  { id: 'l7', capabilities: ['httpProxy', 'socksProxy', 'portMapping', 'reversePortMapping'] },
]

// 快速开始三步:序号 + 图标键(兼作词条键)+ 终端命令。
// 命令是贴近真实的 dummy 内容, deterministic —— 不随刷新变化(校准基线依赖此)。
export interface SetupStepWithCommand extends SetupStep {
  icon: StepKey
  command: string
  // 命令的示范输出;无输出的步骤为空数组。
  output: readonly string[]
}

export const setupSteps: readonly SetupStepWithCommand[] = [
  {
    order: 1,
    icon: 'download',
    command: 'curl -fsSL https://get.minos.dev | sh',
    output: [],
  },
  {
    order: 2,
    icon: 'key',
    command: 'minos up --auth-key mk_9f2e7c41…a8d3',
    output: [],
  },
  {
    order: 3,
    icon: 'check-circle',
    command: 'minos status',
    output: ['● online — 6 devices on minos-net'],
  },
]
