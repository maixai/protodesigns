<script setup lang="ts">
// 已安装插件行:市场树里的一个子节点。
//
// 行内只保留做决定需要的信息:名称、版本、一句描述、发布者 / 能力、配置是否缺失。
// 配置键与安装作用域默认不重复展示 —— 它们由市场组与「安装到」语义承担;
// 只有插件的安装作用域与市场不同时,才单独出现一枚芯片。
//
// 启用开关上方是电源符号;自动更新属于市场,不在这里出现第二枚同类控件。
import { computed } from 'vue'
import { NSwitch } from 'naive-ui'
import type { Plugin, PluginScopeId } from '../contracts/generated/plugin'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import RowActionsMenu from './row-actions-menu.vue'
import type { RowAction } from './row-actions-menu.vue'
import { toIconName } from '../data/icons'

const props = defineProps<{
  plugin: Plugin
  // 所属市场的作用域;用于判断插件是否需要单独标出自己的作用域。
  marketplaceScope: PluginScopeId
  busy: boolean
}>()
const emit = defineEmits<{
  configure: [pluginId: string]
  uninstall: [pluginId: string]
  toggle: [pluginId: string, enabled: boolean]
}>()

const { t } = useI18n()
const scopeDiffers = computed(() => props.plugin.scope !== props.marketplaceScope)
const scopeLabel = computed(() => t.value.workspace.plugins.scopeLabel[props.plugin.scope])
const scopeHint = computed(() => t.value.workspace.plugins.scopeHint[props.plugin.scope])
const componentsLabel = computed(() => props.plugin.components.map((component) => t.value.workspace.plugins.components[component]).join(' · '))
// 发布者与能力合成一条文本:换行时不会留下一个孤零零的分隔点。
const metaLabel = computed(() => [props.plugin.publisher, componentsLabel.value].filter((part) => part !== '').join(' · '))
const keyLabel = computed(() => `${props.plugin.id}@${props.plugin.marketplaceId}`)
const switchLabel = computed(() => (props.plugin.enabled
  ? t.value.workspace.plugins.disableLabel
  : t.value.workspace.plugins.enableLabel).replace('{name}', props.plugin.name))
// 必填项为空 = 插件还不可用。这个状态必须出现在行上,否则用户不会想到去菜单里找配置。
const needsConfig = computed(() => props.plugin.config.some((field) => field.required && !field.isSet))
const hasConfig = computed(() => props.plugin.config.length > 0)
const actions = computed<RowAction[]>(() => {
  const items: RowAction[] = []
  if (hasConfig.value) items.push({ id: 'configure', label: t.value.workspace.plugins.configure })
  items.push({ id: 'uninstall', label: t.value.workspace.plugins.uninstall, tone: 'danger' })
  return items
})
const menuLabel = computed(() => t.value.workspace.plugins.moreActions.replace('{name}', props.plugin.name))

function onAction(id: string): void {
  if (id === 'configure') emit('configure', props.plugin.id)
  if (id === 'uninstall') emit('uninstall', props.plugin.id)
}
</script>

<template>
  <li class="plugin-row" :data-config-needed="needsConfig ? 'true' : undefined">
    <span class="plugin-row__icon" aria-hidden="true"><DliIcon :name="toIconName(plugin.icon)" size="sm" /></span>
    <div class="plugin-row__body">
      <div class="plugin-row__title">
        <span class="plugin-row__name" :title="keyLabel">{{ plugin.name }}</span>
        <span class="plugin-row__version">v{{ plugin.version }}</span>
      </div>
      <p class="plugin-row__description" :title="plugin.description">{{ plugin.description }}</p>
      <p class="plugin-row__meta">
        <span>{{ metaLabel }}</span>
        <span
          v-if="scopeDiffers" class="plugin-row__scope" :title="scopeHint"
        >{{ scopeLabel }}</span>
        <button
          v-if="needsConfig" type="button" class="plugin-row__config-badge"
          :title="t.workspace.plugins.configRequiredHint"
          :aria-label="t.workspace.plugins.configureTitle.replace('{name}', plugin.name)"
          @click="emit('configure', plugin.id)"
        >{{ t.workspace.plugins.configureRequired }}</button>
      </p>
    </div>
    <div class="plugin-row__actions">
      <DliIcon name="power" size="sm" class="plugin-row__enable-icon" />
      <NSwitch
        size="small" :value="plugin.enabled" :disabled="busy" :aria-label="switchLabel"
        @update:value="(value: boolean) => emit('toggle', plugin.id, value)"
      />
      <RowActionsMenu :label="menuLabel" :items="actions" @select="onAction" />
    </div>
  </li>
</template>

<style scoped>
/* 行内动作是密集树行的行内控件:24 档;抽屉(触屏)里由 row-actions-menu / NSwitch 自身放大。 */
.plugin-row { position: relative; display: grid; min-width: 0; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: var(--dl-space-2); padding-block: var(--dl-space-2); }
/* 市场树脊上的节点:与左侧竖线同一条轴(竖线由父级列表画)。 */
.plugin-row::before { content: ''; position: absolute; inset-block-start: calc(var(--dl-space-2) + var(--dl-space-1)); inset-inline-start: calc(-1 * var(--dl-space-3)); inline-size: var(--dl-space-1); block-size: var(--dl-space-1); border-radius: var(--dl-radius-pill); background: var(--dl-accent); transform: translateX(-50%); }
.plugin-row__icon { display: grid; place-items: center; inline-size: var(--dl-space-6); block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); }
.plugin-row__body { display: grid; gap: var(--dl-space-1); min-width: 0; }
.plugin-row__title { display: flex; align-items: baseline; gap: var(--dl-space-2); min-width: 0; }
.plugin-row__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); }
.plugin-row__version { flex: none; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; }
/* 一句描述:完整文本在 title 里。已安装插件不需要在列表里读完说明书。 */
.plugin-row__description { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.plugin-row__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.plugin-row__scope { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); font-family: var(--dl-font-mono); letter-spacing: var(--dl-tracking-caps); }
/* 必填配置缺失:用 warning 色 + 边框,保证能在一眼扫读时被看到。 */
.plugin-row__config-badge { min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-warning); border-radius: var(--dl-radius-sm); background: transparent; color: var(--dl-warning); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; }
.plugin-row__config-badge:hover { background: var(--dl-bg-hover); }
.plugin-row__config-badge:focus-visible { box-shadow: var(--dl-focus-ring); }
.plugin-row__actions { display: grid; justify-items: center; gap: var(--dl-space-1); flex: none; }
/* 电源符号:与市场头的「自动更新」复选框在图形层面就不同。 */
.plugin-row__enable-icon { color: var(--dl-text-tertiary); }

@media (max-width: 1023px) {
  .plugin-row__actions { gap: var(--dl-space-2); }
}
</style>
