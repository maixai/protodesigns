import { describe, expect, it } from 'vitest'
import { completeProjectModelOverrides, hasProjectModelCustomValues, projectModelSupportsEffort, resolveProjectModelSource, validateProjectModelOverrides } from '../../src/data/project-model-settings'
import { defaultAgentModelConfig } from '../../src/mocks/workspace'

describe('project-model-settings', () => {
  it('validates the inherited Agent fallback chain against the project source', () => {
    const config = defaultAgentModelConfig()
    config.defaultModelId = 'gpt-5.5'
    config.defaultEffortLevel = ''
    config.fallbackModelIds = ['claude-haiku-5-5']
    const result = validateProjectModelOverrides({
      sourceId: 'subscription:chatgpt-personal',
      modelId: 'gpt-5.5',
      effortLevel: '',
    }, config)
    expect(result.fallbackIssue).toBe('unavailable')
    expect(result.isValid).toBe(false)
  })

  it('rejects a pinned source that cannot resolve Agent tier references', () => {
    const result = resolveProjectModelSource({ sourceId: 'gateway:litellm' }, defaultAgentModelConfig())
    expect(result.issue).toBe('incompatible')
    expect(result.incompatibleModelIds).toContain('claude-fable-5-1')
  })

  it('does not infer effort support for unknown gateway models', () => {
    expect(projectModelSupportsEffort('anthropic/claude-sonnet-5')).toBe(false)
    expect(projectModelSupportsEffort('gpt-custom')).toBe(false)
  })

  it('treats legacy partial values as custom and completes only missing fields', () => {
    const config = defaultAgentModelConfig()
    const result = completeProjectModelOverrides({ effortLevel: '' }, config)
    expect(hasProjectModelCustomValues({ effortLevel: '' })).toBe(true)
    expect(hasProjectModelCustomValues({ followAgent: true })).toBe(false)
    expect(result).toEqual({
      followAgent: false,
      sourceId: config.source.activeSourceId,
      modelId: config.defaultModelId,
      effortLevel: '',
      fallbackModelIds: config.fallbackModelIds,
      autoCompactWindowTokens: config.autoCompactWindowTokens,
      alwaysThinkingEnabled: false,
    })
  })

  it('ignores retained invalid custom values while following the Agent', () => {
    const config = defaultAgentModelConfig()
    const result = validateProjectModelOverrides({
      followAgent: true,
      sourceId: 'gateway:removed',
      modelId: '',
      effortLevel: 'not-a-level',
      fallbackModelIds: ['', '', '', ''],
    }, config)
    expect(result.source.id).toBe(config.source.activeSourceId)
    expect(result.isValid).toBe(true)
  })
})
