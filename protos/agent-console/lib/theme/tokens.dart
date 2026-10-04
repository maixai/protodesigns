import 'package:flutter/material.dart';

/// 设计 token:设计语言 **Tungsten 青瓷**(完整规范见 .claude/rules/design-language.md)。
///
/// 三层结构,方向只能向下:ramp → 语义角色 → 组件引用。
/// 组件内**禁止** hardcode 颜色 / 字号 / 行高 / 间距,一律引用 [Tokens] 或主题。
///
/// 中文排版要点(与通用西文规范冲突处以设计语言为准):
///   - 基准字号 15(不是 14):中文笔画密,14 偏小;
///   - 正文行高 1.7(不是 1.5):中文需要更大行距;
///   - 字重封顶 w600,不用 w700;
///   - 避头尾与中西文间距交给 Flutter 文本引擎,不要自己插空格。
abstract final class Tokens {
  // ---------------------------------------------------------------------------
  // ramp 层:中性色(暖调 chromatic neutral,色相约 35°、饱和约 8%,不用纯灰)
  // ---------------------------------------------------------------------------
  static const Color neutral0 = Color(0xFFFFFFFF);
  static const Color neutral50 = Color(0xFFFAF8F5);
  static const Color neutral100 = Color(0xFFF4F1EC);
  static const Color neutral200 = Color(0xFFE8E4DC);
  static const Color neutral300 = Color(0xFFD8D2C8);
  static const Color neutral400 = Color(0xFFB3AAA0);
  static const Color neutral500 = Color(0xFF756C63);
  static const Color neutral600 = Color(0xFF5C554D);
  static const Color neutral700 = Color(0xFF46403A);
  static const Color neutral800 = Color(0xFF302B25);
  static const Color neutral900 = Color(0xFF221D18);

  // 深色:整体反转中性 ramp
  static const Color darkNeutral0 = Color(0xFF1C1916);
  static const Color darkNeutral50 = Color(0xFF14110E);
  static const Color darkNeutral100 = Color(0xFF26221D);
  static const Color darkNeutral200 = Color(0xFF38332C);
  static const Color darkNeutral300 = Color(0xFF4A443B);
  static const Color darkNeutral400 = Color(0xFF6B6358);
  static const Color darkNeutral500 = Color(0xFF8F867A);
  static const Color darkNeutral600 = Color(0xFFB5ACA0);
  static const Color darkNeutral700 = Color(0xFFD6CFC4);
  static const Color darkNeutral800 = Color(0xFFE8E2D8);
  static const Color darkNeutral900 = Color(0xFFF5F1EA);

  // ramp 层:强调色(青瓷)
  static const Color accent500 = Color(0xFF3F8A7C);
  static const Color accent600 = Color(0xFF2E6F63);
  static const Color accent700 = Color(0xFF245A50);
  static const Color darkAccent500 = Color(0xFF6FB3A4);
  static const Color darkAccent600 = Color(0xFF8CC7B9);
  static const Color darkAccent700 = Color(0xFF63A79A);

  // ramp 层:点缀色(暖珀)与状态色
  static const Color highlight = Color(0xFF8A6420);
  static const Color success = Color(0xFF3F6B4F);
  static const Color warning = Color(0xFF8A6420);
  static const Color error = Color(0xFF9C4038);
  static const Color info = Color(0xFF3D5A70);
  static const Color darkHighlight = Color(0xFFE3B876);
  static const Color darkSuccess = Color(0xFF7FB894);
  static const Color darkWarning = Color(0xFFE3B876);
  static const Color darkError = Color(0xFFD98A80);
  static const Color darkInfo = Color(0xFF8FB0C9);

  // ---------------------------------------------------------------------------
  // 结构 token
  // ---------------------------------------------------------------------------

  /// 字号阶:Major Third(1.25),基准 15。
  static const double fontSizeXs = 12;
  static const double fontSizeSm = 13;
  static const double fontSizeMd = 15;
  static const double fontSizeLg = 19;
  static const double fontSizeXl = 23;
  static const double fontSize2xl = 29;
  static const double fontSize3xl = 37;

  /// 行高:分档。正文 1.7 —— 中文在 1.4–1.5 下会明显发挤。
  static const double lineTight = 1.25;
  static const double lineSnug = 1.45;
  static const double lineBody = 1.7;
  static const double lineLoose = 1.85;

  /// 字重封顶 w600。
  static const FontWeight weightRegular = FontWeight.w400;
  static const FontWeight weightMedium = FontWeight.w500;
  static const FontWeight weightStrong = FontWeight.w600;

  /// 间距(4px 基准)。
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space6 = 24;
  static const double space8 = 32;
  static const double space12 = 48;

  /// 圆角与边框。
  static const double radiusSm = 6;
  static const double radiusMd = 8;
  static const double radiusLg = 12;

  /// 控件高度与触达尺寸(指针目标下限)。
  static const double controlHeight = 36;
  static const double targetSize = 44;

  /// 图标:描边不随尺寸缩放,否则小图标会显得比大图标更重。
  static const double iconSm = 16;
  static const double iconMd = 20;
  static const double iconLg = 24;
  static const double iconStroke = 1.5;

  /// 动效时长。
  static const Duration durationFast = Duration(milliseconds: 140);
  static const Duration durationBase = Duration(milliseconds: 200);
  static const Duration durationSlow = Duration(milliseconds: 280);
}

/// 字体族:humanist 优先。Flutter 不像 CSS 那样能写回退栈,
/// 因此**必须打包自带字体**才能保证跨平台一致,否则 iOS / Android 会各用各的默认字体。
abstract final class TokenFonts {
  static const String sans = 'IBM Plex Sans';
  static const String mono = 'IBM Plex Mono';
}

/// 浅色主题。
ThemeData buildLightTheme() {
  return _buildTheme(
    brightness: Brightness.light,
    background: Tokens.neutral50,
    surface: Tokens.neutral0,
    sunken: Tokens.neutral100,
    onSurface: Tokens.neutral900,
    secondaryText: Tokens.neutral600,
    tertiaryText: Tokens.neutral500,
    disabledText: Tokens.neutral400,
    outline: Tokens.neutral200,
    outlineStrong: Tokens.neutral300,
    primary: Tokens.accent600,
    primaryHover: Tokens.accent500,
    onPrimary: Colors.white,
  );
}

/// 深色主题:整体反转中性 ramp 并提亮强调色,组件无需感知主题差异。
ThemeData buildDarkTheme() {
  return _buildTheme(
    brightness: Brightness.dark,
    background: Tokens.darkNeutral50,
    surface: Tokens.darkNeutral0,
    sunken: Tokens.darkNeutral100,
    onSurface: Tokens.darkNeutral900,
    secondaryText: Tokens.darkNeutral600,
    tertiaryText: Tokens.darkNeutral500,
    disabledText: Tokens.darkNeutral400,
    outline: Tokens.darkNeutral200,
    outlineStrong: Tokens.darkNeutral300,
    primary: Tokens.darkAccent600,
    primaryHover: Tokens.darkAccent500,
    onPrimary: const Color(0xFF10201C),
  );
}

/// 按明暗两组色值装配主题,避免两份重复的 ThemeData 定义。
ThemeData _buildTheme({
  required Brightness brightness,
  required Color background,
  required Color surface,
  required Color sunken,
  required Color onSurface,
  required Color secondaryText,
  required Color tertiaryText,
  required Color disabledText,
  required Color outline,
  required Color outlineStrong,
  required Color primary,
  required Color primaryHover,
  required Color onPrimary,
}) {
  final ColorScheme scheme = ColorScheme.fromSeed(
    seedColor: primary,
    brightness: brightness,
  ).copyWith(
    primary: primary,
    onPrimary: onPrimary,
    surface: surface,
    onSurface: onSurface,
    surfaceContainerHighest: sunken,
    outline: outline,
    outlineVariant: outlineStrong,
    error: brightness == Brightness.light ? Tokens.error : Tokens.darkError,
  );

  // 正文的行高与字重集中在这里定,避免逐个组件写。
  TextStyle text(double size, {FontWeight weight = Tokens.weightRegular}) {
    return TextStyle(
      fontSize: size,
      fontWeight: weight,
      height: Tokens.lineBody,
      color: onSurface,
    );
  }

  return ThemeData(
    useMaterial3: true,
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: background,
    // 中文排版:统一基础字族。未打包字体时 Flutter 会回落到平台默认字体,
    // 换行位置会随平台变化 —— 这是移动端基线上登记过的已知差异。
    fontFamily: TokenFonts.sans,
    appBarTheme: AppBarTheme(
      backgroundColor: surface,
      foregroundColor: onSurface,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text(Tokens.fontSizeLg, weight: Tokens.weightStrong),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      indicatorColor: primary.withValues(alpha: 0.16),
      labelTextStyle: WidgetStatePropertyAll<TextStyle>(text(Tokens.fontSizeXs)),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      // 层级以发丝描边为主,不用阴影
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        side: BorderSide(color: outline),
      ),
    ),
    dividerTheme: DividerThemeData(color: outline, thickness: 1, space: 1),
    listTileTheme: ListTileThemeData(
      subtitleTextStyle: text(Tokens.fontSizeSm).copyWith(color: secondaryText),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: sunken,
      hintStyle: text(Tokens.fontSizeMd).copyWith(color: tertiaryText),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: Tokens.space3,
        vertical: Tokens.space3,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        borderSide: BorderSide(color: outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        borderSide: BorderSide(color: outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(Tokens.radiusMd),
        borderSide: BorderSide(color: primary, width: 2),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: onPrimary,
        disabledBackgroundColor: sunken,
        disabledForegroundColor: disabledText,
        minimumSize: const Size(0, Tokens.controlHeight),
        textStyle: text(Tokens.fontSizeMd, weight: Tokens.weightMedium),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Tokens.radiusMd),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: onSurface,
        side: BorderSide(color: outlineStrong),
        minimumSize: const Size(0, Tokens.controlHeight),
        textStyle: text(Tokens.fontSizeMd, weight: Tokens.weightMedium),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Tokens.radiusMd),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: primary,
        textStyle: text(Tokens.fontSizeMd, weight: Tokens.weightMedium),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: primary),
    textTheme: TextTheme(
      titleLarge: text(Tokens.fontSizeXl, weight: Tokens.weightStrong).copyWith(
        height: Tokens.lineTight,
      ),
      titleMedium: text(Tokens.fontSizeLg, weight: Tokens.weightStrong).copyWith(
        height: Tokens.lineSnug,
      ),
      titleSmall: text(Tokens.fontSizeMd, weight: Tokens.weightMedium).copyWith(
        height: Tokens.lineSnug,
      ),
      bodyLarge: text(Tokens.fontSizeMd),
      bodyMedium: text(Tokens.fontSizeMd),
      bodySmall: text(Tokens.fontSizeSm).copyWith(color: secondaryText),
      labelLarge: text(Tokens.fontSizeMd, weight: Tokens.weightMedium),
      labelSmall: text(Tokens.fontSizeXs).copyWith(color: tertiaryText),
    ),
  );
}
