// JSON 的结构化视图模型:把一份 JSON 文本建成**一棵只读的节点树**,并派生出两种呈现所需的
// 数据 —— 折叠树(按展开集摊平)与表格(根为对象数组时的等价行视图)。**不引任何依赖**。
//
// 为什么先建树、而不是在模板里边解析边渲染:
//   · 折叠状态要能**跨渲染**保留(换视图 / 改展开集后仍认得「哪一枝是开着的」),故节点必须有
//     稳定 id;
//   · 「折叠的枝不渲染后代」是性能的关键(不折叠会把 DOM 撑爆)—— 摊平/递归都以展开集为界,
//     折叠的枝下**一个后代节点都不会被创建**;
//   · 全展开需要「所有容器节点的 id」,这也只有先把树建出来才拿得到。
//
// 只读:这里只解析与取数,不改写内容;要改走「源码」档。JSON.parse 产出的值直接作为
// 节点上的 `value` 引用挂住(不复制),表格视图要用它做紧凑序列化,树视图则不碰。

// 默认展开层数:**深层默认折叠**是大文件不卡的另一半(另一半是「折叠的枝不渲染后代」)。
// 语义:深度 < 本值的容器默认展开 —— 根(深度 0)与它的一层子容器展开,于是默认能看到
// 第 1~3 层(根 / 其子 / 其孙),再往下的结构收起来。
export const JSON_DEFAULT_EXPAND_DEPTH = 2

export type JsonNodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export interface JsonTreeNode {
  // 稳定 id:根为 '$',子节点为 `<父 id>.<序号>`(序号而不是键名 —— 键名里可能有点号等
  // 与 id 语法冲突的字符,用序号可保证唯一。id 只作内部标识,不展示)。
  id: string
  // 展示用的键:对象的属性名,或数组下标 `[0]`;根节点为空串(不渲染键)。
  key: string
  kind: JsonNodeKind
  // 深度:根为 0。
  depth: number
  // 容器的子节点数(标量为 0);折叠时用来显示计数。
  size: number
  // 标量的展示文本(string 带引号且已转义,number / boolean / null 取字面量);容器为空串。
  literal: string
  isContainer: boolean
  children: JsonTreeNode[]
  // 原始值(JSON.parse 的产物)。只被表格视图的紧凑序列化使用。
  value: unknown
}

export type JsonParseResult = { ok: true; root: JsonTreeNode } | { ok: false; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 标量的展示文本。字符串用 JSON.stringify 取**带引号且已转义**的写法 —— 它同时解决了三件事:
// 与「数字 / 布尔」在字形上区分开、特殊字符不破坏阅读、以及不需要自己写转义表。
function literalOf(value: string | number | boolean | null): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null) return 'null'
  return String(value)
}

function buildNode(id: string, key: string, depth: number, value: unknown): JsonTreeNode {
  if (value === null) {
    return { id, key, kind: 'null', depth, size: 0, literal: 'null', isContainer: false, children: [], value }
  }
  if (Array.isArray(value)) {
    const children = value.map((item, index) => buildNode(`${id}.${index}`, `[${index}]`, depth + 1, item))
    return { id, key, kind: 'array', depth, size: children.length, literal: '', isContainer: true, children, value }
  }
  if (isRecord(value)) {
    // Object.keys 的顺序即插入顺序(JSON.parse 保留文本里的键序),表格列因此「按首次出现顺序」。
    const children = Object.keys(value).map((name, index) => buildNode(`${id}.${index}`, name, depth + 1, value[name]))
    return { id, key, kind: 'object', depth, size: children.length, literal: '', isContainer: true, children, value }
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return { id, key, kind: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string', depth, size: 0, literal: literalOf(value), isContainer: false, children: [], value }
  }
  // JSON.parse 不会产出 undefined / function / symbol,故这里到不了;留一条兜底而不是抛错。
  return { id, key, kind: 'null', depth, size: 0, literal: 'null', isContainer: false, children: [], value: null }
}

// 解析一份 JSON 文本。失败时把 JSON.parse 的原始信息原样带出(它比任何自造文案都准),
// 由组件包成一行可读的错误 + 一句指路,不白屏、不静默。
export function parseJsonDocument(source: string): JsonParseResult {
  if (source.trim() === '') return { ok: false, message: 'Unexpected end of JSON input' }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    // catch 里的 error 是 unknown,收窄后才用;非 Error 时给一句兜底。
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
  return { ok: true, root: buildNode('$', '', 0, parsed) }
}

// 全部容器节点的 id(供「全展开」)。
export function collectContainerIds(root: JsonTreeNode): string[] {
  const ids: string[] = []
  const walk = (node: JsonTreeNode): void => {
    if (!node.isContainer) return
    ids.push(node.id)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return ids
}

// 默认展开集:深度 < JSON_DEFAULT_EXPAND_DEPTH 的容器(其下的枝整段不参与,省一次遍历)。
export function defaultExpandedIds(root: JsonTreeNode): Set<string> {
  const ids = new Set<string>()
  const walk = (node: JsonTreeNode): void => {
    if (!node.isContainer || node.depth >= JSON_DEFAULT_EXPAND_DEPTH) return
    ids.add(node.id)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return ids
}

// ---- 表格视图 ----

export interface JsonTableCell {
  // 单元格展示文本:标量用它的字面量写法,嵌套值用**紧凑 JSON 字符串**(长的由样式截断)。
  text: string
  // 是否来自嵌套值(对象 / 数组)—— 这类单元格带上完整文本的 title,截断后仍可悬停读到全文。
  nested: boolean
}

export interface JsonTableRow {
  id: string
  cells: JsonTableCell[]
}

export interface JsonTable {
  // 各对象键的并集,按**首次出现顺序**(元素顺序 × 键顺序)。
  columns: string[]
  rows: JsonTableRow[]
}

// 单元格文本:嵌套值走紧凑 JSON(截断由样式做,不在数据层切,故 title 能给出全文)。
function cellOf(node: JsonTreeNode | undefined): JsonTableCell {
  if (node === undefined) return { text: '', nested: false }
  if (node.isContainer) {
    // JSON.parse 的产物不可能有循环引用,序列化必然成功。
    return { text: JSON.stringify(node.value) ?? '', nested: true }
  }
  return { text: node.literal, nested: false }
}

// 表格模式的前提:根节点是**非空的对象数组**(所有元素都是对象)。
// 不满足时返回 null —— 组件据此决定「不渲那一枚表格按钮」,而不是渲一个点了没反应的死控件。
export function jsonTableOf(root: JsonTreeNode): JsonTable | null {
  if (root.kind !== 'array' || root.children.length === 0) return null
  if (!root.children.every((child) => child.kind === 'object')) return null

  const columns: string[] = []
  const seen = new Set<string>()
  for (const element of root.children) {
    for (const field of element.children) {
      if (seen.has(field.key)) continue
      seen.add(field.key)
      columns.push(field.key)
    }
  }

  const rows: JsonTableRow[] = root.children.map((element) => {
    const byKey = new Map(element.children.map((field) => [field.key, field]))
    return { id: element.id, cells: columns.map((column) => cellOf(byKey.get(column))) }
  })

  return { columns, rows }
}
