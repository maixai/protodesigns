import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// 输入区:多行输入 + 发送按钮。生成中时切换成「停止生成」。
/// 输入为空时发送按钮禁用;发送后由页面清空输入。
class ChatComposer extends StatelessWidget {
  const ChatComposer({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.isGenerating,
    required this.onSend,
    required this.onStop,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isGenerating;
  final ValueChanged<String> onSend;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(top: BorderSide(color: theme.colorScheme.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(Tokens.space3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (isGenerating)
              Padding(
                padding: const EdgeInsets.only(bottom: Tokens.space2),
                child: OutlinedButton.icon(
                  onPressed: onStop,
                  icon: const Icon(Icons.stop_circle_outlined, size: Tokens.iconSm),
                  label: const Text('停止生成'),
                ),
              ),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: <Widget>[
                Expanded(
                  child: TextField(
                    controller: controller,
                    focusNode: focusNode,
                    minLines: 1,
                    maxLines: 5,
                    keyboardType: TextInputType.multiline,
                    textInputAction: TextInputAction.newline,
                    decoration: const InputDecoration(
                      hintText: '向 agent 提问,例如「统计上个月的订单总额」',
                    ),
                  ),
                ),
                const SizedBox(width: Tokens.space2),
                // ValueListenableBuilder 让发送按钮的禁用态跟随输入实时变化。
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: controller,
                  builder: (BuildContext context, TextEditingValue value, _) {
                    final bool canSend = value.text.trim().isNotEmpty && !isGenerating;
                    return SizedBox(
                      width: Tokens.targetSize,
                      height: Tokens.targetSize,
                      child: IconButton(
                        tooltip: '发送',
                        onPressed: canSend ? () => onSend(value.text) : null,
                        icon: const Icon(Icons.arrow_upward),
                      ),
                    );
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
