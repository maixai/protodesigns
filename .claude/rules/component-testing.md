# component-testing:组件级工作流

本文件规定 protodesigns 的组件测试、Storybook 与三层快检的分工。目标是让日常改动在**分钟级**内得到反馈,同时保留完整验收的能力。

## ① 分层

| 层 | 位置 | 验什么 | 命令 | 预算 |
| --- | --- | --- | --- | --- |
| L0 通用冒烟 | `tests/smoke/` | console error、失败请求、四宽度横向溢出 | `make quick-check` | 秒级 |
| L1 功能快检 | `tests/quick/` | 本次改动相关的高价值交互 | `make quick-check` | ≤ 90 秒 |
| L1 组件测试 | `tests/component/` | props / emits / 键盘 / 状态分支 | `make quick-component` | 秒级 |
| L1 Storybook | `src/**/*.stories.ts` | 组件视觉状态、人工评审 | `make storybook-test` | 秒级到分钟级 |
| L2 全量校准 | `tests/calibrate/` | 几何、像素基线、多宽度矩阵 | `/protodesign-verify` | 分钟级 |
| L3 完整评审 | 浏览器真渲染 | 深色、排版、a11y、反模式 | `/protodesign-review` | 分钟级 |

日常回路只跑 L0 + L1。**L2 / L3 由用户手动触发。**

## ② 新增或修改组件时

- **组件测试**:在 `tests/component/<component>.spec.ts` 覆盖本次触及的逻辑:
  - props 的取值分支;
  - `emit` 的事件与载荷;
  - 键盘 / 焦点行为;
  - 空态 / 错误态 / 禁用态等状态分支。
- **Storybook story**:在组件同目录新增 `<component>.stories.ts`,至少覆盖:
  - 默认态;
  - 本次新增或修改的状态;
  - 窄屏 / 长文案等容易破版的变体(如适用)。
- **集成快检**:在 `tests/quick/` 补一条或更新已有测试,验证组件在页面里的真实接线。
- **不要重复覆盖**:纯逻辑与事件归 Vitest;页面级交互归 Playwright quick;几何与像素归 calibrate。

## ③ 测试标题与 area 标签

`tests/quick/` 的测试标题必须带 `@area:<name>` 标签,例如:

```ts
test('@area:agent-settings 打开设置并保存脏状态', async ({ page }) => { ... })
```

area 与 `tests/impact-map.json` 的规则对应:

```json
{
  "rules": [
    {
      "area": "agent-settings",
      "paths": ["src/components/agent-editor-dialog.vue", "src/data/agent-status.ts"]
    }
  ]
}
```

`make quick-check AUTO=1` 按 `git diff` 命中规则后,用 `--grep "@area:(...)"` 选测。

## ④ 命令

```bash
make quick-component                  # Vitest 组件测试
make quick-check                      # L0 + tests/quick 全部
make quick-check AUTO=1               # 按 impact map 自动选 area
make quick-check GREP="@area:agent-settings"
make quick-check LAST_FAILED=1        # 只重跑上一轮失败项
make quick-all                        # 组件 + 页面
make storybook                        # 组件工作台(6006)
make storybook-test                   # stories 的真浏览器用例
make storybook-build                  # 构建静态 Storybook(发布/分享用)
```

`QUICK_TIMEOUT` 默认 90 秒。超时意味着选测过宽,应缩小 `GREP` / `SPECS`,不得后台轮询或原样重跑。

## ⑤ 模板与既有原型

- `protos/example-web/` 是模板:新建原型时复制它,自动带上 `.storybook/`、`vitest.config.ts`、`tests/component/` 与 scripts。
- `protos/maixmia-website/` 是首个接入完整组件工作流的存量原型,可作为迁移参考。
- 其它存量原型接入时:
  1. 复制 `example-web` 的 `.storybook/`、`vitest.config.ts`、`vitest.shims.d.ts`、`pnpm-workspace.yaml`;
  2. 在 `package.json` 补 devDependencies(`storybook` / `@storybook/vue3-vite` / `@storybook/addon-docs` / `@storybook/addon-vitest` / `vitest` / `@vitest/browser` / `@vitest/browser-playwright` / `@vue/test-utils` / `happy-dom` / `playwright`)与 scripts;
  3. 在 `playwright.config.ts` 加 `quick` project;
  4. 新建 `tests/quick/`、`tests/impact-map.json` 与 `tests/component/`。

## ⑥ 验收边界

- 组件测试与 Storybook 只证明“这个组件的状态与外观没坏”,不证明页面集成正确;页面接线仍由 `tests/quick` 覆盖。
- 视觉基线只证明“看起来没变”,不证明“算对了”;业务逻辑由组件测试覆盖。
- Storybook 的 story 不能替代 `/protodesign-review` 的 a11y / 深色 / 排版判断。
