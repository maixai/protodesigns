<script setup lang="ts">
// 统一项目设置窗体:横向标签栏在模型 / 权限 / 插件 / MCP 之间切换,各域并行预取并保持挂载。
// 模型与权限由底部保存;工具的行级操作即时生效,配置表单在各自详情内保存。
// 关闭路径:任一域保存中 → 不可关闭;任一域有草稿 → 先确认并点名具体域。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Project } from '../contracts/generated/project'
import { useI18n } from '../i18n'
import DialogWindow from './dialog-window.vue'
import ProjectModelPanel from './project-model-panel.vue'
import ProjectPermissionPanel from './project-permission-panel.vue'
import ProjectMcpPanel from './project-mcp-panel.vue'
import ProjectPluginsPanel from './project-plugins-panel.vue'
import { EMPTY_PANEL_STATE } from './project-settings-state'
import type { ProjectPanelState, ProjectSettingsTab } from './project-settings-state'

const props = defineProps<{ open: boolean; project: Project; agent: AgentSummary }>()
const emit = defineEmits<{ close: []; announce: [message: string]; manageAgent: [tab: 'plugins' | 'mcp', pluginKey: string] }>()
const { t } = useI18n()

// 窗体宽度由视口推导:内宽 = min(960, 视口 - 32) - 48。一级导航始终是 Header 下方的
// 横向标签栏,不再按宽度切换纵向 / 横向 —— 视觉排版与键盘方向因此恒定一致。
// 视口 ≤ 839px 时只有头部身份区回到两行(标题 + 路径),标签栏本身不改变方向。
const TAB_ORDER: readonly ProjectSettingsTab[] = ['model', 'permissions', 'plugins', 'mcp']

type TabBadgeTone = 'saving' | 'error' | 'dirty'

interface TabView {
  id: ProjectSettingsTab
  label: string
  accessibleName: string
  badge: string
  tone: TabBadgeTone | ''
}

const dialogId = `project-settings-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const confirmTitleId = `${dialogId}-discard-title`
const confirmBodyId = `${dialogId}-discard-body`
const contentId = `${dialogId}-content`
const dialogWindow = ref<InstanceType<typeof DialogWindow> | null>(null)
const confirmDialogRef = ref<HTMLDialogElement | null>(null)
const confirmKeepRef = ref<HTMLButtonElement | null>(null)
const tablistRef = ref<HTMLElement | null>(null)
const saveStateRef = ref<HTMLElement | null>(null)
const confirmReturnFocusRef = ref<HTMLElement | null>(null)
const activeTab = ref<ProjectSettingsTab>('model')
const confirmOpen = ref(false)
const pendingDomains = ref<string[]>([])
const states = ref<Record<ProjectSettingsTab, ProjectPanelState>>({
  model: { ...EMPTY_PANEL_STATE },
  permissions: { ...EMPTY_PANEL_STATE },
  plugins: { ...EMPTY_PANEL_STATE },
  mcp: { ...EMPTY_PANEL_STATE },
})
const modelPanel = ref<InstanceType<typeof ProjectModelPanel> | null>(null)
const permissionPanel = ref<InstanceType<typeof ProjectPermissionPanel> | null>(null)
const requestedPluginKey = ref('')
const pendingAgentTab = ref<'plugins' | 'mcp' | null>(null)
const pendingAgentPluginKey = ref('')

function tabElementId(tab: ProjectSettingsTab): string { return `${dialogId}-tab-${tab}` }
function panelElementId(tab: ProjectSettingsTab): string { return `${dialogId}-panel-${tab}` }
function tabLabel(tab: ProjectSettingsTab): string {
  const copy = t.value.workspace.projectSettings
  if (tab === 'model') return copy.tabModel
  return tab === 'permissions' ? copy.tabPermissions : tab === 'plugins' ? copy.tabPlugins : copy.tabMcp
}
function tabBadge(tab: ProjectSettingsTab): { text: string; tone: TabBadgeTone } | null {
  const copy = t.value.workspace.projectSettings
  const state = states.value[tab]
  if (state.saving) return { text: copy.tabSavingBadge, tone: 'saving' }
  if (state.saveState === 'error') return { text: copy.tabSaveErrorBadge, tone: 'error' }
  if (state.dirty) return { text: copy.tabDirtyBadge, tone: 'dirty' }
  return null
}
// Tab 的可访问名带上未保存 / 保存失败 / 保存中的状态:非活动域的草稿不能只靠颜色表达。
function tabAccessibleName(tab: ProjectSettingsTab): string {
  const copy = t.value.workspace.projectSettings
  const label = tabLabel(tab)
  const state = states.value[tab]
  if (state.saving) return copy.tabSaving.replace('{name}', label)
  if (state.saveState === 'error') return copy.tabSaveError.replace('{name}', label)
  if (state.dirty) return copy.tabDirty.replace('{name}', label)
  return label
}
const tabViews = computed<TabView[]>(() => TAB_ORDER.map((id) => {
  const badge = tabBadge(id)
  return {
    id,
    label: tabLabel(id),
    accessibleName: tabAccessibleName(id),
    badge: badge?.text ?? '',
    tone: badge?.tone ?? '',
  }
}))
const activeState = computed<ProjectPanelState>(() => states.value[activeTab.value])
const activeStateLabel = computed(() => activeState.value.saveStateLabel !== '' ? activeState.value.saveStateLabel : t.value.workspace.projectSettings.loading)
const isAnySaving = computed(() => TAB_ORDER.some((tab) => states.value[tab].saving))
const activePanel = computed(() => {
  if (activeTab.value === 'model') return modelPanel.value
  if (activeTab.value === 'permissions') return permissionPanel.value
  return null
})

function setPanelState(tab: ProjectSettingsTab, state: ProjectPanelState): void {
  states.value = { ...states.value, [tab]: state }
}

function activateTab(tab: ProjectSettingsTab, moveFocus: boolean): void {
  activeTab.value = tab
  if (!moveFocus) return
  void nextTick(() => tablistRef.value?.querySelector<HTMLElement>(`#${tabElementId(tab)}`)?.focus())
}

// 标签栏恒为横向:Left / Right 循环切换,Home / End 直达首末;上下键不再有语义。
function onTabKeydown(event: KeyboardEvent): void {
  const current = TAB_ORDER.indexOf(activeTab.value)
  const next = event.key === 'ArrowRight' ? (current + 1) % TAB_ORDER.length
    : event.key === 'ArrowLeft' ? (current - 1 + TAB_ORDER.length) % TAB_ORDER.length
      : event.key === 'Home' ? 0
        : event.key === 'End' ? TAB_ORDER.length - 1 : -1
  if (next < 0) return
  event.preventDefault()
  const tab = TAB_ORDER[next]
  if (tab !== undefined) activateTab(tab, true)
}

async function saveActive(): Promise<void> {
  // 同一时刻只允许一个域在保存,避免「关闭被一直挡住」与并发写。
  if (isAnySaving.value) return
  const startedTab = activeTab.value
  const panel = activePanel.value
  if (panel === null) return
  const ok = await panel.save()
  if (ok) return
  // 保存期间用户可能已切走;失败提示只应把焦点送到仍在该域的底部状态。
  if (activeTab.value !== startedTab) return
  await nextTick()
  saveStateRef.value?.focus()
}

// 关闭请求统一由外壳转交:本层只处理业务判断(保存中 / 脏草稿),真正关闭由父级卸载外壳完成。
function finishClose(): void {
  if (isAnySaving.value) return
  dialogWindow.value?.closeDialog?.()
  emit('close')
  if (pendingAgentTab.value !== null) emit('manageAgent', pendingAgentTab.value, pendingAgentPluginKey.value)
}

async function openConfirm(domains: string[]): Promise<void> {
  pendingDomains.value = domains
  confirmReturnFocusRef.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  confirmOpen.value = true
  await nextTick()
  const dialog = confirmDialogRef.value
  if (dialog === null) return
  if (!dialog.open) dialog.showModal()
  // 默认落在非破坏性选项上。
  confirmKeepRef.value?.focus()
}

function closeConfirm(): void {
  if (confirmDialogRef.value?.open === true) confirmDialogRef.value.close()
  confirmOpen.value = false
  pendingAgentTab.value = null
  pendingAgentPluginKey.value = ''
  const target = confirmReturnFocusRef.value
  if (target?.isConnected === true) target.focus()
}

// 外壳把窗体自身 Esc 转成 request-close;确认层的 Esc 由确认层自己的 cancel 处理。
function requestClose(): void {
  if (isAnySaving.value || confirmOpen.value) return
  const dirty = TAB_ORDER.filter((tab) => states.value[tab].dirty)
  if (dirty.length === 0) { finishClose(); return }
  void openConfirm(dirty.map(tabLabel))
}

function requestAgent(tab: 'plugins' | 'mcp', key = ''): void {
  pendingAgentTab.value = tab
  pendingAgentPluginKey.value = key
  requestClose()
}
function openPlugin(key: string): void {
  requestedPluginKey.value = key
  activateTab('plugins', false)
}
function discardAndClose(): void {
  if (confirmDialogRef.value?.open === true) confirmDialogRef.value.close()
  confirmOpen.value = false
  finishClose()
}

function focusActiveTab(): void {
  tablistRef.value?.querySelector<HTMLElement>(`#${tabElementId(activeTab.value)}`)?.focus()
}

// 每次打开都回到模型页,不记忆上次停留的 Tab;窗体开合与还焦由共享外壳负责。
watch(() => props.open, (isOpen) => {
  if (isOpen) activeTab.value = 'model'
}, { immediate: true })

onBeforeUnmount(() => {
  if (confirmDialogRef.value?.open === true) confirmDialogRef.value.close()
})
</script>

<template>
  <DialogWindow
    ref="dialogWindow"
    :open="open"
    class="project-settings"
    tier="wide"
    :body-id="contentId"
    :aria-labelledby="titleId"
    @request-close="requestClose"
    @opened="focusActiveTab"
  >
    <template #header>
      <div class="project-settings__head">
        <span class="project-settings__mark" aria-hidden="true">{{ project.mark }}</span>
        <div class="project-settings__identity">
          <h2 :id="titleId" class="project-settings__title">{{ t.workspace.projectSettings.settingsDialogTitle }} · {{ project.name }}</h2>
          <code class="project-settings__path">{{ project.path }}</code>
        </div>
      </div>
    </template>

    <template #nav>
      <!-- Header 下方的横向标签栏:与 Agent 设置同款,一行排列,底边线即 chrome 与正文的分界。 -->
      <div
        ref="tablistRef" class="project-settings__tablist" role="tablist"
        :aria-label="t.workspace.projectSettings.settingsTabsLabel" aria-orientation="horizontal"
        @keydown="onTabKeydown"
      >
        <button
          v-for="tab in tabViews" :id="tabElementId(tab.id)" :key="tab.id" type="button" role="tab"
          :aria-selected="activeTab === tab.id" :aria-controls="panelElementId(tab.id)"
          :tabindex="activeTab === tab.id ? 0 : -1" :aria-label="tab.accessibleName"
          @click="activateTab(tab.id, true)"
        >
          <span class="project-settings__tab-label">{{ tab.label }}</span>
          <span v-if="tab.badge !== ''" class="project-settings__tab-badge" :data-tone="tab.tone">{{ tab.badge }}</span>
        </button>
      </div>
    </template>

    <!-- 正文是唯一纵向滚动容器;头部与动作区由外壳固定在滚动视口之外。 -->
    <div class="project-settings__content">
      <div v-show="activeTab === 'model'" :id="panelElementId('model')" class="project-settings__panel" role="tabpanel" :aria-labelledby="tabElementId('model')">
        <ProjectModelPanel ref="modelPanel" :project="project" :agent="agent" @state="setPanelState('model', $event)" />
      </div>
      <div v-show="activeTab === 'permissions'" :id="panelElementId('permissions')" class="project-settings__panel" role="tabpanel" :aria-labelledby="tabElementId('permissions')">
        <ProjectPermissionPanel ref="permissionPanel" :project="project" :agent="agent" @state="setPanelState('permissions', $event)" />
      </div>
      <div v-show="activeTab === 'plugins'" :id="panelElementId('plugins')" class="project-settings__panel" role="tabpanel" :aria-labelledby="tabElementId('plugins')">
        <ProjectPluginsPanel :project="project" :agent="agent" :requested-plugin-key="requestedPluginKey" @open-request-consumed="requestedPluginKey = ''" @state="setPanelState('plugins', $event)" @announce="emit('announce', $event)" @manage-agent="requestAgent('plugins', $event)" />
      </div>
      <div v-show="activeTab === 'mcp'" :id="panelElementId('mcp')" class="project-settings__panel" role="tabpanel" :aria-labelledby="tabElementId('mcp')">
        <ProjectMcpPanel :project="project" :agent="agent" @state="setPanelState('mcp', $event)" @announce="emit('announce', $event)" @manage-agent="requestAgent('mcp')" @manage-plugin="openPlugin" />
      </div>
    </div>

    <template #actions>
      <!-- 动作区上方的发丝线;装饰元素不参与布局,由 CSS 锚在外壳动作区的上缘并横贯内容 pane 全宽。 -->
      <span class="project-settings__actions-rule" aria-hidden="true"></span>
      <div class="project-settings__actions">
        <p ref="saveStateRef" class="project-config__save-state" :data-state="activeState.saveState" tabindex="-1">{{ activeStateLabel }}</p>
        <div class="project-config__buttons">
          <button type="button" class="dl-btn dl-btn--ghost" :disabled="isAnySaving" @click="requestClose">{{ t.workspace.projectSettings.close }}</button>
          <button v-if="activeTab === 'model' || activeTab === 'permissions'" type="button" class="dl-btn dl-btn--primary" :disabled="!activeState.canSave || isAnySaving" @click="saveActive">{{ activeState.saving ? t.workspace.projectSettings.saving : t.workspace.projectSettings.save }}</button>
        </div>
      </div>
    </template>

    <!-- 丢弃确认层:独立的 alertdialog,自带焦点陷阱与 Esc 语义;默认焦点在「继续编辑」上。 -->
    <dialog
      v-if="confirmOpen" ref="confirmDialogRef" class="project-settings__confirm dl-modal-scrim" role="alertdialog"
      aria-modal="true" :aria-labelledby="confirmTitleId" :aria-describedby="confirmBodyId" @cancel.prevent="closeConfirm"
    >
      <h2 :id="confirmTitleId" class="project-settings__confirm-title">{{ t.workspace.projectSettings.discardTitle }}</h2>
      <p :id="confirmBodyId" class="project-settings__confirm-body">{{ t.workspace.projectSettings.discardBody.replace('{domains}', pendingDomains.join(t.workspace.projectSettings.listSeparator)) }}</p>
      <div class="project-settings__confirm-actions">
        <button ref="confirmKeepRef" type="button" class="dl-btn dl-btn--ghost" @click="closeConfirm">{{ t.workspace.projectSettings.discardCancel }}</button>
        <button type="button" class="dl-btn dl-btn--ghost project-settings__discard" @click="discardAndClose">{{ t.workspace.projectSettings.discardConfirm }}</button>
      </div>
    </dialog>
  </DialogWindow>
</template>

<style scoped>
/* 窗体几何由共享外壳统一执行(尺寸策略见 src/data/window-geometry.ts):
   本文件只保留项目设置自己的头部 / 导航 / 正文 / 动作区编排,不再内联宽高。 */
.project-settings {
  /* 头部与动作条共用的垂直内距节奏:同一档内距让窗体上下读作同一圈窗框。 */
  --project-settings-chrome-pad: var(--dl-space-2);
  color-scheme: dark;
}
/* 头部横贯整窗:项目身份不随任何栏宽变化,左右缘与下方标签栏的内容缘对齐。
   头部与标签栏同属 chrome,这里不再画线 —— 分界由标签栏底边线一条承担,
   避免两条发丝线夹着一条 44px 标签带形成拥挤的双线。
   垂直内距与动作条同档,头部收成单行主体栏而不是一块内容区。 */
.project-settings__head {
  display: flex; flex: 1; align-items: center; gap: var(--dl-space-3); min-width: 0;
  box-sizing: border-box; block-size: 100%;
  padding: var(--project-settings-chrome-pad) var(--workspace-settings-dialog-padding);
}
/* 项目缩写降为内联徽记:只表达身份,不是控件 —— 仍 aria-hidden、不可聚焦、不可点击。
   尺寸取图标档而非交互目标档,缩小它不影响任何可交互目标的命中区。 */
.project-settings__mark {
  display: grid; flex: none; place-items: center;
  inline-size: var(--dl-icon-lg); block-size: var(--dl-icon-lg);
  overflow: hidden;
  border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm);
  background: var(--dl-bg-raised); color: var(--dl-text-secondary);
  font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-tight);
}
/* 宽屏:标题占用剩余宽度并保持主导,路径作为同一行尾部的等宽元信息,过长时截断。 */
.project-settings__identity { display: flex; flex: 1; align-items: center; gap: var(--dl-space-3); min-width: 0; }
.project-settings__title { flex: 1 1 auto; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.project-settings__path { flex: 0 0 auto; min-inline-size: 0; max-inline-size: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

/* 一级导航是 Header 下方的横向标签栏(与 Agent 设置同款):一行排列、一档 44px 触达,
   选中项用强调色下划线表达,未选中只在悬停时铺一档背景。标签栏底边线同时是
   chrome 与正文的分界,因此不再额外画头部横线,也不保留任何左侧栏结构。 */
.project-settings__tablist {
  display: flex; flex: none; align-items: stretch; gap: var(--dl-space-6);
  box-sizing: border-box;
  padding-inline: var(--workspace-settings-dialog-padding);
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
}
.project-settings__tablist button {
  display: inline-flex; align-items: center; gap: var(--dl-space-2);
  min-inline-size: 0; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-1);
  border-block-end: var(--dl-border-width) solid transparent;
  color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body);
  transition: background-color var(--dl-duration-fast) var(--dl-ease-standard), color var(--dl-duration-fast) var(--dl-ease-standard), border-color var(--dl-duration-fast) var(--dl-ease-standard);
}
.project-settings__tablist button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); }
/* 选中态只改文字层级与下划线颜色:整块高亮会把标签栏读成按钮组,也会盖过未保存徽标。 */
.project-settings__tablist button[aria-selected='true'] { color: var(--dl-text-primary); border-block-end-color: var(--dl-accent); }
.project-settings__tablist button:focus-visible { box-shadow: var(--dl-focus-ring); }
/* 标签与徽标都不折行、不截断;标签栏放不下时整枚按钮换到下一行。 */
.project-settings__tab-label { min-inline-size: 0; white-space: nowrap; }
.project-settings__tab-badge { flex: none; white-space: nowrap; font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); font-weight: 400; }
.project-settings__tab-badge[data-tone='dirty'] { color: var(--dl-warning); }
.project-settings__tab-badge[data-tone='error'] { color: var(--dl-error); }
.project-settings__tab-badge[data-tone='saving'] { color: var(--dl-text-secondary); }
/* 正文是唯一纵向滚动容器:头部与动作区固定在窗外侧,不进这个盒子。
   scrollbar-gutter: stable 预留滚动条槽位,滚动条出现 / 消失时不改变正文可用宽度 ——
   常规滚动条(Chromium / Windows)不会因此让内容横向跳动;覆盖式滚动条本就不占位。 */
.project-settings__content { flex: 1; min-inline-size: 0; min-block-size: 0; overflow-y: auto; scrollbar-gutter: stable; overscroll-behavior: contain; padding: var(--dl-space-1); scrollbar-width: thin; scrollbar-color: var(--dl-border-strong) transparent; }
.project-settings__panel { min-inline-size: 0; }
/* 外壳内容区默认带一档纵向内距;项目窗体让正文直接贴到标签栏 / 动作区边界,
   纵向余量由正文自己的内距与面板负责(动作区发丝线因此正好落在滚动视口底缘)。 */
.project-settings :deep(.dl-dialog__content) { padding-block: 0; }

/* 窄窗:标题与路径回到两行,mark 尺寸与头部内距不随行数变化;
   标签栏仍是一行横排,仅在 560px 以下允许整枚按钮换行(标签本身不折行、不截断)。 */
@media (max-width: 839px) {
  .project-settings__identity { display: block; }
  .project-settings__title { display: block; }
  .project-settings__path { display: block; max-inline-size: none; }
}
@media (max-width: 560px) {
  .project-settings__tablist { flex-wrap: wrap; gap: var(--dl-space-1); }
}

/* 动作区由外壳固定在正文之外:这里只排状态与按钮。
   状态与按钮优先同行;放不下时按 flex 换行,窄屏最多两行。 */
.project-settings__actions { flex: 1; min-inline-size: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--dl-space-2); }
/* 动作区上方的发丝线锚在外壳动作区的上缘(不在滚动容器内);
   标签栏移出左栏后,内容 pane 就是整窗宽度,这条线因此横贯窗体全宽。
   它与外壳自带的 border-block-start 重叠成一条线。 */
.project-settings__actions-rule {
  position: absolute;
  inset-block-start: calc(-1 * var(--dl-border-width));
  inset-inline: 0;
  block-size: var(--dl-border-width);
  background: var(--dl-border-base);
  pointer-events: none;
}
/* 状态用 auto 基准参与换行:与按钮放得下就同行,放不下时按钮整体换到第二行。 */
.project-config__save-state { flex: 1 1 auto; min-width: 0; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); overflow-wrap: anywhere; }
.project-config__save-state[data-state='dirty'], .project-config__save-state[data-state='saving'] { color: var(--dl-text-secondary); }
.project-config__save-state[data-state='saved'] { color: var(--dl-success); }
.project-config__save-state[data-state='error'], .project-config__save-state[data-state='invalid'] { color: var(--dl-error); }
.project-config__buttons { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); }
.project-config__buttons .dl-btn { min-block-size: var(--dl-target-size); }

/* 面板内容:原先由三个独立窗体的外壳统一提供,现集中于统一窗体。 */
.project-settings :deep(.project-config__scope) { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.project-settings :deep(.project-config__load-state) { display: grid; justify-items: start; gap: var(--dl-space-3); min-height: calc(var(--dl-space-12) * 4); align-content: center; color: var(--dl-text-secondary); }
.project-settings :deep(.project-config__error) { color: var(--dl-error); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.project-settings :deep(.field__input) { inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.project-settings :deep(.field__input:focus-visible) { border-color: var(--dl-focus-border); outline: none; box-shadow: var(--dl-focus-halo); }
.project-settings :deep(.field__input:disabled) { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.project-settings :deep(.field__select) { appearance: none; min-inline-size: 0; max-inline-size: 100%; padding-inline-end: var(--dl-space-8); }
.project-settings button:focus-visible, .project-settings :deep(button:focus-visible), .project-settings :deep(input:focus-visible), .project-settings :deep(select:focus-visible) { outline: none; box-shadow: var(--dl-focus-ring); }

/* 丢弃确认层:独立的模态层,自带遮罩与焦点陷阱。 */
.project-settings__confirm {
  inline-size: min(calc(var(--dl-space-12) * 9), calc(100% - 2 * var(--dl-space-4)));
  margin: auto;
  box-sizing: border-box;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-xl);
  background: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  color-scheme: dark;
  text-align: left;
}
.project-settings__confirm[open] { display: grid; gap: var(--dl-space-3); }
.project-settings__confirm-title { font-size: var(--dl-font-size-lg); font-weight: 600; line-height: var(--dl-line-snug); }
.project-settings__confirm-body { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.project-settings__confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); }
.project-settings__discard { color: var(--dl-error); border-color: var(--dl-error); }
.project-settings__discard:hover { background: var(--dl-bg-hover); }
</style>
