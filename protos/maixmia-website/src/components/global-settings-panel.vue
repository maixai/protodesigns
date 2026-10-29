<script setup lang="ts">
// 一级菜单只派发分区入口；抽屉与身份动作由外层管理。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { accountName, session, signOut } from '../auth/session'
import { requestIdentityLock } from '../auth/identity'
import { useI18n } from '../i18n'
import AccountAvatar from './account-avatar.vue'
import DliIcon from './dl-icon.vue'
import ConfirmDialog from './confirm-dialog.vue'

const emit = defineEmits<{ close: []; open: [section: 'accountSecurity' | 'shortcuts'] }>()
const { t, locale, setLocale } = useI18n()
const profile = computed(() => session.value.profile)
const root = ref<HTMLElement | null>(null)
const isConfirmOpen = ref(false)
const isLanguageOpen = ref(false)
const languageTrigger = ref<HTMLButtonElement | null>(null)
const languageMenu = ref<HTMLElement | null>(null)
const languageMenuStyle = ref<Record<string, string>>({})
const scrollHost = ref<HTMLElement | null>(null)
// 浮层与面板 / 视口边缘的距离:定位是几何运算,不是视觉取值(与 --dl-space-2 同量级)。
const VIEW_PADDING = 8

// 设置面板本体:二级菜单相对它的右缘浮出。相对语言行浮出会贴着面板内边距,
// 两层之间没有呼吸,也读不出「由这一行派生」。
function settingsPanel(): HTMLElement | null {
  return root.value?.closest<HTMLElement>('.workspace-dock__panel') ?? null
}

// 定位:先渲染再量尺寸,才知道该不该横向夹回视口。
async function placeLanguageMenu(): Promise<void> {
  await nextTick()
  const trigger = languageTrigger.value
  const menu = languageMenu.value
  const panel = settingsPanel()
  if (trigger === null || menu === null || panel === null) return
  const panelRect = panel.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  const menuRect = menu.getBoundingClientRect()
  // 默认浮在面板右缘之外,纵向与语言行对齐。
  const flushLeft = panelRect.right + VIEW_PADDING
  const fitsRight = flushLeft + menuRect.width <= window.innerWidth - VIEW_PADDING
  // 右侧放不下(窄屏面板几乎满宽)时改为贴在语言行下方 —— 横向夹回视口会盖住父行,
  // 看不出这层是从哪一行展开的。两种摆法都不改变面板自身尺寸。
  const left = fitsRight ? flushLeft : Math.max(VIEW_PADDING, window.innerWidth - menuRect.width - VIEW_PADDING)
  const preferredTop = fitsRight ? triggerRect.top : triggerRect.bottom + VIEW_PADDING
  // 纵向超出视口则上移,保证整块可见。
  const top = Math.max(VIEW_PADDING, Math.min(preferredTop, window.innerHeight - menuRect.height - VIEW_PADDING))
  languageMenuStyle.value = { left: `${left}px`, top: `${top}px` }
}

async function toggleLanguage(): Promise<void> {
  clearHoverTimers()
  if (isLanguageOpen.value) {
    // 悬停已经替用户打开了:这次点击把控制权交给焦点,不再收起。
    if (openedByHover) {
      openedByHover = false
      focusCheckedLanguage()
      return
    }
    void closeLanguage()
    return
  }
  isLanguageOpen.value = true
  await placeLanguageMenu()
  focusCheckedLanguage()
}
async function closeLanguage(restoreFocus = true): Promise<void> {
  openedByHover = false
  // 先把焦点留在根菜单内，避免 radio 卸载触发外层 focusout 关闭整棵菜单。
  if (restoreFocus) languageTrigger.value?.focus()
  isLanguageOpen.value = false
  await nextTick()
}
// 悬停开合只服务鼠标:触屏的 pointerenter 紧跟 click,两者会互相打架。
// 开合各留一段宽限 —— 横向穿过语言行不误开,移进浮层时跨过的间隙也不误关。
const HOVER_OPEN_DELAY = 200
const HOVER_CLOSE_DELAY = 160
let openedByHover = false
let hoverOpenTimer: ReturnType<typeof setTimeout> | null = null
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverTimers(): void {
  if (hoverOpenTimer !== null) { clearTimeout(hoverOpenTimer); hoverOpenTimer = null }
  if (hoverCloseTimer !== null) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null }
}
function focusCheckedLanguage(): void {
  root.value?.querySelector<HTMLInputElement>('[data-language-menu] input:checked')?.focus()
}
// 悬停展开不抢焦点:焦点留在用户原来操作的位置,只有点击才把焦点交给菜单。
function onLanguagePointerEnter(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || isLanguageOpen.value) return
  clearHoverTimers()
  hoverOpenTimer = setTimeout(() => {
    hoverOpenTimer = null
    if (isLanguageOpen.value) return
    openedByHover = true
    isLanguageOpen.value = true
    void placeLanguageMenu()
  }, HOVER_OPEN_DELAY)
}
function onLanguagePointerLeave(event: PointerEvent): void {
  if (event.pointerType !== 'mouse') return
  clearHoverTimers()
  scheduleLanguageClose()
}
// 浮层自身也算悬停区:从语言行移进浮层要跨过一档间隙,期间不能收起。
function onMenuPointerEnter(): void {
  if (hoverCloseTimer !== null) { clearTimeout(hoverCloseTimer); hoverCloseTimer = null }
}
function scheduleLanguageClose(): void {
  if (!isLanguageOpen.value) return
  if (hoverCloseTimer !== null) clearTimeout(hoverCloseTimer)
  hoverCloseTimer = setTimeout(() => {
    hoverCloseTimer = null
    // 键盘用户已经把焦点放进浮层时,不因鼠标离开而收起。
    const active = document.activeElement
    if (active instanceof Node && languageMenu.value?.contains(active) === true) return
    void closeLanguage(false)
  }, HOVER_CLOSE_DELAY)
}

// 浮层被外部原因收起(滚动 / 视口变化 / 点了别的行):焦点落在浮层内才还焦,
// 否则把焦点留在用户刚点的地方。
function dismissLanguage(): void {
  if (!isLanguageOpen.value) return
  const active = document.activeElement
  void closeLanguage(active instanceof Node && languageMenu.value?.contains(active) === true)
}
// 点面板里的其它行即收起浮层(语言行自己负责开关,点浮层内部不关闭)。
function onRootClick(event: MouseEvent): void {
  if (!isLanguageOpen.value || !(event.target instanceof Element)) return
  if (event.target.closest('[data-settings-language], [data-language-menu]') !== null) return
  dismissLanguage()
}
async function selectLanguage(code: 'zh-CN' | 'en'): Promise<void> {
  languageTrigger.value?.focus()
  setLocale(code)
  await closeLanguage()
}

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
    if (isLanguageOpen.value) { void closeLanguage(); return }
    emit('close')
    return
  }
  // radio 的 Arrow 由浏览器原生处理，根菜单只导航它自己的按钮。
  if (event.target instanceof Element && event.target.closest('[data-language-menu]') !== null) return
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
onMounted(() => {
  scrollHost.value = settingsPanel()
  scrollHost.value?.addEventListener('scroll', dismissLanguage, { passive: true })
  window.addEventListener('resize', dismissLanguage)
})
onBeforeUnmount(() => {
  clearHoverTimers()
  scrollHost.value?.removeEventListener('scroll', dismissLanguage)
  window.removeEventListener('resize', dismissLanguage)
})
</script>

<template>
  <div ref="root" class="global-settings" tabindex="-1" @keydown="onKeydown" @click="onRootClick">

      <div class="global-settings__identity">
        <AccountAvatar :name="accountName" />
        <div class="global-settings__profile">
          <span class="global-settings__name">{{ accountName }}</span>
          <span class="global-settings__email">{{ profile?.email }}</span>
        </div>
      </div>
      <section aria-labelledby="settings-account-label">
        <h3 id="settings-account-label">{{ t.workspace.settings.groups.account }}</h3>
        <button type="button" data-settings-section="accountSecurity" @click="emit('open', 'accountSecurity')"><DliIcon name="badge" /><span>{{ t.workspace.settings.accountSecurity }}</span></button>
      </section>
      <section aria-labelledby="settings-preferences-label">
        <h3 id="settings-preferences-label">{{ t.workspace.settings.groups.preferences }}</h3>
        <button ref="languageTrigger" type="button" data-settings-language :aria-expanded="isLanguageOpen" aria-controls="settings-language-menu" @click="toggleLanguage" @pointerenter="onLanguagePointerEnter" @pointerleave="onLanguagePointerLeave"><DliIcon name="sliders" /><span>{{ t.workspace.settings.language }}</span><small>{{ t.workspace.settings.languages[locale] }}</small><DliIcon name="chevronRight" size="sm" /></button>
        <div v-if="isLanguageOpen" id="settings-language-menu" ref="languageMenu" class="global-settings__language-menu" :style="languageMenuStyle" data-language-menu role="radiogroup" :aria-label="t.workspace.settings.language" @pointerenter="onMenuPointerEnter" @pointerleave="scheduleLanguageClose">
          <label class="global-settings__language-option"><input type="radio" name="settings-locale" value="zh-CN" :aria-label="t.workspace.settings.languages['zh-CN']" :checked="locale === 'zh-CN'" @change="selectLanguage('zh-CN')"><span>{{ t.workspace.settings.languages['zh-CN'] }}</span><code>zh-CN</code><DliIcon v-if="locale === 'zh-CN'" name="check" size="sm" /></label>
          <label class="global-settings__language-option"><input type="radio" name="settings-locale" value="en" :aria-label="t.workspace.settings.languages.en" :checked="locale === 'en'" @change="selectLanguage('en')"><span>{{ t.workspace.settings.languages.en }}</span><code>en</code><DliIcon v-if="locale === 'en'" name="check" size="sm" /></label>
          <p>{{ t.workspace.settings.languageHint }}</p>
        </div>
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
.global-settings__profile { display: grid; min-inline-size: 0; gap: var(--dl-space-1); }
.global-settings__name { overflow-wrap: anywhere; font-size: var(--dl-font-size-md); font-weight: 500; }
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
/* 二级菜单浮在面板之外:fixed 定位脱离面板的滚动容器,面板高度因此不随它变化。
   右侧放不下时由脚本改摆到语言行下方,两种摆法都不改变面板自身尺寸。 */
.global-settings__language-menu { position: fixed; z-index: var(--dl-z-overlay); display: grid; gap: var(--dl-space-1); inline-size: min(20rem, calc(100vw - 2 * var(--dl-space-3))); padding: var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-lg); background: var(--dl-bg-elevated); box-shadow: var(--dl-shadow-md); }
.global-settings__language-option { display: flex; align-items: center; gap: var(--dl-space-2); min-block-size: var(--dl-target-size); padding: var(--dl-space-2); border-radius: var(--dl-radius-md); cursor: pointer; }
.global-settings__language-option:hover { background: var(--dl-bg-hover); }
.global-settings__language-option:has(:checked) { background: var(--dl-accent-soft); }
.global-settings__language-option input { inline-size: var(--dl-icon-sm); block-size: var(--dl-icon-sm); margin: 0; accent-color: var(--dl-accent); }
.global-settings__language-option input:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
.global-settings__language-option code { margin-inline-start: auto; color: var(--dl-text-secondary); font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); }
.global-settings__language-option .dl-icon { color: var(--dl-accent); }
.global-settings__language-menu > p { color: var(--dl-text-secondary); font-size: var(--dl-font-size-xs); line-height: var(--dl-line-body); }
@media (prefers-reduced-motion: reduce) { button:active { transform: none; } }
</style>
