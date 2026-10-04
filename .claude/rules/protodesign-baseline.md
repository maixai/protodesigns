# protodesign-baseline:跨端共享基线

## ① 定位

本文件是 protodesigns 的**跨端共享基线**,与以下文件共同构成完整的规范体系:

| 文件 | 覆盖内容 |
| --- | --- |
| **本文件** | 定位 / 设计 token / TS 规范 / 原型结构 / 数据与 API / 交互状态 / a11y / 共享验收清单 |
| [`baseline-web.md`](./baseline-web.md) | `targets` 含 `web` 时的响应式与验收项 |
| [`baseline-desktop.md`](./baseline-desktop.md) | `targets` 含 `desktop` 时的窗口语义、壳能力与验收项 |
| [`baseline-mobile.md`](./baseline-mobile.md) | `targets` 含 `mobile` 时的平台语义与验收项 |
| [`contracts.md`](./contracts.md) | 契约书写约定与跨端一致性规则 |

**按原型的 `meta.md` 声明选用端基线**:`targets` 含哪个端,就叠加哪份端基线;共享基线永远适用。

本基线由三方共同锚定,保证同一套标准不漂移:

- `protodesign` Skill 自身(实现硬约束的依据);
- `protodesign-developer*`(实现时逐条遵守);
- `protodesign-reviewer*`(验收时逐项核对)。

若某产品有专属品牌规范,以用户提供的品牌规范**覆盖本基线第 ② 节的默认 token 值**,但仍须**集中定义在 token 层**,严禁散落 hardcode 在组件里。

> **默认 token 是"起点"而非"组织品牌"**:protodesigns 面向多个互不相关的产品,第 ② 节的值只是新产品开箱可用的默认,任何原型都可以整体替换。

---

## ② 设计 token 基线

设计语言统一走 **design token**;组件内**严禁 hardcode 颜色、字号、圆角、间距、阴影、动效时长**等视觉数值——必须引用下方 token(经 CSS 变量或组件库主题统一映射)。

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

Vue 侧两种任选其一(建议 `themeOverrides` + 少量 CSS 变量并用):

1. **CSS 变量**:在 `src/styles/tokens.css` 定义 `:root { --color-primary: #2563EB; ... }`,组件样式引用 `var(--color-primary)`。
2. **组件库主题覆盖**:在 `src/theme.ts` 集中映射,避免在组件内 hardcode。

Flutter 侧的对应做法见 [`baseline-mobile.md`](./baseline-mobile.md)。

---

## ③ TypeScript 代码规范要点

1. **strict 全开**:`strict: true`,并额外开启 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noImplicitOverride`,不得关闭任何 strict 子选项。
2. **禁止 `any`**:用 `unknown` 替代,经类型收窄后再操作。
3. **禁止类型断言绕过检查**:不用 `as T` 逃逸类型系统;用 `satisfies` 校验类型保留字面量类型;对接外部 API 无法避免时才用 `as`,并加注释说明原因。
4. **具名导出**:统一 `named export`,**禁止 `default export`**。
5. **文件名 kebab-case**:如 `user-profile.ts`;不用 `PascalCase` 命名非组件文件。**契约生成物例外**(由生成器命名)。
6. **Result 模式**:可预期的业务失败返回 `Result<T>`,不抛异常;`throw` 仅用于真正不可恢复的程序错误。
7. **接口 / 类型**:对象形状优先 `interface`,联合 / 交叉 / 映射用 `type`;不用 `I` 前缀 / `Type` 后缀。
8. **判别联合**表示有限状态(如加载状态),而非一堆可选字段。
9. **命名**:变量/函数 `camelCase`,类/接口/类型/枚举 `PascalCase`,编译期常量 `UPPER_SNAKE_CASE`;Boolean 变量用 `is/has/can` 前缀。
10. **异步**:统一 `async/await`,明确 `Promise<T>` 泛型,无依赖的并发请求用 `Promise.all`。
11. **错误处理**:catch 块里 `error` 是 `unknown`,须收窄后使用。
12. **代码风格**:用 `const`,可选链 `?.` 与空值合并 `??`,提前 `return` 减少嵌套,禁原始类型包装对象。

`Result` 模式定义:

```typescript
// src/api/result.ts —— 统一 API 返回结果:调用方在类型层面被迫处理失败分支。
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }
```

---

## ④ 原型结构基线

### 技术栈(统一固定)

| 端 | 载体 | 说明 |
| --- | --- | --- |
| `web` / `desktop` | TypeScript + Vite + Vue 3 + 组件库 | **同一份代码**:浏览器里跑即 web,套 Electron 壳即 desktop |
| `mobile` | Flutter(Dart) | 独立一份代码 |

### 目录组织

每个原型是 `protos/` 下的**扁平一层、完全自包含**的独立项目:

```text
protos/<slug>/
├── meta.md                    # 原型声明
├── Makefile                   # include ../Make.def(或 ../Make.def.flutter)
├── tspconfig.yaml             # 契约生成配置
├── contracts/                 # 契约源头 + 生成中间产物
│   ├── main.tsp
│   └── generated/             # 生成物,勿手改,不入库
└── src/ 或 lib/               # 载体代码
    └── contracts/generated/   # 生成的类型,勿手改,不入库
```

- **一个原型 = 一个设计 = 一个目录**,不设"产品"中间层;同产品的多端原型用 `meta.md` 的 `product` 字段软关联。
- 各子目录自含 `package.json` 与锁文件,互不依赖;根目录不维护 workspace。
- 在子目录内 `make run` 即启动;端口用 `make run PORT=<端口>` 覆盖。

### meta.md 声明

```yaml
---
name: 示例原型
slug: example
description: 一句话说明这个原型演示什么
owner: 姓名
owner_email: 邮箱
product: example              # 可选:软关联同产品的多个端原型
targets: [web, desktop]       # 必填:web | desktop | mobile
data: local-first             # 必填:remote-http | local-first | hybrid
---
```

| 字段 | 必填 | 作用 |
| --- | --- | --- |
| `targets` | 是 | 决定叠加哪些端基线、生成哪些产物、用哪个 Make.def |
| `data` | 是 | 决定契约产出的形态;两种形态差别大,不设默认值以免猜错方向 |
| `product` | 否 | 把同产品的多端原型软关联,便于核对契约一致性 |

---

## ⑤ 数据与 API 基线

### 契约是单一事实源

- `contracts/main.tsp` 定义**数据长什么样**,是手写的唯一源头;各端类型由 `make contracts` 生成。
- **不手写类型**:`src/api/` 等处的类型必须来自 `src/contracts/generated/`,不得重复定义。
- 契约的书写约定与跨端一致性规则见 [`contracts.md`](./contracts.md)。

### 数据访问层

- `src/api/` 定义**强类型 API 函数**(具名导出),函数签名即"规范化 API 设计",供后续真实开发参考。
- 数据来自 `src/mocks/` 内置 **dummy 数据**;API 函数通过 `delay()` 模拟 **150-300ms** 网络延迟。
- **不引入 MSW**:本仓库的数据形态以本地优先为主,MSW 拦的是 HTTP 请求而拦不到本地读写,且它在 Electron 宿主上是已知短板。手写 mock 模块是跨宿主唯一无痛的方案。
- 业务失败统一用 **Result 模式**:API 函数返回 `Promise<Result<T>>`,调用方在类型层面被迫处理失败。

### dummy 数据要求

- 用**贴近真实业务**的文案 / 数字 / 字段结构,**禁止 lorem ipsum**;
- **刷新即重置**:不接真实后端、不做本地持久化。

`delay` 实现参考:

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

### 四态(异步数据视图必齐)

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
| hover | 有可见反馈(颜色 / 阴影 / 背景变化)。**触屏端不适用**,见 [`baseline-mobile.md`](./baseline-mobile.md) |
| focus | 焦点可见(键盘操作者能看清当前焦点,不能吞焦点样式) |
| active | 按压反馈 |
| disabled | 视觉禁用 + 不可点击 |

---

## ⑦ a11y 底线(跨端共用)

- 正文文字与背景对比度 ≥ **4.5:1**(大字号 / 装饰性元素 ≥ 3:1)。
- 可交互元素**可键盘操作**(Tab 可达、Enter / Space 可触发)。
- 语义化标签(`button` / `a` / `nav` / `main` / 标题层级),不用 `div` 冒充按钮。
- 图标按钮提供 `aria-label` 或可见文本;表单控件有 `label` 关联。
- 图片有 `alt`(装饰图可空 `alt=""`)。
- 焦点顺序合理,焦点可见。

各端的额外要求见对应端基线。

---

## ⑧ 共享验收清单

实现完成后逐项自检(最终由 reviewer 逐项核对):

- [ ] **可运行**:子目录内 `make run` 可启动,可访问。
- [ ] **契约一致**:类型来自生成物,无手写重复定义;`make contracts` 无报错。
- [ ] **console 无 error**:无 JS 运行时错误(关键请求无 4xx/5xx 失败)。
- [ ] **token 合规**:颜色 / 字号 / 圆角 / 间距 / 阴影 / 动效均走 token 或主题覆盖,无 hardcode magic number。
- [ ] **四态完备**:异步视图有 loading / empty / error / 有数据四态。
- [ ] **交互态完备**:hover / focus / active / disabled(触屏端按端基线调整)。
- [ ] **a11y 底线**:见第 ⑦ 节。
- [ ] **端基线**:按 `meta.md` 的 `targets` 逐份核对对应端基线。

### 反模式清单(命中任何一项即判 fail)

| 反模式 | 说明 |
| --- | --- |
| AI slop 配色 | 高饱和撞色、霓虹渐变滥用、无主次 |
| 信息墙 | 大段文字无层次、无留白、无分组 |
| magic number | 组件内散落 `#fff`、`12px`、`8px` 等硬编码视觉值 |
| 无状态设计 | 只做了"有数据"一态,缺 loading / empty / error |
| 无反馈 | hover / focus / disabled 无任何视觉反馈 |
| 假交互 | 按钮不可点、链接无跳转、表单提交无反应 |
| 空壳 | dummy 数据用 lorem ipsum,页面无真实感 |
| 手写类型 | 绕过契约生成物,自行重复定义数据结构 |
