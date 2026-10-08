import "@typespec/http";
import "@typespec/json-schema";

using TypeSpec.Http;
using TypeSpec.JsonSchema;

// Minos 官网首页原型的契约:本文件是"数据长什么样"的单一事实源。
// 各端类型(src/contracts/generated/ 等)由 `make contracts` 从此处生成,不手写。
//
// 本契约严格只覆盖首页自身的结构:四项核心能力、旧方式四条痛点、跨层 Mesh 三层
// 及其能力映射、跨平台清单、快速开始三步。
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
