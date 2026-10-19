<script setup lang="ts">
// 插件管理(单个作用域):按**所属市场**分组展示插件。
//
// 市场是父、插件是子:每张市场卡片头部放来源、自动更新、更新、移除与「安装插件」,
// 卡片内只列该市场的已安装插件。这样「每个插件属于哪个市场」在结构上就成立,
// 而不是把插件与市场做成两个并列的设置页。
import { computed, nextTick, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { InstalledPlugin, PluginInstallScopeId } from '../contracts/generated/installed-plugin'
import type { Marketplace } from '../contracts/generated/marketplace'
import type { MarketplaceConfig } from '../contracts/generated/marketplace-config'
import type { MarketplaceBinding } from '../contracts/generated/marketplace-binding'
import type { Plugin } from '../contracts/generated/plugin'
import {
  addMarketplace,
  installPlugin,
  listInstalledPlugins,
  listMarketplaceBindings,
  removeMarketplace,
  savePluginConfig,
  setMarketplaceAutoUpdate,
  setPluginEnabled,
  uninstallPlugin,
  updateInstalledPlugin,
  updateMarketplace,
} from '../api/workspace'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import PluginRow from './plugin-row.vue'
import PluginSubpage from './plugin-subpage.vue'
import type { PluginCrumb } from './plugin-subpage.vue'
import RowActionsMenu from './row-actions-menu.vue'
import type { RowAction } from './row-actions-menu.vue'

const props = defineProps<{
  scope: PluginInstallScopeId
  // agent id 或项目路径。
  ownerId: string
  ownerName: string
}>()

const { t } = useI18n()
const bindings = ref<MarketplaceBinding[]>([])
const installed = ref<InstalledPlugin[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const announcement = ref('')
const busyKey = ref('')
const busyMarketplaceId = ref('')
const configTarget = ref<{ marketplaceId: string; pluginId: string } | null>(null)
const configBusy = ref(false)
const configError = ref('')
const addBusy = ref(false)
const addError = ref('')
const addSource = ref('')
const addName = ref('')
const addAutoUpdate = ref(false)
const addSourceRef = ref<HTMLInputElement | null>(null)
const removeId = ref('')
const removeBusy = ref(false)
const removeError = ref('')
const removeCancelRef = ref<HTMLButtonElement | null>(null)

// 插件页内部的层级:null = 市场列表,其余为子页面。子页面在同一面板内滑动切换。
type PluginSubpageKind = 'install' | 'config' | 'add' | 'remove'
const INSTALL_PAGE_SIZE = 6
const subpage = ref<PluginSubpageKind | null>(null)
const direction = ref<'forward' | 'back'>('forward')
const returnFocus = ref<HTMLElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
// 从面包屑回到列表时要聚焦的市场卡片。
const pendingFocusMarket = ref('')

// 安装子页:搜索与分批加载。
const installMarketplaceId = ref('')
const installQuery = ref('')
const installVisibleCount = ref(INSTALL_PAGE_SIZE)
const installSearchRef = ref<HTMLInputElement | null>(null)

// 配置子页。
const configDrafts = ref<Record<string, string>>({})
const configLocalError = ref('')
const configFormRef = ref<HTMLFormElement | null>(null)
let version = 0

const installedKeys = computed(() => installed.value.map((item) => `${item.plugin.id}@${item.plugin.marketplaceId}`))
const emptyHint = computed(() => (props.scope === 'agent'
  ? t.value.workspace.plugins.marketplaceManagerEmptyHintAgent
  : t.value.workspace.plugins.marketplaceManagerEmptyHintProject))
// 市场 → 其已安装插件。市场即使没有插件也保留卡片,因为来源与自动更新属于它本身。
const groups = computed(() => bindings.value.map((binding) => ({
  binding,
  installed: installed.value.filter((item) => item.plugin.marketplaceId === binding.marketplace.id),
})))
const installMarketplace = computed<Marketplace | undefined>(
  () => bindings.value.find((item) => item.marketplace.id === installMarketplaceId.value)?.marketplace,
)
const removeTarget = computed(() => bindings.value.find((item) => item.marketplace.id === removeId.value))
// 以本地安装清单为准:刚装 / 刚卸的插件会立刻反映到确认框,不依赖绑定对象里的旧计数。
const removeInstalledCount = computed(
  () => installed.value.filter((item) => item.plugin.marketplaceId === removeId.value).length,
)
const configInstalled = computed(() => {
  const target = configTarget.value
  if (target === null) return undefined
  return installed.value.find((item) => item.plugin.marketplaceId === target.marketplaceId && item.plugin.id === target.pluginId)
})
const marketMenu = computed<RowAction[]>(() => [
  { id: 'remove', label: t.value.workspace.plugins.removeMarketplace, tone: 'danger' },
])

// ---- 子页面(安装 / 配置 / 添加市场 / 移除市场) ----

const viewKey = computed(() => subpage.value ?? 'list')
const subpageTitle = computed(() => {
  switch (subpage.value) {
    case 'install': return t.value.workspace.plugins.installTitle
    case 'config': return t.value.workspace.plugins.configureTitle.replace('{name}', configInstalled.value?.plugin.name ?? '')
    case 'add': return t.value.workspace.plugins.addMarketplaceTitle
    case 'remove': return t.value.workspace.plugins.removeTitle.replace('{name}', removeTarget.value?.marketplace.name ?? '')
    default: return ''
  }
})
const subpageHint = computed(() => {
  switch (subpage.value) {
    case 'install':
      return (props.scope === 'agent'
        ? t.value.workspace.plugins.installHintAgent
        : t.value.workspace.plugins.installHintProject).replace('{name}', props.ownerName)
    case 'config':
      return (props.scope === 'agent'
        ? t.value.workspace.plugins.configureHintAgent
        : t.value.workspace.plugins.configureHintProject).replace('{name}', props.ownerName)
    case 'add':
      return (props.scope === 'agent'
        ? t.value.workspace.plugins.addMarketplaceHintAgent
        : t.value.workspace.plugins.addMarketplaceHintProject).replace('{name}', props.ownerName)
    default: return ''
  }
})
// 面包屑只列祖先;当前页由标题承担,避免重复。
const subpageCrumbs = computed<PluginCrumb[]>(() => {
  if (subpage.value === null) return []
  const root: PluginCrumb = { key: 'root', label: t.value.workspace.plugins.pluginsTitle }
  if (subpage.value === 'add') return [root]
  const marketId = subpage.value === 'install'
    ? installMarketplaceId.value
    : subpage.value === 'config' ? configTarget.value?.marketplaceId ?? '' : removeId.value
  const marketName = bindings.value.find((item) => item.marketplace.id === marketId)?.marketplace.name ?? ''
  const marketCrumb: PluginCrumb = { key: `market:${marketId}`, label: marketName }
  if (subpage.value !== 'config') return [root, marketCrumb]
  const plugin = configInstalled.value?.plugin
  return [root, marketCrumb, { key: `plugin:${plugin?.id ?? ''}`, label: plugin?.name ?? '' }]
})

const installFromLabel = computed(() => t.value.workspace.plugins.installFrom
  .replace('{name}', installMarketplace.value?.name ?? ''))
const installInstalledSet = computed(() => new Set(installedKeys.value))
const installAvailable = computed<Plugin[]>(() => installMarketplace.value?.plugins
  .filter((plugin) => !installInstalledSet.value.has(`${plugin.id}@${installMarketplace.value?.id ?? ''}`)) ?? [])
const installNeedle = computed(() => installQuery.value.trim().toLowerCase())
const installFiltered = computed(() => {
  if (installNeedle.value === '') return installAvailable.value
  return installAvailable.value.filter((plugin) => [plugin.name, plugin.description, plugin.publisher, plugin.id]
    .some((field) => field.toLowerCase().includes(installNeedle.value)))
})
const installVisible = computed(() => installFiltered.value.slice(0, installVisibleCount.value))
const installRemaining = computed(() => Math.max(0, installFiltered.value.length - installVisibleCount.value))

const configFields = computed(() => configInstalled.value?.config ?? [])
const configErrorText = computed(() => (configLocalError.value !== '' ? configLocalError.value : configError.value))
const configScopeLabel = computed(() => (configInstalled.value === undefined
  ? ''
  : t.value.workspace.plugins.scopeLabel[configInstalled.value.scope]))
const canAddMarket = computed(() => addSource.value.trim() !== '' && addName.value.trim() !== '' && !addBusy.value)
const removeBody = computed(() => {
  const template = props.scope === 'agent'
    ? t.value.workspace.plugins.removeBodyAgent
    : t.value.workspace.plugins.removeBodyProject
  return template.replace('{name}', props.ownerName).replace('{count}', String(removeInstalledCount.value))
})

async function load(): Promise<void> {
  version += 1
  const current = version
  status.value = 'loading'
  error.value = ''
  const [marketResult, pluginResult] = await Promise.all([
    listMarketplaceBindings(props.scope, props.ownerId),
    listInstalledPlugins(props.scope, props.ownerId),
  ])
  if (current !== version) return
  if (!marketResult.ok || !pluginResult.ok) {
    status.value = 'error'
    return
  }
  bindings.value = marketResult.value
  installed.value = sortInstalled(pluginResult.value)
  status.value = 'ready'
}

// 市场更新 / 打开自动更新会改变当前作用域的已装版本;只刷新安装清单,不整页闪骨架。
async function refreshInstalled(): Promise<void> {
  const current = version
  const result = await listInstalledPlugins(props.scope, props.ownerId)
  if (current !== version || !result.ok) return
  installed.value = sortInstalled(result.value)
}

function sortInstalled(items: InstalledPlugin[]): InstalledPlugin[] {
  return [...items].sort((a, b) => a.plugin.name.localeCompare(b.plugin.name))
}

function replaceInstalled(updated: InstalledPlugin): void {
  installed.value = installed.value.map((item) => (
    item.plugin.id === updated.plugin.id && item.plugin.marketplaceId === updated.plugin.marketplaceId ? updated : item
  ))
}

function replaceBinding(updated: MarketplaceBinding): void {
  bindings.value = bindings.value.map((item) => (item.marketplace.id === updated.marketplace.id ? updated : item))
}

function isPluginBusy(): boolean {
  return busyKey.value !== '' || configBusy.value
}

function isMarketBusy(): boolean {
  return busyMarketplaceId.value !== '' || addBusy.value || removeBusy.value
}

// ---- 已安装插件 ----

async function onInstall(marketplaceId: string, pluginId: string): Promise<void> {
  if (isPluginBusy()) return
  busyKey.value = `${pluginId}@${marketplaceId}`
  error.value = ''
  const result = await installPlugin(props.scope, props.ownerId, marketplaceId, pluginId)
  busyKey.value = ''
  if (!result.ok) {
    error.value = result.error.message
    return
  }
  installed.value = sortInstalled([...installed.value, result.value])
  announcement.value = t.value.workspace.plugins.installedAnnounce.replace('{name}', result.value.plugin.name)
}

async function onUninstall(marketplaceId: string, pluginId: string): Promise<void> {
  if (isPluginBusy()) return
  const target = installed.value.find((item) => item.plugin.marketplaceId === marketplaceId && item.plugin.id === pluginId)
  busyKey.value = `${pluginId}@${marketplaceId}`
  error.value = ''
  const result = await uninstallPlugin(props.scope, props.ownerId, marketplaceId, pluginId)
  busyKey.value = ''
  if (!result.ok) {
    error.value = result.error.message
    return
  }
  installed.value = installed.value.filter((item) => !(item.plugin.marketplaceId === marketplaceId && item.plugin.id === pluginId))
  announcement.value = t.value.workspace.plugins.uninstalledAnnounce.replace('{name}', target?.plugin.name ?? pluginId)
}

async function onUpdate(marketplaceId: string, pluginId: string): Promise<void> {
  if (isPluginBusy()) return
  busyKey.value = `${pluginId}@${marketplaceId}`
  error.value = ''
  const result = await updateInstalledPlugin(props.scope, props.ownerId, marketplaceId, pluginId)
  busyKey.value = ''
  if (!result.ok) {
    error.value = result.error.message
    return
  }
  replaceInstalled(result.value)
  announcement.value = t.value.workspace.plugins.updatedPlugin
    .replace('{name}', result.value.plugin.name)
    .replace('{version}', result.value.installedVersion)
}

async function onToggle(marketplaceId: string, pluginId: string, enabled: boolean): Promise<void> {
  if (isPluginBusy()) return
  const target = installed.value.find((item) => item.plugin.marketplaceId === marketplaceId && item.plugin.id === pluginId)
  busyKey.value = `${pluginId}@${marketplaceId}`
  error.value = ''
  const result = await setPluginEnabled(props.scope, props.ownerId, marketplaceId, pluginId, enabled)
  busyKey.value = ''
  if (!result.ok) {
    error.value = result.error.message
    return
  }
  replaceInstalled(result.value)
  const template = enabled ? t.value.workspace.plugins.enabledAnnounce : t.value.workspace.plugins.disabledAnnounce
  announcement.value = template.replace('{name}', target?.plugin.name ?? pluginId)
}

function openConfig(marketplaceId: string, pluginId: string): void {
  configError.value = ''
  configLocalError.value = ''
  configTarget.value = { marketplaceId, pluginId }
  resetConfigDrafts()
  void openSubpage('config', 'input')
}

async function onSaveConfig(values: readonly PluginConfigValue[]): Promise<void> {
  const target = configTarget.value
  if (target === null || configBusy.value) return
  configBusy.value = true
  configError.value = ''
  const result = await savePluginConfig(props.scope, props.ownerId, target.marketplaceId, target.pluginId, values)
  configBusy.value = false
  if (!result.ok) {
    configError.value = result.error.message
    return
  }
  replaceInstalled(result.value)
  announcement.value = t.value.workspace.plugins.configureSaved.replace('{name}', result.value.plugin.name)
  void closeSubpage()
}

function resetConfigDrafts(): void {
  const next: Record<string, string> = {}
  for (const field of configFields.value) {
    // 密钥一律从空开始:真实值不回显,留空即保持。
    next[field.key] = field.type === 'secret' ? '' : field.value
  }
  configDrafts.value = next
  configLocalError.value = ''
}

function secretPlaceholder(isSet: boolean): string {
  return isSet ? t.value.workspace.plugins.secretSetPlaceholder : t.value.workspace.plugins.secretPlaceholder
}

function toggleLabel(value: string | undefined): string {
  return value === 'true' ? t.value.workspace.plugins.enabled : t.value.workspace.plugins.disabled
}

function submitConfig(): void {
  const target = configTarget.value
  if (target === null || configBusy.value) return
  const values: PluginConfigValue[] = []
  let invalid = false
  for (const field of configFields.value) {
    const raw = configDrafts.value[field.key] ?? ''
    if (field.type === 'boolean') {
      values.push({ key: field.key, value: raw === 'true' ? 'true' : 'false' })
      continue
    }
    if (field.type === 'secret') {
      // 空 secret = 保持已保存值;从未保存过且必填才算缺失。
      if (raw !== '') values.push({ key: field.key, value: raw })
      else if (field.required && !field.isSet) invalid = true
      continue
    }
    if (field.required && raw.trim() === '') invalid = true
    values.push({ key: field.key, value: raw })
  }
  if (invalid) {
    configLocalError.value = t.value.workspace.plugins.configRequired
    return
  }
  void onSaveConfig(values)
}

// ---- 市场(父级) ----

function openInstall(marketplaceId: string): void {
  installMarketplaceId.value = marketplaceId
  installQuery.value = ''
  installVisibleCount.value = INSTALL_PAGE_SIZE
  void openSubpage('install', 'search')
}

async function onAutoUpdate(marketplaceId: string, autoUpdate: boolean): Promise<void> {
  if (isMarketBusy()) return
  busyMarketplaceId.value = marketplaceId
  error.value = ''
  const result = await setMarketplaceAutoUpdate(props.scope, props.ownerId, marketplaceId, autoUpdate)
  if (!result.ok) {
    busyMarketplaceId.value = ''
    error.value = result.error.message
    return
  }
  replaceBinding(result.value)
  if (result.value.autoUpdate) await refreshInstalled()
  busyMarketplaceId.value = ''
  const template = autoUpdate ? t.value.workspace.plugins.autoUpdateOn : t.value.workspace.plugins.autoUpdateOff
  announcement.value = template.replace('{name}', result.value.marketplace.name)
}

async function onUpdateMarket(marketplaceId: string): Promise<void> {
  if (isMarketBusy()) return
  const name = bindings.value.find((item) => item.marketplace.id === marketplaceId)?.marketplace.name ?? ''
  busyMarketplaceId.value = marketplaceId
  error.value = ''
  const result = await updateMarketplace(props.scope, props.ownerId, marketplaceId)
  if (!result.ok) {
    busyMarketplaceId.value = ''
    error.value = result.error.message
    return
  }
  replaceBinding(result.value)
  await refreshInstalled()
  busyMarketplaceId.value = ''
  announcement.value = t.value.workspace.plugins.updatedMarketplace.replace('{name}', name)
}

function autoUpdateLabel(marketplaceName: string, enabled: boolean): string {
  const state = enabled
    ? t.value.workspace.plugins.autoUpdateStateOn
    : t.value.workspace.plugins.autoUpdateStateOff
  return `${t.value.workspace.plugins.autoUpdate}「${marketplaceName}」：${state}`
}

// ---- 子页面导航 ----

async function openSubpage(kind: PluginSubpageKind, focus: 'search' | 'input' | 'source' | 'cancel'): Promise<void> {
  returnFocus.value = document.activeElement instanceof HTMLElement ? document.activeElement : null
  direction.value = 'forward'
  subpage.value = kind
  await nextTick()
  const pane = rootRef.value?.parentElement
  if (pane !== null && pane !== undefined) pane.scrollTop = 0
  if (focus === 'search') installSearchRef.value?.focus()
  if (focus === 'source') addSourceRef.value?.focus()
  if (focus === 'cancel') removeCancelRef.value?.focus()
  if (focus === 'input') configFormRef.value?.querySelector<HTMLInputElement>('input')?.focus()
}

async function closeSubpage(): Promise<void> {
  if (subpage.value === null) return
  direction.value = 'back'
  const trigger = returnFocus.value
  subpage.value = null
  await nextTick()
  const pane = rootRef.value?.parentElement
  if (pane !== null && pane !== undefined) pane.scrollTop = 0
  const marketId = pendingFocusMarket.value
  pendingFocusMarket.value = ''
  if (marketId !== '') {
    const card = rootRef.value?.querySelector<HTMLElement>(`[data-marketplace="${CSS.escape(marketId)}"]`)
    card?.scrollIntoView({ block: 'nearest' })
    card?.querySelector<HTMLButtonElement>('.plugin-group__add')?.focus()
    return
  }
  if (trigger?.isConnected === true) trigger.focus()
  else rootRef.value?.querySelector<HTMLButtonElement>('.plugin-manager__add-market')?.focus()
}

function onEscape(event: KeyboardEvent): void {
  if (subpage.value === null) return
  event.preventDefault()
  event.stopPropagation()
  void closeSubpage()
}

function onCrumb(key: string): void {
  pendingFocusMarket.value = key.startsWith('market:') ? key.slice('market:'.length) : ''
  void closeSubpage()
}

function openAddMarket(): void {
  addError.value = ''
  addSource.value = ''
  addName.value = ''
  addAutoUpdate.value = false
  void openSubpage('add', 'source')
}

async function onAddMarket(config: MarketplaceConfig): Promise<void> {
  if (addBusy.value) return
  addBusy.value = true
  addError.value = ''
  const result = await addMarketplace(props.scope, props.ownerId, config)
  addBusy.value = false
  if (!result.ok) {
    addError.value = result.error.message
    return
  }
  bindings.value = [...bindings.value, result.value]
  announcement.value = t.value.workspace.plugins.addedMarketplace.replace('{name}', result.value.marketplace.name)
  void closeSubpage()
}

function submitAdd(): void {
  if (!canAddMarket.value) return
  void onAddMarket({
    name: addName.value.trim(),
    source: addSource.value.trim(),
    autoUpdate: addAutoUpdate.value,
  })
}

function openRemoveMarket(marketplaceId: string): void {
  removeError.value = ''
  removeId.value = marketplaceId
  void openSubpage('remove', 'cancel')
}

async function onRemoveMarket(): Promise<void> {
  const target = removeTarget.value
  if (target === undefined || removeBusy.value) return
  const targetId = target.marketplace.id
  removeBusy.value = true
  removeError.value = ''
  const result = await removeMarketplace(props.scope, props.ownerId, targetId)
  removeBusy.value = false
  if (!result.ok) {
    removeError.value = result.error.message
    return
  }
  bindings.value = bindings.value.filter((item) => item.marketplace.id !== targetId)
  installed.value = installed.value.filter((item) => item.plugin.marketplaceId !== targetId)
  announcement.value = t.value.workspace.plugins.removedMarketplace.replace('{name}', target.marketplace.name)
  void closeSubpage()
}

function onMarketMenu(marketplaceId: string, action: string): void {
  if (action === 'remove') openRemoveMarket(marketplaceId)
}

function pluginCountLabel(count: number): string {
  const template = count === 1
    ? t.value.workspace.plugins.marketplacePluginCountOne
    : t.value.workspace.plugins.marketplacePluginCount
  return template.replace('{count}', String(count))
}

function installedCountLabel(count: number): string {
  const template = count === 1
    ? t.value.workspace.plugins.marketplaceInstalledCountOne
    : t.value.workspace.plugins.marketplaceInstalledCount
  return template.replace('{count}', String(count))
}

function componentsLabel(plugin: Plugin): string {
  return plugin.components.map((component) => t.value.workspace.plugins.components[component]).join(' · ')
}

function installPluginBusy(plugin: Plugin): boolean {
  return busyKey.value === `${plugin.id}@${installMarketplace.value?.id ?? ''}`
}

function pluginBusy(item: InstalledPlugin): boolean {
  return busyKey.value === `${item.plugin.id}@${item.plugin.marketplaceId}`
}

watch([() => props.scope, () => props.ownerId], () => {
  subpage.value = null
  installMarketplaceId.value = ''
  removeId.value = ''
  configTarget.value = null
  void load()
}, { immediate: true })
</script>

<template>
  <section ref="rootRef" class="plugin-manager" @keydown.esc="onEscape">
    <p class="plugin-manager__live" aria-live="polite">{{ announcement }}</p>

    <!-- 列表与子页面共用同一块面板:前进从右滑入,返回反向滑出。 -->
    <Transition :name="`plugin-view-${direction}`" mode="out-in">
      <div :key="viewKey" class="plugin-manager__view">
        <template v-if="subpage === null">
          <div class="plugin-manager__head">
            <button type="button" class="plugin-manager__add-market" @click="openAddMarket">
              {{ t.workspace.plugins.addMarketplace }}
            </button>
          </div>

          <p v-if="error !== ''" class="plugin-manager__error" role="alert">{{ error }}</p>

          <div v-if="status === 'loading'" class="plugin-manager__loading" :aria-label="t.workspace.plugins.loading">
            <NSkeleton text :repeat="3" :animated="false" />
          </div>
          <div v-else-if="status === 'error'" class="plugin-manager__state">
            <p>{{ t.workspace.plugins.error }}</p>
            <button type="button" class="workspace-button" @click="load">{{ t.workspace.plugins.retry }}</button>
          </div>
          <div v-else-if="bindings.length === 0" class="plugin-manager__empty">
            <p class="plugin-manager__empty-title">{{ t.workspace.plugins.installNoMarketplaces }}</p>
            <p class="plugin-manager__empty-hint">{{ emptyHint }}</p>
          </div>
          <ul v-else class="plugin-groups">
            <li
              v-for="group in groups" :key="group.binding.marketplace.id"
              class="plugin-group" :data-marketplace="group.binding.marketplace.id"
            >
              <div class="plugin-group__head">
                <div class="plugin-group__title-row">
                  <span class="plugin-group__name" :title="group.binding.marketplace.name">{{ group.binding.marketplace.name }}</span>
                  <!-- 安装是这张卡片的主行动:紧挨 ⋯ 左侧。 -->
                  <button
                    type="button" class="plugin-group__add"
                    @click="openInstall(group.binding.marketplace.id)"
                  >{{ t.workspace.plugins.installPlugin }}</button>
                  <span class="plugin-group__menu">
                    <RowActionsMenu
                      :label="t.workspace.plugins.marketplaceMoreActions.replace('{name}', group.binding.marketplace.name)"
                      :items="marketMenu" @select="onMarketMenu(group.binding.marketplace.id, $event)"
                    />
                  </span>
                </div>
                <div class="plugin-group__source-row">
                  <p class="plugin-group__source" :title="group.binding.marketplace.source">{{ group.binding.marketplace.source }}</p>
                  <!-- 自动更新用点亮 / 熄灭的圆点表示状态,不再重复写「开 / 关」。 -->
                  <button
                    type="button" class="plugin-group__auto-toggle"
                    :aria-pressed="group.binding.autoUpdate"
                    :aria-label="autoUpdateLabel(group.binding.marketplace.name, group.binding.autoUpdate)"
                    :disabled="busyMarketplaceId === group.binding.marketplace.id"
                    @click="onAutoUpdate(group.binding.marketplace.id, !group.binding.autoUpdate)"
                  >
                    <span class="plugin-group__auto-dot" :data-on="group.binding.autoUpdate ? 'true' : 'false'" aria-hidden="true"></span>
                    <span>{{ t.workspace.plugins.autoUpdate }}</span>
                  </button>
                  <!-- 手动更新是市场源的一次性命令,始终可见。 -->
                  <button
                    type="button" class="plugin-group__update"
                    :title="t.workspace.plugins.updateLabel.replace('{name}', group.binding.marketplace.name)"
                    :aria-label="t.workspace.plugins.updateLabel.replace('{name}', group.binding.marketplace.name)"
                    :disabled="busyMarketplaceId === group.binding.marketplace.id"
                    @click="onUpdateMarket(group.binding.marketplace.id)"
                  >
                    <DliIcon name="sync" size="sm" />
                  </button>
                </div>
              </div>
              <!-- 计数压在分割线上,不单独占一行。 -->
              <div class="plugin-group__divider">
                <span class="plugin-group__counts">
                  {{ pluginCountLabel(group.binding.marketplace.plugins.length) }}
                  <span aria-hidden="true">·</span>
                  {{ installedCountLabel(group.installed.length) }}
                </span>
              </div>
              <ul v-if="group.installed.length > 0" class="plugin-manager__list plugin-group__list">
                <PluginRow
                  v-for="item in group.installed" :key="`${item.plugin.id}@${item.plugin.marketplaceId}`"
                  :installed="item" :busy="pluginBusy(item)" :show-marketplace="false"
                  @update="onUpdate" @configure="openConfig" @uninstall="onUninstall" @toggle="onToggle"
                />
              </ul>
              <p v-else class="plugin-group__empty">{{ t.workspace.plugins.marketplaceNoInstalledPlugins }}</p>
            </li>
          </ul>
        </template>

        <PluginSubpage
          v-else
          :title="subpageTitle" :hint="subpageHint" :crumbs="subpageCrumbs"
          :back-label="t.workspace.plugins.backToPlugins"
          :breadcrumb-label="t.workspace.plugins.breadcrumbLabel"
          @back="closeSubpage" @navigate="onCrumb"
        >
          <!-- 安装:从当前市场竞争挑选并安装 -->
          <div v-if="subpage === 'install'" class="pane">
            <p class="pane__meta">
              <span>{{ installFromLabel }}</span>
              <span class="pane__meta-sep" aria-hidden="true">·</span>
              <code class="pane__source">{{ installMarketplace?.source ?? '' }}</code>
            </p>

            <div class="pane__search">
              <DliIcon name="search" size="sm" />
              <input
                ref="installSearchRef" v-model="installQuery" type="search" class="pane__search-input"
                :aria-label="t.workspace.plugins.installSearch" :placeholder="t.workspace.plugins.installSearch"
                autocomplete="off"
              >
            </div>

            <p v-if="installMarketplace === undefined" class="pane__empty">{{ t.workspace.plugins.invalidMarketplace }}</p>
            <p v-else-if="installAvailable.length === 0" class="pane__empty">{{ t.workspace.plugins.installEmpty }}</p>
            <p v-else-if="installFiltered.length === 0" class="pane__empty">{{ t.workspace.plugins.installNoMatch }}</p>
            <template v-else>
              <ul class="pane__list">
                <li v-for="plugin in installVisible" :key="plugin.id" class="pane__item">
                  <div class="pane__item-body">
                    <p class="pane__item-title">
                      <span class="pane__item-name">{{ plugin.name }}</span>
                      <span class="pane__item-version">v{{ plugin.version }}</span>
                    </p>
                    <p class="pane__item-description">{{ plugin.description }}</p>
                    <p class="pane__item-meta">
                      {{ plugin.publisher }}<template v-if="plugin.components.length > 0"> · {{ componentsLabel(plugin) }}</template>
                    </p>
                  </div>
                  <button
                    type="button" class="pane__action"
                    :aria-label="t.workspace.plugins.installLabel.replace('{name}', plugin.name)"
                    :disabled="installPluginBusy(plugin)"
                    @click="onInstall(installMarketplaceId, plugin.id)"
                  >
                    {{ installPluginBusy(plugin) ? t.workspace.plugins.installing : t.workspace.plugins.install }}
                  </button>
                </li>
              </ul>
              <button v-if="installRemaining > 0" type="button" class="pane__more" @click="installVisibleCount += INSTALL_PAGE_SIZE">
                {{ t.workspace.plugins.loadMore }}（{{ t.workspace.plugins.loadMoreRemaining.replace('{count}', String(installRemaining)) }}）
              </button>
            </template>
            <p v-if="error !== ''" class="pane__error" role="alert">{{ error }}</p>
          </div>

          <!-- 配置:只属于这次安装所在的作用域 -->
          <form v-else-if="subpage === 'config'" ref="configFormRef" class="pane__form" @submit.prevent="submitConfig">
            <p v-if="configInstalled" class="pane__identity">
              <code>{{ configInstalled.plugin.id }}@{{ configInstalled.plugin.marketplaceId }}</code>
              <span class="pane__scope">{{ configScopeLabel }}</span>
            </p>

            <div v-for="field in configFields" :key="field.key" class="pane-field" :data-type="field.type">
              <div class="pane-field__label-row">
                <label class="pane-field__label" :for="`plugin-config-${field.key}`">{{ field.label }}</label>
                <span v-if="field.required" class="pane-field__required">{{ t.workspace.plugins.required }}</span>
              </div>
              <p :id="`plugin-config-${field.key}-desc`" class="pane-field__description">{{ field.description }}</p>

              <label v-if="field.type === 'boolean'" class="pane-field__check">
                <input
                  :id="`plugin-config-${field.key}`" v-model="configDrafts[field.key]" type="checkbox"
                  true-value="true" false-value="false"
                  :aria-describedby="`plugin-config-${field.key}-desc`"
                >
                <span>{{ toggleLabel(configDrafts[field.key]) }}</span>
              </label>
              <input
                v-else :id="`plugin-config-${field.key}`" v-model="configDrafts[field.key]"
                :type="field.type === 'secret' ? 'password' : 'text'"
                class="pane-field__input"
                :placeholder="field.type === 'secret' ? secretPlaceholder(field.isSet) : ''"
                :aria-describedby="`plugin-config-${field.key}-desc`"
                autocomplete="off" spellcheck="false"
              >
            </div>

            <p v-if="configErrorText !== ''" class="pane__error" role="alert">{{ configErrorText }}</p>

            <div class="pane__actions">
              <button type="button" class="pane__button" :disabled="configBusy" @click="closeSubpage">{{ t.workspace.plugins.cancel }}</button>
              <button type="submit" class="pane__button pane__button--primary" :disabled="configBusy">
                {{ configBusy ? t.workspace.plugins.saving : t.workspace.plugins.save }}
              </button>
            </div>
          </form>

          <!-- 添加市场 -->
          <form v-else-if="subpage === 'add'" class="pane__form" @submit.prevent="submitAdd">
            <label class="pane-field">
              <span class="pane-field__label">{{ t.workspace.plugins.source }}</span>
              <input
                ref="addSourceRef" v-model="addSource" type="text" class="pane-field__input"
                :placeholder="t.workspace.plugins.sourcePlaceholder" autocomplete="off" spellcheck="false"
              >
            </label>
            <label class="pane-field">
              <span class="pane-field__label">{{ t.workspace.plugins.name }}</span>
              <input
                v-model="addName" type="text" class="pane-field__input"
                :placeholder="t.workspace.plugins.namePlaceholder" autocomplete="off"
              >
            </label>

            <label class="pane-check">
              <input v-model="addAutoUpdate" type="checkbox">
              <span class="pane-check__body">
                <span class="pane-check__label">{{ t.workspace.plugins.marketplaceAutoUpdate }}</span>
                <span class="pane-check__hint">{{ t.workspace.plugins.marketplaceAutoUpdateHint }}</span>
              </span>
            </label>

            <p v-if="addError !== ''" class="pane__error" role="alert">{{ addError }}</p>

            <div class="pane__actions">
              <button type="button" class="pane__button" :disabled="addBusy" @click="closeSubpage">{{ t.workspace.plugins.cancel }}</button>
              <button type="submit" class="pane__button pane__button--primary" :disabled="!canAddMarket">
                {{ addBusy ? t.workspace.plugins.adding : t.workspace.plugins.add }}
              </button>
            </div>
          </form>

          <!-- 移除市场:先把影响说清楚 -->
          <div v-else-if="subpage === 'remove'" class="pane">
            <p class="pane__body-text">{{ removeBody }}</p>
            <p v-if="removeError !== ''" class="pane__error" role="alert">{{ removeError }}</p>
            <div class="pane__actions">
              <button
                ref="removeCancelRef" type="button" class="pane__button" :disabled="removeBusy"
                @click="closeSubpage"
              >{{ t.workspace.plugins.removeCancel }}</button>
              <button
                type="button" class="pane__button pane__button--danger" :disabled="removeBusy"
                @click="onRemoveMarket"
              >{{ removeBusy ? t.workspace.plugins.removing : t.workspace.plugins.removeConfirm }}</button>
            </div>
          </div>
        </PluginSubpage>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.plugin-manager { display: flex; flex-direction: column; gap: var(--dl-space-4); min-height: 0; }

/* 页级动作:说明文字已移除,「添加市场」靠右。 */
.plugin-manager__head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: var(--dl-space-3); row-gap: var(--dl-space-2); }
.plugin-manager__add-market { display: inline-flex; flex: none; align-items: center; min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-accent); font-size: var(--dl-font-size-xs); font-weight: 500; white-space: nowrap; }
.plugin-manager__add-market:hover { background: var(--dl-bg-hover); color: var(--dl-accent-hover); }
.plugin-manager__add-market:focus-visible { box-shadow: var(--dl-focus-ring); }

.plugin-manager__error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-manager__live { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.plugin-manager__loading { padding-block: var(--dl-space-2); }
.plugin-manager__state { display: grid; justify-items: start; gap: var(--dl-space-2); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-manager__empty { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-4) var(--dl-space-3); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-md); }
.plugin-manager__empty-title { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.plugin-manager__empty-hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

/* 市场卡片:父级容器把来源、策略与它的插件绑成一组;不裁剪(行内菜单 / 焦点环要出界)。 */
.plugin-groups { display: grid; gap: var(--dl-space-4); }
.plugin-group { border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-base); }
/* Header 两行:名称 + 更新/自动更新 + 安装/溢出;来源独占下一行;计数压在分割线上。 */
.plugin-group__head { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-3) var(--dl-space-4); }
.plugin-group__title-row { display: flex; align-items: center; gap: var(--dl-space-2); min-width: 0; }
.plugin-group__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; line-height: var(--dl-line-snug); }
.plugin-group__menu { display: flex; flex: none; align-items: center; }
.plugin-group__source-row { display: flex; align-items: center; gap: var(--dl-space-2); min-width: 0; }
.plugin-group__source { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
/* 带标签的分割线:计数居中压在线上,线在文字两侧断开,不额外占一行。 */
.plugin-group__divider { position: relative; display: flex; justify-content: center; align-items: center; }
.plugin-group__divider::before { content: ''; position: absolute; inset-inline: 0; inset-block-start: 50%; block-size: var(--dl-border-width); background: var(--dl-border-base); }
.plugin-group__counts { position: relative; padding-inline: var(--dl-space-2); background: var(--dl-bg-base); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); font-variant-numeric: tabular-nums; }
/* 安装是这张卡片唯一的主行动:无底色强调色文字按钮,不加图标。 */
.plugin-group__add { display: inline-flex; align-items: center; min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-accent); font-size: var(--dl-font-size-xs); font-weight: 500; white-space: nowrap; }
.plugin-group__add:hover { background: var(--dl-bg-hover); color: var(--dl-accent-hover); }
.plugin-group__add:focus-visible { box-shadow: var(--dl-focus-ring); }
/* 自动更新用点亮 / 熄灭的圆点表示状态:实心为开,空心为关,不只靠颜色。
   不用开关,避免与插件行里的启停开关混淆。 */
.plugin-group__auto-toggle { display: inline-flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); white-space: nowrap; }
.plugin-group__auto-toggle:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.plugin-group__auto-toggle:focus-visible { box-shadow: var(--dl-focus-ring); }
.plugin-group__auto-toggle:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.plugin-group__auto-dot { box-sizing: border-box; inline-size: var(--dl-space-1); block-size: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-pill); background: transparent; }
.plugin-group__auto-dot[data-on='true'] { border-color: var(--dl-accent); background: var(--dl-accent); }
/* 手动更新与 ⋯ 同为标题行的图标动作:同尺寸、同色阶,不额外占一行。 */
.plugin-group__update { display: inline-grid; place-items: center; inline-size: var(--dl-space-6); block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); }
.plugin-group__update:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.plugin-group__update:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.plugin-group__update:focus-visible { box-shadow: var(--dl-focus-ring); }
.plugin-group__list { padding-inline: 0; }
.plugin-group__empty { padding: var(--dl-space-3) var(--dl-space-4); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.plugin-manager__list { display: grid; gap: 0; min-width: 0; }
.plugin-manager__list > :deep(.plugin-row + .plugin-row) { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }

/* ---- 列表 / 子页面的滑动切换 ---- */
.plugin-manager__view { min-width: 0; }
.plugin-view-forward-enter-active, .plugin-view-forward-leave-active,
.plugin-view-back-enter-active, .plugin-view-back-leave-active { transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard); }
.plugin-view-forward-enter-from { opacity: 0; transform: translateX(var(--dl-space-4)); }
.plugin-view-forward-leave-to { opacity: 0; transform: translateX(calc(-1 * var(--dl-space-4))); }
.plugin-view-back-enter-from { opacity: 0; transform: translateX(calc(-1 * var(--dl-space-4))); }
.plugin-view-back-leave-to { opacity: 0; transform: translateX(var(--dl-space-4)); }
@media (prefers-reduced-motion: reduce) {
  .plugin-view-forward-enter-active, .plugin-view-forward-leave-active,
  .plugin-view-back-enter-active, .plugin-view-back-leave-active { transition: none; }
}

/* ---- 子页面内容 ---- */
.pane { display: grid; gap: var(--dl-space-3); min-width: 0; }
.pane__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.pane__meta-sep { color: var(--dl-border-strong); }
.pane__source { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--dl-font-mono); }
.pane__search { display: flex; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); color: var(--dl-text-tertiary); }
.pane__search:focus-within { border-color: var(--dl-accent); box-shadow: 0 0 0 1px color-mix(in oklab, var(--dl-accent) 60%, transparent); }
.pane__search-input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.pane__search-input::placeholder { color: var(--dl-text-tertiary); }
.pane__search-input:focus,
.pane__search-input:focus-visible { outline: none; box-shadow: none; }
.pane__empty { padding: var(--dl-space-6) var(--dl-space-3); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); text-align: center; }
.pane__list { display: grid; gap: var(--dl-space-1); }
.pane__item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: var(--dl-space-3); padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); }
.pane__item-body { display: grid; gap: var(--dl-space-1); min-width: 0; }
.pane__item-title { display: flex; align-items: baseline; gap: var(--dl-space-2); min-width: 0; }
.pane__item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); }
.pane__item-version { flex: none; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.pane__item-description { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.pane__item-meta { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.pane__action { min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-accent); font-size: var(--dl-font-size-xs); font-weight: 500; white-space: nowrap; }
.pane__action:hover:not(:disabled) { background: var(--dl-bg-hover); color: var(--dl-accent-hover); }
.pane__action:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.pane__action:focus-visible { box-shadow: var(--dl-focus-ring); }
.pane__more { justify-self: start; min-block-size: var(--dl-space-8); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.pane__more:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.pane__more:focus-visible { box-shadow: var(--dl-focus-ring); }

.pane__form { display: grid; gap: var(--dl-space-4); min-width: 0; }
.pane__identity { display: flex; align-items: center; gap: var(--dl-space-2); color: var(--dl-text-tertiary); }
.pane__identity code { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.pane__scope { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); letter-spacing: var(--dl-tracking-caps); }
.pane-field { display: grid; gap: var(--dl-space-1); }
.pane-field__label-row { display: flex; align-items: baseline; gap: var(--dl-space-2); }
.pane-field__label { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.pane-field__required { color: var(--dl-warning); font-size: var(--dl-font-size-xs); }
.pane-field__description { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.pane-field__input { inline-size: 100%; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.pane-field__input::placeholder { color: var(--dl-text-tertiary); }
.pane-field__input:focus-visible { border-color: var(--dl-border-strong); outline: none; box-shadow: var(--dl-focus-ring); }
.pane-field__check { display: inline-flex; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.pane-field__check input { inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); accent-color: var(--dl-accent); }
.pane-field__check input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.pane-check { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--dl-space-2); }
.pane-check input { inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); margin-block-start: var(--dl-border-width); accent-color: var(--dl-accent); }
.pane-check__body { display: grid; gap: var(--dl-space-1); }
.pane-check__label { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.pane-check__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.pane__body-text { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.pane__error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.pane__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--dl-space-2); }
.pane__button { min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); }
.pane__button:hover:not(:disabled) { background: var(--dl-bg-hover); }
.pane__button:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.pane__button:focus-visible { box-shadow: var(--dl-focus-ring); }
.pane__button--primary { background: var(--dl-accent); color: var(--dl-text-on-accent); }
.pane__button--primary:hover:not(:disabled) { background: var(--dl-accent-hover); }
.pane__button--danger { background: var(--dl-error); color: var(--dl-text-on-accent); }
.pane__button--danger:hover:not(:disabled) { outline: var(--dl-border-width) solid var(--dl-error); outline-offset: var(--dl-space-1); }

@media (max-width: 640px) {
  .pane__item { grid-template-columns: minmax(0, 1fr); }
  .pane__action { justify-self: start; }
}

/* 独立控件保持 44px;市场卡片内的动作属于密集工具栏,768 仍用 24px。 */
@media (max-width: 1023px) {
  .plugin-manager__add-market { min-block-size: var(--dl-target-size); }
}

@media (max-width: 599px) {
  /* 窄屏:说明独占一行,页级动作落到下一行右对齐。 */
  .plugin-manager__head { grid-template-columns: 1fr; }
  .plugin-manager__add-market { justify-self: end; }
  /* 触屏窄幅才把市场卡片内的图标动作放大到 44px。 */
  .plugin-group__add, .plugin-group__auto-toggle,
  .plugin-group__update { min-block-size: var(--dl-target-size); }
  .plugin-group__update { min-inline-size: var(--dl-target-size); }
}
</style>
