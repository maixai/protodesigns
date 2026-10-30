---
name: protodesign
description: 在 protodesigns 仓库下创建或修改可独立运行、带 dummy 数据、可交互演示的前端原型(web / desktop / mobile)。用户用自然语言、参照物截图或链接提需求时使用:做一个 XX 产品的原型、设计一个 XX 页面、参考这张截图做个页面、把这个原型改成 XX 风格、加个 XX 功能,或输入 /protodesign。只负责开发回路:需求理解 → 现状探查 → 交互方向调研 → 确认 → 实现 → 组件测试 + fresh-eyes 快检 → 交付;含交互场景时先派 protodesign-researcher 调研业界最新做法,形成交互方向与核心约束,具体实现交给 developer 决策;实现后派 protodesign-checker 做分钟级快检。全量校准与完整评审不在主流程自动执行,由用户手动触发 /protodesign-verify 与 /protodesign-review。
---

# protodesign

## 定位

把"用户用自然语言 / 参照物提一个原型想法"变成"一个能 `make run` 起来、能点、有真实感数据的原型"。

**本 skill 只负责开发回路。** 重型验证不串在流程里,由用户按需手动触发:

| 入口 | 职责 | 触发 |
| --- | --- | --- |
| `/protodesign-verify` | 全量校准:双引擎 + 全部 spec + 像素基线 | 仅手动 |
| `/protodesign-review` | L3 完整评审:视觉 / 深色 / 排版 / a11y / 反模式 | 仅手动 |

这样每次改动的反馈是**分钟级**;需要完整验收时再单独花时间跑一次,而不是每轮都被拖着跑。

## 触发与入参

- `/protodesign` → 请用户描述想要的原型(做什么 / 参考什么 / 改哪里),结束本次。
- `/protodesign <描述>` → 按描述进入工作流。
- 用户说"做一个 XX 原型""设计 XX 页面""参考这个链接做个页面""把 XX 改成 XX 风格 / 加个 XX 功能" → 等价于 `/protodesign <描述>`。

入参三通道,可叠加:

- **文字**:风格关键词、页面清单、目标用户、要演示的交互、**要覆盖哪些端**。
- **参照物**:本地图路径(Read 读图)、URL(`tavily_extract`)、或"像 XX 那样"。
- **已有规范**:仓库基线,或用户提供的品牌 / 设计规范(优先,整体替换 token 取值)。

## 载体与端基线

| `targets` | 载体 | 端基线 | 实现 SubAgent |
| --- | --- | --- | --- |
| 含 `web` | Vue 3 + Naive UI(TypeScript + Vite) | `baseline-web.md` | `protodesign-developer` |
| 含 `desktop` | **与 web 同一份代码**,额外加壳能力 mock | `baseline-desktop.md` | `protodesign-developer` |
| 含 `mobile` | Flutter(Dart) | `baseline-mobile.md` | `protodesign-developer-flutter` |

`web` 与 `desktop` 必然同属一个原型;`mobile` 是另一个原型,用 `meta.md` 的 `product` 软关联。共享基线永远适用。

## 目标用户与边界

- **目标用户**:不懂前端、以自然语言或参照物提需求的人。交付物是"能跑起来看效果"的原型 + 运行命令,不是代码讲解。
- **In-scope**:新原型创建、现有原型修改、契约定义与生成、dummy 数据 + 强类型 API、设计基线落地、交付。
- **Out-of-scope**:真实后端 / 数据库 / 认证 / 部署;非仓库技术栈;交付用截图展示。

## 工作流

```text
需求理解 → 现状探查(修改时) → 交互方向调研(含交互场景时)
→ 确认门(仅复杂需求) → 派 SubAgent 实现 → fresh-eyes 快检 → 交付
```

### 1. 需求理解

提取:风格(配色 / 密度 / 调性)、内容(页面清单、每页区块)、要演示的交互、**目标端**、参照物结论。产出一份需求理解摘要。

### 2. 现状探查

修改时:必读目标子目录的 `meta.md`、`contracts/main.tsp`、组件与页面结构、路由、token 引用位置。新建时:读模板(`protos/example-web/` / `protos/example-app/`)与同 `product` 的其它端原型,确认可复用的结构、契约与交互模式。产出"现状探查摘要"下发给调研与实现 SubAgent,避免它们重复读现状造成风格漂移。

### 3. 交互方向调研

只要需求会改变"用户能做什么 / 怎么做 / 得到什么反馈 / 状态怎么流转 / 信息层级怎么组织",就视为**交互场景**,新建与迭代原型都要派 `protodesign-researcher`。

**职责边界**:researcher 只给**一个明确方向 + 核心约束**,不写实现规格。组件结构、布局、状态细节、动效、文案与文件组织由 developer 在开发中自行决定;不要要求 researcher 把这些也定下来。

**不派的情况**:纯颜色 / 间距 / 文案 / 图标替换;在既有交互模式内的单点微调(沿用现有按钮、输入框的反馈,只调位置或措辞);修 bug(把行为恢复成既有设计)。判据:**这次改动是否会让用户学到一种新的操作方式或新的状态反馈?** 会 → 调研;只是既有模式内的视觉 / 文案调整 → 不调研。判断不准时按交互场景处理,并在交付摘要里说明。

**拆场景**:按**用户目标**拆,不按组件拆。需求里的交互目标说不清时,先向用户确认要改哪几个场景,不要替用户编场景。每个场景给出:

| 字段 | 内容 |
| --- | --- |
| `id` / `name` | 稳定编号与一句话名称 |
| `current` | 现状怎么做,摩擦在哪 |
| `target` | 这次要达成什么 |
| `files` | 相关页面 / 组件 / 路由 / API / 契约 |

耦合紧密的步骤合成一个场景;一次调研以 **1–6 个场景**为宜,超过时按主题分批,相互独立可并行派发。

**派发参数**:

| 参数 | 内容 |
| --- | --- |
| `user_requirement` | 用户需求原文,不要只给转述 |
| `scenarios` | 上面拆好的场景清单 |
| `slug` / `proto_path` | 目标原型 |
| `targets` | 本原型覆盖的端 |
| `survey_summary` | 现状探查摘要 |
| `baseline_paths` | 共享基线 + 按 targets 的端基线 + `design-language.md` + `contracts.md` |
| `constraints` | `data` 形态、i18n、不新增依赖、dummy 数据、需复用的既有组件等 |
| `existing_patterns` | 原型内已有的相似实现;新建时给模板与同 `product` 原型 |
| `reference_materials` | 用户给的参照图 / URL / "像 XX 那样" |
| `web_reference` | mobile 原型对应的 web 定稿路径 |

**接收与裁定**:researcher 返回逐场景的**交互方向与核心约束简报**。Main 逐项核对:

- 每个场景都有明确方向,不是泛泛的"参考 XX";
- 核心约束完整、可判定,且与用户需求 / 基线 / 数据 / 跨端一致性不冲突;
- **没有越界给实现规格**(组件结构、逐状态矩阵、布局、动效、文案 key、文件清单)。给了就让 researcher 删掉,不要把规格原样转给 developer;
- 跨场景的方向、信息架构与文案一致;
- `confidence` 低或 `unresolved` 涉及方向选择时,补问用户或补一轮调研,不要把不确定的方向直接交给 developer;
- `unresolved` 项要么补问用户,要么作为显式假设记录,不能悄悄忽略。

返回不完整时让 researcher 补一轮,或补问用户;**不要自己替它编方向**。

调研**不新增人工门**:复杂需求把方向与关键约束汇入第 4 步的"设计要点"给用户确认;轻量需求可直接进入实现,但交付摘要要写明采用的交互方向与参考来源。若调研发现需求本身不可行 / 自相矛盾,先向用户说明,不要带进开发。

### 4. 自适应确认(唯一人工门)

- **轻量**(单页 / 单组件 / 一句话能概括)→ 直接做,不打断。
- **复杂**(多页面 / 新信息架构 / 多交互流程 / 风格大改版 / 首次为某产品建某个端)→ 先给一页纯文字"设计要点":目标端与原型划分、`data` 形态、页面清单、风格方向、**每个交互场景最终采用的方向与关键约束**(一句话说清用户会看到 / 怎么操作)、明确不做什么。用户确认后再实现。

给用户看的是**结论**,不是调研明细;不要贴来源列表。需要取舍时把方向的代价讲清楚,让用户选。

### 5. 实现分工

- 页面级 / 风格级 / 结构性改动 → 按载体派 `protodesign-developer` 或 `protodesign-developer-flutter`;
- 单点 tweak(颜色 / 间距 / 文案)→ Main 直接改,不下放。

下发时注入:`设计要点` + `现状探查摘要` + **`research_brief`(researcher 的交互方向与核心约束)** + **本次需要的基线切片** + `scope` + **`areas` / `changed_files`**(供 impact map 选测)。在 `scope` 里写明本期做什么、不做什么;brief 里的建议 / 备选方向不是必做项。切片规则见 [references/quick-check.md](references/quick-check.md)。research 未触发时 `research_brief` 留空;**已判定为交互场景却没有 `research_brief` 时,先补调研或向用户说明,不要把交互设计直接丢给 developer 自由发挥。**

**实现硬约束**(细节以仓库规则为准):

- 新设计 → 新建独立子目录(以 `protos/example-web/` / `protos/example-app/` 为模板);
- 改设计 → 改现有子目录,保持既有结构;
- **方向与核心约束按 `research_brief`;具体交互实现(组件结构、布局、状态细节、动效、文案、文件组织)由 developer 决策**,Main 不逐条规定。developer 认为某条约束与现状冲突时,选最小偏离并在返回中说明,由 Main 裁定;
- 契约在 `contracts/main.tsp` 定义,`make contracts` 生成类型,**禁止手写类型**;
- dummy 数据贴近真实业务,`delay()` 模拟 150–300ms;不引 MSW;
- 异步视图四态齐备(有数据 / loading / empty / error),交互态齐备(hover / focus / active / disabled;移动端无 hover);
- **组件级**:新增或修改的组件按 [component-testing.md](../../rules/component-testing.md) 补 `tests/component/` 与 `*.stories.ts`;纯逻辑 / 事件归 Vitest,几何 / 像素仍归 calibrate。

Main 对实现的验收只核对**核心约束与基线**,不拿自己的交互偏好覆盖 developer 的决策;除非违反约束,否则以 developer 的实现为准。

### 6. 快检与交付

实现 SubAgent 返回后,**页面级 / 结构性改动**派 `protodesign-checker` 做 fresh-eyes 快检;单点 tweak 由 Main 自己跑快检。

**检查命令**(在原型子目录执行):

```bash
make quick-component             # Vitest 组件测试,秒级
make quick-check AUTO=1          # L0 通用冒烟 + 按 impact map 选中的 tests/quick
make quick-check GREP="@area:<area>" SPECS="tests/quick/<area>.spec.ts"
make quick-check LAST_FAILED=1   # 只重跑上一轮失败项
```

- **预算 90 秒**(`QUICK_TIMEOUT`)。超时即选测过宽,应缩小 `GREP` / `SPECS` 或只跑 L0,**不得后台轮询或原样重跑**。
- 默认只跑 L0 + L1。**不要跑 `make smoke-full` / `make calibrate` / `make storybook-test`** —— 全量校准归 `/protodesign-verify`,完整评审归 `/protodesign-review`。
- **报红必须修到绿。** 修完用 `LAST_FAILED=1` 只重跑失败项,不要整套重放。
- `make build` 只在需要验证打包时跑。
- 没被 `tests/quick` 覆盖的机械项,在交付摘要里登记“未覆盖”,不要拿全量去补。

**checker 的职责边界**:只读 + 运行命令,不改代码、不写文件、不跑全量;返回 `pass` / `changes-requested` / `blocked` 与失败清单。失败时把失败标题与证据回给 developer,只修失败项;checker 不替 developer 改代码。

快检绿了立刻交付,模板与话术见 [references/delivery.md](references/delivery.md)。交付必须写清:

1. 运行命令与访问地址;
2. 做了什么(一句话);
3. **本轮交互方向与关键决策**:采用的方向、developer 在实现中的关键取舍(未触发调研则省略);
4. **本轮跑了哪些检查、哪些没跑**(含组件测试 / quick-check 的 area / 未覆盖项)。

用户提意见 → 先判断是否改变了交互场景:改变了就回到第 3 步补调研,再回派实现 SubAgent;单点 tweak Main 自改 → 回到快检。

## 完整验证入口(只提示,不自动执行)

交付话术固定附一句:

> 这版你先看。需要完整验收时:
> - `/protodesign-review` —— 深色 / 排版 / a11y / 反模式 / 桌面壳能力
> - `/protodesign-verify` —— 全量校准(双引擎 + 全部 spec + 像素基线)

由用户决定何时跑。**不要在交付前自动派评审 SubAgent,也不要在快检绿了之后主动跑全量。**

## 辅助文件

- [../rules/protodesign-baseline.md](../../rules/protodesign-baseline.md) —— 跨端共享基线
- [../rules/baseline-web.md](../../rules/baseline-web.md) / [baseline-desktop.md](../../rules/baseline-desktop.md) / [baseline-mobile.md](../../rules/baseline-mobile.md) —— 端基线
- [../rules/contracts.md](../../rules/contracts.md) —— 契约书写约定
- [../rules/component-testing.md](../../rules/component-testing.md) —— 组件测试 / Storybook / 三层快检
- [../rules/design-language.md](../../rules/design-language.md) —— 设计语言 Tungsten 青瓷
- [../../agents/protodesign-researcher.md](../../agents/protodesign-researcher.md) —— 交互方向调研 SubAgent
- [../../agents/protodesign-developer.md](../../agents/protodesign-developer.md) / [protodesign-developer-flutter.md](../../agents/protodesign-developer-flutter.md) —— 实现 SubAgent
- [../../agents/protodesign-checker.md](../../agents/protodesign-checker.md) —— fresh-eyes 快检 SubAgent
- [../../protos/example-web/](../../../protos/example-web/) / [example-app/](../../../protos/example-app/) —— 范例
- [references/quick-check.md](references/quick-check.md) —— 快检分层、选测、预算与失败处理
- [references/delivery.md](references/delivery.md) —— 交付模板
