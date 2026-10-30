import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { onMounted, ref } from 'vue'
import ProjectMenu from './project-menu.vue'

// 项目行 ⋯ 菜单:原生 disclosure,支持上下自适应与 Esc 还焦。
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
    template: `
      <div ref="host" class="project-scroll" style="position: relative; min-block-size: 160px; padding: var(--dl-space-6); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-elevated);">
        <div class="project-row" style="position: relative; display: flex; justify-content: space-between; align-items: center; color: var(--dl-text-primary);">
          <span>{{ args.projectName }}</span>
          <ProjectMenu v-bind="args" />
        </div>
      </div>
    `,
  }),
} satisfies Meta<typeof ProjectMenu>

export default meta
type Story = StoryObj<typeof meta>

export const 打开菜单: Story = {}
