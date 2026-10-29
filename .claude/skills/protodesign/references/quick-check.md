# 快检:选哪些断言、失败怎么处理

本文件是 `/protodesign` 第 6 步的操作细则。目标:在**分钟级**内抓住本次改动引入的机械问题,而不是复跑整个测试套件。

## 一、先跑什么

```bash
cd protos/<slug>
make typecheck      # 契约生成 + 类型检查,必须绿
make smoke          # 通用兜底:tests/smoke,秒级
```

`tests/smoke` 是仓库级通用规格(任何原型都有一份),覆盖未捕获异常、console error、失败请求、四宽度横向溢出。它不随改动变化,始终要跑。

## 二、再挑本次相关的 spec

在 `make smoke` 后追加 `SPECS`:

```bash
make smoke SPECS="tests/calibrate/account.spec.ts tests/calibrate/composer.spec.ts"
```

选择依据(按优先级):

1. **按路由**:改动落在哪个页面,就找 `goto('<该路由>')` 的 spec。
   ```bash
   grep -l "goto('/#/workspace" tests/calibrate/*.spec.ts
   ```
2. **按组件 / 文案**:改动涉及组件名、`data-testid`、可见文案,直接搜。
   ```bash
   grep -l "<组件名或关键文案>" tests/calibrate/*.spec.ts
   ```
3. **按契约**:改了 `contracts/main.tsp` 的实体 / 字段,把引用该实体的页面 spec 都选上;无法判断时至少加 `calibrate.spec.ts`。
4. **按交互**:改动涉及键盘、焦点、四态、对比度,优先选 describe 名称里含这些词的 spec。

**没有把握时不要猜。** 宁可多选 1–2 个文件,也不要把明显相关的 spec 漏掉。

## 三、什么时候快检不够用

以下改动会影响全局,按改动挑 spec 天然不可靠:

- 设计 token / 主题 / 全局样式(`src/style.css`、`src/theme.ts`);
- 通用布局、顶栏、底栏、路由骨架;
- i18n 文案表;
- 跨多个页面复用的组件。

遇到这类改动:

1. 仍先跑 `make smoke`(通用兜底);
2. 在交付摘要里明确写:**本次改动影响全局,快检未覆盖全部页面**;
3. 建议用户跑 `/protodesign-verify`(全量校准)。

不要自行改跑 `make smoke-full` 或 `make calibrate` 来"补一下" —— 那是 verify 的职责,会把开发回路重新拖慢。

## 四、失败处理

| 失败类型 | 处理 |
| --- | --- |
| 本次改动引入 | 必须修到绿再交付 |
| 改动前就已存在 | 在交付摘要里登记,不顺手修(超出本次范围) |
| 环境问题(端口被占、浏览器未装、依赖缺失) | 修正环境后重跑,并在摘要里注明 |
| 测试自身缺陷(选择器过期、断言与现状不符) | 改动范围允许时修测试;否则登记并说明 |

判定"是否本次引入"的方法:对报红项做一次最小回退验证(`git stash` 或临时还原单文件)后再跑该 spec。不要凭感觉归类。

## 五、基线切片(下发给调研与实现 SubAgent)

不要把全部规范一次性灌给实现者。按 `targets` 只注入本次需要的:

| 载体 | 必读 | 不读 |
| --- | --- | --- |
| web | `protodesign-baseline.md`、`baseline-web.md`、`design-language.md`、`contracts.md` | `baseline-mobile.md` |
| desktop | 上面 + `baseline-desktop.md` | `baseline-mobile.md` |
| mobile | `protodesign-baseline.md`、`baseline-mobile.md`、`design-language.md`、`contracts.md` | `baseline-web.md`、`baseline-desktop.md` |

改动只涉及样式时,可以不注入 `contracts.md`;只涉及契约时,可以不注入端基线。**注入范围写进下发 prompt 的 `baseline_paths`,由实现 SubAgent 自己读。**

> 章节级拆分(把 `design-language.md` 按 tokens / 排版 / 配方拆成多个文件)属于后续优化,当前先按端裁剪。
