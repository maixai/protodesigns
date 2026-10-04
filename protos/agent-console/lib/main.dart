import 'package:flutter/material.dart';

import 'pages/console_page.dart';
import 'theme/tokens.dart';

void main() {
  runApp(const AgentConsoleApp());
}

/// 原型入口:装配明暗两套主题,并把主题切换开关交给页面顶部。
class AgentConsoleApp extends StatefulWidget {
  const AgentConsoleApp({super.key});

  @override
  State<AgentConsoleApp> createState() => _AgentConsoleAppState();
}

class _AgentConsoleAppState extends State<AgentConsoleApp> {
  ThemeMode _themeMode = ThemeMode.light;

  void _toggleTheme() {
    setState(() {
      _themeMode = _themeMode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI Agent 控制台',
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: _themeMode,
      home: ConsolePage(themeMode: _themeMode, onToggleTheme: _toggleTheme),
    );
  }
}
