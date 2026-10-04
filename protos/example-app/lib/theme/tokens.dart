import 'package:flutter/material.dart';

/// 设计 token:与 protos/example-web 的 src/style.css 取同一套值(同属 product=example)。
///
/// 组件内**禁止** hardcode 颜色 / 字号 / 间距,一律引用本文件的常量或主题。
/// token 目前两端手写(见 .claude/rules/contracts.md 的说明),核心值是跨端一致的那部分。
abstract final class Tokens {
  // 强调色(墨绿)
  static const Color primary500 = Color(0xFF3F6B5D);
  static const Color primary700 = Color(0xFF294638);
  static const Color primaryHover = Color(0xFF4F8070);

  // 中性色(stone)
  static const Color neutral50 = Color(0xFFFAFAF9);
  static const Color neutral100 = Color(0xFFF5F5F4);
  static const Color neutral200 = Color(0xFFE7E5E4);
  static const Color neutral400 = Color(0xFFA8A29E);
  static const Color neutral600 = Color(0xFF57534E);
  static const Color neutral700 = Color(0xFF44403C);
  static const Color neutral800 = Color(0xFF292524);
  static const Color neutral900 = Color(0xFF1C1917);

  // 语义色
  static const Color error = Color(0xFFB85C5C);

  // 间距(4px 基准)
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 20;
  static const double space6 = 24;

  // 圆角
  static const double radiusSm = 4;
  static const double radiusMd = 8;
}

/// 浅色主题。
ThemeData buildLightTheme() {
  return _buildTheme(
    brightness: Brightness.light,
    background: Tokens.neutral50,
    surface: Colors.white,
    onSurface: Tokens.neutral900,
    secondaryText: Tokens.neutral600,
    outline: Tokens.neutral200,
    primary: Tokens.primary500,
  );
}

/// 深色主题:只换色值,组件无需感知主题差异。
ThemeData buildDarkTheme() {
  return _buildTheme(
    brightness: Brightness.dark,
    background: Tokens.neutral900,
    surface: Tokens.neutral800,
    onSurface: Tokens.neutral100,
    secondaryText: Tokens.neutral400,
    outline: Tokens.neutral700,
    primary: Tokens.primaryHover,
  );
}

/// 按明暗两组色值装配主题,避免两份重复的 ThemeData 定义。
ThemeData _buildTheme({
  required Brightness brightness,
  required Color background,
  required Color surface,
  required Color onSurface,
  required Color secondaryText,
  required Color outline,
  required Color primary,
}) {
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: primary,
    brightness: brightness,
  ).copyWith(
    primary: primary,
    surface: surface,
    onSurface: onSurface,
    outline: outline,
    error: Tokens.error,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: background,
    appBarTheme: AppBarTheme(
      backgroundColor: surface,
      foregroundColor: onSurface,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      indicatorColor: primary.withValues(alpha: 0.16),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        side: BorderSide(color: outline),
      ),
    ),
    listTileTheme: ListTileThemeData(
      subtitleTextStyle: TextStyle(color: secondaryText, fontSize: 13),
    ),
    textTheme: const TextTheme(
      titleLarge: TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
      bodyMedium: TextStyle(fontSize: 14),
      bodySmall: TextStyle(fontSize: 13),
    ),
  );
}
