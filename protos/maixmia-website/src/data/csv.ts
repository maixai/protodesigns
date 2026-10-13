// CSV / TSV 的结构化解析:把一份分隔符文本解析成「表头 + 数据行」的表格模型,供只读的
// 表格预览渲染。**不引任何依赖** —— 这里手写一个最小的 RFC 4180 解析器。
//
// 为什么手写而不是引 papaparse / csv-parse:
//   · 需要的只是「读」:引号包裹、`""` 转义、CRLF、逗号 / 制表符这四件事,规格小且封闭;
//   · 多一个依赖就多一份解析器与供应链面(本仓的既定取向:能自持的不引依赖,见 contracts.md);
//   · 解析结果要按列做对齐判定与行数截断,这些是本原型自己的口径,库也替不了。
//
// 口径(调研结论,GitHub 的 CSV 渲染):
//   · **首行即表头** —— GitHub 默认把第一行当表头,本原型跟随(不做「无表头」的猜测);
//   · **行数上限**:上限的存在意义是「让 DOM 与解析时间有界」。GitHub 的同类阈值是**渲染
//     预算 512KB**(超过就不渲染),按每行约 40 字节估算约合 1.2 万行 —— 那是给服务端渲染
//     用的;本原型在浏览器里逐格渲染、还要参与 L1 冒烟的破版检测,故取一个保守得多的行数
//     上限(见 MAX_CSV_ROWS),并把「只显前 N 行」明写在表下,而不是静默截断;
//   · **列数不齐照渲**:不白屏。按**最大列数**补齐空单元格(见 normalize)——
//     真实导出的表常有一两行尾随分隔符,那不该让整张表打不开。
//
// 只读:解析结果只用于「看」;要改内容走「源码」档(与业界一致 —— 表格预览一律只读)。

// 行数上限(超出只渲染前 N 行,并在表下说明)。
// 取值理由:① 保证 DOM 有界 —— 每行 × 列数会各出一个单元格,1000 行以上的表在窄面板里
// 也会明显拖慢;② 保证解析时间有界 —— 解析在 source 变化时重跑;③ 仍要「像个真表」——
// 真实的导出表轻易就过 300 行,故这个上限在演示里能被真实触发(而不是形同虚设),
// 恰好用来验证那条降级说明确实会出现。
const MAX_CSV_ROWS = 300

// 列对齐:数值列右对齐、文本列左对齐(表格 UX 通则)。
// 判定按**列**而不是按单元格 —— 同一列忽左忽右是明确的排印反模式(列的对齐边要一致,
// 才谈得上「用小数点对齐」)。
export type ColumnAlign = 'start' | 'end'

export interface CsvTable {
  // 已补齐到 columnCount 的表头(缺列时是空串,不丢列)。
  headers: string[]
  // 已补齐到 columnCount 的数据行(仅含**被渲染的**那些行,最多 MAX_CSV_ROWS 行)。
  rows: string[][]
  // 表头与数据行里的最大列数(空表为 0)。
  columnCount: number
  // 每一列的对齐方式(下标与列号对应)。
  aligns: ColumnAlign[]
  // 是否因超过行数上限而截断。
  truncated: boolean
  // 数据行总数(未截断时与 rows.length 相等)。
  totalRows: number
}

// 空表(源为空 / 只有分隔符行)。
const EMPTY_TABLE: CsvTable = { headers: [], rows: [], columnCount: 0, aligns: [], truncated: false, totalRows: 0 }

// 取第 i 个字符。用 charAt 而不是下标访问:后者在 noUncheckedIndexedAccess 下是
// `string | undefined`,越界分支会洒满每一行;charAt 越界返回空串,语义正好是「没有更多字符」。
function charAt(text: string, index: number): string {
  return text.charAt(index)
}

// 数出某字符在文本里的出现次数(用于探测定界符)。
function countChar(text: string, char: string): number {
  let count = 0
  for (let index = 0; index < text.length; index += 1) {
    if (charAt(text, index) === char) count += 1
  }
  return count
}

// 探测定界符:看**首行**里逗号与制表符谁更多,平手按逗号。
// 依据:GitHub 按扩展名分派(.csv → 逗号,.tsv → 制表符),但那要求先有一份扩展名映射;
// 本原型只有 csv 这一个 kind,故改看首行内容 —— 表头行的分隔符必然最多,判得准且不必再维护映射。
// 逗号优先的兜底是刻意的:带逗号的行(如 `a,b`)远比带制表符的多,误判时的代价最小。
function detectDelimiter(text: string): string {
  const lineEnd = text.search(/[\r\n]/)
  const firstLine = lineEnd < 0 ? text : text.slice(0, lineEnd)
  return countChar(firstLine, '\t') > countChar(firstLine, ',') ? '\t' : ','
}

// 最小 RFC 4180 解析器:引号包裹、`""` 转义、CRLF / LF / 裸 CR 三种行尾、可配定界符。
// 返回原始的行 × 列二维数组(不补列、不截断,这些交给上层)。
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let index = 0

  const endRow = (): void => {
    row.push(field)
    rows.push(row)
    row = []
    field = ''
  }

  while (index < text.length) {
    const char = charAt(text, index)

    if (inQuotes) {
      if (char === '"') {
        // `""` 是转义后的一个引号,不是闭合。
        if (charAt(text, index + 1) === '"') {
          field += '"'
          index += 2
          continue
        }
        inQuotes = false
        index += 1
        continue
      }
      // 引号内的一切都是字面量 —— 内含的换行与定界符都不结束字段。
      field += char
      index += 1
      continue
    }

    // 只在**字段开头**出现的引号才进入引号态(字段中间的引号按字面量处理,不吞后续内容)。
    if (char === '"' && field === '') {
      inQuotes = true
      index += 1
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      index += 1
      continue
    }
    if (char === '\r') {
      endRow()
      index += 1
      // CRLF 的 LF 一并吞掉,否则末尾会多出一个空行。
      if (charAt(text, index) === '\n') index += 1
      continue
    }
    if (char === '\n') {
      endRow()
      index += 1
      continue
    }

    field += char
    index += 1
  }

  // 收尾:有残留内容才补最后一行(避免末尾换行凭空多出一行空行)。
  if (field !== '' || row.length > 0) endRow()
  return rows
}

// 补齐 / 截齐到 width 列(缺的补空串)。
function normalize(row: readonly string[], width: number): string[] {
  const out = row.slice(0, width)
  while (out.length < width) out.push('')
  return out
}

// 单元格是否是数值。判定要**宽容到真实报表的写法**,但仍要能区分「文本列」:
// 允许正负号、小数、以及 CSV 里常见的千分位(`1,234.5`,只有被引号包裹时才会落在同一个单元格里);
// 刻意**不**认货币符号 / 百分号 —— 它们更常出现在文本列里,认了会把文本列误判成数值列。
const NUMERIC_PATTERN = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/

function isNumericCell(text: string): boolean {
  return NUMERIC_PATTERN.test(text.trim())
}

// 按**列**判定对齐:该列非空单元格里数字占多数 → 右对齐,否则左对齐。
// 少数派(如某列的「合计」行或空值)跟随该列的多数,不再逐格判 —— 见文件头对 ColumnAlign 的说明。
function columnAlign(cells: readonly string[]): ColumnAlign {
  let filled = 0
  let numeric = 0
  for (const cell of cells) {
    const text = cell.trim()
    if (text === '') continue
    filled += 1
    if (isNumericCell(text)) numeric += 1
  }
  if (filled === 0) return 'start'
  return numeric * 2 > filled ? 'end' : 'start'
}

// 解析一份 CSV / TSV 文本为表格模型。空输入返回空表(由组件给出空态文案,不白屏)。
export function parseTable(source: string): CsvTable {
  const raw = parseDelimited(source, detectDelimiter(source))
  const headerRow = raw[0]
  if (headerRow === undefined) return EMPTY_TABLE

  const dataRows = raw.slice(1)
  // 最大列数:表头与**全部**数据行取最大(GitHub 同向 —— 列数不齐不能让表打不开)。
  let columnCount = headerRow.length
  for (const row of dataRows) {
    if (row.length > columnCount) columnCount = row.length
  }
  if (columnCount === 0) return EMPTY_TABLE

  const truncated = dataRows.length > MAX_CSV_ROWS
  const visible = truncated ? dataRows.slice(0, MAX_CSV_ROWS) : dataRows
  const rows = visible.map((row) => normalize(row, columnCount))

  const aligns: ColumnAlign[] = []
  for (let column = 0; column < columnCount; column += 1) {
    aligns.push(columnAlign(rows.map((row) => row[column] ?? '')))
  }

  return { headers: normalize(headerRow, columnCount), rows, columnCount, aligns, truncated, totalRows: dataRows.length }
}
