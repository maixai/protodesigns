import { definePreview } from '@storybook/vue3-vite'
import type { StoryObj } from '@storybook/vue3-vite'
import { onMounted } from 'vue'
import { mockAgentSummaries, mockProjects } from '../mocks/workspace'
import ProjectSettingsDialog from './project-settings-dialog.vue'

const agent = mockAgentSummaries()[0]
const project = agent === undefined ? undefined : mockProjects(agent.id)[0]
if (agent === undefined || project === undefined) throw new Error('Missing project settings story fixture')

const meta = definePreview({ addons: [] }).meta({
  title: '组件/ProjectSettingsDialog', component: ProjectSettingsDialog,
  args: { open: true, agent, project },
})
type Story = StoryObj<typeof ProjectSettingsDialog>

// 统一设置窗体总是从模型页打开;story 用点击切到目标 Tab,便于逐个状态评审。
function tabStory(index: number): Story {
  return {
    render: (args) => ({
      components: { ProjectSettingsDialog },
      setup() {
        onMounted(() => {
          const tabs = document.querySelectorAll<HTMLButtonElement>('.project-settings__tablist [role="tab"]')
          tabs[index]?.click()
        })
        return { args }
      },
      template: '<ProjectSettingsDialog v-bind="args" />',
    }),
  }
}

export const 模型页 = meta.story(tabStory(0))
export const 权限页 = meta.story(tabStory(1))
export const 插件页 = meta.story(tabStory(2))
export const MCP页 = meta.story(tabStory(3))

// 长标题与长路径:宽屏路径与标题同行并各自截断,头部不换行撑高。
export const 长标题与长路径 = meta.story({
  args: {
    project: {
      ...project,
      name: 'quarterly-forecast-and-budget-review-for-northwind',
      path: '~/work/clients/northwind/quarterly-forecast-and-budget-review',
    },
  },
})
