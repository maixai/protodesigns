<script setup lang="ts">
// 定义、项目启用覆盖与插件贡献分开读取;单路失败不吞掉其它来源。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NSwitch } from 'naive-ui'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Project } from '../contracts/generated/project'
import type { McpServer } from '../contracts/generated/mcp-server'
import type { McpServerInput } from '../contracts/generated/mcp-server-input'
import type { McpProjectGroup } from '../contracts/generated/mcp-project-group'
import type { PluginMcpServer } from '../contracts/generated/plugin-mcp-server'
import type { ProjectMcpEntry } from '../contracts/generated/project-mcp-entry'
import type { ProjectToolOverrides } from '../contracts/generated/project-tool-overrides'
import type { Result } from '../api/result'
import { addProjectMcpServer, updateProjectMcpServer, removeProjectMcpServer, setProjectMcpServerEnabled, authenticateProjectMcpServer, reconnectProjectMcpServer, listProjectMcpServers, listProjectAgentMcpServers } from '../api/agent-mcp'
import { getProjectToolOverrides, setProjectToolOverride, listProjectPluginMcpServers } from '../api/project-tools'
import { resolveProjectMcp, projectToolsRevision } from '../data/project-tools'
import { useI18n } from '../i18n'
import type { ProjectPanelState } from './project-settings-state'
import McpServerEditor from './mcp-server-editor.vue'
import DliIcon from './dl-icon.vue'

const props = defineProps<{ project: Project; agent: AgentSummary }>()
const emit = defineEmits<{ announce: [message: string]; state: [state: ProjectPanelState]; manageAgent: []; managePlugin: [key: string] }>()
const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const own = ref<McpServer[]>([])
const inherited = ref<McpServer[]>([])
const plugins = ref<PluginMcpServer[]>([])
const overrides = ref<ProjectToolOverrides>({ path: props.project.path, plugins: [], mcp: [] })
const status = ref<'loading' | 'ready' | 'error'>('loading')
const agentStatus = ref<'loading' | 'ready' | 'error'>('loading')
const pluginStatus = ref<'loading' | 'ready' | 'error'>('loading')
const view = ref<'list' | 'detail' | 'pluginDetail' | 'add'>('list')
const isPluginExpanded = ref(true)
const selectedId = ref('')
const isDirty = ref(false)
const isBusy = ref(false)
const error = ref('')
const isConfirmingDiscard = ref(false)
const isConfirmingRemove = ref(false)
const editorRevision = ref(0)
const isAlive = ref(true)
const requestVersion = ref(0)
const entries = computed(() => resolveProjectMcp(inherited.value, own.value, overrides.value))
const selected = computed(() => entries.value.find((entry) => entry.server.id === selectedId.value))
const selectedPlugin = computed(() => view.value === 'pluginDetail' ? plugins.value.find((server) => server.id === selectedId.value) : undefined)
const detailTools = computed(() => {
  if (selected.value) return selected.value.effectiveEnabled && selected.value.server.status === 'connected' ? selected.value.server.tools : []
  return selectedPlugin.value?.status === 'connected' ? selectedPlugin.value.tools : []
})
function manualStatus(entry: ProjectMcpEntry): McpServer['status'] | 'shadowed' | 'unknown' {
  if (entry.shadowed) return 'shadowed'
  if (status.value !== 'ready' || agentStatus.value !== 'ready') return 'unknown'
  return entry.effectiveEnabled ? entry.server.status : 'disabled'
}
function manualStatusLabel(entry: ProjectMcpEntry): string {
  const state = manualStatus(entry)
  return state === 'shadowed' ? t.value.workspace.projectTools.shadowedShort : state === 'unknown' ? t.value.workspace.projectTools.notEffective : state === 'disabled' ? t.value.workspace.projectTools.disabled : t.value.workspace.mcp.status[state]
}
const detailStatus = computed(() => selected.value ? manualStatus(selected.value) : selectedPlugin.value?.status ?? 'unknown')
const detailStatusLabel = computed(() => selected.value ? manualStatusLabel(selected.value) : selectedPlugin.value ? t.value.workspace.mcp.pluginStatus[selectedPlugin.value.status] : '')
function copy(text: string, name = ''): string { return text.replaceAll('{project}', props.project.name).replaceAll('{agent}', props.agent.name).replaceAll('{name}', name) }
function feedback(message: string): void { emit('announce', copy(t.value.workspace.projectTools.feedback).replace('{message}', message)) }
function source(entry: ProjectMcpEntry): string { return entry.source === 'project' ? t.value.workspace.projectTools.own : copy(t.value.workspace.projectTools.inherited) }
function effective(entry: ProjectMcpEntry): string {
  if (entry.shadowed) return t.value.workspace.projectTools.shadowed
  if (status.value !== 'ready' || agentStatus.value !== 'ready') return t.value.workspace.projectTools.notEffective
  return entry.effectiveEnabled ? t.value.workspace.projectTools.enabled : t.value.workspace.projectTools.disabled
}
function switchLabel(entry: ProjectMcpEntry): string { return copy(entry.effectiveEnabled ? t.value.workspace.projectTools.disableLabel : t.value.workspace.projectTools.enableLabel, entry.server.displayName) }
async function loadOwn(): Promise<void> {
  const version = requestVersion.value
  status.value = 'loading'
  const [serversResult, overridesResult] = await Promise.all([listProjectMcpServers(props.project.path), getProjectToolOverrides(props.project.path)])
  if (!isAlive.value || version !== requestVersion.value) return
  if (!serversResult.ok || !overridesResult.ok) { status.value = 'error'; return }
  own.value = serversResult.value.servers
  overrides.value = overridesResult.value
  status.value = 'ready'
}
async function loadAgent(): Promise<void> {
  const version = requestVersion.value
  agentStatus.value = 'loading'
  const result = await listProjectAgentMcpServers(props.agent.id)
  if (!isAlive.value || version !== requestVersion.value) return
  if (!result.ok) { agentStatus.value = 'error'; return }
  inherited.value = result.value
  agentStatus.value = 'ready'
}
async function loadPlugins(): Promise<void> {
  const version = requestVersion.value
  pluginStatus.value = 'loading'
  const result = await listProjectPluginMcpServers(props.project.path, props.agent.id)
  if (!isAlive.value || version !== requestVersion.value) return
  if (!result.ok) { pluginStatus.value = 'error'; return }
  plugins.value = result.value
  pluginStatus.value = 'ready'
}
function rowElement(): HTMLElement | undefined { return [...root.value?.querySelectorAll<HTMLElement>('.project-mcp__main') ?? []].find((element) => element.dataset['serverId'] === selectedId.value) }
async function navigate(next: typeof view.value): Promise<void> {
  view.value = next
  isConfirmingDiscard.value = false
  isConfirmingRemove.value = false
  await nextTick()
  if (!root.value?.getClientRects().length) return
  const target = next === 'list' ? rowElement() ?? root.value.querySelector<HTMLElement>('.project-mcp__add-button') : root.value.querySelector<HTMLElement>('.project-mcp__back')
  target?.focus({ preventScroll: true })
}
function open(entry?: ProjectMcpEntry): void {
  if (isBusy.value) return
  selectedId.value = entry?.server.id ?? ''
  isDirty.value = false
  editorRevision.value += 1
  error.value = ''
  void navigate(entry ? 'detail' : 'add')
}
function openPlugin(server: PluginMcpServer): void {
  if (isBusy.value) return
  selectedId.value = server.id
  isDirty.value = false
  error.value = ''
  void navigate('pluginDetail')
}
async function back(): Promise<void> {
  if (isBusy.value) return
  if (isDirty.value) {
    isConfirmingDiscard.value = true
    await nextTick()
    root.value?.querySelector<HTMLElement>('.project-mcp__keep')?.focus()
    return
  }
  await navigate('list')
}
async function discard(): Promise<void> { isDirty.value = false; await navigate('list') }
function onEscape(event: KeyboardEvent): void {
  if (view.value === 'list') return
  event.preventDefault()
  event.stopPropagation()
  void back()
}
// 不做乐观更新;失败保留原值与草稿,并把失焦的忙碌控件恢复。
async function mutate<T>(request: () => Promise<Result<T>>, accept: (value: T) => void | Promise<void>): Promise<void> {
  if (isBusy.value) return
  const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  isBusy.value = true
  error.value = ''
  try {
    const result = await request()
    if (!isAlive.value) return
    if (!result.ok) { error.value = copy(t.value.workspace.projectTools.feedback).replace('{message}', result.error.message); feedback(result.error.message); return }
    await accept(result.value)
  } finally {
    isBusy.value = false
    await nextTick()
    if (isAlive.value && root.value?.getClientRects().length && (document.activeElement === document.body || !document.activeElement?.isConnected)) {
      const target = focus?.isConnected ? focus : view.value === 'list' ? rowElement() ?? root.value.querySelector<HTMLElement>('.project-mcp__add-button') : root.value.querySelector<HTMLElement>('.project-mcp__back')
      target?.focus({ preventScroll: true })
    }
  }
}
async function toggle(entry: ProjectMcpEntry, enabled: boolean): Promise<void> {
  if (entry.shadowed) return
  if (entry.source === 'agent') {
    await mutate(() => setProjectToolOverride(props.project.path, props.agent.id, 'mcp', entry.server.name, enabled), (value) => { overrides.value = value; emit('announce', copy(enabled ? t.value.workspace.projectTools.enabledAnnounce : t.value.workspace.projectTools.disabledAnnounce, entry.server.displayName)) })
  } else {
    await mutate(() => setProjectMcpServerEnabled(props.project.path, entry.server.id, enabled), (value) => { own.value = value.servers; emit('announce', copy(enabled ? t.value.workspace.projectTools.enabledAnnounce : t.value.workspace.projectTools.disabledAnnounce, entry.server.displayName)) })
  }
}
async function restore(entry: ProjectMcpEntry): Promise<void> {
  await mutate(() => setProjectToolOverride(props.project.path, props.agent.id, 'mcp', entry.server.name, null), (value) => { overrides.value = value; emit('announce', copy(t.value.workspace.projectTools.restoredAnnounce, entry.server.displayName)) })
}
async function submit(input: McpServerInput): Promise<void> {
  const server = selected.value?.source === 'project' ? selected.value.server : undefined
  await mutate(() => server ? updateProjectMcpServer(props.project.path, server.id, input) : addProjectMcpServer(props.project.path, input), async (value) => {
    own.value = value.servers
    selectedId.value = server?.id ?? value.servers.find((item) => item.name === input.name)?.id ?? ''
    isDirty.value = false
    feedback((server ? t.value.workspace.mcp.savedAnnounce : t.value.workspace.mcp.addedAnnounce).replace('{name}', input.displayName || input.name))
    await navigate('list')
  })
}
async function remove(): Promise<void> {
  const entry = selected.value
  if (!entry || entry.source !== 'project') return
  const index = own.value.findIndex((server) => server.id === entry.server.id)
  await mutate(() => removeProjectMcpServer(props.project.path, entry.server.id), async (value) => {
    own.value = value.servers
    selectedId.value = own.value[Math.max(0, index - 1)]?.id ?? ''
    isDirty.value = false
    feedback(t.value.workspace.mcp.removedAnnounce.replace('{name}', entry.server.displayName))
    await navigate('list')
  })
}
async function connect(entry: ProjectMcpEntry): Promise<void> {
  if (entry.source !== 'project') return
  const request = entry.server.status === 'needsAuth' ? authenticateProjectMcpServer : reconnectProjectMcpServer
  await mutate<McpProjectGroup>(() => request(props.project.path, entry.server.id), (value) => {
    own.value = value.servers
    feedback((entry.server.status === 'needsAuth' ? t.value.workspace.mcp.authenticatedAnnounce : t.value.workspace.mcp.reconnectedAnnounce).replace('{name}', entry.server.displayName))
  })
}
function showNamesake(entry: ProjectMcpEntry): void { const ownEntry = entries.value.find((item) => item.source === 'project' && item.server.name === entry.server.name); if (ownEntry) open(ownEntry) }
const panelState = computed<ProjectPanelState>(() => ({ status: status.value, dirty: isDirty.value, saving: isBusy.value, saveState: isDirty.value ? 'dirty' : 'clean', saveStateLabel: isDirty.value ? t.value.workspace.projectTools.dirty : t.value.workspace.projectTools.immediate, canSave: false }))
watch(panelState, (value) => emit('state', value), { immediate: true })
watch(() => [props.project.path, props.agent.id], () => {
  requestVersion.value += 1
  void Promise.all([loadOwn(), loadAgent(), loadPlugins()])
}, { immediate: true })
watch(projectToolsRevision, () => { void loadPlugins() })
onBeforeUnmount(() => { isAlive.value = false; requestVersion.value += 1 })
</script>

<template>
  <section ref="root" class="project-mcp" :aria-busy="isBusy" :data-view="view" @keydown.esc="onEscape">
    <p v-if="error" class="project-config__error mcp-error" role="alert">{{ error }}</p>
    <div v-if="view === 'list'" class="mcp-list-view">
      <section v-for="origin in (['project', 'agent'] satisfies ProjectMcpEntry['source'][])" :key="origin" class="project-mcp__group" :data-source="origin">
        <header class="mcp-toolbar"><h3>{{ origin === 'project' ? t.workspace.projectTools.projectMcp : copy(t.workspace.projectTools.agentMcp) }}</h3><button v-if="origin === 'project'" type="button" class="mcp-add project-mcp__add-button" :disabled="isBusy || status !== 'ready'" :aria-label="t.workspace.mcp.add" :title="t.workspace.mcp.add" @click="open()"><span aria-hidden="true">＋</span></button></header>
        <p v-if="(origin === 'project' ? status : agentStatus) === 'loading'" class="mcp-state" role="status">{{ t.workspace.projectSettings.loading }}</p>
        <div v-else-if="(origin === 'project' ? status : agentStatus) === 'error'" class="mcp-state project-config__error" role="alert"><p>{{ origin === 'project' ? t.workspace.projectTools.loadProjectError : t.workspace.projectTools.loadAgentError }}</p><button type="button" class="mcp-action" @click="origin === 'project' ? loadOwn() : loadAgent()">{{ t.workspace.projectSettings.retry }}</button></div>
        <template v-else>
          <p v-if="entries.filter((entry) => entry.source === origin).length === 0" class="mcp-state">{{ origin === 'project' ? t.workspace.mcp.emptyProject : t.workspace.mcp.emptyAgent }}</p>
          <ul class="mcp-list">
            <li v-for="entry in entries.filter((item) => item.source === origin)" :key="entry.server.id" class="project-mcp__server mcp-row" :data-server-id="entry.server.id" :data-source="entry.source" :data-status="manualStatus(entry)" :data-effective="entry.effectiveEnabled">
              <button type="button" class="project-mcp__main mcp-main" :data-server-id="entry.server.id" :disabled="isBusy" @click="open(entry)">
                <span class="mcp-title"><span class="mcp-status-dot" aria-hidden="true" /><span class="mcp-name">{{ entry.server.displayName }}</span><span v-if="entry.replacesAgent" class="mcp-replaces">{{ t.workspace.projectTools.replaces }}</span></span>
                <span class="mcp-meta"><span class="mcp-source" :title="source(entry)">{{ source(entry) }}</span><span aria-hidden="true">·</span><span class="mcp-status-label" :title="entry.shadowed ? t.workspace.projectTools.shadowed : manualStatusLabel(entry)">{{ manualStatusLabel(entry) }}</span><span aria-hidden="true">·</span><span class="mcp-tools-count">{{ t.workspace.mcp.tools.replace('{count}', String(entry.effectiveEnabled && entry.server.status === 'connected' ? entry.server.tools.length : 0)) }}</span></span>
              </button>
              <div class="mcp-row-controls">
                <button v-if="entry.shadowed" type="button" class="mcp-inline-action mcp-namesake" :disabled="isBusy" :aria-label="copy(t.workspace.projectTools.feedback).replace('{message}', t.workspace.projectTools.viewProjectDefinition)" @click="showNamesake(entry)">{{ t.workspace.projectTools.viewProjectDefinitionShort }}</button>
                <template v-else>
                  <button v-if="entry.source === 'project' && entry.server.enabled && (entry.server.status === 'needsAuth' || entry.server.status === 'failed')" type="button" class="mcp-inline-action mcp-connect-action" :disabled="isBusy" :aria-label="copy(t.workspace.projectTools.feedback).replace('{message}', (entry.server.status === 'needsAuth' ? t.workspace.mcp.authenticateLabel : t.workspace.mcp.reconnectLabel).replace('{name}', entry.server.displayName))" @click="connect(entry)">{{ entry.server.status === 'needsAuth' ? t.workspace.mcp.authenticate : t.workspace.mcp.reconnect }}</button>
                  <NSwitch class="mcp-switch" size="small" :value="entry.effectiveEnabled" :disabled="isBusy || status !== 'ready' || agentStatus !== 'ready'" :aria-label="switchLabel(entry)" @update:value="(enabled: boolean) => toggle(entry, enabled)" />
                </template>
              </div>
            </li>
          </ul>
        </template>
      </section>
      <section class="project-mcp__group mcp-plugin-section" data-source="plugin">
        <header class="mcp-toolbar"><h3><button type="button" class="mcp-plugin-disclosure" :aria-expanded="isPluginExpanded" :aria-controls="`project-mcp-${project.id}-plugins`" @click="isPluginExpanded = !isPluginExpanded"><DliIcon name="chevronRight" size="sm" class="mcp-plugin-chevron" :class="{ 'is-expanded': isPluginExpanded }" /><span>{{ t.workspace.mcp.pluginListTitle }}</span><span v-if="pluginStatus === 'ready'" class="mcp-plugin-count">{{ plugins.length }}</span></button></h3></header>
        <div :id="`project-mcp-${project.id}-plugins`" v-show="isPluginExpanded" class="mcp-plugin-content">
          <p v-if="pluginStatus === 'loading'" class="mcp-state" role="status">{{ t.workspace.mcp.loadingPlugins }}</p>
          <div v-else-if="pluginStatus === 'error'" class="mcp-state" role="alert"><p>{{ t.workspace.mcp.loadError }}</p><button type="button" class="mcp-action" @click="loadPlugins">{{ t.workspace.mcp.retry }}</button></div>
          <p v-else-if="plugins.length === 0" class="mcp-state">{{ t.workspace.projectTools.pluginEmpty }}</p>
          <ul v-else class="mcp-list"><li v-for="server in plugins" :key="server.id" class="project-mcp__plugin mcp-row" :data-plugin-id="server.pluginId" :data-status="server.status"><button type="button" class="project-mcp__main mcp-main mcp-plugin-main" :data-server-id="server.id" :disabled="isBusy" @click="openPlugin(server)"><span class="mcp-title"><span class="mcp-status-dot" aria-hidden="true" /><span class="mcp-name">{{ server.displayName }}</span></span><span class="mcp-meta"><span class="mcp-source">{{ t.workspace.mcp.pluginSource.replace('{name}', server.pluginName) }}</span><span aria-hidden="true">·</span><span class="mcp-status-label">{{ t.workspace.mcp.pluginStatus[server.status] }}</span><span aria-hidden="true">·</span><span class="mcp-tools-count">{{ t.workspace.mcp.tools.replace('{count}', String(server.status === 'connected' ? server.tools.length : 0)) }}</span></span></button></li></ul>
        </div>
      </section>
    </div>
    <div v-else class="project-mcp__detail mcp-pane">
      <div class="mcp-page-nav"><button type="button" class="project-mcp__back mcp-back" :disabled="isBusy" @click="back"><DliIcon name="chevronLeft" size="sm" /><span>{{ t.workspace.mcp.back }}</span></button></div>
      <section v-if="isConfirmingDiscard" class="project-mcp__confirm mcp-confirm"><p>{{ t.workspace.mcp.discardTitle }}</p><div class="mcp-actions"><button type="button" class="mcp-action project-mcp__keep" @click="isConfirmingDiscard = false">{{ t.workspace.mcp.keepEditing }}</button><button type="button" class="mcp-action" @click="discard">{{ t.workspace.mcp.discard }}</button></div></section>
      <h3 class="mcp-detail-title">{{ view === 'add' ? t.workspace.mcp.addTitle : selected?.server.displayName ?? selectedPlugin?.displayName }}</h3>
      <p class="mcp-description">{{ selectedPlugin ? t.workspace.mcp.managedSource : selected?.source === 'agent' ? t.workspace.projectTools.managed : t.workspace.mcp.editHint }}</p>
      <p v-if="selected || selectedPlugin" class="mcp-detail-status" :data-status="detailStatus"><span class="mcp-status-dot" aria-hidden="true" /><span>{{ detailStatusLabel }}</span><span v-if="selected">· {{ effective(selected) }}</span><span v-if="selected?.overrideEnabled !== null && selected?.overrideEnabled !== undefined">· {{ t.workspace.projectTools.override }}</span></p>
      <p v-if="selected?.replacesAgent" class="mcp-description mcp-nofallback">{{ t.workspace.projectTools.replaces }} · {{ t.workspace.projectTools.noFallback }}</p>
      <p v-if="selected?.shadowed" class="mcp-description">{{ t.workspace.projectTools.shadowed }}</p>
      <template v-if="selected?.source === 'agent'">
        <dl class="mcp-facts"><div><dt>{{ t.workspace.mcp.endpoint }}</dt><dd><code>{{ selected.server.endpoint }}</code></dd></div><div><dt>{{ t.workspace.mcp.transport }}</dt><dd>{{ selected.server.transport }}</dd></div><div><dt>{{ t.workspace.mcp.clientSecret }}</dt><dd>{{ selected.server.clientSecretSet ? t.workspace.mcp.secretSet : t.workspace.mcp.secretUnset }}</dd></div></dl>
        <p class="mcp-description">{{ t.workspace.projectTools.secretReadonly }}</p>
      </template>
      <template v-else-if="selectedPlugin">
        <p class="mcp-readonly-badge">{{ t.workspace.mcp.managedReadonly }}</p><p class="mcp-description">{{ t.workspace.projectTools.pluginMcp }}</p>
        <dl class="mcp-facts"><div><dt>{{ t.workspace.mcp.source }}</dt><dd>{{ selectedPlugin.pluginName }}</dd></div><div><dt>{{ t.workspace.mcp.runtimeName }}</dt><dd><code>{{ selectedPlugin.sdkName }}</code></dd></div></dl>
      </template>
      <McpServerEditor v-else-if="view === 'add' || selected?.source === 'project'" :key="editorRevision" :server="selected?.server" :existing="own" :prefix="`project-mcp-${project.id}`" :busy="isBusy" @submit="submit" @dirty="isDirty = $event" @cancel="back" @announce="feedback" />
      <section v-if="selected || selectedPlugin" class="mcp-tools"><h4>{{ t.workspace.mcp.toolsTitle }} · {{ detailTools.length }}</h4><ul v-if="detailTools.length > 0"><li v-for="tool in detailTools" :key="tool.name"><code>{{ tool.name }}</code><p>{{ tool.description }}</p></li></ul><p v-else class="mcp-description">{{ detailStatus === 'needsAuth' ? t.workspace.mcp.toolsAfterAuth : detailStatus === 'failed' ? t.workspace.mcp.toolsAfterReconnect : t.workspace.mcp.toolsAfterEnable }}</p></section>
      <div v-if="selected?.source === 'agent'" class="mcp-actions">
        <button v-if="selected.shadowed" type="button" class="mcp-action" :disabled="isBusy" @click="showNamesake(selected)">{{ t.workspace.projectTools.viewProjectDefinition }}</button>
        <button v-else-if="selected.overrideEnabled !== null" type="button" class="mcp-action mcp-restore" :disabled="isBusy" :aria-label="copy(t.workspace.projectTools.restoreLabel, selected.server.displayName)" @click="restore(selected)">{{ t.workspace.projectTools.restore }}</button>
        <button type="button" class="mcp-action mcp-manage-agent" :disabled="isBusy" @click="emit('manageAgent')">{{ t.workspace.projectTools.manageAgent }}</button>
      </div>
      <button v-if="selectedPlugin" type="button" class="mcp-action mcp-manage-plugin" :disabled="isBusy" :aria-label="copy(t.workspace.projectTools.feedback).replace('{message}', t.workspace.mcp.managePluginLabel.replace('{name}', selectedPlugin.pluginName))" @click="emit('managePlugin', `${selectedPlugin.pluginId}@${selectedPlugin.marketplaceId}`)">{{ t.workspace.mcp.manageInPlugin }}</button>
      <section v-if="selected?.source === 'project'" class="mcp-danger-zone"><h4>{{ t.workspace.mcp.dangerZone }}</h4><button v-if="!isConfirmingRemove" type="button" class="mcp-action mcp-danger project-mcp__remove" :disabled="isBusy" :aria-label="copy(t.workspace.projectTools.feedback).replace('{message}', t.workspace.mcp.remove)" @click="isConfirmingRemove = true">{{ t.workspace.mcp.remove }}</button><div v-else class="mcp-confirm"><p>{{ t.workspace.mcp.removeConfirm.replace('{name}', selected.server.displayName) }}</p><div class="mcp-actions"><button type="button" class="mcp-action" :disabled="isBusy" @click="isConfirmingRemove = false">{{ t.workspace.mcp.removeCancel }}</button><button type="button" class="mcp-action mcp-danger project-mcp__confirm-remove" :disabled="isBusy" @click="remove">{{ t.workspace.mcp.confirmRemove }}</button></div></div></section>
    </div>
  </section>
</template>

<style scoped>
.project-mcp { display: grid; gap: var(--dl-space-3); min-inline-size: 0; padding: var(--dl-space-1); color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.mcp-list-view { display: grid; gap: var(--dl-space-3); min-inline-size: 0; }
.project-mcp__group { display: grid; gap: var(--dl-space-2); min-inline-size: 0; }
.mcp-toolbar, .mcp-page-nav { display: flex; align-items: center; border-block-end: var(--dl-border-width) solid var(--dl-border-base); min-inline-size: 0; }
.mcp-toolbar { justify-content: space-between; min-block-size: var(--dl-target-size); }
.mcp-toolbar h3 { min-inline-size: 0; font-size: var(--dl-font-size-sm); font-weight: 500; }
.mcp-add { display: inline-grid; place-items: center; inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); color: var(--dl-text-secondary); border-radius: var(--dl-radius-sm); }
.mcp-state { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-2) var(--dl-space-1); color: var(--dl-text-secondary); }
.mcp-list { display: grid; min-inline-size: 0; }
.mcp-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; min-inline-size: 0; }
.mcp-row + .mcp-row { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-main { display: grid; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-1); text-align: left; border-radius: var(--dl-radius-sm); }
.mcp-title { display: flex; align-items: center; flex-wrap: wrap; gap: var(--dl-space-1) var(--dl-space-2); min-inline-size: 0; }
.mcp-name { font-size: var(--dl-font-size-sm); font-weight: 500; overflow-wrap: anywhere; }
.mcp-replaces { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.mcp-meta { display: flex; align-items: baseline; gap: var(--dl-space-1); min-inline-size: 0; color: var(--dl-text-secondary); white-space: nowrap; }
.mcp-source { flex: 0 1 auto; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
.mcp-status-label { flex: 0 1 auto; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; }
.mcp-tools-count { flex: none; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); }
.mcp-row-controls { display: flex; align-items: center; gap: var(--dl-space-1); padding-inline-end: var(--dl-space-1); }
.mcp-inline-action, .mcp-action { display: inline-flex; align-items: center; justify-self: start; min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); color: var(--dl-accent); border-radius: var(--dl-radius-sm); text-align: left; }
.mcp-namesake { max-inline-size: calc(var(--dl-space-12) * 2); }
.mcp-switch { min-inline-size: var(--dl-space-8); min-block-size: var(--dl-space-6); }
.mcp-status-dot { flex: none; inline-size: calc(var(--dl-space-2) + var(--dl-border-width) * 2); block-size: calc(var(--dl-space-2) + var(--dl-border-width) * 2); border: var(--dl-border-width) solid var(--dl-text-tertiary); border-radius: var(--dl-radius-pill); background: transparent; }
[data-status='connected'] > .mcp-main .mcp-status-dot, .mcp-detail-status[data-status='connected'] .mcp-status-dot { border-color: var(--dl-success); background: var(--dl-success); }
[data-status='needsAuth'] > .mcp-main .mcp-status-dot, [data-status='needsConfiguration'] > .mcp-main .mcp-status-dot, .mcp-detail-status[data-status='needsAuth'] .mcp-status-dot, .mcp-detail-status[data-status='needsConfiguration'] .mcp-status-dot { border-color: var(--dl-warning); background: var(--dl-warning); }
[data-status='failed'] > .mcp-main .mcp-status-dot, .mcp-detail-status[data-status='failed'] .mcp-status-dot { border-color: var(--dl-error); background: var(--dl-error); }
.mcp-plugin-disclosure { display: flex; align-items: center; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--dl-target-size); color: var(--dl-text-secondary); text-align: left; border-radius: var(--dl-radius-sm); }
.mcp-plugin-chevron { flex: none; transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.mcp-plugin-chevron.is-expanded { transform: rotate(90deg); }
.mcp-plugin-count { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-weight: 400; }
.mcp-plugin-content { min-inline-size: 0; }
.mcp-plugin-main { grid-column: 1 / -1; }
.mcp-pane { display: grid; gap: var(--dl-space-3); min-inline-size: 0; padding-block-start: var(--dl-space-3); }
.mcp-back { flex: 1; display: flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-target-size); color: var(--dl-text-secondary); font-weight: 500; text-align: left; border-radius: var(--dl-radius-sm); }
.mcp-detail-title { font-size: var(--dl-font-size-md); font-weight: 500; line-height: var(--dl-line-snug); overflow-wrap: anywhere; }
.mcp-description { color: var(--dl-text-secondary); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.mcp-detail-status, .mcp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1) var(--dl-space-2); }
.mcp-facts { display: grid; gap: var(--dl-space-2); margin: 0; }
.mcp-facts > div { display: grid; gap: var(--dl-space-1); }
.mcp-facts dt, .mcp-tools h4 { color: var(--dl-text-tertiary); font-weight: 500; }
.mcp-facts dd { margin: 0; color: var(--dl-text-secondary); overflow-wrap: anywhere; }
.mcp-tools { display: grid; gap: var(--dl-space-2); padding-block-start: var(--dl-space-3); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-tools li { display: grid; gap: var(--dl-space-1); padding-block: var(--dl-space-2); }
.mcp-tools li + li { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-tools li p { color: var(--dl-text-secondary); }
code { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.mcp-danger-zone { display: grid; gap: var(--dl-space-2); padding-block-start: var(--dl-space-4); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-danger-zone h4, .mcp-readonly-badge { font-weight: 500; color: var(--dl-text-secondary); }
.mcp-confirm { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-3); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); }
.mcp-danger, .mcp-error { color: var(--dl-error); }
.project-mcp button:hover:not(:disabled) { background: var(--dl-bg-hover); }
.project-mcp button:active:not(:disabled) { background: var(--dl-bg-sunken); }
.project-mcp button:focus-visible, .mcp-switch:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.project-mcp button:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
@media (max-width: 1023px) {
  .mcp-switch { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .mcp-row-controls { flex-wrap: wrap; justify-content: flex-end; }
}
</style>
