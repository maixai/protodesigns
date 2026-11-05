// 表单、JSON 与 API 共用的闭集校验;不展开变量,不读取任何凭据。
import type { McpConfig, McpHttpConfig, McpSseConfig, McpOAuthConfig, McpServerInput, McpStringMap } from '../contracts/generated/mcp-server-input'
import type { McpServer, McpTransportId } from '../contracts/generated/mcp-server'
import type { McpFormDraft } from '../contracts/generated/mcp-form-draft'
import type { Result } from '../api/result'
import { useI18n } from '../i18n'

const { t } = useI18n()
function invalid(field: string): Error { return new Error(t.value.workspace.mcp.invalidConfig.replace('{field}', field)) }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function unexpected(value: Record<string, unknown>, keys: readonly string[], prefix = ''): Error | null {
  const key = Object.keys(value).find((entry) => !keys.includes(entry))
  return key === undefined ? null : new Error(t.value.workspace.mcp.unknownField.replace('{field}', `${prefix}${key}`))
}
function stringMap(value: unknown, field: string): Result<McpStringMap> {
  if (!isObject(value)) return { ok: false, error: invalid(field) }
  const entries = Object.entries(value)
  const result: McpStringMap = {}
  for (const [key, item] of entries) {
    if (typeof item !== 'string') return { ok: false, error: invalid(`${field}.${key}`) }
    Object.defineProperty(result, key, { value: item, enumerable: true, writable: true, configurable: true })
  }
  return { ok: true, value: result }
}
function oauthConfig(value: unknown): Result<McpOAuthConfig> {
  if (!isObject(value)) return { ok: false, error: invalid('oauth') }
  const extra = unexpected(value, ['clientId', 'callbackPort', 'authServerMetadataUrl', 'scopes'], 'oauth.')
  if (extra) return { ok: false, error: extra }
  const result: McpOAuthConfig = {}
  for (const key of ['clientId', 'authServerMetadataUrl', 'scopes'] satisfies (keyof McpOAuthConfig)[]) {
    const item = value[key]
    if (item !== undefined) {
      if (typeof item !== 'string') return { ok: false, error: invalid(`oauth.${key}`) }
      if (key === 'clientId') result.clientId = item
      if (key === 'scopes') result.scopes = item
      if (key === 'authServerMetadataUrl') {
        if (!isHttps(item)) return { ok: false, error: new Error(t.value.workspace.mcp.invalidMetadata) }
        result.authServerMetadataUrl = item
      }
    }
  }
  if (value['callbackPort'] !== undefined) {
    const port = value['callbackPort']
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: new Error(t.value.workspace.mcp.invalidPort) }
    result.callbackPort = port
  }
  return { ok: true, value: result }
}
function isHttps(value: string): boolean {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
export function validateMcpConfig(value: unknown, allowEmptyEndpoint = false): Result<McpConfig> {
  if (!isObject(value)) return { ok: false, error: invalid('server object') }
  const type = value['type'] === 'streamable-http' ? 'http' : value['type'] ?? 'stdio'
  if (type !== 'stdio' && type !== 'http' && type !== 'sse') return { ok: false, error: invalid('type') }
  const extra = unexpected(value, type === 'stdio' ? ['type', 'command', 'args', 'env', 'timeout'] : ['type', 'url', 'headers', 'oauth', 'timeout'])
  if (extra) return { ok: false, error: extra }
  const timeout = value['timeout']
  if (timeout !== undefined && (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 1000)) return { ok: false, error: new Error(t.value.workspace.mcp.invalidTimeout) }
  const common = typeof timeout === 'number' ? { timeout } : {}
  if (type === 'stdio') {
    const command = value['command']
    if (typeof command !== 'string' || (!allowEmptyEndpoint && command.trim() === '')) return { ok: false, error: invalid('command') }
    const config: McpConfig = { ...common, ...(value['type'] === undefined ? {} : { type: 'stdio' }), command }
    const args = value['args']
    if (args !== undefined) {
      if (!Array.isArray(args) || !args.every((item: unknown): item is string => typeof item === 'string')) return { ok: false, error: invalid('args (string[])') }
      config.args = [...args]
    }
    if (value['env'] !== undefined) {
      const env = stringMap(value['env'], 'env')
      if (!env.ok) return env
      config.env = env.value
    }
    return { ok: true, value: config }
  }
  const url = value['url']
  if (typeof url !== 'string' || (!allowEmptyEndpoint && url.trim() === '')) return { ok: false, error: invalid('url') }
  const config: McpHttpConfig | McpSseConfig = { ...common, type, url }
  if (value['headers'] !== undefined) {
    const headers = stringMap(value['headers'], 'headers')
    if (!headers.ok) return headers
    config.headers = headers.value
  }
  if (value['oauth'] !== undefined) {
    const oauth = oauthConfig(value['oauth'])
    if (!oauth.ok) return oauth
    config.oauth = oauth.value
  }
  return { ok: true, value: config }
}

// 可单独粘贴 .mcp.json,但只接收一个条目且名称始终由独立字段管理。
export function parseMcpJson(text: string, name: string, displayName: string): Result<McpServerInput> {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (error: unknown) {
    return { ok: false, error: new Error(t.value.workspace.mcp.invalidJson.replace('{detail}', error instanceof Error ? error.message : 'JSON')) }
  }
  let resolvedName = name
  if (isObject(parsed) && 'mcpServers' in parsed) {
    const extra = unexpected(parsed, ['mcpServers'])
    if (extra) return { ok: false, error: extra }
    const entries = isObject(parsed['mcpServers']) ? Object.entries(parsed['mcpServers']) : []
    const entry = entries[0]
    if (entries.length !== 1 || entry === undefined) return { ok: false, error: new Error(t.value.workspace.mcp.wrapperSingle) }
    if (name !== '' && name !== entry[0]) return { ok: false, error: new Error(t.value.workspace.mcp.wrapperName) }
    resolvedName = entry[0]
    parsed = entry[1]
  }
  const config = validateMcpConfig(parsed)
  return config.ok ? { ok: true, value: { name: resolvedName, displayName, config: config.value } } : config
}
export function validateMcpInput(input: McpServerInput, existing: readonly McpServer[], originalName?: string): Error | null {
  const copy = t.value.workspace.mcp
  if (input.name.trim() === '') return new Error(copy.requiredFields)
  if (!/^[A-Za-z0-9._-]+$/.test(input.name)) return new Error(copy.invalidName)
  if (originalName !== undefined && input.name !== originalName) return new Error(copy.nameReadonly)
  if (existing.some((server) => server.name === input.name && server.name !== originalName)) return new Error(copy.duplicateName)
  const config = validateMcpConfig(input.config)
  if (!config.ok) return config.error
  if (input.clientSecret && (config.value.type === undefined || config.value.type === 'stdio')) return invalid('clientSecret (HTTP / SSE only)')
  return null
}
export function mcpEndpoint(config: McpConfig): string {
  return config.type === 'http' || config.type === 'sse' ? config.url : [config.command, ...(config.args ?? [])].join(' ')
}

// 仅旧项目面板使用命令行适配;Agent 编辑器不把 args 合并回单字符串。
export function legacyMcpConfig(transport: McpTransportId, endpoint: string): McpConfig {
  if (transport !== 'stdio') return { type: transport, url: endpoint }
  const [command = '', ...args] = endpoint.trim().split(/\s+/)
  return { type: 'stdio', command, args }
}
function encodeLine(value: string): string { return value === '' || /[\r\n]/.test(value) || value.startsWith('"') ? JSON.stringify(value) : value }
function decodeLine(value: string): Result<string> {
  if (!value.startsWith('"')) return { ok: true, value }
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'string' ? { ok: true, value: parsed } : { ok: false, error: invalid('string') }
  } catch { return { ok: false, error: invalid(value) } }
}
function encodePairs(value: McpStringMap): string { return Object.entries(value).map(([key, item]) => `${key.includes('=') ? JSON.stringify(key) : encodeLine(key)}=${encodeLine(item)}`).join('\n') }
function decodePairs(text: string, field: string): Result<McpStringMap> {
  const entries: [string, string][] = []
  for (const line of text === '' ? [] : text.split('\n')) {
    // 引号包裹的键可包含等号;值在第一个分隔符之后完整保留。
    const match = line.startsWith('"') ? /^"(?:[^"\\]|\\.)*"=/.exec(line) : null
    const separator = match ? match[0].length - 1 : line.indexOf('=')
    if (separator < 1) return { ok: false, error: new Error(t.value.workspace.mcp.invalidPairs.replace('{field}', field)) }
    const key = decodeLine(line.slice(0, separator))
    const item = decodeLine(line.slice(separator + 1))
    if (!key.ok) return key
    if (!item.ok) return item
    if (entries.some(([existing]) => existing === key.value)) return { ok: false, error: new Error(t.value.workspace.mcp.invalidPairs.replace('{field}', field)) }
    entries.push([key.value, item.value])
  }
  return { ok: true, value: Object.fromEntries(entries) }
}
export function mcpFormDraft(config: McpConfig): McpFormDraft {
  const remote = config.type === 'http' || config.type === 'sse'
  return {
    transport: config.type ?? 'stdio', command: !remote ? config.command : '',
    args: !remote ? (config.args ?? []).map(encodeLine).join('\n') : '', env: !remote ? encodePairs(config.env ?? {}) : '',
    url: remote ? config.url : '', headers: remote ? encodePairs(config.headers ?? {}) : '', timeout: config.timeout === undefined ? '' : String(config.timeout),
    oauthEnabled: remote && config.oauth !== undefined,
    clientId: remote ? config.oauth?.clientId ?? '' : '', callbackPort: remote && config.oauth?.callbackPort !== undefined ? String(config.oauth.callbackPort) : '',
    authServerMetadataUrl: remote ? config.oauth?.authServerMetadataUrl ?? '' : '', scopes: remote ? config.oauth?.scopes ?? '' : '',
  }
}
export function configFromMcpForm(form: McpFormDraft, allowEmptyEndpoint = false): Result<McpConfig> {
  const common = form.timeout === '' ? {} : { timeout: Number(form.timeout) }
  if (form.transport === 'stdio') {
    const args: string[] = []
    for (const line of form.args === '' ? [] : form.args.split('\n')) {
      const arg = decodeLine(line)
      if (!arg.ok) return arg
      args.push(arg.value)
    }
    const env = decodePairs(form.env, 'env')
    if (!env.ok) return env
    return validateMcpConfig({ ...common, type: 'stdio', command: form.command, ...(form.args === '' ? {} : { args }), ...(form.env === '' ? {} : { env: env.value }) }, allowEmptyEndpoint)
  }
  const headers = decodePairs(form.headers, 'headers')
  if (!headers.ok) return headers
  return validateMcpConfig({ ...common, type: form.transport, url: form.url,
    ...(form.headers === '' ? {} : { headers: headers.value }),
    ...(form.oauthEnabled ? { oauth: {
      ...(form.clientId === '' ? {} : { clientId: form.clientId }),
      ...(form.callbackPort === '' ? {} : { callbackPort: Number(form.callbackPort) }),
      ...(form.authServerMetadataUrl === '' ? {} : { authServerMetadataUrl: form.authServerMetadataUrl }),
      ...(form.scopes === '' ? {} : { scopes: form.scopes }),
    } } : {}),
  }, allowEmptyEndpoint)
}
