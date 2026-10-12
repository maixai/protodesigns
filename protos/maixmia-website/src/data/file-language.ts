// 源码态的语言装配:把一份文件的 language / 扩展名映射到 CodeMirror 6 的语言扩展。
//
// 为什么是 CodeMirror 6(调研结论,见 file-panel.vue 的注释):它模块化、a11y 扎实、窄屏可用,
// 且**高亮与编辑是同一套库** —— 不必像 shiki / highlight.js 那样再引一个只读高亮器。
//
// 语言覆盖:
//   · 常见 web / 数据类走官方 lang-* 包(自带 Lezer 解析器);
//   · bash / shell **没有**官方 lang 包,走 @codemirror/legacy-modes 的 StreamLanguage 适配
//     —— 这正是 legacy-modes 存在的意义。
//
// 关于 apache:任务给的调研结论说 legacy-modes 含 apacheconf,但实测 @codemirror/legacy-modes
// 6.5.5 收录的 103 个模式里**没有** apacheconf(它是 CodeMirror 5 的模式,未被移植)。
// 故这里用同一套 StreamLanguage 接口写一个最小的 apache 配置语法 —— 仍然只用允许的依赖,
// 且高亮结果与其它语言走同一条通道。
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import type { StreamParser } from '@codemirror/language'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

// ---- apache 配置的最小高亮 ----
// 语法极简单:行注释 `#…`、区块标签 `<VirtualHost *:443>`、指令名、字符串、`${VAR}` 变量。
// 只做「读起来分层」这一点事 —— 原型不做语义校验。
interface ApacheConfState {
  // 是否正处在一个尚未闭合的区块标签里(标签可能跨行尾)。
  inTag: boolean
}

const apacheConf: StreamParser<ApacheConfState> = {
  startState: () => ({ inTag: false }),
  token(stream, state) {
    if (stream.sol()) state.inTag = false
    if (stream.eatSpace()) return null
    if (stream.match(/^#.*/)) return 'comment'
    if (state.inTag) {
      if (stream.match('>')) state.inTag = false
      else stream.next()
      return 'tag'
    }
    if (stream.match(/^<\/?[A-Za-z][\w-]*/)) {
      state.inTag = true
      return 'tag'
    }
    if (stream.match(/^\$\{[^}]*\}/)) return 'variable-2'
    if (stream.match(/^"[^"]*"/)) return 'string'
    if (stream.match(/^-?\d+(\.\d+)?/)) return 'number'
    if (stream.match(/^[A-Za-z][\w-]*/)) return 'keyword'
    stream.next()
    return null
  },
}

const SHELL_LANGUAGES = new Set(['shell', 'bash', 'sh', 'zsh', 'shellscript'])
const APACHE_LANGUAGES = new Set(['apacheconf', 'apache', 'conf'])
const TYPESCRIPT_LANGUAGES = new Set(['typescript', 'ts'])
const JAVASCRIPT_LANGUAGES = new Set(['javascript', 'js', 'jsx'])
const PYTHON_LANGUAGES = new Set(['python', 'py'])

// 按扩展名兜底(契约里的 language 由下发的数据给出;它缺失或未知时按路径末段再判一次)。
function extensionOf(path: string): string {
  const name = path.split('/').at(-1) ?? path
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

// 语言扩展;未知类型返回 null = 纯文本(不报错,也不假装认识它)。
export function languageExtension(language: string, path: string): Extension | null {
  const key = language.toLowerCase()
  const ext = extensionOf(path)
  const has = (...candidates: string[]): boolean => candidates.some((candidate) => candidate === key || candidate === ext)
  if (SHELL_LANGUAGES.has(key) || has('sh', 'bash', 'zsh')) return StreamLanguage.define(shell)
  if (APACHE_LANGUAGES.has(key) || has('conf')) return StreamLanguage.define(apacheConf)
  if (key === 'markdown' || has('md', 'markdown')) return markdown()
  if (key === 'html' || has('html', 'htm')) return html()
  if (key === 'css' || has('css')) return css()
  if (TYPESCRIPT_LANGUAGES.has(key) || has('ts', 'tsx')) return javascript({ typescript: true, jsx: has('tsx') })
  if (JAVASCRIPT_LANGUAGES.has(key) || has('js', 'jsx', 'mjs')) return javascript({ jsx: true })
  if (key === 'json' || has('json')) return json()
  if (PYTHON_LANGUAGES.has(key) || has('py')) return python()
  return null
}

// ---- 高亮样式 ----
// 用 `class` 而不是内联颜色:一是深浅两套主题都靠 CSS 变量解析(同一份样式跟着 token 走),
// 二是产出的 class 是**可断言的**(校准测试据此判定「确实高亮了」),CM 自带样式的类名是
// 内部生成的,断言不了也没法主题化。
export const CODE_HIGHLIGHT = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.definitionKeyword], class: 'cm-dl-keyword' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'cm-dl-string' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'cm-dl-comment' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: 'cm-dl-number' },
  { tag: [tags.variableName, tags.self, tags.labelName], class: 'cm-dl-variable' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.tagName], class: 'cm-dl-type' },
  { tag: [tags.propertyName, tags.attributeName], class: 'cm-dl-property' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], class: 'cm-dl-operator' },
  { tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3], class: 'cm-dl-heading' },
  { tag: [tags.link, tags.url], class: 'cm-dl-link' },
  { tag: tags.emphasis, class: 'cm-dl-emphasis' },
  { tag: tags.strong, class: 'cm-dl-strong' },
])

// 语法高亮扩展(与语言扩展并列交给编辑器)。
export function codeHighlighting(): Extension {
  return syntaxHighlighting(CODE_HIGHLIGHT)
}
