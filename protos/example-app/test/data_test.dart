import 'package:example_app/main.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
