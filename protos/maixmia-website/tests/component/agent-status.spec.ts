import { describe, expect, it } from 'vitest'
import { agentDisplayStatus } from '../../src/data/agent-status'
import { zhCN } from '../../src/i18n/messages/zh-CN'
import { mockAgentSummaries } from '../../src/mocks/workspace'

const copy = zhCN.workspace
const now = Date.parse('2026-10-30T12:00:00.000Z')
const agents = mockAgentSummaries()
const planning = agents.find((agent) => agent.id === 'planning')
const research = agents.find((agent) => agent.id === 'research')

describe('agentDisplayStatus', () => {
  it('在线只给标签,不产生 Tooltip 文案', () => {
    expect(planning).toBeDefined()
    if (planning === undefined) return
    const status = agentDisplayStatus(planning, copy, 'zh-CN', now)
    expect(status.state).toBe('online')
    expect(status.label).toBe('在线')
    expect(status.tooltip).toBe('在线')
  })

  it('离线带相对最后在线时间', () => {
    expect(research).toBeDefined()
    if (research === undefined) return
    const status = agentDisplayStatus(research, copy, 'zh-CN', now)
    expect(status.state).toBe('offline')
    expect(status.label).toBe('离线')
    expect(status.tooltip).toContain('最后在线')
  })

  it('认证失败优先于离线', () => {
    expect(research).toBeDefined()
    if (research === undefined) return
    const status = agentDisplayStatus(
      { ...research, identity: { ...research.identity, trustState: 'keyChanged' } },
      copy,
      'zh-CN',
      now,
    )
    expect(status.state).toBe('authenticationFailed')
    expect(status.label).toBe('认证失败')
    expect(status.tooltip).toContain('需要重新配对')
  })
})
