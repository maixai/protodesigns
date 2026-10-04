import 'package:flutter/material.dart';

import '../contracts/generated/conversation.dart' as contract;
import '../theme/status_palette.dart';
import '../theme/tokens.dart';
import 'collapsible_section.dart';
import 'status_badge.dart';

/// 工具调用卡片:折叠时展示工具名、状态与结果摘要,展开后看完整参数与结果。
/// 运行中在标题旁显示进度指示,结果区留白但保留卡片,避免布局跳动。
class ToolCallCard extends StatelessWidget {
  const ToolCallCard({super.key, required this.call});

  final contract.ToolCall call;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final StatusPalette palette = StatusPalette.of(context);
    final bool isRunning = call.toolStatus == contract.Tool.RUNNING;
    final bool isFailed = call.toolStatus == contract.Tool.FAILED;

    return CollapsibleSection(
      semanticLabel: '工具调用 ${call.name}',
      initiallyExpanded: isFailed,
      header: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              if (isRunning)
                const SizedBox(
                  width: Tokens.iconSm,
                  height: Tokens.iconSm,
                  child: CircularProgressIndicator(strokeWidth: Tokens.iconStroke),
                )
              else
                Icon(
                  Icons.build_outlined,
                  size: Tokens.iconSm,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              const SizedBox(width: Tokens.space2),
              Flexible(
                child: Text(
                  call.name,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontFamily: TokenFonts.mono,
                    fontWeight: Tokens.weightMedium,
                  ),
                ),
              ),
              const SizedBox(width: Tokens.space2),
              ToolStatusBadge(status: call.toolStatus),
            ],
          ),
          if (!isRunning)
            Padding(
              padding: const EdgeInsets.only(top: Tokens.space1),
              child: Text(
                call.result,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: isFailed ? palette.error : theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('参数', style: theme.textTheme.labelSmall),
          const SizedBox(height: Tokens.space2),
          KeyValueList(entries: call.arguments),
          const SizedBox(height: Tokens.space2),
          Text('结果', style: theme.textTheme.labelSmall),
          const SizedBox(height: Tokens.space2),
          SelectableText(
            isRunning ? '执行中…' : call.result,
            style: theme.textTheme.bodySmall?.copyWith(
              fontFamily: TokenFonts.mono,
              color: isFailed ? palette.error : theme.colorScheme.onSurface,
              height: Tokens.lineBody,
            ),
          ),
        ],
      ),
    );
  }
}
