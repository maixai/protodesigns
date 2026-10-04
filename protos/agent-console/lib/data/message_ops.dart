import '../contracts/generated/conversation.dart' as contract;

/// 生成物的字段全部为 final,流式输出期间需要不断派生"改了少量字段"的新实例。
/// 这里集中提供这些派生函数,避免在控制器与组件里散落重复的构造调用;
/// **数据结构本身仍然完全来自契约生成物,此处不重复定义任何字段**。
abstract final class MessageOps {
  /// 替换正文。
  static contract.AgentMessage withText(contract.AgentMessage message, String text) {
    return contract.AgentMessage(
      approval: message.approval,
      at: message.at,
      id: message.id,
      messageStatus: message.messageStatus,
      reasoning: message.reasoning,
      role: message.role,
      text: text,
      toolCalls: message.toolCalls,
    );
  }

  /// 替换消息状态。
  static contract.AgentMessage withStatus(
    contract.AgentMessage message,
    contract.MessageStatus status,
  ) {
    return contract.AgentMessage(
      approval: message.approval,
      at: message.at,
      id: message.id,
      messageStatus: status,
      reasoning: message.reasoning,
      role: message.role,
      text: message.text,
      toolCalls: message.toolCalls,
    );
  }

  /// 追加一条思考步骤。
  static contract.AgentMessage addReasoning(
    contract.AgentMessage message,
    contract.ReasoningStep step,
  ) {
    return contract.AgentMessage(
      approval: message.approval,
      at: message.at,
      id: message.id,
      messageStatus: message.messageStatus,
      reasoning: <contract.ReasoningStep>[...message.reasoning, step],
      role: message.role,
      text: message.text,
      toolCalls: message.toolCalls,
    );
  }

  /// 按 id 覆盖一条工具调用(不存在则追加)。
  static contract.AgentMessage putToolCall(
    contract.AgentMessage message,
    contract.ToolCall call,
  ) {
    final int index = message.toolCalls.indexWhere((contract.ToolCall item) => item.id == call.id);
    final List<contract.ToolCall> next = <contract.ToolCall>[...message.toolCalls];
    if (index >= 0) {
      next[index] = call;
    } else {
      next.add(call);
    }
    return contract.AgentMessage(
      approval: message.approval,
      at: message.at,
      id: message.id,
      messageStatus: message.messageStatus,
      reasoning: message.reasoning,
      role: message.role,
      text: message.text,
      toolCalls: next,
    );
  }

  /// 设置或清除审批请求。
  static contract.AgentMessage withApproval(
    contract.AgentMessage message,
    contract.ApprovalRequest? approval,
  ) {
    return contract.AgentMessage(
      approval: approval,
      at: message.at,
      id: message.id,
      messageStatus: message.messageStatus,
      reasoning: message.reasoning,
      role: message.role,
      text: message.text,
      toolCalls: message.toolCalls,
    );
  }

  /// 构造一条用户消息。
  static contract.AgentMessage userMessage({required String id, required String text}) {
    return contract.AgentMessage(
      approval: null,
      at: DateTime.now(),
      id: id,
      messageStatus: contract.MessageStatus.DONE,
      reasoning: const <contract.ReasoningStep>[],
      role: contract.Role.USER,
      text: text,
      toolCalls: const <contract.ToolCall>[],
    );
  }

  /// 构造一条处于 streaming 态的 agent 消息(等待流式内容填充)。
  static contract.AgentMessage agentMessage({required String id}) {
    return contract.AgentMessage(
      approval: null,
      at: DateTime.now(),
      id: id,
      messageStatus: contract.MessageStatus.STREAMING,
      reasoning: const <contract.ReasoningStep>[],
      role: contract.Role.AGENT,
      text: '',
      toolCalls: const <contract.ToolCall>[],
    );
  }
}
