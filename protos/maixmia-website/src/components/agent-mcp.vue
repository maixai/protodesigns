<script setup lang="ts">
// 侧栏只管理 Agent 级 MCP;所有写操作即时生效,项目自有服务器在项目 ⋯ → MCP 中配置。
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NInput, NSkeleton, NSwitch } from 'naive-ui'
import type { McpServer } from '../contracts/generated/mcp-server'
import type { McpServerInput, McpTransportId } from '../contracts/generated/mcp-server-input'
import {
  addAgentMcpServer, authenticateAgentMcpServer, listAgentMcpServers,
  reconnectAgentMcpServer, removeAgentMcpServer, setAgentMcpServerEnabled,
} from '../api/agent-mcp'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{ agentId: string; agentName: string }>()
const emit = defineEmits<{ count: [count: number | undefined]; announce: [message: string] }>()

const { t } = useI18n()
const rootRef = ref<HTMLElement | null>(null)
const servers = ref<McpServer[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadError = ref('')
const actionError = ref('')
const view = ref<'list' | 'detail' | 'add'>('list')
const selectedId = ref('')
const listFocusKey = ref('')
const busy = ref(false)
const isConfirmingRemove = ref(false)
const isAlive = ref(true)
let loadVersion = 0

const addName = ref('')
const addDisplayName = ref('')
const addTransport = ref<McpTransportId>('stdio')
const addEndpoint = ref('')
const sectionPrefix = `agent-mcp-${props.agentId}`
const selected = ref<McpServer | undefined>(undefined)

function statusLabel(server: McpServer): string {
  return t.value.workspace.mcp.status[server.status]
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

async function load(): Promise<void> {
  const version = ++loadVersion
  status.value = 'loading'
  loadError.value = ''
  emit('count', undefined)
  const result = await listAgentMcpServers(props.agentId)
  if (!isAlive.value || version !== loadVersion) return
  if (!result.ok) {
    status.value = 'error'
    loadError.value = result.error.message
    return
  }
  servers.value = result.value
  status.value = 'ready'
  emit('count', result.value.length)
}

function sourceRow(): HTMLElement | null {
  return [...rootRef.value?.querySelectorAll<HTMLElement>('.mcp-main') ?? []]
    .find((element) => element.dataset['serverId'] === listFocusKey.value) ?? null
}
async function navigate(next: typeof view.value): Promise<void> {
  actionError.value = ''
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
  listFocusKey.value = server.id
  void navigate('detail')
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
  if (view.value === 'list') return
  event.preventDefault()
  event.stopPropagation()
  back()
}
function updateSelected(): void {
  if (selected.value !== undefined) selected.value = servers.value.find((server) => server.id === selectedId.value)
}

async function connect(server: McpServer): Promise<void> {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  const copy = t.value.workspace.mcp
  const isAuth = server.status === 'needsAuth'
  const request = isAuth ? authenticateAgentMcpServer : reconnectAgentMcpServer
  const result = await request(props.agentId, server.id)
  busy.value = false
  if (!isAlive.value) return
  if (!result.ok) { actionError.value = result.error.message; return }
  servers.value = result.value
  updateSelected()
  announce(isAuth ? copy.authenticatedAnnounce : copy.reconnectedAnnounce, server.displayName)
}
async function toggleEnabled(server: McpServer, enabled: boolean): Promise<void> {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  const result = await setAgentMcpServerEnabled(props.agentId, server.id, enabled)
  busy.value = false
  if (!isAlive.value) return
  if (!result.ok) { actionError.value = result.error.message; return }
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
  actionError.value = ''
  const result = await removeAgentMcpServer(props.agentId, server.id)
  busy.value = false
  if (!isAlive.value) return
  if (!result.ok) { actionError.value = result.error.message; return }
  servers.value = result.value
  emit('count', result.value.length)
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
  if (name === '' || endpoint === '') { actionError.value = copy.requiredFields; return }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) { actionError.value = copy.invalidName; return }
  if (servers.value.some((server) => server.name === name)) { actionError.value = copy.duplicateName; return }
  const input: McpServerInput = { name, displayName: addDisplayName.value.trim(), transport: addTransport.value, endpoint }
  busy.value = true
  actionError.value = ''
  const result = await addAgentMcpServer(props.agentId, input)
  busy.value = false
  if (!isAlive.value) return
  if (!result.ok) { actionError.value = result.error.message; return }
  servers.value = result.value
  emit('count', result.value.length)
  listFocusKey.value = `agent:${props.agentId}:${name}`
  announce(copy.addedAnnounce, addDisplayName.value.trim() || name)
  await navigate('list')
}

watch(() => props.agentId, () => {
  view.value = 'list'
  selected.value = undefined
  selectedId.value = ''
  listFocusKey.value = ''
  servers.value = []
  actionError.value = ''
  void load()
}, { immediate: true })
onBeforeUnmount(() => { isAlive.value = false })
</script>

<template>
  <section ref="rootRef" class="agent-mcp" :data-view="view" :aria-busy="busy || status === 'loading'" @keydown.esc="onEscape">
    <p v-if="actionError" class="mcp-error" role="alert">{{ actionError }}</p>
    <div v-show="view === 'list'" class="mcp-list-view">
      <p class="mcp-scope">{{ t.workspace.mcp.agentScope }}</p>
      <p class="mcp-project-tip">{{ t.workspace.mcp.projectEntryHint }}</p>
      <div class="mcp-toolbar">
        <h3>{{ t.workspace.mcp.agentListTitle }}</h3>
        <button type="button" class="mcp-add" :disabled="busy || status !== 'ready'" :aria-label="t.workspace.mcp.add" :title="t.workspace.mcp.add" @click="openAdd"><span aria-hidden="true">＋</span></button>
      </div>
      <div v-if="status === 'loading'" class="mcp-state" :aria-label="t.workspace.mcp.loadingAgent"><NSkeleton text :repeat="3" :animated="false" /></div>
      <div v-else-if="status === 'error'" class="mcp-state"><p role="alert">{{ loadError }}</p><button type="button" class="mcp-action" @click="load">{{ t.workspace.mcp.retry }}</button></div>
      <div v-else-if="servers.length === 0" class="mcp-state"><p>{{ t.workspace.mcp.emptyAgent }}</p><button type="button" class="mcp-action" :aria-label="t.workspace.mcp.add" @click="openAdd">{{ t.workspace.mcp.add }}</button></div>
      <ul v-else class="mcp-list">
        <li v-for="server in servers" :key="server.id" class="mcp-row" :data-status="server.status">
          <button type="button" class="mcp-main" :data-server-id="server.id" :disabled="busy" @click="openDetail(server)">
            <span class="mcp-title"><span class="mcp-name">{{ server.displayName }}</span><code>{{ server.name }}</code></span>
            <span class="mcp-meta"><code>{{ server.transport }}</code><span class="mcp-status"><span class="mcp-status-dot" aria-hidden="true" />{{ statusLabel(server) }}</span><span v-if="server.status === 'connected'" class="mcp-tools-count">{{ t.workspace.mcp.tools.replace('{count}', String(server.tools.length)) }}</span></span>
          </button>
          <div class="mcp-row-controls">
            <button v-if="server.status === 'needsAuth' || server.status === 'failed'" type="button" class="mcp-inline-action" :disabled="busy" :aria-label="actionLabel(server)" @click="connect(server)">{{ server.status === 'needsAuth' ? t.workspace.mcp.authenticate : t.workspace.mcp.reconnect }}</button>
            <NSwitch class="mcp-switch" size="small" :value="server.enabled" :disabled="busy" :aria-label="switchLabel(server)" @update:value="(enabled: boolean) => toggleEnabled(server, enabled)" />
          </div>
        </li>
      </ul>
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
        <button v-if="selected.status === 'needsAuth' || selected.status === 'failed'" type="button" class="mcp-action" :disabled="busy" @click="connect(selected)">{{ selected.status === 'needsAuth' ? t.workspace.mcp.authenticate : t.workspace.mcp.reconnect }}</button>
        <button type="button" class="mcp-action" :disabled="busy" @click="toggleEnabled(selected, !selected.enabled)">{{ selected.enabled ? t.workspace.mcp.disable : t.workspace.mcp.enable }}</button>
        <button type="button" class="mcp-action mcp-danger" :disabled="busy" @click="setRemoveConfirmation(true)">{{ t.workspace.mcp.remove }}</button>
      </div>
      <div v-if="isConfirmingRemove" class="mcp-confirm"><p>{{ t.workspace.mcp.removeConfirm.replace('{name}', selected.displayName) }}</p><div class="mcp-actions"><button type="button" class="mcp-action" @click="setRemoveConfirmation(false)">{{ t.workspace.mcp.removeCancel }}</button><button type="button" class="mcp-action mcp-danger" :disabled="busy" @click="removeSelected">{{ t.workspace.mcp.confirmRemove }}</button></div></div>
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
  </section>
</template>

<style scoped>
.agent-mcp { min-inline-size: 0; padding: var(--dl-space-1); color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.mcp-list-view, .mcp-pane, .mcp-state, .mcp-list, .mcp-field { min-inline-size: 0; }
.mcp-list-view { display: grid; gap: var(--dl-space-2); }
.mcp-scope { padding: var(--dl-space-2) var(--dl-space-1); color: var(--dl-text-secondary); overflow-wrap: anywhere; }
.mcp-project-tip { padding: 0 var(--dl-space-1) var(--dl-space-2); color: var(--dl-text-tertiary); overflow-wrap: anywhere; }
.mcp-toolbar, .mcp-page-nav { display: flex; align-items: center; border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-toolbar { justify-content: space-between; }
.mcp-toolbar h3 { font-size: var(--dl-font-size-sm); font-weight: 500; }
.mcp-add { display: inline-grid; place-items: center; inline-size: var(--workspace-nav-control-size); min-block-size: var(--workspace-nav-control-size); color: var(--dl-text-secondary); border-radius: var(--dl-radius-sm); }
.mcp-hint, .mcp-description { color: var(--dl-text-secondary); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.mcp-hint { padding: var(--dl-space-1); color: var(--dl-text-tertiary); }
.mcp-state { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-2) var(--dl-space-1); color: var(--dl-text-secondary); }
.mcp-list { display: grid; }
.mcp-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; min-inline-size: 0; }
.mcp-row + .mcp-row { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.mcp-main { display: grid; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--dl-target-size); padding: var(--dl-space-2) var(--dl-space-1); text-align: left; border-radius: var(--dl-radius-sm); }
.mcp-title, .mcp-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-1) var(--dl-space-2); min-inline-size: 0; }
.mcp-name { font-size: var(--dl-font-size-sm); font-weight: 500; overflow-wrap: anywhere; }
.mcp-title code, .mcp-meta code, .mcp-detail-identity code, .mcp-facts code, .mcp-tools code { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); overflow-wrap: anywhere; }
.mcp-meta { color: var(--dl-text-secondary); }
.mcp-status { display: inline-flex; align-items: center; gap: var(--dl-space-1); }
.mcp-status-dot { flex: none; inline-size: calc(var(--dl-space-2) + var(--dl-border-width) * 2); block-size: calc(var(--dl-space-2) + var(--dl-border-width) * 2); border-radius: var(--dl-radius-pill); background: var(--dl-text-tertiary); }
.mcp-row[data-status='connected'] .mcp-status-dot, .mcp-detail-status[data-status='connected'] .mcp-status-dot { background: var(--dl-success); }
.mcp-row[data-status='needsAuth'] .mcp-status-dot, .mcp-detail-status[data-status='needsAuth'] .mcp-status-dot { background: var(--dl-warning); }
.mcp-row[data-status='failed'] .mcp-status-dot, .mcp-detail-status[data-status='failed'] .mcp-status-dot { background: var(--dl-error); }
.mcp-tools-count { font-family: var(--dl-font-mono); color: var(--dl-text-tertiary); }
.mcp-row-controls { display: flex; align-items: center; gap: var(--dl-space-1); padding-inline-end: var(--dl-space-1); }
.mcp-inline-action, .mcp-action { display: inline-flex; align-items: center; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); color: var(--dl-accent); border-radius: var(--dl-radius-sm); text-align: left; }
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
  .mcp-add, .mcp-back, .mcp-action, .mcp-inline-action { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .mcp-switch { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .mcp-row { align-items: start; }
  .mcp-row-controls { flex-wrap: wrap; justify-content: flex-end; }
}
</style>
