<script setup lang="ts">
// 侧栏的插件视图:以「市场 → 已安装插件」的从属关系组织。
//
// 主视图只列已安装插件 —— 市场里的可安装项可能非常多,全部铺开会淹没「我装了什么」。
// 安装统一走顶部的「安装插件」弹层;市场本身可添加 / 移除,自动更新在市场头上配置。
// 安装态按 Agent 隔离;本组件只呈现数据与展开态,动作全部回给页面。
import { computed, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { AgentId } from '../contracts/generated/chat-session'
import type { Marketplace } from '../contracts/generated/marketplace'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import MarketplaceGroup from './marketplace-group.vue'

const props = defineProps<{
  agentId: AgentId
  marketplaces: readonly Marketplace[]
  status: 'loading' | 'ready' | 'error'
  busyPluginId: string
  busyMarketplaceId: string
}>()
const emit = defineEmits<{
  installRequest: []
  addMarketplace: []
  removeMarketplace: [marketplaceId: string]
  configure: [marketplaceId: string, pluginId: string]
  uninstall: [marketplaceId: string, pluginId: string]
  togglePlugin: [marketplaceId: string, pluginId: string, enabled: boolean]
  autoUpdate: [marketplaceId: string, autoUpdate: boolean]
  updateMarketplace: [marketplaceId: string]
  retry: []
}>()

const { t } = useI18n()
const query = ref('')
const expanded = ref<Set<string>>(new Set())
// 默认展开哪几个市场:只在「换 Agent 后的第一次就绪」做一次,之后尊重用户的手动开合。
let initializedFor = ''

const needle = computed(() => query.value.trim().toLowerCase())
const hasQuery = computed(() => needle.value !== '')

// 搜索作用于已安装插件与市场名;命中市场的整组保留。
function matches(marketplace: Marketplace): boolean {
  if (!hasQuery.value) return true
  if ([marketplace.name, marketplace.source].some((field) => field.toLowerCase().includes(needle.value))) return true
  return marketplace.plugins.some((plugin) => plugin.installed
    && [plugin.name, plugin.description, plugin.publisher, plugin.id].some((field) => field.toLowerCase().includes(needle.value)))
}

const visible = computed(() => props.marketplaces.filter(matches))
const installedCount = computed(() => props.marketplaces.reduce((sum, marketplace) => sum + marketplace.plugins.filter((plugin) => plugin.installed).length, 0))
const isEmpty = computed(() => visible.value.length === 0)
const hasInstalled = computed(() => installedCount.value > 0)

function isExpanded(marketplaceId: string): boolean {
  // 搜索时全部展开:结果是按市场过滤出来的,再让用户逐组点开只是多一步。
  return hasQuery.value || expanded.value.has(marketplaceId)
}

function toggleExpanded(marketplaceId: string): void {
  const next = new Set(expanded.value)
  if (next.has(marketplaceId)) next.delete(marketplaceId)
  else next.add(marketplaceId)
  expanded.value = next
}

// 市场数据每次动作都会换成新对象;只在 Agent 变化后的首个就绪帧重置展开态。
watch([() => props.agentId, () => props.status], () => {
  if (props.status !== 'ready') return
  if (initializedFor === props.agentId) return
  initializedFor = props.agentId
  // 有已安装插件的市场默认展开,其余收起。
  expanded.value = new Set(props.marketplaces.filter((marketplace) => marketplace.plugins.some((plugin) => plugin.installed)).map((marketplace) => marketplace.id))
}, { immediate: true })

watch(() => props.agentId, () => {
  query.value = ''
  initializedFor = ''
})
</script>

<template>
  <div class="plugins-pane">
    <div class="plugins-pane__toolbar">
      <div class="plugins-pane__search">
        <DliIcon name="search" size="sm" />
        <input
          v-model="query" type="search" class="plugins-pane__search-input"
          :aria-label="t.workspace.plugins.searchInstalled" :placeholder="t.workspace.plugins.searchInstalled"
          autocomplete="off"
        >
      </div>
      <button type="button" class="plugins-pane__install" @click="emit('installRequest')">
        <span aria-hidden="true">＋</span>
        <span>{{ t.workspace.plugins.installPlugin }}</span>
      </button>
    </div>

    <div class="plugins-pane__section-head">
      <span class="plugins-pane__section-title">
        {{ t.workspace.plugins.marketplaces }}
        <span class="plugins-pane__section-count">{{ marketplaces.length }}</span>
      </span>
      <button type="button" class="plugins-pane__add" @click="emit('addMarketplace')">
        <span aria-hidden="true">＋</span>
        <span>{{ t.workspace.plugins.addMarketplace }}</span>
      </button>
    </div>

    <div class="plugins-pane__scroll">
      <div v-if="status === 'loading'" class="plugins-pane__loading" :aria-label="t.workspace.plugins.loading">
        <NSkeleton text :repeat="4" :animated="false" />
      </div>
      <div v-else-if="status === 'error'" class="plugins-pane__state">
        <p>{{ t.workspace.plugins.error }}</p>
        <button type="button" class="workspace-button" @click="emit('retry')">{{ t.workspace.plugins.retry }}</button>
      </div>
      <template v-else>
        <MarketplaceGroup
          v-for="marketplace in visible" :key="marketplace.id"
          :marketplace="marketplace" :expanded="isExpanded(marketplace.id)"
          :busy-plugin-id="busyPluginId"
          :busy-marketplace="busyMarketplaceId === marketplace.id"
          @toggle-expanded="toggleExpanded"
          @configure="(marketplaceId, pluginId) => emit('configure', marketplaceId, pluginId)"
          @uninstall="(marketplaceId, pluginId) => emit('uninstall', marketplaceId, pluginId)"
          @toggle-plugin="(marketplaceId, pluginId, enabled) => emit('togglePlugin', marketplaceId, pluginId, enabled)"
          @auto-update="(marketplaceId, value) => emit('autoUpdate', marketplaceId, value)"
          @update="(marketplaceId) => emit('updateMarketplace', marketplaceId)"
          @remove-marketplace="(marketplaceId) => emit('removeMarketplace', marketplaceId)"
        />

        <p v-if="marketplaces.length === 0" class="plugin-empty">
          <span class="plugin-empty__title">{{ t.workspace.plugins.noMarketplaces }}</span>
          <span class="plugin-empty__hint">{{ t.workspace.plugins.noMarketplacesHint }}</span>
          <button type="button" class="workspace-button" @click="emit('addMarketplace')">{{ t.workspace.plugins.addMarketplace }}</button>
        </p>
        <p v-else-if="isEmpty" class="plugin-empty">
          <span class="plugin-empty__title">{{ t.workspace.plugins.noMatches }}</span>
          <span class="plugin-empty__hint">{{ t.workspace.plugins.noMatchesHint }}</span>
        </p>
        <p v-else-if="!hasInstalled && !hasQuery" class="plugin-empty">
          <span class="plugin-empty__title">{{ t.workspace.plugins.empty }}</span>
          <span class="plugin-empty__hint">{{ t.workspace.plugins.emptyHint }}</span>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.plugins-pane { display: flex; flex-direction: column; gap: var(--dl-space-2); min-height: 0; flex: 1; }

/* 工具栏:搜索 + 主行动「安装插件」。两侧都是 36 控制档;抽屉(触屏)里抬到 44。 */
.plugins-pane__toolbar { display: flex; align-items: stretch; gap: var(--dl-space-2); flex: none; }
.plugins-pane__search {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  flex: 1;
  min-width: 0;
  min-block-size: var(--dl-control-height);
  padding-inline: var(--dl-space-2);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background: var(--dl-bg-sunken);
  color: var(--dl-text-tertiary);
}
.plugins-pane__search:focus-within { border-color: var(--dl-border-strong); box-shadow: var(--dl-focus-ring); }
.plugins-pane__search-input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugins-pane__search-input::placeholder { color: var(--dl-text-tertiary); }
.plugins-pane__search-input:focus { outline: none; }
.plugins-pane__install { display: inline-flex; flex: none; align-items: center; gap: var(--dl-space-1); padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); white-space: nowrap; }
.plugins-pane__install:hover { background: var(--dl-bg-hover); }
.plugins-pane__install:focus-visible { box-shadow: var(--dl-focus-ring); }

/* 市场区标题 + 「添加市场」。计数用等宽数字,与插件行的技术读数同一气质。 */
.plugins-pane__section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-2); flex: none; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.plugins-pane__section-title { display: inline-flex; align-items: baseline; gap: var(--dl-space-1); }
.plugins-pane__section-count { font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; }
.plugins-pane__add { display: inline-flex; align-items: center; gap: var(--dl-space-1); padding-inline: var(--dl-space-1); min-block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.plugins-pane__add:hover { color: var(--dl-text-primary); background: var(--dl-bg-hover); }
.plugins-pane__add:focus-visible { box-shadow: var(--dl-focus-ring); }

.plugins-pane__scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; padding-inline-end: var(--dl-space-1); overscroll-behavior: contain; display: flex; flex-direction: column; gap: var(--dl-space-3); }
.plugins-pane__loading { padding-block: var(--dl-space-2); }
.plugins-pane__state { display: grid; justify-items: start; gap: var(--dl-space-2); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.plugin-empty { display: grid; justify-items: center; gap: var(--dl-space-1); padding: var(--dl-space-4) var(--dl-space-2); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-md); text-align: center; }
.plugin-empty__title { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.plugin-empty__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.plugin-empty .workspace-button { margin-block-start: var(--dl-space-2); }

@media (max-width: 1023px) {
  .plugins-pane__search { min-block-size: var(--dl-target-size); }
  .plugins-pane__install { min-block-size: var(--dl-target-size); }
  .plugins-pane__add { min-block-size: var(--dl-target-size); }
}
</style>
