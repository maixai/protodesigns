import { preview } from '../../.storybook/preview'
import type { McpServer } from '../contracts/generated/mcp-server'
import McpServerEditor from './mcp-server-editor.vue'

const oauthServer: McpServer = {
  id: 'agent:story:remote', name: 'remote', displayName: '团队知识库与文档检索服务', description: '', scope: 'agent', ownerId: 'story',
  transport: 'http', endpoint: 'https://example.com/mcp', config: { type: 'http', url: 'https://example.com/mcp', oauth: { clientId: 'mia', scopes: 'read write', callbackPort: 8765 } },
  clientSecretSet: true, enabled: true, status: 'needsAuth', errorMessage: '', tools: [],
}
const meta = preview.meta({
  title: '组件/McpServerEditor',
  component: McpServerEditor,
  args: { server: undefined, existing: [], prefix: 'mcp-story', busy: false },
  render: (args) => ({ components: { McpServerEditor }, setup() { return { args } }, template: '<div style="max-inline-size: var(--dl-measure); padding: var(--dl-space-3)"><McpServerEditor v-bind="args" /></div>' }),
})

export const 添加表单与JSON = meta.story({})
export const JSON源码视图 = meta.story({
  play: async ({ canvasElement }) => { canvasElement.querySelector<HTMLButtonElement>('.mcp-representation button:nth-child(2)')?.click() },
})
export const 编辑OAuth与只写密钥 = meta.story({ args: { server: oauthServer, existing: [oauthServer] } })
export const 保存中 = meta.story({ args: { server: oauthServer, existing: [oauthServer], busy: true } })
export const 窄屏长显示名 = meta.story({ args: { server: oauthServer, existing: [oauthServer] }, globals: { viewport: { value: 'mobile1' } } })
