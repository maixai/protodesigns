import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DialogWindow from './dialog-window.vue'

// 共享模态外壳:标题栏 / 导航 / 正文 / 动作区四个槽,stacked 与 sidebar 两种排布。
// 头部内容自带内距与发丝线(与三个业务窗体一致)。
const headStyle = 'display:flex;flex:1;align-items:center;gap:var(--dl-space-2);box-sizing:border-box;block-size:100%;padding:var(--dl-space-2) var(--workspace-settings-dialog-padding);border-block-end:var(--dl-border-width) solid var(--dl-border-base)'

const meta = {
  title: '组件/DialogWindow',
  component: DialogWindow,
  args: {
    open: true,
    tier: 'regular',
    layout: 'stacked',
    bodyId: 'story-dialog-body',
  },
  render: (args) => ({
    components: { DialogWindow },
    setup() {
      return { args, headStyle }
    },
    template: `
      <DialogWindow v-bind="args">
        <template #header>
          <div :style="headStyle">
            <h2 style="font-size:var(--dl-font-size-xl);font-weight:600;line-height:var(--dl-line-snug)">示例设置</h2>
          </div>
        </template>
        <template #nav>
          <div role="tablist" style="display:flex;gap:var(--dl-space-6);padding:var(--dl-space-1) var(--workspace-settings-dialog-padding);border-block-end:var(--dl-border-width) solid var(--dl-border-base)">
            <button type="button" role="tab" aria-selected="true">基本</button>
            <button type="button" role="tab" aria-selected="false">高级</button>
          </div>
        </template>
        <p style="color:var(--dl-text-secondary);line-height:var(--dl-line-body)">正文区域是唯一纵向滚动容器,头部与动作区固定。</p>
        <template #actions>
          <button type="button" class="dl-btn dl-btn--ghost">取消</button>
          <button type="button" class="dl-btn dl-btn--primary">保存</button>
        </template>
      </DialogWindow>
    `,
  }),
} satisfies Meta<typeof DialogWindow>

export default meta
type Story = StoryObj<typeof meta>

export const 堆叠布局: Story = {}

export const 侧栏布局: Story = {
  args: { tier: 'wide', layout: 'sidebar' },
  render: (args) => ({
    components: { DialogWindow },
    setup() {
      return { args, headStyle }
    },
    template: `
      <DialogWindow v-bind="args">
        <template #header>
          <div :style="headStyle">
            <h2 style="font-size:var(--dl-font-size-xl);font-weight:600;line-height:var(--dl-line-snug)">示例设置 · 侧栏</h2>
          </div>
        </template>
        <template #nav>
          <div role="tablist" aria-orientation="vertical" style="display:flex;flex-direction:column;gap:var(--dl-space-1);inline-size:224px;padding:var(--dl-space-2) var(--dl-space-3);border-inline-end:var(--dl-border-width) solid var(--dl-border-base)">
            <button type="button" role="tab" aria-selected="true">模型</button>
            <button type="button" role="tab" aria-selected="false">权限</button>
            <button type="button" role="tab" aria-selected="false">MCP</button>
          </div>
        </template>
        <p style="color:var(--dl-text-secondary);line-height:var(--dl-line-body)">侧栏布局:导航在左、正文与动作区在右列。</p>
        <template #actions>
          <button type="button" class="dl-btn dl-btn--primary">保存</button>
        </template>
      </DialogWindow>
    `,
  }),
}

export const 长标题: Story = {
  render: (args) => ({
    components: { DialogWindow },
    setup() {
      return { args, headStyle }
    },
    template: `
      <DialogWindow v-bind="args">
        <template #header>
          <div :style="headStyle">
            <h2 style="min-inline-size:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--dl-font-size-xl);font-weight:600">一个很长很长很长的设置窗体标题用于检查头部截断</h2>
          </div>
        </template>
        <p style="color:var(--dl-text-secondary);line-height:var(--dl-line-body)">标题过长时截断,头部保持单行。</p>
      </DialogWindow>
    `,
  }),
}
