import { expect } from 'storybook/test'
import { preview } from '../../.storybook/preview'
import { visibleStoryButton, visibleStoryElement } from '../../.storybook/play-helpers'
import { mockAgentSummaries, mockProjects } from '../mocks/workspace'
import ProjectPluginsPanel from './project-plugins-panel.vue'
const agent = mockAgentSummaries()[0]
const project = agent ? mockProjects(agent.id)[0] : undefined
const writing = mockAgentSummaries().find((item) => item.id === 'writing')
const docs = writing ? mockProjects(writing.id)[0] : undefined
if (!agent || !project || !writing || !docs) throw new Error('Missing project plugin story fixtures')
const meta = preview.meta({ title: '组件/ProjectPluginsPanel', component: ProjectPluginsPanel, args: { agent, project } })
export const 两类来源与市场 = meta.story({})
export const 嵌入式安装页自然高度 = meta.story({
  play: async ({ mount, canvasElement, userEvent }) => {
    await mount()
    const install = await visibleStoryButton(canvasElement, '.project-plugins [data-group="plugins"] .plugin-group-head > .plugin-add')
    await userEvent.click(install)
    await visibleStoryElement(canvasElement, '.project-plugins .install-toolbar')
    const list = await visibleStoryElement(canvasElement, '.project-plugins .install-list')
    await expect(canvasElement.querySelector('.project-plugins')).toHaveAttribute('data-view', 'install')
    await expect(getComputedStyle(list).overflowY).toBe('visible')
  },
})
export const 同名合并与项目配置优先 = meta.story({ args: { agent: writing, project: docs } })
export const 继承详情只读 = meta.story({ args: { requestedPluginKey: 'data-analysis@anthropic' } })
export const 项目配置详情 = meta.story({ args: { requestedPluginKey: 'test-runner@anthropic' } })
export const 窄屏与长名称 = meta.story({
  args: { project: { ...project, name: 'quarterly-forecast-and-budget-review' } },
  render: (args) => ({ components: { ProjectPluginsPanel }, setup() { return { args } }, template: '<div style="inline-size: calc(var(--dl-space-12) * 7)"><ProjectPluginsPanel v-bind="args" /></div>' }),
})
