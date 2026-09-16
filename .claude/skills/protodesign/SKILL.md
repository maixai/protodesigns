---
name: protodesign
description: 在 protodesigns 仓库下,根据用户自然语言需求(文字描述、参照物截图或链接、已有设计规范)创建或修改可独立运行、带 dummy 数据、可交互演示的前端原型。目标用户是不懂前端、以自然语言或参照物提需求的人。典型触发:用户说"做一个 XX 产品的原型""设计一个 XX 页面""参考这张截图或链接做个 XX 页面""把这个原型改成 XX 风格或加个 XX 功能",或输入 /protodesign。机制:三通道需求理解、现状探查、自适应确认(轻量自动、复杂先出纯文字设计要点)、严格按仓库技术栈(Vue3 + Naive UI + TS strict + Vite + pnpm)实现、派设计评审 SubAgent 用 chrome-devtools 多断点截图核对可运行性与设计基线、只交付运行命令与访问地址及做了什么(不交付截图)。
---

# protodesign

## 核心定位

在 protodesigns 仓库下,按用户自然语言需求**创建或修改**可独立运行、带 dummy 数据、可交互演示的前端原型。一句话:把"用户用自然语言 / 参照物提一个原型想法"变成"一个能 `make run` 起来、能点、能看、有真实感数据的 Vue 原型"。

- **实现分工**:页面级 / 风格级 / 结构性改动派 `protodesign-developer` SubAgent 实现;单点 tweak(改颜色 / 间距 / 文案等)由 Main 直接改、不下放;视觉验收下放给 `protodesign-reviewer` SubAgent(用 chrome-devtools 真渲染 + 多断点截图 + 设计基线核对)。
- **质量底线**:所有原型统一锚定本仓库自身的 `protodesign-baseline` rule(设计 token / TS 规范 / 三态 / 响应式 / a11y / 验收清单的单一事实源)。

## 触发与入参

- `/protodesign` → 空白引导:请用户描述想要的原型(做什么 / 参考什么 / 改哪里),结束本次。
- `/protodesign <描述>` → 按描述进入工作流。
- 会话上下文中用户说"做一个 XX 产品的原型""设计一个 XX 页面""参考这张截图 / 这个链接做个 XX 页面""把 XX 原型改成 XX 风格 / 加个 XX 功能"等 → 等价于 `/protodesign <描述>`。

入参形态(三通道,可叠加):

- 文字描述:风格关键词、页面内容清单、目标用户、要演示的交互。
- 参照物:本地截图文件路径(Read 读图)、URL(`tavily_extract` 提取)、或"像 XX 那样"(无图时按描述抽象提取设计语言)。
- 已有规范:本仓库 `protodesign-baseline` 的设计基线,或用户提供的品牌 / 设计规范。

## 目标用户与边界

- **目标用户**:不懂前端、以自然语言或参照物提需求的人;交付物是"能跑起来看效果"的原型 + 运行命令,不是代码讲解。
- **In-scope**:① 新原型创建(新建独立子目录、骨架、api/mocks、页面、交互);② 现有原型修改(读现状、保风格、改页面 / 交互 / 数据);③ dummy 数据 + 强类型 API 规范化;④ 设计基线落地(避免 AI slop、三态完备、响应式、a11y 底线、design token 复用);⑤ 交付:运行命令 + 访问地址 + 简明"做了什么"摘要;⑥ 配套资源(SubAgent / rule)。
- **Out-of-scope**:真实后端 / 数据库 / 认证 / 生产部署;非仓库技术栈方案(如纯单 HTML 文件);交付用截图展示;超出原型设计域的任何改动(不顺手改仓库其它部分)。

## 工作流总览

七步:需求理解(三通道)→ 现状探查 → 自适应确认 → 实现分工 → 数据与 API → 质量评审 → 交付。**只有"自适应确认"一步有内置人工门(且简单需求自动跳过)**,其余步骤无人值守自动执行。

```text
需求理解(三通道)→ 现状探查(修改时)→ 自适应确认(轻量自动 / 复杂先出设计要点)
→ 实现分工(developer 或 Main)→ 数据与 API → 质量评审(reviewer)→ 交付(只给命令)
```

## Step 1:需求理解(三通道)

从用户输入中提取设计意图,三通道可叠加:

1. **文字描述**:提取风格(配色倾向 / 密度 / 调性)、内容(页面清单、每页区块)、要演示的交互。
2. **参照物**:
   - 本地图路径 → Read 读图,提取配色 / 布局 / 风格;
   - URL → `tavily_extract` 提取内容,抽象其设计语言;
   - "像 XX 那样" → 无图时按描述抽象提取(不臆造具体品牌像素级细节,除非用户给了图)。
3. **已有规范**:仓库自身 `protodesign-baseline` 的设计基线(默认起点),或用户提供的品牌 / 设计规范(优先于默认基线)。

产出:一份"需求理解摘要"(页面清单 + 风格关键词 + 关键交互点 + 参照物提取结论),供后续设计与实现锚定。

## Step 2:现状探查(仅修改时)

修改现有原型时,动手前**必读**目标子目录现状:

- `src/api/` 与 `src/mocks/` 结构(API 签名、dummy 数据形状、Result 模式用法);
- 组件与页面结构、路由、`src/theme.ts` 或 tokens 引用位置;
- 现有 design token 取值与组件库(保风格一致,不另起一套)。

新建原型时跳过此步。产出"现状探查摘要"(目标子目录路径 + api/mocks/组件/tokens 现状),下发给 developer 用,避免其重读现状造成重复劳动与风格漂移。

## Step 3:自适应确认(唯一内置人工门)

按复杂度二选一:

- **轻量**(单页 / 单组件、局部改动、一句话能概括)→ 直接做,不打断用户。
- **复杂**(多页面 / 新信息架构 / 多交互流程 / 风格大改版)→ 先出一页**纯文字"设计要点"**给用户扫一眼确认后再实现,包含:
  - 页面清单 + 每页区块;
  - 风格方向(配色 / 密度 / 调性,呼应需求理解摘要);
  - 交互点(哪些可点 / 可 hover / 三态);
  - 响应式要点(375 / 768 / 1280 各怎么呈现)。

用户确认或提出修改意见后再进入实现;简单需求跳过此门。

## Step 4:实现分工

- **页面级 / 风格级 / 结构性改动 → 派 `protodesign-developer`**(见 [../../agents/protodesign-developer.md](../../agents/protodesign-developer.md))。Main 下发时注入:设计要点 / 需求理解摘要 + 现状探查摘要(目标子目录路径、api/mocks/组件/tokens 现状)+ 明确本次改动范围。
- **单点 tweak**(改颜色 / 间距 / 文案等)→ Main 直接改,不下放(编排与上下文注入成本高于收益)。
- **实现硬约束**(developer 与 Main 都须遵守,细节见 [../../rules/protodesign-baseline.md](../../rules/protodesign-baseline.md)):
  - 新设计 → 新建独立子目录(`create-vite vue-ts` 骨架 + `Makefile` 内容 `include ../Make.def` + `make run` 可启动);
  - 改设计 → 直接改现有子目录(保持 `src/api/` 与 `src/mocks/` 结构);
  - TS strict、禁 `any`、具名导出、kebab-case 文件名、Result 模式;
  - 组件走 Naive UI + design token,禁 hardcode 颜色 / 字号 / 圆角 / 间距;
  - 严格遵循 `protodesign-baseline` rule(自含技术栈与规范,见上)。

## Step 5:数据与 API

- dummy 数据用**贴近真实业务的文案 / 数字 / 字段结构**(非 lorem ipsum),让原型有真实感。
- `src/api/<domain>.ts` 定义强类型 API 函数(具名导出),返回 `Promise<Result<T>>`;`src/mocks/` 内置 dummy 数据 + `delay()` 模拟 150-300ms 网络延迟。
- 刷新即重置、不接真实后端。
- 三态(有数据 / loading / empty / error)与交互态(hover / focus / disabled)完备,见 baseline 第 6 节。
- 范例参考仓库现有 [../../../protos/example/](../../../protos/example/)(api / mocks / Result 模式写法)。

## Step 6:质量评审

1. 启动 dev server(`make run`)确认可运行。
2. 派 `protodesign-reviewer`(见 [../../agents/protodesign-reviewer.md](../../agents/protodesign-reviewer.md)),用 chrome-devtools 真渲染 + 多断点(375/768/1280)截图 + console/network + 设计基线核对,产出 C/M/Minor findings 与 pass / changes-requested 结论。
3. Main 裁定回修:页面级 / 结构性改动回派 developer,单点 tweak 自改;循环至 0 Critical + 0 Major。
4. 交付物不给截图(内部截图仅用于评审判定,不进交付)。

## Step 7:交付

只给命令 + 访问地址 + 简明摘要:

```text
cd <子目录> && make run
访问 http://localhost:5173(并行开发用 make run PORT=<端口> 覆盖)
做了什么:<一句话说明新建 / 修改了哪些页面与交互>
```

不交付截图、不铺陈代码讲解。

## 引用的辅助文件

- [../../rules/protodesign-baseline.md](../../rules/protodesign-baseline.md) —— 设计 token / TS 规范 / 三态 / 响应式 / a11y / 验收清单的单一事实源(自包含,不引用仓库外文件)。
- [../../agents/protodesign-developer.md](../../agents/protodesign-developer.md) —— 页面级 / 风格级 / 结构性改动的实现 SubAgent。
- [../../agents/protodesign-reviewer.md](../../agents/protodesign-reviewer.md) —— 视觉验收 SubAgent(chrome-devtools 真渲染 + 多断点截图 + 基线核对)。
- [../../../protos/example/](../../../protos/example/) —— 现有原型范例(api / mocks / Result 模式写法参考)。
