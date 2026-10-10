// ---- 文件栏的视图状态(不进契约:打开集、预览槽、最近打开都是「视图状态」,刷新即重置)----
import type { AgentId } from '../contracts/generated/chat-session'
import type { FileContent, FileLine } from '../contracts/generated/file-content'

// 文件面板的异步四态(判别联合,与契约的 TranscriptState 同构)。
export type FilePanelState =
  | { status: 'loading' }
  | { status: 'ready'; content: FileContent }
  | { status: 'empty' }
  | { status: 'error' }

// 分域键:整套文件工作区**只属于 (Agent, 项目) 这一对**。
// 依据:tab 表示的对话或文件,只能属于被选中的 Agent 与被选中的项目。于是「打开集 / 窗口几何 /
// 最近打开」都按这一对分域保存 —— 条上不会出现两个项目的东西,文件名在域内天然唯一。
export function fileDomainKey(agentId: AgentId, projectId: string): string {
  return `${agentId}::${projectId}`
}

// 域内的一个 tab。
//   path —— 项目内相对路径,在域内唯一(故 tab 的键就是它)。
// **每个打开的文件独占一个 tab**(原来的「预览槽」语义已作废:单击 = 预览、占一个可复用槽、被下一个
// 顶替;那是 IDE 的惯例,而本应用的模型是「打开即独占」,且已支持多窗口 —— 「避免铺满 tab」这条
// 理由不成立)。单击 / 双击 / Enter 三条路径因此行为一致:创建或复用该文件自己的 tab。
// 状态芯片不在这里:它按与文件树**同一条**规则实时派生(见 FileBar 的 stateOf),存一份会过期。
export interface FileTab {
  path: string
}

// tab / 活动文件的唯一标识。分域之后「项目 + 路径」里的项目那一段是冗余的(整域只属一个项目)。
export function fileTabKey(tab: { path: string }): string {
  return tab.path
}

// 文件窗口的几何(fixed 定位的视口坐标)。
export interface FileWindowRect {
  x: number
  y: number
  width: number
  height: number
}

// 一个文件窗口的**完整**状态:几何 + 是否可见 + 层序。
// 三样都按 (Agent, 项目) 分域保存,故关掉窗口(visible=false)≠ 关掉标签、≠ 清空几何:
// 从条上再点一次即按原样恢复(与「关闭 ≠ 删除」同源),切走分域再切回来也一样 ——
// 这也是 VS Code / IntelliJ「编辑器与窗口按项目保存与恢复」的既有行为。
export interface FileWindow {
  rect: FileWindowRect
  // 可见 = 窗口正显示在屏幕上(条上那个切换按钮的 aria-pressed 就是它)。
  visible: boolean
  // 层序:数值大者在上。聚焦(点它 / 在它里面操作)即取当前最大值 + 1。
  z: number
}

// 一个分域的文件工作区。
export interface FileDomain {
  tabs: FileTab[]
  activeKey: string
  // 「最近打开」= 关掉但仍在历史里的路径(新的在前)。分域之后只需路径 —— 项目由域本身给出。
  recent: string[]
  // 每个打开过的文件的窗口状态(键 = 路径)。
  windows: Record<string, FileWindow>
  // 当前聚焦的窗口(路径);空 = 没有聚焦的窗口(F6 / Esc 的落点)。
  focus: string
}

// 打开集**按 (Agent, 项目) 分域**:键 = fileDomainKey。切 Agent / 切项目时旧域只是**不被呈现**
// (其打开集、窗口几何、最近打开原样留着),切回来即恢复 —— 不销毁、不清空。
export type FileWorkspace = Record<string, FileDomain>

export const EMPTY_DOMAIN: FileDomain = { tabs: [], activeKey: '', recent: [], windows: {}, focus: '' }

export function emptyFileWorkspace(): FileWorkspace {
  return {}
}

// 取某个域的当前状态;该域还没被碰过时返回一份空域(**不写入** —— 读不该产生副作用)。
export function fileDomainOf(workspace: FileWorkspace, key: string): FileDomain {
  return workspace[key] ?? EMPTY_DOMAIN
}

// 不可变地写回某个域。
export function withFileDomain(workspace: FileWorkspace, key: string, domain: FileDomain): FileWorkspace {
  return { ...workspace, [key]: domain }
}

// 展示名 = 路径末段。
// 展示名 = 路径末段。
export function fileBaseName(path: string): string {
  return path.split('/').at(-1) ?? path
}

// 该文件所在的目录(项目内相对路径);根目录下的文件返回空串。
export function fileDirName(path: string): string {
  return path.split('/').slice(0, -1).join('/')
}

// 把一份文件记入某个域的「最近打开」(按路径去重、置顶、限量)。
const RECENT_LIMIT = 16

export function rememberRecent(recent: readonly string[], path: string): string[] {
  return [path, ...recent.filter((item) => item !== path)].slice(0, RECENT_LIMIT)
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
