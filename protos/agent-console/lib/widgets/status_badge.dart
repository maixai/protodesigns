import 'package:flutter/material.dart';

import '../contracts/generated/conversation.dart' as contract;
import '../theme/status_palette.dart';
import '../theme/tokens.dart';

/// 状态徽标:工具调用状态、审批状态、风险等级共用。
/// 颜色与文案都集中在这里映射,避免各卡片各写一套。
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.color, this.icon});

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: Tokens.space2,
        vertical: Tokens.space1,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(Tokens.radiusSm),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icon != null) ...<Widget>[
            Icon(icon, size: Tokens.iconSm, color: color),
            const SizedBox(width: Tokens.space1),
          ],
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: Tokens.weightMedium,
            ),
          ),
        ],
      ),
    );
  }
}

/// 工具调用状态 → 徽标。
class ToolStatusBadge extends StatelessWidget {
  const ToolStatusBadge({super.key, required this.status});

  final contract.Tool status;

  @override
  Widget build(BuildContext context) {
    final StatusPalette palette = StatusPalette.of(context);
    return switch (status) {
      contract.Tool.RUNNING => StatusBadge(
          label: '运行中',
          color: palette.info,
          icon: Icons.autorenew,
        ),
      contract.Tool.SUCCEEDED => StatusBadge(
          label: '成功',
          color: palette.success,
          icon: Icons.check_circle_outline,
        ),
      contract.Tool.FAILED => StatusBadge(
          label: '失败',
          color: palette.error,
          icon: Icons.error_outline,
        ),
    };
  }
}

/// 审批状态 → 徽标。
class ApprovalStatusBadge extends StatelessWidget {
  const ApprovalStatusBadge({super.key, required this.status});

  final contract.Approval status;

  @override
  Widget build(BuildContext context) {
    final StatusPalette palette = StatusPalette.of(context);
    return switch (status) {
      contract.Approval.PENDING => StatusBadge(
          label: '等待批准',
          color: palette.warning,
          icon: Icons.hourglass_empty,
        ),
      contract.Approval.APPROVED => StatusBadge(
          label: '已批准',
          color: palette.success,
          icon: Icons.check_circle_outline,
        ),
      contract.Approval.REJECTED => StatusBadge(
          label: '已拒绝',
          color: palette.error,
          icon: Icons.block,
        ),
    };
  }
}

/// 风险等级 → 徽标。
class RiskBadge extends StatelessWidget {
  const RiskBadge({super.key, required this.risk});

  final contract.Risk risk;

  @override
  Widget build(BuildContext context) {
    final StatusPalette palette = StatusPalette.of(context);
    return switch (risk) {
      contract.Risk.LOW => StatusBadge(label: '低风险', color: palette.info),
      contract.Risk.MEDIUM => StatusBadge(label: '中风险', color: palette.warning),
      contract.Risk.HIGH => StatusBadge(label: '高风险', color: palette.error),
    };
  }
}
