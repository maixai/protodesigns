<script setup lang="ts">
// 抽屉保留为可参数化容器；当前仅承载键盘快捷键，账户与安全由中央窗体负责。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { waitForMotion } from '../auth/transition'
import { useI18n } from '../i18n'
import DliIcon from './dl-icon.vue'

const props = defineProps<{ section: string; title?: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const copy = computed(() => t.value.workspace.settings)
const drawerTitle = computed(() => props.title ?? (props.section === 'shortcuts' ? copy.value.shortcuts : props.section))
const dialog = ref<HTMLDialogElement | null>(null)
const heading = ref<HTMLElement | null>(null)
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

const isClosing = ref(false)
async function requestClose(): Promise<void> {
  if (isClosing.value) return
  isClosing.value = true
  await nextTick()
  await waitForMotion(dialog.value)
  if (!lifetime.isAlive) return
  dialog.value?.close()
  emit('close')
}
function onBackdrop(event: MouseEvent): void {
  if (event.target !== dialog.value || dialog.value === null) return
  const rect = dialog.value.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) void requestClose()
}
onMounted(() => {
  dialog.value?.showModal()
  heading.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => { lifetime.isAlive = false; dialog.value?.close() })
</script>

<template>
  <dialog id="workspace-settings-drawer" ref="dialog" class="settings-drawer dl-modal-scrim" :data-section="props.section" :data-closing="isClosing ? 'true' : undefined" aria-modal="true" aria-labelledby="workspace-settings-drawer-title" @cancel.prevent="requestClose" @click="onBackdrop" @keydown.stop>
    <header class="settings-drawer__header">
      <div class="settings-drawer__titles">
        <p class="settings-drawer__eyebrow">{{ copy.title }}</p>
        <h2 id="workspace-settings-drawer-title" ref="heading" tabindex="-1">{{ drawerTitle }}</h2>
      </div>
      <button type="button" class="settings-drawer__close" data-settings-close :aria-label="copy.close" @click="requestClose"><DliIcon name="close" /></button>
    </header>
    <div class="settings-drawer__body">
      <slot>
        <div class="settings-drawer__section" data-settings-shortcuts>
          <p class="settings-drawer__muted">{{ shortcutPlatform }}</p>
          <table v-for="group in shortcutGroups" :key="group">
            <caption>{{ copy.shortcutGroups[group] }}</caption>
            <tbody><tr v-for="shortcut in copy.shortcutsList.filter((item) => item.group === group)" :key="shortcut.keys"><th scope="row">{{ shortcut.label }}</th><td><kbd>{{ shortcut.keys.replaceAll('Ctrl/Cmd', shortcutModifier) }}</kbd></td></tr></tbody>
          </table>
        </div>
      </slot>
    </div>
  </dialog>
</template>

<style scoped>
.settings-drawer { position: fixed; inset: 0 auto 0 0; margin: 0; padding: 0; inline-size: clamp(520px, 38vw, 600px); max-inline-size: 100vw; block-size: 100dvh; max-block-size: 100dvh; border: 0; border-inline-end: var(--dl-border-width) solid var(--dl-border-base); border-radius: 0 var(--dl-radius-xl) var(--dl-radius-xl) 0; background: var(--dl-bg-elevated); color: var(--dl-text-primary); box-shadow: var(--dl-shadow-lg); font-family: var(--dl-font-sans); font-size: var(--dl-font-size-md); line-height: var(--dl-line-body); text-align: left; overflow: hidden; }
.settings-drawer[data-closing="true"] { pointer-events: none; animation: none; transform: translateX(-100%); opacity: 0; transition: transform var(--dl-duration-fast) var(--dl-ease-standard), opacity var(--dl-duration-fast) var(--dl-ease-standard); }
.settings-drawer[data-closing="true"]::backdrop { animation: none; opacity: 0; transition: opacity var(--dl-duration-fast) var(--dl-ease-standard); }
.settings-drawer[open] { display: flex; flex-direction: column; animation: settings-drawer-in var(--dl-duration-slow) var(--dl-ease-standard); }
.settings-drawer__header { display: flex; flex: none; align-items: center; gap: var(--dl-space-4); padding: var(--dl-space-6); border-block-end: var(--dl-border-width) solid var(--dl-border-base); }
.settings-drawer__titles { flex: 1; min-inline-size: 0; }
.settings-drawer__eyebrow { font-size: var(--dl-font-size-xs); color: var(--dl-text-tertiary); margin-block-end: var(--dl-space-1); }
h2 { inline-size: fit-content; max-inline-size: 100%; font-size: var(--dl-font-size-lg); font-weight: 500; line-height: var(--dl-line-body); }
caption { font-size: var(--dl-font-size-md); font-weight: 500; }
.settings-drawer__body { flex: 1; min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--dl-space-6); display: flex; flex-direction: column; gap: var(--dl-space-6); }
.settings-drawer__section { display: flex; flex-direction: column; gap: var(--dl-space-3); }
.settings-drawer__muted { color: var(--dl-text-secondary); font-size: var(--dl-font-size-sm); }
kbd { font-family: var(--dl-font-mono); font-size: var(--dl-font-size-xs); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
button { display: inline-flex; align-items: center; gap: var(--dl-space-2); min-inline-size: var(--dl-target-size); min-block-size: var(--dl-target-size); border-radius: var(--dl-radius-md); color: var(--dl-text-primary); text-align: left; }
.settings-drawer__close { flex: none; justify-content: center; inline-size: var(--dl-target-size); block-size: var(--dl-target-size); padding: 0; }
button:hover { background: var(--dl-bg-hover); }
button:focus-visible { outline: none; box-shadow: var(--dl-focus-ring); }
/* 抽屉标题只是打开时的读屏落点，不是可操作控件；不加焦点环，避免看起来像输入框。 */
h2:focus-visible { outline: none; box-shadow: none; }
button:active { transform: translateY(var(--dl-lift-press)); }
button:disabled { color: var(--dl-text-disabled); background: var(--dl-bg-sunken); cursor: not-allowed; transform: none; }
table { inline-size: 100%; border-collapse: collapse; table-layout: fixed; }
caption { text-align: left; padding-block: var(--dl-space-3); }
th, td { text-align: left; padding: var(--dl-space-3) 0; border-block-end: var(--dl-border-width) solid var(--dl-border-base); vertical-align: top; font-size: var(--dl-font-size-sm); font-weight: 400; overflow-wrap: anywhere; }
th { inline-size: 55%; padding-inline-end: var(--dl-space-3); }
td { text-align: end; }
kbd { display: inline-block; max-inline-size: 100%; padding: var(--dl-space-1) var(--dl-space-2); border: var(--dl-border-width) solid var(--dl-border-base); border-radius: var(--dl-radius-sm); background: var(--dl-bg-sunken); }
@keyframes settings-drawer-in { from { transform: translateX(-100%); opacity: 0; } to { transform: none; opacity: 1; } }
@media (max-width: 767px) { .settings-drawer { inline-size: 100vw; border-radius: 0; } }
@media (prefers-reduced-motion: reduce) { .settings-drawer[open] { animation: none; } .settings-drawer[data-closing="true"] { transform: none; opacity: 1; transition: none; } .settings-drawer[data-closing="true"]::backdrop { opacity: 1; transition: none; } button:active { transform: none; } }
</style>
