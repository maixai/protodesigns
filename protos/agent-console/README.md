# agent-console(AI Agent 控制台原型)

Flutter 载体的 AI Agent 控制台原型,演示典型 agent 会话的四种交互:
流式输出与中止、工具调用卡片、思考过程折叠、危险操作审批确认。

- `targets` 为 `[mobile]`,`data` 为 `local-first`:数据全部由本地模拟引擎产出,
  不接真实模型,刷新即重置;
- 载具是 **Flutter(Dart)**;运行时用 `flutter`,契约生成用 Node 侧的
  TypeSpec / quicktype(因此目录内同时有 `pubspec.yaml` 与一个**仅承载契约工具链依赖**的
  `package.json`);
- **这份原型是生产代码的草稿**:Flutter 没有"原型 → 迁移"这一步,代码质量按生产要求。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `lib/theme/tokens.dart` | 设计语言 Tungsten 青瓷的 token 与明暗两套主题 |
| `lib/theme/status_palette.dart` | 状态色按当前主题亮度取用,组件不自行判断 brightness |
| `lib/data/agent_repository.dart` | 模拟引擎:回合事件流 + 三段可复现剧本 |
| `lib/data/console_controller.dart` | 状态机:四态视图 + 消息列表 |
| `lib/data/message_ops.dart` | 生成物是 final,集中提供派生新实例的辅助函数 |
| `lib/pages/console_page.dart` | 页面装配:四态、对话流、输入区 |
| `lib/widgets/` | 消息气泡、思考面板、工具卡片、审批卡片、输入区等小组件 |

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `make run` | 契约生成 + `flutter run -d chrome`(浏览器预览,最快) |
| `make run DEVICE=<设备 id>` | 起在真机 / 模拟器上 |
| `make contracts` | 生成 Dart 类型到 `lib/contracts/generated/` |
| `make calibrate` | `flutter analyze` + widget 测试 |

## 浏览器验不了什么

`make run` 默认起 Chrome,能看到布局与视觉,**看不到手感**。以下项必须上真机 / 模拟器,
评审时未确认的项一律登记为「未验证」,不得当作通过:

手势返回、软键盘弹起与遮挡、真实安全区 inset、权限弹窗时机、触觉反馈、滚动惯性、后台 / 中断。

详见 `.claude/rules/baseline-mobile.md`。
