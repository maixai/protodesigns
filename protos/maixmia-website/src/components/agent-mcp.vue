<script setup lang="ts">
// 手配与插件贡献分区展示;插件 MCP 只有只读投影,写操作仍只作用于手配服务器。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NInput, NSkeleton, NSwitch } from 'naive-ui'
import type { McpServer } from '../contracts/generated/mcp-server'
import type { McpServerInput, McpTransportId } from '../contracts/generated/mcp-server-input'
import type { PluginMcpServer } from '../contracts/generated/plugin-mcp-server'
import {
  addAgentMcpServer, authenticateAgentMcpServer, listAgentMcpServers, listAgentPluginMcpServers,
  reconnectAgentMcpServer, reconnectAgentPluginMcpServer, removeAgentMcpServer, setAgentMcpServerEnabled,
} from '../api/agent-mcp'
import { useI18n } from '../i18n'
import { useAgentStatusTooltip } from '../data/agent-status'
import DliIcon from './dl-icon.vue'

const props = withDefaults(defineProps<{ agentId: string; agentName: string; active?: boolean }>(), { active: true })
const emit = defineEmits<{
  count: [count: number | undefined]
  announce: [message: string]
  managePlugin: [pluginId: string, marketplaceId: string, pluginName: string]
}>()

const { t } = useI18n()
const rootRef = ref<HTMLElement | null>(null)
const servers = ref<McpServer[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadError = ref('')
const pluginServers = ref<PluginMcpServer[]>([])
const pluginStatus = ref<'loading' | 'ready' | 'error'>('loading')
const pluginLoadError = ref('')
const pluginActionError = ref('')
const reconnectingId = ref('')
const isPluginSectionExpanded = ref(true)
const actionError = ref('')
const isActionErrorAnnounced = ref(false)
const actionErrorRole = computed(() => actionError.value !== '' && !isActionErrorAnnounced.value ? 'alert' : undefined)
function setActionError(message: string, isAnnounced = false): void {
  actionError.value = message
  isActionErrorAnnounced.value = isAnnounced
}
const view = ref<'list' | 'detail' | 'pluginDetail' | 'add'>('list')
const selectedId = ref('')
const listFocusKey = ref('')
const busy = ref(false)
const isConfirmingRemove = ref(false)
const isAlive = ref(true)
let loadVersion = 0
let pluginLoadVersion = 0

const addName = ref('')
const addDisplayName = ref('')
const addTransport = ref<McpTransportId>('stdio')
const addEndpoint = ref('')
const sectionPrefix = `agent-mcp-${props.agentId}`
const selected = ref<McpServer | undefined>(undefined)
const selectedPlugin = ref<PluginMcpServer | undefined>(undefined)

function statusLabel(server: McpServer): string {
  return t.value.workspace.mcp.status[server.status]
}
function pluginStatusLabel(server: PluginMcpServer): string {
  return t.value.workspace.mcp.pluginStatus[server.status]
}
function pluginSourceLabel(server: PluginMcpServer): string {
  return t.value.workspace.mcp.pluginSource.replace('{name}', server.pluginName)
}
function switchLabel(server: McpServer): string {
  const copy = t.value.workspace.mcp
  return (server.enabled ? copy.disableLabel : copy.enableLabel).replace('{name}', server.displayName)
}
function actionLabel(server: McpServer): string {
  const copy = t.value.workspace.mcp
  return (server.status === 'needsAuth' ? copy.authenticateLabel : copy.reconnectLabel).replace('{name}', server.displayName)
}
function announce(template: string, name: string): void {
  emit('announce', template.replace('{name}', name))
}

type McpTooltipTarget = McpServer | PluginMcpServer
function tooltipReason(server: McpTooltipTarget): string {
  const copy = t.value.workspace.mcp
  if (server.status === 'failed') return server.errorMessage
  if (server.status === 'needsAuth') return copy.tooltipNeedsAuth
  if (server.status === 'disabled') return copy.tooltipDisabled
  if (server.status === 'pluginDisabled') return copy.tooltipPluginDisabled
  if (server.status === 'needsConfiguration') return copy.tooltipNeedsConfiguration
  if (server.status === 'pending') return copy.tooltipPending
  return ''
}
const {
  setTooltipRef, tooltipAnchor, tooltipAgentId: tooltipServerId, tooltipId, tooltipText, isTooltipOpen, isTooltipVisible,
  showTooltip, hideTooltip, dismissTooltip, leaveTooltip, scheduleTooltipClose, clearTooltipTimer, onTooltipTransitionEnd,
} = useAgentStatusTooltip<McpTooltipTarget>(
  (id) => servers.value.find((server) => server.id === id) ?? pluginServers.value.find((server) => server.id === id),
  (server) => ({ state: server.status === 'connected' ? 'online' : server.status, tooltip: tooltipReason(server) }),
)
function tooltipDescribedBy(server: McpTooltipTarget): string | undefined {
  return isTooltipOpen.value && tooltipAnchor.value !== null && tooltipServerId.value === server.id ? tooltipId : undefined
}

function emitCount(): void {
  emit('count', status.value === 'ready' && pluginStatus.value === 'ready'
    ? servers.value.length + pluginServers.value.length
    : undefined)
}

async function loadManual(): Promise<void> {
  const version = ++loadVersion
  status.value = 'loading'
  loadError.value = ''
  emitCount()
  const result = await listAgentMcpServers(props.agentId)
  if (!isAlive.value || version !== loadVersion) return
  if (!result.ok) {
    status.value = 'error'
    loadError.value = result.error.message
    servers.value = []
    emitCount()
    return
  }
  servers.value = result.value
  status.value = 'ready'
  updateSelected()
  emitCount()
}

async function loadPlugins(): Promise<void> {
  const version = ++pluginLoadVersion
  pluginStatus.value = 'loading'
  pluginLoadError.value = ''
  emitCount()
  const result = await listAgentPluginMcpServers(props.agentId)
  if (!isAlive.value || version !== pluginLoadVersion) return
  if (!result.ok) {
    pluginStatus.value = 'error'
    pluginLoadError.value = result.error.message
    pluginServers.value = []
    emitCount()
    return
  }
  pluginServers.value = result.value
  pluginStatus.value = 'ready'
  if (selectedPlugin.value !== undefined) {
    selectedPlugin.value = result.value.find((server) => server.id === selectedPlugin.value?.id)
    if (selectedPlugin.value === undefined && view.value === 'pluginDetail') void navigate('list')
  }
  emitCount()
}

function load(): void {
  void Promise.all([loadManual(), loadPlugins()])
}

function sourceRow(): HTMLElement | null {
  return [...rootRef.value?.querySelectorAll<HTMLElement>('.mcp-main') ?? []]
    .find((element) => element.dataset['serverId'] === listFocusKey.value) ?? null
}
async function navigate(next: typeof view.value): Promise<void> {
  dismissTooltip()
  setActionError('')
  isConfirmingRemove.value = false
  view.value = next
  await nextTick()
  const target = next === 'list'
    ? sourceRow() ?? rootRef.value?.querySelector<HTMLElement>('.mcp-add')
    : rootRef.value?.querySelector<HTMLElement>('.mcp-back')
  target?.focus({ preventScroll: true })
}
function openDetail(server: McpServer): void {
  selectedId.value = server.id
  selected.value = server
  selectedPlugin.value = undefined
  listFocusKey.value = server.id
  void navigate('detail')
}
function openPluginDetail(server: PluginMcpServer): void {
  selected.value = undefined
  selectedPlugin.value = server
  listFocusKey.value = server.id
  void navigate('pluginDetail')
}
function managePlugin(server: PluginMcpServer): void {
  emit('managePlugin', server.pluginId, server.marketplaceId, server.pluginName)
}
function manageSelectedPlugin(): void {
  const server = selectedPlugin.value
  if (server !== undefined) managePlugin(server)
}
function pluginReconnectButton(serverId: string): HTMLElement | null {
  return [...rootRef.value?.querySelectorAll<HTMLElement>('.mcp-plugin-reconnect') ?? []]
    .find((element) => element.dataset['reconnectId'] === serverId
      && (view.value === 'pluginDetail' ? element.closest('.mcp-plugin-detail') !== null : element.closest('.mcp-plugin-row') !== null)) ?? null
}
function pluginDetailRow(serverId: string): HTMLElement | null {
  return [...rootRef.value?.querySelectorAll<HTMLElement>('.mcp-plugin-main') ?? []]
    .find((element) => element.dataset['serverId'] === serverId) ?? null
}
async function reconnectPlugin(server: PluginMcpServer): Promise<void> {
  if (reconnectingId.value !== '' || server.status !== 'failed') return
  reconnectingId.value = server.id
  pluginActionError.value = ''
  const copy = t.value.workspace.mcp
  const result = await reconnectAgentPluginMcpServer(props.agentId, server.sdkName)
  if (!isAlive.value) return
  reconnectingId.value = ''
  if (!result.ok) {
    pluginActionError.value = result.error.message
    announce(copy.pluginReconnectFailedAnnounce, server.displayName)
    await nextTick()
    pluginReconnectButton(server.id)?.focus({ preventScroll: true })
    return
  }
  pluginServers.value = result.value
  pluginStatus.value = 'ready'
  selectedPlugin.value = result.value.find((item) => item.id === server.id) ?? selectedPlugin.value
  emitCount()
  announce(copy.reconnectedAnnounce, server.displayName)
  await nextTick()
  const focusTarget = view.value === 'pluginDetail'
    ? rootRef.value?.querySelector<HTMLElement>('.mcp-plugin-detail .mcp-back')
    : pluginDetailRow(server.id)
  focusTarget?.focus({ preventScroll: true })
}
function openAdd(): void {
  addName.value = ''
  addDisplayName.value = ''
  addTransport.value = 'stdio'
  addEndpoint.value = ''
  void navigate('add')
}
function back(): void {
  if (!busy.value) void navigate('list')
}
function onEscape(event: KeyboardEvent): void {
  if (isTooltipOpen.value) {
    event.preventDefault()
    event.stopPropagation()
    hideTooltip()
    return
  }
  if (view.value === 'list') return
  event.preventDefault()
  event.stopPropagation()
  back()
}
function updateSelected(): void {
  if (selected.value !== undefined) selected.value = servers.value.find((server) => server.id === selectedId.value)
}

function manualConnectButton(serverId: string): HTMLElement | null {
  return [...rootRef.value?.querySelectorAll<HTMLElement>('.mcp-connect-action') ?? []]
    .find((element) => element.dataset['connectId'] === serverId
      && (view.value === 'detail' ? element.closest('.mcp-detail') !== null : element.closest('.mcp-row') !== null)) ?? null
}

async function connect(server: McpServer): Promise<void> {
  if (busy.value) return
  busy.value = true
  setActionError('')
  const copy = t.value.workspace.mcp
  const isAuth = server.status === 'needsAuth'
  const request = isAuth ? authenticateAgentMcpServer : reconnectAgentMcpServer
  const result = await request(props.agentId, server.id)
  busy.value = false
  if (!isAlive.value) return
  if (!result.ok) {
    setActionError(result.error.message, true)
    announce(copy.connectionFailedAnnounce, server.displayName)
    await nextTick()
    manualConnectButton(server.id)?.focus({ preventScroll: true })
    return
  }
  servers.value = result.value
  updateSelected()
  announce(isAuth ? copy.authenticatedAnnounce : copy.reconnectedAnnounce, server.displayName)
  await nextTick()
  const focusTarget = view.value === 'detail'
    ? rootRef.value?.querySelector<HTMLElement>('.mcp-detail .mcp-back')
    : [...rootRef.value?.querySelectorAll<HTMLElement>('.mcp-main') ?? []].find((element) => element.dataset['serverId'] === server.id)
  focusTarget?.focus({ preventScroll: true })
}
async function toggleEnabled(server: McpServer, enabled: boolean): Promise<void> {
  if (busy.value) return
  busy.value = true
  setActionError('')
  const result = await setAgentMcpServerEnabled(props.agentId, server.id, enabled)
  busy.value = false
  if (!isAlive.value) return
  if (!result.ok) { setActionError(result.error.message); return }
  servers.value = result.value
  updateSelected()
  const copy = t.value.workspace.mcp
  announce(enabled ? copy.enabledAnnounce : copy.disabledAnnounce, server.displayName)
}
async function setRemoveConfirmation(value: boolean): Promise<void> {
  isConfirmingRemove.value = value
  await nextTick()
  rootRef.value?.querySelector<HTMLElement>(value ? '.mcp-confirm .mcp-danger' : '.mcp-detail-actions .mcp-danger')?.focus({ preventScroll: true })
}
async function removeSelected(): Promise<void> {
  const server = selected.value
  if (server === undefined || busy.value) return
  busy.value = true
  setActionError('')
  const result = await removeAgentMcpServer(props.agentId, server.id)
  busy.value = false
  if (!isAlive.value) return
  if (!result.ok) { setActionError(result.error.message); return }
  servers.value = result.value
  emitCount()
  announce(t.value.workspace.mcp.removedAnnounce, server.displayName)
  selected.value = undefined
  listFocusKey.value = ''
  await navigate('list')
}
async function submitAdd(): Promise<void> {
  if (busy.value) return
  const copy = t.value.workspace.mcp
  const name = addName.value.trim()
  const endpoint = addEndpoint.value.trim()
  if (name === '' || endpoint === '') { setActionError(copy.requiredFields); return }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) { setActionError(copy.invalidName); return }
  if (servers.value.some((server) => server.name === name)) { setActionError(copy.duplicateName); return }
  const input: McpServerInput = { name, displayName: addDisplayName.value.trim(), transport: addTransport.value, endpoint }
  busy.value = true
  setActionError('')
  const result = await addAgentMcpServer(props.agentId, input)
  busy.value = false
  if (!isAlive.value) return
  if (!result.ok) { setActionError(result.error.message); return }
  servers.value = result.value
  emitCount()
  listFocusKey.value = `agent:${props.agentId}:${name}`
  announce(copy.addedAnnounce, addDisplayName.value.trim() || name)
  await navigate('list')
}

watch(() => props.agentId, () => {
  dismissTooltip()
  view.value = 'list'
  selected.value = undefined
  selectedPlugin.value = undefined
  selectedId.value = ''
  listFocusKey.value = ''
  servers.value = []
  pluginServers.value = []
  pluginActionError.value = ''
  reconnectingId.value = ''
  setActionError('')
  isPluginSectionExpanded.value = true
  load()
}, { immediate: true })
watch(() => props.active, (active, wasActive) => {
  // v-show 保留列表、详情与滚动位置;重新激活只刷新可能已在插件页变化的投影。
  if (active && wasActive === false) void loadPlugins()
})
onBeforeUnmount(() => { isAlive.value = false })
</script>

<template>
  <section ref="rootRef" class="agent-mcp" :data-view="view" :aria-busy="busy || status === 'loading' || pluginStatus === 'loading'" @keydown.esc="onEscape">
    <!-- 已 announce 的连接失败不重复播报;其余手配校验与操作错误保留 assertive alert。 -->
    <p v-if="actionError" class="mcp-error" :role="actionErrorRole">{{ actionError }}</p>
    <!-- 失败只经页面既有 announce 通道播报一次;这里保留可见错误,不再叠加 role="alert"。 -->
    <p v-if="pluginActionError" class="mcp-error">{{ pluginActionError }}</p>
    <div v-show="view === 'list'" class="mcp-list-view">
      <section class="mcp-manual-section" data-group="manual">
        <div class="mcp-toolbar">
          <h3>{{ t.workspace.mcp.agentListTitle }}</h3>
          <button type="button" class="mcp-add" :disabled="busy || status !== 'ready'" :aria-label="t.workspace.mcp.add" :title="t.workspace.mcp.add" @click="openAdd"><span aria-hidden="true">＋</span></button>
        </div>
        <div v-if="status === 'loading'" class="mcp-state" :aria-label="t.workspace.mcp.loadingAgent"><NSkeleton text :repeat="3" :animated="false" /></div>
        <div v-else-if="status === 'error'" class="mcp-state"><p role="alert">{{ loadError }}</p><button type="button" class="mcp-action" @click="loadManual">{{ t.workspace.mcp.retry }}</button></div>
        <div v-else-if="servers.length === 0" class="mcp-state"><p>{{ t.workspace.mcp.emptyAgent }}</p><button type="button" class="mcp-action" :aria-label="t.workspace.mcp.add" @click="openAdd">{{ t.workspace.mcp.add }}</button></div>
        <ul v-else class="mcp-list">
          <li v-for="server in servers" :key="server.id" class="mcp-row" :data-status="server.status">
            <button
              type="button" class="mcp-main" :data-server-id="server.id" :disabled="busy"
              :aria-describedby="tooltipDescribedBy(server)"
              @pointerenter="showTooltip($event, server)" @pointerleave="leaveTooltip"
              @focus="showTooltip($event, server)" @blur="leaveTooltip" @click="openDetail(server)"
            >
              <span class="mcp-title"><span class="mcp-status-dot" aria-hidden="true" /><span class="mcp-name">{{ server.displayName }}</span><span class="mcp-visually-hidden">{{ statusLabel(server) }}</span></span>
              <span v-if="server.status === 'connected' && server.tools.length > 0" class="mcp-meta"><span class="mcp-tools-count">{{ t.workspace.mcp.tools.replace('{count}', String(server.tools.length)) }}</span></span>
            </button>
            <div class="mcp-row-controls">
              <button v-if="server.status === 'needsAuth' || server.status === 'failed'" type="button" class="mcp-inline-action mcp-connect-action" :data-connect-id="server.id" :disabled="busy" :aria-label="actionLabel(server)" @click="connect(server)">{{ server.status === 'needsAuth' ? t.workspace.mcp.authenticate : t.workspace.mcp.reconnect }}</button>
              <NSwitch class="mcp-switch" size="small" :value="server.enabled" :disabled="busy" :aria-label="switchLabel(server)" @update:value="(enabled: boolean) => toggleEnabled(server, enabled)" />
            </div>
          </li>
        </ul>
      </section>

      <section
        v-if="pluginStatus === 'error' || pluginServers.length > 0 || (pluginStatus === 'loading' && status === 'ready')"
        class="mcp-plugin-section" data-group="plugins"
      >
        <div class="mcp-toolbar mcp-plugin-toolbar">
          <h3>
            <button type="button" class="mcp-plugin-disclosure" :aria-expanded="isPluginSectionExpanded" :aria-controls="`${sectionPrefix}-plugins`" @click="isPluginSectionExpanded = !isPluginSectionExpanded">
              <DliIcon class="mcp-plugin-chevron" :class="{ 'is-expanded': isPluginSectionExpanded }" name="chevronRight" size="sm" />
              <span>{{ t.workspace.mcp.pluginListTitle }}</span><span v-if="pluginStatus === 'ready'" class="mcp-plugin-count">{{ pluginServers.length }}</span>
            </button>
          </h3>
        </div>
        <div :id="`${sectionPrefix}-plugins`" v-show="isPluginSectionExpanded" class="mcp-plugin-content">
          <div v-if="pluginStatus === 'loading' && pluginServers.length === 0" class="mcp-state" :aria-label="t.workspace.mcp.loadingPlugins"><NSkeleton text :repeat="1" :animated="false" /></div>
          <div v-else-if="pluginStatus === 'error'" class="mcp-state mcp-plugin-error"><p role="alert">{{ pluginLoadError }}</p><button type="button" class="mcp-action" @click="loadPlugins">{{ t.workspace.mcp.retry }}</button></div>
          <ul v-else class="mcp-list mcp-plugin-list">
            <li v-for="server in pluginServers" :key="server.id" class="mcp-row mcp-plugin-row" :data-status="server.status" :aria-busy="reconnectingId === server.id">
              <button
                type="button" class="mcp-main mcp-plugin-main" :data-server-id="server.id"
                :aria-describedby="tooltipDescribedBy(server)"
                @pointerenter="showTooltip($event, server)" @pointerleave="leaveTooltip"
                @focus="showTooltip($event, server)" @blur="leaveTooltip" @click="openPluginDetail(server)"
              >
                <span class="mcp-title"><span class="mcp-status-dot" aria-hidden="true" /><span class="mcp-name">{{ server.displayName }}</span><span class="mcp-visually-hidden">{{ pluginStatusLabel(server) }}</span></span>
                <span class="mcp-meta mcp-plugin-meta">
                  <span class="mcp-plugin-source">{{ pluginSourceLabel(server) }}</span>
                  <span v-if="server.status === 'connected' && server.tools.length > 0" class="mcp-tools-count">{{ t.workspace.mcp.tools.replace('{count}', String(server.tools.length)) }}</span>
                </span>
              </button>
              <button
                v-if="server.status === 'failed'" type="button" class="mcp-plugin-reconnect"
                :data-reconnect-id="server.id" :aria-disabled="reconnectingId === server.id"
                :aria-label="t.workspace.mcp.reconnectLabel.replace('{name}', server.displayName)"
                @click="reconnectPlugin(server)"
              >{{ reconnectingId === server.id ? t.workspace.mcp.reconnecting : t.workspace.mcp.reconnect }}</button>
              <button
                v-else-if="server.status === 'needsAuth' || server.status === 'needsConfiguration' || server.status === 'pluginDisabled'"
                type="button" class="mcp-plugin-manage" :aria-label="t.workspace.mcp.managePluginLabel.replace('{name}', server.pluginName)"
                @click="managePlugin(server)"
              >{{ t.workspace.mcp.manage }}</button>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <div v-if="view === 'detail' && selected" class="mcp-pane mcp-detail">
      <div class="mcp-page-nav"><button type="button" class="mcp-back" :disabled="busy" @click="back"><DliIcon name="chevronLeft" size="sm" /><span>{{ t.workspace.mcp.back }}</span></button></div>
      <div class="mcp-detail-identity"><h3>{{ selected.displayName }}</h3><code>{{ selected.name }}</code></div>
      <p class="mcp-description">{{ selected.description }}</p>
      <dl class="mcp-facts">
        <div><dt>{{ t.workspace.mcp.transport }}</dt><dd><code>{{ selected.transport }}</code></dd></div>
        <div><dt>{{ t.workspace.mcp.endpoint }}</dt><dd><code>{{ selected.endpoint }}</code></dd></div>
        <div><dt>{{ t.workspace.mcp.source }}</dt><dd>{{ t.workspace.mcp.sourceAgent }}</dd></div>
      </dl>
      <p class="mcp-detail-status" :data-status="selected.status"><span class="mcp-status-dot" aria-hidden="true" />{{ statusLabel(selected) }}<span v-if="selected.status === 'connected'" class="mcp-tools-count">{{ t.workspace.mcp.tools.replace('{count}', String(selected.tools.length)) }}</span></p>
      <p v-if="selected.status === 'failed'" class="mcp-error mcp-error-detail" role="alert">{{ selected.errorMessage }}</p>
      <section class="mcp-tools"><h4>{{ t.workspace.mcp.toolsTitle }}</h4>
        <ul v-if="selected.status === 'connected'"><li v-for="tool in selected.tools" :key="tool.name"><code>{{ tool.name }}</code><p>{{ tool.description }}</p></li></ul>
        <p v-else class="mcp-hint">{{ selected.status === 'needsAuth' ? t.workspace.mcp.toolsAfterAuth : selected.status === 'failed' ? t.workspace.mcp.toolsAfterReconnect : t.workspace.mcp.toolsAfterEnable }}</p>
      </section>
      <div v-if="!isConfirmingRemove" class="mcp-actions mcp-detail-actions">
        <button v-if="selected.status === 'needsAuth' || selected.status === 'failed'" type="button" class="mcp-action mcp-connect-action" :data-connect-id="selected.id" :disabled="busy" @click="connect(selected)">{{ selected.status === 'needsAuth' ? t.workspace.mcp.authenticate : t.workspace.mcp.reconnect }}</button>
        <button type="button" class="mcp-action" :disabled="busy" @click="toggleEnabled(selected, !selected.enabled)">{{ selected.enabled ? t.workspace.mcp.disable : t.workspace.mcp.enable }}</button>
        <button type="button" class="mcp-action mcp-danger" :disabled="busy" @click="setRemoveConfirmation(true)">{{ t.workspace.mcp.remove }}</button>
      </div>
      <div v-if="isConfirmingRemove" class="mcp-confirm"><p>{{ t.workspace.mcp.removeConfirm.replace('{name}', selected.displayName) }}</p><div class="mcp-actions"><button type="button" class="mcp-action" @click="setRemoveConfirmation(false)">{{ t.workspace.mcp.removeCancel }}</button><button type="button" class="mcp-action mcp-danger" :disabled="busy" @click="removeSelected">{{ t.workspace.mcp.confirmRemove }}</button></div></div>
    </div>

    <div v-if="view === 'pluginDetail' && selectedPlugin" class="mcp-pane mcp-detail mcp-plugin-detail">
      <div class="mcp-page-nav"><button type="button" class="mcp-back" @click="back"><DliIcon name="chevronLeft" size="sm" /><span>{{ t.workspace.mcp.back }}</span></button></div>
      <div class="mcp-detail-identity"><h3>{{ selectedPlugin.displayName }}</h3></div>
      <p class="mcp-description">{{ selectedPlugin.description }}</p>
      <dl class="mcp-facts">
        <div><dt>{{ t.workspace.mcp.source }}</dt><dd>{{ pluginSourceLabel(selectedPlugin) }}</dd></div>
        <div><dt>{{ t.workspace.mcp.runtimeName }}</dt><dd><code>{{ selectedPlugin.sdkName }}</code></dd></div>
      </dl>
      <p class="mcp-detail-status" :data-status="selectedPlugin.status"><span class="mcp-status-dot" aria-hidden="true" />{{ pluginStatusLabel(selectedPlugin) }}<span v-if="selectedPlugin.status === 'connected' && selectedPlugin.tools.length > 0" class="mcp-tools-count">{{ t.workspace.mcp.tools.replace('{count}', String(selectedPlugin.tools.length)) }}</span></p>
      <p v-if="selectedPlugin.status === 'failed'" class="mcp-error mcp-error-detail" role="alert">{{ selectedPlugin.errorMessage }}</p>
      <section v-if="selectedPlugin.status === 'connected'" class="mcp-tools"><h4>{{ t.workspace.mcp.toolsTitle }}</h4>
        <ul><li v-for="tool in selectedPlugin.tools" :key="tool.name"><code>{{ tool.name }}</code><p>{{ tool.description }}</p></li></ul>
      </section>
      <div class="mcp-actions">
        <button
          v-if="selectedPlugin.status === 'failed'" type="button" class="mcp-action mcp-plugin-reconnect"
          :data-reconnect-id="selectedPlugin.id" :aria-disabled="reconnectingId === selectedPlugin.id"
          :aria-label="t.workspace.mcp.reconnectLabel.replace('{name}', selectedPlugin.displayName)"
          @click="reconnectPlugin(selectedPlugin)"
        >{{ reconnectingId === selectedPlugin.id ? t.workspace.mcp.reconnecting : t.workspace.mcp.reconnect }}</button>
        <button type="button" class="mcp-action" @click="manageSelectedPlugin">{{ t.workspace.mcp.manageInPlugin }}</button>
      </div>
    </div>

    <form v-if="view === 'add'" class="mcp-pane mcp-add-form" @submit.prevent="submitAdd">
      <div class="mcp-page-nav"><button type="button" class="mcp-back" :disabled="busy" @click="back"><DliIcon name="chevronLeft" size="sm" /><span>{{ t.workspace.mcp.back }}</span></button></div>
      <h3>{{ t.workspace.mcp.addTitle }}</h3>
      <p class="mcp-description">{{ t.workspace.mcp.addHint.replace('{name}', agentName) }}</p>
      <div class="mcp-field"><label :for="`${sectionPrefix}-name`">{{ t.workspace.mcp.name }}</label><NInput v-model:value="addName" :disabled="busy" :placeholder="t.workspace.mcp.namePlaceholder" :input-props="{ id: `${sectionPrefix}-name`, spellcheck: false, autocomplete: 'off' }" /><p class="mcp-hint">{{ t.workspace.mcp.nameHint }}</p></div>
      <div class="mcp-field"><label :for="`${sectionPrefix}-display-name`">{{ t.workspace.mcp.displayName }}</label><NInput v-model:value="addDisplayName" :disabled="busy" :placeholder="t.workspace.mcp.displayNamePlaceholder" :input-props="{ id: `${sectionPrefix}-display-name` }" /></div>
      <div class="mcp-field"><label :for="`${sectionPrefix}-transport`">{{ t.workspace.mcp.transportLabel }}</label><select :id="`${sectionPrefix}-transport`" v-model="addTransport" class="mcp-select" :disabled="busy"><option value="stdio">stdio</option><option value="http">http</option><option value="sse">sse</option></select></div>
      <div class="mcp-field"><label :for="`${sectionPrefix}-endpoint`">{{ t.workspace.mcp.endpointLabel }}</label><NInput v-model:value="addEndpoint" :disabled="busy" :placeholder="t.workspace.mcp.endpointPlaceholder" :input-props="{ id: `${sectionPrefix}-endpoint`, spellcheck: false, autocomplete: 'off' }" /></div>
      <div class="mcp-actions"><button type="submit" class="mcp-action" :disabled="busy">{{ busy ? t.workspace.mcp.adding : t.workspace.mcp.submitAdd }}</button><button type="button" class="mcp-action" :disabled="busy" @click="back">{{ t.workspace.mcp.cancel }}</button></div>
    </form>
    <div :id="tooltipId" :ref="setTooltipRef" class="mcp-status-tooltip" popover="manual" role="tooltip" :data-visible="isTooltipVisible" @transitionend="onTooltipTransitionEnd" @pointerenter="clearTooltipTimer" @pointerleave="scheduleTooltipClose">{{ tooltipText }}</div>
  </section>
</template>

<style scoped>
.agent-mcp { min-inline-size: 0; padding: var(--dl-space-1); color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.mcp-list-view, .mcp-pane, .mcp-state, .mcp-list, .mcp-field { min-inline-size: 0; }
.mcp-list-view { display: grid; gap: var(--dl-space-3); }
.mcp-manual-section, .mcp-plugin-section { display: grid; gap: var(--dl-space-2); min-inline-size: 0; }
.mcp-toolbar, .mcp-page-nav { display: flex; align-items: center; border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-toolbar { justify-content: space-between; }
.mcp-toolbar h3 { font-size: var(--dl-font-size-sm); font-weight: 500; }
.mcp-plugin-toolbar h3 { min-inline-size: 0; }
.mcp-plugin-disclosure { display: flex; align-items: center; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--workspace-nav-control-size); color: var(--dl-text-secondary); text-align: left; border-radius: var(--dl-radius-sm); }
.mcp-plugin-chevron { flex: none; transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.mcp-plugin-chevron.is-expanded { transform: rotate(90deg); }
.mcp-plugin-count { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; font-weight: 400; }
.mcp-plugin-content { min-inline-size: 0; }
.mcp-add { display: inline-grid; place-items: center; inline-size: var(--workspace-nav-control-size); min-block-size: var(--workspace-nav-control-size); color: var(--dl-text-secondary); border-radius: var(--dl-radius-sm); }
.mcp-hint, .mcp-description { color: var(--dl-text-secondary); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.mcp-hint { padding: var(--dl-space-1); color: var(--dl-text-tertiary); }
.mcp-state { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-2) var(--dl-space-1); color: var(--dl-text-secondary); }
.mcp-list { display: grid; }
.mcp-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; min-inline-size: 0; }
.mcp-row + .mcp-row { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-main { display: grid; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-1); text-align: left; border-radius: var(--dl-radius-sm); }
.mcp-title, .mcp-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-1) var(--dl-space-2); min-inline-size: 0; }
.mcp-title { align-items: center; }
.mcp-name { font-size: var(--dl-font-size-sm); font-weight: 500; overflow-wrap: anywhere; }
.mcp-title code, .mcp-meta code, .mcp-detail-identity code, .mcp-facts code, .mcp-tools code { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.mcp-meta { color: var(--dl-text-secondary); }
.mcp-plugin-row { grid-template-columns: minmax(0, 1fr) auto; }
.mcp-plugin-source { color: var(--dl-text-secondary); overflow-wrap: anywhere; }
.mcp-visually-hidden { position: absolute; inline-size: var(--dl-border-width); block-size: var(--dl-border-width); padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.mcp-plugin-reconnect, .mcp-plugin-manage { display: inline-flex; align-items: center; justify-content: center; min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); margin-inline-end: var(--dl-space-1); padding-inline: var(--dl-space-2); color: var(--dl-accent); border-radius: var(--dl-radius-sm); }
.mcp-plugin-reconnect[aria-disabled='true'] { color: var(--dl-text-secondary); }
.mcp-status-dot { flex: none; inline-size: calc(var(--dl-space-2) + var(--dl-border-width) * 2); block-size: calc(var(--dl-space-2) + var(--dl-border-width) * 2); border: var(--dl-border-width) solid var(--dl-text-tertiary); border-radius: var(--dl-radius-pill); background: transparent; }
.mcp-row[data-status='connected'] .mcp-status-dot, .mcp-detail-status[data-status='connected'] .mcp-status-dot { border-color: var(--dl-success); background: var(--dl-success); }
.mcp-row[data-status='pending'] .mcp-status-dot, .mcp-detail-status[data-status='pending'] .mcp-status-dot { border-color: var(--dl-accent); }
.mcp-row[data-status='needsAuth'] .mcp-status-dot, .mcp-detail-status[data-status='needsAuth'] .mcp-status-dot, .mcp-row[data-status='needsConfiguration'] .mcp-status-dot, .mcp-detail-status[data-status='needsConfiguration'] .mcp-status-dot { border-color: var(--dl-warning); background: var(--dl-warning); }
.mcp-row[data-status='failed'] .mcp-status-dot, .mcp-detail-status[data-status='failed'] .mcp-status-dot { border-color: var(--dl-error); background: var(--dl-error); }
.mcp-tools-count { font-family: var(--dl-font-mono); color: var(--dl-text-tertiary); }
.mcp-status-tooltip { position: fixed; inset: auto; inset-inline-start: var(--agent-status-left); inset-block-start: var(--agent-status-top); margin: 0; padding: var(--dl-space-2) var(--dl-space-3); inline-size: max-content; max-inline-size: min(var(--dl-measure), calc(100vw - 2 * var(--dl-space-2))); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); background: var(--dl-bg-elevated); color: var(--dl-text-primary); font-family: var(--dl-font-sans); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); overflow-wrap: anywhere; opacity: 0; pointer-events: none; transition: opacity var(--dl-duration-fast) var(--dl-ease-standard); }
.mcp-status-tooltip[data-visible='true'] { opacity: 1; pointer-events: auto; }
.mcp-status-tooltip::backdrop { background: transparent; pointer-events: none; }
.mcp-row-controls { display: flex; align-items: center; gap: var(--dl-space-1); padding-inline-end: var(--dl-space-1); }
.mcp-inline-action, .mcp-action { display: inline-flex; align-items: center; min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); color: var(--dl-accent); border-radius: var(--dl-radius-sm); text-align: left; }
.mcp-switch { min-inline-size: var(--dl-space-8); min-block-size: var(--dl-space-6); }
.mcp-switch:focus-visible { box-shadow: var(--dl-focus-ring); }
.mcp-pane { display: grid; gap: var(--dl-space-3); padding-block-start: var(--dl-space-3); }
.mcp-back { flex: 1; display: flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--workspace-nav-control-size); color: var(--dl-text-secondary); font-weight: 500; text-align: left; border-radius: var(--dl-radius-sm); }
.mcp-detail-identity h3, .mcp-add-form h3 { font-size: var(--dl-font-size-md); font-weight: 500; line-height: var(--dl-line-tight); overflow-wrap: anywhere; }
.mcp-facts { display: grid; gap: var(--dl-space-2); margin: 0; }
.mcp-facts > div { display: grid; gap: var(--dl-space-1); }
.mcp-facts dt, .mcp-tools h4 { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); font-weight: 500; letter-spacing: var(--dl-tracking-label); }
.mcp-facts dd { margin: 0; color: var(--dl-text-secondary); overflow-wrap: anywhere; }
.mcp-detail-status { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1) var(--dl-space-2); }
.mcp-tools { display: grid; gap: var(--dl-space-2); padding-block-start: var(--dl-space-3); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-tools ul { display: grid; }
.mcp-tools li { display: grid; gap: var(--dl-space-1); padding-block: var(--dl-space-2); }
.mcp-tools li + li { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-tools li code { color: var(--dl-text-primary); }
.mcp-tools li p { color: var(--dl-text-secondary); }
.mcp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); }
.mcp-danger, .mcp-error { color: var(--dl-error); }
.mcp-error { padding: var(--dl-space-2); border: var(--dl-border-width) solid color-mix(in srgb, var(--dl-error) 35%, transparent); border-radius: var(--dl-radius-md); background: color-mix(in srgb, var(--dl-error) 8%, transparent); overflow-wrap: anywhere; }
.mcp-error-detail { padding-inline: 0; border: 0; background: transparent; }
.mcp-confirm { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-3); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); }
.mcp-field { display: grid; gap: var(--dl-space-2); }
.mcp-field label { font-weight: 500; }
.mcp-field :deep(.n-input__input-el) { min-block-size: var(--dl-target-size); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.mcp-select { inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.agent-mcp button:hover:not(:disabled) { background: var(--dl-bg-hover); }
.agent-mcp button:focus-visible, .mcp-select:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.agent-mcp button:active:not(:disabled) { background: var(--dl-bg-sunken); }
.agent-mcp button:disabled, .mcp-select:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
@media (max-width: 1023px) {
  .mcp-add, .mcp-back, .mcp-action, .mcp-inline-action, .mcp-plugin-disclosure { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .mcp-switch { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .mcp-row { align-items: start; }
  .mcp-row-controls { flex-wrap: wrap; justify-content: flex-end; }
}
@media (prefers-reduced-motion: reduce) {
  .mcp-status-tooltip { transition: none; }
}
</style>
