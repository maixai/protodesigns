# example-app(mobile 原型样板)

Flutter 载体的最小可运行原型,与 `protos/example-web` 同属 `product=example`,
演示契约跨端一致、异步四态、安全区、底部导航与按压反馈。

复制本目录作为新的 mobile 原型模板。与 web / 桌面原型的差异:

- 载具是 **Flutter(Dart)**,不是 Vue;`targets` 为 `[mobile]`;
- 运行时用 `flutter`,契约生成用 Node 侧的 TypeSpec / quicktype(因此目录内同时有
  `pubspec.yaml` 与一个**仅承载契约工具链依赖**的 `package.json`);
- **这份原型是生产代码的草稿**:Flutter 没有"原型 → 迁移"这一步,代码质量按生产要求。

## 从模板复制出新原型

本目录是**已初始化完整**的 Flutter 工程(`web/` `android/` `ios/` 平台脚手架都在),复制后即可
`flutter pub get && make run`。复制时需要改的地方:

1. `pubspec.yaml` 的 `name`(Dart 包名,须为合法标识符,如 `habit_tracker_app`);
2. `meta.md` 的 `name` / `slug` / `description` / `product`;
3. 平台标识:`android/app/build.gradle.kts` 的 `applicationId`、`ios/Runner.xcodeproj` 的 bundle id;
4. 若复制时漏了平台目录(或想换目标平台),用
   `flutter create --platforms=web,ios,android .` 补齐 —— 它按 `pubspec.yaml` 的 `name` 建工程,
   并**跳过已存在的文件**,不会覆盖 `lib/` 与 `test/`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `make run` | 契约生成 + `flutter run -d chrome`(浏览器预览,最快) |
| `make run DEVICE=<设备 id>` | 起在真机 / 模拟器上(平台特有交互只能在这里验) |
| `make contracts` | 生成 Dart 类型到 `lib/contracts/generated/` |
| `make calibrate` | `flutter analyze` + golden 视觉回归测试 |
| `make calibrate-update` | 更新 golden 基线(默认基线与 OS 无关;若测试加载了真实字体才会与 OS 绑定) |

## 浏览器验不了什么

`make run` 默认起 Chrome,能看到布局与视觉,**看不到手感**。以下项必须上真机 / 模拟器,
评审时未确认的项一律登记为「未验证」,不得当作通过:

手势返回、软键盘弹起与遮挡、真实安全区 inset、权限弹窗时机、触觉反馈、滚动惯性、后台 / 中断。

详见 `.claude/rules/baseline-mobile.md`。

## 前置依赖

- **Flutter SDK**(稳定版):本机未安装时 `make run` / `make build` / `make calibrate` 均不可用。
- **Node.js + pnpm**:用于契约生成,与 Flutter 无关。
