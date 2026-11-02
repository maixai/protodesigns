// 继承 Agent 与项目自有 MCP 的内存仓库;两种 scope 独立存储,刷新即重置。
import type { McpProjectGroup } from '../contracts/generated/mcp-project-group'
import type { McpServer, McpServerStatusId, McpTool } from '../contracts/generated/mcp-server'
import type { McpServerInput } from '../contracts/generated/mcp-server-input'

interface StoredServer {
  server: McpServer
  baseStatus: McpServerStatusId
}

function normalizeSdkSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_')
}

function tools(serverName: string, entries: readonly (readonly [string, string])[]): McpTool[] {
  return entries.map(([name, description]) => ({
    name,
    description,
    qualifiedName: `mcp__${normalizeSdkSegment(serverName)}__${normalizeSdkSegment(name)}`,
  }))
}

const githubTools = tools('github', [
  ['list_issues', 'List issues in a GitHub repository.'],
  ['get_issue', 'Read an issue and its comments.'],
  ['create_issue', 'Create a new issue.'],
  ['update_issue', 'Update issue fields and state.'],
  ['list_pull_requests', 'List pull requests with filters.'],
  ['get_pull_request', 'Read a pull request and its metadata.'],
  ['create_pull_request', 'Open a pull request from a branch.'],
  ['merge_pull_request', 'Merge an approved pull request.'],
  ['get_file_contents', 'Read a file from a repository.'],
  ['create_or_update_file', 'Commit a file change to a branch.'],
  ['search_code', 'Search code across GitHub repositories.'],
  ['list_commits', 'List commits on a branch.'],
])
const filesystemTools = tools('filesystem', [
  ['read_text_file', 'Read a UTF-8 text file.'],
  ['read_multiple_files', 'Read several files in one operation.'],
  ['write_file', 'Create or overwrite a file.'],
  ['edit_file', 'Apply targeted edits to a text file.'],
  ['create_directory', 'Create a directory and its parents.'],
  ['list_directory', 'List files and directories.'],
  ['directory_tree', 'Return a recursive directory tree.'],
  ['search_files', 'Find files by name or glob pattern.'],
])
const sentryTools = tools('sentry', [
  ['list_issues', 'List unresolved Sentry issues for a project.'],
  ['get_issue', 'Read an issue with its latest event.'],
  ['get_event', 'Inspect a Sentry event and stack trace.'],
  ['list_releases', 'List releases and adoption details.'],
])
const postgresTools = tools('postgres', [
  ['query', 'Run a read-only SQL query.'],
  ['list_tables', 'List tables in the connected database.'],
  ['describe_table', 'Inspect columns and indexes for a table.'],
])
const notionTools = tools('notion', [
  ['search', 'Search pages and databases in Notion.'],
  ['fetch_page', 'Read a page and its block content.'],
  ['create_page', 'Create a page in a parent page or database.'],
  ['update_page', 'Update page properties and content.'],
  ['query_database', 'Query a Notion database with filters.'],
])
const braveTools = tools('brave-search', [
  ['brave_web_search', 'Search the web with Brave Search.'],
  ['brave_local_search', 'Search local businesses and places.'],
])
const playwrightTools = tools('playwright', [
  ['browser_navigate', 'Navigate a browser page to a URL.'],
  ['browser_snapshot', 'Capture the current accessibility tree.'],
  ['browser_click', 'Click an element on the current page.'],
  ['browser_take_screenshot', 'Capture a screenshot of the page.'],
])

const catalog: Record<string, McpServer> = {
  github: {
    id: 'catalog:github', name: 'github', displayName: 'GitHub',
    description: 'Issues, pull requests, repository files, and code search.',
    scope: 'agent', ownerId: '', transport: 'http', endpoint: 'https://api.githubcopilot.com/mcp/',
    enabled: true, status: 'connected', errorMessage: '', tools: githubTools,
  },
  filesystem: {
    id: 'catalog:filesystem', name: 'filesystem', displayName: 'Filesystem',
    description: 'Read, search, and edit files inside approved directories.',
    scope: 'agent', ownerId: '', transport: 'stdio', endpoint: 'npx -y @modelcontextprotocol/server-filesystem ~/work',
    enabled: true, status: 'connected', errorMessage: '', tools: filesystemTools,
  },
  sentry: {
    id: 'catalog:sentry', name: 'sentry', displayName: 'Sentry',
    description: 'Investigate production issues, events, stack traces, and releases.',
    scope: 'agent', ownerId: '', transport: 'http', endpoint: 'https://mcp.sentry.dev/mcp',
    enabled: true, status: 'needsAuth', errorMessage: '', tools: sentryTools,
  },
  postgres: {
    id: 'catalog:postgres', name: 'postgres', displayName: 'PostgreSQL',
    description: 'Inspect schemas and run read-only queries against a database.',
    scope: 'agent', ownerId: '', transport: 'stdio', endpoint: 'npx -y @modelcontextprotocol/server-postgres postgresql://localhost:5432/weekly',
    enabled: true, status: 'failed',
    errorMessage: 'Connection refused. Start PostgreSQL, then reconnect.',
    tools: postgresTools,
  },
  notion: {
    id: 'catalog:notion', name: 'notion', displayName: 'Notion',
    description: 'Search, read, and update Notion pages and databases.',
    scope: 'agent', ownerId: '', transport: 'http', endpoint: 'https://mcp.notion.com/mcp',
    enabled: true, status: 'needsAuth', errorMessage: '', tools: notionTools,
  },
  'brave-search': {
    id: 'catalog:brave-search', name: 'brave-search', displayName: 'Brave Search',
    description: 'Web and local search with fresh, cited results.',
    scope: 'agent', ownerId: '', transport: 'stdio', endpoint: 'npx -y @modelcontextprotocol/server-brave-search',
    enabled: true, status: 'connected', errorMessage: '', tools: braveTools,
  },
  playwright: {
    id: 'catalog:playwright', name: 'playwright', displayName: 'Playwright',
    description: 'Drive a browser for navigation, inspection, and screenshots.',
    scope: 'agent', ownerId: '', transport: 'stdio', endpoint: 'npx -y @playwright/mcp@latest',
    enabled: true, status: 'connected', errorMessage: '', tools: playwrightTools,
  },
}

function cloneServer(server: McpServer): McpServer {
  return structuredClone(server)
}

function agentServer(name: string, agentId: string, baseStatus?: McpServerStatusId, enabled = true): StoredServer {
  const definition = catalog[name]
  if (definition === undefined) throw new Error(`Unknown MCP catalog entry: ${name}`)
  const status = enabled ? baseStatus ?? definition.status : 'disabled'
  return {
    baseStatus: baseStatus ?? definition.status,
    server: {
      ...cloneServer(definition), id: `agent:${agentId}:${name}`, scope: 'agent', ownerId: agentId,
      enabled, status, errorMessage: status === 'failed' ? definition.errorMessage : '',
    },
  }
}

function projectServer(name: string, path: string, baseStatus?: McpServerStatusId, enabled = true): StoredServer {
  const definition = catalog[name]
  if (definition === undefined) throw new Error(`Unknown MCP catalog entry: ${name}`)
  const status = enabled ? baseStatus ?? definition.status : 'disabled'
  return {
    baseStatus: baseStatus ?? definition.status,
    server: {
      ...cloneServer(definition), id: `project:${path}:${name}`, scope: 'project', ownerId: path,
      enabled, status, errorMessage: status === 'failed' ? definition.errorMessage : '',
    },
  }
}

const agentStore = new Map<string, StoredServer[]>([
  ['planning', [
    agentServer('github', 'planning'),
    agentServer('filesystem', 'planning'),
    agentServer('sentry', 'planning'),
    agentServer('postgres', 'planning'),
  ]],
  ['research', [
    agentServer('brave-search', 'research'),
    agentServer('notion', 'research'),
    agentServer('postgres', 'research'),
  ]],
  ['writing', [
    agentServer('notion', 'writing', 'connected'),
    agentServer('github', 'writing', 'connected', false),
    agentServer('filesystem', 'writing'),
  ]],
])

const projectStore = new Map<string, StoredServer[]>([
  ['~/work/weekly-report', [
    projectServer('filesystem', '~/work/weekly-report'),
    projectServer('github', '~/work/weekly-report', 'needsAuth'),
    projectServer('playwright', '~/work/weekly-report', 'connected', false),
  ]],
  ['~/work/knowledge-base', []],
  ['~/work/user-research', [
    projectServer('notion', '~/work/user-research'),
    projectServer('filesystem', '~/work/user-research'),
  ]],
  ['~/work/benchmarks', [projectServer('filesystem', '~/work/benchmarks')]],
  ['~/work/product-docs', [
    projectServer('github', '~/work/product-docs'),
    projectServer('notion', '~/work/product-docs'),
  ]],
  ['~/work/changelog', [projectServer('github', '~/work/changelog')]],
])

function ensureProject(path: string): StoredServer[] {
  const existing = projectStore.get(path)
  if (existing !== undefined) return existing
  const created: StoredServer[] = []
  projectStore.set(path, created)
  return created
}

function customServer(input: McpServerInput, scope: 'agent' | 'project', ownerId: string): StoredServer {
  return {
    baseStatus: 'connected',
    server: {
      id: `${scope}:${ownerId}:${input.name}`,
      name: input.name,
      displayName: input.displayName || input.name,
      description: scope === 'agent' ? 'Custom MCP server configured for this Agent.' : 'Custom MCP server configured for this project.',
      scope, ownerId, transport: input.transport, endpoint: input.endpoint,
      enabled: true, status: 'connected', errorMessage: '',
      tools: tools(input.name, [
        ['ping', 'Check whether the MCP server responds.'],
        ['list_resources', 'List resources exposed by this server.'],
      ]),
    },
  }
}

export function mockListAgentMcpServers(agentId: string): McpServer[] {
  return (agentStore.get(agentId) ?? []).map((entry) => cloneServer(entry.server))
}

export function mockAddAgentMcpServer(agentId: string, input: McpServerInput): McpServer[] {
  const entries = agentStore.get(agentId) ?? []
  entries.push(customServer(input, 'agent', agentId))
  agentStore.set(agentId, entries)
  return mockListAgentMcpServers(agentId)
}

export function mockRemoveAgentMcpServer(agentId: string, serverId: string): McpServer[] {
  const entries = agentStore.get(agentId) ?? []
  agentStore.set(agentId, entries.filter((entry) => entry.server.id !== serverId))
  return mockListAgentMcpServers(agentId)
}

export function mockSetAgentMcpServerEnabled(agentId: string, serverId: string, enabled: boolean): McpServer[] {
  const entry = (agentStore.get(agentId) ?? []).find((item) => item.server.id === serverId)
  if (entry !== undefined) {
    entry.server.enabled = enabled
    entry.server.status = enabled ? entry.baseStatus : 'disabled'
    entry.server.errorMessage = enabled && entry.baseStatus === 'failed' ? catalog[entry.server.name]?.errorMessage ?? '' : ''
  }
  return mockListAgentMcpServers(agentId)
}

export function mockConnectAgentMcpServer(agentId: string, serverId: string): McpServer[] {
  const entry = (agentStore.get(agentId) ?? []).find((item) => item.server.id === serverId)
  if (entry !== undefined) {
    entry.baseStatus = 'connected'
    entry.server.status = 'connected'
    entry.server.errorMessage = ''
    if (entry.server.tools.length === 0) entry.server.tools = tools(entry.server.name, [['ping', 'Check whether the MCP server responds.']])
  }
  return mockListAgentMcpServers(agentId)
}

export function mockListProjectMcpServers(path: string): McpProjectGroup {
  return { path, servers: ensureProject(path).map((entry) => cloneServer(entry.server)) }
}

export function mockSaveProjectMcpGroup(path: string, servers: readonly McpServer[]): McpProjectGroup {
  const existingEntries = ensureProject(path)
  projectStore.set(path, servers.map((server) => {
    const existing = existingEntries.find((entry) => entry.server.id === server.id)
    const baseStatus = existing?.baseStatus ?? (server.status === 'disabled' ? 'connected' : server.status)
    const status = server.enabled ? baseStatus : 'disabled'
    return {
      baseStatus,
      server: cloneServer({
        ...server, scope: 'project', ownerId: path, status,
        errorMessage: server.enabled && baseStatus === 'failed' ? catalog[server.name]?.errorMessage ?? '' : '',
      }),
    }
  }))
  return mockListProjectMcpServers(path)
}

export function mockAddProjectMcpServer(path: string, input: McpServerInput): McpProjectGroup {
  ensureProject(path).push(customServer(input, 'project', path))
  return mockListProjectMcpServers(path)
}

export function mockRemoveProjectMcpServer(path: string, serverId: string): McpProjectGroup {
  projectStore.set(path, ensureProject(path).filter((entry) => entry.server.id !== serverId))
  return mockListProjectMcpServers(path)
}

export function mockSetProjectMcpServerEnabled(path: string, serverId: string, enabled: boolean): McpProjectGroup {
  const entry = ensureProject(path).find((item) => item.server.id === serverId)
  if (entry !== undefined) {
    entry.server.enabled = enabled
    entry.server.status = enabled ? entry.baseStatus : 'disabled'
    entry.server.errorMessage = enabled && entry.baseStatus === 'failed' ? catalog[entry.server.name]?.errorMessage ?? '' : ''
  }
  return mockListProjectMcpServers(path)
}

export function mockConnectProjectMcpServer(path: string, serverId: string): McpProjectGroup {
  const entry = ensureProject(path).find((item) => item.server.id === serverId)
  if (entry !== undefined) {
    entry.baseStatus = 'connected'
    entry.server.status = 'connected'
    entry.server.errorMessage = ''
    if (entry.server.tools.length === 0) entry.server.tools = tools(entry.server.name, [['ping', 'Check whether the MCP server responds.']])
  }
  return mockListProjectMcpServers(path)
}
