import { definePreview } from '@storybook/vue3-vite'
import AgentMcp from './agent-mcp.vue'

// 数据来自真实 dummy API,详情与新建复用同一编辑器,窄屏由工作台 viewport 切换。
const preview = definePreview({ addons: [] })
const meta = preview.meta({
  title: '组件/AgentMcp',
  component: AgentMcp,
  args: { agentId: 'planning', agentName: '规划助手' },
  render: (args) => ({
    components: { AgentMcp },
    setup() { return { args } },
    template: '<div style="max-inline-size: var(--dl-measure); padding: var(--dl-space-3)"><AgentMcp v-bind="args" /></div>',
  }),
})

// 等真实 mock 异步数据落定后进入指定详情,不替换生产中的交互接线。
async function openStoryDetail(canvas: HTMLElement, selector: string): Promise<void> {
  if (!canvas.querySelector(selector)) {
    await new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        if (canvas.querySelector(selector)) { observer.disconnect(); resolve() }
      })
      observer.observe(canvas, { childList: true, subtree: true })
    })
  }
  canvas.querySelector<HTMLButtonElement>(selector)?.click()
}
export const 已安装与异常恢复 = meta.story({})
export const 插件停用与更新不影响状态 = meta.story({ args: { agentId: 'research', agentName: '研究助手' } })
export const Agent空态 = meta.story({ args: { agentId: 'empty-agent', agentName: '空白 Agent' } })
export const 手配详情即编辑 = meta.story({ play: async ({ canvasElement }) => openStoryDetail(canvasElement, '[data-server-id="agent:planning:sentry"]') })
export const 插件托管只读 = meta.story({ play: async ({ canvasElement }) => openStoryDetail(canvasElement, '[data-server-id="plugin:community:browser-tools:browser"]') })
