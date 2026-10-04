import "@typespec/json-schema";

using TypeSpec.JsonSchema;

// AI Agent 控制台的领域契约:本文件是"数据长什么样"的单一事实源。
// 各端类型(src/contracts/generated/ 等)由 `make contracts` 从此处生成,不手写。
//
// 书写约定:
//   1. 需要独立产出类型的"入口类型"加 @summary("<类型名>") + @jsonSchema 两个标注;
//      @summary 决定生成的类型名,@jsonSchema 是产出的前提。
//   2. 被入口类型引用的枚举 / 模型不加标注,会自动内联进引用它的那个 schema,
//      每个生成的 schema 文件因此自包含,不会产生跨文件重复导出。
//
// 可空字段一律写成 `T | null`(而非可选字段 `?`),让生成类型是"必有键、值可为空",
// 便于在 strict + exactOptionalPropertyTypes 下就地更新流式内容。
namespace AgentConsole;

// 会话连接状态:驱动界面的四态(连接中 / 就绪 / 失败)。
enum SessionStatus {
  connecting,
  ready,
  error,
}

// agent 可调用的工具集合;取值集合即契约的一部分。
enum ToolName {
  Read,
  Grep,
  Edit,
  Bash,
}

// 工具调用状态:运行中 / 成功 / 失败。
enum ToolStatus {
  running,
  success,
  failure,
}

// diff 行类型:上下文 / 新增 / 删除。
enum DiffLineKind {
  context,
  added,
  removed,
}

// 审批决定:批准 / 拒绝。
enum ApprovalDecision {
  approved,
  denied,
}

// 转录条目种类:用户输入 / agent 文本 / 思考 / 工具调用 / 审批。
enum EntryKind {
  user,
  assistant,
  thinking,
  tool,
  approval,
}

// ---------------------------------------------------------------------------
// 会话元信息(状态行数据)
// ---------------------------------------------------------------------------

// 状态行展示的模型名、工作目录、token 消耗与本轮耗时。
@summary("SessionMeta")
@jsonSchema
model SessionMeta {
  modelName: string;
  cwd: string;
  inputTokens: int32;
  outputTokens: int32;
  elapsedMs: int32;
}

// 会话连接状态与错误信息(四态中的 loading / error 由此驱动)。
@summary("SessionState")
@jsonSchema
model SessionState {
  status: SessionStatus;
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// 转录流条目
// ---------------------------------------------------------------------------

// 单条思考步骤(思考区展开后按编号列出)。
model ThinkingStep {
  index: int32;
  text: string;
}

// 单行 diff。
model DiffLine {
  kind: DiffLineKind;
  oldLine: int32 | null;
  newLine: int32 | null;
  text: string;
}

// 一次 Edit 产生的 unified diff。
model DiffBlock {
  file: string;
  lines: DiffLine[];
}

// 工具调用行:名字、参数摘要、状态与结果;Edit 的结果带 diff, Bash 带退出码。
model ToolEntry {
  kind: EntryKind.tool;
  id: string;
  name: ToolName;
  argSummary: string;
  args: string;
  status: ToolStatus;
  result: string | null;
  diff: DiffBlock | null;
  exitCode: int32 | null;
}

// 用户输入回显(以 `> ` 提示符呈现)。
model UserEntry {
  kind: EntryKind.user;
  text: string;
}

// agent 文本回复:逐字流式吐出,可被 Esc 中断。
model AssistantEntry {
  kind: EntryKind.assistant;
  text: string;
  streaming: boolean;
  interrupted: boolean;
}

// 思考过程折叠区:默认收起,展开列出编号步骤。
model ThinkingEntry {
  kind: EntryKind.thinking;
  steps: ThinkingStep[];
  durationMs: int32;
  completedSteps: int32;
  streaming: boolean;
}

// 内联审批:危险操作执行前阻塞,等待 y / n。
model ApprovalEntry {
  kind: EntryKind.approval;
  command: string;
  prompt: string;
  decision: ApprovalDecision | null;
}

// 转录流中的一条。判别联合,以 kind 区分五种形态。
@summary("TranscriptEntry")
@jsonSchema
union TranscriptEntry {
  user: UserEntry,
  assistant: AssistantEntry,
  thinking: ThinkingEntry,
  tool: ToolEntry,
  approval: ApprovalEntry,
}
