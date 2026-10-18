<script setup lang="ts">
// 最小化条按 Agent 分域，通知中心跨 Agent 聚合；浮层放在滚动条目区之外，避免裁切焦点环。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AgentId, ChatSession, SessionStatus } from '../contracts/generated/chat-session'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { AgentNotification } from '../contracts/generated/agent-notification'
import type { MinimizedGroup } from '../contracts/generated/minimized-group'
import type { WorkspaceWindow } from '../contracts/generated/workspace-window'
import type { Project } from '../contracts/generated/project'
import { badgeMapOf } from '../data/project-identity'
import { fileBaseName } from '../data/windows'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{
  groups: MinimizedGroup[]
  windows: WorkspaceWindow[]
  sessions: ChatSession[]
  statusOf: (session: ChatSession) => SessionStatus | null
  projects: Project[]
  agents: readonly AgentSummary[]
  agentId: AgentId
  notifications: AgentNotification[]
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
  marketplaces: []
}>()
const { t, locale, setLocale } = useI18n()
const root = ref<HTMLElement | null>(null)
const settingsTrigger = ref<HTMLButtonElement | null>(null)
const activePanel = ref('')
const panelRef = ref<HTMLElement | null>(null)
const badges = computed(() => badgeMapOf(props.projects))
const activeGroup = computed(() => props.groups.find((group) => group.id === activePanel.value))
const validGroups = computed(() => props.groups.filter((group) => group.memberIds.length > 0))
const waitingCount = computed(() => props.notifications.filter((item) => item.status === 'awaiting').length)
const completedCount = computed(() => props.notifications.filter((item) => item.status === 'completed').length)
const notificationCount = computed(() => waitingCount.value || completedCount.value)
// 全局设置钮的可见徽标与可访问名必须同源:徽标优先等待数,读屏也先报等待数,
// 总数不同时再补一句「共 N 条」—— 两处读到的数字不能各说各话。
const settingsLabel = computed(() => {
  const base = t.value.workspace.settings.label
  const total = props.notifications.length
  if (total === 0) return base
  const primary = waitingCount.value > 0
    ? t.value.workspace.notifications.badge.replace('{count}', String(waitingCount.value))
    : t.value.workspace.notifications.badgeDone.replace('{count}', String(completedCount.value))
  const sorted = total !== notificationCount.value
    ? ` · ${t.value.workspace.notifications.badgeTotal.replace('{count}', String(total))}`
    : ''
  return `${base} · ${primary}${sorted}`
})
const notificationGroups = computed(() => props.agents.flatMap((agent) => {
  const items = props.notifications.filter((item) => item.agentId === agent.id)
  return items.length === 0 ? [] : [{ agentId: agent.id, items }]
}))
function agentNameOf(agentId: AgentId): string {
  return props.agents.find((agent) => agent.id === agentId)?.name ?? ''
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
function openMarketplaces(): void {
  close()
  emit('marketplaces')
}
function close(restoreFocus = false): void {
  const previous = activePanel.value
  activePanel.value = ''
  if (!restoreFocus) return
  if (previous === 'settings') settingsTrigger.value?.focus()
  else root.value?.querySelector<HTMLButtonElement>(`[data-group-menu="${CSS.escape(previous)}"]`)?.focus()
}
async function toggle(id: string, event: MouseEvent): Promise<void> {
  if (activePanel.value === id) { close(); return }
  activePanel.value = id
  await nextTick()
  if (event.detail === 0) panelRef.value?.querySelector<HTMLButtonElement>('button')?.focus()
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
  // 重试按钮会在加载态卸载，先把焦点移回仍在根容器内的设置钮，避免 focusout 误关浮层。
  settingsTrigger.value?.focus()
  emit('retry')
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
  if (buttons.length === 0) return
  const index = buttons.findIndex((item) => item === document.activeElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length
  event.preventDefault()
  buttons[next]?.focus()
}
function onFocusOut(event: FocusEvent): void {
  if (!(event.relatedTarget instanceof Node) || !root.value?.contains(event.relatedTarget)) close()
}
function onOutside(event: PointerEvent): void {
  if (event.target instanceof Node && !root.value?.contains(event.target)) close()
}
watch(() => props.agentId, () => close())
// 异步已读刷新可能移除键盘正在聚焦的条目；先移到设置钮，避免卸载引发的 focusout 误关面板。
watch(() => props.notifications, () => {
  if (activePanel.value !== 'settings') return
  const focused = document.activeElement
  const sessionId = focused instanceof HTMLElement ? focused.closest<HTMLElement>('[data-session-id]')?.dataset.sessionId : undefined
  if (sessionId !== undefined && !props.notifications.some((item) => item.sessionId === sessionId)) settingsTrigger.value?.focus()
})
onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<template>
  <div ref="root" class="workspace-dock" :aria-label="t.workspace.dock.label" role="region" @keydown="onKeydown" @focusout="onFocusOut">
    <!-- 最左端直接是本域的最小化条目(Agent 选择已回到侧栏顶部);
         底栏中央留给「收起了哪些页面」。 -->
    <div class="workspace-dock__groups" role="group" :aria-label="t.workspace.dock.minimizedRegion">
      <span v-if="validGroups.length === 0" class="workspace-dock__empty">{{ t.workspace.dock.empty }}</span>
      <div v-for="group in validGroups" :key="group.id" class="workspace-dock__chip" :class="badges.get(group.projectId)?.identityClass" :data-group-id="group.id" :data-pulsing="group.id === pulseKey ? 'true' : undefined">
        <button type="button" class="workspace-dock__restore" :aria-label="`${t.workspace.dock.restore.replace('{name}', group.name)} · ${t.workspace.dock.groupCount.replace('{count}', String(group.memberIds.length))}${badgeOf(group) ? ` · ${badgeOf(group)}` : ''}`" @click="restore(group.id)">
          <span class="workspace-dock__name">{{ group.name }}</span><span class="workspace-dock__count">×{{ group.memberIds.length }}</span><span v-if="badgeOf(group)" class="workspace-dock__badge" :data-awaiting="badgeOf(group) === t.workspace.sessionStatus.awaiting" :data-running="badgeOf(group) === t.workspace.sessionStatus.streaming">{{ badgeOf(group) }}</span>
        </button>
        <button type="button" class="workspace-dock__menu" :data-group-menu="group.id" :aria-label="`${group.name} · ${t.workspace.dock.members}`" :aria-expanded="activePanel === group.id" aria-controls="dock-group-panel" @click="toggle(group.id, $event)">⋯</button>
      </div>
    </div>
    <!-- 右侧固定「全局设置区」:齿轮不随中间条目滚动,前面用发丝竖线划出边界。
         设置面板里同时承载通知中心(通知是全局的,和设置一样与内容条目分置两端)。 -->
    <span class="workspace-dock__divider" aria-hidden="true" />
    <div class="workspace-dock__global-status" role="group" :aria-label="t.workspace.settings.label">
      <button ref="settingsTrigger" type="button" class="workspace-dock__settings-trigger" :title="settingsLabel" :aria-label="settingsLabel" :aria-expanded="activePanel === 'settings'" aria-controls="workspace-settings-panel" @click="toggle('settings', $event)">
        <DliIcon name="settings" size="md" />
        <span v-if="notificationCount" class="workspace-dock__notification-badge" aria-hidden="true">{{ notificationCount > 99 ? '99+' : notificationCount }}</span>
      </button>
    </div>
    <div v-if="activeGroup" id="dock-group-panel" ref="panelRef" class="workspace-dock__panel workspace-dock__panel--members" role="group" :aria-label="activeGroup.name">
      <h2>{{ activeGroup.name }}</h2>
      <button v-for="id in activeGroup.memberIds" :key="id" type="button" class="workspace-dock__member" :data-member-id="id" :aria-label="t.workspace.dock.restoreMember.replace('{name}', labelOf(id))" @click="restore(activeGroup.id, id)">{{ labelOf(id) }}</button>
      <button type="button" class="workspace-dock__close" :disabled="disabled" @click="closeGroup(activeGroup.id)">{{ t.workspace.dock.closeGroup }}</button>
    </div>
    <div v-else-if="activePanel === 'settings'" id="workspace-settings-panel" ref="panelRef" class="workspace-dock__panel workspace-dock__panel--settings" role="region" :aria-label="t.workspace.settings.label" :aria-busy="notificationsStatus === 'loading'">
      <h2>{{ t.workspace.settings.title }}</h2>
      <!-- 语言是真正影响全局的设置;两个 aria-pressed 按钮是切换钮,不是 menu。 -->
      <div class="workspace-dock__setting-row">
        <span class="workspace-dock__setting-label">{{ t.workspace.settings.language }}</span>
        <div class="workspace-dock__language" role="group" :aria-label="t.workspace.settings.language">
          <button type="button" :aria-pressed="locale === 'zh-CN'" @click="setLocale('zh-CN')">中文</button>
          <button type="button" :aria-pressed="locale === 'en'" @click="setLocale('en')">English</button>
        </div>
      </div>
      <!-- 市场是全局来源:添加 / 移除 / 自动更新 / 立即更新都从这里进入。 -->
      <button type="button" class="workspace-dock__setting-link" @click="openMarketplaces">
        <DliIcon name="plug" size="sm" />
        <span>{{ t.workspace.plugins.marketplaceManagerTitle }}</span>
      </button>
      <div class="workspace-dock__panel-divider" aria-hidden="true" />
      <!-- 通知中心随设置入口一起承载:通知是全局的,与设置同置底栏右端。 -->
      <section class="workspace-dock__settings-notifications" :aria-label="t.workspace.notifications.title">
        <h3>{{ t.workspace.notifications.title }}</h3>
        <p class="workspace-dock__scope">{{ t.workspace.notifications.scope }}</p>
        <p v-if="notificationsStatus === 'loading'">{{ t.workspace.notifications.loading }}</p>
        <template v-else-if="notificationsStatus === 'error'"><p>{{ t.workspace.notifications.error }}</p><button type="button" class="workspace-dock__retry" @click="retryNotifications">{{ t.workspace.retry }}</button></template>
        <p v-else-if="notificationGroups.length === 0">{{ t.workspace.notifications.empty }}</p>
        <section v-for="group in notificationsStatus === 'ready' ? notificationGroups : []" :key="group.agentId" class="workspace-dock__notification-group" :data-agent="group.agentId">
          <h4>{{ agentNameOf(group.agentId) }} · {{ group.items.length }}</h4>
          <button v-for="item in group.items" :key="item.id" type="button" class="workspace-dock__notice" :data-session-id="item.sessionId" :data-status="item.status" :aria-label="t.workspace.notifications.open.replace('{title}', item.title)" @click="openNotification(item)">
            <span>{{ item.title }}</span><span class="workspace-dock__notice-meta"><span>{{ projects.find(project => project.id === item.projectId)?.name ?? item.projectId }}</span><span class="workspace-dock__notice-status" :data-status="item.status">{{ item.status === 'awaiting' ? t.workspace.sessionStatus.awaiting : t.workspace.sessionStatus.completed }}</span><time :datetime="item.updatedAt">{{ formatTime(item.updatedAt) }}</time></span>
          </button>
        </section>
      </section>
    </div>
  </div>
</template>

<style scoped>
.workspace-dock {
  /* 外壳第二行恒高 50px；行内目标使用横向密集行 32px 档，面板宽度钳在视口内。 */
  --dock-height: 50px;
  --dock-chip-max: 280px;
  --dock-panel-width: 420px;
  position: relative; grid-column: 1 / -1; display: flex; align-items: center; gap: var(--dl-space-3); height: var(--dock-height); min-width: 0; padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm);
}
.workspace-dock__global-status { display: flex; flex: none; align-items: center; min-width: 0; }
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
.workspace-dock__notice-status[data-status='awaiting'] { color: var(--dl-warning); }
.workspace-dock__notice-status[data-status='completed'] { color: var(--dl-success); }
.workspace-dock__menu, .workspace-dock__settings-trigger { flex: none; min-width: var(--workspace-nav-control-size); width: var(--workspace-nav-control-size); padding: 0; border-radius: var(--dl-radius-md); }
.workspace-dock__restore, .workspace-dock__menu, .workspace-dock__settings-trigger { min-height: var(--workspace-nav-control-size); color: var(--dl-text-primary); }
.workspace-dock__settings-trigger { position: relative; display: flex; flex: none; align-items: center; justify-content: center; }
.workspace-dock__settings-trigger .dl-icon { color: var(--dl-text-secondary); }
.workspace-dock__notification-badge { position: absolute; inset-block-start: calc(-1 * var(--dl-space-1)); inset-inline-end: calc(-1 * var(--dl-space-1)); border-radius: var(--dl-radius-pill); padding-inline: var(--dl-space-1); font-size: var(--dl-font-size-xs); background: var(--dl-accent); color: var(--dl-text-on-accent); font-variant-numeric: tabular-nums; }
.workspace-dock__panel { position: absolute; inset-block-end: calc(100% + var(--dl-space-2)); z-index: var(--dl-z-overlay); width: min(var(--dock-panel-width), calc(100vw - 4 * var(--dl-space-2))); max-height: min(70dvh, calc(100dvh - 2 * var(--dock-height))); overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: var(--dl-space-2); padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-xl); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-lg); }
.workspace-dock__panel--members { inset-inline-start: 0; }
.workspace-dock__panel--settings { inset-inline-end: 0; }
.workspace-dock__panel h2 { font-size: var(--dl-font-size-md); font-weight: 500; }
.workspace-dock__panel h3, .workspace-dock__panel h4 { font-size: var(--dl-font-size-sm); font-weight: 500; color: var(--dl-text-secondary); padding: var(--dl-space-2); }
.workspace-dock__panel p { font-size: var(--dl-font-size-sm); color: var(--dl-text-secondary); }
.workspace-dock__scope { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
/* 设置面板:一行设置的 label + 控件;语言是两个 aria-pressed 切换钮。 */
.workspace-dock__setting-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--dl-space-2); padding: var(--dl-space-2); }
.workspace-dock__setting-label { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.workspace-dock__setting-link { display: flex; align-items: center; gap: var(--dl-space-2); inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); text-align: left; }
.workspace-dock__setting-link:hover { background: var(--dl-bg-hover); }
.workspace-dock__setting-link:focus-visible { box-shadow: var(--dl-focus-ring); }
.workspace-dock__language { display: flex; align-items: center; gap: var(--dl-space-1); }
.workspace-dock__language button { min-height: var(--dl-control-height); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-pill); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.workspace-dock__language button[aria-pressed='true'] { border-color: transparent; background: var(--dl-accent); color: var(--dl-text-on-accent); }
.workspace-dock__panel-divider { block-size: var(--dl-border-width); background: var(--dl-border-base); }
.workspace-dock__settings-notifications { display: flex; flex-direction: column; gap: var(--dl-space-2); }
.workspace-dock__member, .workspace-dock__close, .workspace-dock__notice { min-height: var(--dl-target-size); padding: var(--dl-space-2); border-radius: var(--dl-radius-sm); text-align: left; color: var(--dl-text-primary); overflow-wrap: anywhere; }
.workspace-dock__close { border-block-start: var(--dl-border-width) solid var(--dl-border-base); color: var(--dl-error); }
.workspace-dock__retry { align-self: flex-start; min-height: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); background: var(--dl-bg-elevated); }
.workspace-dock__notice { display: flex; flex-direction: column; gap: var(--dl-space-1); width: 100%; }
.workspace-dock__notice-meta { display: flex; flex-wrap: wrap; gap: var(--dl-space-2); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
button:hover { background: var(--dl-bg-hover); }
button:focus-visible { box-shadow: var(--dl-focus-ring); }
button:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); cursor: not-allowed; transform: none; }
@media (max-width: 767px) { .workspace-dock { gap: var(--dl-space-1); padding-inline: var(--dl-space-2); } .workspace-dock__chip { max-width: calc(4 * var(--dl-space-12)); } }
@media (prefers-reduced-motion: reduce) { button:active { transform: none; } }
</style>
