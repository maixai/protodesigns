import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// 初始加载态:骨架占位 + spinner,不用白屏。
class ConsoleLoadingView extends StatelessWidget {
  const ConsoleLoadingView({super.key});

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Color bar = theme.colorScheme.surfaceContainerHighest;
    return Padding(
      padding: const EdgeInsets.all(Tokens.space4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: Tokens.space4),
              child: CircularProgressIndicator(),
            ),
          ),
          for (final double width in <double>[0.72, 0.48, 0.6]) ...<Widget>[
            Container(
              width: MediaQuery.sizeOf(context).width * width,
              height: Tokens.controlHeight,
              decoration: BoxDecoration(
                color: bar,
                borderRadius: BorderRadius.circular(Tokens.radiusMd),
              ),
            ),
            const SizedBox(height: Tokens.space3),
          ],
        ],
      ),
    );
  }
}

/// 失败态:错误提示 + 重试。
class ConsoleErrorView extends StatelessWidget {
  const ConsoleErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Tokens.space6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.cloud_off_outlined,
              size: Tokens.iconLg * 2,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: Tokens.space4),
            Text(
              '会话加载失败',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: Tokens.space2),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: Tokens.space6),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: Tokens.iconSm),
              label: const Text('重试'),
            ),
          ],
        ),
      ),
    );
  }
}
