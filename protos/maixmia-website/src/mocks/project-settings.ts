// 项目模型覆盖的内存仓库:主键是目录 path。权限与 MCP 各自有独立仓库。
import type { ProjectModelSettings } from '../contracts/generated/project-model-settings'

export function emptyProjectModelSettings(path: string): ProjectModelSettings {
  return { path, model: {} }
}

const settingsStore = new Map<string, ProjectModelSettings>([
  ['~/work/weekly-report', {
    path: '~/work/weekly-report',
    model: {
      sourceId: 'subscription:claude-personal',
      modelId: 'claude-sonnet-5-5-1m',
      effortLevel: 'high',
      fallbackModelIds: ['claude-haiku-5-5'],
      autoCompactWindowTokens: 400_000,
      alwaysThinkingEnabled: true,
    },
  }],
  ['~/work/user-research', {
    path: '~/work/user-research',
    model: { effortLevel: '' },
  }],
])

export function mockProjectModelSettings(path: string): ProjectModelSettings {
  return structuredClone(settingsStore.get(path) ?? emptyProjectModelSettings(path))
}

export function mockSaveProjectModelSettings(path: string, settings: ProjectModelSettings): ProjectModelSettings {
  const next = structuredClone(settings)
  next.path = path
  settingsStore.set(path, next)
  return structuredClone(next)
}
