import "@typespec/http";
import "@typespec/json-schema";

using TypeSpec.Http;
using TypeSpec.JsonSchema;

// Mia 官网首页原型的契约:本文件是"数据长什么样"的单一事实源。
// 各端类型(src/contracts/generated/ 等)由 `make contracts` 从此处生成,不手写。
//
// 本契约覆盖首页结构(Mia 的两种形态、可达面、通知渠道、统一管理的配置类别、
// 四块核心价值、快速开始与安装引导),以及账户、登录态、路由、工作台会话与消息。
// 界面文案在 i18n 词条里;契约描述结构、取值集合与用户内容。
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

// ---- 账户、登录态与路由 ----

@summary("AccountProfile")
@jsonSchema
model AccountProfile {
  name: string;
  email: string;
}

// 未登录 / 已登录互斥,用判别联合表达,载体里不出现互斥的可选字段。
@summary("AccountSession")
@jsonSchema
union AccountSession {
  anonymous: { status: "anonymous"; profile: null; },
  authenticated: { status: "authenticated"; profile: AccountProfile; },
}

// 原型内的路由状态:home 是官网首页,workspace 是登录后进入的 AI Agent 工作台。
// demoState 只是 dummy 数据层的演示开关(让异步四态与「等待交互」场景可被直接寻址),
// 不代表生产接口参数。waiting 直达 Agent 等待用户确认的确认卡场景。
@summary("AppRoute")
@jsonSchema
model AppRoute {
  page: "home" | "workspace";
  demoState: "normal" | "empty" | "error" | "waiting";
}

// ---- 工作台的会话与消息 ----

// 工作台里的 Agent:一个 Agent 承接多段会话,会话头显示当前会话归属的 Agent。
enum AgentId {
  planning,
  research,
  writing,
}

// 会话在**当前时刻**的状态:一个字段表达五态(取代原先只表达「是否等待用户交互」的
// awaitingInteraction)。取值与 tab 上的状态图标一一对应:
//   new       新会话
//   streaming 响应(输出)中
//   awaiting  等待交互(Agent 提请确认 / 需要用户拍板)
//   completed 响应(输出)完成
//   idle      等待对话(空闲)
// 「是否已被用户看过」是**视图状态**,不进契约 —— 载体据它决定 awaiting / completed 的
// 图标是否显示(看过即不再提示)。
enum SessionStatus {
  new,
  streaming,
  awaiting,
  completed,
  idle,
}

@summary("ChatSession")
@jsonSchema
model ChatSession {
  id: string;
  title: string;
  agent: AgentId;
  // 会话归属的项目:对话栏据此按项目隔离(只显示当前项目的会话)。
  projectId: string;
  updatedAt: utcDateTime;
  // 会话列表的次要行:便于扫读这段对话讲了什么。用「必填 + 空串表示无」而不是可选字段 ——
  // 载体的 tsconfig 开了 exactOptionalPropertyTypes,可选字段在构造与展开更新时无法显式赋
  // undefined,程序化组装一条 ChatSession 会处处别扭;空串语义与「可选」等价且更好处理。
  preview: string;
  // 该会话当前的状态(新会话 / 响应中 / 等待交互 / 响应完成 / 等待对话)。
  status: SessionStatus;
}

@summary("ChatMessage")
@jsonSchema
model ChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: utcDateTime;
}

// 对话记录的异步四态:前三态无数据,ready 带消息列表。
@summary("TranscriptState")
@jsonSchema
union TranscriptState {
  loading: { status: "loading"; },
  empty: { status: "empty"; },
  error: { status: "error"; },
  ready: { status: "ready"; messages: ChatMessage[]; },
}

// ---- 工作台 Agent 与它的项目 ----

// Agent 的运行状态:空闲 / 思考中 / 输出中 / 等待用户确认。
enum AgentStatusId {
  idle,
  thinking,
  streaming,
  waiting,
}

// 项目条目在本次会话中的状态:新建 / 已修改 / 无变化 / 待确认(等待用户拍板)。
// 状态芯片只对 created / modified / pending 渲染;none 表示无变化,不渲染芯片 ——
// 旧设计里那枚「仅读」芯片既不承载行动信息、又挤占 260px 侧栏的宽度,故移除。
// pending 只在 Agent 等待交互、该条目受影响时出现(见状态芯片的跨区域联动)。
enum ProjectEntryStateId {
  created,
  modified,
  none,
  pending,
}

// 项目条目的类型:目录可折叠 / 展开,文件是只读展示行。
enum ProjectEntryKindId {
  directory,
  file,
}

// 项目内的一个条目(目录或文件)。
// 刻意用**扁平数组 + path** 而不是递归模型:本仓契约约定「每个生成的 schema 自包含,
// 被引用的类型会内联」,而**递归类型无法内联**,会破坏该约定。层级由载体按 path 推导。
@summary("ProjectEntry")
@jsonSchema
model ProjectEntry {
  id: string;
  path: string;                 // 相对项目根的路径,如 src/utils.ts
  kind: ProjectEntryKindId;     // directory | file
  state: ProjectEntryStateId;   // created | modified | none | pending
}

// 项目:Agent Host 上的一个目录,即 CLI 运行的 cwd。
// entryCount 是摘要口径(供列表 / 头部展示);entries 是明细,列表接口下发空数组,
// 树由「取项目树」接口按需加载(目录内容随时可能变,列表不必背着全量树)。
@summary("Project")
@jsonSchema
model Project {
  id: string;
  name: string;                 // 展示名(目录名,技术标识,不随语言变化)
  path: string;                 // 展示用短路径,如 ~/work/weekly-report
  entryCount: int32;
  entries: ProjectEntry[];
}

// 「打开项目」对话框里的一项:Agent Host 上检测到的候选目录。
// path 是唯一标识(同 name 的目录可能存在于不同父目录下),勾选与去重都按 path。
@summary("ProjectCandidate")
@jsonSchema
model ProjectCandidate {
  path: string;
  name: string;
  fileCount: int32;
  isGitRepo: boolean;
}

// Agent:身份 + 它打开的项目列表。
@summary("Agent")
@jsonSchema
model Agent {
  id: AgentId;            // 复用已有的 AgentId(planning / research / writing)
  projects: Project[];
}

// ---- 运行遥测与「等待交互」确认 ----

// Agent 运行时遥测(下一轮 UI 用，本轮先定契约与 mock)。
// context 用量语义：只统计"最近一次请求的输入侧"(含 cache 读写)，**输出不计入占用**
// —— 这是 Claude Code / Cursor / Codex 一致的口径。
// projectName / projectPath 表达**当前项目**(CLI 运行的那个 cwd),不是 Agent 的某个
// 「工作区」—— Agent 下可以有多个项目,遥测条最后一项说的必须是此刻正在用的那一个。
@summary("AgentRuntime")
@jsonSchema
model AgentRuntime {
  agentId: AgentId;
  status: AgentStatusId;
  statusDetail: string;   // 正在做什么的**具体**文案键；业界明令禁止「处理中」这类模糊词
  modelName: string;
  contextUsedTokens: int32;
  contextWindowTokens: int32;
  elapsedSeconds: int32;
  projectName: string;    // 当前项目展示名(目录名)
  projectPath: string;    // 当前项目短路径
}

// 「等待交互」时 Agent 提请确认的动作(下一轮 UI 用)。
@summary("ConfirmationRequest")
@jsonSchema
model ConfirmationRequest {
  id: string;
  summary: string;      // 一句话说清要做什么
  detail: string;       // 展开后的细节
  affectedFiles: string[];
}

// ---- 文件面板:一份文件的内容与变更标记 ----
//
// 文件面板默认**不是 diff、而是整个文件 + 变更标记**(依据:matklad 那篇被广泛引用的分析认为
// 「在上下文里看改动」优于「只看片段」;亦与 GitHub 的 rich diff 同向)。因此契约把「整份文件的
// 每一行」作为最小单位下发,每行自带它在该次改动里的角色与词级高亮区间 —— 载体据此渲染
// 行号栏的变更标记(形状区分)、词级高亮与折叠,而不必由契约预先切成 diff 片段。

// 行级变更类型:新增 / 删除 / 修改 / 无变化。用**形状**而非仅颜色区分(WCAG 1.4.1)。
enum FileLineChangeId {
  added,
  removed,
  modified,
  none,
}

// 行内词级高亮的字符区间(半开区间 [start, end),按 UTF-16 码元计)。
// 词级是默认粒度(GitHub 与 IntelliJ 的既有默认):整行染色会把「改了一个词」放大成「整行被改」。
model FileInlineSpan {
  start: int32;
  end: int32;
}

// 文件的一行:行号 + 变更类型 + 文本 + 词级高亮区间 + 该行修改前的内容。
// previous 只在 change 为 modified 时有意义,其余为空串 —— 用「必填 + 空串表示无」而非可选字段,
// 与本契约其它实体一致(载体的 tsconfig 开了 exactOptionalPropertyTypes,可选字段难以展开更新)。
// spans 描述的是 text(改动后)里的高亮区间。
model FileLine {
  number: int32;
  change: FileLineChangeId;
  text: string;
  previous: string;
  spans: FileInlineSpan[];
}

// 文件面板要渲染的一份文件内容。
// language 只用于等宽展示(不做真语法高亮);confirmationId 是「待确认」文件对应的确认请求 id
// —— 面板内的允许 / 拒绝因此与转录里的确认卡作用于同一个 ConfirmationRequest(非待确认时为空串)。
// 文件在**会话里的状态**(新建 / 已改 / 待确认)不进本契约:它与文件树的芯片同源,由载体的同一
// 派生函数计算(允许确认后即时从 pending 变 modified),放进契约会成为对不上的第二个事实源。
@summary("FileContent")
@jsonSchema
model FileContent {
  path: string;
  language: string;
  addedCount: int32;
  removedCount: int32;
  confirmationId: string;
  lines: FileLine[];
}

// ---- 会话搜索 ----

// 会话搜索命中:结果必须能定位到具体某一轮对话。
// 「标题命中」与「正文命中」是两种互斥的命中理由,用判别联合表达,判别符 reason 的取值
// 与变体名一致 —— 载体按 reason 分流(标题命中不跳转不高亮,正文命中跳到 turnId 并高亮),
// 不再用「空串 turnId」这类魔法值反推状态。
// 变体只带该命中理由**确实拥有**的数据:正文片段(snippet)与可跳转轮次(turnId)只有正文
// 命中才有 —— 标题命中没有上下文可截,载体据 reason 决定是否渲染片段行,不拿标题充当片段。
@summary("ConversationSearchHit")
@jsonSchema
union ConversationSearchHit {
  title: { reason: "title"; sessionId: string; title: string; },
  body: { reason: "body"; sessionId: string; title: string; snippet: string; turnId: string; },
}
