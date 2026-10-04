import 'package:flutter/material.dart';

import 'pages/user_list_page.dart';
import 'theme/tokens.dart';

void main() {
  runApp(const ExampleApp());
}

/// 原型入口:装配明暗两套主题与首页。
class ExampleApp extends StatelessWidget {
  const ExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '示例原型',
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      // 跟随系统深浅色,与桌面端的壳能力 mock 行为一致。
      themeMode: ThemeMode.system,
      home: const UserListPage(),
    );
  }
}
