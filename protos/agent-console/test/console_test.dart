import 'package:agent_console/main.dart';
import 'package:agent_console/widgets/empty_conversation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// 把整套假时钟推进一段时间,让剧本里的等待与流式输出全部跑完,
/// 避免测试结束时留下 pending timer。
Future<void> _settle(WidgetTester tester, {int ticks = 100}) async {
  for (int i = 0; i < ticks; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  testWidgets('初始是加载态,数据落定后进入空会话引导', (WidgetTester tester) async {
    await tester.pumpWidget(const AgentConsoleApp());
    await tester.pump();

    // 首帧:骨架 + spinner,不是白屏。
    expect(find.byType(CircularProgressIndicator), findsWidgets);

    await tester.pump(const Duration(seconds: 1));

    // 空态:引导文案 + 三条示例提问按钮。
    expect(find.text('开始一段对话'), findsOneWidget);
    expect(find.text(EmptyConversation.examplePrompts.first), findsOneWidget);
  });

  testWidgets('输入为空时发送按钮禁用', (WidgetTester tester) async {
    await tester.pumpWidget(const AgentConsoleApp());
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    final Finder sendButton = find.widgetWithIcon(IconButton, Icons.arrow_upward);
    expect(tester.widget<IconButton>(sendButton).onPressed, isNull);

    await tester.enterText(find.byType(TextField), '你好');
    await tester.pump();
    expect(tester.widget<IconButton>(sendButton).onPressed, isNotNull);
  });

  testWidgets('发送后出现用户消息,输入框被清空', (WidgetTester tester) async {
    await tester.pumpWidget(const AgentConsoleApp());
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    await tester.enterText(find.byType(TextField), '我们的退款政策是怎样的?');
    await tester.pump();
    await tester.tap(find.byTooltip('发送'));
    await tester.pump();

    expect(find.text('我们的退款政策是怎样的?'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, isEmpty);

    // 整轮跑完之后输入框仍然是空的:不能被「生成结束、输入框重新启用」这一步回填。
    await _settle(tester);
    expect(tester.widget<TextField>(find.byType(TextField)).controller?.text, isEmpty);
  });

  testWidgets('点击示例提问直接发起一轮对话', (WidgetTester tester) async {
    await tester.pumpWidget(const AgentConsoleApp());
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    await tester.tap(find.text('清理 30 天前的运行日志'));
    await tester.pump();

    expect(find.text('清理 30 天前的运行日志'), findsOneWidget);

    await _settle(tester);
  });

  testWidgets('演示加载失败后进入失败态,重试可回到空态', (WidgetTester tester) async {
    await tester.pumpWidget(const AgentConsoleApp());
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    await tester.tap(find.byTooltip('更多操作'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('演示加载失败'));
    await tester.pumpAndSettle();

    expect(find.text('会话加载失败'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, '重试'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('开始一段对话'), findsOneWidget);
  });
}
