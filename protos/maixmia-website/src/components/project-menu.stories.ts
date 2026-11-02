import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { onMounted, ref } from 'vue'
import ProjectMenu from './project-menu.vue'

// 项目行 ⋯ 菜单:原生 disclosure,只有「设置」+「关闭项目」两个一级项;
// 「设置」直接打开统一的项目设置窗体,没有子菜单。
const hostTemplate = `
  <div ref="host" class="project-scroll" style="position: relative; min-block-size: 260px; padding: var(--dl-space-6); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-elevated);">
    <div class="project-row" style="position: relative; display: flex; justify-content: space-between; align-items: center; color: var(--dl-text-primary);">
      <span>{{ args.projectName }}</span>
      <ProjectMenu v-bind="args" />
    </div>
  </div>
`

const meta = {
  title: '组件/ProjectMenu',
  component: ProjectMenu,
  args: { projectName: 'weekly-report' },
  render: (args) => ({
    components: { ProjectMenu },
    setup() {
      const host = ref<HTMLElement | null>(null)
      onMounted(() => host.value?.querySelector<HTMLElement>('.project-menu__trigger')?.click())
      return { args, host }
    },
    template: hostTemplate,
  }),
} satisfies Meta<typeof ProjectMenu>

export default meta
type Story = StoryObj<typeof meta>

export const 打开菜单: Story = {}
