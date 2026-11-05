import { beforeEach, describe, expect, it } from 'vitest'
import { configFromMcpForm, mcpFormDraft, parseMcpJson, validateMcpConfig, validateMcpInput } from '../../src/data/mcp-config'
import { useI18n } from '../../src/i18n'

beforeEach(() => useI18n().setLocale('zh-CN'))
describe('MCP official configuration boundary', () => {
  it('normalizes the HTTP alias and preserves variable expressions and scope strings', () => {
    const result = validateMcpConfig({ type: 'streamable-http', url: '${URL:-https://example.com/mcp}', headers: { Authorization: 'Bearer ${TOKEN}' }, oauth: { scopes: 'read write', callbackPort: 1 } })
    expect(result).toEqual({ ok: true, value: { type: 'http', url: '${URL:-https://example.com/mcp}', headers: { Authorization: 'Bearer ${TOKEN}' }, oauth: { scopes: 'read write', callbackPort: 1 } } })
  })
  it('rejects every non-official field by name and never accepts a client secret in JSON', () => {
    for (const field of ['cwd', 'envFile', 'auth', 'transport', 'vendor', 'clientSecret', 'name', 'displayName', 'enabled', 'status', 'url', 'headers', 'oauth']) {
      const result = validateMcpConfig({ command: 'node', [field]: 'forbidden' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toContain(field)
    }
    for (const field of ['clientSecret', 'vendor']) {
      const result = validateMcpConfig({ type: 'http', url: 'https://example.com', oauth: { [field]: 'forbidden' } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toContain(`oauth.${field}`)
    }
    for (const field of ['command', 'args', 'env']) {
      expect(validateMcpConfig({ type: 'sse', url: 'https://example.com', [field]: 'forbidden' }).ok).toBe(false)
    }
    expect(validateMcpConfig([]).ok).toBe(false)
    expect(validateMcpConfig({ type: 'sdk' }).ok).toBe(false)
  })
  it('validates timeout, dictionary types and OAuth public fields', () => {
    for (const timeout of [999, 1000.5, Infinity, '1000']) expect(validateMcpConfig({ command: 'node', timeout }).ok).toBe(false)
    expect(validateMcpConfig({ command: 'node', timeout: 1000 }).ok).toBe(true)
    expect(validateMcpConfig({ command: 'node', args: 'single string' }).ok).toBe(false)
    expect(validateMcpConfig({ command: 'node', env: { TOKEN: 123 } }).ok).toBe(false)
    for (const oauth of [{ scopes: ['read'] }, { callbackPort: 0 }, { callbackPort: 65536 }, { callbackPort: 1.5 }, { authServerMetadataUrl: 'http://example.com' }]) {
      expect(validateMcpConfig({ type: 'http', url: 'https://example.com', oauth }).ok).toBe(false)
    }
    expect(validateMcpConfig({ type: 'sse', url: 'https://example.com', oauth: { callbackPort: 65535 } }).ok).toBe(true)
  })
  it('rejects multiple wrapper entries and name mismatch without silently renaming', () => {
    expect(parseMcpJson('{"mcpServers":{}}', '', '').ok).toBe(false)
    expect(parseMcpJson('{"mcpServers":{"one":{"command":"a"},"two":{"command":"b"}}}', '', '').ok).toBe(false)
    expect(parseMcpJson('{"mcpServers":{"one":{"command":"a"}}}', 'two', '').ok).toBe(false)
    expect(validateMcpInput({ name: 'new', displayName: '', config: { command: 'node' } }, [], 'original')?.message).toContain('不可更改')
  })
  it('round-trips special argument and map values without whitespace or variable expansion', () => {
    const config = { type: 'stdio', command: 'node', args: ['', 'with space', 'line\nbreak', '"quoted"', '${VAR:-default}', ' padded '], env: { 'A=B': 'line\nbreak', '': '', KEY: ' value=kept ', TEMPLATE: '${VAR}' } } satisfies Parameters<typeof mcpFormDraft>[0]
    const result = configFromMcpForm(mcpFormDraft(config))
    expect(result).toEqual({ ok: true, value: config })
  })
})
