<script setup lang="ts">
// 统一项目设置窗体:项目身份固定在头部,左侧垂直 Tab 在模型 / 权限 / MCP 之间切换,
// 底部动作区只作用于当前域。三个域在打开时并行预取并保持挂载,切换不重置草稿。
// 关闭路径:任一域保存中 → 不可关闭;任一域有草稿 → 先确认并点名具体域。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Project } from '../contracts/generated/project'
import { useI18n } from '../i18n'
import DialogWindow from './dialog-window.vue'
import ProjectMcpPanel from './project-mcp-panel.vue'
import ProjectModelPanel from './project-model-panel.vue'
import ProjectPermissionPanel from './project-permission-panel.vue'
import { EMPTY_PANEL_STATE } from './project-settings-state'
import type { ProjectPanelState, ProjectSettingsTab } from './project-settings-state'

const props = defineProps<{ open: boolean; project: Project; agent: AgentSummary }>()
const emit = defineEmits<{ close: []; announce: [message: string] }>()
const { t } = useI18n()

// 窗体宽度由视口推导:内宽 = min(960, 视口 - 32) - 48,故视口 ≤ 839px 时内宽 < 760px,
// 左栏 + 正文会挤压正文,改为内容区上方的横向 Tab 条。
// 视觉排版与键盘方向共用 isStacked 一个布尔,不存在「看起来横向、按键却按纵向」的错位。
const STACK_BREAKPOINT = 839
const TAB_ORDER: readonly ProjectSettingsTab[] = ['model', 'permissions', 'mcp']

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
const isStacked = ref(false)
const confirmOpen = ref(false)
const pendingDomains = ref<string[]>([])
const states = ref<Record<ProjectSettingsTab, ProjectPanelState>>({
  model: { ...EMPTY_PANEL_STATE },
  permissions: { ...EMPTY_PANEL_STATE },
  mcp: { ...EMPTY_PANEL_STATE },
})
const modelPanel = ref<InstanceType<typeof ProjectModelPanel> | null>(null)
const permissionPanel = ref<InstanceType<typeof ProjectPermissionPanel> | null>(null)
const mcpPanel = ref<InstanceType<typeof ProjectMcpPanel> | null>(null)

function tabElementId(tab: ProjectSettingsTab): string { return `${dialogId}-tab-${tab}` }
function panelElementId(tab: ProjectSettingsTab): string { return `${dialogId}-panel-${tab}` }
function tabLabel(tab: ProjectSettingsTab): string {
  const copy = t.value.workspace.projectSettings
  if (tab === 'model') return copy.tabModel
  if (tab === 'permissions') return copy.tabPermissions
  return copy.tabMcp
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
  return mcpPanel.value
})

function setPanelState(tab: ProjectSettingsTab, state: ProjectPanelState): void {
  states.value = { ...states.value, [tab]: state }
}

function activateTab(tab: ProjectSettingsTab, moveFocus: boolean): void {
  activeTab.value = tab
  if (!moveFocus) return
  void nextTick(() => tablistRef.value?.querySelector<HTMLElement>(`#${tabElementId(tab)}`)?.focus())
}

// 方向键只认当前排版方向:纵向用 Up/Down,横向用 Left/Right;Home / End 两种都可用。
function onTabKeydown(event: KeyboardEvent): void {
  const current = TAB_ORDER.indexOf(activeTab.value)
  const forward = isStacked.value ? 'ArrowRight' : 'ArrowDown'
  const backward = isStacked.value ? 'ArrowLeft' : 'ArrowUp'
  const next = event.key === forward ? (current + 1) % TAB_ORDER.length
    : event.key === backward ? (current - 1 + TAB_ORDER.length) % TAB_ORDER.length
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

function discardAndClose(): void {
  if (confirmDialogRef.value?.open === true) confirmDialogRef.value.close()
  confirmOpen.value = false
  finishClose()
}

function focusActiveTab(): void {
  tablistRef.value?.querySelector<HTMLElement>(`#${tabElementId(activeTab.value)}`)?.focus()
}

function syncStacked(): void {
  isStacked.value = window.innerWidth <= STACK_BREAKPOINT
}

// 每次打开都回到模型页,不记忆上次停留的 Tab;窗体开合与还焦由共享外壳负责。
watch(() => props.open, (isOpen) => {
  if (isOpen) activeTab.value = 'model'
}, { immediate: true })

onMounted(() => {
  syncStacked()
  window.addEventListener('resize', syncStacked)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncStacked)
  if (confirmDialogRef.value?.open === true) confirmDialogRef.value.close()
})
</script>

<template>
  <DialogWindow
    ref="dialogWindow"
    :open="open"
    class="project-settings"
    :class="{ 'is-stacked': isStacked }"
    tier="wide"
    :layout="isStacked ? 'stacked' : 'sidebar'"
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
      <div
        ref="tablistRef" class="project-settings__tablist" role="tablist"
        :aria-label="t.workspace.projectSettings.settingsTabsLabel"
        :aria-orientation="isStacked ? 'horizontal' : 'vertical'"
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
      <div v-show="activeTab === 'mcp'" :id="panelElementId('mcp')" class="project-settings__panel" role="tabpanel" :aria-labelledby="tabElementId('mcp')">
        <ProjectMcpPanel ref="mcpPanel" :project="project" :agent="agent" @state="setPanelState('mcp', $event)" @announce="emit('announce', $event)" />
      </div>
    </div>

    <template #actions>
      <!-- 动作区上方的发丝线;装饰元素不参与布局,由 CSS 锚在外壳动作区的上缘。 -->
      <span class="project-settings__actions-rule" aria-hidden="true"></span>
      <div class="project-settings__actions">
        <p ref="saveStateRef" class="project-config__save-state" :data-state="activeState.saveState" tabindex="-1">{{ activeStateLabel }}</p>
        <div class="project-config__buttons">
          <button type="button" class="dl-btn dl-btn--ghost" :disabled="isAnySaving" @click="requestClose">{{ t.workspace.projectSettings.close }}</button>
          <button type="button" class="dl-btn dl-btn--primary" :disabled="!activeState.canSave || isAnySaving" @click="saveActive">{{ activeState.saving ? t.workspace.projectSettings.saving : t.workspace.projectSettings.save }}</button>
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
/* 头部横贯整窗:项目身份不随导航列宽变化,左右缘与主体两栏的内容缘对齐。
   底缘一条通栏发丝线是「固定头部 / 主体」的边界;它与导航竖线同一层级色,
   导航竖线上端正好从这条线的下缘开始,形成干净的 T 形交接。
   垂直内距与动作条同档,头部收成单行主体栏而不是一块内容区。 */
.project-settings__head {
  display: flex; flex: 1; align-items: center; gap: var(--dl-space-3); min-width: 0;
  box-sizing: border-box; block-size: 100%;
  padding: var(--project-settings-chrome-pad) var(--workspace-settings-dialog-padding);
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
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

/* 主体由外壳排布:宽屏左导航 + 右列,窄屏导航在上、正文在下;两 pane 之间只保留
   一条通高发丝线,不叠加色调差、圆角、描边盒或阴影。导航 pane 不设 overflow ——
   行的外扩焦点环靠内距留出余量即可,不做任何裁切。 */
.project-settings__tablist {
  display: flex; flex: none; flex-direction: column; align-self: stretch; gap: var(--dl-space-1);
  inline-size: calc(var(--dl-space-12) * 4 + var(--dl-space-4)); box-sizing: border-box;
  /* 行内距与头部同一左缘对齐;上内距让首行与头部横线之间留出焦点环余量,
     下内距让末行的焦点环不贴窗体底边。 */
  padding: var(--dl-space-2) calc(var(--workspace-settings-dialog-padding) - var(--dl-space-3)) var(--dl-space-3);
  border-inline-end: var(--dl-border-width) solid var(--dl-border-base);
}
.project-settings__tablist button {
  position: relative; display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-2);
  min-inline-size: 0; min-block-size: var(--dl-control-height); padding: var(--dl-space-1) var(--dl-space-3);
  border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm);
  text-align: left; transition: background-color var(--dl-duration-fast) var(--dl-ease-standard), color var(--dl-duration-fast) var(--dl-ease-standard);
}
.project-settings__tablist button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.project-settings__tablist button[aria-selected='true'] { background: var(--dl-accent-soft); color: var(--dl-text-primary); font-weight: 500; }
/* 选中指示:贴着导航轴的强调色细条,只在选中行出现(全局同一时刻一条)。
   宽屏在左缘、纵向居中留白;窄屏在底缘,由下面的 is-stacked 规则改写。 */
.project-settings__tablist button[aria-selected='true']::before {
  content: ''; position: absolute; inset-inline-start: var(--dl-space-1); inset-block: var(--dl-space-2);
  inline-size: calc(var(--dl-border-width) * 2); border-radius: var(--dl-radius-sm); background: var(--dl-accent);
}
.project-settings__tablist button:focus-visible { box-shadow: var(--dl-focus-ring); }
.project-settings__tab-label { min-inline-size: 0; overflow-wrap: anywhere; }
.project-settings__tab-badge { flex: none; font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); font-weight: 400; }
.project-settings__tab-badge[data-tone='dirty'] { color: var(--dl-warning); }
.project-settings__tab-badge[data-tone='error'] { color: var(--dl-error); }
.project-settings__tab-badge[data-tone='saving'] { color: var(--dl-text-secondary); }
/* 正文是唯一纵向滚动容器:头部与动作区固定在窗外侧,不进这个盒子。
   scrollbar-gutter: stable 预留滚动条槽位,滚动条出现 / 消失时不改变正文可用宽度 ——
   常规滚动条(Chromium / Windows)不会因此让内容横向跳动;覆盖式滚动条本就不占位。 */
.project-settings__content { flex: 1; min-inline-size: 0; min-block-size: 0; overflow-y: auto; scrollbar-gutter: stable; overscroll-behavior: contain; padding: var(--dl-space-1); scrollbar-width: thin; scrollbar-color: var(--dl-border-strong) transparent; }
.project-settings__panel { min-inline-size: 0; }
/* 外壳内容区默认带一档纵向内距;项目窗体让正文直接贴到头部 / 动作区边界,
   纵向余量由正文自己的内距与面板负责(动作区发丝线因此正好落在滚动视口底缘)。 */
.project-settings :deep(.dl-dialog__content) { padding-block: 0; }

/* 窄屏:导航仍是 pane,转为通栏横向 band,与窗体左右边共边、无独立圆角卡片;
   分隔机制与宽屏一致,只是发丝线换到 band 的底缘 —— 头部与 band 之间不再加线,
   band 底缘线是 chrome 与内容之间唯一的分界。触屏行的触达尺寸回到 44px。 */
.project-settings.is-stacked .project-settings__head { border-block-end: none; }
/* 窄屏允许路径回到第二行;mark 尺寸与头部内距不随行数变化。 */
.project-settings.is-stacked .project-settings__identity { display: block; }
.project-settings.is-stacked .project-settings__title { display: block; }
.project-settings.is-stacked .project-settings__path { display: block; max-inline-size: none; }
.project-settings.is-stacked :deep(.dl-dialog__content) { padding-block-start: var(--dl-space-3); }
.project-settings.is-stacked .project-settings__tablist {
  flex-direction: row; align-items: stretch; inline-size: auto;
  padding: var(--dl-space-2);
  border-inline-end: none;
  border-block-end: var(--dl-border-width) solid var(--dl-border-base);
}
.project-settings.is-stacked .project-settings__tablist button { flex: 1 1 0; flex-direction: column; justify-content: center; gap: var(--dl-space-1); min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-1); }
/* 横向导航的指示改到选中行的底缘,随选中项左右移动。 */
.project-settings.is-stacked .project-settings__tablist button[aria-selected='true']::before {
  inset-inline: var(--dl-space-2); inset-block: auto 0;
  inline-size: auto; block-size: calc(var(--dl-border-width) * 2);
}
.project-settings.is-stacked .project-settings__tab-label { overflow-wrap: normal; text-align: center; }

/* 动作区由外壳固定在正文之外:这里只排状态与按钮。
   状态与按钮优先同行;放不下时按 flex 换行,窄屏最多两行。 */
.project-settings__actions { flex: 1; min-inline-size: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--dl-space-2); }
/* 动作区上方的发丝线锚在外壳动作区的上缘(不在滚动容器内),
   左端与导航竖线相接、右端到窗体右内缘;与外壳自带的 border-block-start 重叠成一条线。 */
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
