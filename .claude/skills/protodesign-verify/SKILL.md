---
name: protodesign-verify
description: 手动触发:对 protodesigns 仓库中的指定原型跑全量校准——双引擎(Chromium + WebKit)、全部 calibrate spec、像素基线比对,失败时归因并回修;可选更新截图基线。当用户说"跑一次全量校准""完整验收这个原型""重跑 calibrate""更新截图基线",或输入 /protodesign-verify 时使用。不自动触发,也不属于 /protodesign 的日常回路。
disable-model-invocation: true
---

# protodesign-verify

## 定位

`/protodesign` 的日常回路只跑组件测试 + 通用冒烟 + 受影响 quick 断言。本 skill 负责**全量、慢速、需要人工过目**的那一层:

- 全部 `tests/calibrate` 断言(单引擎);
- 双引擎校准(Chromium + WebKit,含像素基线);
- 若原型配置了 Storybook,跑 `make storybook-test`(组件级视觉用例);
- 失败归因与回修派发;
- 截图基线的更新(必须人工确认)。

**只在用户手动触发时运行。** 不要在 `/protodesign` 交付后自行调用。

## 入参

```text
/protodesign-verify <slug>             # 全量校准
/protodesign-verify <slug> --update    # 校准后更新截图基线
```

- `<slug>` 是 `protos/` 下的目录名(如 `maixmia-website`);省略时先列出 `protos/*/meta.md` 让用户选,不要猜。
- `--update` 只在用户明确要求"更新基线"时使用。

## 前置检查

1. 读 `protos/<slug>/meta.md`,确认 `targets`:
   - 含 `web` / `desktop` → 走 Make.def 的 web 流程;
   - 含 `mobile` → 走 Make.def.flutter 的 `make calibrate`(`flutter analyze` + `flutter test` golden)。
2. 确认依赖已装(`node_modules` 存在);缺失时先 `make deps`。
3. 端口:默认 5173,被占用时用 `PORT=<端口>` 覆盖。`Make.def` 已把 `PORT` 导出给 Playwright,`BASE_URL` 会跟随,不会再静默测到 5173 上的其它实例。

## 派对应载体的 verifier

执行与归因下放给 verifier(只读 + Bash,不修改任何文件)。Main 只负责注入参数与裁定,不要自己跑全量命令、也不要让 agent 改代码。

| `targets` | 派谁 |
| --- | --- |
| 含 `web` / `desktop` | `protodesign-verifier` |
| 含 `mobile` | `protodesign-verifier-mobile` |

按原型的 `meta.md` 显式选择,不要依赖 description 自动匹配。

| 注入参数 | 取值 |
| --- | --- |
| `slug` | 原型目录名 |
| `scope` | web / desktop → `both`,或收窄到失败的那一层(`smoke-full` / `calibrate`);mobile 固定 `calibrate` |
| `expected_changes` | 本次设计上预期的变化(如"新增 Passkey 页面");没有就留空 |
| `diff_scope` | 本次改动涉及的文件 / 页面 / 组件清单 |
| `baseline_note` | 截图 / golden 基线的生成环境(知道时才填) |
| `port` | 实际使用的端口(仅 web / desktop) |

约束:

- agent 只跑 `scope` 指定的 `make smoke-full` / `make calibrate`,**不跑 `calibrate-update`**;
- 两个引擎都要跑(桌面壳在 macOS / Linux 用 WebKit 系、在 Windows 用 Chromium 系);
- mobile 的 `make calibrate` 等价于 `flutter analyze` + `flutter test` golden;手势返回、软键盘、安全区、权限弹窗必须在真机 / 模拟器确认,**agent 的返回必须把这些列为 `unverified`**,不得因为测试全绿就宣称移动端验收通过。

## 裁定 agent 的归类

agent 返回的是**证据 + 归类建议**,不是最终结论。Main 逐条核对:

| agent 归类 | Main 的处理 |
| --- | --- |
| `regression` | 直接进入回修 |
| `expected-change` | 人工确认变化确实是预期的;确认前不得计为通过 |
| `test-defect` | 判断修改测试是否在本次范围内;是则回修,否则登记并说明 |
| `env` | 换环境复验或登记为环境限制,不要当成产品问题修 |
| `flaky` | 标注"疑似 flaky,待复跑",不要据此改代码 |
| `unknown` | 要求补证据后再裁定,不猜 |

**不要改写 agent 的归类来让结果好看。** 有异议就写理由,不要悄悄降级。

> web / desktop 的 agent 定义见 [../../agents/protodesign-verifier.md](../../agents/protodesign-verifier.md),mobile 见 [../../agents/protodesign-verifier-mobile.md](../../agents/protodesign-verifier-mobile.md)。若 agent 的 Bash 调用被权限拦截,提示用户授权后重试,不要改由 Main 直接跑长命令来绕过。

## 回修

- 页面级 / 结构性改动 → 派 `protodesign-developer` 或 `protodesign-developer-flutter`,注入失败清单与证据;
- 单点 tweak → Main 直接改;
- 修完先跑一次相关的 `make quick-check`(必要时加 `GREP` / `LAST_FAILED=1`)快速确认,再派一次**对应载体**的 verifier(scope 收窄到失败的那一层),不要每次全量重跑。

## 更新基线(`--update`)

**只在用户明确要求时执行**,且必须:

1. 先展示本次失败的截图 / 差异,确认变化是预期的;
2. 再执行 `make calibrate-update`;
3. 提醒用户:基线按 OS 生成,不要用另一台机器的基线判失败;改动过的图需要人工过目。

未确认变化是预期的,不要更新基线 —— 那等于把回归固化成期望值。

## 输出

```yaml
---
verdict: pass | changes-requested | environment-blocked
slug: <slug>
targets: web | desktop | mobile
checks: [smoke-full, calibrate]
failures: <失败数>
classification:
  regression: <n>
  expected-change: <n>
  test-defect: <n>
  env: <n>
  flaky: <n>
  unknown: <n>
baseline_updated: true | false
unverified: [<未验证项:真机交互 / 跨 OS 基线 / ...>]
obstacles: [<agent 上报的执行障碍>]
---
```

正文汇总 agent 的失败清单(位置 / 证据 / 归类 / Main 的裁定),并单列"未验证面"。**存在未验证面时不要声称"完整验收通过"。**
