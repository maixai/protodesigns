import "@typespec/json-schema";

using TypeSpec.JsonSchema;

// AI Agent 控制台的领域契约。
//
// data 为 local-first:本原型不接真实后端,对话数据全部由本地模拟引擎产出,
// 因此契约侧重**数据模型**(实体结构与取值集合),不定义 HTTP 端点。
//
// 书写约定(见 .claude/rules/contracts.md):
//   1. 需要独立产出类型的"入口类型"加 @summary("<类型名>") + @jsonSchema 两个标注;
//   2. 被入口类型引用的枚举 / 标量不加标注,会自动内联进引用它的那个 schema;
//   3. Dart 侧枚举由 quicktype 按**字段名**命名,故同名字段(如各实体的 status)
//      在 Dart 侧会得到同名枚举 —— 载体代码里用 import 前缀区分,不手改生成物。
namespace AgentConsole;

// 消息角色:被 AgentMessage 引用,自动内联,不单独产出文件。
enum MessageRole {
  user,
  agent,
}

// 消息状态:streaming 表示正在逐字输出;aborted 表示被用户中止但保留已生成内容。
enum MessageStatus {
  streaming,
  done,
  aborted,
  failed,
}

// 工具调用状态。
enum ToolCallStatus {
  running,
  succeeded,
  failed,
}

// 审批风险等级:决定审批卡片上风险标签的呈现。
enum ApprovalRisk {
  low,
  medium,
  high,
}

// 审批状态:pending 表示流程阻塞中,等待用户响应。
enum ApprovalStatus {
  pending,
  approved,
  rejected,
}

// 工具调用:agent 在生成回答前后发起的工具调用,在对话流里渲染为可展开卡片。
@summary("ToolCall")
@jsonSchema
model ToolCall {
  id: string;

  // 工具名,如 search_docs / run_query。
  name: string;

  // 调用参数,键值对形式展示在卡片上。
  arguments: Record<string>;

  // 结果摘要;失败时承载错误信息。
  result: string;

  // 本次调用的状态枚举。
  toolStatus: ToolCallStatus;

  // 调用发生时刻。
  at: utcDateTime;
}

// 思考步骤:agent 回复上方的可折叠"思考过程"区域,每条即一步。
@summary("ReasoningStep")
@jsonSchema
model ReasoningStep {
  id: string;

  // 一步推理的文字描述。
  text: string;

  // 该步耗时,毫秒。
  durationMs: int32;
}

// 审批请求:agent 执行危险操作前插入对话流的审批卡片。
@summary("ApprovalRequest")
@jsonSchema
model ApprovalRequest {
  id: string;

  // 待执行的操作名,如 delete_documents。
  action: string;

  // 一句话说明这次操作要做什么。
  summary: string;

  // 待执行操作的参数,键值对展示。
  arguments: Record<string>;

  // 风险等级。
  risk: ApprovalRisk;

  // 审批状态;pending 时 agent 消息停留在等待态。
  approvalStatus: ApprovalStatus;
}

// 对话消息:user 与 agent 共用同一结构,由 role 区分渲染方式。
@summary("AgentMessage")
@jsonSchema
model AgentMessage {
  id: string;

  role: MessageRole;

  // 正文;agent 消息在 streaming 期间逐步增长。
  text: string;

  // 思考步骤列表;user 消息为空数组。默认收起,展开看完整步骤。
  reasoning: ReasoningStep[];

  // 本条消息触发的工具调用;无则空数组。
  toolCalls: ToolCall[];

  // 本条消息发起、且尚未有结果的审批请求;无则为 null。
  approval: ApprovalRequest | null;

  // 消息状态枚举。
  messageStatus: MessageStatus;

  // 消息创建时刻。
  at: utcDateTime;
}

// 会话:一个会话持有按时间排序的消息列表。
@summary("Conversation")
@jsonSchema
model Conversation {
  id: string;

  title: string;

  messages: AgentMessage[];
}
