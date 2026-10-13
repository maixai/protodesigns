// 文件面板的 dummy 文件内容:贴近真实项目的文件正文 + 行级变更标记 + 词级高亮区间。
//
// 与项目树的关系:树给的是「这个文件被改过」(state 芯片),这里给的是「改成什么样」——
// 两者按同一个 path 对齐。内容一律**写实**(真实的 README / 工具函数 / CSV),不用 lorem。
//
// 三份事实各司其职,刻意不互相推导:
//   · **source** —— 文件**当前**的真实内容,预览态(markdown / HTML / 图片的呈现)与源码态
//     (编辑器)都读它。它**不是**从 lines 拼出来的:diff 模型里 removed 行留在原地,
//     按 lines 直接拼会把已删除的行当成现存内容(见 contracts/main.tsp 的注释)。
//   · **lines** —— 相对上一次改动的**行级视图**,只服务「变更」这一档。
//   · **kind / mime / contentUrl** —— 呈现类别与来源:kind 决定面板给哪几档(纯文本没有预览档),
//     contentUrl 只有 image 用(原型无后端,图片走 data URL)。
//
// 变更标记的语义:数组即「当前文件的展示顺序」——未变更行与改动行按原位交错,removed 行保留在
// 它原来的位置(因此在「整个文件」视图里也能看见被删掉的那行)。
import type { FileContent, FileInlineSpan, FileKindId, FileLine, FileLineChangeId } from '../contracts/generated/file-content'

// 一行内容的紧凑写法:变更类型 + 文本 + (可选)修改前文本 + (可选)要高亮的子串。
// 高亮用**子串**而不是字符下标书写 —— 后者极容易写错一位而静默失效。
interface LineSpec {
  change: FileLineChangeId
  text: string
  previous?: string
  highlights?: readonly string[]
}

// 把「要高亮的子串」换算成字符区间(半开)。找不到的子串直接跳过(不抛错)。
function spanFor(text: string, highlights: readonly string[]): FileInlineSpan[] {
  const spans: FileInlineSpan[] = []
  for (const needle of highlights) {
    const start = text.indexOf(needle)
    if (start < 0) continue
    spans.push({ start, end: start + needle.length })
  }
  return spans
}

// 把紧凑写法展开成契约的行数组。行号取数组下标 + 1(即「展示顺序」的行号)。
function buildLines(specs: readonly LineSpec[]): FileLine[] {
  return specs.map((spec, index) => ({
    number: index + 1,
    change: spec.change,
    text: spec.text,
    previous: spec.previous ?? '',
    spans: spanFor(spec.text, spec.highlights ?? []),
  }))
}

// 无变更文件的行视图:整份内容都是「未变更」行。方向是 source → lines(仅此一处允许),
// 与「不从 lines 拼 source」并不冲突 —— 无变更时两者本来就逐行相同。
function unchangedLines(source: string): LineSpec[] {
  return source.split('\n').map((text) => ({ change: 'none' as const, text }))
}

// 变更统计口径与 git 的 diffstat 一致:一行 modified 同时算一次增与一次删。
function countChanges(lines: readonly FileLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.change === 'added' || line.change === 'modified') added += 1
    if (line.change === 'removed' || line.change === 'modified') removed += 1
  }
  return { added, removed }
}

// 一份种子文件:呈现类别 + 语言 / MIME + **当前内容** + (可选)变更行视图。
// lines 缺省 = 整份内容都是未变更行(由 source 展开)。
interface FileSeed {
  kind: FileKindId
  language: string
  mime: string
  source: string
  lines?: LineSpec[]
}

// ---- 具体文件(explicit seeds)----
// 只列「演示路径会走到」的文件;其余由 fallbackSeed 按扩展名生成,避免整棵树点开都是空壳。

// 大表样本的行数:取一个**明确超过** data/csv.ts 里 MAX_CSV_ROWS 的值,让「只显前 N 行」
// 那条降级说明在演示里确实会出现,而不是一条永远走不到的代码路径。
const LARGE_EXPORT_ROWS = 400

// 生成一份写实的导出表(逐条记录一行)。行由代码生成,而不是把几百行手抄进源码。
function largeExportCsv(): string {
  const tracks = ['登录流程', '通知原型', '知识库', '演示准备', '渠道复盘']
  const owners = ['林一舟', '周洁', '陈默']
  const rows = ['id,track,owner,done,total,status']
  for (let index = 1; index <= LARGE_EXPORT_ROWS; index += 1) {
    const done = index % 9
    const track = tracks[index % tracks.length] ?? '其他'
    const owner = owners[index % owners.length] ?? '待定'
    rows.push(`${index},${track},${owner},${done},9,${done === 8 ? '已完成' : '进行中'}`)
  }
  return rows.join('\n')
}

const FILE_SEEDS: Record<string, FileSeed> = {
  // 默认项目 weekly-report:一份被改过的 README(三种变更标记齐全 + 一段足够长的未变更正文用于折叠
  // + 一段 **mermaid 时序图**用来演示预览态里的图表)。
  'README.md': {
    kind: 'markdown',
    language: 'markdown',
    mime: 'text/markdown',
    // 当前内容:与下面的 lines **逐行对齐**(removed 行不在其中)。
    source: [
      '# weekly-report',
      '',
      '把团队每周的项目进展汇总成一份可以直接发给团队的清单。',
      '',
      '## 快速开始',
      '',
      '```bash',
      'npm install',
      'npm run weekly -- --week 2026-W40',
      '```',
      '',
      '## 输入',
      '',
      '脚本读取两个来源:',
      '',
      '- `notes/` 目录下本周的记录文件',
      '- `progress.csv` 里各条线的完成度',
      '',
      '两者缺一时脚本会提示补齐,不猜测缺失的数据。',
      '',
      '## 流程',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  participant U as 团队',
      '  participant S as weekly 脚本',
      '  U->>S: 传入周次 2026-W40',
      '  S->>S: 读取 notes 与 progress.csv',
      '  S-->>U: 生成行动清单',
      '```',
      '',
      '## 输出',
      '',
      '- `notes/2026-W40.md` 的摘要段落',
      '- 一份可直接粘贴到群里的行动清单',
    ].join('\n'),
    lines: [
      { change: 'none', text: '# weekly-report' },
      { change: 'none', text: '' },
      { change: 'modified', text: '把团队每周的项目进展汇总成一份可以直接发给团队的清单。', previous: '把团队每周的项目进展汇总成清单。', highlights: ['可以直接发给团队'] },
      { change: 'none', text: '' },
      { change: 'none', text: '## 快速开始' },
      { change: 'none', text: '' },
      { change: 'none', text: '```bash' },
      { change: 'removed', text: 'npm start' },
      { change: 'added', text: 'npm install' },
      { change: 'added', text: 'npm run weekly -- --week 2026-W40' },
      { change: 'none', text: '```' },
      { change: 'none', text: '' },
      { change: 'none', text: '## 输入' },
      { change: 'none', text: '' },
      { change: 'none', text: '脚本读取两个来源:' },
      { change: 'none', text: '' },
      { change: 'none', text: '- `notes/` 目录下本周的记录文件' },
      { change: 'none', text: '- `progress.csv` 里各条线的完成度' },
      { change: 'none', text: '' },
      { change: 'none', text: '两者缺一时脚本会提示补齐,不猜测缺失的数据。' },
      { change: 'none', text: '' },
      { change: 'none', text: '## 流程' },
      { change: 'none', text: '' },
      { change: 'none', text: '```mermaid' },
      { change: 'none', text: 'sequenceDiagram' },
      { change: 'none', text: '  participant U as 团队' },
      { change: 'none', text: '  participant S as weekly 脚本' },
      { change: 'none', text: '  U->>S: 传入周次 2026-W40' },
      { change: 'none', text: '  S->>S: 读取 notes 与 progress.csv' },
      { change: 'none', text: '  S-->>U: 生成行动清单' },
      { change: 'none', text: '```' },
      { change: 'none', text: '' },
      { change: 'none', text: '## 输出' },
      { change: 'none', text: '' },
      { change: 'added', text: '- `notes/2026-W40.md` 的摘要段落' },
      { change: 'added', text: '- 一份可直接粘贴到群里的行动清单' },
      { change: 'removed', text: '- 发给团队的通知草稿' },
    ],
  },
  // HTML 模板:预览态走 sandbox 的 iframe(里面的脚本可跑,但源是不透明的)。
  'examples/report.html': {
    kind: 'html',
    language: 'html',
    mime: 'text/html',
    source: [
      '<!doctype html>',
      '<html lang="zh-CN">',
      '  <head>',
      '    <meta charset="utf-8" />',
      '    <title>weekly-report · 封面</title>',
      '    <style>',
      '      body { margin: 0; padding: 32px; font-family: system-ui, sans-serif; background: #faf8f5; color: #221d18; }',
      '      h1 { margin: 0 0 8px; font-size: 26px; }',
      '      .meta { color: #756c63; font-size: 14px; }',
      '      .row { display: flex; gap: 16px; margin-top: 24px; }',
      '      .card { flex: 1; padding: 16px; border: 1px solid #e8e4dc; border-radius: 8px; background: #ffffff; }',
      '    </style>',
      '  </head>',
      '  <body>',
      '    <h1>2026-W40 进展汇总</h1>',
      '    <p class="meta">生成时间:2026-10-08 · 生成人:weekly 脚本</p>',
      '    <div class="row">',
      '      <div class="card">登录流程 · 8 / 8</div>',
      '      <div class="card">通知原型 · 5 / 6</div>',
      '    </div>',
      '    <script>',
      "      document.querySelectorAll('.card').forEach((card) => { card.dataset.ready = 'true' })",
      '    </script>',
      '  </body>',
      '</html>',
    ].join('\n'),
  },
  // Shell 脚本:源码态靠 @codemirror/legacy-modes 的 shell 模式高亮(CodeMirror 6 自带解析器
  // 并不覆盖 bash,legacy-modes 正是为这类语言准备的)。
  'examples/run-weekly.sh': {
    kind: 'text',
    language: 'shell',
    mime: 'text/x-shellscript',
    source: [
      '#!/usr/bin/env bash',
      '# 汇总本周进展:读取 notes/ 与 progress.csv,输出可直接发出去的清单。',
      'set -euo pipefail',
      '',
      'WEEK="${1:-}"',
      '',
      'if [[ -z "$WEEK" ]]; then',
      '  echo "用法:run-weekly.sh --week 2026-W40" >&2',
      '  exit 2',
      'fi',
      '',
      'notes="notes/${WEEK}.md"',
      'if [[ ! -f "$notes" ]]; then',
      '  echo "缺少 $notes,先补齐本周记录。" >&2',
      '  exit 3',
      'fi',
      '',
      // progress.csv 的列序是 week,track,owner,done,total,status —— track 是 $2,done/total 是 $4/$5。
      'awk -F, \'NR > 1 { printf "%-12s %s/%s\\n", $2, $4, $5 }\' progress.csv',
    ].join('\n'),
  },
  // Apache 配置:同样走 legacy-modes(apacheconf 模式)。
  'examples/apache.conf': {
    kind: 'text',
    language: 'apacheconf',
    mime: 'text/x-apache-conf',
    source: [
      '# weekly-report 静态站点:只开只读文件服务,不做目录列表。',
      'ServerTokens Prod',
      'ServerSignature Off',
      '',
      '<VirtualHost *:443>',
      '  ServerName weekly.example.com',
      '  DocumentRoot /srv/weekly-report',
      '',
      '  <Directory /srv/weekly-report>',
      '    Options -Indexes +FollowSymLinks',
      '    AllowOverride None',
      '    Require all granted',
      '  </Directory>',
      '',
      '  ErrorLog ${APACHE_LOG_DIR}/weekly-error.log',
      '  CustomLog ${APACHE_LOG_DIR}/weekly-access.log combined',
      '</VirtualHost>',
    ].join('\n'),
  },
  // 渲染检查样本:一份**刻意含注入尝试**的文档,用来验证渲染管线(Markdown → 清洗 → 注入 DOM)。
  // 原始 HTML 在 markdown-it 的默认配置下被转义(html: false 是它的安全默认),清洗层是第二道;
  // mermaid 产出的 SVG 是真正的第三方 HTML,清洗层在那里承担实质防护。
  'examples/render-check.md': {
    kind: 'markdown',
    language: 'markdown',
    mime: 'text/markdown',
    source: [
      '# 渲染检查',
      '',
      '这份文档用来核对工作台的渲染管线:Markdown → 清洗 → 注入 DOM。',
      '',
      '## 结构',
      '',
      '- 一段列表',
      '- 一段 `行内代码`',
      '',
      '| 元素 | 期望 |',
      '| --- | --- |',
      '| 标题 | 渲染为 h1 |',
      '| 列表 | 渲染为 ul |',
      '',
      '## 图表',
      '',
      '```mermaid',
      'graph TD',
      '  A[读取源文件] --> B[清洗]',
      '  B --> C[注入 DOM]',
      '```',
      '',
      '## 注入尝试',
      '',
      '下面两段都是恶意输入的样本,渲染后必须看不到可执行的脚本:',
      '',
      "<script>alert('xss')</script>",
      '',
      '<img src="x" onerror="alert(\'xss\')">',
      '',
      '```mermaid',
      'graph TD',
      '  N["<script>alert(\'mermaid\')</script>"] --> M["<img src=x onerror=alert(\'mermaid\')>"]',
      '```',
      '',
      '## 坏掉的图表',
      '',
      '这一段是**语法错**的 mermaid:它只该把自己退回成代码块 + 一行说明,不能让整块面板白屏。',
      '',
      '```mermaid',
      '这不是一个图表定义',
      '```',
    ].join('\n'),
  },
  // ---- 数据文件样本(examples/ 下三份 JSON + 一份大表)----
  // 与 render-check.md 同属「演示样本」:分别让 JSON 树预览、JSON 表格预览、非法 JSON 的降级
  // 与 CSV 的行数上限降级各有用武之地(见 file-panel.vue 的档位矩阵与 csv-preview.vue)。
  //
  // 根是**对象数组**的 JSON:JSON 预览的「表格」档只在这种形状下出现(列 = 各对象键的并集,
  // 行 = 各元素)。`checks` 是数组 —— 表格里它会被压成紧凑 JSON 并截断,正好演示嵌套值的呈现。
  'examples/schedule.json': {
    kind: 'json',
    language: 'json',
    mime: 'application/json',
    source: [
      '[',
      '  { "track": "登录流程", "owner": "林一舟", "milestone": "W39", "status": "已演示", "progress": 100, "checks": ["入口", "通知", "回退"] },',
      '  { "track": "通知原型", "owner": "周洁", "milestone": "W39", "status": "待补异常分支", "progress": 83, "checks": ["触发", "文案"] },',
      '  { "track": "知识库", "owner": "陈默", "milestone": "W40", "status": "未启动", "progress": 0, "checks": [] },',
      '  { "track": "演示准备", "owner": "林一舟", "milestone": "W40", "status": "彩排中", "progress": 75, "checks": ["主线", "备份"] },',
      '  { "track": "渠道复盘", "owner": "周洁", "milestone": "W41", "status": "等数据回填", "progress": 50, "checks": ["口径"] }',
      ']',
    ].join('\n'),
  },
  // 根是**对象**的 JSON:**没有**表格档(那一枚按钮不渲染),走折叠树;同时含字符串 / 数字 /
  // 布尔 / null / 嵌套对象 / 数组,正好演示「值按类型着色」与默认展开层数。
  'examples/config.json': {
    kind: 'json',
    language: 'json',
    mime: 'application/json',
    source: [
      '{',
      '  "project": "weekly-report",',
      '  "version": 3,',
      '  "output": { "dir": "dist", "format": "markdown", "limits": { "rows": 300, "columns": 32 } },',
      '  "tracks": ["产品", "增长", "基建"],',
      '  "notify": false,',
      '  "owner": null',
      '}',
    ].join('\n'),
  },
  // **非法 JSON**(尾随逗号,像一次没改完的编辑):演示解析失败的降级 —— 一行可读的错误加一句
  // 指路,面板不白屏、源码档仍可达。真实仓库里不会有这种文件,故它与 render-check.md 同性质:
  // 一份**改动样本**(用来验证降级路径),而不是一份正常的项目文件。
  'examples/broken.json': {
    kind: 'json',
    language: 'json',
    mime: 'application/json',
    source: [
      '{',
      '  "project": "weekly-report",',
      '  "tracks": ["产品", "增长",],',
      '}',
    ].join('\n'),
  },
  // 超出表格行数上限的导出表:演示「只显前 N 行 + 表下一行说明」的降级。
  'examples/large-export.csv': {
    kind: 'csv',
    language: 'csv',
    mime: 'text/csv',
    source: largeExportCsv(),
  },
  // 列数不齐 + 引号包裹的字段:演示解析器的两处容错 —— `"含逗号,的备注"` 是一个字段而不是两个;
  // 第 3 行比表头多一列,**照渲不报错**(按最大列数补齐,表头缺的补空)。
  'examples/ragged.csv': {
    kind: 'csv',
    language: 'csv',
    mime: 'text/csv',
    source: [
      'id,track,note',
      '1,登录流程,"含逗号,的备注"',
      '2,通知原型,只有两列',
      '3,知识库,第三行多一列,溢出列',
    ].join('\n'),
  },
  // 工具函数:一个被改过的函数 + 一段新增的函数。
  'src/utils/format.ts': {
    kind: 'text',
    language: 'typescript',
    mime: 'text/typescript',
    source: [
      '// 周次与日期的互相换算。',
      '',
      'export function weekLabel(week: number): string {',
      "  return `2026-W${String(week).padStart(2, '0')}`",
      '}',
      '',
      'export function weekRange(week: number): string {',
      '  const start = new Date(Date.UTC(2026, 0, 5 + (week - 1) * 7))',
      '  const end = new Date(start.getTime() + 6 * 86_400_000)',
      '  return `${isoDate(start)} – ${isoDate(end)}`',
      '}',
      '',
      'function isoDate(date: Date): string {',
      '  return date.toISOString().slice(0, 10)',
      '}',
    ].join('\n'),
    lines: [
      { change: 'none', text: '// 周次与日期的互相换算。' },
      { change: 'none', text: '' },
      { change: 'modified', text: 'export function weekLabel(week: number): string {', previous: 'export function weekLabel(w: number) {', highlights: ['week'] },
      { change: 'none', text: "  return `2026-W${String(week).padStart(2, '0')}`" },
      { change: 'none', text: '}' },
      { change: 'none', text: '' },
      { change: 'added', text: 'export function weekRange(week: number): string {' },
      { change: 'added', text: '  const start = new Date(Date.UTC(2026, 0, 5 + (week - 1) * 7))' },
      { change: 'added', text: '  const end = new Date(start.getTime() + 6 * 86_400_000)' },
      { change: 'added', text: '  return `${isoDate(start)} – ${isoDate(end)}`' },
      { change: 'added', text: '}' },
      { change: 'none', text: '' },
      { change: 'modified', text: 'function isoDate(date: Date): string {', previous: 'function isoDate(d: Date) {', highlights: ['date'] },
      { change: 'none', text: "  return date.toISOString().slice(0, 10)" },
      { change: 'none', text: '}' },
    ],
  },
  // 新建文件:整份都是新增行。
  'src/main.ts': {
    kind: 'text',
    language: 'typescript',
    mime: 'text/typescript',
    source: [
      "import { createApp } from 'vue'",
      "import { App } from './app'",
      '',
      'const app = createApp(App)',
      "app.mount('#app')",
    ].join('\n'),
    lines: [
      { change: 'added', text: "import { createApp } from 'vue'" },
      { change: 'added', text: "import { App } from './app'" },
      { change: 'added', text: '' },
      { change: 'added', text: 'const app = createApp(App)' },
      { change: 'added', text: "app.mount('#app')" },
    ],
  },
  // 进度报表:一份**像样的报表**(多列、文本列与数值列并存),用来演示 CSV 预览的表格口径 ——
  // 首行即表头、行号列、文本列左对齐 / 数值列右对齐。kind 是 `csv`(不是 text + language):
  // 面板的档位矩阵按 kind 决定,只有把 csv 单列出来,它才拿得到预览档(见 contracts/main.tsp)。
  'progress.csv': {
    kind: 'csv',
    language: 'csv',
    mime: 'text/csv',
    source: [
      'week,track,owner,done,total,status',
      '2026-W39,登录流程,林一舟,8,8,已完成',
      '2026-W39,通知原型,周洁,5,6,进行中',
      '2026-W39,知识库,陈默,0,5,未启动',
      '2026-W40,演示准备,林一舟,3,4,进行中',
      '2026-W40,渠道复盘,周洁,2,4,进行中',
    ].join('\n'),
    lines: [
      { change: 'none', text: 'week,track,owner,done,total,status' },
      { change: 'modified', text: '2026-W39,登录流程,林一舟,8,8,已完成', previous: '2026-W39,登录流程,林一舟,7,8,进行中', highlights: ['8,8,已完成'] },
      { change: 'none', text: '2026-W39,通知原型,周洁,5,6,进行中' },
      { change: 'none', text: '2026-W39,知识库,陈默,0,5,未启动' },
      { change: 'added', text: '2026-W40,演示准备,林一舟,3,4,进行中' },
      { change: 'added', text: '2026-W40,渠道复盘,周洁,2,4,进行中' },
    ],
  },
  'notes/2026-W40.md': {
    kind: 'markdown',
    language: 'markdown',
    mime: 'text/markdown',
    source: [
      '# 2026-W40',
      '',
      '本周完成登录流程与通知原型的演示条件。',
      '',
      '- 周五演示:一条完整任务路径',
      '- 知识库整理:下周确认文档范围',
    ].join('\n'),
    lines: [
      { change: 'added', text: '# 2026-W40' },
      { change: 'added', text: '' },
      { change: 'added', text: '本周完成登录流程与通知原型的演示条件。' },
      { change: 'added', text: '' },
      { change: 'added', text: '- 周五演示:一条完整任务路径' },
      { change: 'added', text: '- 知识库整理:下周确认文档范围' },
    ],
  },
  'src/components/layout/header/index.ts': {
    kind: 'text',
    language: 'typescript',
    mime: 'text/typescript',
    source: [
      '// 页面头部:标题 + 当前周次。',
      '',
      'export function renderHeader(title: string, week: number): string {',
      "  return `<header><h1>${title}</h1>${weekLabel(week)}</header>`",
      '}',
    ].join('\n'),
    lines: [
      { change: 'none', text: '// 页面头部:标题 + 当前周次。' },
      { change: 'none', text: '' },
      { change: 'modified', text: 'export function renderHeader(title: string, week: number): string {', previous: 'export function renderHeader(title: string) {', highlights: ['week: number'] },
      { change: 'none', text: "  return `<header><h1>${title}</h1>${weekLabel(week)}</header>`" },
      { change: 'none', text: '}' },
    ],
  },
  // 写作助手 product-docs:「等待交互」确认请求的受影响文件(演示 pending 芯片与面板内的允许 / 拒绝)。
  'release-notes.md': {
    kind: 'markdown',
    language: 'markdown',
    mime: 'text/markdown',
    source: [
      '# 发布说明 · v2.4',
      '',
      '## 新增',
      '',
      '- 任务结果通知:任务结束后经浏览器或移动 App 触达',
      '- 工作台内可直接看到 Agent 改过的文件',
      '',
      '## 修复',
      '',
      '- 通知未送达时,任务结果仍可在工作台找到',
    ].join('\n'),
    lines: [
      { change: 'added', text: '# 发布说明 · v2.4' },
      { change: 'added', text: '' },
      { change: 'added', text: '## 新增' },
      { change: 'added', text: '' },
      { change: 'added', text: '- 任务结果通知:任务结束后经浏览器或移动 App 触达' },
      { change: 'added', text: '- 工作台内可直接看到 Agent 改过的文件' },
      { change: 'added', text: '' },
      { change: 'added', text: '## 修复' },
      { change: 'added', text: '' },
      { change: 'added', text: '- 通知未送达时,任务结果仍可在工作台找到' },
    ],
  },
  'release-plan.csv': {
    // 同 progress.csv:CSV 一律走 csv kind,否则同一个面板里会出现「一份 .csv 有表格、另一份
    // 只有源码」的不一致(档位矩阵只看 kind,不看扩展名)。
    kind: 'csv',
    language: 'csv',
    mime: 'text/csv',
    source: [
      'track,owner,plan,actual',
      '产品,林一舟,发布 v2.4,v2.4 已发',
      '增长,周洁,渠道复盘,渠道复盘',
      '基建,陈默,通知服务,Q4 排期',
    ].join('\n'),
    lines: [
      { change: 'none', text: 'track,owner,plan,actual' },
      { change: 'modified', text: '产品,林一舟,发布 v2.4,v2.4 已发', previous: '产品,林一舟,发布 v2.4,进行中', highlights: ['v2.4 已发'] },
      { change: 'none', text: '增长,周洁,渠道复盘,渠道复盘' },
      { change: 'added', text: '基建,陈默,通知服务,Q4 排期' },
    ],
  },
  'drafts/v2/notes.md': {
    kind: 'markdown',
    language: 'markdown',
    mime: 'text/markdown',
    source: [
      '# v2 草稿笔记',
      '',
      '发布说明先写「新增」,再写「修复」,最后附升级方式。',
      '',
      '语气保持克制,不写「重大升级」这类词。',
    ].join('\n'),
    lines: [
      { change: 'none', text: '# v2 草稿笔记' },
      { change: 'none', text: '' },
      { change: 'modified', text: '发布说明先写「新增」,再写「修复」,最后附升级方式。', previous: '发布说明先写「新增」,再写「修复」。', highlights: ['最后附升级方式'] },
      { change: 'none', text: '' },
      { change: 'none', text: '语气保持克制,不写「重大升级」这类词。' },
    ],
  },
  'docs/index.md': {
    kind: 'markdown',
    language: 'markdown',
    mime: 'text/markdown',
    source: [
      '# 团队知识库',
      '',
      '先从最近两周最常被问到的五个问题开始整理。',
      '',
      '每篇文档补齐负责人与更新时间,并保留原始链接。',
    ].join('\n'),
    lines: [
      { change: 'none', text: '# 团队知识库' },
      { change: 'none', text: '' },
      { change: 'modified', text: '先从最近两周最常被问到的五个问题开始整理。', previous: '先从最常被问到的问题开始整理。', highlights: ['最近两周最常被问到的五个问题'] },
      { change: 'none', text: '' },
      { change: 'none', text: '每篇文档补齐负责人与更新时间,并保留原始链接。' },
    ],
  },
  'interviews/guide.md': {
    kind: 'markdown',
    language: 'markdown',
    mime: 'text/markdown',
    source: [
      '# 用户访谈提纲',
      '',
      '- 最近一次用这个功能是什么时候?',
      '- 当时想解决什么问题?',
      '- 哪一步让你停下来?',
    ].join('\n'),
    lines: [
      { change: 'added', text: '# 用户访谈提纲' },
      { change: 'added', text: '' },
      { change: 'added', text: '- 最近一次用这个功能是什么时候?' },
      { change: 'added', text: '- 当时想解决什么问题?' },
      { change: 'added', text: '- 哪一步让你停下来?' },
    ],
  },
}

// ---- 图片种子 ----
// 原型没有后端,图片用 **data URL**:省一次请求,且与「真实接口会给 contentUrl」同形。
// 内容是一个可辨认的品牌记号(青瓷圆角方块 + 白色 M),不是占位灰块。
const IMAGE_SEEDS: Record<string, string> = {
  'assets/logo.svg': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%232e6f63'/%3E%3Cpath d='M9 23V9l7 9 7-9v14' fill='none' stroke='%23ffffff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E",
}

// ---- fallback:按扩展名生成一份写实的短文件 ----
// 目的是「点开任意文件都有内容」,而不是把整棵树的正文都手工写一遍。
function fallbackSeed(path: string): FileSeed {
  const name = path.split('/').at(-1) ?? path
  if (name.endsWith('.md')) {
    const source = [
      `# ${name.replace(/\.md$/, '')}`,
      '',
      '这份文档记录当前的做法与待办,改动前请先在这里补一句背景。',
      '',
      '- 负责人:待补',
      '- 更新日期:2026-10-08',
    ].join('\n')
    return { kind: 'markdown', language: 'markdown', mime: 'text/markdown', source }
  }
  if (name.endsWith('.csv')) {
    // 其余项目里的 .csv 也一律是 csv kind —— 档位矩阵由 kind 决定,给了 kind 才有表格预览档。
    return {
      kind: 'csv',
      language: 'csv',
      mime: 'text/csv',
      source: ['id,name,status', '1,样例条目,进行中'].join('\n'),
    }
  }
  if (name.endsWith('.ts')) {
    return {
      kind: 'text',
      language: 'typescript',
      mime: 'text/typescript',
      source: ['// 模块入口。', '', 'export function run(): void {', "  console.log('ready')", '}'].join('\n'),
    }
  }
  if (name.endsWith('.json')) {
    return {
      kind: 'json',
      language: 'json',
      mime: 'application/json',
      source: ['{', '  "version": 1,', '  "enabled": true', '}'].join('\n'),
    }
  }
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    return { kind: 'html', language: 'html', mime: 'text/html', source: ['<!doctype html>', '<title>未命名页面</title>', '<p>这个页面还没有内容。</p>'].join('\n') }
  }
  if (name.endsWith('.sh') || name.endsWith('.bash')) {
    return { kind: 'text', language: 'shell', mime: 'text/x-shellscript', source: ['#!/usr/bin/env bash', 'set -euo pipefail', ''].join('\n') }
  }
  if (name.endsWith('.conf')) {
    return { kind: 'text', language: 'apacheconf', mime: 'text/x-apache-conf', source: ['# 服务配置。', 'ServerTokens Prod', ''].join('\n') }
  }
  return {
    kind: 'text',
    language: 'text',
    mime: 'text/plain',
    source: [name, '', '(纯文本文件)'].join('\n'),
  }
}

// 无法在 web 里呈现的二进制:不当文本展示,也不给任何视图 —— 面板据此走「无法预览」的空态。
const BINARY_EXTENSIONS = ['.pdf', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2']

function isBinary(path: string): boolean {
  const lower = path.toLowerCase()
  return BINARY_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

// 取一份文件内容。confirmationId 由 API 层按当前会话的确认请求补上 —— 这里只负责文件本身。
// projectId 目前不参与查表(path 在演示数据里已唯一),保留入参是为了贴合真实接口形状。
export function mockFileContent(projectId: string, path: string): Omit<FileContent, 'confirmationId'> {
  void projectId
  // 图片:只有预览档,内容在 contentUrl 里,没有源码与变更视图。
  const imageUrl = IMAGE_SEEDS[path]
  if (imageUrl !== undefined) {
    return { path, kind: 'image', language: 'image', mime: 'image/svg+xml', source: '', contentUrl: imageUrl, addedCount: 0, removedCount: 0, lines: [] }
  }
  if (isBinary(path)) {
    return { path, kind: 'binary', language: 'binary', mime: 'application/octet-stream', source: '', contentUrl: '', addedCount: 0, removedCount: 0, lines: [] }
  }
  const seed = FILE_SEEDS[path] ?? fallbackSeed(path)
  const lines = buildLines(seed.lines ?? unchangedLines(seed.source))
  const counts = countChanges(lines)
  return {
    path,
    kind: seed.kind,
    language: seed.language,
    mime: seed.mime,
    source: seed.source,
    contentUrl: '',
    addedCount: counts.added,
    removedCount: counts.removed,
    lines,
  }
}
