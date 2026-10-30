# 快检:分层、选测、预算与失败处理

本文件是 `/protodesign` 日常回路的操作细则。目标:**分钟级**抓住本次改动引入的机械问题,而不是复跑整个测试套件。

## 一、三层结构

| 层 | 位置 | 内容 | 何时跑 | 预算 |
| --- | --- | --- | --- | --- |
| L0 通用冒烟 | `tests/smoke/` | console error / 失败请求 / 四宽度横向溢出 | 每次改动 | 秒级 |
| L1 功能快检 | `tests/quick/` | 本次改动相关的高价值交互与断言 | 每次改动 | ≤ 90 秒 |
| L1 组件测试 | `tests/component/` + `*.stories.ts` | 纯逻辑 / props / emits / 键盘 / 视觉状态 | 每次改动 | 秒级 |
| L2 全量校准 | `tests/calibrate/` | 全部几何、像素基线、穷举矩阵 | 仅 `/protodesign-verify` | 分钟级 |
| L3 完整评审 | 浏览器真渲染 | 深色 / 排版 / a11y / 反模式 | 仅 `/protodesign-review` | 分钟级 |

日常只跑 L0 + L1。**L2 / L3 不进入开发回路。**

## 二、日常命令

```bash
cd protos/<slug>

make quick-component                  # 组件级测试(Vitest),秒级
make quick-check                      # L0 + tests/quick 全部
make quick-check AUTO=1               # 按 tests/impact-map.json + git diff 自动选 area
make quick-check GREP="@area:agent-settings"
make quick-check SPECS="tests/quick/agent-settings.spec.ts" GREP="保存"
make quick-check LAST_FAILED=1        # 只重跑上一轮失败项
make quick-all                        # quick-component + quick-check
```

端口冲突或并行开发时追加 `PORT=<端口>`(如 `make quick-check PORT=5187`);`Make.def` 会把 `PORT` / `BASE_URL` 透传给 Playwright。

硬预算由 `QUICK_TIMEOUT` 控制(默认 90 秒)。超时直接失败,应缩小 `GREP` / `SPECS` 后重试,**不得原命令反复重跑或后台轮询**。

## 三、怎么选

### 1. 优先按 area 选

`tests/quick/` 的测试标题带 `@area:<name>` 标签。常用 area:

- `agent-settings` —— Agent 设置、身份与信任、连接状态
- `identity` —— 身份门、配对、Passkey
- `project-menu` —— 项目行菜单、项目选择
- `workspace` —— 工作台外壳、会话头、侧栏、布局

`make quick-check AUTO=1` 会读 `tests/impact-map.json`,把 `git diff` 的文件映射到 area;命中多个就一起跑。

### 2. 再按测试名收窄

需要更精确时,用 `GREP` 匹配测试标题:

```bash
make quick-check SPECS="tests/quick/agent-settings.spec.ts" GREP="保存脏状态"
```

### 3. 什么时候才用 SPECS 指到 calibrate

只有在 `tests/quick/` 没有覆盖、且必须跑某条既有 calibrate 断言时:

```bash
make quick-check SPECS="tests/calibrate/identity-pairing.spec.ts" GREP="Agent 连接状态"
```

**必须同时给 `GREP`。** 不准把整个 `workspace.spec.ts` 作为 `SPECS` 跑——它有 250+ 条静态用例,一轮 12 分钟以上,不属于快检。

### 4. 没有把握时

不要猜。先跑 `make quick-check`(L0 + 全部 quick),在交付摘要里写明“L2 未跑”;需要完整覆盖时提示用户跑 `/protodesign-verify`。

## 四、什么时候快检不够用

以下改动会影响全局,按改动挑测试天然不可靠:

- 设计 token / 主题 / 全局样式(`src/style.css`、`src/theme.ts`);
- 通用布局、顶栏、底栏、路由骨架;
- i18n 文案表;
- 跨多个页面复用的组件。

遇到这类改动:

1. 跑 `make quick-component` + `make quick-check`(L0 + quick);
2. 在交付摘要里写明:**本次改动影响全局,快检未覆盖全部页面**;
3. 建议用户跑 `/protodesign-verify`。

不要自行改跑 `make smoke-full` / `make calibrate` 来“补一下”。

## 五、失败处理

| 失败类型 | 处理 |
| --- | --- |
| 本次改动引入 | 修到绿再交付;优先用 `make quick-check LAST_FAILED=1` 只重跑失败项 |
| 改动前就已存在 | 在交付摘要里登记,不顺手修 |
| 环境问题(端口被占、浏览器未装、依赖缺失) | 修正环境后重跑,并在摘要里注明 |
| 测试自身缺陷(选择器过期、断言与现状不符) | 改动范围允许时修测试;否则登记并说明 |
| 超过 90 秒预算 | 视为选测过宽:缩小 `GREP` / `SPECS` 或只跑 L0,不得原样重跑 |

判定“是否本次引入”的方法:对报红项做一次最小回退验证(`git stash` 或临时还原单文件)后再跑该用例。不要凭感觉归类。

## 六、组件测试与 Storybook

- 新增或修改组件时,优先在 `tests/component/` 补组件测试:props、emits、键盘、状态分支。
- 有视觉状态的组件在 `src/**/*.stories.ts` 补 story;story 既是人工评审对象,也是 `make storybook-test` 的视觉用例。
- 纯逻辑 / 状态 / 事件放 Vitest;几何 / 像素 / 多宽度放 Playwright calibrate;不要两边重复覆盖。
- Storybook 只跑 `make storybook-test`,不进入日常快检的硬预算。

## 七、基线切片(下发给调研与实现 SubAgent)

不要把全部规范一次性灌给实现者。按 `targets` 只注入本次需要的:

| 载体 | 必读 | 不读 |
| --- | --- | --- |
| web | `protodesign-baseline.md`、`baseline-web.md`、`design-language.md`、`contracts.md` | `baseline-mobile.md` |
| desktop | 上面 + `baseline-desktop.md` | `baseline-mobile.md` |
| mobile | `protodesign-baseline.md`、`baseline-mobile.md`、`design-language.md`、`contracts.md` | `baseline-web.md`、`baseline-desktop.md` |

改动只涉及样式时,可以不注入 `contracts.md`;只涉及契约时,可以不注入端基线。**注入范围写进下发 prompt 的 `baseline_paths`,由实现 SubAgent 自己读。**
