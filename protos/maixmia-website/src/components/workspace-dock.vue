<script setup lang="ts">
// 三段式底栏:左端全局设置、中间按 Agent 分域的最小化条目、右端状态 / 通知。
// 设置与通知是两种不同语义的全局入口,不再合并到同一个按钮与面板里。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AgentId, ChatSession, SessionStatus } from '../contracts/generated/chat-session'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentNotification } from '../contracts/generated/agent-notification'
import type { SystemNotification } from '../contracts/generated/system-notification'
import type { MinimizedGroup } from '../contracts/generated/minimized-group'
import type { WorkspaceWindow } from '../contracts/generated/workspace-window'
import type { Project } from '../contracts/generated/project'
import type { IconName } from '../data/icons'
import { badgeMapOf } from '../data/project-identity'
import { fileBaseName } from '../data/windows'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import GlobalSettingsPanel from './global-settings-panel.vue'
import SettingsDrawer from './settings-drawer.vue'
import AccountSecurityDialog from './account-security-dialog.vue'
import { session } from '../auth/session'
import AccountAvatar from './account-avatar.vue'

const props = defineProps<{
  groups: MinimizedGroup[]
  windows: WorkspaceWindow[]
  sessions: ChatSession[]
  statusOf: (session: ChatSession) => SessionStatus | null
  projects: Project[]
  agents: readonly AgentSummary[]
  agentId: AgentId
  notifications: AgentNotification[]
  systemNotifications: SystemNotification[]
  notificationsStatus: 'loading' | 'ready' | 'error'
  seenSessions: Set<string>
  disabled: boolean
  formatTime: (timestamp: string) => string
  // 刚落到这一条上的组:做一次静态强调(与飞行幽灵一起回答「折到哪去了」)。
  pulseKey?: string
}>()
const emit = defineEmits<{
  restore: [groupId: string, memberId: string]
  close: [groupId: string]
  notification: [item: AgentNotification]
  retry: []
  markSystemRead: [id: string]
  markAllRead: []
}>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const settingsTrigger = ref<HTMLButtonElement | null>(null)
const notificationTrigger = ref<HTMLButtonElement | null>(null)
const activePanel = ref('')
const settingsSection = ref<'' | 'shortcuts'>('')
const isAccountSecurityOpen = ref(false)
function openSettings(section: 'accountSecurity' | 'shortcuts'): void {
  // 打开中央账户窗体前先收起一级面板，关闭后焦点不会落在已卸载的面板行上。
  activePanel.value = ''
  if (section === 'accountSecurity') {
    isAccountSecurityOpen.value = true
    return
  }
  settingsSection.value = section
}
function closeSettings(): void {
  settingsSection.value = ''
  isAccountSecurityOpen.value = false
  settingsTrigger.value?.focus()
}
const panelRef = ref<HTMLElement | null>(null)
const badges = computed(() => badgeMapOf(props.projects))
const activeGroup = computed(() => props.groups.find((group) => group.id === activePanel.value))
const validGroups = computed(() => props.groups.filter((group) => group.memberIds.length > 0))
const waitingCount = computed(() => props.notifications.filter((item) => item.status === 'awaiting').length)
// 加载失败时不展示与不可加载数据绑定的计数:否则铃铛和 Tab 会与「通知加载失败」自相矛盾。
const countsVisible = computed(() => props.notificationsStatus !== 'error')
const notificationCount = computed(() => countsVisible.value ? props.notifications.length + props.systemNotifications.length : 0)
const activeNotificationTab = ref<'agent' | 'system'>('agent')
const NOTIFICATION_TABS = ['agent', 'system'] satisfies ('agent' | 'system')[]
const notificationTabs = computed(() => NOTIFICATION_TABS.map((id) => ({
  id,
  label: id === 'agent' ? t.value.workspace.notifications.tabAgent : t.value.workspace.notifications.tabSystem,
  count: countsVisible.value ? (id === 'agent' ? props.notifications.length : props.systemNotifications.length) : 0,
})))
const currentUnreadCount = computed(() => countsVisible.value
  ? (activeNotificationTab.value === 'agent' ? props.notifications.length : props.systemNotifications.length)
  : 0)
const expandedSystemNotices = ref<Set<string>>(new Set())
const systemItems = computed(() => [...props.systemNotifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
const SYSTEM_NOTICE_ICONS = {
  update: 'download', connection: 'sync', storage: 'database', security: 'badge', quota: 'chip', plugin: 'plug',
} satisfies Record<SystemNotification['kind'], IconName>
// 视觉徽标与读屏名称都以两类未读总数为准，待处理数只作为附加说明。
const notificationLabel = computed(() => {
  const copy = t.value.workspace.notifications
  if (notificationCount.value === 0) return copy.label
  const unread = copy.unread.replace('{count}', String(notificationCount.value))
  const pending = waitingCount.value > 0 ? ` · ${copy.pending.replace('{count}', String(waitingCount.value))}` : ''
  return `${copy.label} · ${unread}${pending}`
})
const notificationGroups = computed(() => {
  // 第一层按 Agent 分组:用户打开通知中心先问「哪个助手在等我」,Agent 数量少且稳定。
  // 项目退到组头副标题(单项目)或行内 meta(多项目),不让一个组头同时承担两个分类轴。
  const agentIds = props.agents.map((agent) => agent.id).filter((id) => props.notifications.some((item) => item.agentId === id))
  const unknown = [...new Set(props.notifications.map((item) => item.agentId))].filter((id) => !agentIds.includes(id))
  return [...agentIds, ...unknown].map((agentId) => {
    const items = props.notifications.filter((item) => item.agentId === agentId)
      .sort((a, b) => Number(b.status === 'awaiting') - Number(a.status === 'awaiting') || b.updatedAt.localeCompare(a.updatedAt))
    return { agentId, items, projects: [...new Set(items.map((item) => item.projectId))] }
  }).filter((group) => group.items.length > 0)
})
function focusNotificationTab(): void {
  panelRef.value?.querySelector<HTMLButtonElement>(`#workspace-notification-tab-${activeNotificationTab.value}`)?.focus()
}
async function activateNotificationTab(tab: 'agent' | 'system', focus = false): Promise<void> {
  activeNotificationTab.value = tab
  await nextTick()
  const list = panelRef.value?.querySelector<HTMLElement>(`#workspace-notification-panel-${tab}`)
  if (list !== undefined && list !== null) list.scrollTop = 0
  if (focus) focusNotificationTab()
}
function onNotificationTabKeydown(event: KeyboardEvent): void {
  // 分段控件独立处理 Home / End，不能让根容器的列表导航抢走按键。
  event.stopPropagation()
  if (event.key === 'Escape') { onKeydown(event); return }
  const next = event.key === 'Home' ? 'agent' : event.key === 'End' ? 'system'
    : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? (activeNotificationTab.value === 'agent' ? 'system' : 'agent') : null
  if (next === null) return
  event.preventDefault()
  void activateNotificationTab(next, true)
}
function toggleSystemNotice(id: string): void {
  const next = new Set(expandedSystemNotices.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedSystemNotices.value = next
}
function markAllRead(): void {
  // 操作后头部按钮也会消失，先把焦点交给稳定存在的当前 Tab。
  focusNotificationTab()
  emit('markAllRead')
}
// 条目用 aria-label 覆盖可访问名后，可视的状态 / 严重程度 / 类别 / 时间不再被读屏读出，
// 因此把它们一并拼进可访问名 —— 读屏听到的必须与眼睛看到的是同一组事实。
function agentNoticeLabel(item: AgentNotification): string {
  const copy = t.value.workspace.notifications
  // 行内视觉上不重复 Agent(由 sticky 组头承担),但读屏可能直接跳到单条,
  // 因此来源与项目仍要进入可访问名。
  return [copy.open.replace('{title}', item.title), agentNameOf(item.agentId), projectNameOf(item.projectId), statusTextOf(item.status), props.formatTime(item.updatedAt)]
    .filter((part) => part !== '').join(' · ')
}
function systemNoticeLabel(item: SystemNotification): string {
  const copy = t.value.workspace.notifications
  const action = (expandedSystemNotices.value.has(item.id) ? copy.collapse : copy.expand).replace('{title}', item.title)
  const severity = item.severity === 'warning' ? ` · ${copy.warning}` : ''
  return `${action}${severity} · ${copy.systemKinds[item.kind]} · ${props.formatTime(item.createdAt)}`
}
function agentNameOf(agentId: AgentId): string {
  return props.agents.find((agent) => agent.id === agentId)?.name ?? ''
}
// Agent 归属的文字通道:与侧栏 / 转录一致的 1 个字符标记(中文取首字,英文取首字母)。
function initialOf(name: string): string {
  return [...name.trim()][0] ?? ''
}
function projectNameOf(projectId: string): string {
  return badges.value.get(projectId)?.name ?? projectId
}
// 组内只有一个项目时,项目名放组头副标题;多个项目时才逐条显示,避免重复同一项目名。
function groupProjectLabel(group: { projects: string[] }): string {
  if (group.projects.length === 1) return projectNameOf(group.projects[0] ?? '')
  return t.value.workspace.notifications.projectCount.replace('{count}', String(group.projects.length))
}
function statusTextOf(status: AgentNotification['status']): string {
  return status === 'awaiting' ? t.value.workspace.notifications.awaiting : t.value.workspace.notifications.completed
}
function labelOf(id: string): string {
  const win = props.windows.find((item) => item.id === id)
  if (win?.content.kind === 'file') return fileBaseName(win.content.path)
  return props.sessions.find((session) => session.id === (win?.content.kind === 'chat' ? win.content.sessionId : ''))?.title ?? id
}
function badgeOf(group: MinimizedGroup): string {
  const ids = new Set(group.memberIds.flatMap((id) => {
    const win = props.windows.find((item) => item.id === id)
    return win?.content.kind === 'chat' ? [win.content.sessionId] : []
  }))
  const sessions = props.sessions.filter((item) => ids.has(item.id) && !props.seenSessions.has(item.id))
  const stateOf = (item: ChatSession): SessionStatus => props.statusOf(item) ?? item.status
  if (sessions.some((item) => stateOf(item) === 'awaiting')) return t.value.workspace.sessionStatus.awaiting
  if (sessions.some((item) => stateOf(item) === 'streaming')) return t.value.workspace.sessionStatus.streaming
  if (sessions.some((item) => stateOf(item) === 'completed')) return t.value.workspace.sessionStatus.completed
  return ''
}
function close(restoreFocus = false): void {
  const previous = activePanel.value
  activePanel.value = ''
  if (!restoreFocus) return
  if (previous === 'settings') settingsTrigger.value?.focus()
  else if (previous === 'notifications') notificationTrigger.value?.focus()
  else root.value?.querySelector<HTMLButtonElement>(`[data-group-menu="${CSS.escape(previous)}"]`)?.focus()
}
async function toggle(id: string, event: MouseEvent): Promise<void> {
  if (activePanel.value === id) { close(id === 'settings'); return }
  activePanel.value = id
  await nextTick()
  // 设置打开后统一移入首行，保证不聚焦鼠标按钮的浏览器也能接到 Esc。
  if (event.detail !== 0 && id !== 'settings') return
  if (id === 'notifications') focusNotificationTab()
  else panelRef.value?.querySelector<HTMLButtonElement>('button')?.focus()
}
function restore(groupId: string, memberId = ''): void {
  close()
  emit('restore', groupId, memberId)
}
function closeGroup(groupId: string): void {
  close()
  emit('close', groupId)
}
function openNotification(item: AgentNotification): void {
  close()
  emit('notification', item)
}
function retryNotifications(): void {
  // 重试按钮会在加载态卸载，先把焦点移回仍在根容器内的当前 Tab，避免 focusout 误关浮层。
  focusNotificationTab()
  emit('retry')
}
function closeNotifications(): void {
  close(true)
}
// 抽屉在 DOM 末尾,前向 Tab 走到这里时浏览器会先落到 body;哨兵把焦点直接交给工作区。
function focusWorkspaceStart(): void {
  const candidates = [document.querySelector<HTMLElement>('.agent-context-switcher__trigger'), ...document.querySelectorAll<HTMLElement>('.workspace-layout button:not([tabindex="-1"])')]
  const target = candidates.find((element) => element !== null && element.closest('[inert]') === null && element.getClientRects().length > 0)
  target?.focus()
}
function onKeydown(event: KeyboardEvent): void {
  if (!activePanel.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close(true)
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const buttons = Array.from(panelRef.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    .filter((button) => button.tabIndex !== -1 && button.getClientRects().length > 0)
  if (buttons.length === 0) return
  const index = buttons.findIndex((item) => item === document.activeElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length
  event.preventDefault()
  buttons[next]?.focus()
}
function onFocusOut(event: FocusEvent): void {
  // 通知抽屉是非模态的:允许焦点移到工作区边看边操作,不因失焦关闭。
  if (activePanel.value === 'notifications') return
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget)) close()
}
function onOutside(event: PointerEvent): void {
  if (!(event.target instanceof Node) || root.value?.contains(event.target)) return
  // 点击抽屉外的任意区域收起面板;不回焦铃铛,让焦点跟随用户实际点击的目标。
  // 键盘 Tab 离开抽屉走的是 focusout,那条路径仍不关闭,避免键盘用户误触。
  close()
}
// 焦点已移到抽屉外时,root 上的 Escape 监听收不到按键;这里兜住这种情况。
function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || activePanel.value !== 'notifications') return
  event.preventDefault()
  close(true)
}
watch(() => props.agentId, () => close())
// 异步已读刷新可能移除聚焦条目，卸载前回到当前 Tab，避免焦点落到 body 或误关面板。
watch([() => props.notifications, () => props.systemNotifications], () => {
  if (activePanel.value !== 'notifications') return
  const focused = document.activeElement
  if (!(focused instanceof HTMLElement)) return
  const sessionId = focused.closest<HTMLElement>('[data-session-id]')?.dataset.sessionId
  const noticeId = focused.closest<HTMLElement>('[data-system-id]')?.dataset.systemId
  const isSessionRemoved = sessionId !== undefined && !props.notifications.some((item) => item.sessionId === sessionId)
  const isNoticeRemoved = noticeId !== undefined && !props.systemNotifications.some((item) => item.id === noticeId)
  if (isSessionRemoved || isNoticeRemoved) focusNotificationTab()
  expandedSystemNotices.value = new Set([...expandedSystemNotices.value].filter((id) => props.systemNotifications.some((item) => item.id === id)))
})
onMounted(() => {
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="root" class="workspace-dock" :aria-label="t.workspace.dock.label" role="region" @keydown="onKeydown" @focusout="onFocusOut">
    <!-- 左端是全局设置 utility:与中间的最小化条目用发丝线隔开,不占通知语义。 -->
    <div class="workspace-dock__global-settings" role="group" :aria-label="t.workspace.settings.label">
      <button
        ref="settingsTrigger" type="button" class="workspace-dock__settings-trigger"
        :aria-label="`${t.workspace.settings.label}: ${session.profile?.name ?? ''}`"
        :aria-expanded="activePanel === 'settings' || settingsSection !== '' || isAccountSecurityOpen" aria-controls="workspace-settings-panel"
        @click="toggle('settings', $event)"
      >
        <AccountAvatar size="sm" :name="session.profile?.name ?? ''" />
      </button>
      <span class="workspace-dock__settings-tooltip" aria-hidden="true">{{ t.workspace.settings.label }}</span>
    </div>
    <span class="workspace-dock__divider" aria-hidden="true" />
    <!-- 中间是本域的最小化条目(Agent 选择已回到侧栏顶部);底栏中央留给「收起了哪些页面」。 -->
    <div class="workspace-dock__groups" role="group" :aria-label="t.workspace.dock.minimizedRegion">
      <span v-if="validGroups.length === 0" class="workspace-dock__empty">{{ t.workspace.dock.empty }}</span>
      <div v-for="group in validGroups" :key="group.id" class="workspace-dock__chip" :class="badges.get(group.projectId)?.identityClass" :data-group-id="group.id" :data-pulsing="group.id === pulseKey ? 'true' : undefined">
        <button type="button" class="workspace-dock__restore" :aria-label="`${t.workspace.dock.restore.replace('{name}', group.name)} · ${t.workspace.dock.groupCount.replace('{count}', String(group.memberIds.length))}${badgeOf(group) ? ` · ${badgeOf(group)}` : ''}`" @click="restore(group.id)">
          <span class="workspace-dock__name">{{ group.name }}</span><span class="workspace-dock__count">×{{ group.memberIds.length }}</span><span v-if="badgeOf(group)" class="workspace-dock__badge" :data-awaiting="badgeOf(group) === t.workspace.sessionStatus.awaiting" :data-running="badgeOf(group) === t.workspace.sessionStatus.streaming">{{ badgeOf(group) }}</span>
        </button>
        <button type="button" class="workspace-dock__menu" :data-group-menu="group.id" :aria-label="`${group.name} · ${t.workspace.dock.members}`" :aria-expanded="activePanel === group.id" aria-controls="dock-group-panel" @click="toggle(group.id, $event)">⋯</button>
      </div>
    </div>
    <!-- 右端是状态 / 通知区:铃铛固定在极右;未来状态项加在铃铛左侧。 -->
    <span class="workspace-dock__divider" aria-hidden="true" />
    <div class="workspace-dock__right-cluster">
      <button
        ref="notificationTrigger" type="button" class="workspace-dock__notification-trigger"
        :title="notificationLabel" :aria-label="notificationLabel"
        :aria-expanded="activePanel === 'notifications'" aria-controls="workspace-notifications-panel"
        @click="toggle('notifications', $event)"
      >
        <DliIcon name="bell" size="md" />
        <span v-if="notificationCount" class="workspace-dock__notification-badge" aria-hidden="true">{{ notificationCount > 99 ? '99+' : notificationCount }}</span>
      </button>
    </div>
    <div v-if="activeGroup" id="dock-group-panel" ref="panelRef" class="workspace-dock__panel workspace-dock__panel--members" role="group" :aria-label="activeGroup.name">
      <h2>{{ activeGroup.name }}</h2>
      <button v-for="id in activeGroup.memberIds" :key="id" type="button" class="workspace-dock__member" :data-member-id="id" :aria-label="t.workspace.dock.restoreMember.replace('{name}', labelOf(id))" @click="restore(activeGroup.id, id)">{{ labelOf(id) }}</button>
      <button type="button" class="workspace-dock__close" :disabled="disabled" @click="closeGroup(activeGroup.id)">{{ t.workspace.dock.closeGroup }}</button>
    </div>
    <Transition name="workspace-settings-menu">
    <div v-if="activePanel === 'settings'" id="workspace-settings-panel" ref="panelRef" class="workspace-dock__panel workspace-dock__panel--settings" role="region" :aria-label="t.workspace.settings.label">
      <GlobalSettingsPanel @close="close(true)" @open="openSettings" />
    </div>
    </Transition>
    <SettingsDrawer v-if="settingsSection" :section="settingsSection" @close="closeSettings" />
    <AccountSecurityDialog v-if="isAccountSecurityOpen" @close="closeSettings" />
    <Transition name="workspace-notification-drawer">
      <div v-if="activePanel === 'notifications'" id="workspace-notifications-panel" ref="panelRef" class="workspace-dock__drawer" role="dialog" aria-labelledby="workspace-notifications-title" :aria-busy="notificationsStatus === 'loading'">
        <header class="workspace-dock__notification-head">
          <h2 id="workspace-notifications-title">{{ t.workspace.notifications.title }}</h2>
          <div class="workspace-dock__notification-actions">
            <button v-if="notificationsStatus === 'ready' && notificationCount > 0" type="button" class="workspace-dock__all-read" :aria-label="t.workspace.notifications.allReadLabel" @click="markAllRead">{{ t.workspace.notifications.allRead }}</button>
            <button type="button" class="workspace-dock__drawer-close" :aria-label="t.workspace.notifications.close" @click="closeNotifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        </header>
      <div class="workspace-dock__notification-tabs" role="tablist" :aria-label="t.workspace.notifications.tabsLabel" @keydown="onNotificationTabKeydown">
        <button v-for="tab in notificationTabs" :id="`workspace-notification-tab-${tab.id}`" :key="tab.id" type="button" role="tab" :aria-selected="activeNotificationTab === tab.id" :aria-controls="`workspace-notification-panel-${tab.id}`" :tabindex="activeNotificationTab === tab.id ? 0 : -1" :aria-label="tab.count > 0 ? `${tab.label} · ${t.workspace.notifications.unread.replace('{count}', String(tab.count))}` : tab.label" @click="activateNotificationTab(tab.id)">
          <span>{{ tab.label }}</span><span v-if="tab.count > 0" class="workspace-dock__tab-count" aria-hidden="true">{{ tab.count }}</span>
        </button>
      </div>
      <div v-for="tab in notificationTabs" v-show="activeNotificationTab === tab.id" :id="`workspace-notification-panel-${tab.id}`" :key="tab.id" class="workspace-dock__notification-list" role="tabpanel" :aria-labelledby="`workspace-notification-tab-${tab.id}`" tabindex="0">
        <template v-if="activeNotificationTab === tab.id">
          <div v-if="notificationsStatus === 'loading'" class="workspace-dock__skeleton" role="status">
            <span class="workspace-dock__visually-hidden">{{ t.workspace.notifications.loading }}</span>
            <div v-for="row in 3" :key="row" class="workspace-dock__skeleton-row" aria-hidden="true"><span class="workspace-dock__skeleton-title" /><span v-if="activeNotificationTab === 'system'" class="workspace-dock__skeleton-body" /><span class="workspace-dock__skeleton-meta" /></div>
          </div>
          <div v-else-if="notificationsStatus === 'error'" class="workspace-dock__notification-state"><p>{{ t.workspace.notifications.error }}</p><button type="button" class="workspace-dock__retry" @click="retryNotifications">{{ t.workspace.retry }}</button></div>
          <div v-else-if="currentUnreadCount === 0" class="workspace-dock__notification-state">
            <DliIcon name="bell" size="lg" />
            <h3>{{ tab.id === 'agent' ? t.workspace.notifications.agentEmpty : t.workspace.notifications.systemEmpty }}</h3>
            <p>{{ tab.id === 'agent' ? t.workspace.notifications.agentEmptyHint : t.workspace.notifications.systemEmptyHint }}</p>
          </div>
          <template v-else-if="tab.id === 'agent'">
            <section v-for="group in notificationGroups" :key="group.agentId" class="workspace-dock__notification-group" :data-agent="group.agentId" :data-projects="group.projects.length">
              <h3 class="workspace-dock__agent-heading">
                <span class="workspace-dock__agent-mark" aria-hidden="true">{{ initialOf(agentNameOf(group.agentId)) }}</span>
                <span class="workspace-dock__agent-body">
                  <span class="workspace-dock__agent-name">{{ agentNameOf(group.agentId) }}</span>
                  <span class="workspace-dock__agent-project">{{ groupProjectLabel(group) }}</span>
                </span>
                <span class="workspace-dock__agent-count" aria-hidden="true">{{ group.items.length }}</span>
              </h3>
              <button v-for="item in group.items" :key="item.id" type="button" class="workspace-dock__notice" :data-session-id="item.sessionId" :data-status="item.status" :aria-label="agentNoticeLabel(item)" @click="openNotification(item)">
                <span class="workspace-dock__notice-title dl-clamp-2">{{ item.title }}</span>
                <span class="workspace-dock__notice-meta">
                  <span v-if="group.projects.length > 1" class="workspace-dock__notice-project">{{ projectNameOf(item.projectId) }}</span>
                  <span class="workspace-dock__notice-status" :data-status="item.status"><span v-if="item.status === 'awaiting'" class="workspace-dock__status-dot" aria-hidden="true" />{{ statusTextOf(item.status) }}</span>
                  <time :datetime="item.updatedAt">{{ formatTime(item.updatedAt) }}</time>
                </span>
              </button>
            </section>
          </template>
          <template v-else>
            <article v-for="item in systemItems" :key="item.id" class="workspace-dock__system-notice" :data-system-id="item.id" :data-severity="item.severity">
              <button type="button" class="workspace-dock__system-toggle" :aria-expanded="expandedSystemNotices.has(item.id)" :aria-controls="`system-notice-detail-${item.id}`" :aria-describedby="`system-notice-detail-${item.id}`" :aria-label="systemNoticeLabel(item)" @click="toggleSystemNotice(item.id)">
                <span class="workspace-dock__system-heading"><DliIcon :name="SYSTEM_NOTICE_ICONS[item.kind]" size="md" /><span class="workspace-dock__notice-title">{{ item.title }}</span><span v-if="item.severity === 'warning'" class="workspace-dock__system-warning">{{ t.workspace.notifications.warning }}</span></span>
                <span :id="`system-notice-detail-${item.id}`" class="workspace-dock__system-body" :class="{ 'dl-clamp-2': !expandedSystemNotices.has(item.id) }">{{ item.body }}</span>
                <span class="workspace-dock__system-meta"><span class="workspace-dock__system-kind">{{ t.workspace.notifications.systemKinds[item.kind] }}</span><time :datetime="item.createdAt">{{ formatTime(item.createdAt) }}</time></span>
              </button>
              <div v-if="expandedSystemNotices.has(item.id)" class="workspace-dock__system-actions"><button type="button" class="workspace-dock__mark-read" :aria-label="t.workspace.notifications.markReadLabel.replace('{title}', item.title)" @click="emit('markSystemRead', item.id)">{{ t.workspace.notifications.markRead }}</button></div>
            </article>
          </template>
        </template>
      </div>
        <button type="button" class="workspace-dock__focus-exit workspace-dock__visually-hidden" :aria-label="t.workspace.notifications.continueToWorkspace" @focus="focusWorkspaceStart" />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.workspace-dock {
  /* 外壳第二行恒高 50px；行内目标使用横向密集行 32px 档，面板宽度钳在视口内。 */
  --dock-height: 50px;
  --dock-chip-max: 280px;
  --dock-panel-width: 480px;
  --dock-notifications-max-height: 640px;
  --dock-notice-min-height: 56px;
  /* 状态点只做「等待你」的辅助标记:6px 足够被看见,又不会和 15px 标题抢视觉重量。 */
  --dock-status-dot-size: 6px;
  /* 组头两行之间的紧凑间距:1px 的发丝级尺寸,集中成局部变量。 */
  --dock-inline-tight: 1px;
  --dock-settings-panel-width: 360px;
  position: relative; grid-column: 1 / -1; display: flex; align-items: center; gap: var(--dl-space-3); height: var(--dock-height); min-width: 0; padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm);
}
.workspace-dock__global-settings { position: relative; display: flex; flex: none; align-items: center; min-width: 0; }
.workspace-dock__right-cluster { display: flex; flex: none; align-items: center; gap: var(--dl-space-2); min-width: 0; }
.workspace-dock__divider { flex: none; inline-size: var(--dl-border-width); block-size: var(--dl-space-6); background: var(--dl-border-base); }
.workspace-dock__groups { display: flex; align-items: center; gap: var(--dl-space-2); flex: 1 1 0; min-width: 0; overflow-x: auto; overscroll-behavior: contain; padding: var(--dl-space-1); }
.workspace-dock__empty { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.workspace-dock__chip { flex: none; display: flex; position: relative; max-width: var(--dock-chip-max); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); }
/* 落点强调:一次静态描边,900ms 后由页面清掉。不依赖动效 —— reduced-motion 下同样可见。 */
.workspace-dock__chip[data-pulsing='true'] { box-shadow: inset 0 0 0 var(--dl-border-width) var(--dl-accent); }
.workspace-dock__chip::before { content: ''; position: absolute; inset-block: var(--dl-space-1); inset-inline-start: 0; width: var(--dl-identity-bar-width); background: var(--dl-identity); }
.workspace-dock__restore { display: flex; align-items: center; min-width: 0; gap: var(--dl-space-2); padding-inline: var(--dl-space-3) var(--dl-space-1); border-radius: var(--dl-radius-md); }
.workspace-dock__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-dock__count { flex: none; color: var(--dl-text-secondary); font-variant-numeric: tabular-nums; }
.workspace-dock__badge { flex: none; font-size: var(--dl-font-size-xs); color: var(--dl-success); white-space: nowrap; }
.workspace-dock__badge[data-awaiting='true'] { color: var(--dl-warning); }
.workspace-dock__badge[data-running='true'] { color: var(--dl-accent); }
.workspace-dock__menu, .workspace-dock__settings-trigger, .workspace-dock__notification-trigger { flex: none; min-width: var(--workspace-nav-control-size); width: var(--workspace-nav-control-size); padding: 0; border-radius: var(--dl-radius-md); }
.workspace-dock__restore, .workspace-dock__menu, .workspace-dock__settings-trigger, .workspace-dock__notification-trigger { min-height: var(--workspace-nav-control-size); color: var(--dl-text-primary); }
/* 头像入口属于横向密集导航行；完整账户名由 aria-label 提供。 */
.workspace-dock__settings-trigger { display: flex; flex: none; align-items: center; justify-content: center; width: var(--workspace-nav-control-size); height: var(--workspace-nav-control-size); color: var(--dl-text-secondary); }
.workspace-dock__notification-trigger { position: relative; display: flex; flex: none; align-items: center; justify-content: center; }
/* 所有宽度提供提示，菜单或抽屉打开后隐藏以免遮挡内容。 */
.workspace-dock__settings-tooltip { position: absolute; inset-block-end: calc(100% + var(--dl-space-2)); inset-inline-start: 0; z-index: var(--dl-z-overlay); padding: var(--dl-space-1) var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-dock__settings-trigger[aria-expanded="false"]:hover + .workspace-dock__settings-tooltip,
.workspace-dock__settings-trigger[aria-expanded="false"]:focus-visible + .workspace-dock__settings-tooltip { opacity: 1; visibility: visible; }
.workspace-dock__settings-trigger .dl-icon, .workspace-dock__notification-trigger .dl-icon { color: var(--dl-text-secondary); }
.workspace-dock__settings-trigger:hover, .workspace-dock__notification-trigger:hover { color: var(--dl-text-primary); }
.workspace-dock__settings-trigger:hover .dl-icon, .workspace-dock__notification-trigger:hover .dl-icon { color: var(--dl-text-primary); }
.workspace-dock__notification-badge { position: absolute; inset-block-start: calc(-1 * var(--dl-space-1)); inset-inline-end: calc(-1 * var(--dl-space-1)); border-radius: var(--dl-radius-pill); padding-inline: var(--dl-space-1); font-size: var(--dl-font-size-xs); background: var(--dl-accent); color: var(--dl-text-on-accent); font-variant-numeric: tabular-nums; }
.workspace-dock__panel { position: absolute; inset-block-end: calc(100% + var(--dl-space-2)); z-index: var(--dl-z-overlay); width: min(var(--dock-panel-width), calc(100vw - 4 * var(--dl-space-2))); max-height: min(70dvh, calc(100dvh - 2 * var(--dock-height))); overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: var(--dl-space-2); padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); }
.workspace-dock__panel--members { inset-inline-start: 0; }
.workspace-dock__panel--settings { inset-inline-start: 0; width: min(var(--dock-settings-panel-width), calc(100vw - 4 * var(--dl-space-2))); }
/* 通知中心是右侧悬浮的磨砂面板:上、右、下各留一档间距,四角完整圆角。
   磨砂只做一层(根节点),高 alpha 保证文字对比度,模糊负责质感。 */
.workspace-dock__drawer {
  position: fixed;
  inset-block-start: var(--dl-space-3);
  inset-block-end: calc(var(--dock-height) + var(--workspace-shell-inset, var(--dl-space-2)) + var(--dl-space-3));
  inset-inline-end: var(--dl-space-3);
  z-index: var(--dl-z-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-3);
  inline-size: clamp(400px, 30vw, 440px);
  padding: var(--dl-space-4);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-xl);
  background: color-mix(in srgb, var(--dl-bg-elevated) 86%, transparent);
  box-shadow: var(--dl-shadow-lg);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
  backdrop-filter: blur(16px) saturate(140%);
}
.workspace-dock__drawer h2 { font-size: var(--dl-font-size-md); font-weight: 500; }
.workspace-dock__notification-actions { display: flex; flex: none; align-items: center; gap: var(--dl-space-1); }
.workspace-dock__drawer-close { display: inline-flex; flex: none; align-items: center; justify-content: center; min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding: 0; border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); }
.workspace-dock__drawer-close svg { inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); stroke-width: var(--dl-icon-stroke); }
.workspace-dock__drawer-close:hover { color: var(--dl-text-primary); }
/* 打开期间铃铛保留 active 指示:它是除 Esc / × 之外的第三个关闭入口。 */
.workspace-dock__notification-trigger[aria-expanded='true'] { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.workspace-dock__notification-trigger[aria-expanded='true'] .dl-icon { color: var(--dl-text-primary); }
/* 不支持磨砂 / 用户要求减少透明 / 强制颜色时,退化为实色面板,布局与层次不变。 */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .workspace-dock__drawer { background: var(--dl-bg-elevated); }
}
@media (prefers-reduced-transparency: reduce) {
  .workspace-dock__drawer { background: var(--dl-bg-elevated); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
@media (forced-colors: active) {
  .workspace-dock__drawer { background: Canvas; border-color: CanvasText; -webkit-backdrop-filter: none; backdrop-filter: none; }
}
/* 抽屉进场从右缘滑入;只动 transform / opacity,退出比进入快。 */
.workspace-notification-drawer-enter-active { transition: transform var(--dl-duration-base) var(--dl-ease-standard), opacity var(--dl-duration-base) var(--dl-ease-standard); }
.workspace-notification-drawer-leave-active { transition: transform var(--dl-duration-fast) var(--dl-ease-standard), opacity var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-notification-drawer-enter-from,
.workspace-notification-drawer-leave-to { opacity: 0; transform: translateX(calc(100% + var(--dl-space-3))); }
.workspace-dock__notification-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-3); min-height: var(--dl-space-8); }
.workspace-dock__all-read { flex: none; min-height: var(--dl-target-size); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.workspace-dock__notification-tabs { flex: none; display: flex; gap: var(--dl-space-1); padding: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); }
.workspace-dock__notification-tabs button { display: inline-flex; flex: 1 1 0; align-items: center; justify-content: center; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-1); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.workspace-dock__notification-tabs button:hover:not([aria-selected='true']) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.workspace-dock__notification-tabs button[aria-selected='true'] { background: var(--dl-accent-soft); color: var(--dl-text-primary); }
.workspace-dock__tab-count { min-inline-size: var(--dl-space-4); padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; line-height: var(--dl-line-tight); text-align: center; }
.workspace-dock__notification-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-1); }
.workspace-dock__notification-list:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); border-radius: var(--dl-radius-sm); }
.workspace-dock__notification-state { display: flex; flex-direction: column; align-items: flex-start; gap: var(--dl-space-2); padding: var(--dl-space-6) var(--dl-space-2); color: var(--dl-text-secondary); }
.workspace-dock__notification-state h3 { font-size: var(--dl-font-size-md); font-weight: 500; color: var(--dl-text-primary); }
.workspace-dock__notification-state p { line-height: var(--dl-line-body); }
.workspace-dock__notification-group + .workspace-dock__notification-group { margin-block-start: var(--dl-space-6); }
/* Agent 组头:头像 + 名称是归属主通道,sticky 吸顶保证滚动时来源始终可见。
   组头只承担 Agent 一个轴;项目放在副标题(单项目)或行内 meta(多项目)。 */
.workspace-dock__agent-heading { position: sticky; inset-block-start: calc(-1 * var(--dl-space-1)); z-index: var(--dl-z-sticky); display: flex; align-items: center; gap: var(--dl-space-2); padding: var(--dl-space-2); border-block-end: var(--dl-border-width) solid var(--dl-border-base); background: var(--dl-bg-elevated); font-weight: 400; }
.workspace-dock__agent-mark { display: inline-grid; flex: none; place-items: center; inline-size: var(--dl-icon-lg); block-size: var(--dl-icon-lg); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-weight: 500; }
.workspace-dock__agent-body { display: grid; flex: 1 1 auto; gap: var(--dock-inline-tight); min-inline-size: 0; }
.workspace-dock__agent-name { min-inline-size: 0; overflow-wrap: anywhere; color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; }
.workspace-dock__agent-project { min-inline-size: 0; overflow-wrap: anywhere; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.workspace-dock__agent-count { flex: none; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }
.workspace-dock__notice + .workspace-dock__notice, .workspace-dock__system-notice + .workspace-dock__system-notice { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.workspace-dock__notice-title { min-width: 0; font-size: var(--dl-font-size-md); font-weight: 400; color: var(--dl-text-primary); line-height: var(--dl-line-body); }
/* 等待你的标题略重一级:唯一需要用户行动的状态,靠字重而不是大色块突出。 */
.workspace-dock__notice[data-status='awaiting'] .workspace-dock__notice-title { font-weight: 500; }
.workspace-dock__notice-title.dl-clamp-2, .workspace-dock__system-body.dl-clamp-2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
/* 抽屉是半透明磨砂面:行内 meta 用二级文字色,保证背后出现浅色内容时仍 ≥4.5:1。
   组头有实色 sticky 底,项目副标题与计数可继续用三级色。 */
.workspace-dock__notice-status { display: inline-flex; align-items: center; gap: var(--dl-space-1); color: var(--dl-text-secondary); }
.workspace-dock__notice-project { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-secondary); }
.workspace-dock__status-dot { display: block; flex: none; inline-size: var(--dock-status-dot-size); block-size: var(--dock-status-dot-size); border-radius: var(--dl-radius-pill); background: var(--dl-warning); }
.workspace-dock__notice-meta time, .workspace-dock__system-meta time { flex: none; margin-inline-start: auto; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }
.workspace-dock__system-toggle { display: flex; flex-direction: column; gap: var(--dl-space-2); width: 100%; padding: var(--dl-space-3) var(--dl-space-2); border-radius: var(--dl-radius-sm); text-align: left; }
.workspace-dock__system-heading { display: flex; align-items: center; gap: var(--dl-space-2); width: 100%; }
.workspace-dock__system-heading .workspace-dock__notice-title { flex: 1 1 0; min-inline-size: 0; }
.workspace-dock__system-heading .dl-icon { color: var(--dl-text-secondary); }
.workspace-dock__system-notice[data-severity='warning'] .dl-icon, .workspace-dock__system-warning { color: var(--dl-warning); }
.workspace-dock__system-warning { flex: none; font-size: var(--dl-font-size-xs); }
.workspace-dock__system-body { font-size: var(--dl-font-size-sm); color: var(--dl-text-secondary); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.workspace-dock__system-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); width: 100%; }
.workspace-dock__system-kind { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
/* 行 hover 把底色抬到 bg-hover 后,三级文字只有 4.41:1;hover 时提到二级保证 ≥4.5:1。 */
.workspace-dock__notice:hover time,
.workspace-dock__notice:hover .workspace-dock__notice-project,
.workspace-dock__notice:hover .workspace-dock__notice-status,
.workspace-dock__system-toggle:hover time,
.workspace-dock__system-toggle:hover .workspace-dock__system-kind { color: var(--dl-text-secondary); }
.workspace-dock__visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.workspace-dock__system-actions { padding: 0 var(--dl-space-2) var(--dl-space-3); }
.workspace-dock__mark-read { min-height: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); }
.workspace-dock__skeleton-row { display: flex; flex-direction: column; justify-content: center; gap: var(--dl-space-2); min-height: var(--dock-notice-min-height); padding: var(--dl-space-3) var(--dl-space-2); }
.workspace-dock__skeleton-row + .workspace-dock__skeleton-row { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.workspace-dock__skeleton-title, .workspace-dock__skeleton-meta { display: block; height: var(--dl-space-4); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); }
.workspace-dock__skeleton-title { width: 75%; }
.workspace-dock__skeleton-body { display: block; width: 100%; height: var(--dl-space-8); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); }
.workspace-dock__skeleton-meta { width: 40%; height: var(--dl-space-3); }
.workspace-dock__panel h2 { font-size: var(--dl-font-size-md); font-weight: 500; }
.workspace-dock__panel h4 { font-size: var(--dl-font-size-sm); font-weight: 500; color: var(--dl-text-secondary); padding: var(--dl-space-2); }
.workspace-dock__panel p { font-size: var(--dl-font-size-sm); color: var(--dl-text-secondary); }
.workspace-dock__member, .workspace-dock__close, .workspace-dock__notice { min-height: var(--dl-target-size); padding: var(--dl-space-2); border-radius: var(--dl-radius-sm); text-align: left; color: var(--dl-text-primary); overflow-wrap: anywhere; }
.workspace-dock__close { border-block-start: var(--dl-border-width) solid var(--dl-border-base); color: var(--dl-error); }
.workspace-dock__retry { align-self: flex-start; min-height: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); }
.workspace-dock__notice { display: flex; flex-direction: column; justify-content: center; gap: var(--dl-space-1); width: 100%; min-height: var(--dock-notice-min-height); padding: var(--dl-space-3) var(--dl-space-2); }
.workspace-dock__notice-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); width: 100%; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
button:hover { background: var(--dl-bg-hover); }
button:focus-visible { box-shadow: var(--dl-focus-ring); }
button:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); cursor: not-allowed; transform: none; }
@media (max-width: 1023px) {
  /* 窄屏没有余量做悬浮留白:恢复贴边全宽,顶部/右侧贴边、无圆角与阴影。 */
  .workspace-dock__drawer { inset-block-start: 0; inset-inline-end: 0; inline-size: 100vw; border: 0; border-radius: 0; box-shadow: none; }
}
@media (max-width: 767px) {
  .workspace-dock { gap: var(--dl-space-1); padding-inline: var(--dl-space-2); }
  .workspace-dock__chip { max-width: calc(4 * var(--dl-space-12)); }
}
.workspace-settings-menu-enter-active { transition: transform var(--dl-duration-base) var(--dl-ease-standard), opacity var(--dl-duration-base) var(--dl-ease-standard); }
.workspace-settings-menu-leave-active { transition: transform var(--dl-duration-fast) var(--dl-ease-standard), opacity var(--dl-duration-fast) var(--dl-ease-standard); }
.workspace-settings-menu-enter-from, .workspace-settings-menu-leave-to { transform: translateY(var(--dl-space-2)); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .workspace-settings-menu-enter-active, .workspace-settings-menu-leave-active { transition: none; }
  .workspace-settings-menu-enter-from, .workspace-settings-menu-leave-to { transform: none; }
  button:active { transform: none; }
  .workspace-notification-drawer-enter-active,
  .workspace-notification-drawer-leave-active { transition: opacity var(--dl-duration-fast) var(--dl-ease-standard); }
  .workspace-notification-drawer-enter-from,
  .workspace-notification-drawer-leave-to { transform: none; }
}
</style>
