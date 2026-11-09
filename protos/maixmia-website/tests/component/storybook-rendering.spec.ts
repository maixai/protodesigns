import { composeStory } from '@storybook/vue3-vite'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { preview } from '../../.storybook/preview'
import contextMeta, { 侧栏档 } from '../../src/components/agent-context-switcher.stories'
import { 已安装与异常恢复 } from '../../src/components/agent-mcp.stories'

// 通过真实 portable-story 生命周期运行,保证 docs 等装饰器的 hooks 也在正确上下文中。
vi.mock('../../src/mocks/delay', () => ({ delay: async () => {} }))
beforeAll(preview.composed.beforeAll)
afterEach(() => { document.body.innerHTML = '' })

describe('Storybook Vue decorator rendering', () => {
  it('renders the existing CSF3 Agent switcher inside the providers and dark scope', async () => {
    // composeStory 自带 renderer 注解;传原始 preview 避免再次合并已组合的 source hooks。
    const story = composeStory(侧栏档, contextMeta, preview.input, 'Sidebar')
    const canvas = document.createElement('section')
    document.body.append(canvas)
    await story.run({ canvasElement: canvas })
    await flushPromises()
    const button = canvas.querySelector<HTMLButtonElement>('.dl-scope--dark .agent-context-switcher__trigger')
    expect(button?.tagName).toBe('BUTTON')
    expect(button?.dataset['agent']).toBe('planning')
    expect(canvas.textContent).not.toContain('[object Object]')
  })
  it('renders a real preview.meta MCP story with actual asynchronous server rows', async () => {
    const canvas = document.createElement('section')
    document.body.append(canvas)
    await 已安装与异常恢复.run({ canvasElement: canvas })
    await flushPromises()
    await flushPromises()
    const button = canvas.querySelector<HTMLButtonElement>('.dl-scope--dark .agent-mcp .mcp-main[data-server-id="agent:planning:sentry"]')
    expect(button?.tagName).toBe('BUTTON')
    expect(button?.textContent).toContain('Sentry')
    expect(canvas.querySelectorAll('.mcp-plugin-row')).toHaveLength(2)
    expect(canvas.textContent).not.toContain('[object Object]')
    expect(preview.composed.parameters?.layout).toBe('fullscreen')
  })
})
