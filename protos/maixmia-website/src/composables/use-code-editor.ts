// 源码态的编辑器:把一份可编辑的文本绑到 CodeMirror 6 的 EditorView 上。
//
// 选型依据(调研结论):CodeMirror 6 模块化(约 50–200kB)、a11y 扎实、窄屏可用;Monaco 约 5MB、
// 不支持移动端、主题难改。Replit / Sourcegraph / Livebook / dart-pad 都从 Monaco 迁到了 CodeMirror。
// 更关键的是它**自带 Lezer 语法**,高亮与编辑是同一套库 —— 不必再引一个只读高亮器。
//
// 不启用 `indentWithTab`:Tab 在编辑器里若变成「插入缩进」,键盘用户就无法用 Tab 离开编辑器
// (焦点陷阱)。CodeMirror 的 basicSetup 同样默认不含它。
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Compartment, EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { onBeforeUnmount, watch } from 'vue'
import type { Ref } from 'vue'
import { codeHighlighting, languageExtension } from '../data/file-language'

export interface CodeEditorOptions {
  // 编辑器挂载点(模板 ref)。为 null 表示当前不该有编辑器(切到别的视图)——此时销毁。
  host: Ref<HTMLElement | null>
  // 当前文本(初次挂载时的内容)。
  getText: () => string
  // 语言判定的两个输入:契约下发的 language 与文件路径。
  getLanguage: () => string
  getPath: () => string
  // 「自动换行」开关(与「变更」视图共用同一枚按钮)。
  getWrap: () => boolean
  // 文档变化(编辑)时回调 —— 由调用方写回它持有的那份内存内容。
  onChange: (value: string) => void
}

// 编辑器外观:一律引用语义角色 token(与面板其余部分同源),深浅两套跟着 token 自动切换。
// 高度撑满容器,由 .cm-scroller 自己滚 —— 面板其它视图则用面板内容区滚动。
const EDITOR_THEME = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--dl-font-size-sm)',
    fontFamily: 'var(--dl-font-mono)',
    backgroundColor: 'var(--dl-bg-base)',
    color: 'var(--dl-text-primary)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'var(--dl-line-snug)' },
  '.cm-content': { paddingBlock: 'var(--dl-space-2)', caretColor: 'var(--dl-accent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--dl-bg-base)',
    color: 'var(--dl-text-tertiary)',
    border: 'none',
    fontFamily: 'inherit',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingInline: 'var(--dl-space-2) var(--dl-space-3)' },
  '.cm-activeLine': { backgroundColor: 'var(--dl-bg-hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--dl-text-secondary)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--dl-accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--dl-accent-soft)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--dl-bg-sunken)',
    border: 'none',
    color: 'var(--dl-text-secondary)',
  },
})

export function useCodeEditor(options: CodeEditorOptions): { focus: () => void } {
  const languageCompartment = new Compartment()
  const wrapCompartment = new Compartment()
  let view: EditorView | null = null

  // 初始扩展:语言与「自动换行」都装进各自的 Compartment,之后只重配置、不重建编辑器。
  function initialExtensions(): Extension[] {
    const language = languageExtension(options.getLanguage(), options.getPath())
    return [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      foldGutter(),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
      languageCompartment.of(language ?? []),
      wrapCompartment.of(options.getWrap() ? EditorView.lineWrapping : []),
      codeHighlighting(),
      EDITOR_THEME,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString())
      }),
    ]
  }

  function destroy(): void {
    view?.destroy()
    view = null
  }

  function create(host: HTMLElement): void {
    view = new EditorView({
      state: EditorState.create({ doc: options.getText(), extensions: initialExtensions() }),
      parent: host,
    })
  }

  // 挂载点出现 / 消失即创建 / 销毁(切视图、切文件都由这一条覆盖)。
  watch(options.host, (host) => {
    destroy()
    if (host !== null) create(host)
  }, { flush: 'post' })

  // 换文件(同一个面板实例指向了另一个路径)时只换语言,不重建编辑器。
  watch(() => options.getPath(), () => {
    const language = languageExtension(options.getLanguage(), options.getPath())
    view?.dispatch({ effects: languageCompartment.reconfigure(language ?? []) })
  })

  // 「自动换行」开关:重配置一行,不动文档。
  watch(() => options.getWrap(), (wrap) => {
    view?.dispatch({ effects: wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : []) })
  })

  onBeforeUnmount(destroy)

  return {
    focus: () => view?.focus(),
  }
}
