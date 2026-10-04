# protodesigns 仓库约定

本文件是本仓库(含各原型子目录)供 Claude / Cursor / CodeX 等 AI 工具阅读的约定。本仓库**独立工作**,不假设其被组织在特定目录结构下,不引用任何上级目录。

## 仓库定位

- 本仓库是**多端可交互原型设计仓库**:在设计产品前端时,先在此与 AI 共同制作可交互原型,验证交互与信息架构,并产出规范化的数据契约交给后续开发。
- **非生产代码**(mobile 载体除外,见下):原型仅用于交互验证与契约设计参考,不接真实后端、不处理真实数据。
- 所有数据一律使用 **dummy 数据**;原型可交互、可演示,但**刷新即重置**(无数据持久化)。
- **面向多个可能互不相关的产品**:骨架对原型一视同仁,原型之间零引用,骨架里不得出现任何具体业务名词。

## 多端模型

每个原型用 `meta.md` 声明覆盖哪些端,据此选用载体与端基线:

| `targets` | 载体 | 端基线 |
| --- | --- | --- |
| 含 `web` | TypeScript + Vite + Vue 3 + 组件库 | `baseline-web.md` |
| 含 `desktop` | **与 web 同一份代码**,额外提供壳能力 mock | `baseline-desktop.md` |
| 含 `mobile` | Flutter(Dart) | `baseline-mobile.md` |

- `web` 与 `desktop` 必然同属**一个原型**(同一份代码);`mobile` 是**另一个原型**;
- 同产品的多个端原型用 `meta.md` 的 `product` 字段**软关联**,便于核对契约一致性,但不产生目录耦合;
- **mobile 原型的性质不同**:Flutter 没有"原型 → 迁移"这一步,这份原型就是生产代码的草稿,代码质量按生产要求。

## 目录组织

每个原型是 `protos/` 下的**扁平一层、完全自包含**的独立项目(一个原型 = 一个设计 = 一个目录),内部结构见 `README.md`。

- 各子目录自含 `package.json` 与锁文件(mobile 原型另有 `pubspec.yaml`),互相之间无依赖耦合;
- 根目录**不**维护 workspace 清单;
- 每个原型子目录含 `Makefile`,内容为一行 `include ../Make.def`(web/桌面)或 `include ../Make.def.flutter`(mobile),在子目录内 `make run` 即可启动。

## 技术栈

| 端 | 选型 |
| --- | --- |
| web / desktop | TypeScript(strict) + Vite + Vue 3 + Naive UI,包管理 pnpm |
| mobile | Flutter(Dart) |
| 契约 | TypeSpec + json-schema emitter + json2ts(TS)/ quicktype(Dart) |

- dev server:默认监听 `0.0.0.0`(所有网卡),端口默认 `5173`,由 `Make.def` 的 `HOST` / `PORT` 覆盖。
- **端口自适应**:`PORT` 只是起始端口,若被占用会自动往后找(与 vite 一致),启动输出会说明实际用的是哪个。注意占用方可能只绑了 `127.0.0.1`(如 SSH 端口转发)—— 此时通配绑定仍会成功,但对 `localhost` 的访问会被抢占,所以脚本会单独探测回环端口。

## 规范单一事实源

本仓库的技术与设计规范**全部固化在仓库内** `.claude/rules/` 下,分为:

| 文件 | 覆盖内容 |
| --- | --- |
| `protodesign-baseline.md` | 跨端共享:定位 / token 速查 / TS 规范 / 原型结构 / 数据与 API / 交互状态 / a11y |
| `baseline-web.md` | `targets` 含 `web` 时的响应式与验收项 |
| `baseline-desktop.md` | `targets` 含 `desktop` 时的窗口语义、壳能力与验收项 |
| `baseline-mobile.md` | `targets` 含 `mobile` 时的平台语义与验收项 |
| `contracts.md` | 契约书写约定与跨端一致性规则 |
| `design-language.md` | **设计语言 Tungsten 青瓷**:token 取值、中文排版规则、组件配方与禁用值 |

实现与评审均以此为准,不依赖、不指向任何仓库外文件。

## 契约与 dummy 数据约定

- `contracts/main.tsp` 定义**数据长什么样**,是手写的单一事实源;各端类型由 `make contracts` 生成。
- **禁止手写类型**:载体代码里的类型必须来自生成物。
- `data` 字段声明数据形态(`remote-http` / `local-first` / `hybrid`),决定契约产出的侧重;**必填,不设默认值**。
- 数据来自内置 **dummy 数据**;API 函数通过 `delay()` 模拟 **150-300ms** 网络延迟。
- **不引入 MSW**:本仓库的数据形态以本地优先为主,MSW 拦的是 HTTP 请求而拦不到本地读写,且它在 Electron 宿主上是已知短板。
- 业务失败统一用 **Result 模式**(定义见 `protodesign-baseline.md`)。

## 设计校准

- web / desktop 原型用 **Playwright 双引擎(Chromium + WebKit)** 校准:逐宽度截图 + 断言不破版。两个引擎都要跑,因为桌面壳在 macOS / Linux 用 WebKit 系、在 Windows 用 Chromium 系。
- 命令:`make calibrate`(校验)/ `make calibrate-update`(确认变化是预期的之后更新基线)。
- mobile 原型的平台特有交互(手势、键盘、安全区、权限)**浏览器验不了**,必须真机 / 模拟器确认;评审时未确认项一律登记为「未验证」,不得当作通过。

## 检索纪律

涉及外部库 / 框架 / SDK 的 API、配置项、CLI 命令、版本差异时,**先检索核实现行文档再作答,不凭记忆写外部 API**:

- 库 / 框架 API 文档 → 优先 **Context7**(未收录或调用失败时用 **Tavily** 搜索官方文档并提取正文);
- 两者都不可用时,明确告知本次答复基于训练数据,对 API 细节用"据我所知""可能"等不确定措辞;
- 外部事实以检索结果为准;项目约定与架构决策仍以本文件与 `.claude/rules/` 为准。

## Git 操作约束(单一仓库)

本仓库是**单一 git 仓库**:仓库根持有 `.git/`,`protos/` 下的各原型子目录**不自建** `.git/`,全部由根仓库直接跟踪。

- 在本仓库内(仓库根或其任一子目录)执行 git 命令,作用对象都是同一个仓库;
- 提交范围由根仓库统一决定:根 `.gitignore` 与各原型子目录的 `.gitignore` 共同排除构建产物、依赖目录与契约生成物;
- 不得在本仓库之外执行 git 操作。

## 代码注释与文档

- 强制使用中文对话,专业术语可用英文确保表意准确;回答问题简明扼要。
- 代码注释用**中文**,日志输出用**英文**。
- 注释只描述代码本身的功能 / 意图 / 权衡,不引用外部文档的 task 或需求编号。
- Markdown 文档用 ATX 风格标题(`# ## ###`),代码块标注具体编程语言,表格对齐。
