<script setup lang="ts">
// 插件管理(单个作用域):按**所属市场**分组展示插件。
//
// 市场是父、插件是子:每张市场卡片头部放来源、自动更新、更新、移除与「安装插件」,
// 卡片内只列该市场的已安装插件。这样「每个插件属于哪个市场」在结构上就成立,
// 而不是把插件与市场做成两个并列的设置页。
import { computed, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { InstalledPlugin, PluginInstallScopeId } from '../contracts/generated/installed-plugin'
import type { Marketplace } from '../contracts/generated/marketplace'
import type { MarketplaceConfig } from '../contracts/generated/marketplace-config'
import type { MarketplaceBinding } from '../contracts/generated/marketplace-binding'
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
import MarketplaceAddDialog from './marketplace-add-dialog.vue'
import MarketplaceRemoveDialog from './marketplace-remove-dialog.vue'
import PluginConfigDialog from './plugin-config-dialog.vue'
import PluginInstallDialog from './plugin-install-dialog.vue'
import PluginRow from './plugin-row.vue'
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
const isAddOpen = ref(false)
const addBusy = ref(false)
const addError = ref('')
const removeId = ref('')
const removeBusy = ref(false)
const removeError = ref('')
// 正在浏览哪个市场的可安装插件;空串 = 弹层关闭。
const installMarketplaceId = ref('')
let version = 0

const installedKeys = computed(() => installed.value.map((item) => `${item.plugin.id}@${item.plugin.marketplaceId}`))
const scopeHint = computed(() => (props.scope === 'agent'
  ? t.value.workspace.plugins.agentScopeHint
  : t.value.workspace.plugins.projectScopeHint))
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
  configTarget.value = { marketplaceId, pluginId }
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
  configTarget.value = null
  announcement.value = t.value.workspace.plugins.configureSaved.replace('{name}', result.value.plugin.name)
}

// ---- 市场(父级) ----

function openInstall(marketplaceId: string): void {
  installMarketplaceId.value = marketplaceId
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

function openAddMarket(): void {
  addError.value = ''
  isAddOpen.value = true
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
  isAddOpen.value = false
  announcement.value = t.value.workspace.plugins.addedMarketplace.replace('{name}', result.value.marketplace.name)
}

function openRemoveMarket(marketplaceId: string): void {
  removeError.value = ''
  removeId.value = marketplaceId
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
  // 请求期间用户可能已打开另一个市场的移除确认;只清理自己那一次。
  if (removeId.value === targetId) removeId.value = ''
  announcement.value = t.value.workspace.plugins.removedMarketplace.replace('{name}', target.marketplace.name)
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

function pluginBusy(item: InstalledPlugin): boolean {
  return busyKey.value === `${item.plugin.id}@${item.plugin.marketplaceId}`
}

watch([() => props.scope, () => props.ownerId], () => {
  installMarketplaceId.value = ''
  removeId.value = ''
  isAddOpen.value = false
  configTarget.value = null
  void load()
}, { immediate: true })
</script>

<template>
  <section class="plugin-manager">
    <div class="plugin-manager__head">
      <p class="plugin-manager__hint">{{ scopeHint }}</p>
      <!-- 说明与页级动作同排:说明占满剩余宽度,动作是可点的文字链。 -->
      <button type="button" class="plugin-manager__add-market" @click="openAddMarket">
        {{ t.workspace.plugins.addMarketplace }}
      </button>
    </div>

    <p v-if="error !== ''" class="plugin-manager__error" role="alert">{{ error }}</p>
    <p class="plugin-manager__live" aria-live="polite">{{ announcement }}</p>

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
            <div class="plugin-group__title-main">
              <span class="plugin-group__name" :title="group.binding.marketplace.name">{{ group.binding.marketplace.name }}</span>
              <!-- 自动更新与更新贴着市场名。 -->
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
            <span class="plugin-group__menu">
              <RowActionsMenu
                :label="t.workspace.plugins.marketplaceMoreActions.replace('{name}', group.binding.marketplace.name)"
                :items="marketMenu" @select="onMarketMenu(group.binding.marketplace.id, $event)"
              />
            </span>
          </div>
          <div class="plugin-group__source-row">
            <p class="plugin-group__source" :title="group.binding.marketplace.source">{{ group.binding.marketplace.source }}</p>
            <!-- 安装是这张卡片的主行动:纯文字按钮,不加图标。 -->
            <button
              type="button" class="plugin-group__add"
              @click="openInstall(group.binding.marketplace.id)"
            >{{ t.workspace.plugins.installPlugin }}</button>
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

    <PluginInstallDialog
      :open="installMarketplaceId !== ''" :scope="scope" :owner-name="ownerName"
      :marketplace="installMarketplace" :installed-keys="installedKeys" :busy-key="busyKey"
      @install="onInstall" @cancel="installMarketplaceId = ''"
    />
    <PluginConfigDialog
      :open="configTarget !== null" :installed="configInstalled" :owner-name="ownerName"
      :busy="configBusy" :error="configError"
      @submit="onSaveConfig" @cancel="configTarget = null"
    />
    <MarketplaceAddDialog
      :open="isAddOpen" :busy="addBusy" :error="addError" :scope="scope" :owner-name="ownerName"
      @submit="onAddMarket" @cancel="isAddOpen = false"
    />
    <MarketplaceRemoveDialog
      :open="removeId !== ''" :marketplace-name="removeTarget?.marketplace.name ?? ''"
      :scope="scope" :owner-name="ownerName"
      :installed-count="removeInstalledCount" :busy="removeBusy" :error="removeError"
      @confirm="onRemoveMarket" @cancel="removeId = ''"
    />
  </section>
</template>

<style scoped>
.plugin-manager { display: flex; flex-direction: column; gap: var(--dl-space-4); min-height: 0; }

/* 说明与页级动作同排:说明左、动作右;动作是文字链,不与内容区主行动争抢。 */
.plugin-manager__head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; column-gap: var(--dl-space-3); row-gap: var(--dl-space-2); }
.plugin-manager__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
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
.plugin-group__title-row { display: flex; align-items: center; gap: var(--dl-space-1); min-width: 0; }
.plugin-group__title-main { display: flex; align-items: center; gap: var(--dl-space-1); min-width: 0; }
.plugin-group__name { flex: 0 1 auto; min-width: 0; margin-inline-end: var(--dl-space-1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; line-height: var(--dl-line-snug); }
.plugin-group__menu { display: flex; flex: none; align-items: center; margin-inline-start: auto; }
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
