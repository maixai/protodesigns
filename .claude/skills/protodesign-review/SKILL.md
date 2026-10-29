---
name: protodesign-review
description: 手动触发:对 protodesigns 仓库中的指定原型做 L3 完整评审——派 fresh-eyes 评审 SubAgent 用浏览器真渲染,按基线核对深色模式、中文排版、a11y 语义、四态、桌面壳能力与反模式清单,裁定 findings 并回修到收敛。当用户说"完整评审这个原型""审查这一版""看看深色模式和 a11y",或输入 /protodesign-review 时使用。不自动触发,也不属于 /protodesign 的日常回路。
disable-model-invocation: true
---

# protodesign-review

## 定位

`/protodesign` 的日常回路不自动派评审。本 skill 负责**完整评审(L3)**:脚本验不了、需要判断力、且必须亲眼看渲染结果的项。

**只在用户手动触发时运行。** 一次评审通常需要数分钟到十几分钟;不要在交付后自行调用。

分工边界:

| 项 | 归谁 |
| --- | --- |
| console error / 失败请求 / 横向溢出 / 类型检查 | `/protodesign` 的快检 |
| 全量 spec + 双引擎 + 像素基线 | `/protodesign-verify` |
| 深色可读性 / 中文排版 / a11y 语义 / 四态 / 壳能力 / 反模式 | **本 skill** |

## 入参

```text
/protodesign-review <slug> [scoped|full]
```

- `<slug>` 是 `protos/` 下的目录名;省略时先列出 `protos/*/meta.md` 让用户选。
- `mode`:
  - `scoped`(默认)—— 只审本次改动范围,只判 Critical;
  - `full` —— 覆盖全部页面,判到 Major(含风格项)。

## 前置

1. 读 `protos/<slug>/meta.md` 确定 `targets`(决定派 `protodesign-reviewer` 还是 `protodesign-reviewer-mobile`)。
2. 确认 dev server 可达。没有就跑起来:
   ```bash
   cd protos/<slug> && make run
   ```
   记录**实际**地址与端口(可能被占用而自动后移)。
3. 收集 `diff_scope`:本次改动涉及的页面 / 组件 / 文件清单;`full` 模式可空。
4. 确认快检是绿的;不绿先回 `/protodesign` 修,不要带着已知 Critical 进评审。

## 派评审

按载体选:

- 含 `web` / `desktop` → `protodesign-reviewer`;
- 含 `mobile` → `protodesign-reviewer-mobile`。

注入参数:`mode`、`target_url`、`targets`、`widths`(默认 375 / 768 / 1280 / 1600)、`diff_scope`、`spec_summary`、`baseline_paths`。`full` 且非首轮时追加 `regression_baseline`(上一轮已通过项)。

## 裁定与回修

1. **逐条判真伪**:证据是否成立、是否落在本次范围内、是否对照了基线某一条。不成立的驳回并记录理由。
2. 真 finding:
   - 页面级 / 结构性 → 派 `protodesign-developer` / `protodesign-developer-flutter`;
   - 单点 tweak → Main 直接改。
3. 回修后跑快检:
   ```bash
   make smoke SPECS="<相关 spec>"
   ```
4. 重派同模式 reviewer。循环至:
   - `scoped`:0 Critical;
   - `full`:0 Critical + 0 Major。

**不要为了尽快收敛而把 Major 降级成 Minor。** 分级以 reviewer 对照基线的判定为准;有异议就驳回并写理由,不要改级别。

## 回归对照(`full` 且非首轮)

把上一轮"已通过"的项逐条复跑。任一项由 pass 变 fail = Critical,单列在「回归」一节,并注明是哪一条变了。

## 输出

```yaml
---
verdict: pass | changes-requested
slug: <slug>
mode: scoped | full
rounds: <评审轮数>
critical: <数量>
major: <数量>
minor: <数量>
browser_verified: true | false
unverified: [<浏览器验不了的项:真机手势 / 安全区 / ...>]
---
```

正文列:本轮覆盖了哪些页面 / 宽度 / 主题;修复了哪些;驳回并说明理由的有哪些;未验证面有哪些。

**存在未验证面时不要声称"完整通过"。**
