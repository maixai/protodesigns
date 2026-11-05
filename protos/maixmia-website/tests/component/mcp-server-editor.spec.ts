import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { watch } from 'vue'
import type { CodeEditorOptions } from '../../src/composables/use-code-editor'
import McpServerEditor from '../../src/components/mcp-server-editor.vue'
import type { McpServer } from '../../src/contracts/generated/mcp-server'
import { useI18n } from '../../src/i18n'

// Happy DOM 不提供 CodeMirror 的 Range 几何测量;仅替换文档输入宿主,真实编辑能力在 quick 中覆盖。
vi.mock('../../src/composables/use-code-editor', () => ({
  useCodeEditor: (options: CodeEditorOptions) => {
    watch(options.host, (host) => {
      if (!host) return
      const input = document.createElement('textarea')
      input.className = 'cm-content'
      input.value = options.getText()
      input.addEventListener('input', () => options.onChange(input.value))
      host.append(input)
    }, { flush: 'post' })
    return { focus: () => options.host.value?.querySelector('textarea')?.focus() }
  },
}))
const remote: McpServer = {
  id: 'agent:planning:remote', name: 'remote', displayName: 'Remote', scope: 'agent', ownerId: 'planning', description: '',
  transport: 'http', endpoint: 'https://example.com/mcp', enabled: true, status: 'needsAuth', errorMessage: '', tools: [], clientSecretSet: true,
  config: { type: 'http', url: 'https://example.com/mcp', oauth: { scopes: 'read write' } },
}
function editor(server?: McpServer) {
  return mount(McpServerEditor, { props: { server, existing: server ? [server] : [], prefix: 'test', busy: false }, attachTo: document.body })
}
beforeEach(() => { useI18n().setLocale('zh-CN'); document.body.innerHTML = '' })

describe('mcp-server-editor', () => {
  it('round-trips form fields and literal variables through editable JSON', async () => {
    const wrapper = editor()
    await wrapper.get('#test-name').setValue('local')
    await wrapper.get('#test-command').setValue('npx')
    await wrapper.get('#test-args').setValue('-y\nserver\n""\n"line\\nbreak"')
    await wrapper.get('#test-env').setValue('TOKEN=${TOKEN:-default}\nEMPTY=')
    await wrapper.get('.mcp-representation button:nth-child(2)').trigger('click')
    const raw = wrapper.get<HTMLTextAreaElement>('.cm-content')
    expect(JSON.parse(raw.element.value)).toEqual({ type: 'stdio', command: 'npx', args: ['-y', 'server', '', 'line\nbreak'], env: { TOKEN: '${TOKEN:-default}', EMPTY: '' } })
    expect(document.activeElement).toBe(raw.element)
    await raw.setValue('{"command":"python","args":["with space"],"env":{"KEY":"${KEY}"},"timeout":2000}')
    await wrapper.get('.mcp-representation button:first-child').trigger('click')
    expect(wrapper.get('#test-command').element).toHaveProperty('value', 'python')
    expect(wrapper.get('#test-args').element).toHaveProperty('value', 'with space')
    expect(wrapper.get('#test-env').element).toHaveProperty('value', 'KEY=${KEY}')
    expect(wrapper.get('#test-timeout').element).toHaveProperty('value', '2000')
    await wrapper.trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'local', config: { command: 'python', args: ['with space'] } })
    wrapper.unmount()
  })

  it('preserves invalid JSON, blocks switching and announces only on an explicit action', async () => {
    const wrapper = editor()
    await wrapper.get('.mcp-representation button:nth-child(2)').trigger('click')
    await wrapper.get('.cm-content').setValue('{broken')
    expect(wrapper.get('.mcp-editor-error').text()).toContain('JSON')
    expect(wrapper.emitted('announce')).toBeUndefined()
    await wrapper.trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.emitted('announce')).toHaveLength(1)
    expect(document.activeElement).toBe(wrapper.get('.mcp-editor-error').element)
    await wrapper.get('.mcp-representation button:first-child').trigger('click')
    expect(wrapper.get('.cm-content').element).toHaveProperty('value', '{broken')
    expect(wrapper.find('#test-command').exists()).toBe(false)
    wrapper.unmount()
  })

  it('unwraps one mcpServers entry and rejects a conflicting independent name', async () => {
    const wrapper = editor()
    await wrapper.get('.mcp-representation button:nth-child(2)').trigger('click')
    await wrapper.get('.cm-content').setValue('{"mcpServers":{"wrapped":{"type":"streamable-http","url":"https://example.com/mcp"}}}')
    await flushPromises()
    expect(wrapper.get('#test-name').element).toHaveProperty('value', 'wrapped')
    await wrapper.trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'wrapped', config: { type: 'http' } })
    await wrapper.get('#test-name').setValue('different')
    await wrapper.trigger('submit')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    expect(wrapper.get('.mcp-editor-error').text()).toContain('包装键')
    wrapper.unmount()
  })

  it('keeps transport drafts and serializes only the selected transport', async () => {
    const wrapper = editor()
    await wrapper.get('#test-name').setValue('local')
    await wrapper.get('#test-command').setValue('node')
    await wrapper.get('#test-args').setValue('server.js')
    await wrapper.get('#test-transport').setValue('http')
    await wrapper.get('#test-url').setValue('https://example.com/mcp')
    await wrapper.get('#test-headers').setValue('Authorization=Bearer ${TOKEN}')
    await wrapper.get('#test-transport').setValue('stdio')
    expect(wrapper.get('#test-command').element).toHaveProperty('value', 'node')
    await wrapper.trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ config: { command: 'node', args: ['server.js'] } })
    expect(wrapper.emitted('submit')?.[0]?.[0]).not.toHaveProperty('config.url')
    await wrapper.get('#test-transport').setValue('http')
    expect(wrapper.get('#test-headers').element).toHaveProperty('value', 'Authorization=Bearer ${TOKEN}')
    await wrapper.trigger('submit')
    expect(wrapper.emitted('submit')?.[1]?.[0]).not.toHaveProperty('config.command')
    wrapper.unmount()
  })

  it('keeps OAuth secret write-only, validates ports, and exposes public OAuth in JSON', async () => {
    const wrapper = editor(remote)
    expect(wrapper.get('#test-name').attributes('readonly')).toBeDefined()
    expect(wrapper.get('#test-client-secret').element).toHaveProperty('value', '')
    expect(wrapper.text()).toContain('已设置密钥')
    expect(wrapper.get('.mcp-submit').attributes('disabled')).toBeDefined()
    await wrapper.get('#test-client-secret').setValue('private-client-secret')
    await wrapper.get('#test-callback-port').setValue('65536')
    expect(wrapper.get('.mcp-submit').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('1–65535')
    await wrapper.get('#test-callback-port').setValue('8765')
    await wrapper.get('#test-metadata-url').setValue('http://example.com/metadata')
    expect(wrapper.get('.mcp-submit').attributes('disabled')).toBeDefined()
    await wrapper.get('#test-metadata-url').setValue('https://example.com/metadata')
    await wrapper.get('.mcp-representation button:nth-child(2)').trigger('click')
    const json = wrapper.get<HTMLTextAreaElement>('.cm-content').element.value
    expect(json).toContain('read write')
    expect(json).not.toContain('private-client-secret')
    expect(json).not.toContain('clientSecret')
    await wrapper.trigger('submit')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ clientSecret: 'private-client-secret', config: { oauth: { callbackPort: 8765, scopes: 'read write' } } })
    wrapper.unmount()
  })
})
