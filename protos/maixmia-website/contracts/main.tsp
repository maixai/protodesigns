import "@typespec/http";
import "@typespec/json-schema";

using TypeSpec.Http;
using TypeSpec.JsonSchema;

// Mia 官网首页原型的契约:本文件是"数据长什么样"的单一事实源。
// 各端类型(src/contracts/generated/ 等)由 `make contracts` 从此处生成,不手写。
//
// 本契约严格只覆盖首页自身的结构:Mia 的两种形态、可达面、通知渠道、
// 统一管理的配置类别、四块核心价值与快速开始三步。
// 文案一律不进契约(文案在 i18n 词条里),契约只描述结构与取值集合。
//
// 书写约定:
//   1. 需要独立产出类型的"入口类型"加 @summary("<类型名>") + @jsonSchema 两个标注;
//      @summary 决定生成的类型名(json-schema emitter 把它映射为 JSON Schema 的 title,
//      生成器优先用 title 命名,否则会退化成带文件名后缀的名字)。
//   2. 被入口类型引用的枚举 / 标量不加标注,会自动内联进引用它的那个 schema,
//      因此每个生成的 schema 文件都是自包含的,不会产生跨文件重复导出。
namespace MaixmiaWebsite;

// ---- 首页结构性常量 ----

// Mia 的形态:桌面 App(本地日常工作,可注册到平台支持远程)或 headless(服务器后台,专为远程)。
enum FormFactorId {
  desktopApp,
  headless,
}

@summary("FormFactor")
@jsonSchema
model FormFactor {
  id: FormFactorId;
  icon: string;
}

// 可达面:用户能从哪些地方用到自己的 Mia。
enum ReachSurfaceId {
  desktopApp,
  browser,
  mobileApp,
}

@summary("ReachSurface")
@jsonSchema
model ReachSurface {
  id: ReachSurfaceId;
  icon: string;
}

// 通知渠道:Mia 需要用户拍板时,经浏览器或移动 App 触达。
enum NoticeChannelId {
  browser,
  mobileApp,
}

@summary("NoticeChannel")
@jsonSchema
model NoticeChannel {
  id: NoticeChannelId;
  icon: string;
}

// 统一管理的配置类别:跨多个 Mia 统一维护。
enum ConfigKindId {
  models,
  plugins,
  skills,
}

@summary("ConfigKind")
@jsonSchema
model ConfigKind {
  id: ConfigKindId;
  icon: string;
}

// 四块核心价值(首页主干):随时随地 / 通知 / 分享 / 统一管理。
enum ValuePropId {
  anywhere,
  notify,
  share,
  config,
}

@summary("ValueProp")
@jsonSchema
model ValueProp {
  id: ValuePropId;
  icon: string;
}

// 快速开始三步:概念流程,序号 + 图标键;文案在 i18n 词条里按图标键索引。
@summary("OnboardingStep")
@jsonSchema
model OnboardingStep {
  order: int32;
  icon: string;
}

// ---- 安装引导 ----

// 安装目标(安装引导的三个选项):桌面 App / Headless / 移动 App。
enum InstallTargetId {
  desktopApp,
  headless,
  mobileApp,
}

@summary("InstallTarget")
@jsonSchema
model InstallTarget {
  id: InstallTargetId;
}

// 桌面平台:Windows / macOS / Linux。
enum DesktopPlatformId {
  windows,
  macos,
  linux,
}

// 桌面构建:某个平台下的一个可选架构 / 包形态。
// arch 是技术标识(apple-silicon / intel / amd64 / arm64 / deb / rpm / appimage),
// minOs 是最低系统版本(技术写法);两者都不随语言变化,展示名由数据层补充。
@summary("DesktopBuild")
@jsonSchema
model DesktopBuild {
  platform: DesktopPlatformId;
  arch: string;
  minOs: string;
}

// 移动平台:iOS / Android(均未上架,只提供等待列表入口)。
enum MobilePlatformId {
  ios,
  android,
}

@summary("MobilePlatform")
@jsonSchema
model MobilePlatform {
  id: MobilePlatformId;
}
