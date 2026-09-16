# protodesigns

**可交互前端原型设计仓库**。在设计各产品服务前端时,先在此与 AI 共同制作可交互原型,验证交互与信息架构。

- **非生产代码**:原型仅用于交互验证与 API 设计参考,所有数据均为 dummy,刷新即重置。
- **技术栈**:TypeScript + pnpm + Vite + Vue 3 + Naive UI。
- **组织方式**:每个产品服务一个 `protos/` 下的独立子目录,各子目录内 `make run` 即可启动并在浏览器访问。
- **规范化 API**:每个原型在 `src/api/` 定义强类型 API 函数,供后续真实开发参考接口需求。

## 前置依赖

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| pnpm | 最新稳定版 | 包管理;建议 `corepack enable` 启用 |
| Node.js | `^20.19.0 || >=22.12.0` | Vite 引擎要求 |
| GNU make | 任意较新版本 | 用于 `make run` 启动 |

## 启动方式(make run)

在任一产品原型子目录(如 `protos/example/`)执行:

```bash
cd protos/example
make run
```

等价于 `pnpm dev --host 0.0.0.0 --port 5173`。dev server 监听 `0.0.0.0`(所有网卡),允许远程访问。启动后浏览器访问:

- 本机访问:`http://localhost:5173`
- 远程访问:`http://<服务器 IP>:5173`(同网段其它机器;需确保服务器防火墙放行该端口)
- 并行开发多个原型时,用 `PORT` 覆盖端口;仅本机访问可用 `HOST=localhost` 收紧监听范围:

```bash
make run PORT=5174
```

## 根级工作流(聚合预览)

在仓库根执行以下目标,即可聚合全部原型并统一预览:

| 目标 | 含义 |
| --- | --- |
| `make run` | 一键启动:扫描各原型 `meta.md` → 构建聚合预览站与各原型 → 启动静态服务(前台阻塞) |
| `make build` | 仅聚合 + 统一构建产物,不启动服务 |
| `make serve` | 先 `build`,再启动静态服务(前台阻塞) |
| `make list` | 打印 registry 摘要(`slug` / `name` / `owner` / `updated_at`) |
| `make help` | 显示各目标的说明 |

服务默认监听 `0.0.0.0:5173`,可用 `HOST` / `PORT` 覆盖(与原型子目录内一致):

```bash
make serve HOST=127.0.0.1 PORT=5199
```

聚合预览站的源码在 `preview/`,构建产物落在 `preview/dist/`:首页列出全部原型,各原型挂载在 `/p/<slug>/` 下;聚合、构建、静态服务三个步骤分别由 `scripts/aggregate.mjs`、`scripts/build.mjs`、`scripts/serve.mjs` 完成。

## 如何新增一个产品原型

以新增 `my-proto` 为例:

1. 用 create-vite 脚手架创建 Vue + TS 项目:

```bash
pnpm create vite my-proto --template vue-ts
cd my-proto
pnpm install
```

2. 创建 `Makefile`,内容为一行(共享根目录的 make 目标):

```makefile
include ../Make.def
```

3. 按仓库约定建立 API 与 dummy 数据目录:

```text
src/
├── api/     # 强类型 API 函数(具名导出,返回 Promise<Result<T>>)
├── mocks/   # 内置 dummy 数据 + delay() 模拟 150-300ms 延迟
└── ...      # 其余由脚手架生成
```

4. 在 `my-proto/` 下执行 `make run`,浏览器访问 `http://localhost:5173` 验证。

> 每个原型都是独立项目(独立 `package.json` / `pnpm-lock.yaml`),增删原型不影响其它目录;根目录不维护 pnpm workspace。

## 目录结构

```text
protodesigns/
├── CLAUDE.md            # 仓库约定(定位/技术栈/目录/dummy+API/git)
├── README.md            # 本文件
├── Makefile             # 根级工作流入口(run/build/serve/list/help)
├── .gitignore           # 忽略 preview 构建产物
├── preview/             # 聚合预览站(汇总各原型入口的统一列表页)
├── scripts/             # 聚合 / 构建 / 静态服务(node 脚本)
└── protos/              # 各产品原型(共享 make 目标 + 独立子目录)
    ├── Make.def         # 共享 make 目标(run/build),子目录 include
    └── example/         # 现有产品原型(最小骨架,验证可行性)
        ├── Makefile     # include ../Make.def
        ├── package.json # 独立依赖
        ├── vite.config.ts
        ├── index.html
        └── src/
            ├── main.ts  # 入口
            ├── App.vue
            ├── api/     # 强类型 API 函数
            └── mocks/   # dummy 数据 + 模拟延迟
```

## 更多约定

代码规范与设计规范见根目录 `CLAUDE.md` 与 `.claude/rules/protodesign-baseline.md`(本仓库自身即规范的单一事实源)。
