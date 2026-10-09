// 项目文件树的构建与摊平:契约把条目下发成**扁平数组 + path**(递归类型无法内联进自包含的
// schema,见 contracts/main.tsp 的注释),层级由这里按 path 推导。
//
// 两个纯函数各司其职:buildProjectTree 把扁平条目拼成树;flattenProjectTree 按已展开的目录
// 把树摊平成可渲染的行(载体不做递归组件,展开状态由页面统一持有,便于机械断言)。
import type { ProjectEntry } from '../contracts/generated/project-entry'

// 树里的一个节点。name 是路径末段(展示用),path 是相对项目根的完整路径(唯一标识)。
export interface ProjectTreeNode {
  id: string
  path: string
  name: string
  kind: ProjectEntry['kind']
  state: ProjectEntry['state']
  depth: number
  children: ProjectTreeNode[]
}

// 摊平后的一行:直接交给模板渲染(level = depth + 1,项目名占 0 级)。
export interface ProjectTreeRow {
  id: string
  path: string
  name: string
  kind: ProjectEntry['kind']
  state: ProjectEntry['state']
  level: number
  expandable: boolean
}

// 目录的展开键:项目内路径可能重名(不同项目),故把项目 id 编进键。
export function directoryKey(projectId: string, path: string): string {
  return `${projectId}::${path}`
}

// 把契约的扁平条目数组拼成树。条目只给了 path,故按「/」分段逐级补出祖先目录节点
// (若条目已显式给了某目录,则以它的 id / state 为准)。
export function buildProjectTree(entries: ProjectEntry[]): ProjectTreeNode[] {
  const roots: ProjectTreeNode[] = []
  const byPath = new Map<string, ProjectTreeNode>()
  for (const entry of entries) {
    const segments = entry.path.split('/')
    let siblings = roots
    let prefix = ''
    for (const [index, segment] of segments.entries()) {
      prefix = prefix === '' ? segment : `${prefix}/${segment}`
      const isLeaf = index === segments.length - 1
      const existing = byPath.get(prefix)
      if (existing === undefined) {
        const node: ProjectTreeNode = {
          id: isLeaf ? entry.id : `dir:${prefix}`,
          path: prefix,
          name: segment,
          kind: isLeaf ? entry.kind : 'directory',
          state: isLeaf ? entry.state : 'none',
          depth: index,
          children: [],
        }
        byPath.set(prefix, node)
        siblings.push(node)
        siblings = node.children
      } else {
        // 该路径已被当作祖先目录补出过,现在遇到显式条目:补上它的 id 与状态。
        if (isLeaf) {
          existing.id = entry.id
          existing.kind = entry.kind
          existing.state = entry.state
        }
        siblings = existing.children
      }
    }
  }
  sortNodes(roots)
  return roots
}

// 目录在前、文件在后,各自按名称升序(与文件管理器一致)。
function sortNodes(nodes: ProjectTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const node of nodes) sortNodes(node.children)
}

// 按已展开的目录把树摊平成行序列:未展开的目录只出它自己一行,展开的目录连同其子树一起出。
export function flattenProjectTree(nodes: ProjectTreeNode[], projectId: string, expanded: ReadonlySet<string>): ProjectTreeRow[] {
  const rows: ProjectTreeRow[] = []
  for (const node of nodes) {
    const isExpanded = expanded.has(directoryKey(projectId, node.path))
    rows.push({
      id: node.id,
      path: node.path,
      name: node.name,
      kind: node.kind,
      state: node.state,
      level: node.depth + 1,
      expandable: node.kind === 'directory' && node.children.length > 0,
    })
    if (node.kind === 'directory' && isExpanded) {
      rows.push(...flattenProjectTree(node.children, projectId, expanded))
    }
  }
  return rows
}
