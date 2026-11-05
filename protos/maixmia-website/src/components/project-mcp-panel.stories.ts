import { definePreview } from '@storybook/vue3-vite'
import { mockAgentSummaries, mockProjects } from '../mocks/workspace'
import ProjectMcpPanel from './project-mcp-panel.vue'
const agent = mockAgentSummaries()[0]
const project = agent ? mockProjects(agent.id)[0] : undefined
if (!agent || !project) throw new Error('Missing project MCP story fixture')
const meta = definePreview({ addons: [] }).meta({ title: '组件/ProjectMcpPanel', component: ProjectMcpPanel, args: { agent, project } })
export const 三类来源与同名遮蔽 = meta.story({})
export const 插件来源折叠态 = meta.story({ play: async ({ canvasElement }) => openDetail(canvasElement, '.mcp-plugin-disclosure') })
export const 插件贡献只读详情 = meta.story({ play: async ({ canvasElement }) => openDetail(canvasElement, '.project-mcp__plugin[data-plugin-id="browser-tools"] button') })
export const 窄宽服务器行 = meta.story({ render: (args) => ({ components: { ProjectMcpPanel }, setup() { return { args } }, template: '<div style="inline-size: calc(var(--dl-space-12) * 7)"><ProjectMcpPanel v-bind="args" /></div>' }) })
async function openDetail(canvas: HTMLElement, selector: string): Promise<void> {
  if (!canvas.querySelector(selector)) await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => { if (canvas.querySelector(selector)) { observer.disconnect(); resolve() } })
    observer.observe(canvas, { childList: true, subtree: true })
  })
  canvas.querySelector<HTMLButtonElement>(selector)?.click()
}
export const Agent脱敏只读详情 = meta.story({ play: async ({ canvasElement }) => openDetail(canvasElement, '.project-mcp__main[data-server-id="agent:planning:sentry"]') })
export const 项目编辑器 = meta.story({ play: async ({ canvasElement }) => openDetail(canvasElement, '.project-mcp__main[data-server-id="project:~/work/weekly-report:github"]') })
