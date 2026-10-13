// 项目 → 标识色号的稳定映射(纯函数,无副作用)。
//
// 侧栏同时展开多个项目、右侧 tab 与悬浮窗混装不同项目的内容时,归属靠三条通道读出:
//   ① **文字**(tab 标题前 2–4 字符的项目缩写)—— 色觉障碍下唯一可用的通道,是主通道;
//   ② **颜色**(色条 / 色点)—— 第二通道;
//   ③ **悬停**(title 里的项目名 + 相对路径)—— 补充。
// 本模块只负责第 ② 条的「项目 → 色号」与「项目 → 绑定类名」。
//
// **按路径取号,不是按 id、不是按打开顺序、不是随机**:候选目录(ProjectCandidate)没有 id、
// 只有 path,而候选列表与已打开项目用的是同一套 path;按 path 取号才能让「候选 → 打开」
// 颜色完全不跳变,并且重启后不改变。哈希撞号是**允许**的 —— 文字通道(缩写)能兜底区分,
// 故不需要保证一一对应,也就不引入会随项目数量漂移的分配表。
import type { Project } from '../contracts/generated/project'

// 与 style.css 的 --dl-identity-1…8 一一对应的色号数量。改这里必须同步改绑定类。
export const IDENTITY_COUNT = 8

// 字符串 → 非负整数(FNV-1a 的简化变体)。确定性、跨进程稳定。
function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

// 项目路径 → 色号(1…8)。
export function identityIndexOf(path: string): number {
  return (hashString(path) % IDENTITY_COUNT) + 1
}

// 项目路径 → 标识色绑定类名(挂在元素外层;内部样式只引用 var(--dl-identity))。
export function identityClassOf(path: string): string {
  return `dl-identity-${identityIndexOf(path)}`
}

// 一处归属标识所需的全部信息:缩写(文字通道)+ 名称 + 路径(悬停)+ 绑定类名(颜色通道)。
export interface ProjectBadge {
  mark: string
  name: string
  path: string
  identityClass: string
}

export function projectBadge(project: Project): ProjectBadge {
  return { mark: project.mark, name: project.name, path: project.path, identityClass: identityClassOf(project.path) }
}

// 项目 id → 标识(供 tab / 悬浮窗按窗体的 projectId 回查)。项目不在已打开集合里时返回 undefined。
export function badgeMapOf(projects: readonly Project[]): Map<string, ProjectBadge> {
  return new Map(projects.map((project) => [project.id, projectBadge(project)]))
}
