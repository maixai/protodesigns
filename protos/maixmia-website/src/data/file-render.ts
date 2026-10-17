// 预览态的管线:Markdown → 清洗 → 注入 DOM,以及 mermaid 图的按需渲染。
//
// 安全模型(每一层都要写清,评审据此核对):
//   ① markdown-it **默认禁用原始 HTML**(`html: false` 是它的安全默认)—— Markdown 正文里的
//      `<script>` / `<img onerror>` 会被转义成文本,不会变成节点。这是第一层。
//   ② 渲染结果一律过 **DOMPurify** 再 v-html —— 这是第二层,兜住将来有人打开 `html: true`
//      或加插件带来的缺口(纵深防御,不做「反正上游安全就不清洗」的假设)。
//   ③ **mermaid 产出的 SVG 必须再清洗一遍**:它是真正的第三方 HTML,而 mermaid 近年有一长串
//      存储型 XSS CVE(GitLab / Docmost / OneUptime / Dify 都在它身上)。配置取
//      `securityLevel: 'strict'`(不是 'loose'),并**剥离 `%%{init}%%` 指令** —— 该指令能按图
//      覆盖安全配置,Docmost 的 CVE 正是从它进来的。渲染结果同样过 DOMPurify 才进 DOM。
//   ④ 图片 / HTML 不走这条管线:图片走 contentUrl(浏览器自己的解码器),HTML 走 sandbox iframe
//      (见 file-panel.vue),两者都不把不可信 HTML 注入本文档。
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'

// ---- Markdown ----
// html: false(安全默认)、linkify 打开以识别裸链接;不启用任何会引入原始 HTML 的插件。
const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false })

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

// 转义成文本节点用的最小集合(纯文本预览与「渲染失败的降级」都用它)。
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

// Markdown → **已清洗**的 HTML 片段。解析抛错时降级为等宽纯文本,绝不整面板白屏。
export function renderMarkdown(source: string): string {
  try {
    return DOMPurify.sanitize(markdown.render(source))
  } catch {
    return `<pre class="file-render__fallback">${escapeHtml(source)}</pre>`
  }
}

// ---- mermaid ----
// 按图覆盖安全配置的指令:`%%{init: ...}%%` / `%%{theme: ...}%%` 一律整段剥掉。
const MERMAID_DIRECTIVE = /%%\{[\s\S]*?\}%%/g

export function stripMermaidDirectives(definition: string): string {
  return definition.replace(MERMAID_DIRECTIVE, '').trim()
}

// 图表标签统一用 SVG text,不开放 foreignObject 的 HTML 集成点。
// 只保留安全 SVG 与滤镜,脚本和 on* 事件属性继续由 DOMPurify 清除。
const SVG_SANITIZE = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_ATTR: ['dominant-baseline'],
}

// mermaid 的类型(mermaid 未导出便于复用的公共别名,这里从模块本身取)。
type MermaidApi = (typeof import('mermaid'))['default']

// 从**当前作用域**读设计 token:mermaid 会把颜色内联进它生成的 SVG,读不到 CSS 变量,
// 故在初始化时把变量值**读出来交给它** —— 取值仍然只有一个来源(style.css 里的 token)。
function cssValue(scope: HTMLElement, token: string): string {
  return getComputedStyle(scope).getPropertyValue(token).trim()
}

// 颜色要**算出具体的 sRGB 值**再交给 mermaid:它自己的调色板解析器只认传统写法,而本仓的
// 深色档有 color-mix 派生的 token(`--dl-bg-sunken`),浏览器把它序列化成 `oklab(...)` ——
// 直接交过去会抛 `Unsupported color format`(实测)。
// 做法分两步:① 借一个临时元素把 token 走一遍真实的样式计算(挂进同一个作用域,变量才解析得到);
// ② 把算出来的颜色涂进 1×1 canvas 再读像素,得到与插值空间无关的 rgb()。
function toRgb(value: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')
  if (context === null) return value
  context.fillStyle = value
  context.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

function cssColor(scope: HTMLElement, token: string): string {
  if (cssValue(scope, token) === '') return ''
  const probe = document.createElement('span')
  probe.style.display = 'none'
  probe.style.color = `var(${token})`
  scope.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return toRgb(resolved)
}

function mermaidThemeVariables(scope: HTMLElement): Record<string, string> {
  const colors: readonly (readonly [string, string])[] = [
    ['background', '--dl-bg-base'],
    ['primaryColor', '--dl-bg-elevated'],
    ['primaryTextColor', '--dl-text-primary'],
    ['primaryBorderColor', '--dl-border-base'],
    ['secondaryColor', '--dl-bg-sunken'],
    ['tertiaryColor', '--dl-bg-base'],
    ['lineColor', '--dl-text-tertiary'],
  ]
  const variables: Record<string, string> = {}
  for (const [key, token] of colors) {
    const value = cssColor(scope, token)
    if (value !== '') variables[key] = value
  }
  const font = cssValue(scope, '--dl-font-sans')
  if (font !== '') variables['fontFamily'] = font
  return variables
}

// 临时渲染树给出的视盒可能没有覆盖最终 SVG 的节点位置。只在流程图越界时按已清洗、
// 已挂载的图形边界补正,避免「DOM 有文字、实际截图却截字」;留白仍从当前作用域的 token 读取。
function fitFlowchartViewport(figure: HTMLElement, scope: HTMLElement): void {
  const svg = figure.querySelector('svg.flowchart')
  if (!(svg instanceof SVGSVGElement)) return
  const bounds = svg.getBBox()
  const viewport = svg.viewBox.baseVal
  if (bounds.width <= 0 || bounds.height <= 0) return
  if (bounds.x >= viewport.x && bounds.y >= viewport.y
    && bounds.x + bounds.width <= viewport.x + viewport.width
    && bounds.y + bounds.height <= viewport.y + viewport.height) return
  const padding = Number.parseFloat(cssValue(scope, '--dl-space-2')) || 0
  const width = bounds.width + 2 * padding
  const height = bounds.height + 2 * padding
  svg.setAttribute('viewBox', `${bounds.x - padding} ${bounds.y - padding} ${width} ${height}`)
  svg.setAttribute('width', String(width))
}

// mermaid 体积约 1MB,**按需动态加载**:首屏不背它,只有真的渲染到图表时才拉这一块。
let mermaidPromise: Promise<MermaidApi> | null = null

function loadMermaid(scope: HTMLElement): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((mod) => {
    const api = mod.default
    // securityLevel 取 'strict'(不是 'loose');startOnLoad 关掉(我们自己在容器里就地替换)。
    // 根级 htmlLabels 同时约束节点与边标签,避免 HTML 标签盒被清洗后只剩空框。
    api.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'base', themeVariables: mermaidThemeVariables(scope) })
    // mermaid 默认把解析错误直接打到 console.error;冒烟检查把 console error 视为失败,
    // 且失败已被下面的 try/catch 变成「该块退化为代码块」的可见结果,不必再刷一遍日志。
    api.parseError = () => {}
    return api
  })
  return mermaidPromise
}

// 生成 mermaid 渲染用的临时 id。mermaid.render 需要调用方给一个唯一 id。
let renderSequence = 0

// 把容器里的 ```mermaid 代码块就地渲染成图。单块失败只影响那一块(退化为代码块 + 一行说明),
// 不抛给调用方、也不清空面板 —— 这是「渲染失败的降级」。
export async function enhanceMermaidDiagrams(container: HTMLElement, fallbackNote: string): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('pre > code.language-mermaid'))
  if (blocks.length === 0) return
  const scope = container.closest<HTMLElement>('.dl-scope') ?? document.documentElement
  let api: MermaidApi
  try {
    api = await loadMermaid(scope)
  } catch {
    // 动态加载失败(离线 / 块加载出错):保留代码块原样,不报错给用户。
    return
  }
  for (const code of blocks) {
    const pre = code.parentElement
    if (pre === null) continue
    const definition = stripMermaidDirectives(code.textContent ?? '')
    // 图容器先造出来(空盒无害);内容填装与替换留在下面的 try 里。
    const figure = document.createElement('div')
    figure.className = 'file-render__diagram'
    try {
      renderSequence += 1
      const { svg } = await api.render(`dl-mermaid-${renderSequence}`, definition)
      figure.innerHTML = DOMPurify.sanitize(svg, SVG_SANITIZE)
      pre.replaceWith(figure)
      // 这段 try 只覆盖「内容」:解析 / 渲染 / 清洗。一旦失败,降级说明还能挂回**仍在
      // 文档里**的 pre —— 若把下面的视盒补正也放进同一个 try,它一旦抛错,catch 就会把
      // 说明挂到已被替换掉的游离节点上,结果是「图在页面里、没有文字、也没有任何说明」,
      // 正是这类静默失败的形态。
    } catch {
      pre.classList.add('is-mermaid-failed')
      const note = document.createElement('p')
      note.className = 'file-render__fallback'
      note.textContent = fallbackNote
      pre.after(note)
      continue
    }
    // 视盒补正只影响几何、不碰内容,失败也不该降级成「无法渲染」:保留 mermaid 原生的
    // viewBox 即可 —— 图与文字都还在。getBBox() 要求元素已在文档里,故只能放在替换之后。
    try {
      fitFlowchartViewport(figure, scope)
    } catch {
      /* 保持原生视盒 */
    }
  }
}
