<script setup lang="ts">
// 「安装插件」弹层:左侧是市场来源栏,右侧只展示**当前市场**的插件。
//
// 为什么分栏:一个市场可能有非常多插件,把所有市场摊在一个长列表里既难找也难管理。
// 左侧负责「从哪来」(添加 / 删除 / 切换),右侧负责「装什么」(搜索 + 分批加载)。
// 作用域由打开它的设置页决定,弹层里不再让用户选。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Marketplace } from '../contracts/generated/marketplace'
import type { MarketplaceConfig } from '../contracts/generated/marketplace-config'
import type { PluginInstallScopeId } from '../contracts/generated/installed-plugin'
import type { Plugin } from '../contracts/generated/plugin'
import { addMarketplace, listMarketplaces, removeMarketplace } from '../api/workspace'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import MarketplaceAddDialog from './marketplace-add-dialog.vue'
import MarketplaceRemoveDialog from './marketplace-remove-dialog.vue'
import RowActionsMenu from './row-actions-menu.vue'
import type { RowAction } from './row-actions-menu.vue'
import { toIconName } from '../data/icons'

const PAGE_SIZE = 6

const props = defineProps<{
  open: boolean
  scope: PluginInstallScopeId
  ownerName: string
  // 当前作用域已安装的 plugin@marketplace;用于从可安装列表里排除。
  installedKeys: readonly string[]
  busyKey: string
}>()
const emit = defineEmits<{
  install: [marketplaceId: string, pluginId: string]
  cancel: []
  // 市场增删后,宿主需要重新装载已安装列表(移除市场会连带卸载插件)。
  catalogChanged: []
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const marketplaces = ref<Marketplace[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const selectedId = ref('')
const query = ref('')
const visibleCount = ref(PAGE_SIZE)
const isAddOpen = ref(false)
const addBusy = ref(false)
const addError = ref('')
const removeId = ref('')
const removeBusy = ref(false)
const removeError = ref('')
const dialogId = `plugin-install-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const hintId = `${dialogId}-hint`

const needle = computed(() => query.value.trim().toLowerCase())
const installedSet = computed(() => new Set(props.installedKeys))
const scopeLabel = computed(() => t.value.workspace.plugins.scopeLabel[props.scope])
const title = computed(() => t.value.workspace.plugins.installTitle)
const selected = computed(() => marketplaces.value.find((item) => item.id === selectedId.value) ?? marketplaces.value[0])
const available = computed(() => selected.value?.plugins
  .filter((plugin) => !installedSet.value.has(`${plugin.id}@${selected.value?.id ?? ''}`)) ?? [])
const filtered = computed(() => {
  if (needle.value === '') return available.value
  return available.value.filter((plugin) => [plugin.name, plugin.description, plugin.publisher, plugin.id]
    .some((field) => field.toLowerCase().includes(needle.value)))
})
const visible = computed(() => filtered.value.slice(0, visibleCount.value))
const remaining = computed(() => Math.max(0, filtered.value.length - visibleCount.value))
const hasMarketplaces = computed(() => marketplaces.value.length > 0)
const removeTarget = computed(() => marketplaces.value.find((item) => item.id === removeId.value))
const removeMenu = computed<RowAction[]>(() => [
  { id: 'remove', label: t.value.workspace.plugins.removeMarketplace, tone: 'danger' },
])

function componentsLabel(plugin: Plugin): string {
  return plugin.components.map((component) => t.value.workspace.plugins.components[component]).join(' · ')
}

function pluginBusy(plugin: Plugin): boolean {
  return props.busyKey === `${plugin.id}@${selected.value?.id ?? ''}`
}

function selectMarket(marketplaceId: string): void {
  selectedId.value = marketplaceId
  query.value = ''
  visibleCount.value = PAGE_SIZE
}

async function load(): Promise<void> {
  status.value = 'loading'
  const result = await listMarketplaces()
  if (!props.open) return
  if (!result.ok) {
    status.value = 'error'
    return
  }
  marketplaces.value = result.value
  const current = result.value.find((item) => item.id === selectedId.value)
  if (current === undefined) {
    // 优先落在「还有可安装插件」的第一个市场,避免一打开就是空列表。
    const withAvailable = result.value.find((item) => item.plugins.some((plugin) => !installedSet.value.has(`${plugin.id}@${item.id}`)))
    selectedId.value = (withAvailable ?? result.value[0])?.id ?? ''
  }
  status.value = 'ready'
}

function openAdd(): void {
  addError.value = ''
  isAddOpen.value = true
}

async function onAdd(config: MarketplaceConfig): Promise<void> {
  if (addBusy.value) return
  addBusy.value = true
  addError.value = ''
  const result = await addMarketplace(config)
  addBusy.value = false
  if (!result.ok) {
    addError.value = result.error.message
    return
  }
  marketplaces.value = [...marketplaces.value, result.value]
  isAddOpen.value = false
  selectMarket(result.value.id)
  await nextTick()
  searchRef.value?.focus()
}

function openRemove(): void {
  if (selected.value === undefined) return
  removeError.value = ''
  removeId.value = selected.value.id
}

async function onRemove(): Promise<void> {
  const target = removeTarget.value
  if (target === undefined || removeBusy.value) return
  removeBusy.value = true
  removeError.value = ''
  const result = await removeMarketplace(target.id)
  removeBusy.value = false
  if (!result.ok) {
    removeError.value = result.error.message
    return
  }
  marketplaces.value = marketplaces.value.filter((item) => item.id !== target.id)
  removeId.value = ''
  const next = marketplaces.value[0]
  selectedId.value = next?.id ?? ''
  query.value = ''
  visibleCount.value = PAGE_SIZE
  emit('catalogChanged')
  await nextTick()
  searchRef.value?.focus()
}

function onRemoveMenu(action: string): void {
  if (action === 'remove') openRemove()
}

function finish(): void {
  dialogRef.value?.close()
  if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
  emit('cancel')
}

function onBackdropClick(event: MouseEvent): void {
  const dialog = dialogRef.value
  if (dialog === null || event.target !== dialog) return
  const bounds = dialog.getBoundingClientRect()
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) finish()
}

watch([selected, needle, () => props.installedKeys], () => {
  visibleCount.value = PAGE_SIZE
})

watch(() => props.open, async (isOpen): Promise<void> => {
  await nextTick()
  const dialog = dialogRef.value
  if (dialog === null) return
  if (!isOpen) {
    if (dialog.open) dialog.close()
    if (returnFocusRef.value?.isConnected) returnFocusRef.value.focus()
    return
  }
  const active = document.activeElement
  returnFocusRef.value = active instanceof HTMLElement ? active : null
  query.value = ''
  visibleCount.value = PAGE_SIZE
  removeId.value = ''
  isAddOpen.value = false
  dialog.showModal()
  void load()
  searchRef.value?.focus()
}, { immediate: true })

// 安装后按钮随之消失:焦点若已丢失,送回搜索框,不让它掉到 body。
watch(() => props.installedKeys, async (): Promise<void> => {
  await nextTick()
  const active = document.activeElement
  if (active instanceof Node && dialogRef.value?.contains(active) === true) return
  searchRef.value?.focus()
})

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef" class="install" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="hintId"
    @cancel.prevent="finish" @click="onBackdropClick"
  >
    <div class="install__head">
      <div class="install__title-row">
        <h2 :id="titleId" class="install__title">{{ title }}</h2>
        <span class="install__scope">{{ scopeLabel }}</span>
      </div>
      <p :id="hintId" class="install__hint">
        {{ (scope === 'agent' ? t.workspace.plugins.installHintAgent : t.workspace.plugins.installHintProject).replace('{name}', ownerName) }}
      </p>
    </div>

    <div class="install__panes">
      <!-- 来源栏:添加 / 删除 / 切换市场。 -->
      <aside class="install__rail" :aria-label="t.workspace.plugins.marketplaceRailLabel">
        <div class="install__rail-head">
          <span class="install__rail-title">{{ t.workspace.plugins.marketplaceRailLabel }}</span>
          <button type="button" class="install__rail-add" :aria-label="t.workspace.plugins.addMarketplace" @click="openAdd">
            <span aria-hidden="true">＋</span>
          </button>
        </div>
        <ul class="install__rail-list">
          <li v-for="marketplace in marketplaces" :key="marketplace.id">
            <button
              type="button" class="install__rail-item"
              :aria-current="marketplace.id === selected?.id ? 'true' : undefined"
              @click="selectMarket(marketplace.id)"
            >
              <span class="install__rail-name">{{ marketplace.name }}</span>
              <span class="install__rail-count">{{ marketplace.plugins.length }}</span>
            </button>
          </li>
        </ul>
        <button v-if="marketplaces.length === 0" type="button" class="install__rail-add-text" @click="openAdd">
          {{ t.workspace.plugins.addMarketplace }}
        </button>
      </aside>

      <section class="install__results">
        <div v-if="selected" class="install__results-head">
          <div class="install__results-title">
            <h3 class="install__market-name">{{ selected.name }}</h3>
            <p class="install__market-meta">
              <span class="install__trust" :data-trust="selected.trust">{{ t.workspace.plugins.trustLabel[selected.trust] }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ t.workspace.plugins.installAvailableCount.replace('{count}', String(available.length)) }}</span>
            </p>
          </div>
          <RowActionsMenu
            :label="t.workspace.plugins.marketplaceMoreActions.replace('{name}', selected.name)"
            :items="removeMenu" @select="onRemoveMenu"
          />
        </div>

        <div class="install__search">
          <DliIcon name="search" size="sm" />
          <input
            ref="searchRef" v-model="query" type="search" class="install__search-input"
            :aria-label="t.workspace.plugins.installSearch" :placeholder="t.workspace.plugins.installSearch"
            autocomplete="off"
          >
        </div>

        <div class="install__body">
          <p v-if="status === 'loading'" class="install__empty">{{ t.workspace.plugins.loading }}</p>
          <p v-else-if="status === 'error'" class="install__empty">{{ t.workspace.plugins.marketplacesError }}</p>
          <p v-else-if="!hasMarketplaces" class="install__empty">
            <span>{{ t.workspace.plugins.installNoMarketplaces }}</span>
            <span class="install__empty-hint">{{ t.workspace.plugins.installNoMarketplacesHint }}</span>
          </p>
          <p v-else-if="selected && selected.plugins.length === 0" class="install__empty">{{ t.workspace.plugins.noPluginsSynced }}</p>
          <p v-else-if="available.length === 0" class="install__empty">{{ t.workspace.plugins.installEmpty }}</p>
          <p v-else-if="filtered.length === 0" class="install__empty">{{ t.workspace.plugins.installNoMatch }}</p>
          <template v-else>
            <ul class="install__list">
              <li v-for="plugin in visible" :key="plugin.id" class="install__item">
                <span class="install__icon" aria-hidden="true"><DliIcon :name="toIconName(plugin.icon)" size="sm" /></span>
                <div class="install__item-body">
                  <p class="install__item-title">
                    <span class="install__item-name">{{ plugin.name }}</span>
                    <span class="install__item-version">v{{ plugin.version }}</span>
                  </p>
                  <p class="install__item-description">{{ plugin.description }}</p>
                  <p class="install__item-meta">{{ plugin.publisher }}<template v-if="plugin.components.length > 0"> · {{ componentsLabel(plugin) }}</template></p>
                </div>
                <button
                  type="button" class="install__action"
                  :aria-label="t.workspace.plugins.installLabel.replace('{name}', plugin.name)"
                  :disabled="pluginBusy(plugin)"
                  @click="emit('install', selected?.id ?? '', plugin.id)"
                >
                  {{ pluginBusy(plugin) ? t.workspace.plugins.installing : t.workspace.plugins.install }}
                </button>
              </li>
            </ul>
            <button v-if="remaining > 0" type="button" class="install__more" @click="visibleCount += PAGE_SIZE">
              {{ t.workspace.plugins.loadMore }}（{{ t.workspace.plugins.loadMoreRemaining.replace('{count}', String(remaining)) }}）
            </button>
          </template>
        </div>
      </section>
    </div>

    <div class="install__actions">
      <button type="button" class="dl-btn dl-btn--ghost" @click="finish">{{ t.workspace.plugins.done }}</button>
    </div>

    <MarketplaceAddDialog
      :open="isAddOpen" :busy="addBusy" :error="addError"
      @submit="onAdd" @cancel="isAddOpen = false"
    />
    <MarketplaceRemoveDialog
      :open="removeId !== ''" :marketplace-name="removeTarget?.name ?? ''"
      :installed-count="removeTarget?.installedCount ?? 0" :busy="removeBusy" :error="removeError"
      @confirm="onRemove" @cancel="removeId = ''"
    />
  </dialog>
</template>

<style scoped>
.install {
  width: min(760px, calc(100% - 2 * var(--dl-space-6)));
  max-height: calc(100% - 2 * var(--dl-space-6));
  margin: auto;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-xl);
  background-color: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font: inherit;
  text-align: left;
  color-scheme: dark;
}
.install::backdrop { background-color: var(--dl-bg-sunken); }
.install[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); }

.install__head { display: grid; gap: var(--dl-space-1); }
.install__title-row { display: flex; align-items: center; gap: var(--dl-space-2); }
.install__title { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.install__scope { padding-inline: var(--dl-space-1); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); letter-spacing: var(--dl-tracking-caps); }
.install__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.install__panes { display: grid; grid-template-columns: 176px minmax(0, 1fr); gap: var(--dl-space-4); min-height: 0; flex: 1; }

.install__rail { display: flex; flex-direction: column; gap: var(--dl-space-2); min-height: 0; padding-inline-end: var(--dl-space-3); border-inline-end: var(--dl-border-width) solid var(--dl-border-base); }
.install__rail-head { display: flex; align-items: center; justify-content: space-between; gap: var(--dl-space-2); }
.install__rail-title { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); letter-spacing: var(--dl-tracking-label); }
.install__rail-add { display: grid; place-items: center; inline-size: var(--dl-space-6); block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); }
.install__rail-add:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.install__rail-add:focus-visible { box-shadow: var(--dl-focus-ring); }
.install__rail-list { display: grid; gap: var(--dl-space-1); min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.install__rail-item { display: flex; align-items: center; gap: var(--dl-space-2); inline-size: 100%; min-block-size: var(--dl-space-8); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); text-align: left; }
.install__rail-item:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.install__rail-item[aria-current='true'] { background: var(--dl-accent-soft); color: var(--dl-text-primary); font-weight: 500; }
.install__rail-item:focus-visible { box-shadow: var(--dl-focus-ring); }
.install__rail-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.install__rail-count { margin-inline-start: auto; flex: none; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-variant-numeric: tabular-nums; }
.install__rail-add-text { min-block-size: var(--dl-space-8); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); text-align: left; }

.install__results { display: flex; flex-direction: column; gap: var(--dl-space-2); min-height: 0; min-width: 0; }
.install__results-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--dl-space-2); }
.install__results-title { display: grid; gap: var(--dl-space-1); min-width: 0; }
.install__market-name { color: var(--dl-text-primary); font-size: var(--dl-font-size-md); font-weight: 500; line-height: var(--dl-line-snug); }
.install__market-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-1); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.install__trust[data-trust='trusted'] { color: var(--dl-accent); }

.install__search { display: flex; align-items: center; gap: var(--dl-space-2); flex: none; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); color: var(--dl-text-tertiary); }
.install__search:focus-within { border-color: var(--dl-border-strong); box-shadow: var(--dl-focus-ring); }
.install__search-input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.install__search-input::placeholder { color: var(--dl-text-tertiary); }
.install__search-input:focus { outline: none; }

.install__body { display: flex; flex-direction: column; gap: var(--dl-space-2); min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-inline-end: var(--dl-space-1); }
.install__empty { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-6) var(--dl-space-3); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); text-align: center; }
.install__empty-hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.install__list { display: grid; gap: var(--dl-space-1); }
.install__item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: var(--dl-space-3); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-base); }
.install__icon { display: grid; place-items: center; inline-size: var(--dl-space-6); block-size: var(--dl-space-6); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); color: var(--dl-text-secondary); }
.install__item-body { display: grid; gap: var(--dl-space-1); min-width: 0; }
.install__item-title { display: flex; align-items: baseline; gap: var(--dl-space-2); min-width: 0; }
.install__item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); }
.install__item-version { flex: none; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.install__item-description { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.install__item-meta { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-snug); }
.install__action { min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); white-space: nowrap; }
.install__action:hover:not(:disabled) { background: var(--dl-bg-hover); }
.install__action:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); cursor: not-allowed; }
.install__action:focus-visible { box-shadow: var(--dl-focus-ring); }
.install__more { align-self: flex-start; min-block-size: var(--dl-space-8); padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.install__more:hover { background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.install__more:focus-visible { box-shadow: var(--dl-focus-ring); }

.install__actions { display: flex; justify-content: flex-end; gap: var(--dl-space-2); flex: none; }
.install__actions .dl-btn { min-block-size: var(--dl-target-size); }

@media (max-width: 640px) {
  .install__panes { grid-template-columns: minmax(0, 1fr); }
  .install__rail { flex-direction: row; align-items: center; gap: var(--dl-space-2); padding-inline-end: 0; padding-block-end: var(--dl-space-2); border-inline-end: none; border-block-end: var(--dl-border-width) solid var(--dl-border-base); overflow-x: auto; }
  .install__rail-head { position: sticky; inset-inline-start: 0; z-index: var(--dl-z-sticky); flex: none; padding-inline-end: var(--dl-space-1); background: var(--dl-bg-elevated); }
  .install__rail-list { display: flex; flex: none; gap: var(--dl-space-1); overflow: visible; }
  .install__rail-item { inline-size: auto; min-block-size: var(--dl-target-size); }
  .install__rail-item .install__rail-name { max-inline-size: 120px; }
  .install__rail-add-text { min-block-size: var(--dl-target-size); }
  .install__item { grid-template-columns: auto minmax(0, 1fr); }
  .install__action { grid-column: 2; justify-self: start; }
}
</style>
