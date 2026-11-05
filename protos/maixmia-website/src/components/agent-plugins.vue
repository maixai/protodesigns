<script setup lang="ts">
// Agent 插件与市场同页分组;详情直接承载配置,安装保留独立流程。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NInput, NSkeleton, NSwitch } from 'naive-ui'
import type { InstalledPlugin } from '../contracts/generated/installed-plugin'
import type { Plugin, PluginConfigSchema } from '../contracts/generated/plugin'
import type { MarketplaceBinding } from '../contracts/generated/marketplace-binding'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'
import type { ProjectPluginEntry } from '../contracts/generated/project-plugin-entry'
import type { ProjectToolOverrides } from '../contracts/generated/project-tool-overrides'
import { getProjectToolOverrides, setProjectToolOverride } from '../api/project-tools'
import { resolveProjectPlugins, resolveProjectMarkets, projectToolsRevision } from '../data/project-tools'
import type { ProjectPanelState } from './project-settings-state'
import type { Result } from '../api/result'
import {
  addMarketplace, installPlugin, listInstalledPlugins, listMarketplaceBindings,
  removeMarketplace, savePluginConfig, setMarketplaceAutoUpdate, setPluginEnabled,
  uninstallPlugin, updateInstalledPlugin, updateMarketplace,
} from '../api/workspace'
import { useI18n } from '../i18n'
import { pageSizeForHeight } from './agent-plugin-pagination'
import { pluginConfigValues, validatePluginConfig } from './agent-plugin-config'
import type { PluginConfigIssue, PluginConfigMode } from './agent-plugin-config'
import PluginConfigFields from './plugin-config-fields.vue'
import PluginConfigDialog from './plugin-config-dialog.vue'
import DliIcon from './dl-icon.vue'

type PluginView = 'list' | 'detail' | 'install' | 'addMarketplace'

const props = withDefaults(defineProps<{ agentId: string; agentName: string; requestedPluginKey?: string; projectPath?: string; projectName?: string; embedded?: boolean }>(), { embedded: false, requestedPluginKey: '', projectPath: '', projectName: '' })
const emit = defineEmits<{
  state: [state: ProjectPanelState]
  manageAgent: [pluginKey: string]
  count: [count: number | undefined]
  announce: [message: string]
  openRequestConsumed: []
  viewChange: [view: PluginView]
}>()
const { t } = useI18n()
const installed = ref<InstalledPlugin[]>([])
const ownBindings = ref<MarketplaceBinding[]>([])
const inherited = ref<InstalledPlugin[]>([])
const inheritedBindings = ref<MarketplaceBinding[]>([])
const inheritedStatus = ref<'loading' | 'ready' | 'error'>('loading')
const overrides = ref<ProjectToolOverrides>({ path: props.projectPath, plugins: [], mcp: [] })
const isProject = computed(() => props.projectPath !== '')
const scope = computed(() => isProject.value ? 'project' : 'agent')
const ownerId = computed(() => isProject.value ? props.projectPath : props.agentId)
const entries = computed(() => resolveProjectPlugins(inherited.value, installed.value, overrides.value))
const installedView = computed(() => isProject.value ? entries.value.map((entry) => ({ ...entry.installed, enabled: entry.effectiveEnabled })) : installed.value)
const marketEntries = computed(() => resolveProjectMarkets(inheritedBindings.value, ownBindings.value))
const bindings = computed(() => isProject.value ? marketEntries.value.map((entry) => entry.binding) : ownBindings.value)
const installedQuery = ref('')
const visibleInstalled = computed(() => installedView.value.filter((item) => [item.plugin.name, item.marketplaceName, pluginKey(item.plugin)].some((value) => value.toLowerCase().includes(installedQuery.value.toLowerCase().trim()))))
const configBaseline = ref('')
const isConfirmingDiscard = ref(false)
const pendingPluginKey = ref('')
const status = ref<'loading' | 'ready' | 'error'>('loading')
const view = ref<PluginView>('list')
const isPluginsExpanded = ref(true)
const isMarketsExpanded = ref(true)
const listFocusKey = ref('')
const marketAddRef = ref<HTMLButtonElement | null>(null)
const sectionPrefix = computed(() => `agent-plugins-${props.agentId}`)
const selectedPluginKey = ref('')
const error = ref('')
const query = ref('')
const selectedMarketId = ref('')
const currentPage = ref(1)
const pageSize = ref(1)
const installListRef = ref<HTMLElement | null>(null)
const installCandidate = ref<Plugin | null>(null)
const installFocusKey = ref('')
const installedFeedbackKey = ref('')
const configDrafts = ref<Record<string, string>>({})
const configErrors = ref<Record<string, string>>({})
const isConfirmingUninstall = ref(false)
const removeMarketId = ref('')
const addName = ref('')
const addSource = ref('')
const addAutoUpdate = ref(false)
const busy = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const returnFocus = ref<HTMLElement | null>(null)
const isAlive = ref(true)
const loadVersion = ref(0)

function pluginKey(plugin: Plugin): string {
  return `${plugin.id}@${plugin.marketplaceId}`
}
const selected = computed(() => installedView.value.find((item) => pluginKey(item.plugin) === selectedPluginKey.value))
const available = computed(() => {
  const installedKeys = new Set(installed.value.map((item) => pluginKey(item.plugin)))
  return bindings.value.flatMap((binding) => binding.marketplace.plugins
    .filter((plugin) => !installedKeys.has(pluginKey(plugin)))
    .map((plugin) => ({ plugin, market: binding.marketplace.name })))
})
const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return available.value.filter(({ plugin, market }) => {
    if (selectedMarketId.value !== '' && plugin.marketplaceId !== selectedMarketId.value) return false
    return [plugin.name, plugin.description, plugin.id, market].some((field) => field.toLowerCase().includes(needle))
  })
})
const pageCount = computed(() => filtered.value.length === 0 ? 0 : Math.ceil(filtered.value.length / pageSize.value))
const paginated = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})
// 列表高度不足一条以上时改为一整条可滚列表:窄屏分页会把每页压到 1 条、页数暴涨。
const isPaged = computed(() => !props.embedded && pageSize.value > 1)
const installRows = computed(() => isPaged.value ? paginated.value : filtered.value)
const pageStatus = computed(() => t.value.workspace.plugins.installPageStatus
  .replace('{page}', String(currentPage.value))
  .replace('{pages}', String(Math.max(1, pageCount.value))))
const selectedEntry = computed(() => entries.value.find((entry) => entry.key === selectedPluginKey.value))
const isReadonly = computed(() => isProject.value && selectedEntry.value?.source === 'agent')
const isConfigDirty = computed(() => view.value === 'detail' && !isReadonly.value && configBaseline.value !== JSON.stringify(configDrafts.value))
const scopeCopy = computed(() => t.value.workspace.projectTools.agentScope.replace('{agent}', props.agentName))
const formPrefix = computed(() => `agent-plugin-${props.agentId}-${selectedPluginKey.value}`)
const installCandidateMarket = computed(() => {
  const candidate = installCandidate.value
  return candidate === null ? '' : bindings.value.find((binding) => binding.marketplace.id === candidate.marketplaceId)?.marketplace.name ?? candidate.marketplaceId
})
const detailSecretSet = computed(() => Object.fromEntries((selected.value?.config ?? []).map((field) => [field.key, field.isSet])))
const installedFeedback = computed(() => installed.value.find((item) => pluginKey(item.plugin) === installedFeedbackKey.value))

function projectCopy(text: string, name = ''): string { return text.replaceAll('{project}', props.projectName).replaceAll('{agent}', props.agentName).replaceAll('{name}', name) }
function entryFor(item: InstalledPlugin): ProjectPluginEntry | undefined { return entries.value.find((entry) => entry.key === pluginKey(item.plugin)) }
function sourceLabel(item: InstalledPlugin): string {
  const source = entryFor(item)?.source
  return !isProject.value ? t.value.workspace.mcp.sourceAgent : projectCopy(source === 'both' ? t.value.workspace.projectTools.both : source === 'project' ? t.value.workspace.projectTools.own : t.value.workspace.projectTools.inherited)
}
function effectiveLabel(item: InstalledPlugin): string {
  const copy = t.value.workspace.projectTools
  if (isProject.value && status.value !== 'ready') return copy.loadProjectError
  if (isProject.value && inheritedStatus.value !== 'ready') return copy.loadAgentError
  return isProject.value ? (item.enabled ? copy.enabled : copy.disabled) : (item.enabled ? copy.defaultEnabled : copy.defaultDisabled)
}
function marketReadonly(binding: MarketplaceBinding): boolean { return isProject.value && !ownBindings.value.some((item) => item.marketplace.id === binding.marketplace.id) }
async function loadInherited(): Promise<void> {
  if (!isProject.value) { inheritedStatus.value = 'ready'; return }
  inheritedStatus.value = 'loading'
  const [pluginsResult, marketsResult] = await Promise.all([listInstalledPlugins('agent', props.agentId), listMarketplaceBindings('agent', props.agentId)])
  if (!isAlive.value) return
  if (!pluginsResult.ok || !marketsResult.ok) { inheritedStatus.value = 'error'; return }
  inherited.value = pluginsResult.value
  inheritedBindings.value = marketsResult.value
  inheritedStatus.value = 'ready'
}
async function loadOwn(): Promise<void> {
  loadVersion.value += 1
  const version = loadVersion.value
  status.value = 'loading'
  error.value = ''
  const [pluginsResult, bindingsResult, overridesResult] = await Promise.all([
    listInstalledPlugins(scope.value, ownerId.value), listMarketplaceBindings(scope.value, ownerId.value),
    isProject.value ? getProjectToolOverrides(props.projectPath) : Promise.resolve(null),
  ])
  if (!isAlive.value || loadVersion.value !== version) return
  if (!pluginsResult.ok || !bindingsResult.ok || (overridesResult !== null && !overridesResult.ok)) {
    status.value = 'error'
    error.value = !pluginsResult.ok ? pluginsResult.error.message : !bindingsResult.ok ? bindingsResult.error.message : overridesResult !== null && !overridesResult.ok ? overridesResult.error.message : ''
    return
  }
  installed.value = pluginsResult.value
  ownBindings.value = bindingsResult.value
  if (overridesResult?.ok) overrides.value = overridesResult.value
  status.value = 'ready'
}
async function load(): Promise<void> { await Promise.all([loadOwn(), loadInherited()]) }
function replaceInstalled(item: InstalledPlugin): void {
  const next = installed.value.filter((existing) => pluginKey(existing.plugin) !== pluginKey(item.plugin))
  installed.value = [...next, item].sort((a, b) => a.plugin.name.localeCompare(b.plugin.name))
}
function replaceBinding(item: MarketplaceBinding): void {
  ownBindings.value = ownBindings.value.some((existing) => existing.marketplace.id === item.marketplace.id)
    ? ownBindings.value.map((existing) => existing.marketplace.id === item.marketplace.id ? item : existing)
    : [...ownBindings.value, item]
}

// 请求期间锁定导航,业务错误保留在面板内。
async function mutate<T>(request: () => Promise<Result<T>>, success: (value: T) => void | Promise<void>): Promise<void> {
  if (busy.value) return
  const previousFocus = document.activeElement instanceof HTMLElement && rootRef.value?.contains(document.activeElement)
    ? document.activeElement : null
  busy.value = true
  error.value = ''
  const previousView = view.value
  try {
    const result = await request()
    if (!isAlive.value) return
    if (!result.ok) { error.value = isProject.value ? projectCopy(t.value.workspace.projectTools.feedback).replace('{message}', result.error.message) : result.error.message; return }
    await success(result.value)
    if (isProject.value) projectToolsRevision.value += 1
  } finally {
    busy.value = false
    // 禁用的按钮会失焦;原控件仍在则恢复,安装按钮已移除则聚焦流程返回钮。
    // 用户主动移到面板外时不抢焦点,顶层 tab 隐藏面板时也不恢复。
    await nextTick()
    if (isAlive.value && rootRef.value?.getClientRects().length) {
      if (previousView !== view.value) focusView(view.value)
      else if (previousFocus !== null && document.activeElement === document.body) {
        if (previousFocus.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true })
        else focusView(view.value)
      }
    }
  }
}
function announce(template: string, name: string): void {
  const message = template.replace('{name}', name)
  emit('announce', isProject.value ? projectCopy(t.value.workspace.projectTools.feedback).replace('{message}', message) : message)
}
async function navigate(next: PluginView): Promise<void> {
  error.value = ''
  configErrors.value = {}
  isConfirmingUninstall.value = false
  removeMarketId.value = ''
  if (view.value === 'list') returnFocus.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  view.value = next
  await nextTick()
  if (!busy.value) focusView(next)
}
function focusView(next: PluginView): void {
  // 顶层 tab 隐藏插件面板时不抢走项目视图的焦点。
  if (!rootRef.value?.getClientRects().length) return
  const pluginRow = [...rootRef.value.querySelectorAll<HTMLElement>('.plugin-main')]
    .find((element) => element.dataset['pluginKey'] === listFocusKey.value)
  const installRowAction = [...rootRef.value.querySelectorAll<HTMLElement>('.install-row__action')]
    .find((element) => element.dataset['pluginKey'] === installFocusKey.value)
  const target = next === 'list'
    ? pluginRow ?? (returnFocus.value?.isConnected === true ? returnFocus.value : rootRef.value.querySelector<HTMLElement>('.plugin-add'))
    : next === 'addMarketplace'
      ? rootRef.value.querySelector<HTMLInputElement>('.add-market input')
      : next === 'install' && installRowAction !== undefined
        ? installRowAction
        : rootRef.value.querySelector<HTMLElement>('.plugin-back')
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'nearest' })
}
function back(): void {
  if (busy.value) return
  if (isConfigDirty.value) { isConfirmingDiscard.value = true; void nextTick(() => rootRef.value?.querySelector<HTMLElement>('.plugin-keep-editing')?.focus()); return }
  isPluginsExpanded.value = true
  if (view.value === 'addMarketplace') {
    resetAddMarketDraft()
    isMarketsExpanded.value = true
    returnFocus.value = marketAddRef.value
  }
  void navigate('list')
}
function onEscape(event: KeyboardEvent): void {
  if (view.value === 'list') return
  event.preventDefault()
  event.stopPropagation()
  back()
}
function resetConfigDrafts(): void {
  configDrafts.value = Object.fromEntries((selected.value?.config ?? []).map((field) => [field.key, field.type === 'secret' ? '' : field.value]))
  configBaseline.value = JSON.stringify(configDrafts.value)
  isConfirmingDiscard.value = false
}
function discardConfig(): void {
  const requested = installedView.value.find((item) => pluginKey(item.plugin) === pendingPluginKey.value)
  pendingPluginKey.value = ''
  resetConfigDrafts()
  if (requested) openDetail(requested)
  else back()
}
function keepConfigEditing(): void { isConfirmingDiscard.value = false; pendingPluginKey.value = ''; void nextTick(() => rootRef.value?.querySelector<HTMLElement>('.plugin-back')?.focus()) }
function openDetail(item: InstalledPlugin): void {
  selectedPluginKey.value = pluginKey(item.plugin)
  listFocusKey.value = selectedPluginKey.value
  installedFeedbackKey.value = ''
  resetConfigDrafts()
  void navigate('detail')
}
function openInstall(): void {
  query.value = ''
  selectedMarketId.value = ''
  currentPage.value = 1
  listFocusKey.value = ''
  installFocusKey.value = ''
  installCandidate.value = null
  installedFeedbackKey.value = ''
  void navigate('install')
}
async function scrollInstallTop(): Promise<void> {
  await nextTick()
  if (installListRef.value !== null) installListRef.value.scrollTop = 0
}
function goToPage(page: number): void {
  if (busy.value || page < 1 || page > pageCount.value || page === currentPage.value) return
  currentPage.value = page
  void scrollInstallTop()
}
function measureInstallPageSize(): void {
  const list = installListRef.value
  if (list === null) return
  const rowHeight = list.querySelector<HTMLElement>('.install-row')?.getBoundingClientRect().height ?? 0
  pageSize.value = pageSizeForHeight(list.clientHeight, rowHeight)
}
watch(installListRef, (list, _previous, onCleanup) => {
  if (list === null || props.embedded) return
  const observer = new ResizeObserver(measureInstallPageSize)
  observer.observe(list)
  measureInstallPageSize()
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
watch([query, selectedMarketId], () => {
  currentPage.value = 1
  void scrollInstallTop()
})
watch([pageCount, pageSize], ([pages, size], [_previousPages, previousSize]) => {
  currentPage.value = Math.min(currentPage.value, Math.max(1, pages))
  if (size !== previousSize) void scrollInstallTop()
})
function toggleMarkets(): void {
  isMarketsExpanded.value = !isMarketsExpanded.value
  if (!isMarketsExpanded.value) removeMarketId.value = ''
}
function resetAddMarketDraft(): void {
  addName.value = ''
  addSource.value = ''
  addAutoUpdate.value = false
}
async function openAddMarket(): Promise<void> {
  if (busy.value) return
  // 清掉上次详情的焦点键:从添加市场返回时应回到市场 ＋,而不是曾打开过的插件行。
  listFocusKey.value = ''
  isMarketsExpanded.value = true
  error.value = ''
  await navigate('addMarketplace')
  returnFocus.value = marketAddRef.value
}
function switchLabel(item: InstalledPlugin): string {
  if (isProject.value) return projectCopy(item.enabled ? t.value.workspace.projectTools.disableLabel : t.value.workspace.projectTools.enableLabel, item.plugin.name)
  return (item.enabled ? t.value.workspace.plugins.disableLabel : t.value.workspace.plugins.enableLabel).replace('{name}', item.plugin.name)
}
function needsConfig(item: InstalledPlugin): boolean {
  return item.config.some((field) => field.required && !field.isSet)
}
function requiresInstallConfig(plugin: Plugin): boolean {
  return plugin.config.some((field) => field.required)
}
function updateConfigValue(key: string, value: string): void {
  configDrafts.value[key] = value
  const next = { ...configErrors.value }
  delete next[key]
  configErrors.value = next
}
function issueMessage(issue: PluginConfigIssue): string {
  if (issue.kind === 'number') return t.value.workspace.plugins.configNumberInvalid
  if (issue.kind === 'choice') return t.value.workspace.plugins.configChoiceInvalid
  return t.value.workspace.plugins.configRequired
}
async function focusConfigField(key: string): Promise<void> {
  await nextTick()
  const control = [...(rootRef.value?.querySelectorAll<HTMLElement>('[data-config-control]') ?? [])]
    .find((element) => element.dataset['configKey'] === key)
  control?.focus({ preventScroll: true })
  control?.scrollIntoView({ block: 'nearest' })
}
function configIsValid(fields: readonly PluginConfigSchema[], mode: PluginConfigMode): boolean {
  const issues = validatePluginConfig(fields, configDrafts.value, mode, (key) => mode === 'detail' && detailSecretSet.value[key] === true)
  if (issues.length === 0) {
    configErrors.value = {}
    return true
  }
  configErrors.value = Object.fromEntries(issues.map((issue) => [issue.key, issueMessage(issue)]))
  const first = issues[0]
  if (first !== undefined) void focusConfigField(first.key)
  return false
}
function hasUpdate(item: InstalledPlugin): boolean {
  return item.installedVersion !== item.plugin.version
}
async function restore(item: InstalledPlugin): Promise<void> {
  await mutate(() => setProjectToolOverride(props.projectPath, props.agentId, 'plugins', pluginKey(item.plugin), null), (value) => {
    overrides.value = value
    emit('announce', projectCopy(t.value.workspace.projectTools.restoredAnnounce, item.plugin.name))
  })
}
async function toggle(item: InstalledPlugin, enabled: boolean): Promise<void> {
  if (isProject.value && item.scope === 'agent') {
    await mutate(() => setProjectToolOverride(props.projectPath, props.agentId, 'plugins', pluginKey(item.plugin), enabled), (value) => {
      overrides.value = value
      emit('announce', projectCopy(enabled ? t.value.workspace.projectTools.enabledAnnounce : t.value.workspace.projectTools.disabledAnnounce, item.plugin.name))
    })
    return
  }
  await mutate(() => setPluginEnabled(scope.value, ownerId.value, item.plugin.marketplaceId, item.plugin.id, enabled), (updated) => {
    replaceInstalled(updated)
    announce(enabled ? t.value.workspace.plugins.enabledAnnounce : t.value.workspace.plugins.disabledAnnounce, item.plugin.name)
  })
}
async function performInstall(plugin: Plugin, values: readonly PluginConfigValue[]): Promise<void> {
  await mutate(() => installPlugin(scope.value, ownerId.value, plugin.marketplaceId, plugin.id, values), async (item) => {
    replaceInstalled(item)
    listFocusKey.value = pluginKey(item.plugin)
    isPluginsExpanded.value = true
    // 仅 optional 配置的插件给一条非阻断提示与次级配置入口;必填配置已完成时不重复提醒。
    installedFeedbackKey.value = item.plugin.config.length > 0 && !requiresInstallConfig(item.plugin) ? listFocusKey.value : ''
    announce(t.value.workspace.plugins.installedAnnounce, item.plugin.name)
    await navigate('list')
    installCandidate.value = null
  })
}
async function startInstall(plugin: Plugin): Promise<void> {
  // 每次打开新窗体都清掉上一次安装错误;所有插件共用同一个安装窗体。
  error.value = ''
  installFocusKey.value = pluginKey(plugin)
  installCandidate.value = plugin
}
async function cancelInstallConfig(): Promise<void> {
  if (busy.value) return
  error.value = ''
  installCandidate.value = null
  await nextTick()
  focusView('install')
}
async function installFromDialog(values: readonly PluginConfigValue[]): Promise<void> {
  const plugin = installCandidate.value
  if (plugin !== null) await performInstall(plugin, values)
}
async function setUninstallConfirmation(isConfirming: boolean): Promise<void> {
  isConfirmingUninstall.value = isConfirming
  await nextTick()
  rootRef.value?.querySelector<HTMLElement>(isConfirming ? '.plugin-confirm .plugin-action' : '.plugin-actions--end .plugin-danger')?.focus({ preventScroll: true })
}
async function uninstall(): Promise<void> {
  const item = selected.value
  if (item === undefined || isReadonly.value) return
  await mutate(() => uninstallPlugin(scope.value, ownerId.value, item.plugin.marketplaceId, item.plugin.id), async () => {
    installed.value = installed.value.filter((entry) => pluginKey(entry.plugin) !== pluginKey(item.plugin))
    announce(t.value.workspace.plugins.uninstalledAnnounce, item.plugin.name)
    await navigate('list')
  })
}
async function updatePlugin(): Promise<void> {
  const item = selected.value
  if (item === undefined || isReadonly.value) return
  await mutate(() => updateInstalledPlugin(scope.value, ownerId.value, item.plugin.marketplaceId, item.plugin.id), (updated) => {
    replaceInstalled(updated)
    announce(t.value.workspace.plugins.updatedPlugin.replace('{version}', updated.installedVersion), updated.plugin.name)
  })
}
async function saveConfig(): Promise<void> {
  const item = selected.value
  if (item === undefined || isReadonly.value || busy.value || !configIsValid(item.config, 'detail')) return
  const values = pluginConfigValues(item.config, configDrafts.value, 'detail')
  await mutate(() => savePluginConfig(scope.value, ownerId.value, item.plugin.marketplaceId, item.plugin.id, values), (updated) => {
    replaceInstalled(updated)
    resetConfigDrafts()
    announce(t.value.workspace.plugins.configureSaved, updated.plugin.name)
  })
}
async function refreshInstalled(): Promise<void> {
  const result = await listInstalledPlugins(scope.value, ownerId.value)
  if (!isAlive.value) return
  if (!result.ok) { error.value = result.error.message; return }
  installed.value = result.value
}
async function setAutoUpdate(binding: MarketplaceBinding, enabled: boolean): Promise<void> {
  await mutate(() => setMarketplaceAutoUpdate(scope.value, ownerId.value, binding.marketplace.id, enabled), async (updated) => {
    replaceBinding(updated)
    if (enabled) await refreshInstalled()
    announce(enabled ? t.value.workspace.plugins.autoUpdateOn : t.value.workspace.plugins.autoUpdateOff, binding.marketplace.name)
  })
}
async function updateMarket(binding: MarketplaceBinding): Promise<void> {
  await mutate(() => updateMarketplace(scope.value, ownerId.value, binding.marketplace.id), async (updated) => {
    replaceBinding(updated)
    await refreshInstalled()
    announce(t.value.workspace.plugins.updatedMarketplace, binding.marketplace.name)
  })
}
function removeBody(binding: MarketplaceBinding): string {
  if (isProject.value) return projectCopy(t.value.workspace.projectTools.removeMarket).replace('{count}', String(installed.value.filter((item) => item.plugin.marketplaceId === binding.marketplace.id).length))
  return t.value.workspace.plugins.removeBodyAgent.replace('{name}', props.agentName)
    .replace('{count}', String(installed.value.filter((item) => item.plugin.marketplaceId === binding.marketplace.id).length))
}
async function removeMarket(binding: MarketplaceBinding): Promise<void> {
  await mutate(() => removeMarketplace(scope.value, ownerId.value, binding.marketplace.id), async () => {
    ownBindings.value = ownBindings.value.filter((item) => item.marketplace.id !== binding.marketplace.id)
    installed.value = installed.value.filter((item) => item.plugin.marketplaceId !== binding.marketplace.id)
    removeMarketId.value = ''
    if (view.value === 'detail' && selected.value === undefined) await navigate('list')
    announce(t.value.workspace.plugins.removedMarketplace, binding.marketplace.name)
  })
  if (!error.value) marketAddRef.value?.focus({ preventScroll: true })
}
async function addMarket(): Promise<void> {
  if (addName.value.trim() === '' || addSource.value.trim() === '') {
    error.value = t.value.workspace.plugins.marketplaceRequired
    return
  }
  await mutate(() => addMarketplace(scope.value, ownerId.value, { name: addName.value.trim(), source: addSource.value.trim(), autoUpdate: addAutoUpdate.value }), async (binding) => {
    replaceBinding(binding)
    resetAddMarketDraft()
    isMarketsExpanded.value = true
    returnFocus.value = marketAddRef.value
    announce(t.value.workspace.plugins.addedMarketplace, binding.marketplace.name)
    await navigate('list')
  })
}
watch([status, () => installedView.value.length], () => emit('count', status.value === 'ready' ? installedView.value.length : undefined), { immediate: true })
watch(view, (next) => emit('viewChange', next), { immediate: true })
watch([status, inheritedStatus, () => props.requestedPluginKey], ([nextStatus, nextInheritedStatus, requestedKey]) => {
  if (nextStatus !== 'ready' || (isProject.value && nextInheritedStatus !== 'ready') || requestedKey === '') return
  const item = installedView.value.find((entry) => pluginKey(entry.plugin) === requestedKey)
  if (item !== undefined && isConfigDirty.value) {
    if (requestedKey !== selectedPluginKey.value) { pendingPluginKey.value = requestedKey; isConfirmingDiscard.value = true }
  } else if (item !== undefined) openDetail(item)
  // 请求只消费一次;之后用户从详情返回列表不会被残留 key 再次推回详情。
  emit('openRequestConsumed')
})
watch(() => [props.agentId, props.projectPath], () => {
  view.value = 'list'
  installed.value = []
  ownBindings.value = []
  selectedPluginKey.value = ''
  selectedMarketId.value = ''
  currentPage.value = 1
  pageSize.value = 1
  installCandidate.value = null
  installFocusKey.value = ''
  installedFeedbackKey.value = ''
  configDrafts.value = {}
  configErrors.value = {}
  isPluginsExpanded.value = true
  isMarketsExpanded.value = true
  isConfirmingUninstall.value = false
  removeMarketId.value = ''
  listFocusKey.value = ''
  returnFocus.value = null
  addName.value = ''
  addSource.value = ''
  addAutoUpdate.value = false
  void load()
}, { immediate: true })
const panelState = computed<ProjectPanelState>(() => ({ status: status.value, dirty: isConfigDirty.value, saving: busy.value,
  saveState: isConfigDirty.value ? 'dirty' : 'clean', saveStateLabel: isConfigDirty.value ? t.value.workspace.projectTools.dirty : t.value.workspace.projectTools.immediate, canSave: false }))
watch(panelState, (state) => emit('state', state), { immediate: true })
onBeforeUnmount(() => { isAlive.value = false })
</script>

<template>
  <section ref="rootRef" class="agent-plugins" :class="{ 'agent-plugins--embedded': embedded }" :data-view="view" :aria-busy="busy || status === 'loading'" @keydown.esc="onEscape">
    <div v-if="status === 'loading'" class="plugin-state" :aria-label="t.workspace.plugins.loading"><NSkeleton text :repeat="4" :animated="false" /></div>
    <div v-else-if="status === 'error'" class="plugin-state plugin-source-error" data-source="project" role="alert">
      <p>{{ isProject ? t.workspace.projectTools.loadProjectError : t.workspace.plugins.error }}</p><p v-if="error">{{ error }}</p>
      <button type="button" class="plugin-action" @click="loadOwn">{{ t.workspace.plugins.retry }}</button>
    </div>
    <template v-if="status === 'ready' || (isProject && inheritedStatus === 'ready')">
      <p v-if="!isProject" class="plugin-scope-summary">{{ scopeCopy }}</p>
      <div v-if="isProject && inheritedStatus === 'loading'" class="plugin-state" role="status">{{ t.workspace.projectSettings.loading }}</div>
      <div v-if="isProject && inheritedStatus === 'error'" class="plugin-error" role="alert"><p>{{ t.workspace.projectTools.loadAgentError }}</p><button type="button" class="plugin-action" @click="loadInherited">{{ t.workspace.plugins.retry }}</button></div>
      <p v-if="error && status === 'ready' && installCandidate === null" class="plugin-error" role="alert">{{ error }}</p>
      <!-- 子页面只隐藏分组,保留折叠状态与详情草稿。 -->
      <div v-show="view === 'list'" class="plugin-groups">
        <div v-if="view === 'list' && installedFeedback" class="plugin-install-feedback" role="status">
          <p>{{ t.workspace.plugins.optionalConfigInstalled.replace('{name}', installedFeedback.plugin.name) }}</p>
          <button type="button" class="plugin-action" :disabled="busy" :aria-label="t.workspace.plugins.configurePluginLabel.replace('{name}', installedFeedback.plugin.name)" @click="openDetail(installedFeedback)">{{ t.workspace.plugins.configure }}</button>
        </div>
        <section class="plugin-group" data-group="plugins">
          <div class="plugin-group-head">
            <button type="button" class="plugin-disclosure" :disabled="busy" :aria-expanded="isPluginsExpanded" :aria-controls="`${sectionPrefix}-installed`" @click="isPluginsExpanded = !isPluginsExpanded">
              <DliIcon class="group-chevron" :class="{ 'is-expanded': isPluginsExpanded }" name="chevronRight" size="sm" /><span>{{ isProject ? t.workspace.projectTools.projectPlugins : t.workspace.plugins.pluginsTitle }}</span><span class="plugin-count">{{ installedView.length }}</span>
            </button>
            <button type="button" class="plugin-add" :disabled="busy" :aria-label="t.workspace.plugins.installPlugin" :title="t.workspace.plugins.installPlugin" @click="openInstall"><span aria-hidden="true">＋</span></button>
          </div>
          <div :id="`${sectionPrefix}-installed`" v-show="isPluginsExpanded" class="plugin-group-content">
            <div v-if="view === 'list'" class="plugin-list">
              <NInput v-model:value="installedQuery" class="installed-search" :placeholder="t.workspace.projectTools.search" :input-props="{ 'aria-label': t.workspace.projectTools.search, type: 'search' }" />
              <p v-if="isProject && inheritedStatus === 'ready' && inherited.length === 0" class="plugin-empty">{{ t.workspace.projectTools.noInherited }}</p>
              <p v-if="isProject && installed.length === 0" class="plugin-empty">{{ t.workspace.projectTools.noOwn }}</p>
              <div v-if="installedView.length === 0" class="plugin-state"><p>{{ t.workspace.plugins.empty }}</p><button type="button" class="plugin-action" :disabled="busy" @click="openInstall">{{ t.workspace.plugins.installPlugin }}</button></div>
              <ul v-else>
                <li v-for="item in visibleInstalled" :key="pluginKey(item.plugin)" class="compact-plugin" :data-enabled="item.enabled">
                  <button type="button" class="plugin-main" :data-plugin-key="pluginKey(item.plugin)" :disabled="busy" @click="openDetail(item)">
                    <span class="plugin-title"><span class="plugin-name">{{ item.plugin.name }}</span><span class="plugin-mono">v{{ item.installedVersion }}</span></span>
                    <span class="plugin-source">{{ item.marketplaceName }}</span>
                    <span class="plugin-provenance">{{ t.workspace.projectTools.source }} · {{ sourceLabel(item) }}</span>
                    <span class="plugin-effective">{{ t.workspace.projectTools.effective }} · {{ effectiveLabel(item) }}<template v-if="isProject && entryFor(item)?.overrideEnabled !== null"> · {{ t.workspace.projectTools.override }}</template></span>
                    <span v-if="hasUpdate(item) || needsConfig(item)" class="plugin-badges"><span v-if="hasUpdate(item)" class="plugin-badge">{{ t.workspace.plugins.update }}</span><span v-if="needsConfig(item)" class="plugin-badge plugin-badge--warning">{{ t.workspace.plugins.configureRequired }}</span></span>
                    <DliIcon class="plugin-chevron" name="chevronRight" size="sm" />
                  </button>
                  <!-- 开关与整行详情按钮是兄弟,不产生嵌套交互元素。 -->
                  <NSwitch class="plugin-switch" size="small" :value="item.enabled" :disabled="busy || (isProject && (inheritedStatus !== 'ready' || status !== 'ready'))" :aria-label="switchLabel(item)" @update:value="(value: boolean) => toggle(item, value)" />
                  <button v-if="isProject && entryFor(item)?.overrideEnabled !== null && entryFor(item)?.agentEnabled !== null" type="button" class="plugin-action plugin-restore" :disabled="busy" :aria-label="projectCopy(t.workspace.projectTools.restoreLabel, item.plugin.name)" @click="restore(item)">{{ t.workspace.projectTools.restore }}</button>
                </li>
              </ul>
              <p v-if="installedView.length > 0 && visibleInstalled.length === 0" class="plugin-empty">{{ t.workspace.plugins.installNoMatch }}</p>
            </div>
          </div>
        </section>
        <section class="plugin-group" data-group="markets">
          <div class="plugin-group-head">
            <button type="button" class="plugin-disclosure" :disabled="busy" :aria-expanded="isMarketsExpanded" :aria-controls="`${sectionPrefix}-markets`" @click="toggleMarkets">
              <DliIcon class="group-chevron" :class="{ 'is-expanded': isMarketsExpanded }" name="chevronRight" size="sm" /><span>{{ t.workspace.plugins.marketplacesTitle }}</span><span class="plugin-count">{{ bindings.length }}</span>
            </button>
            <button ref="marketAddRef" type="button" class="plugin-add market-add" :disabled="busy" :aria-label="t.workspace.plugins.addMarketplace" :title="t.workspace.plugins.addMarketplace" @click="openAddMarket"><span aria-hidden="true">＋</span></button>
          </div>
          <div :id="`${sectionPrefix}-markets`" v-show="isMarketsExpanded" class="plugin-group-content">
            <div v-if="bindings.length === 0" class="plugin-state"><p>{{ t.workspace.plugins.installNoMarketplaces }}</p><button type="button" class="plugin-action" :disabled="busy" @click="openAddMarket">{{ t.workspace.plugins.addMarketplace }}</button></div>
            <ul v-else class="market-list"><li v-for="binding in bindings" :key="binding.marketplace.id" class="market-row" :data-marketplace="binding.marketplace.id">
              <p class="plugin-title"><span class="plugin-name">{{ binding.marketplace.name }}</span><span class="market-trust">{{ t.workspace.plugins.trustLabel[binding.marketplace.trust] }}</span></p>
              <p v-if="isProject" class="plugin-provenance">{{ marketReadonly(binding) ? t.workspace.projectTools.agentMarket : t.workspace.projectTools.ownMarket }}</p>
              <p class="market-source plugin-mono">{{ binding.marketplace.source }}</p>
              <div v-if="!marketReadonly(binding)" class="market-controls">
                <div class="market-auto"><span>{{ t.workspace.plugins.autoUpdate }}</span><NSwitch class="plugin-switch" size="small" :value="binding.autoUpdate" :disabled="busy" :aria-label="t.workspace.plugins.autoUpdateLabel.replace('{name}', binding.marketplace.name)" @update:value="(value: boolean) => setAutoUpdate(binding, value)" /></div>
                <div class="plugin-actions"><button type="button" class="plugin-action" :disabled="busy" :aria-label="t.workspace.plugins.updateLabel.replace('{name}', binding.marketplace.name)" @click="updateMarket(binding)">{{ t.workspace.plugins.update }}</button><button type="button" class="plugin-action plugin-danger" :disabled="busy" :aria-label="t.workspace.plugins.removeMarketplace" @click="removeMarketId = binding.marketplace.id">{{ t.workspace.plugins.remove }}</button></div>
              </div>
              <div v-if="removeMarketId === binding.marketplace.id" class="plugin-confirm"><p>{{ removeBody(binding) }}</p><div class="plugin-actions"><button type="button" class="plugin-action" :disabled="busy" @click="removeMarketId = ''">{{ t.workspace.plugins.removeCancel }}</button><button type="button" class="plugin-action plugin-danger" :disabled="busy" @click="removeMarket(binding)">{{ t.workspace.plugins.removeConfirm }}</button></div></div>
            </li></ul>
          </div>
        </section>
      </div>
      <!-- 详情是独立一页:分组与其计数让位,只保留返回、身份、配置和危险动作。 -->
      <div v-if="view === 'detail' && selected" class="plugin-pane plugin-detail">
        <div class="plugin-page-head">
          <div class="plugin-page-nav">
            <button type="button" class="plugin-back" :disabled="busy" :aria-label="t.workspace.plugins.backToPlugins" :title="t.workspace.plugins.backToPlugins" @click="back"><DliIcon name="chevronLeft" size="sm" /><span>{{ t.workspace.plugins.backToPlugins }}</span></button>
          </div>
          <div class="plugin-page-identity">
            <h3 class="plugin-page-title">{{ selected.plugin.name }}</h3>
            <p class="plugin-meta">
              <span class="plugin-mono">v{{ selected.installedVersion }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ selected.marketplaceName }}</span>
            </p>
          </div>
        </div>
        <p class="plugin-description">{{ selected.plugin.description }}</p>
        <p class="plugin-provenance">{{ t.workspace.projectTools.source }} · {{ sourceLabel(selected) }}</p>
        <p v-if="isProject && selectedEntry?.source === 'both'" class="plugin-description">{{ t.workspace.projectTools.projectConfig }}</p>
        <section v-if="isConfirmingDiscard" class="plugin-confirm"><p>{{ t.workspace.mcp.discardTitle }}</p><div class="plugin-actions"><button type="button" class="plugin-action plugin-keep-editing" @click="keepConfigEditing">{{ t.workspace.mcp.keepEditing }}</button><button type="button" class="plugin-action" @click="discardConfig">{{ t.workspace.mcp.discard }}</button></div></section>
        <section v-if="isReadonly" class="plugin-readonly"><p>{{ t.workspace.projectTools.managed }}</p><dl><div v-for="field in selected.config" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ field.type === 'secret' ? (field.isSet ? t.workspace.mcp.secretSet : t.workspace.mcp.secretUnset) : field.value }}</dd></div></dl><button type="button" class="plugin-action" @click="emit('manageAgent', selectedPluginKey)">{{ t.workspace.projectTools.manageAgent }}</button></section>
        <button v-if="!isReadonly && hasUpdate(selected)" type="button" class="plugin-action plugin-update" :disabled="busy" @click="updatePlugin">{{ busy ? t.workspace.plugins.updating : t.workspace.plugins.updateAvailable.replace('{version}', selected.plugin.version) }}</button>
        <form v-if="!isReadonly && selected.config.length > 0" class="plugin-config" @submit.prevent="saveConfig">
          <div class="plugin-config-head">
            <h4 class="plugin-section-label">{{ t.workspace.plugins.configure }}</h4>
            <span class="plugin-scope">{{ isProject ? t.workspace.projectTools.own : t.workspace.mcp.sourceAgent }}</span>
          </div>
          <PluginConfigFields
            :fields="selected.config" :values="configDrafts" :errors="configErrors" :secret-set="detailSecretSet"
            mode="detail" :form-prefix="formPrefix" :busy="busy" @update="updateConfigValue"
          />
          <div v-if="!isConfirmingUninstall" class="plugin-actions plugin-actions--end">
            <button type="submit" class="plugin-action" :disabled="busy">{{ busy ? t.workspace.plugins.saving : t.workspace.plugins.saveConfig }}</button>
            <button type="button" class="plugin-action plugin-danger" :disabled="busy" @click="setUninstallConfirmation(true)">{{ t.workspace.plugins.uninstall }}</button>
          </div>
        </form>
        <div v-else-if="!isReadonly && !isConfirmingUninstall" class="plugin-actions plugin-actions--end">
          <button type="button" class="plugin-action plugin-danger" :disabled="busy" @click="setUninstallConfirmation(true)">{{ t.workspace.plugins.uninstall }}</button>
        </div>
        <div v-if="isConfirmingUninstall" class="plugin-confirm">
          <p>{{ isProject ? projectCopy(t.workspace.projectTools.uninstall, selected.plugin.name) : t.workspace.plugins.uninstallConfirm.replace('{name}', selected.plugin.name) }}</p>
          <div class="plugin-actions">
            <button type="button" class="plugin-action" :disabled="busy" @click="setUninstallConfirmation(false)">{{ t.workspace.plugins.cancel }}</button>
            <button type="button" class="plugin-action plugin-danger" :disabled="busy" @click="uninstall">{{ t.workspace.plugins.confirmUninstall }}</button>
          </div>
        </div>
      </div>
      <div v-if="view === 'install'" class="plugin-pane plugin-install">
        <div class="plugin-page-head">
          <div class="plugin-page-nav">
            <button type="button" class="plugin-back" :disabled="busy" :aria-label="t.workspace.plugins.backToPlugins" :title="t.workspace.plugins.backToPlugins" @click="back"><DliIcon name="chevronLeft" size="sm" /><span>{{ t.workspace.plugins.backToPlugins }}</span></button>
          </div>
          <div class="plugin-page-identity">
            <h3 class="plugin-page-title">{{ t.workspace.plugins.installTitle }}</h3>
          </div>
        </div>
        <p class="plugin-description">{{ isProject ? projectCopy(t.workspace.projectTools.installHint) : t.workspace.plugins.installHintAgent.replace('{name}', agentName) }}</p>
        <div class="install-toolbar">
          <NInput v-model:value="query" :placeholder="t.workspace.plugins.installSearch" :input-props="{ 'aria-label': t.workspace.plugins.installSearch, type: 'search' }" />
          <div class="install-market-wrap">
            <select v-model="selectedMarketId" class="install-market" :disabled="busy || bindings.length === 0" :aria-label="t.workspace.plugins.installMarketFilter">
              <option value="">{{ t.workspace.plugins.installAllMarketplaces }}</option>
              <option v-for="binding in bindings" :key="binding.marketplace.id" :value="binding.marketplace.id">{{ binding.marketplace.name }}</option>
            </select>
            <DliIcon class="install-market-chevron" name="chevronDown" size="sm" />
          </div>
        </div>
        <div v-if="bindings.length === 0" class="plugin-state"><p>{{ t.workspace.plugins.installNoMarketplaces }}</p><button type="button" class="plugin-action" :disabled="busy" @click="openAddMarket">{{ t.workspace.plugins.addMarketplace }}</button></div>
        <p v-else-if="available.length === 0" class="plugin-empty">{{ t.workspace.plugins.installEmpty }}</p>
        <p v-else-if="filtered.length === 0" class="plugin-empty">{{ t.workspace.plugins.installNoMatch }}</p>
        <ul v-else ref="installListRef" class="install-list" tabindex="0" :aria-label="t.workspace.plugins.installListLabel">
          <li v-for="entry in installRows" :key="pluginKey(entry.plugin)" class="install-row" :data-marketplace="entry.plugin.marketplaceId">
            <div class="install-row__info">
              <p class="plugin-title"><span class="plugin-name">{{ entry.plugin.name }}</span><span class="plugin-mono">v{{ entry.plugin.version }}</span><span v-if="requiresInstallConfig(entry.plugin)" class="plugin-badge plugin-badge--warning">{{ t.workspace.plugins.configureRequired }}</span></p><p class="plugin-source">{{ entry.market }}</p><p class="plugin-description dl-clamp-2">{{ entry.plugin.description }}</p>
            </div>
            <button type="button" class="plugin-action install-row__action" :data-plugin-key="pluginKey(entry.plugin)" :disabled="busy" :aria-label="t.workspace.plugins.installLabel.replace('{name}', entry.plugin.name)" @click="startInstall(entry.plugin)">{{ busy ? t.workspace.plugins.installing : t.workspace.plugins.install }}</button>
          </li>
        </ul>
        <nav v-if="isPaged && filtered.length > 0" class="install-pagination" :aria-label="t.workspace.plugins.installPagination">
          <button type="button" class="plugin-action" :disabled="busy || currentPage <= 1" @click="goToPage(currentPage - 1)">{{ t.workspace.plugins.installPreviousPage }}</button>
          <span class="install-page-status" aria-live="polite" aria-atomic="true">{{ pageStatus }}</span>
          <button type="button" class="plugin-action" :disabled="busy || currentPage >= pageCount" @click="goToPage(currentPage + 1)">{{ t.workspace.plugins.installNextPage }}</button>
        </nav>
      </div>
      <div v-if="view === 'addMarketplace'" class="plugin-pane plugin-add-market">
        <div class="plugin-page-head">
          <div class="plugin-page-nav">
            <button type="button" class="plugin-back" :disabled="busy" :aria-label="t.workspace.plugins.backToPlugins" :title="t.workspace.plugins.backToPlugins" @click="back"><DliIcon name="chevronLeft" size="sm" /><span>{{ t.workspace.plugins.backToPlugins }}</span></button>
          </div>
          <div class="plugin-page-identity">
            <h3 class="plugin-page-title">{{ t.workspace.plugins.addMarketplaceTitle }}</h3>
          </div>
        </div>
        <p class="plugin-description">{{ t.workspace.plugins.addMarketplaceHint }}</p>
        <form class="add-market" @submit.prevent="addMarket">
          <div class="plugin-field"><label :for="`${sectionPrefix}-market-name`">{{ t.workspace.plugins.name }}</label><NInput v-model:value="addName" :disabled="busy" :placeholder="t.workspace.plugins.namePlaceholder" :input-props="{ id: `${sectionPrefix}-market-name` }" /></div>
          <div class="plugin-field"><label :for="`${sectionPrefix}-market-source`">{{ t.workspace.plugins.source }}</label><NInput v-model:value="addSource" :disabled="busy" :placeholder="t.workspace.plugins.sourcePlaceholder" :input-props="{ id: `${sectionPrefix}-market-source`, spellcheck: false }" /></div>
          <div class="market-auto"><span>{{ t.workspace.plugins.marketplaceAutoUpdate }}</span><NSwitch v-model:value="addAutoUpdate" class="plugin-switch" size="small" :disabled="busy" :aria-label="t.workspace.plugins.marketplaceAutoUpdate" /></div>
          <div class="plugin-actions plugin-actions--end"><button type="submit" class="plugin-action" :disabled="busy">{{ busy ? t.workspace.plugins.adding : t.workspace.plugins.add }}</button></div>
        </form>
      </div>
    </template>
    <PluginConfigDialog
      v-if="installCandidate" :plugin="installCandidate" :marketplace-name="installCandidateMarket"
      :agent-name="agentName" :scope-text="isProject ? projectCopy(t.workspace.projectTools.installHint) : ''" :busy="busy" :error="error" @cancel="cancelInstallConfig" @submit="installFromDialog"
    />
  </section>
</template>

<style scoped>
.agent-plugins { min-inline-size: 0; padding: var(--dl-space-1); color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-scope-summary { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); margin-block-end: var(--dl-space-4); max-inline-size: var(--dl-measure); }
.plugin-provenance, .plugin-effective { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-effective { color: var(--dl-accent); }
.installed-search { margin-block: var(--dl-space-2); }
.plugin-restore { margin-inline-start: var(--dl-space-1); }
.plugin-readonly, .plugin-readonly dl { display: grid; gap: var(--dl-space-3); min-inline-size: 0; }
.plugin-readonly dl > div { padding: var(--dl-space-2); background: var(--dl-bg-raised); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); }
.plugin-readonly dd { margin: 0; overflow-wrap: anywhere; font-family: var(--dl-font-mono); }
.plugin-groups { display: grid; gap: var(--dl-space-3); }
.plugin-install-feedback { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--dl-space-2); padding: var(--dl-space-2); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-install-feedback p { min-inline-size: 0; overflow-wrap: anywhere; }
.plugin-install-feedback .plugin-action { flex: none; }
.plugin-group, .plugin-group-content, .plugin-list, .plugin-pane, .plugin-state, .plugin-config { min-inline-size: 0; }
.plugin-pane, .plugin-state, .plugin-config { display: grid; gap: var(--dl-space-2); }
.plugin-group-head { display: flex; align-items: stretch; border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.plugin-disclosure { flex: 1; display: flex; align-items: center; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--workspace-nav-control-size); font-size: var(--dl-font-size-xs); font-weight: 500; color: var(--dl-text-secondary); text-align: left; border-radius: var(--dl-radius-sm); }
.group-chevron { flex: none; transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.group-chevron.is-expanded { transform: rotate(90deg); }
.plugin-count { font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; color: var(--dl-text-tertiary); font-weight: 400; margin-inline-start: var(--dl-space-1); }
.plugin-add { flex: none; display: inline-grid; place-items: center; inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); color: var(--dl-text-secondary); border-radius: var(--dl-radius-sm); }
.plugin-state { padding: var(--dl-space-2) var(--dl-space-1); color: var(--dl-text-secondary); }
.plugin-empty, .plugin-source { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.plugin-empty { padding-block: var(--dl-space-2); }
.plugin-mono, .plugin-source { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }
.compact-plugin { position: relative; display: grid; min-inline-size: 0; }
.compact-plugin + .compact-plugin { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.plugin-main { display: grid; gap: 0; min-inline-size: 0; inline-size: 100%; min-block-size: var(--dl-target-size); padding: var(--dl-space-2) calc(var(--dl-space-12) + var(--dl-space-4)) var(--dl-space-2) var(--dl-space-1); border-radius: var(--dl-radius-sm); text-align: left; }
.plugin-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--dl-space-1); min-inline-size: 0; }
.plugin-name { font-size: var(--dl-font-size-sm); font-weight: 500; overflow-wrap: anywhere; }
.compact-plugin[data-enabled='false'] .plugin-name { color: var(--dl-text-secondary); }
.plugin-source { overflow-wrap: anywhere; }
.compact-plugin > .plugin-switch { position: absolute; inset-inline-end: var(--dl-space-6); inset-block-start: 50%; transform: translateY(-50%); }
.plugin-chevron { position: absolute; inset-inline-end: var(--dl-space-1); inset-block-start: 50%; transform: translateY(-50%); color: var(--dl-text-tertiary); }
.plugin-switch { min-inline-size: var(--dl-space-8); min-block-size: var(--dl-space-6); justify-self: start; }
.plugin-switch:focus-visible { box-shadow: var(--dl-focus-ring); }
.plugin-badges { display: flex; flex-wrap: wrap; gap: var(--dl-space-1); }
.plugin-badge { color: var(--dl-accent); font-size: var(--dl-font-size-xs); }
.plugin-badge--warning, .plugin-required { color: var(--dl-warning); }
.plugin-detail, .plugin-install, .plugin-add-market { display: grid; gap: var(--dl-space-3); padding: 0 0 var(--dl-space-4); }
.agent-plugins[data-view='install'] { display: flex; flex-direction: column; min-block-size: 0; block-size: 100%; }
.agent-plugins[data-view='install'] > .plugin-install { flex: 1; min-block-size: 0; grid-template-rows: auto auto auto minmax(0, 1fr) auto; padding-block-end: 0; }
.install-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 14em); gap: var(--dl-space-2); min-inline-size: 0; }
.install-market-wrap { position: relative; display: block; min-inline-size: 0; }
.install-market { appearance: none; inline-size: 100%; min-inline-size: 0; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3) calc(var(--dl-space-3) + var(--dl-icon-sm) + var(--dl-space-1)); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); cursor: pointer; }
.install-market-chevron { position: absolute; inset-inline-end: var(--dl-space-3); inset-block-start: 50%; transform: translateY(-50%); color: var(--dl-text-tertiary); pointer-events: none; }
.install-market:hover:not(:disabled) { border-color: var(--dl-border-strong); }
.install-market:focus-visible { outline: none; border-color: var(--dl-focus-border); box-shadow: var(--dl-focus-halo); }
.install-market:active:not(:disabled) { border-color: var(--dl-accent); }
.install-market:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; }
.install-market:disabled + .install-market-chevron { color: var(--dl-text-disabled); }
.install-list { min-inline-size: 0; min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--dl-border-strong) transparent; border-radius: var(--dl-radius-sm); }
/* 嵌入项目设置时只由窗体正文滚动,不再测量固定高度或创建内层滚动视口。 */
.agent-plugins--embedded[data-view='install'] { display: block; block-size: auto; }
.agent-plugins--embedded[data-view='install'] > .plugin-install { flex: none; block-size: auto; grid-template-rows: none; padding-block-end: var(--dl-space-4); }
.agent-plugins--embedded .install-list { overflow-y: visible; max-block-size: none; }
.install-list:focus-visible { outline: none; box-shadow: inset var(--dl-focus-ring); }
.install-pagination { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--dl-space-2); min-inline-size: 0; padding-block-start: var(--dl-space-2); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.install-pagination .plugin-action { justify-self: start; white-space: nowrap; }
.install-pagination .plugin-action:last-child { justify-self: end; }
.install-page-status { color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; white-space: nowrap; }
.plugin-page-head { display: grid; gap: var(--dl-space-2); }
.plugin-page-nav { display: flex; align-items: stretch; border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.plugin-page-identity { display: grid; gap: var(--dl-space-1); }
.plugin-page-title { min-inline-size: 0; font-size: var(--dl-font-size-md); font-weight: 500; line-height: var(--dl-line-tight); overflow-wrap: anywhere; }
.plugin-back { flex: 1; display: flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--workspace-nav-control-size); padding: 0; border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); font-weight: 500; line-height: var(--dl-line-snug); text-align: left; }
.plugin-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-1); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); overflow-wrap: anywhere; }
.plugin-description { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.plugin-detail > .plugin-description { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.plugin-update { justify-self: start; color: var(--dl-accent); font-size: var(--dl-font-size-xs); }
.plugin-config { display: grid; gap: var(--dl-space-4); margin-block-start: var(--dl-space-1); padding-block-start: var(--dl-space-3); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.plugin-config-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--dl-space-2); }
.plugin-section-label { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); font-weight: 500; letter-spacing: var(--dl-tracking-label); }
.plugin-scope { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); white-space: nowrap; }
.plugin-field { display: grid; gap: var(--dl-space-2); min-inline-size: 0; }
.plugin-field-copy { display: grid; gap: var(--dl-space-1); min-inline-size: 0; }
.plugin-field-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--dl-space-1); }
.plugin-field-head label { color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); font-weight: 500; }
.plugin-field p { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-field--switch { grid-template-columns: minmax(0, 1fr) auto; align-items: start; column-gap: var(--dl-space-3); }
.plugin-field--switch .plugin-switch { justify-self: end; }
.plugin-field :deep(.n-input) { min-inline-size: 0; }
.plugin-config .plugin-field :deep(.n-input__input-el) { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.plugin-pane :deep(.n-input__input-el) { min-block-size: var(--dl-target-size); }
.plugin-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); }
.plugin-actions--end { justify-content: flex-end; }
.plugin-action { justify-self: start; display: inline-flex; align-items: center; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); color: var(--dl-accent); border-radius: var(--dl-radius-sm); text-align: left; }
.plugin-danger, .plugin-error { color: var(--dl-error); }
.plugin-error { margin-block: var(--dl-space-2); padding: var(--dl-space-2); border: var(--dl-border-width) solid color-mix(in srgb, var(--dl-error) 35%, transparent); border-radius: var(--dl-radius-md); background: color-mix(in srgb, var(--dl-error) 8%, transparent); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.plugin-confirm { display: grid; gap: var(--dl-space-2); padding: var(--dl-space-3); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.plugin-confirm .plugin-actions { justify-content: flex-end; }
.plugin-confirm .plugin-action { min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-2); }
.install-row, .market-row { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-2) var(--dl-space-1); min-inline-size: 0; }
/* 安装行 = 信息在左、操作在右的定宽动作列;操作与整行垂直居中,
   让每行的安装入口落在同一条竖线上,也把行高压回信息本身的高度。 */
.install-row { grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: var(--dl-space-4); }
.install-row__info { display: grid; gap: var(--dl-space-1); min-inline-size: 0; }
.install-row__action { justify-self: end; align-self: center; white-space: nowrap; }
.install-row .plugin-title { flex-wrap: nowrap; }
.install-row .plugin-name, .install-row .plugin-source { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.install-row .plugin-mono { flex: none; }
.install-row .plugin-description { min-block-size: calc(2 * var(--dl-font-size-sm) * var(--dl-line-body)); font-size: var(--dl-font-size-sm); }
.install-row + .install-row, .market-row + .market-row { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.market-trust { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); margin-inline-start: auto; }
.market-source { overflow-wrap: anywhere; }
.market-controls { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-1); flex-wrap: wrap; }
.market-auto { display: flex; align-items: center; gap: var(--dl-space-1); color: var(--dl-text-secondary); }
.market-controls .plugin-action { min-block-size: var(--workspace-nav-control-size); padding-inline: var(--dl-space-1); }
.add-market { display: grid; gap: var(--dl-space-3); }
.agent-plugins button:hover:not(:disabled) { background: var(--dl-bg-hover); }
.agent-plugins button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.agent-plugins button:active:not(:disabled) { background: var(--dl-bg-sunken); }
.agent-plugins button:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
@media (max-width: 1023px) {
  .plugin-add, .plugin-back, .plugin-action { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .plugin-disclosure, .market-controls .plugin-action { min-block-size: var(--dl-target-size); }
  .plugin-switch { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .plugin-confirm .plugin-action { min-block-size: var(--dl-target-size); }
  .plugin-main { min-block-size: calc(var(--dl-target-size) + var(--dl-space-4)); padding-inline-end: calc(var(--dl-target-size) + var(--dl-space-6)); }
}
@media (max-width: 560px) {
  .install-toolbar { grid-template-columns: minmax(0, 1fr); }
  /* 窄屏行高必须小于列表视口,否则单条也会被视口截断;描述压成单行省略。 */
  .install-row .plugin-description { display: block; min-block-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
</style>
