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

## 根级工作流(聚合预览)

| 目标 | 含义 |
| --- | --- |
| `make deps` | 安装 preview 与全部原型的依赖(新克隆后先跑一次) |
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
│   └── agents/                   # 实现 / 评审 SubAgent(按载体各一套)
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
├── tspconfig.yaml                # 契约生成配置
├── contracts/
│   ├── main.tsp                  # 契约源头(手写)
│   └── generated/                # 生成物,不入库
└── src/ 或 lib/                  # 载体代码
    └── contracts/generated/      # 生成的类型,不入库
```

## 更多约定

- 仓库级约定见 `CLAUDE.md`(根目录)。
- 原型设计规范见 `.claude/rules/`(本仓库自身即规范的单一事实源),其中设计语言见 `design-language.md`。
