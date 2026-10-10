// 文件面板的 dummy 文件内容:贴近真实项目的文件正文 + 行级变更标记 + 词级高亮区间。
//
// 与项目树的关系:树给的是「这个文件被改过」(state 芯片),这里给的是「改成什么样」——
// 两者按同一个 path 对齐。内容一律**写实**(真实的 README / 工具函数 / CSV),不用 lorem。
//
// 变更标记的语义:数组即「当前文件的展示顺序」——未变更行与改动行按原位交错,removed 行保留在
// 它原来的位置(因此在「整个文件」视图里也能看见被删掉的那行)。
import type { FileContent, FileInlineSpan, FileLine, FileLineChangeId } from '../contracts/generated/file-content'

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

// 一份种子文件:语言 + 行内容。
interface FileSeed {
  language: string
  lines: LineSpec[]
}

// ---- 具体文件(explicit seeds)----
// 只列「演示路径会走到」的文件;其余由 fallbackSeed 按扩展名生成,避免整棵树点开都是空壳。
const FILE_SEEDS: Record<string, FileSeed> = {
  // 默认项目 weekly-report:一份被改过的 README(三种变更标记齐全 + 一段足够长的未变更正文用于折叠)。
  'README.md': {
    language: 'markdown',
    lines: [
      { change: 'none', text: '# weekly-report' },
      { change: 'none', text: '' },
      { change: 'modified', text: '把团队每周的项目进展汇总成一份可以直接发给团队的清单。', previous: '把团队每周的项目进展汇总成清单。', highlights: ['可以直接发给团队'] },
      { change: 'none', text: '' },
      { change: 'none', text: '## 快速开始' },
      { change: 'none', text: '' },
      { change: 'removed', text: 'npm start' },
      { change: 'added', text: 'npm install' },
      { change: 'added', text: 'npm run weekly -- --week 2026-W40' },
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
      { change: 'none', text: '## 输出' },
      { change: 'none', text: '' },
      { change: 'added', text: '- `notes/2026-W40.md` 的摘要段落' },
      { change: 'added', text: '- 一份可直接粘贴到群里的行动清单' },
      { change: 'removed', text: '- 发给团队的通知草稿' },
    ],
  },
  // 工具函数:一个被改过的函数 + 一段新增的函数。
  'src/utils/format.ts': {
    language: 'typescript',
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
    language: 'typescript',
    lines: [
      { change: 'added', text: "import { createApp } from 'vue'" },
      { change: 'added', text: "import { App } from './app'" },
      { change: 'added', text: '' },
      { change: 'added', text: 'const app = createApp(App)' },
      { change: 'added', text: "app.mount('#app')" },
    ],
  },
  'progress.csv': {
    language: 'csv',
    lines: [
      { change: 'none', text: 'week,track,done,total' },
      { change: 'modified', text: '2026-W39,登录流程,8,8', previous: '2026-W39,登录流程,7,8', highlights: ['8'] },
      { change: 'none', text: '2026-W39,通知原型,5,6' },
      { change: 'none', text: '2026-W39,知识库,0,5' },
      { change: 'added', text: '2026-W40,演示准备,3,4' },
    ],
  },
  'notes/2026-W40.md': {
    language: 'markdown',
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
    language: 'typescript',
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
    language: 'markdown',
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
    language: 'csv',
    lines: [
      { change: 'none', text: 'track,owner,plan,actual' },
      { change: 'modified', text: '产品,林一舟,发布 v2.4,v2.4 已发', previous: '产品,林一舟,发布 v2.4,进行中', highlights: ['v2.4 已发'] },
      { change: 'none', text: '增长,周洁,渠道复盘,渠道复盘' },
      { change: 'added', text: '基建,陈默,通知服务,Q4 排期' },
    ],
  },
  'drafts/v2/notes.md': {
    language: 'markdown',
    lines: [
      { change: 'none', text: '# v2 草稿笔记' },
      { change: 'none', text: '' },
      { change: 'modified', text: '发布说明先写「新增」,再写「修复」,最后附升级方式。', previous: '发布说明先写「新增」,再写「修复」。', highlights: ['最后附升级方式'] },
      { change: 'none', text: '' },
      { change: 'none', text: '语气保持克制,不写「重大升级」这类词。' },
    ],
  },
  'docs/index.md': {
    language: 'markdown',
    lines: [
      { change: 'none', text: '# 团队知识库' },
      { change: 'none', text: '' },
      { change: 'modified', text: '先从最近两周最常被问到的五个问题开始整理。', previous: '先从最常被问到的问题开始整理。', highlights: ['最近两周最常被问到的五个问题'] },
      { change: 'none', text: '' },
      { change: 'none', text: '每篇文档补齐负责人与更新时间,并保留原始链接。' },
    ],
  },
  'interviews/guide.md': {
    language: 'markdown',
    lines: [
      { change: 'added', text: '# 用户访谈提纲' },
      { change: 'added', text: '' },
      { change: 'added', text: '- 最近一次用这个功能是什么时候?' },
      { change: 'added', text: '- 当时想解决什么问题?' },
      { change: 'added', text: '- 哪一步让你停下来?' },
    ],
  },
}

// ---- fallback:按扩展名生成一份写实的短文件 ----
// 目的是「点开任意文件都有内容」,而不是把整棵树的正文都手工写一遍。
function fallbackSeed(path: string): FileSeed {
  const name = path.split('/').at(-1) ?? path
  if (name.endsWith('.md')) {
    return {
      language: 'markdown',
      lines: [
        { change: 'none', text: `# ${name.replace(/\.md$/, '')}` },
        { change: 'none', text: '' },
        { change: 'none', text: '这份文档记录当前的做法与待办,改动前请先在这里补一句背景。' },
        { change: 'none', text: '' },
        { change: 'none', text: '- 负责人:待补' },
        { change: 'none', text: '- 更新日期:2026-10-08' },
      ],
    }
  }
  if (name.endsWith('.csv')) {
    return {
      language: 'csv',
      lines: [
        { change: 'none', text: 'id,name,status' },
        { change: 'none', text: '1,样例条目,进行中' },
      ],
    }
  }
  if (name.endsWith('.ts')) {
    return {
      language: 'typescript',
      lines: [
        { change: 'none', text: '// 模块入口。' },
        { change: 'none', text: '' },
        { change: 'none', text: 'export function run(): void {' },
        { change: 'none', text: "  console.log('ready')" },
        { change: 'none', text: '}' },
      ],
    }
  }
  if (name.endsWith('.json')) {
    return {
      language: 'json',
      lines: [
        { change: 'none', text: '{' },
        { change: 'none', text: '  "version": 1,' },
        { change: 'none', text: '  "enabled": true' },
        { change: 'none', text: '}' },
      ],
    }
  }
  return {
    language: 'text',
    lines: [
      { change: 'none', text: name },
      { change: 'none', text: '' },
      { change: 'none', text: '（纯文本文件）' },
    ],
  }
}

// 二进制文件:不能当文本展示,返回空行数组 —— 面板据此走「无法预览」的空态。
const BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.woff', '.woff2']

function isBinary(path: string): boolean {
  const lower = path.toLowerCase()
  return BINARY_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

// 取一份文件内容。confirmationId 由 API 层按当前会话的确认请求补上 —— 这里只负责文件本身。
// projectId 目前不参与查表(path 在演示数据里已唯一),保留入参是为了贴合真实接口形状。
export function mockFileContent(projectId: string, path: string): Omit<FileContent, 'confirmationId'> {
  void projectId
  if (isBinary(path)) return { path, language: 'binary', addedCount: 0, removedCount: 0, lines: [] }
  const seed = FILE_SEEDS[path] ?? fallbackSeed(path)
  const lines = buildLines(seed.lines)
  const counts = countChanges(lines)
  return { path, language: seed.language, addedCount: counts.added, removedCount: counts.removed, lines }
}
