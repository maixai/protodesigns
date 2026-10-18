<script setup lang="ts">
// 插件管理器:一份安装清单,作用域由宿主决定(Agent 设置 / 项目设置)。
//
// 安装 / 卸载 / 启停 / 配置都在这里完成;市场与自动更新不在这里 —— 市场是全局来源,
// 在全局设置里管理。这样「插件属于谁」和「来源怎么维护」不会混在同一页。
import { computed, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { InstalledPlugin, PluginInstallScopeId } from '../contracts/generated/installed-plugin'
import type { PluginConfigValue } from '../contracts/generated/plugin-config-value'
import { installPlugin, listInstalledPlugins, savePluginConfig, setPluginEnabled, uninstallPlugin, updateInstalledPlugin } from '../api/workspace'
import { useI18n } from '../i18n'
import PluginConfigDialog from './plugin-config-dialog.vue'
import PluginInstallDialog from './plugin-install-dialog.vue'
import PluginRow from './plugin-row.vue'

const props = defineProps<{
  scope: PluginInstallScopeId
  // agent id 或项目路径。
  ownerId: string
  ownerName: string
}>()

const { t } = useI18n()
const installed = ref<InstalledPlugin[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const announcement = ref('')
const busyKey = ref('')
const isInstallOpen = ref(false)
const configTarget = ref<{ marketplaceId: string; pluginId: string } | null>(null)
const configBusy = ref(false)
const configError = ref('')
let version = 0

const installedKeys = computed(() => installed.value.map((item) => `${item.plugin.id}@${item.plugin.marketplaceId}`))
const scopeHint = computed(() => (props.scope === 'agent'
  ? t.value.workspace.plugins.agentScopeHint
  : t.value.workspace.plugins.projectScopeHint))
const configInstalled = computed(() => {
  const target = configTarget.value
  if (target === null) return undefined
  return installed.value.find((item) => item.plugin.marketplaceId === target.marketplaceId && item.plugin.id === target.pluginId)
})

async function load(): Promise<void> {
  version += 1
  const current = version
  status.value = 'loading'
  error.value = ''
  const result = await listInstalledPlugins(props.scope, props.ownerId)
  if (current !== version) return
  if (!result.ok) {
    status.value = 'error'
    return
  }
  installed.value = result.value
  status.value = 'ready'
}

function sortInstalled(items: InstalledPlugin[]): InstalledPlugin[] {
  return [...items].sort((a, b) => a.plugin.name.localeCompare(b.plugin.name))
}

function replaceInstalled(updated: InstalledPlugin): void {
  installed.value = installed.value.map((item) => (
    item.plugin.id === updated.plugin.id && item.plugin.marketplaceId === updated.plugin.marketplaceId ? updated : item
  ))
}

function isBusy(): boolean {
  return busyKey.value !== '' || configBusy.value
}

async function onInstall(marketplaceId: string, pluginId: string): Promise<void> {
  if (isBusy()) return
  const key = `${pluginId}@${marketplaceId}`
  busyKey.value = key
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
  if (isBusy()) return
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
  if (isBusy()) return
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
  if (isBusy()) return
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

watch([() => props.scope, () => props.ownerId], () => {
  configTarget.value = null
  isInstallOpen.value = false
  void load()
}, { immediate: true })
</script>

<template>
  <section class="plugin-manager">
    <div class="plugin-manager__head">
      <div class="plugin-manager__intro">
        <h3 class="plugin-manager__title">{{ t.workspace.plugins.installedPlugins }}</h3>
        <p class="plugin-manager__hint">{{ scopeHint }}</p>
      </div>
      <button type="button" class="plugin-manager__install" @click="isInstallOpen = true">
        <span aria-hidden="true">＋</span>
        <span>{{ t.workspace.plugins.installPlugin }}</span>
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
    <p v-else-if="installed.length === 0" class="plugin-manager__empty">
      <span class="plugin-manager__empty-title">{{ t.workspace.plugins.empty }}</span>
      <span class="plugin-manager__empty-hint">{{ t.workspace.plugins.emptyHint }}</span>
    </p>
    <ul v-else class="plugin-manager__list">
      <PluginRow
        v-for="item in installed" :key="`${item.plugin.id}@${item.plugin.marketplaceId}`"
        :installed="item" :busy="busyKey === `${item.plugin.id}@${item.plugin.marketplaceId}`"
        @update="onUpdate" @configure="openConfig" @uninstall="onUninstall" @toggle="onToggle"
      />
    </ul>

    <PluginInstallDialog
      :open="isInstallOpen" :scope="scope" :owner-name="ownerName"
      :installed-keys="installedKeys" :busy-key="busyKey"
      @install="onInstall" @catalog-changed="load" @cancel="isInstallOpen = false"
    />
    <PluginConfigDialog
      :open="configTarget !== null" :installed="configInstalled" :owner-name="ownerName"
      :busy="configBusy" :error="configError"
      @submit="onSaveConfig" @cancel="configTarget = null"
    />
  </section>
</template>

<style scoped>
.plugin-manager { display: flex; flex-direction: column; gap: var(--dl-space-3); min-height: 0; }

.plugin-manager__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--dl-space-3); }
.plugin-manager__intro { display: grid; gap: var(--dl-space-1); min-width: 0; }
.plugin-manager__title { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); }
.plugin-manager__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-manager__install { display: inline-flex; flex: none; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); white-space: nowrap; }
.plugin-manager__install:hover { background: var(--dl-bg-hover); }
.plugin-manager__install:focus-visible { box-shadow: var(--dl-focus-ring); }

.plugin-manager__error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-manager__live { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.plugin-manager__loading { padding-block: var(--dl-space-2); }
.plugin-manager__state { display: grid; justify-items: start; gap: var(--dl-space-2); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-manager__empty { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-4) var(--dl-space-3); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-md); text-align: center; }
.plugin-manager__empty-title { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.plugin-manager__empty-hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-manager__list { display: grid; gap: 0; min-width: 0; }
.plugin-manager__list > :deep(.plugin-row + .plugin-row) { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }

@media (max-width: 1023px) {
  .plugin-manager__install { min-block-size: var(--dl-target-size); }
}
</style>
