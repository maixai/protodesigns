<script setup lang="ts">
// 账户入口沿用 disclosure:一条导航链接与一个动作按钮不是复合 menu 控件,
// 因此用 role="group" + 可访问名与原生控件,保留自然的 Tab 顺序。
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { session, signOut } from '../auth/session'
import { useI18n } from '../i18n'
import { toInitials } from './account-avatar'
import ConfirmDialog from './confirm-dialog.vue'

const props = withDefaults(defineProps<{ placement?: 'down' | 'up' }>(), { placement: 'down' })
const emit = defineEmits<{ 'signed-out': [] }>()
const { t } = useI18n()
const profile = computed(() => session.value.profile)
const isOpen = ref(false)
const isConfirmOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const popoverId = `account-popover-${Math.random().toString(36).slice(2)}`

async function open(focusFirst: boolean): Promise<void> {
  if (isOpen.value) return
  isOpen.value = true
  if (!focusFirst) return
  await nextTick()
  popoverRef.value?.querySelector('a')?.focus()
}

function close(restoreFocus: boolean): void {
  if (!isOpen.value) return
  // 过渡离场时节点还在 DOM,先设 inert 防止 Tab 进入即将消失的弹层。
  if (popoverRef.value !== null) popoverRef.value.inert = true
  isOpen.value = false
  if (restoreFocus) triggerRef.value?.focus()
}

function onTriggerClick(event: MouseEvent): void {
  if (isOpen.value) {
    close(false)
    return
  }
  void open(event.detail === 0)
}

function onKeydown(event: KeyboardEvent): void {
  // 对话框的 Esc 交给原生 cancel,不连带关闭其下方 disclosure。
  if (isConfirmOpen.value || event.key !== 'Escape' || !isOpen.value) return
  event.preventDefault()
  close(true)
}

function onFocusOut(event: FocusEvent): void {
  if (isConfirmOpen.value) return
  const next = event.relatedTarget
  if (next instanceof Node && rootRef.value?.contains(next) === true) return
  close(false)
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (isConfirmOpen.value) return
  const target = event.target
  if (target instanceof Node && rootRef.value?.contains(target) === true) return
  close(false)
}

function onRequestSignOut(event: MouseEvent): void {
  // 某些浏览器的指针点击不聚焦按钮;显式记录真正的触发元素供取消后还焦。
  if (event.currentTarget instanceof HTMLButtonElement) event.currentTarget.focus()
  isConfirmOpen.value = true
}

function onConfirmSignOut(): void {
  isConfirmOpen.value = false
  close(false)
  signOut()
  emit('signed-out')
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <div
    ref="rootRef"
    class="account-menu"
    :class="{ 'account-menu--up': props.placement === 'up' }"
    @focusout="onFocusOut"
    @keydown="onKeydown"
  >
    <button
      ref="triggerRef"
      class="account-menu__trigger"
      type="button"
      :aria-label="`${t.account.menuLabel}: ${profile?.name ?? ''}`"
      :aria-expanded="isOpen"
      :aria-controls="popoverId"
      @click="onTriggerClick"
    >
      <span class="account-menu__avatar" aria-hidden="true">{{ toInitials(profile?.name ?? '') }}</span>
      <svg class="account-menu__caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <Transition name="account-menu-pop">
      <div
        v-if="isOpen"
        :id="popoverId"
        ref="popoverRef"
        class="account-menu__popover"
        role="group"
        :aria-label="t.account.menuLabel"
      >
        <div class="account-menu__identity">
          <span class="account-menu__name">{{ profile?.name }}</span>
          <span class="account-menu__email">{{ profile?.email }}</span>
        </div>
        <a class="account-menu__item" :href="'#/workspace'" @click="close(true)">{{ t.account.workspace }}</a>
        <div class="account-menu__separator" aria-hidden="true" />
        <button class="account-menu__item" type="button" @click="onRequestSignOut">{{ t.account.signOut }}</button>
      </div>
    </Transition>
    <!-- 保留原触发按钮,取消后可准确还焦;确认登出后由父级把焦点交给登录按钮。 -->
    <ConfirmDialog :open="isConfirmOpen" @cancel="isConfirmOpen = false" @confirm="onConfirmSignOut" />
  </div>
</template>

<style scoped>
.account-menu {
  position: relative;
}

.account-menu__trigger {
  display: flex;
  align-items: center;
  gap: var(--dl-space-2);
  min-width: var(--dl-target-size);
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-1);
  border-radius: var(--dl-radius-md);
  color: var(--dl-text-primary);
}

.account-menu__trigger:hover,
.account-menu__item:hover {
  background-color: var(--dl-bg-hover);
}

.account-menu__trigger:active,
.account-menu__item:active {
  transform: translateY(var(--dl-lift-press));
}

.account-menu__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--dl-control-height);
  height: var(--dl-control-height);
  border: var(--dl-border-width) solid var(--dl-border-strong);
  border-radius: var(--dl-radius-pill);
  font-size: var(--dl-font-size-sm);
  font-weight: 500;
}

.account-menu__caret {
  width: var(--dl-icon-sm);
  height: var(--dl-icon-sm);
  stroke: currentColor;
  stroke-width: var(--dl-icon-stroke);
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform var(--dl-duration-fast) var(--dl-ease-standard);
}

.account-menu__trigger[aria-expanded='true'] .account-menu__caret {
  transform: rotate(180deg);
}

.account-menu__popover {
  position: absolute;
  inset-block-start: calc(100% + var(--dl-space-1));
  inset-inline-end: 0;
  z-index: var(--dl-z-overlay);
  width: max-content;
  max-width: calc(100vw - 2 * var(--dl-space-6));
  padding: var(--dl-space-1);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  background-color: var(--dl-bg-elevated);
}

.account-menu--up .account-menu__popover {
  inset-block-start: auto;
  inset-block-end: calc(100% + var(--dl-space-1));
  inset-inline-start: 0;
  inset-inline-end: auto;
}

.account-menu__identity {
  display: flex;
  flex-direction: column;
  gap: var(--dl-space-1);
  padding: var(--dl-space-3);
}

.account-menu__name {
  font-weight: 500;
}

.account-menu__email {
  font-family: var(--dl-font-mono);
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
  overflow-wrap: anywhere;
}

.account-menu__item {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: var(--dl-target-size);
  min-height: var(--dl-target-size);
  padding-inline: var(--dl-space-3);
  border-radius: var(--dl-radius-sm);
  color: var(--dl-text-primary);
  font-size: var(--dl-font-size-sm);
  text-align: left;
  text-decoration: none;
}

.account-menu__separator {
  height: var(--dl-border-width);
  margin: var(--dl-space-1) var(--dl-space-3);
  background-color: var(--dl-border-base);
}

.account-menu-pop-enter-active,
.account-menu-pop-leave-active {
  transition:
    opacity var(--dl-duration-base) var(--dl-ease-standard),
    transform var(--dl-duration-base) var(--dl-ease-standard);
}

.account-menu-pop-enter-from,
.account-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--dl-space-1)));
}
</style>
