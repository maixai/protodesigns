import { expect, waitFor } from 'storybook/test'
import { preview } from '../../.storybook/preview'
import { visibleStoryButton, visibleStoryElement } from '../../.storybook/play-helpers'
import { mockAgentSummaries, mockProjects } from '../mocks/workspace'
import ProjectMcpPanel from './project-mcp-panel.vue'
const agent = mockAgentSummaries()[0]
const project = agent ? mockProjects(agent.id)[0] : undefined
if (!agent || !project) throw new Error('Missing project MCP story fixture')
const meta = preview.meta({ title: '组件/ProjectMcpPanel', component: ProjectMcpPanel, args: { agent, project } })
export const 三类来源与同名遮蔽 = meta.story({})
export const 插件来源折叠态 = meta.story({
  play: async ({ mount, canvasElement, userEvent }) => {
    await mount()
    const disclosure = await visibleStoryButton(canvasElement, '.project-mcp .mcp-plugin-disclosure')
    if (disclosure.getAttribute('aria-expanded') === 'false') await userEvent.click(disclosure)
    // 先确认数据与展开态均就绪,最终故事才确实表达「已有插件的折叠态」。
    const row = await visibleStoryButton(canvasElement, '.project-mcp__plugin[data-plugin-id="browser-tools"] .mcp-plugin-main')
    await userEvent.click(disclosure)
    await waitFor(async () => {
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
      await expect(row).not.toBeVisible()
    }, { container: canvasElement, timeout: 3000 })
  },
})
export const 插件贡献只读详情 = meta.story({
  play: async ({ mount, canvasElement, userEvent }) => {
    await mount()
    const disclosure = await visibleStoryButton(canvasElement, '.project-mcp .mcp-plugin-disclosure')
    if (disclosure.getAttribute('aria-expanded') === 'false') await userEvent.click(disclosure)
    const row = await visibleStoryButton(canvasElement, '.project-mcp__plugin[data-plugin-id="browser-tools"] .mcp-plugin-main')
    await userEvent.click(row)
    await visibleStoryElement(canvasElement, '.project-mcp__detail .mcp-readonly-badge')
    await visibleStoryButton(canvasElement, '.project-mcp__detail .mcp-manage-plugin')
    await expect(canvasElement.querySelector('.project-mcp')).toHaveAttribute('data-view', 'pluginDetail')
    await expect(canvasElement.querySelector('.project-mcp .mcp-server-editor')).not.toBeInTheDocument()
  },
})
export const 窄宽服务器行 = meta.story({ render: (args) => ({ components: { ProjectMcpPanel }, setup() { return { args } }, template: '<div style="inline-size: calc(var(--dl-space-12) * 7)"><ProjectMcpPanel v-bind="args" /></div>' }) })
export const Agent脱敏只读详情 = meta.story({
  play: async ({ mount, canvasElement, userEvent }) => {
    await mount()
    const row = await visibleStoryButton(canvasElement, '.project-mcp__main[data-server-id="agent:planning:sentry"]')
    await userEvent.click(row)
    await visibleStoryButton(canvasElement, '.project-mcp__detail .mcp-manage-agent')
    await expect(canvasElement.querySelector('.project-mcp')).toHaveAttribute('data-view', 'detail')
    await expect(canvasElement.querySelector('.project-mcp .mcp-server-editor')).not.toBeInTheDocument()
  },
})
export const 项目编辑器 = meta.story({
  play: async ({ mount, canvasElement, userEvent }) => {
    await mount()
    const row = await visibleStoryButton(canvasElement, '.project-mcp__main[data-server-id="project:~/work/weekly-report:github"]')
    await userEvent.click(row)
    await visibleStoryElement(canvasElement, '.project-mcp__detail .mcp-server-editor')
    await visibleStoryButton(canvasElement, '.project-mcp__detail .project-mcp__remove')
    await expect(canvasElement.querySelector('.project-mcp')).toHaveAttribute('data-view', 'detail')
  },
})
