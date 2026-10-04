import 'package:flutter/material.dart';

import '../contracts/generated/conversation.dart' as contract;
import '../theme/status_palette.dart';
import '../theme/tokens.dart';
import 'collapsible_section.dart';
import 'status_badge.dart';

/// 审批卡片:agent 执行危险操作前插入对话流。
/// 未响应时展示「批准 / 拒绝」,响应后按钮换成结果说明 —— 回合正是在这里被阻塞的。
class ApprovalCard extends StatelessWidget {
  const ApprovalCard({
    super.key,
    required this.request,
    required this.onDecision,
    required this.isInteractive,
  });

  final contract.ApprovalRequest request;

  /// 用户做出决定;由控制器转交给当前回合。
  final void Function(bool approved) onDecision;

  /// 回合仍在等待时才是可交互的;已中止或已结束的回合不应再响应。
  final bool isInteractive;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final StatusPalette palette = StatusPalette.of(context);
    final bool isPending = request.approvalStatus == contract.Approval.PENDING;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        border: Border.all(
          color: isPending
              ? palette.warning.withValues(alpha: 0.5)
              : theme.colorScheme.outline,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(Tokens.space3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Icon(Icons.gpp_maybe_outlined, size: Tokens.iconMd, color: palette.warning),
                const SizedBox(width: Tokens.space2),
                Expanded(
                  child: Text(
                    '需要你确认',
                    style: theme.textTheme.titleSmall,
                  ),
                ),
                RiskBadge(risk: request.risk),
              ],
            ),
            const SizedBox(height: Tokens.space2),
            Text(
              request.summary,
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: Tokens.space3),
            Text('操作与参数', style: theme.textTheme.labelSmall),
            const SizedBox(height: Tokens.space2),
            KeyValueList(
              entries: <String, String>{
                'action': request.action,
                ...request.arguments,
              },
            ),
            const SizedBox(height: Tokens.space2),
            if (isPending && isInteractive)
              Row(
                children: <Widget>[
                  FilledButton.icon(
                    onPressed: () => onDecision(true),
                    icon: const Icon(Icons.check, size: Tokens.iconSm),
                    label: const Text('批准'),
                  ),
                  const SizedBox(width: Tokens.space2),
                  OutlinedButton.icon(
                    onPressed: () => onDecision(false),
                    icon: const Icon(Icons.close, size: Tokens.iconSm),
                    label: const Text('拒绝'),
                  ),
                ],
              )
            else
              ApprovalStatusBadge(status: request.approvalStatus),
          ],
        ),
      ),
    );
  }
}
