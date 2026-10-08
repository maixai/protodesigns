<script setup lang="ts">
// 沿用语言切换器的 disclosure:原生按钮 + role=group,不采用 ARIA menu 或 NDropdown。
// Enter/Space 打开并聚焦首项,Tab 按 DOM 序移动,Esc 还焦点,失焦/外部点击关闭。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import { session, signOut } from '../auth/session'
import { useI18n } from '../i18n'
import { navigateTo } from '../router'
import DlIcon from './dl-icon.vue'

const emit = defineEmits<{ signedOut: [] }>()
const { t } = useI18n()
const message = useMessage()
const profile = computed(() => session.value.profile)
const initials = computed(() => profile.value?.name.split(/\s+/).map((part) => part[0] ?? '').slice(0, 2).join('').toUpperCase() ?? '')
const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLDialogElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)
const confirmRef = ref<HTMLButtonElement | null>(null)

async function open(focusFirst: boolean): Promise<void> {
  if (isOpen.value) return
  isOpen.value = true
  if (!focusFirst) return
  await nextTick()
  popoverRef.value?.querySelector('button')?.focus()
}

function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  // v-if 离场期间弹层还在 DOM;先 inert,避免 Tab 落进正在淡出的选项。
  if (popoverRef.value !== null) popoverRef.value.inert = true
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function onTriggerClick(event: MouseEvent): void {
  if (isOpen.value) { close(false); return }
  void open(event.detail === 0)
}

function onConsole(): void {
  close(true)
  navigateTo('console')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !isOpen.value) return
  event.preventDefault()
  close(true)
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  close(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && rootRef.value?.contains(target) === true) return
  close(false)
}

function requestSignOut(): void {
  close(true)
  // 原生 dialog 提供 top layer 与背景 inert,另补首尾 Tab 循环,不依赖组件库菜单的焦点行为。
  dialogRef.value?.showModal()
  cancelRef.value?.focus()
}

function cancelSignOut(): void {
  dialogRef.value?.close()
  triggerRef.value?.focus()
}

function onDialogCancel(event: Event): void {
  event.preventDefault()
  cancelSignOut()
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  if (event.shiftKey && document.activeElement === cancelRef.value) {
    event.preventDefault()
    confirmRef.value?.focus()
  } else if (!event.shiftKey && document.activeElement === confirmRef.value) {
    event.preventDefault()
    cancelRef.value?.focus()
  }
}

function confirmSignOut(): void {
  dialogRef.value?.close()
  signOut()
  navigateTo('home')
  message.success(t.value.account.farewell)
  emit('signedOut')
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => {
  dialogRef.value?.close()
  document.removeEventListener('pointerdown', onDocumentPointerDown)
})
</script>

<template>
  <div ref="rootRef" class="account-menu" @focusout="onFocusOut" @keydown="onKeydown">
    <button ref="triggerRef" type="button" class="account-menu__trigger" :aria-expanded="isOpen" aria-controls="account-popover" aria-haspopup="true" :aria-label="`${t.account.menu}: ${profile?.name ?? ''}`" @click="onTriggerClick">
      <span class="account-menu__avatar" aria-hidden="true">{{ initials }}</span>
      <span class="account-menu__name">{{ profile?.name }}</span>
      <svg class="account-menu__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9.5l6 6 6-6" stroke="currentColor" stroke-width="var(--dl-icon-stroke)" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <Transition name="account-pop">
      <div v-if="isOpen" id="account-popover" ref="popoverRef" class="account-menu__popover" role="group" :aria-label="t.account.menu">
        <div class="account-menu__identity" role="group" :aria-label="t.account.identity">
          <p>{{ profile?.name }}</p>
          <p class="account-menu__email">{{ profile?.email }}</p>
        </div>
        <div class="account-menu__separator" aria-hidden="true" />
        <button type="button" class="account-menu__option" @click="onConsole"><DlIcon name="grid" size="sm" />{{ t.account.console }}</button>
        <div class="account-menu__separator" aria-hidden="true" />
        <button type="button" class="account-menu__option" @click="requestSignOut"><DlIcon name="forward" size="sm" />{{ t.account.signOut }}</button>
      </div>
    </Transition>
    <dialog ref="dialogRef" class="account-dialog" aria-labelledby="signout-title" aria-describedby="signout-description" @cancel="onDialogCancel" @keydown="onDialogKeydown">
      <h2 id="signout-title">{{ t.account.confirmTitle }}</h2>
      <p id="signout-description">{{ t.account.confirmDescription }}</p>
      <div class="account-dialog__actions">
        <button ref="cancelRef" type="button" class="dl-btn dl-btn--ghost" autofocus @click="cancelSignOut">{{ t.account.cancel }}</button>
        <button ref="confirmRef" type="button" class="dl-btn dl-btn--primary" @click="confirmSignOut">{{ t.account.confirm }}</button>
      </div>
    </dialog>
  </div>
</template>

<style scoped>
.account-menu { position: relative; }
.account-menu__trigger {
  display: inline-flex; align-items: center; gap: var(--dl-space-2);
  min-width: var(--dl-target-size); min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-2); border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary); font-size: var(--dl-font-size-sm);
}
.account-menu__trigger:hover, .account-menu__option:hover { background-color: var(--dl-bg-hover); }
.account-menu__trigger:active, .account-menu__option:active { background-color: var(--dl-bg-active); }
.account-menu__trigger:focus-visible, .account-menu__option:focus-visible, .account-dialog button:focus-visible { box-shadow: var(--dl-focus-ring); }
.account-menu__trigger:disabled, .account-menu__option:disabled { color: var(--dl-text-disabled); background-color: var(--dl-bg-sunken); cursor: not-allowed; }
.account-menu__avatar {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: var(--dl-control-height); height: var(--dl-control-height);
  border-radius: var(--dl-radius-pill); background-color: var(--dl-accent-soft);
  color: var(--dl-accent); font-weight: 500; font-family: var(--dl-font-mono);
}
.account-menu__name { white-space: nowrap; }
.account-menu__chevron { width: var(--dl-icon-sm); height: var(--dl-icon-sm); color: var(--dl-text-secondary); transition: transform var(--dl-duration-fast) var(--dl-ease-standard); }
.account-menu__trigger[aria-expanded='true'] .account-menu__chevron { transform: rotate(180deg); }
.account-menu__popover {
  position: absolute; inset-block-start: calc(100% + var(--dl-space-1)); inset-inline-end: 0;
  z-index: var(--dl-z-overlay); display: flex; flex-direction: column;
  width: min(calc(var(--dl-space-12) * 6), calc(100vw - var(--dl-space-12)));
  padding: var(--dl-space-1); background-color: var(--dl-bg-elevated);
  border-radius: var(--dl-radius-md); box-shadow: var(--dl-shadow-md);
}
.account-menu__identity { padding: var(--dl-space-3); color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
.account-menu__email { overflow-wrap: anywhere; }
.account-menu__separator { height: var(--dl-border-width); margin-block: var(--dl-space-1); background-color: var(--dl-border-base); }
.account-menu__option {
  display: flex; align-items: center; gap: var(--dl-space-2);
  min-width: var(--dl-target-size); min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-3); border-radius: var(--dl-radius-sm);
  text-align: left; color: var(--dl-text-primary); font-size: var(--dl-font-size-sm);
}
.account-pop-enter-active, .account-pop-leave-active { transition: opacity var(--dl-duration-base) var(--dl-ease-standard), transform var(--dl-duration-base) var(--dl-ease-standard); }
.account-pop-enter-from, .account-pop-leave-to { opacity: 0; transform: translateY(calc(-1 * var(--dl-space-1))); }
.account-dialog {
  width: min(var(--dl-measure), calc(100% - var(--dl-space-12)));
  max-height: calc(100dvh - var(--dl-space-12)); overflow: auto;
  padding: var(--dl-space-6); border: none; border-radius: var(--dl-radius-lg);
  background-color: var(--dl-bg-elevated); color: var(--dl-text-primary);
  box-shadow: var(--dl-shadow-lg); text-align: left;
}
.account-dialog::backdrop { background-color: var(--dl-text-primary); opacity: 0.45; }
.account-dialog h2 { font-size: var(--dl-font-size-xl); font-weight: 600; line-height: var(--dl-line-body); }
.account-dialog p { margin-block-start: var(--dl-space-3); color: var(--dl-text-secondary); }
.account-dialog__actions { display: flex; flex-wrap: wrap; gap: var(--dl-space-3); margin-block-start: var(--dl-space-6); }
.account-dialog .dl-btn { min-width: var(--dl-target-size); min-height: var(--dl-target-size); }
@media (max-width: 559px) {
  .account-menu__name, .account-menu__chevron { display: none; }
  .account-menu__trigger { padding-inline: var(--dl-space-1); }
}
</style>
