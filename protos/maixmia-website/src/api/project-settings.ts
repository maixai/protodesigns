// 项目模型设置 API:只读写模型覆盖,业务失败统一走 Result。
import type { AgentModelConfig } from '../contracts/generated/agent-model-config'
import type { ProjectModelSettings } from '../contracts/generated/project-model-settings'
import { validateProjectModelOverrides } from '../data/project-model-settings'
import { useI18n } from '../i18n'
import { delay } from '../mocks/delay'
import { mockProjectModelSettings, mockSaveProjectModelSettings } from '../mocks/project-settings'
import { currentRoute } from '../router'
import type { Result } from './result'

const { t } = useI18n()

export async function getProjectModelSettings(path: string): Promise<Result<ProjectModelSettings>> {
  await delay()
  if (currentRoute.value.demoState === 'error') return { ok: false, error: new Error(t.value.workspace.projectSettings.loadError) }
  if (path.trim() === '') return { ok: false, error: new Error(t.value.workspace.invalidProject) }
  return { ok: true, value: mockProjectModelSettings(path) }
}

function validationError(path: string, settings: ProjectModelSettings, agentModel: AgentModelConfig): Error | null {
  const copy = t.value.workspace.projectSettings
  if (path.trim() === '' || settings.path !== path) return new Error(t.value.workspace.invalidProject)
  if (settings.model.followAgent === true) return null
  const model = validateProjectModelOverrides(settings.model, agentModel)
  if (model.source.issue === 'missing') return new Error(copy.sourceMissing.replace('{id}', model.source.id))
  if (model.source.issue === 'unavailable') return new Error(copy.sourceUnavailable)
  if (model.source.issue === 'empty') return new Error(copy.sourceEmpty)
  if (model.source.issue === 'incompatible') return new Error(copy.sourceIncompatible.replace('{models}', model.source.incompatibleModelIds.join(', ')))
  if (model.modelIssue === 'required') return new Error(copy.modelRequired)
  if (model.modelIssue === 'unavailable') return new Error(copy.modelUnavailable)
  if (model.effortIssue === 'invalid') return new Error(copy.effortInvalid)
  if (model.effortIssue === 'unsupported') return new Error(copy.effortUnsupported)
  if (model.fallbackIssue === 'invalid') return new Error(copy.fallbackInvalid)
  if (model.fallbackIssue === 'unavailable') return new Error(copy.fallbackUnavailable)
  const compact = settings.model.autoCompactWindowTokens
  if (compact !== undefined && compact !== 0 && (compact < 100_000 || compact > 1_000_000)) return new Error(copy.compactWindowInvalid)
  return null
}

export async function saveProjectModelSettings(path: string, settings: ProjectModelSettings, agentModel: AgentModelConfig): Promise<Result<ProjectModelSettings>> {
  await delay()
  if (currentRoute.value.demoState === 'error') return { ok: false, error: new Error(t.value.workspace.projectSettings.saveError) }
  const invalid = validationError(path, settings, agentModel)
  if (invalid !== null) return { ok: false, error: invalid }
  return { ok: true, value: mockSaveProjectModelSettings(path, settings) }
}
