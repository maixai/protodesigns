import 'package:flutter/material.dart';

import '../contracts/generated/conversation.dart' as contract;
import '../theme/tokens.dart';
import 'collapsible_section.dart';

/// 思考过程面板:默认收起,收起时用一行摘要交代「几步 · 多少秒」,
/// 展开后按顺序列出每一步推理。
class ReasoningPanel extends StatelessWidget {
  const ReasoningPanel({super.key, required this.steps, required this.isStreaming});

  final List<contract.ReasoningStep> steps;

  /// 生成中时摘要追加省略号,表示步骤还可能继续增加。
  final bool isStreaming;

  @override
  Widget build(BuildContext context) {
    if (steps.isEmpty) return const SizedBox.shrink();

    final ThemeData theme = Theme.of(context);
    final int totalMs = steps.fold<int>(
      0,
      (int sum, contract.ReasoningStep step) => sum + step.durationMs,
    );
    final String seconds = (totalMs / 1000).toStringAsFixed(1);

    return CollapsibleSection(
      semanticLabel: '思考过程',
      header: Row(
        children: <Widget>[
          Icon(
            Icons.psychology_outlined,
            size: Tokens.iconSm,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: Tokens.space2),
          Expanded(
            child: Text(
              isStreaming
                  ? '正在思考 · 已完成 ${steps.length} 步'
                  : '思考了 ${steps.length} 步 · $seconds s',
              style: theme.textTheme.bodySmall,
            ),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          for (int i = 0; i < steps.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: Tokens.space2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    '${i + 1}.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontFamily: TokenFonts.mono,
                      height: Tokens.lineSnug,
                    ),
                  ),
                  const SizedBox(width: Tokens.space2),
                  Expanded(
                    child: Text(
                      steps[i].text,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurface,
                        height: Tokens.lineSnug,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
