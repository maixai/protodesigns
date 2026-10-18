<script setup lang="ts">
// 已安装插件行:只保留归属、版本、更新状态与启停。
//
// 描述 / 发布者 / 能力清单属于「安装前要不要它」的信息,放在安装弹层里;装好之后,
// 这一行要回答的是「它来自哪个市场、装的是哪个版本、有没有更新、现在开没开」。
import { computed } from 'vue'
import { NSwitch } from 'naive-ui'
import type { InstalledPlugin } from '../contracts/generated/installed-plugin'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import RowActionsMenu from './row-actions-menu.vue'
import type { RowAction } from './row-actions-menu.vue'
import { toIconName } from '../data/icons'

const props = defineProps<{
  installed: InstalledPlugin
  busy: boolean
}>()
const emit = defineEmits<{
  update: [marketplaceId: string, pluginId: string]
  configure: [marketplaceId: string, pluginId: string]
  uninstall: [marketplaceId: string, pluginId: string]
  toggle: [marketplaceId: string, pluginId: string, enabled: boolean]
}>()

const { t } = useI18n()
const plugin = computed(() => props.installed.plugin)
const keyLabel = computed(() => `${plugin.value.id}@${plugin.value.marketplaceId}`)
const hasUpdate = computed(() => props.installed.installedVersion !== plugin.value.version)
const switchLabel = computed(() => (props.installed.enabled
  ? t.value.workspace.plugins.disableLabel
  : t.value.workspace.plugins.enableLabel).replace('{name}', plugin.value.name))
const updateLabel = computed(() => t.value.workspace.plugins.updateAvailable.replace('{version}', plugin.value.version))
// 必填项为空 = 插件还不可用。这个状态必须出现在行上,否则用户不会想到去菜单里找配置。
const needsConfig = computed(() => props.installed.config.some((field) => field.required && !field.isSet))
const hasConfig = computed(() => props.installed.config.length > 0)
const actions = computed<RowAction[]>(() => {
  const items: RowAction[] = []
  if (hasUpdate.value) items.push({ id: 'update', label: t.value.workspace.plugins.update })
  if (hasConfig.value) items.push({ id: 'configure', label: t.value.workspace.plugins.configure })
  items.push({ id: 'uninstall', label: t.value.workspace.plugins.uninstall, tone: 'danger' })
  return items
})
const menuLabel = computed(() => t.value.workspace.plugins.moreActions.replace('{name}', plugin.value.name))

function onAction(id: string): void {
  if (id === 'update') emit('update', plugin.value.marketplaceId, plugin.value.id)
  if (id === 'configure') emit('configure', plugin.value.marketplaceId, plugin.value.id)
  if (id === 'uninstall') emit('uninstall', plugin.value.marketplaceId, plugin.value.id)
}
</script>

<template>
  <li class="plugin-row" :data-update="hasUpdate ? 'true' : undefined" :data-config-needed="needsConfig ? 'true' : undefined">
    <span class="plugin-row__icon" aria-hidden="true"><DliIcon :name="toIconName(plugin.icon)" size="sm" /></span>
    <div class="plugin-row__body">
      <div class="plugin-row__title">
        <span class="plugin-row__name" :title="keyLabel">{{ plugin.name }}</span>
        <span class="plugin-row__version">v{{ installed.installedVersion }}</span>
      </div>
      <p class="plugin-row__meta">
        <span class="plugin-row__marketplace">{{ installed.marketplaceName }}</span>
        <span v-if="hasUpdate" class="plugin-row__update-badge">{{ updateLabel }}</span>
        <button
          v-if="needsConfig" type="button" class="plugin-row__config-badge"
          :title="t.workspace.plugins.configRequiredHint"
          :aria-label="t.workspace.plugins.configureTitle.replace('{name}', plugin.name)"
          @click="emit('configure', plugin.marketplaceId, plugin.id)"
        >{{ t.workspace.plugins.configureRequired }}</button>
      </p>
    </div>
    <div class="plugin-row__actions">
      <NSwitch
        size="small" :value="installed.enabled" :disabled="busy" :aria-label="switchLabel"
        @update:value="(value: boolean) => emit('toggle', plugin.marketplaceId, plugin.id, value)"
      />
      <RowActionsMenu :label="menuLabel" :items="actions" @select="onAction" />
    </div>
  </li>
</template>

<style scoped>
.plugin-row { position: relative; display: grid; min-width: 0; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--dl-space-2); padding-block: var(--dl-space-2); }
.plugin-row__icon { display: grid; place-items: center; inline-size: var(--dl-space-6); block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); }
.plugin-row__body { display: grid; gap: var(--dl-space-1); min-width: 0; }
.plugin-row__title { display: flex; align-items: baseline; gap: var(--dl-space-2); min-width: 0; }
.plugin-row__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); }
.plugin-row__version { flex: none; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }
.plugin-row__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.plugin-row__marketplace { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 更新是状态,不是按钮:版本差写在徽标里,真正的更新动作在 ⋯ 菜单里。 */
.plugin-row__update-badge { flex: none; padding-inline: var(--dl-space-1); border-radius: var(--dl-radius-sm); background: var(--dl-accent-soft); color: var(--dl-accent); white-space: nowrap; }
.plugin-row__config-badge { min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-warning); border-radius: var(--dl-radius-sm); background: transparent; color: var(--dl-warning); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; }
.plugin-row__config-badge:hover { background: var(--dl-bg-hover); }
.plugin-row__config-badge:focus-visible { box-shadow: var(--dl-focus-ring); }
.plugin-row__actions { display: flex; align-items: center; gap: var(--dl-space-2); flex: none; }

@media (max-width: 1023px) {
  .plugin-row__actions { gap: var(--dl-space-3); }
}
</style>
