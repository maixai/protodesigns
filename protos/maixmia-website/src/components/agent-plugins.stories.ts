import { preview } from '../../.storybook/preview'
import { nextTick, onMounted, ref } from 'vue'
import AgentPlugins from './agent-plugins.vue'

const meta = preview.meta({
  title: '组件/AgentPlugins',
  component: AgentPlugins,
  args: { agentId: 'planning', agentName: '规划助手' },
})


// 列表按可用高度分页,目标插件不一定落在第 1 页;先搜索再点行,故事才稳定。
async function openInstallDialog(root: HTMLElement | null, name: string): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 350) })
  await nextTick()
  root?.querySelector<HTMLButtonElement>('.plugin-add')?.click()
  await nextTick()
  const search = root?.querySelector<HTMLInputElement>('.install-toolbar input')
  if (search !== null && search !== undefined) {
    search.value = name
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    await new Promise<void>((resolve) => { setTimeout(resolve, 50) })
  }
  const row = [...(root?.querySelectorAll<HTMLElement>('.install-row') ?? [])]
    .find((element) => element.textContent?.includes(name))
  row?.querySelector<HTMLButtonElement>('.install-row__action')?.click()
}

export const 插件与市场列表 = meta.story({})
export const 添加市场子页面 = meta.story({
  render: (args) => ({
    components: { AgentPlugins },
    setup() {
      const root = ref<HTMLElement | null>(null)
      onMounted(async () => {
        // dummy API 最长延迟 300ms;待列表就绪后进入子页面。
        await new Promise<void>((resolve) => { setTimeout(resolve, 350) })
        await nextTick()
        root.value?.querySelector<HTMLButtonElement>('.market-add')?.click()
      })
      return { args, root }
    },
    template: '<div ref="root"><AgentPlugins v-bind="args" /></div>',
  }),
})

export const 安装页筛选与分页 = meta.story({
  render: (args) => ({
    components: { AgentPlugins },
    setup() {
      const root = ref<HTMLElement | null>(null)
      onMounted(async () => {
        await new Promise<void>((resolve) => { setTimeout(resolve, 350) })
        await nextTick()
        root.value?.querySelector<HTMLButtonElement>('.plugin-add')?.click()
      })
      return { args, root }
    },
    template: '<div ref="root" style="block-size: calc(var(--dl-space-12) * 12)"><AgentPlugins v-bind="args" /></div>',
  }),
})

export const 统一安装窗体无配置 = meta.story({
  render: (args) => ({
    components: { AgentPlugins },
    setup() {
      const root = ref<HTMLElement | null>(null)
      onMounted(() => { void openInstallDialog(root.value, 'Dependency Graph') })
      return { args, root }
    },
    template: '<div ref="root" style="block-size: calc(var(--dl-space-12) * 12)"><AgentPlugins v-bind="args" /></div>',
  }),
})

export const 统一安装窗体可选配置 = meta.story({
  render: (args) => ({
    components: { AgentPlugins },
    setup() {
      const root = ref<HTMLElement | null>(null)
      onMounted(() => { void openInstallDialog(root.value, 'Docs Writer') })
      return { args, root }
    },
    template: '<div ref="root" style="block-size: calc(var(--dl-space-12) * 12)"><AgentPlugins v-bind="args" /></div>',
  }),
})

export const 统一安装窗体必填配置 = meta.story({
  render: (args) => ({
    components: { AgentPlugins },
    setup() {
      const root = ref<HTMLElement | null>(null)
      onMounted(() => { void openInstallDialog(root.value, 'Test Runner') })
      return { args, root }
    },
    template: '<div ref="root" style="block-size: calc(var(--dl-space-12) * 12)"><AgentPlugins v-bind="args" /></div>',
  }),
})

export const 项目同款搜索与来源 = meta.story({ args: { projectPath: '~/work/weekly-report', projectName: 'weekly-report', embedded: true } })
