<script setup lang="ts">
// 项目 MCP:服务器配置进入草稿并由统一窗体的底部保存触发;认证/重连是独立的即时连接生命周期操作。
// 面板挂载即加载(与另外两个域并行预取),切换 Tab 不卸载、不重置草稿。
import { computed, onMounted, ref, watch } from 'vue'
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Project } from '../contracts/generated/project'
import type { McpServer, McpTransportId } from '../contracts/generated/mcp-server'
import {
  authenticateProjectMcpServer, listProjectMcpServers, reconnectProjectMcpServer, saveProjectMcpGroup,
} from '../api/agent-mcp'
import { legacyMcpConfig, validateMcpConfig } from '../data/mcp-config'
import { useI18n } from '../i18n'
import AgentReadonlyContext from './agent-readonly-context.vue'
import type { ProjectPanelState } from './project-settings-state'

const props = defineProps<{ project: Project; agent: AgentSummary }>()
const emit = defineEmits<{ saved: [servers: McpServer[]]; announce: [message: string]; state: [state: ProjectPanelState] }>()
const { t } = useI18n()
const status = ref<'loading' | 'ready' | 'error'>('loading')
const draftServers = ref<McpServer[]>([])
const savedServers = ref<McpServer[]>([])
const isSaving = ref(false)
const saveError = ref('')
const saveFeedback = ref<'idle' | 'saved' | 'error'>('idle')
const actionError = ref('')
const connectingId = ref('')
const agentServerNames = ref<ReadonlySet<string>>(new Set())
function isShadowed(server: McpServer): boolean { return agentServerNames.value.has(server.name) }
const isAddOpen = ref(false)
const addName = ref('')
const addDisplayName = ref('')
const addTransport = ref<McpTransportId>('stdio')
const addEndpoint = ref('')
const addError = ref('')
let loadVersion = 0
let generatedServerId = 0

const baselineSerialized = computed(() => JSON.stringify(savedServers.value))
const isDirty = computed(() => status.value === 'ready' && JSON.stringify(draftServers.value) !== baselineSerialized.value)
const saveState = computed(() => isSaving.value ? 'saving' : saveFeedback.value === 'error' ? 'error' : saveFeedback.value === 'saved' && !isDirty.value ? 'saved' : isDirty.value ? 'dirty' : 'clean')
const saveStateLabel = computed(() => {
  const copy = t.value.workspace.projectSettings
  if (saveState.value === 'saving') return copy.saving
  if (saveState.value === 'error') return saveError.value || copy.saveError
  if (saveState.value === 'saved') return copy.saved
  return saveState.value === 'dirty' ? copy.saveDirty : copy.saveClean
})
const panelState = computed<ProjectPanelState>(() => ({
  status: status.value,
  dirty: isDirty.value,
  saving: isSaving.value,
  saveState: saveState.value,
  saveStateLabel: saveStateLabel.value,
  canSave: isDirty.value && status.value === 'ready' && !isSaving.value,
}))
watch(panelState, (state) => emit('state', state), { immediate: true })
function cloneServers(servers: readonly McpServer[]): McpServer[] {
  return servers.map((server) => {
    const config = validateMcpConfig(server.config, true)
    return { ...server, config: config.ok ? config.value : legacyMcpConfig(server.transport, server.endpoint), tools: server.tools.map((tool) => ({ ...tool })) }
  })
}
function statusLabel(server: McpServer): string { return t.value.workspace.mcp.status[server.status] }
function hasEnablementDraft(server: McpServer): boolean {
  const saved = savedServers.value.find((item) => item.id === server.id)
  return saved !== undefined && saved.enabled !== server.enabled
}
function isSavedUnchanged(server: McpServer): boolean {
  const saved = savedServers.value.find((item) => item.id === server.id)
  return saved !== undefined && JSON.stringify(saved) === JSON.stringify(server)
}
function canConnect(server: McpServer): boolean {
  return (server.status === 'needsAuth' || server.status === 'failed') && isSavedUnchanged(server) && connectingId.value === '' && !isSaving.value
}
function updateServer(server: McpServer, patch: Partial<McpServer>): void {
  draftServers.value = draftServers.value.map((item) => item.id === server.id ? { ...item, ...patch } : item)
}
function updateText(server: McpServer, key: 'name' | 'displayName' | 'endpoint', event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  updateServer(server, { [key]: event.target.value, ...(key === 'endpoint' ? { config: legacyMcpConfig(server.transport, event.target.value) } : {}) })
}
function updateTransport(server: McpServer, event: Event): void {
  if (!(event.target instanceof HTMLSelectElement)) return
  const value = event.target.value
  if (value === 'stdio' || value === 'http' || value === 'sse') updateServer(server, { transport: value, config: legacyMcpConfig(value, server.endpoint) })
}
function updateEnabled(server: McpServer, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  const enabled = event.target.checked
  updateServer(server, { enabled })
}
function removeServer(server: McpServer): void {
  draftServers.value = draftServers.value.filter((item) => item.id !== server.id)
}
function openAdd(): void {
  addName.value = ''
  addDisplayName.value = ''
  addTransport.value = 'stdio'
  addEndpoint.value = ''
  addError.value = ''
  isAddOpen.value = true
}
function addServer(): void {
  const copy = t.value.workspace.mcp
  const name = addName.value.trim()
  const endpoint = addEndpoint.value.trim()
  if (name === '' || endpoint === '') { addError.value = copy.requiredFields; return }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) { addError.value = copy.invalidName; return }
  if (draftServers.value.some((server) => server.name === name)) { addError.value = copy.duplicateProjectName; return }
  generatedServerId += 1
  const server: McpServer = {
    id: `project:${props.project.path}:${name}:draft-${generatedServerId}`,
    name, displayName: addDisplayName.value.trim() || name,
    description: 'Custom MCP server configured for this project.', scope: 'project', ownerId: props.project.path,
    transport: addTransport.value, endpoint, config: legacyMcpConfig(addTransport.value, endpoint), clientSecretSet: false, enabled: true, status: 'connected', errorMessage: '', tools: [],
  }
  draftServers.value = [...draftServers.value, server]
  isAddOpen.value = false
}
function validateDraft(): string {
  const names = new Set<string>()
  for (const server of draftServers.value) {
    if (server.name.trim() === '' || server.endpoint.trim() === '') return t.value.workspace.mcp.requiredFields
    if (!/^[A-Za-z0-9._-]+$/.test(server.name.trim())) return t.value.workspace.mcp.invalidName
    if (names.has(server.name.trim())) return t.value.workspace.mcp.duplicateProjectName
    names.add(server.name.trim())
  }
  return ''
}
async function load(): Promise<void> {
  const version = ++loadVersion
  status.value = 'loading'
  saveFeedback.value = 'idle'
  saveError.value = ''
  actionError.value = ''
  const result = await listProjectMcpServers(props.project.path)
  if (version !== loadVersion) return
  if (!result.ok) { status.value = 'error'; return }
  draftServers.value = cloneServers(result.value.servers)
  savedServers.value = cloneServers(result.value.servers)
  status.value = 'ready'
}
// 保存成功返回 true;失败返回 false,由窗体把焦点送到底部保存状态。
async function save(): Promise<boolean> {
  if (!isDirty.value || isSaving.value) return false
  const invalid = validateDraft()
  if (invalid !== '') { saveError.value = invalid; saveFeedback.value = 'error'; return false }
  isSaving.value = true
  saveError.value = ''
  saveFeedback.value = 'idle'
  const result = await saveProjectMcpGroup(props.project.path, cloneServers(draftServers.value))
  isSaving.value = false
  if (!result.ok) {
    saveError.value = result.error.message
    saveFeedback.value = 'error'
    return false
  }
  draftServers.value = cloneServers(result.value.servers)
  savedServers.value = cloneServers(result.value.servers)
  saveFeedback.value = 'saved'
  emit('saved', result.value.servers)
  return true
}
async function connect(server: McpServer): Promise<void> {
  if (!canConnect(server)) return
  connectingId.value = server.id
  actionError.value = ''
  const isAuth = server.status === 'needsAuth'
  const request = isAuth ? authenticateProjectMcpServer : reconnectProjectMcpServer
  const result = await request(props.project.path, server.id)
  connectingId.value = ''
  if (!result.ok) { actionError.value = result.error.message; return }
  // 连接只推进运行时状态;保留其它字段与未保存草稿,避免整组响应覆盖编辑基线。
  savedServers.value = savedServers.value.map((saved) => {
    const connected = result.value.servers.find((item) => item.id === saved.id)
    return connected === undefined ? saved : {
      ...saved, status: connected.status, enabled: connected.enabled,
      errorMessage: connected.errorMessage, tools: structuredClone(connected.tools),
    }
  })
  const connected = result.value.servers.find((item) => item.id === server.id)
  if (connected !== undefined) {
    draftServers.value = draftServers.value.map((item) => item.id === server.id ? {
      ...item, status: connected.status, enabled: connected.enabled, errorMessage: connected.errorMessage, tools: structuredClone(connected.tools),
    } : item)
  }
  const copy = t.value.workspace.mcp
  emit('announce', (isAuth ? copy.projectAuthenticatedAnnounce : copy.projectReconnectedAnnounce).replace('{name}', server.displayName).replace('{project}', props.project.name))
}
watch(isDirty, (dirty) => { if (dirty) saveFeedback.value = 'idle' })
onMounted(() => { void load() })
defineExpose({ save })
</script>

<template>
  <div class="project-mcp">
    <p class="project-config__scope">{{ t.workspace.projectSettings.mcpScopeHint }}</p>
    <AgentReadonlyContext kind="mcp" :agent="agent" :project-servers="savedServers" @servers="agentServerNames = new Set($event.map((server) => server.name))" />
    <div v-if="status === 'loading'" class="project-config__load-state" role="status">{{ t.workspace.projectSettings.loading }}</div>
    <div v-else-if="status === 'error'" class="project-config__load-state" role="alert"><p>{{ t.workspace.projectSettings.loadError }}</p><button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.workspace.projectSettings.retry }}</button></div>
    <template v-else>
      <section class="project-mcp__configuration">
        <div class="project-mcp__section-head"><div><h3>{{ t.workspace.projectSettings.mcpProjectServers }}</h3><p>{{ t.workspace.mcp.sameNamePrecedence }}</p></div><button type="button" class="dl-btn dl-btn--ghost" :disabled="isSaving" @click="openAdd">＋ {{ t.workspace.mcp.add }}</button></div>
        <p v-if="draftServers.length === 0" class="project-mcp__empty">{{ t.workspace.mcp.emptyProject }}</p>
        <ul v-else class="project-mcp__list">
          <li v-for="server in draftServers" :key="server.id" class="project-mcp__server" :data-server-id="server.id">
            <div class="project-mcp__server-head"><strong>{{ server.displayName }}</strong><span>{{ statusLabel(server) }}</span><span v-if="hasEnablementDraft(server)" class="project-mcp__pending">{{ t.workspace.mcp.pendingSave }}</span><span v-if="server.status === 'connected'">{{ t.workspace.mcp.tools.replace('{count}', String(server.tools.length)) }}</span><span v-if="isShadowed(server)" class="project-mcp__shadow">{{ t.workspace.mcp.projectShadowsAgent }}</span></div>
            <div class="project-mcp__fields">
              <label>{{ t.workspace.mcp.name }}<input class="field__input" :value="server.name" :disabled="isSaving" @input="updateText(server, 'name', $event)"></label>
              <label>{{ t.workspace.mcp.displayName }}<input class="field__input" :value="server.displayName" :disabled="isSaving" @input="updateText(server, 'displayName', $event)"></label>
              <label>{{ t.workspace.mcp.transportLabel }}<select class="field__input field__select" :value="server.transport" :disabled="isSaving" @change="updateTransport(server, $event)"><option value="stdio">stdio</option><option value="http">http</option><option value="sse">sse</option></select></label>
              <label class="project-mcp__endpoint">{{ t.workspace.mcp.endpointLabel }}<input class="field__input" :value="server.endpoint" :disabled="isSaving" @input="updateText(server, 'endpoint', $event)"></label>
            </div>
            <div class="project-mcp__row-actions">
              <label class="project-mcp__enabled"><input type="checkbox" :checked="server.enabled" :disabled="isSaving" @change="updateEnabled(server, $event)">{{ t.workspace.projectSettings.mcpEnabled }}</label>
              <button type="button" class="dl-btn dl-btn--ghost" :disabled="isSaving" :aria-label="t.workspace.mcp.projectRemoveLabel.replace('{name}', server.displayName).replace('{project}', project.name)" @click="removeServer(server)">{{ t.workspace.mcp.remove }}</button>
            </div>
            <div v-if="server.status === 'needsAuth' || server.status === 'failed'" class="project-mcp__connection">
              <button type="button" class="dl-btn dl-btn--ghost" :disabled="!canConnect(server)" :aria-label="(server.status === 'needsAuth' ? t.workspace.mcp.projectAuthenticateLabel : t.workspace.mcp.projectReconnectLabel).replace('{name}', server.displayName).replace('{project}', project.name)" @click="connect(server)">{{ connectingId === server.id ? t.workspace.mcp.connecting : server.status === 'needsAuth' ? t.workspace.mcp.authenticate : t.workspace.mcp.reconnect }}</button>
              <span v-if="!isSavedUnchanged(server)">{{ t.workspace.mcp.saveBeforeConnect }}</span>
            </div>
          </li>
        </ul>
        <form v-if="isAddOpen" class="project-mcp__add" @submit.prevent="addServer">
          <label>{{ t.workspace.mcp.name }}<input v-model="addName" class="field__input" :placeholder="t.workspace.mcp.namePlaceholder"></label>
          <label>{{ t.workspace.mcp.displayName }}<input v-model="addDisplayName" class="field__input" :placeholder="t.workspace.mcp.displayNamePlaceholder"></label>
          <label>{{ t.workspace.mcp.transportLabel }}<select v-model="addTransport" class="field__input field__select"><option value="stdio">stdio</option><option value="http">http</option><option value="sse">sse</option></select></label>
          <label>{{ t.workspace.mcp.endpointLabel }}<input v-model="addEndpoint" class="field__input" :placeholder="t.workspace.mcp.endpointPlaceholder"></label>
          <p v-if="addError" class="project-config__error" role="alert">{{ addError }}</p>
          <div class="project-mcp__add-actions"><button type="submit" class="dl-btn dl-btn--primary">{{ t.workspace.mcp.submitAdd }}</button><button type="button" class="dl-btn dl-btn--ghost" @click="isAddOpen = false">{{ t.workspace.mcp.cancel }}</button></div>
        </form>
      </section>
      <p class="project-mcp__immediate">{{ t.workspace.mcp.connectionImmediate }}</p>
      <p v-if="actionError" class="project-config__error" role="alert">{{ actionError }}</p>
    </template>
  </div>
</template>

<style scoped>
/* 面板内的断点按内容区实际宽度判定,不复用视口断点(嵌在带左栏的窗体里时两者不等)。 */
.project-mcp { display: grid; gap: var(--dl-space-4); min-width: 0; container-type: inline-size; }
.project-mcp__configuration { display: grid; gap: var(--dl-space-3); min-width: 0; }
.project-mcp__section-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: var(--dl-space-3); }
.project-mcp__section-head h3 { font-size: var(--dl-font-size-sm); font-weight: 500; }
.project-mcp__section-head p, .project-mcp__fallback, .project-mcp__immediate, .project-mcp__empty { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.project-mcp__fallback { color: var(--dl-text-tertiary); }
.project-mcp__list { display: grid; gap: var(--dl-space-3); }
.project-mcp__server { display: grid; gap: var(--dl-space-3); min-width: 0; padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-raised); }
.project-mcp__server-head { display: flex; flex-wrap: wrap; gap: var(--dl-space-2) var(--dl-space-3); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.project-mcp__server-head strong { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.project-mcp__pending { color: var(--dl-text-tertiary); }
.project-mcp__shadow { color: var(--dl-warning); }
.project-mcp__fields, .project-mcp__add { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--dl-space-3); }
.project-mcp__fields label, .project-mcp__add label { display: grid; gap: var(--dl-space-1); min-width: 0; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.project-mcp__fields input { font-family: var(--dl-font-mono); }
.project-mcp__endpoint { grid-column: 1 / -1; }
.project-mcp__row-actions, .project-mcp__connection, .project-mcp__add-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2) var(--dl-space-3); }
.project-mcp__enabled { display: inline-flex; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.project-mcp__enabled input { inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); accent-color: var(--dl-accent); }
.project-mcp__connection { padding-block-start: var(--dl-space-2); border-block-start: var(--dl-border-width) solid var(--dl-border-subtle); }
.project-mcp__connection span { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.project-mcp__add { padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); }
.project-mcp__add-actions, .project-mcp__add > p { grid-column: 1 / -1; }
.project-mcp__immediate { padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); }
@container (max-width: 480px) {
  .project-mcp__fields, .project-mcp__add { grid-template-columns: minmax(0, 1fr); }
  .project-mcp__endpoint, .project-mcp__add-actions, .project-mcp__add > p { grid-column: 1; }
}
</style>
