<script setup lang="ts">
// Agent 插件与市场同页分组;详情直接承载配置,安装保留独立流程。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NInput, NSkeleton, NSwitch } from 'naive-ui'
import type { InstalledPlugin } from '../contracts/generated/installed-plugin'
import type { Plugin } from '../contracts/generated/plugin'
import type { MarketplaceBinding } from '../contracts/generated/marketplace-binding'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'
import type { Result } from '../api/result'
import {
  addMarketplace, installPlugin, listInstalledPlugins, listMarketplaceBindings,
  removeMarketplace, savePluginConfig, setMarketplaceAutoUpdate, setPluginEnabled,
  uninstallPlugin, updateInstalledPlugin, updateMarketplace,
} from '../api/workspace'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{ agentId: string; agentName: string }>()
const emit = defineEmits<{
  count: [count: number | undefined]
  announce: [message: string]
}>()
const { t } = useI18n()
const installed = ref<InstalledPlugin[]>([])
const bindings = ref<MarketplaceBinding[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const view = ref<'list' | 'detail' | 'install'>('list')
const isPluginsExpanded = ref(true)
const isMarketsExpanded = ref(true)
const isAddingMarket = ref(false)
const listFocusKey = ref('')
const marketAddRef = ref<HTMLButtonElement | null>(null)
const sectionPrefix = computed(() => `agent-plugins-${props.agentId}`)
const selectedPluginKey = ref('')
const error = ref('')
const query = ref('')
const configDrafts = ref<Record<string, string>>({})
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
const selected = computed(() => installed.value.find((item) => pluginKey(item.plugin) === selectedPluginKey.value))
const available = computed(() => {
  const installedKeys = new Set(installed.value.map((item) => pluginKey(item.plugin)))
  return bindings.value.flatMap((binding) => binding.marketplace.plugins
    .filter((plugin) => !installedKeys.has(pluginKey(plugin)))
    .map((plugin) => ({ plugin, market: binding.marketplace.name })))
})
const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return available.value.filter(({ plugin, market }) => [plugin.name, plugin.description, plugin.id, market]
    .some((field) => field.toLowerCase().includes(needle)))
})
const formPrefix = computed(() => `agent-plugin-${props.agentId}-${selectedPluginKey.value}`)

async function load(): Promise<void> {
  loadVersion.value += 1
  const version = loadVersion.value
  status.value = 'loading'
  error.value = ''
  const [pluginsResult, bindingsResult] = await Promise.all([
    listInstalledPlugins('agent', props.agentId),
    listMarketplaceBindings('agent', props.agentId),
  ])
  if (!isAlive.value || loadVersion.value !== version) return
  if (!pluginsResult.ok || !bindingsResult.ok) {
    status.value = 'error'
    error.value = !pluginsResult.ok ? pluginsResult.error.message : !bindingsResult.ok ? bindingsResult.error.message : ''
    return
  }
  installed.value = pluginsResult.value
  bindings.value = bindingsResult.value
  status.value = 'ready'
}
function replaceInstalled(item: InstalledPlugin): void {
  const next = installed.value.filter((existing) => pluginKey(existing.plugin) !== pluginKey(item.plugin))
  installed.value = [...next, item].sort((a, b) => a.plugin.name.localeCompare(b.plugin.name))
}
function replaceBinding(item: MarketplaceBinding): void {
  bindings.value = bindings.value.some((existing) => existing.marketplace.id === item.marketplace.id)
    ? bindings.value.map((existing) => existing.marketplace.id === item.marketplace.id ? item : existing)
    : [...bindings.value, item]
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
    if (!result.ok) { error.value = result.error.message; return }
    await success(result.value)
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
  emit('announce', template.replace('{name}', name))
}
async function navigate(next: typeof view.value): Promise<void> {
  error.value = ''
  isConfirmingUninstall.value = false
  removeMarketId.value = ''
  if (view.value === 'list') returnFocus.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  view.value = next
  await nextTick()
  if (!busy.value) focusView(next)
}
function focusView(next: typeof view.value): void {
  // 顶层 tab 隐藏插件面板时不抢走项目视图的焦点。
  if (!rootRef.value?.getClientRects().length) return
  const pluginRow = [...rootRef.value.querySelectorAll<HTMLElement>('.plugin-main')]
    .find((element) => element.dataset['pluginKey'] === listFocusKey.value)
  const target = next === 'list'
    ? pluginRow ?? (returnFocus.value?.isConnected === true ? returnFocus.value : rootRef.value.querySelector<HTMLElement>('.plugin-add'))
    : rootRef.value.querySelector<HTMLElement>('.plugin-back')
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'nearest' })
}
function back(): void {
  if (busy.value) return
  isPluginsExpanded.value = true
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
}
function openDetail(item: InstalledPlugin): void {
  selectedPluginKey.value = pluginKey(item.plugin)
  listFocusKey.value = selectedPluginKey.value
  resetConfigDrafts()
  void navigate('detail')
}
function openInstall(): void {
  query.value = ''
  listFocusKey.value = ''
  void navigate('install')
}
function toggleMarkets(): void {
  isMarketsExpanded.value = !isMarketsExpanded.value
  if (!isMarketsExpanded.value) removeMarketId.value = ''
}
async function openAddMarket(): Promise<void> {
  if (busy.value) return
  if (view.value === 'install') await navigate('list')
  isMarketsExpanded.value = true
  isAddingMarket.value = true
  error.value = ''
  await nextTick()
  rootRef.value?.querySelector<HTMLInputElement>('.add-market input')?.focus()
}
async function closeAddMarket(): Promise<void> {
  isAddingMarket.value = false
  addName.value = ''
  addSource.value = ''
  addAutoUpdate.value = false
  error.value = ''
  await nextTick()
  marketAddRef.value?.focus({ preventScroll: true })
}
function switchLabel(item: InstalledPlugin): string {
  return (item.enabled ? t.value.workspace.plugins.disableLabel : t.value.workspace.plugins.enableLabel).replace('{name}', item.plugin.name)
}
function needsConfig(item: InstalledPlugin): boolean {
  return item.config.some((field) => field.required && !field.isSet)
}
function hasUpdate(item: InstalledPlugin): boolean {
  return item.installedVersion !== item.plugin.version
}
async function toggle(item: InstalledPlugin, enabled: boolean): Promise<void> {
  await mutate(() => setPluginEnabled('agent', props.agentId, item.plugin.marketplaceId, item.plugin.id, enabled), (updated) => {
    replaceInstalled(updated)
    announce(enabled ? t.value.workspace.plugins.enabledAnnounce : t.value.workspace.plugins.disabledAnnounce, item.plugin.name)
  })
}
async function install(plugin: Plugin): Promise<void> {
  await mutate(() => installPlugin('agent', props.agentId, plugin.marketplaceId, plugin.id), (item) => {
    replaceInstalled(item)
    announce(t.value.workspace.plugins.installedAnnounce, item.plugin.name)
  })
}
async function setUninstallConfirmation(isConfirming: boolean): Promise<void> {
  isConfirmingUninstall.value = isConfirming
  await nextTick()
  rootRef.value?.querySelector<HTMLElement>(isConfirming ? '.plugin-danger-zone .plugin-confirm .plugin-action' : '.plugin-danger-zone > .plugin-action')?.focus({ preventScroll: true })
}
async function uninstall(): Promise<void> {
  const item = selected.value
  if (item === undefined) return
  await mutate(() => uninstallPlugin('agent', props.agentId, item.plugin.marketplaceId, item.plugin.id), async () => {
    installed.value = installed.value.filter((entry) => pluginKey(entry.plugin) !== pluginKey(item.plugin))
    announce(t.value.workspace.plugins.uninstalledAnnounce, item.plugin.name)
    await navigate('list')
  })
}
async function updatePlugin(): Promise<void> {
  const item = selected.value
  if (item === undefined) return
  await mutate(() => updateInstalledPlugin('agent', props.agentId, item.plugin.marketplaceId, item.plugin.id), (updated) => {
    replaceInstalled(updated)
    announce(t.value.workspace.plugins.updatedPlugin.replace('{version}', updated.installedVersion), updated.plugin.name)
  })
}
async function saveConfig(): Promise<void> {
  const item = selected.value
  if (item === undefined || busy.value) return
  const values: PluginConfigValue[] = []
  for (const field of item.config) {
    const value = configDrafts.value[field.key] ?? ''
    if (field.type !== 'boolean' && field.required && value.trim() === '' && !(field.type === 'secret' && field.isSet)) {
      error.value = t.value.workspace.plugins.configRequired
      return
    }
    // 密钥不回显;留空不传,由 API 保持原值。
    if (field.type === 'secret' && value === '') continue
    values.push({ key: field.key, value: field.type === 'boolean' ? String(value === 'true') : value })
  }
  await mutate(() => savePluginConfig('agent', props.agentId, item.plugin.marketplaceId, item.plugin.id, values), (updated) => {
    replaceInstalled(updated)
    resetConfigDrafts()
    announce(t.value.workspace.plugins.configureSaved, updated.plugin.name)
  })
}
async function refreshInstalled(): Promise<void> {
  const result = await listInstalledPlugins('agent', props.agentId)
  if (!isAlive.value) return
  if (!result.ok) { error.value = result.error.message; return }
  installed.value = result.value
}
async function setAutoUpdate(binding: MarketplaceBinding, enabled: boolean): Promise<void> {
  await mutate(() => setMarketplaceAutoUpdate('agent', props.agentId, binding.marketplace.id, enabled), async (updated) => {
    replaceBinding(updated)
    if (enabled) await refreshInstalled()
    announce(enabled ? t.value.workspace.plugins.autoUpdateOn : t.value.workspace.plugins.autoUpdateOff, binding.marketplace.name)
  })
}
async function updateMarket(binding: MarketplaceBinding): Promise<void> {
  await mutate(() => updateMarketplace('agent', props.agentId, binding.marketplace.id), async (updated) => {
    replaceBinding(updated)
    await refreshInstalled()
    announce(t.value.workspace.plugins.updatedMarketplace, binding.marketplace.name)
  })
}
function removeBody(binding: MarketplaceBinding): string {
  return t.value.workspace.plugins.removeBodyAgent.replace('{name}', props.agentName)
    .replace('{count}', String(installed.value.filter((item) => item.plugin.marketplaceId === binding.marketplace.id).length))
}
async function removeMarket(binding: MarketplaceBinding): Promise<void> {
  await mutate(() => removeMarketplace('agent', props.agentId, binding.marketplace.id), async () => {
    bindings.value = bindings.value.filter((item) => item.marketplace.id !== binding.marketplace.id)
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
  await mutate(() => addMarketplace('agent', props.agentId, { name: addName.value.trim(), source: addSource.value.trim(), autoUpdate: addAutoUpdate.value }), (binding) => {
    replaceBinding(binding)
    addName.value = ''
    addSource.value = ''
    addAutoUpdate.value = false
    isAddingMarket.value = false
    announce(t.value.workspace.plugins.addedMarketplace, binding.marketplace.name)
  })
  if (!isAddingMarket.value) {
    await nextTick()
    marketAddRef.value?.focus({ preventScroll: true })
  }
}
watch([status, () => installed.value.length], () => emit('count', status.value === 'ready' ? installed.value.length : undefined), { immediate: true })
watch(() => props.agentId, () => {
  view.value = 'list'
  installed.value = []
  bindings.value = []
  selectedPluginKey.value = ''
  configDrafts.value = {}
  isPluginsExpanded.value = true
  isMarketsExpanded.value = true
  isAddingMarket.value = false
  isConfirmingUninstall.value = false
  removeMarketId.value = ''
  listFocusKey.value = ''
  returnFocus.value = null
  addName.value = ''
  addSource.value = ''
  addAutoUpdate.value = false
  void load()
}, { immediate: true })
onBeforeUnmount(() => { isAlive.value = false })
</script>

<template>
  <section ref="rootRef" class="agent-plugins" :data-view="view" :aria-busy="busy || status === 'loading'" @keydown.esc="onEscape">
    <div v-if="status === 'loading'" class="plugin-state" :aria-label="t.workspace.plugins.loading"><NSkeleton text :repeat="4" :animated="false" /></div>
    <div v-else-if="status === 'error'" class="plugin-state">
      <p>{{ t.workspace.plugins.error }}</p><p v-if="error" class="plugin-error" role="alert">{{ error }}</p>
      <button type="button" class="plugin-action" @click="load">{{ t.workspace.plugins.retry }}</button>
    </div>
    <template v-else>
      <p v-if="error" class="plugin-error" role="alert">{{ error }}</p>
      <!-- 安装时只隐藏分组,保留折叠状态、详情草稿和市场添加表单。 -->
      <div v-show="view !== 'install'" class="plugin-groups">
        <section class="plugin-group" data-group="plugins">
          <div class="plugin-group-head">
            <button type="button" class="plugin-disclosure" :disabled="busy" :aria-expanded="isPluginsExpanded" :aria-controls="`${sectionPrefix}-installed`" @click="isPluginsExpanded = !isPluginsExpanded">
              <DliIcon class="group-chevron" :class="{ 'is-expanded': isPluginsExpanded }" name="chevronRight" size="sm" /><span>{{ t.workspace.plugins.pluginsTitle }}</span><span class="plugin-count">{{ installed.length }}</span>
            </button>
            <button type="button" class="plugin-add" :disabled="busy" :aria-label="t.workspace.plugins.installPlugin" :title="t.workspace.plugins.installPlugin" @click="openInstall"><span aria-hidden="true">＋</span></button>
          </div>
          <div :id="`${sectionPrefix}-installed`" v-show="isPluginsExpanded" class="plugin-group-content">
            <div v-if="view === 'list'" class="plugin-list">
              <div v-if="installed.length === 0" class="plugin-state"><p>{{ t.workspace.plugins.empty }}</p><button type="button" class="plugin-action" :disabled="busy" @click="openInstall">{{ t.workspace.plugins.installPlugin }}</button></div>
              <ul v-else>
                <li v-for="item in installed" :key="pluginKey(item.plugin)" class="compact-plugin" :data-enabled="item.enabled">
                  <button type="button" class="plugin-main" :data-plugin-key="pluginKey(item.plugin)" :disabled="busy" @click="openDetail(item)">
                    <span class="plugin-title"><span class="plugin-name">{{ item.plugin.name }}</span><span class="plugin-mono">v{{ item.installedVersion }}</span></span>
                    <span class="plugin-source">{{ item.marketplaceName }}</span>
                    <span v-if="hasUpdate(item) || needsConfig(item)" class="plugin-badges"><span v-if="hasUpdate(item)" class="plugin-badge">{{ t.workspace.plugins.update }}</span><span v-if="needsConfig(item)" class="plugin-badge plugin-badge--warning">{{ t.workspace.plugins.configureRequired }}</span></span>
                    <DliIcon class="plugin-chevron" name="chevronRight" size="sm" />
                  </button>
                  <!-- 开关与整行详情按钮是兄弟,不产生嵌套交互元素。 -->
                  <NSwitch class="plugin-switch" size="small" :value="item.enabled" :disabled="busy" :aria-label="switchLabel(item)" @update:value="(value: boolean) => toggle(item, value)" />
                </li>
              </ul>
            </div>
            <div v-else-if="view === 'detail' && selected" class="plugin-pane plugin-detail">
              <div class="plugin-subhead"><button type="button" class="plugin-back" :disabled="busy" :aria-label="t.workspace.plugins.backToPlugins" :title="t.workspace.plugins.backToPlugins" @click="back"><DliIcon name="chevronLeft" size="sm" /></button><h3>{{ selected.plugin.name }}</h3></div>
              <p class="plugin-meta"><span class="plugin-mono">v{{ selected.installedVersion }}</span><span aria-hidden="true">·</span><span>{{ selected.marketplaceName }}</span><span aria-hidden="true">·</span><span>{{ agentName }}</span></p>
              <p class="plugin-description">{{ selected.plugin.description }}</p>
              <button v-if="hasUpdate(selected)" type="button" class="plugin-action" :disabled="busy" @click="updatePlugin">{{ busy ? t.workspace.plugins.updating : t.workspace.plugins.updateAvailable.replace('{version}', selected.plugin.version) }}</button>
              <form v-if="selected.config.length > 0" class="plugin-config" @submit.prevent="saveConfig">
                <h4 class="plugin-section-label">{{ t.workspace.plugins.configure }}</h4>
                <p class="plugin-description">{{ t.workspace.plugins.configureHintAgent }}</p>
                <div v-for="field in selected.config" :key="field.key" class="plugin-field" :data-type="field.type">
                  <label :id="`${formPrefix}-${field.key}-label`" :for="`${formPrefix}-${field.key}`">{{ field.label }} <span v-if="field.required" class="plugin-required">{{ t.workspace.plugins.required }}</span></label>
                  <p :id="`${formPrefix}-${field.key}-desc`">{{ field.description }}</p>
                  <NSwitch v-if="field.type === 'boolean'" :id="`${formPrefix}-${field.key}`" class="plugin-switch" :value="configDrafts[field.key] === 'true'" :disabled="busy" :aria-labelledby="`${formPrefix}-${field.key}-label`" :aria-describedby="`${formPrefix}-${field.key}-desc`" @update:value="(value: boolean) => configDrafts[field.key] = String(value)" />
                  <NInput v-else :value="configDrafts[field.key] ?? ''" @update:value="(value: string) => configDrafts[field.key] = value" :type="field.type === 'secret' ? 'password' : 'text'" :disabled="busy" :placeholder="field.type === 'secret' ? (field.isSet ? t.workspace.plugins.secretSetPlaceholder : t.workspace.plugins.secretPlaceholder) : ''" :input-props="{ id: `${formPrefix}-${field.key}`, 'aria-describedby': `${formPrefix}-${field.key}-desc`, 'aria-required': field.required, autocomplete: 'off', spellcheck: false }" />
                </div>
                <button type="submit" class="plugin-action" :disabled="busy">{{ busy ? t.workspace.plugins.saving : t.workspace.plugins.saveConfig }}</button>
              </form>
              <div class="plugin-danger-zone">
                <h4 class="plugin-section-label">{{ t.workspace.plugins.dangerZone }}</h4>
                <button v-if="!isConfirmingUninstall" type="button" class="plugin-action plugin-danger" :disabled="busy" @click="setUninstallConfirmation(true)">{{ t.workspace.plugins.uninstall }}</button>
                <div v-else class="plugin-confirm"><p>{{ t.workspace.plugins.uninstallConfirm.replace('{name}', selected.plugin.name) }}</p><div class="plugin-actions"><button type="button" class="plugin-action" :disabled="busy" @click="setUninstallConfirmation(false)">{{ t.workspace.plugins.cancel }}</button><button type="button" class="plugin-action plugin-danger" :disabled="busy" @click="uninstall">{{ t.workspace.plugins.confirmUninstall }}</button></div></div>
              </div>
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
            <form v-if="isAddingMarket" class="plugin-pane add-market" @submit.prevent="addMarket">
              <h4 class="plugin-section-label">{{ t.workspace.plugins.addMarketplaceTitle }}</h4>
              <div class="plugin-field"><label :for="`${sectionPrefix}-market-name`">{{ t.workspace.plugins.name }}</label><NInput v-model:value="addName" :disabled="busy" :placeholder="t.workspace.plugins.namePlaceholder" :input-props="{ id: `${sectionPrefix}-market-name` }" /></div>
              <div class="plugin-field"><label :for="`${sectionPrefix}-market-source`">{{ t.workspace.plugins.source }}</label><NInput v-model:value="addSource" :disabled="busy" :placeholder="t.workspace.plugins.sourcePlaceholder" :input-props="{ id: `${sectionPrefix}-market-source`, spellcheck: false }" /></div>
              <div class="market-auto"><span>{{ t.workspace.plugins.marketplaceAutoUpdate }}</span><NSwitch v-model:value="addAutoUpdate" class="plugin-switch" size="small" :disabled="busy" :aria-label="t.workspace.plugins.marketplaceAutoUpdate" /></div>
              <div class="plugin-actions"><button type="submit" class="plugin-action" :disabled="busy">{{ busy ? t.workspace.plugins.adding : t.workspace.plugins.add }}</button><button type="button" class="plugin-action" :disabled="busy" @click="closeAddMarket">{{ t.workspace.plugins.cancel }}</button></div>
            </form>
            <div v-if="bindings.length === 0" class="plugin-state"><p>{{ t.workspace.plugins.installNoMarketplaces }}</p><button type="button" class="plugin-action" :disabled="busy" @click="openAddMarket">{{ t.workspace.plugins.addMarketplace }}</button></div>
            <ul v-else class="market-list"><li v-for="binding in bindings" :key="binding.marketplace.id" class="market-row" :data-marketplace="binding.marketplace.id">
              <p class="plugin-title"><span class="plugin-name">{{ binding.marketplace.name }}</span><span class="market-trust">{{ t.workspace.plugins.trustLabel[binding.marketplace.trust] }}</span></p>
              <p class="market-source plugin-mono">{{ binding.marketplace.source }}</p>
              <div class="market-controls">
                <div class="market-auto"><span>{{ t.workspace.plugins.autoUpdate }}</span><NSwitch class="plugin-switch" size="small" :value="binding.autoUpdate" :disabled="busy" :aria-label="t.workspace.plugins.autoUpdateLabel.replace('{name}', binding.marketplace.name)" @update:value="(value: boolean) => setAutoUpdate(binding, value)" /></div>
                <div class="plugin-actions"><button type="button" class="plugin-action" :disabled="busy" :aria-label="t.workspace.plugins.updateLabel.replace('{name}', binding.marketplace.name)" @click="updateMarket(binding)">{{ t.workspace.plugins.update }}</button><button type="button" class="plugin-action plugin-danger" :disabled="busy" :aria-label="t.workspace.plugins.removeMarketplace" @click="removeMarketId = binding.marketplace.id">{{ t.workspace.plugins.remove }}</button></div>
              </div>
              <div v-if="removeMarketId === binding.marketplace.id" class="plugin-confirm"><p>{{ removeBody(binding) }}</p><div class="plugin-actions"><button type="button" class="plugin-action" :disabled="busy" @click="removeMarketId = ''">{{ t.workspace.plugins.removeCancel }}</button><button type="button" class="plugin-action plugin-danger" :disabled="busy" @click="removeMarket(binding)">{{ t.workspace.plugins.removeConfirm }}</button></div></div>
            </li></ul>
          </div>
        </section>
      </div>
      <div v-if="view === 'install'" class="plugin-pane plugin-install">
        <div class="plugin-subhead"><button type="button" class="plugin-back" :disabled="busy" :aria-label="t.workspace.plugins.backToPlugins" :title="t.workspace.plugins.backToPlugins" @click="back"><DliIcon name="chevronLeft" size="sm" /></button><h3>{{ t.workspace.plugins.installTitle }}</h3></div>
        <p class="plugin-description">{{ t.workspace.plugins.installHintAgent.replace('{name}', agentName) }}</p>
        <NInput v-model:value="query" :placeholder="t.workspace.plugins.installSearch" :input-props="{ 'aria-label': t.workspace.plugins.installSearch, type: 'search' }" />
        <div v-if="bindings.length === 0" class="plugin-state"><p>{{ t.workspace.plugins.installNoMarketplaces }}</p><button type="button" class="plugin-action" :disabled="busy" @click="openAddMarket">{{ t.workspace.plugins.addMarketplace }}</button></div>
        <p v-else-if="available.length === 0" class="plugin-empty">{{ t.workspace.plugins.installEmpty }}</p>
        <p v-else-if="filtered.length === 0" class="plugin-empty">{{ t.workspace.plugins.installNoMatch }}</p>
        <ul v-else class="install-list"><li v-for="entry in filtered" :key="pluginKey(entry.plugin)" class="install-row">
          <p class="plugin-title"><span class="plugin-name">{{ entry.plugin.name }}</span><span class="plugin-mono">v{{ entry.plugin.version }}</span></p><p class="plugin-source">{{ entry.market }}</p><p class="plugin-description dl-clamp-2">{{ entry.plugin.description }}</p>
          <button type="button" class="plugin-action" :disabled="busy" :aria-label="t.workspace.plugins.installLabel.replace('{name}', entry.plugin.name)" @click="install(entry.plugin)">{{ busy ? t.workspace.plugins.installing : t.workspace.plugins.install }}</button>
        </li></ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.agent-plugins { min-inline-size: 0; padding: var(--dl-space-1); color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-groups { display: grid; gap: var(--dl-space-3); }
.plugin-group, .plugin-group-content, .plugin-list, .plugin-pane, .plugin-state, .plugin-config, .plugin-danger-zone { min-inline-size: 0; }
.plugin-pane, .plugin-state, .plugin-config { display: grid; gap: var(--dl-space-2); }
.plugin-group-head { display: flex; align-items: stretch; border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.plugin-disclosure { flex: 1; display: flex; align-items: center; gap: var(--dl-space-1); min-inline-size: 0; min-block-size: var(--workspace-nav-control-size); font-size: var(--dl-font-size-xs); font-weight: 500; color: var(--dl-text-secondary); text-align: left; border-radius: var(--dl-radius-sm); }
.group-chevron { flex: none; transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.group-chevron.is-expanded { transform: rotate(90deg); }
.plugin-count { font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; color: var(--dl-text-tertiary); font-weight: 400; margin-inline-start: var(--dl-space-1); }
.plugin-add { flex: none; display: inline-grid; place-items: center; inline-size: var(--workspace-nav-control-size); min-block-size: var(--workspace-nav-control-size); color: var(--dl-text-secondary); border-radius: var(--dl-radius-sm); }
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
.plugin-detail, .plugin-install { padding: var(--dl-space-2) var(--dl-space-1); }
.plugin-subhead { display: flex; align-items: center; gap: var(--dl-space-1); }
.plugin-subhead h3 { min-inline-size: 0; font-size: var(--dl-font-size-md); font-weight: 500; overflow-wrap: anywhere; }
.plugin-back { flex: none; display: inline-grid; place-items: center; inline-size: var(--workspace-tree-row-height); min-block-size: var(--workspace-tree-row-height); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); }
.plugin-meta { display: flex; flex-wrap: wrap; gap: var(--dl-space-1); color: var(--dl-text-tertiary); overflow-wrap: anywhere; }
.plugin-description { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); overflow-wrap: anywhere; }
.plugin-section-label { font-size: var(--dl-font-size-xs); font-weight: 500; color: var(--dl-text-secondary); }
.plugin-config, .plugin-danger-zone { border-block-start: var(--dl-border-width) solid var(--dl-border-base); padding-block-start: var(--dl-space-2); }
.plugin-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); }
.plugin-action { justify-self: start; display: inline-flex; align-items: center; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-2); color: var(--dl-accent); border-radius: var(--dl-radius-sm); text-align: left; }
.plugin-danger, .plugin-error { color: var(--dl-error); }
.plugin-error { margin-block: var(--dl-space-2); overflow-wrap: anywhere; }
.plugin-confirm { display: grid; gap: var(--dl-space-1); padding-block: var(--dl-space-2); color: var(--dl-text-secondary); overflow-wrap: anywhere; }
.plugin-field { display: grid; gap: var(--dl-space-1); min-inline-size: 0; }
.plugin-field label { font-size: var(--dl-font-size-xs); font-weight: 500; }
.plugin-field p { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.plugin-field :deep(.n-input) { min-inline-size: 0; }
.plugin-pane :deep(.n-input__input-el) { min-block-size: var(--dl-target-size); }
.install-row, .market-row { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-2) var(--dl-space-1); min-inline-size: 0; }
.install-row + .install-row, .market-row + .market-row { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.market-trust { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); margin-inline-start: auto; }
.market-source { overflow-wrap: anywhere; }
.market-controls { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-1); flex-wrap: wrap; }
.market-auto { display: flex; align-items: center; gap: var(--dl-space-1); color: var(--dl-text-secondary); }
.market-controls .plugin-action { min-block-size: var(--workspace-nav-control-size); padding-inline: var(--dl-space-1); }
.add-market { padding: var(--dl-space-2) var(--dl-space-1); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.agent-plugins button:hover:not(:disabled) { background: var(--dl-bg-hover); }
.agent-plugins button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.agent-plugins button:active:not(:disabled) { background: var(--dl-bg-sunken); }
.agent-plugins button:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
@media (max-width: 1023px) {
  .plugin-add, .plugin-back, .plugin-action { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .plugin-disclosure, .market-controls .plugin-action { min-block-size: var(--dl-target-size); }
  .plugin-switch { min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); }
  .plugin-main { min-block-size: calc(var(--dl-target-size) + var(--dl-space-4)); padding-inline-end: calc(var(--dl-target-size) + var(--dl-space-6)); }
}
</style>
