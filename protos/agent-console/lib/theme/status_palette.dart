import 'package:flutter/material.dart';

import 'tokens.dart';

/// 语义状态色:设计语言的状态色分深浅两套值,这里按当前主题亮度取用,
/// 组件里不再自己判断 [Brightness],也不直接引用 ramp 常量。
/// (tokens.dart 是模板原样复制的文件,故这一层单独成文件。)
class StatusPalette {
  const StatusPalette({
    required this.success,
    required this.warning,
    required this.error,
    required this.info,
    required this.highlight,
  });

  final Color success;
  final Color warning;
  final Color error;
  final Color info;
  final Color highlight;

  static const StatusPalette _light = StatusPalette(
    success: Tokens.success,
    warning: Tokens.warning,
    error: Tokens.error,
    info: Tokens.info,
    highlight: Tokens.highlight,
  );

  static const StatusPalette _dark = StatusPalette(
    success: Tokens.darkSuccess,
    warning: Tokens.darkWarning,
    error: Tokens.darkError,
    info: Tokens.darkInfo,
    highlight: Tokens.darkHighlight,
  );

  static StatusPalette of(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark ? _dark : _light;
  }
}
