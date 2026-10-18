<script setup lang="ts">
// 「安装插件」弹层:主视图只列已安装插件,可安装项集中到这里。
//
// 按市场分组:安装目标的作用域就是市场的作用域,组头直接写明「安装到 USER」,
// 用户不必在每一行重复判断。安装后该行从弹层消失(主视图接手),弹层保持打开以便连续安装。
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Marketplace } from '../contracts/generated/marketplace'
import type { Plugin } from '../contracts/generated/plugin'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'
import { toIconName } from '../data/icons'

const props = defineProps<{
  open: boolean
  marketplaces: readonly Marketplace[]
  busyPluginId: string
}>()
const emit = defineEmits<{
  install: [marketplaceId: string, pluginId: string]
  cancel: []
}>()

const { t } = useI18n()
const dialogRef = ref<HTMLDialogElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const returnFocusRef = ref<HTMLElement | null>(null)
const query = ref('')
const dialogId = `plugin-install-${Math.random().toString(36).slice(2)}`
const titleId = `${dialogId}-title`
const hintId = `${dialogId}-hint`

const needle = computed(() => query.value.trim().toLowerCase())

function matches(plugin: Plugin): boolean {
  if (needle.value === '') return true
  return [plugin.name, plugin.description, plugin.publisher, plugin.id]
    .some((field) => field.toLowerCase().includes(needle.value))
}

interface InstallGroup {
  marketplace: Marketplace
  plugins: Plugin[]
}

// 组匹配:搜市场名 / 来源时保留整组;否则只保留命中查询的可安装插件。
const groups = computed<InstallGroup[]>(() => props.marketplaces.flatMap((marketplace) => {
  const available = marketplace.plugins.filter((plugin) => !plugin.installed)
  const marketplaceMatches = needle.value !== '' && [marketplace.name, marketplace.source]
    .some((field) => field.toLowerCase().includes(needle.value))
  const plugins = marketplaceMatches ? available : available.filter(matches)
  return plugins.length === 0 ? [] : [{ marketplace, plugins }]
}))
const totalAvailable = computed(() => props.marketplaces.reduce((sum, marketplace) => sum + marketplace.plugins.filter((plugin) => !plugin.installed).length, 0))
const hasMarketplaces = computed(() => props.marketplaces.length > 0)

function scopeLabel(marketplace: Marketplace): string {
  return t.value.workspace.plugins.scopeLabel[marketplace.scope]
}

function componentsLabel(plugin: Plugin): string {
  return plugin.components.map((component) => t.value.workspace.plugins.components[component]).join(' · ')
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
    return
  }
  const active = document.activeElement
  returnFocusRef.value = active instanceof HTMLElement ? active : null
  query.value = ''
  dialog.showModal()
  searchRef.value?.focus()
}, { immediate: true })

// 安装完成后被点的按钮会随行消失:焦点若已丢失,送回搜索框,不让它掉到 body。
watch(() => props.marketplaces, async (): Promise<void> => {
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
      <h2 :id="titleId" class="install__title">{{ t.workspace.plugins.installTitle }}</h2>
      <p :id="hintId" class="install__hint">{{ t.workspace.plugins.installHint }}</p>
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
      <p v-if="!hasMarketplaces" class="install__empty">
        <span>{{ t.workspace.plugins.installNoMarketplaces }}</span>
        <span class="install__empty-hint">{{ t.workspace.plugins.installNoMarketplacesHint }}</span>
      </p>
      <p v-else-if="totalAvailable === 0" class="install__empty">{{ t.workspace.plugins.installEmpty }}</p>
      <p v-else-if="groups.length === 0" class="install__empty">{{ t.workspace.plugins.installNoMatch }}</p>
      <template v-else>
      <section v-for="group in groups" :key="group.marketplace.id" class="install__group">
        <h3 class="install__group-title">
          <span class="install__group-name">{{ group.marketplace.name }}</span>
          <span class="install__scope">{{ t.workspace.plugins.installScope.replace('{scope}', scopeLabel(group.marketplace)) }}</span>
        </h3>
        <ul class="install__list">
          <li v-for="plugin in group.plugins" :key="plugin.id" class="install__item">
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
              :disabled="busyPluginId === plugin.id"
              @click="emit('install', group.marketplace.id, plugin.id)"
            >
              {{ busyPluginId === plugin.id ? t.workspace.plugins.installing : t.workspace.plugins.install }}
            </button>
          </li>
        </ul>
      </section>
      </template>
    </div>

    <div class="install__actions">
      <button type="button" class="dl-btn dl-btn--ghost" @click="finish">{{ t.workspace.plugins.done }}</button>
    </div>
  </dialog>
</template>

<style scoped>
.install {
  width: min(600px, calc(100% - 2 * var(--dl-space-6)));
  max-height: calc(100% - 2 * var(--dl-space-6));
  margin: auto;
  padding: var(--dl-space-6);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-xl);
  background-color: var(--dl-bg-elevated);
  color: var(--dl-text-primary);
  font: inherit;
  text-align: left;
}
.install { color-scheme: dark; }
.install::backdrop { background-color: var(--dl-bg-sunken); }
.install[open] { display: flex; flex-direction: column; gap: var(--dl-space-4); }

.install__head { display: grid; gap: var(--dl-space-1); }
.install__title { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-snug); }
.install__hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.install__search { display: flex; align-items: center; gap: var(--dl-space-2); flex: none; min-block-size: var(--dl-target-size); padding-inline: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); background: var(--dl-bg-sunken); color: var(--dl-text-tertiary); }
.install__search:focus-within { border-color: var(--dl-border-strong); box-shadow: var(--dl-focus-ring); }
.install__search-input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--dl-text-primary); font: inherit; font-size: var(--dl-font-size-sm); line-height: var(--dl-line-body); }
.install__search-input::placeholder { color: var(--dl-text-tertiary); }
.install__search-input:focus { outline: none; }

.install__body { display: flex; flex-direction: column; gap: var(--dl-space-4); min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-inline-end: var(--dl-space-1); }
.install__empty { display: grid; gap: var(--dl-space-1); padding: var(--dl-space-6) var(--dl-space-3); border: var(--dl-border-width) dashed var(--dl-border-base); border-radius: var(--dl-radius-md); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); text-align: center; }
.install__empty-hint { color: var(--dl-text-tertiary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }

.install__group { display: grid; gap: var(--dl-space-2); }
.install__group-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--dl-space-2); }
.install__group-name { color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); font-weight: 500; }
.install__scope { color: var(--dl-text-tertiary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); letter-spacing: var(--dl-tracking-caps); }

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

.install__actions { display: flex; justify-content: flex-end; gap: var(--dl-space-2); flex: none; }
.install__actions .dl-btn { min-block-size: var(--dl-target-size); }

@media (max-width: 560px) {
  .install__item { grid-template-columns: auto minmax(0, 1fr); }
  .install__action { grid-column: 2; justify-self: start; }
}
</style>
