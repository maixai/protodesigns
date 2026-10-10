// ---- 文件栏的视图状态(不进契约:打开集、预览槽、最近打开都是「视图状态」,刷新即重置)----
import type { AgentId } from '../contracts/generated/chat-session'
import type { FileContent, FileLine } from '../contracts/generated/file-content'

// 文件面板的异步四态(判别联合,与契约的 TranscriptState 同构)。
export type FilePanelState =
  | { status: 'loading' }
  | { status: 'ready'; content: FileContent }
  | { status: 'empty' }
  | { status: 'error' }

// 文件栏里的一个 tab。
// 打开集是**全局**的(跨项目 / 跨会话共享,换项目、换会话都不清空),故每个 tab 自带出处:
//   projectId / projectName —— 该文件所属项目;栏里可能同时混装多个项目的文件,tab 上必须
//   自己声明出处(不再有「栏首标一次项目名」那种前提)。
//   path —— 项目内相对路径,与该文件所属项目合起来才是唯一标识(不同项目可能有同名文件)。
//   kind —— preview(临时槽:斜体、同一时刻至多一个,新的预览顶掉旧的)或 pinned(独占一格)。
// 状态芯片不在这里:它按与文件树**同一条**规则实时派生(见 FileBar 的 stateOf),存一份会过期。
export interface FileTab {
  path: string
  projectId: string
  projectName: string
  kind: 'preview' | 'pinned'
}

// tab / 活动文件的唯一标识:项目 + 路径。
export function fileTabKey(tab: { projectId: string; path: string }): string {
  return `${tab.projectId}::${tab.path}`
}

// 「最近打开」是**全局**一份(跨项目),下拉开按项目分组呈现。故不再有 per-project 的
// 「文件工作区」概念 —— 打开集本身就是全局的。
// 带 agentId / projectName:下拉里要分组、要显示「项目 › 路径」,而这两样在栏内拿不到。
export interface RecentFile {
  agentId: AgentId
  projectId: string
  projectName: string
  path: string
}

// 打开集(全局一份)+ 活动文件的键。全项目 / 全会话共享,换项目、换会话都不清空。
export interface FileWorkspace {
  tabs: FileTab[]
  activeKey: string
}

export function emptyFileWorkspace(): FileWorkspace {
  return { tabs: [], activeKey: '' }
}

// 展示名 = 路径末段。
export function fileBaseName(path: string): string {
  return path.split('/').at(-1) ?? path
}

// 该文件所在的目录(项目内相对路径);根目录下的文件返回空串。
export function fileDirName(path: string): string {
  return path.split('/').slice(0, -1).join('/')
}

// 把一份文件记入最近打开(按「项目 + 路径」去重、置顶、限量)。
const RECENT_LIMIT = 16

export function rememberRecent(recent: readonly RecentFile[], entry: RecentFile): RecentFile[] {
  const rest = recent.filter((item) => !(item.projectId === entry.projectId && item.path === entry.path))
  return [entry, ...rest].slice(0, RECENT_LIMIT)
}

// ---- 折叠未变更的片段 ----
// 依据:IntelliJ 的 diff 可配置保留几行上下文,长文件里只展开变更周围若干行。
// 这里给出「展示项」序列:每一行,或一段被折叠的未变更行(可展开)。
export const FOLD_CONTEXT = 2
// 折叠门槛:未变更的连续行超过这个数才折起来(只差一两行就折会显得碎)。
const FOLD_MIN = FOLD_CONTEXT * 2 + 1

export type FileDisplayItem =
  | { kind: 'line'; line: FileLine }
  | { kind: 'fold'; start: number; count: number }

// 计算展示项。expanded 是「已展开的折叠段起点」集合(下标基准与 lines 一致)。
export function buildDisplayItems(lines: readonly FileLine[], expanded: ReadonlySet<number>): FileDisplayItem[] {
  // 变更行(含其上下 FOLD_CONTEXT 行)标记为「必显」。
  const visible = new Array<boolean>(lines.length).fill(false)
  for (const [index, line] of lines.entries()) {
    if (line.change === 'none') continue
    const from = Math.max(0, index - FOLD_CONTEXT)
    const to = Math.min(lines.length - 1, index + FOLD_CONTEXT)
    for (let cursor = from; cursor <= to; cursor += 1) visible[cursor] = true
  }
  const items: FileDisplayItem[] = []
  let index = 0
  while (index < lines.length) {
    if (visible[index] === true) {
      const line = lines[index]
      if (line !== undefined) items.push({ kind: 'line', line })
      index += 1
      continue
    }
    // 收集一段连续的未变更行。
    let end = index
    while (end < lines.length && visible[end] !== true) end += 1
    const count = end - index
    if (count < FOLD_MIN || expanded.has(index)) {
      for (let cursor = index; cursor < end; cursor += 1) {
        const line = lines[cursor]
        if (line !== undefined) items.push({ kind: 'line', line })
      }
    } else {
      items.push({ kind: 'fold', start: index, count })
    }
    index = end
  }
  return items
}
