---
name: protodesign
description: 在 protodesigns 仓库下,根据用户自然语言需求(文字描述、参照物截图或链接、已有设计规范)创建或修改可独立运行、带 dummy 数据、可交互演示的前端原型。目标用户是不懂前端、以自然语言或参照物提需求的人。支持多端:原型的 meta.md 声明 targets(web / desktop / mobile)后,自动选用对应载体与端基线。典型触发:用户说"做一个 XX 产品的原型""设计一个 XX 页面""参考这张截图或链接做个 XX 页面""把这个原型改成 XX 风格或加个 XX 功能",或输入 /protodesign。机制:三通道需求理解、现状探查、自适应确认(含目标端判定)、按载体分派实现、契约产出、严格按仓库规范实现、每次实现后跑确定性冒烟检查(make smoke,不阻塞)、立即交付运行命令与访问地址交用户视觉裁决、按风险节点派评审 SubAgent 做完整评审。评审分三层(L1 脚本冒烟 / L2 用户裁决 / L3 完整评审),只有 L3 会阻塞。
---

# protodesign

## 核心定位

在 protodesigns 仓库下,按用户自然语言需求**创建或修改**可独立运行、带 dummy 数据、可交互演示的前端原型。一句话:把"用户用自然语言 / 参照物提一个原型想法"变成"一个能 `make run` 起来、能点、能看、有真实感数据的原型"。

- **多端支持**:原型的 `meta.md` 用 `targets` 声明覆盖哪些端,决定用哪套载体、叠加哪些端基线。
- **实现分工**:页面级 / 风格级 / 结构性改动派 SubAgent 实现(按载体分派);单点 tweak(改颜色 / 间距 / 文案等)由 Main 直接改、不下放。
- **验收分层**:确定性检查交给脚本(`make smoke`,零 LLM,每次必跑且不阻塞);视觉裁决交给用户(实现完立刻给地址);需要判断的深度评审才派评审 SubAgent,且只在风险节点触发。**不要让 LLM 评审站在用户看到成果之前。**
- **契约产出**:数据模型由 `contracts/main.tsp` 定义,类型由 `make contracts` 生成,不手写。

## 触发与入参

- `/protodesign` → 空白引导:请用户描述想要的原型(做什么 / 参考什么 / 改哪里),结束本次。
- `/protodesign <描述>` → 按描述进入工作流。
- 会话上下文中用户说"做一个 XX 产品的原型""设计一个 XX 页面""参考这张截图 / 这个链接做个 XX 页面""把 XX 原型改成 XX 风格 / 加个 XX 功能"等 → 等价于 `/protodesign <描述>`。

入参形态(三通道,可叠加):

- 文字描述:风格关键词、页面内容清单、目标用户、要演示的交互、**要覆盖哪些端**。
- 参照物:本地截图文件路径(Read 读图)、URL(`tavily_extract` 提取)、或"像 XX 那样"。
- 已有规范:本仓库基线,或用户提供的品牌 / 设计规范。

## 载体与端基线对照

| `targets` | 载体 | 加载的端基线 | 实现 SubAgent |
| --- | --- | --- | --- |
| 含 `web` | Vue 3 + 组件库(TypeScript + Vite) | `baseline-web.md` | `protodesign-developer` |
| 含 `desktop` | **与 web 同一份代码**,额外加壳能力 mock | `baseline-desktop.md` | `protodesign-developer` |
| 含 `mobile` | Flutter(Dart) | `baseline-mobile.md` | `protodesign-developer-flutter` |

- `web` 与 `desktop` **必然同属一个原型**(同一份代码);
- `mobile` 是**另一个原型**(另一份代码),用 `product` 字段与前者软关联;
- 三种端都可能有,共享基线永远适用。

## 目标用户与边界

- **目标用户**:不懂前端、以自然语言或参照物提需求的人;交付物是"能跑起来看效果"的原型 + 运行命令,不是代码讲解。
- **In-scope**:① 新原型创建;② 现有原型修改;③ 契约定义与生成;④ dummy 数据 + 强类型 API;⑤ 设计基线落地(避免 AI slop、四态完备、端基线、a11y);⑥ 交付:运行命令 + 访问地址 + 简明摘要。
- **Out-of-scope**:真实后端 / 数据库 / 认证 / 生产部署;非仓库技术栈方案;交付用截图展示;超出原型设计域的任何改动。

## 工作流总览

八步:需求理解 → 现状探查 → 自适应确认 → 实现分工 → 契约产出 → 数据与 API → 冒烟检查 → 交付与完整评审。

**关键设计:冒烟检查是脚本(零 LLM、秒级、不阻塞);交付排在完整评审之前 —— 用户先看到成果,再决定要不要跑深度评审。**

```text
需求理解 → 现状探查(修改时) → 自适应确认(判定 targets + 设计要点)
→ 实现分工(按载体派 SubAgent)→ 契约产出 → 数据与 API
→ 冒烟检查(L1,脚本,不阻塞)──┬→ 交付(L2,给地址,用户视觉裁决)
                              │      ↑ 用户提意见 → 回到「实现分工」
                              └→ 完整评审(L3,按节点触发)→ 收敛 → 复述交付
```

### 三层验收的分工

| 层 | 由谁做 | 覆盖什么 | 何时 | 阻塞交付? |
| --- | --- | --- | --- | --- |
| **L1 冒烟检查** | 脚本 `make smoke` | **通用规格保证**:可运行、未捕获异常与 console error、请求失败、四宽度横向溢出、契约与构建。**另加**各原型在 `tests/calibrate/` 自写的断言(对比度 / 触达尺寸 / 四态 / 交互)—— 写了才归 L1,没写就归 L3 | 每次实现完成后 | 否 |
| **L2 视觉裁决** | **用户本人** | "这是不是我要的东西" —— 整体观感、信息层次、交互手感 | 每次实现完成后 | 不适用(它本身就是交付) |
| **L3 完整评审** | 评审 SubAgent | 脚本验不了的:深色模式、桌面壳能力、中文排版、a11y 语义、反模式清单、风格项 | 风险节点 + 用户点名 | 是(仅此一层) |

**为什么这样分**:机械可判定的项交给 LLM 是最贵的模态做最便宜的判定 —— 慢,且不如断言可靠;而"是不是我想要的"只有用户能判,且他本来就要看。真正需要判断力、用户又看不出门道的项(深色可读性、a11y 语义、反模式)才值得动用 LLM 评审。

### L3 的触发节点

满足任一即**自动**触发完整评审:

- 新建原型目录;
- **首次为某产品建某个端**(信息架构与契约的不可逆面最大);
- 结构性改动(路由 / 信息架构 / 组件骨架 / 主题体系);
- 契约变更(`contracts/main.tsp` 的实体或字段增删改)。

其余情况**不自动触发**,在交付话术里固定提醒一句(见 Step 8),由用户决定何时跑。

## Step 1:需求理解(三通道)

从用户输入中提取设计意图,三通道可叠加:

1. **文字描述**:提取风格(配色倾向 / 密度 / 调性)、内容(页面清单、每页区块)、要演示的交互、**目标端**。
2. **参照物**:
   - 本地图路径 → Read 读图,提取配色 / 布局 / 风格;
   - URL → `tavily_extract` 提取内容,抽象其设计语言;
   - "像 XX 那样" → 无图时按描述抽象提取(不臆造具体品牌像素级细节,除非用户给了图)。
3. **已有规范**:仓库基线(默认起点),或用户提供的品牌 / 设计规范(优先)。

产出:一份"需求理解摘要"(页面清单 + 风格关键词 + 关键交互点 + 目标端 + 参照物提取结论)。

## Step 2:现状探查(仅修改时)

修改现有原型时,动手前**必读**目标子目录现状:

- `meta.md`(确认 `targets` / `data` / `product`);
- `contracts/main.tsp` 与生成物结构;
- 组件与页面结构、路由、主题 / token 引用位置;
- 现有 token 取值与组件库(保风格一致,不另起一套)。

新建原型时跳过此步。产出"现状探查摘要",下发给实现 SubAgent,避免其重读现状造成重复劳动与风格漂移。

## Step 3:自适应确认(唯一内置人工门)

按复杂度二选一:

- **轻量**(单页 / 单组件、局部改动、一句话能概括)→ 直接做,不打断用户。
- **复杂**(多页面 / 新信息架构 / 多交互流程 / 风格大改版 / **首次为某产品建某个端**)→ 先出一页**纯文字"设计要点"**给用户扫一眼确认后再实现,包含:
  - **目标端与原型划分**(哪些端合成一个原型、哪些独立成另一个原型、`product` 取值);
  - **`data` 形态**(远程接口 / 本地优先 / 混合);
  - 页面清单 + 每页区块;
  - 风格方向;
  - 交互点(哪些可点 / 可 hover / 四态);
  - 各端尺寸要点(按端基线)。

用户确认或提出修改意见后再进入实现;简单需求跳过此门。

## Step 4:实现分工

- **页面级 / 风格级 / 结构性改动 → 派实现 SubAgent**,按载体选择:
  - `targets` 含 `web` / `desktop` → `protodesign-developer`(见 [../../agents/protodesign-developer.md](../../agents/protodesign-developer.md));
  - `targets` 含 `mobile` → `protodesign-developer-flutter`(见 [../../agents/protodesign-developer-flutter.md](../../agents/protodesign-developer-flutter.md))。
- **单点 tweak** → Main 直接改,不下放。
- 下发时注入:设计要点 / 需求理解摘要 + 现状探查摘要 + **本次要加载的基线路径**(共享基线 + 按 `targets` 叠加的端基线 + **设计语言 `design-language.md`**) + 明确改动范围。

**实现硬约束**:

- 新设计 → 新建独立子目录(扁平一层,自含 `meta.md` / `Makefile` / `tspconfig.yaml` / `contracts/`);
- 改设计 → 直接改现有子目录,保持既有结构;
- 新建目录时,以 `protos/example-web/`(web/桌面)与 `protos/example-app/`(mobile)为模板;
- 严格遵循基线:共享基线 + 按 `targets` 叠加的端基线。

## Step 5:契约产出

- 在 `contracts/main.tsp` 定义数据模型;**入口类型**加 `@summary("<类型名>")` + `@jsonSchema`,被引用类型不加(自动内联)。
- 执行 `make contracts` 生成各端类型(生成物不入库,`make run` / `make build` 会自动跑)。
- **禁止手写类型**:载体代码里的类型必须来自生成物。
- 详细书写约定与跨端一致性规则见 [../rules/contracts.md](../rules/contracts.md)。

## Step 6:数据与 API

- dummy 数据用**贴近真实业务的文案 / 数字 / 字段结构**(非 lorem ipsum)。
- `src/api/`(或 Flutter 侧对应目录)定义强类型 API 函数(具名导出),返回 `Promise<Result<T>>`;dummy 数据 + `delay()` 模拟 150-300ms 延迟。
- **不引入 MSW**(理由见共享基线第 ⑤ 节);刷新即重置、不接真实后端。
- 四态(有数据 / loading / empty / error)与交互态(hover / focus / active / disabled)完备;**移动端 hover 不适用**,见 `baseline-mobile.md`。

## Step 7:冒烟检查(L1,每次必跑,不阻塞)

在原型子目录执行:

```bash
make smoke
```

- **web / 桌面**:chromium 单引擎,含仓库级通用冒烟(`tests/smoke/`:未捕获异常、console error、请求失败、多宽度横向溢出)与本原型自写的校准断言(`tests/calibrate/`,含对比度、触达尺寸、四态与交互);像素比对被 `SMOKE=1` 跳过 —— 基线按创建时的 OS 生成,跨 OS 必然假失败,且冒烟本就不看像素。
- **mobile**:等价于 `make calibrate`(`flutter analyze` + `flutter test` 组件级 golden)。

**报红才算门禁,报红必须修到绿。** 冒烟未报红时**不要**因为"想再确认一下"而派评审 SubAgent —— 那一层属于 L3,按节点触发,不在这里。

契约生成、构建、类型检查不单列:它们是 `make smoke` 与实现者自检(`make build`)的共同前置。

## Step 8:交付(L2,给地址交用户裁决)

冒烟绿了**立刻**交付,不等任何 LLM 评审:

```text
cd <子目录> && make run
(web/桌面)访问 http://localhost:5173,并行开发用 make run PORT=<端口> 覆盖
(mobile)默认起 Chrome 预览;真机 / 模拟器用 make run DEVICE=<设备 id>
做了什么:<一句话说明新建 / 修改了哪些页面与交互、契约有哪些实体>
```

**未自动触发 L3 时,交付必须附这一句固定提醒:**

> 这版你先看看。觉得整体 OK 了就说一声,我跑一次完整评审(深色 / 桌面壳 / 排版 / a11y / 反模式)。

用户看完提意见 → 页面级 / 结构性改动回派实现 SubAgent,单点 tweak Main 自改 → 回到 Step 7。
用户说"可以了" → 进入 Step 9。

不交付截图、不铺陈代码讲解。

## Step 9:完整评审(L3,按节点触发 + 用户点名)

触发条件见「L3 的触发节点」。触发后派评审 SubAgent,按 `targets` 选择:

- 含 `web` / `desktop` → `protodesign-reviewer`(chrome-devtools 真渲染 + 多宽度 + 桌面壳能力核对);
- 含 `mobile` → `protodesign-reviewer-mobile`(平台特有交互核对)。

除 `target_url` / `targets` / `scope` / `spec_summary` / `baseline_paths` 外,新增三个参数:

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `mode` | `scoped` / `full` | `scoped` 局部复审:只判 Critical;`full` 终审:判到 Major(含风格项)。新建原型 / 首次建端 / 用户说"可以了" → `full`;其余节点 → `scoped` |
| `diff_scope` | 本次改动涉及的页面 / 组件 / 文件清单 | 评审按此收窄,不做全量重扫 |
| `regression_baseline` | 上一轮已通过的检查项清单 | 仅 `full` 模式且非首轮时注入,用于末轮回归对照 |

**收敛与防改坏:**

1. Main 裁定回修 —— 每条 finding 先判真伪(证据是否成立、是否落在本次改动范围内),不成立的驳回并记录理由;
2. 回修后重跑 `make smoke`(Step 7),再重派同模式 reviewer;
3. **循环至 0 Critical**(`full` 模式为 0 Critical + 0 Major);
4. 收敛时做**回归对照**:`regression_baseline` 中"改造前已通过"的项必须仍通过 —— 防止"改对了 A 却改坏了 B"。对照失败按新一轮 Critical 处理。

评审通过后回到 Step 8 复述一次交付(命令 + 地址 + 做了什么 + 本轮评审覆盖了哪些面)。

## 引用的辅助文件

- [../rules/protodesign-baseline.md](../rules/protodesign-baseline.md) —— 跨端共享基线。
- [../rules/baseline-web.md](../rules/baseline-web.md) / [baseline-desktop.md](../rules/baseline-desktop.md) / [baseline-mobile.md](../rules/baseline-mobile.md) —— 端基线。
- [../rules/contracts.md](../rules/contracts.md) —— 契约书写与跨端一致性规则。
- [../rules/design-language.md](../rules/design-language.md) —— **设计语言 Tungsten 青瓷**:token 取值、中文排版规则、组件配方与禁用值。
- [../../agents/protodesign-developer.md](../../agents/protodesign-developer.md) —— Vue 载体实现。
- [../../agents/protodesign-developer-flutter.md](../../agents/protodesign-developer-flutter.md) —— Flutter 载体实现。
- [../../agents/protodesign-reviewer.md](../../agents/protodesign-reviewer.md) —— web / 桌面验收。
- [../../agents/protodesign-reviewer-mobile.md](../../agents/protodesign-reviewer-mobile.md) —— mobile 验收。
- [../../protos/example-web/](../../protos/example-web/) —— web / 桌面原型范例。
- [../../protos/example-app/](../../protos/example-app/) —— mobile 原型范例。
- [../../protos/example-web/tests/smoke/smoke.spec.ts](../../protos/example-web/tests/smoke/smoke.spec.ts) —— **仓库级通用冒烟规格**(L1)。各原型持有一份相同副本,新建原型复制样板目录即自动具备。
- [../../protos/Make.def](../../protos/Make.def) / [Make.def.flutter](../../protos/Make.def.flutter) —— `make smoke`(L1)与 `make calibrate` 的定义。
