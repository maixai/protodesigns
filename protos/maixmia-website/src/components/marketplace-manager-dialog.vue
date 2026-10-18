<script setup lang="ts">
// 全局「插件市场」管理:市场是全局来源,自动更新是市场级策略。
//
// 这里不放插件安装清单 —— 插件属于 Agent 或项目,在各自的设置里管理。
// 本弹层只负责来源的运行状态:添加 / 移除、自动更新、立即更新。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NSkeleton } from 'naive-ui'
import type { Marketplace } from '../contracts/generated/marketplace'
import type { MarketplaceConfig } from '../contracts/generated/marketplace-config'
import { addMarketplace, listMarketplaces, removeMarketplace, setMarketplaceAutoUpdate, updateMarketplace } from '../api/workspace'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import MarketplaceAddDialog from './marketplace-add-dialog.vue'
import MarketplaceRemoveDialog from './marketplace-remove-dialog.vue'
import RowActionsMenu from './row-actions-menu.vue'
import type { RowAction } from './row-actions-menu.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ cancel: [] }>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const marketplaces = ref<Marketplace[]>([])
const status = ref<'loading' | 'ready' | 'error'>('loading')
const error = ref('')
const busyMarketplaceId = ref('')
const announcement = ref('')
const isAddOpen = ref(false)
const addBusy = ref(false)
const addError = ref('')
const removeId = ref('')
const removeBusy = ref(false)
const removeError = ref('')
let version = 0

const removeTarget = computed(() => marketplaces.value.find((item) => item.id === removeId.value))
const dialogId = `marketplace-manager-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const hintId = `${dialogId}-hint`

async function load(): Promise<void> {
  version += 1
  const current = version
  status.value = 'loading'
  const result = await listMarketplaces()
  if (current !== version) return
  if (!result.ok) {
    status.value = 'error'
    return
  }
  marketplaces.value = result.value
  status.value = 'ready'
}

function replaceMarketplace(updated: Marketplace): void {
  marketplaces.value = marketplaces.value.map((item) => (item.id === updated.id ? updated : item))
}

function isBusy(): boolean {
  return busyMarketplaceId.value !== '' || addBusy.value || removeBusy.value
}

async function onAutoUpdate(marketplaceId: string, autoUpdate: boolean): Promise<void> {
  if (isBusy()) return
  busyMarketplaceId.value = marketplaceId
  error.value = ''
  const result = await setMarketplaceAutoUpdate(marketplaceId, autoUpdate)
  busyMarketplaceId.value = ''
  if (!result.ok) {
    error.value = result.error.message
    return
  }
  replaceMarketplace(result.value)
  const template = autoUpdate ? t.value.workspace.plugins.autoUpdateOn : t.value.workspace.plugins.autoUpdateOff
  announcement.value = template.replace('{name}', result.value.name)
}

async function onUpdate(marketplaceId: string): Promise<void> {
  if (isBusy()) return
  const name = marketplaces.value.find((item) => item.id === marketplaceId)?.name ?? ''
  busyMarketplaceId.value = marketplaceId
  error.value = ''
  const result = await updateMarketplace(marketplaceId)
  busyMarketplaceId.value = ''
  if (!result.ok) {
    error.value = result.error.message
    return
  }
  replaceMarketplace(result.value)
  announcement.value = t.value.workspace.plugins.updatedMarketplace.replace('{name}', name)
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
  announcement.value = t.value.workspace.plugins.addedMarketplace.replace('{name}', result.value.name)
}

function openRemove(marketplaceId: string): void {
  removeError.value = ''
  removeId.value = marketplaceId
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
  announcement.value = t.value.workspace.plugins.removedMarketplace.replace('{name}', target.name)
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

function onAutoChange(marketplaceId: string, event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  void onAutoUpdate(marketplaceId, input.checked)
}

function menuItems(): RowAction[] {
  return [{ id: 'remove', label: t.value.workspace.plugins.removeMarketplace, tone: 'danger' }]
}

function onMenu(marketplace: Marketplace, action: string): void {
  if (action === 'remove') openRemove(marketplace.id)
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
  removeId.value = ''
  isAddOpen.value = false
  dialog.showModal()
  void load()
}, { immediate: true })

onBeforeUnmount(() => dialogRef.value?.close())
</script>

<template>
  <dialog
    ref="dialogRef" class="markets" aria-modal="true"
    :aria-labelledby="titleId" :aria-describedby="hintId"
    @cancel.prevent="finish" @click="onBackdropClick"
  >
    <div class="markets__head">
      <div class="markets__intro">
        <h2 :id="titleId" class="markets__title">{{ t.workspace.plugins.marketplaceManagerTitle }}</h2>
        <p :id="hintId" class="markets__hint">{{ t.workspace.plugins.marketplaceManagerHint }}</p>
      </div>
      <button type="button" class="markets__add" @click="openAdd">
        <span aria-hidden="true">＋</span>
        <span>{{ t.workspace.plugins.addMarketplace }}</span>
      </button>
    </div>

    <p v-if="error !== ''" class="markets__error" role="alert">{{ error }}</p>
    <p class="markets__live" aria-live="polite">{{ announcement }}</p>

    <div class="markets__body">
      <div v-if="status === 'loading'" class="markets__loading" :aria-label="t.workspace.plugins.loading">
        <NSkeleton text :repeat="3" :animated="false" />
      </div>
      <div v-else-if="status === 'error'" class="markets__state">
        <p>{{ t.workspace.plugins.marketplacesError }}</p>
        <button type="button" class="dl-btn dl-btn--ghost" @click="load">{{ t.workspace.plugins.retry }}</button>
      </div>
      <ul v-else class="markets__list">
        <li v-for="marketplace in marketplaces" :key="marketplace.id" class="marketplace" :data-marketplace="marketplace.id">
          <div class="marketplace__head">
            <div class="marketplace__identity">
              <p class="marketplace__title-row">
                <span class="marketplace__name">{{ marketplace.name }}</span>
                <span class="marketplace__trust" :data-trust="marketplace.trust">{{ t.workspace.plugins.trustLabel[marketplace.trust] }}</span>
              </p>
              <p class="marketplace__source" :title="marketplace.source">{{ marketplace.source }}</p>
            </div>
            <RowActionsMenu
              :label="t.workspace.plugins.marketplaceMoreActions.replace('{name}', marketplace.name)"
              :items="menuItems()"
              @select="onMenu(marketplace, $event)"
            />
          </div>
          <div class="marketplace__controls">
            <label class="marketplace__auto">
              <input
                type="checkbox" :checked="marketplace.autoUpdate" :disabled="busyMarketplaceId === marketplace.id"
                @change="onAutoChange(marketplace.id, $event)"
              >
              <span>{{ t.workspace.plugins.autoUpdate }}</span>
            </label>
            <button
              v-if="!marketplace.autoUpdate" type="button" class="marketplace__update"
              :aria-label="t.workspace.plugins.updateLabel.replace('{name}', marketplace.name)"
              :disabled="busyMarketplaceId === marketplace.id"
              @click="onUpdate(marketplace.id)"
            >
              <DliIcon name="sync" size="sm" />
              <span>{{ busyMarketplaceId === marketplace.id ? t.workspace.plugins.updating : t.workspace.plugins.updateNow }}</span>
            </button>
            <span class="marketplace__stats">
              <template v-if="marketplace.plugins.length > 0">
                {{ pluginCountLabel(marketplace.plugins.length) }}
                <span aria-hidden="true">·</span>
                {{ installedCountLabel(marketplace.installedCount) }}
              </template>
              <template v-else>{{ t.workspace.plugins.noPluginsSynced }}</template>
            </span>
          </div>
        </li>
      </ul>
    </div>

    <div class="markets__actions">
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
.markets {
  width: min(620px, calc(100% - 2 * var(--dl-space-6)));
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
.markets::backdrop { background-color: var(--dl-bg-sunken); }
.markets[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); }

.markets__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--dl-space-3); flex: none; }
.markets__intro { display: grid; gap: var(--dl-space-1); min-width: 0; }
.markets__title { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.markets__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.markets__add { display: inline-flex; flex: none; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-control-height); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); white-space: nowrap; }
.markets__add:hover { background: var(--dl-bg-hover); }
.markets__add:focus-visible { box-shadow: var(--dl-focus-ring); }

.markets__error { color: var(--dl-error); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
.markets__live { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.markets__body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-inline-end: var(--dl-space-1); }
.markets__loading { padding-block: var(--dl-space-2); }
.markets__state { display: grid; justify-items: start; gap: var(--dl-space-2); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
.markets__list { display: grid; gap: var(--dl-space-3); }
.marketplace { display: grid; gap: var(--dl-space-1); padding-block-end: var(--dl-space-3); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.marketplace:last-child { padding-block-end: 0; border-block-end: none; }
.marketplace__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--dl-space-2); }
.marketplace__identity { display: grid; gap: var(--dl-space-1); min-width: 0; }
.marketplace__title-row { display: flex; align-items: baseline; gap: var(--dl-space-2); min-width: 0; }
.marketplace__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; line-height: var(--dl-line-snug); }
.marketplace__trust { flex: none; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); }
.marketplace__trust[data-trust='trusted'] { color: var(--dl-accent); }
.marketplace__source { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.marketplace__controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dl-space-2); }
.marketplace__auto { display: inline-flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-space-6); color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); white-space: nowrap; cursor: pointer; }
.marketplace__auto input { inline-size: var(--dl-icon-md); block-size: var(--dl-icon-md); accent-color: var(--dl-accent); }
.marketplace__auto input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.marketplace__update { display: inline-flex; align-items: center; gap: var(--dl-space-1); min-block-size: var(--dl-space-6); padding-inline: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); white-space: nowrap; }
.marketplace__update:hover:not(:disabled) { border-color: var(--dl-border-strong); background: var(--dl-bg-hover); color: var(--dl-text-primary); }
.marketplace__update:disabled { color: var(--dl-text-disabled); cursor: not-allowed; }
.marketplace__update:focus-visible { box-shadow: var(--dl-focus-ring); }
.marketplace__stats { margin-inline-start: auto; color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); white-space: nowrap; font-variant-numeric: tabular-nums; }

.markets__actions { display: flex; justify-content: flex-end; flex: none; }
.markets__actions .dl-btn { min-block-size: var(--dl-target-size); }

@media (max-width: 560px) {
  .markets__head { flex-direction: column; align-items: stretch; }
  .markets__add { justify-content: center; }
  .marketplace__stats { margin-inline-start: 0; }
}
@media (max-width: 1023px) {
  .markets__add, .marketplace__auto, .marketplace__update { min-block-size: var(--dl-target-size); }
}
</style>
