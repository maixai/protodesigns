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
// Agent 由用户创建 / 删除,故 id 是**字符串**而不是封闭枚举 —— 模板只是创建时的默认值,
// 不参与身份。内置的三个 Agent 以 planning / research / writing 作为稳定 id;
// 新建的 Agent 由载体生成 `agent-<n>` 一类的 id。
scalar AgentId extends string;

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

// 通知跨 Agent 聚合；已读属于视图状态，不写入实体。
@summary("AgentNotification")
@jsonSchema
model AgentNotification {
  id: string;
  agentId: AgentId;
  projectId: string;
  sessionId: string;
  title: string;
  status: SessionStatus;
  updatedAt: utcDateTime;
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

// 附件的三种形态。被 Attachment 引用后会内联进 attachment.d.ts,故不单独加 @jsonSchema。
enum AttachmentKind {
  file,
  image,
  text,
}

// 一条消息**携带的附件**。它是「这一轮对话要计入的额外输入」的规范化表达:
// 侧栏拖入 / 点按钮加入的项目文件、`+` 上传的本地文件、以及从剪贴板粘贴进来的图片与长文本。
//
// kind 判别联合的三支各有自己的字段口径:
//   file  —— 项目内的一个文件(路径是相对项目根的相对路径),正文在磁盘上,不塞进 content;
//   image —— 图片:path 是项目/本地可展示的来源,预览由载体用 objectURL 现做,契约不存字节;
//   text  —— 粘贴进来的长文本:**正文完整存在 content 里**,lineCount / charCount 只用于芯片展示
//            (展示可以折叠,发送出去的必须是全文)。
// 故「展示折叠」与「发送全文」由同一份数据承担:折叠发生在渲染层,数据层永远是全文。
@summary("Attachment")
@jsonSchema
model Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;              // 展示名:文件名 / 「粘贴文本」
  path?: string;             // file / image 的项目内相对路径;text 无
  mimeType?: string;
  sizeBytes?: int32;
  lineCount?: int32;         // text:行数(仅展示用)
  charCount?: int32;         // text:字符数(仅展示用)
  content?: string;          // text:正文全文;文件类走 path,不塞正文
}

@summary("ChatMessage")
@jsonSchema
model ChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: utcDateTime;
  // 该消息携带的附件(发送时随 payload 出去);无附件时为空数组。
  attachments: Attachment[];
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
  // 项目缩写(2–4 字符,如 weekly-report → WR):tab 标题的前缀用它承担「这段内容属于哪个项目」
  // 的**文字通道**。侧栏同时展开多个项目后,右侧 tab 与悬浮窗会混装不同项目的内容,
  // 归属必须能被一眼读出 —— 文字是色觉障碍下唯一可用的通道,故缩写是硬要求而不是装饰。
  mark: string;
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

// Agent 的身份摘要:侧栏切换器 / 设置对话框只需要这些字段,不必背着项目树。
// role 是一句话职责(如「拆解任务与推进节奏」),modelId 是默认模型 id(载体按模型目录解析展示名)。
// builtIn 表示内置 Agent:它们的名称 / 职责优先跟随界面语言;用户改名后置 false,改用这里的字面值。
@summary("AgentSummary")
@jsonSchema
model AgentSummary {
  id: AgentId;
  name: string;
  role: string;
  modelId: string;
  builtIn: boolean;
}

// 新建 / 编辑 Agent 的输入:模板只是界面的默认值,不进入身份,故这里只有最终配置。
@summary("AgentConfig")
@jsonSchema
model AgentConfig {
  name: string;
  role: string;
  modelId: string;
}

// ---- 插件与插件市场 ----
//
// 归属分两层(与 Claude Agent SDK 的设置来源对应):
//   agent   程序化选项:该 Agent 的所有项目生效;优先级高于项目设置
//   project .claude/settings.json:打开该项目的所有 Agent 生效(共享)
// 同一 plugin@marketplace 在两层都存在时,Agent 层的启用状态优先。
//
// 市场是**全局来源**(对应 known_marketplaces.json,一台机器一份),不属于某个 Agent / 项目;
// 自动更新是市场级策略(extraKnownMarketplaces.<name>.autoUpdate)。因此市场管理放在全局设置,
// 插件安装 / 启停 / 卸载 / 配置放在 Agent 设置或项目设置里。
enum PluginTrustId {
  trusted,
  community,
}

enum PluginComponentId {
  skill,
  command,
  agent,
  mcp,
  hook,
}

// 插件可声明的配置项(Claude 插件 manifest 的 userConfig):密钥、端点、开关等。
// secret 的 value 永远以掩码返回,isSet 告诉界面「已经保存过」;保存时留空表示保持原值。
enum PluginConfigTypeId {
  text,
  secret,
  boolean,
}

model PluginConfigField {
  key: string;
  label: string;
  description: string;
  type: PluginConfigTypeId;
  required: boolean;
  value: string;
  isSet: boolean;
}

@summary("PluginConfigValue")
@jsonSchema
model PluginConfigValue {
  key: string;
  value: string;
}

// 市场目录里的插件元数据:不含安装态(安装态因 Agent / 项目而异)。
@summary("Plugin")
@jsonSchema
model Plugin {
  id: string;
  marketplaceId: string;
  name: string;
  description: string;
  publisher: string;
  version: string;
  icon: string;
  components: PluginComponentId[];
}

enum PluginInstallScopeId {
  agent,
  project,
}

// 某个 Agent 或某个项目里的一份安装记录。
@summary("InstalledPlugin")
@jsonSchema
model InstalledPlugin {
  plugin: Plugin;
  enabled: boolean;
  scope: PluginInstallScopeId;
  // 归属市场的展示名(插件行只显示「来自哪个市场」,不显示发布者 / 能力清单)。
  marketplaceName: string;
  // 已安装副本的版本;与 plugin.version(市场当前版本)不同即表示有更新。
  installedVersion: string;
  // 配置项与它们的当前值(secret 为掩码)。
  config: PluginConfigField[];
}

// 插件市场目录:来源与插件元数据,不带任何作用域的安装 / 更新策略。
@summary("Marketplace")
@jsonSchema
model Marketplace {
  id: string;
  name: string;
  source: string;
  trust: PluginTrustId;
  plugins: Plugin[];
}

// 某个 Agent 或项目注册的市场。自动更新、最近刷新时间与安装计数属于**这次注册**,
// 不属于市场目录本身 —— 同一来源可以被多个 Agent 各自注册、各自设置策略。
@summary("MarketplaceBinding")
@jsonSchema
model MarketplaceBinding {
  marketplace: Marketplace;
  autoUpdate: boolean;
  lastUpdated: utcDateTime;
  // 当前作用域中从该市场安装的插件数(移除时的风险提示)。
  installedCount: int32;
}

// 添加市场的输入:source 是 marketplace.json 的来源;注册到哪个 Agent / 项目由调用方给出。
@summary("MarketplaceConfig")
@jsonSchema
model MarketplaceConfig {
  name: string;
  source: string;
  autoUpdate: boolean;
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

// 文件的呈现类别:决定面板**能提供哪些视图**(预览 / 源码 / 变更),而不是它的扩展名。
//   text     —— 纯文本 / 源码(等宽展示 + 可编辑源码 + 变更标记);
//   markdown —— 预览态按 Markdown 渲染(含 mermaid 图),源码态可编辑;
//   html     —— 预览态用 sandbox 的 iframe 预览,源码态可编辑;
//   image    —— 只有预览态(<img>),不可编辑、没有源码与变更视图;
//   csv/json —— 数据文件:**有自己的一份结构化预览**(CSV 表格 / JSON 折叠树 + 表格模式),
//               源码态仍可编辑。为什么另立两个 kind、而不是继续用 text + language:
//               面板的档位矩阵由 kind 决定,而 text 明确**不给**预览档(给纯文本一档只读、
//               无高亮的纯文本等于同时丢掉高亮与可编辑性,是纯亏损,详见 file-panel.vue);
//               CSV / JSON 的价值恰恰就在那一份结构化呈现里,故必须在契约上把它们与 text
//               分开 —— 光靠 language 表达不出「这一份该不该给预览档」,UI 也就无从区分。
//   binary   —— 无法在 web 里呈现的二进制(pdf / 压缩包等),面板只给「无法预览」空态。
// binary 是对「建议的四种取之集合」的补充:去掉它之后,「无法预览」这一态就没有任何一种
// 文件能寻址到(图片此前正是用它占了这一态,图片可渲染之后必须有新的承载者)。
enum FileKindId {
  text,
  markdown,
  html,
  image,
  csv,
  json,
  binary,
}

// 文件面板要渲染的一份文件内容。
// language 既用于等宽展示,也用于源码态的语法高亮(apacheconf / shell 走 legacy-modes);
// confirmationId 是「待确认」文件对应的确认请求 id —— 面板内的允许 / 拒绝因此与转录里的确认卡
// 作用于同一个 ConfirmationRequest(非待确认时为空串)。
// 文件在**会话里的状态**(新建 / 已改 / 待确认)不进本契约:它与文件树的芯片同源,由载体的同一
// 派生函数计算(允许确认后即时从 pending 变 modified),放进契约会成为对不上的第二个事实源。
//
// source / contentUrl 是**内容本体**,与 lines(变更标记)分开表达:
//   · source   —— 该文件**当前**的真实内容,渲染态与源码态都读它。**不能**从 lines 拼出来:
//                 diff 模型里 removed 行是**留在原地**的,按 lines 拼会把已删除的行当成现存内容。
//                 lines 只服务「变更」视图(它表达的是「相对上一次改了什么」,不是「现在是什么」)。
//   · contentUrl —— 仅 image 用(data URL 或资源路径);其余类型为空串。
// 两者与 preview / confirmationId 同口径:必填 + 空串表示无(exactOptionalPropertyTypes 下
// 可选字段处处别扭,见 ChatSession.preview 的注释)。
@summary("FileContent")
@jsonSchema
model FileContent {
  path: string;
  kind: FileKindId;
  language: string;
  mime: string;
  source: string;
  contentUrl: string;
  addedCount: int32;
  removedCount: int32;
  confirmationId: string;
  lines: FileLine[];
}

// ---- Agent 栏:Agent 级的「需要你处理」信号聚合 ----
//
// 「信号」= 某 Agent 名下、**尚未被用户点开看过**的两类会话各有多少条:
//   awaiting  等待交互(Agent 在等你拍板)
//   completed 响应完成(Agent 刚出结果,你还没看)
// 载体据此在该 Agent 的标签上挂一枚 Badge;两类并存时**取更紧急的一档(awaiting > completed)**。
// 「是否已看过」是**视图状态**、不进契约 —— 调用方把自己那份「已看过」的会话 id 传给聚合函数,
// 计数里自动排除它们(与 tab 上的状态 Badge 用的是同一份已看过集合,两处不会各说各话)。
@summary("AgentSignal")
@jsonSchema
model AgentSignal {
  agentId: AgentId;
  running: int32;       // 未看过的正在输出的会话数
  awaiting: int32;      // 未看过的「等待交互」会话数
  completed: int32;     // 未看过的「响应完成」会话数
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

// ---- 工作台的窗体布局:区域(surface)、窗体与内容 ----
//
// 心智模型(与 VS Code / IntelliJ 一致):
//   · **区域是容器,tab 组属于区域,不属于窗体** —— 一块区域持有它那串成员窗体的 id(即它的 tab 条);
//   · **窗体**只持有「几何 + 归属 + 内容引用」,不持有 tab 列表;
//   · 窗体的内容是**通用**的(由判别联合表达),不得假设它一定是文件;
//   · 浮动窗口(popout)不属于任何区域。
//
// 区域树**不递归**表达:本仓契约约定「被引用的类型会内联进自包含的 schema」,递归会无限展开。
// 故用**扁平数组 + parentId 邻接表**,层级由载体推导。
// 所有布局操作都带 surfaceId —— 区域切分(一块区域沿右 / 下缘再切出子区域,每块各有自己的
// tab 条)正是靠它落地的;根区域恒存在(parentId 为 null),非根的空区域由载体摘除。

// 区域在父区域里的排布方向(row 横排 / column 竖排);它表达**本区域排布子区域**的方向。
enum SurfaceAxisId {
  row,
  column,
}

@summary("Surface")
@jsonSchema
model Surface {
  id: string;
  // 父区域 id;根区域为 null(根与「空 id」是两回事,故用 null 而非空串)。
  parentId: string | null;
  axis: SurfaceAxisId;
  // 在父区域里占的权重(与兄弟按比例分配空间;分隔线拖动即改它)。
  weight: int32;
  // 区域内的窗体 id 列表 = tab 条的顺序。**floating 窗体的 id 不出现在这里**(见不变量)。
  members: string[];
  // 当前激活的窗体 id。空串 = 无;非空时必须 ∈ members(不变量)。
  activeId: string;
  // 整块显示区是否被最小化到底栏。为 true 时它**仍留在区域树里**(parentId / axis / weight
  // 原样保留),只是渲染与空间分配跳过它 —— 恢复时原位置、原权重重新出现,而不是把成员并进兄弟区域。
  // 根区域不置 true(根始终存在);根的全部页签被收起时由页面显示「全部最小化」空态。
  minimized: boolean;
}

// 窗体内容的判别联合:窗体是**通用容器**,内容由 kind 区分。本单元只用到 file
// (文件 / 对话两种都已用上),故窗体不得假设内容一定是文件。
//
// **两支都带 projectId —— 它是窗体身份的组成部分,不是可选元信息**。理由:布局层以
// windowId 唯一标识一个窗体,而**裸标识不唯一** —— 不同项目可以有同名文件(演示数据里
// README.md 同时存在于 weekly-report / benchmarks / changelog 三个项目),会话 id 同理。
// 若身份里不带项目,两份 README 会解析成**同一个窗体 id / 同一个 DOM 节点**:
// 「一个窗体至多属于一个区域」「可见的 docked 窗体必属于某区域」这两条不变量随之失效
// (同一个 id 同时挂在两块区域上不会被判为重号),浮窗与停靠也会互相顶掉。
// 这正是 VS Code 的 Uri 口径:裸文件名不唯一,键里必须有 scheme。
// 载体据此把 id 拼成复合键:file → `file://<projectId>/<相对路径>`、chat → `chat://<projectId>/<会话 id>`。
@summary("WindowContent")
@jsonSchema
union WindowContent {
  file: { kind: "file"; projectId: string; path: string; },
  chat: { kind: "chat"; projectId: string; sessionId: string; },
}

// 窗体的位置:floating(自有矩形,不属于任何区域)/ docked(属于某区域)。
enum WindowPlacementId {
  floating,
  docked,
}

// 窗体的呈现:normal / maximized。**maximized × floating 互斥**(popout 出来的组不能被最大化)。
enum WindowViewId {
  normal,
  maximized,
}

// 窗体的几何(fixed 定位的视口坐标)。
model WindowRect {
  x: float32;
  y: float32;
  width: float32;
  height: float32;
}

// 一个窗体:几何 + 归属 + 内容引用(**不持有 tab 列表**)。
// visible 隐藏 ≠ 销毁:关掉只是把 visible 置假,placement / rect / view 原样留着,
// 再点回来即按原样恢复(与「关闭 ≠ 删除」同源)。
@summary("WorkspaceWindow")
@jsonSchema
model WorkspaceWindow {
  id: string;
  content: WindowContent;
  placement: WindowPlacementId;
  view: WindowViewId;
  visible: boolean;
  rect: WindowRect;
}

// 一个 **Agent** 域内的整块工作区布局:区域 + 窗体 + 焦点 + 最近打开。
// 布局按 **Agent 分域**(不再按「Agent + 项目」):平权之后没有「当前项目」,同一个 Agent 下
// 不同项目的窗口共存于同一张 tab 表 —— 离开哪个项目的**归属**由每个窗体的 content.projectId
// 自己声明,而不是由这张表的键决定。
// windows 是**数组,顺序即前后层序**(靠后者在上)—— 不用自增 z:自增在多区域下语义会崩,
// 且本仓层级只有 4 档 token,就地写数值违反「禁止 magic number」。
// 收起期间保留来源区域、成员顺序与活动项；恢复后删除该记录。
@summary("MinimizedGroup")
@jsonSchema
model MinimizedGroup {
  id: string;
  surfaceId: string;
  projectId: string;
  name: string;
  memberIds: string[];
  lastActiveId: string;
  // true = 这个组代表**一整块显示区**(而不是某项目的部分 tab)。恢复时把 surface.minimized
  // 置回 false,让显示区回到原位置;false = 只收起该项目的部分页签,区域本身仍在。
  isSurface: boolean;
  // 组是否由「最小化这个显示区」这个动作产生。与 isSurface 分开是因为**根区域**不能标
  // minimized(它要留在树里承载引导页),它的整区收起会拆成项目组(isSurface: false)。
  // 恢复时靠它区分:整区来源的组若发现来源区域已有新的可见内容(例如收起后又新建了对话),
  // 应切出一块新区域与它并排,而不是把新内容一起吞进同一个 tab 区。
  isArea: boolean;
}

@summary("WorkspaceLayout")
@jsonSchema
model WorkspaceLayout {
  surfaces: Surface[];
  windows: WorkspaceWindow[];
  groups: MinimizedGroup[];
  // 当前聚焦的窗体 id;空串 = 无(F6 / Esc 的落点)。
  focus: string;
  // 「最近打开」的窗体 id(新的在前,按 id 去重、限量)。关闭 ≠ 删除:关掉的仍留在这里供找回。
  // 它是**显式的历史** —— 层序数组顺序会被置顶打乱,推不出「谁最近开过」。
  recent: string[];
}
