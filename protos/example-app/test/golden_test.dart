import 'package:example_app/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  // 组件级视觉回归。
  //
  // 默认情况下这些基线**跨 OS 稳定**:Flutter 测试环境不加载 app 自定义字体,文字渲染为等宽的
  // FlutterTest 方块(等价于 Alchemist 的 "CI 模式"),因此不需要额外引入 Alchemist 就能在
  // 任意 OS 的 CI 上比对。
  //
  // ⚠️ 一旦在测试里加载真实字体(FontLoader),基线就与生成它的 OS 绑定 —— 字体栅格化差异会让
  // 同一张图在 macOS / Linux 之间差 1-2px。那时才需要引入 Alchemist 单独出一套方块基线。
  // 详见 .claude/rules/baseline-mobile.md。
  testWidgets('首页浅色主题视觉基线', (WidgetTester tester) async {
    // 固定视口与像素比:不固定会让基线随时机漂移。
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const ExampleApp());

    // 首帧是 loading 态;dummy 数据有 150-300ms 随机延迟,需显式越过它再截图,
    // 否则基线会在 loading 与有数据两态之间随机漂移。
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/home_light.png'),
    );
  });

  testWidgets('异步数据最终进入有数据态', (WidgetTester tester) async {
    await tester.pumpWidget(const ExampleApp());
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();

    // 与 web 侧同属 product=example,展示的是同一份 dummy 数据。
    expect(find.text('林晚晴'), findsOneWidget);
    expect(find.text('lin.wanqing@example.com'), findsOneWidget);
  });
}
