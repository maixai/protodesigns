<script setup lang="ts">
// 一级菜单只派发分区入口；抽屉与身份动作由外层管理。
import { computed, nextTick, ref } from 'vue'
import { session, signOut } from '../auth/session'
import { requestIdentityLock } from '../auth/identity'
import { useI18n } from '../i18n'
import { toInitials } from './account-avatar'
import DliIcon from './dl-icon.vue'
import ConfirmDialog from './confirm-dialog.vue'

const emit = defineEmits<{ close: []; open: [section: 'accountSecurity' | 'languageRegion' | 'shortcuts'] }>()
const { t, locale } = useI18n()
const profile = computed(() => session.value.profile)
const root = ref<HTMLElement | null>(null)
const isConfirmOpen = ref(false)

async function lockConsole(): Promise<void> {
  emit('close')
  await nextTick()
  requestIdentityLock()
}
function requestSignOut(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
  isConfirmOpen.value = true
}
async function confirmSignOut(): Promise<void> {
  isConfirmOpen.value = false
  emit('close')
  signOut()
  await nextTick()
  document.querySelector<HTMLButtonElement>('.site-header .dl-btn--primary')?.focus()
}
function onKeydown(event: KeyboardEvent): void {
  event.stopPropagation()
  // 原生 dialog 的 cancel 与焦点陷阱独立处理，不把 Esc 传给底层导航。
  if (isConfirmOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  const buttons = [...(root.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    .filter((button) => button.getClientRects().length > 0 && button.tabIndex !== -1)
  if (buttons.length === 0) return
  const index = buttons.findIndex((button) => button === document.activeElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
    : event.key === 'ArrowDown' ? (index + 1) % buttons.length : index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length
  event.preventDefault()
  buttons[next]?.focus()
}
</script>

<template>
  <div ref="root" class="global-settings" tabindex="-1" @keydown="onKeydown">

      <div class="global-settings__identity">
        <span class="global-settings__avatar" aria-hidden="true">{{ toInitials(profile?.name ?? '') }}</span>
        <div class="global-settings__profile">
          <span class="global-settings__name">{{ profile?.name }}</span>
          <span class="global-settings__email">{{ profile?.email }}</span>
        </div>
      </div>
      <section aria-labelledby="settings-account-label">
        <h3 id="settings-account-label">{{ t.workspace.settings.groups.account }}</h3>
        <button type="button" data-settings-section="accountSecurity" @click="emit('open', 'accountSecurity')"><DliIcon name="badge" /><span>{{ t.workspace.settings.accountSecurity }}</span></button>
      </section>
      <section aria-labelledby="settings-preferences-label">
        <h3 id="settings-preferences-label">{{ t.workspace.settings.groups.preferences }}</h3>
        <button type="button" data-settings-section="languageRegion" @click="emit('open', 'languageRegion')"><DliIcon name="sliders" /><span>{{ t.workspace.settings.languageRegion }}</span><small>{{ t.workspace.settings.languages[locale] }}</small></button>
        <button type="button" data-settings-section="shortcuts" @click="emit('open', 'shortcuts')"><DliIcon name="code" /><span>{{ t.workspace.settings.shortcuts }}</span></button>
      </section>
      <div class="global-settings__signout"><button type="button" @click="lockConsole"><DliIcon name="lock" /><span>{{ t.workspace.settings.lockConsole }}</span></button><button type="button" class="global-settings__danger" @click="requestSignOut"><DliIcon name="power" /><span>{{ t.account.signOut }}</span></button></div>
    <ConfirmDialog :open="isConfirmOpen" @cancel="isConfirmOpen = false" @confirm="confirmSignOut" />
  </div>
</template>

<style scoped>
.global-settings { color: var(--dl-text-primary); line-height: var(--dl-line-body); }
.global-settings:focus { outline: none; }
.global-settings__identity { display: flex; align-items: center; gap: var(--dl-space-3); padding: var(--dl-space-3) var(--dl-space-2); }
.global-settings__avatar { display: grid; place-items: center; flex: none; inline-size: calc(var(--dl-space-8) + var(--dl-space-2)); block-size: calc(var(--dl-space-8) + var(--dl-space-2)); border: var(--dl-border-width) solid var(--dl-border-strong); border-radius: var(--dl-radius-pill); font-weight: 500; }
.global-settings__profile { display: grid; min-inline-size: 0; gap: var(--dl-space-1); }
.global-settings__name { font-size: var(--dl-font-size-md); font-weight: 500; }
.global-settings__email { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); color: var(--dl-text-secondary); overflow-wrap: anywhere; }
section { padding-block: var(--dl-space-2); border-block-start: var(--dl-border-width) solid var(--dl-border-base); }
h3 { padding-inline: var(--dl-space-2); margin-block-end: var(--dl-space-1); font-size: var(--dl-font-size-xs); font-weight: 400; color: var(--dl-text-tertiary); letter-spacing: var(--dl-tracking-label); }
button { display: flex; align-items: center; gap: var(--dl-space-2); inline-size: 100%; min-block-size: var(--dl-target-size); padding: var(--dl-space-2); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); font-size: var(--dl-font-size-sm); text-align: left; }
button > span { flex: 1; min-inline-size: 0; }
button > .dl-icon { flex: none; color: var(--dl-text-secondary); }
small { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); }
button:hover { background: var(--dl-bg-hover); }
button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
button:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { background: var(--dl-bg-sunken); color: var(--dl-text-disabled); cursor: not-allowed; transform: none; }
.global-settings__signout { border-block-start: var(--dl-border-width) solid var(--dl-border-base); padding-block-start: var(--dl-space-2); }
.global-settings__danger, .global-settings__danger .dl-icon { color: var(--dl-error); }
@media (prefers-reduced-motion: reduce) { button:active { transform: none; } }
</style>
