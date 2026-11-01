import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectPermissionDialog from '../../src/components/project-permission-dialog.vue'
import ProjectMcpDialog from '../../src/components/project-mcp-dialog.vue'
import * as permissionApi from '../../src/api/agent-permissions'
import * as mcpApi from '../../src/api/agent-mcp'
import { mockAgentSummaries, mockProjects } from '../../src/mocks/workspace'
import { mockListProjectPermissionGroup } from '../../src/mocks/agent-permissions'
import { mockListProjectMcpServers } from '../../src/mocks/agent-mcp'
import { useI18n } from '../../src/i18n'

vi.mock('../../src/api/agent-permissions', () => ({ listProjectPermissionGroup: vi.fn(), saveProjectPermissionGroup: vi.fn() }))
vi.mock('../../src/api/agent-mcp', () => ({
  listProjectMcpServers: vi.fn(), saveProjectMcpGroup: vi.fn(), authenticateProjectMcpServer: vi.fn(), reconnectProjectMcpServer: vi.fn(),
}))
const agent = mockAgentSummaries()[0]
const project = agent === undefined ? undefined : mockProjects(agent.id)[0]
if (agent === undefined || project === undefined) throw new Error('Missing project config fixture')
const stubs = { ProjectConfigShell: { template: '<div><slot /><slot name="footer" /></div>' }, AgentReadonlyContext: true }

describe('project configuration drafts', () => {
  beforeEach(() => {
    useI18n().setLocale('zh-CN')
    vi.mocked(permissionApi.listProjectPermissionGroup).mockImplementation(async (path) => ({ ok: true, value: mockListProjectPermissionGroup(path) }))
    vi.mocked(permissionApi.saveProjectPermissionGroup).mockImplementation(async (_path, value) => ({ ok: true, value }))
    vi.mocked(mcpApi.listProjectMcpServers).mockImplementation(async (path) => ({ ok: true, value: mockListProjectMcpServers(path) }))
    vi.mocked(mcpApi.saveProjectMcpGroup).mockImplementation(async (path, servers) => ({ ok: true, value: { path, servers: structuredClone(servers) } }))
    vi.mocked(mcpApi.authenticateProjectMcpServer).mockImplementation(async (path) => {
      const group = mockListProjectMcpServers(path)
      return { ok: true, value: { ...group, servers: group.servers.map((server) => server.name === 'github' ? { ...server, status: 'connected' as const } : server) } }
    })
  })
  afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = '' })

  it('keeps project permission edits in a draft until the single save action', async () => {
    const wrapper = mount(ProjectPermissionDialog, { props: { open: true, agent, project }, global: { stubs } })
    await flushPromises()
    await flushPromises()
    await wrapper.get('.permission-editor [data-mode-trigger]').trigger('click')
    await wrapper.get('.permission-editor [data-mode="default"]').trigger('click')
    expect(permissionApi.saveProjectPermissionGroup).not.toHaveBeenCalled()
    await wrapper.get('.project-config__buttons .dl-btn--primary').trigger('click')
    await flushPromises()
    expect(permissionApi.saveProjectPermissionGroup).toHaveBeenCalledWith(project.path, expect.objectContaining({ modeOverride: 'default' }))
    wrapper.unmount()
  })

  it('disables connection actions for an unsaved MCP edit and enables them after saving', async () => {
    const wrapper = mount(ProjectMcpDialog, { props: { open: true, agent, project }, global: { stubs } })
    await flushPromises()
    await flushPromises()
    const github = wrapper.get('[data-server-id="project:~/work/weekly-report:github"]')
    const connect = github.get('.project-mcp__connection button')
    expect(connect.attributes('disabled')).toBeUndefined()
    await github.findAll('input')[1]?.setValue('GitHub Project')
    expect(connect.attributes('disabled')).toBeDefined()
    expect(mcpApi.authenticateProjectMcpServer).not.toHaveBeenCalled()
    await wrapper.get('.project-config__buttons .dl-btn--primary').trigger('click')
    await flushPromises()
    expect(connect.attributes('disabled')).toBeUndefined()
    await connect.trigger('click')
    await flushPromises()
    expect(mcpApi.authenticateProjectMcpServer).toHaveBeenCalledWith(project.path, 'project:~/work/weekly-report:github')
    wrapper.unmount()
  })
})
