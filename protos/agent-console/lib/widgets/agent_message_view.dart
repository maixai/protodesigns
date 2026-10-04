import 'package:flutter/material.dart';

import '../contracts/generated/conversation.dart' as contract;
import '../theme/status_palette.dart';
import '../theme/tokens.dart';
import 'approval_card.dart';
import 'reasoning_panel.dart';
import 'tool_call_card.dart';

/// agent 消息视图:自上而下依次是思考过程 → 工具调用卡片 → 审批卡片 → 正文。
/// 折叠态与展开态的信息都在这里定,页面只负责把它塞进列表。
class AgentMessageView extends StatelessWidget {
  const AgentMessageView({
    super.key,
    required this.message,
    required this.onRegenerate,
    required this.onApprovalDecision,
  });

  final contract.AgentMessage message;
  final VoidCallback onRegenerate;
  final void Function(bool approved) onApprovalDecision;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final StatusPalette palette = StatusPalette.of(context);
    final bool isStreaming = message.messageStatus == contract.MessageStatus.STREAMING;
    final contract.ApprovalRequest? approval = message.approval;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        ReasoningPanel(steps: message.reasoning, isStreaming: isStreaming),
        for (final contract.ToolCall call in message.toolCalls)
          Padding(
            padding: const EdgeInsets.only(top: Tokens.space2),
            child: ToolCallCard(call: call),
          ),
        if (approval != null)
          Padding(
            padding: const EdgeInsets.only(top: Tokens.space2),
            child: ApprovalCard(
              request: approval,
              onDecision: onApprovalDecision,
              isInteractive: isStreaming,
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(top: Tokens.space2),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: theme.colorScheme.surface,
              borderRadius: BorderRadius.circular(Tokens.radiusLg),
              border: Border.all(color: theme.colorScheme.outline),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: Tokens.space4,
                vertical: Tokens.space3,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (message.text.isEmpty && isStreaming)
                    Text(
                      '正在生成…',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    )
                  else
                    SelectableText(
                      message.text,
                      style: theme.textTheme.bodyMedium,
                    ),
                  if (isStreaming)
                    Padding(
                      padding: const EdgeInsets.only(top: Tokens.space2),
                      child: Row(
                        children: <Widget>[
                          SizedBox(
                            width: Tokens.iconSm,
                            height: Tokens.iconSm,
                            child: const CircularProgressIndicator(
                              strokeWidth: Tokens.iconStroke,
                            ),
                          ),
                          const SizedBox(width: Tokens.space2),
                          Text('生成中…', style: theme.textTheme.labelSmall),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        if (message.messageStatus == contract.MessageStatus.ABORTED ||
            message.messageStatus == contract.MessageStatus.FAILED)
          Padding(
            padding: const EdgeInsets.only(top: Tokens.space2),
            child: Row(
              children: <Widget>[
                Text(
                  message.messageStatus == contract.MessageStatus.ABORTED
                      ? '已停止生成'
                      : '生成失败',
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: message.messageStatus == contract.MessageStatus.FAILED
                        ? palette.error
                        : theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(width: Tokens.space2),
                TextButton.icon(
                  onPressed: onRegenerate,
                  icon: const Icon(Icons.refresh, size: Tokens.iconSm),
                  label: const Text('重新生成'),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
