<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { IdentityVault } from '../contracts/generated/identity-vault'
import type { DeviceUnlockCapability } from '../contracts/generated/device-unlock-capability'
import { getDeviceUnlockCapability, getIdentityVault } from '../api/workspace'
import { session } from '../auth/session'
import { useI18n } from '../i18n'
import { toInitials } from './account-avatar'
import DliIcon from './dl-icon.vue'
import AccountSecurity from './account-security.vue'

const props = defineProps<{ section: 'accountSecurity' | 'languageRegion' | 'shortcuts' }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale, setLocale } = useI18n()
const copy = computed(() => t.value.workspace.settings)
const profile = computed(() => session.value.profile)
const dialog = ref<HTMLDialogElement | null>(null)
const heading = ref<HTMLElement | null>(null)
const state = ref<{ status: 'loading' } | { status: 'error' } | { status: 'ready'; vault: IdentityVault; capability: DeviceUnlockCapability }>({ status: 'loading' })
const lifetime = { isAlive: true }
const shortcutGroups = ['navigation', 'window', 'editing'] satisfies (keyof typeof copy.value.shortcutGroups)[]
// 只判断修饰键，不把平台字符串当作完整的操作系统识别结果。
function readShortcutModifier(): '⌘' | 'Ctrl' | 'Ctrl/Cmd' {
  const data: unknown = 'userAgentData' in navigator ? navigator.userAgentData : undefined
  const platform = typeof data === 'object' && data !== null && 'platform' in data && typeof data.platform === 'string' ? data.platform : undefined
  const hint = platform ?? navigator.platform ?? navigator.userAgent
  if (hint.trim() === '') return 'Ctrl/Cmd'
  return /mac|iphone|ipad|ipod/i.test(hint) ? '⌘' : 'Ctrl'
}
const shortcutModifier = readShortcutModifier()
const shortcutPlatform = computed(() => shortcutModifier === '⌘' ? copy.value.shortcutPlatformApple
  : shortcutModifier === 'Ctrl' ? copy.value.shortcutPlatformOther : copy.value.shortcutPlatform)


async function load(): Promise<void> {
  state.value = { status: 'loading' }
  const [vaultResult, capabilityResult] = await Promise.all([getIdentityVault(), getDeviceUnlockCapability()])
  if (!lifetime.isAlive) return
  state.value = vaultResult.ok && capabilityResult.ok
    ? { status: 'ready', vault: vaultResult.value, capability: capabilityResult.value }
    : { status: 'error' }
}
function close(): void {
  dialog.value?.close()
  emit('close')
}
function onBackdrop(event: MouseEvent): void {
  if (event.target !== dialog.value || dialog.value === null) return
  const rect = dialog.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
onMounted(() => {
  dialog.value?.showModal()
  heading.value?.focus({ preventScroll: true })
  if (props.section === 'accountSecurity') void load()
})
onBeforeUnmount(() => { lifetime.isAlive = false; dialog.value?.close() })
</script>

<template>
  <dialog id="workspace-settings-drawer" ref="dialog" class="settings-drawer dl-modal-scrim" :data-section="section" aria-modal="true" aria-labelledby="workspace-settings-drawer-title" @cancel.prevent="close" @click="onBackdrop" @keydown.stop>
    <header class="settings-drawer__header">
      <div class="settings-drawer__titles">
        <p class="settings-drawer__eyebrow">{{ copy.title }}</p>
        <h2 id="workspace-settings-drawer-title" ref="heading" tabindex="-1">{{ copy[section] }}</h2>
      </div>
      <button type="button" class="settings-drawer__close" data-settings-close :aria-label="copy.close" @click="close"><DliIcon name="close" /></button>
    </header>
    <div class="settings-drawer__body">
      <template v-if="section === 'accountSecurity'">
        <div class="settings-drawer__identity">
          <span class="settings-drawer__avatar" aria-hidden="true">{{ toInitials(profile?.name ?? '') }}</span>
          <div><p class="settings-drawer__name">{{ profile?.name }}</p><p class="settings-drawer__mono settings-drawer__muted">{{ profile?.email }}</p></div>
        </div>
        <p v-if="state.status === 'loading'" role="status" class="settings-drawer__muted">{{ copy.loading }}</p>
        <div v-else-if="state.status === 'error'" class="settings-drawer__section"><p role="alert">{{ copy.loadError }}</p><button type="button" class="settings-drawer__button" @click="load">{{ copy.retry }}</button></div>
        <AccountSecurity v-else :vault="state.vault" :capability="state.capability" @updated="state.status === 'ready' && (state.vault = $event)" />
      </template>
      <template v-else-if="section === 'languageRegion'">
        <div class="settings-drawer__section settings-drawer__languages" role="group" :aria-label="copy.languageRegion">
          <label class="settings-drawer__language">
            <input type="radio" name="settings-locale" value="zh-CN" :checked="locale === 'zh-CN'" @change="setLocale('zh-CN')">
            <span>{{ copy.languages['zh-CN'] }}</span><span class="settings-drawer__mono" aria-hidden="true">zh-CN</span>
          </label>
          <label class="settings-drawer__language">
            <input type="radio" name="settings-locale" value="en" :checked="locale === 'en'" @change="setLocale('en')">
            <span>{{ copy.languages.en }}</span><span class="settings-drawer__mono" aria-hidden="true">en</span>
          </label>
        </div>
        <p class="settings-drawer__muted">{{ copy.languageHint }}</p>
      </template>
      <div v-else class="settings-drawer__section" data-settings-shortcuts>
        <p class="settings-drawer__muted">{{ shortcutPlatform }}</p>
        <table v-for="group in shortcutGroups" :key="group">
          <caption>{{ copy.shortcutGroups[group] }}</caption>
          <tbody><tr v-for="shortcut in copy.shortcutsList.filter((item) => item.group === group)" :key="shortcut.keys"><th scope="row">{{ shortcut.label }}</th><td><kbd>{{ shortcut.keys.replaceAll('Ctrl/Cmd', shortcutModifier) }}</kbd></td></tr></tbody>
        </table>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.settings-drawer { position: fixed; inset: 0 auto 0 0; margin: 0; padding: 0; inline-size: 100vw; max-inline-size: 100vw; block-size: 100dvh; max-block-size: 100dvh; border: 0; border-inline-end: var(--dl-border-width) solid var(--dl-border-base); border-radius: 0 var(--dl-radius-xl) var(--dl-radius-xl) 0; background: var(--dl-bg-elevated); color: var(--dl-text-primary); box-shadow: var(--dl-shadow-lg); font-family: var(--dl-font-sans); font-size: var(--dl-font-size-md); line-height: var(--dl-line-body); text-align: left; overflow: hidden; }
.settings-drawer[data-section="accountSecurity"] { inline-size: clamp(600px, 44vw, 680px); }
.settings-drawer[data-section="shortcuts"] { inline-size: clamp(520px, 38vw, 600px); }
.settings-drawer[data-section="languageRegion"] { inline-size: clamp(440px, 32vw, 520px); }
.settings-drawer[open] { display: flex; flex-direction: column; animation: settings-drawer-in var(--dl-duration-slow) var(--dl-ease-standard); }
.settings-drawer__header { display: flex; flex: none; align-items: center; gap: var(--dl-space-4); padding: var(--dl-space-6); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.settings-drawer__titles { flex: 1; min-inline-size: 0; }
.settings-drawer__eyebrow { font-size: var(--dl-font-size-xs); color: var(--dl-text-tertiary); margin-block-end: var(--dl-space-1); }
h2 { inline-size: fit-content; max-inline-size: 100%; font-size: var(--dl-font-size-lg); font-weight: 500; line-height: var(--dl-line-body); }
h3, caption { font-size: var(--dl-font-size-md); font-weight: 500; }
.settings-drawer__body { flex: 1; min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-6); display: flex; flex-direction: column; gap: var(--dl-space-6); }
.settings-drawer__body > * { flex: none; min-inline-size: 0; }
.settings-drawer__section { display: flex; flex-direction: column; gap: var(--dl-space-3); }
.settings-drawer__identity { display: flex; align-items: center; gap: var(--dl-space-3); }
.settings-drawer__identity > div { min-inline-size: 0; }
.settings-drawer__avatar { display: grid; place-items: center; flex: none; inline-size: calc(var(--dl-space-8) + var(--dl-space-2)); block-size: calc(var(--dl-space-8) + var(--dl-space-2)); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-pill); font-weight: 500; }
.settings-drawer__name { font-weight: 500; }
.settings-drawer__muted, dt { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.settings-drawer__mono, time, kbd { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.settings-drawer__passkeys { list-style: none; padding: 0; margin: 0; border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); }
.settings-drawer__passkeys li { padding: var(--dl-space-3); overflow-wrap: anywhere; }
.settings-drawer__passkeys li + li { border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
.settings-drawer__facts { display: grid; gap: var(--dl-space-3); margin: 0; }
dd { margin: 0; }
button { display: inline-flex; align-items: center; gap: var(--dl-space-2); min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); text-align: left; }
.settings-drawer__close { flex: none; justify-content: center; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); padding: 0; }
.settings-drawer__button { padding: var(--dl-space-2) var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); }
button:hover, .settings-drawer__language:hover { background: var(--dl-bg-hover); }
button:focus-visible, input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
/* 抽屉标题只是打开时的读屏落点，不是可操作控件；不加焦点环，避免看起来像输入框。 */
h2:focus-visible { outline: none; box-shadow: none; }
button:active, .settings-drawer__language:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); cursor: not-allowed; transform: none; }
.settings-drawer__languages { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.settings-drawer__language { display: flex; align-items: center; gap: var(--dl-space-3); min-block-size: var(--dl-target-size); padding: var(--dl-space-3); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-md); cursor: pointer; }
.settings-drawer__language:has(:checked) { border-color: var(--dl-accent); background: var(--dl-accent-soft); }
.settings-drawer__language input { margin: 0; accent-color: var(--dl-accent); inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); flex: none; }
.settings-drawer__language > span:last-child { margin-inline-start: auto; color: var(--dl-text-secondary); }
table { inline-size: 100%; border-collapse: collapse; table-layout: fixed; }
caption { text-align: left; padding-block: var(--dl-space-3); }
th, td { text-align: left; padding: var(--dl-space-3) 0; border-block-end: var(--dl-border-width) solid var(--dl-border-base); vertical-align: top; font-size: var(--dl-font-size-sm); font-weight: 400; overflow-wrap: anywhere; }
th { inline-size: 55%; padding-inline-end: var(--dl-space-3); }
td { text-align: end; }
kbd { display: inline-block; max-inline-size: 100%; padding: var(--dl-space-1) var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); }
@keyframes settings-drawer-in { from { transform: translateX(-100%); opacity: 0; } to { transform: none; opacity: 1; } }
@media (max-width: 767px) { .settings-drawer[data-section] { inline-size: 100vw; border-radius: 0; } }
@media (prefers-reduced-motion: reduce) { .settings-drawer[open] { animation: none; } button:active, .settings-drawer__language:active { transform: none; } }
</style>
