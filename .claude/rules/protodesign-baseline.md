# protodesign-baseline:原型设计 + 代码规范单一事实源

## ① 定位

本规则是 **protodesigns 仓库自身唯一的"技术栈 + 原型设计 + 代码规范"单一事实源**。它**完全自包含**:下方技术栈、设计 token 基线、TS 规范、原型结构、数据与 API、交互状态、响应式与 a11y、验收清单,全部固化在本文件内,**不依赖仓库根 `CLAUDE.md` 提供规范,也不指向任何仓库外文件**。

本规则由三方共同锚定,保证同一套标准不漂移:

- `protodesign` Skill 自身(实现硬约束的依据);
- `protodesign-developer`(实现时逐条遵守);
- `protodesign-reviewer`(验收时逐项核对)。

所有原型子目录应遵循本基线;若某产品有专属品牌规范,以用户提供的品牌规范**覆盖本基线第 2 节的默认 token 值**,但仍须**集中定义在 token 层**(`src/theme.ts` 或 `src/styles/tokens.css`),严禁散落 hardcode 在组件里。

---

## ② 设计 token 基线

设计语言统一走 **design token**;组件内**严禁 hardcode 颜色、字号、圆角、间距、阴影、动效时长**等视觉数值——必须引用下方 token(经 CSS 变量或 Naive UI `themeOverrides` 统一映射)。

### 色彩(color)

| Token | 值 | 用途 |
| --- | --- | --- |
| `--color-primary` | `#2563EB` | 品牌主色(按钮 / 链接 / 选中态) |
| `--color-primary-hover` | `#3B82F6` | 主色 hover |
| `--color-primary-active` | `#1D4ED8` | 主色 active |
| `--color-success` | `#16A34A` | 成功 / 正向 |
| `--color-warning` | `#D97706` | 警告 |
| `--color-error` | `#DC2626` | 错误 / 危险 |
| `--color-info` | `#0891B2` | 信息 |
| `--color-text-strong` | `#1F2329` | 标题 / 强调文字 |
| `--color-text-normal` | `#303133` | 正文 |
| `--color-text-secondary` | `#8A909A` | 次要文字 / 辅助说明 |
| `--color-text-disabled` | `#C9CDD4` | 禁用文字 |
| `--color-bg-page` | `#F5F6F7` | 页面背景 |
| `--color-bg-container` | `#FFFFFF` | 卡片 / 容器背景 |
| `--color-border` | `#E5E6EB` | 默认边框 / 分割线 |
| `--color-border-light` | `#F2F3F5` | 浅分割线 |

### 字体(typography)

| Token | 值 |
| --- | --- |
| `--font-family-base` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` |
| `--font-size-xs` | `12px` |
| `--font-size-sm` | `14px` |
| `--font-size-base` | `16px` |
| `--font-size-lg` | `18px` |
| `--font-size-xl` | `20px` |
| `--font-size-2xl` | `24px` |
| `--font-size-3xl` | `30px` |
| `--line-height-body` | `1.5` |
| `--line-height-heading` | `1.25` |
| `--font-weight-regular` | `400` |
| `--font-weight-medium` | `500` |
| `--font-weight-semibold` | `600` |

### 间距(spacing,4px 基准)

| Token | 值 |
| --- | --- |
| `--space-1` | `4px` |
| `--space-2` | `8px` |
| `--space-3` | `12px` |
| `--space-4` | `16px` |
| `--space-6` | `24px` |
| `--space-8` | `32px` |
| `--space-12` | `48px` |

### 圆角(radius)

| Token | 值 |
| --- | --- |
| `--radius-sm` | `4px` |
| `--radius-md` | `8px` |
| `--radius-lg` | `12px` |
| `--radius-full` | `9999px` |

### 阴影(shadow)

| Token | 值 |
| --- | --- |
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.04)` |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.08)` |
| `--shadow-lg` | `0 8px 24px rgba(0, 0, 0, 0.12)` |

### 动效(motion)

| Token | 值 |
| --- | --- |
| `--duration-fast` | `150ms` |
| `--duration-base` | `250ms` |
| `--duration-slow` | `350ms` |
| `--easing-base` | `cubic-bezier(0.4, 0, 0.2, 1)` |

### 落地方式

两种任选其一(建议 Naive UI 项目用 `themeOverrides` + 少量 CSS 变量并用):

1. **CSS 变量**:在 `src/styles/tokens.css` 定义 `:root { --color-primary: #2563EB; ... }`,组件样式引用 `var(--color-primary)`。
2. **Naive UI themeOverrides**:在 `src/theme.ts` 集中映射到组件,例如:

```typescript
// src/theme.ts —— 集中定义 Naive UI 主题覆盖,把 token 映射到组件,避免在组件内 hardcode。
import type { GlobalThemeOverrides } from 'naive-ui'

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2563EB',
    primaryColorHover: '#3B82F6',
    primaryColorPressed: '#1D4ED8',
    primaryColorSuppl: '#3B82F6',
    successColor: '#16A34A',
    warningColor: '#D97706',
    errorColor: '#DC2626',
    infoColor: '#0891B2',
    textColorBase: '#303133',
    textColor1: '#303133',
    textColor2: '#4E5969',
    textColor3: '#8A909A',
    borderColor: '#E5E6EB',
    borderRadius: '8px',
    fontSize: '14px',
  },
}
```

---

## ③ TypeScript 代码规范要点

1. **strict 全开**:`strict: true`,并额外开启 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noImplicitOverride`,不得关闭任何 strict 子选项。
2. **禁止 `any`**:用 `unknown` 替代,经类型收窄后再操作。
3. **禁止类型断言绕过检查**:不用 `as T` 逃逸类型系统;用 `satisfies` 校验类型保留字面量类型;对接外部 API 无法避免时才用 `as`,并加注释说明原因。
4. **具名导出**:统一 `named export`,**禁止 `default export`**(重构重命名可被 IDE 追踪)。
5. **文件名 kebab-case**:如 `user-profile.ts`、`user.ts`、`user.types.ts`;不用 `PascalCase` 命名非组件文件。
6. **Result 模式**:可预期的业务失败返回 `Result<T>`,不抛异常;`throw` 仅用于真正不可恢复的程序错误。
7. **接口 / 类型**:对象形状优先 `interface`(支持 `extends`),联合 / 交叉 / 映射用 `type`;不用 `I` 前缀 / `Type` 后缀。
8. **判别联合**表示有限状态(如加载状态),而非一堆可选字段。
9. **命名**:变量/函数 `camelCase`,类/接口/类型/枚举 `PascalCase`,编译期常量 `UPPER_SNAKE_CASE`;Boolean 变量用 `is/has/can` 前缀。
10. **异步**:统一 `async/await`,明确 `Promise<T>` 泛型,无依赖的并发请求用 `Promise.all`。
11. **错误处理**:catch 块里 `error` 是 `unknown`,须收窄后使用。
12. **代码风格**:用 `const`(不用 `let`/`var`),可选链 `?.` 与空值合并 `??`,提前 `return` 减少嵌套,禁原始类型包装对象。

`Result` 模式定义(每个原型在 `src/api/` 内自行定义或共享):

```typescript
// src/api/result.ts —— 统一 API 返回结果:调用方在类型层面被迫处理失败分支。
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }
```

---

## ④ 原型结构基线

### 技术栈

| 项 | 选型 |
| --- | --- |
| 语言 | TypeScript(strict,规范见第 ③ 节) |
| 构建 | Vite |
| UI 框架 | Vue 3 + Naive UI |
| 包管理 | pnpm(每子目录独立 install) |
| Node 版本 | `^20.19.0 \|\| >=22.12.0`(Vite 引擎要求) |

- 每个产品服务一个 `protos/` 下的**独立子目录**(如 `protos/example/`),各自是**独立原型项目**:自含 `package.json` 与 `pnpm-lock.yaml`,互相无依赖耦合;根目录不维护 `package.json` / `pnpm-workspace.yaml`。
- 每个子目录含 `Makefile`,内容**一行**:

```makefile
include ../Make.def
```

- 在子目录内 `make run` 即启动 dev server;默认 `0.0.0.0:5173`,并行开发用 `make run PORT=<端口>` 覆盖,仅本机访问用 `HOST=localhost`。
- 新原型骨架:

```text
<子目录>/
├── Makefile          # include ../Make.def
├── package.json      # 独立依赖(Vue 3 + Naive UI + Vite + vue-tsc)
├── pnpm-lock.yaml
├── vite.config.ts
├── index.html
└── src/
    ├── main.ts       # 入口,挂载 Naive UI 配置与路由
    ├── App.vue
    ├── theme.ts      # design token 映射(Naive UI themeOverrides)
    ├── api/          # 强类型 API 函数(具名导出,返回 Promise<Result<T>>)
    ├── mocks/        # dummy 数据 + delay() 模拟延迟
    ├── components/   # 页面级组件
    └── pages/        # 页面(按需)
```

---

## ⑤ 数据与 API 基线

- **dummy 数据用真实内容**:贴近真实业务的文案 / 数字 / 字段结构(如真实人名、邮箱、金额、状态枚举),**禁止 lorem ipsum**;让原型演示起来有真实感。
- **强类型 API**:`src/api/<domain>.ts` 定义具名导出的 API 函数,签名与返回类型即"规范化 API 设计",供后续真实开发参考接口需求。
- **Result 模式**:API 函数返回 `Promise<Result<T>>`。
- **模拟延迟**:`src/mocks/` 提供 `delay()`,模拟 **150-300ms** 网络延迟。
- **刷新即重置**:不引入 MSW / 真实后端 / 本地持久化,刷新页面即回到初始 dummy 状态。
- **结构约定**:

```text
src/
├── api/
│   ├── <domain>.ts       # 强类型 API 函数(具名导出,Promise<Result<T>>)
│   └── <domain>.types.ts # 该域共用类型(API 契约的一部分)
└── mocks/
    ├── delay.ts          # delay():150-300ms 模拟网络往返
    └── <domain>.ts       # 内置 dummy 数据(贴近真实业务)
```

`delay` 实现参考(每个原型可复制此写法):

```typescript
// src/mocks/delay.ts —— 模拟网络延迟的辅助工具,供 dummy API 层使用。
const MIN_DELAY_MS = 150
const MAX_DELAY_MS = 300

// 生成 [150, 300] 区间内的随机延迟毫秒数。
function randomLatency(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1))
}

// 模拟一次网络往返;未传参时随机 150-300ms 延迟。
export function delay(ms: number = randomLatency()): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
```

---

## ⑥ 交互状态基线

### 三态(异步数据视图必齐)

每个依赖异步数据的视图必须覆盖四种状态,缺一不可:

| 状态 | 呈现 |
| --- | --- |
| 有数据(normal) | 正常渲染 dummy 数据 |
| loading | 加载占位(骨架屏或 spinner),不是白屏 |
| empty | 空数据提示(有图 / 文案 + 可选的行动按钮) |
| error | 错误提示 + 可重试动作 |

### 交互态

可交互元素必须覆盖:

| 状态 | 要求 |
| --- | --- |
| hover | 有可见反馈(颜色 / 阴影 / 背景变化) |
| focus | 焦点可见(键盘操作者能看清当前焦点,不能吞焦点样式) |
| active | 按压反馈 |
| disabled | 视觉禁用 + 不可点击 |

---

## ⑦ 响应式与 a11y 基线

### 响应式(三断点必可用)

在以下三个宽度都**可用且不破版**(无横向溢出、无文字重叠、无内容被裁):

| 断点 | 宽度 | 典型设备 |
| --- | --- | --- |
| 移动 | `375px` | 手机 |
| 平板 | `768px` | 平板 / 折叠屏 |
| 桌面 | `1280px` | 笔记本 |

- 用断点 / 媒体查询或 Naive UI 栅格(`NGrid` / `NRow` + `NCol`)实现;小屏优先保证内容单列可读。

### a11y 底线

- 正文文字与背景对比度 ≥ **4.5:1**(大字号 / 装饰性元素 ≥ 3:1)。
- 可交互元素**可键盘操作**(Tab 可达、Enter / Space 可触发)。
- 语义化标签(`button` / `a` / `nav` / `main` / 标题层级),不用 `div` 冒充按钮。
- 图标按钮提供 `aria-label` 或可见文本;表单控件有 `label` 关联。
- 图片有 `alt`(装饰图可空 `alt=""`)。
- 焦点顺序合理,焦点可见。

---

## ⑧ 验收清单

实现完成后逐项自检(最终由 `protodesign-reviewer` 逐项核对):

- [ ] **可运行**:子目录内 `make run` 可启动,浏览器可访问。
- [ ] **console 无 error**:无 JS 运行时错误(关键请求无 4xx/5xx 失败)。
- [ ] **token 合规**:颜色 / 字号 / 圆角 / 间距 / 阴影 / 动效均走 token 或 Naive UI `themeOverrides`,无 hardcode magic number。
- [ ] **三态完备**:异步视图有 loading / empty / error / 有数据四态,交互元素有 hover / focus / active / disabled 态。
- [ ] **响应式**:375 / 768 / 1280 三断点均可用、无破版。
- [ ] **a11y 底线**:对比度达标、可键盘操作、语义化标签、焦点可见。
- [ ] **反模式清单**(以下任何一项命中即判 fail):

| 反模式 | 说明 |
| --- | --- |
| AI slop 配色 | 高饱和撞色、霓虹渐变滥用、无主次 |
| 信息墙 | 大段文字无层次、无留白、无分组 |
| magic number | 组件内散落 `#fff`、`12px`、`8px` 等硬编码视觉值 |
| 无状态设计 | 只做了"有数据"一态,缺 loading / empty / error |
| 无反馈 | hover / focus / disabled 无任何视觉反馈 |
| 假交互 | 按钮不可点、链接无跳转、表单提交无反应 |
| 破版 | 某断点横向溢出 / 文字重叠 / 内容被裁 |
| 空壳 | dummy 数据用 lorem ipsum,页面无真实感 |
