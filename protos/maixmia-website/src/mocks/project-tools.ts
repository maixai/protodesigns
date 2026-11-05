// 覆盖仅存于项目内存仓库,从不写 Agent 安装记录或服务器定义。
import type { ProjectToolOverrides } from '../contracts/generated/project-tool-overrides'
const store = new Map<string, ProjectToolOverrides>()
export function mockProjectToolOverrides(path: string): ProjectToolOverrides {
  const saved = store.get(path)
  return saved ? structuredClone(saved) : { path, plugins: [], mcp: [] }
}
export function mockSetProjectToolOverride(path: string, kind: 'plugins' | 'mcp', key: string, enabled: boolean | null): ProjectToolOverrides {
  const next = mockProjectToolOverrides(path)
  next[kind] = next[kind].filter((item) => item.key !== key)
  if (enabled !== null) next[kind].push({ key, enabled })
  store.set(path, next)
  return mockProjectToolOverrides(path)
}
