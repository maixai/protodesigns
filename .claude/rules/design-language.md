# design-language:Tungsten 青瓷

本文件是 protodesigns 的**设计语言单一事实源**。跨端共享基线（[`protodesign-baseline.md`](./protodesign-baseline.md)）的 ② 节保留一份 token 速查表，**取值以本文件为准**；本文件补足速查表放不下的部分:设计依据、中文排版规则、组件配方、落地映射与禁用值。

`targets` 含 `web` / `desktop` 时按第 ⑨ 节落地；含 `mobile` 时按第 ⑩ 节落地。两端的取值同源，落地方式不同。

---

## ① 定位与适用范围

| 项 | 说明 |
| --- | --- |
| 覆盖范围 | 所有原型的**配色、排版、空间、层级、动效、组件外观**；web / desktop（Vue + Naive UI）与 mobile（Flutter）共用取值 |
| 与共享基线的关系 | 共享基线 ② 节是速查表，本文件是完整规范；两者冲突时以本文件为准 |
| 与品牌规范的关系 | 若某产品有专属品牌规范，**整体替换本文件的取值**，但仍须保持第 ③ 节的三层结构，不得散落 hardcode |
| 视觉参照 | 展示页 [`protos/design-language/`](../../protos/design-language/) 是本文件的**单向派生呈现**：方向只有 rules → 页面，页面不得反向作为事实源 |
| 变更流程 | 见第 ⑮ 节 |

**语言性格**:克制的科技感。精确、克制、几乎不用装饰来表态。科技感来自发丝描边的结构秩序与等宽字体承担的技术信息，而不是来自冷色；人文温度来自暖调中性底与中文排版上的讲究。

---

## ② 强制约束摘要(机械可判定)

以下每一条都可以用 grep 或人眼二值判定，reviewer 直接按此核对。

| # | 约束 | 判定方式 |
| --- | --- | --- |
| 1 | 颜色 / 字号 / 行高 / 间距 / 圆角 / 阴影 / 动效时长**一律走 token** | `grep -rnE '#[0-9a-fA-F]{3,8}\|[0-9]+px' src/{components,pages}` 应只命中 token 定义与注释 |
| 2 | 组件**只引用语义角色层**(`--dl-bg-*` / `--dl-text-*` / `--dl-accent-*` 等) | 组件内不出现 `--dl-accent-600` 这类 ramp 阶 |
| 3 | **禁止行内视觉 style** | 模板里不出现 `style="color: ..."` 这类字面量；仅允许 `var(--token)` 引用 |
| 4 | 字重**不超过 600** | 不出现 `font-weight: 700` 及以上 |
| 5 | 数字在数据场景用**等宽数字** | 表格与数据列有 `font-variant-numeric: tabular-nums`(角色层已全局继承) |
| 6 | 正文行高 ≥ 1.5 | 见 §⑤ |
| 7 | 正文与背景对比度 ≥ 4.5:1 | 由校准装置逐对断言 |
| 8 | 焦点必须可见 | 交互元素有 `:focus-visible` 且用 `--dl-focus-ring` |
| 9 | 浮层层序用 `--dl-z-*` | 不出现 `z-index: 9999` 这类字面量 |
| 10 | 图标按钮必带 `aria-label` | 无可见文本的按钮逐一核对 |

---

## ③ Token 架构与命名

三层，**方向只能向下**:

```text
ramp 层        --dl-neutral-500 / --dl-accent-600 / --dl-space-4 …
   ↓ 由语义角色层引用
语义角色层     --dl-bg-base / --dl-text-secondary / --dl-accent …
   ↓ 由组件引用
组件           Button / Card / Input …
```

**命名规则**:`--dl-<层级>-<语义>[-<变体>]`

- `--dl-` 前缀为设计语言 token 保留，禁止组件自定义同名变量；
- **组件只允许引用语义角色层与结构 token**（字号 / 间距 / 圆角 / 阴影 / 时长），不得直接引用 ramp 阶——直接引用会绕过主题与品牌替换；
- 新增 token 必须先在展示页上出现，再回写本文件与 §② 的速查表。

---

## ④ 色彩

### 中性色(暖调 chromatic neutral)

色相锚定约 **35°**、饱和约 **8%**，全程保持色相与饱和度不变，只推进明度。**不使用纯灰**——纯灰读起来冷、像"没配过色"。

| Token | 浅色 | 深色 |
| --- | --- | --- |
| `--dl-neutral-0` | `#ffffff` | `#1c1916` |
| `--dl-neutral-50` | `#faf8f5` | `#14110e` |
| `--dl-neutral-100` | `#f4f1ec` | `#26221d` |
| `--dl-neutral-200` | `#e8e4dc` | `#38332c` |
| `--dl-neutral-300` | `#d8d2c8` | `#4a443b` |
| `--dl-neutral-400` | `#b3aaa0` | `#6b6358` |
| `--dl-neutral-500` | `#756c63` | `#8f867a` |
| `--dl-neutral-600` | `#5c554d` | `#b5aca0` |
| `--dl-neutral-700` | `#46403a` | `#d6cfc4` |
| `--dl-neutral-800` | `#302b25` | `#e8e2d8` |
| `--dl-neutral-900` | `#221d18` | `#f5f1ea` |
| `--dl-neutral-950` | `#14110d` | `#fdfbf7` |

> **500 / 600 是反推出来的**，不是凭观感取的:它们是三级 / 二级文字色，必须在其底色上达到 4.5:1。改这两个值必须重跑对比度断言。

### 强调色(青瓷)

| Token | 浅色 | 深色 |
| --- | --- | --- |
| `--dl-accent-50` | `#eff6f4` | `#16302b` |
| `--dl-accent-500` | `#3f8a7c` | `#6fb3a4` |
| `--dl-accent-600` | `#2e6f63` | `#8cc7b9` |
| `--dl-accent-700` | `#245a50` | `#63a79a` |
| `--dl-accent` | 取 600 | 取 600 |

完整 ramp 见展示页。**强调色是整套语言里唯一承担"可操作"语义的色相**，只用于行动点、选中态与活动指示。

### 点缀色(暖珀)与状态色

| 分组 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--dl-highlight` | `#8a6420` | `#e3b876` | 标签与提示的暖色点缀，**不承担主行动** |
| `--dl-success` | `#3f6b4f` | `#7fb894` | 成功 / 正向 |
| `--dl-warning` | `#8a6420` | `#e3b876` | 警告 |
| `--dl-error` | `#9c4038` | `#d98a80` | 错误 / 危险 |
| `--dl-info` | `#3d5a70` | `#8fb0c9` | 信息 |

### 深色策略

**整体反转中性 ramp，并把强调色提亮**——语义角色层一行都不用改。深色底同样保留暖色相偏移，**不使用纯黑**（Vercel `#171717`、Linear `#010102` 都刻意避开 `#000000`）。

---

## ⑤ 字体与排版

### 字体族

| Token | 取值 |
| --- | --- |
| `--dl-font-sans` | `'IBM Plex Sans', 'Inter', 'Source Han Sans SC', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` |
| `--dl-font-mono` | `'IBM Plex Mono', 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace` |
| `--dl-font-display` | 取 sans。标题与正文同族，靠字号与字重建立层级 |

**技术信息一律走等宽**:token 名、编号、代码、密钥。这是本语言科技感的主要来源之一。

### 字号阶

比例 **1.25（Major Third）**，基准 **15px**。

| Token | 值 | 用途 |
| --- | --- | --- |
| `--dl-font-size-xs` | `12px` | 辅助说明 / 标签 |
| `--dl-font-size-sm` | `13px` | 次级文字 |
| `--dl-font-size-md` | `15px` | **正文基准** |
| `--dl-font-size-lg` | `19px` | 小标题 |
| `--dl-font-size-xl` | `23px` | 区块标题 |
| `--dl-font-size-2xl` | `29px` | 页面标题 |
| `--dl-font-size-3xl` | `37px` | 展示字号 |

> **基准取 15 而非 14**:14px 对中文偏小（笔画密、识别成本高）。15px 是密集界面与中文可读性之间的折中；**纯阅读场景可再上探到 16–18px**。

### 行高(分档)

| Token | 值 | 用途 |
| --- | --- | --- |
| `--dl-line-tight` | `1.25` | 展示字号 / 大标题 |
| `--dl-line-snug` | `1.45` | 小标题 / 表格 |
| `--dl-line-body` | `1.7` | **正文** |
| `--dl-line-loose` | `1.85` | 长文阅读 |

> **正文取 1.7 而不是西文常见的 1.5**:中文笔画密度高，1.4–1.5 会明显发挤。**这是本规范与通用西文规范最容易冲突的一处，以 1.7 为准。**
>
> WCAG 1.4.12 要求行高**可被用户调至 1.5× 而不破版**——这说的是容忍度，不是"必须设为 1.5"。

### 字距、段距与行宽

| Token | 值 | 说明 |
| --- | --- | --- |
| `--dl-tracking-normal` | `0` | **中文不需要正字距**。WCAG 对表意文字的字距要求亦豁免 |
| `--dl-tracking-label` | `0.01em` | 区块小标题 |
| `--dl-tracking-caps` | `0.06em` | 微型全大写标签 |
| `--dl-para-gap` | `1.5em` | 段间距。WCAG 要求可被调至 2× 而不破版 |
| `--dl-measure` | `35em` | 正文行宽 |

> **行宽必须按 em 计，不能按 ch**。`ch` 是西文字符宽度，中文是全角方块字，用 `ch` 会把中文行拉到过长。35em ≈ 中文 33–36 字/行。
>
> 为中文内容设行宽时，通用西文建议的 60–75ch 是**错的**。

### 字重

只允许 **400 / 500 / 600** 三档。**700 及以上禁止**——会破坏克制感。

### 中文排版规则(强制)

| 规则 | 落地 |
| --- | --- |
| 中西文混排间距 | 角色层 `text-autospace: normal`，由浏览器自动插入（W3C《中文排版需求》建议不超过 1/4 汉字宽）。不支持该属性的浏览器静默忽略 |
| 避头尾 | 角色层 `line-break: strict`，禁止标点出现在行首 |
| 断行 | 角色层 `overflow-wrap: break-word`；中文允许按字断行，西文单词不从中间截断 |
| 对齐 | **一律左对齐，禁止两端对齐**。中文两端对齐会产生字间"河流" |
| 数字等宽 | 角色层 `font-variant-numeric: tabular-nums`，数值变化时列宽不跳动 |

### 文本截断

三档，按"内容是否必须完整可见"选，**不是按视觉长短选**。

| 类 | 行为 | 适用 |
| --- | --- | --- |
| `.dl-truncate` | 单行省略 | 表格单元格、列表标题 |
| `.dl-clamp-2` / `.dl-clamp-3` | 多行省略 | 卡片摘要 |
| 不截断 | — | 正文，以及任何"截断会丢失决策所需信息"的位置 |

---

## ⑥ 空间、圆角与边框

| 组 | Token 与取值 |
| --- | --- |
| 间距(4px 基准) | `--dl-space-1/2/3/4/6/8/12` = `4 / 8 / 12 / 16 / 24 / 32 / 48px` |
| 圆角 | `--dl-radius-sm/md/lg/xl/pill` = `6 / 8 / 12 / 16 / 9999px` |
| 边框 | `--dl-border-width` = `1px`。层级以发丝描边为主 |
| 控件高度 | `--dl-control-height` = `36px` |
| 触达尺寸 | `--dl-target-size` = `44px`（**默认**下限：独立控件与触屏场景）；**密集行**（纵向列表 / 树行 + 横向 tab 条及其行内控件）可降至 `24px`（见下方说明） |

> **圆角随元素尺寸走，小控件与满高面板不共用一档。** 各档分工固定为：`sm` 标签 / 小控件、
> `md` 按钮 / 输入框、`lg` 卡片、`xl` **面板 / 浮层**、`pill` 胶囊 / 头像。
>
> `xl`（16px）是本档为「面板」补的：原阶最大 12px 属 card / modal 档，用在满高面板上圆弧
> 相对面板尺寸太小、视觉上仍接近直角。业界把 hero / bottom sheet / 大面板放在 16–24px，
> 16px 取该区间下沿，与既有 `6 / 8 / 12` 的 1.3–1.5 倍步进节奏一致，且相对 20px 更少打破
> 与内部元件的同心关系。**这是纯增量：`sm / md / lg / pill` 的取值未变。**
>
> 面板内嵌套元件按 **内圆角 = 外圆角 −（间距 + 描边）** 推导（Apple WWDC25 称之为
> concentricity）：两圈弧线不同心时，缝隙会忽宽忽窄。当间距大于外圆角时公式给出 0 或负数 ——
> 此时公式只是**下限而非成品**（间距大时它必然失效），内圆角取一个克制的小档、由眼睛定，
> 不要机械照抄负数。
>
> **触达尺寸分三档，取决于输入方式，而不是视觉密度。**
>
> - **默认 `44px`**：独立的按钮 / 输入框 / 图标按钮（顶栏语言钮、页面按钮等），以及**触屏与抽屉
>   场景**（含 `≤1023px` 收成抽屉的侧栏、移动端）—— 这是 WCAG 2.5.8 的 24px 与移动端 44px 取严者的结果。
> - **密集行与密集行内的控件可降至 `24px`**：这是**唯一的收窄例外**，覆盖两种排布 ——
>   **纵向**（列表 / 树行，本仓取 `28px`）与**横向**（tab 条及其行内控件，本仓 tab 与 ＋ / 菜单钮取
>   `32px`、tab 上的关闭钮取 `24px`）。例外必须**同时**满足
>   ① **整行为命中区**（纵向行：不是只有文字可点）；② **相邻目标不重叠** —— 判据采用 WCAG 2.5.8 的
>   间距替代方案：在相邻两个目标各自中心画一个 **24px 直径**的圆，两圆**不相交**即为达标。
>
> **判据在两种排布下的表现不同，务必分清**：
> - **纵向密集行**：圆心距 = 行距。行距 `28px` 时 28 > 24，成立（余量 4px）；行距降到 `24px` 则两圆相交、不达标。
> - **横向密集行（tab 条及其行内控件）**：**该判据天然成立** —— 相邻目标中心距 = 各自一半宽之和 + 间隙，
>   远大于 24px（本仓 tab 宽 ≥157px、行内控件宽 32px，中心距最小也有 ~44px）。
>
> 因此边界有两种，**不要混用**：
> - 「侧栏在 `≤1023px` 收成抽屉时回到 `44px`」**只针对纵向密集行** —— 手指的**纵向**落点精度低，
>   相邻行会互相误触，触屏语境下这一档不放宽。
> - **横向密集行（tab 条）任何宽度都保持 `32px`**，不按断点机械抬回 `44px`：它的目标又宽又高
>   （≥157×32），竖排才有的「纵向误触」问题在这里不存在，间距判据也天然满足。
>
> 例外**只适用于密集行与密集行内的控件**，不适用于独立控件；实物、判据可视化与 do / don't 见
> 展示页「触达尺寸」区块。

---

## ⑦ 层级与阴影

**层级以发丝描边为主，阴影只用于真正需要抬起的浮层。** 两者不叠加使用。

| Token | 值 |
| --- | --- |
| `--dl-shadow-xs` | `0 1px 2px rgba(52, 43, 33, 0.05)` |
| `--dl-shadow-md` | `0 2px 8px rgba(52, 43, 33, 0.07)` |
| `--dl-shadow-lg` | `0 8px 24px rgba(52, 43, 33, 0.1)` |

深色下阴影不承担层级，取值进一步减弱。

**层序阶梯**（禁止就地写 `9999`）:

| Token | 值 | 用途 |
| --- | --- | --- |
| `--dl-z-base` | `0` | 正常内容 |
| `--dl-z-sticky` | `100` | 吸顶工具栏 |
| `--dl-z-overlay` | `200` | 下拉 / 气泡 / 遮罩 |
| `--dl-z-modal` | `300` | 对话框 / 抽屉 |
| `--dl-z-toast` | `400` | 全局通知 |

---

## ⑧ 动效

| Token | 值 | 用途 |
| --- | --- | --- |
| `--dl-duration-fast` | `140ms` | hover / 焦点反馈 |
| `--dl-duration-base` | `200ms` | 展开 / 切换 |
| `--dl-duration-slow` | `280ms` | 浮层进出 |
| `--dl-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 全站统一缓动 |

**可动效属性白名单**:只允许 `transform` 与 `opacity`。禁止对 `width` / `height` / `top` / `left` / `margin` 等触发布局的属性做过渡。

**降级**:全局已有 `prefers-reduced-motion: reduce` 处理，状态切换仍然发生，位移与缩放去掉。用极短时长（0.01ms）而非 0——部分浏览器对 `duration: 0` 不触发 `transitionend`。

---

## ⑨ Web / Vue 落地

落地分**两层**，取值同源:

1. **CSS 变量层**（`src/style.css`）管自绘样式。三层结构照搬本文件第 ③ 节。
2. **Naive UI `themeOverrides` 层**（`src/theme.ts`）管组件库。

### 语义 token → Naive UI 键

| 设计 token | Naive 键 |
| --- | --- |
| `--dl-accent` / `-hover` / `-active` | `common.primaryColor` / `primaryColorHover` / `primaryColorPressed` |
| `--dl-success` / `warning` / `error` / `info` | `common.successColor` / `warningColor` / `errorColor` / `infoColor` |
| `--dl-bg-base` / `--dl-bg-elevated` | `common.bodyColor` / `cardColor` |
| `--dl-border-base` | `common.borderColor` / `dividerColor` |
| `--dl-text-primary` / `-secondary` / `-tertiary` / `-disabled` | `common.textColor1` / `textColor2` / `textColor3` / `textColorDisabled` |
| `--dl-radius-md` | `common.borderRadius` |
| `--dl-font-size-md` | `common.fontSize` |
| `--dl-weight-strong` | `common.fontWeightStrong` |
| `--dl-control-height` | `Button.height*` / `Input.height*` |

映射函数不含设计判断，只做搬运。

### 嵌套 ConfigProvider

`n-config-provider` 支持嵌套，`themeOverrides` 与父级**深合并**；子级 `theme` 传 `undefined` 继承父级、传 `null` 会**清空**主题。因此需要"不覆盖主题"时应**完全不传该 prop**（用 `v-bind` 条件绑定），而不是传 `undefined` 或 `null`。

### 组件配方

每个组件、每个状态该引用哪个 token。**缺了这张表，实现者只能猜。**

| 组件 | 默认 | hover | 禁用 |
| --- | --- | --- | --- |
| 主按钮 | `bg --dl-accent` / 文字 `--dl-text-on-accent` | `bg --dl-accent-hover` | `bg --dl-bg-sunken` / 文字 `--dl-text-disabled` |
| 次按钮 | `bg --dl-bg-elevated` / 描边 `--dl-border-base` | `bg --dl-bg-hover` | 文字 `--dl-text-disabled` |
| 输入框 | `bg --dl-bg-elevated` / 描边 `--dl-border-base` | 描边 `--dl-border-strong` | `bg --dl-bg-sunken` / 文字 `--dl-text-disabled` |
| 卡片 | `bg --dl-bg-elevated` / 阴影 `--dl-shadow-md` | 描边 `--dl-border-strong` | —(卡片本身不可禁用) |
| 标签 / 徽标 | `bg --dl-accent` / 文字 `--dl-text-on-accent` | `bg --dl-accent-hover` | `bg --dl-bg-sunken` |

**四态与交互态**(与共享基线 ⑥ 节一致):异步视图必有 loading / empty / error / 有数据;可交互元素必有 hover / focus / active / disabled。

---

## ⑩ Flutter 落地

取值与第 ④–⑧ 节完全相同，落地方式不同:

- 集中定义在 `lib/theme/` 的 `ThemeData` / `ThemeExtension`，**禁止在 widget 内 hardcode 颜色、字号、间距**；
- 深浅两套主题都要提供，深色同样走"反转中性 ramp + 提亮强调色"；
- 字重同样封顶 `w600`；
- 行高按 `height` 传递，正文取 `1.7`；
- 中文排版的避头尾与中西文间距由 Flutter 文本引擎处理，**不要自己插空格**；
- 图标描边不随尺寸缩放。

> 各端额外的平台语义见 [`baseline-mobile.md`](./baseline-mobile.md)。

---

## ⑪ 图标

| Token | 值 | 用途 |
| --- | --- | --- |
| `--dl-icon-sm` | `16px` | 行内 / 表格 |
| `--dl-icon-md` | `20px` | 按钮 / 工具栏 |
| `--dl-icon-lg` | `24px` | 独立操作 / 空态 |
| `--dl-icon-stroke` | `1.5px` | 统一描边宽度 |

**描边宽度不随尺寸缩放**——否则小图标会显得比大图标更重。图标按钮**必须带 `aria-label`**，不能只靠图形传达含义。

---

## ⑫ 禁用值与反模式

命中任何一项即判 fail。

| 反模式 | 说明 |
| --- | --- |
| 纯灰中性 | 用 `#808080` 这类无彩色偏移的灰，界面立刻变冷 |
| 纯黑正文 | `#000` 压 `#fff`，对比过硬，长文阅读刺眼 |
| 行高 < 1.5 | 中文尤其挤；且违反 WCAG 1.4.12 的容忍度要求 |
| 用 `ch` 定中文行宽 | `ch` 是西文单位，中文行会被拉到过长 |
| 字重 700+ | 破坏克制感 |
| 两端对齐 | 中文会产生字间"河流" |
| magic number | 组件内散落 `#fff`、`12px`、`8px` 等硬编码视觉值 |
| 跳过语义层 | 组件直接引用 `--dl-accent-600` 这类 ramp 阶 |
| 就地写 z-index | `z-index: 9999`，使"谁压谁"不可推理 |
| 叠加多种层级机制 | 边框 + 阴影 + 渐变同时上，层级反而消失 |
| AI slop 配色 | 高饱和撞色、霓虹渐变滥用、无主次 |
| 只做"有数据"一态 | 缺 loading / empty / error |
| 无反馈 | hover / focus / disabled 无任何视觉变化 |
| 假交互 | 按钮不可点、链接无跳转、表单提交无反应 |
| 手写类型 | 绕过契约生成物，自行重复定义数据结构 |

---

## ⑬ 视觉参照

规范不重复像素描述，**视觉判断以展示页为准**:

```bash
cd protos/design-language && make run
```

展示页覆盖:语言总览、材质样张、**排版调教台**(每个要素的候选值与取舍依据)、色板 ramp、语义角色层、字体阶、间距 / 圆角 / 阴影 / 动效、组件样板、交互态矩阵、异步四态、深浅主题并排、补充规范(图标 / 截断 / 层级 / 组件配方)、do / don't 反例。

> 展示页是**单向派生**:方向只有 rules → 页面。改设计语言的唯一入口是先改本文件，再同步展示页的 `src/style.css` 与 `src/theme/directions.ts`。

---

## ⑭ 无障碍底线

| 项 | 要求 |
| --- | --- |
| 对比度 | 正文与背景 ≥ 4.5:1（大字 / 装饰 ≥ 3:1）。**由校准装置逐对断言** |
| 行高 | ≥ 1.5×（本语言取 1.7） |
| 触达尺寸 | 指针目标 ≥ 44×44px |
| 焦点可见 | 所有交互元素有 `:focus-visible`，用 `--dl-focus-ring` |
| 动效降级 | 尊重 `prefers-reduced-motion` |
| 文本缩放 | 200% 缩放下不破版；间距被用户调大时不裁切、不重叠 |
| 语义化 | 用 `button` / `a` / `nav` / `main` 与正确标题层级；图标按钮带 `aria-label` |

---

## ⑮ 变更流程

```text
要改设计语言
  → 先在展示页上改 token 值与候选对比(protos/design-language/)
  → 在展示页上确认效果(多宽度 + 深浅两套)
  → 回写本文件(取值 + 依据)
  → 同步共享基线 ② 节的速查表
  → 重跑 make calibrate(含对比度断言)与展示页的视觉确认
```

**禁止**绕过展示页直接改本文件的取值——没有实物核对过的数值等于没验证。
