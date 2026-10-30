# protodesigns

**多端可交互原型设计仓库**。在设计产品前端时,先在此与 AI 共同制作可交互原型,验证交互与信息架构,并产出规范化的数据契约交给后续开发。

- **非生产代码**:原型仅用于交互验证与契约设计参考,数据均为 dummy,刷新即重置。
- **多端支持**:每个原型用 `meta.md` 的 `targets` 声明覆盖哪些端(`web` / `desktop` / `mobile`),据此选用载体与设计基线。
- **完全自包含**:一个原型一个目录,拿走即可重建;原型之间零耦合,可承载互不相关的产品。
- **契约驱动**:数据结构在 `contracts/main.tsp` 定义一次,类型生成到各端,不手写。

## 载体与端基线

| `targets` | 载体 | 端基线 |
| --- | --- | --- |
| 含 `web` | TypeScript + Vite + Vue 3 + 组件库 | `baseline-web.md` |
| 含 `desktop` | **与 web 同一份代码**,额外提供壳能力 mock | `baseline-desktop.md` |
| 含 `mobile` | Flutter(Dart) | `baseline-mobile.md` |

跨端共享的规范见 `.claude/rules/protodesign-baseline.md`;**设计语言见 `.claude/rules/design-language.md`**;契约规则见 `.claude/rules/contracts.md`。

## 前置依赖

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | Vite 与契约工具链(TypeSpec)要求 |
| pnpm | 最新稳定版 | 包管理;建议 `corepack enable` 启用 |
| GNU make | 任意较新版本 | 用于 `make run` / `make contracts` |
| Flutter SDK | 稳定版 | **仅 `targets` 含 `mobile` 的原型需要** |

## 启动方式

在任一原型子目录(如 `protos/example-web/`)执行:

```bash
make run
```

- **web / desktop 原型**:等价于 `pnpm dev --host 0.0.0.0 --port 5173`;浏览器访问 `http://localhost:5173`。
- **mobile 原型**:等价于 `flutter run -d chrome`(默认起 Chrome 预览);真机 / 模拟器用 `make run DEVICE=<设备 id>`。

`make run` 会**先执行契约生成**,保证类型与契约一致(生成物不入库)。并行开发多个原型时用 `PORT` 覆盖端口:

```bash
make run PORT=5174
```

新克隆的目录先安装依赖再启动(web / 桌面原型即 `pnpm install`;mobile 原型另跑一次 `flutter pub get`):

```bash
make deps
```

## 契约

每个原型在 `contracts/main.tsp` 定义数据模型(单一事实源),类型由 `make contracts` 生成:

```text
contracts/main.tsp ──┬─→ contracts/generated/openapi/openapi.yaml
                     └─→ contracts/generated/schema/*.yaml
                              ├─→ src/contracts/generated/*.d.ts   (web / 桌面)
                              └─→ lib/contracts/generated/*.dart   (mobile)
```

| 目标 | 含义 |
| --- | --- |
| `make contracts` | 生成全部类型(web/桌面原型为 TS;mobile 原型为 Dart) |
| `make contracts-schema` | 仅编译契约,产出 OpenAPI 与 JSON Schema |
| `make contracts-clean` | 清理生成物 |

书写约定(入口类型加 `@summary` + `@jsonSchema` 等)与跨端一致性规则见 `.claude/rules/contracts.md`。

## 质量检查

| 目标 | 层 | 覆盖 | 何时跑 |
| --- | --- | --- | --- |
| `make quick-component` | **组件测试** | `tests/component/` 的 props / emits / 键盘 / 状态分支(Vitest + happy-dom) | **每次改动后必跑**,秒级 |
| `make quick-check` | **日常快检** | L0 通用冒烟 + `tests/quick/` 的 area 断言 + 90 秒硬预算 | **每次改动后必跑**,≤ 90 秒 |
| `make quick-check AUTO=1` | 自动选测 | 按 `tests/impact-map.json` 从 git diff 选 area | 日常首选 |
| `make storybook` | 组件工作台 | stories 的组件预览(端口 6006) | 人工视觉评审 |
| `make storybook-test` | 视觉用例 | stories 的真浏览器渲染 | 视觉基线/手动 |
| `make smoke` | 通用冒烟 | 仓库级兜底(`tests/smoke/`) | 兼容旧命令 |
| `make smoke-full` | 全量冒烟 | 全部 `tests/calibrate/` 断言(单引擎、不看像素) | 手动,或 `/protodesign-verify` |
| `make calibrate` | 回归比对 | 双引擎(Chromium + WebKit)逐宽度截图 + 断言不破版 | 手动,或 `/protodesign-verify` |
| `make calibrate-update` | 基线更新 | 重新生成截图基线(改动的图需过目) | 人工确认变化预期之后 |

```bash
make quick-component                                    # 组件测试,秒级
make quick-check AUTO=1                                 # 自动按 impact map 选 area
make quick-check GREP="@area:agent-settings"            # 手动选 area
make quick-check LAST_FAILED=1                          # 只重跑上一轮失败项
make quick-all                                          # 组件 + 页面
make smoke-full                                         # 全量单引擎(手动)
make calibrate                                          # 双引擎校准(慢,含像素比对)
```

**日常只跑 `make quick-component` + `make quick-check`**;`tests/quick/` 未覆盖的机械项在交付摘要里登记“未覆盖”,不要拿全量去补。全量单引擎归 `make smoke-full`,双引擎与像素归 `make calibrate` —— 这两者都通过 `/protodesign-verify` 手动触发。分层与 area 规则见 `.claude/rules/component-testing.md`。

### 组件工作流

每个原型按同一套目录组织测试:

```text
tests/smoke/       L0 通用兜底(console error / 失败请求 / 四宽度溢出)
tests/quick/       L1 日常功能快检,标题带 @area:<name>
tests/calibrate/   L2 全量几何 / 像素 / 多宽度矩阵(手动)
tests/component/   L1 组件测试(Vitest + Vue Test Utils)
tests/impact-map.json   源文件路径 -> area,供 make quick-check AUTO=1
src/**/*.stories.ts      Storybook 组件预览与视觉用例
.storybook/              Storybook 配置
```

`protos/example-web/` 是模板,新建原型复制它即可带上整套组件工作流;`protos/maixmia-website/` 是首个完整接入的存量原型。

## 根级工作流(聚合预览)

| 目标 | 含义 |
| --- | --- |
| `make deps` | 安装 preview 与全部原型的依赖(新克隆后先跑一次) |
| `make quick-all` | 对所有原型跑日常快检(组件 + 页面) |
| `make verify-all` | 对所有原型跑全量校准(无 Flutter SDK 时跳过 mobile) |
| `make run` | 聚合 + 构建 + 静态服务(前台阻塞) |
| `make build` | 仅聚合 + 统一构建 |
| `make list` | 打印各原型的 slug / name / owner / updated_at |
| `make help` | 显示各目标的说明 |

根 `make build` 在遇到未安装依赖时会**自动安装后继续**,不要求先手工 `make deps`。

服务默认监听 `0.0.0.0:5173`,可用 `HOST` / `PORT` 覆盖。

**端口自适应**:`PORT` 只是**起始**端口。若它在**本机回环地址**上已被占用(例如被 SSH 端口转发占着),
服务会自动往后找下一个可用端口(vite 同样行为),并在启动输出里说明改用了哪个 ——
所以 `➜ Local` 那行打印的地址一定是真正可用的。

> 只检测回环是不够的:服务绑的是通配地址 `0.0.0.0`,当别的进程只占 `127.0.0.1:<port>` 时绑定仍会成功,
> 但对 `localhost:<port>` 的访问会被那个更具体的绑定截走。因此脚本在绑定前会**单独探测回环端口**。

## 如何新增一个原型

1. 复制样板目录:

   ```bash
   cp -r protos/example-web protos/<slug>     # web / 桌面原型
   cp -r protos/example-app protos/<slug>     # mobile 原型
   ```

2. **仅 mobile 原型**:样例目录已是**已初始化完整**的 Flutter 工程,复制后改 `pubspec.yaml` 的
   `name`(Dart 包名)与平台标识即可;若平台目录缺失,用 `flutter create --platforms=web,ios,android .`
   补齐(不会覆盖已有源码)。

3. 改 `protos/<slug>/meta.md`:填 `name` / `slug` / `description` / `owner`,并声明 `targets` 与 `data`(若同产品有多个端,填同一个 `product`)。
4. 按 `targets` 删除不需要的部分(例如不含 `desktop` 就不要 `src/shell/`)。
5. 改 `contracts/main.tsp` 定义本原型的数据模型。
6. 在子目录内 `make run` 验证。

## 目录结构

```text
protodesigns/
├── .claude/
│   ├── rules/                    # 共享基线 + 三份端基线 + 契约规则 + 设计语言
│   ├── skills/protodesign/       # 原型设计 Skill
│   └── agents/                   # 调研 / 实现 / 评审 SubAgent(按载体各一套)
├── scripts/                      # 聚合预览站(aggregate / build / serve)
├── preview/                      # 聚合预览站源码
└── protos/
    ├── Make.def                  # web / 桌面原型的共享 make 目标
    ├── Make.def.flutter          # mobile 原型的共享 make 目标
    ├── example-web/              # web / 桌面原型样板
    └── example-app/              # mobile 原型样板
```

单个原型内部:

```text
protos/<slug>/
├── meta.md                       # 原型声明(targets / data / product)
├── Makefile                      # include ../Make.def(或 ../Make.def.flutter)
├── playwright.config.ts          # web / 桌面原型:校准与冒烟的 project 定义
├── tspconfig.yaml                # 契约生成配置
├── contracts/
│   ├── main.tsp                  # 契约源头(手写)
│   └── generated/                # 生成物,不入库
├── tests/                        # 仅 web / 桌面原型
│   ├── smoke/                    # 通用冒烟规格:与样板目录保持逐字一致,勿改
│   └── calibrate/                # 本原型自写的深度断言 + 截图基线
└── src/ 或 lib/                  # 载体代码
    └── contracts/generated/      # 生成的类型,不入库
```

> mobile 原型没有 `tests/smoke/` 与 `tests/quick/`:它的确定性层是 `test/` 下的 golden 测试。日常用 `make quick-check TEST_NAME=...`(analyze + 指定用例),全量 `make smoke`(= `make calibrate`)跑 `flutter analyze` + `flutter test`。

## 更多约定

- 仓库级约定见 `CLAUDE.md`(根目录)。
- 原型设计规范见 `.claude/rules/`(本仓库自身即规范的单一事实源),其中设计语言见 `design-language.md`。
