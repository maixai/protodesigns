import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectMcpPanel from '../../src/components/project-mcp-panel.vue'
import * as mcpApi from '../../src/api/agent-mcp'
import { mockListAgentMcpServers, mockListProjectMcpServers } from '../../src/mocks/agent-mcp'
import { mockAgentSummaries, mockProjects } from '../../src/mocks/workspace'
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/agent-mcp', () => ({
  listProjectMcpServers: vi.fn(),
  saveProjectMcpGroup: vi.fn(),
  authenticateProjectMcpServer: vi.fn(),
  reconnectProjectMcpServer: vi.fn(),
  listAgentMcpServers: vi.fn(),
}))

const agent = mockAgentSummaries()[0]
const project = agent === undefined ? undefined : mockProjects(agent.id)[0]
if (agent === undefined || project === undefined) throw new Error('Missing project MCP fixture')

function mountPanel(): VueWrapper {
  return mount(ProjectMcpPanel, { props: { agent, project }, attachTo: document.body })
}

async function settle(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

describe('project-mcp-panel', () => {
  beforeEach(() => {
    useI18n().setLocale('zh-CN')
    vi.mocked(mcpApi.listProjectMcpServers).mockImplementation(async (path) => ({ ok: true, value: mockListProjectMcpServers(path) }))
    vi.mocked(mcpApi.listAgentMcpServers).mockImplementation(async (id) => ({ ok: true, value: mockListAgentMcpServers(id) }))
    vi.mocked(mcpApi.saveProjectMcpGroup).mockImplementation(async (path, servers) => ({ ok: true, value: { path, servers: structuredClone(servers) } }))
    vi.mocked(mcpApi.authenticateProjectMcpServer).mockImplementation(async (path, serverId) => {
      const group = mockListProjectMcpServers(path)
      const next = group.servers.map((server) => server.id === serverId ? { ...server, status: 'connected' as const } : server)
      return { ok: true, value: { path, servers: next } }
    })
  })
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('reports draft state, keeps Agent context read-only and marks same-name overrides', async () => {
    const wrapper = mountPanel()
    await settle()
    expect(wrapper.findAll('.project-mcp__server')).toHaveLength(3)
    expect(wrapper.find('.agent-context[data-kind="mcp"]').exists()).toBe(true)
    expect(wrapper.get('[data-server-id="project:~/work/weekly-report:github"]').text()).toContain('覆盖 Agent 同名')
    expect(wrapper.emitted('state')?.at(-1)?.[0]).toMatchObject({ dirty: false, canSave: false })

    const github = wrapper.get('[data-server-id="project:~/work/weekly-report:github"]')
    await github.findAll('input')[1]?.setValue('GitHub Project')
    expect(wrapper.emitted('state')?.at(-1)?.[0]).toMatchObject({ dirty: true, canSave: true })
    await wrapper.vm.save()
    await settle()
    expect(mcpApi.saveProjectMcpGroup).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('state')?.at(-1)?.[0]).toMatchObject({ dirty: false, saveState: 'saved' })
    wrapper.unmount()
  })

  it('requires a clean saved server before authenticating and keeps connection immediate', async () => {
    const wrapper = mountPanel()
    await settle()
    const github = wrapper.get('[data-server-id="project:~/work/weekly-report:github"]')
    const connect = github.get('.project-mcp__connection button')
    expect(connect.attributes('disabled')).toBeUndefined()
    await github.findAll('input')[1]?.setValue('GitHub Project')
    expect(connect.attributes('disabled')).toBeDefined()
    expect(github.get('.project-mcp__connection').text()).toContain('先保存配置')

    await wrapper.vm.save()
    await settle()
    expect(connect.attributes('disabled')).toBeUndefined()
    await connect.trigger('click')
    await settle()
    expect(mcpApi.authenticateProjectMcpServer).toHaveBeenCalledWith(project.path, 'project:~/work/weekly-report:github')
    expect(github.text()).toContain('已连接')
    expect(wrapper.emitted('state')?.at(-1)?.[0]).toMatchObject({ dirty: false })
    wrapper.unmount()
  })

  it('adds to the draft and lets the shared footer own persistence', async () => {
    const wrapper = mountPanel()
    await settle()
    await wrapper.get('.project-mcp__section-head button').trigger('click')
    const form = wrapper.get('.project-mcp__add')
    await form.findAll('input')[0]?.setValue('linear')
    await form.findAll('input')[2]?.setValue('npx -y @example/linear')
    await form.trigger('submit')
    expect(wrapper.findAll('.project-mcp__server')).toHaveLength(4)
    expect(mcpApi.saveProjectMcpGroup).not.toHaveBeenCalled()
    expect(wrapper.emitted('state')?.at(-1)?.[0]).toMatchObject({ dirty: true, canSave: true })
    wrapper.unmount()
  })
})
