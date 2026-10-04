import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// 可折叠区块:思考过程与工具调用卡片共用的展开 / 收起外壳。
/// 头部整体可点,带按压反馈;展开只用条件渲染,不做高度动画。
class CollapsibleSection extends StatefulWidget {
  const CollapsibleSection({
    super.key,
    required this.header,
    required this.child,
    this.initiallyExpanded = false,
    this.semanticLabel,
  });

  final Widget header;
  final Widget child;
  final bool initiallyExpanded;
  final String? semanticLabel;

  @override
  State<CollapsibleSection> createState() => _CollapsibleSectionState();
}

class _CollapsibleSectionState extends State<CollapsibleSection> {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        border: Border.all(color: theme.colorScheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Semantics(
            button: true,
            expanded: _expanded,
            label: widget.semanticLabel,
            child: InkWell(
              borderRadius: BorderRadius.circular(Tokens.radiusMd),
              onTap: () => setState(() => _expanded = !_expanded),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: Tokens.space3,
                  vertical: Tokens.space3,
                ),
                child: Row(
                  children: <Widget>[
                    Expanded(child: widget.header),
                    AnimatedRotation(
                      turns: _expanded ? 0.5 : 0,
                      duration: Tokens.durationFast,
                      child: Icon(
                        Icons.expand_more,
                        size: Tokens.iconMd,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                Tokens.space3,
                0,
                Tokens.space3,
                Tokens.space3,
              ),
              child: widget.child,
            ),
        ],
      ),
    );
  }
}

/// 键值参数表:技术信息一律走等宽字体。
class KeyValueList extends StatelessWidget {
  const KeyValueList({super.key, required this.entries});

  final Map<String, String> entries;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        for (final MapEntry<String, String> entry in entries.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: Tokens.space2),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                SizedBox(
                  width: 92,
                  child: Text(
                    entry.key,
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontFamily: TokenFonts.mono,
                      height: Tokens.lineSnug,
                    ),
                  ),
                ),
                const SizedBox(width: Tokens.space2),
                Expanded(
                  child: SelectableText(
                    entry.value,
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontFamily: TokenFonts.mono,
                      color: theme.colorScheme.onSurface,
                      height: Tokens.lineSnug,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
