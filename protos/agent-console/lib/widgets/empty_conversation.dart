import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// 空会话态:引导文案 + 示例提问。点示例直接发起一轮对话,不用先打字。
class EmptyConversation extends StatelessWidget {
  const EmptyConversation({super.key, required this.onPrompt});

  final ValueChanged<String> onPrompt;

  /// 三条示例分别命中仓库里的三段剧本:检索成功、工具失败、危险操作审批。
  static const List<String> examplePrompts = <String>[
    '我们的退款政策是怎样的?',
    '统计上个月各渠道的订单总额',
    '清理 30 天前的运行日志',
  ];

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(Tokens.space6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const SizedBox(height: Tokens.space8),
          Icon(
            Icons.terminal_outlined,
            size: Tokens.iconLg * 2,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: Tokens.space4),
          Text('开始一段对话', style: theme.textTheme.titleLarge),
          const SizedBox(height: Tokens.space2),
          Text(
            '这个 agent 会先思考、再调用工具,遇到危险操作时会停下来请求你的批准。'
            '下面几条示例分别对应三种典型流程。',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: Tokens.space6),
          for (final String prompt in examplePrompts)
            Padding(
              padding: const EdgeInsets.only(bottom: Tokens.space2),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => onPrompt(prompt),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(prompt),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
