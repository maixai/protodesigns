import "@typespec/http";
import "@typespec/json-schema";

using TypeSpec.Http;
using TypeSpec.JsonSchema;

// Minos 官网首页原型的契约:本文件是"数据长什么样"的单一事实源。
// 各端类型(src/contracts/generated/ 等)由 `make contracts` 从此处生成,不手写。
//
// 本契约覆盖首页结构、账户身份与控制台概览,以及原型中的有限状态。
// 首页结构包含核心能力、旧方式痛点、跨层 Mesh、跨平台清单与快速开始。
// 主视觉走马灯的 5 屏与各区块图版是静态图版(坐标与标注手写固定),不进契约。
// 文案一律不进契约(文案在 i18n 词条里),契约只描述结构与取值集合。
//
// 书写约定:
//   1. 需要独立产出类型的"入口类型"加 @summary("<类型名>") + @jsonSchema 两个标注;
//      @summary 决定生成的类型名(json-schema emitter 把它映射为 JSON Schema 的 title,
//      生成器优先用 title 命名,否则会退化成带文件名后缀的名字)。
//   2. 被入口类型引用的枚举 / 标量不加标注,会自动内联进引用它的那个 schema,
//      因此每个生成的 schema 文件都是自包含的,不会产生跨文件重复导出。
namespace MinosWebsite;

// ---- 首页结构性常量 ----

// 四项核心能力:零配置组网 / 加密直连 / 身份即边界 / 一处看清整张网。
enum CapabilityId {
  zeroConfig,
  encryptedDirect,
  identityBoundary,
  visibility,
}

@summary("Capability")
@jsonSchema
model Capability {
  id: CapabilityId;
  icon: string;
}

// 旧方式四条痛点:公网 IP / 端口转发 / 手工路由表 / 静态密钥;
// 右侧 Minos 结果与之按 id 一一对应(文案在 i18n 词条里配对)。
enum LegacyPainId {
  publicIp,
  portForward,
  manualRoutes,
  staticKeys,
}

@summary("LegacyPain")
@jsonSchema
model LegacyPain {
  id: LegacyPainId;
  icon: string;
}

// 支持的平台:桌面三系统、移动两系统、容器、路由器与 IoT 设备。
enum PlatformId {
  linux,
  macos,
  windows,
  ios,
  android,
  container,
  router,
  iotDevice,
}

@summary("Platform")
@jsonSchema
model Platform {
  id: PlatformId;
  icon: string;
}

// 跨层 Mesh 的三层:链路层 / 网络层 / 应用层。
enum MeshLayerId {
  l2,
  l3,
  l7,
}

// 映射到各层的能力:L2 三条(帧转发 / 同一链路段 / 面向 IoT 与工业设备),
// L3 两条(包转发 / 子网路由),L7 四条(HTTP 代理 / SOCKS 代理 / 端口映射 / 反向端口映射)。
enum MeshCapabilityId {
  frameForwarding,
  sameSegment,
  iotIndustrial,
  packetForwarding,
  subnetRouting,
  httpProxy,
  socksProxy,
  portMapping,
  reversePortMapping,
}

@summary("MeshLayer")
@jsonSchema
model MeshLayer {
  id: MeshLayerId;
  capabilities: MeshCapabilityId[];
}

// 快速开始三步:概念流程,序号 + 图标键;文案在 i18n 词条里按图标键索引。
@summary("SetupStep")
@jsonSchema
model SetupStep {
  order: int32;
  icon: string;
}

// ---- 账户与控制台 ----
@summary("AccountProfile")
@jsonSchema
model AccountProfile {
  name: string;
  email: string;
  organization: string;
}

enum ConsoleSection { overview, devices, networks, routing, access, settings }

@summary("ConsoleNavItem")
@jsonSchema
model ConsoleNavItem {
  id: ConsoleSection;
  icon: string;
}

enum NetworkScope { workspace, external }
enum NetworkStatus { active, paused }
enum MembershipRole { member, subnetRouter, exitNode }
enum MembershipState { active, paused, pending, conflict }
enum ClientState { connected, disconnected }
enum ClientVersionState { current, outdated }
enum Ipv4Compat { clat, mapped, none }
enum AddressFamily { ipv6, ipv4 }
enum RouteState { active, paused }
enum ConflictState { resolved, pending }
enum ConflictKind { ipv4Overlap, customPrefix }

model Ipv4Mapping {
  ipv4Cidr: string;
  ipv6Prefix: string;
}

@summary("NetworkSummary")
@jsonSchema
model NetworkSummary {
  id: string;
  name: string;
  scope: NetworkScope;
  owner: string;
  identity: int32; // 1–8,对应标识色绑定类。
  ipv6Prefix: string; // 网络独占的 ULA /48。
  dnsSuffix: string;
  reverseZone: string;
  ipv4Mappings: Ipv4Mapping[];
  memberCount: int32;
  status: NetworkStatus;
}

// 创建组织网络时只提交名称与 DNS,地址由平台分配。
@summary("CreateNetworkInput")
@jsonSchema
model CreateNetworkInput {
  name: string;
  scope: "workspace";
  dnsSuffix: string;
}

@summary("Membership")
@jsonSchema
model Membership {
  networkId: string;
  ipv6Address: string;
  hostSuffix: string; // 同一设备跨网络保持相同主机后缀。
  ipv4Compat: Ipv4Compat;
  role: MembershipRole;
  state: MembershipState;
  latencyMs: int32 | null;
  joinedAt: utcDateTime;
}

@summary("DeviceSummary")
@jsonSchema
model DeviceSummary {
  id: string;
  name: string;
  os: "linux" | "macos" | "windows" | "ios" | "android";
  clientVersion: string;
  clientState: ClientState;
  clientVersionState: ClientVersionState;
  lastSeen: utcDateTime;
  memberships: Membership[];
}

@summary("RouteEntry")
@jsonSchema
model RouteEntry {
  id: string;
  destination: string; // IPv6 前缀或 IPv4 映射前缀。
  sourceCidr: string | null; // 映射前的 IPv4 地址段。
  family: AddressFamily;
  networkId: string | null; // 空值代表本地默认路由。
  gateway: string;
  priority: int32;
  state: RouteState;
}

@summary("DnsZone")
@jsonSchema
model DnsZone {
  networkId: string;
  suffix: string;
  reverseZone: string;
  resolver: string;
}

@summary("AddressConflict")
@jsonSchema
model AddressConflict {
  id: string;
  kind: ConflictKind;
  state: ConflictState;
  networkIds: string[];
  ipv4Cidrs: string[];
  mappings: string[];
}

model AddressSpace {
  networkPrefixCount: int32;
  ipv4MappingCount: int32;
  allocatedAddresses: int32;
  unresolvedConflicts: int32;
}

model OverviewStats {
  deviceCount: int32;
  networkCount: int32;
  membershipCount: int32;
  onlineCount: int32;
}

@summary("ConsoleOverview")
@jsonSchema
model ConsoleOverview {
  stats: OverviewStats;
  addressSpace: AddressSpace;
  networks: NetworkSummary[];
  devices: DeviceSummary[];
  routes: RouteEntry[];
  dnsZones: DnsZone[];
  conflicts: AddressConflict[];
}

// 状态也由契约生成,避免载体重复手写对象形状;profile 与状态互斥。
@summary("AccountSession")
@jsonSchema
union AccountSession {
  anonymous: { status: "anonymous"; profile: null; },
  authenticated: { status: "authenticated"; profile: AccountProfile; },
}

// demoState 只控制 dummy API 演示,不代表生产接口参数。
@summary("AppRoute")
@jsonSchema
model AppRoute {
  page: "home" | "console";
  section: ConsoleSection;
  detailId: string | null;
  demoState: "normal" | "empty" | "error";
}

@summary("OverviewState")
@jsonSchema
union OverviewState {
  loading: { status: "loading"; },
  empty: { status: "empty"; },
  error: { status: "error"; },
  ready: { status: "ready"; data: ConsoleOverview; },
}
