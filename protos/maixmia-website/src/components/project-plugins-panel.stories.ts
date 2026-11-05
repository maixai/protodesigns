import { definePreview } from '@storybook/vue3-vite'
import { mockAgentSummaries, mockProjects } from '../mocks/workspace'
import ProjectPluginsPanel from './project-plugins-panel.vue'
const agent = mockAgentSummaries()[0]
const project = agent ? mockProjects(agent.id)[0] : undefined
const writing = mockAgentSummaries().find((item) => item.id === 'writing')
const docs = writing ? mockProjects(writing.id)[0] : undefined
if (!agent || !project || !writing || !docs) throw new Error('Missing project plugin story fixtures')
const meta = definePreview({ addons: [] }).meta({ title: '组件/ProjectPluginsPanel', component: ProjectPluginsPanel, args: { agent, project } })
export const 两类来源与市场 = meta.story({})
export const 嵌入式安装页自然高度 = meta.story({ play: async ({ canvasElement }) => {
  if (!canvasElement.querySelector('.plugin-add')) await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => { if (canvasElement.querySelector('.plugin-add')) { observer.disconnect(); resolve() } })
    observer.observe(canvasElement, { childList: true, subtree: true })
  })
  canvasElement.querySelector<HTMLButtonElement>('.plugin-add')?.click()
} })
export const 同名合并与项目配置优先 = meta.story({ args: { agent: writing, project: docs } })
export const 继承详情只读 = meta.story({ args: { requestedPluginKey: 'data-analysis@anthropic' } })
export const 项目配置详情 = meta.story({ args: { requestedPluginKey: 'test-runner@anthropic' } })
export const 窄屏与长名称 = meta.story({
  args: { project: { ...project, name: 'quarterly-forecast-and-budget-review' } },
  render: (args) => ({ components: { ProjectPluginsPanel }, setup() { return { args } }, template: '<div style="inline-size: calc(var(--dl-space-12) * 7)"><ProjectPluginsPanel v-bind="args" /></div>' }),
})
