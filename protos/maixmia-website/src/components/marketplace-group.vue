<script setup lang="ts">
// 插件市场组:市场是父节点,已安装插件是它的子节点(左侧树脊 + 节点)。
//
// 主视图只列已安装插件 —— 市场里的可安装项可能非常多,全部铺开会淹没「我装了什么」。
// 安装统一走顶部的「安装插件」弹层。
//
// 自动更新在市场头上配置 —— 这是 Claude Code 的真实粒度(extraKnownMarketplaces.<name>.autoUpdate);
// 子插件只显示继承来的「自动 / 手动」状态。自动更新用一枚文字芯片表示,与插件的启用开关
// (开关 + 「启用」标签)在形状与文案上都不同,不会被误读成同一个设置。
import { computed } from 'vue'
import type { Marketplace } from '../contracts/generated/marketplace'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import PluginRow from './plugin-row.vue'
import RowActionsMenu from './row-actions-menu.vue'
import type { RowAction } from './row-actions-menu.vue'

const props = defineProps<{
  marketplace: Marketplace
  expanded: boolean
  busyPluginId: string
  busyMarketplace: boolean
}>()
const emit = defineEmits<{
  toggleExpanded: [marketplaceId: string]
  configure: [marketplaceId: string, pluginId: string]
  uninstall: [marketplaceId: string, pluginId: string]
  togglePlugin: [marketplaceId: string, pluginId: string, enabled: boolean]
  autoUpdate: [marketplaceId: string, autoUpdate: boolean]
  update: [marketplaceId: string]
  removeMarketplace: [marketplaceId: string]
}>()

const { t } = useI18n()
const scopeLabel = computed(() => t.value.workspace.plugins.scopeLabel[props.marketplace.scope])
const scopeHint = computed(() => t.value.workspace.plugins.scopeHint[props.marketplace.scope])
const trustLabel = computed(() => t.value.workspace.plugins.trustLabel[props.marketplace.trust])
const installedPlugins = computed(() => props.marketplace.plugins.filter((plugin) => plugin.installed))
const hasCatalog = computed(() => props.marketplace.plugins.length > 0)
const listId = computed(() => `marketplace-plugins-${props.marketplace.id}`)
const menuLabel = computed(() => t.value.workspace.plugins.marketplaceMoreActions.replace('{name}', props.marketplace.name))
const menuItems = computed<RowAction[]>(() => [
  { id: 'remove', label: t.value.workspace.plugins.removeMarketplace, tone: 'danger' },
])

// 更新时间只取到分钟:侧栏是扫描式阅读,秒级精度没有价值。
function formatUpdated(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isBusy(pluginId: string): boolean {
  return props.busyPluginId === pluginId
}

function onMenu(id: string): void {
  if (id === 'remove') emit('removeMarketplace', props.marketplace.id)
}

function onAutoChange(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  emit('autoUpdate', props.marketplace.id, input.checked)
}
</script>

<template>
  <section class="marketplace" :data-marketplace="marketplace.id">
    <div class="marketplace__head">
      <button
        type="button" class="marketplace__toggle"
        :aria-expanded="expanded" :aria-controls="listId"
        @click="emit('toggleExpanded', marketplace.id)"
      >
        <svg class="marketplace__chevron" :class="{ 'is-open': expanded }" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        <span class="marketplace__identity">
          <span class="marketplace__title-row">
            <span class="marketplace__name">{{ marketplace.name }}</span>
            <span class="marketplace__scope" :title="scopeHint">{{ scopeLabel }}</span>
          </span>
          <span class="marketplace__meta">
            <span class="marketplace__trust" :data-trust="marketplace.trust">
              <DliIcon v-if="marketplace.trust === 'trusted'" name="check" size="sm" />
              {{ trustLabel }}
            </span>
            <span class="marketplace__separator" aria-hidden="true">·</span>
            <span class="marketplace__source" :title="marketplace.source">{{ marketplace.source }}</span>
          </span>
        </span>
      </button>
      <RowActionsMenu :label="menuLabel" :items="menuItems" @select="onMenu" />
    </div>

    <div class="marketplace__controls">
      <span class="marketplace__policy">
        <label class="marketplace__auto">
          <input
            type="checkbox" :checked="marketplace.autoUpdate" :disabled="busyMarketplace"
            @change="onAutoChange"
          >
          <span>{{ t.workspace.plugins.autoUpdate }}</span>
        </label>
        <button
          v-if="!marketplace.autoUpdate" type="button" class="marketplace__update"
          :aria-label="t.workspace.plugins.updateLabel.replace('{name}', marketplace.name)"
          :disabled="busyMarketplace" @click="emit('update', marketplace.id)"
        >
          <DliIcon name="sync" size="sm" />
          <span>{{ busyMarketplace ? t.workspace.plugins.updating : t.workspace.plugins.updateNow }}</span>
        </button>
      </span>
      <span v-if="hasCatalog" class="marketplace__stats" :title="t.workspace.plugins.updatedAt.replace('{time}', formatUpdated(marketplace.lastUpdated))">
        {{ t.workspace.plugins.installedCount.replace('{installed}', String(installedPlugins.length)).replace('{total}', String(marketplace.plugins.length)) }}
      </span>
    </div>

    <div v-show="expanded" :id="listId" class="marketplace__body">
      <ul v-if="installedPlugins.length > 0" class="marketplace__plugins">
        <PluginRow
          v-for="plugin in installedPlugins" :key="plugin.id"
          :plugin="plugin" :marketplace-scope="marketplace.scope" :busy="isBusy(plugin.id)"
          @configure="emit('configure', marketplace.id, $event)"
          @uninstall="emit('uninstall', marketplace.id, $event)"
          @toggle="(pluginId, enabled) => emit('togglePlugin', marketplace.id, pluginId, enabled)"
        />
      </ul>
      <p v-else class="marketplace__empty">{{ hasCatalog ? t.workspace.plugins.noInstalled : t.workspace.plugins.noPluginsSynced }}</p>
    </div>
  </section>
</template>

<style scoped>
.marketplace { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: var(--dl-space-1); padding-block-end: var(--dl-space-3); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.marketplace:last-child { padding-block-end: 0; border-block-end: none; }

.marketplace__head { display: flex; align-items: flex-start; gap: var(--dl-space-1); }
.marketplace__toggle { display: flex; align-items: flex-start; gap: var(--dl-space-2); flex: 1; min-width: 0; padding-block: var(--dl-space-1); text-align: left; border-radius: var(--dl-radius-sm); }
.marketplace__chevron { flex: none; inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); margin-block-start: var(--dl-space-1); color: var(--dl-text-tertiary); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.marketplace__chevron.is-open { transform: rotate(90deg); }
.marketplace__chevron path { stroke: currentColor; stroke-width: var(--dl-icon-stroke); vector-effect: non-scaling-stroke; }
.marketplace__identity { display: grid; gap: var(--dl-space-1); min-width: 0; flex: 1; }
.marketplace__title-row { display: flex; align-items: center; gap: var(--dl-space-2); min-width: 0; }
.marketplace__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); }
.marketplace__scope { flex: none; padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); letter-spacing: var(--dl-tracking-caps); }
.marketplace__meta { display: flex; align-items: center; gap: var(--dl-space-1); min-width: 0; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.marketplace__trust { display: inline-flex; flex: none; align-items: center; gap: var(--dl-space-1); }
.marketplace__trust[data-trust='trusted'] { color: var(--dl-accent); }
.marketplace__trust .dl-icon { inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); }
.marketplace__source { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--dl-font-mono); }

.marketplace__controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); }
.marketplace__policy { display: inline-flex; min-width: 0; align-items: center; gap: var(--dl-space-1); }
/* 自动更新是策略:原生复选框 + 静态标签。它不是开关,也不是一个「点一下执行更新」的按钮。 */
.marketplace__auto { display: inline-flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-space-6); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); white-space: nowrap; cursor: pointer; }
.marketplace__auto input { inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); accent-color: var(--dl-accent); }
.marketplace__auto input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.marketplace__auto input:disabled { cursor: not-allowed; }
/* 手动模式下的显式动作:只在这一刻出现,不会与策略混淆。 */
.marketplace__update { display: inline-flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; }
.marketplace__update:hover:not(:disabled) { border-color: var(--dl-border-strong); background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.marketplace__update:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.marketplace__update:focus-visible { box-shadow: var(--dl-focus-ring); }
.marketplace__stats { margin-inline-start: auto; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; font-variant-numeric: tabular-nums; }

/* 树脊:从市场标题下方垂下的一条 1px 线,插件行的节点落在线上。 */
.marketplace__body { min-width: 0; }
.marketplace__plugins { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 0; margin-inline-start: var(--dl-space-3); padding-inline-start: var(--dl-space-3); border-inline-start: var(--dl-border-width) solid var(--dl-border-base); }
.marketplace__plugins > :deep(.plugin-row + .plugin-row) { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.marketplace__empty { margin-inline-start: var(--dl-space-3); padding: var(--dl-space-2) 0 var(--dl-space-2) var(--dl-space-3); border-inline-start: var(--dl-border-width) solid var(--dl-border-base); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }

.marketplace__toggle:hover .marketplace__name { color: var(--dl-text-primary); }
.marketplace__toggle:focus-visible { box-shadow: var(--dl-focus-ring); }
@media (max-width: 1023px) {
  .marketplace__auto { min-block-size: var(--dl-target-size); }
  .marketplace__update { min-block-size: var(--dl-target-size); }
}
@media (prefers-reduced-motion: reduce) {
  .marketplace__chevron { transition: none; }
}
</style>
